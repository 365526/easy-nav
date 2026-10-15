import Phrases from "../components/Phrases.jsx";
export default function RouteFinder() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">경로 찾기</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="어디로 가면/덜 붐빌까" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          서버와 연결하는 단계에서 이 화면이 동작합니다. 지금은 입력 칸의 자리만 잡아 두었습니다.
        </p>
      </section>
      <form className="grid gap-4 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6 md:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
        {["출발역", "도착역", "출발 시각"].map((label) => (
          <label key={label} className="flex flex-col gap-2 text-[15px] font-bold">
            {label}
            <input disabled placeholder="준비 중" className="min-h-[44px] w-full min-w-0 rounded-xl border border-[#2C2366] bg-[#0A0B1E] px-4 text-[16px] text-[#A9A6D6]" />
          </label>
        ))}
        <button type="submit" disabled className="min-h-[48px] rounded-full bg-[#2C2366] text-[17px] font-bold text-[#A9A6D6] md:col-span-3">
          경로 비교하기 (준비 중)
        </button>
      </form>
    </div>
  );
}
