"""이용 규정 도우미 (워크북 10, 10-1): 긴 문서(여객운송약관)에서 질문에 맞는 조항을 찾아, 그 조항으로만 답합니다.

RAG = Retrieval(찾기) + Generation(답 만들기)
1) 나누기: 약관 전체(data/terms.txt)를 '제○조(제목)'마다 잘라 조항 목록을 만듭니다. 서버가 켜질 때 한 번만 합니다.
2) 질문 바꾸기(워크북 10-1): AI에게 조항 제목 목록을 보여 주고, 질문을 약관에 쓰인 낱말 몇 개로 바꾸게 합니다.
   '돈 안 내고 탔다가 걸리면?' → 부가운임, 승차권. 사람들이 쓰는 말과 약관 용어가 달라도 맞는 조항을 찾게 됩니다.
3) 찾기: 질문(+바꾼 낱말)과 조항을 글자 두 개씩 끊은 조각(바이그램)으로 바꿔, 겹치는 정도에 BM25 점수를 매겨 상위 3개를 고릅니다.
   AI가 낱말을 잘못 바꿀 때를 대비해, 질문만으로 찾은 1위 조항도 함께 넘깁니다.
   한국어는 띄어쓰기·조사가 다양해서 낱말보다 두 글자 조각이 잘 맞습니다. (예: '자전거를' → 자전, 전거, 거를)
4) 답 만들기: 고른 조항만 AI에게 넘기고, AI가 쓴 숫자(금액, 배수, 크기)가 그 조항에 있는지 서버가 한 번 더 확인합니다.
"""
import math
import pathlib
import re
from collections import Counter

from guide import generate_json, grounded

TERMS_FILE = pathlib.Path(__file__).parent / "data" / "terms.txt"
SOURCE = "서울교통공사 여객운송약관(1~8호선)"
TOP = 3                 # AI에게 넘길 조항 수
MAX_CHARS = 1500        # 조항 하나가 너무 길면 앞부분만 넘김
NOT_FOUND = "약관에서 맞는 조항을 찾지 못했어요. 자전거, 반려동물, 환불, 부가운임처럼 궁금한 규정을 넣어 다시 물어봐 주세요."
CHECK_FAIL = "AI 답이 조항과 맞지 않아, 찾은 조항 원문을 그대로 보여 드려요."

# '제12조(휴대금지품)', '제12조의2 (자전거 휴대)' 같은 조항 머리. 줄 맨 앞에 있는 것만 봅니다.
ARTICLE = re.compile(r"^[ \t]*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*[(（]\s*([^)）\n]+?)\s*[)）]", re.M)
# 부칙(개정 이력)에도 '제1조(시행일)'가 다시 나오므로, 부칙부터는 자릅니다.
APPENDIX = re.compile(r"^[ \t]*부\s*칙", re.M)
BASE_DATE = re.compile(r"기준일\s*[:：]\s*(\d{4}-\d{2}-\d{2})")

# 사람들이 쓰는 말 → 약관에 쓰인 말. 질문에 왼쪽 말이 있으면 오른쪽 말도 함께 찾습니다.
# AI가 질문을 바꾸지 못할 때(인증키 없음, 사용량 초과)도 자주 묻는 말은 찾도록 남겨 둡니다.
SYNONYMS = {
    "환불": "반환", "돌려받": "반환", "벌금": "부가운임", "과태료": "부가운임", "무임": "부가운임 승차권",
    "처벌": "부가운임", "걸리": "부가운임", "단속": "부가운임 승차권의 검사", "없이": "소지하지 아니하고", "부정": "부정승차 부가운임",
    "안 내": "부가운임 승차권을 소지하지 아니하고", "안내고": "부가운임 승차권을 소지하지 아니하고", "돈": "운임", "요금": "운임",
    "안 찍": "개표하지 않고 부가운임", "개찰구": "운임지역 무단입장 개표", "뛰어넘": "무단입장 부가운임",
    "강아지": "동물", "고양이": "동물", "반려동물": "동물", "애완": "동물",
    "킥보드": "개인형 이동장치 전동", "전동": "개인형 이동장치", "배터리": "리튬",
    "캐리어": "휴대품", "짐": "휴대품", "늦게": "지연", "연착": "지연", "고장": "지연 운행",
    "표": "승차권", "교통카드": "승차권", "아이": "어린이", "애기": "유아", "노인": "경로",
}


def load_terms(path=TERMS_FILE):
    """약관 글을 조항 목록으로 나눕니다. 같은 번호가 두 번 나오면(목차 등) 더 긴 쪽을 남깁니다."""
    if not path.exists():
        return [], None
    text = path.read_text(encoding="utf-8-sig")
    base = BASE_DATE.search(text)
    appendix = APPENDIX.search(text)
    if appendix:
        text = text[: appendix.start()]
    marks = list(ARTICLE.finditer(text))
    found = {}
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        no = f"제{m.group(1)}조" + (f"의{m.group(2)}" if m.group(2) else "")
        body = re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", text[m.start(): end])).strip()
        if no not in found or len(body) > len(found[no]["content"]):
            found[no] = {"no": no, "title": m.group(3).strip(), "content": body,
                         "order": (int(m.group(1)), int(m.group(2) or 0))}
    articles = sorted(found.values(), key=lambda a: a["order"])
    return articles, base.group(1) if base else None


def grams(text):
    """글자 두 개씩 끊은 조각의 개수. 띄어쓰기와 기호는 빼고 셉니다."""
    s = re.sub(r"[^0-9A-Za-z가-힣]", "", text)
    return Counter(s[i: i + 2] for i in range(len(s) - 1))


ARTICLES, TERMS_BASE_DATE = load_terms()
# 찾기 준비: 조항마다 조각 개수(제목은 두 번 더해 무게를 줌)와, 조각마다 드문 정도(idf)
INDEX = [grams(a["title"] * 2 + a["content"]) for a in ARTICLES]
AVG_LEN = sum(sum(g.values()) for g in INDEX) / len(INDEX) if INDEX else 1
DF = Counter(g for doc in INDEX for g in doc)
IDF = {g: math.log(1 + (len(INDEX) - n + 0.5) / (n + 0.5)) for g, n in DF.items()}


REWRITE_RULES = """너는 서울교통공사 여객운송약관 검색 도우미다. [조항 제목]은 약관에 있는 조항 목록이다.
- [질문]이 묻는 상황을 약관에 쓰일 공식적인 낱말로 바꿔, 조항을 찾을 낱말 3~8개를 고른다. 예: 무임승차 → 부가운임, 승차권 / 강아지 → 동물 / 담배 → 흡연
- 조항 제목에 없는 말이라도 본문에 쓰일 말이면 넣는다. 규정 대부분은 제목이 아니라 본문 속 항목에 있다.
- 질문에 없는 상황을 지어내지 않는다. 약관과 관계없는 질문이면 빈 목록을 돌려준다.
- {"keywords": ["낱말"]} 모양의 JSON으로만 답한다."""
TITLES = ", ".join(f"{a['no']}({a['title']})" for a in ARTICLES)
REWRITES = {}           # 같은 질문은 AI를 다시 부르지 않도록 바꾼 낱말을 기억


def rewrite_query(question):
    """질문을 약관 용어 몇 개로 바꿉니다. AI를 쓸 수 없으면 빈 묶음을 돌려, 질문만으로 찾습니다."""
    if question in REWRITES:
        return REWRITES[question]
    try:
        reply = generate_json(REWRITE_RULES, f"[조항 제목]\n{TITLES}\n\n[질문]\n{question}", temperature=0)
        words = tuple(str(w).strip() for w in reply.get("keywords") or [] if str(w).strip())[:8]
    except Exception:
        return ()       # 실패는 기억하지 않음 (다음 질문에서 다시 시도)
    if len(REWRITES) > 500:
        REWRITES.clear()
    REWRITES[question] = words
    return words


def find_articles(question, keywords):
    """바꾼 낱말로 찾은 조항 3개에, 질문만으로 찾은 1위 조항을 더합니다(이미 있으면 3개 그대로).
    AI가 낱말을 엉뚱하게 바꿔도(예: 담배 → 휴대금지품) 질문 그대로 찾은 조항(흡연이 적힌 제6조)을 놓치지 않습니다."""
    hits = search_terms(question, keywords)
    if keywords:
        seen = {h["no"] for h in hits}
        hits += [a for a in search_terms(question, top=1) if a["no"] not in seen]
    return hits


def search_terms(question, keywords=(), top=TOP):
    """질문(+바꾼 낱말)과 가장 많이 겹치는 조항 top개. 겹치는 조각이 없으면 빈 목록입니다."""
    extra = " ".join(v for k, v in SYNONYMS.items() if k in question)
    query = grams(" ".join([question, extra, *keywords]))
    k1, b = 1.5, 0.75
    scored = []
    for article, doc in zip(ARTICLES, INDEX):
        length = sum(doc.values())
        score = 0.0
        for g in query:
            tf = doc.get(g, 0)
            if tf:
                score += IDF[g] * tf * (k1 + 1) / (tf + k1 * (1 - b + b * length / AVG_LEN))
        if score > 0:
            scored.append((score, article))
    scored.sort(key=lambda p: -p[0])
    return [{**a, "score": round(s, 2)} for s, a in scored[:top]]


RULES = """너는 서울 지하철 이용 규정 안내 도우미다. [조항]은 서울교통공사 여객운송약관에서 찾은 것이다.
- [조항]에 적힌 내용만 근거로 답한다. 금액, 배수, 시간, 크기, 무게 같은 숫자는 조항에 적힌 그대로만 쓴다.
- 답에 근거로 쓴 조항 번호를 articles에 넣는다. 항·호는 빼고 '제○조'만 쓴다. 예: ["제34조"]
- [질문] 아래의 약관 용어는 검색 도우미가 질문을 바꾼 것이다. 질문의 말이 조항과 달라도(무임승차·처벌·벌금 → 부가운임, 표 → 승차권) 조항이 그 상황을 다루면 found를 true로 하고 답한다.
- [조항]으로 답할 수 없는 질문이면 found를 false로 한다.
- 답은 한국어 존댓말 '~요' 체로, 세 문장 안에서 쓴다. 조항 번호는 답 문장에 쓰지 않는다(화면이 따로 보여 준다).
- {"found": true 또는 false, "answer": "답", "articles": ["제○조"]} 모양의 JSON으로만 답한다."""


ARTICLE_NO = re.compile(r"제\s*\d+\s*조(?:\s*의\s*\d+)?")
# 조항의 ①②③을 숫자로 읽어, AI가 "1항"처럼 써도 숫자 대조에서 걸리지 않게 합니다.
CIRCLED = str.maketrans({c: str(i) for i, c in enumerate("①②③④⑤⑥⑦⑧⑨⑩", 1)})


def article_out(a):
    return {"no": a["no"], "title": a["title"], "text": a["content"][:MAX_CHARS]}


def ask_terms(question):
    """질문을 약관 용어로 바꾸고, 조항을 찾아 그 조항으로만 답합니다. 찾은 조항이 없으면 답하는 AI를 부르지 않습니다."""
    keywords = rewrite_query(question)
    # 모든 답에 출처와 바꾼 낱말을 붙입니다. 화면은 낱말을 "약관 용어로 찾았어요"로 보여 줍니다.
    base = {"source": {"name": SOURCE, "base_date": TERMS_BASE_DATE}, "keywords": list(keywords)}
    hits = find_articles(question, keywords)
    if not hits:
        return {"found": False, "answer": NOT_FOUND, "articles": [], "checked": True, **base}
    prompt = "\n\n".join(f"[{a['no']}({a['title']})]\n{a['content'][:MAX_CHARS]}" for a in hits)
    words = f"\n(약관 용어: {', '.join(keywords)})" if keywords else ""
    reply = generate_json(RULES, f"[조항]\n{prompt}\n\n[질문]\n{question}{words}")
    answer = str(reply.get("answer") or "").strip()
    if not reply.get("found") or not answer:
        return {"found": False, "answer": NOT_FOUND, "articles": [], "checked": True, **base}
    # AI가 "제38조 제1항"처럼 적어도 조 번호만 뽑아 맞춥니다.
    cited = {re.sub(r"\s", "", no) for n in reply.get("articles") or [] for no in ARTICLE_NO.findall(str(n))}
    used = [a for a in hits if a["no"] in cited]
    # 확인: AI가 고른 조항이 찾은 조항 안에 있고, 답의 숫자가 그 조항에 모두 있어야 합니다.
    if not used or not grounded(answer, [{"content": a["content"][:MAX_CHARS].translate(CIRCLED)} for a in used], ""):
        # 걸러 낸 까닭을 서버 창에서 볼 수 있게 남깁니다(화면에는 보내지 않음).
        print(f"[이용 규정] 걸러 낸 답: {answer} | AI가 고른 조항: {reply.get('articles')} | 찾은 조항: {[a['no'] for a in hits]}")
        return {"found": True, "answer": CHECK_FAIL, "articles": [article_out(a) for a in hits[:2]], "checked": False, **base}
    return {"found": True, "answer": answer, "articles": [article_out(a) for a in used], "checked": True, **base}


def terms_info():
    """약관 파일을 잘 읽었는지 확인하는 용도. 조항 수와 처음·마지막 조항, 빠진 번호를 돌려줍니다."""
    nos = [a["order"][0] for a in ARTICLES if a["order"][1] == 0]
    missing = sorted(set(range(1, max(nos) + 1)) - set(nos)) if nos else []
    titles = [f"{a['no']}({a['title']})" for a in ARTICLES]
    return {"source": SOURCE, "file": "backend/data/terms.txt", "loaded": bool(ARTICLES), "base_date": TERMS_BASE_DATE,
            "articles": len(ARTICLES), "first": titles[:3], "last": titles[-3:], "missing_numbers": missing}
