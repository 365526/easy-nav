"""AI 안내 도우미: 질문에 맞는 근거 자료 찾기 (워크북 8 1부)

RAG의 R(Retrieval, 찾기)에 해당합니다. 질문에서 역 이름과 궁금한 것(엘리베이터인지, 내리는 칸인지)을 골라
DB(guide_docs)에서 그 역의 자료만 꺼냅니다.
"""
import re

# 질문에 이 낱말이 있으면 엘리베이터 자료를, 아래 낱말이 있으면 빠른하차 자료를 찾습니다. 둘 다 없으면 둘 다 찾습니다.
ELEVATOR_WORDS = ("엘리베이터", "승강기", "휠체어", "유모차", "교통약자", "캐리어", "무릎")
EXIT_WORDS = ("빠른", "하차", "내리", "내릴", "칸", "계단", "에스컬레이터", "출구", "환승", "갈아")
LIMIT = 20  # AI에게 넘길 자료는 많아야 20줄


def name_keys(name):
    """역 이름을 찾을 때 쓸 여러 표기. 예: '서울역' → 서울역, 서울 · '총신대입구(이수)' → 총신대입구(이수), 총신대입구, 이수"""
    keys = {name}
    plain = re.sub(r"\(.*?\)", "", name).strip()
    keys.add(plain)
    keys.update(re.findall(r"\((.*?)\)", name))
    if plain.endswith("역") and len(plain) > 2:
        keys.add(plain[:-1])
    return {k for k in keys if len(k) >= 2}


def find_stations(question, names):
    """질문에 나온 역 이름을 찾습니다. 더 긴 이름을 먼저 봐서 '서울대입구'가 '서울'로 잘못 잡히지 않게 합니다."""
    text = question.replace(" ", "")
    pairs = sorted(((key, name) for name in names for key in name_keys(name)), key=lambda p: -len(p[0]))
    found = []
    for key, name in pairs:
        if key in text and name not in found:
            found.append(name)
            text = text.replace(key, " ")   # 찾은 부분은 지워서 더 짧은 이름이 겹쳐 잡히지 않게 함
    return found[:2]


def pick_sources(question):
    """질문 낱말로 찾아볼 자료를 고릅니다. 엘리베이터만 묻는 질문이면 elevator_only가 True입니다."""
    elevator = any(w in question for w in ELEVATOR_WORDS)
    exit_ = any(w in question for w in EXIT_WORDS)
    if exit_ and not elevator:
        return ["빠른하차정보"], False
    return ["교통약자이용정보", "빠른하차정보"], elevator and not exit_


def search(conn, question, station=""):
    """질문에 맞는 근거 자료를 찾습니다. 질문에 역 이름이 없으면 station(예: 경로 찾기의 도착역)을 씁니다."""
    names = [r["station"] for r in conn.execute("select distinct station from guide_docs").fetchall()]
    stations = find_stations(question, names) or find_stations(station, names)
    sources, elevator_only = pick_sources(question)
    if not stations:
        return {"stations": [], "sources": sources, "docs": []}
    rows = conn.execute(
        "select source, line, station, content, base_date from guide_docs"
        " where station = any(%s) and source = any(%s) order by array_position(%s, source), line, id",
        (stations, sources, sources)).fetchall()
    if elevator_only:
        # 엘리베이터만 묻는 질문에는 빠른하차정보 중 엘리베이터와 가까운 칸만 남깁니다.
        rows = [r for r in rows if r["source"] == "교통약자이용정보" or "엘리베이터" in r["content"]]
    return {"stations": stations, "sources": sources, "docs": rows[:LIMIT]}
