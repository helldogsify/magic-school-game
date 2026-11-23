// Mini-game 1 «Зельеварка» (build 273+): match-3 of potion ingredients.
// Tester wish 2026-11-23 («мини-игры ... стандартные штуки типа три в ряд»), Maria's picks: match-3 of potions,
// a pill on the main screen, reward = coins (minutes of the school's income) + «Вдохновение», 3 charges (+1 per 20 min),
// playing without charges allowed (record only), weekly best kept for a later tournament of schools.
// Own module: game.js passes a small API (state, earn, save, toast, fmt, audio) and calls open(); the overlay is plain DOM + one canvas.

const N = 7;                      // board 7x7
const ROUND = 90;                 // seconds per round (the same for everybody: fair for a weekly tournament)
const CH_MAX = 3, CH_MS = 20 * 60000;
const STAR = [2000, 3500, 5500];  // score for 1/2/3 stars (calibrated with tools/mg_sim.mjs)
const MAX_MIN = 10;               // the best round pays 10 minutes of the school's income
const BOOST = [0, 0, 5, 10];      // minutes of «Вдохновение» per stars
const BOOST_CAP_MIN = 60;         // same cap as gifts (BOOST_MAX_MIN in game.js)
const ART_V = 1;

export const ING = [   // ingredient tiles; art: assets/minigame/ing_<i>.png (falls back to the emoji until the art exists)
  { e: '🌿', name: 'Мята', col: '#5cbf6a' },
  { e: '🍄', name: 'Гриб-светлячок', col: '#e0705a' },
  { e: '💎', name: 'Кристалл', col: '#58c6e0' },
  { e: '🪶', name: 'Перо феи', col: '#b78ae8' },
  { e: '💧', name: 'Роса', col: '#5a8ff0' },
  { e: '⭐', name: 'Звёздная пыль', col: '#f2c03a' },
];
const T = ING.length, RAINBOW = -1;
const POTIONS = ['Зелье смеха', 'Эликсир крылышек', 'Настой сладких снов', 'Зелье храбрости', 'Лунный отвар', 'Искристый эликсир', 'Зелье пушистости', 'Отвар звездопада', 'Чай вдохновения', 'Капли удачи'];

export const weekKey = (t = Date.now()) => Math.floor((t / 86400000 + 3) / 7);   // weeks start on Monday 00:00 UTC

let A = null;   // API from game.js
const st = () => A.state();
function mg() {
  const S = st();
  if (!S.mg) S.mg = { ch: CH_MAX, t: Date.now(), best: 0, wk: 0, wb: 0, n: 0, pot: 0 };
  return S.mg;
}
export function charges() {
  const m = mg(), now = Date.now();
  if (m.ch >= CH_MAX) { m.t = now; return m.ch; }
  const k = Math.floor((now - m.t) / CH_MS);
  if (k > 0) { m.ch = Math.min(CH_MAX, m.ch + k); m.t = m.ch >= CH_MAX ? now : m.t + k * CH_MS; }
  return m.ch;
}
const nextIn = () => Math.max(0, mg().t + CH_MS - Date.now());
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
  tick(c, o, t) { tone(c, o, t, 1200, 1150, 0.06, 0.06, 'sine', 0.003); },
  end(c, o, t) { [523, 659, 784, 1047].forEach((f, k) => tone(c, o, t + k * 0.14, f, f, 0.8, 0.08, 'triangle', 0.005)); for (let k = 0; k < 6; k++) { const f = PENTA[5 + (k % 5)]; tone(c, o, t + 0.7 + k * 0.12, f, f, 0.5, 0.03, 'sine', 0.01); } },
};
export const SND_DB = { pop: 0, nope: 0, special: 2, brew: -4.5, tick: 6, end: 5 };   // measured peaks then: pop -15.7, nope -18.8, special -14.8, brew -13.9, tick -18.5, end -14.7 dB
function snd(name, arg) {
  const a = A.audioOut && A.audioOut(); if (!a) return;
  try { const g = a.c.createGain(); g.gain.value = Math.pow(10, (SND_DB[name] || 0) / 20); g.connect(a.out); SND[name](a.c, g, a.c.currentTime + 0.01, arg); } catch (e) { /* never break the game for a sound */ }
}

// ======================= board logic (pure; also used by tools/mg_sim.mjs) =======================
let uid = 1;
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
  const clear = new Map(), make = [], queue = [];
  const add = (r, c, why) => { const k = r * N + c; if (clear.has(k) || !g[r][c]) return; clear.set(k, why); if (g[r][c].sp || g[r][c].t === RAINBOW) queue.push([r, c]); };
  if (swap && isSpecialSwap(g, swap[0], swap[1])) {
    const [a, b] = swap, x = g[a[0]][a[1]], y = g[b[0]][b[1]];
    if (x.t === RAINBOW && y.t === RAINBOW) { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) add(r, c, 's'); }
    else if (x.t === RAINBOW || y.t === RAINBOW) {
      const [rp, other] = x.t === RAINBOW ? [a, y] : [b, x];
      clear.set(rp[0] * N + rp[1], 's');
      for (const [r, c] of blast(g, rp[0], rp[1], g[rp[0]][rp[1]], other.t)) { if (other.sp && g[r][c] && !g[r][c].sp && g[r][c].t >= 0) g[r][c].sp = other.sp === 'b' ? 'b' : Math.random() < 0.5 ? 'h' : 'v'; add(r, c, 's'); }
    } else { add(a[0], a[1], 's'); add(b[0], b[1], 's'); }
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
      for (const k of gr.keys) add(Math.floor(k / N), k % N, 'm');
    }
  }
  let fired = 0;
  while (queue.length) { const [r, c] = queue.shift(); const tile = g[r][c]; if (!tile) continue; fired++; for (const [rr, cc] of blast(g, r, c, tile)) add(rr, cc, 's'); }
  // a new special appears on its spot only if that spot was not blown by another special in the same step
  const made = make.filter((m) => clear.get(m.r * N + m.c) === 'm');
  return { clear: [...clear.keys()].map((k) => [Math.floor(k / N), k % N]), make: made, fired };
}
export function points(nTiles, chain, nMade, fired) { return Math.round(nTiles * 10 * (1 + 0.5 * chain) + nMade * 30 + fired * 20); }

// ======================= the round =======================
let R = null;   // current round
let root = null, cv = null, cx = null, raf = 0, last = 0, imgs = [];
function loadArt() {
  imgs = ING.map((ing, i) => { const im = new Image(); im.src = `assets/minigame/ing_${i}.webp?v=${ART_V}`; im.onerror = () => { im.bad = true; }; return im; });
  imgs.caul = new Image(); imgs.caul.src = `assets/minigame/cauldron.webp?v=${ART_V}`; imgs.caul.onerror = () => { imgs.caul.bad = true; };
  imgs.rb = new Image(); imgs.rb.src = `assets/minigame/rainbow.webp?v=${ART_V}`; imgs.rb.onerror = () => { imgs.rb.bad = true; };
}
const artOk = (im) => im && !im.bad && im.complete && im.naturalWidth;

function newRecipe(n) {
  const types = []; while (types.length < 3) { const t = Math.floor(Math.random() * T); if (!types.includes(t)) types.push(t); }
  const base = 8 + Math.min(8, n * 2);
  return { name: POTIONS[n % POTIONS.length], need: types.map((t, k) => ({ t, n: base - k * 2, got: 0 })) };
}

export function isOpen() { return !!root; }
export function weekBest() { const S = st(); if (!S || !S.mg) return 0; return S.mg.wk === weekKey() ? S.mg.wb || 0 : 0; }   // for the weekly table in the top
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
  A.onOpen && A.onOpen();
  showStart();
}
function close() {
  if (R && R.live) finish(true);
  cancelAnimationFrame(raf); raf = 0; R = null;
  if (root) root.remove(); root = null; cv = null;
  A.onClose && A.onClose();
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.mgx !== undefined) { if (R && R.live) finish(false); else close(); return; }
  if (d.mgplay !== undefined) { start(); return; }
  if (d.mgback !== undefined) { close(); return; }
}
function showStart() {
  const n = charges(), m = mg(), wk = weekKey();
  const best = m.wk === wk ? m.wb : 0;
  root.innerHTML = A.emojiHtml(`<div class="mg-card">
    <div class="mg-pot">${FLASK}</div><h2>Зельеварка</h2>
    <p>Меняй соседние ингредиенты местами и собирай <b>3 в ряд</b>. Собери ингредиенты рецепта — и сваришь зелье!</p>
    <div class="mg-ings">${ING.map((_, t) => ingImg(t)).join('')}</div>
    <p class="muted">4 в ряд — волшебная полоска, уголок — взрыв, 5 в ряд — ${ingImg(RAINBOW)} звёздочка: поменяй её с любым ингредиентом.</p>
    <p>Раунд — ${ROUND} секунд. Награда: монеты (до ${MAX_MIN} минут дохода школы), за 2–3 ⭐ ещё ✨ Вдохновение.</p>
    <p><b>Попытки с наградой: ${n} из ${CH_MAX}</b>${n < CH_MAX ? `<br><span class="muted">следующая через ${mmss(nextIn())}</span>` : ''}</p>
    <p class="muted">Рекорд недели: ${num(best)}${m.best ? ` · за всё время: ${num(m.best)}` : ''}</p>
    <button class="btn wide" data-mgplay>${n > 0 ? '▶️ Играть (1 попытка)' : '▶️ Играть без награды'}</button>
    <button class="btn wide ghost" data-mgback>В школу</button>
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
  const rewarded = charges() > 0;
  if (rewarded) { const m = mg(); if (m.ch >= CH_MAX) m.t = Date.now(); m.ch--; }
  mg().n++;
  A.save();
  R = { live: true, rewarded, g: makeBoard(), score: 0, shown: 0, left: ROUND, state: 'idle', anim: 0, chain: 0, sel: null, swap: null, idleT: 0, fx: [], texts: [], brewed: 0, rec: null, lastTick: 0, busyT: 0 };
  R.rec = newRecipe(0);
  root.innerHTML = A.emojiHtml(`<div class="mg-top"><button class="mg-x" data-mgx aria-label="Закончить">✕</button><div class="mg-chip time">⏱️ <span class="mg-t"></span></div><div class="mg-chip score">✨ <span class="mg-s">0</span></div></div>
    <div class="mg-rec"></div>
    <div class="mg-board-wrap"><canvas></canvas></div>
    <div class="mg-hint">Проведи пальцем по ингредиенту в сторону соседа</div>
    <div class="mg-caul"><div class="mg-caul-in">🫕</div></div>`);
  { const c = root.querySelector('.mg-caul-in'), im = imgs.caul; if (artOk(im)) { c.innerHTML = ''; c.appendChild(im); } }
  cv = root.querySelector('canvas'); cx = cv.getContext('2d');
  layout(); recHtml(); hud();
  cv.addEventListener('pointerdown', pDown); cv.addEventListener('pointermove', pMove); cv.addEventListener('pointerup', pUp); cv.addEventListener('pointercancel', pUp);
  last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
function recHtml() {
  const r = R.rec, box = root.querySelector('.mg-rec'); if (!box) return;
  const h = `<div class="mg-pot">${FLASK}</div><div><b>${r.name}</b><div class="mg-need">${r.need.map((x) => `<span class="${x.got >= x.n ? 'ok' : ''}">${ingImg(x.t)} ${Math.min(x.got, x.n)}/${x.n}</span>`).join('')}</div></div><div class="mg-brewed">сварено<br><b>${R.brewed}</b></div>`;
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
function pDown(e) { if (!R || R.state !== 'idle' || R.left <= 0) return; const p = cellAt(e); if (!p) return; cv.setPointerCapture && cv.setPointerCapture(e.pointerId); ptr = { p, x: e.clientX, y: e.clientY, moved: false }; R.idleT = 0; }
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
  const pts = points(nT, R.chain, res.make.length, res.fired);
  R.score += pts;
  let cxs = 0, cys = 0;
  for (const [r, c] of res.clear) {
    const t = R.g[r][c]; cxs += c; cys += r;
    if (t.t >= 0) for (const x of R.rec.need) if (x.t === t.t) x.got++;
    for (let k = 0; k < 4; k++) R.fx.push({ x: c + 0.5, y: r + 0.5, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.8) * 4, life: 0.6, t: 0, col: t.t >= 0 ? ING[t.t].col : '#f2c03a' });
    t.die = 0.001;
  }
  R.texts.push({ x: cxs / nT + 0.5, y: cys / nT + 0.5, s: `+${pts}`, t: 0, big: R.chain > 0 || res.fired > 0 });
  if (R.chain >= 1) R.texts.push({ x: 3.5, y: 3.0, s: `Каскад ×${R.chain + 1}!`, t: 0, big: true, col: '#ff6fa5' });
  snd(res.fired || res.make.length ? 'special' : 'pop', Math.min(9, R.chain * 2 + Math.floor(Math.random() * 2)));
  R.pending = res; R.state = 'clear'; R.anim = 0; R.chain++;
  // recipe
  if (R.rec.need.every((x) => x.got >= x.n)) {
    const bonus = 300 + 150 * R.brewed;
    R.score += bonus; R.brewed++; mg().pot = (mg().pot || 0) + 1;
    R.texts.push({ x: 3.5, y: 2.2, s: `${R.rec.name}! +${bonus}`, t: 0, big: true, col: '#7b5cd6', long: true });
    snd('brew');
    { const c = root.querySelector('.mg-caul-in'); if (c) { c.classList.remove('puff'); void c.offsetWidth; c.classList.add('puff'); } }
    R.rec = newRecipe(R.brewed);
  }
  recHtml();
}
function afterClear() {
  const { clear, make } = R.pending; R.pending = null;
  for (const [r, c] of clear) R.g[r][c] = null;
  for (const m of make) { const t = newTile(m.t, m.sp); t.x = m.c; t.y = m.r; t.born = 0.001; R.g[m.r][m.c] = t; }
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
  if (!document.hidden && R.live) {
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
    if (R.idleT > 5 && !R.hint && R.left > 0) R.hint = findMove(R.g);
    if (R.left <= 0 && R.live) finish(false);
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const t = R.g[r] && R.g[r][c]; if (t && t.born) { t.born += dt / 0.25; if (t.born >= 1) t.born = 0; } }
  R.fx = R.fx.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 8 * dt; return p.t < p.life; });
  R.texts = R.texts.filter((p) => { p.t += dt; return p.t < (p.long ? 2.2 : 1.1); });
  draw(now / 1000);
  hud();
  raf = requestAnimationFrame(loop);
}

// ---- draw ----
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, r); }
function drawIng(t, x, y, s) {
  const im = t === RAINBOW ? imgs.rb : imgs[t];
  if (artOk(im)) { const k = s * 0.9; cx.drawImage(im, x - k / 2, y - k / 2, k, k); return; }
  const e = A.emojiImage(ingImg(t));
  if (e) { cx.drawImage(e, x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84); return; }
  cx.font = `${Math.round(s * 0.7)}px system-ui`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(ingImg(t), x, y);
}
function draw(time) {
  const d = R.dpr, C = R.cell * d, W = cv.width;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, W, W);
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
    drawIng(t.t, x, y, s);
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

// ---- end of round ----
function finish(silent) {
  if (!R || !R.live) return;
  R.live = false; R.left = 0;
  const S = st(), m = mg(), score = R.score, stars = starsOf(score), wk = weekKey();
  if (m.wk !== wk) { m.wk = wk; m.wb = 0; }
  const recW = score > m.wb, recAll = score > (m.best || 0);
  m.wb = Math.max(m.wb, score); m.best = Math.max(m.best || 0, score);
  let coins = 0, boost = 0;
  if (R.rewarded && score > 0) {
    const min = Math.min(MAX_MIN, MAX_MIN * score / STAR[2]);
    coins = Math.max(10, Math.round(Math.max(min * 60 * (S.ema || 0), min * 30) / 10) * 10);
    A.earn(coins);
    boost = BOOST[stars];
    if (boost) { const now = Date.now(); S.boostEnd = Math.min(now + BOOST_CAP_MIN * 60000, Math.max(now, S.boostEnd || 0) + boost * 60000); }
  }
  A.save();
  A.onFinish && A.onFinish(score);
  if (silent) return;
  snd('end');
  const n = charges();
  const card = el(`<div class="mg-card">
    <h2>${score >= STAR[0] ? 'Отличная варка!' : 'Время вышло!'}</h2>
    <div class="mg-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">⭐</span>`).join('')}</div>
    <div class="mg-big">${num(score)}</div>
    <p class="muted">сварено зелий: ${R.brewed}${recW ? ' · 🏅 рекорд недели!' : ''}${recAll && !recW ? ' · 🏅 рекорд!' : ''}</p>
    ${R.rewarded ? `<div class="mg-prize">Награда: 🪙 ${A.fmt(coins)}${boost ? `<br>✨ Вдохновение +${boost} мин (уроки +10%)` : ''}</div>` : '<p class="muted">Игра без награды — только рекорд.</p>'}
    <p class="muted">${stars < 3 ? `До ${stars + 1} ⭐ — ${num(STAR[stars])} очков. ` : ''}Попытки с наградой: ${n} из ${CH_MAX}${n < CH_MAX ? `, следующая через ${mmss(nextIn())}` : ''}</p>
    <button class="btn wide" data-mgplay>${n > 0 ? '🔁 Ещё раз (1 попытка)' : '🔁 Ещё раз без награды'}</button>
    <button class="btn wide ghost" data-mgback>В школу</button>
  </div>`);
  root.appendChild(card);
}

export function initMinigame(api) {
  A = api;
  addEventListener('resize', () => { if (R && cv) layout(); });
  window.__mg = { open, close, charges, get R() { return R; }, resolveStep, findGroups, findMove, setLeft: (s) => { if (R) R.left = s; }, setScore: (s) => { if (R) R.score = s; }, SND, SND_DB, STAR };
  return { open, isOpen, pill, charges, weekBest, weekKey };
}
