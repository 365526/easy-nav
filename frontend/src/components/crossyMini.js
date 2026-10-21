// 쇼릴 속 체험판: CROSSY METRO를 짧게 (5줄 건너기 · 15초)
// startMiniGame(canvas, { ac, tall, rotated, onEnd({ arrived }) }) → { stop(), pause(on) }
//  본 게임(public/game/index.html)과 같은 그림·소리. 연속 선로·2칸 뛰기·콤보·끊기는 선로·AI 안내는 뺌
//  화면: 쇼릴 무대에 맞춘 2:1 가로(1120×560) 또는 휴대폰 세로(600×1000). canvas의 width·height를 그대로 씀
export function startMiniGame(cv, opts = {}) {
const TALL=!!opts.tall, GOAL=5, LIMIT=15;
const CAR_L=3, GAP=0.24, PERIOD=CAR_L+GAP;
const STATIONS=["시청","을지로입구","을지로3가","을지로4가","동대문역사문화공원","신당","상왕십리","왕십리","한양대","뚝섬","성수","건대입구","구의","강변","잠실나루","잠실","잠실새내","종합운동장","삼성","선릉","역삼","강남","교대","서초","방배","사당","낙성대","서울대입구","봉천","신림","신대방","구로디지털단지","대림","신도림","문래","영등포구청","당산","합정","홍대입구","신촌","이대","아현","충정로"];
const C={pink:"#FF2E97",green:"#39FFB0",purple:"#9B5CFF",cyan:"#22E5FF",red:"#FF3B5C",l1:"#8FBCE6",l5:"#B23A12",line2:"#2DB34A",fg:"#F2F4FF",bg:"#0A0B1E"};
const FONT='"Noto Sans KR","Apple SD Gothic Neo",sans-serif';
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const touch=matchMedia("(pointer:coarse)").matches;

// 화면 모양: 컴퓨터 = 가로(16:9, 15칸), 휴대폰·좁은 창 = 세로(9칸)
let COLS=TALL?9:15;

const ctx=cv.getContext("2d");
let W=cv.width,H=cv.height,T=W/COLS;

function hash(a,b){let x=(a*374761393+b*668265263)|0;x=Math.imul(x^(x>>>13),1274126177);x^=x>>>16;return (x>>>0)/4294967296;}
const mod=(a,n)=>((a%n)+n)%n, lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// 콤보: 여유 칸에 연속 need번 타면 하트 +1 (최대 maxLives)
const COMBO={need:8, maxLives:3};
// 끊기는 선로: 한 정거장(2줄)당 처음엔 약 10초 여유, 가장 빨라져도 약 4초
const FLOOR={grace:1e9, base:.2, up:.008, max:.5, lag:8};

let G, clock=0;
// 줄 배치: 선로 → 승강장이 기본, 세 번째 구간마다 승강장 없이 선로 두 줄이 붙은 '연속 선로'
const LAY=[null]; let segN=0, stN=0;
function ensure(r){
  while(LAY.length<=r){
    if(stN>=GOAL){ LAY.push({t:"void",st:GOAL}); continue; }   // 도착 승강장 뒤로는 빈 공간
    const dbl=false;   // 체험판: 연속 선로 없음
    for(let i=0;i<(dbl?2:1);i++) LAY.push({t:"track",st:stN});
    stN++; LAY.push({t:"platform",st:stN}); segN++;
  }
}
function rowType(r){ if(r<=0) return "platform"; ensure(r); return LAY[r].t; }
function stationOf(r){ if(r<=0) return 0; ensure(r); return LAY[r].st; }
const doubleAhead=r=>rowType(r+1)==="track"&&rowType(r+2)==="track";
function getTrack(r){
  let t=G.tracks.get(r); if(t) return t;
  const lvl=stationOf(r);
  t={r,dir:hash(r,1)<.5?1:-1,speed:Math.min(4.6,1.5+lvl*.09)*(.85+hash(r,2)*.3),p:Math.min(.68,.38+lvl*.012),safe:Math.floor(hash(r,3)*4),offset:hash(r,4)*PERIOD*4};
  G.tracks.set(r,t); return t;
}
const carStart=(t,k)=>k*PERIOD+t.offset;
function crowded(t,k){ if(mod(k,4)===t.safe) return false; return hash(t.r*7+11,k)<t.p; }
const mid=()=>Math.floor(COLS/2);

function newGame(running){
  G={row:0,lastPlat:0,prev:null,px:mid(),py:0,z:0,lives:3,combo:0,pops:[],score:0,mode:"idle",anim:null,ride:null,cam:-2.4,tracks:new Map(),flash:null,shake:0,running,
     edge:-3.2,grace:FLOOR.grace,mood:"idle",moodT:0,fall:0,paused:false,buf:null,intro:running?INTRO:0,left:LIMIT,done:false,trail:[],trailT:0,inv:0,el:0,scoreT:0};
}


let ac=null, muted=false, BUS=null, PW={}, NOISE=null;
const MI=n=>440*Math.pow(2,(n-69)/12);              // 음 번호(미디) → 주파수
function audioInit(){
  if(!ac) return;
  if(BUS) return;
  const comp=ac.createDynamicsCompressor(); comp.threshold.value=-16; comp.ratio.value=4; comp.attack.value=.003; comp.release.value=.12;
  BUS={master:ac.createGain(),sfx:ac.createGain(),bgm:ac.createGain()};
  BUS.master.gain.value=.9; BUS.sfx.gain.value=1; BUS.bgm.gain.value=.5;
  BUS.sfx.connect(BUS.master); BUS.bgm.connect(BUS.master); BUS.master.connect(comp).connect(ac.destination);
  // 펄스파 12.5% · 25% · 50% (옛 게임기 소리의 핵심)
  for(const [k,d] of [["p12",.125],["p25",.25],["p50",.5]]){
    const n=40, re=new Float32Array(n), im=new Float32Array(n);
    for(let i=1;i<n;i++) re[i]=2*Math.sin(Math.PI*i*d)/(Math.PI*i);
    PW[k]=ac.createPeriodicWave(re,im);
  }
  // 거친 잡음 (몇 샘플씩 같은 값을 유지해 '지직' 느낌)
  const len=ac.sampleRate, buf=ac.createBuffer(1,len,ac.sampleRate), ch=buf.getChannelData(0);
  let v=0; for(let i=0;i<len;i++){ if(i%3===0) v=Math.random()*2-1; ch[i]=v; }
  NOISE=buf;
}
// 음 하나: wave = p12 · p25 · p50 · tri
function nt(f,dur,{wave="p25",vol=.1,at=0,f1=null,rel=.03,vib=0,bus="sfx",abs=false}={}){
  if(!ac||!BUS) return;
  const s=abs?at:ac.currentTime+at, o=ac.createOscillator(), g=ac.createGain();
  if(wave==="tri") o.type="triangle"; else o.setPeriodicWave(PW[wave]);
  o.frequency.setValueAtTime(f,s); if(f1) o.frequency.exponentialRampToValueAtTime(f1,s+dur);
  if(vib){ const l=ac.createOscillator(), lg=ac.createGain(); l.frequency.value=vib; lg.gain.value=f*.03; l.connect(lg).connect(o.frequency); l.start(s); l.stop(s+dur+rel+.02); }
  g.gain.setValueAtTime(0,s); g.gain.linearRampToValueAtTime(vol,s+.004);
  g.gain.setValueAtTime(vol,s+dur); g.gain.linearRampToValueAtTime(0,s+dur+rel);
  o.connect(g).connect(BUS[bus]); o.start(s); o.stop(s+dur+rel+.02);
}
function nz(dur,{vol=.1,at=0,rate=1,type="highpass",freq=1000,q=.7,bus="sfx",abs=false,decay=true}={}){
  if(!ac||!BUS) return;
  const s=abs?at:ac.currentTime+at, src=ac.createBufferSource(), fl=ac.createBiquadFilter(), g=ac.createGain();
  src.buffer=NOISE; src.playbackRate.value=rate; fl.type=type; fl.frequency.value=freq; fl.Q.value=q;
  g.gain.setValueAtTime(vol,s); decay?g.gain.exponentialRampToValueAtTime(.0005,s+dur):g.gain.setValueAtTime(vol,s+dur);
  src.connect(fl).connect(g).connect(BUS[bus]); src.start(s,Math.random()*.5); src.stop(s+dur+.02);
}
// 빠른 아르페지오 (음 번호 목록을 차례로)
function arp(notes,step,{wave="p25",vol=.08,at=0,hold=1}={}){ notes.forEach((n,i)=>nt(MI(n),step*hold,{wave,vol,at:at+i*step,rel:.02})); }

const sfx={
  step:()=>nt(MI(84),.035,{wave:"p12",vol:.06,f1:MI(79)}),                                // 옆으로 '틱'
  hop:()=>nt(MI(60),.09,{wave:"p25",vol:.09,f1:MI(79)}),                                  // 앞으로 '뿅'
  jump:()=>{ nt(MI(55),.2,{wave:"p25",vol:.09,f1:MI(84)}); nt(MI(67),.2,{wave:"p12",vol:.04,f1:MI(96),at:.02}); }, // 2칸 '뾰옹'
  board:()=>arp([79,84,91],.045,{wave:"p50",vol:.07}),                                     // 여유 칸 탑승 '띠리링'
  arrive:()=>{ arp([72,76,79],.06,{wave:"p25",vol:.08}); nt(MI(84),.22,{wave:"p25",vol:.09,at:.18,vib:7});
               nt(MI(48),.12,{wave:"tri",vol:.16}); nt(MI(55),.25,{wave:"tri",vol:.16,at:.18}); },  // 역 도착 팡파르
  combo:n=>nt(MI(76+n*2),.05,{wave:"p12",vol:.06}),                                        // 콤보가 쌓일수록 음이 올라감
  oneUp:()=>{ arp([72,76,79,84,88,91,96],.05,{wave:"p50",vol:.07}); arp([84,88,91,96],.05,{wave:"p12",vol:.035,at:.36}); }, // 하트 +1
  full:()=>arp([88,91,88,91],.05,{wave:"p12",vol:.06}),                                     // 콤보 달성(하트 가득)
  fail:()=>{ nt(MI(52),.16,{wave:"p50",vol:.09,f1:MI(36)}); nt(MI(51),.16,{wave:"p25",vol:.05,f1:MI(35),at:.01}); nz(.14,{vol:.12,rate:.5,type:"lowpass",freq:1800}); }, // 혼잡 칸 '부웅'
  crumble:()=>nz(.16,{vol:.05,rate:.25,type:"lowpass",freq:500}),                           // 뒤에서 무너지는 '두둑'
  fall:()=>{ nt(MI(88),.9,{wave:"p25",vol:.08,f1:MI(40),vib:9}); nz(.5,{vol:.06,rate:.3,type:"lowpass",freq:700,at:.4}); }, // 추락 '휘이이잉'
  beam:()=>{ for(let i=0;i<10;i++) nt(MI(100-i*2.5),.03,{wave:i%2?"p12":"p25",vol:.05,at:i*.035}); }, // 빛기둥이 내려오는 '주르륵'
  land:()=>{ nt(MI(91),.06,{wave:"p50",vol:.06}); nt(MI(96),.3,{wave:"p12",vol:.06,at:.06,vib:6}); },  // 바닥에 닿는 '팅'
  count:()=>nt(MI(69),.1,{wave:"p50",vol:.08}),                                              // 3 · 2 · 1
  go:()=>{ nt(MI(81),.28,{wave:"p50",vol:.09}); nt(MI(57),.28,{wave:"tri",vol:.15}); },      // 출발!
  over:()=>{ const m=[[67,.14],[63,.14],[60,.14],[55,.28],[56,.14],[55,.42]]; let t=.35;
             m.forEach(([n,d])=>{ nt(MI(n),d*.85,{wave:"p25",vol:.08,at:t}); nt(MI(n-24),d*.85,{wave:"tri",vol:.14,at:t}); t+=d; }); },
  warn:()=>{ nt(MI(93),.05,{wave:"p12",vol:.04}); nt(MI(93),.05,{wave:"p12",vol:.04,at:.1}); }    // 끊김이 가까울 때 '삐삐'
};


const ROBOT=null;
function robot(){} function hud(){}
const stationAt=i=>STATIONS[mod(i,STATIONS.length)];
// 카메라: 도착 줄이 화면 위쪽 끝을 넘어가지 않게 (그 위는 빈 공간)
const camTo=()=>Math.min(G.py-camOff(),GOAL*2+1.6-H/T);
// ───────── 체험판 전용: 도착 승강장 · 위쪽 띠 ─────────
function drawGoal(r){
  const y=yTop(r), top=y-PZ();
  ctx.save();
  const g=ctx.createLinearGradient(0,top,0,top+T); g.addColorStop(0,"rgba(57,255,176,.32)"); g.addColorStop(1,"rgba(57,255,176,.08)");
  ctx.fillStyle=g; ctx.fillRect(0,top,W,T);
  ctx.fillStyle=C.green; ctx.fillRect(0,top,W,3);
  const fs=Math.max(14,T*.34), tw=fs*2.6, th=fs*1.5;
  ctx.font=`900 ${fs}px ${FONT}`; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.shadowColor=C.green; ctx.shadowBlur=14; ctx.fillStyle=C.green; rrect(W/2-tw/2,top+T*.5-th/2,tw,th,th/2); ctx.fill();
  ctx.shadowBlur=0; ctx.fillStyle=C.bg; ctx.fillText("도착",W/2,top+T*.5+1);
  ctx.restore();
}
function drawBand(){
  // 하트 · 건넌 줄 · 남은 시간 막대 · 남은 초
  const bh=Math.max(40,T*(TALL?.95:.62)), pad=Math.max(12,T*.22), fs=Math.max(15,bh*.42);
  ctx.save();
  const g=ctx.createLinearGradient(0,0,0,bh+pad); g.addColorStop(0,"rgba(5,6,13,.92)"); g.addColorStop(1,"rgba(5,6,13,0)");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,bh+pad*1.6);
  let x=pad; const cy=pad+bh*.42;
  ctx.font=`900 ${fs}px ${FONT}`; ctx.textBaseline="middle"; ctx.textAlign="left";
  for(let i=0;i<3;i++){ const on=i<G.lives, hs=fs*.5, hx=x+hs, hy=cy;
    ctx.fillStyle=on?C.green:"#2C2366"; ctx.beginPath(); ctx.moveTo(hx,hy+hs*.9); ctx.bezierCurveTo(hx-hs*1.4,hy-hs*.1,hx-hs*.7,hy-hs*1.2,hx,hy-hs*.45); ctx.bezierCurveTo(hx+hs*.7,hy-hs*1.2,hx+hs*1.4,hy-hs*.1,hx,hy+hs*.9); ctx.fill(); x+=hs*2.4; }
  x+=pad*.6; ctx.fillStyle=C.fg; const lt=`${Math.min(G.score,GOAL)} / ${GOAL}줄`; ctx.fillText(lt,x,cy); x+=ctx.measureText(lt).width+pad;
  const sec=Math.ceil(G.left), low=G.left<=5, cw=fs*1.9, bx=x, bw=Math.max(40,W-pad-cw-bx-pad*.6), frac=G.left/LIMIT;
  ctx.fillStyle="#2C2366"; rrect(bx,cy-4,bw,8,4); ctx.fill();
  ctx.fillStyle=low?C.red:C.cyan; if(frac>0){ rrect(bx,cy-4,bw*frac,8,4); ctx.fill(); }
  ctx.textAlign="right"; ctx.fillStyle=low?C.red:C.fg; ctx.font=`900 ${fs*1.05}px ${FONT}`; ctx.fillText(String(sec),W-pad,cy+1);
  ctx.restore();
}
function setMood(m,t){G.mood=m;G.moodT=t;}

// ───────── 움직임 ─────────
function animate(tx,ty,dur,arc,done){G.anim={fx:G.px,fy:G.py,tx,ty,t:0,dur,arc,done,k:0};}
function move(d){
  if(G.mode==="ride") return rideMove(d);
  const tx=clamp(Math.round(G.px)+d,0,COLS-1); if(tx===Math.round(G.px)) return;
  G.mode="hop"; sfx.step(); animate(tx,G.py,.11,.22,()=>{G.mode="idle";});
}
function rideMove(d){
  const R=G.ride, x=carStart(R.tr,R.k)+R.rel, nx=x+d;
  const k2=Math.round((nx-R.tr.offset-CAR_L/2)/PERIOD);
  if(k2===R.k){ sfx.step(); R.hop={from:R.rel,to:clamp(R.rel+d,.3,CAR_L-.3),t:0,dur:.12,arc:.22}; return; }
  if(!crowded(R.tr,k2)){
    // 옆 칸으로 건너감: 위치는 이어지게, 새 칸 기준으로 다시 계산
    sfx.step(); G.flash={r:R.tr.r,k:k2,color:C.l1,t:.4};
    R.k=k2; R.hop={from:x-carStart(R.tr,k2),to:clamp(nx-carStart(R.tr,k2),.3,CAR_L-.3),t:0,dur:.16,arc:.3}; return;
  }
  // 옆 칸이 매우 혼잡: 밀려나서 원래 칸으로
  sfx.fail(); setMood("pain",.9); G.flash={r:R.tr.r,k:k2,color:C.red,t:.6};
  const safe=G.inv>0;
  R.hop={from:R.rel,to:clamp(R.rel+d*.45,.3,CAR_L-.3),t:0,dur:.12,arc:.25,done:()=>{ R.hop={from:R.rel,to:clamp(R.rel-d*.45,.3,CAR_L-.3),t:0,dur:.14,arc:.1}; if(!safe) loseLife(); }};
}
// 1칸 앞으로: 승강장에서 앞 칸으로, 타고 있는 칸에서 다음 줄로
function go(){
  if(G.mode==="ride"){
    const R=G.ride; G.mode="hop"; G.ride=null; sfx.hop();
    if(rowType(G.row+1)==="platform") animate(Math.round(clamp(G.px,0,COLS-1)),G.row+1,.2,.5,()=>arrive(true));
    else { G.prev=R; animate(G.px,G.row+1,.17,.45,board); }
    return;
  }
  G.mode="hop"; sfx.hop(); G.prev=null;
  if(rowType(G.row+1)==="platform"){ animate(G.px,G.row+1,.17,.45,()=>{G.row++;G.lastPlat=G.row;G.mode="idle";}); return; }
  animate(G.px,G.row+1,.17,.45,board);
}
// 화면 끝에 닿음: 뒤로 돌려보내지 않고, 같은 열차의 안쪽 칸으로 튕겨 들어감 (하트 −1)
function pushedOff(){
  const R=G.ride, x=G.px, right=x>COLS/2, target=right?COLS-2.4:1.4;
  const k2=Math.round((target+.5-R.tr.offset-CAR_L/2)/PERIOD);
  sfx.fail(); setMood("pain",1); G.flash={r:R.tr.r,k:k2,color:C.red,t:.5};
  const safe=G.inv>0;
  R.k=k2; R.hop={from:x+.5-carStart(R.tr,k2),to:clamp(target+.5-carStart(R.tr,k2),.3,CAR_L-.3),t:0,dur:.28,arc:.55};
  if(!safe) loseLife();
}
function popText(text,color){ G.pops.push({text,color,x:G.px,y:G.py,t:1}); }
const INVULN=1.5;   // 하트가 줄면 이 시간(초) 동안 깜빡이며 무적
function loseLife(){
  if(G.inv>0) return false;
  G.lives--; G.inv=INVULN; if(!reduce) G.shake=.35;
  if(G.lives<=0){ finish(false); return true; } return false;
}
function board(r=G.row+1){
  // 칸 사이 틈에 뛰어들면 가까운 칸으로 붙여 줌 (틈은 칸 구분용 그림)
  const tr=getTrack(r), cx=G.px+.5, k=Math.round((cx-tr.offset-CAR_L/2)/PERIOD), full=crowded(tr,k);
  G.flash={r,k,color:full?C.red:C.l1,t:.6};
  if(!full){
    G.row=r; G.mode="ride"; G.ride={tr,k,rel:clamp(cx-carStart(tr,k),.3,CAR_L-.3),t:0}; G.prev=null; sfx.board();
  }else{
    sfx.fail(); setMood("pain",.9);
    const safe=G.inv>0;
    G.mode="hop"; const P=G.prev; G.prev=null;
    animate(G.px,G.row,.26,.6,()=>{
      // 칸에서 뛰었다가 밀려나면 원래 타던 칸으로 돌아감
      if(P){ P.rel=clamp(G.px+.5-carStart(P.tr,P.k),.3,CAR_L-.3); P.t=0; P.hop=null; G.ride=P; G.mode="ride"; }
      else G.mode="idle";
      if(!safe) loseLife();
    });
  }
}
function arrive(manual){
  G.row+=1; G.lastPlat=G.row; G.mode="idle";
  const st=stationOf(G.row);
  if(st>G.score){ G.score=st; }
  sfx.arrive(); setMood("happy",.9);
  if(G.score>=GOAL) finish(true);
}

let crumbleT=0;
const camOff=()=>Math.min(2.4,(H/T)*.28);
function update(dt){
  clock+=dt;
  const lo=Math.floor(G.cam)-2, hi=Math.ceil(G.cam+H/T)+3;
  for(let r=lo;r<=hi;r++) if(rowType(r)==="track"){const t=getTrack(r); t.offset+=t.dir*t.speed*dt;}
  for(const r of G.tracks.keys()) if(r<lo-2) G.tracks.delete(r);
  if(G.intro>0){
    const el0=INTRO-G.intro, before=cdNum(G.intro); G.intro-=dt; const after=cdNum(G.intro), el1=INTRO-G.intro;
    if(el0<.4&&el1>=.4) sfx.land();   // 빛이 바닥에 닿는 '띵'
    if(after!==before&&before>0) { if(after>0) sfx.count(); else sfx.go(); }
    G.cam=lerp(G.cam,camTo(),1-Math.pow(.002,dt)); return;
  }

  if(G.running) G.el+=dt;   // 출발 뒤 걸린 시간(일시 정지 중에는 멈춤)
  if(G.anim){const a=G.anim; a.t+=dt; const k=Math.min(1,a.t/a.dur); G.px=lerp(a.fx,a.tx,k); G.py=lerp(a.fy,a.ty,k); G.z=Math.sin(Math.PI*k)*a.arc; a.k=k; if(k>=1){G.anim=null;G.z=0;a.done&&a.done();}}
  if(G.mode==="ride"){
    const R=G.ride; R.t+=dt;
    if(R.hop){ const h=R.hop; h.t+=dt; const k=Math.min(1,h.t/h.dur); R.rel=lerp(h.from,h.to,k); G.z=Math.sin(Math.PI*k)*h.arc; if(k>=1){ R.hop=null; G.z=0; h.done&&h.done(); } }
    const x=carStart(R.tr,R.k)+R.rel-.5;
    // 모든 선로: 내가 ▲를 누를 때까지 실려 감. 화면 양 끝에 닿으면 밀려남
    G.px=x; if(!R.hop&&(x<-.45||x>COLS-.55)) pushedOff();
  }
  if(G.running){
    if(G.grace>0) G.grace-=dt;
    else{
      const v=Math.min(FLOOR.max,FLOOR.base+G.score*FLOOR.up);
      G.edge=Math.max(G.edge+v*dt,G.py-FLOOR.lag);
      crumbleT-=dt; if(crumbleT<=0){sfx.crumble();crumbleT=.55;}
    }
    if(G.edge>G.py+.45){ G.mode="dead"; G.anim=null; G.ride=null; sfx.fall(); setMood("pain",9); finish(false); }
  }
  if(G.mode==="dead") G.fall+=dt;
  if(G.running&&!G.done){ const before=Math.ceil(G.left); G.left=Math.max(0,G.left-dt); if(Math.ceil(G.left)!==before&&G.left<=5&&G.left>0) sfx.warn(); if(G.left<=0) finish(false); }
  if(G.buf){ G.buf.t-=dt; if(G.buf.t<=0) G.buf=null; else if(ready(G.buf.a)){ const a=G.buf.a; G.buf=null; run(a); } }
  const moving=G.mode==="ride"||(G.anim&&Math.abs(G.anim.tx-G.anim.fx)>.01);
  G.trailT-=dt; if(moving&&G.mode!=="dead"&&G.trailT<=0){ G.trail.push({x:G.px,y:G.py,e:(heroBase()+G.z*T)/T,t:.22}); G.trailT=.045; }
  G.trail.forEach(t=>t.t-=dt); G.trail=G.trail.filter(t=>t.t>0);
  if(G.inv>0) G.inv=Math.max(0,G.inv-dt);
  G.pops.forEach(p=>p.t-=dt*.9); G.pops=G.pops.filter(p=>p.t>0);
  if(G.moodT>0){G.moodT-=dt; if(G.moodT<=0) G.mood="idle";}
  G.cam=lerp(G.cam,camTo(),1-Math.pow(.002,dt));
  if(G.flash){G.flash.t-=dt;if(G.flash.t<=0)G.flash=null;}
  if(G.shake>0)G.shake-=dt;
}

// ───────── 그리기: 위에서 비스듬히 내려다보는 2.5D ─────────
//  한 줄(row) = T×T 땅 칸. 승강장은 선로 바닥보다 PZ만큼 높고, 앞(아래)쪽 옆면이 보임
//  열차 칸은 지붕(윗면) + 앞 옆면으로 그리고, 빛은 왼쪽 위에서 비춤
const yTop=r=>H-(r-G.cam+1)*T;
const PZ=()=>T*.2, HC=()=>T*.5;
function rrect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function box(x,yA,yB,w,h,e,top,front){ ctx.fillStyle=front; ctx.fillRect(x,yB-e-h,w,h); ctx.fillStyle=top; ctx.fillRect(x,yA-e-h,w,yB-yA); }
function crumble(r,c){ const d=G.edge-r-hash(r*31,c)*.6; return clamp(d/.9,0,1); }

function drawPlatformTile(r,c,y){
  const x=c*T, pz=PZ(), top=y-pz;
  // 윗면: 바닥 타일
  ctx.fillStyle=r<0?"#1C1F36":((c+r)%2?"#2A2E4C":"#272B47"); ctx.fillRect(x,top,T,T);
  ctx.fillStyle="rgba(255,255,255,.045)"; ctx.fillRect(x,top,1,T); ctx.fillRect(x,top+T*.5,T,1);
  if(r>=0){
    // 양쪽 끝 노란 점자 블록 + 안전선
    [top+T*.05, top+T-T*.17].forEach(sy=>{
      ctx.fillStyle="#D9B23E"; ctx.fillRect(x,sy,T,T*.12);
      ctx.fillStyle="#B8932A"; for(let i=0;i<4;i++) ctx.fillRect(x+T*(.08+i*.25),sy+T*.04,T*.08,T*.04);
    });
  }
  // 앞 옆면(선로 쪽으로 떨어지는 벽)
  const g=ctx.createLinearGradient(0,y+T-pz,0,y+T); g.addColorStop(0,"#1B1E35"); g.addColorStop(1,"#0C0E1C");
  ctx.fillStyle=g; ctx.fillRect(x,y+T-pz,T,pz);
  ctx.fillStyle="rgba(255,255,255,.14)"; ctx.fillRect(x,y+T-pz,T,1);
}
function drawTrackTile(r,c,y){
  const x=c*T;
  // 선로 바닥(자갈) + 위쪽 그늘(먼 승강장 벽 아래)
  ctx.fillStyle="#0F111B"; ctx.fillRect(x,y,T,T);
  ctx.fillStyle="#1A1D2B"; for(let i=0;i<6;i++){ const hx=hash(r*13+c,i), hy=hash(c*7+i,r); ctx.fillRect(x+hx*T,y+T*.1+hy*T*.7,2,2); }
  const ao=ctx.createLinearGradient(0,y,0,y+T*.28); ao.addColorStop(0,"rgba(0,0,0,.55)"); ao.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=ao; ctx.fillRect(x,y,T,T*.28);
  // 침목: 작은 상자 (윗면 + 앞면)
  for(let i=0;i<2;i++){ const sx=x+T*(.1+.5*i), sw=T*.2;
    ctx.fillStyle="#2C3146"; ctx.fillRect(sx,y+T*.2,sw,T*.5);
    ctx.fillStyle="#1A1E2E"; ctx.fillRect(sx,y+T*.7,sw,T*.05); }
  // 레일 두 줄: 그림자 · 옆면 · 반짝이는 윗면
  [y+T*.3,y+T*.6].forEach(ry=>{
    ctx.fillStyle="rgba(0,0,0,.45)"; ctx.fillRect(x,ry+3,T,2);
    ctx.fillStyle="#56607A"; ctx.fillRect(x,ry,T,3);
    ctx.fillStyle="#D3DBEA"; ctx.fillRect(x,ry,T,1.4);
  });
}
function drawRow(r){
  if(rowType(r)==="void") return;
  const y=yTop(r), plat=rowType(r)==="platform";
  for(let c=0;c<COLS;c++){
    const k=crumble(r,c); if(k>=1) continue;
    ctx.save(); ctx.globalAlpha=1-k*k; ctx.translate(0,k*k*T*1.4);
    if(k>0&&k<.25&&!reduce) ctx.translate((hash(c,Math.floor(clock*30))-.5)*3,0);
    if(plat) drawPlatformTile(r,c,y); else drawTrackTile(r,c,y);
    if(k>0){ctx.fillStyle="#0A0C18";ctx.fillRect(c*T,y+T,T,T*.3);}
    ctx.restore();
  }
}
// 승강장 역 이름판: 승강장 뒤쪽 가장자리에 서 있는 2호선 표지판
function drawSign(r){
  const y=yTop(r), top=y-PZ(), fade=1-crumble(r,COLS-2); if(fade<=0) return;
  const name=stationAt(stationOf(r));
  const bh=T*.3, fs=Math.max(11,bh*.5);
  ctx.save(); ctx.globalAlpha=fade;
  ctx.font=`900 ${fs}px ${FONT}`;
  const tw=ctx.measureText(name).width, sw=Math.min(W*.42,tw+bh*1.6), sx=W-T*.25-sw, base=top+T*.2, by=base-T*.14-bh;
  ctx.fillStyle="#3A4062"; ctx.fillRect(sx+sw*.15,by+bh,3,base-by-bh); ctx.fillRect(sx+sw*.85-3,by+bh,3,base-by-bh);
  ctx.fillStyle="rgba(0,0,0,.35)"; ctx.fillRect(sx+4,base-1,sw,3);
  ctx.fillStyle="#2B3A78"; ctx.fillRect(sx,by-3,sw,3);
  ctx.fillStyle="#17225A"; ctx.fillRect(sx,by,sw,bh);
  ctx.fillStyle="rgba(255,255,255,.12)"; ctx.fillRect(sx,by,sw,1);
  const cr=bh*.32, cxx=sx+bh*.55;
  ctx.fillStyle=C.line2; ctx.beginPath(); ctx.arc(cxx,by+bh/2,cr,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#fff"; ctx.font=`900 ${cr*1.3}px ${FONT}`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("2",cxx,by+bh/2+1);
  ctx.font=`900 ${fs}px ${FONT}`; ctx.textAlign="left"; ctx.fillText(name,sx+bh*1.05,by+bh/2+1,sw-bh*1.25);
  if(false){
    // 연속 선로 예고판(주황)
    const wsw=T*1.7, wsx=T*.25, wby=by;
    ctx.fillStyle="#3A4062"; ctx.fillRect(wsx+wsw/2-1.5,wby+bh,3,base-wby-bh);
    ctx.fillStyle="#B8862A"; ctx.fillRect(wsx,wby-3,wsw,3);
    ctx.fillStyle="#F2C94C"; ctx.fillRect(wsx,wby,wsw,bh);
    ctx.fillStyle="#1A1405"; ctx.font=`900 ${Math.max(10,bh*.42)}px ${FONT}`; ctx.textAlign="center"; ctx.fillText("⇈ 선로 2줄",wsx+wsw/2,wby+bh/2+1,wsw-6);
  }
  ctx.restore();
}
// 혼잡도 픽토그램: 사람 5명 중 n명 (서비스 5단계 표기와 같은 모양)
function people(x,y,h,n,on,off){
  const w=h*.62, gap=h*.16;
  for(let i=0;i<5;i++){
    const px=x+i*(w+gap); ctx.fillStyle=i<n?on:off;
    ctx.beginPath(); ctx.arc(px+w/2,y+h*.18,h*.18,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px,y+h); ctx.lineTo(px,y+h*.68); ctx.arcTo(px,y+h*.4,px+w/2,y+h*.4,w/2); ctx.arcTo(px+w,y+h*.4,px+w,y+h*.68,w/2); ctx.lineTo(px+w,y+h); ctx.closePath(); ctx.fill();
  }
  return 5*w+4*gap;
}
// 열차 칸(B안): 칸 전체를 혼잡도 단계 색으로 칠함. 1단계 여유 = 하늘색, 5단계 매우 혼잡 = 적갈색
const CARPAL={
  1:{roof:["#7FA8CF","#BCD7EF","#E3EFFA"],side:["#D7E8F7","#A9CBEA","#7AA5CC"],edge:"#5F89B0",door:"#C3DAEF",acTop:"#E3EFFA",acFront:"#7FA8CF",glass:["#1C2848","#0A0F22"],head:"#4A6488",ppl:"#8FBCE6",glow:"#8FBCE6"},
  5:{roof:["#7E2A0E","#C2552B","#E37A50"],side:["#D9643A","#B23A12","#7E2A0E"],edge:"#6A220B",door:"#C9552B",acTop:"#E8916C",acFront:"#8E2E0F",glass:["#3A1A14","#1A0A08"],head:"#0A0405",ppl:"#FF8A5C",glow:"#E0551F"}
};
function drawCar(t,k,y){
  const x=carStart(t,k)*T, w=CAR_L*T; if(x>W+T||x+w<-T) return;
  const full=crowded(t,k), P=CARPAL[full?5:1];
  const hc=HC(), yN=y+T*.2, yS=y+T*.8, f0=yS-hc, f1=yS-T*.1, rTop=yN-hc, rd=yS-yN, sh=f1-f0;
  // 바닥 그림자 + 바닥 발광
  ctx.fillStyle="rgba(0,0,0,.45)"; ctx.fillRect(x+T*.08,yS-T*.02,w,T*.1);
  ctx.save(); ctx.shadowColor=P.glow; ctx.shadowBlur=T*.3; ctx.fillStyle=P.glow; ctx.globalAlpha=.85; ctx.fillRect(x+T*.15,yS-2,w-T*.3,2); ctx.restore();
  // 대차·바퀴
  ctx.fillStyle="#141724"; ctx.fillRect(x+T*.12,f1,w-T*.24,yS-f1);
  [.2,.8].forEach(p=>{ const bx=x+w*p; ctx.fillStyle="#262B3E"; ctx.fillRect(bx-T*.3,f1+1,T*.6,yS-f1-2);
    [-1,1].forEach(sd=>{ ctx.fillStyle="#0B0D16"; ctx.beginPath(); ctx.arc(bx+sd*T*.17,yS-T*.045,T*.055,0,Math.PI*2); ctx.fill(); ctx.strokeStyle="#5D6680"; ctx.lineWidth=1; ctx.stroke(); }); });
  ctx.save(); rrect(x,rTop,w,f1-rTop,T*.09); ctx.clip();
  // 앞 옆면
  const gf=ctx.createLinearGradient(0,f0,0,f1); gf.addColorStop(0,P.side[0]); gf.addColorStop(.55,P.side[1]); gf.addColorStop(1,P.side[2]);
  ctx.fillStyle=gf; ctx.fillRect(x,f0,w,sh);
  ctx.fillStyle=C.line2; ctx.fillRect(x,f0+sh*.72,w,sh*.07);
  // 창문·문
  const seg=w/10;
  [["d",.2,1.1],["w",1.55,1.75],["w",3.5,1.75],["d",5.45,1.1],["w",6.75,1.75],["d",8.7,1.1]].forEach(([kind,st,l])=>{
    const px=x+st*seg, pw=l*seg;
    if(kind==="d"){
      ctx.fillStyle=P.door; ctx.fillRect(px,f0+sh*.1,pw,sh*.86);
      ctx.fillStyle=P.edge; ctx.fillRect(px+pw/2-.5,f0+sh*.1,1,sh*.86); ctx.fillRect(px,f0+sh*.1,pw,1); ctx.fillRect(px,f0+sh*.1,1,sh*.86); ctx.fillRect(px+pw-1,f0+sh*.1,1,sh*.86);
      [0,1].forEach(i=>{ const gx=px+pw*(.12+i*.5), gw=pw*.26; ctx.fillStyle=P.glass[1]; ctx.fillRect(gx,f0+sh*.2,gw,sh*.34); });
    }else{
      const wy=f0+sh*.16, wh=sh*.42;
      const gg=ctx.createLinearGradient(0,wy,0,wy+wh); gg.addColorStop(0,P.glass[0]); gg.addColorStop(1,P.glass[1]);
      ctx.fillStyle=P.edge; ctx.fillRect(px-1,wy-1,pw+2,wh+2);
      ctx.fillStyle=gg; ctx.fillRect(px,wy,pw,wh);
      const n=full?Math.max(4,Math.round(pw/(T*.11))):(hash(k,Math.round(st*10))<.4?1:0);
      for(let i=0;i<n;i++){
        const hx=px+pw*((i+.5)/Math.max(n,1))+(full?(hash(i,k)-.5)*pw*.06:pw*.12), hr=T*(full?.058:.065), hy=wy+wh-hr*(full?1.3:1.1);
        ctx.fillStyle=P.head; ctx.beginPath(); ctx.arc(hx,hy,hr,0,Math.PI*2); ctx.fill(); ctx.fillRect(hx-hr*1.2,hy+hr*.5,hr*2.4,wy+wh-hy);
      }
      ctx.fillStyle="rgba(255,255,255,.12)"; ctx.beginPath(); ctx.moveTo(px+pw*.15,wy); ctx.lineTo(px+pw*.42,wy); ctx.lineTo(px+pw*.18,wy+wh); ctx.lineTo(px-pw*.09,wy+wh); ctx.closePath(); ctx.fill();
    }
  });
  const ge=ctx.createLinearGradient(x,0,x+w,0); ge.addColorStop(0,"rgba(20,24,44,.35)"); ge.addColorStop(.06,"rgba(20,24,44,0)"); ge.addColorStop(.94,"rgba(20,24,44,0)"); ge.addColorStop(1,"rgba(20,24,44,.35)");
  ctx.fillStyle=ge; ctx.fillRect(x,f0,w,sh);
  // 지붕(윗면)
  const gr=ctx.createLinearGradient(0,rTop,0,f0); gr.addColorStop(0,P.roof[0]); gr.addColorStop(.85,P.roof[1]); gr.addColorStop(1,P.roof[2]);
  ctx.fillStyle=gr; ctx.fillRect(x,rTop,w,rd);
  ctx.fillStyle="rgba(0,0,0,.07)"; for(let i=1;i<10;i++) ctx.fillRect(x+i*w/10,rTop,1,rd);
  ctx.fillStyle=P.edge; ctx.fillRect(x,f0,w,1.5);
  ctx.restore();
  [x+w*.05,x+w*.79].forEach(ax=>box(ax,rTop+rd*.2,rTop+rd*.8,w*.16,T*.07,0,P.acTop,P.acFront));
  // 혼잡도 배지: 어두운 알약 + 단계 색 사람 (5명 중 1명 / 5명)
  const bh=Math.min(rd*.62,T*.44), ih=bh*.62, iw=ih*.62*5+ih*.16*4, pw2=iw+bh*.9, bx=x+w/2-pw2/2, by=rTop+rd/2-bh/2;
  ctx.fillStyle="rgba(0,0,0,.3)"; rrect(bx,by+2,pw2,bh,bh/2); ctx.fill();
  ctx.fillStyle="#0A0B1E"; rrect(bx,by,pw2,bh,bh/2); ctx.fill();
  people(bx+bh*.45,by+(bh-ih)/2,ih,full?5:1,P.ppl,full?"rgba(255,138,92,.3)":"rgba(143,188,230,.3)");
  // 칸 연결부
  const gx=t.dir>0?x-GAP*T:x+w, gwid=GAP*T;
  ctx.fillStyle="#2B3042"; ctx.fillRect(gx,f0+sh*.12,gwid,sh*.7);
  ctx.fillStyle="#1A1E2C"; for(let i=0;i<3;i++) ctx.fillRect(gx+gwid*(.2+i*.28),f0+sh*.12,1.5,sh*.7);
  ctx.fillStyle="#565E74"; ctx.fillRect(gx,rTop+rd*.2,gwid,f0+sh*.12-(rTop+rd*.2));
  if(G.flash&&G.flash.r===t.r&&G.flash.k===k){
    ctx.save(); ctx.globalAlpha=Math.min(1,G.flash.t/.3); ctx.strokeStyle=G.flash.color; ctx.lineWidth=3; ctx.shadowColor=G.flash.color; ctx.shadowBlur=16;
    rrect(x+1.5,rTop+1.5,w-3,yS-rTop-3,T*.09); ctx.stroke(); ctx.restore();
  }
}

// ───────── 주인공 '나' ─────────
//  쇼릴 속 승객(파란 후드티, 핫핑크 캡모자, 흰 운동화)을 블록으로. 120×136 격자에 그린 그림을 화면 크기에 맞춰 줄임
//  모자 챙은 왼쪽 옆으로, 빛은 왼쪽 위에서 비춰 오른쪽이 어두움
const ME=[
  [28,121,28,4,"#FFFFFF"],[28,125,28,7,"#D6DAF2"],[64,121,28,4,"#FFFFFF"],[64,125,28,7,"#D6DAF2"],[28,130,64,2,"#22E5FF"],
  [34,104,20,18,"#1D1A44"],[66,104,20,18,"#1D1A44"],
  [11,60,14,6,"#6E98FF"],[11,66,14,32,"#4070F5"],[12,97,12,8,"#F7C9AE"],
  [95,60,14,6,"#5C86FF"],[95,66,14,32,"#3A63DA"],[96,97,12,8,"#E9B696"],
  [25,58,70,9,"#7FA6FF"],[25,67,70,20,"#5786FF"],[25,87,70,19,"#4A78F7"],[74,67,21,39,"rgba(107,61,240,.35)"],
  [41,87,38,11,"#2C3CB4"],[50,68,3,11,"#EEF0FF"],[67,68,3,11,"#EEF0FF"],[35,60,50,7,"#2C3CB4"],
  [24,34,8,13,"#F2B596"],[88,34,8,13,"#E9A985"],[31,22,58,38,"#FFE3D1"],[74,22,15,38,"rgba(214,140,110,.25)"],
  [38,47,7,3,"rgba(255,122,182,.55)"],[75,47,7,3,"rgba(255,122,182,.55)"],
  [29,2,62,11,"#FF8CCB"],[29,13,62,14,"#FF2E97"],[29,27,62,4,"#C9156F"],
  [2,20,30,5,"#FF5AAE"],[2,25,30,6,"#E01F84"],[2,31,30,2,"#9E0F59"]
];
const meScale=()=>T*.0064;
function heroSprite(g,ox,oy,s,sq,mood){
  const X=v=>ox+(v-60)*s, Y=v=>oy-(136-v)*sq*s;
  ME.forEach(([x,y,w,h,c])=>{ g.fillStyle=c; g.fillRect(X(x),Y(y),w*s+.5,h*sq*s+.5); });
  const ink="#241A44"; g.fillStyle=ink; g.strokeStyle=ink; g.lineCap="round"; g.lineJoin="round"; g.lineWidth=Math.max(1.3,2.6*s);
  if(mood==="pain"){
    g.beginPath(); g.moveTo(X(44),Y(36)); g.lineTo(X(51),Y(41)); g.lineTo(X(44),Y(46)); g.moveTo(X(76),Y(36)); g.lineTo(X(69),Y(41)); g.lineTo(X(76),Y(46)); g.stroke();
    g.fillStyle="#FFFFFF"; g.fillRect(X(52),Y(49),16*s,5*sq*s); g.strokeRect(X(52),Y(49),16*s,5*sq*s);
  }else if(mood==="happy"){
    g.beginPath(); g.arc(X(48),Y(43),4*s,Math.PI,0); g.moveTo(X(74),Y(43)); g.arc(X(70),Y(43),4*s,Math.PI,0); g.stroke();
    g.fillStyle="#7A1F4A"; g.beginPath(); g.arc(X(60),Y(49),6*s,0,Math.PI); g.fill();
  }else{
    g.fillRect(X(45),Y(37),7*s,8*sq*s); g.fillRect(X(67),Y(37),7*s,8*sq*s); g.fillRect(X(54),Y(50),12*s,3*sq*s);
  }
}
// 남색 테두리 + 핑크 네온(4안)을 입히려고 먼저 작은 캔버스에 그린 뒤 그림자 효과로 겹쳐 그림
const off=document.createElement("canvas"), og=off.getContext("2d");
function drawMe(x,footY,sq,mood,alpha,fx){
  const s=meScale(), pad=Math.ceil(T*.3), d=Math.min(2,devicePixelRatio||1), wC=120*s+pad*2, hC=136*s+pad*2;
  const pw=Math.ceil(wC*d), ph=Math.ceil(hC*d); if(off.width!==pw||off.height!==ph){off.width=pw;off.height=ph;}
  og.setTransform(d,0,0,d,0,0); og.clearRect(0,0,wC,hC);
  heroSprite(og,pad+60*s,pad+136*s,s,sq,mood);
  const dx=x-pad-60*s, dy=footY-pad-136*s;
  ctx.save(); ctx.globalAlpha*=alpha;
  if(fx){
    const o=1.5*d; ctx.shadowColor="#0A0B1E"; ctx.shadowBlur=0;
    [[o,0],[-o,0],[0,o],[0,-o]].forEach(([a,b])=>{ ctx.shadowOffsetX=a; ctx.shadowOffsetY=b; ctx.drawImage(off,dx,dy,wC,hC); });
    ctx.shadowOffsetX=0; ctx.shadowOffsetY=0; ctx.shadowColor="rgba(255,46,151,.9)";
    ctx.shadowBlur=T*.22*d; ctx.drawImage(off,dx,dy,wC,hC);
    ctx.shadowBlur=T*.1*d; ctx.drawImage(off,dx,dy,wC,hC);
    ctx.shadowBlur=T*.04*d; ctx.drawImage(off,dx,dy,wC,hC);
    ctx.shadowColor="transparent"; ctx.shadowBlur=0;
  }
  ctx.drawImage(off,dx,dy,wC,hC);
  ctx.restore();
}
const roofH=r=>rowType(Math.round(r))==="track"?HC()+T*.04:PZ();
function heroBase(){ return G.anim?lerp(roofH(G.anim.fy),roofH(G.anim.ty),G.anim.k||0):roofH(G.py); }
function drawHero(){
  const cx=G.px*T+T/2, gy=yTop(G.py)+T*.62, base=heroBase(), s=meScale();
  let bounce=0, squash=1;
  if(G.mode==="idle"&&G.running&&!G.paused){ const ph=(clock*2.6)%1, sn=Math.sin(ph*Math.PI); bounce=sn*.13; squash=ph<.12||ph>.92?.9:1; }
  let e=base+(G.z+bounce)*T, alpha=(G.inv>0&&Math.floor(G.inv*10)%2)?.3:1; const dead=G.mode==="dead";
  if(dead){ e=-G.fall*G.fall*T*5; alpha=clamp(1-G.fall*1.2,0,1); }
  if(alpha<=0) return;
  // 움직일 때 남는 잔상
  G.trail.forEach(tr=>drawMe(tr.x*T+T/2,yTop(tr.y)+T*.62-tr.e*T,1,G.mood,(tr.t/.22)*.32,false));
  // 등장 연출: 빛이 바닥에 닿는 순간(0.4초)부터 '나'와 그림자가 나타남
  const el=G.running&&G.intro>0?INTRO-G.intro:9;
  const appear=el<.4?0:Math.min(1,(el-.4)/.12), spread=el<.4?.3:Math.min(1,.3+.7*(el-.4)/.25);
  if(!dead){
    // 발밑 핑크 그림자: 가운데 진한 자주 → 바깥으로 흐려짐. 뛰면 작고 옅어짐
    const lift=Math.min(.55,(G.z+bounce)*.9), rx=T*.48*(1-lift*.5)*spread, ry=T*.14*(1-lift*.5)*spread;
    ctx.save(); ctx.globalAlpha=(1-lift*.6)*(el<.4?.35:1); ctx.translate(cx,gy-base+1); ctx.scale(1,ry/Math.max(1,rx));
    const sg=ctx.createRadialGradient(0,0,0,0,0,Math.max(1,rx));
    sg.addColorStop(0,"rgba(150,10,80,.95)"); sg.addColorStop(.45,"rgba(255,46,151,.85)"); sg.addColorStop(.8,"rgba(255,46,151,.35)"); sg.addColorStop(1,"rgba(255,46,151,0)");
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(0,0,Math.max(1,rx),0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  if(appear<=0) return;
  drawMe(cx,gy-e,squash,G.mood,alpha*appear,!dead);
  // 머리 위 '나' 꼬리표
  if(!dead&&G.running&&!(G.intro>0)){
    const th=Math.max(14,T*.26), tw=th*1.55, tx=cx-tw/2, ty=gy-e-136*s*squash-th-T*.12+Math.sin(clock*4)*2;
    ctx.fillStyle=C.pink; rrect(tx,ty,tw,th,th/2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx-th*.22,ty+th-1); ctx.lineTo(cx+th*.22,ty+th-1); ctx.lineTo(cx,ty+th+th*.28); ctx.fill();
    ctx.fillStyle="#FFFFFF"; ctx.font=`900 ${th*.62}px ${FONT}`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("나",cx,ty+th/2+1);
  }
}
// 처음 등장: 화면이 어두워지고 핑크 빛이 위에서 '나'의 자리로 흘러내림 → 바닥에 닿으면 '나'와 핑크 그림자가 나타남
//  → 3·2·1 동안 은은하게 유지 → "출발!"과 함께 빛이 위로 걷히고 화면이 밝아짐. 가장자리는 모두 흐리게(선이 보이지 않게)
const INTRO=3.0;
const cdNum=v=>Math.ceil((v-.6)/.8);   // 3(첫 0.8초) → 2 → 1 → 출발!(마지막 0.6초)
const easeIO=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
const bcv=document.createElement("canvas"), bg2=bcv.getContext("2d");
function drawBeam(hx,top,bot,I){
  const d=Math.min(2,devicePixelRatio||1), pw=Math.ceil(W*d), ph=Math.ceil(H*d);
  if(bcv.width!==pw||bcv.height!==ph){bcv.width=pw;bcv.height=ph;}
  bg2.setTransform(d,0,0,d,0,0); bg2.globalCompositeOperation="source-over"; bg2.clearRect(0,0,W,H);
  if(bot<=top+2) return;
  const bw=T*1.25;
  // 가로: 가운데가 밝고 양옆으로 흐려짐
  const hg=bg2.createLinearGradient(hx-bw/2,0,hx+bw/2,0);
  hg.addColorStop(0,"rgba(255,46,151,0)"); hg.addColorStop(.28,`rgba(255,46,151,${.26*I})`); hg.addColorStop(.44,`rgba(255,120,190,${.6*I})`);
  hg.addColorStop(.5,`rgba(255,215,238,${.85*I})`); hg.addColorStop(.56,`rgba(255,120,190,${.6*I})`); hg.addColorStop(.72,`rgba(255,46,151,${.26*I})`); hg.addColorStop(1,"rgba(255,46,151,0)");
  bg2.fillStyle=hg; bg2.fillRect(hx-bw/2,top,bw,bot-top+T*.3);
  // 세로: 위는 투명, 아래로 갈수록 진하고, 끝은 부드럽게
  bg2.globalCompositeOperation="destination-in";
  const L=bot+T*.3-top, vg=bg2.createLinearGradient(0,top,0,top+L), tip=clamp((bot-T*.35-top)/L,.42,.98);
  vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(Math.min(.4,tip-.01),"rgba(0,0,0,.5)"); vg.addColorStop(tip,"rgba(0,0,0,1)"); vg.addColorStop(1,"rgba(0,0,0,0)");
  bg2.fillStyle=vg; bg2.fillRect(0,0,W,H);
  ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.drawImage(bcv,0,0,W,H); ctx.restore();
}
function softGlow(x,y,rx,ry,c0,c1){
  ctx.save(); ctx.translate(x,y); ctx.scale(1,ry/Math.max(1,rx));
  const g=ctx.createRadialGradient(0,0,0,0,0,Math.max(1,rx)); g.addColorStop(0,c0); g.addColorStop(.55,c1); g.addColorStop(1,"rgba(255,46,151,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,Math.max(1,rx),0,Math.PI*2); ctx.fill(); ctx.restore();
}
function drawIntro(){
  const el=INTRO-G.intro, hx=G.px*T+T/2, fy=yTop(G.py)+T*.62-PZ(), hy=fy-T*.45, s=meScale();
  const out=G.intro<.6?easeIO((.6-G.intro)/.6):0;      // 출발! 구간: 0 → 1
  // 화면 어둡게: '나' 주변에서 바깥으로 서서히
  ctx.save(); ctx.globalAlpha=1-out;
  const rg=ctx.createRadialGradient(hx,hy,T*.5,hx,hy,T*2.6); rg.addColorStop(0,"rgba(4,4,16,0)"); rg.addColorStop(.35,"rgba(4,4,16,.25)"); rg.addColorStop(1,"rgba(4,4,16,.8)");
  ctx.fillStyle=rg; ctx.fillRect(0,0,W,H); ctx.restore();
  // 빛기둥: 위에서 내려옴(0~0.4초) → 유지 → 출발!에 위로 걷힘
  const down=Math.min(1,el/.4), bot=out>0?lerp(fy,-T,out):lerp(-T,fy,easeIO(down));
  const land=el<.4?0:Math.max(0,1-(el-.4)/.5), I=(.7+.3*land)*(1-out*.3);
  drawBeam(hx,-T,bot,I);
  if(el<.4) softGlow(hx,bot,T*.45,T*.35,"rgba(255,235,245,.95)","rgba(255,46,151,.45)");
  // 바닥에 닿은 순간 발밑으로 번지는 빛
  if(el>=.4&&out<1){ const sp=Math.min(1,(el-.4)/.3); softGlow(hx,fy,T*(.6+.5*sp),T*(.18+.14*sp),`rgba(255,140,200,${.75*land+.15})`,`rgba(255,46,151,${.35*land+.08})`); }
  // 이름표
  if(el>.45){
    ctx.save(); ctx.globalAlpha=Math.min(1,(el-.45)/.2)*(1-out);
    const lh=Math.max(22,T*.42); ctx.font=`900 ${lh*.5}px ${FONT}`; const tw=ctx.measureText("나 · 출발").width+lh;
    const ly=fy-136*s-lh-T*.25; ctx.fillStyle=C.pink; rrect(hx-tw/2,ly,tw,lh,lh/2); ctx.fill();
    ctx.fillStyle="#FFFFFF"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("나 · 출발",hx,ly+lh/2+1);
    ctx.restore();
  }
  // 카운트다운
  const n=cdNum(G.intro), fs=Math.max(40,Math.min(72,W*.1));
  ctx.save(); ctx.globalAlpha=n>0?1:1-out*.8;
  ctx.font=n>0?`400 ${fs}px "Press Start 2P",${FONT}`:`900 ${fs}px ${FONT}`; ctx.fillStyle=C.fg; ctx.shadowColor=C.cyan; ctx.shadowBlur=24; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.fillText(n>0?String(n):"출발!",W/2,Math.min(H*.3,fy-136*s-T*1.6));
  ctx.restore();
}
function draw(){
  ctx.save();
  if(G.shake>0){ctx.translate((Math.random()-.5)*8*G.shake/.35,(Math.random()-.5)*8*G.shake/.35);}
  ctx.fillStyle="#05060D"; ctx.fillRect(-10,-10,W+20,H+20);
  const lo=Math.floor(G.cam)-1, hi=Math.ceil(G.cam+H/T)+2, pr=Math.round(G.py);
  for(let r=hi;r>=lo;r--) drawRow(r);
  for(let r=hi;r>=lo;r--){
    const y=yTop(r);
    if(rowType(r)==="track"&&G.edge<r+.2){const t=getTrack(r); const k0=Math.floor((-CAR_L-1-t.offset)/PERIOD)-1, k1=Math.ceil((COLS+1-t.offset)/PERIOD)+1; for(let k=k0;k<=k1;k++) drawCar(t,k,y);}
    else if(r>=1&&rowType(r)==="platform") { if(stationOf(r)>=GOAL) drawGoal(r); else drawSign(r); }
    if(r===pr) drawHero();
  }
  G.pops.forEach(p=>{
    const x=clamp(p.x*T+T/2,T*1.4,W-T*1.4), y=yTop(p.y)-T*1.05-(1-p.t)*T*1.1;
    ctx.save(); ctx.globalAlpha=Math.min(1,p.t*2); ctx.font=`900 ${Math.max(14,T*.38)}px ${FONT}`; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.lineWidth=5; ctx.strokeStyle="#05060D"; ctx.strokeText(p.text,x,y); ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=10; ctx.fillText(p.text,x,y); ctx.restore();
  });
  // 화면 가장자리를 살짝 어둡게
  const vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75); vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,.45)");
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  drawBand();
  if(G.running&&G.intro>0) drawIntro();
  ctx.restore();
}


// ───────── 시작 · 조작 · 끝 ─────────
function finish(arrived){
  if(G.done) return; G.done=true; G.running=false;
  if(!arrived){ sfx.fail(); setMood("pain",9); } else setMood("happy",9);
  setTimeout(()=>{ if(!stopped) opts.onEnd&&opts.onEnd({arrived}); }, arrived?900:700);
}
ac=opts.ac||null; audioInit();
newGame(true); G.cam=camTo(); sfx.beam();
function ready(){ return G.running&&!G.paused&&!(G.intro>0)&&(G.mode==="idle"||(G.mode==="ride"&&!G.ride.hop)); }
function run(a){ if(a==="left")move(-1); else if(a==="right")move(1); else go(); }
function act(a){ if(ready()){ G.buf=null; run(a); } else if(G.running&&!G.paused&&!(G.intro>0)) G.buf={a,t:.3}; }
const KEY={ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right",ArrowUp:"up",KeyW:"up",Space:"up"};
const onKey=e=>{ const a=KEY[e.code]; if(!a) return; e.preventDefault(); if(!e.repeat||a!=="up") act(a); };
// 터치: 탭하면 앞으로, 좌우로 밀면 옆으로 (휴대폰을 가로로 들어 화면을 돌렸으면 방향도 돌려서 읽음)
let sx=0,sy=0;
const onDown=e=>{ sx=e.clientX; sy=e.clientY; };
const onUp=e=>{ let dx=e.clientX-sx, dy=e.clientY-sy; if(opts.rotated){ [dx,dy]=[-dy,dx]; }
  if(Math.hypot(dx,dy)<24) act("up"); else if(Math.abs(dx)>Math.abs(dy)) act(dx>0?"right":"left"); else if(dy<0) act("up"); };
addEventListener("keydown",onKey); cv.addEventListener("pointerdown",onDown); cv.addEventListener("pointerup",onUp);
let raf=0, last=performance.now(), stopped=false;
function loop(now){ const dt=Math.min(.05,(now-last)/1000); last=now; if(!G.paused) update(dt); draw(); raf=requestAnimationFrame(loop); }
raf=requestAnimationFrame(loop);
return {
  stop(){ stopped=true; cancelAnimationFrame(raf); removeEventListener("keydown",onKey); cv.removeEventListener("pointerdown",onDown); cv.removeEventListener("pointerup",onUp); },
  pause(on){ G.paused=!!on; },
};
}
