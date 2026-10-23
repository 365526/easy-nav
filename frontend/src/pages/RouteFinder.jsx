import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Phrases from "../components/Phrases.jsx";
import { useApi, LoadState } from "../api.jsx";
import StationInput from "../components/route/StationInput.jsx";
import RouteResult from "../components/route/RouteResult.jsx";
import RouteMap from "../components/route/RouteMap.jsx";
import AIGuide from "../components/guide/AIGuide.jsx";
import { DAYS, nextDate } from "../components/route/routeUtils.js";

// 경로 찾기: 출발역·도착역·요일·시각을 넣으면 /routes/recommend로 후보 경로를 받아 비교합니다.
// 검색 조건은 주소 뒤에 남습니다. 예: /route?from=신도림&to=강남&day=평일&time=08:30
export default function RouteFinder() {
  const [params, setParams] = useSearchParams();
  const asked = {
    from: params.get("from") || "",
    to: params.get("to") || "",
    day: DAYS.includes(params.get("day")) ? params.get("day") : "평일",
    time: params.get("time") || "08:30",
  };
  const [form, setForm] = useState(asked);
  const [comfort, setComfort] = useState(50); // 0 빠르게 ~ 100 편하게
  const [showMap, setShowMap] = useState(false); // 노선도에서 고르기 열림
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const ready = asked.from && asked.to;
  const { data, ...status } = useApi(ready ? "/routes/recommend" : null, {
    from_station: asked.from,
    to_station: asked.to,
    depart_time: `${nextDate(asked.day)}T${asked.time}`,
    day_type: asked.day,
  });

  // 502: 최단경로 API가 경로를 못 찾음(역 이름 확인) · 404: 경로는 있지만 1~8호선 구간이 없어 혼잡도를 계산할 수 없음
  const notFound = /502/.test(status.error);
  const noData = /404/.test(status.error);

  function submit(e) {
    e.preventDefault();
    setParams({ from: form.from.trim(), to: form.to.trim(), day: form.day, time: form.time });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">경로 찾기</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="어디로 가면/덜 붐빌까" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          가장 빠른 길과, 붐비는 역을 피해 돌아가는 길을 함께 비교합니다.
          <br />
          혼잡도는 실시간이 아니라 분기 평균 통계로 계산한 예측입니다.
        </p>
      </section>

      <form onSubmit={submit} className="flex flex-col gap-6 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_48px_1fr]">
          <StationInput id="from" label="출발역" value={form.from} onChange={set("from")} />
          <button
            type="button"
            aria-label="출발역과 도착역 바꾸기"
            onClick={() => setForm((f) => ({ ...f, from: f.to, to: f.from }))}
            className="flex h-12 w-12 items-center justify-center self-center justify-self-center rounded-full border border-[#2C2366] text-[20px] hover:border-[#22E5FF] md:self-end"
          >
            ⇄
          </button>
          <StationInput id="to" label="도착역" value={form.to} onChange={set("to")} />
        </div>

        <button
          type="button"
          aria-expanded={showMap}
          onClick={() => setShowMap((o) => !o)}
          className={`-mt-2 flex items-center gap-2 self-start rounded-full border px-4 py-2 text-[15px] font-bold text-[#22E5FF] hover:border-[#22E5FF] ${showMap ? "border-[#22E5FF] bg-[#22E5FF]/10" : "border-[#2C2366]"}`}
        >
          {/* 지하철 그림: 게임의 「경로 찾기 시작」 버튼에 썼던 것과 같은 선 그림 */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="3" width="14" height="14" rx="3" />
            <path d="M5 11h14" />
            <path d="M9 14h.01M15 14h.01" />
            <path d="M8 21l2-4M16 21l-2-4" />
          </svg>
          노선도에서 고르기
        </button>
        {showMap && <RouteMap onPick={(key, name) => set(key)(name)} />}

        <div className="grid gap-6 md:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[15px] font-bold">요일</legend>
            <div className="grid grid-cols-3 gap-2">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={form.day === d}
                  onClick={() => set("day")(d)}
                  className={`min-h-[44px] rounded-xl border text-[15px] font-bold ${
                    form.day === d ? "border-[#22E5FF] bg-[#22E5FF] text-[#0A0B1E]" : "border-[#2C2366] text-[#A9A6D6] hover:text-white"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-bold">출발 시각</span>
            <input
              type="time"
              value={form.time}
              onChange={(e) => set("time")(e.target.value)}
              required
              className="min-h-[44px] rounded-xl border border-[#2C2366] bg-[#0A0B1E] px-4 text-[17px] font-bold text-white [color-scheme:dark] focus:border-[#22E5FF] focus:outline-none"
            />
          </label>
        </div>

        <label className="flex flex-col gap-2">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-bold">무엇이 더 중요한가요?</span>
            <span className="text-[14px] tabular-nums text-[#A9A6D6]">
              시간 <b className="text-[#FF2E97]">{100 - comfort}</b> : 혼잡도 <b className="text-[#39FFB0]">{comfort}</b>
            </span>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            value={comfort}
            onChange={(e) => setComfort(Number(e.target.value))}
            aria-valuetext={`시간 ${100 - comfort}, 혼잡도 ${comfort}`}
            className="tradeoff"
          />
          <span className="flex justify-between text-[14px] font-bold">
            <span className="text-[#FF2E97]">빠르게</span>
            <span className="text-[#39FFB0]">편하게</span>
          </span>
        </label>

        <button type="submit" className="min-h-[52px] rounded-full bg-[#22E5FF] text-[17px] font-black text-[#0A0B1E] hover:bg-[#7CF0FF]">
          경로 비교하기
        </button>
      </form>

      {ready && (
        <section aria-live="polite" className="flex flex-col gap-6">
          <p className="text-[15px] text-[#A9A6D6]">
            {asked.from} → {asked.to} · {asked.day} {asked.time} 출발
          </p>
          {noData ? (
            <p role="alert" className="rounded-xl border border-[#FF2E97]/60 bg-[#FF2E97]/10 px-4 py-3 text-[15px] leading-relaxed">
              이 구간은 혼잡도 자료가 있는 1~8호선을 지나지 않습니다.
              <br />
              9호선, 신분당선, 코레일 구간 등은 아직 혼잡도를 계산할 수 없습니다.
            </p>
          ) : notFound ? (
            <p role="alert" className="rounded-xl border border-[#FF2E97]/60 bg-[#FF2E97]/10 px-4 py-3 text-[15px] leading-relaxed">
              경로를 찾지 못했습니다.
              <br />
              역 이름이 정확한지 확인해 주세요. (예: 서울 → 서울역)
            </p>
          ) : (
            <LoadState {...status} slowText="후보 경로를 여러 개 받아 비교하는 중입니다. 처음 찾는 경로는 서버가 깨어나는 시간까지 1분 정도 걸릴 수 있습니다." />
          )}
          {data && <RouteResult key={JSON.stringify(asked)} data={data} timeWeight={1 - comfort / 100} />}
        </section>
      )}

      <AIGuide station={asked.to} />
    </div>
  );
}
