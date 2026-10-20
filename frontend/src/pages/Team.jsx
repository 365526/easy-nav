import Phrases from "../components/Phrases.jsx";
import { ROLES } from "../data/roles.js";

export default function Team() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">팀</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="함께/만드는 사람들" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          아래 네 가지 역할을 나누어 담당하였고, 중요한 결정은 함께 논의하여 진행하였습니다.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((r, i) => (
          <div key={r.title} className="rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6">
            <p className="text-[14px] font-bold" style={{ color: r.color }}>역할 {i + 1}</p>
            <h2 className="mt-2 text-[22px] font-black">{r.title}</h2>
            <ul className="mt-2 list-disc pl-5 text-[15px] leading-relaxed text-[#A9A6D6]">
              {r.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
