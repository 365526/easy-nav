# 혼잡도(%)를 5단계로 바꾸는 기준입니다. 기준을 바꿀 때는 이 표만 고칩니다.
LEVELS = [
    (34, 1, "여유"),
    (60, 2, "보통"),
    (90, 3, "약간 붐빔"),
    (120, 4, "혼잡"),
]


def to_level(percent):
    """혼잡도 퍼센트를 (단계, 이름)으로 바꿉니다."""
    for limit, level, name in LEVELS:
        if percent <= limit:
            return level, name
    return 5, "매우 혼잡"


if __name__ == "__main__":
    for value in (20, 57.2, 78.2, 102.6, 144.6):
        print(value, "->", to_level(value))
