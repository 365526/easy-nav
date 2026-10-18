import os

import psycopg
from dotenv import load_dotenv

load_dotenv()

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    row = conn.execute("""
        select s.name, s.line, c.direction, c.time_slot, c.congestion::float, c.level
        from congestion_stats c join stations s on s.station_no = c.station_no
        where s.name = '사당' and s.line = '2호선' and c.day_type = '평일'
          and c.direction = '외선' and c.time_slot = '8시30분'
    """).fetchone()
    print("사당 확인:", row)

    print("평일 8시30분 가장 붐비는 곳 5:")
    for r in conn.execute("""
        select s.name, s.line, c.direction, c.congestion::float, c.level
        from congestion_stats c join stations s on s.station_no = c.station_no
        where c.day_type = '평일' and c.time_slot = '8시30분'
        order by c.congestion desc limit 5
    """):
        print("  ", r)
