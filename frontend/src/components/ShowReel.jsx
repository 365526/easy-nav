import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Search, ArrowRight, RotateCcw, Play, Pause, Volume2, VolumeX,
  Zap, Sofa, Clock, Sparkles, MapPin, Database, Timer, BarChart3,
} from "lucide-react";
import { startMiniGame } from "./miniGame.js";

/* 빨리 갈까, 편하게 갈까? · 45초 모션 쇼릴 (2.5D 아이소메트릭 · 네온)
   - 1280×720 설계 화면을 컨테이너 폭에 맞춰 축소·확대
   - 배치 격자: 바깥 여백 좌우 80px·위아래 72px, 12열(열 64px + 간격 32px)
   - 열차 장면은 아이소메트릭 좌표(iso)로 그리고, 카메라(확대·이동)로 연출
   - 소리는 사용자가 버튼을 누른 뒤에만 Web Audio로 합성해 재생 */

const DUR = 45;
const SCENES = [
  { id: 1, from: 0, to: 5, label: "훅" },
  { id: 2, from: 5, to: 10.5, label: "숨 막히는 퇴근길" },
  { id: 3, from: 10.5, to: 14.5, label: "해결책은?" },
  { id: 4, from: 14.5, to: 23.5, label: "혼잡 경고" },
  { id: 5, from: 23.5, to: 33.5, label: "AI 추천 경로" },
  { id: 6, from: 33.5, to: 39.5, label: "여유로운 퇴근길" },
  { id: 7, from: 39.5, to: 45, label: "시작하기" },
];
const TR = 0.6;
const TRANS = { 2: "zoom", 3: "fade", 4: "fade", 5: "fade", 6: "cubeY", 7: "zoom" };

const M = 80, TOP = 72, BOTTOM = 72;
const col = (i) => M + i * 96;
const span = (n) => n * 96 - 32;

const C = {
  bg: "#0A0B1E", bg2: "#120E2E", panel: "rgba(24,18,62,.78)", line: "#2C2366", fg: "#F2F4FF", sub: "#A9A6D6",
  blue: "#3D7BFF", cyan: "#22E5FF", pink: "#FF2E97", green: "#39FFB0", red: "#FF3B5C", violet: "#7A5CFF",
  l1: "#8FBCE6", l2: "#8CCBA6", l3: "#F0C766", l4: "#E0853A", l5: "#B23A12",
};
const LV = { 1: ["여유", C.l1], 2: ["보통", C.l2], 3: ["약간 붐빔", C.l3], 4: ["혼잡", C.l4], 5: ["매우 혼잡", C.l5] };
const levelOf = (v) => (v <= 34 ? 1 : v <= 60 ? 2 : v <= 90 ? 3 : v <= 120 ? 4 : 5);

const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const p = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const out = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const rise = (t, a, b, dist = 24) => ({ opacity: p(t, a, b), transform: `translateY(${(1 - out(p(t, a, b))) * dist}px)` });
const slide = (t, a, b, dist = 40) => ({ opacity: p(t, a, b), transform: `translateX(${(1 - out(p(t, a, b))) * dist}px)` });
const pop = (t, a, b) => ({ opacity: p(t, a, a + 0.05), transform: `scale(${t < a ? 0.6 : back(p(t, a, b))})` });
const neon = (c, a = 0.55) => ({ boxShadow: `0 0 0 1px ${c}, 0 0 18px ${c}${Math.round(clamp(a) * 255).toString(16).padStart(2, "0")}, inset 0 0 18px ${c}22` });
const gradText = (a, b) => ({ backgroundImage: `linear-gradient(90deg, ${a}, ${b})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" });

/* ---------- 공용 그라데이션·발광 효과 (한 번만 정의) ---------- */
function SharedDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <linearGradient id="hz-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE3D1" /><stop offset="1" stopColor="#F2B596" /></linearGradient>
        <linearGradient id="hz-hood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4C86FF" /><stop offset="1" stopColor="#6B3DF0" /></linearGradient>
        <linearGradient id="hz-floor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1C1548" /><stop offset="1" stopColor="#0E0B2A" /></linearGradient>
        <linearGradient id="hz-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A1446" /><stop offset="1" stopColor="#120E33" /></linearGradient>
        <linearGradient id="hz-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07081A" /><stop offset="1" stopColor="#161040" /></linearGradient>
        <linearGradient id="hz-calm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#39FFB0" /><stop offset="1" stopColor="#22E5FF" /></linearGradient>
        <radialGradient id="hz-heat" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FF3B5C" stopOpacity="0.45" /><stop offset="1" stopColor="#FF3B5C" stopOpacity="0" /></radialGradient>
        <radialGradient id="hz-redvig" cx="50%" cy="50%" r="70%"><stop offset="55%" stopColor="#2A0010" stopOpacity="0" /><stop offset="100%" stopColor="#3A0016" stopOpacity="0.85" /></radialGradient>
        <radialGradient id="hz-cyanvig" cx="50%" cy="45%" r="70%"><stop offset="50%" stopColor="#001A2A" stopOpacity="0" /><stop offset="100%" stopColor="#050818" stopOpacity="0.8" /></radialGradient>
        <radialGradient id="hz-phone" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#22E5FF" stopOpacity="0.75" /><stop offset="1" stopColor="#3D7BFF" stopOpacity="0" /></radialGradient>
        <linearGradient id="hz-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#22E5FF" stopOpacity="0.35" /><stop offset="1" stopColor="#22E5FF" stopOpacity="0" /></linearGradient>
        <linearGradient id="hz-floorDay" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0B3A33" /><stop offset="1" stopColor="#062420" /></linearGradient>
        <linearGradient id="hz-wallDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B302C" /><stop offset="1" stopColor="#071E1D" /></linearGradient>
        <linearGradient id="hz-winDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#041815" /><stop offset="1" stopColor="#0C3A35" /></linearGradient>
        <radialGradient id="hz-dayvig" cx="50%" cy="45%" r="72%"><stop offset="50%" stopColor="#021412" stopOpacity="0" /><stop offset="100%" stopColor="#020D10" stopOpacity="0.8" /></radialGradient>
        <filter id="hz-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="hz-glow2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="10" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
    </svg>
  );
}

/* ---------- 작은 부품 ---------- */
// 기기 구분: 터치 화면이면서 짧은 변이 600px보다 작으면 휴대폰, 그 이상이면 태블릿 (기기를 돌려도 같은 판단)
const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer:coarse)").matches;
const isPhone = () => isTouch() && Math.min(innerWidth, innerHeight) < 600;
// 기기(화면 자체)가 세로로 서 있는지: 앱 창 크기가 아니라 기기 방향으로 판단 (태블릿에서 앱을 창으로 띄워도 정확하게)
const deviceUpright = () => {
  try { if (screen.orientation && screen.orientation.type) return screen.orientation.type.startsWith("portrait"); } catch (e) { /* 무시 */ }
  if (typeof window.orientation === "number") return window.orientation % 180 === 0;
  return screen.height > screen.width;
};
// 한 줄 설명 글귀를 바로 위 제목 줄의 '잉크'(실제로 칠해진 글자 모양) 폭에 맞춤
//  왼쪽: 제목 첫 글자 아래쪽(예: '빨'의 받침 ㄹ)이 시작하는 지점
//  오른쪽: 제목 마지막 글자 아래쪽(예: '?'의 아래 점)이 끝나는 지점
//  설명 글귀의 첫 글자 잉크를 왼쪽 지점에 붙이고, 마지막 글자 잉크가 오른쪽 지점에 닿도록 자간을 넓힘
const _cv = typeof document !== "undefined" ? document.createElement("canvas") : null;
function inkX(ch, font, px, from = 0, to = 1) {
  // 글자 하나를 그려서, 세로 범위 from~to(글자 잉크 높이 비율) 안에서 가장 왼쪽·오른쪽 칠해진 열을 찾음
  if (!(px > 0)) return { l: 0, r: 0 };
  const S = Math.ceil(px * 3), c = _cv; c.width = S; c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.clearRect(0, 0, S, S); g.font = font; g.fillStyle = "#000"; g.textBaseline = "alphabetic";
  const ox = px, oy = px * 2; g.fillText(ch, ox, oy);
  const d = g.getImageData(0, 0, S, S).data;
  let top = S, bot = -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 40) { if (y < top) top = y; if (y > bot) bot = y; break; }
  if (bot < 0) return { l: 0, r: g.measureText(ch).width };
  const y0 = Math.floor(top + (bot - top) * from), y1 = Math.ceil(top + (bot - top) * to);
  let l = S, r = -1;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 40) { if (x < l) l = x; if (x > r) r = x; }
  return { l: l - ox, r: r + 1 - ox };
}
function FitWidth({ children, className = "", style }) {
  const box = useRef(null);
  const [fit, setFit] = useState({ ls: 0, ml: 0 });
  useLayoutEffect(() => {
    const p = box.current; if (!p || !_cv) return;
    const run = () => {
      const above = p.previousElementSibling; if (!above) return;
      const cs1 = getComputedStyle(above), cs2 = getComputedStyle(p);
      const f1 = `${cs1.fontWeight} ${cs1.fontSize} ${cs1.fontFamily}`, f2 = `${cs2.fontWeight} ${cs2.fontSize} ${cs2.fontFamily}`;
      const s1 = parseFloat(cs1.fontSize), s2 = parseFloat(cs2.fontSize);
      if (!(s1 > 0 && s2 > 0)) return;
      const t1 = [...above.textContent], t2 = [...p.textContent];
      const g = _cv.getContext("2d");
      g.font = f1; const lastStart1 = g.measureText(t1.join("")).width - g.measureText(t1[t1.length - 1]).width;
      const L = inkX(t1[0], f1, s1, 0.55, 1).l;                               // 첫 글자 아래쪽(받침) 시작
      const R = lastStart1 + inkX(t1[t1.length - 1], f1, s1, 0.8, 1).r;       // 마지막 글자 아래쪽(점) 끝
      g.font = f2; const nat = g.measureText(t2.join("")).width, advLast = g.measureText(t2[t2.length - 1]).width;
      const subL = inkX(t2[0], f2, s2).l, subR = inkX(t2[t2.length - 1], f2, s2).r;
      const ml = L - subL;
      const ls = t2.length > 1 ? (R - ml - (nat - advLast) - subR) / (t2.length - 1) : 0;
      setFit((v) => (Math.abs(v.ls - ls) < 0.05 && Math.abs(v.ml - ml) < 0.05 ? v : { ls, ml }));
    };
    run();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  }, [children]);
  return (
    <p ref={box} className={className} style={{ ...style, letterSpacing: `${fit.ls}px`, marginLeft: `${fit.ml}px`, marginRight: `-${fit.ls}px` }}>{children}</p>
  );
}
function Mark({ t, start, size = 72 }) {
  const d1 = ease(p(t, start, start + 0.7));
  const d2 = ease(p(t, start + 0.1, start + 0.9));
  const dot = t < start + 0.8 ? 0 : back(p(t, start + 0.8, start + 1.1));
  return (
    <svg width={size} height={size * 0.6} viewBox="-140 -70 280 140" aria-hidden="true" style={{ overflow: "visible" }}>
      <path d="M-120 40 C -60 40, -40 -40, 0 -40" fill="none" stroke={C.pink} strokeWidth="22" strokeLinecap="round" filter="url(#hz-glow)"
        pathLength="1" strokeDasharray="1" strokeDashoffset={1 - d1} />
      <path d="M-120 -40 C -60 -40, -40 40, 0 40 C 40 40, 60 0, 110 0" fill="none" stroke={C.green} strokeWidth="22" strokeLinecap="round" filter="url(#hz-glow)"
        pathLength="1" strokeDasharray="1" strokeDashoffset={1 - d2} />
      <circle cx="110" cy="0" r={28 * dot} fill={C.fg} filter="url(#hz-glow2)" />
    </svg>
  );
}

function People({ n, size = 16, color = C.fg }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`사람 5명 중 ${n}명`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size * 1.35} viewBox="0 0 22 30" style={{ opacity: i <= n ? 1 : 0.22 }}>
          <circle cx="11" cy="6" r="5" fill={color} />
          <path d="M1 30V20a10 10 0 0 1 20 0v10z" fill={color} />
        </svg>
      ))}
    </span>
  );
}

function Badge({ lv }) {
  const [name, c] = LV[lv];
  return (
    <span className="whitespace-nowrap rounded-full px-3 py-[3px] text-[14px] font-bold" style={{ background: c, color: lv === 5 ? C.fg : C.bg, boxShadow: `0 0 12px ${c}88` }}>
      {lv}단계 {name}
    </span>
  );
}

function Strip({ levels, grow = 1 }) {
  return (
    <div className="flex gap-[3px]">
      {levels.map((l, i) => (
        <span key={i} className="h-[10px] flex-1 rounded-[3px]"
          style={{ background: LV[l][1], transform: `scaleX(${clamp(grow * levels.length - i)})`, transformOrigin: "left" }} />
      ))}
    </div>
  );
}

// 아이소메트릭 바닥 격자 배경
function IsoGrid({ t, a = 0.5, color = C.line }) {
  return (
    <div className="absolute inset-0" style={{
      background: `repeating-linear-gradient(30deg, transparent 0 46px, ${color} 46px 47px), repeating-linear-gradient(150deg, transparent 0 46px, ${color} 46px 47px)`,
      backgroundPosition: `${t * 14}px ${t * 8}px`, opacity: a,
    }} />
  );
}

/* ---------- 아이소메트릭 좌표 ---------- */
const S = 78, OX = 420, OY = 150;
const iso = (x, y, z = 0) => [OX + (x - y) * 0.866 * S, OY + (x + y) * 0.5 * S - z * S];
const pts = (...ps) => ps.map((q) => iso(...q).map((v) => v.toFixed(1)).join(",")).join(" ");
const L = 14, W = 3.6, H = 2.7;

/* ---------- 주인공: 캐주얼 후드 + 목에 건 헤드폰, 20대 남성 ----------
   발끝이 (0,0), 위쪽이 음수. pose: hang(손잡이) · hangPhone(손잡이+휴대폰) · sit(앉기)
   mood: stress(지침) · pain(치임) · happy(웃음) */
function Hero({ pose = "hang", mood = "stress", look = 0, glow = 0, t = 0, rim = C.red }) {
  const sit = pose === "sit";
  const up = sit ? 28 : 0;
  const ink = "#241A44", skin = "url(#hz-skin)", sleeve = "#4070F5", hoodDark = "#2C3CB4", pants = "#1D1A44";
  const dx = look * 5;
  const raised = pose === "hang" || pose === "hangPhone";
  return (
    <g>
      {raised && (
        <g>
          <line x1="-20" y1="-244" x2="-20" y2="-226" stroke="#8C84D0" strokeWidth="3" />
          <ellipse cx="-20" cy="-214" rx="8" ry="11" fill="none" stroke="#A79FEA" strokeWidth="3" />
          <path d="M-22 -128 C -30 -160, -26 -190, -20 -206" stroke={sleeve} strokeWidth="15" fill="none" strokeLinecap="round" />
          <path d="M-16 -132 C -22 -160, -19 -188, -15 -202" stroke={rim} strokeWidth="2" fill="none" opacity="0.6" />
          <circle cx="-20" cy="-209" r="7.5" fill={skin} />
        </g>
      )}
      {/* 다리와 신발 */}
      {sit ? (
        <g>
          <rect x="-16" y="-40" width="13" height="36" rx="6" fill={pants} />
          <rect x="3" y="-40" width="13" height="36" rx="6" fill={pants} />
          <ellipse cx="-9" cy="-41" rx="11.5" ry="8" fill="#29265A" />
          <ellipse cx="9" cy="-41" rx="11.5" ry="8" fill="#29265A" />
        </g>
      ) : (
        <g>
          <rect x="-15" y="-76" width="12" height="72" rx="6" fill={pants} />
          <rect x="3" y="-76" width="12" height="72" rx="6" fill={pants} />
        </g>
      )}
      <ellipse cx="-9" cy="-4" rx="10" ry="5.5" fill="#ECEEFF" />
      <ellipse cx="9" cy="-4" rx="10" ry="5.5" fill="#ECEEFF" />
      <path d="M-18 -1 H-1 M1 -1 H18" stroke={C.cyan} strokeWidth="2" opacity="0.8" />

      <g transform={`translate(0 ${up})`}>
        {/* 후드 뒷부분 */}
        <ellipse cx="0" cy="-134" rx="27" ry="11" fill={hoodDark} />
        {/* 몸통(후드티) */}
        <path d="M-28 -126 Q-29 -136 -18 -139 L18 -139 Q29 -136 28 -126 L30 -80 Q30 -70 20 -70 L-20 -70 Q-30 -70 -30 -80 Z" fill="url(#hz-hood)" />
        <path d="M6 -139 L18 -139 Q29 -136 28 -126 L30 -80 Q30 -70 20 -70 L6 -70 Z" fill="#1A1060" opacity="0.28" />
        <path d="M27 -127 L29.5 -80" stroke={rim} strokeWidth="2.5" opacity="0.75" strokeLinecap="round" />
        <rect x="-15" y="-98" width="30" height="18" rx="7" fill={hoodDark} opacity="0.7" />
        <path d="M-18 -139 Q0 -127 18 -139" stroke={hoodDark} strokeWidth="5" fill="none" />
        <path d="M-6 -134 L-7 -117 M6 -134 L7 -117" stroke="#EEF0FF" strokeWidth="2" strokeLinecap="round" />
        <circle cx="-7" cy="-116" r="1.8" fill="#EEF0FF" /><circle cx="7" cy="-116" r="1.8" fill="#EEF0FF" />

        {/* 팔 */}
        {pose === "hang" && (
          <g>
            <path d="M24 -128 C 30 -112, 31 -96, 29 -84" stroke={sleeve} strokeWidth="14" fill="none" strokeLinecap="round" />
            <circle cx="29" cy="-80" r="6.5" fill={skin} />
          </g>
        )}
        {pose === "hangPhone" && (
          <g>
            <path d="M24 -128 C 34 -112, 28 -104, 14 -110" stroke={sleeve} strokeWidth="14" fill="none" strokeLinecap="round" />
            <rect x="-5" y="-140" width="19" height="31" rx="4" fill="#0B1030" stroke="#6B7CFF" strokeWidth="1.5" />
            <rect x="-3" y="-137" width="15" height="25" rx="2" fill={C.cyan} opacity={0.5 + 0.5 * glow} />
            <circle cx="11" cy="-111" r="6.5" fill={skin} />
          </g>
        )}
        {sit && (
          <g>
            <path d="M-24 -128 C -31 -104, -24 -86, -11 -78" stroke={sleeve} strokeWidth="14" fill="none" strokeLinecap="round" />
            <path d="M24 -128 C 31 -104, 24 -86, 11 -78" stroke={sleeve} strokeWidth="14" fill="none" strokeLinecap="round" />
            <rect x="-9" y="-86" width="18" height="11" rx="3" fill="#0B1030" stroke="#6B7CFF" strokeWidth="1.2" />
            <rect x="-7" y="-84.5" width="14" height="8" rx="1.5" fill={C.cyan} opacity={0.35 + 0.5 * glow} />
            <circle cx="-9" cy="-76" r="6.5" fill={skin} /><circle cx="9" cy="-76" r="6.5" fill={skin} />
          </g>
        )}

        {/* 목 */}
        <rect x="-6" y="-148" width="12" height="12" rx="4" fill={skin} />

        {/* 머리 */}
        <circle cx="-22" cy="-163" r="5" fill={skin} />
        <circle cx="22" cy="-163" r="5" fill={skin} />
        <circle cx="0" cy="-165" r="23" fill={skin} />
        <path d="M14 -184 A23 23 0 0 1 21 -156" stroke={rim} strokeWidth="2" fill="none" opacity="0.55" />

        {/* 표정 */}
        <g transform={`translate(${dx} 3)`} stroke={ink} strokeLinecap="round" fill="none">
          {mood === "stress" && (
            <>
              <path d="M-14 -171 L-5 -176 M14 -171 L5 -176" strokeWidth="2.4" />
              <ellipse cx="-9" cy="-163" rx="2.6" ry="3" fill={ink} stroke="none" />
              <ellipse cx="9" cy="-163" rx="2.6" ry="3" fill={ink} stroke="none" />
              <path d="M-12.5 -166 L-5.5 -165.5 M12.5 -166 L5.5 -165.5" strokeWidth="2" />
              <path d="M-12 -159 Q-9 -157.5 -6 -159 M12 -159 Q9 -157.5 6 -159" stroke="#B07AA8" strokeWidth="1.3" opacity="0.7" />
              <path d="M-5 -152 q 2.5 -2.2 5 0 q 2.5 2.2 5 0" strokeWidth="2" />
            </>
          )}
          {mood === "pain" && (
            <>
              <path d="M-14 -170 L-4 -176 M14 -170 L4 -176" strokeWidth="2.6" />
              <path d="M-13 -167 L-6 -163.5 L-13 -160 M13 -167 L6 -163.5 L13 -160" strokeWidth="2.4" />
              <rect x="-6.5" y="-156" width="13" height="5.5" rx="2.5" fill="#FFFFFF" strokeWidth="1.6" />
              <path d="M-6 -153.2 H6" strokeWidth="1" />
            </>
          )}
          {mood === "happy" && (
            <>
              <path d="M-14 -173 Q-9 -176 -4 -173 M14 -173 Q9 -176 4 -173" strokeWidth="2.2" />
              <path d="M-13 -162 Q-9 -167 -5 -162 M13 -162 Q9 -167 5 -162" strokeWidth="2.4" />
              <path d="M-7 -154 Q0 -145 7 -154 Z" fill="#7A1F4A" strokeWidth="1.6" />
              <ellipse cx="-14" cy="-156" rx="4.5" ry="2.6" fill="#FF7AB6" opacity="0.45" stroke="none" />
              <ellipse cx="14" cy="-156" rx="4.5" ry="2.6" fill="#FF7AB6" opacity="0.45" stroke="none" />
            </>
          )}
        </g>
        {/* 캡모자(핑크): 정수리·띠·앞챙을 한 덩어리로 이어 붙임, 머리카락 없음 */}
        <g transform={`translate(${dx * 0.3} 0)`}>
          <path d="M-26.5 -167 C -28 -199, 28 -201, 26.5 -167 Q0 -163 -26.5 -167 Z" fill={C.pink} />
          <path d="M-22 -172 C -23 -191, -8 -197, 0 -195 C -9 -190, -14 -181, -15 -170 Z" fill="#FF8CCB" opacity="0.55" />
          <path d="M-26.5 -170 Q0 -165.5 26.5 -170 L26.5 -167 Q0 -162.5 -26.5 -167 Z" fill="#C9156F" />
          <path d={`M-22 -167.5 Q${4 + dx * 0.6} -158 ${33 + dx} -163 Q${35 + dx} -168 26.5 -168.5 Q0 -164 -22 -167.5 Z`} fill="#E01F84" />
          <path d={`M-20 -166.6 Q${4 + dx * 0.6} -158.6 ${31 + dx} -163.4`} stroke="#9E0F59" strokeWidth="1.2" fill="none" opacity="0.6" />
        </g>
        {(mood === "stress" || mood === "pain") && (
          <path d={`M26 ${-168 + Math.sin(t * 5) * 1.5} q 4 7 0 9 q -4 -2 0 -9 Z`} fill="#BDEBFF" />
        )}
        {glow > 0 && <circle cx="0" cy="-165" r="23" fill={C.cyan} opacity={glow * 0.22} />}
      </g>
    </g>
  );
}

/* ---------- 다른 승객: 얼굴을 생략한 부드러운 덩어리 ---------- */
const BODY = ["#2B2560", "#352A6E", "#1F2A5C", "#3A2358", "#26305E", "#40306E"];
function Person({ c, arm = "down", face = 0, seat = false, rim = C.red, rimA = 0.5, phone = false }) {
  const up = seat ? 28 : 0;
  return (
    <g>
      {seat ? (
        <g>
          <rect x="-14" y="-40" width="11" height="36" rx="5" fill="#15122E" />
          <rect x="3" y="-40" width="11" height="36" rx="5" fill="#15122E" />
          <ellipse cx="-8" cy="-41" rx="10" ry="7" fill="#1C1840" /><ellipse cx="8" cy="-41" rx="10" ry="7" fill="#1C1840" />
        </g>
      ) : (
        <g>
          <rect x="-13" y="-72" width="11" height="68" rx="5" fill="#15122E" />
          <rect x="2" y="-72" width="11" height="68" rx="5" fill="#15122E" />
        </g>
      )}
      <ellipse cx="-8" cy="-4" rx="9" ry="5" fill="#2A2650" /><ellipse cx="8" cy="-4" rx="9" ry="5" fill="#2A2650" />
      <g transform={`translate(0 ${up})`}>
        {arm === "up" && (
          <g>
            <line x1="-18" y1="-240" x2="-18" y2="-222" stroke="#6A62B0" strokeWidth="3" />
            <ellipse cx="-18" cy="-210" rx="7" ry="10" fill="none" stroke="#7E76C8" strokeWidth="3" />
            <path d="M-20 -124 C -26 -156, -23 -184, -18 -202" stroke={c} strokeWidth="13" fill="none" strokeLinecap="round" />
            <circle cx="-18" cy="-205" r="6.5" fill="#B98572" />
          </g>
        )}
        <path d="M-25 -124 Q-26 -132 -17 -135 L17 -135 Q26 -132 25 -124 L27 -74 Q27 -66 18 -66 L-18 -66 Q-27 -66 -27 -74 Z" fill={c} />
        <path d="M5 -135 L17 -135 Q26 -132 25 -124 L27 -74 Q27 -66 18 -66 L5 -66 Z" fill="#0A0820" opacity="0.28" />
        <path d="M24 -124 L26 -76" stroke={rim} strokeWidth="2" opacity={rimA} strokeLinecap="round" />
        {arm !== "up" && <path d="M-22 -122 L-26 -82" stroke={c} strokeWidth="12" strokeLinecap="round" />}
        {phone ? (
          <g>
            <path d="M22 -122 C 28 -108, 22 -102, 10 -104" stroke={c} strokeWidth="12" fill="none" strokeLinecap="round" />
            <rect x="0" y="-120" width="12" height="18" rx="3" fill={C.cyan} opacity="0.8" filter="url(#hz-glow)" />
          </g>
        ) : (
          <path d="M22 -122 L26 -82" stroke={c} strokeWidth="12" strokeLinecap="round" />
        )}
        <rect x="-5" y="-144" width="10" height="10" rx="3" fill="#A87562" />
        <circle cx="0" cy="-156" r="20" fill="#171230" />
        {face !== 0 && <ellipse cx={face * 9} cy="-152" rx="10" ry="12" fill="#B98572" opacity="0.85" />}
        <path d="M12 -171 A20 20 0 0 1 19 -146" stroke={rim} strokeWidth="2" fill="none" opacity={rimA * 0.8} />
      </g>
    </g>
  );
}

/* ---------- 열차 내부 (아이소메트릭) ---------- */
const BENCH = [[1.0, 5.0], [6.2, 10.2], [11.4, 13.8]];
const WINDOWS = [[1.3, 4.7], [6.5, 9.9], [11.7, 13.5]];
const DOORS = [[5.15, 6.05], [10.35, 11.25]];

function IsoCar({ t, calm, day, items }) {
  const pal = day
    ? { slab: "#03140F", floor: "url(#hz-floorDay)", tile: "#155247", end: "#062622", door: "#0B3530", doorS: "#1F7A68", disp: "#04120F", wall: "url(#hz-wallDay)", win: "url(#hz-winDay)", winS: "#1F7A68", doorFill: "#0A332E", sb: "#0F5A4C", st: "#16766A", sf: "#0A4339", ss: "#0D4F43", rail: "#4FBFA8", strap: "#3FA58F", loop: "#6FE0C8" }
    : { slab: "#0B0920", floor: "url(#hz-floor)", tile: "#2A2168", end: "#100C2C", door: "#17123E", doorS: "#3B2E7A", disp: "#07081A", wall: "url(#hz-wall)", win: "url(#hz-win)", winS: "#3B2E7A", doorFill: "#1B1550", sb: "#2E2470", st: "#3A2E8A", sf: "#221A5A", ss: "#2A2068", rail: "#8A82D0", strap: "#7C74C0", loop: "#9A92E0" };
  const accent = day ? C.green : calm ? C.cyan : C.violet;
  const floorLine = day ? C.green : calm ? C.cyan : C.red;
  const streaks = [];
  WINDOWS.forEach(([a, b], wi) => {
    for (let k = 0; k < 5; k++) {
      const len = calm ? 0.35 : 0.7;
      const range = b - a + len + 0.6;
      const pos = ((t * (calm ? 1.1 : 4.2) + k * 1.37 + wi * 0.7) % range) + a - len - 0.3;
      const s0 = Math.max(a, pos), s1 = Math.min(b, pos + len);
      if (s1 <= s0) continue;
      const z = 1.45 + (k % 3) * 0.22;
      const [x0, y0] = iso(s0, 0, z), [x1, y1] = iso(s1, 0, z);
      const colr = day ? (k % 2 ? C.green : C.cyan) : calm ? (k % 2 ? C.cyan : C.blue) : (k % 2 ? C.red : "#FF8A3D");
      streaks.push(<line key={wi + "-" + k} x1={x0} y1={y0} x2={x1} y2={y1} stroke={colr} strokeWidth={calm ? 4 : 3} strokeLinecap="round" opacity="0.9" filter="url(#hz-glow)" />);
    }
  });
  const handles = [];
  for (let x = 0.8; x < L; x += 1.1) {
    if (Math.abs(x - 6.0) < 0.5 && !calm) continue;
    const [hx, hy] = iso(x, 2.0, 2.38);
    const sw = Math.sin(t * (calm ? 1.2 : 2.6) + x) * (calm ? 3 : 7);
    handles.push(
      <g key={x} transform={`rotate(${sw} ${hx} ${hy})`}>
        <line x1={hx} y1={hy} x2={hx} y2={hy + 16} stroke={pal.strap} strokeWidth="2.5" />
        <ellipse cx={hx} cy={hy + 24} rx="6" ry="8" fill="none" stroke={pal.loop} strokeWidth="2.5" />
      </g>
    );
  }
  const [r0x, r0y] = iso(0.3, 2.0, 2.38), [r1x, r1y] = iso(L, 2.0, 2.38);
  const [l0x, l0y] = iso(0, 0, 2.48), [l1x, l1y] = iso(L, 0, 2.48);
  const [f0x, f0y] = iso(0, 0.95, 0), [f1x, f1y] = iso(L, 0.95, 0);
  const [e0x, e0y] = iso(0, W, 0), [e1x, e1y] = iso(L, W, 0);
  return (
    <g>
      {/* 바닥 두께와 바닥 */}
      <polygon points={pts([0, W, 0], [L, W, 0], [L, W, -0.3], [0, W, -0.3])} fill={pal.slab} />
      <polygon points={pts([0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0])} fill={pal.floor} />
      {Array.from({ length: 10 }, (_, i) => 1.4 * (i + 1)).map((x) => {
        const [a1, b1] = iso(x, 0, 0), [a2, b2] = iso(x, W, 0);
        return <line key={x} x1={a1} y1={b1} x2={a2} y2={b2} stroke={pal.tile} strokeWidth="1" />;
      })}
      <line x1={f0x} y1={f0y} x2={f1x} y2={f1y} stroke={floorLine} strokeWidth="2.5" opacity="0.8" filter="url(#hz-glow)" />
      <line x1={e0x} y1={e0y} x2={e1x} y2={e1y} stroke={accent} strokeWidth="2" opacity="0.7" />

      {/* 끝 벽(문, 안내 화면) */}
      <polygon points={pts([0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H])} fill={pal.end} />
      <polygon points={pts([0, 0.9, 0], [0, 2.5, 0], [0, 2.5, 2.15], [0, 0.9, 2.15])} fill={pal.door} stroke={pal.doorS} strokeWidth="2" />
      <polygon points={pts([0, 0.6, 2.25], [0, 3.0, 2.25], [0, 3.0, 2.55], [0, 0.6, 2.55])} fill={pal.disp} stroke={calm ? C.green : C.red} strokeWidth="2" filter="url(#hz-glow)" />

      {/* 긴 벽(창문, 문, 조명) */}
      <polygon points={pts([0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H])} fill={pal.wall} />
      {WINDOWS.map(([a, b]) => (
        <polygon key={a} points={pts([a, 0, 1.25], [b, 0, 1.25], [b, 0, 2.15], [a, 0, 2.15])} fill={pal.win} stroke={pal.winS} strokeWidth="2" />
      ))}
      {streaks}
      {DOORS.map(([a, b]) => (
        <g key={a}>
          <polygon points={pts([a, 0, 0], [b, 0, 0], [b, 0, 2.2], [a, 0, 2.2])} fill={pal.doorFill} stroke={accent} strokeWidth="1.5" opacity="0.95" />
          <polygon points={pts([a + 0.15, 0, 1.2], [b - 0.15, 0, 1.2], [b - 0.15, 0, 2.0], [a + 0.15, 0, 2.0])} fill={pal.win} />
        </g>
      ))}
      <line x1={l0x} y1={l0y} x2={l1x} y2={l1y} stroke={accent} strokeWidth="4" filter="url(#hz-glow)" />
      {/* 좌석 */}
      {BENCH.map(([a, b]) => {
        const [a1, b1] = iso(a, 0.7, 0.45), [a2, b2] = iso(b, 0.7, 0.45);
        return (
          <g key={a}>
            <polygon points={pts([a, 0, 0.45], [b, 0, 0.45], [b, 0, 1.05], [a, 0, 1.05])} fill={pal.sb} />
            <polygon points={pts([a, 0, 0.45], [b, 0, 0.45], [b, 0.7, 0.45], [a, 0.7, 0.45])} fill={pal.st} />
            <polygon points={pts([a, 0.7, 0], [b, 0.7, 0], [b, 0.7, 0.45], [a, 0.7, 0.45])} fill={pal.sf} />
            <polygon points={pts([b, 0, 0], [b, 0.7, 0], [b, 0.7, 0.45], [b, 0, 0.45])} fill={pal.ss} />
            <line x1={a1} y1={b1} x2={a2} y2={b2} stroke={accent} strokeWidth="1.5" opacity="0.7" />
          </g>
        );
      })}
      {/* 손잡이 봉 */}
      {!day && <line x1={r0x} y1={r0y} x2={r1x} y2={r1y} stroke={pal.rail} strokeWidth="3" />}
      {!day && handles}
      {/* 사람과 기둥: 뒤쪽(x+y 작은 쪽)부터 */}
      {items.slice().sort((a, b) => a.d - b.d).map((it) => it.el)}
    </g>
  );
}

function at(x, y, z = 0) { const [a, b] = iso(x, y, z); return `translate(${a.toFixed(1)} ${b.toFixed(1)})`; }
const cam = (k, fx, fy, tx = 640, ty = 360) => `translate(${tx} ${ty}) scale(${k}) translate(${-fx} ${-fy})`;

const CROWD = [
  [2.2, 1.3, 0, "down", 1], [3.0, 2.6, 1, "up", -1], [3.8, 1.6, 2, "phone", 1], [4.4, 3.0, 3, "down", 0], [4.9, 1.0, 4, "up", 1],
  [5.2, 2.2, 5, "down", 1], [6.8, 1.2, 1, "phone", -1], [7.1, 2.8, 0, "down", 0], [7.6, 1.9, 3, "up", -1], [8.4, 1.1, 2, "down", 1],
  [8.8, 3.1, 4, "phone", 0], [9.3, 2.2, 5, "up", 1], [10.1, 1.4, 0, "down", -1], [10.6, 2.9, 1, "down", 0], [11.3, 2.0, 2, "up", 1],
  [12.0, 1.2, 3, "phone", -1], [12.5, 3.0, 4, "down", 0], [5.6, 3.3, 5, "down", 0], [6.2, 3.5, 2, "down", 0], [1.6, 2.8, 4, "up", 0], [13.2, 2.3, 1, "down", -1],
];
const SEATED = [1.5, 2.5, 3.5, 4.5, 6.7, 7.7, 8.7, 9.7, 11.9, 12.9];
const HERO = [6.0, 2.2];
const HERO_SCALE = 0.78;
const PUSH = [[1.2, 1], [2.6, -1], [3.8, 1]];

/* 표정 말풍선: 휴대폰 이모지 대신 직접 그린 얼굴 (빨강=싫음, 초록=웃음, 노랑=고민) */
function MoodFace({ e }) {
  const ink = "#2A1020";
  const col = { upset: "#FF5A6E", pain: "#FF5A6E", think: "#FFC94A", calm: "#3CD48A", happy: "#3CD48A" }[e];
  return (
    <g>
      <circle r="22" fill={col} stroke={ink} strokeWidth="2" />
      <ellipse cx="-7" cy="-9" rx="8" ry="5" fill="#FFFFFF" opacity="0.35" />
      <g stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none">
        {e === "upset" && (<>
          <path d="M-12 -9 L-4 -6 M12 -9 L4 -6" />
          <circle cx="-7" cy="-1" r="2.2" fill={ink} stroke="none" /><circle cx="7" cy="-1" r="2.2" fill={ink} stroke="none" />
          <path d="M-8 12 Q0 5 8 12" />
        </>)}
        {e === "pain" && (<>
          <path d="M-12 -6 L-5 -2 L-12 2 M12 -6 L5 -2 L12 2" />
          <path d="M-8 10 q2 -3 4 0 q2 3 4 0 q2 -3 4 0" />
        </>)}
        {e === "think" && (<>
          <path d="M-12 -8 L-4 -10 M5 -10 L12 -6" />
          <circle cx="-7" cy="-1" r="2.2" fill={ink} stroke="none" /><circle cx="7" cy="-1" r="2.2" fill={ink} stroke="none" />
          <path d="M-6 11 L7 8" />
        </>)}
        {e === "calm" && (<>
          <path d="M-11 -2 Q-7 2 -3 -2 M3 -2 Q7 2 11 -2" />
          <path d="M-7 9 Q0 14 7 9" />
        </>)}
        {e === "happy" && (<>
          <path d="M-11 -1 Q-7 -6 -3 -1 M3 -1 Q7 -6 11 -1" />
          <path d="M-10 6 Q0 18 10 6 Z" fill="#FFFFFF" />
        </>)}
      </g>
      {e === "think" && <text x="27" y="-12" fontSize="18" fontWeight="900" fill={ink}>?</text>}
    </g>
  );
}

function EmojiBubble({ x = 34, y = 0, e, s = 1, o = 1 }) {
  if (s <= 0.01 || o <= 0.01) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <path d="M-38 -62 h76 a10 10 0 0 1 10 10 v32 a10 10 0 0 1 -10 10 h-30 l-8 10 l-8 -10 h-30 a10 10 0 0 1 -10 -10 v-32 a10 10 0 0 1 10 -10 z" fill="#FFFFFF" stroke="#17141F" strokeWidth="2" />
      <g transform="translate(-4 -36)"><MoodFace e={e} /></g>
    </g>
  );
}
const heroSway = (u) => { const shove = PUSH.reduce((s, [c, d]) => s + Math.exp(-Math.pow((u - c) / 0.18, 2)) * d, 0); return Math.sin(u * 2.4) * 4 + shove * 16; };

function CrowdedCar({ u, pose }) {
  const shove = PUSH.reduce((s, [c, d]) => s + Math.exp(-Math.pow((u - c) / 0.18, 2)) * d, 0);
  const pain = PUSH.some(([c]) => Math.abs(u - c) < 0.35);
  const items = [];
  SEATED.forEach((x, i) => items.push({ d: x + 0.42, el: (
    <g key={"s" + i} transform={at(x, 0.42)}><g transform="scale(0.74)"><Person c={BODY[i % 6]} seat face={i % 2 ? 1 : -1} phone={i % 3 === 0} /></g></g>
  ) }));
  CROWD.forEach(([x, y, ci, arm, face], i) => {
    const near = Math.hypot(x - HERO[0], y - HERO[1]) < 1.6;
    const sw = Math.sin(u * 2.2 + i * 1.3) * 3 + (near ? shove * -9 : 0);
    const s = 0.72 + ((i * 37) % 9) / 100;
    items.push({ d: x + y, el: (
      <g key={"c" + i} transform={`${at(x, y)} translate(${sw} 0) rotate(${sw * 0.4})`}>
        <g transform={`scale(${s})`}><Person c={BODY[ci]} arm={arm} face={face} phone={arm === "phone"} /></g>
      </g>
    ) });
  });
  const pole = (x, y) => { const [a, b] = iso(x, y, 0), [c, d] = iso(x, y, H); return <line x1={a} y1={b} x2={c} y2={d} stroke="#8A82D0" strokeWidth="4" />; };
  items.push({ d: 3.4 + 2.9, el: <g key="pole1">{pole(3.4, 2.9)}</g> });
  items.push({ d: 10.0 + 2.6, el: <g key="pole2">{pole(10.0, 2.6)}</g> });
  const hsw = Math.sin(u * 2.4) * 4 + shove * 16;
  items.push({ d: HERO[0] + HERO[1], el: (
    <g key="hero" transform={`${at(...HERO)} translate(${hsw} 0) rotate(${hsw * 0.35})`}>
      <g transform={`scale(${HERO_SCALE})`}>
        <Hero pose={pose} mood={pain ? "pain" : "stress"} t={u} glow={pose === "hangPhone" ? out(p(u, 6.2, 6.8)) : 0} />
      </g>
    </g>
  ) });
  return <IsoCar t={u} items={items} />;
}

/* ---------- 1. 훅 + 로고 (0–5초) ---------- */
function Scene1({ u }) {
  const lines = [
    { d: "M-40 180 H520 L700 360 H1320", c: C.cyan, a: 0.1 },
    { d: "M-40 560 H360 L560 360 H1320", c: C.pink, a: 0.3 },
    { d: "M240 -40 V760", c: C.violet, a: 0.5 },
    { d: "M1040 -40 V760", c: C.blue, a: 0.7 },
  ];
  return (
    <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 40%, ${C.bg2}, ${C.bg} 70%)` }}>
      <IsoGrid t={u} a={0.4} />
      <svg className="absolute inset-0" width="1280" height="720" aria-hidden="true">
        {lines.map((l, i) => (
          <path key={i} d={l.d} fill="none" stroke={l.c} strokeWidth="5" strokeLinecap="round" opacity="0.7" filter="url(#hz-glow)"
            pathLength="1" strokeDasharray="1" strokeDashoffset={1 - ease(p(u, l.a, l.a + 1.6))} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[64px] font-black leading-tight" style={{ color: C.fg, opacity: p(u, 0.3, 0.45),
          transform: `scale(${u < 0.3 ? 2 : 2 - out(p(u, 0.3, 0.6))})`, textShadow: `0 0 24px ${C.blue}` }}>몇 분 더 쓰면,</p>
        <p className="text-[64px] font-black leading-tight" style={{ ...gradText(C.cyan, C.pink), opacity: p(u, 1.1, 1.25),
          transform: `scale(${u < 1.1 ? 2 : 2 - out(p(u, 1.1, 1.4))})` }}>얼마나 덜 붐빌까?</p>
        <div className="mt-10 flex items-center gap-5" style={rise(u, 2.4, 3.0, 30)}>
          <Mark t={u} start={2.4} size={110} />
          <div className="w-fit text-left">
            <p className="whitespace-nowrap text-[40px] font-black"><span style={{ color: C.pink }}>빨리 갈까,</span> <span style={{ color: C.green }}>편하게 갈까?</span></p>
            {/* 설명 글귀는 위 서비스명 잉크 폭('빨'의 받침 ㄹ 시작 ~ '?' 아래 점 끝)에 맞춰 자간을 넓힘 */}
            <FitWidth className="whitespace-nowrap text-[19px]" style={{ color: C.sub, ...rise(u, 3.2, 3.7, 12) }}>혼잡도까지 비교하는 지하철 경로 추천 서비스</FitWidth>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 혼잡도 카드(오른쪽 아래) ---------- */
function Gauge({ u, at: a, from, to, lv, warm }) {
  const g = out(p(u, a, a + 1));
  const c = warm ? C.red : C.green;
  return (
    <div className="absolute rounded-2xl p-5" style={{ right: M, bottom: BOTTOM, width: span(3), background: "rgba(10,11,30,.82)", ...neon(c, 0.5), ...rise(u, a - 0.1, a + 0.3, 20) }}>
      <p className="flex items-center gap-2 text-[15px]" style={{ color: C.sub }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: c, opacity: 0.5 + 0.5 * Math.sin(u * 8) }} /> 지금 이 칸의 혼잡도
      </p>
      <p className="mt-1 text-[48px] font-black tabular-nums leading-none" style={{ color: c, textShadow: `0 0 18px ${c}` }}>{Math.round(from + (to - from) * g)}%</p>
      <div className="mt-3 h-[8px] w-full overflow-hidden rounded-full" style={{ background: C.line }}>
        <div className="h-full rounded-full" style={{ width: `${(lerp(from, to, g) / 150) * 100}%`, background: warm ? `linear-gradient(90deg, ${C.pink}, ${C.red})` : `linear-gradient(90deg, ${C.green}, ${C.cyan})` }} />
      </div>
      <div className="mt-4 flex items-center gap-3" style={{ opacity: p(u, a + 0.9, a + 1.1) }}><Badge lv={lv} /><People n={lv} size={12} /></div>
    </div>
  );
}

/* ---------- 2. 숨 막히는 퇴근길 (5–10.5초) ---------- */
const HERO_PT = iso(...HERO);
function Scene2({ u }) {
  const push = ease(p(u, 4.4, 5.5));
  const k = lerp(1.2 + u * 0.015, 1.5, push);
  const fx = HERO_PT[0], fy = lerp(HERO_PT[1] - 40, HERO_PT[1] - 110, push);
  const tx = lerp(720, 820, push), ty = lerp(380, 390, push);
  const warns = [[3.8, 1.6, 0.8], [9.3, 2.2, 1.1], [11.3, 2.0, 1.5], [4.4, 3.0, 1.9], [8.4, 1.1, 2.3]];
  const [hx, hy] = HERO_PT;
  const heat = iso(7, 2.2);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: C.bg }}>
      <svg width="1280" height="720" className="absolute inset-0" aria-label="퇴근길 만원 지하철 안, 승객들 사이에서 이리저리 치이며 괴로워하는 후드 차림 주인공">
        <g transform={cam(k, fx, fy, tx, ty)}>
          <ellipse cx={heat[0]} cy={heat[1]} rx="560" ry="280" fill="url(#hz-heat)" opacity={0.6 + 0.3 * Math.sin(u * 4)} />
          <CrowdedCar u={u} pose="hang" />
          {[0, 0.6].map((o) => {
            const r = ((u + o) % 1.2) / 1.2;
            return <ellipse key={o} cx={hx} cy={hy} rx={30 + r * 110} ry={(30 + r * 110) * 0.5} fill="none" stroke={C.red} strokeWidth="3" opacity={(1 - r) * 0.8 * p(u, 0.4, 0.8)} filter="url(#hz-glow)" />;
          })}
          {warns.map(([x, y, a0], i) => {
            const [wx, wy] = iso(x, y, 2.55);
            const s = u < a0 ? 0 : back(p(u, a0, a0 + 0.3));
            return (
              <g key={i} transform={`translate(${wx} ${wy + Math.sin(u * 3 + i) * 5}) scale(${s})`} opacity={0.65 + 0.35 * Math.sin(u * 9 + i)}>
                <path d="M0 -18 L16 10 L-16 10 Z" fill="rgba(255,59,92,.18)" stroke={C.red} strokeWidth="2.5" strokeLinejoin="round" filter="url(#hz-glow)" />
                <text x="0" y="6" textAnchor="middle" fontSize="16" fontWeight="900" fill={C.red}>!</text>
              </g>
            );
          })}
          {/* 표정 말풍선: 가장 위 레이어 */}
          <g transform={`translate(${hx + heroSway(u)} ${hy})`}>
            <EmojiBubble x={40} y={-160} e={PUSH.some(([c]) => Math.abs(u - c) < 0.35) ? "pain" : "upset"} s={(u < 0.5 ? 0 : back(p(u, 0.5, 0.8))) * 1.5} />
          </g>
          {/* 머리 주변 스트레스 표시 */}
          <g transform={`translate(${hx} ${hy - 150})`} opacity={p(u, 1.0, 1.4)}>
            {[[-34, -20, -1], [34, -24, 1], [0, -40, 0]].map(([x0, y0, d], i) => (
              <path key={i} d={`M${x0 - 8} ${y0} l4 -6 l4 6 l4 -6 l4 6`} transform={`rotate(${d * 25} ${x0} ${y0}) translate(${Math.sin(u * 14 + i) * 1.5} 0)`}
                fill="none" stroke={C.pink} strokeWidth="2.5" strokeLinecap="round" filter="url(#hz-glow)" />
            ))}
          </g>
        </g>
        <rect width="1280" height="720" fill="url(#hz-redvig)" />
      </svg>

      <div className="absolute flex items-center gap-2 text-[17px] font-bold" style={{ left: M, top: TOP, color: C.sub, ...rise(u, 0.1, 0.5) }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.red, boxShadow: `0 0 10px ${C.red}`, opacity: Math.sin(u * 8) > 0 ? 1 : 0.4 }} />
        LIVE · 오후 6시 10분 · 퇴근길 지하철
      </div>
      <div className="absolute rounded-full px-4 py-2 text-[15px] font-bold" style={{ right: M, top: TOP - 8, color: C.red, background: "rgba(255,59,92,.12)", ...neon(C.red, 0.4), ...rise(u, 0.7, 1.1) }}>
        ⚠ 혼잡 경고 · 밀려드는 사람들
      </div>
      <div className="absolute" style={{ left: M, bottom: BOTTOM, width: span(6), wordBreak: "keep-all", ...rise(u, 1.6, 2.1, 20), opacity: p(u, 1.6, 2.1) * (1 - p(u, 4.4, 4.9)) }}>
        <p className="text-[48px] font-black leading-tight" style={{ color: C.fg, textShadow: "0 2px 18px #0A0B1E" }}>퇴근길,<br /><span style={gradText(C.pink, C.red)}>숨 막히는</span> 지하철 혼잡도</p>
      </div>
      <div style={{ opacity: 1 - p(u, 4.4, 4.9) }}><Gauge u={u} at={1.0} from={40} to={140} lv={5} warm /></div>
    </div>
  );
}

/* ---------- 3. 휴대폰을 꺼내는 주인공 (10.5–14.5초) ---------- */
function Scene3({ u }) {
  const k1 = ease(p(u, 0, 1.2)), k2 = Math.pow(p(u, 3.0, 4.0), 2.2);
  const [hx, hy] = HERO_PT;
  const phx = hx + 4 * HERO_SCALE, phy = hy - 124 * HERO_SCALE;
  let k = lerp(1.5, 2.6, k1), fx = hx, fy = lerp(hy - 110, hy - 128, k1), tx = lerp(820, 860, k1), ty = lerp(390, 400, k1);
  if (u > 3.0) { const m = ease(p(u, 3.0, 3.6)); k = lerp(2.6, 16, k2); fx = lerp(fx, phx, m); fy = lerp(fy, phy, m); tx = lerp(tx, 640, k2); ty = lerp(ty, 360, k2); }
  const glow = out(p(u, 0.6, 1.2));
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: C.bg }}>
      <svg width="1280" height="720" className="absolute inset-0" aria-label="만원 열차 속에서 휴대폰을 꺼내 들여다보는 주인공, 화면에서 파란빛이 퍼져 나옴">
        <g transform={cam(k, fx, fy, tx, ty)}>
          <CrowdedCar u={u + 5.5} pose="hangPhone" />
          <g transform={`translate(${hx + heroSway(u + 5.5)} ${hy})`}>
            <EmojiBubble x={32} y={-160} e="think" s={(u < 0.5 ? 0 : back(p(u, 0.5, 0.8))) * 0.85} o={1 - p(u, 2.8, 3.1)} />
          </g>
          <circle cx={phx} cy={phy} r={70 + 8 * Math.sin(u * 5)} fill="url(#hz-phone)" opacity={glow} />
          <path d={`M${phx - 6} ${phy - 8} L${phx - 34} ${phy - 60} L${phx + 30} ${phy - 60} L${phx + 8} ${phy - 8} Z`} fill={C.cyan} opacity={glow * 0.16} />
        </g>
        <rect width="1280" height="720" fill="url(#hz-redvig)" opacity={1 - glow * 0.6} />
        <rect width="1280" height="720" fill="url(#hz-cyanvig)" opacity={glow * 0.8} />
        <rect width="1280" height="720" fill="#BFF7FF" opacity={p(u, 3.5, 4.0) * 0.9} />
      </svg>
      <div className="absolute inset-0" style={{ background: "linear-gradient(60deg, rgba(10,11,30,.85) 0%, rgba(10,11,30,0) 45%)", opacity: p(u, 1.0, 1.6) * (1 - p(u, 3.0, 3.4)) }} />
      <div className="absolute" style={{ left: M, bottom: BOTTOM, width: span(5), ...rise(u, 1.2, 1.7, 20), opacity: p(u, 1.2, 1.7) * (1 - p(u, 3.0, 3.4)) }}>
        <p className="text-[46px] font-black leading-tight" style={{ color: C.fg }}>답답한 퇴근길,<br /><span style={gradText(C.cyan, C.blue)}>해결책은 없을까?</span></p>
      </div>
    </div>
  );
}

/* ---------- 4·5. 서비스 화면과 홀로그램 (14.5–33.5초, 같은 무대를 이어 씀) ---------- */
const MAP = {
  lines: ["M30 90 H730", "M110 30 V410", "M30 340 H730", "M720 20 L560 180 V410", "M300 30 V410"],
  fast: "M110 90 V340 H560",
  calm: "M110 90 H650 L560 180 V340",
  fastDots: [[110, 150, 3], [110, 220, 4], [110, 290, 5], [220, 340, 5], [340, 340, 4], [460, 340, 4]],
  calmDots: [[220, 90, 2], [360, 90, 2], [500, 90, 1], [610, 130, 2], [560, 230, 3], [560, 295, 2]],
};
const TIMES = [["17:00", 92], ["17:30", 109], ["18:00", 106], ["18:30", 91], ["19:00", 77], ["19:30", 59], ["20:00", 52]];
const T4 = 14.5, T5 = 23.5;

// 해결 뒤 네온은 유지하고 초록빛으로 물들이기 위한 색 섞기
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixC = (a, b, k, al = 1) => { const A = hexRgb(a), B = hexRgb(b); return `rgba(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",")},${al})`; };
const theme = (d) => ({
  d, fg: C.fg, sub: C.sub, panel: "rgba(24,18,62,.92)", line: C.line, track: C.line,   // UI는 그대로 선명하게, 초록빛은 배경에만
});

function IsoBars({ t, th }) {
  const a = 11, base = 150;
  const later = t > T5 + 5.5;
  return (
    <svg width={span(3) - 32} height="170" viewBox="0 0 224 170" aria-label="시간대별 혼잡도 막대">
      {TIMES.map(([tm, v], i) => {
        const cx = 18 + i * 31, cy = base;
        const h = v * 1.05 * out(p(t, T4 + 4.2 + i * 0.08, T4 + 5.0 + i * 0.08));
        const c = LV[levelOf(v)][1];
        const hot = later ? i === 5 : i === 2;
        return (
          <g key={tm} opacity={hot ? 1 : 0.55}>
            <polygon points={`${cx - a},${cy - h} ${cx},${cy + a / 2 - h} ${cx},${cy + a / 2} ${cx - a},${cy}`} fill={c} opacity="0.75" />
            <polygon points={`${cx},${cy + a / 2 - h} ${cx + a},${cy - h} ${cx + a},${cy} ${cx},${cy + a / 2}`} fill={c} opacity="0.5" />
            <polygon points={`${cx - a},${cy - h} ${cx},${cy - a / 2 - h} ${cx + a},${cy - h} ${cx},${cy + a / 2 - h}`} fill={c} />
            {hot && <path d={`M${cx - 5} ${cy - h - 14} L${cx + 5} ${cy - h - 14} L${cx} ${cy - h - 8} Z`} fill={th.fg} />}
            {i % 2 === 0 && <text x={cx} y={base + 18} textAnchor="middle" fontSize="11" fill={th.sub}>{tm}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Donut({ t, th }) {
  const g = out(p(t, T5 + 1.7, T5 + 2.9));
  const r = 44, Lc = 2 * Math.PI * r;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-label="편한 길 평균 혼잡도 58%">
      <circle cx="60" cy="60" r={r} fill="none" stroke={th.track} strokeWidth="12" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="url(#hz-calm)" strokeWidth="12" strokeLinecap="round" filter="url(#hz-glow)"
        strokeDasharray={`${Lc * 0.58 * g} ${Lc}`} transform="rotate(-90 60 60)" />
      <text x="60" y="68" textAnchor="middle" fontSize="24" fontWeight="900" fill={th.fg}>{Math.round(58 * g)}%</text>
    </svg>
  );
}

function PhoneCard({ t, a, icon: Icon, name, min, lv, levels, c, pick, th }) {
  const sel = pick ? p(t, T5 + 2.1, T5 + 2.4) : 0;
  return (
    <div className="rounded-2xl p-3" style={{ background: sel ? "rgba(57,255,176,.1)" : "rgba(127,127,160,.06)", ...neon(c, 0.2 + sel * 0.35), ...rise(t, a, a + 0.4, 30) }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[16px] font-bold" style={{ color: th.fg }}><Icon size={16} color={c} /> {name}{sel ? " · 추천" : ""}</span>
        <span className="text-[19px] font-black tabular-nums" style={{ color: th.fg }}>{min}분</span>
      </div>
      <div className="mt-2"><Strip levels={levels} grow={out(p(t, a + 0.2, a + 0.9))} /></div>
      <div className="mt-2 flex items-center gap-3"><Badge lv={lv} /><People n={lv} size={11} color={th.fg} /></div>
    </div>
  );
}

function MetricChip({ t, a, to, suffix, label, icon: Icon, th }) {
  const v = Math.round(to * out(p(t, a, a + 1)));
  return (
    <div className="flex items-center gap-3 rounded-xl px-4" style={{ width: (span(8) - 3 * 16) / 4, height: 56, background: th.panel, ...neon(C.violet, 0.2), ...rise(t, a, a + 0.4, 20) }}>
      <Icon size={18} color={C.cyan} />
      <span className="whitespace-nowrap text-[24px] font-black tabular-nums leading-none" style={{ color: th.fg }}>{v}{suffix}</span>
      <span className="whitespace-nowrap text-[13px] leading-tight" style={{ color: th.sub }}>{label}</span>
    </div>
  );
}

function Holo({ t }) {
  const phase2 = t >= T5;
  const d = p(t, T5 + 2.7, T5 + 3.7);          // 해결 순간부터 1초 동안 초록 네온으로 물듦
  const th = theme(d);
  const zoomIn = out(p(t, T4, T4 + 0.7));
  const query = "A역 → B역 · 18:10";
  const typed = query.slice(0, Math.round(p(t, T4 + 0.5, T4 + 1.3) * query.length));
  const searching = t > T4 + 1.3 && t < T4 + 1.7;
  const ai = "5분 더 걸리지만 가장 붐비는 구간을 피해 갈 수 있어요.";
  const aiTyped = ai.slice(0, Math.round(p(t, T5 + 3.7, T5 + 5.3) * ai.length));
  const fd = ease(p(t, T4 + 2.4, T4 + 3.4)), cd = ease(p(t, T5 + 1.1, T5 + 2.5));
  const fastDim = 1 - 0.65 * p(t, T5 + 1.0, T5 + 1.6);
  const scan = p(t, T5 + 0.1, T5 + 1.1);
  const mapIn = out(p(t, T4 + 2.0, T4 + 2.6));
  const bob = Math.sin(t * 1.6) * 5;
  const si = Math.min(3, Math.floor(p(t, T5 + 6.0, T5 + 7.2) * 4));
  const steps = [["18:00", 4], ["18:30", 4], ["19:00", 3], ["19:30", 2]];
  const holoL = col(4), holoW = span(5), rightL = col(9);
  const mapW = holoW, mapH = 260, mapTop = 204, mapCx = holoL + holoW / 2;
  const accent = phase2 ? C.green : C.pink;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: `radial-gradient(ellipse at 55% 45%, ${C.bg2}, ${C.bg} 75%)` }}>
      <IsoGrid t={t} a={0.35 * (1 - d)} />
      {/* 해결 뒤: 네온은 그대로, 초록빛이 번지는 배경 */}
      <div className="absolute inset-0" style={{ opacity: d, background: "radial-gradient(ellipse at 58% 42%, rgba(57,255,176,.28) 0%, rgba(34,229,255,.10) 35%, rgba(0,0,0,0) 65%), linear-gradient(160deg, #04241F 0%, #061A26 55%, #0A0B1E 100%)" }} />
      <IsoGrid t={t} a={0.45 * d} color="#1F5A50" />

      {/* 휴대폰에서 홀로그램으로 뻗는 빛, 받침대, 빛기둥 */}
      <svg width="1280" height="720" className="absolute inset-0" aria-hidden="true" style={{ opacity: p(t, T4 + 1.9, T4 + 2.4) }}>
        <polygon points={`${col(0) + 336},200 ${holoL},${mapTop + 40} ${holoL},${mapTop + mapH - 30} ${col(0) + 336},430`} fill={C.cyan} opacity={0.08 + 0.06 * d} />
        <polygon points={`${mapCx - 200},520 ${mapCx},470 ${mapCx + 200},520 ${mapCx},570`} fill="rgba(34,229,255,.08)" stroke={C.cyan} strokeWidth="2" filter="url(#hz-glow)" />
        <polygon points={`${mapCx - 120},520 ${mapCx},490 ${mapCx + 120},520 ${mapCx},550`} fill="none" stroke={accent} strokeWidth="1.5" opacity={0.5 + 0.5 * Math.sin(t * 4)} />
        <rect x={mapCx - 190} y={mapTop + mapH - 20} width="380" height={520 - (mapTop + mapH - 20)} fill="url(#hz-beam)" />
        {Array.from({ length: 8 }, (_, i) => {
          const y = 520 - ((t * 40 + i * 23) % 70);
          return <circle key={i} cx={mapCx - 160 + i * 45} cy={y} r="2" fill={C.cyan} opacity={clamp((y - 450) / 70)} />;
        })}
      </svg>

      {/* 제목 줄 */}
      <div className="absolute" style={{ left: holoL, top: TOP, width: span(8) }}>
        {!phase2 ? (
          <div key="h1" style={rise(t, T4 + 0.6, T4 + 1.1)}>
            <p className="text-[15px] font-bold tracking-[.14em]" style={{ color: C.pink }}>혼잡 경고</p>
            <h2 className="mt-1 text-[38px] font-black leading-tight" style={{ color: th.fg }}>가장 빠른 길이, <span style={gradText(C.pink, C.red)}>가장 붐비는 길</span></h2>
          </div>
        ) : (
          <div key="h2" style={rise(t, T5 + 0.1, T5 + 0.6)}>
            <p className="text-[15px] font-bold tracking-[.14em]" style={{ color: C.green }}>AI 대체 경로 추천</p>
            <h2 className="mt-1 text-[38px] font-black leading-tight" style={{ color: th.fg }}>AI가 추천하는 <span style={gradText(C.green, C.cyan)}>가장 한산한 경로</span></h2>
          </div>
        )}
      </div>

      {/* 휴대폰: 0~3열 */}
      <div className="absolute flex flex-col overflow-hidden rounded-[40px] p-4" style={{ left: col(0) + 16, top: TOP, width: 320, height: 720 - TOP - BOTTOM,
        background: "linear-gradient(180deg,#0F0C2C,#0A0B1E)", ...neon(C.blue, 0.5), transformOrigin: "50% 40%",
        transform: `scale(${0.6 + 0.4 * zoomIn}) translateY(${(1 - zoomIn) * 40}px)`, opacity: zoomIn }}>
                <div className="relative flex h-full flex-col">
          <div className="mx-auto mb-3 h-[5px] w-[80px] rounded-full" style={{ background: th.line }} />
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(127,127,160,.08)", ...neon(C.violet, 0.15) }}>
            <Search size={15} color={C.cyan} />
            <span className="text-[14px] tabular-nums" style={{ color: th.fg }}>{typed}<span style={{ opacity: Math.sin(t * 12) > 0 && t < T4 + 1.3 ? 1 : 0 }}>|</span></span>
          </div>
          {searching && <div className="mt-4 flex items-center justify-center gap-2 text-[13px]" style={{ color: th.sub }}><Clock size={14} className="animate-spin" /> 경로와 혼잡도 계산 중</div>}
          <div className="mt-3 flex flex-col gap-3">
            {t > T4 + 1.6 && <div><PhoneCard th={th} t={t} a={T4 + 1.7} icon={Zap} name="빠른 길" min={32} lv={4} levels={[3, 4, 5, 4, 3]} c={C.pink} /></div>}
            {t > T5 + 1.2 && <PhoneCard th={th} t={t} a={T5 + 1.3} icon={Sofa} name="편한 길" min={37} lv={2} levels={[2, 3, 2, 1, 2]} c={C.green} pick />}
          </div>
          {t < T5 + 1.0 && t > T4 + 4.5 && (
            <div className="mb-3 mt-4 flex flex-1 flex-col" style={{ opacity: 1 - p(t, T5 + 0.6, T5 + 1.0) }}>
              <p className="mb-2 text-[13px] font-bold" style={{ color: th.sub }}>혼잡도 5단계</p>
              <div className="flex flex-1 flex-col justify-between gap-2">
                {[1, 2, 3, 4, 5].map((l, i) => {
                  const hot = l >= 4 && t > T4 + 5.6;
                  return (
                    <div key={l} className="flex flex-1 items-center gap-3 rounded-lg px-2" style={{ ...slide(t, T4 + 4.6 + i * 0.12, T4 + 4.9 + i * 0.12, -20),
                      background: hot ? "rgba(255,59,92,.12)" : "transparent", boxShadow: hot ? `0 0 0 1px ${C.red}88` : "none" }}>
                      <span className="w-[112px]"><Badge lv={l} /></span><People n={l} size={11} color={th.fg} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {t > T5 + 3.4 && (
            <div className="mb-3 mt-3 flex flex-1 flex-col rounded-xl px-3 py-3" style={{ background: "rgba(57,255,176,.1)", ...neon(C.green, 0.3), ...rise(t, T5 + 3.4, T5 + 3.7) }}>
              <span className="inline-flex w-fit items-center gap-1 rounded-md px-2 py-[1px] text-[12px] font-bold" style={{ background: C.green, color: C.bg }}><Sparkles size={12} /> AI 한 줄 요약</span>
              <p className="mt-2 min-h-[48px] text-[15px] leading-snug" style={{ color: th.fg }}>{aiTyped}</p>
              <div className="mt-auto flex flex-col gap-2 border-t pt-3 text-[13px]" style={{ borderColor: "rgba(57,255,176,.25)", opacity: p(t, T5 + 5.3, T5 + 5.8) }}>
                {[["도착 예정", "18:47 (빠른 길 18:42)"], ["가장 붐비는 구간", "5단계 → 3단계"], ["4단계 이상 구간", "5곳 → 0곳"]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2"><span style={{ color: th.sub }}>{k}</span><b style={{ color: th.fg }}>{v}</b></div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-center text-[12px]" style={{ borderColor: th.line, color: th.sub }}>
            <span className="flex flex-col items-center gap-1" style={{ color: C.cyan }}><MapPin size={16} />경로</span>
            <span className="flex flex-col items-center gap-1"><Timer size={16} />출발 시각</span>
            <span className="flex flex-col items-center gap-1"><BarChart3 size={16} />혼잡도</span>
          </div>
        </div>
      </div>

      {/* 홀로그램 노선도: 4~8열, 정면을 바라보는 떠 있는 화면 */}
      <div className="absolute" style={{ left: holoL, top: mapTop + bob, width: mapW, height: mapH, opacity: mapIn, transform: `scale(${0.85 + 0.15 * mapIn})` }}>
        <div className="absolute rounded-2xl" style={{ left: 10, top: 12, right: -10, bottom: -12, background: "rgba(34,229,255,.12)", filter: "blur(2px)" }} />
        <div className="absolute inset-0 rounded-2xl" style={{ background: "rgba(18,14,46,.92)", ...neon(accent, 0.5) }} />
        <svg width={mapW} height={mapH} viewBox="0 0 760 440" className="absolute inset-0">
          {MAP.lines.map((dd) => <path key={dd} d={dd} fill="none" stroke={"#3A2E80"} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />)}
          <g opacity={fastDim}>
            <path d={MAP.fast} fill="none" stroke={C.pink} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" filter="url(#hz-glow)"
              pathLength="1" strokeDasharray="1" strokeDashoffset={1 - fd} />
            {MAP.fastDots.map(([x, y, l], i) => (
              <circle key={i} cx={x} cy={y} r={18 * (t < T4 + 3.4 + i * 0.06 ? 0 : back(p(t, T4 + 3.4 + i * 0.06, T4 + 3.7 + i * 0.06)))} fill={LV[l][1]} stroke={l >= 4 ? C.red : "#0A0B1E"} strokeWidth="4" />
            ))}
          </g>
          <path d={MAP.calm} fill="none" stroke="url(#hz-calm)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" filter="url(#hz-glow)"
            pathLength="1" strokeDasharray="1" strokeDashoffset={1 - cd} />
          {cd >= 1 && <path d={MAP.calm} fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeDasharray="14 40" strokeDashoffset={-t * 120} opacity="0.9" />}
          {MAP.calmDots.map(([x, y, l], i) => (
            <circle key={i} cx={x} cy={y} r={16 * (t < T5 + 2.5 + i * 0.06 ? 0 : back(p(t, T5 + 2.5 + i * 0.06, T5 + 2.8 + i * 0.06)))} fill={LV[l][1]} stroke={"#0A0B1E"} strokeWidth="4" />
          ))}
          <circle cx="110" cy="90" r="22" fill={C.blue} filter="url(#hz-glow)" /><circle cx="110" cy="90" r="9" fill="#FFFFFF" />
          <circle cx="560" cy="340" r="22" fill={C.blue} filter="url(#hz-glow)" /><circle cx="560" cy="340" r="9" fill="#FFFFFF" />
          <text x="110" y="50" textAnchor="middle" fontSize="32" fontWeight="800" fill={th.fg}>A역</text>
          <text x="560" y="405" textAnchor="middle" fontSize="32" fontWeight="800" fill={th.fg}>B역</text>
          {scan > 0 && scan < 1 && <rect x={scan * 820 - 60} y="0" width="60" height="440" fill={C.green} opacity="0.25" />}
        </svg>
      </div>

      {/* 홀로그램 꼬리표 */}
      <div className="absolute rounded-full px-3 py-1 text-[14px] font-bold" style={{ left: holoL, top: 156, color: C.pink, background: "rgba(255,46,151,.12)", ...neon(C.pink, 0.4), ...pop(t, T4 + 3.5, T4 + 3.8), opacity: p(t, T4 + 3.5, T4 + 3.6) * (1 - p(t, T5, T5 + 0.3)) }}>
        빠른 길 · 혼잡 구간 5곳
      </div>
      {t > T5 + 0.1 && t < T5 + 1.2 && (
        <div className="absolute flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-bold" style={{ left: holoL, top: 156, color: C.green, ...neon(C.green, 0.4) }}>
          <Sparkles size={14} /> AI가 덜 붐비는 길을 찾는 중
        </div>
      )}
      <div className="absolute flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-bold" style={{ left: holoL + holoW - 150, top: 156, color: C.bg, background: C.green, boxShadow: `0 0 18px ${C.green}`, ...pop(t, T5 + 2.5, T5 + 2.8) }}>
        대체 경로 추천 <ArrowRight size={15} />
      </div>
      <div className="absolute rounded-2xl px-5 py-2 text-center text-[22px] font-black" style={{ left: mapCx - 150, top: 492, width: 300, color: C.bg, background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, boxShadow: `0 0 26px ${C.cyan}`, ...pop(t, T5 + 2.7, T5 + 3.1) }}>
        +5분이면 2단계 덜 붐빔
      </div>

      {/* 오른쪽 9~11열: 경고 → 원형 차트, 시간대 막대 */}
      <div className="absolute flex flex-col justify-between" style={{ left: rightL, top: 160, width: span(3), height: 568 - 160 }}>
        <div className="relative" style={{ height: 196 }}>
          <div className="absolute inset-0 rounded-2xl p-4" style={{ background: "rgba(40,6,22,.7)", ...neon(C.red, 0.5 + 0.3 * Math.sin(t * 6)), ...pop(t, T4 + 3.6, T4 + 4.0), opacity: p(t, T4 + 3.6, T4 + 3.7) * (1 - p(t, T5 + 1.5, T5 + 1.9)) }}>
            <p className="flex items-center gap-2 text-[15px] font-bold" style={{ color: C.red }}>⚠ 가장 붐비는 구간</p>
            <p className="mt-1 text-[52px] font-black tabular-nums leading-none" style={{ color: C.red, textShadow: `0 0 20px ${C.red}` }}>140%</p>
            <div className="mt-3"><Badge lv={5} /></div>
            <p className="mt-3 text-[14px]" style={{ color: C.sub }}>빠른 길은 4~5단계 구간을 그대로 지나요</p>
          </div>
          <div className="absolute inset-0 flex flex-col rounded-2xl p-4" style={{ background: "rgba(6,30,30,.92)", ...neon(C.green, 0.45), opacity: p(t, T5 + 1.6, T5 + 2.0) }}>
            <p className="text-[15px] font-bold" style={{ color: C.green }}>편한 길 평균 혼잡도</p>
            <div className="mt-1 flex items-center gap-3">
              <Donut t={t} th={th} />
              <div className="flex flex-col gap-2"><Badge lv={2} /><People n={2} size={11} color={th.fg} /></div>
            </div>
            <p className="text-[14px] font-bold" style={{ color: th.fg, opacity: p(t, T5 + 3.2, T5 + 3.5) }}>4단계 이상 구간 5곳 → 0곳</p>
          </div>
        </div>
        <div className="rounded-2xl px-4 pb-2 pt-3" style={{ background: th.panel, ...neon(C.violet, 0.25), ...rise(t, T4 + 4.1, T4 + 4.5, 20) }}>
          <p className="flex items-center gap-2 text-[14px]" style={{ color: th.sub }}><BarChart3 size={15} color={C.cyan} /> 시간대별 혼잡도</p>
          <IsoBars t={t} th={th} />
        </div>
      </div>

      {/* 맨 아래 줄: 4~11열 */}
      <div className="absolute flex justify-between" style={{ left: holoL, width: span(8), bottom: BOTTOM, opacity: 1 - p(t, T5 + 5.4, T5 + 5.8) }}>
        <MetricChip th={th} t={t} a={T4 + 5.8} to={8} suffix="개" label="노선" icon={MapPin} />
        <MetricChip th={th} t={t} a={T4 + 5.9} to={283} suffix="개" label="통계 역" icon={Database} />
        <MetricChip th={th} t={t} a={T4 + 6.0} to={30} suffix="분" label="시간 단위" icon={Clock} />
        <MetricChip th={th} t={t} a={T4 + 6.1} to={5} suffix="단계" label="혼잡도" icon={BarChart3} />
      </div>
      {t > T5 + 5.5 && (
        <div className="absolute flex items-center gap-4 rounded-2xl px-4" style={{ left: holoL, width: span(8), bottom: BOTTOM, height: 56, background: th.panel, ...neon("#14C8A8", 0.25), ...rise(t, T5 + 5.6, T5 + 6.0, 20) }}>
          <span className="flex items-center gap-2 whitespace-nowrap text-[15px] font-bold" style={{ color: th.fg }}><Timer size={16} color="#0A8FD6" /> 출발 시각도 앞뒤 1시간 안에서 제안</span>
          <div className="grid flex-1 grid-cols-4 gap-2">
            {steps.map(([tm, l], i) => {
              const on = i === si && t > T5 + 6.0;
              return (
                <div key={tm} className="whitespace-nowrap rounded-lg py-1 text-center text-[13px] font-bold tabular-nums" style={{ background: on ? LV[l][1] : "transparent", color: on ? C.bg : th.sub, boxShadow: on ? `0 0 14px ${LV[l][1]}` : `0 0 0 1px ${th.line}` }}>
                  {tm} · {l}단계
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="absolute inset-0" style={{ background: "#BFF7FF", opacity: (1 - p(t, T4, T4 + 0.5)) * 0.9, pointerEvents: "none" }} />
    </div>
  );
}
function Scene4({ t }) { return <Holo t={t} />; }
function Scene5({ t }) { return <Holo t={t} />; }

/* ---------- 6. 초록 네온으로 물든 한산한 열차, 앉아서 가는 주인공 (33.5–39.5초) ---------- */
function Scene6({ u }) {
  const items = [];
  const hx = 7.4;
  const bs = u < 0.6 ? 0 : back(p(u, 0.6, 0.95));
  items.push({ d: hx + 0.42, el: (
    <g key="hero" transform={at(hx, 0.42)}>
      <g transform={`scale(${HERO_SCALE})`}><Hero pose="sit" mood="happy" look={0.4} glow={0.4} t={u} rim={C.green} /></g>
    </g>
  ) });
  items.push({ d: 12.6 + 0.42, el: <g key="p1" transform={at(12.6, 0.42)}><g transform="scale(0.74)"><Person c="#7D8FC0" seat face={1} phone rim={C.green} rimA={0.6} /></g></g> });
  items.push({ d: 3.0 + 2.7, el: <g key="p2" transform={at(3.0, 2.7)}><g transform="scale(0.76)"><Person c="#8C7FC0" face={1} phone rim={C.green} rimA={0.6} /></g></g> });
  items.push({ d: 4.2 + 0.42, el: <g key="p3" transform={at(4.2, 0.42)}><g transform="scale(0.74)"><Person c="#6E9BC8" seat face={1} rim={C.green} rimA={0.6} /></g></g> });
  const [px, py] = iso(hx, 0.42);
  const k = 1.75 + u * 0.03;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(160deg,#04241F,#061A26)" }}>
      <svg width="1280" height="720" className="absolute inset-0" aria-label="밝고 한산한 열차, 좌석에 편안히 앉아 웃는 주인공">
        <g transform={cam(k, px, py - 90, 760, 360)}>
          <ellipse cx={px} cy={py} rx="420" ry="210" fill={C.green} opacity="0.08" />
          <IsoCar t={u} calm day items={items} />
          <g transform={at(hx, 0.42)}><EmojiBubble y={-(190 - 28) * HERO_SCALE - 8} e={u < 3 ? "calm" : "happy"} s={bs * 1.2} /></g>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const y = py - 60 - ((u * 30 + i * 33) % 200);
            return <circle key={i} cx={px - 120 + i * 50} cy={y} r="2.5" fill={i % 2 ? C.green : C.cyan} opacity="0.7" filter="url(#hz-glow)" />;
          })}
        </g>
        <rect width="1280" height="720" fill="url(#hz-dayvig)" />
      </svg>
      <div className="absolute rounded-full px-4 py-2 text-[15px] font-bold" style={{ left: M, top: TOP - 8, color: C.sub, background: "rgba(10,11,30,.6)", ...rise(u, 0.1, 0.5) }}>오후 6시 10분 · 같은 퇴근길</div>
      <div className="absolute flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold" style={{ right: M, top: TOP - 8, color: C.fg, background: "rgba(57,255,176,.1)", ...neon(C.green, 0.4), ...rise(u, 0.4, 0.8) }}>
        <Sofa size={16} color={C.green} /> 편한 길 · 37분
      </div>
      <div className="absolute" style={{ left: M, bottom: BOTTOM, width: span(6), ...rise(u, 0.8, 1.3, 20) }}>
        <p className="text-[46px] font-black leading-[1.3]" style={{ color: C.fg, textShadow: "0 2px 14px #000" }}>빨리 갈지, 편하게 갈지<br /><span style={{ color: C.green, textShadow: `0 0 18px ${C.green}88, 0 2px 14px #000` }}>이제 직접 고르세요.</span></p>
      </div>
      <Gauge u={u} at={0.5} from={140} to={58} lv={2} />
    </div>
  );
}

/* ---------- 7. 서비스 시작 화면 (39.5–45초) ---------- */
// onStart가 있으면 버튼이 나타난 뒤(1.9초~)부터 눌러서 경로 찾기로 이동
// 휴대폰처럼 영상이 작아지면 버튼은 그대로 두고, 누르는 영역만 화면 기준 높이 48px 이상으로 넓힘 (k = 영상 축소 비율)
function Scene7({ u, onStart, k = 1 }) {
  const shine = u > 2.2 ? ((u - 2.2) % 1.4) / 1.4 : -1;
  const live = !!onStart && u >= 1.9;
  const Btn = live ? "button" : "span";
  const go = (e) => { e.stopPropagation(); onStart(); };
  const pad = Math.max(0, (48 / k - 64) / 2);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ background: `radial-gradient(ellipse at 50% 45%, #0B2A2A, ${C.bg} 70%)` }}>
      <IsoGrid t={u} a={0.35} color="#1F5A50" />
      <div className="relative flex flex-col items-center">
        <div style={pop(u, 0.2, 0.7)}><Mark t={u} start={0.3} size={170} /></div>
        <p className="mt-4 text-[56px] font-black" style={rise(u, 0.9, 1.4, 30)}><span style={{ color: C.pink }}>빨리 갈까,</span> <span style={{ color: C.green }}>편하게 갈까?</span></p>
        <p className="mt-2 text-[26px]" style={{ color: C.fg, ...rise(u, 1.3, 1.8) }}>덜 붐비는 길, 지금 찾아보세요.</p>
        <div className="relative mt-9">
        <Btn {...(live ? { type: "button", onClick: go } : {})}
          className={"relative inline-flex items-center gap-2 overflow-hidden rounded-full px-9 py-4 text-[22px] font-bold" + (live ? " cursor-pointer transition-[filter] hover:brightness-110" : "")}
          style={{ background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, color: C.bg, boxShadow: `0 0 26px ${C.cyan}88`, ...pop(u, 1.8, 2.2) }}>
          경로 찾기 시작 <ArrowRight size={22} />
          {shine >= 0 && <span className="absolute inset-y-0 w-16" style={{ left: `${-20 + shine * 140}%`,
            background: "linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent)" }} />}
        </Btn>
        {live && pad > 0 && <span aria-hidden="true" onClick={go} className="absolute cursor-pointer" style={{ inset: -pad, borderRadius: 999 }} />}
        </div>
      </div>
      <div className="absolute flex justify-between text-[15px]" style={{ left: M, right: M, bottom: BOTTOM, color: C.sub, opacity: p(u, 2.4, 2.9) }}>
        <span>서울 지하철 1~8호선 · 공공데이터 기반</span>
        <span>웹 · 모바일 모두 지원</span>
      </div>
    </div>
  );
}

const VIEWS = { 1: Scene1, 2: Scene2, 3: Scene3, 4: Scene4, 5: Scene5, 6: Scene6, 7: Scene7 };

function layerStyle(kind, role, e) {
  if (kind === "cubeY") {
    const a = role === "out" ? -e * 90 : 90 - e * 90;
    return { transform: `translateZ(-640px) rotateY(${a}deg) translateZ(640px)`, filter: `brightness(${role === "out" ? 1 - 0.6 * e : 0.4 + 0.6 * e})` };
  }
  if (kind === "cubeX") {
    const a = role === "out" ? e * 90 : e * 90 - 90;
    return { transform: `translateZ(-360px) rotateX(${a}deg) translateZ(360px)`, filter: `brightness(${role === "out" ? 1 - 0.6 * e : 0.4 + 0.6 * e})` };
  }
  if (kind === "fade") return { opacity: role === "out" ? 1 - e : e };
  return role === "out"
    ? { transform: `translateZ(${e * 900}px) rotateZ(${e * 6}deg)`, opacity: 1 - e }
    : { transform: `translateZ(${-800 + 800 * e}px)`, opacity: e };
}

/* ---------- 소리: 전철 소리로 짠 45초 배경 음악 ----------
   붐빌 때(0–14.5초): 빨라지는 레일 소리, 모터, 불협화음, 심장 박동, 웅성거림, 급정거, 밀칠 때마다 쿵
   경고 화면(14.5–26초): 전자음 경고와 규칙적인 레일 비트, 아직 풀리지 않은 화음
   해결 후(26초~): 공기 빠지는 소리와 문 차임 뒤, 장조의 부드러운 화음과 느긋한 레일 소리 */
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0.75;
  const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const env = (g, at0, a, peak, hold, rel) => {
    g.gain.setValueAtTime(0.0001, at0); g.gain.exponentialRampToValueAtTime(peak, at0 + a);
    g.gain.setValueAtTime(peak, at0 + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, at0 + a + hold + rel);
  };
  const tone = (at0, type, f0, f1, a, hold, rel, vol, lp) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, at0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, at0 + a + hold + rel);
    env(g, at0, a, vol, hold, rel);
    if (lp) { const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(master); o.start(at0); o.stop(at0 + a + hold + rel + 0.05);
  };
  const nz = (at0, dur, vol, type, f0, f1, q = 1, a = 0.3) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, at0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, at0 + dur);
    env(g, at0, dur * a, vol, 0, dur * (1 - a)); s.connect(f); f.connect(g); g.connect(master); s.start(at0); s.stop(at0 + dur + 0.05);
  };
  const INS = {
    clack: (a0, e) => { const v = e.v || 0.35; [0, 0.11].forEach((o, i) => { nz(a0 + o, 0.08, v * (i ? 0.8 : 1), "bandpass", 650, null, 2.5, 0.1); tone(a0 + o, "sine", 85, 50, 0.003, 0.02, 0.09, v * 0.9); }); },
    motor: (a0, e) => { tone(a0, "sawtooth", e.f0, e.f1, 0.2, e.d - 0.5, 0.3, e.v || 0.05, 1800); tone(a0, "square", e.f0 * 1.5, e.f1 * 1.5, 0.2, e.d - 0.5, 0.3, (e.v || 0.05) * 0.4, 1400); },
    squeal: (a0) => { tone(a0, "sine", 2350, 2150, 0.02, 0.25, 0.25, 0.08); tone(a0, "sine", 2480, 2260, 0.02, 0.25, 0.25, 0.05); nz(a0, 0.5, 0.25, "highpass", 3000, null, 0.7, 0.05); },
    drone: (a0, e) => e.n.forEach((m) => { tone(a0, "sawtooth", mf(m), null, 0.6, e.d - 1, 0.4, e.v || 0.05, 500); }),
    heart: (a0, e) => { const v = e.v || 0.6; tone(a0, "sine", 70, 45, 0.003, 0.03, 0.15, v); tone(a0 + 0.16, "sine", 62, 42, 0.003, 0.02, 0.15, v * 0.7); },
    crowd: (a0, e) => { nz(a0, e.d, e.v || 0.12, "bandpass", 500, 700, 0.8, 0.3); nz(a0, e.d, (e.v || 0.12) * 0.6, "bandpass", 1100, 900, 1.2, 0.3); },
    bump: (a0) => { tone(a0, "sine", 110, 45, 0.003, 0.03, 0.25, 0.55); nz(a0, 0.15, 0.2, "lowpass", 900, 300, 0.7, 0.05); },
    hit: (a0) => { tone(a0, "sine", 160, 36, 0.003, 0.05, 0.5, 0.9); nz(a0, 0.25, 0.35, "lowpass", 4000, 600, 0.7, 0.05); },
    ding: (a0) => { tone(a0, "sine", 1568, null, 0.005, 0.05, 0.6, 0.18); tone(a0, "sine", 2349, null, 0.005, 0.03, 0.4, 0.06); },
    alarm: (a0) => { [0, 0.22, 0.44].forEach((o, i) => tone(a0 + o, "square", i % 2 ? 740 : 988, null, 0.005, 0.1, 0.05, 0.05, 2500)); },
    whoosh: (a0) => nz(a0, 0.6, 0.3, "bandpass", 300, 3200, 1.2),
    key: (a0) => tone(a0, "square", 1900, null, 0.002, 0.01, 0.02, 0.035),
    pop: (a0) => tone(a0, "sine", 520, 900, 0.003, 0.03, 0.06, 0.2),
    blip: (a0) => tone(a0, "triangle", 1320, 1760, 0.003, 0.04, 0.08, 0.08),
    relief: (a0, e) => { const v = e.v || 1; nz(a0, 0.9, 0.3 * v, "bandpass", 2600, 500, 1.1, 0.05); tone(a0 + 0.35, "sine", 659, null, 0.01, 0.2, 0.5, 0.15 * v); tone(a0 + 0.7, "sine", 523, null, 0.01, 0.3, 0.7, 0.15 * v); },
    pad: (a0, e) => e.n.forEach((m) => { tone(a0, "triangle", mf(m), null, 0.5, e.d - 0.8, 0.8, e.v || 0.05); tone(a0, "sine", mf(m + 12), null, 0.5, e.d - 0.8, 0.8, (e.v || 0.05) * 0.4); }),
    bass: (a0, e) => tone(a0, "triangle", mf(e.m), null, 0.01, e.d * 0.6, 0.15, e.v || 0.28),
    bell: (a0, e) => { tone(a0, "sine", mf(e.m), null, 0.005, 0.05, e.d, e.v || 0.09); tone(a0, "sine", mf(e.m) * 2.01, null, 0.005, 0.02, e.d * 0.5, (e.v || 0.09) * 0.25); },
    kick: (a0, e) => tone(a0, "sine", 120, 40, 0.003, 0.02, 0.24, e.v || 0.45),
    riser: (a0, e) => nz(a0, e.d || 1.2, 0.22, "bandpass", 400, 5000, 2, 0.8),
    final: (a0) => { [60, 64, 67, 72].forEach((m) => tone(a0, "triangle", mf(m), null, 0.02, 2.5, 2.5, 0.07)); tone(a0, "sine", mf(36), null, 0.02, 2.5, 2.5, 0.3); },
  };
  const song = [];
  const add = (sec, k, o = {}) => song.push({ t: sec, k, ...o });

  // 0–5초: 출발한 열차가 빨라지며 긴장이 쌓임
  add(0, "motor", { f0: 90, f1: 260, d: 4.8, v: 0.04 });
  add(0, "drone", { n: [45, 52], d: 5, v: 0.04 });
  let x = 0.15, gap = 0.75;
  while (x < 5) { add(x, "clack", { v: 0.22 + x * 0.03 }); x += gap; gap = Math.max(0.42, gap * 0.9); }
  add(0.3, "hit"); add(1.1, "hit"); add(2.4, "whoosh"); add(3.2, "ding");

  // 5–14.5초: 만원 열차, 치이고 밀리는 주인공 → 휴대폰을 꺼냄
  add(4.7, "whoosh");
  add(5, "crowd", { d: 9.2, v: 0.13 });
  add(5, "drone", { n: [45, 46, 52], d: 9.4, v: 0.05 });
  add(5, "motor", { f0: 240, f1: 300, d: 9, v: 0.035 });
  add(5.5, "squeal");
  PUSH.forEach(([c]) => add(5 + c - 0.05, "bump"));
  [5.8, 6.1, 6.5, 6.9, 7.3].forEach((s) => add(s, "blip"));
  for (let h = 5.2, gp = 0.9; h < 14.3; h += gp, gp = Math.max(0.46, gp * 0.95)) add(h, "heart", { v: 0.5 });
  for (let c = 6.0; c < 14.3; c += 0.42) add(c, "clack", { v: 0.3 });
  add(11.2, "ding");
  add(13.4, "riser", { d: 1.1 }); add(14.4, "hit");

  // 14.5–26초: 서비스 화면. 전자음 경고와 규칙적인 레일 비트
  for (let k = 0; k < 15; k++) add(15.0 + k * 0.053, "key");
  [[14.5, "Dm"], [17.5, "E"], [20.5, "Dm"], [23.5, "E"]].forEach(([s, c]) => add(s, "drone", { n: c === "Dm" ? [50, 57, 62] : [52, 56, 59], d: 3, v: 0.035 }));
  for (let b = 14.5; b < 26; b += 0.3) { const k = Math.round((b - 14.5) / 0.3); if (k % 2 === 0) add(b, "clack", { v: 0.16 }); if (k % 4 === 0) add(b, "kick", { v: 0.32 }); }
  add(16.2, "pop"); add(16.4, "whoosh"); add(17.0, "whoosh");
  [17.9, 18.0, 18.1, 18.2, 18.3, 18.4].forEach((s) => add(s, "blip"));
  add(18.1, "alarm"); add(19.2, "alarm");
  [18.7, 18.8, 18.9, 19.0, 19.1, 19.2, 19.3].forEach((s) => add(s, "pop"));
  [19.1, 19.22, 19.34, 19.46, 19.58].forEach((s) => add(s, "blip"));
  [20.3, 20.4, 20.5, 20.6].forEach((s) => add(s, "key"));
  add(23.6, "riser", { d: 1.0 });
  add(24.6, "whoosh"); add(24.8, "pop");
  [26.0, 26.06, 26.12, 26.18, 26.24, 26.3].forEach((s) => add(s, "blip"));

  // 26.2초 "+5분이면 2단계 덜 붐빔": 해결. 이후는 편안한 장조
  add(26.2, "relief");
  const PAD = { C: [60, 64, 67], F: [60, 65, 69], G: [59, 62, 67], Am: [60, 64, 69] };
  const ROOT = { C: 36, F: 41, G: 43, Am: 45 };
  const BELL = { C: [72, 76, 79, 76], F: [72, 77, 81, 77], G: [71, 74, 79, 74], Am: [72, 76, 81, 76] };
  ["C", "F", "C", "G", "Am", "F"].forEach((c, i) => {
    const s = 26.6 + i * 2.4;
    add(s, "pad", { n: PAD[c], d: 2.7, v: 0.045 });
    add(s, "bass", { m: ROOT[c], d: 1.2 }); add(s + 1.2, "bass", { m: ROOT[c] + 7, d: 1.2, v: 0.2 });
    BELL[c].forEach((m, k) => add(s + k * 0.6, "bell", { m, d: 0.9, v: k ? 0.06 : 0.08 }));
  });
  for (let c = 26.9; c < 42.5; c += 1.2) add(c, "clack", { v: 0.1 });
  [27.2, 27.4, 27.6, 27.8, 28.0, 28.2, 28.4].forEach((s) => add(s, "key"));
  add(29.0, "whoosh"); [29.5, 29.85, 30.2, 30.55].forEach((s) => add(s, "pop"));
  add(33.2, "whoosh"); add(33.9, "relief", { v: 0.5 });
  add(38.7, "riser", { d: 0.8 }); add(39.2, "whoosh");
  add(39.7, "pop"); add(40.4, "hit"); add(40.4, "final");
  add(40.4, "motor", { f0: 220, f1: 80, d: 3.5, v: 0.025 });
  add(41.3, "pop"); add(41.7, "ding");

  song.sort((a, b) => a.t - b.t);
  let schedTo = 0;
  return {
    ac,
    reset(from) { schedTo = from; },
    tick(now) {
      if (ac.state !== "running") { schedTo = now; return; }   // 소리가 잠겨 있는 동안 밀린 효과음을 한꺼번에 내지 않음
      const until = now + 0.3;
      song.forEach((e) => { if (e.t >= schedTo && e.t < until) { try { INS[e.k](ac.currentTime + Math.max(0, e.t - now), e); } catch (err) { /* 무시 */ } } });
      schedTo = Math.max(schedTo, until);
    },
  };
}

// 아이폰은 Web Audio 소리를 '벨소리'처럼 취급해 무음 스위치를 켜면 꺼 버림.
// 영상처럼 '미디어 소리'로 나가게 하려면 미디어 재생 상태로 바꿔 둬야 함.
function silentWav() {
  const sr = 8000, n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, str) => [...str].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

/* ---------- 쇼릴 속 체험 게임 ----------
   만원 열차 장면이 끝나는 GAME_AT초에 쇼릴을 멈추고 한 판(2단계 난이도) 체험 → 결과 한 줄 → 쇼릴 이어서 */
const GAME_AT = 10.2;
// 「게임 하기」로 같은 창에서 게임에 갔다가 뒤로 가기로 돌아오면, 떠난 자리에서 멈춘 채로 이어 보기 (이 탭 안에서만 기억)
const RESUME_KEY = "easy-nav-reel-resume";
// 영상 공유: 재생 막대의 공유 아이콘은 영상 전용 주소(/reel)를 보냄. /reel은 영상용 미리보기 카드를 가진 작은 페이지로, 열면 /?reel=1로 넘어옴
const SITE_URL = "https://easy-nav-iota.vercel.app";
const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
// 「게임 하기」 버튼이 여는 본 게임(1단계부터 게임 오버까지 · 명예의 전당). 사이트에 게임 페이지를 붙이면 그 주소로 바꿉니다.
const FULL_GAME_URL = "https://claude.ai/artifact/VNki4DnLmkYqUao581B1qJ";
function GameBreak({ ac, onDone }) {
  const cvRef = useRef(null);
  const [phase, setPhase] = useState("ready");   // ready → play → bridge
  const [res, setRes] = useState(null);
  const [readyK, setReadyK] = useState(0);
  const game = useRef(null);
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // 게임 화면 규칙
  //  휴대폰: 늘 세로형(600×1000)으로 화면을 꽉 채움. 가로로 들면 게임 화면 전체를 -90° 돌려 세로로 세움
  //  태블릿: 세로로 들면 세로형, 가로로 들면 컴퓨터와 같은 가로형(1120×560). 돌리지 않음 (판을 시작할 때의 방향 기준)
  //  컴퓨터: 가로형
  const [touch] = useState(isTouch);
  const [phone] = useState(isPhone);
  const [tall] = useState(() => phone || (touch && deviceUpright()));
  const [land, setLand] = useState(() => phone && innerWidth > innerHeight);
  const [vpx, setVpx] = useState(() => (typeof innerWidth !== "undefined" ? { w: innerWidth, h: innerHeight } : { w: 0, h: 0 }));
  useEffect(() => {
    if (!touch) return;
    const on = () => { setLand(phone && innerWidth > innerHeight); setVpx({ w: innerWidth, h: innerHeight }); };
    addEventListener("resize", on); addEventListener("orientationchange", on);
    return () => { removeEventListener("resize", on); removeEventListener("orientationchange", on); };
  }, []);
  const landRef = useRef(land); landRef.current = land;
  const CW = tall ? 600 : 1120, CH = tall ? 1000 : 560;
  useEffect(() => {
    // 남은 공간에 맞춰 게임 화면 비율 그대로 가장 크게
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const w = Math.min(width, height * (CW / CH), CW);
      setSize({ w, h: w * (CH / CW) });
    });
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // 안내가 뜬 뒤 「직접 피해 보세요」 버튼을 누르면 시작 (누르지 않아도 6초 뒤 자동 시작)
    const t0 = performance.now(); let raf;
    const tick = (now) => { const e = (now - t0) / 1000; setReadyK(Math.min(1, Math.max(0, (e - 1.2) / 0.4))); if (e >= 6) setPhase((p) => (p === "ready" ? "play" : p)); else raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (phase !== "play" || !cvRef.current) return;
    game.current = startMiniGame(cvRef.current, {
      ac, tall, get rotated() { return landRef.current; },
      onEnd: (r) => { setRes(r); setPhase("bridge"); },
    });
    return () => game.current && game.current.stop();
  }, [phase]);
  useEffect(() => {
    if (phase !== "bridge") return;
    const t = setTimeout(() => onDone(res), 2600);
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <div onClick={(e) => e.stopPropagation()} className={"z-50 flex flex-col items-center gap-3 p-3 " + (touch ? "fixed" : "fixed inset-0 md:absolute md:p-4")}
      style={{ background: touch ? "#060614" : "rgba(6,6,20,.94)", ...(touch ? (land
        ? { left: "50%", top: "50%", width: vpx.h, height: vpx.w, transform: "translate(-50%, -50%) rotate(-90deg)" }
        : { left: 0, top: 0, width: vpx.w, height: vpx.h }) : null) }} role="dialog" aria-label="체험 게임: 혼잡한 열차를 피해서 목적지로 이동해 보자!">
      <div className="flex w-full items-center justify-between gap-2" style={{ maxWidth: size.w || CW, containerType: "inline-size" }}>
        {/* 제목: 컴퓨터는 한 줄, 휴대폰(세로 게임)은 "목적지" 앞에서 두 줄로 나눔 */}
        <p className={"flex min-w-0 items-center gap-2 font-black" + (phone ? "" : " whitespace-nowrap")} style={{ color: C.fg, fontSize: phone ? 15 : "clamp(11px, 2.9cqw, 19px)", whiteSpace: phone ? undefined : "nowrap" }}>
          <svg viewBox="0 0 48 48" aria-hidden="true" className="h-auto w-[30px] shrink-0 md:w-[38px]"><g stroke="#3A2400" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><circle cx="24" cy="20" r="16" fill="#FFD34D"/><path d="M11.5 11.5 L20.5 15 M36.5 11.5 L27.5 15" strokeWidth="3"/><ellipse cx="18" cy="20.5" rx="3.3" ry="4" fill="#3A2400"/><ellipse cx="30" cy="20.5" rx="3.3" ry="4" fill="#3A2400"/><circle cx="19.1" cy="18.8" r="1.25" fill="#fff" stroke="none"/><circle cx="31.1" cy="18.8" r="1.25" fill="#fff" stroke="none"/><ellipse cx="11.6" cy="26.4" rx="3.2" ry="1.9" fill="#FF8FB0" opacity=".75" stroke="none"/><ellipse cx="36.4" cy="26.4" rx="3.2" ry="1.9" fill="#FF8FB0" opacity=".75" stroke="none"/><path d="M18.6 35.06 C18.6 28.6 20.6 26.4 24 26.4 C27.4 26.4 29.4 28.6 29.4 35.06 A16 16 0 0 1 18.6 35.06 Z" fill="#FF9DB4" strokeWidth="2"/><path d="M2.4 3 l3.4 2.6 M1.2 10 l3.9 1.1 M42.6 13.4 l3.6 -1.2 M42.8 19.4 l3.6 1.1" stroke="#FF2E97" strokeWidth="2.2"/><circle cx="10.5" cy="39.5" r="7" fill="#FFD34D"/><circle cx="37.5" cy="39.5" r="7" fill="#FFD34D"/><path d="M8.1 40.6 V45.4 M10.5 40.2 V46.2 M12.9 40.6 V45.4 M35.1 40.6 V45.4 M37.5 40.2 V46.2 M39.9 40.6 V45.4" fill="none" strokeWidth="1.3"/></g></svg>
          <span>
            <span className="whitespace-nowrap" style={{ display: phone ? "block" : "inline" }}><span style={gradText(C.pink, C.cyan)}>혼잡한 열차</span>를 피해서</span>{phone ? null : " "}
            <span className="whitespace-nowrap" style={{ display: phone ? "block" : "inline" }}><span style={gradText(C.green, C.cyan)}>목적지</span>로 이동해 보자!</span>
          </span>
        </p>
        <button type="button" onClick={() => onDone(null)} className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-[12px] font-bold md:px-4 md:text-[13px]"
          style={{ background: C.bg2, color: C.fg, boxShadow: `0 0 0 1px ${C.line}` }}>건너뛰기 ⏭</button>
      </div>
      <div ref={box} className="flex min-h-0 w-full flex-1 items-center justify-center">
      <div className="relative" style={{ width: size.w, height: size.h, containerType: "size" }}>
        <canvas ref={cvRef} width={CW} height={CH} className="block h-full w-full rounded-2xl"
          style={{ touchAction: "none", background: "radial-gradient(ellipse at 50% 0%,#17123F,#0A0B1E 75%)", boxShadow: `0 0 0 1px ${C.line}` }} />
        {phase === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl px-3 text-center" style={{ background: "rgba(10,11,30,.85)" }}>
            <p className="font-black leading-snug" style={{ color: C.fg, fontSize: "clamp(18px, 5.2cqw, 46px)" }}>
              붐비는 열차,<br /><span className="whitespace-nowrap" style={gradText(C.pink, C.red)}>피해서 갈 수는 없을까?</span>
            </p>
            <button type="button" onClick={() => setPhase("play")} disabled={readyK < 1}
              className={"mt-6 inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-6 text-[15px] font-black" + (phone ? "" : " md:mt-10 md:min-h-[56px] md:px-8 md:text-[22px]")}
              style={{ background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, color: C.bg, boxShadow: `0 0 20px ${C.cyan}66`, opacity: readyK }}>
              직접 피해 보세요 <ArrowRight size={18} />
            </button>
            <p className={"text-[13px]" + (phone ? "" : " md:text-[18px]")} style={{ color: C.sub, opacity: readyK }}>{touch ? "화면을 터치해서 움직여요" : "방향키·WASD로 움직여요"}</p>
          </div>
        )}
        {phase === "bridge" && (
          // 시작 화면과 같은 규칙: 큰 제목(같은 크기) → 넓은 간격 → 본문 두 줄(버튼 글자 크기), 줄마다 한 줄 고정
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl px-3 text-center" style={{ background: "rgba(10,11,30,.88)" }}>
            <p className="font-black leading-snug" style={{ color: res && res.arrived ? C.green : C.pink, fontSize: "clamp(18px, 5.2cqw, 46px)" }}>
              {res && res.arrived ? "무사히 도착!" : "아쉽게 막혔어요"}
            </p>
            <p className={"mt-6 font-bold leading-relaxed" + (phone ? "" : " md:mt-10")} style={{ color: C.fg, fontSize: "clamp(13px, 3.4cqw, 24px)" }}>
              <span className="whitespace-nowrap">{res && res.arrived ? "잘 피했지만, 매일 이렇게 피해 다닐 순 없죠." : "혼잡한 열차를 직접 피하기, 쉽지 않죠?"}</span>
              <br />
              <span className="whitespace-nowrap font-black" style={gradText(C.cyan, C.green)}>그래서 덜 붐비는 길을 미리 찾아 드려요.</span>
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/* ---------- 본체 ---------- */
// fitOffset: 화면 높이에서 쇼릴 말고 차지하는 높이(상단 바·여백·아래 재생 버튼 줄, px).
//  쇼릴 폭을 (화면 높이 − fitOffset) × 16/9 이하로 줄여서 한 화면에 들어가게 함
// cta: 쇼릴 옆(넓은 화면)·아래(좁은 화면)에 함께 놓을 버튼들 (예: 경로 찾기 시작, 서비스 소개 보기)
// onStart: 마지막 장면의 「경로 찾기 시작」을 눌렀을 때 할 일 (없으면 그림으로만 보임)
export default function ShowReel({ gameHref = FULL_GAME_URL, fitOffset = 120, cta = null, onStart = null }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [sound, setSound] = useState(false);
  const [scale, setScale] = useState(1);
  const tRef = useRef(0);
  const wrap = useRef(null);
  const audio = useRef(null);
  const gameDone = useRef(false);
  const [gameOn, setGameOn] = useState(false);
  const [gate, setGate] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { tRef.current = DUR - 1.5; setT(DUR - 1.5); setPlaying(false); }
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(RESUME_KEY) || "null"); sessionStorage.removeItem(RESUME_KEY); } catch (e) { /* 저장소를 못 쓰면 처음부터 */ }
    // 영상 공유 링크로 들어옴: 첫 장면에서 멈추고 「소리 켜고 재생」 버튼으로 시작 (주소의 ?reel=1은 지움)
    if (new URLSearchParams(location.search).has("reel")) {
      saved = null; tRef.current = 0; setT(0); setPlaying(false); setGate(true);
      try { history.replaceState(history.state, "", location.pathname + location.hash); } catch (e) { /* 무시 */ }
    }
    if (saved && saved.t > 0 && saved.t < DUR) {
      tRef.current = saved.t; setT(saved.t); gameDone.current = saved.gameDone || saved.t > GAME_AT; setPlaying(false);
    }
    // 브라우저가 페이지를 통째로 되살린 경우(뒤로 가기 캐시)는 화면이 그대로이므로 기억만 지움
    const clear = (e) => { if (e.persisted) try { sessionStorage.removeItem(RESUME_KEY); } catch (err) { /* 무시 */ } };
    window.addEventListener("pageshow", clear);
    return () => window.removeEventListener("pageshow", clear);
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1280));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      let next = tRef.current + dt;
      if (!gameDone.current && tRef.current < GAME_AT && next >= GAME_AT) {
        // 만원 열차 장면이 끝나면 쇼릴을 멈추고 체험 게임으로
        tRef.current = GAME_AT; setT(GAME_AT); setPlaying(false); setGameOn(true);
        return;
      }
      if (next >= DUR) { next = DUR; setPlaying(false); }
      tRef.current = next; setT(next);
      if (audio.current) audio.current.tick(next);
      if (next < DUR) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (x) => { tRef.current = x; setT(x); if (audio.current) audio.current.reset(x); };
  const replay = () => { gameDone.current = false; setGameOn(false); seek(0); setPlaying(true); if (audio.current) audio.current.ac.resume(); };
  const endGame = () => {
    gameDone.current = true; setGameOn(false);
    if (audio.current) { audio.current.reset(GAME_AT); audio.current.ac.resume(); }
    setPlaying(true);
  };
  const togglePlay = () => {
    if (tRef.current >= DUR) return replay();
    setGate(false);
    const next = !playing; setPlaying(next);
    if (audio.current) next ? audio.current.ac.resume() : audio.current.ac.suspend();
  };
  const [acState, setAcState] = useState("");
  const media = useRef(null);
  const asMedia = () => {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* 무시 */ }
    try {
      if (!media.current) { media.current = new Audio(silentWav()); media.current.loop = true; media.current.setAttribute("playsinline", ""); }
      const pr = media.current.play(); if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { /* 무시 */ }
  };
  // 모바일 브라우저는 소리를 '사용자가 누른 순간'에만 켜 줌 → 누를 때마다 다시 깨움
  const wake = () => {
    const a = audio.current; if (!a) return;
    try { const b = a.ac.createBuffer(1, 1, 22050), src = a.ac.createBufferSource(); src.buffer = b; src.connect(a.ac.destination); src.start(0); } catch (e) { /* 무시 */ }
    if (a.ac.state !== "running") { const pr = a.ac.resume(); if (pr && pr.then) pr.then(() => setAcState(a.ac.state)).catch(() => {}); }
  };
  const toggleSound = () => {
    if (!sound) {
      asMedia();   // 버튼을 누른 순간에 먼저 미디어 재생으로 전환
      if (!audio.current) {
        audio.current = makeAudio();
        if (!audio.current) { setAcState("unsupported"); return; }
        const a = audio.current; a.ac.onstatechange = () => setAcState(a.ac.state);
      }
      // 소리만 켜고 지금 보던 자리부터 이어서 (처음으로 돌아가지 않음)
      audio.current.reset(tRef.current);
      wake(); setAcState(audio.current.ac.state); setSound(true);
    } else {
      audio.current && audio.current.ac.close(); audio.current = null; setSound(false); setAcState("");
      if (media.current) media.current.pause();
    }
  };
  useEffect(() => {
    const onVis = () => { if (!document.hidden) wake(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const layers = [];
  const cur = SCENES.find((s) => t >= s.from && t < s.to) || SCENES[SCENES.length - 1];
  layers.push({ s: cur, style: {} });
  SCENES.slice(1).forEach((s, i) => {
    const f = (t - (s.from - TR / 2)) / TR;
    if (f > 0 && f < 1) {
      const e = ease(f), prev = SCENES[i], kind = TRANS[s.id];
      layers.length = 0;
      layers.push({ s: prev, style: layerStyle(kind, "out", e) });
      layers.push({ s, style: layerStyle(kind, "in", e) });
    }
  });
  const sceneIdx = SCENES.indexOf(cur);

  // 재생 막대: 넓은 화면은 영상 안 아래쪽(마우스를 올리거나 멈췄을 때만 보임), 좁은 화면은 영상 아래
  // ── 전체 화면 보기 ──
  //  아이폰 사파리는 영상 파일이 아닌 화면 요소의 전체 화면을 막아 두어서, 페이지 안에서 직접 화면을 채움.
  //  세로로 든 휴대폰은 영상 앱처럼 쇼릴을 90° 돌려 꽉 채움(게임이 나오면 게임은 바로 선 채로).
  //  안드로이드 등 지원 브라우저에서는 주소창까지 숨기는 진짜 전체 화면 + 가로 고정도 함께 시도
  const [fs, setFs] = useState(false);
  const [vp, setVp] = useState({ w: typeof innerWidth !== "undefined" ? innerWidth : 1280, h: typeof innerHeight !== "undefined" ? innerHeight : 720 });
  useEffect(() => {
    const on = () => setVp({ w: innerWidth, h: innerHeight });
    addEventListener("resize", on); addEventListener("orientationchange", on);
    return () => { removeEventListener("resize", on); removeEventListener("orientationchange", on); };
  }, []);
  useEffect(() => {
    if (!fs) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e) => { if (e.key === "Escape") exitFs(); };
    addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; removeEventListener("keydown", key); };
  }, [fs]);
  const enterFs = () => {
    setFs(true); setUi(false);
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    try {
      if (req && !document.fullscreenElement) Promise.resolve(req.call(el)).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape")).catch(() => {});
    } catch (e) { /* 지원하지 않으면 페이지 안 전체 화면만 */ }
  };
  const exitFs = () => {
    setFs(false);
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* 무시 */ }
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* 무시 */ }
  };
  // 휴대폰을 세로로 들었을 때만 영상을 돌려 가로로 꽉 채움. 태블릿 세로는 돌리지 않고 화면 폭에 맞춤 (게임 중에는 돌리지 않음)
  const [phoneDev] = useState(isPhone);
  // 전체 화면에서 도구 막대·✕는 평소 숨기고, 화면을 누르거나 마우스를 움직일 때 3초 동안 보임 (멈춰 있으면 계속 보임)
  const [ui, setUi] = useState(false);
  const uiTimer = useRef(null);
  const showUi = () => { setUi(true); clearTimeout(uiTimer.current); uiTimer.current = setTimeout(() => setUi(false), 3000); };
  useEffect(() => () => clearTimeout(uiTimer.current), []);
  const uiOn = !playing || ui;
  // 게임 하기: 우리 사이트 안의 주소면 같은 창에서 열고(뒤로 가기로 복귀), 다른 사이트 주소면 새 탭
  const gameOut = /^https?:/.test(gameHref);
  const leaveForGame = () => {
    setPlaying(false); if (audio.current) audio.current.ac.suspend();
    if (!gameOut) try { sessionStorage.setItem(RESUME_KEY, JSON.stringify({ t: tRef.current, gameDone: gameDone.current })); } catch (e) { /* 무시 */ }
  };
  // 마지막 장면 버튼: 전체 화면을 끝내고 쇼릴을 멈춘 뒤 이동
  const goStart = onStart ? () => { exitFs(); setPlaying(false); if (audio.current) audio.current.ac.suspend(); onStart(); } : null;
  const rot = fs && phoneDev && vp.h > vp.w && !gameOn;
  let fsStyle;
  if (fs && gameOn) {
    // 게임 중에는 쇼릴 상자를 화면 전체로 펴서(돌리지 않음) 게임이 바로 선 채로 화면을 채우게 함
    fsStyle = { position: "fixed", zIndex: 70, left: 0, top: 0, width: vp.w, height: vp.h, aspectRatio: "auto", borderRadius: 0, transform: "none", boxShadow: "none" };
  } else if (fs) {
    const long = rot ? vp.h : vp.w, short = rot ? vp.w : vp.h;
    const w = Math.min(long, short * 16 / 9), h = w * 9 / 16;
    fsStyle = { position: "fixed", zIndex: 70, left: "50%", top: "50%", width: w, height: h, aspectRatio: "auto", borderRadius: 0,
      transform: `translate(-50%, -50%)${rot ? " rotate(90deg)" : ""}`, boxShadow: "none" };
  }
  const fsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {fs ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  );

  // 공유: 휴대폰은 기본 공유 창, 없으면 링크 복사 후 2초 안내
  const shareReel = async () => {
    const base = !window.claude && /^https?:$/.test(location.protocol) && !/claude\.ai$/.test(location.hostname) ? location.origin : SITE_URL;
    const url = base + "/reel", title = "빨리 갈까, 편하게 갈까? · 45초 영상", text = "몇 분 더 쓰면 얼마나 덜 붐빌까? 45초 영상으로 확인해 보세요.";
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { /* 복사 실패 */ }
    setShareMsg(ok ? "영상 링크를 복사했어요" : url.replace(/^https?:\/\//, ""));
    setTimeout(() => setShareMsg(""), ok ? 2000 : 6000);
  };
  const startWithSound = (e) => {
    e.stopPropagation(); setGate(false);
    if (!sound) toggleSound(); else if (audio.current) audio.current.ac.resume();
    setPlaying(true);
  };
  const bar = (inVideo) => (
    <div onClick={(e) => e.stopPropagation()}
      className={inVideo
        ? "absolute inset-x-0 bottom-0 z-40 items-center gap-3 px-4 pb-3 pt-10 transition-opacity duration-300 " + (fs ? "flex " + (uiOn ? "opacity-100" : "pointer-events-none opacity-0") : "hidden lg:flex " + (playing ? "opacity-0 group-hover:opacity-100 focus-within:opacity-100" : "opacity-100"))
        : "mt-3 flex items-center gap-3 lg:hidden"}
      style={inVideo ? { background: "linear-gradient(transparent, rgba(6,6,20,.85))", cursor: "default" } : undefined}>
      <button type="button" onClick={togglePlay} aria-label={playing ? "일시 정지" : "재생"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: C.bg2, color: C.fg, boxShadow: `0 0 0 1px ${C.line}` }}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      {/* 재생 막대: 장면 시작 지점만 점으로 표시(글귀는 숨기고 마우스를 올리면 이름이 뜸). 점이나 막대를 누르면 그 자리로 이동 */}
      <div className="relative h-6 min-w-0 flex-1 cursor-pointer"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.max(0, Math.min(DUR - 0.01, ((e.clientX - r.left) / r.width) * DUR))); }}>
        <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 overflow-hidden rounded-full" style={{ background: C.line }}>
          <div className="h-full rounded-full" style={{ width: `${(t / DUR) * 100}%`, background: `linear-gradient(90deg, ${C.pink}, ${C.cyan})`, boxShadow: `0 0 10px ${C.cyan}` }} />
        </div>
        {SCENES.map((s, i) => i > 0 && (
          <button key={s.id} type="button" title={s.label} aria-label={`${s.label} 장면으로 이동`}
            onClick={(e) => { e.stopPropagation(); seek(s.from + TR / 2 + 0.01); }}
            className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center" style={{ left: `${(s.from / DUR) * 100}%` }}>
            <span className="block h-[10px] w-[10px] rounded-full" style={{ background: t >= s.from ? C.fg : C.bg2, boxShadow: `0 0 0 2px ${i === sceneIdx ? C.cyan : C.line}` }} />
          </button>
        ))}
      </div>
      {/* 좁은 화면 아래 막대는 공유 버튼 자리를 위해 시간 표시를 숨김 */}
      <span className={"w-[74px] shrink-0 text-right text-[13px] tabular-nums" + (inVideo ? "" : " hidden sm:inline")} style={{ color: C.sub }}>{t.toFixed(1)} / {DUR}초</span>
      {/* 소리: 일반 영상 도구 막대처럼 재생 막대 오른쪽 끝. 꺼져 있을 때는 눈에 띄게 색을 입힘 */}
      <button type="button" onClick={toggleSound} aria-label={sound ? "소리 끄기" : "소리 켜기"} title={sound ? "소리 끄기" : "소리 켜기"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={sound ? { background: C.bg2, color: C.fg, boxShadow: `0 0 0 1px ${C.line}` } : { background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, color: C.bg, boxShadow: `0 0 14px ${C.cyan}88` }}>
        {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
      {/* 공유: 누른 버튼 바로 왼쪽에 말풍선으로 결과 안내(2초). 장면을 가리지 않도록 재생 막대 줄 안에 띄움 */}
      <div className="relative shrink-0">
        <button type="button" onClick={shareReel} aria-label="영상 공유하기" title="영상 공유하기"
          className="grid h-9 w-9 place-items-center rounded-full" style={{ background: C.bg2, color: C.fg, boxShadow: `0 0 0 1px ${C.line}` }}>
          <ShareIcon />
        </button>
        {shareMsg && (
          <div role="status" className="pointer-events-none absolute right-full top-1/2 z-50 mr-3 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold md:text-[13px]"
            style={{ background: C.bg, color: C.cyan, boxShadow: `0 0 0 1px ${C.cyan}, 0 0 14px ${C.cyan}55` }}>
            {shareMsg}
            <span aria-hidden="true" className="absolute left-full top-1/2 -translate-y-1/2" style={{ width: 0, height: 0, borderStyle: "solid", borderWidth: "5px 0 5px 7px", borderColor: `transparent transparent transparent ${C.cyan}` }} />
          </div>
        )}
      </div>
      <button type="button" onClick={fs ? exitFs : enterFs} aria-label={fs ? "전체 화면 끝내기" : "전체 화면으로 보기"} title={fs ? "전체 화면 끝내기" : "전체 화면으로 보기"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: C.bg2, color: C.fg, boxShadow: `0 0 0 1px ${C.line}` }}>
        {fsIcon}
      </button>
    </div>
  );
  const btn = "inline-flex min-h-[40px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-bold sm:text-[13px] lg:min-h-[44px]";
  const plain = { background: C.bg2, color: C.fg, boxShadow: `0 0 0 1px ${C.line}` };

  return (
    // 배치 격자: 넓은 화면(1024px 이상)은 [영상 | 버튼 세로 줄 180px], 간격 16px. 영상과 버튼 줄의 위·아래 끝을 맞춤
    //  좁은 화면은 영상 아래에 재생 막대(소리 포함) → 버튼 4칸 한 줄(게임·다시 보기·cta 2개), 영상과 같은 좌우 끝
    <div className="mx-auto w-full max-w-[var(--reelw)] font-sans lg:max-w-[calc(var(--reelw)+196px)]" style={{ color: C.fg, "--reelw": `min(1404px, max(320px, calc((100svh - ${fitOffset}px) * 16 / 9)))` }}>
      <SharedDefs />
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_180px] lg:items-stretch lg:gap-4">
        <div className="min-w-0">
          {fs && <div className="fixed inset-0 z-[69]" style={{ background: "#000" }} aria-hidden="true" />}
          <div ref={wrap} onPointerDown={wake} onMouseMove={fs ? showUi : undefined}
            onClick={() => { if (gameOn) return; if (fs && !ui) { showUi(); return; } if (tRef.current >= DUR) { if (fs) showUi(); return; } togglePlay(); if (fs) showUi(); }} className={"group relative w-full overflow-hidden rounded-2xl " + (t >= DUR && !gameOn ? "cursor-default" : "cursor-pointer")} style={{ aspectRatio: "16 / 9", background: C.bg, boxShadow: `0 0 0 1px ${C.line}, 0 0 40px ${C.violet}33`, ...fsStyle }}>
            {fs && !gameOn && (
              <button type="button" onClick={(e) => { e.stopPropagation(); exitFs(); }} aria-label="전체 화면 끝내기"
                className={"absolute right-3 top-3 z-40 grid h-10 w-10 place-items-center rounded-full text-[18px] font-bold transition-opacity duration-300 " + (uiOn ? "opacity-100" : "pointer-events-none opacity-0")}
                style={{ background: "rgba(10,11,30,.75)", color: C.fg, boxShadow: `0 0 0 1px ${C.line}` }}>✕</button>
            )}
            <div className="absolute left-0 top-0 h-[720px] w-[1280px] origin-top-left" style={{ transform: `scale(${scale})`, perspective: "1600px" }}>
              {layers.map(({ s, style }) => {
                const V = VIEWS[s.id];
                return (
                  <div key={s.id} className="absolute inset-0 overflow-hidden" style={{ backfaceVisibility: "hidden", ...style }}>
                    <V t={t} u={t - s.from} onStart={goStart} k={scale} />
                  </div>
                );
              })}
            </div>
            {gate && !playing && !gameOn && (
              <div className="absolute inset-0 z-30 grid place-items-center" style={{ background: "rgba(6,6,20,.45)" }}>
                <button type="button" onClick={startWithSound}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-black md:px-7 md:py-4 md:text-[20px]"
                  style={{ background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, color: C.bg, boxShadow: `0 0 28px ${C.cyan}99` }}>
                  <Play size={20} /> 소리 켜고 재생
                </button>
              </div>
            )}
            {!playing && !gameOn && t > 0.05 && t < DUR && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center" style={{ background: "rgba(6,6,20,.35)" }}>
                <span className="grid h-16 w-16 place-items-center rounded-full md:h-20 md:w-20" style={{ background: "rgba(10,11,30,.75)", color: C.fg, boxShadow: `0 0 0 1px ${C.line}, 0 0 24px ${C.cyan}55` }}><Play size={30} /></span>
              </div>
            )}
            {!gameOn && bar(true)}
            {gameOn && <GameBreak ac={sound && audio.current ? audio.current.ac : null} onDone={endGame} />}
          </div>
          {bar(false)}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 lg:mt-0 lg:flex lg:flex-col lg:justify-between lg:gap-6">
          <div className="contents lg:grid lg:grid-cols-1 lg:gap-3">
            <button type="button" onClick={toggleSound} className={btn.replace("inline-flex ", "hidden lg:inline-flex ")}
              style={sound ? plain : { background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, color: C.bg }}>
              {sound ? <><VolumeX size={15} /> 소리 끄기</> : <><Volume2 size={15} /> 소리 켜기</>}
            </button>
            <button type="button" onClick={togglePlay} className={btn.replace("inline-flex ", "hidden lg:inline-flex ")} style={plain}>
              {playing ? <><Pause size={15} /> 일시 정지</> : <><Play size={15} /> 재생</>}
            </button>
            <a href={gameHref} {...(gameOut ? { target: "_blank", rel: "noopener noreferrer" } : {})} onClick={leaveForGame} className={btn} style={plain}>
              🎮 게임<span className="hidden sm:inline"> 하기</span>
            </a>
            <button type="button" onClick={replay} className={btn} style={plain}>
              <RotateCcw size={15} /> 다시 보기
            </button>
            {sound && playing && acState && acState !== "running" && (
              <span className="col-span-4 text-[12px] lg:col-span-1" style={{ color: C.red }}>{acState === "unsupported" ? "이 브라우저는 소리를 지원하지 않아요" : "소리가 멈춰 있어요 · 화면을 한 번 눌러 주세요"}</span>
            )}
          </div>
          {/* 서비스로 가는 버튼: 좁은 화면은 게임·다시 보기와 함께 4칸 한 줄, 넓은 화면은 오른쪽 줄 아래 끝 */}
          {cta && <div className="contents lg:grid lg:grid-cols-1 lg:gap-3">{cta}</div>}
        </div>
      </div>
    </div>
  );
}
