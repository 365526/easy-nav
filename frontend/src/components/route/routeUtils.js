// 경로 찾기 화면에서 쓰는 계산 도구

export const DAYS = ["평일", "토요일", "일요일"];

// 노선 색 (서울 지하철 공식 색). 1~8호선 밖은 회색입니다.
const LINE_COLORS = {
  "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE",
  "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C",
};
export const lineColor = (line) => LINE_COLORS[line] || "#8A86B8";

// 혼잡도(%) → 5단계 (backend의 congestion_level.py와 같은 기준)
export const toLevel = (v) => (v <= 34 ? 1 : v <= 60 ? 2 : v <= 90 ? 3 : v <= 120 ? 4 : 5);

// 받침이 있으면 "을", 없으면 "를"을 붙입니다. 예: 사당을, 교대를
export function objectJosa(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? "을" : "를");
}

// 고른 요일 구분에 맞는 가장 가까운 날짜(오늘 포함)를 "2026-10-22"처럼 만듭니다.
// 최단경로 API는 날짜별 시간표로 경로를 찾기 때문에, 평일이면 평일 날짜를 넣어야 합니다.
export function nextDate(dayType, from = new Date()) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const w = d.getDay();
    const match = dayType === "토요일" ? w === 6 : dayType === "일요일" ? w === 0 : w >= 1 && w <= 5;
    if (match) {
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
  }
  return "";
}

// "08:30"에 분을 더해 "08:57"처럼 돌려줍니다.
export function addMinutes(clock, minutes) {
  const [h, m] = clock.split(":").map(Number);
  const total = (((h * 60 + m + Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// 슬라이더를 움직일 때 서버에 다시 묻지 않고 화면에서 점수를 다시 매깁니다.
// 서버(route_logic.py의 rank_routes)와 같은 식입니다.
//   점수 = 시간 가중치 × (소요 시간 ÷ 가장 짧은 소요 시간) + (1 − 시간 가중치) × (평균 혼잡도 ÷ 가장 낮은 평균 혼잡도)
// 혼잡도 자료가 없는 후보(average: null)는 점수를 매기지 않고 맨 뒤에 둡니다.
export function rerank(candidates, timeWeight) {
  const scored = candidates.filter((c) => c.average);
  const unscored = candidates.filter((c) => !c.average);
  const bestMinutes = Math.min(...scored.map((c) => c.total_minutes));
  const bestCongestion = Math.min(...scored.map((c) => c.average.congestion));
  const withScore = scored
    .map((c) => ({
      ...c,
      key: c.avoid ?? "fastest",
      score: timeWeight * (c.total_minutes / bestMinutes) + (1 - timeWeight) * (c.average.congestion / bestCongestion),
    }))
    .sort((a, b) => a.score - b.score);
  return [...withScore, ...unscored.map((c) => ({ ...c, key: c.avoid ?? "fastest", score: null }))];
}
