import { useApi, LoadState } from "../../api.jsx";
import { LEVELS } from "../LevelBadge.jsx";

const card = "rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6";

// 사용한 자료와 출처
const SOURCES = [
  { name: "지하철혼잡도정보", org: "서울교통공사", type: "CSV 파일", use: "역·방향·요일별 30분 단위 혼잡도", url: "https://www.data.go.kr/data/15071311/fileData.do" },
  { name: "최단경로이동정보", org: "서울교통공사", type: "Open API", use: "경로와 구간별 열차 출발 시각", url: "https://www.data.go.kr/data/15143842/openapi.do" },
];

// 정제한 내용
const CLEANING = [
  ["30분 단위 39칸을 세로로 풀었습니다.", "1,671행이 65,169칸이 됩니다."],
  ["숫자 뒤에 섞인 공백을 지우고 숫자로 바꿨습니다.", ""],
  ["혼잡도가 0인 3,693칸은 뺐습니다.", "첫차 전, 막차 뒤처럼 열차가 다니지 않는 칸이라 그대로 두면 \"여유\"로 잘못 보입니다."],
];

// 막대 아래에 시각을 적을 칸: 6시부터 3시간마다
const TICKS = ["6시00분", "9시00분", "12시00분", "15시00분", "18시00분", "21시00분", "00시00분"];
const pct = (v) => `${Number(v).toFixed(1)}%`;
const short = (slot) => slot.replace("시00분", "시").replace("시30분", ":30").replace(/^00/, "0");

export default function DataIntro() {
  const { data, ...status } = useApi("/analysis/summary");
  if (!data) return <LoadState {...status} />;

  const maxAverage = Math.max(...data.time_slots.map((s) => s.average));
  const peaks = [...data.time_slots].sort((a, b) => b.average - a.average).slice(0, 2);
  const total = data.levels.counts.reduce((sum, c) => sum + c.count, 0);
  const crowded = data.levels.counts.filter((c) => c.level >= 4).reduce((sum, c) => sum + c.count, 0);
  const maxDay = Math.max(...data.day_types.map((d) => d.average));

  return (
    <div className="flex flex-col gap-6">
      {/* 자료 규모 */}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["역", `${data.stations}곳`, "1~8호선, 지선 승강장 포함"],
          ["혼잡도 기록", `${data.rows.toLocaleString()}칸`, "역 × 방향 × 요일 × 시간대"],
          ["시간 단위", "30분", "5시30분부터 00시30분까지 39칸"],
          ["자료 기준일", data.base_date, "분기마다 갱신되는 평균 통계"],
        ].map(([label, value, note]) => (
          <li key={label} className={card}>
            <p className="text-[14px] font-bold text-[#A9A6D6]">{label}</p>
            <p className="mt-2 whitespace-nowrap text-[22px] font-black leading-tight tabular-nums sm:text-[28px] md:text-[32px]">{value}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#A9A6D6]">{note}</p>
          </li>
        ))}
      </ul>

      {/* 평일 시간대별 평균 */}
      <section className={card}>
        <h2 className="text-[20px] font-black">평일 시간대별 평균 혼잡도</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">
          모든 역과 방향을 평균한 값입니다.
          <br />
          가장 붐비는 시간은 {peaks.map((p) => `${p.time_slot} ${pct(p.average)}`).join(", ")}입니다.
        </p>
        <div className="mt-6 flex h-[180px] items-end gap-[2px]" role="img" aria-label={`평일 시간대별 평균 혼잡도 막대그래프. 가장 높은 시간은 ${peaks[0].time_slot} ${pct(peaks[0].average)}`}>
          {data.time_slots.map((s) => (
            <span
              key={s.time_slot}
              title={`${s.time_slot} ${pct(s.average)} (${s.level}단계 ${s.level_name})`}
              className="flex-1 rounded-t-[3px]"
              style={{ height: `${(s.average / maxAverage) * 100}%`, background: LEVELS[s.level - 1].color, opacity: peaks.includes(s) ? 1 : 0.6 }}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-[2px]" aria-hidden="true">
          {data.time_slots.map((s) => (
            <span key={s.time_slot} className="flex flex-1 justify-center overflow-visible">
              {TICKS.includes(s.time_slot) && <span className="whitespace-nowrap text-[12px] text-[#A9A6D6]">{short(s.time_slot)}</span>}
            </span>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 요일별 비교 */}
        <section className={card}>
          <h2 className="text-[20px] font-black">요일별 하루 평균</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">하루 전체를 평균한 값과 가장 붐비는 칸입니다.</p>
          <ul className="mt-5 flex flex-col gap-4">
            {data.day_types.map((d) => (
              <li key={d.day_type} className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
                <span className="text-[15px] font-bold">{d.day_type}</span>
                <span className="h-[14px] rounded-full bg-[#22E5FF]" style={{ width: `${(d.average / maxDay) * 100}%` }} />
                <span className="text-right text-[15px] tabular-nums">
                  {pct(d.average)}<span className="ml-2 text-[13px] text-[#A9A6D6]">최고 {pct(d.max)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 단계 분포 */}
        <section className={card}>
          <h2 className="text-[20px] font-black">평일 {data.levels.time_slot}, 단계별 역·방향 수</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">
            혼잡(4단계) 이상은 {total}곳 중 {crowded}곳({((crowded / total) * 100).toFixed(1)}%)입니다.
            <br />
            붐비는 구간만 피해도 훨씬 편해질 수 있습니다.
          </p>
          <div className="mt-5 flex h-[14px] overflow-hidden rounded-full" role="img" aria-label="단계별 비율 막대">
            {data.levels.counts.map((c) => (
              <span key={c.level} style={{ width: `${(c.count / total) * 100}%`, background: LEVELS[c.level - 1].color }} />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {data.levels.counts.map((c) => (
              <li key={c.level} className="flex items-center gap-2 text-[14px]">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: LEVELS[c.level - 1].color }} />
                {LEVELS[c.level - 1].name} <span className="tabular-nums text-[#A9A6D6]">{c.count}곳</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 출처와 정제 */}
      <div className="grid gap-6 md:grid-cols-2">
        <section className={card}>
          <h2 className="text-[20px] font-black">사용한 자료와 출처</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[16px] font-bold text-[#22E5FF] underline-offset-4 hover:underline">
                  {s.name}
                </a>
                <p className="mt-1 text-[14px] leading-relaxed text-[#A9A6D6]">
                  {s.org} · {s.type} · {s.use}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="text-[20px] font-black">이렇게 정리했습니다</h2>
          <ol className="mt-4 flex flex-col gap-3">
            {CLEANING.map(([what, why], i) => (
              <li key={what} className="grid grid-cols-[28px_1fr] gap-2 text-[15px] leading-relaxed">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#22E5FF] text-[14px] font-black text-[#0A0B1E]">{i + 1}</span>
                <span>
                  {what}
                  {why && <span className="block text-[14px] text-[#A9A6D6]">{why}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
