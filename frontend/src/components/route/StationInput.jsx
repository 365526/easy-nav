import { useApi } from "../../api.jsx";

// 역 이름 입력 칸: 글자를 넣으면 서버의 역 검색(/stations)으로 추천 목록을 보여 줍니다.
export default function StationInput({ id, label, value, onChange }) {
  const keyword = value.trim();
  const { data } = useApi(keyword ? "/stations" : null, { keyword });
  // 환승역은 호선마다 한 줄씩 오므로 이름으로 묶습니다. 예: 사당 → 2호선 · 4호선
  const names = {};
  for (const s of data || []) (names[s.name] ||= []).push(s.line);

  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-2">
      <span className="text-[15px] font-bold">{label}</span>
      <input
        id={id}
        list={`${id}-list`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="역 이름 (예: 신도림)"
        autoComplete="off"
        required
        className="min-h-[48px] w-full min-w-0 rounded-xl border border-[#2C2366] bg-[#0A0B1E] px-4 text-[17px] font-bold text-white placeholder:font-normal placeholder:text-[#6E6A9E] focus:border-[#22E5FF] focus:outline-none"
      />
      <datalist id={`${id}-list`}>
        {Object.entries(names).map(([name, lines]) => (
          <option key={name} value={name} label={lines.join(" · ")} />
        ))}
      </datalist>
    </label>
  );
}
