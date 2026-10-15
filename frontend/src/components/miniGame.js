// 쇼릴 속 체험 게임: 혼잡 열차를 피해 목적지까지 (2단계 난이도, 한 판)
// startMiniGame(canvas, { ac, onEnd({ arrived }) }) → { stop() }  · 점수 없이 20초, 혼잡 열차 3대
export function startMiniGame(cv, opts = {}) {
  const ctx = cv.getContext("2d");
  // 화면 배치: 쇼릴 무대에 맞춘 2:1 가로 화면(opts.tall이면 휴대폰 세로용 600×1000 세로 화면).
  //  위쪽 띠(하트·시간 막대·시계) 아래에 노선도, 역 동그라미 바깥 여백을 같게 맞춤
  const TALL = !!opts.tall;
  const W = TALL ? 600 : 1120, H = TALL ? 1000 : 560, COLS = TALL ? 6 : 11, ROWS = TALL ? 11 : 6, PAD = 24;
  const CR = 23, CY = PAD + 7 + CR;
  const MX = TALL ? PAD + 26 : PAD + 40, MYT = CY + CR + 44, MYB = PAD + 12;
  const GX = (W - MX * 2) / (COLS - 1), GY = (H - MYT - MYB) / (ROWS - 1);
  const px = (c) => MX + c * GX, py = (r) => MYT + r * GY;

  // 노선: 격자 위의 꺾은선. 이 표만 고치면 지도가 바뀜
  const LINES = [
    { color: "#3D7BFF", pts: [[0, 1], [10, 1]] },
    { color: "#39FFB0", pts: [[2, 0], [8, 0], [8, 5], [2, 5], [2, 0]] },
    { color: "#FF8A3D", pts: [[0, 3], [10, 3]] },
    { color: "#22E5FF", pts: [[5, 0], [5, 5]] },
    { color: "#B57BFF", pts: [[7, 0], [7, 2], [9, 2], [9, 5]] },
    { color: "#FF5FB8", pts: [[3, 1], [3, 4], [6, 4], [6, 5]] },
    { color: "#F0C766", pts: [[1, 0], [1, 5]] },
    { color: "#9BE15D", pts: [[10, 0], [10, 5]] },
  ];
  // 세로 화면: 같은 노선도를 대각선으로 뒤집어(가로 칸 ↔ 세로 칸) 세로로 길게
  if (TALL) LINES.forEach((l) => (l.pts = l.pts.map(([c, r]) => [r, c])));
  // 꺾은선을 격자 한 칸 단위 경로로 펼침
  const unroll = (pts) => {
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length; i++) {
      let [c, r] = out[out.length - 1]; const [tc, tr] = pts[i];
      while (c !== tc || r !== tr) { c += Math.sign(tc - c); r += Math.sign(tr - r); out.push([c, r]); }
    }
    return out;
  };
  LINES.forEach((l) => (l.path = unroll(l.pts)));
  const key = (c, r) => c + "," + r;
  const nodes = new Map(), adj = new Map();
  const addEdge = (a, b) => {
    [a, b].forEach((n) => { if (!nodes.has(key(...n))) { nodes.set(key(...n), { c: n[0], r: n[1], lines: new Set() }); adj.set(key(...n), new Set()); } });
    adj.get(key(...a)).add(key(...b)); adj.get(key(...b)).add(key(...a));
  };
  LINES.forEach((l, li) => { for (let i = 1; i < l.path.length; i++) addEdge(l.path[i - 1], l.path[i]); l.path.forEach((n) => nodes.get(key(...n)).lines.add(li)); });
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const step = (k, d) => { const n = nodes.get(k), t = key(n.c + DIRS[d][0], n.r + DIRS[d][1]); return adj.get(k).has(t) ? t : null; };

  // 효과음
  const ac = opts.ac || null;
  const tone = (f0, f1, dur, type = "sine", vol = 0.12, delay = 0) => {
    if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  let blip = 0;
  const sfx = {
    pellet: () => { blip ^= 1; tone(blip ? 880 : 990, null, 0.05, "square", 0.04); },
    seat: () => [660, 880, 1100].forEach((f, i) => tone(f, null, 0.12, "triangle", 0.12, i * 0.06)),
    hit: () => { tone(160, 60, 0.4, "sawtooth", 0.14); tone(2300, 2100, 0.25, "sine", 0.05); },
    goal: () => { tone(659, null, 0.25, "sine", 0.14); tone(523, null, 0.4, "sine", 0.14, 0.22); [784, 988, 1175].forEach((f, i) => tone(f, null, 0.15, "triangle", 0.1, 0.5 + i * 0.08)); },
    over: () => [523, 392, 330, 262].forEach((f, i) => tone(f, null, 0.3, "triangle", 0.13, i * 0.18)),
  };

  let st, raf, last, ended = false;
  const INTRO = 1.8, LIMIT = 20, TRAINS = 3;   // 쇼릴용: 위치 알려 주기 1.8초, 제한 시간 20초, 혼잡 열차 3대
  // 난이도: 단계가 오를 때마다 조금씩 어려워짐. 주인공은 초당 4.2역
  //  base = 1단계 열차 속도(초당 역 수), up = 단계마다 더하는 속도, max = 최고 속도
  //  start = 1단계 열차 수, every = 몇 단계마다 열차를 한 대 늘릴지, most = 최대 열차 수
  const DIFF = {
    easy:   { base: 0.6, up: 0.04, max: 1.4, start: 2, every: 3, most: 5 },
    normal: { base: 0.8, up: 0.06, max: 2.0, start: 2, every: 2, most: 6 },
    hard:   { base: 1.1, up: 0.08, max: 2.8, start: 3, every: 2, most: 7 },
  };
  const diff = "normal";
  const ARRIVE_BASE = 300, ARRIVE_STEP = 100;   // 목적지에 닿을 때마다 받는 보상: 1단계 300, 단계마다 +100
  const DIST_PT = 10;   // 최단 경로보다 한 역 더 돌 때마다 빼는 점수 (시간 점수: 1초에 15점)
  const SAFE = 4;   // 시작할 때 열차와 주인공 사이에 최소한 비워 둘 역 수
  const bfsAll = (a) => { const q = [a], d = new Map([[a, 0]]); while (q.length) { const k = q.shift(); adj.get(k).forEach((n) => { if (!d.has(n)) { d.set(n, d.get(k) + 1); q.push(n); } }); } return d; };
  const bfs = (a, b) => { const q = [a], d = new Map([[a, 0]]); while (q.length) { const k = q.shift(); if (k === b) return d.get(k); adj.get(k).forEach((n) => { if (!d.has(n)) { d.set(n, d.get(k) + 1); q.push(n); } }); } return 99; };
  const dist = (a, b) => Math.abs(nodes.get(a).c - nodes.get(b).c) + Math.abs(nodes.get(a).r - nodes.get(b).r);
  const allKeys = [...nodes.keys()];

  function setupLevel() {
    const lv = st.level;
    let start, goal;
    do { start = allKeys[Math.floor(Math.random() * allKeys.length)]; goal = allKeys[Math.floor(Math.random() * allKeys.length)]; } while (dist(start, goal) < 8);
    st.p = { at: start, to: null, t: 0, dir: null, want: null };
    st.goal = goal;
    st.seats = new Set();
    while (st.seats.size < 2) { const k = allKeys[Math.floor(Math.random() * allKeys.length)]; if (k !== start && k !== goal) st.seats.add(k); }
    st.shortest = bfs(start, goal);
    st.par = st.shortest / 4.2 * 1.6 + 1.5;   // 기준 시간(초): 가장 짧은 길을 쉬지 않고 갈 때의 1.6배
    st.moves = 0; st.elapsed = 0; st.hits = 0;
    st.intro = INTRO;                           // 시작 전 위치 알려 주기
    // 혼잡 열차: 노선마다 하나씩, 단계가 오를수록 늘고 빨라짐
    const D0 = DIFF[diff];
    const n = TRAINS;
    const order = LINES.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, n);
    const distFromStart = bfsAll(start), used = new Set();
    st.trains = order.map((li, i) => {
      const L = LINES[li].path.length - 1;
      let pos = Math.random() * L;
      // 시작역에서 노선을 따라 SAFE역 이상 떨어진 곳에만 놓음 (다른 열차와도 겹치지 않게)
      const path = LINES[li].path;
      const sp = nodes.get(start);
      const far = path.map((n, k) => [k, distFromStart.get(key(...n)) ?? 99, Math.abs(n[0] - sp.c) + Math.abs(n[1] - sp.r)]).filter(([k, d, m]) => d >= SAFE && m >= 3 && !used.has(li + ":" + k));
      if (far.length) pos = far[Math.floor(Math.random() * far.length)][0];
      else pos = path.map((n, k) => [k, distFromStart.get(key(...n)) ?? 99]).sort((a, b) => b[1] - a[1])[0][0];
      used.add(li + ":" + pos);
      const D = DIFF[diff];
      return { li, pos, dir: Math.random() < 0.5 ? 1 : -1, speed: Math.min(D.max, D.base + (lv - 1) * D.up) * (0.85 + Math.random() * 0.3) };
    });
    st.timeLeft = LIMIT; st.invuln = 1.5; st.slow = 0;
    hud();
  }

  function hud() {}

  const TL = 96, TT = 40;   // 혼잡 열차 한 칸의 길이·폭 (본 게임과 같은 디자인)
  const trainXY = (tr) => {
    const path = LINES[tr.li].path, i = Math.floor(tr.pos), f = tr.pos - i, a = path[i], b = path[Math.min(i + 1, path.length - 1)];
    return [px(a[0] + (b[0] - a[0]) * f), py(a[1] + (b[1] - a[1]) * f), b[0] - a[0], b[1] - a[1]];
  };
  const playerXY = () => {
    const a = nodes.get(st.p.at); if (!st.p.to) return [px(a.c), py(a.r)];
    const b = nodes.get(st.p.to); return [px(a.c + (b.c - a.c) * st.p.t), py(a.r + (b.r - a.r) * st.p.t)];
  };

  function update(dt) {
    const p = st.p, speed = 4.2;
    // 플레이어 이동: 역에 서 있으면 원하는 방향 → 지금 방향 순서로 갈 수 있는 길을 찾음
    if (!p.to) {
      let nxt = p.want && step(p.at, p.want);
      if (nxt) { p.dir = p.want; p.want = null; } else nxt = p.dir && step(p.at, p.dir);
      if (nxt) { p.to = nxt; p.t = 0; }
    } else {
      // 이동 중 반대 방향을 누르면 바로 되돌아감
      if (p.want && DIRS[p.want] && DIRS[p.dir] && DIRS[p.want][0] === -DIRS[p.dir][0] && DIRS[p.want][1] === -DIRS[p.dir][1]) {
        [p.at, p.to] = [p.to, p.at]; p.t = 1 - p.t; p.dir = p.want; p.want = null;
      }
      p.t += dt * speed;
      if (p.t >= 1) {
        p.at = p.to; p.to = null; p.t = 0;
        st.moves++; sfx.pellet();
        if (st.seats.delete(p.at)) { st.slow = 5; sfx.seat(); st.flash = { text: "여유 발견! 혼잡 열차 감속", t: 1.4, c: "#39FFB0" }; }
        if (p.at === st.goal) return levelClear();
      }
    }
    // 혼잡 열차 이동 (끝까지 가면 되돌아옴, 순환선은 계속 돎)
    st.trains.forEach((tr) => {
      const path = LINES[tr.li].path, L = path.length - 1, loop = key(...path[0]) === key(...path[L]);
      tr.pos += tr.dir * tr.speed * (st.slow > 0 ? 0.45 : 1) * dt;
      if (loop) tr.pos = (tr.pos + L) % L;
      else if (tr.pos > L) { tr.pos = L - (tr.pos - L); tr.dir = -1; }
      else if (tr.pos < 0) { tr.pos = -tr.pos; tr.dir = 1; }
    });
    st.slow = Math.max(0, st.slow - dt);
    st.invuln = Math.max(0, st.invuln - dt);
    // 부딪힘
    if (st.invuln <= 0) {
      const [x, y] = playerXY();
      for (const tr of st.trains) {
        const [tx, ty] = trainXY(tr);
        // 열차 방향에 맞춘 직사각형으로 부딪힘 판정(길어진 차체 앞뒤까지)
        const a = -(tr.ang || 0), lx = (x - tx) * Math.cos(a) - (y - ty) * Math.sin(a), ly = (x - tx) * Math.sin(a) + (y - ty) * Math.cos(a);
        if (Math.abs(lx) < TL / 2 + 8 && Math.abs(ly) < TT / 2 + 6) {
          st.hearts--; st.hits++; st.score = Math.max(0, st.score - 100); st.invuln = 2; st.shake = 0.35; sfx.hit();
          st.flash = { text: "만원 열차에 끼였어요!", t: 1.2, c: "#FF3B5C" };
          if (st.hearts <= 0) return finish(false);
          break;
        }
      }
    }
    st.timeLeft -= dt; st.elapsed += dt;
    if (st.timeLeft <= 0) { st.flash = { text: "시간이 다 됐어요", t: 1.6, c: "#FF3B5C" }; sfx.hit(); return finish(false); }
    if (st.flash) { st.flash.t -= dt; if (st.flash.t <= 0) st.flash = null; }
    st.shake = Math.max(0, (st.shake || 0) - dt);
    hud();
  }

  function levelClear() {
    sfx.goal();
    st.flash = { text: "목적지 도착!", t: 2, c: "#39FFB0" };
    finish(true, 1.2);
  }

  function finish(arrived, wait = 1.4) {
    if (ended) return; ended = true; st.over = true;
    if (!arrived) sfx.over();
    setTimeout(() => opts.onEnd && opts.onEnd({ arrived, score: st.score || 0 }), wait * 1000);
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // 화면에 작게 보일 때(휴대폰) 지도 위 글자·표시를 키움 (최대 1.8배)
  let TS = 1;
  function draw(time) {
    TS = Math.max(1, Math.min(1.8, 0.625 * W / (cv.clientWidth || W)));
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (st && st.shake > 0) ctx.translate((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    // 배경 격자
    ctx.strokeStyle = "rgba(44,35,102,.35)"; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // 노선
    LINES.forEach((l) => {
      ctx.strokeStyle = l.color; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.shadowColor = l.color; ctx.shadowBlur = 12; ctx.globalAlpha = 0.75;
      ctx.beginPath(); l.pts.forEach(([c, r], i) => (i ? ctx.lineTo(px(c), py(r)) : ctx.moveTo(px(c), py(r)))); ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    // 역과 먹이
    nodes.forEach((n, k) => {
      const x = px(n.c), y = py(n.r), transfer = n.lines.size > 1;
      ctx.fillStyle = "#0A0B1E"; ctx.strokeStyle = "#F2F4FF"; ctx.lineWidth = transfer ? 4 : 3;
      ctx.beginPath(); ctx.arc(x, y, transfer ? 11 : 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (st && st.seats.has(k)) {
        const s = 1 + 0.12 * Math.sin(time / 180);
        ctx.fillStyle = "#39FFB0"; ctx.shadowColor = "#39FFB0"; ctx.shadowBlur = 18;
        roundRect(x - 21 * s * TS, y - 11 * s * TS, 42 * s * TS, 22 * s * TS, 8 * TS); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = "#0A0B1E"; ctx.font = `900 ${13 * TS}px 'Noto Sans KR'`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("여유", x, y + 1);
      }
    });
    if (!st) { ctx.restore(); return; }
    // 목적지
    const g = nodes.get(st.goal), gx = px(g.c), gy = py(g.r), pr = (time / 900) % 1;
    ctx.strokeStyle = `rgba(57,255,176,${1 - pr})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy, 14 + pr * 26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#39FFB0"; ctx.beginPath(); ctx.arc(gx, gy, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#F2F4FF"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy - 4); ctx.lineTo(gx, gy - 38); ctx.stroke();
    ctx.fillStyle = "#39FFB0"; ctx.beginPath(); ctx.moveTo(gx, gy - 38); ctx.lineTo(gx + 26, gy - 31); ctx.lineTo(gx, gy - 24); ctx.fill();
    ctx.fillStyle = "#F2F4FF"; ctx.font = `900 ${15 * TS}px 'Noto Sans KR'`; ctx.textAlign = gx > W - 160 ? "right" : "left"; ctx.textBaseline = "middle"; ctx.fillText("목적지", gx > W - 160 ? gx - 8 : gx + 30, gy - 31);   // 오른쪽 끝이면 깃발 왼쪽에
    // 혼잡 열차: 진행 방향으로 머리(전조등·앞유리)가 향하는 전동차 한 칸 + '혼잡' 표시
    st.trains.forEach((tr) => {
      const [x, y, dx, dy] = trainXY(tr);
      if (dx || dy) tr.ang = Math.atan2(dy * tr.dir, dx * tr.dir);
      const L = TL, T = TT, calm = st.slow > 0, line = LINES[tr.li].color;
      const body = calm ? "#4C6A9C" : "#C2410C", edge = calm ? "#9CC4FF" : "#FFB08A";
      ctx.save(); ctx.translate(x, y); ctx.rotate(tr.ang || 0);
      // 앞쪽 불빛(가는 방향)
      const beam = ctx.createLinearGradient(L / 2, 0, L / 2 + 40, 0); beam.addColorStop(0, "rgba(255,226,140,.35)"); beam.addColorStop(1, "rgba(255,226,140,0)");
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(L / 2, -T / 2 + 8); ctx.lineTo(L / 2 + 40, -T / 2 - 2); ctx.lineTo(L / 2 + 40, T / 2 + 2); ctx.lineTo(L / 2, T / 2 - 8); ctx.fill();
      // 차체: 뒤는 각지고 앞은 둥근 머리, 단색으로 단순하게
      ctx.shadowColor = calm ? "#22E5FF" : "#FF3B5C"; ctx.shadowBlur = 22; ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(-L / 2 + 5, -T / 2); ctx.lineTo(L / 2 - 16, -T / 2); ctx.quadraticCurveTo(L / 2, -T / 2, L / 2, -T / 2 + 14); ctx.lineTo(L / 2, T / 2 - 14); ctx.quadraticCurveTo(L / 2, T / 2, L / 2 - 16, T / 2);
      ctx.lineTo(-L / 2 + 5, T / 2); ctx.quadraticCurveTo(-L / 2, T / 2, -L / 2, T / 2 - 5); ctx.lineTo(-L / 2, -T / 2 + 5); ctx.quadraticCurveTo(-L / 2, -T / 2, -L / 2 + 5, -T / 2); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
      // 노선 색 띠 한 줄 + 뒤쪽 창문 하나
      ctx.fillStyle = line; ctx.fillRect(-L / 2 + 4, -T / 2 + 4, L - 24, 3);
      ctx.fillStyle = "rgba(10,11,30,.55)"; roundRect(-L / 2 + 6, -T / 2 + 11, 12, T - 22, 4); ctx.fill();
      ctx.restore();
      // 못된 얼굴: 열차 머리 쪽 차체 위에 바로 그림 (방향과 상관없이 똑바로 서 있음)
      const ca = Math.cos(tr.ang || 0), sa = Math.sin(tr.ang || 0), hx = x + ca * (L / 2 - 16), hy = y + sa * (L / 2 - 16), ink = "#1A0508";
      const horiz = Math.abs(ca) > 0.5;
      // 악마 뿔: 곧은 삼각뿔 + 가로 무늬 2줄 (테두리와 같은 색)
      //  가로 열차·위로 가는 열차: 차체 바깥 테두리(윗변·앞 끝)에서 솟아 테두리와 이어짐
      //  아래로 가는 열차: 눈썹 조금 위 차체 안쪽에 붙음 (밑변 선 없이)
      ctx.lineJoin = "round";
      const up = !horiz && sa < 0;
      [-1, 1].forEach((sd) => {
        let b1, b2, tip;
        if (horiz) { const ty = y - T / 2 + 1; b1 = [hx + sd * 4, ty]; b2 = [hx + sd * 13, ty]; tip = [hx + sd * 11, ty - 15]; }
        else if (up) { const ty = y - L / 2 + 1; b1 = [x + sd * 3, ty]; b2 = [x + sd * 11, ty + 0.6]; tip = [x + sd * 10, ty - 15]; }   // 앞 끝 테두리선 위에서 바로 시작
        else { const by = hy - 13.5; b1 = [hx + sd * 2.5, by]; b2 = [hx + sd * 10.5, by]; tip = [hx + sd * 9, by - 14]; }
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(...b1); ctx.lineTo(...tip); ctx.lineTo(...b2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...b1); ctx.lineTo(...tip); ctx.lineTo(...b2); ctx.stroke();
        ctx.lineWidth = 1.6;
        [0.32, 0.6].forEach((f) => { ctx.beginPath(); ctx.moveTo(b1[0] + (tip[0] - b1[0]) * f, b1[1] + (tip[1] - b1[1]) * f); ctx.lineTo(b2[0] + (tip[0] - b2[0]) * f, b2[1] + (tip[1] - b2[1]) * f); ctx.stroke(); });
      });
      ctx.save(); ctx.translate(hx, hy);
      if (calm) {
        // 느려지면 졸린 눈
        ctx.strokeStyle = "#FFF6E0"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
        [-1, 1].forEach((sd) => { ctx.beginPath(); ctx.arc(sd * 5.5, -2, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); });
        ctx.beginPath(); ctx.moveTo(-3, 6.5); ctx.lineTo(3, 6.5); ctx.stroke(); ctx.lineCap = "butt";
      } else {
        // 노려보는 눈: 눈동자는 가는 쪽을 봄
        [-1, 1].forEach((sd) => {
          ctx.fillStyle = "#FFF6E0"; ctx.beginPath(); ctx.ellipse(sd * 5.6, -1.5, 4.4, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sd * 5.6 + ca * 1.8, -1.2 + sa * 1.6, 2.2, 0, Math.PI * 2); ctx.fill();
        });
        // 화난 눈썹 \ /
        ctx.strokeStyle = ink; ctx.lineWidth = 2.8; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-10, -8.5); ctx.lineTo(-2, -4.5); ctx.moveTo(10, -8.5); ctx.lineTo(2, -4.5); ctx.stroke();
        // 심술 입 + 송곳니
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, 8); ctx.quadraticCurveTo(0, 4.5, 5, 8); ctx.stroke(); ctx.lineCap = "butt";
        ctx.fillStyle = "#FFF6E0"; ctx.beginPath(); ctx.moveTo(1.6, 6.1); ctx.lineTo(3.8, 6.9); ctx.lineTo(2.9, 9.4); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // '혼잡' 표시 (차가 어느 방향이든 글자는 똑바로)
      ctx.font = `900 ${15 * TS}px 'Noto Sans KR'`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const lab = calm ? "감속" : "혼잡", lw = 36 * TS, lh = 22 * TS;
      ctx.fillStyle = calm ? "#22E5FF" : "#FF3B5C"; const lx0 = x - Math.cos(tr.ang || 0) * 12, ly0 = y - Math.sin(tr.ang || 0) * 12;
      roundRect(lx0 - lw / 2, ly0 - lh / 2, lw, lh, lh / 2); ctx.fill();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = calm ? "#0A0B1E" : "#FFFFFF"; ctx.fillText(lab, lx0, ly0 + 1);
    });
    // 플레이어: 핑크 캡모자 승객
    const [x, y] = playerXY();
    const blink = st.invuln > 0 && Math.floor(time / 90) % 2;
    if (!blink) {
      ctx.save(); ctx.translate(x, y);
      ctx.shadowColor = "#FF2E97"; ctx.shadowBlur = 16;
      ctx.fillStyle = "#F7D2B8"; ctx.beginPath(); ctx.arc(0, 2, 14, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#FF2E97"; ctx.beginPath(); ctx.arc(0, -2, 14.5, Math.PI, 0); ctx.fill();
      const face = st.p.dir === "left" ? -1 : 1;
      ctx.fillStyle = "#FF2E97"; roundRect(face > 0 ? 1 : -19, -6, 18, 4, 2); ctx.fill();
      ctx.fillStyle = "#241A44"; ctx.beginPath(); ctx.arc(-5, 5, 1.8, 0, Math.PI * 2); ctx.arc(5, 5, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#241A44"; ctx.lineWidth = 1.8; ctx.beginPath();
      if (st.invuln > 0 && st.hearts < 3) ctx.arc(0, 13, 4, Math.PI * 1.15, Math.PI * 1.85); else ctx.arc(0, 9, 4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke(); ctx.restore();
    }
    // 나 표시: 머리 위 작은 꼬리표
    if (!blink) {
      const bob = Math.sin(time / 220) * 3;
      const tw = 32 * TS, th = 20 * TS, ty = y - 26 - th + bob;
      ctx.fillStyle = "#FF2E97"; roundRect(x - tw / 2, ty, tw, th, th / 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 5, ty + th - 1); ctx.lineTo(x + 5, ty + th - 1); ctx.lineTo(x, ty + th + 5); ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.font = `900 ${12 * TS}px 'Noto Sans KR'`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("나", x, ty + th / 2 + 1);
    }
    // 시작 전: 화면을 어둡게 하고 나와 집만 밝힘
    if (st.intro > 0) {
      const k = Math.min(1, (INTRO - st.intro) / 0.4), fade = Math.min(1, st.intro / 0.35);
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = "rgba(4,4,16,.78)"; ctx.beginPath(); ctx.rect(0, 0, W, H);
      const hole = 46 + 10 * Math.sin(time / 160);
      ctx.moveTo(x + hole, y); ctx.arc(x, y, hole, 0, Math.PI * 2, true);
      ctx.moveTo(gx + hole, gy - 12); ctx.arc(gx, gy - 12, hole, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      // 빛기둥
      const beam = (bx, color) => { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, color + "00"); gr.addColorStop(1, color + "66"); ctx.fillStyle = gr; ctx.fillRect(bx - 18, 0, 36, H); };
      ctx.globalCompositeOperation = "lighter";
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, y); ctx.clip(); beam(x, "#FF2E97"); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, gy - 12); ctx.clip(); beam(gx, "#39FFB0"); ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      // 퍼지는 고리
      [[x, y, "255,46,151"], [gx, gy - 12, "57,255,176"]].forEach(([cx, cy, rgb]) => {
        for (let i = 0; i < 2; i++) { const r = ((time / 700 + i / 2) % 1); ctx.strokeStyle = `rgba(${rgb},${1 - r})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 20 + r * 60 * k, 0, Math.PI * 2); ctx.stroke(); }
      });
      // 나 → 집 점선 화살표
      ctx.setLineDash([10, 10]); ctx.lineDashOffset = -time / 30; ctx.strokeStyle = "rgba(242,244,255,.7)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(gx, gy - 12); ctx.stroke(); ctx.setLineDash([]);
      // 이름표
      const label = (lx, ly, text, bg, fg) => { ctx.font = "900 18px 'Noto Sans KR'"; const tw = ctx.measureText(text).width; const bx = Math.min(W - tw / 2 - 26, Math.max(tw / 2 + 26, lx)); const by = ly < 140 ? ly + 70 : ly - 82; ctx.fillStyle = bg; roundRect(bx - tw / 2 - 16, by - 18, tw + 32, 36, 18); ctx.fill(); ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, bx, by + 1); };
      label(x, y, "나 · 출발", "#FF2E97", "#FFFFFF");
      label(gx, gy, `목적지 · 최단 ${st.shortest}역`, "#39FFB0", "#0A0B1E");
      // 카운트다운
      const n = Math.ceil(st.intro - 0.6);
      ctx.font = "900 64px 'Noto Sans KR'"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#F2F4FF";
      ctx.shadowColor = "#22E5FF"; ctx.shadowBlur = 24; ctx.fillText(n > 0 ? String(n) : "출발!", W / 2, H / 2); ctx.shadowBlur = 0;
      ctx.restore();
    }
    // 도착 점수표
    if (st.result) {
      const r = st.result, bw = 520, bh = 70 + r.rows.length * 34 + 50, bx = (W - bw) / 2, by = (H - bh) / 2;
      ctx.fillStyle = "rgba(10,11,30,.94)"; roundRect(bx, by, bw, bh, 20); ctx.fill();
      ctx.strokeStyle = "#39FFB0"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#39FFB0"; ctx.font = "900 26px 'Noto Sans KR'"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(`혼잡 열차를 피해 목적지 도착!`, W / 2, by + 36);
      ctx.font = "700 17px 'Noto Sans KR'";
      r.rows.forEach(([lab, v], i) => {
        const yy = by + 80 + i * 34;
        ctx.textAlign = "left"; ctx.fillStyle = "#A9A6D6"; ctx.fillText(lab, bx + 32, yy);
        ctx.textAlign = "right"; ctx.fillStyle = v >= 0 ? "#39FFB0" : "#FF3B5C"; ctx.fillText((v >= 0 ? "+" : "") + v, bx + bw - 32, yy);
      });
      const ty = by + 80 + r.rows.length * 34 + 10;
      ctx.strokeStyle = "#2C2366"; ctx.beginPath(); ctx.moveTo(bx + 32, ty - 14); ctx.lineTo(bx + bw - 32, ty - 14); ctx.stroke();
      ctx.font = "900 22px 'Noto Sans KR'"; ctx.textAlign = "left"; ctx.fillStyle = "#F2F4FF"; ctx.fillText("합계", bx + 32, ty + 6);
      ctx.textAlign = "right"; ctx.fillStyle = r.total >= 0 ? "#22E5FF" : "#FF3B5C"; ctx.fillText((r.total >= 0 ? "+" : "") + r.total, bx + bw - 32, ty + 6);
    }
    // 일시 정지 화면
    if (st.hold) {
      ctx.fillStyle = "rgba(6,6,20,.72)"; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#F2F4FF"; ctx.font = "900 44px 'Noto Sans KR'"; ctx.fillText("일시 정지", W / 2, H / 2 - 18);
      ctx.fillStyle = "#A9A6D6"; ctx.font = "700 18px 'Noto Sans KR'"; ctx.fillText("화면을 누르거나 ▶ 계속하기 · P 키로 이어서 해요", W / 2, H / 2 + 28);
    }
    // 남은 시간 막대
    // 위쪽 띠: 왼쪽 목숨(하트) · 가운데 시간 막대 · 오른쪽 동그란 시계(남은 초)
    ctx.font = "26px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (let i = 0; i < 3; i++) ctx.fillText(i < st.hearts ? "💚" : "🤍", MX - 6 + i * 32, CY + 1);
    const CX = W - MX + 8 - CR, BX = MX + 108, BW = CX - CR - 18 - BX;
    ctx.fillStyle = "#07081A"; roundRect(BX, CY - 4, BW, 8, 4); ctx.fill();
    const left = Math.max(0, st.timeLeft) / LIMIT, warnC = left < 0.3 ? "#FF3B5C" : "#22E5FF";
    ctx.fillStyle = warnC; roundRect(BX, CY - 4, BW * left, 8, 4); ctx.fill();
    const beat = left < 0.3 ? 1 + 0.08 * Math.max(0, Math.sin(performance.now() / 90)) : 1;
    ctx.save(); ctx.translate(CX, CY); ctx.scale(beat, beat);
    ctx.fillStyle = warnC; roundRect(-4, -CR - 7, 8, 5, 2); ctx.fill(); roundRect(-1.5, -CR - 3, 3, 4, 1); ctx.fill();
    ctx.fillStyle = "#0A0B1E"; ctx.beginPath(); ctx.arc(0, 0, CR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2C2366"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, CR - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = warnC; ctx.shadowColor = warnC; ctx.shadowBlur = 10; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, CR - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke(); ctx.shadowBlur = 0; ctx.lineCap = "butt";
    ctx.fillStyle = left < 0.3 ? "#FF3B5C" : "#F2F4FF"; ctx.font = "900 21px 'Noto Sans KR'"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(Math.ceil(Math.max(0, st.timeLeft))), 0, 1);
    ctx.restore();
    // 알림 문구
    if (st.flash) {
      ctx.globalAlpha = Math.min(1, st.flash.t * 2);
      ctx.font = `900 ${26 * Math.min(TS, 1.5)}px 'Noto Sans KR'`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(10,11,30,.8)"; const tw = ctx.measureText(st.flash.text).width;
      roundRect(W / 2 - tw / 2 - 20, H - 52, tw + 40, 40, 20); ctx.fill();
      ctx.fillStyle = st.flash.c; ctx.fillText(st.flash.text, W / 2, H - 32); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st.hold) { draw(now); raf = requestAnimationFrame(loop); return; }
    if (!st.over) {
      if (st.intro > 0) st.intro -= dt;
      else update(dt);
    } else if (st.flash) { st.flash.t -= dt; if (st.flash.t <= 0) st.flash = null; }
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  // 조작: 방향키·WASD, 화면 터치(게임 화면 가운데 기준 방향), 화면 밀기
  const KEY = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
  const onKey = (e) => { const d = KEY[e.key]; if (d && !st.over) { st.p.want = d; e.preventDefault(); } };
  let sx = 0, sy = 0;
  const onDown = (e) => { sx = e.clientX; sy = e.clientY; };
  const onUp = (e) => {
    if (st.over) return;
    let dx = e.clientX - sx, dy = e.clientY - sy;
    const tap = Math.hypot(dx, dy) < 18;
    if (tap) {
      // 짧게 누름: 게임 화면 가운데를 기준으로 누른 쪽 가장자리 방향 (본 게임과 같은 방식)
      const r = cv.getBoundingClientRect();
      dx = (e.clientX - r.left) / r.width - 0.5; dy = (e.clientY - r.top) / r.height - 0.5;
      if (Math.hypot(dx, dy) < 0.02) return;
    }
    // 게임 화면이 -90° 돌아가 있으면(휴대폰 가로로 들었을 때) 화면 방향을 게임 방향으로 바꿈
    if (opts.rotated) [dx, dy] = [-dy, dx];
    const h = dx > 0 ? "right" : "left", v = dy > 0 ? "down" : "up", ax = Math.abs(dx), ay = Math.abs(dy);
    let d = ax > ay ? h : v;
    if (tap && Math.min(ax, ay) / Math.max(ax, ay) > 0.47) {   // 대각선 근처: 지금 역에서 갈 수 있는 쪽 우선
      const other = d === h ? v : h, at = st.p.to || st.p.at;
      if (!step(at, d) && step(at, other)) d = other;
    }
    st.p.want = d;
  };
  addEventListener("keydown", onKey);
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointerup", onUp);

  st = { level: 2, score: 0, hearts: 3, over: false, hold: false };
  setupLevel();
  last = performance.now(); raf = requestAnimationFrame(loop);
  return {
    pause(on) { st.hold = on; },
    stop() { cancelAnimationFrame(raf); removeEventListener("keydown", onKey); cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointerup", onUp); },
  };
}
