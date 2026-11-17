"""직접 질문을 어디서 찾을지 고릅니다 (워크북 11). station: 역 안내 · terms: 이용 규정 · choose: 사용자에게 묻기
AI를 부르지 않고 낱말로만 정해서 빠르고, 같은 질문이면 언제나 같은 쪽으로 갑니다."""
from guide import ELEVATOR_WORDS, EXIT_WORDS
from terms import SYNONYMS

# 역 시설을 묻는 말: 역 안내 검색이 쓰는 낱말(엘리베이터, 칸, 출구 …)에 몇 개를 더합니다.
# 환승은 뺍니다. "환승 몇 번까지 돼?"처럼 요금 규칙을 묻는 일이 많고, 갈아타는 곳은 "갈아"·"칸"으로 잡힙니다.
STATION_WORDS = tuple(w for w in ELEVATOR_WORDS + EXIT_WORDS if w != "환승") + ("화장실", "수유실", "보관함", "위치")
# 타는 규칙을 묻는 말: 이용 규정의 자주 쓰는 말 목록에 약관 낱말을 더합니다.
TERMS_WORDS = tuple(SYNONYMS) + ("규정", "약관", "운임", "승차권", "정기권", "할인", "어린이", "청소년", "단체",
                                 "자전거", "따릉이", "동물", "흡연", "담배", "음식", "분실", "잃어버", "반환", "금지")
CHOOSE = "역 시설(엘리베이터·내리는 칸)이 궁금한지, 지하철 타는 규칙(요금·짐·반려동물)이 궁금한지 골라 주세요."


def pick_topic(question):
    """역 시설 낱말만 있으면 역 안내, 두 쪽 낱말이 다 있으면 사용자에게 묻고, 나머지는 이용 규정에서 찾습니다.
    역 안내는 엘리베이터·내리는 칸 자료만 있어서, 시설 낱말이 없는 질문은 이용 규정이 더 잘 답합니다."""
    station = any(w in question for w in STATION_WORDS)
    terms = any(w in question for w in TERMS_WORDS)
    if station and terms:
        return "choose"
    return "station" if station else "terms"
