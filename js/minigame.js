// Mini-game 1 «Зельеварка» (build 273+): match-3 of potion ingredients.
// Tester wish 2026-11-23 («мини-игры ... стандартные штуки типа три в ряд»), Maria's picks: match-3 of potions,
// a pill on the main screen, reward = coins (minutes of the school's income) + «Вдохновение», 3 charges (+1 per hour, shared by both worlds since build 425),
// playing without charges allowed (record only), weekly best kept for a later tournament of schools.
// Own module: game.js passes a small API (state, earn, save, toast, fmt, audio) and calls open(); the overlay is plain DOM + one canvas.

const N = 7;                      // board 7x7
const ROUND = 90;                 // seconds per round (the same for everybody: fair for a weekly tournament)
const CH_MAX = 6, CH_MS = 60 * 60000;   // build 516: 6 tries per world (her «минимум 4 ... лучше наверное 6»), still +1 per hour;   // +1 rewarded attempt per hour (was 20 min), one pool for both worlds (her «Очень много попыток, еще и двух мирах»)
const CH_KEY = 'magicschool.mgch';
const STAR = [2700, 4700, 7300];   // build 4xx: tiers raise scores ~1/3 (tools/mg_sim.mjs: random 3260, average 4470, good 6130, fast 7850); was 2000/3500/5500  // score for 1/2/3 stars (calibrated with tools/mg_sim.mjs)
const MAX_MIN = 10;               // the best round pays 10 minutes of the school's income
const BOOST = [0, 0, 5, 10];      // minutes of «Вдохновение» per stars
const BOOST_CAP_MIN = 60;         // same cap as gifts (BOOST_MAX_MIN in game.js)
import { runFlight, loadFlightArt } from './flight.js?v=5';   // bump when flight.js changes
import { runCart } from './cart.js?v=1';
import { runGem, loadGemArt } from './gem.js?v=1';
import { runTower, loadTowerArt } from './tower.js?v=2';
import { runFish, loadFishArt } from './fish.js?v=4';   // world 1: «Рыбалка»   // world 2: «Башня из руды»   // world 2: «Огранка самоцветов»   // world 2: «Вагонетка в штольне» (bump when cart.js changes)
const W2 = () => !!(A && A.world && A.world() === 2);
// the flight's words in world 2 (the cart uses the same shell, records and weekly table)
const cw = (t) => (W2() ? String(t).replace(/искорки \+1 очко/, 'руда +1 очко').replace(/искорки \+1/, 'руда +1').replace(/искорок/g, 'руды').replace(/золотые перья вдвое чаще/, 'каски вдвое чаще').replace(/защитой пера|защита пера/, 'с каской').replace(/огненный щит/, 'каска').replace(/щит и реже задевает тучки/, 'каска и реже задевает завалы').replace(/ветер не страшен/, 'видит в темноте').replace(/обычный полёт/, 'обычная поездка').replace(/Перо с собой/, 'Каска с собой').replace(/Магнит искорок/, 'Магнит руды') : t);
const CART_ICON = '<span style="font-size:34px;line-height:1">⛏️</span>';
const ART_V = 2;   // 2: pink crystal (her «два значка синего цвета, путаешь их»)

export const ING = [   // ingredient tiles; art: assets/minigame/ing_<i>.png (falls back to the emoji until the art exists)
  { e: '🌿', name: 'Мята', col: '#5cbf6a' },
  { e: '🍄', name: 'Гриб-светлячок', col: '#e0705a' },
  { e: '💎', name: 'Кристалл', col: '#ec5fa0' },   // pink since build 290 (blue crystal was confused with the dew drop)
  { e: '🪶', name: 'Перо феи', col: '#b78ae8' },
  { e: '💧', name: 'Роса', col: '#5a8ff0' },
  { e: '⭐', name: 'Звёздная пыль', col: '#f2c03a' },
];
const T = ING.length, RAINBOW = -1;
const POTIONS = ['Зелье смеха', 'Эликсир крылышек', 'Настой сладких снов', 'Зелье храбрости', 'Лунный отвар', 'Искристый эликсир', 'Зелье пушистости', 'Отвар звездопада', 'Чай вдохновения', 'Капли удачи'];

// boosters before a round: price in minutes of the school's income (min 100 coins); chosen on the start screen
const BOOSTS = [
  { id: 'time', name: '+15 секунд', min: 1, ico: () => '⏱️' },
  { id: 'star', name: 'Звёздочка на поле', min: 1.5, ico: () => ingImg(RAINBOW) },
  { id: 'x2', name: 'Зелья ×2 очков', min: 1.5, ico: () => FLASK },
];
const bsel = new Set();   // chosen boosters (cleared after every start since build audit 2026-11-24)
let emaSnap = 0;   // the school's income per second taken when the mini-game opens (her report: prices fell on every tap, the live average sags while the overlay is open)
const incomeNow = () => emaSnap || (A.rate ? A.rate() : st().ema) || 0;
const boostCost = (b) => Math.max(100, Math.round((incomeNow() * 60 * b.min) / 10) * 10);
const bTotal = () => BOOSTS.reduce((a, b) => a + (bsel.has(b.id) ? boostCost(b) : 0), 0);
export const weekKey = (t = Date.now()) => Math.floor((t / 86400000 + 3) / 7);   // weeks start on Monday 00:00 UTC

let A = null;   // API from game.js
const st = () => A.state();
function rollWeek(m) {   // a new week: last week's best is kept as pw/pm (weekly prizes and the winners list read it)
  const wk = weekKey();
  if (m.wk !== wk) {
    if (m.wk === wk - 1 && m.wb > 0) { m.pw = m.wk; m.pm = m.wb; } else if (m.pw !== wk - 1) { m.pw = 0; m.pm = 0; }
    m.wk = wk; m.wb = 0;
  }
  return m;
}
const g3 = () => { const m = mg(); m.g ||= { wk: weekKey(), wb: 0, best: 0, n: 0 }; return rollWeek(m.g); };   // the third game of the world (tower in world 2)
const fl = () => { const m = mg(); m.f ||= { wk: weekKey(), wb: 0, best: 0, n: 0 }; return rollWeek(m.f); };   // «Полёт через кольца» records
export const F_STAR = [80, 200, 400];   // score for 1/2/3 stars in the flight (8 / 20 / 40 rings); first guess, tune by her feedback
function mg() {
  const S = st();
  if (!S.mg) S.mg = { ch: CH_MAX, t: Date.now(), best: 0, wk: 0, wb: 0, n: 0, pot: 0 };
  const m = S.mg; rollWeek(m);
  return m;
}
const META_KEY = 'magicschool.meta';   // the world meta goes to the cloud with the saves: the pool lives there (build 426)
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; } };
function pool() {   // the shared pool {ch, t}; first time: the old device-local key (build 425), else this world's own count
  let p = readMeta()[PK()];
  if (W2() && (!p || typeof p.ch !== 'number')) p = { ch: CH_MAX, t: Date.now() };   // world 2 gets its own tries, a full pool to start
  if (!p || typeof p.ch !== 'number') { try { p = JSON.parse(localStorage.getItem(CH_KEY) || 'null'); } catch (e) { p = null; } }
  if (!p || typeof p.ch !== 'number') { const m = mg(); p = { ch: Math.min(CH_MAX, m.ch ?? CH_MAX), t: m.t || Date.now() }; }
  return p;
}
const PK = () => (W2() ? 'mgch2' : 'mgch');   // own tries per world (her «И попытки для каждого мира свои»)
const savePool = (p) => { try { const m = readMeta(); m[PK()] = { ch: p.ch, t: p.t }; localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* storage full */ } };
export function charges() {
  const p = pool(), now = Date.now();
  if (p.ch >= CH_MAX) { p.t = now; savePool(p); return p.ch; }
  const k = Math.floor((now - p.t) / CH_MS);
  if (k > 0) { p.ch = Math.min(CH_MAX, p.ch + k); p.t = p.ch >= CH_MAX ? now : p.t + k * CH_MS; }
  savePool(p); return p.ch;
}
export function addCharges(n = 1) { charges(); const p = pool(); p.ch = (p.ch || 0) + n; if (p.ch > CH_MAX) p.t = Date.now(); savePool(p); }   // won attempts go above 3
function spendCharge() { const p = pool(); if (p.ch >= CH_MAX) p.t = Date.now(); p.ch = Math.max(0, p.ch - 1); savePool(p); }
const nextIn = () => Math.max(0, pool().t + CH_MS - Date.now());
const num = (n) => Math.round(n).toLocaleString('ru-RU');   // scores in full: 5 600, not 5,6K
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ======================= sound (own tiny synth on the game's audio bus) =======================
let NOISE = null;
function noise(c) { if (NOISE && NOISE.sampleRate === c.sampleRate) return NOISE; const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (NOISE = b); }
function env(g, t0, a, d, v) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function tone(c, out, t0, f0, f1, dur, v, type = 'sine', a = 0.01) {
  const o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + a + dur);
  env(g, t0, a, dur, v); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + a + dur + 0.05);
}
function hiss(c, out, t0, dur, v, type, f0, f1, q = 1, a = 0.02) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise(c);
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + a + dur);
  env(g, t0, a, dur, v); s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random() * 0.5); s.stop(t0 + a + dur + 0.05);
}
const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
// every sound: (ctx, out, t, arg); levels (dB, SND_DB) measured with OfflineAudioContext (tools/mg_levels.html): peaks near -14 dB like the game's SFX
export const SND = {
  pop(c, o, t, k = 0) { const f = PENTA[Math.min(PENTA.length - 1, k)]; tone(c, o, t, f, f * 1.02, 0.28, 0.16, 'triangle', 0.004); tone(c, o, t + 0.03, f * 2, f * 2, 0.16, 0.04, 'sine', 0.004); hiss(c, o, t, 0.08, 0.05, 'bandpass', 2400, 1800, 1.5, 0.003); },
  nope(c, o, t) { tone(c, o, t, 330, 260, 0.16, 0.12, 'sine', 0.01); tone(c, o, t + 0.12, 300, 230, 0.2, 0.1, 'sine', 0.01); },
  special(c, o, t) { for (let k = 0; k < 8; k++) { const f = PENTA[2 + k]; tone(c, o, t + k * 0.045, f, f, 0.35, 0.07, 'triangle', 0.004); } hiss(c, o, t, 0.5, 0.08, 'highpass', 3000, 6000, 0.7, 0.02); },
  brew(c, o, t) { tone(c, o, t, 160, 70, 0.4, 0.3, 'sine', 0.01); hiss(c, o, t, 0.6, 0.2, 'lowpass', 1200, 200, 0.7, 0.01);
    for (let k = 0; k < 9; k++) tone(c, o, t + 0.25 + k * 0.09 + Math.random() * 0.03, 300 + Math.random() * 250, 700 + Math.random() * 300, 0.06, 0.08);
    [784, 988, 1175, 1568].forEach((f, k) => tone(c, o, t + 0.9 + k * 0.1, f, f, 0.7, 0.06, 'triangle', 0.005)); },
  boom(c, o, t) { tone(c, o, t, 180, 60, 0.45, 0.4, 'sine', 0.005); hiss(c, o, t, 0.5, 0.25, 'lowpass', 2000, 200, 0.7, 0.005);
    for (let k = 0; k < 10; k++) { const f = PENTA[3 + (k % 7)]; tone(c, o, t + 0.15 + k * 0.05, f, f * 1.01, 0.4, 0.06, 'triangle', 0.004); } },
  tick(c, o, t) { tone(c, o, t, 1200, 1150, 0.06, 0.06, 'sine', 0.003); },
  end(c, o, t) { [523, 659, 784, 1047].forEach((f, k) => tone(c, o, t + k * 0.14, f, f, 0.8, 0.08, 'triangle', 0.005)); for (let k = 0; k < 6; k++) { const f = PENTA[5 + (k % 5)]; tone(c, o, t + 0.7 + k * 0.12, f, f, 0.5, 0.03, 'sine', 0.01); } },
};
export const SND_DB = { boom: -8, pop: 0, nope: 0, special: 2, brew: -4.5, tick: 6, end: 5 };   // measured peaks then: pop -15.7, nope -18.8, special -14.8, brew -13.9, tick -18.5, end -14.7 dB
function snd(name, arg) {
  const a = A.audioOut && A.audioOut(); if (!a) return;
  try { const g = a.c.createGain(); g.gain.value = Math.pow(10, (SND_DB[name] || 0) / 20); g.connect(a.out); SND[name](a.c, g, a.c.currentTime + 0.01, arg); } catch (e) { /* never break the game for a sound */ }
}

// ======================= board logic (pure; also used by tools/mg_sim.mjs) =======================
let uid = 1;
export const LV_VAL = [0, 1, 2.5, 6];   // points weight of a tile by tier (also how many recipe units it gives: 1, 2, 3)
export const LV_RECIPE = [0, 1, 2, 3];
export function newTile(t, sp = null) { return { t, sp, id: uid++, x: 0, y: 0, vy: 0, die: 0, born: 0 }; }
export function makeBoard(rng = Math.random) {
  const g = [];
  for (let r = 0; r < N; r++) { g.push([]); for (let c = 0; c < N; c++) {
    let t; do { t = Math.floor(rng() * T); } while ((c >= 2 && g[r][c - 1].t === t && g[r][c - 2].t === t) || (r >= 2 && g[r - 1][c].t === t && g[r - 2][c].t === t));
    const tile = newTile(t); tile.x = c; tile.y = r; g[r].push(tile);
  } }
  if (!findMove(g)) return makeBoard(rng);
  return g;
}
// runs of 3+ -> groups (cells joined through shared cells) with the special they create
export function findGroups(g) {
  const runs = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N;) { const t = g[r][c] && g[r][c].t; let e = c + 1; while (e < N && t !== RAINBOW && g[r][e] && g[r][e].t === t) e++; if (t !== undefined && t !== RAINBOW && e - c >= 3) runs.push({ d: 'h', cells: Array.from({ length: e - c }, (_, k) => [r, c + k]) }); c = e; }
  for (let c = 0; c < N; c++) for (let r = 0; r < N;) { const t = g[r][c] && g[r][c].t; let e = r + 1; while (e < N && t !== RAINBOW && g[e][c] && g[e][c].t === t) e++; if (t !== undefined && t !== RAINBOW && e - r >= 3) runs.push({ d: 'v', cells: Array.from({ length: e - r }, (_, k) => [r + k, c]) }); r = e; }
  const groups = [];
  for (const run of runs) {
    const keys = new Set(run.cells.map(([r, c]) => r * N + c));
    const hit = groups.filter((gr) => [...keys].some((k) => gr.keys.has(k)));
    const ng = { keys, runs: [run] };
    for (const h of hit) { h.keys.forEach((k) => ng.keys.add(k)); ng.runs.push(...h.runs); groups.splice(groups.indexOf(h), 1); }
    groups.push(ng);
  }
  for (const gr of groups) {
    const maxLen = Math.max(...gr.runs.map((r) => r.cells.length)), dirs = new Set(gr.runs.map((r) => r.d));
    gr.make = maxLen >= 5 ? 'r' : dirs.size > 1 ? 'b' : maxLen === 4 ? gr.runs[0].d : null;   // 5 -> rainbow, L/T -> bomb, 4 -> line along the run
  }
  return groups;
}
function swapCells(g, a, b) { const t = g[a[0]][a[1]]; g[a[0]][a[1]] = g[b[0]][b[1]]; g[b[0]][b[1]] = t; }
const isSpecialSwap = (g, a, b) => { const x = g[a[0]][a[1]], y = g[b[0]][b[1]]; return x.t === RAINBOW || y.t === RAINBOW || (x.sp && y.sp); };
export function validSwap(g, a, b) {
  if (isSpecialSwap(g, a, b)) return true;
  swapCells(g, a, b); const ok = findGroups(g).length > 0; swapCells(g, a, b); return ok;
}
export function findMove(g) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (c + 1 < N && validSwap(g, [r, c], [r, c + 1])) return [[r, c], [r, c + 1]];
    if (r + 1 < N && validSwap(g, [r, c], [r + 1, c])) return [[r, c], [r + 1, c]];
  }
  return null;
}
export function allMoves(g) {
  const m = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (c + 1 < N && validSwap(g, [r, c], [r, c + 1])) m.push([[r, c], [r, c + 1]]);
    if (r + 1 < N && validSwap(g, [r, c], [r + 1, c])) m.push([[r, c], [r + 1, c]]);
  }
  return m;
}
// cells a special tile clears when it fires
function blast(g, r, c, tile, target) {
  const out = [];
  if (tile.sp === 'h') for (let k = 0; k < N; k++) out.push([r, k]);
  else if (tile.sp === 'v') for (let k = 0; k < N; k++) out.push([k, c]);
  else if (tile.sp === 'b') for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push([rr, cc]); }
  else if (tile.t === RAINBOW) {
    let t = target;
    if (t === undefined || t === RAINBOW) { const cnt = Array(T).fill(0); g.forEach((row) => row.forEach((x) => { if (x && x.t >= 0) cnt[x.t]++; })); t = cnt.indexOf(Math.max(...cnt)); }
    for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) if (g[rr][cc] && g[rr][cc].t === t) out.push([rr, cc]);
  }
  return out;
}
// one resolve step: returns {clear:[[r,c]..], make:[{r,c,t,sp}], fired:n} or null when nothing matches.
// swap = [a,b] of the move that started it (special combos and where new specials appear)
export function resolveStep(g, swap) {
  const clear = new Map(), make = [], queue = [], fx = []; let combo = null, ess = 0;   // fx: what to draw (beams, rings, lightning); combo: name of a special+special swap
  const add = (r, c, why) => { const k = r * N + c; if (clear.has(k) || !g[r][c]) return; clear.set(k, why); if (g[r][c].sp || g[r][c].t === RAINBOW) queue.push([r, c]); };
  if (swap && isSpecialSwap(g, swap[0], swap[1])) {
    const [a, b] = swap, x = g[a[0]][a[1]], y = g[b[0]][b[1]];
    if (x.t === RAINBOW && y.t === RAINBOW) { combo = 'rr'; fx.push({ k: 'rr', r: b[0], c: b[1] }); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) add(r, c, 's'); }
    else if (x.t === RAINBOW || y.t === RAINBOW) {
      const [rp, other] = x.t === RAINBOW ? [a, y] : [b, x];
      clear.set(rp[0] * N + rp[1], 's'); combo = other.sp ? 'r+' : 'r';
      const cells = blast(g, rp[0], rp[1], g[rp[0]][rp[1]], other.t); fx.push({ k: 'r', r: rp[0], c: rp[1], cells });
      for (const [r, c] of cells) { if (other.sp && g[r][c] && !g[r][c].sp && g[r][c].t >= 0) g[r][c].sp = other.sp === 'b' ? 'b' : Math.random() < 0.5 ? 'h' : 'v'; add(r, c, 's'); }
    } else {   // build 354 combos: line+line = cross, bomb+line = 3-wide cross, bomb+bomb = big 5x5 blast
      const [br, bc] = b, lines = [x.sp, y.sp].filter((k) => k === 'h' || k === 'v').length;
      clear.set(a[0] * N + a[1], 's'); clear.set(b[0] * N + b[1], 's');
      const cells = [];
      if (lines === 2) { combo = 'x'; for (let k = 0; k < N; k++) cells.push([br, k], [k, bc]); fx.push({ k: 'h', r: br, c: bc }, { k: 'v', r: br, c: bc }); }
      else if (lines === 1) { combo = 'x3'; for (let d = -1; d <= 1; d++) for (let k = 0; k < N; k++) { if (br + d >= 0 && br + d < N) cells.push([br + d, k]); if (bc + d >= 0 && bc + d < N) cells.push([k, bc + d]); } for (let d = -1; d <= 1; d++) fx.push({ k: 'h', r: br + d, c: bc, w: 1 }, { k: 'v', r: br, c: bc + d, w: 1 }); }
      else { combo = 'b5'; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = br + dr, cc = bc + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) cells.push([rr, cc]); } fx.push({ k: 'b', r: br, c: bc, big: 1 }); }
      for (const [r, c] of cells) add(r, c, 's');
    }
  } else {
    const groups = findGroups(g); if (!groups.length) return null;
    for (const gr of groups) {
      let spot = null;
      if (gr.make) {
        const pick = swap && [swap[1], swap[0]].find(([r, c]) => gr.keys.has(r * N + c));
        const ks = [...gr.keys]; const k = pick ? pick[0] * N + pick[1] : ks[Math.floor(ks.length / 2)];
        spot = [Math.floor(k / N), k % N];
        make.push({ r: spot[0], c: spot[1], t: gr.make === 'r' ? RAINBOW : g[spot[0]][spot[1]].t, sp: gr.make === 'r' ? null : gr.make });
      }
      else if (swap && gr.keys.size === 3) {   // a plain 3 made by the player's swap: the next tier appears on the swap cell
        const pick = [swap[1], swap[0]].find(([r, c]) => gr.keys.has(r * N + c));
        if (pick) {
          const lv = Math.max(...[...gr.keys].map((k) => g[Math.floor(k / N)][k % N].lv || 1));
          if (lv < 3) make.push({ r: pick[0], c: pick[1], t: g[pick[0]][pick[1]].t, sp: null, lv: lv + 1 });
          else ess++;   // three with a tier-3 ingredient: «Эссенция»
        }
      }
      for (const k of gr.keys) add(Math.floor(k / N), k % N, 'm');
    }
  }
  let fired = 0;
  while (queue.length) { const [r, c] = queue.shift(); const tile = g[r][c]; if (!tile) continue; fired++; const cells = blast(g, r, c, tile); fx.push({ k: tile.t === RAINBOW ? 'r' : tile.sp, r, c, cells }); for (const [rr, cc] of cells) add(rr, cc, 's'); }
  // a new special appears on its spot only if that spot was not blown by another special in the same step
  const made = make.filter((m) => clear.get(m.r * N + m.c) === 'm');
  const keys = [...clear.keys()], value = keys.reduce((a, k) => { const t = g[Math.floor(k / N)][k % N]; return a + (t ? LV_VAL[t.lv || 1] : 1); }, 0);
  return { clear: keys.map((k) => [Math.floor(k / N), k % N]), make: made, fired, fx, combo, value, ess, up: made.filter((m) => m.lv).map((m) => m.lv) };
}
export function points(value, chain, nMade, fired, ess = 0) { return Math.round(value * 10 * (1 + 0.5 * chain) + nMade * 30 + fired * 20 + ess * 150); }   // value = tiles weighted by tier

// ======================= the round =======================
let R = null;   // current round
let root = null, cv = null, cx = null, raf = 0, last = 0, imgs = [];
function loadArt() {
  imgs = ING.map((ing, i) => { const im = new Image(); im.src = `assets/minigame/ing_${i}.webp?v=${ART_V}`; im.onerror = () => { im.bad = true; }; return im; });
  imgs.caul = new Image(); imgs.caul.src = `assets/minigame/cauldron.webp?v=${ART_V}`; imgs.caul.onerror = () => { imgs.caul.bad = true; };
  imgs.rb = new Image(); imgs.rb.src = `assets/minigame/rainbow.webp?v=${ART_V}`; imgs.rb.onerror = () => { imgs.rb.bad = true; };
  for (const lv of [2, 3]) imgs['t' + lv] = ING.map((_, i) => { const im = new Image(); im.src = tierSrc(i, lv); im.onerror = () => { im.bad = true; }; return im; });   // tiers: own pictures (her «нужны буквально другие ингредиенты»)
}
const artOk = (im) => im && !im.bad && im.complete && im.naturalWidth;

function newRecipe(n) {
  const types = []; while (types.length < 3) { const t = Math.floor(Math.random() * T); if (!types.includes(t)) types.push(t); }
  const base = 8 + Math.min(8, n * 2);
  return { name: POTIONS[n % POTIONS.length], need: types.map((t, k) => ({ t, n: base - k * 2, got: 0 })) };
}

export function isOpen() { return !!root; }
export function weekBest() { const S = st(); if (!S || !S.mg) return 0; return mg().wb || 0; }
export function prevBest() { const S = st(); if (!S || !S.mg) return 0; const m = mg(); return m.pw === weekKey() - 1 ? m.pm || 0 : 0; }   // last week's best (0 if none)
export function prizeDue() { const S = st(); if (!S || !S.mg) return false; const m = mg(), w = weekKey() - 1; return m.pw === w && m.pm > 0 && m.claimed !== w && Date.now() - (w + 1) * 7 * 86400000 + 3 * 86400000 > 15 * 60000; }   // 15 min after the week ends: everyone had time to send the last scores   // for the weekly table in the top
export function pill() {
  const n = charges();
  return `<button class="ipill mg" data-mg aria-label="Мини-игра">🧪 ${n}</button>`;
}

function el(html) { const d = document.createElement('div'); d.innerHTML = A.emojiHtml(html.trim()); return d.firstChild; }
function css() {
  if (document.getElementById('mg-css')) return;
  const s = document.createElement('style'); s.id = 'mg-css';
  s.textContent = `
#mg { position: fixed; inset: 0; z-index: 18; display: flex; flex-direction: column; align-items: center; background: linear-gradient(#efe4ff, #ffe3f0 60%, #ffeede); color: #3a2f4a;
  padding: calc(var(--safe-t) + 8px) 10px calc(var(--safe-b) + 10px); font-family: ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif; user-select: none; -webkit-user-select: none; overflow: hidden; }
#mg .mg-top { width: 100%; max-width: 460px; display: flex; align-items: center; gap: 8px; }
#mg .mg-x { width: 40px; height: 40px; border-radius: 14px; background: #fffaffee; box-shadow: 0 3px 0 #c9b8ee; font: 800 18px inherit; color: #5a3fb0; }
#mg .mg-chip { background: #fffaffee; border: 2px solid #c9b8ee; border-radius: 16px; padding: 5px 11px; font: 800 15px ui-rounded, "Nunito", sans-serif; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
#mg .mg-chip.time.low { border-color: #ff8a3d; background: #fff1e4; animation: mgpulse .8s ease-in-out infinite; }
#mg .mg-chip.score { margin-left: auto; border-color: #e8b923; background: #fff8dc; color: #8a5a00; }
#mg .mg-rec { width: 100%; max-width: 460px; margin: 10px 0 8px; background: #fffaffd8; border-radius: 18px; padding: 8px 10px; box-shadow: 0 3px 10px #7b5cd61f; display: flex; align-items: center; gap: 8px; }
#mg .mg-pot { font-size: 30px; line-height: 1; }
#mg .mg-pot .em, #mg .mg-pot .mgi { width: 38px; height: 38px; }
#mg .mgi { width: 1.2em; height: 1.2em; vertical-align: -0.25em; }
#mg .mg-card .mg-pot .mgi { width: 64px; height: 64px; }
#mg .mg-rec b { display: block; font-size: 14px; }
#mg .mg-need { display: flex; gap: 6px; margin-top: 3px; }
#mg .mg-need span { display: flex; align-items: center; gap: 2px; font: 800 13px ui-rounded, "Nunito", sans-serif; background: #f3ecff; border-radius: 10px; padding: 2px 6px; }
#mg .mg-need span.ok { background: #dff5df; color: #2f7a3a; }
#mg .mg-need img { width: 20px; height: 20px; }
#mg .mg-brewed { margin-left: auto; text-align: center; font: 800 12px ui-rounded, "Nunito", sans-serif; color: #8a7ea0; }
#mg .mg-brewed b { font-size: 18px; color: #5a3fb0; }
#mg canvas { touch-action: none; border-radius: 20px; background: #fffaff99; box-shadow: 0 4px 16px #7b5cd626; }
#mg .mg-hint { margin-top: 8px; font: 700 13px ui-rounded, "Nunito", sans-serif; color: #8a7ea0; text-align: center; }
#mg .mg-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92vw, 400px); max-height: 88%; overflow-y: auto; background: #fff; border-radius: 26px; padding: 18px 18px 16px; box-shadow: 0 10px 40px #3a2f4a40; text-align: center; }
#mg .mg-card h2 { margin: 4px 0 6px; font-size: 22px; }
#mg .mg-card p { margin: 6px 0; font-size: 14.5px; line-height: 1.35; }
#mg .mg-card .muted { color: #8a7ea0; font-size: 13px; }
#mg .mg-ings { display: flex; justify-content: center; gap: 6px; margin: 8px 0; }
#mg .mg-ings img { width: 44px; height: 44px; }
#mg .mg-stars { font-size: 34px; letter-spacing: 4px; margin: 4px 0; }
#mg .mg-stars .off { filter: grayscale(1); opacity: .3; }
#mg .mg-stars img { width: 40px; height: 40px; }
#mg .mg-big { font: 900 34px ui-rounded, "Nunito", sans-serif; color: #5a3fb0; }
#mg .mg-prize { background: #fff8dc; border-radius: 16px; padding: 8px 10px; margin: 8px 0; font-weight: 700; }
#mg .btn { margin-top: 10px; }
#mg .mg-caul { flex: 1; min-height: 0; width: 100%; display: flex; align-items: center; justify-content: center; }
#mg .mg-caul-in { height: min(100%, 26vh); aspect-ratio: 1; display: flex; align-items: center; justify-content: center; animation: mgbob 2.4s ease-in-out infinite; }
#mg .mg-caul-in img { width: 100%; height: 100%; object-fit: contain; }
#mg .mg-caul-in .em { width: 70%; height: 70%; }
#mg .mg-caul-in.puff { animation: mgpuff .7s ease-out; }
#mg .mg-board-wrap { position: relative; }
#mg .mg-praise { position: absolute; left: 0; right: 0; top: 38%; text-align: center; pointer-events: none; font: 900 34px ui-rounded, "Nunito", system-ui, sans-serif;
  -webkit-text-stroke: 7px #fff; paint-order: stroke fill; text-shadow: 0 4px 14px #7b5cd655; animation: mgpraise 1.3s ease-out forwards; }
@keyframes mgpraise { 0% { transform: scale(.3) rotate(-8deg); opacity: 0; } 18% { transform: scale(1.18) rotate(3deg); opacity: 1; } 30% { transform: scale(1) rotate(0); } 80% { opacity: 1; } 100% { transform: translateY(-30px) scale(.95); opacity: 0; } }
#mg .mg-fly { position: fixed; z-index: 3; pointer-events: none; will-change: transform; }
#mg .mg-caul { position: relative; }
#mg .mg-caul-in.gulp { animation: mggulp .32s ease-out; }
@keyframes mggulp { 40% { transform: scale(1.07, .94); } }
#mg .mg-bubs { position: absolute; left: 50%; top: 50%; width: min(26vh, 100%); height: min(26vh, 100%); transform: translate(-50%, -50%); pointer-events: none; }
#mg .mg-bubs i { position: absolute; bottom: 62%; width: 9%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff, #ffb3d6 45%, #ff7fb8); opacity: 0; animation: mgbub 2.6s ease-in infinite; }
#mg .mg-bubs i:nth-child(1) { left: 36%; animation-delay: 0s; } #mg .mg-bubs i:nth-child(2) { left: 50%; animation-delay: .5s; width: 7%; }
#mg .mg-bubs i:nth-child(3) { left: 60%; animation-delay: 1.1s; } #mg .mg-bubs i:nth-child(4) { left: 43%; animation-delay: 1.6s; width: 6%; } #mg .mg-bubs i:nth-child(5) { left: 55%; animation-delay: 2.1s; width: 8%; }
@keyframes mgbub { 0% { transform: translateY(0) scale(.4); opacity: 0; } 15% { opacity: .95; } 80% { opacity: .8; } 100% { transform: translateY(-120%) scale(1.1); opacity: 0; } }
#mg .mg-bh { margin: 10px 0 6px; font-weight: 800; font-size: 14px; }
#mg .mg-boosts { display: flex; gap: 6px; }
#mg .mg-bst { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: 16px; background: #f6f0ff; border: 2px solid #e2d6f8; color: #4a3a6b; font: 700 12px ui-rounded, "Nunito", sans-serif; line-height: 1.15; }
#mg .mg-bst.on { background: #fff4c7; border-color: #e8b923; box-shadow: 0 0 0 3px #e8b92333; }
#mg .mg-bst .mg-bi { font-size: 24px; height: 30px; display: flex; align-items: center; }
#mg .mg-bst .mg-bi img { width: 30px; height: 30px; }
#mg .mg-bst .mg-bc { color: #8a5a00; font-weight: 800; }
#mg .mg-pick { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; margin: 8px 0; padding: 12px; border-radius: 18px; background: #f6f0ff; border: 2px solid #e2d6f8; color: #3a2f4a; font-size: 15px; }
#mg .mg-pick .mg-pi { width: 54px; height: 54px; flex: none; display: flex; align-items: center; justify-content: center; }
#mg .mg-pick .mg-pi img { max-width: 54px; max-height: 54px; width: auto; height: auto; }
#mg .fl-who { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-height: 150px; overflow-y: auto; }
#mg .fl-w { width: 82px; display: flex; flex-direction: column; align-items: center; padding: 6px 4px; border-radius: 14px; background: #f6f0ff; border: 2px solid #e2d6f8; font: 700 11px ui-rounded, "Nunito", sans-serif; color: #4a3a6b; }
#mg .fl-w.on { background: #fff4c7; border-color: #e8b923; }
#mg .fl-w img { width: 60px; height: 60px; object-fit: contain; }
#mg .fl-w small b { color: #8a5a00; }
#mg .fl-w small img { width: 11px; height: 11px; vertical-align: -1px; }   /* the coin emoji: the flyer picture rule made it 60 px */
#mg .fl-w small { font: 600 9.5px ui-rounded, "Nunito", sans-serif; color: #8a7ea0; line-height: 1.1; margin-top: 2px; }
#mg .fl-box { flex: 1; width: 100%; max-width: 520px; margin-top: 8px; border-radius: 20px; overflow: hidden; min-height: 0; }
#mg .fl-cv { display: block; touch-action: none; }
#mg .mg-ready { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #fbf6ffaa; border-radius: 20px; z-index: 2; }
#mg .mg-ready-in { padding: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#mg .mg-ready-in b { font-size: 19px; } #mg .mg-ready-in span { color: #8a7ea0; font-size: 13px; }
#mg .mg-ready-in .btn { font-size: 20px; padding: 14px 34px; box-shadow: 0 4px 0 var(--violet-d), 0 10px 26px #7b5cd655; }
@keyframes mgbob { 50% { transform: translateY(-4px) rotate(-1.5deg); } }
@keyframes mgpuff { 30% { transform: scale(1.18); filter: brightness(1.3); } }
@keyframes mgpulse { 50% { transform: scale(1.07); } }
.ipill.mg { border-color: #b98be8; background: #f6edff; color: #5a3fb0; }`;
  document.head.appendChild(s);
}

const ingImg = (t) => `<img class="mgi" src="assets/minigame/${t === RAINBOW ? 'rainbow' : 'ing_' + t}.webp?v=${ART_V}" alt="" draggable="false">`;   // SYNTX art (art/minigame/ingredients_r0.jpg)
const FLASK = `<img class="mgi flask" src="assets/minigame/flask.webp?v=${ART_V}" alt="" draggable="false">`;
function starsOf(score) { return score >= STAR[2] ? 3 : score >= STAR[1] ? 2 : score >= STAR[0] ? 1 : 0; }

export function open() {
  if (root) return;
  css(); if (!imgs.length) loadArt();
  root = el(`<div id="mg"></div>`); document.body.appendChild(root);
  root.addEventListener('click', onClick);
  emaSnap = (A.rate ? A.rate() : st().ema) || 0;   // build audit 2026-11-24: the steady rate: a reward right before no longer multiplies the next one   // prices and rewards use the income of the moment the mini-game was opened
  A.onOpen && A.onOpen();
  loadFlightArt(); if (W2()) { loadGemArt(); loadTowerArt(); } else loadFishArt();
  showChooser();
}
function showChooser() {   // the 🧪 pill: choose a mini-game (tries are shared)
  const n = charges(), m = mg(), f = fl();
  root.innerHTML = A.emojiHtml(`<div class="mg-card">
    <h2>Мини-игры</h2>
    <p><b>Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}</b>${n < CH_MAX ? `<br><span class="muted">следующая через ${mmss(nextIn())}</span>` : n > CH_MAX ? '<br><span class="muted">выигранные попытки сверх 3 тоже твои</span>' : ''}<br><span class="muted">общие для всех мини-игр этого мира</span></p>
    ${W2() ? `<button class="mg-pick" data-mgpick="gem"><span class="mg-pi">${sgImg('gem')}</span><span><b>Огранка самоцветов</b><br><span class="muted">режь камни, не трогай проклятые · рекорд недели ${num(m.wb || 0)}</span></span></button><button class="mg-pick" data-mgpick="tower"><span class="mg-pi">${sgImg('tower')}</span><span><b>Башня из руды</b><br><span class="muted">строй башню как можно выше · рекорд недели ${num(g3().wb || 0)}</span></span></button>` : `<button class="mg-pick" data-mgpick="p"><span class="mg-pi">${FLASK}</span><span><b>Зельеварка</b><br><span class="muted">три в ряд · рекорд недели ${num(m.wb || 0)}</span></span></button><button class="mg-pick" data-mgpick="fish"><span class="mg-pi">${sgImg('fish')}</span><span><b>Рыбалка</b><br><span class="muted">лови рыбу на лесном озере · рекорд недели ${num(g3().wb || 0)}</span></span></button>`}
    ${W2() ? `<button class="mg-pick" data-mgpick="f"><span class="mg-pi">${CART_ICON}</span><span><b>Вагонетка в штольне</b><br><span class="muted">мчись по рельсам до первого завала · рекорд недели ${num(f.wb || 0)}</span></span></button>` : `<button class="mg-pick" data-mgpick="f"><span class="mg-pi"><img src="assets/flight/ring.webp?v=2" alt=""></span><span><b>Полёт через кольца</b><br><span class="muted">лети до первой тучки · рекорд недели ${num(f.wb || 0)}</span></span></button>`}
    ${A.tester && A.tester() ? '<button class="btn wide ghost" data-mgtest>🧪 +20 попыток (тест, видно только тебе)</button>' : ''}
    <button class="btn wide ghost" data-mgback>В школу</button>
  </div>`);
}
function close() {
  if (R && R.live) finish(true);
  if (FL) { if (FL.live) flEnd(FL.h.state, true); FL.h.stop(); FL = null; }
  if (SGR) { if (SGR.live) sgEnd(SGR.h.state, true); SGR.h.stop(); SGR = null; }
  cancelAnimationFrame(raf); raf = 0; R = null;
  if (root) root.remove(); root = null; cv = null;
  A.onClose && A.onClose();
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.mgx !== undefined && SGR && SGR.live) { if (SGR.offer) { contSkip('s'); return; } SGR.noCont = true; SGR.h.crash(); return; }
  if (d.sgplay !== undefined) { startSimple(d.sgplay); return; }
  if (d.mgx !== undefined) { if (FL && FL.live) { if (FL.offer) { contSkip('f'); return; } FL.noCont = true; FL.h.crash(); return; } if (R && R.live) { R.noCont = true; R.offer = false; root.querySelectorAll('.mg-cont').forEach((x) => x.remove()); finish(false); } else close(); return; }
  if (d.mgcont !== undefined) { contTake(d.mgcont); return; }
  if (d.mgnocont !== undefined) { contSkip(d.mgnocont); return; }
  if (d.mgpick !== undefined) { if (SG[d.mgpick]) showSimpleStart(d.mgpick); else if (d.mgpick === 'f') showFlightStart(); else showStart(); return; }
  if (d.mgchoose !== undefined) { if (FL) { FL.h.stop(); FL = null; } if (SGR) { SGR.h.stop(); SGR = null; } showChooser(); return; }
  if (d.flwho !== undefined) { const w = A.flyers ? A.flyers() : []; if (w[+d.flwho]) { mg().fly = w[+d.flwho].k; showFlightStart(); } return; }
  if (d.flplay !== undefined) { startFlight(); return; }
  if (d.flb !== undefined) { const b = FBOOSTS[+d.flb]; if (!b) return; if (charges() <= 0) { A.toast('Бонусы — только для полёта с наградой'); return; }
    if (fsel.has(b.id)) fsel.delete(b.id); else if ((st().coins || 0) < fTotal() + boostCost(b)) { A.toast('🪙 Не хватает монет на этот бонус'); return; } else fsel.add(b.id);
    showFlightStart(); return; }
  if (d.mgplay !== undefined) { start(); return; }
  if (d.mggo !== undefined) { if (R && !R.go) { R.go = true; R.idleT = 0; const o = root.querySelector('.mg-ready'); if (o) o.remove(); snd('tick'); } return; }   // her «нужна кнопка старт перед началом игры»: the clock waits for it
  if (d.mgagain !== undefined) { showStart(); return; }   // «Ещё раз» goes through the start screen: boosters can be chosen again
  if (d.mgb !== undefined) { const b = BOOSTS[+d.mgb]; if (!b) return; if (charges() <= 0) { A.toast('Бонусы — только для игры с наградой'); return; }
    if (bsel.has(b.id)) bsel.delete(b.id); else if ((st().coins || 0) < bTotal() + boostCost(b)) { A.toast('🪙 Не хватает монет на этот бонус'); return; } else bsel.add(b.id);
    showStart(); return; }
  if (d.mgtest !== undefined && A.tester && A.tester()) { addCharges(20); A.toast('🧪 +20 попыток для теста'); showChooser(); return; }
  if (d.mgback !== undefined) { close(); return; }
}
function showStart() {
  const n = charges(), m = mg(), wk = weekKey();
  const best = m.wk === wk ? m.wb : 0;
  root.innerHTML = A.emojiHtml(`<div class="mg-card">
    <div class="mg-pot">${FLASK}</div><h2>Зельеварка</h2>
    <p>Меняй соседние ингредиенты местами и собирай <b>3 в ряд</b>. Собери ингредиенты рецепта — и сваришь зелье!</p>
    <div class="mg-ings">${ING.map((_, t) => ingImg(t)).join('')}</div>
    <p class="muted">4 в ряд — волшебная полоска, уголок — взрыв, 5 в ряд — ${ingImg(RAINBOW)} звёздочка: поменяй её с любым ингредиентом. Поменяй местами две особые фишки — будет сильное сочетание!</p>
    <p class="muted">Собери своим ходом ровно 3 — на месте хода появится предмет следующего уровня: мята → букетик → цветок мяты, гриб → семейка грибов → гриб-фонарик и так далее. Он даёт больше очков и больше для рецепта, а три с предметом 3-го уровня дают Эссенцию!</p>
    <p>Раунд — ${ROUND} секунд. Награда: монеты (до ${MAX_MIN} минут дохода школы), за 2–3 ⭐ ещё ✨ Вдохновение.</p>
    <p><b>Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}</b>${n < CH_MAX ? `<br><span class="muted">следующая через ${mmss(nextIn())}</span>` : ''}</p>
    <p class="muted">Рекорд недели: ${num(best)}${m.best ? ` · за всё время: ${num(m.best)}` : ''}</p>
    <div class="mg-bh">Бонусы на раунд <span class="muted">(за монеты школы)</span></div>
    <div class="mg-boosts">${BOOSTS.map((b, k) => `<button class="mg-bst${bsel.has(b.id) ? ' on' : ''}" data-mgb="${k}"><span class="mg-bi">${b.ico()}</span><span class="mg-bn">${cw(b.name)}</span><span class="mg-bc">🪙 ${A.fmt(boostCost(b))}</span></button>`).join('')}</div>
    ${n <= 0 ? '<p class="muted">Без награды бонусы не нужны: это тренировка, она бесплатная.</p>' : bsel.size ? `<p class="muted">Бонусы: 🪙 ${A.fmt(bTotal())} спишутся при старте, вернутся, если раунд не принесёт награды</p>` : ''}
    <button class="btn wide" data-mgplay>${n > 0 ? '▶️ Играть (1 попытка)' : '▶️ Играть без награды'}</button>
    <button class="btn wide ghost" data-mgchoose>← Другие мини-игры</button>
  </div>`);
}

function layout() {
  if (!cv) return;
  const top = root.querySelector('.mg-board-wrap').getBoundingClientRect();
  const availH = window.innerHeight - top.top - 130 - (parseFloat(getComputedStyle(root).paddingBottom) || 0);
  const side = Math.floor(Math.max(200, Math.min(window.innerWidth - 20, 440, availH)));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.style.width = cv.style.height = side + 'px'; cv.width = cv.height = Math.round(side * dpr);
  R.side = side; R.dpr = dpr; R.cell = side / N;
}

function start() {
  for (const id of [...bsel]) { const b = BOOSTS.find((x) => x.id === id); if (!b) bsel.delete(id); }
  const rewarded = charges() > 0;   // build audit 2026-11-24: bonuses only on rounds with a reward (they were charged for a record-only round)
  if (!rewarded) bsel.clear();
  const cost = bTotal(), S0 = st();
  if (cost && (S0.coins || 0) < cost) { bsel.clear(); A.toast('🪙 Не хватает монет на бонусы'); showStart(); return; }
  if (cost) { S0.coins -= cost; mg().bst = (mg().bst || 0) + bsel.size; }
  const boost = { time: bsel.has('time'), star: bsel.has('star'), x2: bsel.has('x2') };
  bsel.clear();   // chosen again for every round
  if (rewarded) spendCharge();
  A.save();   // the round is counted at its end, only with a score (start-and-quit was a free daily task)
  R = { live: true, rewarded, boost, g: makeBoard(), score: 0, shown: 0, left: ROUND + (boost.time ? 15 : 0), state: 'idle', anim: 0, chain: 0, sel: null, swap: null, idleT: 0, fx: [], texts: [], beams: [], shake: 0, brewed: 0, rec: null, lastTick: 0, busyT: 0 };
  R.rec = newRecipe(0); R.cost = cost;
  if (boost.star) { const r = 2 + Math.floor(Math.random() * 3), c = 1 + Math.floor(Math.random() * 5), t = newTile(RAINBOW); t.x = c; t.y = r; t.born = 0.001; R.g[r][c] = t; }   // a ready star in the middle of the board
  root.innerHTML = A.emojiHtml(`<div class="mg-top"><button class="mg-x" data-mgx aria-label="Закончить">✕</button><div class="mg-chip time">⏱️ <span class="mg-t"></span></div><div class="mg-chip score">✨ <span class="mg-s">0</span></div></div>
    <div class="mg-rec"></div>
    <div class="mg-board-wrap"><canvas></canvas><div class="mg-ready"><div class="mg-ready-in"><button class="btn" data-mggo>▶️ Старт!</button></div></div></div>
    <div class="mg-hint">Проведи пальцем по ингредиенту в сторону соседа</div>
    <div class="mg-caul"><div class="mg-caul-in">🫕</div><div class="mg-bubs"><i></i><i></i><i></i><i></i><i></i></div></div>`);
  { const c = root.querySelector('.mg-caul-in'), im = imgs.caul, put = () => { if (c.isConnected && artOk(im)) { c.innerHTML = ''; c.appendChild(im); } };
    if (artOk(im)) put(); else im.addEventListener('load', put, { once: true }); }   // the picture may still be loading on the first round
  cv = root.querySelector('canvas'); cx = cv.getContext('2d');
  layout(); recHtml(); hud();
  cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove); cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
  last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
function recHtml() {
  const r = R.rec, box = root.querySelector('.mg-rec'); if (!box) return;
  const h = `<div class="mg-pot">${FLASK}</div><div><b>${r.name}</b><div class="mg-need">${r.need.map((x) => `<span class="${x.got >= x.n ? 'ok' : ''}">${ingImg(x.t)} ${Math.min(x.got, x.n)}/${x.n}</span>`).join('')}</div></div><div class="mg-brewed">сварено${R.boost && R.boost.x2 ? ' ×2' : ''}<br><b>${R.brewed}</b></div>`;
  if (box.dataset.h !== h) { box.dataset.h = h; box.innerHTML = A.emojiHtml(h); }
}
function hud() {
  const t = root.querySelector('.mg-t'), s = root.querySelector('.mg-s'); if (!t) return;
  const sec = Math.max(0, Math.ceil(R.left));
  t.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  t.parentNode.classList.toggle('low', R.left <= 10);
  s.textContent = num(R.shown);
}

// ---- input ----
let ptr = null;
function cellAt(e) { const b = cv.getBoundingClientRect(); const c = Math.floor((e.clientX - b.left) / R.cell), r = Math.floor((e.clientY - b.top) / R.cell); return r >= 0 && r < N && c >= 0 && c < N ? [r, c] : null; }
function pDown(e) { if (!R || !R.go || R.state !== 'idle' || R.left <= 0) return; const p = cellAt(e); if (!p) return; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); ptr = { p, x: e.clientX, y: e.clientY, moved: false }; R.idleT = 0; }
function pMove(e) {
  if (!ptr || ptr.moved) return;
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < R.cell * 0.3) return;
  ptr.moved = true;
  const [r, c] = ptr.p, q = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
  R.sel = null;
  if (q[0] >= 0 && q[0] < N && q[1] >= 0 && q[1] < N) trySwap(ptr.p, q);
}
function pUp(e) {
  if (!ptr) return; const was = ptr; ptr = null;
  if (was.moved || !R || R.state !== 'idle') return;
  const p = cellAt(e); if (!p || p[0] !== was.p[0] || p[1] !== was.p[1]) return;
  if (R.sel && Math.abs(R.sel[0] - p[0]) + Math.abs(R.sel[1] - p[1]) === 1) { const a = R.sel; R.sel = null; trySwap(a, p); }
  else R.sel = R.sel && R.sel[0] === p[0] && R.sel[1] === p[1] ? null : p;
}
function trySwap(a, b) {
  if (R.state !== 'idle' || R.left <= 0) return;
  R.idleT = 0; R.hint = null;
  const ok = validSwap(R.g, a, b);
  swapCells(R.g, a, b);
  R.swap = [a, b]; R.state = ok ? 'swap' : 'swapback'; R.anim = 0;
  if (!ok) snd('nope');
}

// ---- step ----
function settle(dt) {   // tiles glide toward their cells; returns true when everything is in place
  let done = true;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = R.g[r][c]; if (!t) continue;
    if (t.y < r) { t.vy = Math.min(18, t.vy + 60 * dt); t.y = Math.min(r, t.y + t.vy * dt); done = false; }
    else if (t.y > r + 0.001) { t.y = Math.max(r, t.y - 9 * dt); done = false; }   // a swap upwards glides
    else { t.y = r; t.vy = 0; }
    if (Math.abs(t.x - c) > 0.001) { t.x += Math.sign(c - t.x) * Math.min(Math.abs(c - t.x), 9 * dt); done = false; } else t.x = c;
  }
  return done;
}
function doResolve() {
  const res = resolveStep(R.g, R.chain === 0 ? R.swap : null);
  if (!res) { R.chain = 0; R.swap = null; afterIdle(); return; }
  const nT = res.clear.length;
  const pts = points(res.value, R.chain, res.make.length, res.fired, res.ess);
  R.score += pts;
  let cxs = 0, cys = 0;
  for (const [r, c] of res.clear) {
    const t = R.g[r][c]; cxs += c; cys += r;
    if (t.t >= 0) for (const x of R.rec.need) if (x.t === t.t) x.got += LV_RECIPE[t.lv || 1];
    for (let k = 0, n = nT > 14 ? 2 : 4; k < n; k++) R.fx.push({ x: c + 0.5, y: r + 0.5, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.8) * 4, life: 0.6, t: 0, col: t.t >= 0 ? ING[t.t].col : '#f2c03a' });
    t.die = 0.001;
  }
  R.texts.push({ x: cxs / nT + 0.5, y: cys / nT + 0.5, s: `+${pts}`, t: 0, big: R.chain > 0 || res.fired > 0 });
  for (const f of res.fx) R.beams.push({ ...f, t: 0 });
  const big = res.combo || res.fx.some((f) => f.k === 'b' || f.k === 'r');
  if (big) R.shake = Math.max(R.shake, res.combo ? 0.35 : 0.2);
  const word = COMBO_WORD[res.combo] || (R.chain >= 4 ? 'Невероятно!' : R.chain === 3 ? 'Волшебно!' : R.chain === 2 ? 'Отлично!' : nT >= 10 ? 'Здорово!' : '');
  if (res.ess) { praise('Эссенция!', '#e0a400'); R.shake = Math.max(R.shake, 0.25); }
  else if (res.up && res.up.includes(3)) praise('Сияющий ингредиент!', '#e0a400');
  if (!res.ess && !(res.up && res.up.includes(3)) && word) praise(word, res.combo ? '#ff6fa5' : R.chain >= 3 ? '#7b5cd6' : '#e0a400');
  flyToCauldron(res.clear);
  snd(res.combo ? 'boom' : res.fired || res.make.length ? 'special' : 'pop', Math.min(9, R.chain * 2 + Math.floor(Math.random() * 2)));
  R.pending = res; R.state = 'clear'; R.anim = 0; R.chain++;
  // recipe
  if (R.rec.need.every((x) => x.got >= x.n)) {
    const bonus = (300 + 150 * R.brewed) * (R.boost && R.boost.x2 ? 2 : 1);
    R.score += bonus; R.brewed++; mg().pot = (mg().pot || 0) + 1;
    R.texts.push({ x: 3.5, y: 2.2, s: `${R.rec.name}! +${bonus}`, t: 0, big: true, col: '#7b5cd6', long: true });
    snd('brew');
    { const c = root.querySelector('.mg-caul-in'); if (c) { c.classList.remove('puff'); void c.offsetWidth; c.classList.add('puff'); } }
    R.rec = newRecipe(R.brewed);
  }
  recHtml();
}
const COMBO_WORD = { x: 'Крест!', x3: 'Супер-крест!', b5: 'Большой взрыв!', r: 'Звездопад!', 'r+': 'Звёздная буря!', rr: 'Волшебный вихрь!' };
function praise(text, col) {   // a big word over the board (chains and combos)
  const w = root && root.querySelector('.mg-board-wrap'); if (!w) return;
  w.querySelectorAll('.mg-praise').forEach((e) => e.remove());
  const d = document.createElement('div'); d.className = 'mg-praise'; d.textContent = text; d.style.color = col;
  w.appendChild(d); setTimeout(() => d.remove(), 1300);
}
function flyToCauldron(cells) {   // cleared recipe ingredients fly into the cauldron (at most 6 a step: phones stay smooth)
  const caul = root && root.querySelector('.mg-caul-in'); if (!caul || !cv || !caul.animate) return;
  const cb = cv.getBoundingClientRect(), kb = caul.getBoundingClientRect(); if (kb.height < 30) return;
  const want = new Set(R.rec.need.map((x) => x.t));
  const list = cells.filter(([r, c]) => R.g[r][c] && want.has(R.g[r][c].t)).slice(0, 6);
  const tx = kb.left + kb.width / 2, ty = kb.top + kb.height * 0.3, sz = R.cell * 0.7;
  list.forEach(([r, c], k) => {
    const t = R.g[r][c].t, x0 = cb.left + (c + 0.5) * R.cell, y0 = cb.top + (r + 0.5) * R.cell;
    const im = document.createElement('img'); im.className = 'mg-fly'; im.src = tierSrc(t, R.g[r][c].lv || 1); im.style.objectFit = 'contain';
    im.style.cssText = `left:${x0 - sz / 2}px;top:${y0 - sz / 2}px;width:${sz}px;height:${sz}px`;
    root.appendChild(im);
    const dx = tx - x0, dy = ty - y0, up = -60 - Math.random() * 50;
    const an = im.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.45}px,${dy * 0.35 + up}px) scale(0.85) rotate(${(Math.random() - 0.5) * 120}deg)`, opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(0.35) rotate(${(Math.random() - 0.5) * 300}deg)`, opacity: 0.9 }],
      { duration: 520 + k * 40, delay: 120, easing: 'cubic-bezier(.4,0,.7,1)', fill: 'forwards' });
    an.onfinish = () => { im.remove(); caul.classList.remove('gulp'); void caul.offsetWidth; caul.classList.add('gulp'); };
  });
}
function afterClear() {
  const { clear, make } = R.pending; R.pending = null;
  for (const [r, c] of clear) R.g[r][c] = null;
  for (const m of make) { const t = newTile(m.t, m.sp); if (m.lv) t.lv = m.lv; t.x = m.c; t.y = m.r; t.born = 0.001; R.g[m.r][m.c] = t; }
  // gravity
  for (let c = 0; c < N; c++) {
    let w = N - 1;
    for (let r = N - 1; r >= 0; r--) if (R.g[r][c]) { const t = R.g[r][c]; R.g[r][c] = null; R.g[w][c] = t; w--; }
    let k = 0;
    for (let r = w; r >= 0; r--) { const t = newTile(Math.floor(Math.random() * T)); t.x = c; t.y = -1 - k; k++; R.g[r][c] = t; }
  }
  R.state = 'fall';
}
function afterIdle() {
  R.state = 'idle'; R.idleT = 0;
  if (!findMove(R.g)) { R.texts.push({ x: 3.5, y: 3.5, s: 'Перемешиваю!', t: 0, big: true, col: '#7b5cd6' }); shuffle(); }
}
function shuffle() {
  R.hint = null;
  const fresh = makeBoard();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const old = R.g[r][c]; const t = fresh[r][c]; t.x = c; t.y = r - N - 1; if (old && old.sp && Math.random() < 0.5) t.sp = old.sp; R.g[r][c] = t; }
  R.state = 'fall';
}
function loop(now) {
  if (!R || !cv) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden && R.live && R.go) {
    R.left = Math.max(0, R.left - dt);
    if (R.left <= 5 && R.left > 0 && Math.ceil(R.left) !== R.lastTick) { R.lastTick = Math.ceil(R.left); snd('tick'); }
  }
  R.shown += (R.score - R.shown) * Math.min(1, dt * 8);
  if (R.state === 'swap' || R.state === 'swapback') {
    R.anim += dt / 0.14; settle(dt * 1.2);
    if (R.anim >= 1 && settle(0)) {
      if (R.state === 'swapback') { R.anim = 0; const [a, b] = R.swap; swapCells(R.g, a, b); R.swap = null; R.state = 'unswap'; }
      else { R.chain = 0; doResolve(); }
    }
  } else if (R.state === 'unswap') { if (settle(dt * 1.2)) R.state = 'idle'; }
  else if (R.state === 'clear') { R.anim += dt / 0.2; if (R.anim >= 1) afterClear(); }
  else if (R.state === 'fall') { if (settle(dt)) doResolve(); }
  else if (R.state === 'idle') {
    R.idleT += dt;
    if (R.go && R.idleT > 5 && !R.hint && R.left > 0) R.hint = findMove(R.g);
    if (R.left <= 0 && R.live && !R.offer) { if (!R.noCont && (R.cont || 0) < CONT_PRICE.length) { R.offer = true; snd('end'); contCard('p', R.cont || 0); } else finish(false); }
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = R.g[r] && R.g[r][c]; if (t && t.born) { t.born += dt / 0.25; if (t.born >= 1) t.born = 0; } }
  R.beams = R.beams.filter((b) => (b.t += dt) < 0.42); R.shake = Math.max(0, R.shake - dt);
  R.fx = R.fx.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 8 * dt; return p.t < p.life; });
  R.texts = R.texts.filter((p) => { p.t += dt; return p.t < (p.long ? 2.2 : 1.1); });
  draw(now / 1000);
  hud();
  raf = requestAnimationFrame(loop);
}

// ---- draw ----
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, r); }
const tierSrc = (t, lv) => (lv > 1 ? `assets/minigame/t${lv}_${t}.webp?v=${ART_V}` : `assets/minigame/ing_${t}.webp?v=${ART_V}`);
function drawIng(t, x, y, s, lv = 1) {
  const im = t === RAINBOW ? imgs.rb : lv > 1 && imgs['t' + lv] && artOk(imgs['t' + lv][t]) ? imgs['t' + lv][t] : imgs[t];
  if (artOk(im)) { const k = s * 0.9, r = im.naturalHeight / im.naturalWidth, w = r > 1 ? k / r : k, h = r > 1 ? k : k * r; cx.drawImage(im, x - w / 2, y - h / 2, w, h); return; }   // tier pictures keep their own proportions
  const e = A.emojiImage(ingImg(t));
  if (e) { cx.drawImage(e, x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84); return; }
  cx.font = `${Math.round(s * 0.7)}px system-ui`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(ingImg(t), x, y);
}
function draw(time) {
  const d = R.dpr, C = R.cell * d, W = cv.width;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, W);
  if (R.shake > 0) { const k = R.shake * 18 * d; cx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { cx.fillStyle = (r + c) % 2 ? '#f6eeffcc' : '#fff9f2cc'; rr(c * C + 2 * d, r * C + 2 * d, C - 4 * d, C - 4 * d, 10 * d); cx.fill(); }
  if (R.sel) { const [r, c] = R.sel; cx.strokeStyle = '#7b5cd6'; cx.lineWidth = 3 * d; rr(c * C + 3 * d, r * C + 3 * d, C - 6 * d, C - 6 * d, 10 * d); cx.stroke(); }
  cx.save(); cx.beginPath(); cx.rect(0, 0, W, W); cx.clip();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = R.g[r][c]; if (!t) continue;
    let x = (t.x + 0.5) * C, y = (t.y + 0.5) * C, s = C * 0.92;
    if (R.hint && R.hint.some(([hr, hc]) => hr === r && hc === c)) { const k = Math.sin(time * 9) * 0.06 * C; if (R.hint[0][0] === R.hint[1][0]) x += k * (c === R.hint[0][1] ? 1 : -1); else y += k * (r === R.hint[0][0] ? 1 : -1); }
    if (t.die) s *= Math.max(0, 1 - R.anim);
    if (t.born) s *= 0.6 + 0.4 * t.born + Math.sin(t.born * Math.PI) * 0.25;
    if (s <= 1) continue;
    if (t.sp || t.t === RAINBOW) {   // a soft glow under special tiles
      const g = cx.createRadialGradient(x, y, s * 0.1, x, y, s * 0.62); g.addColorStop(0, t.t === RAINBOW ? '#fff6b0' : '#ffffffee'); g.addColorStop(1, '#ffffff00');
      cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, s * 0.62, 0, 7); cx.fill();
    }
    if (t.lv > 1 && !t.sp) {   // tier aura: silver for tier 2, gold with rays for tier 3
      const g3 = t.lv === 3, pulse = 1 + 0.05 * Math.sin(time * 4 + t.id);
      const g = cx.createRadialGradient(x, y, s * 0.15, x, y, s * 0.66 * pulse); g.addColorStop(0, g3 ? '#fff3b0bb' : '#ffffffaa'); g.addColorStop(0.7, g3 ? '#ffd76a55' : '#e6dcff44'); g.addColorStop(1, '#ffffff00');
      cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, s * 0.66 * pulse, 0, 7); cx.fill();
      s *= t.lv === 3 ? 1.06 : 1.03;
    }
    drawIng(t.t, x, y, s, t.sp ? 1 : t.lv || 1);
    if (t.sp === 'h' || t.sp === 'v') {
      cx.save(); cx.translate(x, y); if (t.sp === 'v') cx.rotate(Math.PI / 2);
      const w = s * 0.46, ph = (time * 2) % 1;
      cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.shadowColor = '#b98be8'; cx.shadowBlur = 6 * d;
      for (const [col, lw] of [['#7b5cd6', 6], ['#ffffff', 3]]) { cx.strokeStyle = col; cx.lineWidth = lw * d;   // violet edge + white core: readable on light tiles
        for (const sg of [-1, 1]) { cx.beginPath(); cx.moveTo(sg * w * 0.35, -s * 0.1); cx.lineTo(sg * w * (0.78 + 0.15 * ph), 0); cx.lineTo(sg * w * 0.35, s * 0.1); cx.stroke(); } }
      cx.restore();
    } else if (t.sp === 'b') {
      cx.save(); cx.strokeStyle = '#f2c03a'; cx.lineWidth = 3 * d; cx.shadowColor = '#ffb000'; cx.shadowBlur = 8 * d;
      cx.beginPath(); cx.arc(x, y, s * (0.44 + 0.04 * Math.sin(time * 6)), 0, 7); cx.stroke(); cx.restore();
    }
  }
  cx.restore();
  drawBeams(C, d);
  for (const p of R.fx) { cx.globalAlpha = 1 - p.t / p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x * C, p.y * C, (3 + 3 * (1 - p.t / p.life)) * d, 0, 7); cx.fill(); }
  cx.globalAlpha = 1;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  for (const p of R.texts) {
    const L = p.long ? 2.2 : 1.1, a = Math.min(1, (L - p.t) * 3);
    cx.globalAlpha = a; cx.font = `900 ${Math.round((p.big ? 22 : 16) * d)}px ui-rounded, "Nunito", system-ui, sans-serif`;
    const y = (p.y - p.t * 0.6) * C, x = Math.max(80 * d, Math.min(W - 80 * d, p.x * C));
    cx.lineWidth = 5 * d; cx.strokeStyle = '#ffffff'; cx.strokeText(p.s, x, y); cx.fillStyle = p.col || '#8a5a00'; cx.fillText(p.s, x, y);
  }
  cx.globalAlpha = 1;
}

function drawBeams(C, d) {   // light of the specials: a beam along a row / column, a ring for a blast, lightning from the star
  cx.save();   // normal blending: 'lighter' vanished on the light board
  for (const b of R.beams) {
    const u = b.t / 0.42, a = 1 - u, x = (b.c + 0.5) * C, y = (b.r + 0.5) * C, W = N * C;
    if (b.k === 'h' || b.k === 'v') {
      const th = C * (b.w ? 0.55 : 0.8) * (0.4 + 0.6 * a), g = b.k === 'h' ? cx.createLinearGradient(0, y - th / 2, 0, y + th / 2) : cx.createLinearGradient(x - th / 2, 0, x + th / 2, 0);
      g.addColorStop(0, 'rgba(150,100,250,0)'); g.addColorStop(0.3, `rgba(150,100,250,${0.55 * a})`); g.addColorStop(0.5, `rgba(255,250,255,${0.95 * a})`); g.addColorStop(0.7, `rgba(150,100,250,${0.55 * a})`); g.addColorStop(1, 'rgba(150,100,250,0)');
      cx.fillStyle = g; if (b.k === 'h') cx.fillRect(0, y - th / 2, W, th); else cx.fillRect(x - th / 2, 0, th, W);
    } else if (b.k === 'b') {
      const rad = C * (b.big ? 2.8 : 1.7) * (0.3 + 0.9 * u);
      const g = cx.createRadialGradient(x, y, rad * 0.2, x, y, rad); g.addColorStop(0, `rgba(255,236,150,${0.9 * a})`); g.addColorStop(0.7, `rgba(255,170,60,${0.5 * a})`); g.addColorStop(1, 'rgba(255,170,60,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, rad, 0, 7); cx.fill();
    } else if (b.k === 'r' || b.k === 'rr') {
      cx.strokeStyle = `rgba(255,240,180,${a})`; cx.lineWidth = 3 * d; cx.shadowColor = '#ffd76a'; cx.shadowBlur = 10 * d;
      for (const [r, c] of (b.cells || [])) { const x2 = (c + 0.5) * C, y2 = (r + 0.5) * C; cx.beginPath(); cx.moveTo(x, y); cx.lineTo((x + x2) / 2 + (Math.random() - 0.5) * C * 0.5, (y + y2) / 2 + (Math.random() - 0.5) * C * 0.5); cx.lineTo(x2, y2); cx.stroke(); }
      if (b.k === 'rr') { const g = cx.createRadialGradient(x, y, 0, x, y, W * u + C); g.addColorStop(0, `rgba(255,250,220,${a})`); g.addColorStop(1, 'rgba(255,200,255,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, W); }
    }
  }
  cx.restore();
}

// ======================= «Полёт через кольца» shell =======================
let FL = null;   // { live, rewarded, h (runFlight handle) }
// powers of the looks (her pick «У каждого летуна своя сила»): higher ranks and Masters fly better, a reason to collect the album
function powerOf(k) {
  const [, rk, el] = String(k || '').split(':');
  if (+rk === 5) return [{ shield: true, spark: 1, txt: 'огненный щит и искорки +1' }, { magnet: 0.55, txt: 'большой магнит для искорок' }, { shield: true, slim: true, txt: 'щит и реже задевает тучки' }, { windImmune: true, magnet: 0.14, txt: 'ветер не страшен и магнит' }][+el] || { shield: true, txt: 'защита пера' };
  return [{ txt: 'обычный полёт' }, { spark: 1, txt: 'искорки +1 очко' }, { magnet: 0.3, txt: 'магнит для искорок' }, { featherK: 2, txt: 'золотые перья вдвое чаще' }, { shield: true, txt: 'начинает с защитой пера' }][+rk] || { txt: 'обычный полёт' };
}
// boosters before a flight (her pick «Бонусы перед полётом»), same prices as in «Зельеварка»
const FBOOSTS = [
  { id: 'shield', name: 'Перо с собой', min: 1, ico: () => W2() ? '<span style="font-size:26px">⛑️</span>' : '<img class="mgi" src="assets/flight/feather.webp?v=2" alt="" style="width:28px;height:28px">' },
  { id: 'magnet', name: 'Магнит искорок', min: 1, ico: () => W2() ? '<span style="font-size:26px">🧲</span>' : '<img class="mgi" src="assets/flight/spark.webp?v=2" alt="" style="width:28px;height:28px">' },
  { id: 'slow', name: 'Тихий старт', min: 1, ico: () => '⏳' },
];
const fsel = new Set();
const fTotal = () => FBOOSTS.reduce((a, b) => a + (fsel.has(b.id) ? boostCost(b) : 0), 0);
// a flyer with a power costs coins for every flight (her «раз бафы у летунов они должны быть тоже платные»): Новичок free,
// ranks 1-2 half a minute of income, ranks 3-4 one minute, Masters one and a half (min 100 coins, like the boosters)
const flyerMin = (k) => { const rk = +String(k || '').split(':')[1] || 0; return rk === 5 ? 1.5 : rk >= 3 ? 1 : rk >= 1 ? 0.5 : 0; };
const flyerCost = (k) => (flyerMin(k) ? boostCost({ min: flyerMin(k) }) : 0);
function flyerList() { return (A.flyers && A.flyers()) || []; }
function showFlightStart() {
  if (FL) { FL.h.stop(); FL = null; }
  const n = charges(), f = fl(), w = flyerList(), cur = w.find((x) => x.k === mg().fly) || w[0];
  root.innerHTML = A.emojiHtml(`<div class="mg-card">
    ${W2() ? `<div class="mg-pot">${CART_ICON}</div><h2>Вагонетка в штольне</h2>
    <p>Ученик мчится в вагонетке по трём рельсам в глубь горы. Нажми выше вагонетки — она перескочит на верхний рельс, ниже — на нижний (можно и смахнуть вверх-вниз). Объезжай завалы и провалы: первый — конец поездки.</p>
    <p class="muted">Руда +2, самоцвет +10, каждый проеханный завал +5. Каска спасает от одного удара. В тёмных местах светит только фонарик, а вагонетка всё время разгоняется!</p>
    <div class="mg-bh">Кто едет</div>` : `<div class="mg-pot"><img class="mgi" src="assets/flight/ring.webp?v=2" alt="" style="width:44px;height:70px"></div><h2>Полёт через кольца</h2>
    <p>Нажми и держи палец — ученик взлетает, отпусти — плавно опускается. Пролетай сквозь кольца, собирай искорки и не задевай тучки: первая тучка — конец полёта.</p>
    <p class="muted">Кольцо +10, точно по центру ещё +5, искорка +2, радужное кольцо — вдвое больше. Золотое перо спасает от одной тучки. Берегись ветра и тучек, которые плавают вверх-вниз!</p>
    <div class="mg-bh">Кто летит</div>`}
    <div class="fl-who">${w.map((x, k) => `<button class="fl-w${cur && x.k === cur.k ? ' on' : ''}" data-flwho="${k}"><img src="${x.src}" alt=""><span>${x.name}</span><small>${cw(powerOf(x.k).txt)}<br><b>${flyerCost(x.k) ? '🪙 ' + A.fmt(flyerCost(x.k)) : 'бесплатно'}</b></small></button>`).join('') || '<p class="muted">Пока некому лететь</p>'}</div>
    ${cur ? `<p class="muted" style="margin-top:6px">Сила: <b>${cw(powerOf(cur.k).txt)}</b> · ${flyerCost(cur.k) ? `🪙 ${A.fmt(flyerCost(cur.k))} за ${W2() ? 'поездку' : 'полёт'}` : 'бесплатно'}</p>` : ''}
    <div class="mg-bh">Бонусы на ${W2() ? 'поездку' : 'полёт'} <span class="muted">(за монеты школы)</span></div>
    <div class="mg-boosts">${FBOOSTS.map((b, k) => `<button class="mg-bst${fsel.has(b.id) ? ' on' : ''}" data-flb="${k}"><span class="mg-bi">${b.ico()}</span><span class="mg-bn">${cw(b.name)}</span><span class="mg-bc">🪙 ${A.fmt(boostCost(b))}</span></button>`).join('')}</div>
    ${n <= 0 ? '<p class="muted">Полёт без награды — тренировка: бесплатно, бонусы и сила летуна не действуют.</p>' : fTotal() + (cur ? flyerCost(cur.k) : 0) ? `<p class="muted">При старте спишется: 🪙 ${A.fmt(fTotal() + (cur ? flyerCost(cur.k) : 0))} (вернётся, если полёт не принесёт награды)</p>` : ''}
    <p><b>Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}</b>${n < CH_MAX ? `<br><span class="muted">следующая через ${mmss(nextIn())}</span>` : ''}</p>
    <p class="muted">Награда: монеты (до ${MAX_MIN} минут дохода школы), за 2–3 ⭐ ещё ✨ Вдохновение. Рекорд недели: ${num(f.wb || 0)}${f.best ? ` · за всё время: ${num(f.best)}` : ''}</p>
    <button class="btn wide" data-flplay${cur ? '' : ' disabled'}>${W2() ? (n > 0 ? '▶️ Поехать (1 попытка)' : '▶️ Поехать без награды') : n > 0 ? '▶️ Лететь (1 попытка)' : '▶️ Лететь без награды'}</button>
    <button class="btn wide ghost" data-mgchoose>← Другие мини-игры</button>
  </div>`);
}
function startFlight() {
  const w = flyerList(), cur = w.find((x) => x.k === mg().fly) || w[0]; if (!cur) return;
  const rewarded = charges() > 0;   // build audit 2026-11-24: bonuses and the flyer's power cost coins only on flights with a reward
  if (!rewarded) fsel.clear();
  const cost = rewarded ? fTotal() + flyerCost(cur.k) : 0, S0 = st();
  if (cost && (S0.coins || 0) < cost) { fsel.clear(); A.toast(flyerCost(cur.k) > (S0.coins || 0) ? '🪙 Не хватает монет на этого летуна — выбери Новичка' : '🪙 Не хватает монет на бонусы'); showFlightStart(); return; }
  if (cost) { S0.coins -= cost; fl().bst = (fl().bst || 0) + fsel.size; }
  const boost = { shield: fsel.has('shield'), magnet: fsel.has('magnet'), slow: fsel.has('slow') };
  fsel.clear();   // chosen again for every flight
  if (rewarded) spendCharge();
  A.save();
  root.innerHTML = A.emojiHtml(`<div class="mg-top"><button class="mg-x" data-mgx aria-label="Закончить">✕</button><div class="mg-chip">${W2() ? '⛏️' : '<img class="mgi" src="assets/flight/ring.webp?v=2" alt="" style="width:14px;height:22px">'} <span class="fl-r">0</span></div><div class="mg-chip score">✨ <span class="fl-s">0</span></div></div>
    <div class="fl-box"></div>`);
  const box = root.querySelector('.fl-box');
  FL = { live: true, rewarded, cost, h: null };
  FL.h = (W2() ? runCart : runFlight)(box, { img: cur.src, faceLeft: !!cur.faceLeft, snd, power: rewarded ? powerOf(cur.k) : powerOf(''), boost,
    onScore: (sc, rings) => { const a = root.querySelector('.fl-s'), b = root.querySelector('.fl-r'); if (a) a.textContent = num(sc); if (b) b.textContent = rings; },
    onEnd: (res) => flEnd(res, false) });
}
function flEnd(res, silent) {
  if (!FL || !FL.live) return;
  if (!silent && !FL.noCont && !FL.offer && (FL.cont || 0) < CONT_PRICE.length) { FL.offer = true; FL.res = res; snd('end'); contCard('f', FL.cont || 0); return; }   // continue for moonstones first
  if (FL.offer) { FL.offer = false; root.querySelectorAll('.mg-cont').forEach((x) => x.remove()); }
  FL.live = false;
  const S = st(), f = fl(), score = res.score || 0, stars = score >= F_STAR[2] ? 3 : score >= F_STAR[1] ? 2 : score >= F_STAR[0] ? 1 : 0;
  const recW = score > (f.wb || 0), recAll = score > (f.best || 0);
  f.wb = Math.max(f.wb || 0, score); f.best = Math.max(f.best || 0, score);
  let coins = 0, boost = 0, refund = 0;
  if (FL.rewarded && score > 0) {
    const min = Math.min(MAX_MIN, MAX_MIN * score / F_STAR[2]);
    coins = Math.max(10, Math.round(Math.max(min * 60 * incomeNow(), min * 30) / 10) * 10);
    A.earn(coins);
    boost = BOOST[stars];
    if (boost) { const now = Date.now(); S.boostEnd = Math.min(now + BOOST_CAP_MIN * 60000, Math.max(now, S.boostEnd || 0) + boost * 60000); }
  } else if (FL.cost) { S.coins += FL.cost; refund = FL.cost; }   // build audit 2026-11-24: nothing won, the bonuses come back
  if (FL.rewarded && score <= 0) addCharges(1);   // quit at once: the try comes back
  if (score > 0) f.n = (f.n || 0) + 1;   // only real flights count (daily task, alliance goal)
  A.save();
  A.onFinish && A.onFinish(score, stars, 'flight');
  if (silent) return;
  snd('end');
  const n = charges();
  root.appendChild(el(`<div class="mg-card">
    <h2>${W2() ? (score >= F_STAR[0] ? 'Отличная поездка!' : 'Ой, завал!') : score >= F_STAR[0] ? 'Отличный полёт!' : 'Ой, тучка!'}</h2>
    <div class="mg-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">⭐</span>`).join('')}</div>
    <div class="mg-big">${num(score)}</div>
    <p class="muted">${W2() ? `руды: ${res.rings || 0} · самоцветов: ${res.sparks || 0}` : `колец: ${res.rings || 0} · искорок: ${res.sparks || 0}`}${recW ? ' · 🏅 рекорд недели!' : ''}${recAll && !recW ? ' · 🏅 рекорд!' : ''}</p>
    ${FL.rewarded ? `<div class="mg-prize">Награда: 🪙 ${A.fmt(coins)}${boost ? `<br>✨ Вдохновение +${boost} мин (уроки +10%)` : ''}</div>` : `<p class="muted">${W2() ? 'Поездка' : 'Полёт'} без награды — только рекорд.</p>`}${refund ? `<p class="muted">Бонусы вернулись: 🪙 ${A.fmt(refund)}</p>` : ''}
    <p class="muted">${stars < 3 ? `До ${stars + 1} ⭐ — ${num(F_STAR[stars])} очков. ` : ''}Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}${n < CH_MAX ? `, следующая через ${mmss(nextIn())}` : ''}</p>
    <button class="btn wide" data-mgpick="f">${W2() ? (n > 0 ? '🔁 Ещё поездка (1 попытка)' : '🔁 Ещё поездка без награды') : n > 0 ? '🔁 Ещё полёт (1 попытка)' : '🔁 Ещё полёт без награды'}</button>
    <button class="btn wide ghost" data-mgback>В школу</button>
  </div>`));
}
export function gBest() { const S = st(); if (!S || !S.mg) return 0; return g3().wb || 0; }
export function gPrev() { const S = st(); if (!S || !S.mg) return 0; const g = g3(); return g.pw === weekKey() - 1 ? g.pm || 0 : 0; }
export function gPrizeDue() { const S = st(); if (!S || !S.mg) return false; const g = g3(), w = weekKey() - 1; return g.pw === w && g.pm > 0 && g.claimed !== w && Date.now() - (w + 1) * 7 * 86400000 + 3 * 86400000 > 15 * 60000; }
export function flightBest() { const S = st(); if (!S || !S.mg) return 0; return fl().wb || 0; }
export function flightPrev() { const S = st(); if (!S || !S.mg) return 0; const f = fl(); return f.pw === weekKey() - 1 ? f.pm || 0 : 0; }
export function flightPrizeDue() { const S = st(); if (!S || !S.mg) return false; const f = fl(), w = weekKey() - 1; return f.pw === w && f.pm > 0 && f.claimed !== w && Date.now() - (w + 1) * 7 * 86400000 + 3 * 86400000 > 15 * 60000; }

// ---- continue after a lost round (moonstones): 🔮2, then 🔮4, at most twice a round
const CONT_PRICE = [2, 4], CONT_SEC = 20;
const stoneImg = (h = 18) => `<img src="assets/ui/moonstone.webp?v=1" alt="" style="height:${h}px;width:auto;vertical-align:-${Math.round(h * 0.2)}px">`;
function contCard(kind, k) {   // kind 'p' potions / 'f' flight; k = continues used this round
  const price = CONT_PRICE[k], have = A.stones ? A.stones() : 0, ok = have >= price;
  root.appendChild(el(`<div class="mg-card mg-cont">
    <h2>${kind === 'p' ? 'Время вышло!' : kind === 's' ? SG[SGR.id].lost : W2() ? 'Ой, завал!' : 'Ой, тучка!'}</h2>
    <p style="margin:4px 0 10px">${kind === 'p' ? `Продолжить с этого места? Доска и очки останутся, добавится ${CONT_SEC} секунд.` : kind === 's' ? 'Продолжить с этого места? Очки останутся.' : (W2() ? 'Продолжить поездку с этого места? Очки и руда останутся.' : 'Продолжить полёт с этого места? Очки и кольца останутся.')}</p>
    <button class="btn wide hot" data-mgcont="${kind}" ${ok ? '' : 'disabled'}>${kind === 'p' ? `⏳ +${CONT_SEC} секунд` : kind === 's' ? SG[SGR.id].cont : W2() ? '⛏️ Ехать дальше' : '🪶 Лететь дальше'} за ${stoneImg(18)} ${price}</button>
    <p class="muted" style="margin:6px 0">${ok ? `У тебя ${stoneImg(14)} ${have}` : `Нужно ${stoneImg(14)} ${price}, у тебя ${have}`}</p>
    <button class="btn wide ghost" data-mgnocont="${kind}">Закончить</button>
  </div>`));
}
function contTake(kind) {
  const R0 = kind === 'p' ? R : kind === 's' ? SGR : FL; if (!R0 || !R0.offer) return;
  const price = CONT_PRICE[R0.cont || 0];
  if (!A.stones || A.stones() < price) return;
  A.spendStones(price); R0.cont = (R0.cont || 0) + 1; R0.offer = false; A.save();
  root.querySelectorAll('.mg-cont').forEach((x) => x.remove());
  if (kind === 'p') { R.left = CONT_SEC; R.lastTick = 0; R.idleT = 0; }
  else if (kind === 's') SGR.h.revive();
  else FL.h.revive();
}
function contSkip(kind) {
  const R0 = kind === 'p' ? R : kind === 's' ? SGR : FL; if (!R0) return;
  R0.offer = false; R0.noCont = true; root.querySelectorAll('.mg-cont').forEach((x) => x.remove());
  if (kind === 'p') finish(false); else if (kind === 's') sgEnd(SGR.res || SGR.h.state, false); else flEnd(FL.res || FL.h.state, false);
}

// ---- simple games: one shell for the newer mini-games (start card, tries, reward, records, continue for moonstones) ----
// world 2: «Огранка самоцветов» keeps its records in mg() (the potion slot: the weekly table «mg» of world 2 is now this game)
const SG = {
  gem: { title: 'Огранка самоцветов', icon: '💎', stars: [150, 400, 800], run: runGem, rec: () => mg(),
    desc: 'Из шахты вылетают камни — проводи по ним пальцем, чтобы разрезать. Из каждого выпадает самоцвет. Камень, который упал обратно целым, отнимает жизнь (их три). Чёрный проклятый камень резать нельзя!',
    more: 'Камень +10, золотая жеода +30, три и больше камней одним взмахом — серия и бонус. Камни летят всё чаще.',
    res: (r) => `самоцветов: ${r.rings || 0} · жеод: ${r.sparks || 0}`, lost: 'Ой, проклятый камень!', win: 'Отличная огранка!', go: 'Резать', more1: 'Ещё огранка', cont: '💎 Ещё жизнь' },
  fish: { title: 'Рыбалка', icon: '🎣', stars: [40, 100, 180], run: runFish, rec: () => g3(),
    desc: 'Нажми — закинешь удочку. Когда поплавок нырнёт и появится «Клюёт!», сразу нажми, чтобы подсечь. Потом держи палец — тянешь рыбу, отпусти — леска ослабнет. Держи натяжение в зелёной зоне: слишком сильно — леска лопнет, слишком слабо — рыба уйдёт.',
    more: 'Голубая рыбка +10, карп +20, волшебная рыба +40, золотая рыбка +80, а иногда попадается старый ботинок. Раунд — 60 секунд.',
    res: (r) => `рыб: ${r.rings || 0} · редких: ${r.sparks || 0}`, lost: 'Время вышло!', win: 'Отличный улов!', go: 'Рыбачить', more1: 'Ещё рыбалка', cont: '⏳ +15 секунд' },
  tower: { title: 'Башня из руды', icon: '🏗️', stars: [120, 300, 550], run: runTower, rec: () => g3(),
    desc: 'Кран раскачивает глыбу руды. Нажми — и она упадёт на башню. Что свисает за край, отваливается, и следующая глыба становится уже. Промахнёшься мимо башни — конец.',
    more: 'Каждый этаж +10. Точно в край — «Идеально!» и бонус, три идеальных подряд возвращают ширину. Каждый десятый этаж — кристальный, +20. Кран раскачивается всё быстрее.',
    res: (r) => `этажей: ${r.rings || 0} · идеальных: ${r.sparks || 0}`, lost: 'Глыба упала!', win: 'Отличная башня!', go: 'Строить', more1: 'Ещё башня', cont: '🏗️ Строить дальше' },
};
let SGR = null;   // { id, live, rewarded, h, cont, offer, noCont, res }
const sgImg = (id) => `<span style="font-size:34px;line-height:1">${SG[id].icon}</span>`;
function showSimpleStart(id) {
  if (SGR) { SGR.h.stop(); SGR = null; }
  const g = SG[id], n = charges(), m = g.rec();
  root.innerHTML = A.emojiHtml(`<div class="mg-card">
    <div class="mg-pot">${sgImg(id)}</div><h2>${g.title}</h2><p>${g.desc}</p><p class="muted">${g.more}</p>
    <p><b>Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}</b>${n < CH_MAX ? `<br><span class="muted">следующая через ${mmss(nextIn())}</span>` : ''}</p>
    <p class="muted">Награда: монеты (до ${MAX_MIN} минут дохода школы), за 2–3 ⭐ ещё ✨ Вдохновение. Рекорд недели: ${num(m.wb || 0)}${m.best ? ` · за всё время: ${num(m.best)}` : ''}</p>
    <button class="btn wide" data-sgplay="${id}">${n > 0 ? `▶️ ${g.go} (1 попытка)` : `▶️ ${g.go} без награды`}</button>
    <button class="btn wide ghost" data-mgchoose>← Другие мини-игры</button>
  </div>`);
}
function startSimple(id) {
  const g = SG[id], rewarded = charges() > 0;
  if (rewarded) spendCharge();
  A.save();
  root.innerHTML = A.emojiHtml(`<div class="mg-top"><button class="mg-x" data-mgx aria-label="Закончить">✕</button><div class="mg-chip">${g.icon} <span class="fl-r">0</span></div><div class="mg-chip score">✨ <span class="fl-s">0</span></div></div>
    <div class="fl-box"></div>`);
  const box = root.querySelector('.fl-box');
  SGR = { id, live: true, rewarded, h: null };
  SGR.h = g.run(box, { snd, onScore: (sc, k) => { const a = root.querySelector('.fl-s'), b = root.querySelector('.fl-r'); if (a) a.textContent = num(sc); if (b) b.textContent = k; }, onEnd: (res) => sgEnd(res, false) });
}
function sgEnd(res, silent) {
  if (!SGR || !SGR.live) return;
  if (!silent && !SGR.noCont && !SGR.offer && (SGR.cont || 0) < CONT_PRICE.length) { SGR.offer = true; SGR.res = res; snd('end'); contCard('s', SGR.cont || 0); return; }
  if (SGR.offer) { SGR.offer = false; root.querySelectorAll('.mg-cont').forEach((x) => x.remove()); }
  SGR.live = false;
  const g = SG[SGR.id], S = st(), m = g.rec(), score = res.score || 0, stars = score >= g.stars[2] ? 3 : score >= g.stars[1] ? 2 : score >= g.stars[0] ? 1 : 0;
  const recW = score > (m.wb || 0), recAll = score > (m.best || 0);
  m.wb = Math.max(m.wb || 0, score); m.best = Math.max(m.best || 0, score);
  let coins = 0, boost = 0;
  if (SGR.rewarded && score > 0) {
    const min = Math.min(MAX_MIN, MAX_MIN * score / g.stars[2]);
    coins = Math.max(10, Math.round(Math.max(min * 60 * incomeNow(), min * 30) / 10) * 10);
    A.earn(coins); boost = BOOST[stars];
    if (boost) { const now = Date.now(); S.boostEnd = Math.min(now + BOOST_CAP_MIN * 60000, Math.max(now, S.boostEnd || 0) + boost * 60000); }
  }
  if (SGR.rewarded && score <= 0) addCharges(1);   // quit at once: the try comes back
  if (score > 0) m.n = (m.n || 0) + 1;   // daily task, alliance goal, the battle
  A.save(); A.onFinish && A.onFinish(score, stars, SGR.id);
  if (silent) return;
  snd('end');
  const n = charges();
  root.appendChild(el(`<div class="mg-card">
    <h2>${score >= g.stars[0] ? g.win : g.lost}</h2>
    <div class="mg-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">⭐</span>`).join('')}</div>
    <div class="mg-big">${num(score)}</div>
    <p class="muted">${g.res(res)}${recW ? ' · 🏅 рекорд недели!' : ''}${recAll && !recW ? ' · 🏅 рекорд!' : ''}</p>
    ${SGR.rewarded ? `<div class="mg-prize">Награда: 🪙 ${A.fmt(coins)}${boost ? `<br>✨ Вдохновение +${boost} мин (уроки +10%)` : ''}</div>` : '<p class="muted">Игра без награды — только рекорд.</p>'}
    <p class="muted">${stars < 3 ? `До ${stars + 1} ⭐ — ${num(g.stars[stars])} очков. ` : ''}Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}${n < CH_MAX ? `, следующая через ${mmss(nextIn())}` : ''}</p>
    <button class="btn wide" data-mgpick="${SGR.id}">${n > 0 ? `🔁 ${g.more1} (1 попытка)` : `🔁 ${g.more1} без награды`}</button>
    <button class="btn wide ghost" data-mgback>В школу</button>
  </div>`));
}

// ---- end of round ----
function finish(silent) {
  if (!R || !R.live) return;
  R.live = false; R.left = 0;
  const S = st(), m = mg(), score = R.score, stars = starsOf(score), wk = weekKey();
  if (m.wk !== wk) { m.wk = wk; m.wb = 0; }
  const recW = score > m.wb, recAll = score > (m.best || 0);
  m.wb = Math.max(m.wb, score); m.best = Math.max(m.best || 0, score);
  let coins = 0, boost = 0, refund = 0;
  if (R.rewarded && score > 0) {
    const min = Math.min(MAX_MIN, MAX_MIN * score / STAR[2]);
    coins = Math.max(10, Math.round(Math.max(min * 60 * incomeNow(), min * 30) / 10) * 10);
    A.earn(coins);
    boost = BOOST[stars];
    if (boost) { const now = Date.now(); S.boostEnd = Math.min(now + BOOST_CAP_MIN * 60000, Math.max(now, S.boostEnd || 0) + boost * 60000); }
  } else if (R.cost) { S.coins += R.cost; refund = R.cost; }   // build audit 2026-11-24: nothing won, the bonuses come back
  if (R.rewarded && score <= 0) addCharges(1);   // quit at once: the try comes back
  if (score > 0) m.n = (m.n || 0) + 1;   // only real rounds count (daily task, alliance goal)
  A.save();
  A.onFinish && A.onFinish(score, stars, 'potions');
  if (silent) return;
  snd('end');
  const n = charges();
  const card = el(`<div class="mg-card">
    <h2>${score >= STAR[0] ? 'Отличная варка!' : 'Время вышло!'}</h2>
    <div class="mg-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">⭐</span>`).join('')}</div>
    <div class="mg-big">${num(score)}</div>
    <p class="muted">сварено зелий: ${R.brewed}${recW ? ' · 🏅 рекорд недели!' : ''}${recAll && !recW ? ' · 🏅 рекорд!' : ''}</p>
    ${R.rewarded ? `<div class="mg-prize">Награда: 🪙 ${A.fmt(coins)}${boost ? `<br>✨ Вдохновение +${boost} мин (уроки +10%)` : ''}</div>` : '<p class="muted">Игра без награды — только рекорд.</p>'}${refund ? `<p class="muted">Бонусы вернулись: 🪙 ${A.fmt(refund)}</p>` : ''}
    <p class="muted">${stars < 3 ? `До ${stars + 1} ⭐ — ${num(STAR[stars])} очков. ` : ''}Попытки с наградой: ${n > CH_MAX ? n : n + ' из ' + CH_MAX}${n < CH_MAX ? `, следующая через ${mmss(nextIn())}` : ''}</p>
    <button class="btn wide" data-mgagain>${n > 0 ? '🔁 Ещё раз (1 попытка)' : '🔁 Ещё раз без награды'}</button>
    <button class="btn wide ghost" data-mgback>В школу</button>
  </div>`);
  root.appendChild(card);
}

export function initMinigame(api) {
  A = api;
  addEventListener('resize', () => { if (R && cv) layout(); });
  window.__mg = { open, close, charges, get R() { return R; }, get SGR() { return SGR; }, cart: () => W2(), get FL() { return FL; }, resolveStep, findGroups, findMove, setLeft: (s) => { if (R) R.left = s; }, setScore: (s) => { if (R) R.score = s; }, SND, SND_DB, STAR };
  window.__fl = { get FL() { return FL; }, F_STAR, start: () => { showFlightStart(); startFlight(); } };
  return { open, isOpen, pill, charges, addCharges, weekBest, weekKey, prevBest, prizeDue, claim: () => { mg().claimed = weekKey() - 1; A.save(); },
    flightBest, flightPrev, flightPrizeDue, gBest, gPrev, gPrizeDue, claimG: () => { g3().claimed = weekKey() - 1; A.save(); }, claimFlight: () => { fl().claimed = weekKey() - 1; A.save(); } };
}
