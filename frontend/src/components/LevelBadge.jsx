// 혼잡도 5단계 기준: 기준을 바꿀 때는 이 표만 고칩니다. (backend의 congestion_level.py와 같은 기준)
export const LEVELS = [
  { lv: 1, name: "여유", color: "#8FBCE6", range: "34% 이하", feel: "자리에 앉아 갈 수 있어요" },
  { lv: 2, name: "보통", color: "#8CCBA6", range: "35~60%", feel: "서서 가도 편안해요" },
  { lv: 3, name: "약간 붐빔", color: "#F0C766", range: "61~90%", feel: "옆 사람과 어깨가 닿아요" },
  { lv: 4, name: "혼잡", color: "#E0853A", range: "91~120%", feel: "몸이 밀릴 만큼 붐벼요" },
  { lv: 5, name: "매우 혼잡", color: "#9A2E08", range: "121% 이상", feel: "움직이기도 어려워요" },
];

// 사람 5명 그림: 채워진 사람 수가 단계입니다.
export function People({ n, size = 14, color = "currentColor" }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`사람 5명 중 ${n}명`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size * 1.35} viewBox="0 0 22 30" style={{ opacity: i <= n ? 1 : 0.25 }} aria-hidden="true">
          <circle cx="11" cy="6" r="5" fill={color} />
          <path d="M1 30V20a10 10 0 0 1 20 0v10z" fill={color} />
        </svg>
      ))}
    </span>
  );
}

// 단계 배지: 단계 색 바탕에 "3단계 약간 붐빔"처럼 씁니다.
export default function LevelBadge({ lv }) {
  const { name, color } = LEVELS[lv - 1];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[14px] font-bold"
      style={{ background: color, color: lv === 5 ? "#FEFDFB" : "#14213A" }}
    >
      {lv}단계 {name}
    </span>
  );
}
