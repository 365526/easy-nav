import { useState } from "react";
import LevelBadge, { LEVELS, People } from "../LevelBadge.jsx";
import RouteGuide from "../guide/RouteGuide.jsx";
import RoutePathMap from "./RoutePathMap.jsx";
import { addMinutes, lineColor, objectJosa, rerank, toLevel } from "./routeUtils.js";

const pct = (v) => `${Number(v).toFixed(1)}%`;
const mins = (v) => `${Math.round(v)}분`;
const box = "rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6";

// 혼잡도를 일부만 계산한 길: "이동 시간의 90%만 계산 · 신분당선 제외"
function CoverageNote({ c }) {
  if (!c.average || c.coverage >= 100) return null;
  return (
    <span className="text-[13px] leading-relaxed text-[#A9A6D6]">
      이동 시간의 {c.coverage}%만 계산 · {c.no_data_lines.join(", ")} 구간은 혼잡도 자료 없음
    </span>
  );
}

// 빠른 길과 편한 길을 한 줄로 비교합니다. 비교할 수 없는 경우에는 그 이유를 그대로 알립니다.
function Summary({ ranked, fastest, calmest }) {
  const unscored = ranked.filter((c) => !c.average);
  if (fastest.key !== calmest.key) {
    const extra = calmest.total_minutes - fastest.total_minutes;
    const down = fastest.average.level - calmest.average.level;
    // 시간도 단계도 같으면 "+0분 · 단계 같음" 대신 문장으로 알립니다(9-1 점검: 노원 → 이수).
    if (Math.round(extra) === 0 && down === 0) {
      return (
        <section className={box}>
          <p className="text-[15px] font-bold text-[#A9A6D6]">비교 결과</p>
          <p className="mt-2 text-[20px] font-black leading-snug md:text-[24px]">
            같은 시간에 조금 덜 붐비는 길이 있습니다.
            <br />
            단계는 같고, 평균 혼잡도가 {pct(fastest.average.congestion)} → {pct(calmest.average.congestion)}로 낮습니다.
          </p>
        </section>
      );
    }
    return (
      <section className={box}>
        <p className="text-[15px] font-bold text-[#A9A6D6]">편한 길을 고르면</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[32px] font-black leading-none tabular-nums md:text-[40px]">+{mins(extra)}</p>
            <p className="mt-2 text-[14px] text-[#A9A6D6]">소요 시간</p>
          </div>
          <div>
            <p className="text-[32px] font-black leading-none md:text-[40px]" style={{ color: down > 0 ? "#39FFB0" : "#F2F4FF" }}>
              {down > 0 ? `${down}단계 ↓` : "단계 같음"}
            </p>
            <p className="mt-2 text-[14px] text-[#A9A6D6]">
              평균 {pct(fastest.average.congestion)} → {pct(calmest.average.congestion)}
            </p>
          </div>
        </div>
        {calmest.coverage < 100 && (
          <p className="mt-4 text-[13px] text-[#A9A6D6]">
            편한 길의 {calmest.no_data_lines.join(", ")} 구간은 혼잡도 자료가 없어 나머지 구간으로 계산했습니다.
          </p>
        )}
      </section>
    );
  }
  let message;
  if (unscored.length > 0) {
    const other = unscored[0];
    message = (
      <>
        다른 길(+{mins(other.total_minutes - fastest.total_minutes)})도 있지만
        <br />
        {other.no_data_lines.join(", ")} 구간이라 혼잡도를 비교하지 못했습니다.
      </>
    );
  } else if (ranked.length > 1) {
    message = (
      <>
        가장 빠른 길이 가장 덜 붐빕니다.
        <br />
        돌아가도 덜 붐비지 않습니다.
      </>
    );
  } else {
    message = (
      <>
        비교할 다른 길을 찾지 못했습니다.
        <br />
        아래에서 출발 시각을 바꿔 보세요.
      </>
    );
  }
  return (
    <section className={box}>
      <p className="text-[15px] font-bold text-[#A9A6D6]">비교 결과</p>
      <p className="mt-2 text-[20px] font-black leading-snug md:text-[24px]">{message}</p>
    </section>
  );
}

// 후보 경로 카드: 누르면 아래에 자세한 내용이 나옵니다.
function RouteCard({ c, rank, selected, onSelect, departAt }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border bg-[#120E2E] p-5 text-left transition-colors ${
        selected ? "border-[#22E5FF] shadow-[0_0_0_1px_#22E5FF]" : "border-[#2C2366] hover:border-[#4A3F99]"
      }`}
    >
      <span className="flex flex-wrap items-center gap-2">
        {rank === 1 && c.average && <span className="rounded-md bg-[#22E5FF] px-2 py-0.5 text-[13px] font-black text-[#0A0B1E]">추천</span>}
        {c.tags.map((t) => (
          <span key={t} className="rounded-md border px-2 py-0.5 text-[13px] font-bold" style={{ borderColor: t === "빠른 길" ? "#FF2E97" : "#39FFB0" }}>
            {t}
          </span>
        ))}
        {c.avoid && <span className="text-[13px] text-[#A9A6D6]">{objectJosa(c.avoid.replaceAll(",", "·"))} 피한 길</span>}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[34px] font-black leading-none tabular-nums">{mins(c.total_minutes)}</span>
        <span className="text-[14px] text-[#A9A6D6]">
          환승 {c.transfers}회 · {addMinutes(departAt, c.total_minutes)} 도착
        </span>
      </span>
      {c.average ? (
        <span className="flex flex-wrap items-center gap-3">
          <LevelBadge lv={c.average.level} />
          <span className="text-[14px] text-[#A9A6D6]">평균 {pct(c.average.congestion)}</span>
        </span>
      ) : (
        <span className="flex flex-col gap-2">
          <span className="w-fit rounded-full border border-[#4A3F99] px-3 py-1 text-[14px] font-bold text-[#A9A6D6]">혼잡도 자료 없음</span>
          <span className="text-[13px] leading-relaxed text-[#A9A6D6]">{c.no_data_lines.join(", ")} 구간은 혼잡도 자료가 없습니다.</span>
        </span>
      )}
      <CoverageNote c={c} />
      {c.worst && c.worst.level >= 4 && (
        <span className="rounded-lg bg-[#9A2E08]/30 px-3 py-2 text-[14px] font-bold text-[#FFD9C7]">
          가장 붐비는 곳: {c.worst.station} {pct(c.worst.congestion)}
        </span>
      )}
      {c.vs_fastest.extra_minutes > 0 && (
        <span className="text-[14px] font-bold">
          빠른 길보다 +{mins(c.vs_fastest.extra_minutes)},{" "}
          {c.vs_fastest.level_down === null
            ? "혼잡도 비교 불가"
            : c.vs_fastest.level_down > 0
              ? `${c.vs_fastest.level_down}단계 덜 붐빔`
              : c.vs_fastest.level_down < 0
                ? `${-c.vs_fastest.level_down}단계 더 붐빔`
                : "단계 같음"}
        </span>
      )}
      <span className="flex flex-col gap-2 border-t border-[#2C2366] pt-4">
        {c.legs.map((leg) => (
          <span key={`${leg.line}-${leg.from}`} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: lineColor(leg.line) }} />
              <span className="shrink-0 font-bold">{leg.line}</span>
              <span className="truncate text-[#A9A6D6]">{leg.from} → {leg.to}</span>
            </span>
            {leg.average ? (
              <span className="shrink-0 font-bold" style={{ color: LEVELS[leg.average.level - 1].color }}>{leg.average.level_name}</span>
            ) : (
              <span className="shrink-0 text-[#8A86B8]">자료 없음</span>
            )}
          </span>
        ))}
      </span>
    </button>
  );
}

// 출발 시각을 앞뒤로 옮겼을 때의 평균 혼잡도 막대
function Departures({ c }) {
  if (!c.average) {
    return (
      <section className={box}>
        <h3 className="text-[18px] font-black">출발 시각을 바꾸면</h3>
        <p className="mt-3 text-[15px] leading-relaxed text-[#A9A6D6]">혼잡도 자료가 없는 길이라 시각별 비교를 할 수 없습니다.</p>
      </section>
    );
  }
  const now = c.departures.find((d) => d.shift_minutes === 0);
  const better = c.departures
    .filter((d) => d.average && now?.average && d.average.level < now.average.level)
    .sort((a, b) => a.average.congestion - b.average.congestion)[0];
  return (
    <section className={`flex flex-col gap-4 ${box}`}>
      <div>
        <h3 className="text-[18px] font-black">출발 시각을 바꾸면</h3>
        <p className="mt-1 text-[14px] text-[#A9A6D6]">같은 길을 1시간 전부터 1시간 뒤까지 30분 간격으로 계산한 예상 평균입니다.</p>
      </div>
      <div className="flex h-[200px] items-end gap-3">
        {c.departures.map((d) => {
          const lv = d.average?.level;
          return (
            <div key={d.shift_minutes} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[13px] font-bold tabular-nums">{d.average ? pct(d.average.congestion) : "자료 없음"}</span>
              <span
                className="w-full rounded-t-lg"
                style={{
                  height: d.average ? `${Math.min(d.average.congestion / 150, 1) * 130}px` : "4px",
                  background: lv ? LEVELS[lv - 1].color : "#2C2366",
                  outline: d.shift_minutes === 0 ? "3px solid #F2F4FF" : "none",
                  outlineOffset: "2px",
                }}
              />
              <span className={`text-[13px] tabular-nums ${d.shift_minutes === 0 ? "font-black text-white" : "text-[#A9A6D6]"}`}>{d.depart}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[15px] leading-relaxed">
        {better
          ? `${better.depart}에 나서면 ${better.average.level}단계(${better.average.level_name})로 내려갑니다.`
          : "앞뒤 1시간 안에서는 지금 고른 시각보다 단계가 낮은 때가 없습니다."}
        <br />
        <span className="text-[13px] text-[#A9A6D6]">흰 테두리 막대가 지금 고른 출발 시각입니다.</span>
      </p>
    </section>
  );
}

// 구간별 혼잡도 목록
function Segments({ c }) {
  return (
    <section className={`flex flex-col gap-4 ${box}`}>
      <div>
        <h3 className="text-[18px] font-black">구간별 혼잡도</h3>
        <p className="mt-1 text-[14px] text-[#A9A6D6]">역을 떠나는 시각의 30분 칸 혼잡도입니다.</p>
      </div>
      {c.segments.length > 0 && (
        <ol className="flex flex-col gap-2">
          {c.segments.map((s, i) => {
            const lv = toLevel(s.congestion);
            return (
              <li key={`${s.station}-${s.line}-${i}`} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 text-[14px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lineColor(s.line) }} />
                  <span className="truncate font-bold">{s.station}</span>
                </span>
                <span className="h-2.5 rounded-full bg-[#1E1A44]">
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(s.congestion / 150, 1) * 100}%`, background: LEVELS[lv - 1].color }} />
                </span>
                <span className="text-right font-bold tabular-nums">{Math.round(s.congestion)}%</span>
              </li>
            );
          })}
        </ol>
      )}
      {c.missing.length > 0 && (
        <p className="text-[13px] leading-relaxed text-[#A9A6D6]">
          혼잡도 자료가 없어 계산에서 뺀 구간: {c.missing.join(", ")}
          <br />
          (1~8호선 밖의 노선이거나 열차가 다니지 않는 시간대입니다.)
        </p>
      )}
    </section>
  );
}

export default function RouteResult({ data, timeWeight }) {
  const ranked = rerank(data.candidates, timeWeight);
  const [picked, setPicked] = useState(null);
  const selected = ranked.find((c) => c.key === picked) || ranked[0];
  const fastest = ranked.find((c) => c.tags.includes("빠른 길")) || ranked[0];
  const calmest = ranked.find((c) => c.tags.includes("편한 길")) || ranked[0];
  const departAt = String(data.depart_time).slice(11, 16);

  return (
    <div className="flex flex-col gap-6">
      <Summary ranked={ranked} fastest={fastest} calmest={calmest} />
      <div>
        <h2 className="text-[20px] font-black">후보 경로 {ranked.length}개</h2>
        <p className="mt-1 text-[14px] text-[#A9A6D6]">
          추천 순서입니다. 위의 슬라이더를 움직이면 순서가 바로 바뀝니다. 카드를 누르면 아래에 자세히 나옵니다.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {ranked.map((c, i) => (
          <RouteCard key={c.key} c={c} rank={i + 1} selected={c.key === selected.key} onSelect={() => setPicked(c.key)} departAt={departAt} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-black">
          {selected.tags[0] || "다른 길"} · {mins(selected.total_minutes)}
        </h2>
        {selected.average && <People n={selected.average.level} size={14} color={LEVELS[selected.average.level - 1].color} />}
      </div>
      <RoutePathMap candidates={ranked} selected={selected} />
      <RouteGuide key={selected.key} route={selected} station={data.to} />
      <div className="grid gap-4 md:grid-cols-2">
        <Departures c={selected} />
        <Segments c={selected} />
      </div>
    </div>
  );
}