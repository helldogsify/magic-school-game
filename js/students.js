// Student path, stage 1 «На пороге» + stage 2 parts (Ruslan 2026-11-26: «С предложениями согласен», «да»; tools/_patch/students_s8a.py).
// - Two-part names: a first name (data.js NAMES) + a per-species surname/epithet (NAME_PARTS below, PLACEHOLDERS: texts by Maria).
//   New students get one at the gate; existing students get one lazily, chosen by their id (stable, no save change needed).
// - Student card: a tap on a student (or a newcomer waiting at the gate) opens a small card: name, species, rank, favourite class,
//   mood, what they are doing now, their next exam chance, «⭐ В любимчики» (up to FAV_MAX, S.favs = ids; a heart over them on the map).
// - Favourite class of the species (lore/canon.md): +FAV_EXAM lesson-exam chance and +FAV_MOOD mood per lesson there.
// - Favourites' path: their passed / failed lessons, new rank, graduation, leaving come as short named toasts (in the 🔔 list).
// - Gifted newcomers («одарённый новичок»): rolled when a newcomer joins the gate crowd, more often with a better rating; sparkles,
//   +GIFT_RANK on every rank exam; wait at the gate ×GIFT_WAIT longer.
// - Stage 3 (Ruslan «да»): rank rules unchanged for everyone; only a ⭐ favourite who just FAILED a rank exam gets the offer
//   «🔁 Пересдать за 🪙X» (toast -> card): paid, he goes back to the SAME class at his next way to a class (at once when he is walking
//   to a door or standing in a door line), takes the lesson again under the normal queue rules, then the same rank exam at the same
//   chance; once per class per student (a.rtd); cancelled with the money back if the class closes or his rank changed meanwhile.
//   The card says whether he can still grow (a class ahead holds the exam one step above his rank).
// - Visible demand at the gate: up to GATE_PEND (game.js) newcomers stand outside the gate; each waits CROWD_WAIT s of play time, then
//   leaves quietly (no review, no refund, no penalty), counted as «ушли, не дождавшись» with the fee they would have paid. A small
//   counter over the gate; the plate «🚪 У ворот ждут …» only after PLATE_T s of sustained jam (Ruslan's fear, registry §5b).
// Everything the module needs from game.js comes through `api` (getters, so the order of declarations there does not matter).

// ---- tuning constants (starting values; final numbers in the economy check, registry §5b) ----
const FAV_MAX = 5;            // favourites at most
const FAV_EXAM = 0.05;        // + lesson-exam chance in the species' favourite class (absolute)
const FAV_MOOD = 3;           // + mood after every lesson in the favourite class (passed or not)
const FAV_TOAST_GAP = 60;     // s: a favourite's passed/failed toast at most once per this time (rank, graduation, leaving: always)
const GIFT_P0 = 0.01, GIFT_P1 = 0.03;   // chance of a gifted newcomer: GIFT_P0 at rating <= 3★, growing linearly to GIFT_P1 at 5★
const GIFT_GAP = 180;         // s of play time between two gifted newcomers at least (a big school gets hundreds of arrivals a minute)
const GIFT_RANK = 0.10;       // + chance on every rank exam (absolute)
const GIFT_WAIT = 2;          // a gifted newcomer waits this many times longer at the gate
const CROWD_WAIT = 180;       // s of play time a newcomer waits at the gate before leaving quietly
const PLATE_T = 60;           // s of sustained jam before the plate replaces the small counter
const PLATE_OFF = 10;         // s without a jam that end the episode (the timer restarts)
const LEFT_WIN = 600;         // s: «ушли, не дождавшись» on the plate counts the last 10 min of play time
const RT_LESSONS = 4;         // stage 3: a favourite's rank-exam retake costs this many lessons of that class (then the pace floor, paced(…, 1))

// ---- favourite class per species (lore/canon.md, registry C6.1-C6.4); world-2 species have no canon page yet ----
const FAV_CLASS = { mothfox: 'charms', petalear: 'herbs', fernhorn: 'elements', starwhisker: 'flight' };

// ---- PLACEHOLDER TEXTS: texts by Maria (surname / epithet parts per species, gender-neutral on purpose; >= 15 each) ----
const NAME_PARTS = {
  mothfox: ['Пыльцекрыл', 'Искрохвост', 'Светокрыл', 'Ярколап', 'Звонкокрыл', 'Медоус', 'Цветохвост', 'Лучекрыл', 'Златопыл', 'Огнекрыл', 'Сверкохвост', 'Пёстрокрыл', 'Луговей', 'Ветроус', 'Радугокрыл', 'Росохвост'],
  petalear: ['Тихоух', 'Листоух', 'Мохолап', 'Росоух', 'Травоух', 'Шелестоух', 'Лепестоух', 'Чуткоух', 'Мятоух', 'Клеверолап', 'Тишелап', 'Цветоух', 'Ландышеух', 'Папоротнолап', 'Зеленоух', 'Тёплолап'],
  fernhorn: ['Громохвост', 'Крепкорог', 'Камнелоб', 'Огнерог', 'Дуборог', 'Пламелоб', 'Скалолап', 'Корнерог', 'Твердолап', 'Жаролоб', 'Буреног', 'Кремнерог', 'Лесорог', 'Сосноног', 'Искророг', 'Вулканчик'],
  starwhisker: ['Ветроух', 'Облакокрыл', 'Звездоус', 'Небокрыл', 'Лёгкокрыл', 'Весноух', 'Порхокрыл', 'Тучкокрыл', 'Высокрыл', 'Ветрохвост', 'Зарекрыл', 'Пухокрыл', 'Лунокрыл', 'Вьюнокрыл', 'Синекрыл', 'Радужоус'],
  mossmole: ['Мохокоп', 'Тихокоп', 'Фонареус', 'Глубокоп', 'Корнекоп', 'Землерой', 'Мшистолап', 'Темнокоп', 'Светоус', 'Норокоп', 'Грибоус', 'Камнекоп', 'Влажнолап', 'Сумракоп', 'Тоннелец', 'Рыхлолап'],
  owlbat: ['Сумракрыл', 'Ночеглаз', 'Тенекрыл', 'Лунноглаз', 'Мракоух', 'Тихолёт', 'Совокрыл', 'Звездоглаз', 'Полуночник', 'Эхоух', 'Сонокрыл', 'Темнопер', 'Ухокрыл', 'Сводолёт', 'Пещеролёт', 'Мглокрыл'],
  quartzhog: ['Кварцеспин', 'Иглоблеск', 'Друзоспин', 'Гранелап', 'Искроиг', 'Хрустальник', 'Блескоспин', 'Камнеиг', 'Сверкоиг', 'Светоспин', 'Кремнеспин', 'Гранитик', 'Аметистик', 'Колкоспин', 'Лучеиг', 'Самоцветик'],
  batbunny: ['Медноух', 'Звоноух', 'Прыгоух', 'Латуноух', 'Блестоух', 'Бронзолап', 'Колокоух', 'Скокоух', 'Чеканоух', 'Рыжеух', 'Искроух', 'Монетоух', 'Звяколап', 'Пружиноух', 'Жестяноух', 'Котелкоух'],
  geosnail: ['Медленец', 'Неспешник', 'Ракушник', 'Друзовик', 'Самоцветник', 'Тихоползь', 'Блескораковин', 'Каменноспин', 'Сводоползь', 'Жеодовик', 'Камнедом', 'Светораковин', 'Гладкоспин', 'Мерцаползь', 'Кварцедом', 'Ползунец'],
  axolotl: ['Озерник', 'Жаброус', 'Плескохвост', 'Глубинник', 'Розожабр', 'Водохвост', 'Струйник', 'Подземник', 'Ключевик', 'Омутник', 'Пузырёк', 'Тинохвост', 'Светожабр', 'Родничок', 'Волнохвост', 'Каплехвост'],
};

export function initStudents(api) {
  const S = () => api.S();
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const hash = (n) => { let x = (n | 0) * 2654435761; x ^= x >>> 15; return Math.abs(x | 0); };
  const partOf = (sp, id) => { const L = NAME_PARTS[sp]; return L ? L[hash(id) % L.length] : ''; };
  const spName = (sp) => (api.spNames()[sp] || '');
  let clock = 0;                   // play seconds seen by step() (sim and live; not the offline catch-up)

  // ---------------- names ----------------
  function full(a) {   // «Пуговка Ромашкина»: first name + the species' part; records without a species (parents, old helpers) stay as they are
    if (!a) return '';
    if (!a.fn && a.sp && NAME_PARTS[a.sp] && a.id !== undefined && a.id !== null && a.id >= 0) a.fn = partOf(a.sp, a.id);
    return a.fn && a.name ? `${a.name} ${a.fn}` : (a.name || '');
  }
  function anyName(i = -1) {   // a real student of class i (or of the school) for letters; a made-up full name when the school is empty
    const L = api.inSchool().filter((a) => api.isStudent(a)), C = i >= 0 ? L.filter((a) => a.c === i || (a.goal && a.goal.i === i)) : [];
    const a = rnd(C.length ? C : L);
    if (a) return full(a);
    const sp = rnd(api.species()); return `${rnd(api.names())} ${rnd(NAME_PARTS[sp] || [''])}`.trim();
  }

  // ---------------- favourites ----------------
  const favs = () => { const s = S(); if (!s) return []; if (!Array.isArray(s.favs)) s.favs = []; return s.favs; };
  const isFav = (id) => id !== undefined && favs().includes(id);
  function toggleFav(id) {
    const F = favs(), k = F.indexOf(id);
    if (k >= 0) { F.splice(k, 1); api.save(); return true; }
    if (F.length >= FAV_MAX) { api.toast(`⭐ Любимчиков уже ${FAV_MAX}: сначала убери кого-нибудь`); return false; }
    F.push(id); api.save(); api.stats('fav', { n: F.length }); return true;
  }
  const dropFav = (id) => { const F = favs(), k = F.indexOf(id); if (k >= 0) F.splice(k, 1); };
  let pruneT = 0, missing = {};
  function pruneFavs() {   // a favourite who is no longer in the school (graduated, left, moved to the tower) drops off the list
    const F = favs(); if (!F.length) return; const ids = new Set(api.agents().map((a) => a.id));
    for (const id of [...F]) { if (ids.has(id)) { delete missing[id]; continue; } missing[id] = (missing[id] || 0) + 1; if (missing[id] >= 2) { dropFav(id); delete missing[id]; } }
  }
  const favCls = (a) => { const id = FAV_CLASS[a && a.sp]; return id ? api.classes().findIndex((c) => c.id === id) : -1; };

  // ---------------- exam hooks ----------------
  const examB = (a, i) => (api.world() === 1 && i >= 0 && favCls(a) === i ? FAV_EXAM : 0);
  const rankB = (a) => (a && a.gift ? GIFT_RANK : 0);
  function ev(a, k, i = -1) {   // moments of a student: favourite class mood, favourites' toasts, gifted stats
    if (!a) return;
    if ((k === 'pass' || k === 'fail') && i >= 0 && favCls(a) === i && api.world() === 1) a.mood = Math.min(100, (a.mood ?? 80) + FAV_MOOD);
    if (k === 'rankfail' && isFav(a.id) && api.world() <= 2 && !(a.rtd || []).includes(i)) a.rto = i;   // stage 3: the retake offer
    if (k === 'rank' && a.gift) api.stats('gifted', { k: 'rank', r: a.rk || 0 });
    if (k === 'grad' && a.gift) api.stats('gifted', { k: 'grad', r: a.rk || 0 });
    if (!isFav(a.id)) return;
    const n = full(a), cn = i >= 0 && api.classes()[i] ? api.classes()[i].name : '', quiet = api.ffwd();
    if (k === 'grad' || k === 'left') dropFav(a.id);
    if (quiet) return;
    if (k === 'pass' || k === 'fail') {
      if (clock - (a._ft ?? -1e9) < FAV_TOAST_GAP) return; a._ft = clock;
      api.glog('toast', k === 'pass' ? `💗 ${n}: «${cn}» — сдано 🎉` : `💗 ${n}: «${cn}» — не сдано, будет ещё попытка`);   // audit F8: only in the 🔔 list
    } else if (k === 'rank') api.toastBig(`💗 ${n}: новое звание — ${api.rankName(a)} 🌟`);
    else if (k === 'rankfail') { const t = `💗 ${n}: экзамен на звание «${api.rankNameAt(i)}» не сдан${rtOk(a) ? ' — можно пересдать (нажми)' : ''}`; api.toast(t); tapToast(t, a); }
    else if (k === 'grad') api.toastBig(`💗 ${n}: выпуск! 🎓`);
    else if (k === 'left') api.toast(`💔 ${n}: не хватило места, пришлось уйти из школы`);
  }

  // ---------------- stage 3: a favourite's rank-exam retake ----------------
  const rtPrice = (i) => api.rtPrice(i, RT_LESSONS);
  function rtOk(a) {   // the offer stands: a favourite, failed here, not used here yet, class open, still one step below, still a student here
    const i = a ? a.rto : -1; if (!(i >= 0) || !isFav(a.id) || (a.rtd || []).includes(i) || a.rt >= 0) return false;
    if (!api.isOpen(i) || (a.rk || 0) !== api.rankAt(i) - 1 || a.retake) return false;
    const g = a.goal || {}; return g.t !== 'g' && g.t !== 'x' && a.state !== 'fly' && a.state !== 'vanish' && api.agents().includes(a);
  }
  function buyRt(a) {
    if (!rtOk(a)) { api.toast('Пересдача сейчас недоступна'); return false; }
    const i = a.rto, pr = rtPrice(i);
    if (!api.spend(pr)) return false;   // spend() says «Не хватает монет»
    a.rt = i; a.rtp = pr; (a.rtd ||= []).push(i); a.rto = -1;
    api.stats('retake', { i, r: a.rk || 0 });
    const now = api.retakeNow(a);   // walking to a door or standing in a door line: turns back at once; otherwise at his next way to a class
    api.toast(`🔁 ${full(a)} ${now ? 'идёт' : 'пойдёт'} пересдавать в «${api.classes()[i].name}»`); api.save(); return true;
  }
  function rtGo(a, i) {   // game.js goClass(): a paid retake turns the student to its class (cancelled with the money back when it cannot be taken)
    if (!a || !(a.rt >= 0)) return i;
    const t = a.rt;
    if (api.isOpen(t) && (a.rk || 0) === api.rankAt(t) - 1 && !a.retake) return t;
    a.rt = -1; if (a.rtp) { api.addCoins(a.rtp); if (!api.ffwd()) api.toast(`🔁 Пересдача ${full(a)} отменена, 🪙${api.fmt(a.rtp)} вернулись`); } a.rtp = 0;
    return i;
  }
  function rankAfter(a, i) {   // game.js finishLesson, right after rankTry(): a rank exam that was tried and not passed; a retake lesson is over
    if (a._rkT === i) { a._rkT = -1; ev(a, 'rankfail', i); }
    if (a.rt === i) { a.rt = -1; a.rtp = 0; }
  }
  function canGrow(a) {   // a class at or after his current one holds the rank exam one step above his rank
    const r = a.rk || 0; if (r >= 5) return false; if (a.rt >= 0 || rtOk(a)) return true;
    const C = api.classes(), g = a.goal || {}, from = g.i >= 0 ? g.i : a.c >= 0 ? a.c : 0;   // the class he studies in or goes to next
    for (let k = from; k < C.length; k++) if (api.rankAt(k) === r + 1) return true;
    return false;
  }
  function tapToast(t, a) {   // the toast opens the card (that is where the retake button is)
    try { const d = [...document.querySelectorAll('#fx .toast')].find((x) => x.dataset.t === t); if (d) { d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; d.onclick = () => open(a); } } catch (e) { /* only a convenience */ }
  }

  // ---------------- the gate crowd ----------------
  const gate = () => api.gate();
  function newcomer() {   // who stands at the gate: species, two-part name, gifted or not
    const sp = rnd(api.species()), o = { sp, name: rnd(api.names()), fn: rnd(NAME_PARTS[sp] || ['']), w: 0, ph: Math.random() * 6 };
    return o;
  }
  function crowd() {   // S.gate.crowd mirrors S.gate.pend (old saves: the counted newcomers get faces)
    const g = gate(); if (!Array.isArray(g.crowd)) g.crowd = [];
    const C = g.crowd; while (C.length < (g.pend || 0)) C.push(newcomer()); if (C.length > (g.pend || 0)) C.length = Math.max(0, g.pend || 0);
    return C;
  }
  const giftP = () => { const r = api.rating() || 0; return Math.max(GIFT_P0, Math.min(GIFT_P1, GIFT_P0 + (GIFT_P1 - GIFT_P0) * (r - 3) / 2)); };
  let giftAt = -1e9;
  function join() {   // a newcomer has just joined the crowd (game.js gateArrive, after pend++)
    const C = gate().crowd || (gate().crowd = []), o = newcomer();
    const force = window.__s8aGift ? (window.__s8aGift--, true) : false;   // test hook: the next N newcomers are gifted
    if (force || (clock - giftAt >= GIFT_GAP && Math.random() < giftP())) {
      o.gift = 1; giftAt = clock; M.gifted++;
      api.stats('gifted', { k: 'arr', r: Math.round((api.rating() || 0) * 10) });
      if (!api.ffwd() && !api.edit()) { const s0 = api.stats0(), t = `✨ У ворот одарённый новичок: ${o.name} ${o.fn} (${spName(o.sp).toLowerCase()})!`;   // audit F8: big toast only for the first 3
        s0.giftTb = (s0.giftTb || 0) + 1; if (s0.giftTb <= 3) api.toastBig(t); else api.glog('toast', t); }
    }
    C.push(o); crowd();
  }
  let admitted = null;
  function admit() { const C = gate().crowd || []; admitted = C.shift() || null; crowd(); }   // game.js gateLet, after pend-- (the first in line walks in; no sync before the shift, it would cut the last one)
  function dress(a) {   // spawn(): the newcomer who walks in is the one who waited at the gate
    const o = admitted; admitted = null;
    if (o) { a.sp = api.species().includes(o.sp) ? o.sp : a.sp; a.name = o.name || a.name; a.fn = o.fn; if (o.gift) { a.gift = 1; api.stats('gifted', { k: 'in', w: Math.round(o.w || 0) }); } }
    if (!a.fn) a.fn = rnd(NAME_PARTS[a.sp] || ['']) || undefined;
  }
  // quiet leavers: no review, no refund, no penalty; only counted (lifetime in S.stats, the last LEFT_WIN s for the plate)
  const gone = [];   // { t: clock, f: fee }
  const departing = [];   // for the eye: leavers walk off and fade
  const leftWin = () => { while (gone.length && clock - gone[0].t > LEFT_WIN) gone.shift(); return { n: gone.length, f: gone.reduce((s, o) => s + o.f, 0) }; };
  // sustained jam -> plate; measurement of Ruslan's fear (share of play time with the plate shown)
  let jamT = 0, offT = 0, plateOn = false, plateEp = 0, plateEpLeft = 0;
  const M = { t: 0, plate: 0, crowdT: 0, crowdMax: 0, left: 0, gifted: 0, episodes: 0, sumT: 0, sumPlate: 0, sumLeft: 0 };   // since the page load (test hook window.__s8a.m)
  const jamNow = () => api.gatePend() && (api.overfull() || !api.recRoom());
  function step(dt, live) {
    if (api.ffwd() || !(dt > 0)) {   // the offline catch-up: newcomers still leave, but nothing is shown or measured
      tickCrowd(dt, false); return;
    }
    clock += dt;
    tickCrowd(dt, true);
    if ((pruneT += dt) >= 5) { pruneT = 0; pruneFavs(); }
    // plate rule
    if (jamNow()) { jamT += dt; offT = 0; } else if ((offT += dt) >= PLATE_OFF) jamT = 0;
    // the plate means a real loss: a sustained jam AND somebody left without getting in during the last LEFT_WIN s (measured: Maria's
    // save has 12 waiting ~100 % of the time but nobody leaves - everyone gets in within the wait; then the small counter is enough)
    const on = jamT >= (window.__s8aPlateT ?? PLATE_T) && (leftWin().n > 0 || !!window.__s8aPlateT);
    if (on && !plateOn) { plateOn = true; plateEp = clock; plateEpLeft = M.left; M.episodes++; }
    else if (!on && plateOn) { plateOn = false; api.stats('gate', { k: 'plate', d: Math.round(clock - plateEp), n: M.left - plateEpLeft }); }
    const vis = !live || !document.hidden;
    if (vis) { M.t += dt; M.sumT += dt; const n = crowd().length; if (n) M.crowdT += dt; M.crowdMax = Math.max(M.crowdMax, n); if (plateOn) { M.plate += dt; M.sumPlate += dt; } }
    if (M.sumT >= 300) { api.stats('gate', { k: 'sum', t: Math.round(M.sumT), pl: Math.round(M.sumPlate), n: M.sumLeft }); M.sumT = 0; M.sumPlate = 0; M.sumLeft = 0; }
  }
  function tickCrowd(dt, shown) {
    const C = crowd(); if (!C.length) return;
    for (let k = C.length - 1; k >= 0; k--) {
      const o = C[k]; o.w = (o.w || 0) + dt;
      if (o.w < CROWD_WAIT * (o.gift ? GIFT_WAIT : 1)) continue;
      C.splice(k, 1); gate().pend = Math.max(0, (gate().pend || 0) - 1);
      const f = api.entryFee(), st = api.stats0(); st.gateLeft = (st.gateLeft || 0) + 1; st.gateLost = (st.gateLost || 0) + f;
      if (shown) { gone.push({ t: clock, f }); M.left++; M.sumLeft++; if (departing.length < 20) departing.push({ sp: o.sp, k, t: performance.now(), gift: o.gift }); }
      if (o.gift) { api.stats('gifted', { k: 'left', w: Math.round(o.w) }); if (shown && !api.edit()) api.toast(`💨 Одарённый новичок ${o.name} ${o.fn} не дождался места и ушёл`); }
    }
  }

  // ---------------- drawing ----------------
  // crowd places outside the gate: rows of 4 behind the gate tile (bigger y = further out), small stable jitter
  function crowdSpot(k) {
    const G = api.gateTile(), row = Math.floor(k / 4), col = k % 4, j = (hash(k + 7) % 100) / 100 - 0.5;
    return { x: G.x - 1.05 + col * 0.7 + (row % 2 ? 0.35 : 0) + j * 0.12, y: G.y + 0.55 + row * 0.62 + j * 0.1 };
  }
  function drawCrowd(add) {
    if (api.edit()) return;
    const C = crowd(), T = performance.now() / 1000;
    C.forEach((o, k) => { const p = crowdSpot(k); add(p.x, p.y, () => api.drawCreature({ sp: o.sp, back: true, flip: (k % 2) === 1, path: [], ph: (o.ph || 0) + T, gift: o.gift, _crowd: 1 }, p.x, p.y, 30)); });
    const now = performance.now();
    for (let k = departing.length - 1; k >= 0; k--) {
      const d = departing[k], u = (now - d.t) / 2200; if (u >= 1) { departing.splice(k, 1); continue; }
      const p = crowdSpot(d.k), x = p.x + u * 0.4, y = p.y + u * 1.6;
      add(x, y, () => { const c = api.ctx(); c.save(); c.globalAlpha = 1 - u; api.drawCreature({ sp: d.sp, back: false, flip: false, path: [1], ph: T * 3, gift: d.gift, _crowd: 1 }, x, y, 30); c.restore(); });
    }
  }
  function over(a, x, y, h) {   // drawCreature hook: a heart over a favourite, sparkles round a gifted student
    const fav = a.id !== undefined && !a._crowd && isFav(a.id);
    if (!fav && !a.gift) return;
    const c = api.ctx(), T = performance.now() / 1000 + (a.ph || 0);
    if (a.gift) {
      for (let k = 0; k < 3; k++) {
        const an = T * 1.1 + k * 2.09, px = x + Math.cos(an) * h * 0.42, py = y - h * 0.6 + Math.sin(an) * h * 0.3, tw = 0.5 + 0.5 * Math.sin(T * 4 + k * 1.9);
        api.star4(px, py, 1.6 + 2 * tw, '#ffe27a', 0.45 + 0.55 * tw);
      }
    }
    if (fav) { const bob = Math.sin(T * 3) * 1.2; c.save(); c.globalAlpha = 0.95; api.emoji('💗', x, y - h * 1.08 + bob, 9); c.restore(); }
  }
  // the gate: a small counter while newcomers wait, the plate after a sustained jam (tap = what to fix)
  let plateRect = null;
  function drawGate() {
    plateRect = null; if (api.edit()) return;
    const C = crowd(); if (!C.length && !plateOn) return;
    const G = api.gateTile(), g = api.P(Math.floor(G.x) + 1, G.y - 1), k = api.signK(), c = api.ctx();
    if (!api.onScreen(g.x, g.y - 80, 300, 300)) return;
    const top = g.y - (api.gateH() || 70) * 0.9 - 4 * k + Math.sin(performance.now() / 450) * 1.5 * k;
    if (!plateOn) {   // the small counter
      const fs = 8.5 * k, t = `у ворот ждут ${C.length}`; c.save(); c.font = `800 ${fs}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`;
      const ew = fs * 1.3, pad = 5 * k, bw = c.measureText(t).width + ew + pad * 2, bh = fs * 1.8, x = g.x - bw / 2, y = top - bh;
      c.fillStyle = 'rgba(255,252,240,0.92)'; c.strokeStyle = '#b89a6a'; c.lineWidth = 1.1 * k; c.beginPath(); c.roundRect(x, y, bw, bh, 7 * k); c.fill(); c.stroke();
      c.fillStyle = '#5a4630'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(t, x + pad + ew, y + bh / 2 + 0.5 * k); c.restore();
      api.emoji('🚶', x + pad + ew * 0.42, y + bh / 2, fs * 1.05);
      if (C.some((o) => o.gift)) api.emoji('✨', x + bw - pad * 0.3, y + 1.5 * k, fs * 1.15);   // audit F8: a gifted one waits
      plateRect = { x0: x, y0: y, x1: x + bw, y1: y + bh, t: performance.now(), plate: false };
      return;
    }
    const L = plateLines(), fs = 9.5 * k, lh = fs * 1.55; c.save(); c.font = `800 ${fs}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`;
    const ew = fs * 1.35, pad = 6 * k, wOf = (s) => c.measureText(s.replace('🪙', '')).width + (s.includes('🪙') ? fs * 1.15 : 0);
    const bw = Math.max(...L.map(wOf)) + ew + pad * 2.2, bh = lh * L.length + pad * 0.9, x = g.x - bw / 2, y = top - bh;
    c.fillStyle = '#fff3ea'; c.strokeStyle = '#d9534f'; c.lineWidth = 1.6 * k; c.beginPath(); c.roundRect(x, y, bw, bh, 8 * k); c.fill(); c.stroke();
    c.textBaseline = 'middle';
    L.forEach((s, n) => {   // a line may hold one 🪙 drawn as the game's emoji picture
      let cx = x + pad + ew; const cy = y + pad * 0.45 + lh * (n + 0.5); c.fillStyle = n ? '#7a3b3b' : '#9b2c2c'; c.textAlign = 'left';
      const [a0, b0] = s.split('🪙'); c.fillText(a0, cx, cy + 0.5 * k); if (b0 !== undefined) { cx += c.measureText(a0).width; api.emoji('🪙', cx + fs * 0.55, cy, fs * 0.95); cx += fs * 1.15; c.fillText(b0, cx, cy + 0.5 * k); }
    });
    c.restore(); api.emoji('🚪', x + pad + ew * 0.42, y + pad * 0.45 + lh * 0.5, fs * 1.1);
    plateRect = { x0: x, y0: y, x1: x + bw, y1: y + bh, t: performance.now(), plate: true };
  }
  function culprit() { if (!api.recRoom() && !api.overfull()) return { t: 'тормозит приёмная', go: ['REC', null] }; const b = api.fullClass(); return b >= 0 ? { t: `тормозят «${api.classes()[b].name}»`, go: api.fullGo(b) } : { t: 'классы не успевают', go: null }; }
  function plateLines() {
    const n = crowd().length, lw = leftWin(), cu = culprit();
    const L = [`У ворот ждут ${n} · ${cu.t}`];
    if (lw.n) L.push(`ушли, не дождавшись: ${lw.n} (−🪙${api.fmt(lw.f)})`);
    return L;
  }

  // ---------------- taps ----------------
  function crowdAt(wx, wy) {
    const C = crowd(); let best = -1, bd = 1e9;
    C.forEach((o, k) => { const p = crowdSpot(k), m = api.P(p.x, p.y), d = Math.hypot(wx - m.x, (wy - (m.y - 15)) * 0.8); if (d < 14 && d < bd) { bd = d; best = k; } });
    return best;
  }
  function tapTop(wx, wy) {   // before everything else: the plate/counter over the gate and the crowd outside it (nothing else stands there)
    const r = plateRect;
    if (r && performance.now() - r.t < 600 && wx >= r.x0 - 4 && wx <= r.x1 + 4 && wy >= r.y0 - 4 && wy <= r.y1 + 4) { api.openPanel(gatePanel); return true; }
    const k = crowdAt(wx, wy); if (k >= 0) { openCrowd(crowd()[k]); return true; }
    return false;
  }
  function tapStudent(wx, wy) {   // before the room: a tap right on a student (a seated student in class: only a favourite or a gifted one)
    let best = null, bd = 1e9;
    for (const a of api.agents()) {
      if (a.state === 'fly' || a.state === 'vanish' || a.mcls || !api.isStudent(a)) continue;
      if (a.state === 'study' && !(a.gift || isFav(a.id))) continue;
      const p = api.P(a.x, a.y), d = Math.hypot(wx - p.x, (wy - (p.y - 15 - (a.z || 0))) * 0.8);
      if (d < 11 && d < bd) { bd = d; best = a; }
    }
    if (!best) return false; open(best); return true;
  }

  // ---------------- panels ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const pct = (x) => Math.round(x * 100) + ' %';
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let cardId = null; const cards = {};
  function cardFn(id) { return (cards[id] ||= () => studentCard(id)); }
  function open(a) { cardId = a.id; full(a); api.openPanel(cardFn(a.id)); api.glog('tap', `карточка ученика ${full(a)}`); }
  function favBtn(a) {
    const on = isFav(a.id), n = favs().length;
    return on ? `<button class="btn wide ghost" data-stufav="${a.id}">💗 В любимчиках — убрать (${n}/${FAV_MAX})</button>`
      : `<button class="btn wide" data-stufav="${a.id}">⭐ В любимчики (${n}/${FAV_MAX})</button>`;
  }
  function studentCard(id) {
    const a = api.agents().find((x) => x.id === id);
    const head = (img, h2, sub) => `<div class="sh-head">${img ? `<img src="${img}" alt="" style="height:58px;width:auto;margin-right:6px">` : '<span class="remoji big">🎓</span>'}<div><h2>${esc(h2)}</h2><div class="muted">${sub}</div></div><button class="x" data-close>✕</button></div>`;
    if (!a || a.goal && (a.goal.t === 'g' || a.goal.t === 'x') || a.state === 'fly' || a.state === 'vanish') {
      const gr = a && a.goal && a.goal.t === 'g';
      return head('', a ? full(a) : 'Ученик', '') + `<p class="muted">${gr ? '🎓 Выпускник: идёт в сад выпускников.' : a && a.goal && a.goal.t === 'x' ? '💔 Уходит из школы: не хватило места.' : 'Этого ученика уже нет в школе.'}</p>`;
    }
    const C = api.classes(), fc = favCls(a), i = a.c >= 0 ? a.c : a.goal && a.goal.i >= 0 && C[a.goal.i] ? a.goal.i : -1;
    const row = (emo, b, sub = '') => `<div class="card up"><span class="remoji">${emo}</span><div class="grow"><b>${b}</b>${sub ? `<div class="muted">${sub}</div>` : ''}</div></div>`;
    let h = head(api.formImg(a), full(a), `${esc(spName(a.sp))} · ${esc(api.rankName(a))}`);
    if (a.gift) h += row('✨', 'Одарённый ученик', `+${Math.round(GIFT_RANK * 100)} % к каждому экзамену на звание`);
    if (api.world() === 1 && fc >= 0) h += row('💛', `Любимый класс: ${esc(C[fc].name)} · сдаёт лучше`, `там шанс экзамена +${Math.round(FAV_EXAM * 100)} % и после урока настроение лучше`);
    const m = Math.round(a.mood ?? 80); h += row(api.moodFace(m), `Настроение: ${m} %`);
    h += row('📍', 'Сейчас', esc(api.status(a)));
    if (i >= 0 && C[i]) {
      const ch = api.examChance(a, i), rk = api.rankNext(a, i);
      h += row('🎯', `Следующий экзамен: «${esc(C[i].name)}» — шанс ${pct(ch)}${fc === i ? ' 💛' : ''}`, rk ? `после него экзамен на звание «${esc(rk.name)}»: ${pct(rk.p + rankB(a))}${a.gift ? ' ✨' : ''}` : '');
    }
    const grow = canGrow(a); h += row(grow ? '✨' : '🌿', grow ? 'Может вырасти' : 'Дальше не вырастет', grow ? (a.rt >= 0 || rtOk(a) ? `можно пересдать экзамен на звание «${esc(api.rankNameRk((a.rk || 0) + 1))}»` : `впереди экзамен на звание «${esc(api.rankNameRk((a.rk || 0) + 1))}»`) : (a.rk || 0) >= 5 ? 'у него высшее звание' : 'экзаменов на следующее звание на его пути больше нет');
    if (a.rt >= 0 && C[a.rt]) h += row('🔁', `Пересдача: «${esc(C[a.rt].name)}»`, `снова пройдёт урок и попробует экзамен на звание «${esc(api.rankNameAt(a.rt))}»`);
    else if (rtOk(a)) h += `<button class="btn wide" data-sturt="${a.id}">🔁 Пересдать «${esc(C[a.rto].name)}» за 🪙${api.fmt(rtPrice(a.rto))}</button><p class="muted" style="margin:2px 4px 8px">Вернётся в этот класс, снова пройдёт урок и попробует экзамен на звание «${esc(api.rankNameAt(a.rto))}» с тем же шансом. Один раз на класс.</p>`;
    h += favBtn(a);
    h += `<p class="muted" style="margin-top:8px">Любимчики отмечены 💗 на карте, а о их успехах приходят короткие сообщения.</p>`;
    return h;
  }
  let crowdSel = null;
  function openCrowd(o) { crowdSel = o; api.openPanel(crowdCard); }
  function crowdCard() {
    const o = crowdSel, C = crowd(); if (!o || !C.includes(o)) return `<div class="sh-head"><span class="remoji big">🚶</span><div><h2>Новичок у ворот</h2></div><button class="x" data-close>✕</button></div><p class="muted">Этот новичок уже вошёл в школу или ушёл.</p>`;
    const max = CROWD_WAIT * (o.gift ? GIFT_WAIT : 1), cu = culprit(), jam = jamNow();
    let h = `<div class="sh-head"><img src="assets/creatures/${o.sp}.png" alt="" style="height:58px;width:auto;margin-right:6px"><div><h2>${esc(o.name)} ${esc(o.fn)}</h2><div class="muted">${esc(spName(o.sp))} · новичок у ворот</div></div><button class="x" data-close>✕</button></div>`;
    if (o.gift) h += `<div class="card up"><span class="remoji">✨</span><div class="grow"><b>Одарённый новичок</b><div class="muted">+${Math.round(GIFT_RANK * 100)} % к каждому экзамену на звание. Ждёт дольше обычного, но и он уйдёт, если места так и не будет.</div></div></div>`;
    const fc = FAV_CLASS[o.sp] ? api.classes().findIndex((c) => c.id === FAV_CLASS[o.sp]) : -1;
    if (api.world() === 1 && fc >= 0) h += `<div class="card up"><span class="remoji">💛</span><div class="grow"><b>Любимый класс: ${esc(api.classes()[fc].name)}</b></div></div>`;
    h += `<div class="card up"><span class="remoji">⏳</span><div class="grow"><b>Ждёт у ворот ${mmss(o.w)}</b><div class="muted">${jam ? `уйдёт через ${mmss(max - o.w)}, если не освободится место (${esc(cu.t)})` : 'скоро войдёт'}</div></div></div>`;
    if (jam && cu.go) h += `<button class="btn wide" data-stugo="1">Разобраться ➜</button>`;
    return h;
  }
  function gatePanel() {   // tap on the counter / plate over the gate
    const C = crowd(), lw = leftWin(), cu = culprit(), jam = jamNow(), st = api.stats0();
    let h = `<div class="sh-head"><span class="remoji big">🚪</span><div><h2>У ворот школы</h2><div class="muted">новички, которые хотят учиться</div></div><button class="x" data-close>✕</button></div>`;
    h += `<div class="card up"><span class="remoji">🚶</span><div class="grow"><b>Ждут у ворот: ${C.length}</b>${C.some((o) => o.gift) ? ' <span class="muted">· среди них одарённый ✨</span>' : ''}<div class="muted">${jam ? `Войти не могут: ${esc(cu.t)}. Каждый ждёт до ${Math.round(CROWD_WAIT / 60)} мин, потом уходит.` : 'Скоро войдут.'}</div></div></div>`;
    h += `<div class="card up"><span class="remoji">💨</span><div class="grow"><b>Ушли, не дождавшись: ${lw.n} за 10 мин</b><div class="muted">${lw.n ? `не заплатили за поступление примерно 🪙${api.fmt(lw.f)}` : 'никто'} · всего ${api.fmt(st.gateLeft || 0)}</div></div></div>`;
    if (jam && cu.go) h += `<button class="btn wide" data-stugo="1">Разобраться ➜</button>`;
    return h;
  }
  function recCard() {   // reception panel: the gate line and the favourites
    const C = crowd(), lw = leftWin(), F = favs().map((id) => api.agents().find((a) => a.id === id)).filter(Boolean);
    let h = '';
    if (C.length || lw.n) h += `<div class="card up"><span class="remoji">🚶</span><div class="grow"><b>У ворот ждут: ${C.length}</b><div class="muted">ушли, не дождавшись, за 10 мин: ${lw.n}${lw.n ? ` (−🪙${api.fmt(lw.f)})` : ''}</div></div></div>`;
    if (F.length) h += `<h3>💗 Любимчики</h3>` + F.map((a) => `<div class="card up"><span class="remoji">${a.gift ? '✨' : '💗'}</span><div class="grow"><b>${esc(full(a))}</b><div class="muted">${esc(api.rankName(a))} · ${esc(api.status(a))}</div></div><button class="btn small" data-stucard="${a.id}">Карточка</button></div>`).join('');
    return h;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-stufav],[data-stucard],[data-stugo],[data-sturt]'); if (!b) return;
    if (b.dataset.sturt !== undefined) { const a = api.agents().find((x) => x.id === +b.dataset.sturt); if (a) buyRt(a); api.refresh(); return; }
    if (b.dataset.stufav !== undefined) { toggleFav(+b.dataset.stufav); api.refresh(); return; }
    if (b.dataset.stucard !== undefined) { const a = api.agents().find((x) => x.id === +b.dataset.stucard); if (a) open(a); return; }
    if (b.dataset.stugo !== undefined) { const cu = culprit(); if (cu.go) api.goTarget(cu.go); }
  });

  const STU = { full, anyName, dress, join, admit, step, drawCrowd, drawGate, over, examB, rankB, ev, tapTop, tapStudent, open, recCard, isFav, favs, rtGo, rankAfter };
  window.__s8a = {   // test hook
    get m() { return { ...M, clock, plateOn, jamT, crowd: crowd().length, left10: leftWin() }; }, reset() { Object.assign(M, { t: 0, plate: 0, crowdT: 0, crowdMax: 0, left: 0, gifted: 0, episodes: 0, sumT: 0, sumPlate: 0, sumLeft: 0 }); },
    crowd: () => crowd().map((o) => ({ sp: o.sp, n: o.name + ' ' + o.fn, g: o.gift || 0, w: Math.round(o.w) })), spot: (k) => crowdSpot(k), giftP, full: (a) => full(a), fav: (id) => toggleFav(id), favs: () => [...favs()],
    rtOk: (a) => rtOk(a), buyRt: (a) => buyRt(a), canGrow: (a) => canGrow(a), rtPrice: (i) => rtPrice(i),
    plateLines: () => plateLines(), plateRect: () => plateRect, open: (id) => { const a = api.agents().find((x) => x.id === id); if (a) open(a); return !!a; }, openCrowd: (k) => openCrowd(crowd()[k]), gatePanel: () => api.openPanel(gatePanel),
    K: { RT_LESSONS, FAV_MAX, FAV_EXAM, FAV_MOOD, GIFT_P0, GIFT_P1, GIFT_GAP, GIFT_RANK, GIFT_WAIT, CROWD_WAIT, PLATE_T, LEFT_WIN },
  };
  return STU;
}
