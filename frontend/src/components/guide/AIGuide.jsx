import { useEffect, useState } from "react";
import GuideRobot from "./GuideRobot.jsx";

// AI 안내 도우미 (미리보기): 질문 창과 캐릭터 말풍선만 먼저 보여 줍니다.
//  공공데이터에서 근거를 찾아 답하는 기능(RAG)은 아직 연결하지 않았습니다.
//  질문을 보내면 "찾는 중"을 잠깐 보여 준 뒤, 준비 중이라는 안내를 합니다. 서버로는 아무것도 보내지 않습니다.
const MESSAGES = {
  idle: "역 엘리베이터 위치나 빨리 내리는 칸처럼, 지하철 이용 중 궁금한 것을 물어보세요.",
  reply: "아직 준비 중인 기능이에요. 공공데이터에서 근거를 찾아 답하도록 만들고 있어요.",
};

export default function AIGuide() {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle"); // idle(처음) · work(찾는 중) · reply(답)

  // 찾는 중 2.4초 뒤(점 3개가 한 바퀴 켜지는 시간) 답으로 넘어갑니다. 그 사이 화면을 떠나면 타이머를 지웁니다.
  useEffect(() => {
    if (phase !== "work") return;
    const timer = setTimeout(() => setPhase("reply"), 2400);
    return () => clearTimeout(timer);
  }, [phase]);

  function ask(e) {
    e.preventDefault();
    if (question.trim()) setPhase("work");
  }

  return (
    <section aria-label="AI 안내 도우미 (준비 중)" className="flex flex-col gap-4 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-5 md:p-6">

      <div className="flex items-center gap-4 md:gap-6">
        <GuideRobot face={phase === "work" ? "work" : "done"} className="w-[72px] md:w-[110px]" />
        <div className="guide-bubble" aria-live="polite">
          <svg className="guide-tail" viewBox="0 0 14 20" aria-hidden="true">
            <rect x="8" y="2" width="6" height="16" fill="#22E5FF" />
            <rect x="4" y="5" width="4" height="10" fill="#22E5FF" />
            <rect x="0" y="8" width="4" height="4" fill="#22E5FF" />
            <rect x="10" y="4" width="4" height="12" fill="#0C1730" />
            <rect x="6" y="7" width="4" height="6" fill="#0C1730" />
          </svg>
          <div className="guide-bubble-line">
            <div className="guide-bubble-body">
              <p className="flex flex-wrap items-center gap-2 text-[12px] font-extrabold tracking-[.05em] text-[#22E5FF]">
                <span className="h-[7px] w-[7px] bg-[#FF2E97]" aria-hidden="true" />
                AI 안내 도우미
                <span className="rounded border border-[#9B5CFF] px-1.5 text-[11px] font-bold tracking-normal text-[#C9A9FF]">준비 중 · 미리보기</span>
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
                  MESSAGES[phase]
                )}
              </p>
              {phase === "reply" && (
                <p className="mt-2 text-[12px] text-[#8A86B8]">빠른하차정보 · 교통약자이용정보를 바탕으로 답할 예정입니다.</p>
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
          placeholder="예: 강남역 엘리베이터 위치"
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
    </section>
  );
}
