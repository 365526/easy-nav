import { useState } from "react";
import { useApi, LoadState } from "../../api.jsx";
import LevelBadge, { LEVELS } from "../LevelBadge.jsx";

const DAYS = ["평일", "토요일", "일요일"];
// 30분 칸 39개: 5시30분부터 00시30분까지
const SLOTS = ["5시30분"];
for (let h = 6; h <= 23; h++) SLOTS.push(`${h}시00분`, `${h}시30분`);
SLOTS.push("00시00분", "00시30분");

export default function RankList() {
  const [slot, setSlot] = useState("8시30분");
  const [dayType, setDayType] = useState("평일");
  const { data, ...status } = useApi("/analysis/top-congested", { time_slot: slot, day_type: dayType, limit: 10 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 sm:flex-row sm:items-end md:p-6">
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-[#A9A6D6]">시간대</span>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            className="min-h-[44px] rounded-xl border border-[#2C2366] bg-[#0A0B1E] px-4 text-[16px] font-bold text-[#F2F4FF]"
          >
            {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-[#A9A6D6]">요일</span>
          <div className="flex gap-2">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={d === dayType}
                onClick={() => setDayType(d)}
                className={`min-h-[44px] rounded-full border px-4 text-[15px] font-bold ${
                  d === dayType ? "border-[#22E5FF] bg-[#22E5FF] text-[#0A0B1E]" : "border-[#2C2366] text-[#A9A6D6] hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <LoadState {...status} />

      {data && (
        <section className={`rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6 ${status.loading ? "opacity-50" : ""}`}>
          <h2 className="text-[20px] font-black">
            {dayType} {slot}, 가장 붐비는 역·방향 10곳
          </h2>
          {data.length === 0 ? (
            <p className="mt-3 text-[15px] text-[#A9A6D6]">이 시간에는 열차가 다니는 칸이 없습니다.</p>
          ) : (
            <ol className="mt-5 flex flex-col gap-4">
              {data.map((r, i) => (
                <li key={`${r.name}-${r.line}-${r.direction}`} className="grid grid-cols-[32px_1fr_auto] items-center gap-x-3 gap-y-2">
                  <span className="text-[18px] font-black tabular-nums text-[#22E5FF]">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="text-[17px] font-black">{r.name}</span>
                    <span className="ml-2 text-[14px] text-[#A9A6D6]">
                      {r.line} {r.direction}
                    </span>
                  </span>
                  <span className="text-right text-[17px] font-black tabular-nums">{r.congestion.toFixed(1)}%</span>
                  <span />
                  <span className="flex items-center gap-3">
                    {/* 막대 길이: 150%를 끝으로 잡아 시간대를 바꿔도 같은 눈금으로 비교합니다 */}
                    <span className="h-[10px] rounded-full" style={{ width: `${Math.min(r.congestion / 150, 1) * 100}%`, background: LEVELS[r.level - 1].color }} />
                  </span>
                  <LevelBadge lv={r.level} />
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
