// Magic school idle tycoon — v0.3: isometric campus with walking creatures.
import {
  OFFLINE_CAP_SEC, MAX_DESKS, MAX_ITEM_LEVEL, MAX_TEACHER_LEVEL, MAX_TIME_LEVEL,
  CLASSES, SPECIES, NAMES, MISSIONS,
} from './data.js?v=13';

const SAVE_KEY = 'magicschool.save.v2';
const VERSION = '0.3';
const $ = (s, r = document) => r.querySelector(s);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

// ======================= state & economy =======================
let S;
function freshState() {
  S = {
    v: 2, coins: 50, nextId: 1, last: Date.now(), mission: 0, ema: 0,
    reception: { level: 1, ads: 1 },
    classes: CLASSES.map((c, i) => ({ built: i === 0, buildEnd: 0, teacher: 1, desks: 2, time: 0, items: c.items.map(() => 0) })),
    stats: { graduated: 0, passed: 0, failed: 0, enrolled: 0, left: 0 },
  };
}
function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { S = JSON.parse(raw); return; } } catch (e) { /* fresh */ }
  freshState();
}
function save() {
  S.last = Date.now();
  S.world = {   // creatures and their progress, so the school keeps living across reloads
    arrivalT, procT,
    queue: queue.map((a) => a.id),
    wait: waitList.map((l) => l.map((a) => a.id)),
    agents: agents.filter((a) => a.state !== 'fly').map((a) => ({ id: a.id, sp: a.sp, name: a.name, x: a.x, y: a.y, speed: a.speed, state: a.state, c: a.c, desk: a.desk, bed: a.bed, seat: a.seat, prepared: a.prepared, t: a.t, dur: a.dur, goal: a.goal })),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
}

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

function earn(n, x, y, color, lift) { S.coins += n; earnedThisSec += n; if (x !== undefined) popup(`+${fmt(n)}`, x, y, color || '#c98a00', lift); }
function spend(c) { if (S.coins < c) { toast('Не хватает монет 🪙'); return false; } S.coins -= c; return true; }

// ======================= world geometry (isometric tile map) =======================
// Tile coords (x, y). Screen: sx = OX + (x - y) * HW, sy = OY + (x + y) * HH.
// HH/HW = 0.62 matches the angle of the room art.
const HW = 16, HH = HW * 0.62;
const ROOM = 6;                                    // rooms are 6x6 tiles
const WALLH = ROOM * 2 * HW * 0.3676;              // wall height in the art, relative to room width
const GW = 29, GH = 44;

// One school building: a wide shared wooden hall (corridor + cross passages), classes open onto it on both sides,
// reception and dorm at the front, garden at the back end of the corridor.
const HALLS = [
  { x0: 7, y0: 4, x1: 22, y1: 30 },     // the whole inner hall of the building (rooms are cut out of it)
  { x0: 22, y0: 21, x1: 28, y1: 24 },   // passage to the library
  { x0: 13, y0: 39, x1: 16, y1: 44 },   // entrance path from the gate
];
const BUILDING = { x0: 7, y0: 4, x1: 22, y1: 30 };
// Room slots. door = [roomTile, hallTile]; extra = more door pairs; cut = back wall drawn low (something behind it must stay visible).
function slot(x0, y0, door, cut = {}, w = ROOM, h = ROOM, extra = []) { return { x0, y0, x1: x0 + w, y1: y0 + h, door, cut, extra }; }
const SLOTS = {
  L1: slot(7, 24, [[12, 27], [13, 27]]),
  R1: slot(16, 24, [[16, 27], [15, 27]], { left: true }),
  L2: slot(7, 15, [[12, 18], [13, 18]]),
  R2: slot(16, 15, [[16, 18], [15, 18]], { left: true }),
  L3: slot(7, 6, [[12, 9], [13, 9]]),
  R3: slot(16, 6, [[16, 9], [15, 9]], { left: true }),
  REC: slot(10, 30, [[14, 38], [14, 39]], { right: true }, 9, 9,
    [[[15, 38], [15, 39]], [[13, 30], [13, 29]], [[14, 30], [14, 29]], [[15, 30], [15, 29]], [[18, 33], [19, 33]]]),
  DORM: slot(19, 30, [[19, 33], [18, 33]], { left: true, right: true }),
  LIB: slot(22, 24, [[24, 24], [24, 23]], { left: true, right: true }, 6, 6, [[[25, 24], [25, 23]]]),
  GARDEN: slot(10, 0, [[13, 3], [13, 4]], {}, 9, 4, [[[14, 3], [14, 4]], [[15, 3], [15, 4]]]),
};
const CLASS_SLOT = ['L1', 'R1', 'L2', 'R2', 'L3', 'R3'];   // class i lives in this slot
const ART = {                                               // room pictures with floor corners in image px
  herbs: { src: 'assets/rooms/herbs.webp', L: [105, 653], R: [913, 655], F: [512, 905] },
  REC: { src: 'assets/rooms/reception.webp', L: [102, 667], R: [920, 650], F: [512, 900], rightH: 26 },   // right back side clipped to railing height
};
const GATE_TILE = { x: 14.5, y: 42.5 };

// region grid
const REG = Array.from({ length: GW }, () => Array(GH + 2).fill(null));
const inGrid = (x, y) => x >= 0 && y >= -1 && x < GW && y < GH;
const regAt = (x, y) => (inGrid(x, y) ? REG[x][y + 1] : null);
function fillRect(r, id) { for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) if (inGrid(x, y)) REG[x][y + 1] = id; }
HALLS.forEach((h) => fillRect(h, 'hall'));
Object.entries(SLOTS).forEach(([id, r]) => fillRect(r, id));
const DOORS = new Set();
Object.values(SLOTS).forEach((s) => { for (const [a, b] of [s.door, ...s.extra]) { DOORS.add(`${a[0]},${a[1]}|${b[0]},${b[1]}`); DOORS.add(`${b[0]},${b[1]}|${a[0]},${a[1]}`); } });
function canStep(ax, ay, bx, by) {
  const ra = regAt(ax, ay), rb = regAt(bx, by);
  if (!ra || !rb) return false;
  if (ra === rb) return true;
  return DOORS.has(`${ax},${ay}|${bx},${by}`);
}
function bfs(sx, sy, tx, ty) {
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  const key = (x, y) => x * 100 + y + 1;
  const prev = new Map([[key(sx, sy), null]]); const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k) || !canStep(x, y, nx, ny)) continue;
      prev.set(k, [x, y]); q.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const out = []; let cur = [tx, ty];
  while (cur) { out.push({ x: cur[0] + 0.5, y: cur[1] + 0.5 }); cur = prev.get(key(cur[0], cur[1])); }
  out.reverse(); out.shift();
  return out;
}
function pathTo(a, tx, ty) { const p = bfs(a.x, a.y, tx, ty); p.pop(); p.push({ x: tx, y: ty }); return p; }

const slotOf = (i) => SLOTS[CLASS_SLOT[i]];
function deskPos(i, d) { const s = slotOf(i); return { x: s.x0 + 2.0 + (d % 2) * 1.9, y: s.y0 + 2.5 + Math.floor(d / 2) * 1.15 }; }
const seatPos = (i, d) => { const p = deskPos(i, d); return { x: p.x, y: p.y - 0.45 }; };
const teacherPos = (i) => { const s = slotOf(i); return { x: s.x0 + 4.3, y: s.y0 + 1.0 }; };
const REC = SLOTS.REC;
const OFFICER = { x: REC.x0 + 0.9, y: REC.y0 + 4.4 };
const queueSlot = (k) => ({ x: REC.x0 + 3.0 + k * 0.7, y: REC.y0 + 4.6 });
function waitSpot(i, k) { const [, h] = slotOf(i).door; return { x: h[0] + 0.5 + (k % 2) * 0.6 - 0.3, y: h[1] + 0.5 + Math.floor(k / 2) * 0.6 }; }

// ======================= agents =======================
let agents = [];
let queue = [];
const deskOcc = CLASSES.map(() => Array(MAX_DESKS).fill(null));
const waitList = CLASSES.map(() => []);
let processing = null; let procT = 0;
let arrivalT = 1;

function walk(a, tx, ty, then) { a.path = pathTo(a, tx, ty); a.onArrive = then; if (!a.path.length && then) { a.onArrive = null; then(); } }
function spawn() {
  const a = { id: S.nextId++, sp: rnd(SPECIES), name: rnd(NAMES), x: GATE_TILE.x, y: GATE_TILE.y, z: 0,
    path: [], speed: 2.3 + Math.random() * 0.4, state: 'walk', onArrive: null, flip: false, t: 0, dur: 1, c: -1, desk: -1, ph: Math.random() * 6 };
  agents.push(a); queue.push(a); goQueue(a);
}
function goQueue(a) { const p = queueSlot(queue.indexOf(a)); a.goal = { t: 'q' }; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'queue'; }); }
function startNextProcess() {
  if (processing || !queue.length) return;
  const a = queue[0]; if (a.state !== 'queue') return;
  processing = a; procT = 0; a.state = 'process';
}
function finishProcess() {
  const a = processing; processing = null;
  queue.shift(); queue.forEach(goQueue);
  S.stats.enrolled++;
  earn(fee(), OFFICER.x + 1, OFFICER.y, '#c98a00');
  a.state = 'walk';
  route(a, nextClass(-1));
}
const MAX_WAIT = 6;                                   // students allowed to wait in the line of a class
// line of a class = waiting + already walking there
const lineCount = (i) => waitList[i].length + agents.reduce((n, a) => n + (a.goal && a.goal.t === 'c' && a.goal.i === i && (a.state === 'walk') ? 1 : 0), 0);
const classFull = (i) => i >= 0 && lineCount(i) >= MAX_WAIT;
// dorm: upset students sleep here until there is room in the line of their class
const DS = SLOTS.DORM;
const DORM_SPOTS = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) DORM_SPOTS.push({ x: DS.x0 + 2.4 + c * 1.35, y: DS.y0 + 1.3 + r * 1.6 });
// concierge: everybody checks in at her desk before going to bed
const CONCIERGE = { x: DS.x0 + 0.6, y: DS.y0 + 1.4 };
const CHECKIN_TIME = 2;
const dormLineSpot = (k) => ({ x: DS.x0 + 1.4, y: DS.y0 + 1.6 + k * 0.55 });
let dormLine = [], checkin = null, checkinT = 0;
const DORM_CAP = DORM_SPOTS.length;
const dorm = Array(DORM_CAP).fill(null);           // agent per bed
const dormFree = () => dorm.indexOf(null) >= 0;
function goDorm(a, i, bed = dorm.indexOf(null)) {   // bed is reserved now, the student queues at the concierge first
  dorm[bed] = a; a.bed = bed; a.goal = { t: 'd', i }; a.c = -1;
  dormLine.push(a); goDormLine(a);
}
function goDormLine(a) { const p = dormLineSpot(dormLine.indexOf(a)); a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'dline'; }); }
function toBed(a) { const p = DORM_SPOTS[a.bed]; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'sleep'; }); }
function stepConcierge(dt) {
  if (!checkin && dormLine.length && dormLine[0].state === 'dline') { checkin = dormLine[0]; checkinT = 0; checkin.state = 'checkin'; }
  if (!checkin) return;
  checkinT += dt;
  if (checkinT < CHECKIN_TIME) return;
  const a = checkin; checkin = null;
  dormLine.shift(); dormLine.forEach(goDormLine);
  popup('📝', a.x, a.y, '#7b5cd6', 44);
  toBed(a);
}
function leaveSchool(a) {   // no room anywhere: the student is upset and goes home
  S.stats.left = (S.stats.left || 0) + 1;
  popup('😢💔', a.x, a.y, '#c0436b', 44);
  a.c = -1; a.goal = { t: 'x' }; a.state = 'walk';
  walk(a, GATE_TILE.x, GATE_TILE.y + 1, () => { a.gone = true; });
}
function route(a, i) {   // send a student on to class i, or to the dorm when its line is full
  if (i < 0 || !classFull(i)) { goClass(a, i); return true; }
  if (!dormFree()) { leaveSchool(a); return false; }
  popup('😢', a.x, a.y, '#5b7fd6', 44);
  goDorm(a, i);
  return true;
}
function wakeSleepers() {
  for (let b = 0; b < DORM_CAP; b++) {
    const a = dorm[b]; if (!a || a.state !== 'sleep') continue;
    let i = a.goal.i; if (!isOpen(i)) i = nextClass(i - 1);
    if (i >= 0 && classFull(i)) continue;
    dorm[b] = null; a.bed = -1; popup('😊', a.x, a.y, '#2f9e7a', 44); goClass(a, i);
  }
}
function nextClass(i) { for (let k = i + 1; k < CLASSES.length; k++) if (isOpen(k)) return k; return -1; }
function goClass(a, i) {
  if (i < 0) { goGraduate(a); return; }
  const [, h] = slotOf(i).door;
  a.c = i; a.state = 'walk'; a.goal = { t: 'c', i };
  walk(a, h[0] + 0.5, h[1] + 0.5, () => arriveClass(a, i));
}
function arriveClass(a, i) {
  const d = freeDesk(i);
  if (d < 0) { waitList[i].push(a); const p = waitSpot(i, waitList[i].length - 1); a.state = 'walkwait'; walk(a, p.x, p.y, () => { a.state = 'wait'; }); return; }
  seat(a, i, d);
}
function freeDesk(i) { for (let d = 0; d < S.classes[i].desks; d++) if (!deskOcc[i][d]) return d; return -1; }
function seat(a, i, d) {
  const p = seatPos(i, d);
  deskOcc[i][d] = a.id; a.desk = d; a.c = i; a.state = 'walk'; a.goal = { t: 's', i, d };
  walk(a, p.x, p.y, () => { a.state = 'study'; a.t = 0; a.dur = lessonTime(i) * (a.prepared ? 0.5 : 1); a.flip = true; });
}
function finishLesson(a) {
  const i = a.c, p = deskPos(i, a.desk);
  const bonus = a.prepared ? 0.15 : 0; a.prepared = false;
  if (Math.random() < Math.min(0.99, success(i) + bonus)) { S.stats.passed++; earn(tuition(i), p.x, p.y, null, 46); leaveDesk(a); }
  else { S.stats.failed++; popup('💧 не сдал', p.x, p.y, '#5b7fd6', 46); if (libFree()) { freeDeskOf(a); goLibrary(a, i); } else { a.t = 0; a.dur = lessonTime(i); } }
}
// library: students who failed study here, then go back to their class for the exam again
const LS = SLOTS.LIB;
const LIB_SPOTS = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) LIB_SPOTS.push({ x: LS.x0 + 1.2 + c * 1.25, y: LS.y0 + 2.4 + r * 1.9 });
const LIB_TIME = 6;
const lib = Array(LIB_SPOTS.length).fill(null);
const libFree = () => lib.indexOf(null) >= 0;
function freeDeskOf(a) { const i = a.c; deskOcc[i][a.desk] = null; a.desk = -1; pullWaiting(i); }
function goLibrary(a, i, seatNo = lib.indexOf(null), t = 0) {
  lib[seatNo] = a; a.seat = seatNo; a.goal = { t: 'l', i }; a.c = -1; a.state = 'walk';
  const p = LIB_SPOTS[seatNo];
  walk(a, p.x, p.y, () => { a.state = 'read'; a.t = t; a.dur = LIB_TIME; a.flip = true; });
}
function finishReading(a) {
  lib[a.seat] = null; a.seat = -1; a.prepared = true;
  popup('💡', a.x, a.y, '#e0a100', 44);
  route(a, a.goal.i);
}
function leaveDesk(a) {
  const i = a.c;
  deskOcc[i][a.desk] = null; a.desk = -1; a.state = 'walk';
  route(a, nextClass(i));
  pullWaiting(i);
}
function pullWaiting(i) {
  while (waitList[i].length) { const d = freeDesk(i); if (d < 0) break; seat(waitList[i].shift(), i, d); }
  waitList[i].forEach((w, k) => { const p = waitSpot(i, k); w.state = 'walkwait'; walk(w, p.x, p.y, () => { w.state = 'wait'; }); });
}
function goGraduate(a) {
  const g = SLOTS.GARDEN;
  a.c = -1; a.state = 'walk'; a.goal = { t: 'g' };
  walk(a, g.x0 + 1 + Math.random() * 4, g.y0 + 1 + Math.random() * 4, () => {
    S.stats.graduated++;
    popup('🎓 ⭐+1', a.x, a.y, '#7b5cd6', 46);
    a.state = 'fly'; a.t = 0; a.vx = (Math.random() < 0.5 ? -1 : 1) * 0.6;
  });
}
function stepAgents(dt) {
  for (const a of agents) {
    a.ph += dt;
    if (a.state === 'fly') { a.t += dt; a.z += (40 + a.t * 60) * dt; a.x += a.vx * dt; a.y -= a.vx * dt; continue; }
    if (a.path.length) {
      const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy), stepLen = a.speed * dt;
      const sdx = dx - dy; if (Math.abs(sdx) > 0.01) a.flip = sdx < 0;
      if (dist <= stepLen) { a.x = p.x; a.y = p.y; a.path.shift(); if (!a.path.length && a.onArrive) { const f = a.onArrive; a.onArrive = null; f(); } }
      else { a.x += dx / dist * stepLen; a.y += dy / dist * stepLen; }
      continue;
    }
    if (a.state === 'study') { a.t += dt; if (a.t >= a.dur) finishLesson(a); }
    else if (a.state === 'done') leaveDesk(a);
    else if (a.state === 'read') { a.t += dt; if (a.t >= a.dur) finishReading(a); }
  }
  agents = agents.filter((a) => !(a.state === 'fly' && a.z > 400) && !a.gone);
}
function stepWorld(dt) {
  arrivalT -= dt;
  if (arrivalT <= 0) { arrivalT = arrivalInterval(); if (queue.length < 6) spawn(); }
  startNextProcess();
  if (processing) { procT = Math.min(procT + dt, procTime()); if (procT >= procTime()) finishProcess(); }
  stepConcierge(dt);
  wakeSleepers();
  S.classes.forEach((c, i) => { if (c.built && c.buildEnd && Date.now() >= c.buildEnd) { c.buildEnd = 0; toast(`✨ Построено: ${CLASSES[i].name}!`); dirtyPanel = true; staticKey = ''; } });
  stepAgents(dt);
  for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.t += dt; p.lift += 26 * dt; if (p.t > 1.3) popups.splice(i, 1); }
}

// ======================= rendering =======================
const canvas = $('#world'), ctx = canvas.getContext('2d');
const scroller = $('#view');
// world pixel bounds
let MINE = 1e9, MAXE = -1e9, MINS = 1e9, MAXS = -1e9;
for (let x = 0; x < GW; x++) for (let y = -1; y < GH; y++) if (regAt(x, y)) { MINE = Math.min(MINE, x - y - 1); MAXE = Math.max(MAXE, x - y + 1); MINS = Math.min(MINS, x + y); MAXS = Math.max(MAXS, x + y + 2); }
const OX = -MINE * HW + 10, OY = -MINS * HH + WALLH + 40;
const WW = (MAXE - MINE) * HW + 20, WH = (MAXS - MINS) * HH + WALLH + 80;
const P = (x, y) => ({ x: OX + (x - y) * HW, y: OY + (x + y) * HH });
let scale = 1, dpr = 1, viewW = 0, viewH = 0, zoom = 2.2, pinching = false;
const ZMIN = 0.9, ZMAX = 3.4;
const sprites = {};
for (const sp of SPECIES) { const im = new Image(); im.src = `assets/creatures/${sp}.png`; sprites[sp] = im; }
const arts = {};
for (const [k, a] of Object.entries(ART)) { const im = new Image(); im.onload = () => { staticKey = ''; }; im.src = a.src; arts[k] = im; }
const popups = [];
function popup(t, x, y, color, lift = 30) { popups.push({ text: t, x, y, color, t: 0, lift }); }

function resize() {
  const r = scroller.getBoundingClientRect();
  dpr = Math.min(3, window.devicePixelRatio || 1);
  viewW = r.width; viewH = r.height;
  viewW = r.width; viewH = r.height; zoom = Math.max(zoom, minZoom());
  scale = (r.width / WW) * zoom;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  $('#spacer').style.height = WH * scale + 'px'; $('#spacer').style.width = WW * scale + 'px';
  staticKey = '';
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function emoji(e, x, y, size, c = ctx) { c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y); }
function text(t, x, y, size, color, c = ctx, weight = 800) { c.font = `${weight} ${size}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(t, x, y); }
function poly(c, pts, fill, stroke) { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
const up = (p, h) => ({ x: p.x, y: p.y - h });

// ---- static layer (floors, rooms, walls) cached in an offscreen canvas ----
const stat = document.createElement('canvas'); const sctx = stat.getContext('2d');
let staticKey = '';
const statQ = () => Math.min(scale * dpr, Math.sqrt(12e6 / (WW * WH)));   // px per world unit, capped (iOS canvas limit)
function statKey() { return S.classes.map((c, i) => (c.built ? (isOpen(i) ? 'o' : 'b') : (S.classes.findIndex((q) => !q.built) === i ? 'n' : 'l'))).join('') + statQ().toFixed(2); }
function drawStatic() {
  const k = statKey(); if (k === staticKey || (pinching && stat.width)) return; staticKey = k;
  const q = statQ();
  stat.width = Math.round(WW * q); stat.height = Math.round(WH * q);
  const c = sctx; c.setTransform(q, 0, 0, q, 0, 0);
  c.fillStyle = '#a9d98f'; c.fillRect(0, 0, WW, WH);
  c.fillStyle = '#9fd184'; for (let i = 0; i < 260; i++) c.fillRect((i * 97) % WW, (i * 211) % WH, 3, 2);
  // halls
  for (let x = 0; x < GW; x++) for (let y = -1; y < GH; y++) {
    if (regAt(x, y) !== 'hall') continue;
    const inside = x >= BUILDING.x0 && x < BUILDING.x1 && y >= BUILDING.y0 && y < BUILDING.y1;
    const carpet = inside && x === 14 && y > BUILDING.y0;
    const col = carpet ? (y % 2 ? '#d98f97' : '#dd979f') : inside ? (x % 2 ? '#d7a46e' : '#dcab76') : ((x + y) % 2 ? '#e9dcc4' : '#efe4cf');
    poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], col, inside ? '#c08d58' : '#e3d3b6');
    if (carpet && y % 3 === 0) { const m = P(x + 0.5, y + 0.5); emoji('✦', m.x, m.y, 7, c); }
  }
  // gate
  // the gate is drawn in the depth-sorted list (drawGate)
  // rooms from back to front
  // rooms are drawn per frame, depth-sorted together with the creatures (see render)
}
function roomColors(id) {
  const ci = CLASS_SLOT.indexOf(id);
  if (ci >= 0) return { floor: CLASSES[ci].floor, wall: CLASSES[ci].wall };
  if (id === 'REC') return { floor: '#f3e4cf', wall: '#cdb6f0' };
  if (id === 'DORM') return { floor: '#efe0d2', wall: '#bcd3f2' };
  if (id === 'LIB') return { floor: '#e9dccb', wall: '#c9a27a' };
  return { floor: '#bfe6a6', wall: null };
}
function drawSlot(c, id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id);
  const L = P(s.x0, s.y1), B = P(s.x0, s.y0), R = P(s.x1, s.y0), F = P(s.x1, s.y1);
  const center = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2);
  if (id === 'GARDEN') {
    poly(c, [L, B, R, F], '#c3eaa9', '#ffffff');
    emoji('⛲', center.x, center.y - 8, 26, c); emoji('🌳', B.x, B.y + 16, 28, c); emoji('🌸', R.x - 22, R.y, 18, c); emoji('🌷', L.x + 24, L.y, 16, c);
    text('Сад выпускников', center.x, F.y + 10, 9, '#3f6e2e', c);
    return;
  }
  if (ci >= 0 && !S.classes[ci].built) { drawPlot(c, s, ci, L, B, R, F, center); return; }
  const col = roomColors(id);
  const artKey = ci >= 0 ? CLASSES[ci].id : id;
  const art = arts[artKey];
  if (art && art.complete && art.naturalWidth) {
    const A = ART[artKey];
    const u = [A.R[0] - A.L[0], A.R[1] - A.L[1]], v = [A.F[0] - A.L[0], A.F[1] - A.L[1]];
    const U = [R.x - L.x, R.y - L.y], V = [F.x - L.x, F.y - L.y];
    const det = u[0] * v[1] - u[1] * v[0];
    const ia = v[1] / det, ib = -u[1] / det, ic = -v[0] / det, id2 = u[0] / det;      // inverse of [u v]
    const m11 = U[0] * ia + V[0] * ib, m12 = U[0] * ic + V[0] * id2, m21 = U[1] * ia + V[1] * ib, m22 = U[1] * ic + V[1] * id2;
    const e = L.x - (m11 * A.L[0] + m12 * A.L[1]), f = L.y - (m21 * A.L[0] + m22 * A.L[1]);
    c.save();
    if (A.rightH) { poly(c, [{ x: L.x - 60, y: L.y + 40 }, { x: L.x - 60, y: B.y - 400 }, up(B, 400), up(B, A.rightH), up(R, A.rightH), { x: R.x + 60, y: R.y }, { x: R.x + 60, y: F.y + 60 }, { x: L.x - 60, y: F.y + 60 }]); c.clip(); }
    c.transform(m11, m21, m12, m22, e, f); c.drawImage(art, 0, 0); c.restore();
  } else {
    poly(c, [L, B, R, F], col.floor, '#00000012');
    c.strokeStyle = '#0000000d'; c.lineWidth = 1;
    for (let k = 1; k < ROOM; k++) { const a = P(s.x0 + k, s.y0), b = P(s.x0 + k, s.y1); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    const lh = s.cut.left ? 8 : WALLH * 0.7, rh = s.cut.right ? 8 : WALLH * 0.7;
    poly(c, [L, B, up(B, lh), up(L, lh)], shade(col.wall, -14));
    poly(c, [B, R, up(R, rh), up(B, rh)], col.wall);
    c.fillStyle = '#ffffff'; poly(c, [up(L, lh), up(B, lh), up(B, lh + 3), up(L, lh + 3)], '#fff'); poly(c, [up(B, rh), up(R, rh), up(R, rh + 3), up(B, rh + 3)], '#fff');
    if (ci >= 0 && !s.cut.right) { // chalkboard on the right wall
      const a = P(s.x0 + 2.2, s.y0), b = P(s.x0 + 4.6, s.y0);
      poly(c, [up(a, rh * 0.35), up(b, rh * 0.35), up(b, rh * 0.8), up(a, rh * 0.8)], '#3f5f4a', '#a77b4f');
    }
    if (id === 'REC') { const q = (x, y) => P(s.x0 + x, s.y0 + y); emoji('🪴', q(0.6, 0.6).x, q(0.6, 0.6).y - 8, 18, c); emoji('🪴', q(9.4, 7.4).x, q(9.4, 7.4).y - 8, 18, c); emoji('🗺️', q(0.2, 2).x, q(0.2, 2).y - 34, 16, c); poly(c, [q(4, 0.3), q(6, 0.3), q(6, 7.7), q(4, 7.7)], '#e9b8c9'); poly(c, [q(2.6, 3.9), q(9.5, 3.9), q(9.5, 5.1), q(2.6, 5.1)], '#c7b5ee88'); }
    if (id === 'LIB') { const q = (x, y) => P(s.x0 + x, s.y0 + y); [[0.5, 0.5], [2, 0.4], [3.5, 0.4], [5, 0.4]].forEach(([x, y]) => emoji('📚', q(x, y).x, q(x, y).y - 14, 20, c)); emoji('🕯️', q(5.5, 5.5).x, q(5.5, 5.5).y - 8, 14, c); LIB_SPOTS.forEach((p) => { const t = P(p.x, p.y + 0.55); emoji('📖', t.x, t.y - 4, 12, c); }); }
    if (id === 'DORM') { DORM_SPOTS.forEach((p) => { const q = P(p.x, p.y + 0.2); emoji('🛏️', q.x, q.y - 6, 22, c); }); emoji('🪴', B.x, B.y + 8, 16, c); }
  }
}
// outer stone walls of the building where no room supplies a wall: [x0, y0, x1, y1, height]
const OUTER_WALLS = [
  [7, 21, 7, 24, 1], [7, 12, 7, 15, 1], [7, 4, 7, 6, 1],          // left side, between the classes
  [7, 4, 10, 4, 0.35], [19, 4, 22, 4, 0.35],                       // back side next to the garden opening (low)
];
function wallSeg([x0, y0, x1, y1, k]) {
  const a = P(x0, y0), b = P(x1, y1), h = WALLH * 0.72 * k;
  poly(ctx, [a, b, up(b, h), up(a, h)], x0 === x1 ? '#b7a3cf' : '#cbb9e2', '#8f7aa8');
  poly(ctx, [up(a, h), up(b, h), up(b, h + 3), up(a, h + 3)], '#fff');
}
function drawGate(c) {
  const g = P(13, 41.5), g2 = P(16, 41.5);
  c.strokeStyle = '#6c4fd1'; c.lineWidth = 5; c.beginPath(); c.moveTo(g.x, g.y); c.lineTo(g.x, g.y - 34); c.lineTo(g2.x, g2.y - 34); c.lineTo(g2.x, g2.y); c.stroke();
  text('ВОРОТА', (g.x + g2.x) / 2, (g.y + g2.y) / 2 - 40, 9, '#5a3fb0', c);
}
function drawSign(c, id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id), B = P(s.x0, s.y0);
  if (id === 'GARDEN' || (ci >= 0 && !S.classes[ci].built)) return;
  const name = ci >= 0 ? CLASSES[ci].emoji + ' ' + CLASSES[ci].name : id === 'REC' ? '🛎️ Приёмная' : id === 'LIB' ? '📚 Библиотека' : '🛏️ Спальня';
  const sp = id === 'REC' ? P(s.x0 + 7.5, s.y0 + 7) : up(B, (s.cut.left && s.cut.right) ? 14 : WALLH * 0.72 + 12);
  c.font = '800 9px ui-rounded,"Nunito","Segoe UI",sans-serif'; const tw = c.measureText(name).width + 12;
  c.fillStyle = '#fffaf2ee'; c.beginPath(); c.roundRect(sp.x - tw / 2, sp.y - 8, tw, 16, 8); c.fill();
  text(name, sp.x, sp.y, 9, '#5d4a6e', c);
}
function drawPlot(c, s, ci, L, B, R, F, center) {
  const next = S.classes.findIndex((q) => !q.built) === ci;
  poly(c, [L, B, R, F], '#ecd2a8');
  c.setLineDash([6, 5]); c.lineWidth = 2; poly(c, [L, B, R, F], null, '#ffffffcc'); c.setLineDash([]);
  if (!next) { emoji('🔒', center.x, center.y, 18, c); return; }
  const C = CLASSES[ci];
  c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(center.x - 54, center.y - 26, 108, 48, 10); c.fill();
  c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
  text(C.emoji + ' ' + C.name, center.x, center.y - 11, 9.5, '#5d4a6e', c);
  text('🪙 ' + fmt(C.build), center.x, center.y + 8, 12, '#7b5cd6', c);
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, v + d)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

function drawCreature(a, x, y, h, extra) {
  const im = sprites[a.sp];
  const s = P(x, y);
  const walking = a.path && a.path.length > 0;
  const bob = walking ? Math.abs(Math.sin(a.ph * 9)) * 2 : Math.sin(a.ph * 2) * 0.6;
  const z = a.z || 0;
  ctx.fillStyle = '#00000026'; ctx.beginPath(); ctx.ellipse(s.x, s.y, h * 0.3, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(s.x, s.y - bob - z);
  if (a.flip) ctx.scale(-1, 1);
  if (im && im.complete && im.naturalWidth) { const w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -w / 2, -h, w, h); }
  else { ctx.fillStyle = '#ffd6e8'; ctx.beginPath(); ctx.ellipse(0, -h / 2, h / 2.6, h / 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  if (extra) extra(s.x, s.y - z);
}
function ring(x, y, frac, color = '#3fbf6f') {
  ctx.fillStyle = '#ffffffe6'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 4.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
}
function drawHat(x, y, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y, 10, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  emoji('⭐', x, y - 7, 6);
}
function drawDesk(p) {
  const a = P(p.x - 0.55, p.y - 0.25), b = P(p.x + 0.55, p.y - 0.25), cc = P(p.x + 0.55, p.y + 0.25), d = P(p.x - 0.55, p.y + 0.25);
  const h = 9;
  poly(ctx, [d, cc, up(cc, h), up(d, h)], '#9a6a41');
  poly(ctx, [cc, b, up(b, h), up(cc, h)], '#86592f');
  poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#c99a68', '#8a5f3a');
  const m = P(p.x, p.y); emoji('📖', m.x, m.y - h - 1, 8);
}
const staff = SPECIES.map((sp, k) => ({ sp, ph: k * 1.7, flip: false, path: [] }));
const officer = { sp: 'fernhorn', ph: 0.5, flip: false, path: [] };
const concierge = { sp: 'petalear', ph: 1.3, flip: false, path: [] };

function render() {
  drawStatic();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(stat, 0, 0, stat.width, stat.height, -scroller.scrollLeft * dpr, -scroller.scrollTop * dpr, WW * scale * dpr, WH * scale * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -scroller.scrollLeft * dpr, -scroller.scrollTop * dpr);

  const list = [];
  const zone = (x, y) => { const id = regAt(Math.floor(x), Math.floor(y)); if (id && id !== 'hall') { const s = SLOTS[id]; return (s.x0 + s.x1 + s.y0 + s.y1) / 2; } return x + y; };
  const add = (x, y, draw, bias = 0) => list.push({ k1: zone(x, y), k2: x + y + bias, draw });
  for (const id of Object.keys(SLOTS)) { const s = SLOTS[id]; list.push({ k1: (s.x0 + s.x1 + s.y0 + s.y1) / 2, k2: -1e9, draw: () => drawSlot(ctx, id) }); }
  list.push({ k1: 14.5 + 41.5, k2: 0, draw: () => drawGate(ctx) });
  for (const w of OUTER_WALLS) list.push({ k1: (w[0] + w[2] + w[1] + w[3]) / 2 - 0.5, k2: -1e9, draw: () => wallSeg(w) });
  for (let i = 0; i < CLASSES.length; i++) {
    const st = S.classes[i]; if (!st.built) continue;
    const s = slotOf(i);
    if (!isOpen(i)) {
      const c = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), left = Math.max(0, Math.ceil((st.buildEnd - Date.now()) / 1000));
      add((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, () => { emoji('🏗️', c.x, c.y - 14, 30); ctx.fillStyle = '#fffaf2ee'; rr(c.x - 40, c.y + 8, 80, 18, 9); ctx.fill(); text(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, c.x, c.y + 17, 11, '#5a3fb0'); });
      continue;
    }
    const tp = teacherPos(i);
    add(tp.x, tp.y, () => drawCreature(staff[(i + 1) % staff.length], tp.x, tp.y, 34, (x, y) => drawHat(x, y - 32, '#6c4fd1')));
    for (let d = 0; d < st.desks; d++) { const p = deskPos(i, d); add(p.x, p.y, () => drawDesk(p)); }
    CLASSES[i].items.forEach((it, k) => {
      if (!st.items[k]) return;
      const spots = [[s.x0 + 0.7, s.y0 + 0.7], [s.x0 + 5.3, s.y0 + 0.7], [s.x0 + 0.7, s.y0 + 5.2], [s.x0 + 5.3, s.y0 + 5.2]];
      const p = P(spots[k][0], spots[k][1]);
      add(spots[k][0], spots[k][1], () => emoji(it.emoji, p.x, p.y - 8, 14 + Math.min(8, st.items[k] / 3)));
    });
  }
  // reception desk + officer
  add(CONCIERGE.x, CONCIERGE.y, () => drawCreature(concierge, CONCIERGE.x, CONCIERGE.y, 34, (x, y) => {
    drawHat(x, y - 32, '#2f9e7a');
    if (checkin) ring(x + 18, y - 30, Math.min(1, checkinT / CHECKIN_TIME), '#2f9e7a');
  }));
  add(CONCIERGE.x + 0.75, CONCIERGE.y, () => {
    const a = P(DS.x0 + 1.1, DS.y0 + 0.8), b = P(DS.x0 + 1.6, DS.y0 + 0.8), cc = P(DS.x0 + 1.6, DS.y0 + 2.1), d = P(DS.x0 + 1.1, DS.y0 + 2.1), h = 11;
    poly(ctx, [d, cc, up(cc, h), up(d, h)], '#7d8fb8'); poly(ctx, [cc, b, up(b, h), up(cc, h)], '#6a7ca5'); poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#a9b9dd', '#5d6f98');
    const m = P(DS.x0 + 1.35, DS.y0 + 1.2); emoji('🗝️', m.x, m.y - 15, 10); const n = P(DS.x0 + 1.35, DS.y0 + 1.8); emoji('📒', n.x, n.y - 15, 10);
  });
  add(OFFICER.x, OFFICER.y, () => drawCreature(officer, OFFICER.x, OFFICER.y, 34, (x, y) => {
    drawHat(x, y - 32, '#d14f8f');
    if (processing) ring(x + 18, y - 30, Math.min(1, procT / procTime()), '#ff8a3d');
  }));
  if (!(arts.REC && arts.REC.naturalWidth)) add(OFFICER.x + 0.9, OFFICER.y, () => {
    const a = P(REC.x0 + 1.5, REC.y0 + 3.1), b = P(REC.x0 + 2.1, REC.y0 + 3.1), cc = P(REC.x0 + 2.1, REC.y0 + 5.9), d = P(REC.x0 + 1.5, REC.y0 + 5.9), h = 12;
    poly(ctx, [d, cc, up(cc, h), up(d, h)], '#9a6a41'); poly(ctx, [cc, b, up(b, h), up(cc, h)], '#86592f'); poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#c99a68', '#8a5f3a');
    const m = P(REC.x0 + 1.8, REC.y0 + 3.6); emoji('📜', m.x, m.y - 16, 11); const n = P(REC.x0 + 1.8, REC.y0 + 5.4); emoji('🔔', n.x, n.y - 16, 11);
  });
  for (const a of agents) {
    const draw = () => drawCreature(a, a.x, a.y, 30, (x, y) => {
      if (a.state === 'study' && !a.path.length) ring(x + 13, y - 32, Math.min(1, a.t / a.dur));
      if (a.state === 'fly') emoji('✨', x - 12, y - 6, 10);
      if (a.state === 'read') { emoji('📚', x - 12, y - 30, 11); ring(x + 13, y - 32, Math.min(1, a.t / a.dur), '#e0a100'); }
      if (a.state === 'sleep') emoji('💤', x + 12, y - 30 - Math.abs(Math.sin(a.ph * 1.5)) * 4, 11);
    });
    if (a.state === 'fly') list.push({ k1: 1e9, k2: 0, draw }); else add(a.x, a.y, draw);
  }
  list.sort((p, q) => p.k1 - q.k1 || p.k2 - q.k2).forEach((o) => o.draw());
  for (const id of Object.keys(SLOTS)) drawSign(ctx, id);
  for (const p of popups) { const s = P(p.x, p.y); ctx.globalAlpha = Math.max(0, 1 - p.t / 1.3); text(p.text, s.x, s.y - p.lift, 12, p.color); ctx.globalAlpha = 1; }
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
    <p class="muted">Всего поступило: ${S.stats.enrolled} · выпускников: ${S.stats.graduated} · ушли расстроенными: ${S.stats.left || 0}</p>`;
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

// ======================= pinch zoom =======================
const minZoom = () => Math.max(1, (viewH / WH) / (viewW / WW));
function setZoom(z, cx, cy, wx, wy) {   // keep world point (wx, wy) under client point (cx, cy) of the scroller
  zoom = Math.max(minZoom(), Math.min(ZMAX, z));
  scale = (viewW / WW) * zoom;
  $('#spacer').style.height = WH * scale + 'px'; $('#spacer').style.width = WW * scale + 'px';
  scroller.scrollLeft = wx * scale - cx; scroller.scrollTop = wy * scale - cy;
}
let pinch = null, pinchedAt = 0;
const tdist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
function tmid(t) { const r = scroller.getBoundingClientRect(); return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top }; }
scroller.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  const m = tmid(e.touches);
  pinch = { d0: tdist(e.touches), z0: zoom, wx: (scroller.scrollLeft + m.x) / scale, wy: (scroller.scrollTop + m.y) / scale };
  pinching = true;
}, { passive: false });
scroller.addEventListener('touchmove', (e) => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const m = tmid(e.touches);
  setZoom(pinch.z0 * tdist(e.touches) / pinch.d0, m.x, m.y, pinch.wx, pinch.wy);
}, { passive: false });
function endPinch(e) { if (pinch && e.touches.length < 2) { pinch = null; pinching = false; pinchedAt = Date.now(); staticKey = ''; } }
scroller.addEventListener('touchend', endPinch); scroller.addEventListener('touchcancel', endPinch);
document.addEventListener('gesturestart', (e) => e.preventDefault());
scroller.addEventListener('wheel', (e) => {   // desktop: Ctrl + wheel
  if (!e.ctrlKey) return; e.preventDefault();
  const r = scroller.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  setZoom(zoom * Math.exp(-e.deltaY * 0.002), cx, cy, (scroller.scrollLeft + cx) / scale, (scroller.scrollTop + cy) / scale);
}, { passive: false });

// ======================= input =======================
let down = null;
scroller.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop }; });
scroller.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) + Math.abs(scroller.scrollTop - down.st) + Math.abs(scroller.scrollLeft - down.sl);
  down = null; if (moved > 10 || pinching || Date.now() - pinchedAt < 300) return;
  const r = scroller.getBoundingClientRect();
  const wx = (e.clientX - r.left + scroller.scrollLeft) / scale, wy = (e.clientY - r.top + scroller.scrollTop) / scale;
  // inverse projection; try the floor point and points slightly lower (taps on walls / tall sprites)
  for (const lift of [0, 20, 40]) {
    const a = (wx - OX) / HW, b = (wy + lift - OY) / HH;
    const tx = Math.floor((a + b) / 2), ty = Math.floor((b - a) / 2);
    const id = regAt(tx, ty);
    if (!id || id === 'hall') continue;
    const ci = CLASS_SLOT.indexOf(id);
    if (ci >= 0) {
      if (S.classes[ci].built) openPanel(classPanel(ci));
      else if (S.classes.findIndex((c) => !c.built) === ci) openPanel(buildPanel(ci));
      else toast('Сначала построй предыдущий класс');
      return;
    }
    if (id === 'REC') { openPanel(receptionPanel); return; }
    if (id === 'GARDEN') { toast(`🎓 Выпускников: ${S.stats.graduated}`); return; }
    if (id === 'LIB') { toast(`📚 Библиотека: готовятся к пересдаче ${lib.filter(Boolean).length}/${lib.length}`); return; }
    if (id === 'DORM') { toast(`🛏️ Спальня: занято ${dorm.filter(Boolean).length}/${DORM_CAP}, у консьержки в очереди ${dormLine.length}. Ушли из школы: ${S.stats.left || 0}`); return; }
  }
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
const LAYOUT = 3;   // bump when the map changes: old creature positions are dropped
function restoreWorld() {
  if (S.layout !== LAYOUT) { S.layout = LAYOUT; S.world = null; }
  const w = S.world; if (!w) return;
  arrivalT = w.arrivalT ?? 1; procT = 0;
  const byId = new Map();
  for (const o of w.agents) {
    const a = { ...o, z: 0, path: [], onArrive: null, flip: false, ph: Math.random() * 6 };
    if (!regAt(Math.floor(a.x), Math.floor(a.y))) { a.x = GATE_TILE.x; a.y = GATE_TILE.y; }
    agents.push(a); byId.set(a.id, a);
  }
  for (const id of w.queue) { const a = byId.get(id); if (a) queue.push(a); }
  w.wait.forEach((l, i) => l.forEach((id) => { const a = byId.get(id); if (a && i < waitList.length) waitList[i].push(a); }));
  // older saves could hold huge crowds: keep the first few in each line
  const drop = new Set(); waitList.forEach((l) => { l.splice(MAX_WAIT).forEach((a) => drop.add(a)); });
  agents = agents.filter((a) => !drop.has(a));
  // desks first, so that nobody else takes a desk that is in use
  for (const a of agents) if ((a.state === 'study' || a.state === 'done') && a.desk >= 0 && a.c >= 0 && a.desk < S.classes[a.c].desks && !deskOcc[a.c][a.desk]) deskOcc[a.c][a.desk] = a.id; else if (a.state === 'study' || a.state === 'done') a.state = 'walk';
  for (const a of agents) {
    if ((a.state === 'study' || a.state === 'done') && deskOcc[a.c][a.desk] === a.id) continue;
    if (queue.includes(a)) { goQueue(a); continue; }
    const wi = waitList.findIndex((l) => l.includes(a));
    if (wi >= 0) continue;
    const g = a.goal || { t: 'c', i: nextClass(-1) };
    if (g.t === 'd') {
      const bed = (a.bed >= 0 && a.bed < DORM_CAP && !dorm[a.bed]) ? a.bed : dorm.indexOf(null);
      if (bed >= 0 && a.state === 'sleep') { dorm[bed] = a; a.bed = bed; const p = DORM_SPOTS[bed]; a.x = p.x; a.y = p.y; continue; }
      if (bed >= 0) { goDorm(a, g.i, bed); continue; }
    }
    if (g.t === 'l') { const n = (a.seat >= 0 && a.seat < lib.length && !lib[a.seat]) ? a.seat : lib.indexOf(null); if (n >= 0) { goLibrary(a, g.i, n, a.state === 'read' ? a.t : 0); continue; } a.prepared = true; route(a, g.i); continue; }
    if (g.t === 'x') { a.state = 'walk'; walk(a, GATE_TILE.x, GATE_TILE.y + 1, () => { a.gone = true; }); continue; }
    if (g.t === 's' && isOpen(g.i)) { const d = deskOcc[g.i][g.d] ? freeDesk(g.i) : g.d; if (d >= 0 && d < S.classes[g.i].desks) seat(a, g.i, d); else goClass(a, g.i); }
    else if (g.t === 'c' && isOpen(g.i)) goClass(a, g.i);
    else if (g.t === 'g') goGraduate(a);
    else goClass(a, nextClass(-1));
  }
  waitList.forEach((l, i) => { if (isOpen(i)) pullWaiting(i); });
}
function fastForward(sec) {   // live through the time the game was closed or in the background
  sec = Math.min(OFFLINE_CAP_SEC, sec);
  if (sec < 1) return 0;
  const before = S.coins;
  const stepDt = sec > 600 ? 0.5 : 0.25;
  for (let t = 0; t < sec; t += stepDt) stepWorld(stepDt);
  popups.length = 0; earnedThisSec = 0;
  $('#fx').innerHTML = '';
  return S.coins - before;
}
function welcomeBack(sec, gain) {
  if (sec < 60 || gain < 1) return;
  const mins = Math.round(Math.min(OFFLINE_CAP_SEC, sec) / 60);
  openPanel(() => `<div class="sh-head"><h2>С возвращением!</h2><button class="x" data-close>✕</button></div>
    <p class="center">Пока тебя не было ${mins >= 60 ? Math.floor(mins / 60) + ' ч ' : ''}${mins % 60} мин, школа жила своей жизнью.</p>
    <div class="center big-txt">🪙 +${fmt(gain)}</div><button class="btn wide" data-close>Ура!</button>`);
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (S) save(); return; }
  const away = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0; hiddenAt = 0;
  const gain = fastForward(away); welcomeBack(away, gain); last = performance.now(); save();
});
window.addEventListener('pagehide', () => { if (S) save(); });
window.addEventListener('resize', resize);

load();
if (location.hash.startsWith('#coins=')) { S.coins = +location.hash.slice(7) || S.coins; history.replaceState(null, '', location.pathname); } // test hook
resize();
{ const h = P(14, 31); scroller.scrollLeft = h.x * scale - scroller.clientWidth / 2; scroller.scrollTop = h.y * scale - scroller.clientHeight * 0.5; }
{ const away = (Date.now() - (S.last || Date.now())) / 1000; restoreWorld(); const gain = fastForward(away); welcomeBack(away, gain); }
updateHud();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
