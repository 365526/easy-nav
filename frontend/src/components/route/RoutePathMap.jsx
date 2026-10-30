import { useLayoutEffect, useState } from "react";
import MAP from "../../data/metroMap.json";

// 노선도 위에 경로 겹쳐 보기: 빠른 길은 핑크, 편한 길은 그린으로 그리고, 지금 고른 길을 위에 굵게 그립니다.
//  - 노선마다(legs) 노선도의 선(shapes)을 따라 출발역에서 도착역까지 잘라 그립니다.
//  - 노선도에 없는 노선(신분당선, 9호선 등)은 두 역을 점선으로 잇습니다.
//  - 화면은 그린 길에 맞춰 확대해 보여 주고, 끌거나 확대하지 않습니다. 선 굵기와 글자는 화면 px 기준으로 맞춥니다.

const FAST = "#FF2E97";
const CALM = "#39FFB0";
const OTHER = "#22E5FF";
// 최단경로 API의 역 이름 → 노선도의 역 이름 (같은 역을 다르게 부르는 곳)
const ALIAS = { 이수: "총신대입구" };
const plain = (name) => name.replace(/\(.*\)/, "");

function findStation(name) {
  const want = ALIAS[name] || name;
  return MAP.stations.find((s) => s.name === want) || MAP.stations.find((s) => plain(s.name) === plain(want));
}

// 꺾은선(shape) 위에서 점 p가 처음부터 얼마나 떨어져 있는지(길이)와, 선에서 벗어난 거리
function locate(shape, p) {
  let best = { gap: Infinity, at: 0 };
  let acc = 0;
  for (let i = 0; i < shape.length - 1; i++) {
    const [ax, ay] = shape[i], [bx, by] = shape[i + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (len * len))) : 0;
    const gap = Math.hypot(ax + t * dx - p[0], ay + t * dy - p[1]);
    if (gap < best.gap) best = { gap, at: acc + t * len };
    acc += len;
  }
  return { ...best, total: acc };
}

// 꺾은선의 a 지점부터 b 지점까지 잘라 낸 점 목록 (a > b이면 거꾸로)
function cut(shape, a, b) {
  const pts = [];
  let acc = 0;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const at = (i, t) => [shape[i][0] + (shape[i + 1][0] - shape[i][0]) * t, shape[i][1] + (shape[i + 1][1] - shape[i][1]) * t];
  for (let i = 0; i < shape.length - 1; i++) {
    const len = Math.hypot(shape[i + 1][0] - shape[i][0], shape[i + 1][1] - shape[i][1]);
    const s = acc, e = acc + len;
    if (e >= lo && s <= hi && len > 0) {
      if (!pts.length) pts.push(at(i, (Math.max(lo, s) - s) / len));
      pts.push(at(i, (Math.min(hi, e) - s) / len));
    }
    acc = e;
  }
  return a > b ? pts.reverse() : pts;
}

// 노선 하나(leg)를 노선도 위의 점 목록으로. via: 그 노선에서 지나는 역(순환선에서 어느 쪽으로 도는지 고를 때 씀)
function legPath(leg, via) {
  const from = findStation(leg.from), to = findStation(leg.to);
  if (!from || !to) return null;
  const line = MAP.lines[leg.line];
  if (!line) return { pts: [[from.x, from.y], [to.x, to.y]], dashed: true };
  for (const shape of line.shapes) {
    const a = locate(shape, [from.x, from.y]), b = locate(shape, [to.x, to.y]);
    if (a.gap > 0.05 || b.gap > 0.05) continue;
    const closed = shape[0][0] === shape[shape.length - 1][0] && shape[0][1] === shape[shape.length - 1][1];
    if (!closed) return { pts: cut(shape, a.at, b.at), dashed: false };
    // 순환선(2호선 등): 두 갈래 중 지나는 역이 들어 있는 쪽, 모르면 짧은 쪽
    const direct = cut(shape, a.at, b.at);
    const around = a.at < b.at ? [...cut(shape, a.at, 0), ...cut(shape, a.total, b.at)] : [...cut(shape, a.at, a.total), ...cut(shape, 0, b.at)];
    const mid = via.map(findStation).find((s) => s && s !== from && s !== to);
    if (mid) {
      const m = locate(shape, [mid.x, mid.y]).at;
      const inDirect = (m - a.at) * (m - b.at) <= 0;
      return { pts: inDirect ? direct : around, dashed: false };
    }
    const length = (pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    return { pts: length(direct) <= length(around) ? direct : around, dashed: false };
  }
  // 지선처럼 한 선 위에 두 역이 없으면 지나는 역을 차례로 이음
  const stops = [from, ...via.map(findStation).filter(Boolean), to];
  return { pts: stops.map((s) => [s.x, s.y]), dashed: false };
}

function routePaths(c) {
  return c.legs
    .map((leg) => legPath(leg, c.segments.filter((s) => s.line === leg.line).map((s) => s.station)))
    .filter(Boolean);
}

const colorOf = (c) => (c.tags.includes("빠른 길") ? FAST : c.tags.includes("편한 길") ? CALM : OTHER);

export default function RoutePathMap({ candidates, selected }) {
  // 노선도 칸(frame)이 화면에 생길 때마다 크기를 잽니다. 처음에 그릴 길이 없어 칸이 없었다가
  // 다른 길을 눌러 칸이 생겨도 크기를 다시 재도록, ref 대신 상태(setFrame)로 받습니다(9-1 점검: 서울역 → 여의도).
  const [frame, setFrame] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  useLayoutEffect(() => {
    if (!frame) return;
    const measure = () => setSize({ w: frame.clientWidth, h: frame.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [frame]);

  // 빠른 길·편한 길과 지금 고른 길만 그리고, 고른 길을 맨 위에
  const shown = candidates.filter((c) => c.key === selected.key || c.tags.length > 0);
  const order = [...shown.filter((c) => c.key !== selected.key), selected];
  const drawn = order.map((c) => ({ c, paths: routePaths(c) }));
  const all = drawn.flatMap((d) => d.paths.flatMap((p) => p.pts));
  // 그릴 수 있는 길이 없으면 카드를 없애지 않고 이유를 알립니다(9-1 점검: 서울역 → 여의도, 노량진은 노선도에 없음).
  if (all.length < 2) {
    return (
      <section aria-label="노선도 위 경로" className="flex flex-col gap-2 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-4 md:p-5">
        <h3 className="text-[18px] font-black">노선도에서 보기</h3>
        <p className="text-[14px] leading-relaxed text-[#A9A6D6]">
          이 길은 노선도에 없는 역(노량진 등 1호선 코레일 구간, 9호선)을 지나 그리지 못했습니다. 노선도에는 1~8호선의 서울 도심 구간이 들어 있습니다.
        </p>
      </section>
    );
  }

  // 그린 길 전체가 화면에 들어오도록 보기 범위를 정합니다. 둘레는 60px(글자 자리)를 비웁니다.
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const bw = Math.max(Math.max(...xs) - Math.min(...xs), 1), bh = Math.max(Math.max(...ys) - Math.min(...ys), 1);
  const u = Math.max(bw / Math.max(1, size.w - 120), bh / Math.max(1, size.h - 120)); // 화면 1px = 노선도 u칸
  const w = size.w * u, h = size.h * u;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  // 고른 길의 출발·도착·갈아타는 역 이름
  const marks = [selected.legs[0].from, ...selected.legs.map((l) => l.to)]
    .map((name, i, arr) => ({ name, st: findStation(name), kind: i === 0 ? "출발" : i === arr.length - 1 ? "도착" : "환승" }))
    .filter((m) => m.st);
  const color = colorOf(selected);

  return (
    <section aria-label="노선도 위 경로" className="flex flex-col gap-3 rounded-2xl border border-[#2C2366] bg-[#120E2E] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[18px] font-black">노선도에서 보기</h3>
        <span className="flex flex-wrap gap-3 text-[13px] font-bold">
          {shown.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5" style={{ color: colorOf(c) }}>
              <span className="h-1 w-5 rounded-full" style={{ background: colorOf(c) }} />
              {c.tags[0] || "고른 길"}
            </span>
          ))}
        </span>
      </div>
      <div ref={setFrame} className="h-[320px] overflow-hidden rounded-xl bg-[#0A0B1E] md:h-[420px]">
        <svg
          viewBox={`${cx - w / 2} ${cy - h / 2} ${w} ${h}`}
          className="block h-full w-full"
          role="img"
          aria-label={`${marks.map((m) => `${m.kind} ${m.name}`).join(", ")}`}
        >
          <defs>
            <filter id="pathGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation={u * 5} />
            </filter>
          </defs>
          {/* 바탕 노선도: 흐리게 */}
          {Object.values(MAP.lines).map((l, i) =>
            l.shapes.map((p, j) => (
              <polyline key={`${i}-${j}`} points={p.join(" ")} fill="none" stroke={l.color} strokeWidth={u * 3} opacity="0.28" strokeLinejoin="round" strokeLinecap="round" />
            )),
          )}
          {/* 경로: 고른 길은 굵고 빛나게, 다른 길은 가늘게 */}
          {drawn.map(({ c, paths }) => {
            const on = c.key === selected.key;
            return paths.map((p, i) => (
              <g key={`${c.key}-${i}`} opacity={on ? 1 : 0.55}>
                {on && !p.dashed && (
                  <polyline points={p.pts.join(" ")} fill="none" stroke={colorOf(c)} strokeWidth={u * 12} filter="url(#pathGlow)" opacity="0.7" />
                )}
                <polyline
                  points={p.pts.join(" ")}
                  fill="none"
                  stroke={p.dashed ? "#A9A6D6" : colorOf(c)}
                  strokeWidth={u * (on ? 6 : 4)}
                  strokeDasharray={p.dashed ? `${u * 7} ${u * 6}` : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            ));
          })}
          {/* 출발·환승·도착 역 */}
          {marks.map((m) => (
            <g key={`${m.kind}-${m.name}`}>
              <circle cx={m.st.x} cy={m.st.y} r={u * (m.kind === "환승" ? 6 : 8)} fill={m.kind === "환승" ? "#F2F4FF" : color} stroke="#0A0B1E" strokeWidth={u * 2.5} />
              <text
                x={m.st.x}
                y={m.st.y - u * 14}
                textAnchor="middle"
                fontSize={u * 15}
                fontWeight="900"
                fill="#F2F4FF"
                stroke="#0A0B1E"
                strokeWidth={u * 4}
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {m.kind === "환승" ? m.name : `${m.kind} ${m.name}`}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-[12px] leading-relaxed text-[#6E6A9E]">
        카드를 누르면 그 길이 위에 굵게 그려집니다.
        {drawn.some((d) => d.paths.some((p) => p.dashed)) && " 점선은 노선도에 없는 노선(신분당선, 9호선 등) 구간입니다."}
        {drawn.some((d) => d.paths.length < d.c.legs.length) && " 노선도에 없는 역(노량진 등)을 지나는 구간은 그리지 못했습니다."}
      </p>
    </section>
  );
}
