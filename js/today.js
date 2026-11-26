// ======================= «☀️ Сегодня» — the daily bar (rework step 7; Ruslan 2026-11-26: «Ну вроде нормально. Ок.», name «подходит») =======================
// Registry: design/system_registry.md §5 step 7, rows E5.8-E5.13, D2.14, I1.5 (design/system_registry_rows_*.md). Patch of game.js: tools/_patch/today_s7.py.
// One bar in the top row (where the school level was) answers «why come today»: the deeds of the day are things the player does anyway
// (the theme deed, harvest, chests, 3 quests, inspector / open lesson, a gift to an ally, a mini-game round, an annex event). ANY 4 close
// the day: moonstones growing with the streak (2,3,4… up to 7), Tikhon writes the day into the book «Твоя школа», lanterns light up at the
// fountain. Every deed pays coins once a day (the theme deed twice). A missed day: one per 7 days is forgiven, any other costs one step.
// Tikhon names the day theme every morning (rule-based, no new art): a class day +10 %, a fair in the shop, a feast in the canteen,
// a starfall night (observatory stars x2), a graduation day. Interrupts only through the game's queue (morning plate = news,
// the closed day = celebration). Texts are placeholders: texts by Maria.
// No imports on purpose: game.js imports its modules with ?v=<build>; everything comes with initToday(api).

// ---- every number in one place: STARTING values, tuned later in the whole-game economy check (registry §5b)
export const TODAY_BAL = {
  need: 4,                    // deeds that close the day
  coinMin: 5,                 // coins per deed = this many minutes of the school's steady income (as the old daily tasks)
  themeCoinK: 2,              // the theme deed pays double
  stones: [2, 7],             // moonstones for the closed day = the streak (with today) clamped to [2, 7]
  forgiveDays: 7,             // one missed day per this many days is forgiven; any other missed day = one step back
  clsK: 1.10, gradK: 1.05, shopK: 1.25, cantK: 1.20, starsK: 2,   // theme effects
  shopN: 30, cantN: 30, starN: 5, orangeN: 5, questN: 3,          // deed sizes
  bookMax: 400,               // day lines kept in the save
};

let A = null;   // the game's api
const S = () => A.S();
const now = () => Date.now() + (window.__tdShift || 0) * 86400000;   // __tdShift (days): test clock only
const dKey = (t = now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const dNum = (t = now()) => { const d = new Date(t); return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime() / 86400000); };
const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---- class names in the forms the texts need (world 1); other classes get a neutral form
const CLS_W = {
  herbs: { g: 'Травологии', p: 'Травологии', s: 'День трав', why: 'в теплицах урожай' },
  potions: { g: 'Зельеварения', p: 'Зельеварении', s: 'День зелий', why: 'котлы кипят с рассвета' },
  stars: { g: 'Звездочётства', p: 'Звездочётстве', s: 'День звёзд', why: 'ночь обещает быть ясной' },
  charms: { g: 'Чар', p: 'Чарах', s: 'День чар', why: 'палочки сами просятся в руки' },
  flight: { g: 'Полётов', p: 'Полётах', s: 'День полётов', why: 'ветер сегодня попутный' },
  elements: { g: 'Магии стихий', p: 'Магии стихий', s: 'День стихий', why: 'стихии сегодня послушны' },
};

// ---- the day themes: built from what this school has, in a fixed order; day number mod count picks one (the same all day)
function themes() {
  const L = [], C = A.classes(), w1 = A.world() === 1;
  C.forEach((c, i) => {
    if (c.final || !A.isOpen(i)) return;
    const f = CLS_W[c.id] || { g: `класса «${c.name}»`, p: `классе «${c.name}»`, s: `День: ${c.name}`, why: 'учителя в ударе' };
    L.push({ id: 'c_' + c.id, i, e: c.emoji, name: `День ${f.g}`, short: `${c.emoji} ${f.s}`,
      say: `Доброе утро, директор! Сегодня день ${f.g}: ${f.why}. Уроки ${f.g} сегодня приносят на ${Math.round((TODAY_BAL.clsK - 1) * 100)}% больше.`,
      deed: { e: c.emoji, t: `Улучши что-нибудь в ${f.p}`, n: 1, k: 'buy', done: `Улучшение в ${f.p}`, past: f.g.startsWith('класса') ? `Улучшили ${f.p.replace(/^классе/, 'класс')}` : `Улучшили класс ${f.g}`, go: ['cls', i] } });
  });
  if (A.shopOpen()) L.push({ id: 'shop', e: '🛍️', name: 'Ярмарка в лавке', short: '🛍️ Ярмарка',
    say: 'В лавку завезли новые сладости — сегодня ярмарка! Ученики покупают охотнее.',
    deed: { e: '🛍️', t: `Пусть ${TODAY_BAL.shopN} учеников купят что-нибудь в лавке`, n: TODAY_BAL.shopN, k: 'shop', done: 'Ярмарка удалась', past: `В лавке продали ${TODAY_BAL.shopN} сладостей`, go: ['shop'] } });
  if (A.cantOpen()) L.push({ id: 'cant', e: '🍲', name: 'Пир в столовой', short: '🍲 Пир',
    say: `Уголёк с утра у плиты: сегодня пир в столовой! Обеды сегодня дороже на ${Math.round((TODAY_BAL.cantK - 1) * 100)}%.`,
    deed: { e: '🍲', t: `Пусть ${TODAY_BAL.cantN} учеников пообедают в столовой`, n: TODAY_BAL.cantN, k: 'cant', done: 'Пир в столовой', past: `В столовой пообедали ${TODAY_BAL.cantN} учеников`, go: ['cant'] } });
  if (w1 && A.obsBuilt()) L.push({ id: 'sfall', e: '🌠', name: 'Ночь звездопада', short: '🌠 Звездопад',
    say: 'Звездочёт Лун говорит: этой ночью звездопад! Звёзд на небе будет вдвое больше.',
    deed: { e: '🌠', t: `Поймай ${TODAY_BAL.starN} падающих звёзд у обсерватории`, n: TODAY_BAL.starN, k: 'star', done: 'Звёзды пойманы', past: 'Ловили падающие звёзды', go: ['obs'] } });
  { const n = A.gradN(); L.push({ id: 'grad', e: '🎓', name: 'День выпускников', short: '🎓 Выпускной',
    say: `Сегодня день выпускников, директор! Родители приехали на праздник — все уроки сегодня приносят на ${Math.round((TODAY_BAL.gradK - 1) * 100)}% больше.`,
    deed: { e: '🎓', t: `Выпусти ${A.fmt(n)} учеников`, n, k: 'grad', done: 'Выпускной удался', past: `На выпускном было ${A.fmt(n)} учеников`, go: ['grad'] } }); }
  return L;
}
function themeOf(T) {
  const L = themes(); let th = L.find((x) => x.id === T.th);
  if (!th) { th = L[((T.dn % L.length) + L.length) % L.length]; T.th = th.id; }
  return th;
}

// ---- the deeds of the day (any TODAY_BAL.need of them)
function deeds(T) {
  const th = themeOf(T), w1 = A.world() === 1, night = A.moonNight(), orch = w1 && A.anxBuilt('orchard');
  const L = [{ id: 'theme', ...th.deed, theme: 1 }];
  if (w1) L.push(orch && !night
    ? { id: 'harv', e: '🍊', t: 'Собери урожай в саду', unit: 'апельсинов', n: TODAY_BAL.orangeN, k: 'harv', done: 'Урожай собран', past: 'Собрали апельсины', go: ['orchard'] }
    : { id: 'harv', e: '🌙', t: 'Собери плоды Лунного древа', n: 1, k: 'harv', done: 'Плоды собраны', past: 'Собрали плоды Лунного древа', go: ['moon'] });
  L.push({ id: 'chest', e: '🎁', t: 'Открой сундучки дня', n: 1, k: 'chest', done: 'Сундучки открыты', past: 'Открыли сундучки', go: ['chest'], btn: 'Открыть' });
  L.push({ id: 'quest', e: '📋', t: w1 ? `Выполни ${TODAY_BAL.questN} задания Тихона` : `Выполни ${TODAY_BAL.questN} задания`, n: TODAY_BAL.questN, k: 'quest', done: 'Задания выполнены', past: 'Выполнили задания', go: ['quests'], btn: 'Задания' });
  if (A.inspOn()) L.push({ id: 'insp', e: '🦅', t: 'Пройди проверку инспектора или проведи открытый урок', n: 1, k: 'insp', done: 'Проверка пройдена', past: T.medal ? `Инспектор поставил ${T.medal}` : 'Прошли проверку', wait: 'ждёт инспектора' });
  if (A.mates() > 0 || (T.n && T.n.gift)) L.push({ id: 'gift', e: '🤝', t: 'Подари подарок союзнику', n: 1, k: 'gift', done: 'Подарок отправлен', past: 'Порадовали союзников подарком', go: ['ally'], btn: 'Альянс' });
  if (A.mgAny()) L.push({ id: 'mg', e: '🧪', t: 'Сыграй партию в мини-игру', n: 1, k: 'mg', done: 'Партия сыграна', past: 'Сыграли партию в мини-игру', go: ['mg'], btn: 'Играть' });
  if (w1 && A.anxEv()) L.push({ id: 'anx', e: '✨', t: 'Загляни на событие у пристройки', n: 1, k: 'anx', done: 'Событие у пристройки', past: 'Побывали на событии у пристройки', wait: 'событие ещё не готово' });
  return L;
}
function have(T, d) {
  const n = T.n || {}, b = T.b || {}, s = S().stats || {};
  switch (d.k) {
    case 'buy': return n.buy || 0;
    case 'shop': return Math.max(0, (s.shop || 0) - (b.shop || 0));
    case 'cant': return Math.max(0, (s.cant || 0) - (b.cant || 0));
    case 'star': return n.star || 0;
    case 'grad': return Math.max(0, (s.graduated || 0) - (b.grad || 0));
    case 'harv': return Math.max(n.orange || 0, (s.moon || 0) - (b.moon || 0) > 0 ? d.n : 0);
    case 'chest': return A.chestDone() ? 1 : 0;
    case 'quest': return n.quest || 0;
    case 'insp': return n.insp || 0;
    case 'gift': return Math.max(n.gift || 0, (s.gifts || 0) - (b.gifts || 0));
    case 'mg': return n.mg || 0;
    case 'anx': return n.anx || 0;
  }
  return 0;
}

// ---- state: S.today (this world's day), meta.td (the streak, shared by the worlds: one player, one day), S.tdays (the book lines)
function st() {
  const s = S(); const k = dKey();
  if (!s.today || s.today.d !== k) {
    const st0 = s.stats || {};
    s.today = { d: k, dn: dNum(), th: '', c: {}, n: {}, b: { shop: st0.shop || 0, cant: st0.cant || 0, grad: st0.graduated || 0, moon: st0.moon || 0, gifts: st0.gifts || 0 }, t0: now() };
    themeOf(s.today); A.save();
  }
  return s.today;
}
const meta = () => { const m = A.meta(); return m.td || {}; };
function streakAt(T0, D) {   // what the streak becomes if day D is closed now; also what was forgiven / lost on the way
  const T = T0 || {}; let s = T.s || 0, fg = T.fg ?? -99, fz = 0, lost = 0;
  if (T.last == null) return { s: 1, fg, fz, lost, before: 0 };
  if (T.last >= D) return { s, fg, fz, lost, before: s - 1, same: 1 };
  for (let m = T.last + 1; m < D; m++) { if (m - fg >= TODAY_BAL.forgiveDays) { fg = m; fz++; } else { s = Math.max(0, s - 1); lost++; } }
  return { s: s + 1, fg, fz, lost, before: s };
}
const stonesFor = (s) => clamp(s, TODAY_BAL.stones[0], TODAY_BAL.stones[1]);
const coinsFor = (d) => Math.max(50, A.nice(A.perMin() * TODAY_BAL.coinMin)) * (d.theme ? TODAY_BAL.themeCoinK : 1);
const doneN = (T) => Object.keys(T.c || {}).length;

// ---- effects of the theme (read by game.js every time a price is computed: must be cheap)
let kCache = { t: 0, th: '' };
function curTheme() { const s = S(); if (!s || !s.today || s.today.d !== dKey()) return ''; return s.today.th; }
function k(kind, i) {
  if (!A || !S()) return 1;
  const t = performance.now(); if (t - kCache.t > 1000) { kCache = { t, th: curTheme() }; }
  const th = kCache.th; if (!th) return 1;
  if (kind === 'cls') { let x = th === 'grad' ? TODAY_BAL.gradK : 1; const C = A.classes()[i]; if (C && th === 'c_' + C.id) x *= TODAY_BAL.clsK; return x; }
  if (kind === 'shop') return th === 'shop' ? TODAY_BAL.shopK : 1;
  if (kind === 'cant') return th === 'cant' ? TODAY_BAL.cantK : 1;
  return 1;
}
let starBase = null;
function starsFx() {   // «Ночь звездопада»: the observatory's event drops twice as many stars
  const B = A.annexBal && A.annexBal(); if (!B || !B.obs) return;
  if (!starBase) starBase = { d: B.obs.starsDay, n: B.obs.starsNight };
  const x = curTheme() === 'sfall' ? TODAY_BAL.starsK : 1;
  B.obs.starsDay = Math.round(starBase.d * x); B.obs.starsNight = Math.round(starBase.n * x);
}

// ---- progress: events from the game (statistics events, annex deeds, purchases) and polled counters
function sev(name, x) {   // every STATS.ev of the game passes here first
  if (!A || !S() || A.ffwd()) return; x = x || {};
  const T = st(), n = (T.n ||= {});
  if (name === 'mg' && x.sc > 0) n.mg = (n.mg || 0) + 1;
  else if (name === 'insp' && x.m > 0) { n.insp = (n.insp || 0) + 1; T.medal = ['', 'бронзу', 'серебро', 'золото'][x.m] || ''; }
  else if (name === 'ol') n.insp = (n.insp || 0) + 1;
  else if (name === 'quest' && !String(x.k || '').startsWith('day:')) n.quest = (n.quest || 0) + 1;
  else if (name === 'annex' && x.k === 'ev_end' && x.a === 'obs') n.star = (n.star || 0) + (x.n || 0);
  else return;
  tick(true);
}
function annexDeed(kind, id, cnt) {   // window.dayDeed from js/annex.js
  if (!A || !S() || A.ffwd()) return;
  const T = st(), n = (T.n ||= {});
  if (kind === 'annex_harvest') n.orange = (n.orange || 0) + (cnt || 0);
  else if (kind === 'annex_event') n.anx = (n.anx || 0) + 1;
  else return;
  tick(true);
}
function buy(act, i) {   // a purchase in a room panel: the class day counts upgrades of its class
  if (!A || !S()) return; const T = st(), th = themeOf(T);
  if (th.i === i && i >= 0 && /^(teacher|desk|expand|time|item|corrb)$/.test(act || '')) { (T.n ||= {}).buy = ((T.n.buy) || 0) + 1; tick(true); }
}
let tickT = 0;
function tick(force) {
  if (!A || !S() || A.edit()) return;
  const t = performance.now(); if (!force && t - tickT < 1000) return; tickT = t;
  const T = st(); themeOf(T); starsFx();
  for (const d of deeds(T)) if (!T.c[d.id] && have(T, d) >= d.n) done(T, d);
  if (!T.am && !A.ffwd() && A.ch1() && !A.hasIq('td_am')) A.iq('news', 'td_am', amPanel, { pre: () => { if (st().am) return false; st().am = 1; A.save(); return true; } });
  hudKey = '';
}
function done(T, d) {
  T.c[d.id] = 1; const r = coinsFor(d), live = !A.ffwd();
  A.bonus(r); A.war('dq');
  const n = doneN(T);
  A.stats('today', { d: DEED_IDS.indexOf(d.id), n, th: themes().findIndex((x) => x.id === T.th) });
  if (live) A.toast(`✅ ${d.done} · +🪙${A.fmt(r)}`);
  if (n >= TODAY_BAL.need && !T.closed) closeDay(T);
  A.save(); A.refresh();
}
const DEED_IDS = ['theme', 'harv', 'chest', 'quest', 'insp', 'gift', 'mg', 'anx'];
function closeDay(T) {
  const m = A.meta(), td = (m.td ||= {}), D = T.dn, P = streakAt(td, D);
  T.closed = now(); T.s = P.s;
  if (!P.same) { td.s = P.s; td.last = D; td.fg = P.fg; td.best = Math.max(td.best || 0, P.s); A.metaPut(m); }
  const n = stonesFor(P.s), paid = A.stones(n, 'td_' + T.d);   // one prize a day for both worlds
  T.st = paid ? n : 0;
  A.war('day'); A.stats('today', { c: 1, s: P.s, st: T.st, fz: P.fz, lo: P.lost });
  writeLine(T);
  A.glog('imp', `☀️ День удался! ${T.st ? `🔮 +${T.st}` : ''}`.trim());
  if (!A.ffwd()) A.iq('cel', 'td_done', celPanel);
}
function writeLine(T) {   // the line in the book «Твоя школа»
  const s = S(), th = themeOf(T), g = Math.max(0, (s.stats.graduated || 0) - (T.b.grad || 0)), L = deeds(T).filter((d) => T.c[d.id]);
  const parts = [];
  if (g > 0) parts.push(`Выпустили ${A.fmt(g)} ${plural(g, 'ученика', 'ученика', 'учеников')}.`);
  for (const d of L) { if (d.k === 'harv' && T.n.orange) parts.push(`Собрали ${T.n.orange} ${plural(T.n.orange, 'апельсин', 'апельсина', 'апельсинов')}.`); else if (d.k === 'star') parts.push(`Поймали ${T.n.star} ${plural(T.n.star, 'звезду', 'звезды', 'звёзд')}.`); else parts.push(d.past + '.'); }
  (s.tdays ||= []).push({ t: T.closed, th: `${th.e} ${th.name}`, x: parts.join(' ') });
  if (s.tdays.length > TODAY_BAL.bookMax) s.tdays.splice(0, s.tdays.length - TODAY_BAL.bookMax);
}

// ---- the bar in the top row (replaces «🌟 Уровень N»)
let hudKey = '';
function hud(top) {
  if (!A || !S()) return; top = top || document.getElementById('top'); if (!top) return;
  let el = document.getElementById('tdbar');
  if (!el) { top.style.flexWrap = 'wrap'; el = document.createElement('button'); el.id = 'tdbar'; el.dataset.today = ''; el.setAttribute('aria-label', 'Сегодня');
    el.style.cssText = 'flex:1 0 100%;display:flex;align-items:center;gap:7px;background:none;border:0;padding:2px 6px 0;color:#fff;font:800 12px ui-rounded,"Nunito",sans-serif;text-shadow:0 1px 2px #3a2a7a66;cursor:pointer';
    top.appendChild(el); }
  const T = st(), th = themeOf(T), n = Math.min(TODAY_BAL.need, doneN(T)), ic = A.moonNight() ? '🌙' : '☀️', all = deeds(T).length;
  const key = [ic, n, T.closed ? 1 : 0, th.id, all].join('|'); if (key === hudKey && el.dataset.k === key) return; hudKey = key; el.dataset.k = key;
  const seg = Array.from({ length: TODAY_BAL.need }, (_, j) => `<span style="flex:1;max-width:26px;height:7px;border-radius:4px;background:${j < n ? 'linear-gradient(90deg,#ffe08a,#ffc24d)' : '#ffffff40'}"></span>`).join('');
  el.innerHTML = A.emojiHtml(`${ic} <span>Сегодня</span>`) + `<span style="display:flex;gap:3px;flex:1;max-width:116px">${seg}</span>`
    + A.emojiHtml(`<span style="font-size:11px;opacity:.95">${T.closed ? '✓ день удался' : `${n} из ${TODAY_BAL.need}`}</span><span style="margin-left:auto;font-size:11px;opacity:.95;white-space:nowrap">${th.short}</span>`);
}

// ---- windows
const goBtn = (d) => { if (!d.go) return d.wait ? `<span class="qsub" style="white-space:nowrap">— ${d.wait}</span>` : ''; return `<button class="btn small go" data-tdgo="${d.id}">${d.btn || 'Перейти'}</button>`; };
function listHtml() {
  const T = st(), th = themeOf(T), L = deeds(T), td = meta(), P = streakAt(td, T.dn), n = doneN(T);
  const mid = new Date(now()); mid.setHours(24, 0, 0, 0); const left = Math.max(0, mid - now()), hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
  const sNow = T.closed ? P.s : P.before, today = stonesFor(T.closed ? (T.s || P.s) : P.s), tomorrow = stonesFor((T.closed ? (T.s || P.s) : P.s) + 1);
  const ST = A.stImg(16);
  const head = T.closed
    ? `<div class="qbig ok">${A.stImg(24)}<span style="flex:1">День удался!${T.st ? ` Получено ${T.st} ${plural(T.st, 'лунный камень', 'лунных камня', 'лунных камней')}.` : ''} Остальные дела ещё приносят монеты.</span></div>`
    : `<div class="qbig">${A.stImg(24)}<span style="flex:1">Сделай любые ${TODAY_BAL.need} дела — получишь ${ST} ${today}</span><span class="qp">${n}/${TODAY_BAL.need}</span></div>`;
  const ser = `<div class="qnote">Серия: ${sNow} ${plural(sNow, 'день', 'дня', 'дней')} подряд · завтра будет ${ST} ${tomorrow}${!T.closed && P.fz ? ' · пропущенный день прощён' : ''}${!T.closed && P.lost ? ` · пропуски отняли ${P.lost} ${plural(P.lost, 'шаг', 'шага', 'шагов')}` : ''}</div>`;
  const rows = L.map((d) => { const got = !!T.c[d.id], h = Math.min(d.n, have(T, d));
    return `<div class="q ${got ? '' : ''}"><span class="qi">${got ? '✅' : d.e}</span><span class="qt">${esc(d.t)}${!got && d.n > 1 ? ` <span class="qp">${A.fmt(h)}/${A.fmt(d.n)}${d.unit ? ' ' + d.unit : ''}</span>` : ''}${d.theme ? '<span class="qsub">дело дня</span>' : ''}</span>
      ${got ? '<span class="done">готово</span>' : `<span class="qgo"><span class="qr">🪙${A.fmt(coinsFor(d))}</span>${goBtn(d)}</span>`}</div>`; }).join('');
  return `${head}${ser}<div class="card"><span class="remoji">${A.world() === 1 ? '🐢' : '📜'}</span><div class="grow"><b>${th.e} ${esc(th.name)}</b><div class="muted">«${esc(th.say)}»</div></div></div>
    <div class="qbar">${rows}</div><div class="qnote">Осталось до полуночи: ${hh} ч ${mm} мин</div>`;
}
function panel() {
  A.qStyle(); const T = st(), th = themeOf(T);
  return `<div class="sh-head"><span class="remoji big">${A.moonNight() ? '🌙' : '☀️'}</span><div><h2>Сегодня</h2><div class="muted">${th.e} ${esc(th.name)}</div></div><button class="x" data-close>✕</button></div>${listHtml()}`;
}
function amPanel() {   // the morning plate: Tikhon names the day theme
  const T = st(), th = themeOf(T);
  return `<div class="sh-head">${A.world() === 1 ? A.tikhonPic(56) : '<span class="remoji big">📜</span>'}<div><h2>${th.e} ${esc(th.name)}</h2><div class="muted">${A.moonNight() ? '🌙' : '☀️'} Сегодня · сделай любые ${TODAY_BAL.need} дела</div></div><button class="x" data-close>✕</button></div>
    <div class="card up"><div class="grow">«${esc(th.say)}»</div></div>
    <div class="qnote">Особое дело дня: ${esc(th.deed.t)}.</div>
    <button class="btn hot wide" data-close style="margin-top:8px">Понятно</button>`;
}
function celPanel() {   // «☀️ День удался!»
  const T = st(), s = T.s || meta().s || 1;
  return `<div class="sh-head">${A.world() === 1 ? A.tikhonPic(56) : '<span class="remoji big">☀️</span>'}<div><h2>☀️ День удался!</h2><div class="muted">Сделано ${doneN(T)} ${plural(doneN(T), 'дело', 'дела', 'дел')} дня</div></div><button class="x" data-close>✕</button></div>
    <div class="card up"><div class="grow">«Хороший день, директор. Запишу его в летопись».</div></div>
    ${T.st ? `<div class="qbig ok">${A.stImg(24)}<span style="flex:1">+${T.st} ${plural(T.st, 'лунный камень', 'лунных камня', 'лунных камней')}</span></div>` : '<div class="qnote">Камни за сегодня уже получены в другом мире.</div>'}
    <div class="qnote">Серия: ${s} ${plural(s, 'день', 'дня', 'дней')} · завтра ${A.stImg(14)} ${stonesFor(s + 1)}. У фонтана во дворе зажглись фонарики.</div>
    ${A.loreOn() ? '<button class="btn wide" data-tdbook style="margin-top:8px">📜 Прочитать в летописи</button>' : ''}
    <button class="btn hot wide" data-close style="margin-top:8px">Ура!</button>`;
}
function click(d) {
  if (!A || !S()) return false;
  if (d.today !== undefined) { A.openPanel(panel); return true; }
  if (d.tdbook !== undefined) { A.closePanel(); A.book(bookId(S().tdays && S().tdays.length ? S().tdays[S().tdays.length - 1].t : now())); return true; }
  if (d.tdgo !== undefined) { const T = st(), x = deeds(T).find((q) => q.id === d.tdgo); if (x && x.go) A.go(x.go); return true; }
  return false;
}
const bookId = (t) => { const d = new Date(t); return `td${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; };

// ---- the evening party: lanterns around the fountain (drawn by game.js after the fountain) while today's day is closed
function drawFount(ctx, p, h) {
  if (!A || !S()) return; const T = S().today; if (!T || T.d !== dKey() || !T.closed) return;
  const t = performance.now() / 1000, lit = 1 - 0.55 * A.daylight(), N = 9, cx = p.x, cy = p.y - h * 0.12, rx = h * 0.95, ry = h * 0.38;
  ctx.save();
  for (let k = 0; k < N; k++) {
    const an = k * Math.PI * 2 / N + 0.2, x = cx + Math.cos(an) * rx, y = cy + Math.sin(an) * ry - h * 0.32 + Math.sin(t * 1.3 + k) * 1.5, sw = Math.sin(t * 1.7 + k * 0.9) * 0.12;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 * lit; const g = h * 0.42; ctx.drawImage(A.glow('255,180,80'), x - g / 2, y - g / 2, g, g);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sw); const w = h * 0.075, hh = h * 0.1;
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -hh * 0.5); ctx.lineTo(0, -hh * 0.95); ctx.stroke();
    ctx.fillStyle = k % 3 === 0 ? '#ff8a3d' : k % 3 === 1 ? '#ffc24d' : '#ff6b6b'; ctx.beginPath(); ctx.ellipse(0, 0, w, hh * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,244,200,${0.35 + 0.5 * lit})`; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, hh * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b3a1a'; ctx.fillRect(-w * 0.55, -hh * 0.55, w * 1.1, hh * 0.14); ctx.fillRect(-w * 0.45, hh * 0.42, w * 0.9, hh * 0.12);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'lighter';   // the students' little lights rising over the fountain
  for (let k = 0; k < 14; k++) { const u = ((t * 0.22 + k / 14) % 1), an = k * 2.39, x = cx + Math.cos(an) * rx * 0.7 + Math.sin(t + k) * 4, y = cy - h * 0.2 - u * h * 1.3;
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.8 * (0.5 + 0.5 * lit); const r = h * 0.05; ctx.drawImage(A.glow('255,220,140'), x - r, y - r, r * 2, r * 2); }
  ctx.restore();
}

// ---- the book «Твоя школа»: day lines grouped by month (lore.js shows them as pages «☀️ Хорошие дни · ноябрь 2026»)
function book() { const s = S(); return (s && s.tdays) || []; }

export function initToday(api) {
  A = api;
  window.dayDeed = (k0, id, n) => { try { annexDeed(k0, id, n); } catch (e) { console.error('today', e); } };
  window.__today = {   // test hooks
    st: () => st(), deeds: () => deeds(st()).map((d) => ({ id: d.id, t: d.t, have: have(st(), d), n: d.n, got: !!st().c[d.id] })), themes: () => themes().map((x) => x.id), theme: () => themeOf(st()),
    meta: () => meta(), streakAt: (T, D) => streakAt(T, D), tick: () => tick(true), k: (kind, i) => k(kind, i), sev: (n, x) => sev(n, x), dnum: () => dNum(), BAL: TODAY_BAL, panel: () => A.openPanel(panel),
    setTheme: (id) => { const T = st(); T.th = id; themeOf(T); kCache.t = 0; tick(true); return T.th; }, court: () => A.court && A.court(), book: () => book(),
  };
  setInterval(() => { try { if (S()) { tick(false); hud(); } } catch (e) { console.error('today', e); } }, 1000);   // the bar follows the deeds and the night
  const tap = (stats) => { if (!stats || stats.__td) return stats; const e0 = stats.ev; stats.ev = function (n, x) { try { sev(n, x); } catch (e) { console.error('today', e); } return e0.call(this, n, x); }; stats.__td = 1; return stats; };
  return { k, hud, body: () => listHtml(), tick: () => { try { tick(false); } catch (e) { console.error('today', e); } }, buy, click, drawFount, tap, book, panel: () => panel, sev };
}
