import { useEffect, useRef, useState } from "react";
import { API_URL } from "../../api.jsx";
import { lineColor } from "../route/routeUtils.js";
import GuideRobot from "./GuideRobot.jsx";

// AI 길잡이 (워크북 9): 고른 경로의 출발·환승·도착역 안내를 서버(/guide/route)에서 한 번에 받아 보여 줍니다.
//  역마다 따로 찾아봐야 하는 빠른하차·엘리베이터 정보를 서버가 모아, 공공데이터에 있는 내용으로만 한 줄씩 안내합니다.
//  안내 문장의 숫자가 자료에 없으면 서버가 그 문장을 버리고 자료 원문(facts)만 보내므로, 그때는 원문을 그대로 보여 줍니다.
//  phase: idle(처음) · work(모으는 중) · reply(안내) · miss(오류)
const MODES = [
  { id: "fast", name: "빨리 갈아타기" },
  { id: "easy", name: "휠체어·유모차" },
];
const IDLE = "이 길의 출발·환승·도착역 안내를 한 번에 모아 드릴게요. 안내 방식을 골라 주세요.";
const DONE = "역마다 공공데이터에서 찾은 안내를 모았어요.";
const EMPTY = "이 길의 역들은 서울교통공사 자료(1~8호선)에 안내가 없어 만들지 못했어요.";
const FAIL = "지금은 안내를 가져오지 못했어요. 잠시 뒤 다시 눌러 주세요.";
const MIN_WORK = 1200; // 답이 빨리 와도 "모으는 중"을 이만큼(ms)은 보여 줌

const stationName = (name) => (name.endsWith("역") ? name : `${name}역`);

function LineChip({ line }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[12px] font-extrabold text-[#0A0B1E]" style={{ background: lineColor(line) }}>
      {line}
    </span>
  );
}

function Stop({ stop, next }) {
  const color = lineColor(stop.line);
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* 다음 역까지 타고 가는 노선 색 선 */}
      {next && <span aria-hidden="true" className="absolute bottom-0 left-[12px] top-7 w-1 rounded-full opacity-70" style={{ background: lineColor(next.line) }} />}
      <span aria-hidden="true" className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] bg-[#0A0B1E]" style={{ borderColor: color }}>
        {stop.kind === "환승" && <span className="h-2.5 w-2.5 rounded-full bg-[#F2F4FF]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[12px] font-extrabold tracking-[.05em] text-[#A9A6D6]">{stop.kind}</span>
          <span className="text-[17px] font-black">{stationName(stop.station)}</span>
          <LineChip line={stop.line} />
          {stop.next_line && (
            <span className="flex items-center gap-2">
              <span aria-label="갈아타기" className="text-[#A9A6D6]">→</span>
              <LineChip line={stop.next_line} />
            </span>
          )}
        </p>
        {stop.tip ? (
          <p className="mt-1.5 text-[15px] font-bold leading-relaxed">{stop.tip}</p>
        ) : stop.facts.length > 0 ? (
          <p className="mt-1.5 text-[14px] leading-relaxed text-[#A9A6D6]">AI 안내가 자료와 맞지 않아, 공공데이터 원문을 그대로 보여 드려요.</p>
        ) : (
          <p className="mt-1.5 text-[14px] leading-relaxed text-[#6E6A9E]">이 역은 서울교통공사 자료(1~8호선)에 안내가 없어요.</p>
        )}
        {stop.facts.length > 0 &&
          (stop.tip ? (
            <details className="mt-1 text-[13px] text-[#8A86B8]">
              <summary className="cursor-pointer select-none hover:text-[#22E5FF]">근거 자료 {stop.facts.length}줄 보기</summary>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 leading-relaxed">
                {stop.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          ) : (
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-[#C9C6EE]">
              {stop.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ))}
      </div>
    </li>
  );
}

export default function RouteGuide({ route }) {
  const [mode, setMode] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const ctrl = useRef(null);

  // 화면을 떠나면 받던 안내를 멈춥니다.
  useEffect(() => () => ctrl.current?.abort(), []);

  async function load(next) {
    if (phase === "work") return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setMode(next);
    setPhase("work");
    const started = Date.now();
    let done;
    try {
      const legs = route.legs.map(({ line, from, to, direction, prev, next }) => ({ line, from, to, direction: direction || "", prev: prev || "", next: next || "" }));
      const res = await fetch(`${API_URL}/guide/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next, legs }),
        signal: ctrl.current.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      done = { phase: "reply", result: await res.json() };
    } catch (err) {
      if (err.name === "AbortError") return;
      done = { phase: "miss", result: null };
    }
    await new Promise((ok) => setTimeout(ok, Math.max(0, MIN_WORK - (Date.now() - started))));
    setResult(done.result);
    setPhase(done.phase);
  }

  const hasAny = result?.stops.some((s) => s.tip || s.facts.length > 0);
  const text =
    phase === "idle" ? IDLE : phase === "miss" ? FAIL : phase === "reply" ? (hasAny ? result.summary || DONE : EMPTY) : "";
  const face = phase === "work" ? "work" : phase === "miss" || (phase === "reply" && !hasAny) ? "error" : "done";

  return (
    <section aria-label="AI 길잡이" className="flex flex-col gap-5 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-black">AI 길잡이</h3>
          <p className="mt-0.5 text-[14px] text-[#A9A6D6]">이 길로 갈 때 역마다 알아 둘 것을 한 번에 모아 봅니다.</p>
        </div>
        <div role="group" aria-label="안내 방식" className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              disabled={phase === "work"}
              onClick={() => load(m.id)}
              className={`min-h-[44px] rounded-xl border px-4 text-[15px] font-black transition-colors disabled:opacity-60 ${
                mode === m.id ? "border-[#22E5FF] bg-[#22E5FF] text-[#0A0B1E]" : "border-[#2C2366] bg-[#0A0B1E] text-[#F2F4FF] hover:border-[#22E5FF]"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <GuideRobot face={face} className="w-[64px] md:w-[96px]" />
        <div className={`guide-bubble${face === "error" ? " guide-bubble-miss" : ""}`} aria-live="polite">
          <svg className="guide-tail" viewBox="0 0 14 20" aria-hidden="true">
            <rect className="guide-tail-line" x="8" y="2" width="6" height="16" />
            <rect className="guide-tail-line" x="4" y="5" width="4" height="10" />
            <rect className="guide-tail-line" x="0" y="8" width="4" height="4" />
            <rect x="10" y="4" width="4" height="12" fill="#0C1730" />
            <rect x="6" y="7" width="4" height="6" fill="#0C1730" />
          </svg>
          <div className="guide-bubble-line">
            <div className="guide-bubble-body">
              <p className="flex items-center gap-2 text-[12px] font-extrabold tracking-[.05em] text-[#22E5FF]">
                <span className="h-[7px] w-[7px] bg-[#FF2E97]" aria-hidden="true" />
                AI 길잡이{phase === "reply" && result ? ` · ${result.mode_name}` : ""}
              </p>
              <p className="mt-1 text-[15px] font-bold leading-relaxed md:text-[17px]">
                {phase === "work" ? (
                  <>
                    역마다 자료를 모으는 중이에요
                    <span aria-hidden="true">
                      <span className="blink blink0">.</span>
                      <span className="blink blink1">.</span>
                      <span className="blink blink2">.</span>
                    </span>
                  </>
                ) : (
                  text
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {phase === "reply" && result && (
        <>
          <ol aria-label="역별 안내" className="flex flex-col rounded-xl bg-[#0A0B1E] p-4 md:p-5">
            {result.stops.map((s, i) => (
              <Stop key={`${s.kind}-${s.station}-${i}`} stop={s} next={result.stops[i + 1]} />
            ))}
          </ol>
          <p className="text-[12px] leading-relaxed text-[#8A86B8]">
            {result.sources.length > 0 && (
              <>
                근거: {result.sources.map((s) => (s.base_date ? `${s.name} (${s.base_date} 기준)` : s.name)).join(" · ")}
                <br />
              </>
            )}
            안내 문장의 숫자(칸·출입구)는 자료와 맞는지 서버가 한 번 더 확인했어요.
            {result.dropped > 0 && ` 맞지 않은 ${result.dropped}개는 자료 원문으로 바꿨어요.`} 엘리베이터 가동 여부는 역 안내를 함께 확인해 주세요.
          </p>
        </>
      )}
    </section>
  );
}
