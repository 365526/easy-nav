import { Link } from "react-router-dom";
import LevelBadge, { People } from "./LevelBadge.jsx";
import { DATA_FACT, ROADMAP, FEEDBACK_URL } from "../data/site.js";
import { DEVLOG } from "../data/devlog.js";
import Phrases from "./Phrases.jsx";

// 홈 화면의 구역 제목: 모든 구역이 같은 모양을 쓰도록 한 곳에 둡니다.
export function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="mb-6">
      <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-black leading-tight md:text-[36px]"><Phrases text={title} /></h2>
      {text && <p className="mt-3 max-w-[720px] text-[16px] leading-relaxed text-[#A9A6D6]">{text}</p>}
    </div>
  );
}

const card = "rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6";

// 1. 실제 데이터 한 장면
export function DataFact() {
  return (
    <section>
      <SectionTitle eyebrow="왜 필요할까" title="가장 붐비는 순간은/이 정도입니다" />
      <div className={`${card} grid items-center gap-6 md:grid-cols-[auto_1fr] md:p-8`}>
        <p className="text-[64px] font-black leading-none tabular-nums text-[#FF2E97] md:text-[88px]">{DATA_FACT.value}%</p>
        <div>
          <p className="text-[20px] font-black">{DATA_FACT.label}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3"><LevelBadge lv={5} /><People n={5} size={16} /></div>
          <p className="mt-3 text-[15px] leading-relaxed text-[#A9A6D6]">{DATA_FACT.note}</p>
        </div>
      </div>
    </section>
  );
}

// 3. 작동 방식 3단계
const STEPS = [
  { title: "출발·도착·시각 입력", text: "어디서 어디로, 언제 나설지만 넣습니다." },
  { title: "구간별 혼잡도 계산", text: "경로의 역마다 공공데이터 혼잡도를 찾아 평균과 최댓값을 구하고 5단계로 바꿉니다." },
  { title: "빠른 길과 편한 길 비교", text: "소요 시간과 혼잡도를 함께 보여 주고, 고르는 것은 사용자가 합니다." },
];
export function HowItWorks() {
  return (
    <section>
      <SectionTitle eyebrow="작동 방식" title="계산은 데이터로,/안내는 AI로" />
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className={card}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#22E5FF] text-[16px] font-black text-[#0A0B1E]">{i + 1}</span>
            <h3 className="mt-4 text-[19px] font-black">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">{s.text}</p>
          </li>
        ))}
      </ol>
      <p className={`${card} mt-4 text-[15px] leading-relaxed text-[#A9A6D6]`}>
        <strong className="text-[#39FFB0]">AI 안내 도우미</strong>는 빠른하차정보·교통약자이용정보에서 찾은 자료만 근거로 답하고,
        자료에 없는 내용은 지어내지 않고 못 찾았다고 알립니다. 경로의 시간과 혼잡도는 모두 공공데이터로 계산한 값입니다.
      </p>
    </section>
  );
}

// 4. 데이터 출처와 한계
export function SourcesLimits() {
  return (
    <section>
      <SectionTitle eyebrow="데이터와 한계" title="어떤 자료로,/어디까지 알 수 있을까" />
      <div className="grid gap-4 md:grid-cols-2">
      <div className={card}>
        <h3 className="text-[19px] font-black">사용하는 공공데이터</h3>
        <ul className="mt-3 list-disc pl-5 text-[15px] leading-relaxed text-[#A9A6D6]">
          <li>서울교통공사 지하철혼잡도정보 (1~8호선, 30분 단위)</li>
          <li>서울교통공사 최단경로이동정보 Open API</li>
          <li>서울교통공사 빠른하차정보·교통약자이용정보 Open API (AI 안내 도우미 근거)</li>
          <li>역 정보, 역간 소요시간, 환승 소요시간 자료</li>
        </ul>
      </div>
      <div className={card}>
        <h3 className="text-[19px] font-black">미리 알려 드릴 한계</h3>
        <ul className="mt-3 list-disc pl-5 text-[15px] leading-relaxed text-[#A9A6D6]">
          <li>분기 평균 통계로 계산한 예측이라 오늘의 실제 혼잡과 다를 수 있습니다.</li>
          <li>혼잡도 자료가 있는 1~8호선 구간만 계산합니다.</li>
          <li>사고·지연처럼 갑자기 생기는 일은 아직 반영하지 않습니다.</li>
          <li>엘리베이터 가동 여부는 수시로 바뀌어 안내 도우미 답에 넣지 않습니다.</li>
        </ul>
      </div>
      </div>
    </section>
  );
}

// 5. 로드맵
const STATUS = {
  done: { label: "완료", color: "#39FFB0" },
  now: { label: "진행 중", color: "#22E5FF" },
  next: { label: "예정", color: "#A9A6D6" },
};
export function Roadmap() {
  return (
    <section>
      <SectionTitle eyebrow="로드맵" title="지금 만들고 있습니다" />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROADMAP.map((r) => (
          <li key={r.title} className={`${card} flex items-center gap-4 py-5`}>
            <span className="whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-bold"
              style={{ color: STATUS[r.status].color, boxShadow: `inset 0 0 0 1.5px ${STATUS[r.status].color}` }}>
              {STATUS[r.status].label}
            </span>
            <span className="text-[16px] font-bold">{r.title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// 6. 개발 기록 요약 (최근 3개)
export function RecentLog() {
  return (
    <section>
      <SectionTitle eyebrow="개발 기록" title="최근에 한 일" />
      <ul className="grid gap-4 md:grid-cols-3">
        {DEVLOG.slice(0, 3).map((d) => (
          <li key={d.date + d.title} className={card}>
            <p className="text-[14px] font-bold text-[#A9A6D6]">{d.date}</p>
            <h3 className="mt-1 text-[18px] font-black">{d.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">{d.items[0]}</p>
          </li>
        ))}
      </ul>
      <Link to="/log" className="mt-4 inline-flex min-h-[44px] items-center text-[15px] font-bold text-[#22E5FF]">개발 기록 전체 보기 →</Link>
    </section>
  );
}

// 7. 피드백 받기
export function Feedback() {
  return (
    <section className={`${card} flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between md:p-8`}>
      <div>
        <h2 className="text-[24px] font-black"><Phrases text="써 보고/불편한 점을 알려 주세요" /></h2>
        <p className="mt-2 text-[15px] text-[#A9A6D6]">받은 의견은 개발 기록에 남기고, 고친 내용을 함께 적습니다.</p>
      </div>
      {/* 외부 설문은 제출 뒤 돌아올 길이 없어 새 탭으로 엽니다(↗ 표시로 예고) */}
      {FEEDBACK_URL ? (
        <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-[48px] items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FF2E97] px-7 text-[17px] font-bold text-[#0A0B1E]">
          의견 보내기 <span aria-hidden="true">↗</span><span className="sr-only">(새 창에서 열림)</span>
        </a>
      ) : (
        <span className="text-[15px] text-[#A9A6D6]">의견 받는 창구를 준비하고 있어요.</span>
      )}
    </section>
  );
}
