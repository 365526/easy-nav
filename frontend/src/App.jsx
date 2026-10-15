import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import About from "./pages/About.jsx";
import RouteFinder from "./pages/RouteFinder.jsx";
import Analysis from "./pages/Analysis.jsx";
import Team from "./pages/Team.jsx";
import DevLog from "./pages/DevLog.jsx";

// 탭 목록: 탭을 더하거나 이름을 바꿀 때는 이 표만 고칩니다.
const TABS = [
  // short: 휴대폰처럼 좁은 화면(640px 미만)에서 탭 6개를 한 줄에 넣기 위한 짧은 이름
  { to: "/", label: "홈", short: "홈" },
  { to: "/about", label: "서비스 소개", short: "소개" },
  { to: "/route", label: "경로 찾기", short: "경로" },
  { to: "/analysis", label: "혼잡도 분석", short: "분석" },
  { to: "/team", label: "팀", short: "팀" },
  { to: "/log", label: "개발 기록", short: "기록" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-[#0A0B1E] text-[#F2F4FF]">
      <header className="sticky top-0 z-20 border-b border-[#2C2366] bg-[#0A0B1E]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between lg:max-w-[calc(var(--stagew)+32px)]">
          <NavLink to="/" className="inline-flex items-center gap-2 text-[18px] font-black">
            {/* 로고: 분홍(빠른 길)과 하늘(편한 길)이 교차해 목적지(흰 점)로 */}
            <svg width="44" height="22" viewBox="-140 -70 280 140" aria-hidden="true" style={{ overflow: "visible", filter: "drop-shadow(0 0 4px #22E5FF88)" }}>
              <path d="M-120 40 C -60 40, -40 -40, 0 -40" fill="none" stroke="#FF2E97" strokeWidth="22" strokeLinecap="round" />
              <path d="M-120 -40 C -60 -40, -40 40, 0 40 C 40 40, 60 0, 110 0" fill="none" stroke="#22E5FF" strokeWidth="22" strokeLinecap="round" />
              <circle cx="110" cy="0" r="28" fill="#F2F4FF" />
            </svg>
            빨리 갈까, 편하게 갈까?
          </NavLink>
          {/* 탭: 좁은 화면에서는 화면 폭에 고르게 나눠 한 줄, 넓은 화면에서는 오른쪽 정렬 */}
          <nav aria-label="주요 메뉴" className="flex w-full justify-between gap-1 md:w-auto md:justify-end">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === "/"}
                className={({ isActive }) =>
                  `inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full px-3 text-[15px] font-bold sm:px-4 ${
                    isActive ? "bg-[#22E5FF] text-[#0A0B1E]" : "text-[#A9A6D6] hover:text-white"
                  }`
                }
              >
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 pb-8 pt-4 md:pb-12 md:pt-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/route" element={<RouteFinder />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/team" element={<Team />} />
          <Route path="/log" element={<DevLog />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      <footer className="border-t border-[#2C2366] px-4 py-6 text-center text-[13px] leading-relaxed text-[#A9A6D6]">
        정보영재교수학습프로그램개발 · 인공지능기반 개발실습 팀 프로젝트<br />
        서울 지하철 1~8호선 공공데이터 기반
      </footer>
    </div>
  );
}
