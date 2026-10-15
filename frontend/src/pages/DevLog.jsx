import { DEVLOG } from "../data/devlog.js";
import Phrases from "../components/Phrases.jsx";

export default function DevLog() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">개발 기록</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="어디까지/만들었을까" /></h1>
      </section>
      <ol className="relative flex flex-col gap-6 border-l-2 border-[#2C2366] pl-6">
        {DEVLOG.map((entry) => (
          <li key={entry.date + entry.title} className="relative">
            <span className="absolute -left-[33px] top-[6px] h-4 w-4 rounded-full border-2 border-[#0A0B1E] bg-[#22E5FF]" />
            <p className="text-[14px] font-bold text-[#A9A6D6]">{entry.date}</p>
            <h2 className="mt-1 text-[20px] font-black">{entry.title}</h2>
            <ul className="mt-2 list-disc pl-5 text-[15px] leading-relaxed text-[#A9A6D6]">
              {entry.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
