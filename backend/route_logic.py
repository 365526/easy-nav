"""경로 계산 도구: 최단경로 API 호출, 구간별 혼잡도, 후보 경로, 점수 (워크북 6)"""
import os
from datetime import timedelta

import requests
from fastapi import HTTPException
from psycopg.types.json import Jsonb

from scripts.congestion_level import to_level

# 최단경로 API의 방향 표기 → 혼잡도 표의 방향 표기
DIRECTION = {"상행": "상선", "하행": "하선", "내선": "내선", "외선": "외선"}
# 혼잡도 파일에서 번호가 따로 매겨진 곳 (워크북 2의 06번과 같음)
SPECIAL = {("2호선", 211, "외선"): 9001}
# 출발 시각 비교: 1시간 전부터 1시간 뒤까지 30분 간격
SHIFTS = (-60, -30, 0, 30, 60)


def level_info(percent):
    level, name = to_level(percent)
    return {"level": level, "level_name": name}


def slot_name(minutes):
    """하루 중 몇 분째인지 → '8시30분' (30분 칸 이름). 자정을 넘기면 00시로 돌아갑니다."""
    hour, minute = divmod(minutes % (24 * 60), 60)
    hour_text = "00" if hour == 0 else str(hour)
    return f"{hour_text}시{'30' if minute >= 30 else '00'}분"


def fetch_route(conn, start, end, search_dt, exclude=""):
    """최단경로 API로 경로 하나를 받습니다. exclude에 역 이름을 넣으면 그 역을 지나지 않는 경로를 받습니다.
    같은 조건으로 받은 적이 있으면 DB(route_cache)에 저장해 둔 응답을 씁니다."""
    key = (start, end, search_dt, "duration", exclude)
    saved = conn.execute(
        "select response from route_cache where dptre_stn = %s and arvl_stn = %s"
        " and search_dt = %s and search_type = %s and excl_stn = %s", key).fetchone()
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
    if exclude:
        params["exclTrfstns"] = exclude
    try:
        data = requests.get(os.environ["ROUTE_API_URL"], params=params, timeout=20).json()
    except (requests.RequestException, ValueError):
        raise HTTPException(502, "최단경로 API에 연결하지 못했습니다.")
    if data.get("header", {}).get("resultCode") != "00":
        raise HTTPException(502, f"최단경로 API 오류: {data.get('header')}")
    conn.execute(
        "insert into route_cache (dptre_stn, arvl_stn, search_dt, search_type, excl_stn, response)"
        " values (%s, %s, %s, %s, %s, %s) on conflict do nothing", (*key, Jsonb(data)))
    return data


def ride_segments(route):
    """경로에서 열차를 타는 구간만 골라 혼잡도 표의 역번호·방향과 출발 시각(분)을 붙입니다.
    1~8호선 밖이라 혼잡도 자료가 없는 구간은 역 이름만 따로 모읍니다."""
    rides, outside = [], []
    for seg in route["paths"]:
        if seg["trsitYn"] == "Y":          # 환승 구간은 열차를 타지 않습니다.
            continue
        station = seg["dptreStn"]
        if not station["stnCd"].isdigit():  # 역코드에 글자가 있으면 1~8호선 밖의 노선입니다.
            outside.append(station["stnNm"])
            continue
        direction = DIRECTION.get(seg["upbdnbSe"])
        hour, minute, _ = seg["trainDptreTm"].split(":")
        rides.append({
            "station": station["stnNm"], "line": station["lineNm"], "direction": seg["upbdnbSe"],
            "station_no": SPECIAL.get((station["lineNm"], int(station["stnCd"]), direction), int(station["stnCd"])),
            "db_direction": direction, "minute": int(hour) * 60 + int(minute), "seconds": seg["reqHr"],
        })
    return rides, outside


def congestion_table(conn, rides, day_type):
    """경로가 지나는 역의 혼잡도를 한 번에 읽어 {(역번호, 방향, 30분 칸): 혼잡도} 사전으로 만듭니다."""
    rows = conn.execute(
        "select station_no, direction, time_slot, congestion::float as congestion from congestion_stats"
        " where day_type = %s and station_no = any(%s)",
        (day_type, sorted({r["station_no"] for r in rides}))).fetchall()
    return {(r["station_no"], r["direction"], r["time_slot"]): r["congestion"] for r in rows}


def score_route(rides, outside, table, shift=0):
    """구간마다 그 시각(shift분만큼 옮긴 시각)의 혼잡도를 붙이고, 소요시간으로 가중한 평균과 가장 붐비는 구간을 구합니다."""
    segments, missing = [], list(outside)
    for r in rides:
        slot = slot_name(r["minute"] + shift)
        value = table.get((r["station_no"], r["db_direction"], slot))
        if value is None:                  # 자료가 없거나 운행 없음(0)으로 뺀 칸
            missing.append(r["station"])
            continue
        segments.append({"station": r["station"], "line": r["line"], "direction": r["direction"],
                         "time_slot": slot, "seconds": r["seconds"], "congestion": value, **level_info(value)})
    if not segments:
        return None
    total = sum(s["seconds"] for s in segments)
    average = round(sum(s["congestion"] * s["seconds"] for s in segments) / total, 1)
    worst = max(segments, key=lambda s: s["congestion"])
    return {
        "average": {"congestion": average, **level_info(average)},
        "worst": {"station": worst["station"], "congestion": worst["congestion"], **level_info(worst["congestion"])},
        "segments": segments,
        "missing": missing,
    }


def describe_route(conn, route, day_type, depart_time):
    """경로 하나를 화면에 보여 줄 모양으로 정리합니다. 출발 시각을 앞뒤로 옮긴 평균 혼잡도도 함께 붙입니다."""
    rides, outside = ride_segments(route)
    table = congestion_table(conn, rides, day_type) if rides else {}
    now = score_route(rides, outside, table)
    if now is None:
        return None
    departures = []
    for shift in SHIFTS:
        moved = score_route(rides, outside, table, shift)
        departures.append({
            "shift_minutes": shift,
            "depart": (depart_time + timedelta(minutes=shift)).strftime("%H:%M"),
            "average": moved["average"] if moved else None,
        })
    lines = []
    for r in rides:
        if r["line"] not in lines:
            lines.append(r["line"])
    return {
        "total_minutes": round(route["totalReqHr"] / 60, 1),
        "transfers": route["trsitNmtm"],
        "transfer_stations": [t["stnNm"] for t in route.get("trfstnNms") or []],
        "lines": lines,
        **now,
        "departures": departures,
        "signature": tuple((r["line"], r["station"]) for r in rides) + tuple(outside),
    }


def avoid_candidates(conn, route, described, start, end, limit=2):
    """돌아가는 길을 만들 때 피할 역을 고릅니다.
    1) 가장 빠른 길에서 갈아타는 역, 2) 지나가는 환승역 중 그 시각에 붐비는 역 순서로 limit개까지 고릅니다."""
    names = [t["stnNm"] for t in route.get("trfstnNms") or []]
    transfer_names = {r["name"] for r in conn.execute(
        "select name from stations where station_no < 9000 group by name having count(*) > 1").fetchall()}
    for seg in sorted(described["segments"], key=lambda s: s["congestion"], reverse=True):
        if seg["station"] in transfer_names:
            names.append(seg["station"])
    picked = []
    for name in names:
        if name not in (start, end) and name not in picked:
            picked.append(name)
    return picked[:limit]


def rank_routes(candidates, time_weight):
    """후보마다 점수를 매깁니다. 시간과 평균 혼잡도를 각각 가장 좋은 후보의 몇 배인지로 바꾼 뒤
    점수 = 시간 가중치 × 시간 배수 + (1 − 시간 가중치) × 혼잡도 배수. 점수가 낮을수록 좋습니다."""
    fastest = min(candidates, key=lambda c: (c["total_minutes"], c["average"]["congestion"]))
    calmest = min(candidates, key=lambda c: (c["average"]["congestion"], c["total_minutes"]))
    best_minutes = fastest["total_minutes"]
    best_congestion = calmest["average"]["congestion"]
    for c in candidates:
        c["score"] = round(time_weight * c["total_minutes"] / best_minutes
                           + (1 - time_weight) * c["average"]["congestion"] / best_congestion, 3)
        c["tags"] = [tag for tag, who in (("빠른 길", fastest), ("편한 길", calmest)) if c is who]
        c["vs_fastest"] = {
            "extra_minutes": round(c["total_minutes"] - best_minutes, 1),
            "congestion_down": round(fastest["average"]["congestion"] - c["average"]["congestion"], 1),
            "level_down": fastest["average"]["level"] - c["average"]["level"],
        }
    candidates.sort(key=lambda c: c["score"])
    for i, c in enumerate(candidates):
        c["rank"] = i + 1
    return candidates
