import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MAP from "../../data/metroMap.json";

// 노선도에서 역 고르기
//  - 처음에는 1~8호선 전체. 호선 칩을 누르면 그 노선만 선명하게 남고 화면이 그 노선에 맞춰집니다.
//  - 노선을 고르면 환승역에서 갈아탈 노선이 한 칸만 선명한 꼬리로 보입니다.
//  - 역을 누르면 「여기서 출발 / 여기로 도착」 창이 뜨고, 누르면 onPick("from" | "to", 역 이름)을 부릅니다.
//  - 확대·축소: 버튼, 마우스 휠, 두 손가락. 이동: 끌기.
//  노선도 좌표(metroMap.json)는 역 좌표 공공데이터로 배치를 잡고 꺾는 역만 직접 정해 만든 고정 파일입니다.

const LINES = Object.keys(MAP.lines);
const PAD = 0.6; // 범위 둘레 여백 (노선도 칸)
const FS = 0.34; // metroMap.json의 이름 자리(label)를 계산한 글자 크기 (칸)

// 범위 b=[x0, y0, x1, y1]이 화면(size: 가로·세로 px)에 꽉 차는 보기 영역.
//  좌우 56px·위아래 28px를 비워 두어, 휴대폰처럼 좁은 화면에서도 끝 역 이름이 잘리지 않게 합니다.
function fit(b, size, mx = 56, my = 28) {
  const bw = b[2] - b[0] + PAD * 2, bh = b[3] - b[1] + PAD * 2;
  const s = Math.max(bw / Math.max(1, size.w - mx * 2), bh / Math.max(1, size.h - my * 2)); // 1px = s칸
  const w = size.w * s, h = size.h * s;
  return { x: (b[0] + b[2]) / 2 - w / 2, y: (b[1] + b[3]) / 2 - h / 2, w, h };
}

export default function RouteMap({ onPick }) {
  const box = useRef(null);
  const svg = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [line, setLine] = useState(null); // null = 전체
  const [view, setView] = useState(null);
  const [picked, setPicked] = useState(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const moved = useRef(false);

  // 화면 크기 재기
  useLayoutEffect(() => {
    const el = box.current;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const home = fit(line ? MAP.lines[line].bounds : MAP.bounds, size);
  // 노선을 바꾸거나 화면 비율이 바뀌면 그 범위에 맞춤
  useEffect(() => {
    setView(fit(line ? MAP.lines[line].bounds : MAP.bounds, size));
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, size.w, size.h]);
  const v = view || home;
  const k = v.w / size.w; // 화면 1px = 노선도 k칸
  const full = fit(MAP.bounds, size);

  // 확대·축소: (cx, cy)를 중심으로 f배 (f < 1이면 확대)
  function zoomAt(f, cx = v.x + v.w / 2, cy = v.y + v.h / 2, from = v) {
    const w = Math.max(6, Math.min(full.w * 1.4, from.w * f));
    const s = w / from.w;
    setView({ x: cx - (cx - from.x) * s, y: cy - (cy - from.y) * s, w, h: from.h * s });
  }
  const toMap = (e) => {
    const r = svg.current.getBoundingClientRect();
    return [v.x + ((e.clientX - r.left) / r.width) * v.w, v.y + ((e.clientY - r.top) / r.height) * v.h];
  };

  // 마우스 휠로 확대 (화면이 같이 스크롤되지 않게 passive: false로 등록)
  useEffect(() => {
    const el = svg.current;
    const onWheel = (e) => {
      e.preventDefault();
      const [cx, cy] = toMap(e);
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // 끌어서 이동, 두 손가락으로 확대
  function down(e) {
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    moved.current = false;
    const ps = [...pointers.current.values()];
    if (ps.length === 1) gesture.current = { type: "pan", start: ps[0], view: v };
    if (ps.length === 2) {
      const r = svg.current.getBoundingClientRect();
      const mid = [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2];
      gesture.current = {
        type: "pinch", view: v, dist: Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]),
        center: [v.x + ((mid[0] - r.left) / r.width) * v.w, v.y + ((mid[1] - r.top) / r.height) * v.h],
      };
    }
  }
  function move(e) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const g = gesture.current;
    const ps = [...pointers.current.values()];
    if (g?.type === "pan" && ps.length === 1) {
      const dx = ps[0][0] - g.start[0], dy = ps[0][1] - g.start[1];
      if (Math.hypot(dx, dy) > 6) moved.current = true;
      if (moved.current) setView({ ...g.view, x: g.view.x - dx * k, y: g.view.y - dy * k });
    }
    if (g?.type === "pinch" && ps.length === 2) {
      moved.current = true;
      const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]);
      zoomAt(g.dist / d, g.center[0], g.center[1], g.view);
    }
  }
  function up(e) {
    pointers.current.delete(e.pointerId);
    gesture.current = pointers.current.size === 1 ? { type: "pan", start: [...pointers.current.values()][0], view: v } : null;
  }

  function choose(name) {
    if (moved.current) return; // 끌기가 끝나며 눌린 것은 무시
    setPicked(name);
  }

  // 역 이름: 겹치지 않는 것만 보여 줌 (고른 역 → 환승역 → 나머지 순서)
  const fsU = 12.5 * k; // 글자 크기 (칸)
  const showAll = line || v.w < full.w * 0.55;
  const want = MAP.stations.filter((s) => (line ? s.lines.includes(line) : s.lines.length > 1 || showAll));
  want.sort((a, b) => (b.name === picked) - (a.name === picked) || b.lines.length - a.lines.length);
  const boxes = [];
  const labels = [];
  for (const s of want) {
    const [dx, dy, anchor] = s.label;
    const tx = s.x + (dx / FS) * fsU, ty = s.y + (dy / FS) * fsU;
    const w = s.name.length * fsU * 1.02;
    const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
    const b = [x0, ty - fsU * 0.85, x0 + w, ty + fsU * 0.2];
    if (boxes.some((c) => !(b[2] < c[0] || b[0] > c[2] || b[3] < c[1] || b[1] > c[3]))) continue;
    boxes.push(b);
    labels.push({ s, tx, ty, anchor });
  }

  const dim = (ls) => (line && !ls.includes(line) ? 0.14 : 1);
  const lw = 6 * k;
  const pickedSt = picked && MAP.stations.find((s) => s.name === picked);
  const popX = pickedSt && Math.min(Math.max((pickedSt.x - v.x) / k, 110), size.w - 110);
  const popY = pickedSt && (pickedSt.y - v.y) / k;

  return (
    <section aria-label="노선도에서 역 고르기" className="flex flex-col gap-3 rounded-2xl border border-[#22E5FF] bg-[#0C0A24] p-3 md:p-4">
      <div className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap">
        {[null, ...LINES].map((l) => {
          const on = line === l;
          return (
            <button
              key={l || "all"}
              type="button"
              aria-pressed={on}
              onClick={() => setLine(l)}
              className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-bold sm:text-[14px] ${
                on ? "border-transparent text-white" : "border-[#2C2366] text-[#A9A6D6] hover:text-white"
              }`}
              style={on ? { background: l ? MAP.lines[l].color : "#22E5FF", color: l ? "#fff" : "#0A0B1E" } : undefined}
            >
              {l && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: on ? "#fff" : MAP.lines[l].color }} />}
              {l || "전체"}
            </button>
          );
        })}
      </div>

      <div ref={box} className="relative h-[440px] overflow-hidden rounded-xl bg-[#0A0B1E] md:h-[620px]">
        <svg
          ref={svg}
          viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`}
          className="block h-full w-full touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          onClick={(e) => e.target === svg.current && !moved.current && setPicked(null)}
        >
          <defs>
            {line &&
              MAP.lines[line].tails.map((t, i) => {
                const a = t.pts[0], b = t.pts[t.pts.length - 1];
                return (
                  <linearGradient key={i} id={`tail${i}`} gradientUnits="userSpaceOnUse" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}>
                    <stop offset="0" stopColor={MAP.lines[t.line].color} />
                    <stop offset="0.55" stopColor={MAP.lines[t.line].color} />
                    <stop offset="1" stopColor={MAP.lines[t.line].color} stopOpacity="0" />
                  </linearGradient>
                );
              })}
          </defs>

          {/* 노선: 고른 노선은 맨 위에 굵게 */}
          {[...LINES.filter((l) => l !== line), ...(line ? [line] : [])].map((l) =>
            MAP.lines[l].shapes.map((p, i) => (
              <polyline
                key={`${l}${i}`}
                points={p.join(" ")}
                fill="none"
                stroke={MAP.lines[l].color}
                strokeWidth={l === line ? lw * 1.5 : lw}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim([l])}
              />
            )),
          )}
          {/* 두 노선이 함께 지나는 구간은 나란히 두 줄로 */}
          {MAP.shared.map(({ a, b, lines }, i) => {
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
            return (
              <g key={i}>
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0A0B1E" strokeWidth={lw * 2.2} />
                {lines.map((l, j) => {
                  const off = (j - (lines.length - 1) / 2) * lw * 1.1;
                  return (
                    <line key={l} x1={a[0] + nx * off} y1={a[1] + ny * off} x2={b[0] + nx * off} y2={b[1] + ny * off}
                      stroke={MAP.lines[l].color} strokeWidth={lw} opacity={dim([l])} />
                  );
                })}
              </g>
            );
          })}
          {/* 환승 갈림 꼬리 */}
          {line &&
            MAP.lines[line].tails.map((t, i) => (
              <polyline key={i} points={t.pts.join(" ")} fill="none" stroke={`url(#tail${i})`} strokeWidth={lw * 1.2} strokeLinecap="round" strokeLinejoin="round" />
            ))}

          {/* 역: 환승역은 큰 흰 동그라미. 누르기 쉽게 투명한 원을 겹침(옆 역과 겹치지 않을 만큼만 크게) */}
          {MAP.stations.map((s) => {
            const tr = s.lines.length > 1;
            const op = dim(s.lines);
            return (
              <g
                key={s.name}
                role="button"
                tabIndex={op === 1 ? 0 : -1}
                aria-label={`${s.name}역 (${s.lines.join("·")})`}
                onClick={() => op === 1 && choose(s.name)}
                onKeyDown={(e) => e.key === "Enter" && op === 1 && setPicked(s.name)}
                className={op === 1 ? "cursor-pointer outline-none" : "pointer-events-none"}
                opacity={op}
              >
                <circle cx={s.x} cy={s.y} r={Math.min(14 * k, 0.45)} fill="transparent" />
                {tr ? (
                  <circle cx={s.x} cy={s.y} r={6.5 * k} fill="#F2F4FF" stroke="#0A0B1E" strokeWidth={2.5 * k} />
                ) : (
                  <circle cx={s.x} cy={s.y} r={3.8 * k} fill="#0A0B1E" stroke="#F2F4FF" strokeWidth={1.8 * k} />
                )}
              </g>
            );
          })}
          {pickedSt && (
            <circle cx={pickedSt.x} cy={pickedSt.y} r={15 * k} fill="#22E5FF33" stroke="#22E5FF" strokeWidth={3 * k} pointerEvents="none" />
          )}

          {/* 역 이름: 글자 뒤에 바탕색 테두리를 둘러 노선 위에서도 읽히게 */}
          {labels.map(({ s, tx, ty, anchor }) => (
            <text
              key={s.name}
              x={tx}
              y={ty}
              textAnchor={anchor}
              fontSize={fsU}
              fontWeight={s.lines.length > 1 ? 900 : 700}
              fill={s.name === picked ? "#22E5FF" : "#F2F4FF"}
              stroke="#0A0B1E"
              strokeWidth={fsU * 0.28}
              paintOrder="stroke"
              strokeLinejoin="round"
              pointerEvents="none"
            >
              {s.name}
            </text>
          ))}
        </svg>

        {/* 역을 누르면 뜨는 창 */}
        {pickedSt && (
          <div
            role="dialog"
            aria-label={`${pickedSt.name}역`}
            className="absolute z-10 flex w-[220px] flex-col gap-2 rounded-xl border border-[#22E5FF] bg-[#120E2E] p-3 shadow-[0_10px_30px_#000c]"
            style={{ left: popX, top: popY > 150 ? popY - 24 : popY + 24, transform: popY > 150 ? "translate(-50%, -100%)" : "translateX(-50%)" }}
          >
            <p className="flex items-center gap-1.5 text-[16px] font-black">
              {pickedSt.name}
              {pickedSt.lines.map((l) => (
                <span key={l} className="h-2.5 w-2.5 rounded-full" style={{ background: MAP.lines[l].color }} />
              ))}
              <span className="text-[12px] font-normal text-[#A9A6D6]">{pickedSt.lines.map((l) => l.replace("호선", "")).join("·")}호선</span>
            </p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => { onPick("from", pickedSt.name); setPicked(null); }}
                className="min-h-[40px] flex-1 rounded-full bg-[#22E5FF] text-[14px] font-black text-[#0A0B1E]">
                여기서 출발
              </button>
              <button type="button" onClick={() => { onPick("to", pickedSt.name); setPicked(null); }}
                className="min-h-[40px] flex-1 rounded-full border border-[#22E5FF] text-[14px] font-black text-[#22E5FF]">
                여기로 도착
              </button>
            </div>
          </div>
        )}

        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          {[["＋", "확대", () => zoomAt(1 / 1.4)], ["－", "축소", () => zoomAt(1.4)], ["⤢", "처음 크기", () => setView(home)]].map(([t, label, fn]) => (
            <button key={label} type="button" aria-label={label} onClick={fn}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2C2366] bg-[#120E2E] text-[18px] font-bold hover:border-[#22E5FF]">
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px] text-[#6E6A9E]">
        <span>역을 누르면 출발역·도착역으로 고를 수 있어요 · 끌어서 이동, 휠·두 손가락으로 확대</span>
        <span>{MAP.source}</span>
      </p>
    </section>
  );
}
