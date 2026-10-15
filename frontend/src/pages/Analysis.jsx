import Phrases from "../components/Phrases.jsx";
const PLANNED = [
  { title: "데이터 소개", text: "어떤 자료로 혼잡도를 계산하는지 보여 줍니다." },
  { title: "시간대별", text: "역과 방향을 고르면 30분 단위 혼잡도를 선으로 그립니다." },
  { title: "히트맵", text: "역과 시간대를 한 판에 놓고 붐비는 곳을 색으로 찾습니다." },
  { title: "순위", text: "가장 붐비는 역과 시간대를 순서대로 보여 줍니다." },
  { title: "사례", text: "같은 길을 30분 일찍, 늦게 나섰을 때를 비교합니다." },
];

export default function Analysis() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-[15px] font-bold tracking-[.14em] text-[#22E5FF]">혼잡도 분석</p>
        <h1 className="mt-2 text-[32px] font-black leading-tight md:text-[44px]"><Phrases text="언제, 어디가/붐빌까" /></h1>
        <p className="mt-4 max-w-[720px] text-[17px] leading-relaxed text-[#A9A6D6]">
          분석 페이지는 다섯 개 탭으로 만들 예정입니다. 데이터를 데이터베이스에 넣은 뒤 하나씩 채웁니다.
        </p>
      </section>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANNED.map((p, i) => (
          <li key={p.title} className="rounded-2xl border border-dashed border-[#2C2366] p-6">
            <p className="text-[14px] font-bold text-[#A9A6D6]">탭 {i + 1} · 준비 중</p>
            <h2 className="mt-2 text-[20px] font-black">{p.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#A9A6D6]">{p.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
