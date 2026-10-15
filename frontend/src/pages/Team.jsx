import Phrases from "../components/Phrases.jsx";
const ROLES = [
  { title: "기획 및 발표", text: "서비스 방향과 발표 흐름을 정하고, 소개 자료와 시연을 맡습니다." },
  { title: "시스템 구현", text: "데이터 정리, 서버, 화면, 배포를 구현합니다." },
  { title: "자료 조사", text: "공공데이터의 항목과 기준을 확인하고 문서로 정리합니다." },
  { title: "사용성 검증", text: "배포된 화면을 직접 써 보고 불편한 점과 오류를 기록합니다." },
];

export default function Team() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">팀</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="함께/만드는 사람들" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          구현은 한 명이 주도하되, 팀원들과 메신저로 의견을 나누며 진행합니다.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((r, i) => (
          <div key={r.title} className="rounded-2xl border border-[#2C2366] bg-[#120E2E] p-6">
            <p className="text-[14px] font-bold text-[#39FFB0]">역할 {i + 1}</p>
            <h2 className="mt-2 text-[22px] font-black">{r.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">{r.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
