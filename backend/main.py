"""easy-nav 서버: 역 검색, 혼잡도 조회, 경로 혼잡도 계산, 분석용 API (워크북 4)"""
import os
from datetime import datetime

import psycopg
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from scripts.congestion_level import to_level

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

app = FastAPI(
    title="easy-nav API",
    description="빨리 갈까, 편하게 갈까? · 지하철 경로의 소요 시간과 혼잡도를 함께 계산합니다.",
    version="0.1.0",
)

# 화면(Vercel)과 내 컴퓨터의 개발용 화면에서 이 서버를 부를 수 있게 허용합니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://easy-nav-iota.vercel.app", "http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

DAY_TYPES = ("평일", "토요일", "일요일")
# 최단경로 API의 방향 표기 → 혼잡도 표의 방향 표기
DIRECTION = {"상행": "상선", "하행": "하선", "내선": "내선", "외선": "외선"}
# 혼잡도 파일에서 번호가 따로 매겨진 곳 (워크북 2의 06번과 같음)
SPECIAL = {("2호선", 211, "외선"): 9001}


def db():
    """요청마다 DB에 접속합니다. 결과는 {칸 이름: 값} 모양으로 받습니다."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def level_info(percent):
    level, name = to_level(percent)
    return {"level": level, "level_name": name}


def check_day_type(day_type):
    if day_type not in DAY_TYPES:
        raise HTTPException(400, "day_type은 평일, 토요일, 일요일 중 하나입니다.")


def time_slot(clock):
    """'08:47:30' → '8시30분' (30분 칸 이름)"""
    hour, minute, _ = clock.split(":")
    hour_text = "00" if int(hour) == 0 else str(int(hour))
    return f"{hour_text}시{'30' if int(minute) >= 30 else '00'}분"


@app.get("/", tags=["기본"], summary="서버 상태")
def home():
    return {"service": "easy-nav API", "docs": "/docs"}


@app.get("/stations", tags=["역"], summary="역 검색")
def search_stations(keyword: str = Query(..., min_length=1, description="역 이름 일부. 예: 사당")):
    """역 이름에 keyword가 들어간 1~8호선 역을 찾습니다."""
    with db() as conn:
        rows = conn.execute(
            "select station_no, line, name from stations"
            " where name like %s and station_no < 9000 order by name, line limit 20",
            (f"%{keyword}%",)).fetchall()
    return rows


@app.get("/congestion/{station_no}", tags=["혼잡도"], summary="역 하나의 30분 단위 혼잡도")
def station_congestion(station_no: int, direction: str = Query(..., description="상선, 하선, 내선, 외선"),
                       day_type: str = "평일"):
    """역번호(예: 226 사당 2호선)와 방향으로 5시30분부터 00시30분까지 열차가 다니는 30분 칸의 혼잡도와 단계를 돌려줍니다."""
    check_day_type(day_type)
    with db() as conn:
        rows = conn.execute(
            "select time_slot, congestion::float as congestion, level from congestion_stats"
            " where station_no = %s and direction = %s and day_type = %s order by slot_order",
            (station_no, direction, day_type)).fetchall()
    if not rows:
        raise HTTPException(404, "해당 역번호와 방향의 혼잡도가 없습니다.")
    return rows


def fetch_route(conn, start, end, search_dt):
    """최단경로 API로 경로를 받습니다. 같은 조건으로 받은 적이 있으면 저장해 둔 응답을 씁니다."""
    key = (start, end, search_dt, "duration")
    saved = conn.execute(
        "select response from route_cache where dptre_stn = %s and arvl_stn = %s"
        " and search_dt = %s and search_type = %s", key).fetchone()
    if saved:
        return saved["response"]
    params = {
        "serviceKey": os.environ["PUBLIC_DATA_API_KEY"],
        "dataType": "JSON",
        "dptreStn": start,
        "arvlStn": end,
        "searchDt": search_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "searchType": "duration",
    }
    try:
        data = requests.get(os.environ["ROUTE_API_URL"], params=params, timeout=20).json()
    except (requests.RequestException, ValueError):
        raise HTTPException(502, "최단경로 API에 연결하지 못했습니다.")
    if data.get("header", {}).get("resultCode") != "00":
        raise HTTPException(502, f"최단경로 API 오류: {data.get('header')}")
    conn.execute(
        "insert into route_cache (dptre_stn, arvl_stn, search_dt, search_type, response)"
        " values (%s, %s, %s, %s, %s) on conflict do nothing", (*key, Jsonb(data)))
    return data


@app.get("/routes/congestion", tags=["경로"], summary="경로 하나의 혼잡도")
def route_congestion(from_station: str = Query(..., description="출발역 이름. 예: 신도림"),
                     to_station: str = Query(..., description="도착역 이름. 예: 강남"),
                     depart_time: datetime = Query(..., description="출발 일시. 예: 2026-10-22T08:30"),
                     day_type: str = "평일"):
    """가장 빠른 경로를 받아 구간마다 그 시각의 혼잡도를 붙이고, 평균과 가장 붐비는 구간을 5단계로 알려 줍니다."""
    check_day_type(day_type)
    with db() as conn:
        route = fetch_route(conn, from_station, to_station, depart_time)["body"]
        segments, missing = [], []
        for seg in route["paths"]:
            if seg["trsitYn"] == "Y":          # 환승 구간은 열차를 타지 않습니다.
                continue
            station = seg["dptreStn"]
            direction = DIRECTION.get(seg["upbdnbSe"])
            if not station["stnCd"].isdigit():     # 1~8호선 밖의 노선(역코드에 글자)은 혼잡도 자료가 없습니다.
                missing.append(station["stnNm"])
                continue
            number = SPECIAL.get((station["lineNm"], int(station["stnCd"]), direction), int(station["stnCd"]))
            slot = time_slot(seg["trainDptreTm"])
            found = conn.execute(
                "select congestion::float as congestion from congestion_stats where station_no = %s"
                " and direction = %s and day_type = %s and time_slot = %s",
                (number, direction, day_type, slot)).fetchone()
            if not found:                      # 혼잡도 자료가 없거나 운행 없음(0)으로 뺀 칸
                missing.append(station["stnNm"])
                continue
            segments.append({"station": station["stnNm"], "line": station["lineNm"], "direction": seg["upbdnbSe"],
                             "time_slot": slot, "seconds": seg["reqHr"], "congestion": found["congestion"],
                             **level_info(found["congestion"])})
    if not segments:
        raise HTTPException(404, "이 경로에는 혼잡도를 붙일 수 있는 1~8호선 구간이 없습니다.")
    total = sum(s["seconds"] for s in segments)
    average = round(sum(s["congestion"] * s["seconds"] for s in segments) / total, 1)
    worst = max(segments, key=lambda s: s["congestion"])
    return {
        "from": from_station, "to": to_station, "depart_time": depart_time, "day_type": day_type,
        "total_minutes": round(route["totalReqHr"] / 60, 1),
        "transfers": route["trsitNmtm"],
        "average": {"congestion": average, **level_info(average)},
        "worst": {"station": worst["station"], "congestion": worst["congestion"], **level_info(worst["congestion"])},
        "segments": segments,
        "missing": missing,
    }


@app.get("/analysis/top-congested", tags=["분석"], summary="가장 붐비는 역·방향 순위")
def top_congested(time_slot: str = Query("8시30분", description="30분 칸. 예: 8시30분"),
                  day_type: str = "평일", limit: int = Query(10, ge=1, le=50)):
    check_day_type(day_type)
    with db() as conn:
        return conn.execute(
            "select s.name, s.line, c.direction, c.congestion::float as congestion, c.level"
            " from congestion_stats c join stations s on s.station_no = c.station_no"
            " where c.day_type = %s and c.time_slot = %s order by c.congestion desc limit %s",
            (day_type, time_slot, limit)).fetchall()


@app.get("/analysis/heatmap", tags=["분석"], summary="역 × 시간대 혼잡도 표")
def heatmap(line: str = Query("2호선", description="예: 2호선"), direction: str = Query("외선"),
            day_type: str = "평일"):
    """한 호선·방향의 모든 역에 대해 30분 칸별 혼잡도를 표 모양으로 돌려줍니다. 분석 페이지의 히트맵에 씁니다."""
    check_day_type(day_type)
    with db() as conn:
        rows = conn.execute(
            "select s.station_no, s.name, c.time_slot, c.slot_order, c.congestion::float as congestion, c.level"
            " from congestion_stats c join stations s on s.station_no = c.station_no"
            " where s.line = %s and c.direction = %s and c.day_type = %s and s.station_no < 9000"
            " order by s.station_no, c.slot_order", (line, direction, day_type)).fetchall()
    if not rows:
        raise HTTPException(404, "해당 호선과 방향의 자료가 없습니다.")
    # 열차가 다니지 않는 칸은 DB에 없으므로, 표의 빈칸은 None(null)으로 채웁니다.
    slots = sorted({(r["slot_order"], r["time_slot"]) for r in rows})
    column = {order: i for i, (order, _) in enumerate(slots)}
    table = {}
    for r in rows:
        values = table.setdefault((r["station_no"], r["name"]), [None] * len(slots))
        values[column[r["slot_order"]]] = r["congestion"]
    return {"line": line, "direction": direction, "day_type": day_type,
            "time_slots": [name for _, name in slots],
            "stations": [{"station_no": no, "name": name, "values": values} for (no, name), values in table.items()]}
