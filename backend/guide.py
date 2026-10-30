"""AI 안내 도우미 (워크북 8 1·2부, 워크북 9)

RAG = Retrieval(찾기) + Generation(답 만들기)
- 묻고 답하기(8): 질문에서 역 이름과 궁금한 것을 골라 그 역의 자료만 찾고, 찾은 자료로만 짧게 답합니다.
- 경로 길잡이(9): 고른 경로의 출발·환승·도착역마다 타고 온 노선·방향에 맞는 자료를 한꺼번에 모아
  역마다 한 줄씩 안내합니다. 역마다 따로 찾아봐야 하는 정보를 대신 모아 주는 것이 목적입니다.
환각 막기: AI에게는 찾은 자료만 넘기고, AI가 쓴 문장의 숫자(칸-문, 출입구, 층)가 자료에 있는지 서버가 한 번 더 확인합니다.
"""
import json
import os
import re
import ssl
import urllib.error
import urllib.request
from fastapi import HTTPException

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


# ───────── AI 부르기 (워크북 8 2부의 모델 자동 찾기를 함수 하나로 정리, 워크북 9) ─────────

API = "https://generativelanguage.googleapis.com/v1beta"
WORKING_MODEL = None  # 한 번 성공한 모델을 기억해 두고 다음 요청부터 바로 씁니다.


def make_opener():
    """구글 AI 서버에 연결할 도구. 인증서는 운영체제(Windows·Linux)의 인증서 저장소로 검사합니다(truststore).
    학교망·보안 프로그램이 HTTPS를 중간에서 검사해도, 그 인증서가 Windows에 등록되어 있으면 검사를 끄지 않고 연결됩니다.
    그래도 막힐 때만 내 컴퓨터의 backend\\.env에 LLM_INSECURE_SSL=1을 적어 검사를 끕니다. 배포 서버(Render)에는 적지 않습니다."""
    try:
        import truststore
        context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:          # truststore를 아직 설치하지 않았으면 파이썬 기본 인증서 목록으로 검사
        context = ssl.create_default_context()
    if os.environ.get("LLM_INSECURE_SSL", "").strip() == "1":
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))


def call_model(opener, model, key, data):
    """모델 하나에 요청을 보내고, AI가 돌려준 JSON 글자를 파이썬 값으로 바꿉니다."""
    request = urllib.request.Request(f"{API}/{model}:generateContent", data=data, method="POST",
                                     headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    with opener.open(request, timeout=30) as resp:
        parts = json.loads(resp.read().decode("utf-8"))["candidates"][0]["content"]["parts"]
    text = "".join(p.get("text", "") for p in parts).strip()
    return json.loads(re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip())


def model_order(name):
    """자동 찾기 순서: flash 계열을 먼저, 사용 한도가 빨리 차는 2.5는 뒤로"""
    score = 0
    if "flash" in name:
        score -= 10
    if "2.0" in name or "1.5" in name:
        score -= 5
    if "2.5" in name:
        score += 100
    return score


def generate_json(rules, prompt, temperature=0.2):
    """AI에게 규칙(rules)과 내용(prompt)을 보내 JSON 답을 받습니다.
    1순위: 기억해 둔 모델 → 2순위: .env의 LLM_MODEL → 그래도 안 되면 쓸 수 있는 모델 목록을 받아 차례로 시도합니다."""
    global WORKING_MODEL
    key = os.environ.get("LLM_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "서버에 AI 인증키(LLM_API_KEY)가 없습니다.")
    data = json.dumps({
        "systemInstruction": {"parts": [{"text": rules}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": 2048, "responseMimeType": "application/json"},
    }).encode("utf-8")
    opener = make_opener()

    env_model = os.environ.get("LLM_MODEL", "").strip()
    if env_model and not env_model.startswith("models/"):
        env_model = f"models/{env_model}"
    first = WORKING_MODEL or env_model
    if first:
        try:
            reply = call_model(opener, first, key, data)
            WORKING_MODEL = first
            return reply
        except Exception:
            WORKING_MODEL = None   # 기억해 둔 모델이 안 되면 아래에서 다시 찾습니다.

    try:
        # 인증키는 주소가 아니라 머리글(x-goog-api-key)로 보냅니다. 주소에 넣으면 기록(log)에 남을 수 있습니다.
        request = urllib.request.Request(f"{API}/models?pageSize=200", headers={"x-goog-api-key": key})
        with opener.open(request, timeout=10) as resp:
            models = json.loads(resp.read().decode("utf-8")).get("models", [])
    except Exception as e:
        raise HTTPException(503, f"AI 모델 목록을 받지 못했습니다. ({type(e).__name__})")
    names = [m["name"] for m in models if "generateContent" in m.get("supportedGenerationMethods", [])]
    if not names:
        raise HTTPException(503, "이 인증키로 답을 만들 수 있는 AI 모델이 없습니다.")

    last_error = ""
    for name in sorted(names, key=model_order):
        if name == first:
            continue
        try:
            reply = call_model(opener, name, key, data)
            WORKING_MODEL = name
            print(f"[AI] {name} 모델로 연결했습니다. 다음 요청부터 이 모델을 씁니다.")
            return reply
        except urllib.error.HTTPError as e:
            last_error = f"{name} {e.code}"
        except Exception as e:
            last_error = f"{name} {type(e).__name__}"
    raise HTTPException(503, f"AI 답을 받지 못했습니다. (마지막 오류: {last_error})")


# ───────── 8 2부: 찾은 자료로만 답하기 ─────────

SOURCE_NAMES = {"빠른하차정보": "서울교통공사 빠른하차정보", "교통약자이용정보": "서울교통공사 교통약자이용정보"}
NOT_FOUND = "안내를 찾지 못했어요. 역 이름과 함께 엘리베이터 위치나 빨리 내리는 칸을 물어봐 주세요."

RULES = """너는 서울 지하철 안내 도우미다.
- [자료]에 적힌 내용만 근거로 답한다. 자료에 없는 출구 번호, 칸 번호, 위치, 시간은 절대 지어내지 않는다.
- [자료]로 답할 수 없는 질문이면 found를 false로 한다.
- 답은 한국어 존댓말 '~요' 체로, 두 문장 안에서 짧게 쓴다.
- 방향(방면)에 따라 다르면 대표적인 방면을 하나 들고 방면 이름을 함께 말한다.
- {"found": true 또는 false, "answer": "답"} 모양의 JSON으로만 답한다."""


def ask_llm(question, docs):
    facts = "\n".join(f"- ({d['source']}) {d['content']}" for d in docs)
    reply = generate_json(RULES, f"[자료]\n{facts}\n\n[질문]\n{question}")
    return {"found": bool(reply.get("found")), "answer": str(reply.get("answer") or "").strip()}


def source_list(docs):
    """근거: 쓴 자료의 이름과 기준일 (같은 자료는 가장 늦은 기준일 하나만)"""
    dates = {}
    for d in docs:
        day = d["base_date"].isoformat() if d["base_date"] else ""
        dates[d["source"]] = max(dates.get(d["source"], ""), day)
    return [{"name": SOURCE_NAMES[s], "base_date": day or None} for s, day in dates.items()]


def ask(conn, question, station=""):
    """근거 자료를 찾고(1부) 그 자료로만 답합니다. 자료가 없으면 AI를 부르지 않고 바로 '못 찾음'으로 답합니다."""
    found = search(conn, question, station)
    if not found["docs"]:
        return {"found": False, "answer": NOT_FOUND, "stations": found["stations"], "sources": []}
    reply = ask_llm(question, found["docs"])
    if not reply["found"] or not reply["answer"]:
        return {"found": False, "answer": NOT_FOUND, "stations": found["stations"], "sources": []}
    return {"found": True, "answer": reply["answer"], "stations": found["stations"], "sources": source_list(found["docs"])}


# ───────── 워크북 9·9-2: 경로 길잡이 (경로 전체를 한 번에) ─────────

MODES = {"fast": "빨리 갈아타기", "easy": "휠체어·유모차"}
STOP_LIMIT = 8  # 역 하나에 넘길 자료는 많아야 8줄
NUMBER = re.compile(r"\d+(?:-\d+)?")  # 숫자 덩어리. 예: 3-2(칸-문), 4(번 출구), 2(호선)
CAR = re.compile(r"\d+-\d+")          # 칸-문 번호. 예: 3-2
# 2호선: 경로 API는 내선·외선, 빠른하차정보는 상행·하행으로 적습니다(9-1 점검: 외선 열차 = 상행 줄).
DIRECTION_LABEL = {"외선": "상행", "내선": "하행"}
# 경로 API와 근거 자료의 역 이름이 다른 곳 (9-1 점검: 4호선 이수 = 자료의 총신대입구)
STATION_ALIAS = {"이수": ["총신대입구"], "총신대입구": ["이수"]}

ROUTE_RULES = """너는 서울 지하철 길잡이다. 경로의 역마다 번호, [열차], [자료]가 주어진다.
- 각 역의 tip은 그 번호의 자료에 적힌 내용만 근거로 쓴다. 자료에 없는 칸 번호, 출입구 번호, 층, 위치는 절대 지어내지 않는다.
- 자료가 '(자료 없음)'인 역은 tip을 빈 글자로 둔다.
- 자료의 'OO 방면'은 열차가 가는 쪽이다. [열차]에 적힌 '가는 쪽' 역 방면의 칸만 쓰고, '온 쪽' 역 방면은 반대 방향이니 쓰지 않는다. 방면은 하나만 쓴다.
- 칸-문 번호(예: 3-2)는 자료에 적힌 그대로 옮긴다.
- 빨리 갈아타기: 출발역 tip은 [다음에 내릴 역]에서 빨리 내리려면 몇 번 칸에 타라고 칸-문 번호를 꼭 넣어 쓴다. 환승·도착역 tip은 내릴 때 가까운 칸과 무엇(계단, 에스컬레이터, 엘리베이터)이 가까운지 쓴다.
- 휠체어·유모차: 출발역은 승강장으로 내려가는 엘리베이터와 탈 칸, 환승역은 내릴 칸과 갈아탈 노선으로 가는 엘리베이터, 도착역은 내릴 칸과 나가는 엘리베이터·출입구를 쓴다.
- 출발역과 환승역에서는 출구로 나가라고 하지 않는다. 출구 안내는 도착역에서만 한다.
- 자료에 '환승'이라는 말이 없으면 환승 통로와 가깝다고 말하지 않는다.
- tip은 한국어 '~요' 체 한 문장으로 60자 안쪽. summary도 '~요' 체 한 문장으로 경로 전체를 요약한다.
- {"summary": "요약", "tips": [{"no": 번호, "tip": "안내"}]} 모양의 JSON으로만 답한다."""


def same_line(a, b):
    """'2호선'과 '02호선'처럼 표기가 조금 달라도 같은 노선으로 봅니다."""
    norm = lambda s: re.sub(r"^0+", "", (s or "").replace(" ", ""))
    return norm(a) == norm(b)


def same_station(a, b):
    """역 이름이 같은지: '신도림'과 '신도림역', '총신대입구(이수)'와 '이수'처럼 표기가 달라도 같은 역으로 봅니다."""
    return bool(name_keys(a or "") & name_keys(b or ""))


def stop_names(station, names):
    """경로의 역 이름 → 근거 자료(guide_docs)에서 그 역을 부르는 이름 목록. 다른 이름(STATION_ALIAS)도 함께 찾습니다."""
    wanted = [station] + STATION_ALIAS.get(re.sub(r"역$", "", station), [])
    return [n for n in names if any(same_station(n, w) for w in wanted)]


def route_stops(legs):
    """노선별 구간(legs) → 출발·환승·도착역 목록. 역마다 타고 온 구간(arrive)과 갈아탈 구간(depart)을 붙입니다."""
    stops = [{"kind": "출발", "station": legs[0]["from"], "arrive": None, "depart": legs[0]}]
    for i, leg in enumerate(legs):
        last = i == len(legs) - 1
        stops.append({"kind": "도착" if last else "환승", "station": leg["to"],
                      "arrive": leg, "depart": None if last else legs[i + 1]})
    return stops


def right_way(r, leg):
    """빠른하차정보 한 줄이 타고 온 열차 방향과 맞는지.
    1) 방향 표기가 같으면(2호선은 외선=상행, 내선=하행으로 바꿔 비교) 맞음
    2) 표기를 비교할 수 없으면, 방면이 '앞 역'(타고 온 쪽)이 아니면 맞음 — 앞 역 방면은 반대로 가는 열차입니다."""
    raw = r["raw"] or {}
    way, want = raw.get("upbdnbSe"), leg.get("direction") or ""
    if way and want and way in (want, DIRECTION_LABEL.get(want)):
        return True
    toward, prev = raw.get("drtnInfo"), leg.get("prev")
    if toward and prev:
        return not same_station(toward, prev)
    return False


def stop_docs(rows, arrive, depart, mode):
    """역 하나의 자료(rows) 중 이 경로에 맞는 줄만 고릅니다.
    빠른하차정보: 타고 온 노선, 그중 방향이 맞는 줄(right_way). 하나도 없으면 노선만 맞춥니다.
    교통약자이용정보(엘리베이터): 타고 온 노선과 갈아탈 노선. 휠체어·유모차 안내에서만 씁니다."""
    exits = [r for r in rows if r["source"] == "빠른하차정보" and arrive and same_line(r["line"], arrive["line"])]
    exits = [r for r in exits if right_way(r, arrive)] or exits
    if mode == "fast":
        return exits[:STOP_LIMIT]
    lifts = [r for r in rows if r["source"] == "교통약자이용정보"
             and any(leg and same_line(r["line"], leg["line"]) for leg in (arrive, depart))]
    return (lifts[:4] + [r for r in exits if "엘리베이터" in r["content"]])[:STOP_LIMIT]


def grounded(text, docs, context):
    """AI가 쓴 문장의 숫자가 모두 자료(또는 경로 정보)에 있는지 확인합니다. 하나라도 없으면 지어낸 것으로 봅니다."""
    allowed = set(NUMBER.findall(" ".join(d["content"] for d in docs) + " " + context))
    return all(n in allowed for n in NUMBER.findall(text))


def guide_route(conn, legs, mode="fast"):
    """경로 길잡이: 역마다 자료를 모으고(찾기), 모은 자료로만 역별 안내를 만들고(답 만들기), 숫자를 확인합니다."""
    names = [r["station"] for r in conn.execute("select distinct station from guide_docs").fetchall()]
    stops = route_stops(legs)
    for stop in stops:
        matched = stop_names(stop["station"], names)
        rows = conn.execute(
            "select source, line, station, content, raw, base_date from guide_docs where station = any(%s) order by id",
            (matched,)).fetchall() if matched else []
        stop["docs"] = stop_docs(rows, stop["arrive"], stop["depart"], mode)
    if mode == "fast" and len(stops) > 1:
        stops[0]["docs"] = stops[1]["docs"]   # 출발역: 다음에 내릴 역에서 빨리 내리려면 어느 칸에 탈지

    def context(stop, no):
        """AI에게 알려 줄 열차 정보: 노선, 방향, 온 쪽·가는 쪽 역"""
        arrive, depart = stop["arrive"], stop["depart"]
        parts = []
        if arrive:
            parts.append(f"{arrive['line']} {arrive.get('direction') or ''} 열차를 타고 옴 (온 쪽: {arrive.get('prev') or '?'}역)")
        if depart:
            parts.append(f"{depart['line']} {depart.get('direction') or ''} 열차를 탐 (가는 쪽: {depart.get('next') or '?'}역)")
        if stop["kind"] == "출발" and no < len(stops):
            parts.append(f"[다음에 내릴 역] {stops[no]['station']}역")
        return " · ".join(parts)

    all_docs = [d for s in stops for d in s["docs"]]
    reply = {}
    if all_docs:
        blocks = []
        for no, stop in enumerate(stops, 1):
            facts = "\n".join(f"- ({d['source']}) {d['content']}" for d in stop["docs"]) or "(자료 없음)"
            blocks.append(f"[{no}] {stop['kind']} {stop['station']}역 [열차] {context(stop, no)}\n{facts}")
        # temperature 0: 같은 경로를 다시 눌러도 되도록 같은 답이 나오게 합니다(9-1 점검).
        reply = generate_json(ROUTE_RULES, f"[안내 방식] {MODES[mode]}\n\n" + "\n\n".join(blocks), temperature=0)
    tips = {}
    for t in reply.get("tips") or []:
        if isinstance(t, dict) and str(t.get("no", "")).isdigit():
            tips[int(t["no"])] = str(t.get("tip") or "").strip()

    result, dropped = [], 0
    for no, stop in enumerate(stops, 1):
        docs = stop["docs"]
        tip = tips.get(no, "") if docs else ""
        wants_car = mode == "fast" and stop["kind"] == "출발" and any(CAR.search(d["content"]) for d in docs)
        if tip and (not grounded(tip, docs, context(stop, no)) or (wants_car and not CAR.search(tip))):
            tip, dropped = "", dropped + 1      # 자료에 없는 숫자가 있거나, 타야 할 칸 번호가 빠지면 자료 원문을 보여 줌
        # 근거 자료 보기: 안내에 쓴 칸·출입구 번호가 들어 있는 줄을 앞에 둡니다.
        used = set(NUMBER.findall(tip))
        docs = sorted(docs, key=lambda d: -len(used & set(NUMBER.findall(d["content"]))))
        arrive, depart = stop["arrive"], stop["depart"]
        result.append({
            "kind": stop["kind"], "station": stop["station"],
            "line": (arrive or depart)["line"], "next_line": depart["line"] if arrive and depart else None,
            "tip": tip or None,
            "facts": [d["content"] for d in docs[:3]],
        })
    summary = str(reply.get("summary") or "").strip()
    route_text = " ".join(context(s, i) for i, s in enumerate(stops, 1))
    if summary and not grounded(summary, all_docs, route_text):
        summary, dropped = "", dropped + 1
    return {"mode": mode, "mode_name": MODES[mode], "summary": summary or None, "stops": result,
            "dropped": dropped, "sources": source_list(all_docs)}
