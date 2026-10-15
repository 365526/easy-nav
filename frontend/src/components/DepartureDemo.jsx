import { useState } from "react";
import LevelBadge, { LEVELS, People } from "./LevelBadge.jsx";
import { DEMO } from "../data/site.js";

const toLevel = (v) => (v <= 34 ? 1 : v <= 60 ? 2 : v <= 90 ? 3 : v <= 120 ? 4 : 5);

// 출발 시각 슬라이더를 움직이면 같은 길의 혼잡도 단계가 바뀌는 예시
export default function DepartureDemo() {
  const [i, setI] = useState(2);
  const now = DEMO.times[i];
  const lv = toLevel(now.value);
  const color = LEVELS[lv - 1].color;
  return (
    <div className="grid gap-6 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6 md:grid-cols-2 md:p-8">
      <div className="flex flex-col justify-between gap-6">
        <div>
          <p className="text-[15px] font-bold text-[#A9A6D6]">
            {DEMO.from} → {DEMO.to} · 2호선 · 약 {DEMO.minutes}분
          </p>
          <p className="mt-3 text-[56px] font-black leading-none tabular-nums" style={{ color }}>{now.value.toFixed(1)}%</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <LevelBadge lv={lv} />
            <People n={lv} size={16} />
          </div>
        </div>
        <label className="flex flex-col gap-3">
          <span className="text-[15px] font-bold">출발 시각 {now.time}</span>
          <input
            type="range" min="0" max={DEMO.times.length - 1} step="1" value={i}
            onChange={(e) => setI(Number(e.target.value))}
            className="h-[44px] w-full cursor-pointer accent-[#22E5FF]"
            aria-valuetext={`${now.time} 출발, ${lv}단계`}
          />
          <span className="flex justify-between text-[13px] text-[#A9A6D6]">
            {DEMO.times.map((t) => <span key={t.time}>{t.time}</span>)}
          </span>
        </label>
      </div>
      <div className="flex items-end gap-3">
        {DEMO.times.map((t, k) => {
          const l = toLevel(t.value);
          return (
            <button key={t.time} type="button" onClick={() => setI(k)} aria-label={`${t.time} 출발 보기`} className="flex min-h-[44px] flex-1 flex-col items-center justify-end gap-2">
              <span className="w-full rounded-t-lg transition-all"
                style={{ height: `${(t.value / 150) * 220}px`, background: LEVELS[l - 1].color, opacity: k === i ? 1 : 0.35 }} />
              <span className="text-[13px] font-bold" style={{ color: k === i ? "#F2F4FF" : "#A9A6D6" }}>{t.time}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[14px] text-[#A9A6D6] md:col-span-2">
        같은 길도 한 시간 늦게 나서면 4단계에서 2단계로 내려갑니다. 평일 평균 통계로 계산한 예시입니다.
      </p>
    </div>
  );
}
