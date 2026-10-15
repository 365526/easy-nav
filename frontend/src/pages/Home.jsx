import { Link } from "react-router-dom";
import ShowReel from "../components/ShowReel.jsx";
import DepartureDemo from "../components/DepartureDemo.jsx";
import { SectionTitle, DataFact, HowItWorks, SourcesLimits, Roadmap, RecentLog, Feedback } from "../components/HomeSections.jsx";

// 홈 화면: 쇼릴 → 시작하기 → 근거 → 체험 → 작동 방식 → 출처와 한계 → 로드맵 → 개발 기록 → 의견
export default function Home() {
  return (
    <div className="flex flex-col gap-16 md:gap-24">
      <div className="flex flex-col gap-8">
        {/* 「게임 하기」 버튼은 public/game/index.html(본 게임)을 새 탭으로 엽니다. fitOffset은 상단 바·여백 높이(px)로, 쇼릴이 한 화면에 들어가게 맞춥니다 */}
        {/* 넓은 화면에서는 상단 바와 같은 폭(--stagew)으로 넓혀 좌우 끝을 맞춤. 전체 화면 보기가 화면 기준으로 펴지도록 transform 대신 margin으로 가운데 정렬 */}
        <div className="w-full lg:ml-[calc(50%-var(--stagew)/2)] lg:w-[var(--stagew)]">
          <ShowReel
            gameHref="/game/index.html"
            fitOffset={117}
            cta={<>
              <Link to="/route" className="inline-flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-[#39FFB0] to-[#22E5FF] px-2 text-[12px] font-bold text-[#0A0B1E] sm:text-[14px] lg:min-h-[48px] lg:px-3 lg:text-[17px]">
                경로 찾기<span className="hidden sm:inline">{"\u00a0시작"}</span>
              </Link>
              <Link to="/about" className="inline-flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-full border border-[#2C2366] px-2 text-[12px] font-bold sm:text-[14px] lg:min-h-[48px] lg:px-3 lg:text-[17px]">
                서비스 소개<span className="hidden sm:inline">{"\u00a0보기"}</span>
              </Link>
            </>}
          />
        </div>
      </div>

      <DataFact />

      <section>
        <SectionTitle eyebrow="직접 해 보기" title="한 시간 늦게 나서면/어떨까" text="막대를 누르거나 슬라이더를 움직여 출발 시각을 바꿔 보세요." />
        <DepartureDemo />
      </section>

      <HowItWorks />
      <SourcesLimits />
      <Roadmap />
      <RecentLog />
      <Feedback />
    </div>
  );
}
