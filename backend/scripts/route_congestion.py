import json

import pandas as pd

from congestion_level import to_level

DAY_TYPE = "평일"
# API의 방향 표기를 혼잡도 파일의 표기로 바꿉니다.
DIRECTION = {"상행": "상선", "하행": "하선", "내선": "내선", "외선": "외선"}
# 혼잡도 파일에서 번호가 따로 매겨진 곳입니다. 2호선 성수의 외선 값은 9001번(성수E)에 있습니다.
SPECIAL = {("2호선", 211, "외선"): 9001}

long = pd.read_csv("data/congestion_long.csv", encoding="utf-8-sig")
with open("data/route_sample.json", encoding="utf-8") as f:
    route = json.load(f)["body"]


def time_slot(clock):
    """'08:47:30' 같은 시각을 '8시30분' 같은 30분 칸 이름으로 바꿉니다."""
    hour, minute, _ = clock.split(":")
    hour_text = "00" if int(hour) == 0 else str(int(hour))
    return f"{hour_text}시{'30' if int(minute) >= 30 else '00'}분"


rows = []
for seg in route["paths"]:
    if seg["trsitYn"] == "Y":      # 환승 구간에는 혼잡도가 없습니다.
        continue
    station = seg["dptreStn"]
    slot = time_slot(seg["trainDptreTm"])
    direction = DIRECTION[seg["upbdnbSe"]]
    number = int(station["stnCd"])          # "0226" -> 226
    number = SPECIAL.get((station["lineNm"], number, direction), number)
    found = long[(long["day_type"] == DAY_TYPE)
                 & (long["line"] == station["lineNm"])
                 & (long["station_no"] == number)
                 & (long["direction"] == direction)
                 & (long["time_slot"] == slot)]
    if found.empty:
        print("혼잡도를 찾지 못한 구간:", station["stnNm"], slot)
        continue
    rows.append({"역": station["stnNm"], "호선": station["lineNm"],
                 "방향": seg["upbdnbSe"], "시간대": slot,
                 "초": seg["reqHr"], "혼잡도": float(found["congestion"].iloc[0])})

table = pd.DataFrame(rows)
print(table.to_string(index=False))

average = (table["혼잡도"] * table["초"]).sum() / table["초"].sum()
worst = table.loc[table["혼잡도"].idxmax()]

print()
print("평균 혼잡도: %.1f%%" % average, to_level(average))
print("가장 붐비는 역: %s %.1f%%" % (worst["역"], worst["혼잡도"]), to_level(worst["혼잡도"]))
