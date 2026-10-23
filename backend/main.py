"""easy-nav 서버: 역 검색, 혼잡도 조회, 경로 혼잡도 계산, 경로 추천, 분석용 API, 안내 도우미 (워크북 4~6, 7-1, 8)"""
import os
from datetime import datetime

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row

from guide import ask as guide_ask, search as guide_search
from route_logic import MAX_EXTRA_MINUTES, avoid_candidates, describe_route, fetch_route, level_info, no_data_entry, rank_routes

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

app = FastAPI(
    title="easy-nav API",
    description="빨리 갈까, 편하게 갈까? · 지하철 경로의 소요 시간과 혼잡도를 함께 계산합니다.",
    version="0.5.0",
)

# 화면(Vercel)과 내 컴퓨터의 개발용 화면에서 이 서버를 부를 수 있게 허용합니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://easy-nav-iota.vercel.app", "http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

DAY_TYPES = ("평일", "토요일", "일요일")


def db():
    """요청마다 DB에 접속합니다. 결과는 {칸 이름: 값} 모양으로 받습니다."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def check_day_type(day_type):
    if day_type not in DAY_TYPES:
        raise HTTPException(400, "day_type은 평일, 토요일, 일요일 중 하나입니다.")


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


@app.get("/routes/congestion", tags=["경로"], summary="경로 하나의 혼잡도")
def route_congestion(from_station: str = Query(..., description="출발역 이름. 예: 신도림"),
                     to_station: str = Query(..., description="도착역 이름. 예: 강남"),
                     depart_time: datetime = Query(..., description="출발 일시. 예: 2026-10-22T08:30"),
                     day_type: str = "평일"):
    """가장 빠른 경로를 받아 구간마다 그 시각의 혼잡도를 붙이고, 평균과 가장 붐비는 구간을 5단계로 알려 줍니다."""
    check_day_type(day_type)
    with db() as conn:
        route = fetch_route(conn, from_station, to_station, depart_time)["body"]
        info = describe_route(conn, route, day_type, depart_time, to_station)
    if info is None or info["average"] is None:
        raise HTTPException(404, "이 경로에는 혼잡도를 붙일 수 있는 1~8호선 구간이 없습니다.")
    return {
        "from": from_station, "to": to_station, "depart_time": depart_time, "day_type": day_type,
        "total_minutes": info["total_minutes"], "transfers": info["transfers"],
        "average": info["average"], "worst": info["worst"],
        "segments": info["segments"], "missing": info["missing"], "coverage": info["coverage"],
    }


@app.get("/routes/recommend", tags=["경로"], summary="빠른 길과 편한 길 비교 추천")
def recommend(from_station: str = Query(..., description="출발역 이름. 예: 잠실"),
              to_station: str = Query(..., description="도착역 이름. 예: 광화문"),
              depart_time: datetime = Query(..., description="출발 일시. 예: 2026-10-22T08:30"),
              day_type: str = "평일",
              time_weight: float = Query(0.5, ge=0, le=1, description="1에 가까울수록 시간을, 0에 가까울수록 덜 붐비는 것을 중시")):
    """가장 빠른 길과, 붐비는 역을 피해 돌아가는 길을 최대 2개 더 받아 비교합니다.
    돌아가는 길이 혼잡도 자료가 없는 노선(9호선, 신분당선 등)으로 가면, 그 노선으로 갈아타는 역도 함께 빼고 한 번 더 받습니다.
    그래도 자료가 없는 후보는 버리지 않고 average: null, no_data_lines로 알려 줍니다."""
    check_day_type(day_type)
    with db() as conn:
        first = fetch_route(conn, from_station, to_station, depart_time)["body"]
        fastest = describe_route(conn, first, day_type, depart_time, to_station)
        if fastest is None or fastest["average"] is None:
            raise HTTPException(404, "이 경로에는 혼잡도를 붙일 수 있는 1~8호선 구간이 없습니다.")
        candidates = [{**fastest, "avoid": None}]

        def ask(exclude):
            """제외역을 넣어 경로를 받아 정리합니다. 길이 없으면(API 오류) None"""
            try:
                route = fetch_route(conn, from_station, to_station, depart_time, exclude=exclude)["body"]
            except HTTPException:
                return None
            info = describe_route(conn, route, day_type, depart_time, to_station)
            return {**info, "avoid": exclude} if info else None

        for name in avoid_candidates(conn, first, fastest, from_station, to_station):
            other = ask(name)
            entry = no_data_entry(other) if other else None
            if entry and entry not in (from_station, to_station):
                retry = ask(f"{name},{entry}")   # 예: "사당,노량진" → 9호선 대신 7호선으로 돌아가는 길
                if retry and retry["coverage"] > other["coverage"]:
                    other = retry
            if (other and other["total_minutes"] - fastest["total_minutes"] <= MAX_EXTRA_MINUTES
                    and all(other["signature"] != c["signature"] for c in candidates)):
                candidates.append(other)
    for c in candidates:
        del c["signature"]
    ranked = rank_routes(candidates, time_weight)
    return {
        "from": from_station, "to": to_station, "depart_time": depart_time, "day_type": day_type,
        "time_weight": time_weight,
        "candidates": ranked,
    }


@app.get("/analysis/summary", tags=["분석"], summary="자료 요약")
def analysis_summary(day_type: str = "평일", time_slot: str = Query("8시30분", description="단계 분포를 볼 30분 칸")):
    """분석 페이지의 데이터 소개 탭에 씁니다. 자료 규모, 요일별 평균, 시간대별 평균, 한 시간대의 단계 분포를 돌려줍니다."""
    check_day_type(day_type)
    with db() as conn:
        size = conn.execute(
            "select count(*) as rows, count(distinct station_no) as stations, max(base_date) as base_date"
            " from congestion_stats").fetchone()
        days = conn.execute(
            "select day_type, round(avg(congestion), 1)::float as average, max(congestion)::float as max"
            " from congestion_stats group by day_type").fetchall()
        slots = conn.execute(
            "select time_slot, round(avg(congestion), 1)::float as average from congestion_stats"
            " where day_type = %s group by slot_order, time_slot order by slot_order", (day_type,)).fetchall()
        rows = conn.execute(
            "select level, count(*) as count from congestion_stats"
            " where day_type = %s and time_slot = %s group by level", (day_type, time_slot)).fetchall()
    counts = {r["level"]: r["count"] for r in rows}
    return {
        **size,
        "day_types": sorted(days, key=lambda d: DAY_TYPES.index(d["day_type"])),
        "time_slots": [{**s, **level_info(s["average"])} for s in slots],
        "levels": {"day_type": day_type, "time_slot": time_slot,
                   "counts": [{"level": lv, "count": counts.get(lv, 0)} for lv in range(1, 6)]},
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


@app.get("/guide/search", tags=["안내 도우미"], summary="질문에 맞는 근거 자료 찾기")
def guide_docs(question: str = Query(..., min_length=1, max_length=100, description="예: 강남역 엘리베이터 위치"),
               station: str = Query("", description="질문에 역 이름이 없을 때 쓸 역. 예: 경로 찾기의 도착역")):
    """질문에서 역 이름과 궁금한 것(엘리베이터, 내리는 칸)을 골라 빠른하차정보·교통약자이용정보에서 그 역의 자료를 찾습니다.
    안내 도우미가 답할 때 근거로 쓰는 자료이며, 자료를 찾지 못하면 docs가 빈 목록입니다."""
    with db() as conn:
        return guide_search(conn, question, station)


@app.get("/guide/ask", tags=["안내 도우미"], summary="안내 도우미에게 묻기 (찾은 자료로만 답함)")
def ask_guide(question: str = Query(..., min_length=1, max_length=100, description="예: 강남역 엘리베이터 위치"),
              station: str = Query("", description="질문에 역 이름이 없을 때 쓸 역. 예: 경로 찾기의 도착역")):
    """/guide/search로 찾은 자료만 AI에게 넘겨 짧게 답합니다. 자료가 없거나 자료로 답할 수 없으면 found: false입니다.
    sources는 답의 근거가 된 자료 이름과 기준일입니다. AI를 쓸 수 없으면 503 오류입니다."""
    with db() as conn:
        return guide_ask(conn, question, station)
