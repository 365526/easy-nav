import os
from datetime import date

import pandas as pd
import psycopg
from dotenv import load_dotenv

from congestion_level import to_level

load_dotenv()
BASE_DATE = date(2026, 6, 30)   # 혼잡도 파일의 기준일

long = pd.read_csv("data/congestion_long.csv", encoding="utf-8-sig")

# 30분 칸 순서: 원래 파일의 열 순서 그대로 (5시30분 = 0, ..., 00시30분 = 38)
order = {slot: i for i, slot in enumerate(dict.fromkeys(long["time_slot"]))}

# 역 목록: 역번호 하나에 이름이 둘이면 짧은 이름을 씁니다. (예: 2549 강동 / 강동(하남검단산))
stations = (long[["station_no", "line", "station_name"]].drop_duplicates()
            .assign(length=lambda d: d["station_name"].str.len())
            .sort_values(["station_no", "length"])
            .drop_duplicates("station_no"))

# 혼잡도 0은 그 시간·방향에 열차가 다니지 않는다는 뜻입니다(첫차 전, 막차 뒤, 종점 방향).
# "여유"로 잘못 보이지 않도록 넣지 않습니다. 역 목록은 위에서 미리 만들어 두어 빠지는 역이 없습니다.
running = long[long["congestion"] > 0]
print("운행 없음(0)으로 뺀 칸:", len(long) - len(running))

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        # 다시 실행해도 같은 결과가 되도록 먼저 비웁니다.
        cur.execute("truncate congestion_stats, stations")
        cur.executemany(
            "insert into stations (station_no, line, name) values (%s, %s, %s)",
            [(int(r.station_no), r.line, r.station_name) for r in stations.itertuples()])
        # 6만여 줄은 copy로 한 번에 보냅니다.
        with cur.copy("copy congestion_stats (station_no, day_type, direction, time_slot,"
                      " slot_order, congestion, level, base_date) from stdin") as copy:
            for r in running.itertuples():
                copy.write_row((int(r.station_no), r.day_type, r.direction, r.time_slot,
                                order[r.time_slot], float(r.congestion), to_level(r.congestion)[0], BASE_DATE))
        cur.execute("select count(*) from stations")
        print("stations:", cur.fetchone()[0])
        cur.execute("select count(*) from congestion_stats")
        print("congestion_stats:", cur.fetchone()[0])
