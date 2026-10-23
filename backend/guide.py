"""AI 안내 도우미: 근거 자료 찾기(워크북 8 1부)와 찾은 자료로만 답하기(2부)

RAG = Retrieval(찾기) + Generation(답 만들기)
1) 찾기: 질문에서 역 이름과 궁금한 것(엘리베이터인지, 내리는 칸인지)을 골라 DB(guide_docs)에서 그 역의 자료만 꺼냅니다.
2) 답 만들기: 찾은 자료 문장만 AI에게 넘기고, 자료에 없는 내용은 지어내지 말라고 지시합니다.
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

# 성공한 모델을 메모리에 캐싱하여 속도를 높이는 전역 변수
WORKING_MODEL = None


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


# ───────── 2부: 찾은 자료로만 답하기 ─────────

SOURCE_NAMES = {"빠른하차정보": "서울교통공사 빠른하차정보", "교통약자이용정보": "서울교통공사 교통약자이용정보"}
NOT_FOUND = "안내를 찾지 못했어요. 역 이름과 함께 엘리베이터 위치나 빨리 내리는 칸을 물어봐 주세요."

RULES = """너는 서울 지하철 안내 도우미다.
- [자료]에 적힌 내용만 근거로 답한다. 자료에 없는 출구 번호, 칸 번호, 위치, 시간은 절대 지어내지 않는다.
- [자료]로 답할 수 없는 질문이면 found를 false로 한다.
- 답은 한국어 존댓말 '~요' 체로, 두 문장 안에서 짧게 쓴다.
- 방향(방면)에 따라 다르면 대표적인 방면을 하나 들고 방면 이름을 함께 말한다.
- {"found": true 또는 false, "answer": "답"} 모양의 JSON으로만 답한다."""


def ask_llm(question, docs):
    global WORKING_MODEL
    
    key = os.environ.get("LLM_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "서버에 AI 인증키(LLM_API_KEY)가 없습니다.")

    facts = "\n".join(f"- ({d['source']}) {d['content']}" for d in docs)
    body = {
        "systemInstruction": {"parts": [{"text": RULES}]},
        "contents": [{"role": "user", "parts": [{"text": f"[자료]\n{facts}\n\n[질문]\n{question}"}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048, "responseMimeType": "application/json"},
    }
    data = json.dumps(body).encode("utf-8")

    # SSL 및 프록시 차단 우회 설정
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))

    # [고속 경로] 1순위: 성공 기록 캐시 / 2순위: .env 설정값
    env_model = os.environ.get("LLM_MODEL", "").strip()
    if env_model and not env_model.startswith("models/"):
        env_model = f"models/{env_model}"
        
    fast_targets = []
    if WORKING_MODEL:
        fast_targets.append(WORKING_MODEL)
    elif env_model:
        fast_targets.append(env_model)

    for target in fast_targets:
        url = f"https://generativelanguage.googleapis.com/v1beta/{target}:generateContent"
        req = urllib.request.Request(url, data=data, headers={"x-goog-api-key": key, "Content-Type": "application/json"}, method="POST")
        try:
            with opener.open(req, timeout=30) as resp:
                res_body = resp.read().decode("utf-8")
                parts = json.loads(res_body)["candidates"][0]["content"]["parts"]
                text = "".join(p.get("text", "") for p in parts).strip()
                reply = json.loads(re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip())
                WORKING_MODEL = target  # 성공하면 캐시에 저장
                return {"found": bool(reply["found"]), "answer": str(reply["answer"]).strip()}
        except Exception:
            if target == WORKING_MODEL:
                WORKING_MODEL = None  # 캐시된 모델이 죽었다면 초기화
            pass # 실패 시 아래의 자동 탐색 로직으로 넘어감

    # [탐색 경로] 위 방법이 모두 실패했을 때만 구글 서버에서 모델 리스트를 불러와 시도
    try:
        req_models = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
        with opener.open(req_models, timeout=10) as resp:
            models_data = json.loads(resp.read().decode("utf-8"))
            valid_models = [m["name"] for m in models_data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
    except Exception as e:
        raise HTTPException(503, f"가용 모델 목록 조회 실패: {str(e)}")

    if not valid_models:
        raise HTTPException(503, "해당 API 키로 답변 생성을 지원하는 모델이 하나도 없습니다.")

    # 안정적인 flash 계열을 먼저 시도하도록 정렬 (제한이 걸린 2.5는 후순위로 미룸)
    def sort_key(name):
        score = 0
        if "flash" in name: score -= 10
        if "2.0" in name: score -= 5
        if "1.5" in name: score -= 5
        if "2.5" in name: score += 100
        return score
        
    last_err = ""
    for model_name in sorted(valid_models, key=sort_key):
        url = f"https://generativelanguage.googleapis.com/v1beta/{model_name}:generateContent"
        req = urllib.request.Request(url, data=data, headers={"x-goog-api-key": key, "Content-Type": "application/json"}, method="POST")
        try:
            with opener.open(req, timeout=30) as resp:
                res_body = resp.read().decode("utf-8")
                parts = json.loads(res_body)["candidates"][0]["content"]["parts"]
                text = "".join(p.get("text", "") for p in parts).strip()
                reply = json.loads(re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip())
                WORKING_MODEL = model_name
                print(f"\n✅ [Gemini API] 탐색 성공. 이후 요청은 {WORKING_MODEL} 캐시를 사용합니다.\n")
                return {"found": bool(reply["found"]), "answer": str(reply["answer"]).strip()}
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8") if e.fp else ""
            last_err = f"[{model_name}] {e.code}: {err_text[:100]}"
            continue
        except Exception as e:
            last_err = f"[{model_name}] {type(e).__name__}: {str(e)}"
            continue

    raise HTTPException(503, f"가용 모델 전체 호출 실패. (마지막 에러: {last_err})")


def ask(conn, question, station=""):
    """근거 자료를 찾고(1부) 그 자료로만 답합니다. 자료가 없으면 AI를 부르지 않고 바로 '못 찾음'으로 답합니다."""
    found = search(conn, question, station)
    if not found["docs"]:
        return {"found": False, "answer": NOT_FOUND, "stations": found["stations"], "sources": []}
    reply = ask_llm(question, found["docs"])
    if not reply["found"] or not reply["answer"]:
        return {"found": False, "answer": NOT_FOUND, "stations": found["stations"], "sources": []}
    # 근거: 답에 쓴 자료의 이름과 기준일 (같은 자료는 가장 늦은 기준일 하나만)
    dates = {}
    for d in found["docs"]:
        day = d["base_date"].isoformat() if d["base_date"] else ""
        dates[d["source"]] = max(dates.get(d["source"], ""), day)
    sources = [{"name": SOURCE_NAMES[s], "base_date": day or None} for s, day in dates.items()]
    return {"found": True, "answer": reply["answer"], "stations": found["stations"], "sources": sources}