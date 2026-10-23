// 홈 화면에 쓰는 내용: 숫자와 문구를 바꿀 때는 이 파일만 고칩니다.

// 1. 실제 데이터 한 장면 (서울교통공사 지하철혼잡도정보, 평일)
export const DATA_FACT = {
  value: 144.6,
  label: "평일 8시 30분 · 2호선 사당역 외선",
  note: "이 자료 전체에서 가장 높은 값입니다. 정원의 1.4배 넘게 탄 셈입니다.",
};

// 2. 바로 만져 보는 예시: 신도림 → 강남, 2호선 외선, 평일, 구간 소요시간으로 가중한 평균 혼잡도
export const DEMO = {
  from: "신도림",
  to: "강남",
  minutes: 27,
  times: [
    { time: "7:30", value: 92.2 },
    { time: "8:00", value: 98.3 },
    { time: "8:30", value: 102.6 },
    { time: "9:00", value: 91.0 },
    { time: "9:30", value: 57.2 },
  ],
};

// 5. 로드맵: status는 done(완료) · now(진행 중) · next(예정)
export const ROADMAP = [
  { status: "done", title: "소개 사이트, 홍보 쇼릴과 게임" },
  { status: "done", title: "혼잡도 정리와 5단계 계산" },
  { status: "done", title: "혼잡도 분석 페이지" },
  { status: "done", title: "경로 추천 서버와 경로 찾기 화면" },
  { status: "done", title: "AI 안내 도우미 (공공데이터 근거 답변)" },
  { status: "next", title: "지연·무정차 알림" },
];

// 7. 의견 받는 주소: 구글 설문 링크 등을 따옴표 안에 붙여 넣습니다. 비워 두면 버튼 대신 안내 문구가 나옵니다.
export const FEEDBACK_URL = "";
