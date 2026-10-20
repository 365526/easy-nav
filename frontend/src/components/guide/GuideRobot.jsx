import { useId } from "react";
import { robotShapes } from "./robot.js";

// 지하철 로봇 그림. face: "work"(찾는 중) · "done"(안내 완료) · "error"(못 찾음)
//  좌우를 뒤집어(scaleX(-1)) 오른쪽 말풍선을 바라보게 합니다.
//  발광하는 칸은 흐리게 한 겹 더 그려 빛나 보이게 하고, 찾는 중 점은 blink 클래스로 하나씩 켭니다.
export default function GuideRobot({ face = "done", className = "" }) {
  const glowId = `glow${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // 필터 이름에 쓸 수 있게 글자·숫자만 남김
  const { shapes, viewBox } = robotShapes(face);
  const poly = (s, i, glow) => (
    <polygon key={i} points={s.points} fill={s.fill} stroke={glow ? "none" : s.fill} strokeWidth={glow ? 0 : 0.4} />
  );
  const still = shapes.filter((s) => s.order === undefined);
  const blinking = [0, 1, 2].map((k) => shapes.filter((s) => s.order === k));
  return (
    <svg viewBox={viewBox} role="img" aria-label="AI 안내 도우미 캐릭터" className={`shrink-0 -scale-x-100 ${className}`}>
      <defs>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {still.map((s, i) => poly(s, i))}
      <g filter={`url(#${glowId})`} opacity="0.85">{still.filter((s) => s.glow).map((s, i) => poly(s, i, true))}</g>
      {blinking.map((group, k) =>
        group.length ? (
          <g key={k} className={`blink blink${k}`}>
            <g filter={`url(#${glowId})`}>{group.map((s, i) => poly(s, i, true))}</g>
            {group.map((s, i) => poly(s, i))}
          </g>
        ) : null,
      )}
    </svg>
  );
}
