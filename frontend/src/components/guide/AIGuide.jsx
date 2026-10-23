import { useEffect, useRef, useState } from "react";
import { API_URL } from "../../api.jsx";
import GuideRobot from "./GuideRobot.jsx";

// AI 안내 도우미: 질문을 서버(/guide/ask)로 보내, 공공데이터에서 찾은 자료로만 만든 답을 말풍선에 보여 줍니다.
//  station: 질문에 역 이름이 없을 때 쓸 역 (경로 찾기의 도착역). 예: "엘리베이터 어디 있어?" → 도착역 기준으로 찾음
//  phase: idle(처음) · work(찾는 중) · reply(답) · miss(못 찾음 또는 오류)
const IDLE = "역 엘리베이터 위치나 빨리 내리는 칸처럼, 지하철 이용 중 궁금한 것을 물어보세요.";
const FAIL = "지금은 답을 가져오지 못했어요. 잠시 뒤 다시 물어봐 주세요.";
const MIN_WORK = 1200; // 답이 빨리 와도 "찾는 중"을 이만큼(ms)은 보여 줌

export default function AIGuide({ station = "" }) {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [reply, setReply] = useState({ answer: IDLE, sources: [] });
  const ctrl = useRef(null);

  // 화면을 떠나면 받던 답을 멈춥니다.
  useEffect(() => () => ctrl.current?.abort(), []);

  async function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || phase === "work") return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setPhase("work");
    const started = Date.now();
    let next;
    try {
      const params = new URLSearchParams({ question: q, station });
      const res = await fetch(`${API_URL}/guide/ask?${params}`, { signal: ctrl.current.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      next = data.found ? { phase: "reply", answer: data.answer, sources: data.sources } : { phase: "miss", answer: data.answer, sources: [] };
    } catch (err) {
      if (err.name === "AbortError") return;
      next = { phase: "miss", answer: FAIL, sources: [] };
    }
    await new Promise((done) => setTimeout(done, Math.max(0, MIN_WORK - (Date.now() - started))));
    setReply({ answer: next.answer, sources: next.sources });
    setPhase(next.phase);
  }

  const face = phase === "work" ? "work" : phase === "miss" ? "error" : "done";
  return (
    <section aria-label="AI 안내 도우미" className="flex flex-col gap-4 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6">

      <div className="flex items-center gap-4 md:gap-6">
        <GuideRobot face={face} className="w-[72px] md:w-[110px]" />
        <div className={`guide-bubble${phase === "miss" ? " guide-bubble-miss" : ""}`} aria-live="polite">
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
                AI 안내 도우미
              </p>
              <p className="mt-1 text-[15px] font-bold leading-relaxed md:text-[17px]">
                {phase === "work" ? (
                  <>
                    자료를 찾아보는 중이에요
                    <span aria-hidden="true">
                      <span className="blink blink0">.</span>
                      <span className="blink blink1">.</span>
                      <span className="blink blink2">.</span>
                    </span>
                  </>
                ) : (
                  reply.answer
                )}
              </p>
              {phase === "reply" && reply.sources.length > 0 && (
                <p className="mt-2 text-[12px] text-[#8A86B8]">
                  근거: {reply.sources.map((s) => (s.base_date ? `${s.name} (${s.base_date} 기준)` : s.name)).join(" · ")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="guide-question" className="sr-only">AI 안내 도우미에게 질문하기</label>
        <input
          id="guide-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={100}
          placeholder={`예: ${station ? station.replace(/역$/, "") : "강남"}역 엘리베이터 위치`}
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
      <p className="-mt-1 text-[13px] leading-relaxed text-[#8A86B8]">
        서울교통공사 빠른하차정보·교통약자이용정보(1~8호선)에서 찾은 내용으로만 답합니다. 엘리베이터 가동 여부는 역 안내를 함께 확인해 주세요.
      </p>
    </section>
  );
}
