import { DEVLOG } from "../data/devlog.js";
import Phrases from "../components/Phrases.jsx";

// GitHub 저장소 주소: 기록에 pr 번호가 있으면 Pull Request 링크를 붙입니다.
//  pr: 3 처럼 하나만 적거나, pr: [5, 6, 7] 처럼 여러 개를 적을 수 있습니다.
const REPO = "https://github.com/365526/easy-nav";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const dayName = (date) => WEEKDAY[new Date(`${date}T00:00:00`).getDay()];

// 같은 날짜의 기록을 하나로 묶습니다.
//  devlog.js는 새 기록이 맨 위이므로 날짜는 최신순 그대로 두고,
//  하루 안에서는 먼저 한 작업이 위에 오도록 순서를 뒤집습니다.
function groupByDate(list) {
  const groups = [];
  for (const entry of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.entries.unshift(entry);
    else groups.push({ date: entry.date, entries: [entry] });
  }
  return groups;
}

export default function DevLog() {
  const groups = groupByDate(DEVLOG);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">개발 기록</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="어디까지/만들었을까" /></h1>
      </section>
      <ol className="relative flex flex-col gap-10 border-l-2 border-[#2C2366] pl-6">
        {groups.map((group, gi) => {
          const latestDay = gi === 0; // 맨 위 날짜 = 가장 최근에 작업한 날, 그날 마지막 항목 = 최신 기록
          return (
            <li key={group.date} className="relative">
              {/* 날짜 점: 가장 최근 날짜만 분홍색 */}
              <span
                aria-hidden="true"
                className={`absolute -left-[33px] top-[3px] h-4 w-4 rounded-full border-2 border-[#0A0B1E] ${
                  latestDay ? "bg-[#FF2E97] shadow-[0_0_12px_#FF2E97]" : "bg-[#22E5FF]"
                }`}
              />
              <h2 className="text-[15px] font-bold text-[#A9A6D6]">
                <time dateTime={group.date}>{group.date} ({dayName(group.date)})</time>
              </h2>
              <ul className="mt-3 flex flex-col gap-6">
                {group.entries.map((entry, ei) => (
                  <li key={entry.title}>
                    <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[20px] font-black">
                      {entry.title}
                      {latestDay && ei === group.entries.length - 1 && (
                        <span className="rounded-full bg-[#FF2E97] px-2.5 py-0.5 text-[13px] font-bold text-[#0A0B1E]">최신</span>
                      )}
                      {[].concat(entry.pr ?? []).map((n) => (
                        <a
                          key={n}
                          href={`${REPO}/pull/${n}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[14px] font-bold text-[#22E5FF] underline-offset-4 hover:underline"
                        >
                          PR #{n}
                        </a>
                      ))}
                    </h3>
                    <ul className="mt-2 list-disc pl-5 text-[15px] leading-relaxed text-[#A9A6D6]">
                      {entry.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
