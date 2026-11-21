// Magic school idle tycoon — v0.2: top-down (3/4) campus with walking creatures.
import {
  OFFLINE_CAP_SEC, MAX_DESKS, MAX_ITEM_LEVEL, MAX_TEACHER_LEVEL, MAX_TIME_LEVEL,
  CLASSES, SPECIES, NAMES, MISSIONS,
} from './data.js?v=3';

const SAVE_KEY = 'magicschool.save.v2';
const VERSION = '0.2';
const $ = (s, r = document) => r.querySelector(s);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

// ======================= state & economy =======================
let S;
function freshState() {
  S = {
    v: 2, coins: 50, nextId: 1, last: Date.now(), mission: 0, ema: 0,
    reception: { level: 1, ads: 1 },
    classes: CLASSES.map((c, i) => ({ built: i === 0, buildEnd: 0, teacher: 1, desks: 2, time: 0, items: c.items.map(() => 0) })),
    stats: { graduated: 0, passed: 0, failed: 0, enrolled: 0 },
  };
}
function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { S = JSON.parse(raw); return; } } catch (e) { /* fresh */ }
  freshState();
}
function save() { S.last = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }

const cls = (id) => S.classes[CLASSES.findIndex((c) => c.id === id)];
const isOpen = (i) => S.classes[i].built && Date.now() >= S.classes[i].buildEnd;
const kindSum = (i, kind) => CLASSES[i].items.reduce((a, it, k) => a + (it.kind === kind ? S.classes[i].items[k] : 0), 0);
const tuition = (i) => Math.round(CLASSES[i].tuition * (1 + 0.08 * kindSum(i, 'tuition')) * (1 + 0.05 * (S.classes[i].teacher - 1)));
const success = (i) => Math.min(0.99, 0.6 + 0.015 * (S.classes[i].teacher - 1) + 0.01 * kindSum(i, 'success'));
const lessonTime = (i) => CLASSES[i].lesson * Math.pow(0.92, S.classes[i].time);
const itemCost = (i, k) => Math.round(CLASSES[i].tuition * 2 * (1 + k) * Math.pow(1.25, S.classes[i].items[k]));
const teacherCost = (i) => Math.round(CLASSES[i].tuition * 6 * Math.pow(1.35, S.classes[i].teacher - 1));
const deskCost = (i) => Math.round(CLASSES[i].tuition * 15 * Math.pow(2.3, S.classes[i].desks - 2));
const timeCost = (i) => Math.round(CLASSES[i].tuition * 10 * Math.pow(1.6, S.classes[i].time));
const procTime = () => 3.5 * Math.pow(0.92, S.reception.level - 1);
const fee = () => 3 + S.reception.level;
const arrivalInterval = () => 5 * Math.pow(0.9, S.reception.ads - 1);
const recCost = () => Math.round(20 * Math.pow(1.4, S.reception.level - 1));
const adsCost = () => Math.round(30 * Math.pow(1.45, S.reception.ads - 1));

const G = { // helpers exposed to missions
  get S() { return S; }, cls, built: (id) => { const i = CLASSES.findIndex((c) => c.id === id); return isOpen(i); },
  item: (cid, iid) => { const i = CLASSES.findIndex((c) => c.id === cid); return S.classes[i].items[CLASSES[i].items.findIndex((x) => x.id === iid)]; },
  maxItem: () => Math.max(...S.classes.flatMap((c) => c.items)),
};

function earn(n, x, y, color) { S.coins += n; earnedThisSec += n; if (x !== undefined) popup(`+${fmt(n)}`, x, y, color || '#c98a00'); }
function spend(c) { if (S.coins < c) { toast('Не хватает монет 🪙'); return false; } S.coins -= c; return true; }

// ======================= world geometry =======================
const W = 400, GT = 150, RH = 210, RECH = 250, GATE = 70;
const ROWS = Math.ceil(CLASSES.length / 2);
const H = GT + ROWS * RH + RECH + GATE;
const CX = 200, CORR = 30;                 // corridor centre and half width
const recTop = GT + ROWS * RH;
const rowTop = (r) => GT + (ROWS - 1 - r) * RH;
function roomRect(i) {
  const r = Math.floor(i / 2), left = i % 2 === 0;
  const x = left ? 8 : CX + CORR + 4, w = CX - CORR - 12;
  const y = rowTop(r) + 12, h = RH - 20;
  return { x, y, w, h, left, doorY: y + h - 46, doorX: left ? x + w : x };
}
function deskPos(i, d) {
  const R = roomRect(i);
  const col = d % 2, row = Math.floor(d / 2);
  return { x: R.x + (col === 0 ? 44 : R.w - 44), y: R.y + 92 + row * 34 };
}
const teacherPos = (i) => { const R = roomRect(i); return { x: R.x + R.w / 2, y: R.y + 58 }; };
const queueSlot = (k) => ({ x: CX, y: recTop + 120 + k * 20 });
const DESK_FRONT = { x: CX, y: recTop + 96 };
const GATE_POS = { x: CX, y: H - 16 };

// ======================= agents =======================
let agents = [];
let queue = [];                                     // agents waiting at reception, front first
const deskOcc = CLASSES.map(() => Array(MAX_DESKS).fill(null));
const waitList = CLASSES.map(() => []);
let processing = null; let procT = 0;
let arrivalT = 1;

function spawn() {
  const a = { id: S.nextId++, sp: rnd(SPECIES), name: rnd(NAMES), x: GATE_POS.x + (Math.random() * 20 - 10), y: GATE_POS.y,
    path: [], speed: 46 + Math.random() * 10, state: 'walk', onArrive: null, flip: false, t: 0, dur: 1, c: -1, desk: -1, ph: Math.random() * 6 };
  agents.push(a);
  queue.push(a);
  goQueue(a);
}
function goQueue(a) {
  const k = queue.indexOf(a);
  a.state = 'walk'; a.path = [queueSlot(k)]; a.onArrive = () => { a.state = 'queue'; };
}
function startNextProcess() {
  if (processing || !queue.length) return;
  const a = queue[0];
  if (a.state !== 'queue') return;
  processing = a; procT = 0; a.state = 'process';
}
function finishProcess() {
  const a = processing; processing = null;
  queue.shift();
  queue.forEach(goQueue);
  S.stats.enrolled++;
  earn(fee(), CX + 20, recTop + 60, '#c98a00');
  a.state = 'walk';
  a.path = [{ x: CX + 40, y: DESK_FRONT.y + 12 }, { x: CX + 40, y: recTop + 20 }, { x: CX, y: recTop - 4 }];
  a.onArrive = () => goClass(a, nextClass(-1));
}
function nextClass(i) { for (let k = i + 1; k < CLASSES.length; k++) if (isOpen(k)) return k; return -1; }

function goClass(a, i) {
  if (i < 0) { goGraduate(a); return; }
  const R = roomRect(i);
  a.c = i; a.state = 'walk';
  a.path = [{ x: CX, y: R.doorY }];
  a.onArrive = () => arriveClass(a, i);
}
function waitSpot(i, k) { const R = roomRect(i); return { x: CX + (R.left ? -14 : 14), y: R.doorY + 16 + k * 14 }; }
function arriveClass(a, i) {
  const d = freeDesk(i);
  if (d < 0) {
    waitList[i].push(a);
    a.state = 'walkwait'; a.path = [waitSpot(i, waitList[i].length - 1)];
    a.onArrive = () => { a.state = 'wait'; };
    return;
  }
  seat(a, i, d);
}
function freeDesk(i) { for (let d = 0; d < S.classes[i].desks; d++) if (!deskOcc[i][d]) return d; return -1; }
function seat(a, i, d) {
  const R = roomRect(i), p = deskPos(i, d);
  deskOcc[i][d] = a.id; a.desk = d; a.c = i; a.state = 'walk';
  a.path = [{ x: R.doorX + (R.left ? -10 : 10), y: R.doorY }, { x: p.x, y: R.doorY }, { x: p.x, y: p.y }];
  a.onArrive = () => { a.state = 'study'; a.t = 0; a.dur = lessonTime(i); };
}
function finishLesson(a) {
  const i = a.c, p = deskPos(i, a.desk);
  if (Math.random() < success(i)) {
    S.stats.passed++;
    earn(tuition(i), p.x, p.y - 40);
    leaveDesk(a);
  } else {
    S.stats.failed++;
    popup('💧 ещё раз', p.x, p.y - 36, '#5b7fd6');
    a.t = 0; a.dur = lessonTime(i);
  }
}
function leaveDesk(a) {
  const i = a.c, R = roomRect(i), p = deskPos(i, a.desk);
  deskOcc[i][a.desk] = null; a.desk = -1;
  a.state = 'walk';
  a.path = [{ x: p.x, y: R.doorY }, { x: R.doorX + (R.left ? -10 : 10), y: R.doorY }, { x: CX, y: R.doorY }];
  a.onArrive = () => goClass(a, nextClass(i));
  pullWaiting(i);
}
function pullWaiting(i) {
  while (waitList[i].length) {
    const d = freeDesk(i); if (d < 0) break;
    seat(waitList[i].shift(), i, d);
  }
  waitList[i].forEach((w, k) => { w.state = 'walkwait'; w.path = [waitSpot(i, k)]; w.onArrive = () => { w.state = 'wait'; }; });
}
function goGraduate(a) {
  a.c = -1; a.state = 'walk';
  a.path = [{ x: CX, y: GT - 6 }, { x: CX + (Math.random() * 140 - 70), y: 74 + Math.random() * 40 }];
  a.onArrive = () => {
    S.stats.graduated++;
    popup('🎓 ⭐+1', a.x, a.y - 34, '#7b5cd6');
    a.state = 'fly'; a.t = 0; a.vx = (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 20);
  };
}

function stepAgents(dt) {
  for (const a of agents) {
    a.ph += dt;
    if (a.state === 'fly') { a.t += dt; a.y -= (30 + a.t * 40) * dt; a.x += a.vx * dt; continue; }
    if (a.path.length) {
      const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy);
      const stepLen = a.speed * dt;
      if (Math.abs(dx) > 0.5) a.flip = dx < 0;
      if (dist <= stepLen) {
        a.x = p.x; a.y = p.y; a.path.shift();
        if (!a.path.length && a.onArrive) { const f = a.onArrive; a.onArrive = null; f(); }
      } else { a.x += dx / dist * stepLen; a.y += dy / dist * stepLen; }
      continue;
    }
    if (a.state === 'study') { a.t += dt; if (a.t >= a.dur) finishLesson(a); }
  }
  agents = agents.filter((a) => !(a.state === 'fly' && a.y < -80));
}

function stepWorld(dt) {
  arrivalT -= dt;
  if (arrivalT <= 0) { arrivalT = arrivalInterval(); if (queue.length < 6) spawn(); }
  startNextProcess();
  if (processing) { procT += dt; if (procT >= procTime()) finishProcess(); }
  S.classes.forEach((c, i) => { if (c.built && c.buildEnd && Date.now() >= c.buildEnd) { c.buildEnd = 0; toast(`✨ Построено: ${CLASSES[i].name}!`); dirtyPanel = true; } });
  stepAgents(dt);
  for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.t += dt; p.y -= 22 * dt; if (p.t > 1.3) popups.splice(i, 1); }
}

// ======================= rendering =======================
const canvas = $('#world'), ctx = canvas.getContext('2d');
const scroller = $('#view');
let scale = 1, dpr = 1, viewH = 0;
const sprites = {};
for (const sp of SPECIES) { const im = new Image(); im.src = `assets/creatures/${sp}.png`; sprites[sp] = im; }
const popups = [];
function popup(t, x, y, color) { popups.push({ text: t, x, y, color, t: 0 }); }

function resize() {
  const r = scroller.getBoundingClientRect();
  dpr = Math.min(3, window.devicePixelRatio || 1);
  scale = r.width / W; viewH = r.height;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  $('#spacer').style.height = H * scale + 'px';
}

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function emoji(e, x, y, size) { ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y); }
function text(t, x, y, size, color, weight = 700) { ctx.font = `${weight} ${size}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(t, x, y); }

function drawGround() {
  ctx.fillStyle = '#a9d98f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9ccf82';
  for (let i = 0; i < 160; i++) { const x = (i * 97) % W, y = (i * 211) % H; ctx.fillRect(x, y, 3, 2); }
  // garden at the top
  ctx.fillStyle = '#c7e9b0'; rr(40, 20, W - 80, GT - 30, 30); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
  text('Сад выпускников', CX, 36, 13, '#4f7a3d');
  emoji('🌳', 70, 62, 30); emoji('🌸', 330, 70, 24); emoji('🌷', 92, 112, 18); emoji('⛲', CX, 96, 30); emoji('🌳', 335, 115, 26);
  // corridor
  ctx.fillStyle = '#f3e6cf'; ctx.fillRect(CX - CORR, GT - 14, CORR * 2, recTop - GT + 20);
  ctx.fillStyle = '#e7d5b5'; for (let y = GT; y < recTop; y += 24) ctx.fillRect(CX - CORR, y, CORR * 2, 2);
  ctx.fillStyle = '#c9b8ee'; ctx.fillRect(CX - 9, GT - 14, 18, recTop - GT + 20);
  // reception hall
  ctx.fillStyle = '#f6ead6'; rr(16, recTop + 4, W - 32, RECH - 8, 18); ctx.fill();
  ctx.fillStyle = '#d8c3f2'; rr(16, recTop + 4, W - 32, 30, [18, 18, 0, 0]); ctx.fill();
  ctx.fillStyle = '#c8b0ec'; ctx.fillRect(16, recTop + 34, W - 32, 4);
  text('Приёмная', CX, recTop + 19, 13, '#5a3fb0');
  ctx.fillStyle = '#ffd1e3'; ctx.fillRect(CX - 16, recTop + 100, 32, RECH - 96);
  // reception desk
  ctx.fillStyle = '#b98457'; rr(CX - 56, DESK_FRONT.y - 26, 112, 22, 6); ctx.fill();
  ctx.fillStyle = '#9a6a41'; ctx.fillRect(CX - 56, DESK_FRONT.y - 8, 112, 8);
  emoji('📜', CX - 38, DESK_FRONT.y - 17, 14); emoji('🔔', CX + 40, DESK_FRONT.y - 17, 14);
  emoji('🪴', 40, recTop + 60, 24); emoji('🪴', W - 40, recTop + 60, 24); emoji('🛋️', 56, recTop + 182, 26); emoji('🗺️', W - 56, recTop + 172, 24);
  // gate
  ctx.fillStyle = '#8d6a9f'; ctx.fillRect(CX - 40, H - GATE + 10, 10, 50); ctx.fillRect(CX + 30, H - GATE + 10, 10, 50);
  ctx.fillStyle = '#6c4fd1'; rr(CX - 46, H - GATE + 2, 92, 14, 6); ctx.fill();
  text('ВОРОТА', CX, H - GATE + 9, 9, '#fff');
}

function drawRoom(i) {
  const R = roomRect(i), C = CLASSES[i], st = S.classes[i];
  if (!st.built) { drawPlot(i); return; }
  ctx.fillStyle = C.floor; rr(R.x, R.y, R.w, R.h, 10); ctx.fill();
  ctx.strokeStyle = '#0000000f'; ctx.lineWidth = 1;
  for (let y = R.y + 40; y < R.y + R.h; y += 16) { ctx.beginPath(); ctx.moveTo(R.x + 4, y); ctx.lineTo(R.x + R.w - 4, y); ctx.stroke(); }
  ctx.fillStyle = C.wall; rr(R.x, R.y, R.w, 38, [10, 10, 0, 0]); ctx.fill();
  ctx.fillStyle = '#00000018'; ctx.fillRect(R.x, R.y + 34, R.w, 4);
  ctx.fillStyle = '#fff'; ctx.fillRect(R.x, R.y, 4, R.h); ctx.fillRect(R.x + R.w - 4, R.y, 4, R.h); ctx.fillRect(R.x, R.y + R.h - 4, R.w, 4);
  ctx.fillStyle = C.floor; ctx.fillRect(R.left ? R.x + R.w - 4 : R.x, R.doorY - 14, 4, 28);
  ctx.fillStyle = '#3f5f4a'; rr(R.x + R.w / 2 - 34, R.y + 6, 68, 24, 4); ctx.fill();
  ctx.strokeStyle = '#a77b4f'; ctx.lineWidth = 2; ctx.stroke();
  text(C.emoji + ' ' + C.name, R.x + R.w / 2, R.y + R.h - 12, 10.5, '#5d4a6e');
  const spots = [[R.x + 18, R.y + 20], [R.x + R.w - 18, R.y + 20], [R.x + 16, R.y + R.h - 16], [R.x + R.w - 16, R.y + R.h - 16]];
  C.items.forEach((it, k) => { if (st.items[k] > 0) emoji(it.emoji, spots[k][0], spots[k][1], 15 + Math.min(8, st.items[k] / 3)); });
  if (st.buildEnd && Date.now() < st.buildEnd) {
    ctx.fillStyle = '#ffffffcc'; rr(R.x, R.y, R.w, R.h, 10); ctx.fill();
    emoji('🏗️', R.x + R.w / 2, R.y + R.h / 2 - 16, 36);
    const left = Math.ceil((st.buildEnd - Date.now()) / 1000);
    text(`Стройка ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, R.x + R.w / 2, R.y + R.h / 2 + 22, 13, '#5a3fb0');
  }
}
function drawPlot(i) {
  const R = roomRect(i), C = CLASSES[i];
  const next = S.classes.findIndex((c) => !c.built) === i;
  ctx.fillStyle = '#b9e2a0'; rr(R.x, R.y, R.w, R.h, 10); ctx.fill();
  ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
  if (next) {
    ctx.fillStyle = '#fffaf0'; rr(R.x + R.w / 2 - 60, R.y + R.h / 2 - 34, 120, 64, 10); ctx.fill();
    ctx.strokeStyle = '#b98457'; ctx.lineWidth = 3; ctx.stroke();
    text(C.emoji + ' ' + C.name, R.x + R.w / 2, R.y + R.h / 2 - 16, 11, '#5d4a6e');
    text('🪙 ' + fmt(C.build), R.x + R.w / 2, R.y + R.h / 2 + 8, 14, S.coins >= C.build ? '#2f9e7a' : '#b05a7a');
    if (S.coins >= C.build) text('Нажми, чтобы построить', R.x + R.w / 2, R.y + R.h / 2 + 46, 10, '#2f6e3a');
  } else { emoji('🔒', R.x + R.w / 2, R.y + R.h / 2, 22); }
}

function drawCreature(a, x, y, h, extra) {
  const im = sprites[a.sp];
  const walking = a.path && a.path.length > 0;
  const bob = walking ? Math.abs(Math.sin(a.ph * 9)) * 2.5 : Math.sin(a.ph * 2) * 0.8;
  ctx.fillStyle = '#00000022'; ctx.beginPath(); ctx.ellipse(x, y, h * 0.32, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y - bob);
  if (a.flip) ctx.scale(-1, 1);
  if (im && im.complete && im.naturalWidth) { const w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -w / 2, -h, w, h); }
  else { ctx.fillStyle = '#ffd6e8'; ctx.beginPath(); ctx.ellipse(0, -h / 2, h / 2.6, h / 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (extra) extra();
}
function ring(x, y, frac, color = '#3fbf6f') {
  ctx.fillStyle = '#ffffffdd'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
}
const staff = SPECIES.map((sp, k) => ({ sp, ph: k * 1.7, flip: false, path: [] }));
const officer = { sp: 'fernhorn', ph: 0.5, flip: false, path: [] };
function drawHat(x, y, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y, 11, 3, 0, 0, Math.PI * 2); ctx.fill();
  emoji('⭐', x, y - 8, 7);
}

function render() {
  const camY = scroller.scrollTop / scale;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, -camY * dpr * scale);
  ctx.clearRect(0, camY, W, viewH / scale);
  drawGround();
  for (let i = 0; i < CLASSES.length; i++) drawRoom(i);

  const list = [];
  for (let i = 0; i < CLASSES.length; i++) {
    if (!isOpen(i)) continue;
    const tp = teacherPos(i);
    list.push({ y: tp.y, draw: () => drawCreature(staff[(i + 1) % staff.length], tp.x, tp.y, 42, () => drawHat(tp.x, tp.y - 39, '#6c4fd1')) });
    for (let d = 0; d < S.classes[i].desks; d++) {
      const p = deskPos(i, d);
      list.push({ y: p.y + 7, draw: () => { ctx.fillStyle = '#c49a6c'; rr(p.x - 17, p.y - 4, 34, 12, 3); ctx.fill(); ctx.fillStyle = '#a57b4f'; ctx.fillRect(p.x - 17, p.y + 6, 34, 4); emoji('📖', p.x, p.y + 1, 9); } });
    }
  }
  const off = { x: CX, y: DESK_FRONT.y - 28 };
  list.push({ y: off.y, draw: () => drawCreature(officer, off.x, off.y, 42, () => {
    drawHat(off.x, off.y - 39, '#d14f8f');
    if (processing) ring(off.x + 22, off.y - 30, Math.min(1, procT / procTime()), '#ff8a3d');
  }) });
  for (const a of agents) {
    list.push({ y: a.y, draw: () => drawCreature(a, a.x, a.y, 36, () => {
      if (a.state === 'study' && !a.path.length) ring(a.x + 16, a.y - 38, Math.min(1, a.t / a.dur));
      if (a.state === 'fly') emoji('✨', a.x - 14, a.y - 6, 10);
    }) });
  }
  list.sort((p, q) => p.y - q.y).forEach((o) => o.draw());
  for (const p of popups) { ctx.globalAlpha = Math.max(0, 1 - p.t / 1.3); text(p.text, p.x, p.y, 13, p.color); ctx.globalAlpha = 1; }
}

// ======================= UI =======================
function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const u = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [s, v] of u) if (n >= v) return (n / v).toFixed(n / v < 10 ? 1 : 0).replace('.', ',') + s;
  return String(n);
}
const pct = (x) => Math.round(x * 100) + '%';
const sec = (x) => x.toFixed(1).replace('.', ',') + ' с';
function costBtn(label, cost, act, extra = '') { return `<button class="btn" data-cost="${cost}" data-act="${act}" ${extra}>${label} <span class="cost">🪙${fmt(cost)}</span></button>`; }

let panel = null; let dirtyPanel = false;
function openPanel(fn) { panel = fn; $('#sheet').innerHTML = fn(); $('#sheet-wrap').classList.remove('hidden'); updateHud(); }
function closePanel() { panel = null; $('#sheet-wrap').classList.add('hidden'); }
function refreshPanel() { if (panel) { const sc = $('#sheet').scrollTop; $('#sheet').innerHTML = panel(); $('#sheet').scrollTop = sc; } updateHud(); }

function classPanel(i) {
  return () => {
    const C = CLASSES[i], st = S.classes[i];
    if (!isOpen(i)) {
      const left = Math.max(0, Math.ceil((st.buildEnd - Date.now()) / 1000));
      return `<div class="sh-head"><span class="remoji big">🏗️</span><div><h2>${C.name}</h2><div class="muted">Идёт стройка: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div></div><button class="x" data-close>✕</button></div>`;
    }
    let h = `<div class="sh-head"><span class="remoji big">${C.emoji}</span><div><h2>${C.name}</h2><div class="muted">Урок ${i + 1} из ${CLASSES.length}</div></div><button class="x" data-close>✕</button></div>
      <div class="stats3"><div><span>🪙</span><b>${fmt(tuition(i))}</b><i>плата</i></div><div><span>🎯</span><b>${pct(success(i))}</b><i>сдают экзамен</i></div><div><span>⏱️</span><b>${sec(lessonTime(i))}</b><i>урок</i></div></div>`;
    h += `<div class="card up"><span class="remoji">🧙</span><div class="grow"><b>Учитель: ${C.teacher}</b><div class="muted">ур. ${st.teacher}/${MAX_TEACHER_LEVEL} · +5% платы и +1,5% к экзамену</div></div>
      ${st.teacher >= MAX_TEACHER_LEVEL ? '<span class="done">макс.</span>' : costBtn('↑', teacherCost(i), 'teacher', `data-i="${i}"`)}</div>`;
    h += `<div class="card up"><span class="remoji">🪑</span><div class="grow"><b>Парты: ${st.desks}/${MAX_DESKS}</b><div class="muted">больше учеников за раз</div></div>
      ${st.desks >= MAX_DESKS ? '<span class="done">макс.</span>' : costBtn('+1', deskCost(i), 'desk', `data-i="${i}"`)}</div>`;
    h += `<div class="card up"><span class="remoji">⏱️</span><div class="grow"><b>Урок короче</b><div class="muted">ур. ${st.time}/${MAX_TIME_LEVEL} · −8% времени</div></div>
      ${st.time >= MAX_TIME_LEVEL ? '<span class="done">макс.</span>' : costBtn('↑', timeCost(i), 'time', `data-i="${i}"`)}</div>`;
    h += '<h3>Обстановка класса</h3>';
    C.items.forEach((it, k) => {
      const lv = st.items[k];
      h += `<div class="card up"><span class="remoji">${it.emoji}</span><div class="grow"><b>${it.name}</b> <span class="muted">ур. ${lv}</span>
        <div class="muted">${it.kind === 'tuition' ? '+8% платы' : '+1% к экзамену'} за уровень</div><div class="lvbar"><i style="width:${lv / MAX_ITEM_LEVEL * 100}%"></i></div></div>
        ${lv >= MAX_ITEM_LEVEL ? '<span class="done">макс.</span>' : costBtn(lv ? '↑' : 'Купить', itemCost(i, k), 'item', `data-i="${i}" data-k="${k}"`)}</div>`;
    });
    return h;
  };
}
function receptionPanel() {
  return `<div class="sh-head"><span class="remoji big">🛎️</span><div><h2>Приёмная</h2><div class="muted">Здесь новые ученики поступают в школу</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🪙</span><b>${fee()}</b><i>взнос</i></div><div><span>⏱️</span><b>${sec(procTime())}</b><i>оформление</i></div><div><span>🚶</span><b>${sec(arrivalInterval())}</b><i>новый ученик</i></div></div>
    <div class="card up"><span class="remoji">🧾</span><div class="grow"><b>Секретарь</b> <span class="muted">ур. ${S.reception.level}</span><div class="muted">быстрее оформляет, взнос больше</div></div>${costBtn('↑', recCost(), 'rec')}</div>
    <div class="card up"><span class="remoji">📣</span><div class="grow"><b>Объявления о школе</b> <span class="muted">ур. ${S.reception.ads}</span><div class="muted">ученики приходят чаще</div></div>${costBtn('↑', adsCost(), 'ads')}</div>
    <p class="muted">Всего поступило: ${S.stats.enrolled} · выпускников: ${S.stats.graduated}</p>`;
}
function buildPanel(i) {
  return () => {
    const C = CLASSES[i];
    return `<div class="sh-head"><span class="remoji big">${C.emoji}</span><div><h2>${C.name}</h2><div class="muted">Новый класс</div></div><button class="x" data-close>✕</button></div>
      <p>Ученики будут приходить сюда после предыдущего урока. Плата за урок: <b>🪙${fmt(C.tuition)}</b>.</p>
      <p class="muted">Стройка займёт ${C.buildTime >= 60 ? Math.round(C.buildTime / 60) + ' мин' : C.buildTime + ' с'}.</p>
      <button class="btn wide" data-cost="${C.build}" data-act="build" data-i="${i}">Построить <span class="cost">🪙${fmt(C.build)}</span></button>`;
  };
}
function settingsPanel() {
  return `<div class="sh-head"><h2>Настройки</h2><button class="x" data-close>✕</button></div>
    <p class="muted">Прототип v${VERSION}. Картинки временные.</p>
    <p>Экзаменов сдано: ${S.stats.passed} · не сдано: ${S.stats.failed} · выпускников: ${S.stats.graduated}</p>
    <button class="btn ghost wide" data-reset>Начать игру заново</button>`;
}

function renderMission() {
  const m = MISSIONS[S.mission], el = $('#quest');
  const ok = m ? m.check(G) : false;
  const key = S.mission + (ok ? 'y' : 'n');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  if (!m) { el.innerHTML = '<div class="q">🌟 Все задания выполнены!</div>'; return; }
  el.innerHTML = `<div class="q ${ok ? 'ok' : ''}"><span class="qi">${ok ? '🎁' : '📋'}</span><span class="qt">${m.text}</span>
    ${ok ? `<button class="btn hot small" data-mission>Забрать 🪙${fmt(m.reward)}</button>` : `<span class="qr">🪙${fmt(m.reward)}</span>`}</div>`;
}
function updateHud() {
  $('#coins').textContent = fmt(S.coins);
  $('#stars').textContent = fmt(S.stats.graduated);
  $('#rate').textContent = fmt(S.ema * 60) + '/м';
  document.querySelectorAll('[data-cost]').forEach((el) => el.classList.toggle('poor', S.coins < +el.dataset.cost));
  renderMission();
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#fx').appendChild(d); setTimeout(() => d.remove(), 1900); }

// ======================= input =======================
let down = null;
scroller.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, st: scroller.scrollTop }; });
scroller.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) + Math.abs(scroller.scrollTop - down.st);
  down = null; if (moved > 10) return;
  const r = scroller.getBoundingClientRect();
  const wx = (e.clientX - r.left) / scale, wy = (e.clientY - r.top + scroller.scrollTop) / scale;
  for (let i = 0; i < CLASSES.length; i++) {
    const R = roomRect(i);
    if (wx >= R.x && wx <= R.x + R.w && wy >= R.y && wy <= R.y + R.h) {
      if (S.classes[i].built) openPanel(classPanel(i));
      else if (S.classes.findIndex((c) => !c.built) === i) openPanel(buildPanel(i));
      else toast('Сначала построй предыдущий класс');
      return;
    }
  }
  if (wy > recTop && wy < recTop + RECH) { openPanel(receptionPanel); return; }
  if (wy < GT) toast(`🎓 Выпускников: ${S.stats.graduated}`);
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, i = +d.i;
  if (d.close !== undefined) { closePanel(); return; }
  if (d.mission !== undefined) { const m = MISSIONS[S.mission]; if (m && m.check(G)) { S.coins += m.reward; S.mission++; toast(`🎁 Награда 🪙${fmt(m.reward)}`); updateHud(); } return; }
  if (t.id === 'btn-settings') { openPanel(settingsPanel); return; }
  if (d.reset !== undefined) { if (confirm('Точно начать заново? Весь прогресс пропадёт.')) { localStorage.removeItem(SAVE_KEY); S = null; location.reload(); } return; }
  const st = S.classes[i];
  if (d.act === 'teacher') { if (spend(teacherCost(i))) st.teacher++; }
  else if (d.act === 'desk') { if (spend(deskCost(i))) { st.desks++; pullWaiting(i); } }
  else if (d.act === 'time') { if (spend(timeCost(i))) st.time++; }
  else if (d.act === 'item') { if (spend(itemCost(i, +d.k))) st.items[+d.k]++; }
  else if (d.act === 'rec') { if (spend(recCost())) S.reception.level++; }
  else if (d.act === 'ads') { if (spend(adsCost())) S.reception.ads++; }
  else if (d.act === 'build') { if (spend(CLASSES[i].build)) { st.built = true; st.buildEnd = Date.now() + CLASSES[i].buildTime * 1000; panel = classPanel(i); } }
  else return;
  refreshPanel(); save();
});
$('#sheet-bg').addEventListener('click', closePanel);

// ======================= loop, offline =======================
let earnedThisSec = 0, secT = 0, saveT = 0, last = performance.now(), panelT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  stepWorld(dt);
  secT += dt; if (secT >= 1) { S.ema = S.ema * 0.97 + (earnedThisSec / secT) * 0.03; earnedThisSec = 0; secT = 0; updateHud(); }
  panelT += dt; if (panel && (dirtyPanel || panelT > 1)) { panelT = 0; dirtyPanel = false; refreshPanel(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  render();
  requestAnimationFrame(frame);
}
function applyOffline() {
  const away = Math.min(OFFLINE_CAP_SEC, (Date.now() - (S.last || Date.now())) / 1000);
  if (away < 60 || S.ema <= 0) return;
  const gain = Math.floor(S.ema * away);
  if (gain < 1) return;
  S.coins += gain;
  const mins = Math.round(away / 60);
  openPanel(() => `<div class="sh-head"><h2>С возвращением!</h2><button class="x" data-close>✕</button></div>
    <p class="center">Пока тебя не было ${mins >= 60 ? Math.floor(mins / 60) + ' ч ' : ''}${mins % 60} мин, школа работала.</p>
    <div class="center big-txt">🪙 +${fmt(gain)}</div><button class="btn wide" data-close>Ура!</button>`);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S) save(); } else { applyOffline(); last = performance.now(); } });
window.addEventListener('pagehide', () => { if (S) save(); });
window.addEventListener('resize', resize);

load();
if (location.hash.startsWith('#coins=')) { S.coins = +location.hash.slice(7) || S.coins; history.replaceState(null, '', location.pathname); } // test hook
resize();
scroller.scrollTop = H * scale;
applyOffline();
updateHud();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
