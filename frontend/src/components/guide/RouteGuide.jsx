import { useEffect, useRef, useState } from "react";
import { API_URL } from "../../api.jsx";
import { lineColor } from "../route/routeUtils.js";
import GuideRobot from "./GuideRobot.jsx";

// AI 길잡이 (워크북 9·10): 고른 경로의 역별 안내와 직접 질문을 카드 하나에서 합니다.
//  빨리 갈아타기·휠체어·유모차(/guide/route): 출발·환승·도착역 안내를 한 번에 모아 역마다 보여 줌
//  직접 질문하기: 역 안내(/guide/ask, 빠른하차·엘리베이터) 또는 이용 규정(/guide/terms, 여객운송약관)
//  route가 없으면(경로를 찾기 전) 직접 질문하기만 쓸 수 있습니다. station: 질문에 역 이름이 없을 때 쓸 도착역
//  phase: idle(처음) · work(찾는 중) · reply(답) · miss(못 찾음 또는 오류)
const MODES = [
  { id: "fast", name: "빨리 갈아타기" },
  { id: "access", name: "휠체어·유모차" },
  { id: "ask", name: "직접 질문하기" },
];
const TOPICS = [
  {
    id: "station",
    name: "역 안내",
    path: "/guide/ask",
    idle: "역 엘리베이터 위치나 빨리 내리는 칸처럼, 역에서 궁금한 것을 물어보세요.",
    example: (station) => `예: ${station ? station.replace(/역$/, "") : "강남"}역 엘리베이터 위치`,
    note: "서울교통공사 빠른하차정보·교통약자이용정보(1~8호선)에서 찾은 내용으로만 답합니다. 엘리베이터 가동 여부는 역 안내를 함께 확인해 주세요.",
  },
  {
    id: "terms",
    name: "이용 규정",
    path: "/guide/terms",
    idle: "자전거, 반려동물, 환불, 부가운임처럼 지하철 이용 규정을 물어보세요. 여객운송약관에서 맞는 조항을 찾아 답해요.",
    example: () => "예: 자전거 가지고 타도 돼?",
    note: "서울교통공사 여객운송약관(1~8호선)에서 찾은 조항으로만 답합니다. 정확한 적용은 역 직원에게 함께 확인해 주세요.",
  },
];
const IDLE_ROUTE = "이 길의 출발·환승·도착역 안내를 한 번에 모아 드릴게요. 안내 방식을 고르거나 직접 물어보세요.";
const DONE = "역마다 공공데이터에서 찾은 안내를 모았어요.";
const EMPTY = "이 길의 역들은 서울교통공사 자료(1~8호선)에 안내가 없어 만들지 못했어요.";
const FAIL = "지금은 답을 가져오지 못했어요. 잠시 뒤 다시 해 주세요.";
const MIN_WORK = 1200; // 답이 빨리 와도 "찾는 중"을 이만큼(ms)은 보여 줌
const NO_ANSWER = { answer: "", sources: [], articles: [], checked: true };

const stationName = (name) => (name.endsWith("역") ? name : `${name}역`);

// 직접 질문의 두 가지 답 모양을 말풍선 하나로 맞춥니다.
function toAnswer(topic, data) {
  if (topic === "terms") {
    const day = data.source?.base_date ? ` (${data.source.base_date} 기준)` : "";
    const names = data.articles.map((a) => `${a.no}(${a.title})`).join(", ");
    return { answer: data.answer, sources: data.articles.length ? [`${data.source.name} ${names}${day}`] : [], articles: data.articles, checked: data.checked };
  }
  return {
    answer: data.answer,
    sources: (data.sources || []).map((s) => (s.base_date ? `${s.name} (${s.base_date} 기준)` : s.name)),
    articles: [],
    checked: true,
  };
}

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

export default function RouteGuide({ route = null, station = "" }) {
  const [mode, setMode] = useState(route ? null : "ask");
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null); // 역별 안내 (빨리 갈아타기·휠체어·유모차)
  const [topic, setTopic] = useState("station");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(NO_ANSWER); // 직접 질문의 답
  const ctrl = useRef(null);
  const current = TOPICS.find((t) => t.id === topic);

  // 화면을 떠나면 받던 답을 멈춥니다.
  useEffect(() => () => ctrl.current?.abort(), []);

  function start() {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setPhase("work");
    return Date.now();
  }
  const wait = (started) => new Promise((ok) => setTimeout(ok, Math.max(0, MIN_WORK - (Date.now() - started))));

  // 버튼을 누르면: 빨리 갈아타기·휠체어·유모차는 바로 안내를 받고, 직접 질문하기는 질문 창을 엽니다.
  async function pick(id) {
    if (phase === "work") return;
    if (id === "ask") {
      ctrl.current?.abort();
      setMode("ask");
      setPhase("idle");
      setAnswer(NO_ANSWER);
      return;
    }
    if (!route) return;
    setMode(id);
    const started = start();
    let done;
    try {
      const legs = route.legs.map(({ line, from, to, direction, prev, next }) => ({ line, from, to, direction: direction || "", prev: prev || "", next: next || "" }));
      const res = await fetch(`${API_URL}/guide/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: id, legs }),
        signal: ctrl.current.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      done = { phase: "reply", result: await res.json() };
    } catch (err) {
      if (err.name === "AbortError") return;
      done = { phase: "miss", result: null };
    }
    await wait(started);
    setResult(done.result);
    setPhase(done.phase);
  }

  function pickTopic(id) {
    if (id === topic || phase === "work") return;
    setTopic(id);
    setPhase("idle");
    setAnswer(NO_ANSWER);
  }

  async function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || phase === "work") return;
    const started = start();
    let done;
    try {
      const params = new URLSearchParams(topic === "terms" ? { question: q } : { question: q, station });
      const res = await fetch(`${API_URL}${current.path}?${params}`, { signal: ctrl.current.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      done = data.found ? { phase: "reply", ...toAnswer(topic, data) } : { phase: "miss", ...NO_ANSWER, answer: data.answer };
    } catch (err) {
      if (err.name === "AbortError") return;
      done = { phase: "miss", ...NO_ANSWER, answer: FAIL };
    }
    await wait(started);
    const { phase: nextPhase, ...rest } = done;
    setAnswer(rest);
    setPhase(nextPhase);
  }

  const asking = mode === "ask";
  const hasAny = result?.stops.some((s) => s.tip || s.facts.length > 0);
  let text;
  if (phase === "idle") text = asking ? current.idle : IDLE_ROUTE;
  else if (asking) text = answer.answer;
  else if (phase === "miss") text = FAIL;
  else text = hasAny ? result.summary || DONE : EMPTY;
  const face = phase === "work" ? "work" : phase === "miss" || (phase === "reply" && !asking && !hasAny) ? "error" : "done";
  const label = asking ? `직접 질문하기 · ${current.name}` : MODES.find((m) => m.id === mode)?.name;

  return (
    <section aria-label="AI 길잡이" className="flex flex-col gap-5 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-black">AI 길잡이</h3>
          <p className="mt-0.5 text-[14px] text-[#A9A6D6]">
            {route ? "이 길로 갈 때 역마다 알아 둘 것을 모아 보거나, 직접 물어볼 수 있습니다." : "경로를 찾으면 역마다 알아 둘 것을 모아 드려요. 지금은 직접 물어볼 수 있습니다."}
          </p>
        </div>
        <div role="group" aria-label="안내 방식" className="flex flex-wrap gap-2">
          {MODES.map((m) => {
            const off = m.id !== "ask" && !route;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                disabled={phase === "work" || off}
                title={off ? "경로를 찾으면 쓸 수 있어요" : undefined}
                onClick={() => pick(m.id)}
                className={`min-h-[44px] rounded-xl border px-4 text-[15px] font-black transition-colors disabled:cursor-default disabled:opacity-40 ${
                  mode === m.id ? "border-[#22E5FF] bg-[#22E5FF] text-[#0A0B1E]" : "border-[#2C2366] bg-[#0A0B1E] text-[#F2F4FF] hover:border-[#22E5FF]"
                }`}
              >
                {m.name}
              </button>
            );
          })}
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
                AI 길잡이{label ? ` · ${label}` : ""}
              </p>
              <p className="mt-1 text-[15px] font-bold leading-relaxed md:text-[17px]">
                {phase === "work" ? (
                  <>
                    {asking ? "자료를 찾아보는 중이에요" : "역마다 자료를 모으는 중이에요"}
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
              {asking && phase === "reply" && answer.sources.length > 0 && (
                <p className="mt-2 text-[12px] text-[#8A86B8]">근거: {answer.sources.join(" · ")}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {!asking && phase === "reply" && result && (
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

      {asking && (
        <>
          {phase === "reply" && answer.articles.length > 0 && (
            <details open={!answer.checked} className="rounded-xl bg-[#0A0B1E] px-4 py-3 text-[13px] text-[#C9C6EE]">
              <summary className="cursor-pointer select-none font-bold text-[#A9A6D6] hover:text-[#22E5FF]">
                조항 원문 {answer.articles.length}개 {answer.checked ? "보기" : "(AI 답 대신 원문을 확인해 주세요)"}
              </summary>
              <div className="mt-2 flex flex-col gap-3">
                {answer.articles.map((a) => (
                  <div key={a.no}>
                    <p className="font-black text-[#F2F4FF]">
                      {a.no}({a.title})
                    </p>
                    <p className="mt-1 whitespace-pre-line leading-relaxed">{a.text}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="flex flex-col gap-2">
            <div role="group" aria-label="질문 종류" className="flex gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={topic === t.id}
                  onClick={() => pickTopic(t.id)}
                  className={`min-h-[36px] rounded-full border px-3 text-[13px] font-extrabold transition-colors ${
                    topic === t.id ? "border-[#39FFB0] text-[#39FFB0]" : "border-[#2C2366] text-[#A9A6D6] hover:border-[#39FFB0]"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="guide-question" className="sr-only">AI 길잡이에게 질문하기</label>
              <input
                id="guide-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={100}
                placeholder={current.example(station)}
                className="min-h-[48px] flex-1 rounded-xl border border-[#2C2366] bg-[#0A0B1E] px-4 text-[16px] text-[#F2F4FF] placeholder:text-[#6F6B9E] focus:border-[#22E5FF] focus:outline-none"
              />
              <button
                type="submit"
                disabled={phase === "work"}
                className="min-h-[48px] rounded-xl bg-[#22E5FF] px-6 text-[16px] font-black text-[#0A0B1E] hover:bg-[#7CF0FF] disabled:opacity-60"
              >
                물어보기
              </button>
            </form>
            <p className="text-[13px] leading-relaxed text-[#8A86B8]">{current.note}</p>
          </div>
        </>
      )}
    </section>
  );
}
