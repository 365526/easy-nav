import json
import os

import requests
from dotenv import load_dotenv

load_dotenv()

params = {
    "serviceKey": os.environ["PUBLIC_DATA_API_KEY"],
    "dataType": "JSON",
    "dptreStn": "신도림",
    "arvlStn": "강남",
    "searchDt": "2026-10-08 09:30:00",
}

response = requests.get(os.environ["ROUTE_API_URL"], params=params, timeout=20)
data = response.json()
print("결과:", data["header"])

body = data["body"]
print("전체 소요시간(초):", body["totalReqHr"])
print("환승 횟수:", body["trsitNmtm"])
print("구간 수:", len(body["paths"]))

with open("data/route_sample.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("data/route_sample.json에 저장했습니다.")
