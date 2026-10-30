"""경로 계산 도구: 최단경로 API 호출, 구간별 혼잡도, 후보 경로, 점수 (워크북 6, 7-1)"""
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
# 돌아가는 길이 빠른 길보다 이만큼(분) 넘게 더 걸리면 후보에서 뺍니다.
MAX_EXTRA_MINUTES = 25


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
    여러 역은 "사당,노량진"처럼 쉼표로 잇습니다. 같은 조건으로 받은 적이 있으면 DB(route_cache)에 저장해 둔 응답을 씁니다."""
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
    역코드에 글자가 있으면(1~8호선 밖) 역번호를 None으로 둡니다. 혼잡도 자료가 없는 구간도 목록에는 남깁니다."""
    rides = []
    for seg in route["paths"]:
        if seg["trsitYn"] == "Y":          # 환승 구간은 열차를 타지 않습니다.
            continue
        station = seg["dptreStn"]
        direction = DIRECTION.get(seg["upbdnbSe"])
        number = None
        if station["stnCd"].isdigit():
            number = SPECIAL.get((station["lineNm"], int(station["stnCd"]), direction), int(station["stnCd"]))
        hour, minute, _ = seg["trainDptreTm"].split(":")
        rides.append({
            "station": station["stnNm"], "line": station["lineNm"], "direction": seg["upbdnbSe"],
            "station_no": number, "db_direction": direction,
            "minute": int(hour) * 60 + int(minute), "seconds": seg["reqHr"],
        })
    return rides


def congestion_table(conn, rides, day_type):
    """경로가 지나는 역의 혼잡도를 한 번에 읽어 {(역번호, 방향, 30분 칸): 혼잡도} 사전으로 만듭니다."""
    numbers = sorted({r["station_no"] for r in rides if r["station_no"] is not None})
    if not numbers:
        return {}
    rows = conn.execute(
        "select station_no, direction, time_slot, congestion::float as congestion from congestion_stats"
        " where day_type = %s and station_no = any(%s)", (day_type, numbers)).fetchall()
    return {(r["station_no"], r["direction"], r["time_slot"]): r["congestion"] for r in rows}


def value_at(table, ride, shift=0):
    """구간 하나가 그 시각(shift분만큼 옮긴 시각)에 가진 혼잡도. 자료가 없으면 None"""
    return table.get((ride["station_no"], ride["db_direction"], slot_name(ride["minute"] + shift)))


def score_route(rides, table, shift=0):
    """구간마다 혼잡도를 붙이고, 소요시간으로 가중한 평균과 가장 붐비는 구간, 계산한 범위(coverage)를 구합니다.
    혼잡도를 하나도 붙이지 못하면 average와 worst가 None입니다."""
    segments, missing = [], []
    for r in rides:
        value = value_at(table, r, shift)
        if value is None:                  # 1~8호선 밖이거나, 운행 없음(0)으로 뺀 칸
            missing.append(r["station"])
            continue
        segments.append({"station": r["station"], "line": r["line"], "direction": r["direction"],
                         "time_slot": slot_name(r["minute"] + shift), "seconds": r["seconds"],
                         "congestion": value, **level_info(value)})
    ride_seconds = sum(r["seconds"] for r in rides) or 1
    covered = sum(s["seconds"] for s in segments)
    result = {"average": None, "worst": None, "segments": segments, "missing": missing,
              "coverage": round(covered / ride_seconds * 100)}
    if segments:
        average = round(sum(s["congestion"] * s["seconds"] for s in segments) / covered, 1)
        worst = max(segments, key=lambda s: s["congestion"])
        result["average"] = {"congestion": average, **level_info(average)}
        result["worst"] = {"station": worst["station"], "congestion": worst["congestion"], **level_info(worst["congestion"])}
    return result


def route_legs(rides, table, destination):
    """구간을 같은 노선끼리 묶습니다. 예: 2호선 신도림 → 대림, 7호선 대림 → 논현
    노선마다 평균 혼잡도를 붙이고, 혼잡도를 하나도 모르는 노선은 average를 None으로 둡니다."""
    groups = []
    for r in rides:
        if groups and groups[-1]["line"] == r["line"]:
            groups[-1]["rides"].append(r)
        else:
            groups.append({"line": r["line"], "from": r["station"], "direction": r["direction"], "rides": [r]})
    legs = []
    for i, g in enumerate(groups):
        known = [(value_at(table, r), r["seconds"]) for r in g["rides"]]
        known = [(v, s) for v, s in known if v is not None]
        average = None
        if known:
            value = round(sum(v * s for v, s in known) / sum(s for _, s in known), 1)
            average = {"congestion": value, **level_info(value)}
        legs.append({"line": g["line"], "from": g["from"], "direction": g["direction"],
                     "to": groups[i + 1]["from"] if i + 1 < len(groups) else destination,
                     "minutes": round(sum(r["seconds"] for r in g["rides"]) / 60), "average": average})
    return legs


def describe_route(conn, route, day_type, depart_time, destination):
    """경로 하나를 화면에 보여 줄 모양으로 정리합니다. 출발 시각을 앞뒤로 옮긴 평균 혼잡도도 함께 붙입니다."""
    rides = ride_segments(route)
    if not rides:
        return None
    table = congestion_table(conn, rides, day_type)
    now = score_route(rides, table)
    departures = []
    for shift in SHIFTS:
        departures.append({
            "shift_minutes": shift,
            "depart": (depart_time + timedelta(minutes=shift)).strftime("%H:%M"),
            "average": score_route(rides, table, shift)["average"],
        })
    legs = route_legs(rides, table, destination)
    return {
        "total_minutes": round(route["totalReqHr"] / 60, 1),
        "transfers": route["trsitNmtm"],
        "transfer_stations": [t["stnNm"] for t in route.get("trfstnNms") or []],
        "lines": [leg["line"] for leg in legs],
        "no_data_lines": [leg["line"] for leg in legs if leg["average"] is None],
        "legs": legs,
        **now,
        "departures": departures,
        "signature": tuple((r["line"], r["station"]) for r in rides),
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


def no_data_entry(described):
    """혼잡도 자료가 없는 노선으로 갈아타는 첫 역을 찾습니다. 예: 노량진(→ 9호선)
    이 역까지 함께 빼고 다시 요청하면 1~8호선으로 돌아가는 길을 받을 수 있습니다. 출발역부터 자료가 없으면 None"""
    for i, leg in enumerate(described["legs"]):
        if leg["average"] is None and i > 0:
            return leg["from"]
    return None


def rank_routes(candidates, time_weight):
    """혼잡도를 아는 후보끼리 점수를 매깁니다. 시간과 평균 혼잡도를 각각 가장 좋은 후보의 몇 배인지로 바꾼 뒤
    점수 = 시간 가중치 × 시간 배수 + (1 − 시간 가중치) × 혼잡도 배수. 점수가 낮을수록 좋습니다.
    혼잡도 자료가 없는 후보는 점수 없이(score: None) 맨 뒤에 둡니다."""
    scored = [c for c in candidates if c["average"]]
    unscored = [c for c in candidates if not c["average"]]
    fastest = min(scored, key=lambda c: (c["total_minutes"], c["average"]["congestion"]))
    calmest = min(scored, key=lambda c: (c["average"]["congestion"], c["total_minutes"]))
    best_minutes = fastest["total_minutes"]
    best_congestion = calmest["average"]["congestion"]
    for c in scored:
        c["score"] = round(time_weight * c["total_minutes"] / best_minutes
                           + (1 - time_weight) * c["average"]["congestion"] / best_congestion, 3)
        c["tags"] = [tag for tag, who in (("빠른 길", fastest), ("편한 길", calmest)) if c is who]
        c["vs_fastest"] = {
            "extra_minutes": round(c["total_minutes"] - best_minutes, 1),
            "congestion_down": round(fastest["average"]["congestion"] - c["average"]["congestion"], 1),
            "level_down": fastest["average"]["level"] - c["average"]["level"],
        }
    for c in unscored:
        c["score"] = None
        c["tags"] = []
        c["vs_fastest"] = {"extra_minutes": round(c["total_minutes"] - best_minutes, 1),
                           "congestion_down": None, "level_down": None}
    ranked = sorted(scored, key=lambda c: c["score"]) + sorted(unscored, key=lambda c: c["total_minutes"])
    for i, c in enumerate(ranked):
        c["rank"] = i + 1
    return ranked
