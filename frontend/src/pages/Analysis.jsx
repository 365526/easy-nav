import { useSearchParams } from "react-router-dom";
import Phrases from "../components/Phrases.jsx";
import DataIntro from "../components/analysis/DataIntro.jsx";
import Heatmap from "../components/analysis/Heatmap.jsx";
import RankList from "../components/analysis/RankList.jsx";

// 분석 탭 목록: 탭을 더할 때는 이 표에 한 줄을 추가합니다.
const TABS = [
  { id: "intro", label: "데이터 소개", Page: DataIntro },
  { id: "heatmap", label: "히트맵", Page: Heatmap },
  { id: "rank", label: "혼잡 순위", Page: RankList },
];

export default function Analysis() {
  // 주소 뒤의 ?tab=heatmap 처럼 고른 탭을 기억합니다. 발표 때 탭 주소를 바로 열 수 있습니다.
  const [params, setParams] = useSearchParams();
  const current = TABS.find((t) => t.id === params.get("tab")) || TABS[0];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">혼잡도 분석</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="언제, 어디가/붐빌까" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          서울교통공사 지하철혼잡도정보(1~8호선, 30분 단위)를 정리해 붐비는 시간과 장소를 보여 줍니다.
          <br />
          혼잡도는 정원 대비 탄 사람의 비율이고, 좌석이 모두 찼을 때가 34%입니다.
        </p>
      </section>

      <div role="tablist" aria-label="분석 탭" className="flex gap-2 rounded-full border border-[#2C2366] bg-[#120E2E] p-1 sm:self-start">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`min-h-[44px] flex-1 whitespace-nowrap rounded-full px-5 text-[15px] font-bold sm:flex-none ${
              t.id === current.id ? "bg-[#22E5FF] text-[#0A0B1E]" : "text-[#A9A6D6] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={current.label}>
        <current.Page />
      </div>
    </div>
  );
}
