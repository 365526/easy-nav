import pandas as pd

df = pd.read_csv("data/congestion.csv", encoding="cp949")

# 앞의 5칸은 그대로 두고, 시간대 39칸을 세로로 풉니다.
keep = ["구분", "호선", "역번호", "역명", "상하구분"]
time_cols = [c for c in df.columns if c not in keep]

long = df.melt(id_vars=keep, value_vars=time_cols,
               var_name="time_slot", value_name="congestion")

# 숫자 뒤의 공백을 지우고 숫자로 바꿉니다.
long["congestion"] = pd.to_numeric(long["congestion"].astype(str).str.strip())

long = long.rename(columns={
    "구분": "day_type", "호선": "line", "역번호": "station_no",
    "역명": "station_name", "상하구분": "direction",
})

long.to_csv("data/congestion_long.csv", index=False, encoding="utf-8-sig")
print("세로로 푼 행 수:", len(long))

check = long[(long["day_type"] == "평일") & (long["line"] == "2호선")
             & (long["station_name"] == "사당") & (long["direction"] == "외선")
             & (long["time_slot"] == "8시30분")]
print(check.to_string(index=False))
