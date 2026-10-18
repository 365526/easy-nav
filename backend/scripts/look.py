import pandas as pd

df = pd.read_csv("data/congestion.csv", encoding="cp949")

print("행과 열:", df.shape)
print("앞의 열 이름:", df.columns[:6].tolist())
print("마지막 열 이름:", df.columns[-1])
print("요일 구분:", df["구분"].unique().tolist())
print("방향:", df["상하구분"].unique().tolist())
print(df.iloc[0, :8])
