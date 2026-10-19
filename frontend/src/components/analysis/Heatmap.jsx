import { useState } from "react";
import { useApi, LoadState } from "../../api.jsx";
import { LEVELS } from "../LevelBadge.jsx";

const LINES = ["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선"];
const DAYS = ["평일", "토요일", "일요일"];
// 2호선은 순환선이라 내선·외선, 나머지는 상선·하선
const directionsOf = (line) => (line === "2호선" ? ["외선", "내선"] : ["상선", "하선"]);
const toLevel = (v) => (v <= 34 ? 1 : v <= 60 ? 2 : v <= 90 ? 3 : v <= 120 ? 4 : 5);
const EMPTY = "#1E1A44"; // 열차가 다니지 않는 칸
// 표 위쪽에 시각을 적을 칸: 6시부터 3시간마다
const TICKS = ["6시00분", "9시00분", "12시00분", "15시00분", "18시00분", "21시00분", "00시00분"];
const short = (slot) => slot.replace("시00분", "시").replace(/^00/, "0");

// 여러 개 중 하나를 고르는 버튼 묶음
function Choice({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-bold text-[#A9A6D6]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === value}
            onClick={() => onChange(o)}
            className={`min-h-[44px] rounded-full border px-4 text-[15px] font-bold ${
              o === value ? "border-[#22E5FF] bg-[#22E5FF] text-[#0A0B1E]" : "border-[#2C2366] text-[#A9A6D6] hover:text-white"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Heatmap() {
  const [line, setLine] = useState("2호선");
  const [direction, setDirection] = useState("외선");
  const [dayType, setDayType] = useState("평일");
  const [picked, setPicked] = useState(null);
  const { data, ...status } = useApi("/analysis/heatmap", { line, direction, day_type: dayType });

  const changeLine = (next) => {
    setLine(next);
    setDirection(directionsOf(next)[0]);
    setPicked(null);
  };

  // 가장 붐비는 칸 찾기
  let top = null;
  data?.stations.forEach((s) =>
    s.values.forEach((v, i) => {
      if (v !== null && (!top || v > top.value)) top = { name: s.name, slot: data.time_slots[i], value: v };
    }),
  );
  const shown = picked || top;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6">
        <Choice label="호선" options={LINES} value={line} onChange={changeLine} />
        <div className="flex flex-wrap gap-x-8 gap-y-5">
          <Choice label="방향" options={directionsOf(line)} value={direction} onChange={(d) => { setDirection(d); setPicked(null); }} />
          <Choice label="요일" options={DAYS} value={dayType} onChange={(d) => { setDayType(d); setPicked(null); }} />
        </div>
      </div>

      <LoadState {...status} />

      {data && (
        <section className={`rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6 ${status.loading ? "opacity-50" : ""}`}>
          <h2 className="text-[20px] font-black">
            {data.line} {data.direction} · {data.day_type}
          </h2>
          {shown && (
            <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">
              {picked ? "고른 칸" : "가장 붐비는 칸"}: <strong className="text-[#F2F4FF]">{shown.name} {shown.slot}</strong>{" "}
              {shown.value === null ? "열차 운행 없음" : `${shown.value.toFixed(1)}% · ${toLevel(shown.value)}단계 ${LEVELS[toLevel(shown.value) - 1].name}`}
              <br />
              칸을 누르면 그 역과 시간의 값을 볼 수 있습니다.
            </p>
          )}

          {/* 범례 */}
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
            {LEVELS.map((l) => (
              <li key={l.lv} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-[3px]" style={{ background: l.color }} />
                {l.lv} {l.name}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px]" style={{ background: EMPTY }} />
              운행 없음
            </li>
          </ul>

          {/* 표: 좁은 화면에서는 옆으로 밀어서 봅니다 */}
          <div className="mt-4 overflow-x-auto pb-2">
            <div
              className="grid min-w-[640px] gap-[2px]"
              style={{ gridTemplateColumns: `88px repeat(${data.time_slots.length}, minmax(13px, 1fr))` }}
            >
              <span />
              {data.time_slots.map((t) => (
                <span key={t} className="relative h-5">
                  {TICKS.includes(t) && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] text-[#A9A6D6]">{short(t)}</span>}
                </span>
              ))}
              {data.stations.map((s) => (
                <Row key={s.station_no} station={s} slots={data.time_slots} onPick={setPicked} />
              ))}
            </div>
          </div>
          <p className="mt-2 text-[13px] text-[#A9A6D6] md:hidden">표를 옆으로 밀면 늦은 시간도 볼 수 있습니다.</p>
        </section>
      )}
    </div>
  );
}

// 역 한 줄: 이름 + 시간대 칸
function Row({ station, slots, onPick }) {
  return (
    <>
      <span className="sticky left-0 z-10 truncate bg-[#120E2E] pr-2 text-[13px] leading-[18px]">{station.name}</span>
      {station.values.map((v, i) => (
        <button
          key={slots[i]}
          type="button"
          onClick={() => onPick({ name: station.name, slot: slots[i], value: v })}
          title={`${station.name} ${slots[i]} ${v === null ? "운행 없음" : `${v.toFixed(1)}%`}`}
          aria-label={`${station.name} ${slots[i]} ${v === null ? "운행 없음" : `${v.toFixed(1)}%`}`}
          className="h-[18px] rounded-[2px]"
          style={{ background: v === null ? EMPTY : LEVELS[toLevel(v) - 1].color }}
        />
      ))}
    </>
  );
}
