# easy-nav API 설명 문서

- 서버: FastAPI (Render 배포)
- 기본 주소: `https://easy-nav-api.onrender.com`
- Swagger UI: 기본 주소 뒤에 `/docs` — 각 API를 화면에서 바로 실행해 볼 수 있습니다.
- 모든 API는 GET 요청이고 JSON으로 응답합니다.
- 공통 입력값 `day_type`: 평일, 토요일, 일요일 중 하나 (기본값 평일). 다른 값이면 400 오류입니다.

| API | 기능 |
|---|---|
| `GET /stations` | 역 검색 |
| `GET /congestion/{station_no}` | 역 하나의 30분 단위 혼잡도 |
| `GET /routes/congestion` | 경로 하나의 혼잡도 (평균·가장 붐비는 구간·5단계·계산 범위) |
| `GET /routes/recommend` | 빠른 길과 편한 길 비교 추천 (후보 경로 최대 3개, 출발 시각 비교 포함) |
| `GET /analysis/top-congested` | 가장 붐비는 역·방향 순위 |
| `GET /analysis/heatmap` | 역 × 시간대 혼잡도 표 |
| `GET /analysis/summary` | 자료 요약 (규모, 요일별·시간대별 평균, 단계 분포) |
| `GET /guide/search` | AI 안내 도우미의 근거 자료 찾기 (빠른하차정보·교통약자이용정보) |
| `GET /guide/ask` | AI 안내 도우미에게 묻기 (찾은 자료로만 답함) |
| `POST /guide/route` | AI 길잡이: 고른 경로의 출발·환승·도착역 안내를 한 번에 |

## GET /stations · 역 검색

역 이름에 검색어가 들어간 1~8호선 역을 20개까지 찾습니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| keyword | O | 역 이름 일부. 예: 사당 |

요청 예: `/stations?keyword=사당`

```json
[
  { "station_no": 226, "line": "2호선", "name": "사당" },
  { "station_no": 433, "line": "4호선", "name": "사당" }
]
```

## GET /congestion/{station_no} · 역 하나의 혼잡도

5시30분부터 00시30분까지 30분 칸의 혼잡도와 단계를 시간 순서로 돌려줍니다. 열차가 다니지 않는 칸(원본 값 0)은 빠집니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| station_no | O | 역번호 (주소 안에 넣음). 예: 226 |
| direction | O | 상선, 하선, 내선, 외선 |
| day_type | | 평일, 토요일, 일요일 |

요청 예: `/congestion/226?direction=외선&day_type=평일`

```json
[
  { "time_slot": "5시30분", "congestion": 88.3, "level": 3 },
  { "time_slot": "8시30분", "congestion": 144.6, "level": 5 }
]
```

해당 역·방향의 자료가 없으면 404입니다.

## GET /routes/congestion · 경로 하나의 혼잡도

최단경로 API로 가장 빠른 경로를 받고, 구간마다 그 구간을 지나는 시각의 30분 칸 혼잡도를 붙입니다. 평균은 구간 소요시간으로 가중한 값입니다. 같은 조건의 경로는 DB(route_cache)에 저장해 두었다가 다시 씁니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| from_station | O | 출발역 이름. 예: 신도림 |
| to_station | O | 도착역 이름. 예: 강남 |
| depart_time | O | 출발 일시. 예: 2026-10-22T08:30 |
| day_type | | 평일, 토요일, 일요일 |

요청 예: `/routes/congestion?from_station=신도림&to_station=강남&depart_time=2026-10-22T08:30`

```json
{
  "from": "신도림", "to": "강남", "depart_time": "2026-10-22T08:30:00", "day_type": "평일",
  "total_minutes": 27.0,
  "transfers": 0,
  "average": { "congestion": 102.6, "level": 4, "level_name": "혼잡" },
  "worst": { "station": "사당", "congestion": 144.6, "level": 5, "level_name": "매우 혼잡" },
  "segments": [
    { "station": "신도림", "line": "2호선", "direction": "외선", "time_slot": "8시30분",
      "seconds": 150, "congestion": 63.5, "level": 3, "level_name": "약간 붐빔" }
  ],
  "missing": []
}
```

- 환승 구간은 열차를 타지 않으므로 계산에서 뺍니다.
- `missing`에는 혼잡도 자료가 없는 구간(1~8호선 밖, 또는 열차가 다니지 않는 시간대)의 역 이름이 들어갑니다.
- 최단경로 API 호출에 실패하면 502, 혼잡도를 붙일 구간이 하나도 없으면 404입니다.

## GET /routes/recommend · 빠른 길과 편한 길 비교 추천

가장 빠른 경로를 받은 뒤, 그 경로에서 갈아타는 역과 붐비는 환승역을 하나씩 빼고(`exclTrfstns`) 다시 요청해 돌아가는 경로를 최대 2개 더 받습니다. 같은 경로가 다시 오면 하나만 남깁니다. 후보마다 점수를 매겨 낮은 순서(추천 순서)로 돌려줍니다.

돌아가는 경로가 혼잡도 자료가 없는 노선(9호선, 신분당선, 코레일 구간 등)으로 가면, 그 노선으로 갈아타는 역까지 쉼표로 더해(예: `사당,노량진`) 한 번 더 요청합니다. 자료가 더 많은 경로가 오면 그것으로 바꿉니다. 그래도 자료가 없는 후보는 버리지 않고 `average: null`로 알려 줍니다(워크북 7-1).

| 입력값 | 필수 | 설명 |
|---|---|---|
| from_station | O | 출발역 이름. 예: 신도림 |
| to_station | O | 도착역 이름. 예: 강남 |
| depart_time | O | 출발 일시. 예: 2026-10-22T08:30 |
| day_type | | 평일, 토요일, 일요일 |
| time_weight | | 시간 가중치 0~1 (기본값 0.5). 1에 가까울수록 시간을, 0에 가까울수록 덜 붐비는 것을 중시 |

요청 예: `/routes/recommend?from_station=신도림&to_station=강남&depart_time=2026-10-22T08:30`

```json
{
  "from": "신도림", "to": "강남", "depart_time": "2026-10-22T08:30:00", "day_type": "평일",
  "time_weight": 0.5,
  "candidates": [
    {
      "rank": 1, "tags": ["빠른 길"], "avoid": null, "score": 1.2, "coverage": 100, "no_data_lines": [],
      "total_minutes": 27.0, "transfers": 0, "transfer_stations": [], "lines": ["2호선"],
      "average": { "congestion": 102.6, "level": 4, "level_name": "혼잡" },
      "worst": { "station": "사당", "congestion": 144.6, "level": 5, "level_name": "매우 혼잡" },
      "vs_fastest": { "extra_minutes": 0.0, "congestion_down": 0.0, "level_down": 0 },
      "departures": [
        { "shift_minutes": -60, "depart": "07:30", "average": { "congestion": 92.2, "level": 4, "level_name": "혼잡" } },
        { "shift_minutes": 60, "depart": "09:30", "average": { "congestion": 57.2, "level": 2, "level_name": "보통" } }
      ],
      "legs": [ { "line": "2호선", "from": "신도림", "to": "강남", "minutes": 20, "average": { "congestion": 102.6, "level": 4, "level_name": "혼잡" } } ],
      "segments": [ "… /routes/congestion과 같은 모양" ],
      "missing": []
    },
    { "rank": 2, "tags": ["편한 길"], "avoid": "사당,노량진", "coverage": 90, "no_data_lines": ["신분당선"], "…": "…" }
  ]
}
```

- **점수** = 시간 가중치 × (소요 시간 ÷ 가장 짧은 소요 시간) + (1 − 시간 가중치) × (평균 혼잡도 ÷ 가장 낮은 평균 혼잡도). 가장 좋은 후보를 1로 놓고 몇 배인지 비교하므로, 점수가 낮을수록 좋습니다.
- `tags`: 가장 빠른 후보에 "빠른 길", 평균 혼잡도가 가장 낮은 후보에 "편한 길"이 붙습니다. 한 후보에 둘 다 붙으면 돌아가도 덜 붐비지 않는다는 뜻입니다.
- `avoid`: 이 후보를 만들 때 피한 역. 여러 개면 쉼표로 이어짐 (가장 빠른 길은 null)
- `coverage`: 열차를 타는 시간 중 혼잡도를 계산한 비율(%). `no_data_lines`: 혼잡도 자료가 없는 노선
- `legs`: 같은 노선끼리 묶은 구간 (노선, 타는 역, 내리는 역, 방향, 분, 평균 혼잡도). 방향(direction)은 상행·하행·내선·외선이고, prev(내리는 역 바로 앞 역)·next(타는 역 바로 다음 역)와 함께 `/guide/route`가 방면을 고를 때 씁니다. 자료가 없는 노선은 `average`가 null
- 혼잡도를 하나도 계산하지 못한 후보는 `average`, `worst`, `score`가 null이고 순위 맨 뒤에 옵니다. `vs_fastest`도 더 걸리는 분만 있습니다.
- `vs_fastest`: 가장 빠른 길보다 더 걸리는 분, 낮아진 평균 혼잡도(%p), 낮아진 단계 수. 음수면 오히려 더 붐빈다는 뜻입니다.
- `departures`: 같은 경로를 출발 시각만 1시간 전부터 1시간 뒤까지 30분 간격으로 옮겨 계산한 평균 혼잡도입니다. 실제 열차 시각은 조금 다를 수 있는 예상값이고, 자료가 없는 시간대는 `average`가 null입니다.
- 돌아가는 경로를 받지 못하면(그 역을 빼면 길이 없는 경우 등) 그 후보만 건너뜁니다. 후보가 하나뿐일 수도 있습니다.
- 처음 요청할 때는 최단경로 API를 최대 5번 부르므로 몇 초 걸립니다. 같은 조건은 DB에 저장된 응답을 씁니다.
- 빠른 길보다 25분 넘게 더 걸리는 후보는 뺍니다.

## GET /analysis/top-congested · 가장 붐비는 역·방향 순위

| 입력값 | 필수 | 설명 |
|---|---|---|
| time_slot | | 30분 칸 (기본값 8시30분) |
| day_type | | 평일, 토요일, 일요일 |
| limit | | 몇 개까지 (1~50, 기본값 10) |

요청 예: `/analysis/top-congested?time_slot=8시30분&limit=3`

```json
[
  { "name": "사당", "line": "2호선", "direction": "외선", "congestion": 144.6, "level": 5 },
  { "name": "방배", "line": "2호선", "direction": "외선", "congestion": 133.6, "level": 5 },
  { "name": "몽촌토성", "line": "8호선", "direction": "하선", "congestion": 132.1, "level": 5 }
]
```

## GET /analysis/heatmap · 역 × 시간대 혼잡도 표

한 호선·방향의 모든 역에 대해 30분 칸별 혼잡도를 표 모양으로 돌려줍니다. 분석 페이지의 히트맵에 씁니다. 열차가 다니지 않는 칸은 `null`입니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| line | | 호선 (기본값 2호선) |
| direction | | 상선, 하선, 내선, 외선 (기본값 외선) |
| day_type | | 평일, 토요일, 일요일 |

요청 예: `/analysis/heatmap?line=2호선&direction=외선`

```json
{
  "line": "2호선", "direction": "외선", "day_type": "평일",
  "time_slots": ["5시30분", "6시00분", "…", "00시30분"],
  "stations": [
    { "station_no": 201, "name": "시청", "values": [10.1, 20.2, "… 39개"] }
  ]
}
```

## GET /analysis/summary · 자료 요약

분석 페이지의 데이터 소개 탭에 씁니다. 자료 규모, 요일별 하루 평균과 최고값, 시간대별 평균, 한 시간대의 단계별 역·방향 수를 돌려줍니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| day_type | | 평일, 토요일, 일요일 (시간대별 평균과 단계 분포에 적용) |
| time_slot | | 단계 분포를 볼 30분 칸 (기본값 8시30분) |

요청 예: `/analysis/summary`

```json
{
  "rows": 61476, "stations": 282, "base_date": "2026-06-30",
  "day_types": [
    { "day_type": "평일", "average": 32.8, "max": 144.6 },
    { "day_type": "토요일", "average": 31.6, "max": 104.0 },
    { "day_type": "일요일", "average": 22.4, "max": 81.2 }
  ],
  "time_slots": [ { "time_slot": "5시30분", "average": 21.3, "level": 1, "level_name": "여유" }, "… 39개" ],
  "levels": { "day_type": "평일", "time_slot": "8시30분",
              "counts": [ { "level": 1, "count": 235 }, "…", { "level": 5, "count": 11 } ] }
}
```

## GET /guide/search · 안내 도우미 근거 자료 찾기

질문에서 역 이름과 궁금한 것을 골라, DB(guide_docs)에 넣어 둔 공공데이터 중 그 역의 자료를 20줄까지 찾습니다. AI 안내 도우미가 답할 때 근거로 쓰는 자료입니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| question | O | 질문 (100자까지). 예: 강남역 엘리베이터 위치 |
| station | | 질문에 역 이름이 없을 때 쓸 역. 예: 경로 찾기의 도착역 |

- 질문에 엘리베이터·휠체어·유모차 같은 낱말이 있으면 교통약자이용정보(엘리베이터)와, 빠른하차정보 중 엘리베이터와 가까운 칸을 찾습니다.
- 칸·내리다·계단·출구·환승 같은 낱말이 있으면 빠른하차정보를 찾습니다. 둘 다 없으면 두 자료를 모두 찾습니다.
- 역 이름을 찾지 못하면 docs가 빈 목록입니다.

요청 예: `/guide/search?question=강남역 엘리베이터 위치`

```json
{
  "stations": ["강남"],
  "sources": ["교통약자이용정보", "빠른하차정보"],
  "docs": [
    { "source": "교통약자이용정보", "line": "2호선", "station": "강남",
      "content": "2호선 강남역 엘리베이터 …: … 출입구 …", "base_date": "…" },
    "…"
  ]
}
```

## GET /guide/ask · 안내 도우미에게 묻기

`/guide/search`와 같은 방법으로 자료를 찾은 뒤, 찾은 자료 문장만 AI에게 넘겨 두 문장 안으로 답합니다. 자료에 없는 내용은 지어내지 말고, 자료로 답할 수 없으면 found를 false로 하라고 지시합니다.

| 입력값 | 필수 | 설명 |
|---|---|---|
| question | O | 질문 (100자까지) |
| station | | 질문에 역 이름이 없을 때 쓸 역 (경로 찾기 화면은 도착역을 넘김) |

- 찾은 자료가 없으면 AI를 부르지 않고 바로 `found: false`로 답합니다.
- sources는 답의 근거가 된 자료 이름과 기준일입니다. 화면은 이것을 "근거: …"로 보여 줍니다.
- 서버 환경 변수 `LLM_API_KEY`(AI 인증키)가 필요합니다. `LLM_MODEL`로 모델을 바꿀 수 있습니다.

요청 예: `/guide/ask?question=강남역 엘리베이터 위치`

```json
{
  "found": true,
  "answer": "강남역 엘리베이터는 …번 출입구 … 있어요.",
  "stations": ["강남"],
  "sources": [
    { "name": "서울교통공사 교통약자이용정보", "base_date": "…" },
    { "name": "서울교통공사 빠른하차정보", "base_date": "…" }
  ]
}
```

못 찾았을 때:

```json
{ "found": false, "answer": "안내를 찾지 못했어요. 역 이름과 함께 엘리베이터 위치나 빨리 내리는 칸을 물어봐 주세요.", "stations": [], "sources": [] }
```

## POST /guide/route · AI 길잡이 (경로 전체 안내)

고른 경로의 출발·환승·도착역마다 근거 자료를 모아, 그 자료로만 역별 안내를 한 줄씩 만듭니다. 역마다 따로 찾아봐야 하는 정보를 한 번에 모아 주는 것이 목적입니다.

| 입력값 (JSON 본문) | 필수 | 설명 |
|---|---|---|
| legs | O | `/routes/recommend` 후보의 `legs`를 그대로 넣습니다. 칸마다 line, from, to, direction, prev, next (다른 값은 무시) |
| mode | | `fast`: 빨리 갈아타기 (기본값) · `easy`: 휠체어·유모차 |

- 빠른하차정보는 타고 온 노선, 그중 방향(direction)이 같은 줄을 고릅니다. 2호선은 경로의 외선·내선을 자료의 상행·하행으로 바꿔 비교합니다. 표기를 비교할 수 없으면 앞 역(prev) 방면 줄(반대로 가는 열차)을 뺍니다.
- 역 이름이 다른 곳은 함께 찾습니다. 예: 4호선 이수 = 자료의 총신대입구
- 같은 경로는 같은 안내가 나오도록 AI 온도(temperature)를 0으로 둡니다. 빨리 갈아타기의 출발역 안내에 칸-문 번호가 없으면 자료 원문으로 바꿉니다.
- `easy`는 교통약자이용정보(엘리베이터)에서 타고 온 노선과 갈아탈 노선의 줄, 빠른하차정보 중 엘리베이터와 가까운 칸을 고릅니다.
- `fast`의 출발역에는 다음 역의 자료를 넘겨, 어느 칸에 타면 빨리 내릴 수 있는지 안내합니다.
- 안내 문장의 숫자(칸-문, 출입구 등)가 그 역 자료에 없으면 그 문장을 버리고(`tip`: null) 자료 원문(`facts`)만 돌려줍니다. 버린 개수는 `dropped`입니다.
- 모든 역에 자료가 없으면 AI를 부르지 않습니다.

요청 예:

```json
{ "mode": "fast", "legs": [ { "line": "2호선", "from": "신도림", "to": "대림", "direction": "…" }, { "line": "7호선", "from": "대림", "to": "논현", "direction": "…" } ] }
```

응답 예:

```json
{
  "mode": "fast", "mode_name": "빨리 갈아타기",
  "summary": "…",
  "stops": [
    { "kind": "출발", "station": "신도림", "line": "2호선", "next_line": null, "tip": "…", "facts": ["…"] },
    { "kind": "환승", "station": "대림", "line": "2호선", "next_line": "7호선", "tip": null, "facts": ["…"] },
    { "kind": "도착", "station": "논현", "line": "7호선", "next_line": null, "tip": "…", "facts": ["…"] }
  ],
  "dropped": 1,
  "sources": [ { "name": "서울교통공사 빠른하차정보", "base_date": "…" } ]
}
```

## 오류 응답

| 상태 코드 | 뜻 |
|---|---|
| 400 | day_type 값이 잘못됨 |
| 404 | 찾는 자료가 없음 |
| 422 | 필수 입력값이 빠졌거나 형식이 틀림 (FastAPI가 자동으로 알려 줌) |
| 502 | 최단경로 API 호출 실패 (가장 빠른 경로를 받지 못한 경우) |
| 503 | AI를 쓸 수 없음 (인증키 없음, 사용 한도 초과, 연결 실패) · `/guide/ask`, `/guide/route`만 해당 |
