// AI 안내 도우미 캐릭터: 정육면체 블록(복셀)을 쌓아 지하철 로봇을 그립니다.
//  x: 왼쪽 → 오른쪽(몸통 0~10), y: 앞 → 뒤(0~13), z: 아래 → 위
//  face: "work"(찾는 중) · "done"(안내 완료) · "error"(못 찾음)

const C = {
  silver: "#C7CBE0", roof: "#8E94B8", navy: "#2B3A7E", screen: "#05070F", window: "#1C2B5C",
  door: "#A6ABC6", light: "#FFF4C2", bogie: "#1D1F33",
  pink: "#FF2E97", purple: "#9B5CFF", green: "#39FFB0",
};

// 얼굴 화면(가로 9칸 x1~9, 세로 5줄 z4~8)에 켜는 칸. 가운데 칸(x=5) 기준 좌우 대칭입니다.
const FACES = {
  work: { color: C.purple, dots: [[3, 6], [5, 6], [7, 6]], blink: true }, // 점 3개가 하나씩 켜짐
  done: { color: C.green, dots: [[2, 6], [2, 7], [8, 6], [8, 7], [4, 5], [5, 5], [6, 5]] }, // '-'
  error: { color: C.pink, dots: [[2, 7], [4, 7], [3, 6], [2, 5], [4, 5], [6, 7], [8, 7], [7, 6], [6, 5], [8, 5]] }, // x x
};

// 캐릭터는 좌우를 뒤집어 그려서(오른쪽을 바라봄) 말풍선 쪽을 봅니다.
//  뒤집어도 화면에서 안테나는 왼쪽 핑크·오른쪽 그린, 점은 왼쪽부터 켜지도록 미리 반대로 둡니다.
function buildBlocks(face) {
  const blocks = new Map();
  const set = (x, y, z, color, extra = {}) => blocks.set(`${x},${y},${z}`, { x, y, z, color, ...extra });
  const del = (x, y, z) => blocks.delete(`${x},${y},${z}`);
  const L = 13, W = 10, T = 9; // 길이, 가로 끝, 몸통 윗면

  // 바퀴와 몸통
  for (const [a, b] of [[1, 3], [L - 3, L - 1]])
    for (let y = a; y <= b; y++) for (let x = 1; x <= W - 1; x++) set(x, y, 0, y === a + 1 && x === W - 1 ? C.purple : C.bogie);
  for (let x = 0; x <= W; x++) for (let y = 0; y <= L; y++) for (let z = 1; z <= T; z++) set(x, y, z, C.silver);
  for (let x = 0; x <= W; x++) for (let y = 0; y <= L; y++) { set(x, y, 1, "#9EA3C2"); set(x, y, 2, C.navy); set(x, y, 3, C.navy); }
  // 발광 띠, 창문, 문
  for (let y = 0; y <= L; y++) { set(W, y, 1, C.pink, { glow: true }); set(W, y, 4, C.purple, { glow: true }); }
  for (let x = 0; x <= W; x++) set(x, 0, 1, C.pink, { glow: true });
  for (const y of [2, 3, 5, 6, 10, 11]) for (const z of [5, 6, 7]) set(W, y, z, C.window);
  for (let y = 7; y <= 8; y++) for (let z = 2; z <= 8; z++) set(W, y, z, z >= 5 && z <= 7 ? C.window : C.door);
  // 앞면 화면과 전조등
  for (let x = 1; x <= W - 1; x++) for (let z = 4; z <= 8; z++) set(x, 0, z, C.screen);
  set(1, 0, 2, C.light, { glow: true }); set(W - 1, 0, 2, C.light, { glow: true });
  // 모서리를 한 칸씩 깎아 부드럽게
  for (let y = 0; y <= L; y++) { del(0, y, T); del(W, y, T); }
  for (let x = 0; x <= W; x++) { del(x, 0, T); del(x, L, T); }
  for (let z = 1; z <= T; z++) { del(0, 0, z); del(W, 0, z); del(0, L, z); del(W, L, z); }
  // 지붕과 안테나 받침
  for (let x = 1; x <= W - 1; x++) for (let y = 1; y <= L - 1; y++) set(x, y, T + 1, C.roof);
  for (const [x, y] of [[1, 1], [W - 1, 1], [1, L - 1], [W - 1, L - 1]]) del(x, y, T + 1);
  for (let x = 4; x <= 6; x++) for (let y = 4; y <= 7; y++) set(x, y, T + 2, "#2A2D4A");
  // V자 안테나 (뒤집어 그리므로 색을 반대로 둠 → 화면에서 왼쪽 핑크, 오른쪽 그린)
  const arms = [[5, 12, C.purple], [4, 13, C.green], [3, 14, C.green], [2, 15, C.green], [6, 13, C.pink], [7, 14, C.pink], [8, 15, C.pink]];
  for (const [x, z, color] of arms) for (const y of [5, 6]) set(x, y, z, color, { glow: true });
  // 얼굴
  const f = FACES[face] ?? FACES.done;
  f.dots.forEach(([x, z], i) => {
    const order = f.blink ? f.dots.length - 1 - i : undefined; // 뒤집어도 왼쪽 점부터 켜지게
    set(x, 0, z, f.color, { glow: true, order });
  });
  return [...blocks.values()];
}

// 색을 밝게(+) 또는 어둡게(−) 바꿉니다. 윗면은 밝게, 옆면은 어둡게 칠해 입체감을 냅니다.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// 블록을 비스듬히 본 면(윗면·앞면·오른쪽 옆면)으로 바꿉니다. 다른 블록에 가려지는 면은 그리지 않습니다.
export function robotShapes(face) {
  const blocks = buildBlocks(face);
  const has = new Set(blocks.map((b) => `${b.x},${b.y},${b.z}`));
  const H = (x, y, z) => has.has(`${x},${y},${z}`);
  const P = (x, y, z) => [x * 10 + y * 6.2, -z * 10 - y * 3.6];
  const shapes = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const add = (pts, fill, b) => {
    for (const [px, py] of pts) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    shapes.push({ points: pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "), fill, glow: b.glow, order: b.order });
  };
  for (const b of blocks.sort((p, q) => q.y - p.y || p.x - q.x || p.z - q.z)) {
    const { x, y, z, color } = b;
    if (!H(x, y, z + 1)) add([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)], shade(color, 0.25), b);
    if (!H(x + 1, y, z)) add([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)], shade(color, -0.32), b);
    if (!H(x, y - 1, z)) add([P(x, y, z), P(x + 1, y, z), P(x + 1, y, z + 1), P(x, y, z + 1)], color, b);
  }
  const pad = 8;
  return { shapes, viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}` };
}
