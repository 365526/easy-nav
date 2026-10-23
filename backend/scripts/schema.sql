-- easy-nav 데이터베이스 테이블 (워크북 3, route_cache의 excl_stn은 워크북 6에서 추가)
-- Supabase의 SQL Editor에 통째로 붙여 넣고 Run을 누릅니다. 여러 번 실행해도 이미 있는 테이블은 건너뜁니다.

-- 1) 역: 혼잡도 파일의 역번호가 기본키입니다. 9000번대는 지선·특수 승강장입니다(예: 9001 성수E).
create table if not exists stations (
  station_no  integer primary key,
  line        text    not null,
  name        text    not null
);

-- 2) 혼잡도 통계: 역 × 요일 × 방향 × 30분 칸마다 한 줄 (열차가 다니는 칸만, 61,476줄)
create table if not exists congestion_stats (
  id          bigint generated always as identity primary key,
  station_no  integer      not null references stations (station_no),
  day_type    text         not null check (day_type in ('평일', '토요일', '일요일')),
  direction   text         not null check (direction in ('상선', '하선', '내선', '외선')),
  time_slot   text         not null,
  slot_order  smallint     not null,
  congestion  numeric(5,1) not null check (congestion > 0),
  level       smallint     not null check (level between 1 and 5),
  base_date   date         not null,
  unique (station_no, day_type, direction, time_slot)
);
create index if not exists congestion_by_time on congestion_stats (day_type, time_slot);

-- 3) 경로 응답 저장: 같은 조건으로 최단경로 API를 다시 부르지 않도록 응답을 그대로 저장합니다.
--    excl_stn은 돌아가는 경로를 받을 때 피한 역입니다. 가장 빠른 경로는 빈칸('')입니다.
create table if not exists route_cache (
  id           bigint generated always as identity primary key,
  dptre_stn    text        not null,
  arvl_stn     text        not null,
  search_dt    timestamp   not null,
  search_type  text        not null default 'duration',
  excl_stn     text        not null default '',
  response     jsonb       not null,
  created_at   timestamptz not null default now(),
  constraint route_cache_condition_key unique (dptre_stn, arvl_stn, search_dt, search_type, excl_stn)
);

-- 바깥에서 Supabase 공개 주소로 표를 읽고 쓰지 못하게 막습니다. 우리 서버는 DATABASE_URL로 접속하므로 영향이 없습니다.
alter table stations         enable row level security;
alter table congestion_stats enable row level security;
alter table route_cache      enable row level security;

-- 4) AI 안내 도우미의 근거 자료 (워크북 8): 공공데이터 API 한 줄마다 사람이 읽는 문장(content)과 원본(raw)을 함께 저장합니다.
--    source는 자료 이름입니다. 답에 "근거: 서울교통공사 빠른하차정보"처럼 그대로 보여 줍니다.
create table if not exists guide_docs (
  id         bigint generated always as identity primary key,
  source     text        not null check (source in ('빠른하차정보', '교통약자이용정보')),
  line       text        not null,
  station    text        not null,
  content    text        not null,
  raw        jsonb       not null,
  base_date  date,
  loaded_at  timestamptz not null default now()
);
create index if not exists guide_docs_by_station on guide_docs (station);
alter table guide_docs enable row level security;
