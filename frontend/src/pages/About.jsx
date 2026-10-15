import LevelBadge, { LEVELS, People } from "../components/LevelBadge.jsx";
import Phrases from "../components/Phrases.jsx";

const STEPS = [
  { title: "빠른 길과 편한 길을 나란히", text: "출발역, 도착역, 출발 시각을 넣으면 소요 시간과 지나가는 구간의 혼잡도를 함께 따져 두 길을 보여 줍니다." },
  { title: "혼잡도는 5단계로", text: "퍼센트 대신 색과 사람 그림으로 얼마나 붐비는지 바로 읽히게 합니다." },
  { title: "추천 이유는 한 줄로", text: "“5분 더 걸리지만 가장 붐비는 구간을 피해 갈 수 있어요”처럼 AI가 이유를 짧게 설명합니다." },
];

export default function About() {
  return (
    <div className="flex flex-col gap-12">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">서비스 소개</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="몇 분 더 쓰면,/얼마나 덜 붐빌까?" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          지하철 길찾기 앱은 가장 빠른 길과 환승이 적은 길을 알려 줍니다. 퇴근길처럼 붐비는 시간에는 몇 분 더 걸려도
          덜 붐비는 길이 나을 때가 있습니다. 이 서비스는 소요 시간과 혼잡도를 함께 비교해 고를 수 있게 돕습니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6">
            <p className="text-[14px] font-bold text-[#FF2E97]">0{i + 1}</p>
            <h2 className="mt-2 text-[20px] font-black">{s.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">{s.text}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-[24px] font-black">혼잡도 5단계 기준</h2>
        <p className="mt-2 text-[15px] text-[#A9A6D6]">혼잡도 = 탑승 인원 ÷ 정원 × 100. 정원만큼 탔을 때가 100%입니다.</p>
        <ul className="mt-5 flex flex-col gap-3">
          {LEVELS.map((l) => (
            <li key={l.lv} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[#2C2366] bg-[#120E2E] px-5 py-4">
              <span className="w-[130px]"><LevelBadge lv={l.lv} /></span>
              <People n={l.lv} size={16} />
              <span className="min-w-[200px] flex-1 text-[16px] font-bold">{l.feel}</span>
              <span className="text-[14px] text-[#A9A6D6]">{l.range}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6">
        <h2 className="text-[20px] font-black">사용하는 공공데이터</h2>
        <ul className="mt-3 list-disc pl-5 text-[15px] leading-relaxed text-[#A9A6D6]">
          <li>서울교통공사 지하철혼잡도정보 (1~8호선, 30분 단위)</li>
          <li>서울교통공사 최단경로이동정보 Open API</li>
          <li>역 정보, 역간 소요시간, 환승 소요시간 자료</li>
        </ul>
      </section>
    </div>
  );
}
