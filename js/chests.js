// Daily chests (build 307+): push-your-luck once a day.
// Maria 2026-11-23: «Ежедневные сундучки надо. Откроешь больше - шанс падает что не выпадет «смерть», но и больше наград можно выиграть».
// Her picks: 6 chests, risk 0/10/20/35/50/70 %, the cursed chest takes everything collected today and ends the day,
// rewards = coins (minutes of the school's income) + «Вдохновение» + «Зельеварка» tries + a rare x2 chest in the last two,
// a tile in the ✨ menu. Every world save keeps its own row (S.chest). Works offline: no cloud.
// Own module: game.js passes a small API (state, earn, save, toast, fmt, emojiHtml, audioOut, mgCharge) and calls initChests().

const RISK = [0, 0.10, 0.20, 0.35, 0.50, 0.70];   // chance that chest k is cursed (shown before opening)
const MIN = [5, 10, 20, 35, 60, 200];              // coins = minutes of the school's income (chest 6: 100 -> 200, build audit 2026-11-24: it was always a bad bet)
// build audit 2026-11-24 (best play lost everything 77 % of days, no pity): the curse burns HALF of what was collected (the rest is paid at once),
// and a cursed day leaves a ward 🛡️ for the next row that turns one cursed chest into a normal one. Expected value per day, best stop: 34 -> 48 min.
const halfLoot = (l) => ({ c: Math.round(l.c / 2 / 10) * 10, b: Math.floor(l.b / 2), m: Math.floor(l.m / 2) });
const MGT = [0, 1, 0, 1, 0, 1];                    // «Зельеварка» tries
const BOOST = [0, 0, 10, 0, 15, 20];               // minutes of «Вдохновение» (+10% lessons), cap 60 like gifts
const RARE = 0.25, RARE_FROM = 4;                  // chests 5 and 6: one in four is a sparkling chest, coins x2
const BOOST_CAP_MIN = 60;
const ART_V = 1;
const IMG = { closed: 0, open: 1, curse: 2, rare: 3 };

let A = null, root = null, busy = false, lastMsg = '';
const S = () => A.state();
const dayKey = (t = new Date(Date.now())) => `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;   // local midnight reset
const msToMidnight = () => { const d = new Date(Date.now()); d.setHours(24, 0, 0, 0); return d - Date.now(); };
const hhmm = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
const emptyLoot = () => ({ c: 0, b: 0, m: 0 });

function ch() {   // today's row; yesterday's unfinished loot is paid out at the rollover (she stopped in time, nothing lost)
  const s = S(); if (!s) return null;
  const today = dayKey();
  if (!s.chest || s.chest.day !== today) {
    const o = s.chest;
    if (o && !o.dead && !o.done && (o.loot.c || o.loot.b || o.loot.m)) grant(o.loot, true);
    s.chest = { day: today, k: 0, got: [], loot: emptyLoot(), done: false, dead: false };
  }
  return s.chest;
}
export const ready = () => { const c = ch(); return !!c && !c.done && !c.dead; };
export const fresh = () => { const c = ch(); return !!c && c.k === 0 && !c.done && !c.dead; };

function coinsFor(k) {
  const s = S(), inc = A.rate ? A.rate() : (s.paceEma || s.ema || 0);   // build audit 2026-11-24: the steady rate (a chest lifted the next one)
  return Math.max(10, Math.round(Math.max(MIN[k] * 60 * inc, MIN[k] * 30) / 10) * 10);
}
function grant(l, quiet) {
  const s = S();
  if (l.c) A.earn(l.c);
  if (l.b) { const now = Date.now(); s.boostEnd = Math.min(now + BOOST_CAP_MIN * 60000, Math.max(now, s.boostEnd || 0) + l.b * 60000); }
  for (let i = 0; i < l.m; i++) A.mgCharge();
  if (quiet && l.c) A.toast(`🎁 Сундучки вчера: 🪙 ${A.fmt(l.c)} зачислено`);
}
const lootText = (l) => [l.c ? `🪙 ${A.fmt(l.c)}` : '', l.b ? `✨ ${l.b} мин` : '', l.m ? `🧪 +${l.m}` : ''].filter(Boolean).join(' · ') || 'пока пусто';

// ======================= sound (tiny synth on the game's audio bus) =======================
function env(g, t0, a, d, v) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function tone(c, out, t0, f0, f1, dur, v, type = 'sine', a = 0.01) {
  const o = c.createOscillator(), g = c.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + a + dur);
  env(g, t0, a, dur, v); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + a + dur + 0.05);
}
let NOISE = null;
function hiss(c, out, t0, dur, v, type, f0, f1) {
  if (!NOISE || NOISE.sampleRate !== c.sampleRate) { NOISE = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = NOISE; f.type = type;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); env(g, t0, 0.02, dur, v);
  s.connect(f); f.connect(g); g.connect(out); s.start(t0); s.stop(t0 + dur + 0.1);
}
export const SND = {
  shake(c, o, t) { for (let k = 0; k < 5; k++) { tone(c, o, t + k * 0.11, 180, 140, 0.07, 0.18, 'triangle', 0.004); hiss(c, o, t + k * 0.11, 0.06, 0.06, 'bandpass', 1500, 900); } },
  open(c, o, t) { hiss(c, o, t, 0.25, 0.08, 'highpass', 2000, 6000); [523, 659, 784, 1047].forEach((f, k) => tone(c, o, t + k * 0.07, f, f, 0.45, 0.09, 'triangle', 0.005));
    for (let k = 0; k < 6; k++) tone(c, o, t + 0.3 + k * 0.05, 1800 + Math.random() * 900, 2400 + Math.random() * 600, 0.08, 0.04); },
  rare(c, o, t) { [784, 988, 1175, 1568, 1976, 2349].forEach((f, k) => tone(c, o, t + k * 0.06, f, f, 0.8, 0.07, 'triangle', 0.004)); hiss(c, o, t, 0.9, 0.06, 'highpass', 4000, 9000); },
  curse(c, o, t) { tone(c, o, t, 220, 70, 0.9, 0.3, 'sawtooth', 0.02); tone(c, o, t + 0.05, 233, 74, 0.9, 0.18, 'sine', 0.02); hiss(c, o, t, 1.0, 0.18, 'lowpass', 900, 120);
    [392, 370, 349, 311].forEach((f, k) => tone(c, o, t + 0.5 + k * 0.16, f, f * 0.98, 0.3, 0.08, 'triangle', 0.01)); },
  take(c, o, t) { for (let k = 0; k < 8; k++) tone(c, o, t + k * 0.05, 1400 + k * 90, 1900 + k * 90, 0.09, 0.07, 'triangle', 0.003); },
};
export const SND_DB = { shake: -2, open: 1, rare: 0, curse: -7, take: 6 };   // levels measured with OfflineAudioContext (tools/_wk/chest_lv.mjs)
function snd(name) {
  const a = A.audioOut && A.audioOut(); if (!a) return;
  try { const g = a.c.createGain(); g.gain.value = Math.pow(10, (SND_DB[name] || 0) / 20); g.connect(a.out); SND[name](a.c, g, a.c.currentTime + 0.01); } catch (e) { /* never break the game for a sound */ }
}

// ======================= overlay =======================
const img = (i, cls = '') => `<img class="chi ${cls}" src="assets/chests/chest_${i}.webp?v=${ART_V}" alt="" draggable="false">`;
function el(html) { const d = document.createElement('div'); d.innerHTML = A.emojiHtml(html.trim()); return d.firstChild; }
function css() {
  if (document.getElementById('chest-css')) return;
  const s = document.createElement('style'); s.id = 'chest-css';
  s.textContent = `
#chests { position: fixed; inset: 0; z-index: 18; display: flex; flex-direction: column; align-items: center; background: linear-gradient(#efe4ff, #ffe3f0 60%, #ffeede); color: #3a2f4a;
  padding: calc(var(--safe-t, 0px) + 8px) 12px calc(var(--safe-b, 0px) + 12px); font-family: ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif; user-select: none; -webkit-user-select: none; overflow-y: auto; }
#chests .ch-top { width: 100%; max-width: 460px; display: flex; align-items: center; gap: 8px; }
#chests .ch-top h2 { margin: 0; font-size: 22px; flex: 1; }
#chests .ch-x { width: 40px; height: 40px; border-radius: 14px; background: #fffaffee; box-shadow: 0 3px 0 #c9b8ee; font: 800 18px inherit; color: #5a3fb0; }
#chests .ch-sub { width: 100%; max-width: 460px; margin: 6px 0 4px; font-size: 13.5px; color: #6f6390; line-height: 1.35; }
#chests .ch-grid { width: 100%; max-width: 460px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0; }
#chests .ch-c { position: relative; background: #fffaffb0; border: 2px solid #e4d8fb; border-radius: 18px; padding: 6px 4px 6px; display: flex; flex-direction: column; align-items: center; min-height: 128px; }
#chests .ch-c .chi { width: 86%; height: 78px; object-fit: contain; }
#chests .ch-c .lab { font: 800 13px ui-rounded, "Nunito", sans-serif; margin-top: 3px; text-align: center; line-height: 1.2; }
#chests .ch-c .lab small { display: block; font-weight: 700; font-size: 11.5px; color: #8a7ea0; }
#chests .ch-c .num { position: absolute; left: 7px; top: 5px; font: 900 12px ui-rounded, sans-serif; color: #b3a5d6; }
#chests .ch-c.next { border-color: #b98be8; background: #fff; box-shadow: 0 0 0 3px #d9c2ff66, 0 6px 16px #7b5cd633; cursor: pointer; }
#chests .ch-c.next .chi { animation: chbob 1.6s ease-in-out infinite; }
#chests .ch-c.later { opacity: .55; }
#chests .ch-c.later .chi { filter: saturate(.6); }
#chests .ch-c.got { border-color: #f0d27a; background: #fff8dc; }
#chests .ch-c.rare { border-color: #ff9ed2; background: linear-gradient(135deg, #fff0fa, #f0f4ff, #fffbe6); }
#chests .ch-c.rare .chi { filter: drop-shadow(0 0 8px #ffb3e6); }
#chests .ch-c.dead { border-color: #7a4fa8; background: #e9dcf7; }
#chests .risk { font-weight: 900; }
#chests .risk.r0 { color: #3a9a54; } #chests .risk.r1 { color: #c48a00; } #chests .risk.r2 { color: #e0603a; } #chests .risk.r3 { color: #c0303a; }
#chests .ch-loot { width: 100%; max-width: 460px; background: #fff8dc; border: 2px solid #f0d27a; border-radius: 18px; padding: 9px 12px; margin-top: 6px; font: 800 15px ui-rounded, "Nunito", sans-serif; text-align: center; }
#chests .ch-loot small { display: block; font-weight: 700; font-size: 12px; color: #8a7a50; margin-bottom: 2px; }
#chests .ch-leg { width: 100%; max-width: 460px; font-size: 12px; color: #8a7ea0; text-align: center; }
#chests .ch-msg { width: 100%; max-width: 460px; min-height: 22px; margin-top: 8px; text-align: center; font: 800 15px ui-rounded, "Nunito", sans-serif; color: #5a3fb0; }
#chests .ch-msg.bad { color: #8a2f6a; }
#chests .ch-btns { width: 100%; max-width: 460px; }
#chests .btn.wide { margin-top: 10px; }
#chests .ch-c.shake .chi { animation: chshake .12s linear infinite; }
#chests .ch-c.pop .chi { animation: chpop .5s ease-out; }
#chests .ch-c.boom { animation: chboom .7s ease-out; }
@keyframes chbob { 50% { transform: translateY(-4px) rotate(-2deg); } }
@keyframes chshake { 0% { transform: rotate(-6deg); } 50% { transform: rotate(6deg) translateY(-2px); } 100% { transform: rotate(-6deg); } }
@keyframes chpop { 0% { transform: scale(.7); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes chboom { 0% { background: #4a2a6a; } 100% { background: #e9dcf7; } }`;
  document.head.appendChild(s);
}
const riskCls = (r) => (r === 0 ? 'r0' : r < 0.25 ? 'r1' : r < 0.45 ? 'r2' : 'r3');
const riskTxt = (r) => (r === 0 ? 'без риска' : `💀 ${Math.round(r * 100)}%`);
function cell(c, k) {
  const g = c.got[k];
  if (g) {
    if (g.dead) return `<div class="ch-c dead"><span class="num">${k + 1}</span>${img(IMG.curse)}<div class="lab">Проклятие!</div></div>`;
    return `<div class="ch-c got${g.rare ? ' rare' : ''}"><span class="num">${k + 1}</span>${img(g.rare ? IMG.rare : IMG.open)}<div class="lab">🪙 ${A.fmt(g.c)}${g.rare ? ' ×2' : ''}<small>${[g.b ? `✨ ${g.b} мин` : '', g.m ? `🧪 +${g.m}` : '', g.gear ? '🎒' : ''].filter(Boolean).join(' · ') || '&nbsp;'}</small></div></div>`;
  }
  const next = k === c.k && !c.done && !c.dead;
  const extra = [MGT[k] ? '🧪' : '', BOOST[k] ? '✨' : '', k >= RARE_FROM ? '🌈' : ''].join('');
  return `<div class="ch-c ${next ? 'next' : 'later'}" ${next ? 'data-chopen' : ''}><span class="num">${k + 1}</span>${img(IMG.closed)}<div class="lab"><span class="risk ${riskCls(RISK[k])}">${riskTxt(RISK[k])}</span><small>🪙 ~${MIN[k]} мин дохода ${extra}</small></div></div>`;
}
function html() {
  const c = ch(), N = RISK.length;
  let btns, loot;
  if (c.dead) {
    loot = `<div class="ch-loot"><small>Сегодня</small>Проклятый сундук забрал половину 💀${c.loot.c || c.loot.b || c.loot.m ? `<br>Осталось и зачислено: ${lootText(c.loot)}` : ''}<br><small>Завтра тебя защитит оберег 🛡️</small></div>`;
    btns = `<button class="btn wide ghost" data-chclose>В школу</button>`;
  } else if (c.done) {
    loot = `<div class="ch-loot"><small>Сегодня забрано</small>${lootText(c.loot)}</div>`;
    btns = `<button class="btn wide ghost" data-chclose>В школу</button>`;
  } else {
    loot = `<div class="ch-loot"><small>Собрано в этом ряду (половина сгорит, если попадётся проклятый сундук)</small>${lootText(c.loot)}</div>`;
    btns = `<button class="btn wide hot" data-chopen>Открыть сундучок ${c.k + 1} · ${RISK[c.k] ? `риск ${Math.round(RISK[c.k] * 100)}%` : 'без риска'}</button>`
      + (c.k > 0 ? `<button class="btn wide" data-chtake>Забрать и остановиться</button>` : '');
  }
  const sub = c.done || c.dead ? `Новые сундучки через ${hhmm(msToMidnight())} (в полночь).`
    : 'Открывай по одному. Чем дальше — тем больше награда, но выше риск проклятого сундука 💀: он забирает половину того, что собрано сегодня. Можно остановиться в любой момент и забрать награду.'
      + ((S().chestWard || 0) > 0 ? ' 🛡️ Сегодня с тобой оберег: он спасёт от одного проклятия.' : '');
  return `<div id="chests"><div class="ch-top"><h2>🎁 Сундучки дня</h2><button class="ch-x" data-chclose>✕</button></div>
    <div class="ch-sub">${sub}</div>
    <div class="ch-grid">${Array.from({ length: N }, (_, k) => cell(c, k)).join('')}</div>
    <div class="ch-leg">🧪 попытка Зельеварки · ✨ Вдохновение (уроки +10%) · 🌈 шанс на сверкающий сундук ×2${A.gearOn && A.gearOn() ? ' · 🎒 в каждом сундучке шанс на вещь для героев' : ''}</div>
    ${loot}<div class="ch-msg${lastMsg.startsWith('!') ? ' bad' : ''}">${lastMsg.replace(/^!/, '')}</div><div class="ch-btns">${btns}</div></div>`;
}
function redraw() { if (!root) return; const n = el(html()); root.replaceWith(n); root = n; root.addEventListener('click', onClick); }

export function open() {
  if (root || !S()) return;
  css(); lastMsg = ch().k === 0 && !ch().done && !ch().dead ? 'Первый сундучок всегда без риска!' : '';
  root = el(html()); document.body.appendChild(root); root.addEventListener('click', onClick);
  A.onOpen && A.onOpen();
}
export function close() { if (!root) return; root.remove(); root = null; busy = false; A.save(); A.onClose && A.onClose(); }
export const isOpen = () => !!root;

function openNext() {
  const c = ch(); if (busy || c.done || c.dead) return;
  const k = c.k; busy = true;
  const box = root.querySelectorAll('.ch-c')[k]; box?.classList.add('shake'); snd('shake');
  setTimeout(() => {
    const c2 = ch(); if (!root || c2 !== c) { busy = false; return; }   // closed or a new day meanwhile
    const s = S(), cursed = Math.random() < RISK[k], warded = cursed && (s.chestWard || 0) > 0;
    if (warded) s.chestWard = 0;   // the ward takes the curse
    if (cursed && !warded) {
      c.got[k] = { dead: true }; c.dead = true; c.k = k + 1;
      const keep = halfLoot(c.loot), lost = lootText({ c: c.loot.c - keep.c, b: c.loot.b - keep.b, m: c.loot.m - keep.m });
      c.loot = keep; if (keep.c || keep.b || keep.m) grant(keep);   // the kept half is paid now (a dead row is not paid at the rollover)
      s.chestWard = 1;   // tomorrow's row: one curse is turned away
      lastMsg = `!Проклятый сундук! Сгорела половина: ${lost}`; snd('curse');
      A.save(); busy = false; redraw(); root.querySelectorAll('.ch-c')[k]?.classList.add('boom'); return;
    }
    const rare = k >= RARE_FROM && Math.random() < RARE;
    const g = { c: coinsFor(k) * (rare ? 2 : 1), b: BOOST[k], m: MGT[k], rare };
    { const gi = A.gear && A.gear(`${c.day}_${k}`); if (gi) g.gear = gi; }   // gear_sources: a chance of a gear item per opened chest (not burnt by a curse)
    c.got[k] = g; c.k = k + 1; c.loot.c += g.c; c.loot.b += g.b; c.loot.m += g.m;
    snd(rare ? 'rare' : 'open');
    if (c.k >= RISK.length) { take(true); if (warded) lastMsg = '🛡️ Оберег спас от проклятия! ' + lastMsg; busy = false; redraw(); return; }   // all six opened: everything is taken at once
    lastMsg = (warded ? '🛡️ Оберег спас от проклятия! ' : '') + (g.gear ? `🎒 Находка для героев: ${g.gear}! ` : '') + (rare ? '🌈 Сверкающий сундук — награда ×2!' : `Следующий: ${riskTxt(RISK[c.k])}. Рискнёшь?`);
    A.save(); busy = false; redraw(); root.querySelectorAll('.ch-c')[k]?.classList.add('pop');
  }, 650);
}
function take(all) {
  const c = ch(); if (c.done || c.dead || !c.k) return;
  grant(c.loot); c.done = true; snd('take');
  lastMsg = all ? '🎉 Все шесть сундучков открыты!' : 'Награда получена!';
  A.save(); redraw(); A.onTake && A.onTake(c.loot);
}
function onClick(e) {
  const t = e.target.closest('[data-chopen],[data-chtake],[data-chclose]'); if (!t) return;
  const d = t.dataset;
  if (d.chclose !== undefined) close();
  else if (d.chtake !== undefined) { if (!busy) take(false); }
  else if (d.chopen !== undefined) openNext();
}

export function initChests(api) {
  A = api;
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-chests]')) open(); });   // the ✨ menu tile (the global handler closes the menu first)
  const reg = () => {
    if (!window.schoolMenu) { setTimeout(reg, 50); return; }   // game.js assigns window.schoolMenu further down its module body
    window.schoolMenu.add({ attr: 'data-chests', icon: '🎁', label: 'Сундучки',
      sub: () => { if (!S()) return ''; const c = ch(); return c.dead ? 'завтра' : c.done ? 'завтра' : c.k ? lootText(c.loot) : 'готовы!'; },
      badge: () => (S() && fresh() ? 1 : 0), glow: () => (S() ? ready() : false) });
  };
  setTimeout(reg, 0);
  setInterval(() => { if (root && !busy && S() && S().chest && S().chest.day !== dayKey()) redraw(); }, 30000);   // midnight while the panel is open
  window.__chests = { open, close, ch, RISK, MIN, SND, SND_DB, setDay: (d) => { if (S().chest) S().chest.day = d; }, force: (dead) => { const r = Math.random; Math.random = () => (dead ? 0 : 0.999); return () => { Math.random = r; }; } };
  return { open, close, isOpen, ready, fresh };
}
