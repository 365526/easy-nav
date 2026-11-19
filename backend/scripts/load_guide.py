"""AI 안내 도우미의 근거 자료를 공공데이터 API에서 받아 DB(guide_docs)에 넣습니다. (워크북 8 1부)

- 빠른하차정보: 내리는 역의 계단·에스컬레이터·엘리베이터와 가장 가까운 칸·문
- 교통약자이용정보(엘리베이터): 역 엘리베이터의 위치와 오가는 층

backend 폴더에서 python scripts/load_guide.py 로 실행합니다. 다시 실행하면 표를 비우고 새로 채웁니다.
"""
import os
import re
from datetime import datetime

import psycopg
import requests
from dotenv import load_dotenv
from psycopg.types.json import Jsonb

load_dotenv()

# 서울교통공사 Open API 주소 (인증키는 .env의 PUBLIC_DATA_API_KEY를 씁니다)
FAST_EXIT_URL = "https://apis.data.go.kr/B553766/inout/getFstExit"
ELEVATOR_URL = "https://apis.data.go.kr/B553766/wksn/getWksnElvtr"
ROWS = 1000  # 한 번에 받을 줄 수


def fetch_all(url, name):
    """API의 모든 쪽(page)을 차례로 받아 항목 목록으로 돌려줍니다."""
    items, page, total = [], 1, None
    while total is None or len(items) < total:
        params = {"serviceKey": os.environ["PUBLIC_DATA_API_KEY"], "dataType": "JSON",
                  "pageNo": page, "numOfRows": ROWS}
        response = requests.get(url, params=params, timeout=30)
        try:
            data = response.json()
        except ValueError:
            # 활용신청이 안 됐거나 인증키가 틀리면 JSON 대신 오류 글자가 옵니다.
            raise SystemExit(f"{name}: JSON이 아닌 응답이 왔습니다 → {response.text[:150]}")
        data = data.get("response", data)          # 응답이 response로 한 번 더 싸여 있는 경우
        code = data.get("header", {}).get("resultCode")
        if code not in (None, "00"):
            raise SystemExit(f"{name}: API 오류 {data.get('header')}")
        body = data.get("body") or {}
        got = body.get("items") or []
        if isinstance(got, dict):                  # {"item": [...]} 모양
            got = got.get("item") or []
        if isinstance(got, dict):                  # 항목이 하나뿐이면 목록이 아닌 경우
            got = [got]
        total = int(body.get("totalCount") or 0)
        items.extend(got)
        print(f"{name}: {page}쪽 {len(got)}줄 (모두 {total}줄)")
        if not got:
            break
        page += 1
    return items


def text(value):
    """빈 값(None, 공백)은 빈 글자로, 나머지는 앞뒤 공백을 지운 글자로 바꿉니다."""
    return "" if value is None else str(value).strip()


def josa(word, batchim, plain):
    """받침이 있으면 batchim(예: 과), 없으면 plain(예: 와)을 붙입니다. 예: 계단과, 엘리베이터와"""
    last = word[-1] if word else ""
    has_batchim = "가" <= last <= "힣" and (ord(last) - ord("가")) % 28 > 0
    return word + (batchim if has_batchim else plain)


def station_name(item):
    """역 이름 뒤에 '역'을 붙입니다. 이미 '역'으로 끝나면(예: 서울역) 그대로 둡니다."""
    name = text(item.get("stnNm"))
    return name if name.endswith("역") else f"{name}역"


def base_date(value):
    """'20250930' → date. 형식이 다르면 None"""
    try:
        return datetime.strptime(text(value), "%Y%m%d").date()
    except ValueError:
        return None


def fast_exit_doc(item):
    """빠른하차정보 한 줄 → 사람이 읽는 문장 한 개"""
    line, station = text(item.get("lineNm")), text(item.get("stnNm"))
    toward, updown = text(item.get("drtnInfo")), text(item.get("upbdnbSe"))
    door, facility = text(item.get("qckgffVhclDoorNo")), text(item.get("plfmCmgFac"))
    where = " ".join(v for v in (text(item.get("fwkPstnNm")), text(item.get("facPstnNm"))) if v)
    train = f"{toward} 방면({updown}) 열차" if toward else f"{updown} 열차"
    sentence = f"{line} {station_name(item)} {train}에서 내릴 때 {door}(칸-문) 쪽이 {josa(facility, '과', '와')} 가깝습니다."
    if where:
        sentence += f" 설비 위치: {where}."
    return line, station, sentence


def elevator_kind(name):
    """시설 이름에서 쓸모 있는 것만 꺼냅니다. 예: '승강기)엘리베이터-강남 외선 8-1 내부#1' → 내부 엘리베이터(승강장↔대합실)
    이름 속 칸 번호·#번호는 관리용이라 위치 설명과 다를 수 있어 쓰지 않습니다(11 실습 05: 신도림 3-2 ↔ 4-4·7-4).
    섬식: 선로 사이 승강장 하나에서 양쪽 방면 열차를 탑니다."""
    if "내부" in name:
        kind = "내부 엘리베이터(승강장↔대합실"
    elif "외부" in name:
        kind = "외부 엘리베이터(대합실↔지상"
    else:
        return "엘리베이터"
    return kind + (", 양쪽 방면 같은 승강장)" if "섬식" in name else ")")


def floor(updown, number):
    """'지하', 'B2' → '지하 2층'. 지하·지상과 B·F가 겹쳐 적힌 것을 한 번만 씁니다."""
    number = re.sub(r"^[BF](?=\d)", "", text(number))
    return f"{text(updown)} {number}층".strip() if number else ""


def elevator_doc(item):
    """교통약자이용정보(엘리베이터) 한 줄 → 사람이 읽는 문장 한 개 (11-2에서 다듬음)"""
    line, station = text(item.get("lineNm")), text(item.get("stnNm"))
    place = text(item.get("dtlPstn"))
    place = re.sub(r"\s*,\s*", ", ", re.sub(r"방면\s*(?=\d)", "방면 ", place))  # 역삼 방면8-1,교대 방면3-4 → 역삼 방면 8-1, 교대 방면 3-4
    sentence = f"{line} {station_name(item)} {elevator_kind(text(item.get('fcltNm')))}: {place}."
    start = floor(item.get("bgngFlrGrndUdgdSe"), item.get("bgngFlr"))
    end = floor(item.get("endFlrGrndUdgdSe"), item.get("endFlr"))
    if start and end:
        sentence += f" 오가는 층: {start} ↔ {end}."
    exit_no = text(item.get("vcntEntrcNo"))
    if re.search(r"\d", exit_no):  # '내부'처럼 번호가 아닌 값은 쓰지 않습니다.
        sentence += f" 가까운 출입구: {exit_no}{'번' if exit_no.isdigit() else ''}."
    return line, station, sentence


rows = []
for item in fetch_all(FAST_EXIT_URL, "빠른하차정보"):
    line, station, content = fast_exit_doc(item)
    if station and text(item.get("qckgffVhclDoorNo")):
        rows.append(("빠른하차정보", line, station, content, Jsonb(item), base_date(item.get("crtrYmd"))))
for item in fetch_all(ELEVATOR_URL, "교통약자이용정보"):
    if text(item.get("oprtngSitu")) == "D":        # D: 없어진(삭제된) 엘리베이터
        continue
    line, station, content = elevator_doc(item)
    if station and text(item.get("dtlPstn")):
        rows.append(("교통약자이용정보", line, station, content, Jsonb(item), base_date(item.get("crtrYmd"))))

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        cur.execute("truncate guide_docs")
        cur.executemany(
            "insert into guide_docs (source, line, station, content, raw, base_date) values (%s, %s, %s, %s, %s, %s)", rows)
        cur.execute("select source, count(*), count(distinct station) from guide_docs group by source order by source")
        for source, count, stations in cur.fetchall():
            print(f"{source}: {count}줄 · {stations}개 역")
        cur.execute("select content from guide_docs where station = '강남' order by source, id limit 3")
        for (content,) in cur.fetchall():
            print("예:", content)
