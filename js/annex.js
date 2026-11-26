// ======================= «Пристройки классов» (class annexes), rework step 5c part 1 (Ruslan 2026-11-26: «Да, всё хорошо. Делай.») =======================
// Registry: design/system_registry.md §5c, rows A16.* in design/system_registry_rows_economy.md. Patch of game.js: tools/_patch/annex_s5c.py.
// World 1 only. Each annex is asked for by the teacher of its class (a chronicle step, built quickly for coins), then:
//  - makes its everyday product BY ITSELF into a capped stock that never decays; its class takes one per lesson for a small optional bonus
//    (without the annex the class works exactly as before);
//  - its on-map event or its mini-game gives a RARE thing; level 1-5 = coins + a few rare things; one rare thing a day also comes by itself;
//  - events never run unseen: READY at the annex (sign «… · начать», an edge pointer when off-screen), wait up to 30 min of screen time,
//    start only on the player's tap, never while a window / panel / mini-game is open, max 3 a day; every event has its own gesture
//    (Ruslan: «Цветение» = press and hold, «Звездопад» = tap falling stars, «Чары перед зеркалом» = trace a figure).
// Annexes of this part: ⚗️ pantry (Зельеварение, ch.2, replaces step mg3, opens «Зельеварка»), 🌿 greenhouse (Травология, ch.3, event
// «Цветение»), 🔭 observatory (Звездочётство, ch.4, event «Звездопад», rare = the existing star dust), 🍊 orange orchard (Столовая, ch.5,
// planting = its upgrade, oranges -> «Апельсиновый мармелад»), 🎣 pond fish trap (Столовая, ch.6, opens «Рыбалка»), 🪞 Iskra's mirror (Чары,
// ch.6, event «Чары перед зеркалом»), 🪁 take-off tower (Полёты, ch.7, opens «Полёт через кольца»); part 2 (tools/_patch/annex_elements.py):
// 🔥 Круг стихий (Магия стихий, ch.8, event «Гроза четырёх стихий» = chain-recipe combinations, «📖 Книга стихий»); v2 (tools/_patch/annex_elements_v2.py):
// tasks on top, a workbench with 2 slots, the labelled set below, drag and drop, Little Alchemy 2 recipes literally.
// Old saves: an annex step whose chapter was already closed is stored as S.story[id] = -1 (truthy: chapters and the chain stay closed, nothing
// is skipped back); its request stays open on the map, building it pays the step reward. A mini-game a save already played stays open.
// Art: Maria's pictures are not ready; every annex is a drawn placeholder; ANNEX_ART names the WebP to drop in. Texts: placeholders («texts by Maria»).
// No imports on purpose: game.js imports its modules with ?v=<build>, a second URL would load data.js twice. MISSIONS, CLASSES, WORLD and
// the journal come with initAnnex(api), which game.js calls before its chronicle (STORY) is built.
let MISSIONS = [], WORLD = 0, CLASSES = [], ON = false, glog = () => {};

// ---- every number in one place: STARTING values, tuned later in the whole-game economy check (registry §5b)
export const ANNEX_BAL = {
  buildSec: 30,                       // quick build (≤ 1 min)
  lvlMax: 5, lvlRare: [0, 0, 3, 5, 8, 12],   // rare things spent to reach level L (index L)
  lvlCoinK: 3,                        // coins to reach level L = build price × 3^(L−1), paced like every upgrade
  capK: 0.5, speedK: 0.85,            // per level: cap × (1 + 0.5 (L−1)), product period × 0.85^(L−1)
  dailyMaxDays: 7,                    // the daily rare thing: days away credited up to 7
  ev: { first: 20, gapMin: 480, gapMax: 900, wait: 1800, perDay: 3 },   // screen seconds: first readiness after the build, gap between events, wait while ready
  mgRare: [0, 0, 1, 2],               // rare things for a rewarded mini-game round by stars (2★ = 1, 3★ = 2)
  pantry: { cost: 600, reward: 300, per: 90, cap: 30, examB: 0.05, pots: 3 },
  greenh: { cost: 3000, reward: 1500, per: 90, cap: 30, lessonK: 0.85, buds: 5, wait: 6, grow: [2.0, 1.8, 1.6, 1.5, 1.4], sweet: 0.85, over: 0.6 },
  obs: { cost: 20000, reward: 10000, per: 120, cap: 30, rankK: 1.25, starsDay: 8, starsNight: 12, fall: 3.2, dustNeed: [0, 0, 10, 25, 50, 100] },
  orchard: { cost: 150000, reward: 75000, holes: 8, sapling: 40000, saplingK: 1.7, grow1: 300, grow: 3600, fruit: 900, perTree: 5, cap: 50, day: [7, 21.5], priceK: 1.2, mood: 5 },
  pond: { cost: 600000, reward: 300000, per: 120, cap: 30, priceK: 1.1, mood: 8 },
  mirror: { cost: 1500000, reward: 750000, per: 120, cap: 30, payK: 1.1, figs: 5, show: 1.2, trace: [6, 5.5, 5, 4.5, 4], R: [16, 15, 14, 13, 12], good: [0.58, 0.8] },
  kite: { cost: 6000000, reward: 3000000, per: 120, cap: 30, xpK: 2 },
  // «Гроза четырёх стихий» v2: tasks per event; 💎 taskCrys per task + newItem per new item (once) + bookAll for every item found (title);
  // points = pts × chain steps of the item (× fastK if made within fastSec × steps s of the task's start; × 2 hero); blobFade s; blobHint = blobs in a row
  // before Буря's hint; depthL[L] = the deepest item depth tasks may ask at circle level L (and ≤ deepest found + 1); unkP = share of new items in tasks
  elcirc: { cost: 15000000, reward: 7500000, per: 120, cap: 30, lessonK: 0.85, tasks: 5, taskCrys: 1, newItem: 1, bookAll: 5, pts: 10, fastK: 1.5, fastSec: 12,
    blobFade: 2, blobHint: 3, lvlRare: [0, 0, 10, 20, 35, 50], depthL: [0, 4, 6, 8, 10, 99], unkP: 0.6, teach: ['steam', 'puddle', 'mud', 'pond', 'stone'] },
};
// Maria's art drops in here (WebP under assets/annex/, drawn centred on the footprint, bottom on the ground): '' = drawn placeholder
export const ANNEX_ART = { pantry: '', greenh: '', obs: '', orchard_tree: '', pond: '', mirror: '', kite: '', elcirc: '' };

// ---- the annexes. cls = class id (or a building slot); ch = chapter index; geo = centre + footprint from the slot (tiles); ≤ half a class room
// (Ruslan: «по дизайну улучшения комнат - меньше самих классов»). Texts below are placeholders — texts by Maria.
const DEF = {
  pantry: { cls: 'potions', ch: 1, after: 'g10', emo: '🫙', name: 'Кладовая зелий', who: 'Мадам Пузырь', h: 46, game: 'p',
    geo: (s) => [s.x0 - 6, (s.y0 + s.y1) / 2, 2.4, 2.4],
    prod: { e: '🫙', n: 'заготовки', fx: 'все уроки Зельеварения сдают чаще (+5 %), пока есть заготовки' }, rare: { e: '✨', n: 'редкое зелье', many: 'редких зелий' },
    task: 'Построй кладовую зелий для Мадам Пузырь 🫙',
    ask: '«Директор, моим зельям нужна своя кладовая — полки для заготовок! Построишь? Тогда и сварим первые зелья.»',
    done: '«Кладовая готова! Заготовки тут копятся сами. А захочешь — нажми на кладовую, и сварим первые зелья в Зельеварке.»' },
  greenh: { cls: 'herbs', ch: 2, after: 'name', emo: '🌿', name: 'Теплица', who: 'Профессор Мох', h: 54, ev: 'bloom',
    geo: (s) => [s.x0 - 6, (s.y0 + s.y1) / 2, 3, 3],
    prod: { e: '🌿', n: 'свежие травы', fx: 'все уроки Травологии короче на 15 %, пока есть травы' }, rare: { e: '🌸', n: 'волшебный цветок', many: 'волшебных цветков' },
    task: 'Профессор Мох просит теплицу у класса Травологии 🌿',
    ask: '«Травам тесно на подоконниках! Построй теплицу у Травологии — свежие травы будут расти сами.»',
    done: '«Теплица готова! А когда над крышей засветится бутон — зови: покажу, как распускается волшебный цветок.»',
    first: '«Прижми бутон пальцем и держи — он раскрывается лепесток за лепестком. Отпусти, когда загорится зелёное кольцо!»' },
  obs: { cls: 'stars', ch: 3, after: 'camp', emo: '🔭', name: 'Обсерватория', who: 'Звездочёт Лун', h: 92, ev: 'sfall',
    geo: (s) => [s.x0 - 5, s.y0 - 5, 2, 2],
    prod: { e: '🗺️', n: 'звёздные карты', fx: 'шанс всех экзаменов на звание ×1,25, пока есть карты' }, rare: { e: '✨', n: 'звёздная пыль', many: 'звёздной пыли' },
    task: 'Звездочёт Лун просит обсерваторию у класса Звездочётства 🔭',
    ask: '«Из окна класса видно полнеба. Построй мне обсерваторию — я начерчу звёздные карты для экзаменов на звание.»',
    done: '«Обсерватория готова! Когда купол откроется — приходи: звёзды будут падать прямо к нам в руки.»',
    first: '«Звёзды падают у обсерватории — лови их пальцем, пока не коснулись земли!»' },
  orchard: { slot: 'CANT', ch: 4, after: null, emo: '🍊', name: 'Апельсиновый сад', who: 'Уголёк', h: 40,
    geo: (s) => [s.x1 + 5, (s.y0 + s.y1) / 2 - 1, 3.2, 6.2],
    prod: { e: '🍊', n: 'апельсины', fx: 'пока есть апельсины, к каждому обеду — «Апельсиновый мармелад»: +20 % к цене и чуть больше настроения' },
    task: 'Уголёк просит апельсиновый сад у столовой 🍊',
    ask: '«Директор! Хочу варить апельсиновый мармелад. Вот первый саженец — посадим сад у столовой?»',
    done: '«Сад посажен! Днём на деревьях растут апельсины — нажми на любое дерево, и я соберу весь урожай в кладовую.»' },
  pond: { slot: 'POND', ch: 5, after: 'ally', emo: '🎣', name: 'Пруд', who: 'Уголёк', h: 30, game: 'fish',
    prod: { e: '🐟', n: 'рыба', fx: 'рыбный ужин в столовой: +10 % к цене и больше настроения, пока есть рыба' }, rare: { e: '🐠', n: 'редкая рыба', many: 'редких рыб' },
    task: 'Уголёк просит садок для рыбы у пруда 🎣',
    ask: '«Поставим у пруда садок? Рыба будет ловиться сама — к ужину. А на удочку попадается и редкая!»',
    done: '«Садок готов! Рыба копится сама. Нажми на пруд — порыбачим в «Рыбалке».»' },
  mirror: { cls: 'charms', ch: 5, after: 'ally', emo: '🪞', name: 'Зеркало Искры', who: 'Мастер Искра', h: 62, ev: 'mirror',
    geo: (s) => [s.x0 + 3, s.y0 - 5.5, 1.6, 1.2],
    prod: { e: '🪄', n: 'репетиции', fx: 'плата за все уроки Чар +10 %, пока есть репетиции' }, rare: { e: '🦋', n: 'волшебная бабочка', many: 'волшебных бабочек' },
    task: 'Мастер Искра просит волшебное зеркало у класса Чар 🪞',
    ask: '«Чарам нужно зеркало: ученики репетируют перед ним жесты. Поставишь у класса?»',
    done: '«Зеркало стоит! Когда стекло засияет — приходи, порисуем чары вместе.»',
    first: '«Я рисую фигуру на стекле, а ты обведи её пальцем. Магия без красоты — просто фокус!»' },
  kite: { cls: 'flight', ch: 6, after: null, emo: '🪁', name: 'Взлётная вышка', who: 'Капитан Ветерок', h: 88, game: 'f',
    geo: (s) => [s.x0 + 3, s.y0 - 5.5, 1.6, 1.6],
    prod: { e: '🪁', n: 'тренировки', fx: 'ученики после уроков Полётов получают вдвое больше опыта для альбома, пока есть тренировки' }, rare: { e: '🪶', n: 'золотое перо', many: 'золотых перьев' },
    task: 'Капитан Ветерок просит взлётную вышку у класса Полётов 🪁',
    ask: '«Эй, директор! С земли не полетаешь. Построй вышку с полосатым колдуном — будем тренироваться!»',
    done: '«Вышка готова! Нажми на неё — полетаем через кольца.»' },
  elcirc: { cls: 'elements', ch: 7, after: null, emo: '🔥', name: 'Круг стихий', who: 'Госпожа Буря', h: 34, ev: 'storm',
    geo: (s) => [s.x0 + 4, s.y0 - 5.5, 2.4, 2.4],
    prod: { e: '⚡', n: 'заряды стихий', fx: 'все уроки Магии стихий короче на 15 %, пока есть заряды' }, rare: { e: '💎', n: 'кристалл стихий', many: 'кристаллов стихий' },
    task: 'Госпожа Буря просит круг стихий у класса Магии стихий 🔥',
    ask: '«Директор, со стихиями не командуют — с ними договариваются. Поставь у моего класса круг из четырёх камней: заряды стихий будут копиться сами.»',
    done: '«Круг стоит! Когда над камнями соберётся гроза — зови меня. Будем договариваться со стихиями.»',
    first: '«Сверху — задание, в центре — стол, внизу — твои стихии. Перетащи две на стол — и посмотрим, что выйдет!»' },
};
const IDS = Object.keys(DEF), EVS = IDS.filter((id) => DEF[id].ev);
const EV_NAME = { bloom: '🌸 Цветение', sfall: '🌠 Звездопад', mirror: '🪞 Чары перед зеркалом', storm: '⛈️ Гроза четырёх стихий' };
const GAME_OF = { p: 'pantry', fish: 'pond', f: 'kite' }, GAME_ID = { potions: 'pantry', fish: 'pond', flight: 'kite' };

// ---- the chronicle steps (world 1): new missions; «Свари 3 зелья» (mg3) is replaced by the pantry step
function addMissions() {
  const k = MISSIONS.findIndex((m) => m.id === 'mg3'); if (k >= 0) MISSIONS.splice(k, 1);
  const built = (g, id) => !!(g.S.annex && g.S.annex[id] && g.S.annex[id].b);
  for (const id of IDS) { const D = DEF[id], B = ANNEX_BAL[id];
    MISSIONS.push({ id, text: D.task, reward: B.reward, annex: 1, go: ['@anx:' + id, null],
      check: (g) => built(g, id) }); }   // audit F14: the pantry step is the build; brewing is its first (optional) event
}

let A = null;   // the game's api (initAnnex)
const now = () => Date.now();
const dayKey = (t = now()) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const hourNow = () => { const d = new Date(now()); return window.__hour ?? d.getHours() + d.getMinutes() / 60; };
const isNight = () => { const h = hourNow(); return h >= 22 || h < 5; };
const rand = (a, b) => a + Math.random() * (b - a);
const nOf = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
const deed = (k, id, n = 1) => { try { window.dispatchEvent(new CustomEvent('annexdeed', { detail: { k, a: id, n } })); if (typeof window.dayDeed === 'function') window.dayDeed('annex_' + k, id, n); } catch (e) { /* the daily bar (step 7) counts these later */ } };
const stat = (k, id, x = {}) => { try { A.stats('annex', { k, a: id, ...x }); } catch (e) { /* never breaks the game */ } };

// ---- state: S.annex[id] = { b built, bt build end ms, L level, n stock, t product clock ms, r rare, rd daily rare day, ev {…}, … }
function st(id) {
  const S = A.S(); S.annex ||= {};
  const a = (S.annex[id] ||= { b: 0, bt: 0, L: 1, n: 0, t: 0, r: 0 });
  if (DEF[id].ev && !a.ev) a.ev = { next: ANNEX_BAL.ev.first, rdy: 0, w: 0, day: 0, k: 0, first: 0 };
  if (id === 'orchard' && !a.tr) { a.tr = Array(ANNEX_BAL.orchard.holes).fill(null); a.o = 0; }
  return a;
}
const built = (id) => ON && !!A && !!A.S() && !!st(id).b;
const storyOf = (id) => { const S = A.S(); return (S && S.story && S.story[id]) || 0; };
// asked for: the current chronicle step, or a late request (chapter closed before this build), or already claimed
function asked(id) { if (!ON || !A || !A.S()) return false; const s = storyOf(id); if (s) return true; const c = A.storyCur(); return !!(c && c.id === id); }
const late = (id) => storyOf(id) === -1;
function lateCheck() {   // a save that closed the annex's chapter before this build: the request stays open, nothing is skipped back
  const S = A.S(); if (!S || !S.story) return; const CH = A.chapters(); if (!CH || !CH.length) return;
  // the save's progress: the first chapter with an unclaimed step that is not an annex (old v1 saves claimed the class builds of later chapters)
  let ci = CH.findIndex((c) => c.ids.some((x) => !DEF[x] && !S.story[x])); if (ci < 0) ci = CH.length;
  for (const id of IDS) {
    if (S.story[id]) continue; const c = CH[DEF[id].ch]; if (!c || !c.ids.includes(id)) continue;
    const potDone = id === 'pantry' && S.story.mg3;   // the old «Свари 3 зелья» was claimed: the pantry is optional for this save
    if (DEF[id].ch < ci || potDone) { S.story[id] = -1; (S.annex ||= {}).lateSeen ||= {}; }
  }
  const L = IDS.filter((id) => S.story[id] === -1 && !st(id).b && !(S.annex.lateSeen || {})[id]);
  if (L.length) { L.forEach((id) => { S.annex.lateSeen[id] = 1; glog('toast', `${DEF[id].emo} ${DEF[id].who} просит: ${DEF[id].name.toLowerCase()} — загляни на карту`, WORLD); });
    setTimeout(() => A.toast(`📖 ${DEF[L[0]].who} просит построить «${DEF[L[0]].name}» — найди на карте`), 5000); A.save(); }
}

// ---- level maths
const capOf = (id) => Math.round(ANNEX_BAL[id].cap * (1 + ANNEX_BAL.capK * ((st(id).L || 1) - 1)));
const perOf = (id) => ANNEX_BAL[id].per * Math.pow(ANNEX_BAL.speedK, (st(id).L || 1) - 1) * 1000;
const lvlCoins = (id) => { const L = (st(id).L || 1) + 1; return A.paced(ANNEX_BAL[id].cost * Math.pow(ANNEX_BAL.lvlCoinK, L - 1), L); };
const lvlRare = (id) => { const L = (st(id).L || 1) + 1; return id === 'obs' ? ANNEX_BAL.obs.dustNeed[L] : (ANNEX_BAL[id].lvlRare || ANNEX_BAL.lvlRare)[L]; };   // elcirc: own (dearer) list
const rareN = (id) => (id === 'obs' ? A.S().stardust || 0 : st(id).r || 0);
function rareAdd(id, n) { if (!(n > 0) || (RUN && RUN.free)) return;   // free practice plays give no rare things
  if (id === 'obs') A.S().stardust = (A.S().stardust || 0) + n; else st(id).r = (st(id).r || 0) + n; }
const saplingCost = () => { const m = st('orchard').tr.filter(Boolean).length; return A.paced(ANNEX_BAL.orchard.sapling * Math.pow(ANNEX_BAL.orchard.saplingK, Math.max(0, m - 1)), m + 1); };

// ---- production (by the trusted clock: Date.now is corrected by js/clock.js; offline time counts, capped stock)
// The stock is TIME (coordinator 2026-11-26, after the test «big schools drain every stock within a minute»): one unit = one minute of the
// class bonus for EVERY lesson of that class; while the stock is above 0 it drains 1 per minute (screen or offline, the same clock as
// production), so a small and a big school get the same value. Production and drain are stepped in time order (offline too, up to ~3 days).
function stepStock(a, t, per, cap, nk = 'n', tk = 't', dk = 'd') {
  if (!a[tk]) a[tk] = t; if (!a[dk]) a[dk] = t;
  let tp = per ? a[tk] + per : Infinity, td = a[dk] + 60000, g = 0;
  while ((tp <= t || td <= t) && g++ < 20000) {
    if (tp <= td) { if (a[nk] === 0) { a[dk] = tp; td = tp + 60000; } if (a[nk] < cap) a[nk]++; a[tk] = tp; tp += per; }
    else { if (a[nk] > 0) a[nk]--; a[dk] = td; td += 60000; }
  }
  if (g >= 20000) { if (per) a[tk] = t; a[dk] = t; }
  if (a[nk] === 0) a[dk] = Math.max(a[dk], t - 59999);   // an empty stock: the next unit starts its own minute
}
function produce(id, t) { const a = st(id); if (!a.b) return; stepStock(a, t, perOf(id), capOf(id)); }
function dayOverlap(t0, t1) {   // ms of [t0, t1] inside the orchard's day window (phone time, 7:00-21:30)
  if (t1 <= t0) return 0; const [h0, h1] = ANNEX_BAL.orchard.day; if (window.__hour !== undefined) return h0 <= window.__hour && window.__hour < h1 ? t1 - t0 : 0;
  let sum = 0; const d = new Date(Math.max(t0, t1 - 40 * 86400000)); d.setHours(0, 0, 0, 0);
  for (let k = 0; k < 42 && d.getTime() < t1; k++) { const a = d.getTime() + h0 * 3600000, b = d.getTime() + h1 * 3600000; sum += Math.max(0, Math.min(b, t1) - Math.max(a, t0)); d.setDate(d.getDate() + 1); }
  return sum;
}
const treeUp = (tr, k) => tr && now() >= tr.p + (k === 0 && tr.first ? ANNEX_BAL.orchard.grow1 : ANNEX_BAL.orchard.grow) * 1000;
const treeAt = (tr) => tr.p + (tr.first ? ANNEX_BAL.orchard.grow1 : ANNEX_BAL.orchard.grow) * 1000;
function orchardStep(t) {
  const a = st('orchard'); if (!a.b) return; const B = ANNEX_BAL.orchard;
  stepStock(a, t, 0, B.cap, 'o', 'ot', 'od');   // the canteen pantry: one orange = one minute of «Апельсиновый мармелад» for every meal (measured per meal: a big school ate 50 in ~3.5 min)
  a.tr.forEach((tr) => { if (tr) growTree(tr, treeAt(tr), t, B); });
  for (const tr of Object.values(wildSync(t))) growTree(tr, tr.p, t, B);   // the map's orange trees, same rule
}
function growTree(tr, up, t, B) {
  if (t < up) return; if (!tr.t || tr.t < up) tr.t = up;
  if (tr.f >= B.perTree) { tr.t = t; return; }
  const ms = dayOverlap(tr.t, t), k = Math.floor(ms / (B.fruit * 1000));
  if (k > 0) { tr.f = Math.min(B.perTree, (tr.f || 0) + k); tr.t = tr.f >= B.perTree ? t : tr.t + (t - tr.t) * (k * B.fruit * 1000 / ms); }
  else if (ms === 0) tr.t = t;
}
// ---- the map's orange trees (Ruslan 2026-11-26: «наоборот эти деревья должны стать кликабельными по всей карте!»; tools/_patch/audit_fixes.py):
// every world-1 decor 'goldtree' is a real orange tree once the orchard is built: the orchard's rule (day window, one per B.fruit s,
// at most B.perTree, they never rot); S.annex.orchard.wt[key] = { p: start ms, f: ripe, t: clock ms } (key = its place on the map);
// a tap on any orange tree collects all ripe oranges (map + orchard) into the canteen pantry and they fly to the canteen.
const WILD_HIT = new Map(); let FLY = [];
function wildSync(t) {
  const a = st('orchard'); a.wt ||= {}; const keys = (A.wild && A.wild()) || []; if (!keys.length) return a.wt;   // no layout yet: keep
  const on = new Set(keys); for (const k of keys) if (!a.wt[k]) a.wt[k] = { p: t, f: 0, t };
  for (const k of Object.keys(a.wt)) if (!on.has(k)) delete a.wt[k];   // a tree moved by a new building starts again
  return a.wt;
}
const wildN = () => Object.values(st('orchard').wt || {}).reduce((s, tr) => s + (tr.f || 0), 0);
function wildDraw(key, px, py, w, h) {   // game.js drawOut: ripe oranges on a map tree + its tap area
  if (!ON || !A || !A.S() || A.edit()) return;
  WILD_HIT.set(key, { x0: px - w * 0.42, x1: px + w * 0.42, y0: py - h * 0.95, y1: py - h * 0.2, t: performance.now() });
  if (!built('orchard')) return; const tr = (st('orchard').wt || {})[key], n = tr ? tr.f || 0 : 0; if (!n) return;
  const c = A.ctx(), F = [[-0.17, -0.74], [0.16, -0.79], [0.01, -0.63], [-0.21, -0.56], [0.2, -0.58]], sz = Math.max(9, h * 0.1);
  for (let j = 0; j < Math.min(n, F.length); j++) A.emoji('🍊', px + F[j][0] * h, py + F[j][1] * h, sz, c);
}
function wildTap(wx, wy) {   // game.js map tap (after students and rooms)
  if (!ON || !A || !A.S() || A.edit() || RUN) return false;
  const t0 = performance.now(); let hit = null;
  for (const r of WILD_HIT.values()) if (t0 - r.t < 600 && wx >= r.x0 && wx <= r.x1 && wy >= r.y0 && wy <= r.y1 && (!hit || r.y1 > hit.y1)) hit = r;   // the front one
  if (!hit) return false;
  const a = st('orchard');
  if (!a.b) { A.toast(a.bt ? '🍊 Сад у столовой строится — скоро апельсины созреют и на этих деревьях' : '🍊 Уголёк мечтает об апельсиновом мармеладе — построй сад у столовой'); if (!a.bt && asked('orchard')) openPanel('orchard'); return true; }
  harvest({ x: (hit.x0 + hit.x1) / 2, y: hit.y0 + (hit.y1 - hit.y0) * 0.3 }); return true;
}
function flyOranges(from, n) {   // oranges fly from the tree to the canteen (drawn in signs())
  const s = A.slots().CANT; if (!s || !from) return; const q = A.P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), t = performance.now();
  for (let k = 0; k < Math.min(8, n); k++) FLY.push({ x0: from.x + (k % 3 - 1) * 8, y0: from.y + (k % 2) * 6, x1: q.x, y1: q.y - 40, t0: t + k * 90 });
}
function drawFly(c, t) {
  if (!FLY.length) return; FLY = FLY.filter((f) => t - f.t0 < 900);
  for (const f of FLY) { const u = (t - f.t0) / 900; if (u < 0) continue; const e = u * u * (3 - 2 * u);
    A.emoji('🍊', f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e - Math.sin(u * Math.PI) * 90, 14, c); }
}
const hanging = () => (built('orchard') ? st('orchard').tr.reduce((s, tr) => s + ((tr && tr.f) || 0), 0) + wildN() : 0);   // + the map's orange trees
function harvest(from) {
  const a = st('orchard'), n = hanging(); if (!n) { A.toast(isNight() || !dayNow() ? '🌙 Ночью деревья отдыхают — апельсины вырастут днём' : '🍊 Апельсины ещё зреют'); return false; }
  const room = Math.max(0, ANNEX_BAL.orchard.cap - a.o), got = Math.min(room, n);
  if (!got) { A.toast(`🍊 Кладовая столовой полна (мармелада на ${a.o} мин) — апельсины подождут на деревьях`); return false; }
  let left = got; for (const tr of [...a.tr, ...Object.values(a.wt || {})]) if (tr && tr.f && left > 0) { const k = Math.min(tr.f, left); if (tr.f >= ANNEX_BAL.orchard.perTree) tr.t = now(); tr.f -= k; left -= k; }
  if (!a.o) a.od = now(); a.o += got; A.sfx('fixed'); A.toast(`🍊 +${got} ${nOf(got, 'апельсин', 'апельсина', 'апельсинов')} в кладовую: мармелада на ${a.o} мин`);
  { const g = geo('orchard'), p0 = from || (g && UP(A.P(g.x, g.y), 30)); flyOranges(p0, got); }
  stat('harvest', 'orchard', { n: got, m: from ? 1 : 0 }); deed('harvest', 'orchard', got); A.save(); return true;
}
const dayNow = () => { const h = hourNow(), [h0, h1] = ANNEX_BAL.orchard.day; return h >= h0 && h < h1; };
function dailyRare(id, t) {   // one rare thing a day by itself (non-players grow slower but never stop)
  if (id === 'orchard' || !st(id).b) return; const a = st(id), dk = dayKey(t);
  if (!a.rd) { a.rd = dk; return; } if (a.rd === dk) return;
  const days = Math.max(1, Math.min(ANNEX_BAL.dailyMaxDays, Math.round((new Date(Math.floor(dk / 10000), Math.floor(dk / 100) % 100 - 1, dk % 100) - new Date(Math.floor(a.rd / 10000), Math.floor(a.rd / 100) % 100 - 1, a.rd % 100)) / 86400000)));
  a.rd = dk; rareAdd(id, days); glog('toast', `${DEF[id].rare.e} ${DEF[id].name}: +${days} ${DEF[id].rare.n}`, WORLD);
}

// ---- building
function buildCost(id) { return ANNEX_BAL[id].cost; }
function startBuild(id) {
  if (!asked(id) || st(id).b || st(id).bt) return;
  if (!A.spend(buildCost(id))) return;
  const a = st(id); a.bt = now() + ANNEX_BAL.buildSec * 1000; A.sfx('fixed'); A.toast(`🏗️ ${DEF[id].name}: стройка ${ANNEX_BAL.buildSec} секунд`); stat('build0', id); A.save(); A.refresh();
}
function finishBuild(id) {
  const a = st(id), S = A.S(); a.b = 1; a.bt = 0; a.t = now(); a.L = 1; a.rd = dayKey();
  if (id === 'orchard') { a.tr[0] = { p: now(), f: 0, t: 0, first: 1 }; }   // the cook gives the first sapling
  if (a.ev) a.ev.next = ANNEX_BAL.ev.first;
  bubble(DEF[id].who, DEF[id].done, 6500);
  if (S.story && S.story[id] === -1) {   // a late request: the step reward is paid at once
    const m = MISSIONS.find((x) => x.id === id), r = m ? A.storyReward(m) : ANNEX_BAL[id].reward; S.story[id] = 1; A.bonus(r);
    setTimeout(() => A.toast(`📖 Летопись: ${DEF[id].name} — награда 🪙${A.fmt(r)}`), 1500);
  }
  glog('toast', `${DEF[id].emo} Построено: ${DEF[id].name}`, WORLD); stat('build', id); deed('build', id); A.save(); A.refresh();
}
function levelUp(id) {
  const a = st(id); if (!a.b || a.L >= ANNEX_BAL.lvlMax || id === 'orchard') return;
  const need = lvlRare(id); if (rareN(id) < need) { A.toast(`Нужно ${DEF[id].rare.e} ${need} — сейчас ${rareN(id)}`); return; }
  if (!A.spend(lvlCoins(id))) return;
  if (id !== 'obs') a.r -= need;   // star dust is held, not spent: the «Звездопад» page opens its layers by the dust count (D7.3)
  a.L++; A.sfx('fixed'); A.toast(`${DEF[id].emo} ${DEF[id].name}: уровень ${a.L}!`); stat('level', id, { l: a.L }); A.save(); A.refresh();
}
function plant(k) {
  const a = st('orchard'); if (!a.b || a.tr[k]) return;
  if (!A.spend(saplingCost())) return;
  a.tr[k] = { p: now(), f: 0, t: 0 }; A.sfx('fixed'); A.toast(`🌱 Саженец посажен — дерево вырастет через ${Math.round(ANNEX_BAL.orchard.grow / 60)} мин`); stat('plant', 'orchard', { n: a.tr.filter(Boolean).length }); A.save(); A.refresh();
}

// ---- class effects (each takes one item from the stock while there is any)
function take(id) { return built(id) && st(id).n > 0; }   // time model: the bonus is on while the stock lasts
const clsOf = (i) => (CLASSES[i] || {}).id;
const api = {
  lessonK: (i) => (ON && clsOf(i) === 'herbs' && take('greenh') ? ANNEX_BAL.greenh.lessonK : ON && clsOf(i) === 'elements' && take('elcirc') ? ANNEX_BAL.elcirc.lessonK : 1),
  examB: (i) => (ON && clsOf(i) === 'potions' && take('pantry') ? ANNEX_BAL.pantry.examB : 0),
  rankK: () => (ON && take('obs') ? ANNEX_BAL.obs.rankK : 1),
  payK: (i) => (ON && clsOf(i) === 'charms' && take('mirror') ? ANNEX_BAL.mirror.payK : 1),
  xpX: (i) => ON && clsOf(i) === 'flight' && take('kite'),
  meal() {   // a served canteen meal: an orange = marmalade dessert, a fish = fish dinner (each optional)
    const o = { k: 1, mood: 0, dish: null }; if (!ON || !A) return o;
    if (built('orchard') && st('orchard').o > 0) { o.k *= ANNEX_BAL.orchard.priceK; o.mood += ANNEX_BAL.orchard.mood; o.dish = '🍊'; }
    if (take('pond')) { o.k *= ANNEX_BAL.pond.priceK; o.mood += ANNEX_BAL.pond.mood; o.dish = '🐟'; }
    return o;
  },
};

// ---- mini-games: exist only after their annex (or when this save already played them)
function played(g) { const m = (A && A.S() && A.S().mg) || {}; if (g === 'p') return (m.best || 0) > 0 || (m.pot || 0) > 0; const r = g === 'fish' ? m.g : m.f; return !!r && ((r.best || 0) > 0 || (r.n || 0) > 0); }
function mgOk(g) { if (!ON || !A || !A.S()) return true; const id = GAME_OF[g]; if (!id) return true; return built(id) || played(g); }
const mgAny = () => mgOk('p') || mgOk('fish') || mgOk('f');
function mgDone(g, score, stars, x) {
  const id = GAME_ID[g]; if (!ON || !id || !built(id)) return;
  const n = x && x.rewarded ? ANNEX_BAL.mgRare[stars || 0] || 0 : 0;
  if (n) { rareAdd(id, n); setTimeout(() => A.toast(`${DEF[id].rare.e} +${n} ${n === 1 ? DEF[id].rare.n : DEF[id].rare.many} — для улучшения «${DEF[id].name}»`), 1200); stat('mgrare', id, { n }); A.save(); }
  deed('game', id);
}
function fishGate() {   // a tap on the pond or its sign
  if (mgOk('fish')) return false;
  if (asked('pond')) { openPanel('pond'); return true; }
  A.toast('🎣 Рыбалку откроет повар Уголёк — она появится в летописи после столовой'); return true;
}
const pondSign = (n) => (mgOk('fish') ? (n > 0 ? `🎣 Рыбалка · ${n}` : '🎣 Рыбалка') : asked('pond') && !built('pond') ? '🎣 Пруд · построить' : '🎣 Рыбалка · скоро');
function openMg(g) { A.closePanel(); A.openMg(g); }

// ---- geometry
function geo(id) {
  const D = DEF[id]; if (!ON || !A) return null; const SL = A.slots();
  if (id === 'pond') { const w = A.pondW(); return w ? { x: w.cx + w.rx * 0.2, y: w.cy + w.ry + 1.2, w: 1, d: 1 } : null; }
  const s = D.slot ? SL[D.slot] : A.slotOfCls(D.cls); if (!s) return null;
  const [x, y, w, d] = D.geo(s); return { x, y, w, d, x0: x - w / 2, y0: y - d / 2, x1: x + w / 2, y1: y + d / 2 };
}
const holes = () => { const g = geo('orchard'); if (!g) return []; const o = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) o.push({ x: g.x - 0.75 + r * 1.5, y: g.y - 2.25 + c * 1.5 }); return o; };
function blocks(x, y) {   // outdoor decor keeps off the annex plots (reserved from the start, so decor never jumps when one is built)
  if (!ON || !A) return false;
  for (const id of IDS) { if (id === 'pond') continue; const g = geo(id); if (!g) continue; const m = 1.3; if (x > g.x0 - m && x < g.x1 + m && y > g.y0 - m && y < g.y1 + m + 0.6) return true;
    const k = ((x + y) - (g.x1 + g.y1)) / 2, side = Math.abs((x - y) - (g.x - g.y)); if (k > -0.5 && k < 5 && side < (g.w + g.d) / 2 + 2.2) return true; }   // nothing tall in front (down-screen) of an annex
  return false;
}

// ---- events: readiness (screen time only, the quiet rule), start on tap, run, finish
let RUN = null;
const screenOn = () => !document.hidden && !A.quiet() && !A.idle() && !A.tour() && !RUN && !A.edit();
function evTick() {
  const dk = dayKey(), on = screenOn();
  for (const id of EVS) { if (!built(id)) continue; const e = st(id).ev;
    if (e.day !== dk) { e.day = dk; e.k = 0; }
    if (!on) continue;
    if (e.rdy) { e.w++; if (e.w >= ANNEX_BAL.ev.wait) { e.rdy = 0; e.w = 0; e.next = rand(ANNEX_BAL.ev.gapMin, ANNEX_BAL.ev.gapMax); } }   // quietly ends, comes later
    else if (e.k < ANNEX_BAL.ev.perDay) { e.next--; if (e.next <= 0) { e.rdy = 1; e.w = 0; glog('toast', `${EV_NAME[DEF[id].ev]} у «${DEF[id].name}» — можно начать`, WORLD); stat('ready', id); } }
  }
}
function startEv(id) {
  const e = st(id).ev; if (!e || RUN || A.quiet()) return false;
  const paid = e.k < ANNEX_BAL.ev.perDay;   // any time; the first perDay plays of a day give rewards
  e.rdy = 0; e.w = 0; if (paid) e.k++; e.next = rand(ANNEX_BAL.ev.gapMin, ANNEX_BAL.ev.gapMax);
  const g = geo(id); A.closePanel(); A.focusTile(g.x, g.y, false);
  const kind = DEF[id].ev; RUN = { id, kind, t0: performance.now(), got: 0, rare: 0, items: [], k: 0, done: false, free: !paid };
  if (kind === 'bloom') initBloom(); else if (kind === 'sfall') initFall(); else if (kind === 'storm') initStorm(); else initMirror();
  if (kind !== 'mirror' && kind !== 'storm') layerOn();
  if (!e.first) { e.first = 1; if (kind === 'mirror' || kind === 'storm') RUN.first = `${DEF[id].who}: ${DEF[id].first}`; else bubble(DEF[id].who, DEF[id].first, 6000); }   // the mirror shows the teacher's line inside its own overlay
  stat('ev_start', id); A.save(); return true;
}
function finishEv(cut) {
  if (!RUN || RUN.done) return; const R = RUN; R.done = true; const id = R.id, D = DEF[id];
  let rare = 0;
  if (R.kind === 'bloom') { const full = R.items.filter((b) => b.res === 'full').length; rare = Math.floor(full / 2) + (full >= ANNEX_BAL.greenh.buds ? 1 : 0); R.sum = `распустилось ${R.items.filter((b) => b.res === 'full' || b.res === 'small').length}, в полную силу ${full}`; }
  else if (R.kind === 'sfall') { rare = 0; R.sum = `поймано звёзд: ${R.got}`; }   // every caught star already gave +1 star dust
  else if (R.kind === 'storm') rare = stormEnd(R);
  else { const br = R.items.filter((f) => f.grade === 2).length, bt = R.items.filter((f) => f.grade === 1).length; rare = br + Math.floor(bt / 2); R.sum = `ярких ${bt}, сияющих ${br}`; }
  rareAdd(id, rare); RUN = null; layerOff(); mirrorOff(); stormOff();
  if (R.kind === 'sfall' && R.got) setTimeout(() => A.lore('star'), 600);   // after the event: the first caught star opens the secret page «Звездопад» (D7.3), later ones show the dust count
  const tail = R.kind === 'sfall' ? (R.got ? ` → ✨ +${R.got} звёздной пыли` : '') : rare ? ` → ${D.rare.e} +${rare} ${rare === 1 ? D.rare.n : D.rare.many}` : '';
  const tail2 = R.free ? ' · без награды (награды на сегодня собраны)' : tail;
  A.toast(`${EV_NAME[D.ev]}: ${R.sum}${tail2}`); glog('toast', `${EV_NAME[D.ev]}: ${R.sum}${tail}`, WORLD);
  stat('ev_end', id, { n: R.got || 0, r: R.kind === 'sfall' ? R.got : rare, c: cut ? 1 : 0, ...(R.kind === 'storm' ? { s: R.score, nr: R.newRec } : {}) }); deed('event', id); A.save();
  if (R.bookDone) setTimeout(() => bubble(D.who, '«Все находки собраны! Стихии с тобой договорились — теперь ты Повелитель стихий.»', 7000), 900);
}
// «Цветение»: press and hold a glowing bud, it opens petal by petal; release in the green ring = full bloom
function initBloom() { const g = geo('greenh'); for (let k = 0; k < ANNEX_BAL.greenh.buds; k++) { const an = rand(0, Math.PI * 2), r = rand(1.9, 3.1); RUN.items.push({ x: g.x + Math.cos(an) * r, y: g.y + Math.sin(an) * r * 0.9 + 0.6, st: 'wait', t: 0, p: 0, res: null }); } RUN.cur = 0; RUN.tc = performance.now() + 600; }
function bloomStep(t) {
  const B = ANNEX_BAL.greenh, b = RUN.items[RUN.cur]; if (!b) { if (t > RUN.tc + 600) finishEv(false); return; }
  if (t < RUN.tc) return; if (!b.t) b.t = t;
  const grow = B.grow[Math.min(RUN.cur, B.grow.length - 1)];
  if (b.st === 'wait' && (t - b.t) / 1000 > B.wait) { b.st = 'gone'; b.res = 'missed'; nextBud(t); }
  if (b.st === 'hold') { b.p = (t - b.h0) / 1000 / grow; if (b.p > 1 + B.over / grow) { b.st = 'gone'; b.res = 'closed'; RUN.say = 'Ой, закрылся — следующий!'; nextBud(t); } }
}
function nextBud(t) { RUN.cur++; RUN.tc = t + 700; }
function bloomDown(wx, wy) { const b = RUN.items[RUN.cur]; if (!b || b.st !== 'wait' || performance.now() < RUN.tc) return; const q = A.P(b.x, b.y); if (Math.hypot(wx - q.x, wy - (q.y - 12)) > 34) return; b.st = 'hold'; b.h0 = performance.now(); }
function bloomUp() { const b = RUN && RUN.items[RUN.cur]; if (!b || b.st !== 'hold') return; const B = ANNEX_BAL.greenh; b.st = 'open'; b.res = b.p >= B.sweet ? 'full' : b.p >= 0.35 ? 'small' : 'small'; b.p = Math.min(1, b.p); RUN.got += b.res === 'full' ? 1 : 0;
  RUN.say = b.res === 'full' ? 'Расцвёл в полную силу! 🌸' : 'Маленький цветочек — держи чуть дольше'; A.sfx(b.res === 'full' ? 'fixed' : 'tick'); nextBud(performance.now()); }
// «Звездопад»: stars fall around the observatory, a tap catches one (+1 star dust; the first caught star still opens the secret page, D7.3)
function initFall() { const n = isNight() ? ANNEX_BAL.obs.starsNight : ANNEX_BAL.obs.starsDay, g = geo('obs'); for (let k = 0; k < n; k++) { const an = rand(0, Math.PI * 2), r = rand(1.4, 3.6); RUN.items.push({ x: g.x + Math.cos(an) * r, y: g.y + Math.sin(an) * r, d: 700 + k * (40000 / n) + rand(0, 1500), st: 'fall' }); } RUN.night = isNight(); }
function fallStep(t) { const T = t - RUN.t0; let alive = false; for (const s of RUN.items) { if (s.st !== 'fall') continue; const u = (T - s.d) / (ANNEX_BAL.obs.fall * 1000); if (u >= 1) { s.st = 'gone'; continue; } alive = true; } if (!alive && T > 2000) finishEv(false); }
function fallPos(s, t) { const u = (t - RUN.t0 - s.d) / (ANNEX_BAL.obs.fall * 1000); if (u < 0 || u >= 1) return null; const q = A.P(s.x, s.y); return { x: q.x + (1 - u) * 46, y: q.y - (1 - u) * 170, u }; }
function fallDown(wx, wy) { const t = performance.now(); for (const s of RUN.items) { if (s.st !== 'fall') continue; const p = fallPos(s, t); if (p && Math.hypot(wx - p.x, wy - p.y) < 34) { s.st = 'got'; s.bt = t; s.bx = p.x; s.by = p.y; RUN.got++; A.S().stardust = (A.S().stardust || 0) + 1; A.sfx('tick'); return; } } }

// ---- the capture layer: during an event the map does not pan or zoom and taps do not open rooms
let LAYER = null;
function layerOn() {
  if (LAYER) return; LAYER = document.createElement('div'); LAYER.id = 'anx-layer';
  LAYER.innerHTML = `<div class="anx-top"><span class="anx-tt"></span><button class="anx-x" aria-label="Закончить">✕</button></div><div class="anx-say"></div>`;
  document.body.appendChild(LAYER);
  const wpt = (e) => { const sc = A.scroller(), r = sc.getBoundingClientRect(), k = A.scale(); return [(e.clientX - r.left + sc.scrollLeft) / k, (e.clientY - r.top + sc.scrollTop) / k]; };
  LAYER.addEventListener('pointerdown', (e) => { if (e.target.closest('.anx-x')) return; e.preventDefault(); if (!RUN || RUN.kind === 'mirror') return; const [x, y] = wpt(e); if (RUN.kind === 'bloom') bloomDown(x, y); else fallDown(x, y); });
  const up = () => { if (RUN && RUN.kind === 'bloom') bloomUp(); }; LAYER.addEventListener('pointerup', up); LAYER.addEventListener('pointercancel', up); LAYER.addEventListener('pointerleave', up);
  LAYER.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); LAYER.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  LAYER.querySelector('.anx-x').addEventListener('click', () => finishEv(true));
}
function layerOff() { if (LAYER) { LAYER.remove(); LAYER = null; } }
function layerHud(t) {
  if (!LAYER || !RUN) return; const left = Math.max(0, Math.ceil(RUN.kind === 'bloom' ? RUN.items.length - RUN.cur : RUN.kind === 'sfall' ? (RUN.items.filter((s) => s.st === 'fall').length) : 0));
  const tt = RUN.kind === 'bloom' ? `🌸 Цветение · бутон ${Math.min(RUN.cur + 1, RUN.items.length)}/${RUN.items.length} · в полную силу: ${RUN.got}` : RUN.kind === 'sfall' ? `🌠 Звездопад · поймано ${RUN.got} · ещё летят: ${left}` : '';
  const a = LAYER.querySelector('.anx-tt'); if (a.textContent !== tt) a.innerHTML = A.emojiHtml(tt);
  const s = LAYER.querySelector('.anx-say'), say = RUN.say || ''; if (s.dataset.t !== say) { s.dataset.t = say; s.innerHTML = A.emojiHtml(say); s.style.display = say ? '' : 'none'; }
}

// ---- «Чары перед зеркалом»: Iskra draws a dotted figure on the glass, the player traces it (touch or mouse); 3 grades
const FIGS = (() => {
  const norm = (pts) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } const k = 1.7 / Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]); };
  const curve = (f, n = 240) => norm(Array.from({ length: n + 1 }, (_, k) => f(k / n * Math.PI * 2)));
  const resample = (pts, n = 72) => { const L = [0]; for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); const out = []; let j = 0; for (let k = 0; k < n; k++) { const d = L[L.length - 1] * k / (n - 1); while (j < L.length - 2 && L[j + 1] < d) j++; const u = (d - L[j]) / Math.max(1e-9, L[j + 1] - L[j]); out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]); } return out; };
  const star = norm(Array.from({ length: 11 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.42 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }));
  return [
    { n: 'круг', e: '⭕', p: resample(curve((t) => [Math.cos(t), Math.sin(t)])) },
    { n: 'сердце', e: '💗', p: resample(curve((t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])) },
    { n: 'звезда', e: '⭐', p: resample(star, 80) },
    { n: 'цветок', e: '🌸', p: resample(curve((t) => { const r = 0.45 + 0.55 * Math.abs(Math.sin(2.5 * t)); return [Math.cos(t) * r, Math.sin(t) * r]; }, 400), 96) },
    { n: 'бабочка', e: '🦋', p: resample(curve((t) => { const r = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t); return [Math.sin(t) * r, -Math.cos(t) * r]; }, 500), 110) },
  ];
})();
const MIR_LINES = [   // Iskra's reactions — placeholders, texts by Maria
  ['Ой, почти! Смелее, веди по точкам.', 'Хорошо, но можно точнее.'],
  ['Красиво! Ещё чуть-чуть ровнее.', 'Ярко вышло!'],
  ['Магия без красоты — просто фокус. А у тебя — магия!', 'Сияет! Вот это чары!'],
];
let MIR = null;
function initMirror() {
  RUN.items = FIGS.slice(0, ANNEX_BAL.mirror.figs).map((f) => ({ f, grade: -1 })); RUN.cur = 0;
  const w = document.createElement('div'); w.id = 'anx-mir';
  w.innerHTML = `<div class="anx-mtop"><span class="anx-mt"></span><button class="anx-x" aria-label="Закончить">✕</button></div><canvas class="anx-mcv"></canvas><div class="anx-msay"></div>`;
  document.body.appendChild(w); MIR = { w, cv: w.querySelector('canvas'), trace: [], drawing: false, ph: 'show', t0: performance.now() };
  const cv = MIR.cv, dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.min(320, window.innerWidth - 40), H = Math.round(W * 1.25);
  cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr; MIR.W = W; MIR.H = H; MIR.dpr = dpr;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (MIR.ph !== 'trace') return; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* old browsers */ } MIR.drawing = true; MIR.trace = [pt(e)]; if (!MIR.tt) MIR.tt = performance.now(); });
  cv.addEventListener('pointermove', (e) => { if (!MIR.drawing) return; e.preventDefault(); MIR.trace.push(pt(e)); });
  const end = () => { if (MIR && MIR.drawing) { MIR.drawing = false; gradeFig(); } }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  w.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); w.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  w.querySelector('.anx-x').addEventListener('click', () => finishEv(true));
  mirLoop();
}
function mirrorOff() { if (MIR) { MIR.w.remove(); MIR = null; } }
const figPts = (f) => { const W = MIR.W, H = MIR.H, s = W * 0.36, cx = W / 2, cy = H * 0.47; return f.p.map(([x, y]) => [cx + x * s, cy + y * s]); };
function gradeFig() {
  const it = RUN.items[RUN.cur]; if (!it || it.grade >= 0) return;
  const F = figPts(it.f), T = MIR.trace, R = ANNEX_BAL.mirror.R[Math.min(RUN.cur, 4)];
  if (T.length < 4) { it.grade = 0; it.score = 0; }
  else {
    const near = (p, L) => { let m = 1e9; for (const q of L) { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
    const cov = F.filter((p) => near(p, T) < R).length / F.length, prec = T.filter((p) => near(p, F) < R).length / T.length;
    it.score = cov * prec;   // how much of the outline was followed × how much of the stroke stayed on it
    const G = ANNEX_BAL.mirror.good; it.grade = it.score >= G[1] ? 2 : it.score >= G[0] ? 1 : 0;
  }
  RUN.got += it.grade === 2 ? 1 : 0; MIR.ph = 'flare'; MIR.t0 = performance.now(); MIR.say = MIR_LINES[it.grade][RUN.cur % 2]; A.sfx(it.grade ? 'fixed' : 'tick');
}
function mirLoop() {
  if (!MIR || !RUN) return; requestAnimationFrame(mirLoop);
  const B = ANNEX_BAL.mirror, t = performance.now(), it = RUN.items[RUN.cur], c = MIR.cv.getContext('2d'), W = MIR.W, H = MIR.H;
  if (!it) return;
  const el = (t - MIR.t0) / 1000;
  if (MIR.ph === 'show' && el > B.show * (RUN.cur === 0 && RUN.first ? 3 : 1)) { MIR.ph = 'trace'; MIR.t0 = t; MIR.trace = []; MIR.say = ''; }
  else if (MIR.ph === 'trace' && el > B.trace[Math.min(RUN.cur, 4)] && !MIR.drawing) { gradeFig(); }
  else if (MIR.ph === 'flare' && el > 1.6) { RUN.cur++; MIR.trace = []; MIR.ph = 'show'; MIR.t0 = t; if (RUN.cur >= RUN.items.length) { setTimeout(() => finishEv(false), 200); return; } }
  c.setTransform(MIR.dpr, 0, 0, MIR.dpr, 0, 0); c.clearRect(0, 0, W, H);
  // the mirror (placeholder: drawn oval glass in a gold frame; Maria's art: ANNEX_ART.mirror)
  const cx = W / 2, cy = H * 0.47, rx = W * 0.46, ry = H * 0.44;
  c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#d9ecff'); g.addColorStop(0.5, '#b9c8f4'); g.addColorStop(1, '#e8d8ff'); c.fillStyle = g; c.fill();
  c.lineWidth = 9; c.strokeStyle = '#d8a93a'; c.stroke(); c.lineWidth = 2; c.strokeStyle = '#fff3c2'; c.beginPath(); c.ellipse(cx, cy, rx - 6, ry - 6, 0, 0, Math.PI * 2); c.stroke(); c.restore();
  const F = figPts(it.f), shown = MIR.ph === 'show' ? Math.min(1, el / B.show) : 1;
  const glowK = MIR.ph === 'flare' ? [0.35, 0.8, 1.4][it.grade] * (1 - Math.min(1, el / 1.6) * 0.4) : 0.35;
  c.save(); c.shadowColor = MIR.ph === 'flare' && it.grade === 2 ? '#fff38a' : '#ffffff'; c.shadowBlur = 14 * glowK;
  if (MIR.ph === 'flare' && it.grade > 0) { c.lineWidth = it.grade === 2 ? 7 : 4; c.strokeStyle = it.grade === 2 ? '#ffe46b' : '#ffd0f0'; c.beginPath(); F.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
  c.fillStyle = MIR.ph === 'flare' && it.grade === 0 ? '#ffffff88' : '#ffffff'; const nShow = Math.floor(F.length * shown); for (let k = 0; k < nShow; k += 2) { c.beginPath(); c.arc(F[k][0], F[k][1], 3.2, 0, Math.PI * 2); c.fill(); }
  c.restore();
  if (MIR.trace.length > 1) { c.save(); c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#9b6bff'; c.globalAlpha = 0.8; c.beginPath(); MIR.trace.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); c.restore(); }
  if (MIR.ph === 'trace') { const left = Math.max(0, B.trace[Math.min(RUN.cur, 4)] - el); c.fillStyle = '#5a3fb0'; c.fillRect(W * 0.2, H - 10, W * 0.6 * left / B.trace[Math.min(RUN.cur, 4)], 5); }
  const tt = `🪞 Чары перед зеркалом · ${it.f.e} ${it.f.n} · ${RUN.cur + 1}/${RUN.items.length}`, mt = MIR.w.querySelector('.anx-mt'); if (mt.dataset.t !== tt) { mt.dataset.t = tt; mt.innerHTML = A.emojiHtml(tt); }
  const say = MIR.ph === 'show' ? (RUN.cur === 0 && RUN.first ? RUN.first : 'Мастер Искра рисует…') : MIR.ph === 'trace' ? 'Обведи фигуру пальцем!' : `Мастер Искра: «${MIR.say}» ${['· тускло', '· ярко ✨', '· сияет 🌟'][it.grade]}`, ms = MIR.w.querySelector('.anx-msay'); if (ms.dataset.t !== say) { ms.dataset.t = say; ms.innerHTML = A.emojiHtml(say); }
}

// ======================= 🔥 Круг стихий — «Гроза четырёх стихий» v2 (tools/_patch/annex_elements_v2.py; Ruslan 2026-11-26: «Должно быть задание
// типа: создайте «грязь». У вас есть рабочий стол, на который вы перетаскиваете элементы… сверху — задания, в центре — рабочий стол, снизу —
// элементы. Всё должно быть аккуратно подписано… Нужно взять рецепты напрямую из литой алхимии») =======================
// TOP = the current task in words («Создай: Пар», task N of 5). CENTRE = a workbench with 2 slots. BOTTOM = the player's set: the 4 bases + every
// item put «В набор», labelled tiles, scrolled sideways. Drag a tile onto the bench (or tap it: it goes to the first free slot; tap a bench slot to
// take it back). Both slots filled -> the result appears with its NAME: «В набор» (it joins the set and becomes an ingredient) or «Выкинуть».
// ANY pair gives something (Ruslan asked; designer's call): a Little Alchemy 2 recipe gives its item(s) (3 LA2 pairs give two), any other pair a
// «🫠 Клякса» that is never kept (fades after 2 s); 3 blobs in a row -> Буря puts one right ingredient of the next step on the bench.
// The task is done the moment its item is made: crystals, points (deeper = more, quick = ×1.5); 5 tasks per event, no timers. First event:
// Буря teaches step by step. A new item = «Новое: Пар!» + 💎 once; «📖 Книга стихий» lists every recipe («Огонь + Вода = Пар», «? + ? = ?»);
// all items found = title «Повелитель стихий». Recipes: Little Alchemy 2, literally (design/elements_recipes.md; keep both in sync).
const EL4 = { F: ['Огонь', '🔥'], W: ['Вода', '💧'], E: ['Земля', '🟫'], A: ['Воздух', '🌬️'] };
const ITEMS = {   // id: [name, picture]; Little Alchemy 2 items (LA2 name in design/elements_recipes.md); names plain words, texts by Maria
  dust: ['Пыль', '🌫️'], energy: ['Энергия', '⚡'], land: ['Суша', '🗺️'], lava: ['Лава', '🟠'], mist: ['Дымка', '💭'], mud: ['Грязь', '🟤'],
  pressure: ['Давление', '🗜️'], puddle: ['Лужа', '💦'], smoke: ['Дым', '💨'], steam: ['Пар', '♨️'], brick: ['Кирпич', '🟥'], continent: ['Материк', '🌍'],
  earthquake: ['Землетрясение', '💥'], geyser: ['Гейзер', '⛲'], heat: ['Жар', '🌡️'], obsidian: ['Обсидиан', '⬛'], pond: ['Пруд', '🪷'], stone: ['Камень', '🪨'],
  volcano: ['Вулкан', '🌋'], wind: ['Ветер', '🍃'], clay: ['Глина', '🏺'], lake: ['Озеро', '🛶'], metal: ['Металл', '🔩'], mountain: ['Гора', '⛰️'],
  planet: ['Планета', '🪐'], sand: ['Песок', '🟨'], tornado: ['Смерч', '🌪️'], wall: ['Стена', '🧱'], atmosphere: ['Атмосфера', '🌐'], beach: ['Пляж', '🏖️'],
  desert: ['Пустыня', '🏜️'], glass: ['Стекло', '🪟'], gold: ['Золото', '🥇'], house: ['Дом', '🏠'], moon: ['Луна', '🌙'], mrange: ['Горный хребет', '🏔️'],
  river: ['Река', '🏞️'], rust: ['Ржавчина', '🟧'], sea: ['Море', '🌊'], sun: ['Солнце', '☀️'], cloud: ['Облако', '☁️'], ocean: ['Океан', '🐋'], sky: ['Небо', '🌤️'],
  rainbow: ['Радуга', '🌈'], island: ['Остров', '🏝️'], oasis: ['Оазис', '🌴'], salt: ['Соль', '🧂'], hourglass: ['Песочные часы', '⌛'], village: ['Деревня', '🏘️'],
  aquarium: ['Аквариум', '🐠'], pyramid: ['Пирамида', '🔺'], eclipse: ['Затмение', '🌑'], soup: ['Первичный бульон', '🥣'], mirror: ['Зеркало', '🪞'],
  telescope: ['Телескоп', '🔭'], pool: ['Бассейн', '🏊'], hurricane: ['Ураган', '🌀'], rain: ['Дождь', '🌧️'], fog: ['Туман', '🌁'], storm: ['Буря', '⛈️'],
  life: ['Жизнь', '🐣'], day: ['День', '🏙️'], night: ['Ночь', '🌃'], lightning: ['Молния', '🌩️'], snow: ['Снег', '❄️'], bacteria: ['Бактерия', '🦠'],
  soil: ['Почва', '🪱'], plant: ['Растение', '🌱'], grass: ['Трава', '🌿'], algae: ['Водоросли', '🪸'], sunflower: ['Подсолнух', '🌻'], swamp: ['Болото', '🐸'],
};
const RECIPES = [   // [ingredient, ingredient, result]: every Little Alchemy 2 recipe whose 3 items are in ITEMS (+ the bases), as LA2 has them
  ['snow', 'heat', 'W'], ['F', 'mist', 'A'], ['E', 'A', 'dust'], ['A', 'soil', 'dust'], ['A', 'land', 'dust'], ['F', 'atmosphere', 'energy'], ['F', 'F', 'energy'],
  ['soil', 'soil', 'land'], ['E', 'E', 'land'], ['E', 'stone', 'land'], ['F', 'E', 'lava'], ['E', 'heat', 'lava'], ['W', 'A', 'mist'], ['A', 'steam', 'mist'],
  ['A', 'rain', 'mist'], ['W', 'E', 'mud'], ['W', 'soil', 'mud'], ['A', 'A', 'pressure'], ['atmosphere', 'atmosphere', 'pressure'], ['A', 'atmosphere', 'pressure'],
  ['ocean', 'ocean', 'pressure'], ['W', 'W', 'puddle'], ['F', 'plant', 'smoke'], ['F', 'grass', 'smoke'], ['F', 'A', 'smoke'], ['W', 'heat', 'steam'],
  ['W', 'F', 'steam'], ['W', 'lava', 'steam'], ['F', 'mud', 'brick'], ['mud', 'sun', 'brick'], ['F', 'clay', 'brick'], ['clay', 'sun', 'brick'],
  ['stone', 'clay', 'brick'], ['land', 'land', 'continent'], ['mrange', 'mrange', 'continent'], ['E', 'land', 'continent'], ['E', 'energy', 'earthquake'],
  ['E', 'steam', 'geyser'], ['steam', 'mountain', 'geyser'], ['steam', 'pressure', 'geyser'], ['A', 'energy', 'heat'], ['W', 'lava', 'obsidian'],
  ['lava', 'glass', 'obsidian'], ['W', 'puddle', 'pond'], ['puddle', 'puddle', 'pond'], ['E', 'pressure', 'stone'], ['A', 'lava', 'stone'],
  ['lava', 'mountain', 'volcano'], ['F', 'mountain', 'volcano'], ['pressure', 'mountain', 'volcano'], ['E', 'lava', 'volcano'], ['A', 'pressure', 'wind'],
  ['mud', 'sand', 'clay'], ['mud', 'stone', 'clay'], ['W', 'pond', 'lake'], ['pond', 'pond', 'lake'], ['F', 'stone', 'metal'], ['stone', 'heat', 'metal'],
  ['E', 'earthquake', 'mountain'], ['continent', 'continent', 'planet'], ['ocean', 'continent', 'planet'], ['E', 'sky', 'planet'], ['A', 'stone', 'sand'],
  ['wind', 'stone', 'sand'], ['storm', 'storm', 'tornado'], ['storm', 'wind', 'tornado'], ['wind', 'wind', 'tornado'], ['brick', 'brick', 'wall'],
  ['stone', 'stone', 'wall'], ['A', 'planet', 'atmosphere'], ['A', 'sky', 'atmosphere'], ['ocean', 'sand', 'beach'], ['sea', 'sand', 'beach'], ['sand', 'lake', 'beach'],
  ['W', 'sand', 'beach'], ['sand', 'sand', 'desert'], ['sand', 'land', 'desert'], ['F', 'sand', 'glass'], ['sand', 'heat', 'glass'], ['sand', 'lightning', 'glass'],
  ['metal', 'sun', 'gold'], ['metal', 'rainbow', 'gold'], ['sand', 'metal', 'gold'], ['wall', 'wall', 'house'], ['sky', 'planet', 'moon'], ['sky', 'stone', 'moon'],
  ['night', 'planet', 'moon'], ['stone', 'night', 'moon'], ['E', 'night', 'moon'], ['stone', 'planet', 'moon'], ['mountain', 'mountain', 'mrange'],
  ['mountain', 'continent', 'mrange'], ['W', 'mountain', 'river'], ['rain', 'mountain', 'river'], ['A', 'metal', 'rust'], ['W', 'lake', 'sea'], ['lake', 'lake', 'sea'],
  ['F', 'sky', 'sun'], ['sky', 'day', 'sun'], ['F', 'planet', 'sun'], ['atmosphere', 'mist', 'cloud'], ['W', 'atmosphere', 'cloud'], ['sky', 'mist', 'cloud'],
  ['W', 'sky', 'cloud'], ['W', 'sea', 'ocean'], ['sea', 'sea', 'ocean'], ['A', 'cloud', 'sky'], ['sun', 'atmosphere', 'sky'], ['moon', 'sun', 'sky'],
  ['cloud', 'atmosphere', 'sky'], ['rain', 'sun', 'rainbow'], ['W', 'sun', 'rainbow'], ['volcano', 'ocean', 'island'], ['volcano', 'sea', 'island'],
  ['W', 'desert', 'oasis'], ['desert', 'puddle', 'oasis'], ['desert', 'pond', 'oasis'], ['desert', 'lake', 'oasis'], ['desert', 'river', 'oasis'],
  ['ocean', 'sun', 'salt'], ['sea', 'sun', 'salt'], ['F', 'ocean', 'salt'], ['F', 'sea', 'salt'], ['sand', 'glass', 'hourglass'], ['house', 'house', 'village'],
  ['W', 'glass', 'aquarium'], ['glass', 'puddle', 'aquarium'], ['glass', 'pond', 'aquarium'], ['stone', 'desert', 'pyramid'], ['desert', 'mountain', 'pyramid'],
  ['moon', 'sun', 'eclipse'], ['lava', 'ocean', 'soup'], ['lava', 'sea', 'soup'], ['ocean', 'planet', 'soup'], ['E', 'ocean', 'soup'], ['sea', 'planet', 'soup'],
  ['E', 'sea', 'soup'], ['glass', 'metal', 'mirror'], ['sky', 'glass', 'telescope'], ['glass', 'moon', 'telescope'], ['glass', 'planet', 'telescope'],
  ['house', 'lake', 'pool'], ['ocean', 'tornado', 'hurricane'], ['sea', 'tornado', 'hurricane'], ['ocean', 'storm', 'hurricane'], ['sea', 'storm', 'hurricane'],
  ['cloud', 'heat', 'rain'], ['pressure', 'cloud', 'rain'], ['W', 'cloud', 'rain'], ['E', 'cloud', 'fog'], ['cloud', 'mountain', 'fog'], ['cloud', 'cloud', 'storm'],
  ['rain', 'wind', 'storm'], ['storm', 'soup', 'life'], ['volcano', 'soup', 'life'], ['ocean', 'lightning', 'life'], ['sea', 'lightning', 'life'],
  ['lake', 'lightning', 'life'], ['soup', 'lightning', 'life'], ['energy', 'soup', 'life'], ['sky', 'sun', 'day'], ['sun', 'night', 'day'], ['sky', 'moon', 'night'],
  ['energy', 'storm', 'lightning'], ['energy', 'cloud', 'lightning'], ['energy', 'rain', 'lightning'], ['storm', 'land', 'lightning'], ['rain', 'mountain', 'snow'],
  ['rain', 'mrange', 'snow'], ['life', 'soup', 'bacteria'], ['mud', 'life', 'bacteria'], ['E', 'life', 'soil'], ['life', 'land', 'soil'], ['algae', 'land', 'plant'],
  ['E', 'algae', 'plant'], ['life', 'soil', 'plant'], ['rain', 'soil', 'plant'], ['E', 'plant', 'grass'], ['plant', 'land', 'grass'], ['W', 'plant', 'algae'],
  ['grass', 'pond', 'algae'], ['grass', 'lake', 'algae'], ['W', 'grass', 'algae'], ['plant', 'sun', 'sunflower'], ['mud', 'grass', 'swamp'], ['algae', 'lake', 'swamp'],
  ['algae', 'pond', 'swamp'],
];
const BLOB = ['Клякса', '🫠'];
const RX = (() => {   // derived: pair -> results, item depth (layer), chain steps (combinations from the bases), elements inside, recipe layer
  const pair = {}, of = {}, steps = { F: 0, W: 0, E: 0, A: 0 }, layer = { F: 0, W: 0, E: 0, A: 0 }, els = { F: 'F', W: 'W', E: 'E', A: 'A' };
  const key = (a, b) => [a, b].sort().join('+'), keys = RECIPES.map(([a, b, r]) => key(a, b) + '=' + r);
  RECIPES.forEach(([a, b, r], k) => { const p = (pair[key(a, b)] ||= []); if (!p.includes(r)) p.push(r); (of[r] ||= []).push(k); });
  for (let ch = true, g = 0; ch && g < 80; g++) { ch = false;
    for (const [a, b, r] of RECIPES) { if (steps[a] === undefined || steps[b] === undefined) continue;
      const sN = a === b ? steps[a] + 1 : steps[a] + steps[b] + 1, l = 1 + Math.max(layer[a], layer[b]);
      if (steps[r] === undefined || sN < steps[r]) { steps[r] = sN; els[r] = [...new Set((els[a] + els[b]).split(''))].sort().join(''); ch = true; }
      if (layer[r] === undefined || l < layer[r]) { layer[r] = l; ch = true; } } }
  const rl = RECIPES.map(([a, b]) => 1 + Math.max(layer[a], layer[b]));
  const all = Object.keys(ITEMS).sort((x, y) => layer[x] - layer[y]);
  return { key, keys, pair, of, steps, layer, els, rl, all, maxL: Math.max(...all.map((i) => layer[i])) };
})();
const isBase = (x) => !!EL4[x];
const nmOf = (x) => (x === 'blob' ? BLOB : EL4[x] || ITEMS[x] || ['?', '❔'])[0], emOf = (x) => (x === 'blob' ? BLOB : EL4[x] || ITEMS[x] || ['?', '❔'])[1];
const book = () => (st('elcirc').bk2 ||= {});          // found recipes: 'a+b=r'
const seen = () => (st('elcirc').seen ||= {});         // found items
const inv = () => (st('elcirc').inv ||= {});           // items kept «В набор» (the bottom list; the 4 bases are always there)
const bookN = () => RX.keys.filter((k) => book()[k]).length;
const seenN = () => RX.all.filter((i) => seen()[i]).length;
const knownSet = () => new Set(RX.all.filter((i) => seen()[i]));
const depthCap = () => { let m = 1; for (const i of RX.all) if (seen()[i]) m = Math.max(m, RX.layer[i]); return Math.max(2, Math.min(m + 1, ANNEX_BAL.elcirc.depthL[st('elcirc').L || 1])); };
const setList = () => ['F', 'W', 'E', 'A', ...RX.all.filter((i) => inv()[i])];
const weekKey = (t = now()) => Math.floor((t / 86400000 + 3) / 7);   // the mini-games' week (Monday 00:00 UTC)
// hero tie (§5d): a Мастер of an element as the Elements class mentor doubles the points of tasks whose item has that element in its chain.
// HOOK: window.heroElemMentor() -> the mentor's element as the game's ELEMS index (0 fire, 1 water, 2 earth, 3 air) or 'F' | 'W' | 'E' | 'A', or null.
const heroEl = () => { try { const v = typeof window.heroElemMentor === 'function' ? window.heroElemMentor() : null; return typeof v === 'number' ? 'FWEA'[v] || null : 'FWEA'.includes(v) && v ? v : null; } catch (e) { return null; } };
const heroK = (it) => (RUN && RUN.hero && (RX.els[it] || '').includes(RUN.hero) ? 2 : 1);
const pick = (L) => L[Math.floor(Math.random() * L.length)];
// Буря's lines — placeholders, texts by Maria
const EL_OK = ['Договорились!', 'Видишь? Не приказ — разговор.', 'Стихии довольны!', 'Вот это да!'];
const EL_BLOB = ['Клякса! Эти двое не договорились.', 'Хм, бесформенное что-то. Попробуй другую пару.', 'Стихии фыркнули — вышла клякса.'];
const W = (x) => `${emOf(x)} ${nmOf(x)}`;
const ACC = { F: 'Огонь', W: 'Воду', E: 'Землю', A: 'Воздух' };   // accusative of the bases for Буря's lines
const WA = (x) => `${emOf(x)} ${ACC[x] || nmOf(x)}`;
let ELM = null, DRG = null;
function pickTasks() {   // 5 tasks: up to the depth cap, new items first by chance, then sorted easy -> deep
  const B = ANNEX_BAL.elcirc, cap = depthCap(), kn = knownSet();
  const pool = RX.all.filter((i) => RX.layer[i] <= cap), unk = pool.filter((i) => !kn.has(i)), known = pool.filter((i) => kn.has(i)), out = [];
  while (out.length < B.tasks && (unk.length || known.length)) { const L = unk.length && (!known.length || Math.random() < B.unkP) ? unk : known; out.push(L.splice(Math.floor(Math.random() * L.length), 1)[0]); }
  return out.sort((x, y) => RX.layer[x] - RX.layer[y]);
}
function initStorm() {
  const a = st('elcirc'), B = ANNEX_BAL.elcirc, teach = !a.t2;
  Object.assign(RUN, { tasks: teach ? B.teach.slice() : pickTasks(), ti: 0, bench: [null, null], res: [], blobs: 0, score: 0, got: 0, newRec: 0, newIt: 0, skips: 0, hints: 0,
    teach, tstep: 0, tt0: performance.now(), hero: heroEl(), say: '', hl: null, mixAt: 0, done2: false, bookOn: false });
  const w = document.createElement('div'); w.id = 'anx-elem';
  w.innerHTML = `<div class="el-top"><div class="el-hd"><b>⛈️ Круг стихий</b><span class="el-sc"></span><button class="anx-x" aria-label="Закончить">✕</button></div>
      <div class="el-task"><div class="el-tn"></div><div class="el-tw"></div><div class="el-dots"></div></div></div>
    <div class="el-say"></div>
    <div class="el-bench"><div class="el-mixrow"><div class="el-slot" data-el-slot="0"></div><span class="el-plus">+</span><div class="el-slot" data-el-slot="1"></div></div><div class="el-res"></div></div>
    <div class="el-lab"></div>
    <div class="el-tray"></div>
    <div class="el-foot"><button class="el-fb" data-el-book>📖 Книга стихий</button><button class="el-fb" data-el-skip>⏭ Другое задание</button></div>
    <div class="el-bookov"></div>`;
  document.body.appendChild(w); ELM = { w, k: {} };
  w.addEventListener('click', elClick);
  w.addEventListener('pointerdown', elDown);
  window.addEventListener('pointermove', elMove); window.addEventListener('pointerup', elUp); window.addEventListener('pointercancel', elCancel);
  w.querySelector('.el-tray').addEventListener('wheel', (e) => { e.currentTarget.scrollLeft += e.deltaY + e.deltaX; e.preventDefault(); }, { passive: false });
  sayTask(); stormLoop();
}
function stormOff() {
  if (!ELM) return; window.removeEventListener('pointermove', elMove); window.removeEventListener('pointerup', elUp); window.removeEventListener('pointercancel', elCancel);
  if (DRG && DRG.g) DRG.g.remove(); DRG = null; ELM.w.remove(); ELM = null;
}
const task = () => RUN.tasks[RUN.ti];
function sayTask() {   // the teacher's line for a fresh task (teaching = step by step)
  const x = task(); RUN.hl = null; if (!x) return;
  if (RUN.teach) {
    if (RUN.ti === 0) { RUN.say = `Госпожа Буря: «Перетащи ${WA('F')} на стол…»`; RUN.hl = 'F'; RUN.tstep = 0; }
    else if (RUN.ti === 1) { RUN.say = `Госпожа Буря: «${nmOf(x)} — это вода и вода. Перетащи ${WA('W')} на стол два раза.»`; RUN.hl = 'W'; }
    else if (RUN.ti === 2) RUN.say = 'Госпожа Буря: «Теперь сам: из каких двух стихий выйдет Грязь?»';
    else if (RUN.ti === 3) { RUN.say = `Госпожа Буря: «Сделанное — тоже ингредиент! Пруд получается из Лужи. Найди её внизу.»`; RUN.hl = 'puddle'; }
    else RUN.say = 'Госпожа Буря: «Последнее — сам. Если трижды выйдет клякса, я подскажу.»';
  } else RUN.say = RUN.ti === 0 ? 'Госпожа Буря: «Гроза собралась! Сверху — что нужно сделать.»' : '';
}
// ---- dragging (pointer events: finger and mouse). A tile moved up = drag; moved sideways = the tray scrolls (touch-action: pan-x)
function elDown(e) {
  if (!RUN || RUN.done || RUN.bookOn || RUN.res.length) return; const t = e.target.closest('.el-tile'); if (!t) return;
  DRG = { id: t.dataset.el, x0: e.clientX, y0: e.clientY, on: false, g: null, pid: e.pointerId };
}
function elMove(e) {
  if (!DRG || e.pointerId !== DRG.pid) return; const dx = e.clientX - DRG.x0, dy = e.clientY - DRG.y0;
  if (!DRG.on) { if (Math.hypot(dx, dy) < 8) return; if (Math.abs(dx) > Math.abs(dy) * 1.2 && e.pointerType !== 'mouse') { DRG = null; return; }
    DRG.on = true; const g = document.createElement('div'); g.className = 'el-ghost'; g.innerHTML = A.emojiHtml(`${emOf(DRG.id)}<small>${nmOf(DRG.id)}</small>`); ELM.w.appendChild(g); DRG.g = g; }
  DRG.g.style.left = e.clientX + 'px'; DRG.g.style.top = e.clientY + 'px'; const k = slotAt(e.clientX, e.clientY); ELM.w.querySelectorAll('.el-slot').forEach((s, j) => s.classList.toggle('over', j === k));
}
function slotAt(x, y) {   // the bench slot under the point; anywhere over the bench = the first free slot
  const ss = [...ELM.w.querySelectorAll('.el-slot')], hit = ss.findIndex((s) => { const r = s.getBoundingClientRect(); return x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; });
  if (hit >= 0) return hit; const r = ELM.w.querySelector('.el-bench').getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? -2 : -1;
}
function elUp(e) {
  if (!DRG || e.pointerId !== DRG.pid) return; const d = DRG; DRG = null;
  if (d.g) d.g.remove(); if (ELM) ELM.w.querySelectorAll('.el-slot.over').forEach((s) => s.classList.remove('over'));
  if (!RUN || RUN.done) return;
  if (!d.on) { place(d.id, -2); return; }   // a tap = to the first free slot
  const k = slotAt(e.clientX, e.clientY); if (k !== -1) place(d.id, k);
}
function elCancel() { if (DRG && DRG.g) DRG.g.remove(); DRG = null; }
function place(x, k) {
  if (RUN.res.length || RUN.mixAt) return; const b = RUN.bench;
  if (k < 0 || b[k]) k = b[0] ? (b[1] ? -1 : 1) : 0; if (k < 0) return;
  b[k] = x; A.sfx('tick');
  if (RUN.teach && RUN.ti === 0) { if (b.filter(Boolean).length === 1) { RUN.say = x === 'F' ? `Госпожа Буря: «…теперь ${WA('W')}»` : x === 'W' ? `Госпожа Буря: «…теперь ${WA('F')}»` : `Госпожа Буря: «Для Пара нужны ${W('F')} и ${W('W')}»`; RUN.hl = x === 'W' ? 'F' : 'W'; } }
  if (b[0] && b[1]) RUN.mixAt = performance.now() + 380;
}
function combine(t) {
  const B = ANNEX_BAL.elcirc, [x, y] = RUN.bench, rs = (RX.pair[RX.key(x, y)] || []).slice(); RUN.mixAt = 0; RUN.last = [x, y];
  if (!rs.length) { RUN.res = [{ id: 'blob', t }]; RUN.blobs++; RUN.say = `Госпожа Буря: «${pick(EL_BLOB)}»`; A.sfx('tick'); stat('blob', 'elcirc'); return; }
  RUN.blobs = 0; const need = task(); rs.sort((p, q) => (q === need) - (p === need)); RUN.gain = '';
  let say = '';
  for (const r of rs) { const k = RX.key(x, y) + '=' + r, isNew = !seen()[r] && !isBase(r);
    if (!book()[k]) { book()[k] = 1; RUN.newRec++; }
    if (isNew) { seen()[r] = 1; RUN.newIt++; rareAdd('elcirc', B.newItem); say = `Новое: ${nmOf(r)}!`; RUN.gain += ` · находка 💎 +${B.newItem}`; checkBook(); }
    RUN.res.push({ id: r, isNew, t }); }
  if (need && rs.includes(need)) taskDone(t, need); else RUN.say = `Госпожа Буря: «${say ? say + ' ' : ''}Это не то, что нужно, но пригодится. Нужно — ${nmOf(need)}.»`;
  A.sfx('fixed'); A.save();
}
function checkBook() {
  const a = st('elcirc'); if (a.ttl2 || seenN() < RX.all.length) return; a.ttl2 = 1; a.ttl = 1; rareAdd('elcirc', ANNEX_BAL.elcirc.bookAll); RUN.bookDone = 1;
  glog('toast', '📖 Книга стихий собрана — Госпожа Буря называет тебя «Повелитель стихий»', WORLD); stat('book', 'elcirc', { n: RX.all.length });
}
function taskDone(t, x) {
  const B = ANNEX_BAL.elcirc, fast = t - RUN.tt0 < B.fastSec * Math.max(1, RX.steps[x]) * 1000, hk = heroK(x);
  const pts = Math.round(B.pts * Math.max(1, RX.steps[x]) * (fast ? B.fastK : 1) * hk);
  RUN.score += pts; RUN.got++; RUN.done2 = true; rareAdd('elcirc', B.taskCrys);
  RUN.say = `Госпожа Буря: «${RUN.teach && RUN.ti === 0 ? `Получился ${nmOf(x)}! Нажми «В набор» — ${nmOf(x)} ляжет вниз, к твоим стихиям.` : `${pick(EL_OK)} Готово: ${nmOf(x)}!`}»`;
  RUN.gain = `✓ Задание выполнено · 💎 +${B.taskCrys} · +${pts} очков${fast ? ' (быстро ×' + B.fastK + ')' : ''}${hk > 1 ? ' · наставник ×2' : ''}${RUN.gain}`;
  if (RUN.teach && RUN.ti === 0) RUN.hl = null;
}
function resolve(keep) {   // the result card: «В набор» / «Выкинуть» / «Хорошо»
  const r = RUN.res.shift(); if (!r) return; RUN.gain = '';
  if (keep && r.id !== 'blob' && !isBase(r.id) && !inv()[r.id]) { inv()[r.id] = 1; A.sfx('fixed'); }
  if (r.id === 'blob' && RUN.blobs >= ANNEX_BAL.elcirc.blobHint) hint();
  RUN.bench = [null, null];
  if (!RUN.res.length && RUN.done2) nextTask();
  A.save();
}
function nextTask() {
  RUN.done2 = false; RUN.ti++; RUN.tt0 = performance.now(); RUN.blobs = 0;
  if (RUN.ti >= RUN.tasks.length) { if (RUN.teach) st('elcirc').t2 = 1; setTimeout(() => finishEv(false), 700); RUN.say = 'Госпожа Буря: «Все задания сделаны! Гроза довольна.»'; return; }
  sayTask();
}
function nextPair(tg) {   // the next makeable step towards tg with what the player holds now: [a, b, item]
  const have = new Set(setList()), c = {}, via = {}; have.forEach((h) => { c[h] = 0; });
  for (let ch = true, g = 0; ch && g < 80; g++) { ch = false;
    RECIPES.forEach(([a, b, r], j) => { if (c[a] === undefined || c[b] === undefined) return; const v = (a === b ? c[a] : c[a] + c[b]) + 1; if (c[r] === undefined || v < c[r]) { c[r] = v; via[r] = j; ch = true; } }); }
  let x = tg; for (let g = 0; g < 30; g++) { if (have.has(x) || via[x] === undefined) return null; const [a, b] = RECIPES[via[x]]; if (have.has(a) && have.has(b)) return [a, b, x]; x = have.has(a) ? b : a; }
  return null;
}
function hint() {
  const p = nextPair(task()); RUN.blobs = 0; if (!p) return; const [a, , x] = p; RUN.hints++;
  setTimeout(() => { if (!RUN || RUN.done || RUN.res.length) return; RUN.bench = [a, null]; RUN.hl = null;
    RUN.say = `Госпожа Буря: «Подскажу: ${x === task() ? '' : `сначала сделай ${nmOf(x)}. `}${W(a)} уже на столе — что добавить?»`; }, 60);
  stat('hint', 'elcirc');
}
function skipTask() {
  if (RUN.res.length || RUN.teach) return; const cap = depthCap(), pool = RX.all.filter((i) => RX.layer[i] <= cap && !RUN.tasks.includes(i));
  if (!pool.length) return; RUN.tasks[RUN.ti] = pick(pool); RUN.skips++; RUN.tt0 = performance.now(); RUN.blobs = 0; RUN.bench = [null, null]; RUN.say = `Госпожа Буря: «Хорошо, другое: ${nmOf(task())}.»`; A.sfx('tick');
}
function elClick(e) {
  if (!RUN || RUN.kind !== 'storm' || RUN.done) return;
  if (e.target.closest('[data-el-bookx]')) { RUN.bookOn = false; return; }
  if (e.target.closest('.anx-x')) { finishEv(true); return; }
  if (RUN.bookOn) return;
  if (e.target.closest('[data-el-book]')) { RUN.bookOn = true; ELM.w.querySelector('.el-bookov').innerHTML = A.emojiHtml(`<div class="el-bkhd"><b>📖 Книга стихий</b><button class="el-bkx" data-el-bookx>Закрыть</button></div>${bookBody()}`); return; }
  if (e.target.closest('[data-el-skip]')) { skipTask(); return; }
  const rb = e.target.closest('[data-el-res]'); if (rb) { resolve(rb.dataset.elRes === 'keep'); return; }
  const s = e.target.closest('[data-el-slot]'); if (s && !RUN.res.length && !RUN.mixAt) { const k = +s.dataset.elSlot; if (RUN.bench[k]) { RUN.bench[k] = null; A.sfx('tick'); } }
}
function stormLoop() {
  if (!ELM || !RUN || RUN.kind !== 'storm' || RUN.done) return; requestAnimationFrame(stormLoop);
  const t = performance.now();
  if (RUN.mixAt && t >= RUN.mixAt) combine(t);
  const r0 = RUN.res[0]; if (r0 && r0.id === 'blob' && t - r0.t > ANNEX_BAL.elcirc.blobFade * 1000) resolve(false);
  stormHud(t);
}
function setH(el, key, html) { if (!el || ELM.k[key] === html) return; ELM.k[key] = html; el.innerHTML = A.emojiHtml(html); }
const SHY = { earthquake: 'Земле­трясение', atmosphere: 'Атмо­сфера', algae: 'Водо­росли', sunflower: 'Под­солнух', soup: 'Первич­ный бульон', bacteria: 'Бакте­рия' };   // soft hyphens for long words on the small tiles
const tileH = (x, cls = '') => `<div class="el-tile${cls}" data-el="${x}"><span class="el-em">${emOf(x)}</span><small>${SHY[x] || nmOf(x)}</small></div>`;
function stormHud(t) {
  const w = ELM.w, x = task(), N = RUN.tasks.length, r = RUN.res[0];
  setH(w.querySelector('.el-sc'), 'sc', `очки ${RUN.score}`);
  setH(w.querySelector('.el-tn'), 'tn', x ? `Задание ${Math.min(RUN.ti + 1, N)} из ${N}${RUN.done2 ? ' · готово ✓' : ''}` : `Все ${N} заданий сделаны`);
  setH(w.querySelector('.el-tw'), 'tw', x ? `Создай: <b>${emOf(x)} ${nmOf(x)}</b>` : '🌈 Гроза довольна!');
  setH(w.querySelector('.el-dots'), 'dots', RUN.tasks.map((_, k) => `<i class="${k < RUN.ti || (k === RUN.ti && RUN.done2) ? 'ok' : k === RUN.ti ? 'cur' : ''}"></i>`).join(''));
  setH(w.querySelector('.el-say'), 'say', RUN.say || 'Перетащи два элемента на стол — посмотрим, что выйдет.');
  w.querySelectorAll('.el-slot').forEach((s, k) => { const v = RUN.bench[k]; setH(s, 's' + k, v ? `<span class="el-em">${emOf(v)}</span><small>${nmOf(v)}</small>` : '<span class="el-ph">перетащи сюда</span>');
    const cn = 'el-slot' + (v ? ' full' : '') + (RUN.mixAt ? ' mix' : '') + (s.classList.contains('over') ? ' over' : ''); if (s.className !== cn) s.className = cn; });
  const rh = !r ? '' : r.id === 'blob'
    ? `<div class="el-eq">${nmOf(RUN.last[0])} + ${nmOf(RUN.last[1])} =</div><div class="el-big blob">${emOf('blob')}</div><div class="el-rn">Клякса — ничего полезного</div><div class="el-btns"><button class="btn" data-el-res="drop">Выкинуть</button></div>`
    : `<div class="el-eq">${nmOf(RUN.last[0])} + ${nmOf(RUN.last[1])} =</div><div class="el-big${r.id === x || (RUN.done2 && r.id === RUN.tasks[RUN.ti]) ? ' goal' : ''}">${emOf(r.id)}</div><div class="el-rn">${r.isNew ? '<em>Новое:</em> ' : ''}${nmOf(r.id)}${r.isNew ? '!' : ''}</div>${r === RUN.res[0] && RUN.gain && r.id !== 'blob' ? `<div class="el-gain">${RUN.gain.replace(/^ · /, '')}</div>` : ''}
      <div class="el-btns">${isBase(r.id) || inv()[r.id] ? `<button class="btn hot" data-el-res="drop">Хорошо — уже в наборе</button>` : `<button class="btn hot" data-el-res="keep">⬇ В набор</button><button class="btn" data-el-res="drop">🗑 Выкинуть</button>`}</div>`;
  setH(w.querySelector('.el-res'), 'res', rh); const bc = 'el-bench' + (r ? ' show' : '') + (r && r.id === 'blob' ? ' blobbed' : ''); const be = w.querySelector('.el-bench'); if (be.className !== bc) be.className = bc;
  const L = setList(); setH(w.querySelector('.el-lab'), 'lab', `Твой набор · ${L.length} — перетащи на стол или нажми`);
  setH(w.querySelector('.el-tray'), 'tray', L.map((i) => tileH(i, i === RUN.hl ? ' hl' : isBase(i) ? ' base' : '')).join(''));
  const sk = w.querySelector('[data-el-skip]'); if (sk.disabled !== (RUN.teach || !!r)) sk.disabled = RUN.teach || !!r;
  const bo = w.querySelector('.el-bookov'), bcn = 'el-bookov' + (RUN.bookOn ? ' on' : ''); if (bo.className !== bcn) bo.className = bcn;
}
function stormEnd(R) {   // the event's end: crystals were paid per task and per new item; the weekly record (local, like the mini-games' week bests)
  const B = ANNEX_BAL.elcirc, a = st('elcirc'), wk = weekKey(); if (a.wk2 !== wk) { a.wk2 = wk; a.wb2 = 0; }
  const rec = R.score > 0 && R.score > (a.wb2 || 0); if (rec) a.wb2 = R.score; a.best2 = Math.max(a.best2 || 0, R.score);
  R.sum = `заданий ${R.got} из ${R.tasks.length}, очки ${R.score}${rec ? ' (рекорд недели!)' : ''}${R.newIt ? `, новых находок ${R.newIt}` : ''}`;
  stat('elem_end', 'elcirc', { d: R.got, s: R.score, ni: R.newIt, h: R.hints, sk: R.skips, t: R.teach ? 1 : 0 });
  return 0;   // crystals already given: 💎 taskCrys per task + newItem per new item (shown at once)
}
function bookBody() {   // every recipe, grouped by the item it makes, by depth; found = «Огонь + Вода = Пар», not found = «? + ? = ?»
  const b = book(), s = seen(); let h = `<p class="muted">Находок ${seenN()} из ${RX.all.length} · рецептов ${bookN()} из ${RX.keys.length}. Новая находка — 💎 ${ANNEX_BAL.elcirc.newItem}. Все находки — титул «Повелитель стихий» (💎 +${ANNEX_BAL.elcirc.bookAll}).</p>`;
  for (let L = 1; L <= RX.maxL; L++) {
    const its = RX.all.filter((i) => RX.layer[i] === L); if (!its.length) continue;
    h += `<h3>Ступень ${L} · ${its.filter((i) => s[i]).length}/${its.length}</h3><div class="el-book">`;
    for (const i of its) for (const j of RX.of[i]) { const [x, y] = RECIPES[j];
      h += b[RX.keys[j]] ? `<div class="el-rec">${W(x)} + ${W(y)} = <b>${W(i)}</b></div>` : `<div class="el-rec off">? + ? = ${s[i] ? `${W(i)} <i>(другой рецепт)</i>` : '?'}</div>`; }
    h += '</div>';
  }
  return h;
}
function bookHtml() {   // «📖 Книга стихий» in the circle panel
  const a = st('elcirc');
  return `<div class="sh-head"><span class="remoji big">📖</span><div><h2>Книга стихий</h2><div class="muted">находок ${seenN()} из ${RX.all.length}${a.ttl ? ' · 👑 Повелитель стихий' : ''}</div></div><button class="x" data-close>✕</button></div>`
    + bookBody() + `<button class="btn wide" data-anx="back" data-id="elcirc" style="margin-top:10px">⬅ К кругу стихий</button>`;
}
function circleCard() {
  const a = st('elcirc'), wk = weekKey(), wb = a.wk2 === wk ? a.wb2 || 0 : 0;
  return `<div class="card"><span class="remoji">📖</span><div class="grow"><b>Книга стихий: ${seenN()} из ${RX.all.length} находок</b><div class="muted">рекорд недели: ${wb} · лучший: ${a.best2 || 0}${a.ttl ? ' · 👑 Повелитель стихий' : ''} · задания до ступени ${depthCap()}</div></div><button class="btn" data-anx="book" data-id="elcirc">Открыть</button></div>`;
}
function drawCircle(c, g, a, T) {   // placeholder: four standing stones around a rune ring (Maria's art: ANNEX_ART.elcirc)
  const P = A.P, q = P(g.x, g.y), rx = 1.2 * A.HW, ry = 1.2 * A.HH;
  c.save(); c.beginPath(); c.ellipse(q.x, q.y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(140,120,175,0.42)'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#efe4ff'; c.setLineDash([5, 3]); c.stroke();
  c.beginPath(); c.ellipse(q.x, q.y, rx * 0.45, ry * 0.45, 0, 0, Math.PI * 2); c.setLineDash([]); c.lineWidth = 1.5; c.strokeStyle = '#ffffffaa'; c.stroke(); c.restore();
  const ready = a.ev && a.ev.rdy, ST = [['A', 0, -0.9, '200,235,255'], ['W', -0.9, 0, '120,190,255'], ['F', 0.9, 0, '255,150,90'], ['E', 0, 0.9, '190,160,110']];
  for (const [x, dx, dy, rgb] of ST) { const p = P(g.x + dx, g.y + dy), h = 32 + (a.L - 1) * 3;
    if (ready || a.L > 2) c.drawImage(A.glow(rgb), p.x - 14, p.y - h - 12, 28, 28);
    c.fillStyle = 'rgba(40,30,60,0.25)'; c.beginPath(); c.ellipse(p.x, p.y, 11, 5, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(p.x - 8, p.y); c.lineTo(p.x - 9, p.y - h + 7); c.quadraticCurveTo(p.x, p.y - h - 4, p.x + 9, p.y - h + 7); c.lineTo(p.x + 8, p.y); c.closePath();
    c.fillStyle = '#a7a2b8'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#4f4a63'; c.stroke(); c.fillStyle = '#c9c5d8'; c.fillRect(p.x - 6, p.y - h + 6, 4, h - 8);
    A.emoji(EL4[x][1], p.x, p.y - h * 0.55, 12, c); }
  if (ready) { const p = UP(q, 46 + Math.sin(T * 2.5) * 3); c.drawImage(A.glow('210,225,255'), p.x - 26, p.y - 24, 52, 48); A.emoji('⛈️', p.x, p.y, 22, c); }
}

// ---- the teacher's short line (not a window): a bubble at the top for a few seconds
function bubble(who, text, ms = 5000) {
  let b = document.getElementById('anx-bubble'); if (!b) { b = document.createElement('div'); b.id = 'anx-bubble'; document.body.appendChild(b); }
  b.innerHTML = A.emojiHtml(`<b>${who}:</b> ${text}`); b.classList.add('on'); clearTimeout(bubble.t); bubble.t = setTimeout(() => b.classList.remove('on'), ms); glog('toast', `${who}: ${text}`, WORLD);
}

// ---- drawing (placeholders, Maria's art replaces them through ANNEX_ART)
const ARTIM = {};
function art(k) { const src = ANNEX_ART[k]; if (!src) return null; let im = ARTIM[k]; if (!im) { im = ARTIM[k] = new Image(); im.src = src; } return im.complete && im.naturalWidth ? im : null; }
function poly(c, pts, fill, line, lw = 1.4) { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (line) { c.strokeStyle = line; c.lineWidth = lw; c.stroke(); } }
const UP = (p, h) => ({ x: p.x, y: p.y - h });
function houseBox(c, g, h, rh, col) {   // walls + gable roof along x
  const P = A.P, a = P(g.x0, g.y1), b = P(g.x1, g.y1), r = P(g.x1, g.y0), t = P(g.x0, g.y0), ym = (g.y0 + g.y1) / 2, R0 = UP(P(g.x0, ym), h + rh), R1 = UP(P(g.x1, ym), h + rh);
  poly(c, [UP(t, h), UP(r, h), R1, R0], col.roof2, col.line);
  poly(c, [a, b, UP(b, h), UP(a, h)], col.left, col.line); poly(c, [b, r, UP(r, h), UP(b, h)], col.right, col.line);
  poly(c, [UP(b, h), UP(r, h), R1], col.gable || col.right, col.line); poly(c, [UP(a, h), UP(b, h), R1, R0], col.roof, col.line);
}
function ghost(c, g) { const P = A.P; c.save(); c.setLineDash([5, 4]); poly(c, [P(g.x0, g.y0), P(g.x1, g.y0), P(g.x1, g.y1), P(g.x0, g.y1)], 'rgba(255,255,255,0.25)', '#ffffffcc', 1.6); c.restore(); }
function drawBuildFx(c, id, g) { const left = Math.max(0, Math.ceil((st(id).bt - now()) / 1000)), q = A.P(g.x, g.y), k = Math.sin(performance.now() / 180) * 3; ghost(c, g); A.emoji('🏗️', q.x, q.y - 18 + k, 26, c); A.text(`${left} с`, q.x, q.y + 6, 11, '#5a3fb0', c); }
function drawAnnex(id) {
  const c = A.ctx(), g = geo(id); if (!g) return; const a = st(id), P = A.P, T = performance.now() / 1000;
  if (a.bt) { drawBuildFx(c, id, g); return; }
  if (!a.b) { ghost(c, g); return; }
  const im = art(id === 'orchard' ? '' : id); if (im) { const q = P(g.x, g.y1), w = (g.w + g.d) * A.HW * 0.9, h = w * im.naturalHeight / im.naturalWidth; c.drawImage(im, q.x - w / 2, q.y - h, w, h); return; }
  if (id === 'greenh') {
    const fl = Math.min(4, Math.ceil(a.n / Math.max(1, capOf(id)) * 4));
    houseBox(c, g, 30, 16, { left: 'rgba(205,240,255,0.66)', right: 'rgba(175,228,250,0.7)', roof: 'rgba(228,250,255,0.78)', roof2: 'rgba(170,220,242,0.7)', line: '#4f9a66' });
    c.globalAlpha = 0.9; for (let k = 0; k < 4; k++) { const q = P(g.x - 0.6 + (k % 2) * 1.1, g.y - 0.5 + Math.floor(k / 2) * 1.0); A.emoji(k < fl ? '🌿' : '🌱', q.x, q.y - 10, k < fl ? 16 : 11, c); } c.globalAlpha = 1;
    const e = a.ev; if (e && e.rdy) { const q = UP(P(g.x, g.y), 58 + Math.sin(T * 3) * 3); c.drawImage(A.glow('255,180,230'), q.x - 22, q.y - 22, 44, 44); A.emoji('🌷', q.x, q.y, 18, c); }
  } else if (id === 'pantry') {
    houseBox(c, g, 24, 13, { left: '#c98d5a', right: '#ad7447', roof: '#8a4f2c', roof2: '#6e3d22', gable: '#ad7447', line: '#5b3418' });
    const n = Math.min(4, Math.ceil(a.n / Math.max(1, capOf(id)) * 4)), a0 = P(g.x0, g.y1), b0 = P(g.x1, g.y1);
    for (let k = 0; k < n; k++) { const u = 0.2 + k * 0.2; A.emoji('🫙', a0.x + (b0.x - a0.x) * u, a0.y + (b0.y - a0.y) * u - 12, 9, c); }
  } else if (id === 'obs') {
    const q = P(g.x, g.y), rx = 21, ry = 13, h = 56, open = a.ev && (a.ev.rdy || (RUN && RUN.id === 'obs'));
    c.fillStyle = '#e9dcc6'; c.strokeStyle = '#8f7a5c'; c.lineWidth = 1.3; c.beginPath(); c.ellipse(q.x, q.y, rx, ry, 0, 0, Math.PI); c.lineTo(q.x - rx, q.y - h); c.ellipse(q.x, q.y - h, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill(); c.stroke();
    for (let k = 1; k < 4; k++) { c.beginPath(); c.ellipse(q.x, q.y - h * k / 4, rx, ry, 0, 0, Math.PI); c.strokeStyle = '#c9b493'; c.stroke(); }
    c.fillStyle = '#5b4bb5'; c.strokeStyle = '#3a2f80'; c.beginPath(); c.ellipse(q.x, q.y - h, rx + 2, ry + 1, 0, 0, Math.PI); c.ellipse(q.x, q.y - h, rx + 2, rx * 1.05, 0, Math.PI, 0); c.fill(); c.stroke();
    c.fillStyle = open ? '#ffe9a0' : '#2c2466'; c.fillRect(q.x - 3, q.y - h - rx * 0.95, 6, rx * 0.95); if (open) { c.drawImage(A.glow('255,236,160'), q.x - 26, q.y - h - 40, 52, 52); A.emoji('🔭', q.x + 8, q.y - h - rx * 0.8, 14, c); }
    A.emoji('🚪', q.x + 6, q.y - 9, 12, c);
  } else if (id === 'mirror') {
    const q = P(g.x, g.y), h = 56; c.strokeStyle = '#8a5a2b'; c.lineWidth = 3; c.beginPath(); c.moveTo(q.x - 10, q.y); c.lineTo(q.x - 4, q.y - 16); c.moveTo(q.x + 10, q.y); c.lineTo(q.x + 4, q.y - 16); c.stroke();
    const gg = c.createLinearGradient(q.x - 14, q.y - h, q.x + 14, q.y - 14); gg.addColorStop(0, '#e6f2ff'); gg.addColorStop(1, '#bba8f0'); c.fillStyle = gg; c.beginPath(); c.ellipse(q.x, q.y - h / 2 - 8, 14, h / 2 - 6, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = 3.5 + (a.L - 1) * 0.6; c.strokeStyle = '#d8a93a'; c.stroke(); for (let k = 0; k < a.L - 1; k++) A.emoji('✨', q.x + (k % 2 ? 14 : -14), q.y - h + 10 + k * 9, 7, c);
    if (a.ev && a.ev.rdy) { c.drawImage(A.glow('255,220,255'), q.x - 26, q.y - h - 6, 52, 52); A.emoji('🦋', q.x, q.y - h / 2 - 8 + Math.sin(T * 2) * 4, 13, c); }
  } else if (id === 'kite') {
    const a0 = P(g.x0, g.y1), b0 = P(g.x1, g.y1), r0 = P(g.x1, g.y0), t0 = P(g.x0, g.y0), h = 58; c.strokeStyle = '#7a5230'; c.lineWidth = 3;
    for (const p of [t0, r0, a0, b0]) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + (P(g.x, g.y).x - p.x) * 0.25, p.y - h); c.stroke(); }
    c.lineWidth = 1.2; for (const hh of [18, 36]) { c.beginPath(); c.moveTo(a0.x + (P(g.x, g.y).x - a0.x) * 0.1, a0.y - hh); c.lineTo(b0.x, b0.y - hh); c.lineTo(r0.x + (P(g.x, g.y).x - r0.x) * 0.1, r0.y - hh); c.stroke(); }
    const sh = (p) => ({ x: p.x + (P(g.x, g.y).x - p.x) * 0.25, y: p.y - h }); poly(c, [sh(t0), sh(r0), sh(b0), sh(a0)], '#c79a62', '#7a5230');
    const top = UP(P(g.x, g.y), h + 4); c.strokeStyle = '#555'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(top.x, top.y); c.lineTo(top.x, top.y - 26); c.stroke();
    for (let k = 0; k < 4; k++) { const w = Math.sin(T * 3 + k) * 2, x0 = top.x + k * 6, x1 = x0 + 6; poly(c, [{ x: x0, y: top.y - 26 + k * 0.6 + w * 0.3 }, { x: x1, y: top.y - 25.4 + k * 0.6 + w }, { x: x1, y: top.y - 19.6 - k * 0.6 + w }, { x: x0, y: top.y - 19 - k * 0.6 + w * 0.3 }], k % 2 ? '#ffffff' : '#e8483f', '#9b2a24', 0.6); }
  } else if (id === 'pond') { const q = P(g.x, g.y); A.emoji('🧺', q.x, q.y - 8, 16, c); if (a.n) A.text(`🐟${a.n}`, q.x, q.y + 8, 9, '#ffffff', c); }
  else if (id === 'elcirc') drawCircle(c, g, a, T);
}
function drawOrchardBack() {   // the plot: soil, holes, back fence (ground layer)
  const c = A.ctx(), g = geo('orchard'); if (!g) return; const a = st('orchard'), P = A.P;
  if (a.bt) { drawBuildFx(c, 'orchard', g); return; } if (!a.b) { ghost(c, g); return; }
  poly(c, [P(g.x0, g.y0), P(g.x1, g.y0), P(g.x1, g.y1), P(g.x0, g.y1)], 'rgba(150,110,70,0.35)', null);
  for (const h of holes()) { const q = P(h.x, h.y); c.fillStyle = '#6b4a2b'; c.beginPath(); c.ellipse(q.x, q.y, 9, 5.5, 0, 0, Math.PI * 2); c.fill(); }
  fence(c, g, true);
}
function fence(c, g, back) {
  const P = A.P, seg = back ? [[g.x0, g.y1, g.x0, g.y0], [g.x0, g.y0, g.x1, g.y0]] : [[g.x0, g.y1, g.x1, g.y1], [g.x1, g.y1, g.x1, g.y0]];
  c.strokeStyle = '#8a5a2b'; c.lineWidth = 2;
  for (const [x0, y0, x1, y1] of seg) { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.9)); const a = P(x0, y0), b = P(x1, y1);
    for (const hh of [5, 10]) { c.beginPath(); c.moveTo(a.x, a.y - hh); c.lineTo(b.x, b.y - hh); c.stroke(); }
    for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 13); c.stroke(); } }
}
function drawTree(k) {
  const c = A.ctx(), a = st('orchard'), tr = a.tr[k], h = holes()[k]; if (!tr || !h) return; const q = A.P(h.x, h.y);
  if (!treeUp(tr, k)) { A.emoji('🌱', q.x, q.y - 8, 15, c); const u = Math.min(1, (now() - tr.p) / (treeAt(tr) - tr.p)); c.strokeStyle = '#7fd36a'; c.lineWidth = 2.5; c.beginPath(); c.arc(q.x, q.y - 8, 12, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); c.stroke(); return; }
  const im = art('orchard_tree') || A.part('outdoor', 'goldtree');
  if (im) { const hh = 52, w = hh * im.naturalWidth / im.naturalHeight; c.drawImage(im, q.x - w / 2, q.y - hh + 4, w, hh); } else A.emoji('🌳', q.x, q.y - 18, 30, c);
  const F = [[-9, -34], [8, -38], [0, -26], [-12, -22], [11, -24]]; for (let j = 0; j < (tr.f || 0); j++) A.emoji('🍊', q.x + F[j][0], q.y + F[j][1], 8, c);
}
function draw(add, list) {   // depth-sorted things (hook in the frame's draw list)
  if (!ON || !A || !A.S() || A.edit()) return;
  for (const id of IDS) { if (id === 'pond') { if (st('pond').b) { const g = geo('pond'); if (g) add(g.x, g.y, () => drawAnnex('pond')); } continue; }
    const g = geo(id); if (!g) continue; const a = st(id); if (!a.b && !a.bt && !asked(id)) continue;
    if (id === 'orchard') { add(g.x0, g.y0, drawOrchardBack, -2); if (a.b) { holes().forEach((h, k) => { if (a.tr[k]) add(h.x, h.y, () => drawTree(k)); }); add(g.x1, g.y1, () => fence(A.ctx(), g, false), 1); } continue; }
    add(g.x1 - 0.01, g.y1 - 0.01, () => drawAnnex(id)); }
}
// ---- signs (drawn after day and night: bright), the event's things on top, the edge pointer
let RECTS = [];
function signs() {
  RECTS = []; if (!ON || !A || !A.S() || A.edit()) { edge(null); return; }
  const c = A.ctx(), t = performance.now();
  drawFly(c, t);   // oranges on their way to the canteen
  for (const id of IDS) { if (id === 'pond') continue; const g = geo(id); if (!g) continue; const a = st(id); if (!a.b && !a.bt && !asked(id)) continue;
    const D = DEF[id], ready = a.ev && a.ev.rdy && !RUN, hgt = id === 'orchard' ? 44 : D.h + 26;
    let lab = `${D.emo} ${D.name}`, bg = '#d6f0ff';
    if (a.bt) lab = `🏗️ ${D.name}`; else if (!a.b) { lab = `${D.emo} ${D.name} · построить`; bg = '#ffe0f0'; }
    else if (ready) { lab = `${EV_NAME[D.ev]} · начать`; bg = '#fff1b8'; }
    else if (id === 'orchard' && hanging()) { lab = `🍊 Сад · ${hanging()}`; bg = '#fff1b8'; }
    const q = UP(A.P(g.x, id === 'orchard' ? g.y0 : g.y), hgt + (ready ? Math.sin(t / 250) * 2 : 0)), pl = A.signPill(A.signLabel(lab), bg, 12, 22, ready ? '#ffcf40' : '#ffffff', '#2e2340');
    if (A.onScreen(q.x, q.y, 160, 40)) c.drawImage(pl.cv, q.x - pl.w / 2, q.y - pl.h / 2, pl.w, pl.h);
    RECTS.push({ id, k: 'sign', x0: q.x - pl.tw / 2, y0: q.y - pl.hh, x1: q.x + pl.tw / 2, y1: q.y + pl.hh });
    if (id !== 'orchard') { const b = UP(A.P(g.x, g.y), D.h / 2); RECTS.push({ id, k: 'body', x0: b.x - Math.max(26, g.w * A.HW * 0.7), y0: b.y - D.h / 2 - 8, x1: b.x + Math.max(26, g.w * A.HW * 0.7), y1: b.y + D.h / 2 + 8 }); }
  }
  if (RUN) drawRun(c, t);
  edge(t);
}
function drawRun(c, t) {
  if (RUN.kind === 'bloom') { bloomStep(t); if (!RUN) return; const B = ANNEX_BAL.greenh;
    RUN.items.forEach((b, k) => { const q = A.P(b.x, b.y); if (k > RUN.cur && b.st === 'wait') return; if (b.st === 'gone' && b.res !== 'closed') return;
      if (b.st === 'gone') return;
      if (b.st === 'open') { A.emoji(b.res === 'full' ? '🌸' : '🌷', q.x, q.y - 12, b.res === 'full' ? 26 : 14, c); return; }
      if (k !== RUN.cur || t < RUN.tc) return;
      const p = b.st === 'hold' ? Math.min(1.2, b.p) : 0, r = 22;
      c.drawImage(A.glow(b.st === 'hold' ? '255,170,220' : '255,230,170'), q.x - 30, q.y - 42, 60, 60);
      c.lineWidth = 5; c.strokeStyle = '#ffffff66'; c.beginPath(); c.arc(q.x, q.y - 12, r, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#5ee07a'; c.beginPath(); c.arc(q.x, q.y - 12, r, -Math.PI / 2 + B.sweet * Math.PI * 2, -Math.PI / 2 + Math.PI * 2); c.stroke();   // the sweet spot
      if (p > 0) { c.strokeStyle = p >= B.sweet && p <= 1.0001 ? '#2fbf55' : p > 1 ? '#d0304e' : '#ff8fc8'; c.lineWidth = 3; c.beginPath(); c.arc(q.x, q.y - 12, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.min(1, p) * Math.PI * 2); c.stroke(); }
      const pet = Math.round(Math.min(1, p) * 6); for (let j = 0; j < pet; j++) { const an = j / 6 * Math.PI * 2; A.emoji('🌸', q.x + Math.cos(an) * 8, q.y - 12 + Math.sin(an) * 8, 9, c); }
      A.emoji(pet >= 6 ? '🌸' : '🌷', q.x, q.y - 12, 16 + Math.min(1, p) * 8, c); });
  } else if (RUN.kind === 'sfall') { fallStep(t); if (!RUN) return;
    for (const s of RUN.items) { if (s.st === 'got') { const u = (t - s.bt) / 600; if (u < 1) A.text('+1 ✨', s.bx, s.by - u * 24, 12, '#f4d35e', c); continue; } if (s.st !== 'fall') continue; const p = fallPos(s, t); if (!p) continue;
      const sz = RUN.night ? 20 : 16; c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,240,190,0.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 18, p.y - 34); c.stroke(); c.drawImage(A.glow('255,240,190'), p.x - sz, p.y - sz, sz * 2, sz * 2); c.restore(); A.emoji('⭐', p.x, p.y, sz * 0.8, c); }
  }
  layerHud(t);
}
let EDGE = null;
function edge(t) {   // a small pill at the screen edge pointing to a ready annex that is off-screen; tap = the camera flies there
  const id = t !== null && !RUN && !A.quiet() ? EVS.find((x) => built(x) && st(x).ev.rdy) : null;
  let show = false;
  if (id) { const g = geo(id), q = A.P(g.x, g.y), sc = A.scroller(), k = A.scale(), sx = q.x * k - sc.scrollLeft, sy = (q.y - 30) * k - sc.scrollTop, W = sc.clientWidth, H = sc.clientHeight;
    if (sx < 10 || sx > W - 10 || sy < 60 || sy > H - 40) { show = true;
      if (!EDGE) { EDGE = document.createElement('button'); EDGE.id = 'anx-edge'; EDGE.addEventListener('click', () => { const x = EDGE.dataset.id; if (x) { const gg = geo(x); A.focusTile(gg.x, gg.y); } }); document.body.appendChild(EDGE); }
      const r = sc.getBoundingClientRect(), dx = sx - W / 2, dy = sy - H / 2, ar = Math.abs(dx) / W > Math.abs(dy) / H ? (dx > 0 ? '➡️' : '⬅️') : (dy > 0 ? '⬇️' : '⬆️');
      const lab = `${EV_NAME[DEF[id].ev]} ${ar}`; if (EDGE.dataset.l !== lab) { EDGE.dataset.l = lab; EDGE.innerHTML = A.emojiHtml(lab); } EDGE.dataset.id = id;
      const bw = EDGE.offsetWidth || 150, bh = EDGE.offsetHeight || 34;
      EDGE.style.left = Math.round(r.left + Math.max(8, Math.min(W - bw - 8, sx - bw / 2))) + 'px'; EDGE.style.top = Math.round(r.top + Math.max(110, Math.min(H - bh - 110, sy - bh / 2))) + 'px'; } }
  if (EDGE) EDGE.style.display = show ? '' : 'none';
}
function tap(wx, wy) {   // a tap on the map (world px); true = handled
  if (!ON || !A || !A.S() || A.edit() || RUN) return !!RUN;
  for (const R of RECTS) if (wx >= R.x0 - 4 && wx <= R.x1 + 4 && wy >= R.y0 - 4 && wy <= R.y1 + 4) { onAnnexTap(R.id); return true; }
  if (asked('pond') || built('pond')) { const pr = (A.signRects() || []).find((r) => r.id === 'POND'); if (pr && wx >= pr.x0 - 6 && wx <= pr.x1 + 6 && wy >= pr.y0 - 6 && wy <= pr.y1 + 6) { openPanel('pond'); return true; } }
  if (built('orchard') || asked('orchard')) { const a = st('orchard');
    for (const [k, h] of holes().entries()) { const q = A.P(h.x, h.y); if (Math.hypot(wx - q.x, wy - (q.y - (a.tr[k] && treeUp(a.tr[k], k) ? 22 : 6))) < (a.tr[k] && treeUp(a.tr[k], k) ? 24 : 13)) {
      if (!a.b) { openPanel('orchard'); return true; }
      const tr = a.tr[k]; if (!tr) { openPanel('orchard', k); return true; }
      if (!treeUp(tr, k)) { A.toast(`🌱 Саженец растёт: ещё ${Math.ceil((treeAt(tr) - now()) / 60000)} мин`); return true; }
      if (!harvest()) openPanel('orchard'); return true; } }
    const g = geo('orchard'); if (g) { const a0 = A.P(g.x0, g.y0), b0 = A.P(g.x1, g.y1), l = A.P(g.x0, g.y1), r = A.P(g.x1, g.y0); if (wx > l.x && wx < r.x && wy > a0.y - 10 && wy < b0.y && (a.b || asked('orchard'))) { openPanel('orchard'); return true; } } }
  return false;
}
function onAnnexTap(id) {
  const a = st(id);
  if (a.ev && a.ev.rdy && startEv(id)) return;   // a ready event starts on the tap
  openPanel(id);
}

// ---- the annex panel
let PANEL_ID = null, PANEL_HOLE = -1, PANEL_MODE = '';
function openPanel(id, hole = -1) { PANEL_ID = id; PANEL_HOLE = hole; PANEL_MODE = ''; A.openPanel(panelFn); const g = geo(id); if (g) setTimeout(() => A.focusTile(g.x, g.y), 60); }
function panelFn() {
  const id = PANEL_ID, D = DEF[id], a = st(id), B = ANNEX_BAL[id], f = A.fmt;
  if (id === 'elcirc' && PANEL_MODE === 'book' && a.b) return bookHtml();
  const head = `<div class="sh-head"><span class="remoji big">${D.emo}</span><div><h2>${D.name}</h2><div class="muted">${a.b ? (id === 'orchard' ? 'сад столовой' : `ур. ${a.L}/${ANNEX_BAL.lvlMax} · пристройка`) : 'пристройка'} · ${D.who}</div></div><button class="x" data-close>✕</button></div>`;
  if (!a.b && !a.bt) {
    if (!asked(id)) return `${head}<p class="muted">${D.who} попросит об этом позже — по летописи.</p>`;
    return `${head}<div class="card up"><div class="grow"><b>${D.who}:</b> ${D.ask}</div></div>
      <p class="muted">${D.prod.e} ${D.prod.n[0].toUpperCase() + D.prod.n.slice(1)} — ${D.prod.fx}.${D.rare ? ` Редкая вещь: ${D.rare.e} ${D.rare.n}.` : ''}</p>
      <button class="btn wide hot" data-anx="build" data-id="${id}">Построить <span class="cost">🪙${f(buildCost(id))}</span></button><p class="muted">Стройка займёт ${ANNEX_BAL.buildSec} секунд.</p>`;
  }
  if (a.bt) return `${head}<p>🏗️ Стройка: ещё ${Math.max(0, Math.ceil((a.bt - now()) / 1000))} с.</p>`;
  let h = head;
  if (id === 'orchard') {
    const n = a.tr.filter(Boolean).length, grown = a.tr.filter((tr, k) => tr && treeUp(tr, k)).length;
    h += `<div class="stats3"><div><span>🌳</span><b>${grown}/${n}</b><i>деревьев</i></div><div><span>🍊</span><b>${hanging()}</b><i>на деревьях</i></div><div><span>🧺</span><b>${a.o} мин</b><i>мармелад (до ${B.cap})</i></div></div>
      <p class="muted">Днём (${B.day[0]}:00–21:30) каждое дерево растит апельсин примерно раз в ${Math.round(B.fruit / 60)} минут, до ${B.perTree} на дереве; они не портятся, ночью деревья отдыхают. ${D.prod.fx[0].toUpperCase() + D.prod.fx.slice(1)}. Нет апельсинов — столовая работает как обычно.${dayNow() ? '' : ' 🌙 Сейчас ночь.'}</p>
      ${Object.keys(a.wt || {}).length ? `<p class="muted">🌳 Ещё ${Object.keys(a.wt).length} ${nOf(Object.keys(a.wt).length, 'апельсиновое дерево растёт', 'апельсиновых дерева растут', 'апельсиновых деревьев растут')} вокруг школы: нажми на любое — весь урожай полетит в столовую.</p>` : ''}
      ${hanging() ? `<button class="btn wide hot" data-anx="harvest" data-id="orchard">🧺 Собрать весь урожай (${hanging()})</button>` : ''}
      <h3>Лунки</h3>` + a.tr.map((tr, k) => { if (tr) { const up = treeUp(tr, k); return `<div class="card"><span class="remoji">${up ? '🌳' : '🌱'}</span><div class="grow">Лунка ${k + 1}: ${up ? `дерево · апельсинов: ${tr.f || 0}/${B.perTree}` : `саженец, вырастет через ${Math.max(1, Math.ceil((treeAt(tr) - now()) / 60000))} мин`}</div></div>`; }
        const first = a.tr.findIndex((x) => !x); if (k !== first) return ''; return `<div class="card up ${PANEL_HOLE === k ? 'pulse' : ''}"><span class="remoji">🕳️</span><div class="grow"><b>Посадить саженец</b><div class="muted">свободных лунок: ${a.tr.filter((x) => !x).length} · вырастет за ${Math.round(B.grow / 60)} мин</div></div><button class="btn" data-anx="plant" data-id="${k}">🌱 <span class="cost">🪙${f(saplingCost())}</span></button></div>`; }).join('');
    return h;
  }
  const cap = capOf(id), per = perOf(id) / 1000;
  h += `<div class="stats3"><div><span>${D.prod.e}</span><b>${a.n} мин</b><i>запас (до ${cap})</i></div><div><span>⏱️</span><b>+1 мин</b><i>каждые ${per >= 60 ? Math.round(per / 6) / 10 + ' мин' : Math.round(per) + ' с'}</i></div><div><span>${D.rare.e}</span><b>${rareN(id)}</b><i>${D.rare.n}</i></div></div>
    <p class="muted">${D.prod.e} ${D.prod.n[0].toUpperCase() + D.prod.n.slice(1)}: запас на ${a.n} мин. ${D.prod.fx[0].toUpperCase() + D.prod.fx.slice(1)}. Запас пополняется сам и тратится по минуте в минуту, пока он есть. Без него класс работает как обычно.</p>`;
  if (D.game) h += `<button class="btn wide hot" data-anx="play" data-id="${D.game}">${{ p: '🧪 Варить зелья — «Зельеварка»', fish: '🎣 Рыбачить — «Рыбалка»', f: '🪁 Летать — «Полёт через кольца»' }[D.game]}</button><p class="muted">Игра с наградой: за 2 ⭐ — ${D.rare.e} 1, за 3 ⭐ — ${D.rare.e} 2.</p>`;
  if (D.ev) { const e = a.ev; h += `<div class="card ${e.rdy ? 'up' : ''}"><span class="remoji">${EV_NAME[D.ev].split(' ')[0]}</span><div class="grow"><b>${EV_NAME[D.ev].slice(EV_NAME[D.ev].indexOf(' ') + 1)}</b><div class="muted">${e.k >= ANNEX_BAL.ev.perDay ? 'награды на сегодня собраны — можно играть просто так' : `с наградой сегодня ещё ${ANNEX_BAL.ev.perDay - e.k} из ${ANNEX_BAL.ev.perDay}`}</div></div><button class="btn ${e.rdy || e.k < ANNEX_BAL.ev.perDay ? 'hot' : ''}" data-anx="start" data-id="${id}">Играть</button></div>`; }
  if (id === 'elcirc') h += circleCard();
  if (a.L < ANNEX_BAL.lvlMax) { const need = lvlRare(id), ok = rareN(id) >= need;
    h += `<div class="card up"><span class="remoji">⬆️</span><div class="grow"><b>Улучшить до ур. ${a.L + 1}</b><div class="muted">запас до ${cap} → ${Math.round(B.cap * (1 + ANNEX_BAL.capK * a.L))} мин, пополняется быстрее на 15 %${id === 'elcirc' ? ` · задания до ступени ${Math.min(RX.maxL, ANNEX_BAL.elcirc.depthL[a.L + 1])}` : ''} · нужно ${D.rare.e} ${need}${id === 'obs' ? ' (пыль остаётся у тебя)' : ''} (есть ${rareN(id)})</div></div><button class="btn" data-anx="lvl" data-id="${id}" ${ok ? '' : 'disabled'}>↑ <span class="cost">🪙${f(lvlCoins(id))}</span></button></div>`; }
  else h += '<p class="muted">Максимальный уровень.</p>';
  return h;
}
function onClick(e) {
  const b = e.target.closest && e.target.closest('[data-anx]'); if (!b || !A) return; e.stopPropagation(); e.preventDefault();
  const k = b.dataset.anx, id = b.dataset.id;
  if (k === 'build') startBuild(id); else if (k === 'lvl') levelUp(id); else if (k === 'plant') plant(+id); else if (k === 'harvest') harvest();
  else if (k === 'play') { (A.S().hints ||= {})['anx_' + GAME_OF[id]] = 1; openMg(id); } else if (k === 'start') startEv(id);
  else if (k === 'book') PANEL_MODE = 'book'; else if (k === 'back') PANEL_MODE = '';
  A.refresh();
}

// ---- the 1-second tick: builds, products, daily rare things, event readiness, late requests
function tick() {
  if (!ON || !A || !A.S() || A.edit()) return;
  try {
    lateCheck(); const t = now();
    for (const id of IDS) { const a = st(id); if (a.bt && t >= a.bt) finishBuild(id); if (id === 'orchard') orchardStep(t); else produce(id, t); dailyRare(id, t); }
    evTick();
    if (RUN && document.hidden) finishEv(true);
  } catch (e) { console.error('annex', e); }
}

function css() { const s = document.createElement('style'); s.id = 'anx-css'; s.textContent = `
#anx-layer{position:fixed;inset:0;z-index:35;touch-action:none;-webkit-user-select:none;user-select:none}
#anx-layer .anx-top,#anx-mir .anx-mtop{position:absolute;top:calc(var(--safe-t, 0px) + 64px);left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:#2e2340e6;color:#fff;border-radius:14px;padding:6px 8px 6px 14px;font:800 14px ui-rounded,"Nunito",sans-serif;white-space:nowrap;box-shadow:0 4px 14px #0004}
#anx-layer .anx-say{position:absolute;bottom:calc(var(--safe-b, 0px) + 120px);left:50%;transform:translateX(-50%);background:#fff6cf;border:2px solid #e2b23c;border-radius:12px;padding:5px 12px;font:800 14px ui-rounded,"Nunito",sans-serif;color:#5a4410}
.anx-x{border:0;border-radius:10px;background:#ffffff22;color:#fff;font:800 14px sans-serif;padding:4px 9px}
#anx-mir{position:fixed;inset:0;z-index:36;background:#1c1430b8;display:flex;flex-direction:column;align-items:center;justify-content:center;touch-action:none;-webkit-user-select:none;user-select:none}
#anx-mir .anx-mtop{position:static;transform:none;margin-bottom:10px}
#anx-mir canvas{touch-action:none}
#anx-mir .anx-msay{margin-top:10px;max-width:330px;text-align:center;background:#fff6cf;border:2px solid #e2b23c;border-radius:12px;padding:6px 12px;font:800 14px ui-rounded,"Nunito",sans-serif;color:#5a4410}
#anx-elem{position:fixed;inset:0;z-index:36;background:linear-gradient(#1c1430,#2a2048);display:flex;flex-direction:column;align-items:stretch;gap:8px;touch-action:none;-webkit-user-select:none;user-select:none;padding:calc(var(--safe-t, 0px) + 8px) 10px calc(var(--safe-b, 0px) + 8px);color:#fff;font-family:ui-rounded,"Nunito",sans-serif;box-sizing:border-box}
#anx-elem img.em{width:1em;height:1em}
.el-top{display:flex;flex-direction:column;gap:6px}
.el-hd{display:flex;align-items:center;gap:8px;font:800 15px ui-rounded,"Nunito",sans-serif}.el-hd b{flex:1}.el-sc{font:700 13px ui-rounded,"Nunito",sans-serif;color:#e9ddff}
.el-task{background:#fffdf5;color:#2e2340;border-radius:16px;padding:8px 12px 9px;box-shadow:0 4px 14px #0004;text-align:center;border:3px solid #ffcf40}
.el-tn{font:700 13px ui-rounded,"Nunito",sans-serif;color:#7a6a99}
.el-tw{font:800 22px/1.25 ui-rounded,"Nunito",sans-serif}.el-tw b{white-space:nowrap}
.el-dots{display:flex;justify-content:center;gap:6px;margin-top:5px}.el-dots i{width:22px;height:7px;border-radius:4px;background:#ddd3ee}.el-dots i.cur{background:#ffcf40}.el-dots i.ok{background:#5ec27a}
.el-say{min-height:40px;text-align:center;background:#fff6cf;border:2px solid #e2b23c;border-radius:12px;padding:5px 10px;font:800 14px/1.3 ui-rounded,"Nunito",sans-serif;color:#5a4410;box-sizing:border-box}
.el-bench{position:relative;height:210px;flex:0 0 auto;border-radius:22px;background:radial-gradient(ellipse at 50% 40%,#6a4f9a,#3b2c5e 75%);border:3px solid #b9a3ff;box-shadow:inset 0 0 24px #0006;display:flex;align-items:center;justify-content:center}
.el-mixrow{display:flex;align-items:center;gap:12px}
.el-plus{font:900 34px ui-rounded,sans-serif;color:#efe4ff}
.el-slot{width:118px;height:132px;border-radius:18px;border:3px dashed #d9c7ff;background:#ffffff14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;transition:transform .15s}
.el-slot.full{border-style:solid;background:#fffdf5;color:#2e2340}.el-slot.over{border-color:#ffe46b;box-shadow:0 0 0 4px #ffe46b88;transform:scale(1.05)}.el-slot.mix{animation:elmix .38s}
.el-slot .el-em{font-size:52px;line-height:1}.el-slot small{font:800 16px/1.15 ui-rounded,"Nunito",sans-serif;text-align:center;max-width:110px}
.el-ph{font:700 13px ui-rounded,"Nunito",sans-serif;color:#d9c7ff;text-align:center;padding:0 8px}
@keyframes elmix{50%{transform:scale(.9) rotate(-4deg)}}
.el-res{display:none}
.el-bench.show .el-mixrow{display:none}.el-bench.show .el-res{display:flex;flex-direction:column;align-items:center;gap:3px;animation:elpop .3s}
@keyframes elpop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
.el-eq{font:700 14px ui-rounded,"Nunito",sans-serif;color:#e9ddff}
.el-big{font-size:60px;line-height:1.05}.el-big.goal{filter:drop-shadow(0 0 12px #ffe46b)}.el-big.blob{filter:grayscale(.5)}
.el-rn{font:900 21px ui-rounded,"Nunito",sans-serif;color:#fff}.el-rn em{font-style:normal;color:#ffe46b}
.el-bench.blobbed .el-rn{font-size:16px;color:#d9c7ff}.el-bench.blobbed .el-res{animation:elpop .3s,elfade 2s forwards}
@keyframes elfade{70%{opacity:1}100%{opacity:.25}}
.el-gain{font:800 13px ui-rounded,"Nunito",sans-serif;color:#b8f5c6;text-align:center;padding:0 8px}
.el-btns{display:flex;gap:8px;margin-top:4px}.el-btns .btn{font-size:15px;padding:8px 14px}
.el-lab{font:700 13px ui-rounded,"Nunito",sans-serif;color:#d9c7ff;text-align:center}
.el-tray{flex:0 0 auto;height:284px;display:grid;grid-auto-flow:column;grid-template-rows:repeat(3,88px);grid-auto-columns:86px;align-content:start;gap:6px;overflow-x:auto;overflow-y:hidden;touch-action:pan-x;padding:2px 2px 6px;scrollbar-width:thin}
.el-tile{border-radius:14px;background:#fffdf5;color:#2e2340;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:3px;box-shadow:0 3px 0 #0003;cursor:grab;touch-action:pan-x}
.el-tile.base{background:#ffeccc}.el-tile.hl{box-shadow:0 0 0 4px #ffe46b,0 0 16px #ffe46b;animation:elgive 1s infinite}
.el-tile .el-em{font-size:30px;line-height:1;pointer-events:none}.el-tile small{font:800 12px/1.1 ui-rounded,"Nunito",sans-serif;text-align:center;pointer-events:none;hyphens:manual;overflow-wrap:anywhere}
@keyframes elgive{50%{transform:translateY(-3px)}}
.el-ghost{position:fixed;z-index:40;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:16px;background:#fffdf5;color:#2e2340;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 8px 22px #0007;pointer-events:none;font-size:36px;transform:rotate(-4deg)}
.el-ghost small{font:800 12px ui-rounded,"Nunito",sans-serif}
.el-foot{display:flex;gap:8px;margin-top:auto}.el-fb{flex:1;border:0;border-radius:12px;background:#ffffff22;color:#fff;font:800 14px ui-rounded,"Nunito",sans-serif;padding:10px 6px}.el-fb:disabled{opacity:.35}
.el-bookov{display:none;position:absolute;inset:8px;z-index:3;background:#fffdf5;color:#2e2340;border-radius:18px;padding:10px 12px;overflow-y:auto;touch-action:pan-y}.el-bookov.on{display:block}
.el-bkhd{display:flex;align-items:center;justify-content:space-between;font:800 18px ui-rounded,"Nunito",sans-serif;position:sticky;top:-10px;background:#fffdf5;padding:4px 0}.el-bkx{border:0;border-radius:10px;background:#2e2340;color:#fff;font:800 14px sans-serif;padding:6px 12px}
.el-bookov h3{margin:10px 0 4px;font:800 15px ui-rounded,"Nunito",sans-serif}
.el-book{display:flex;flex-direction:column;gap:3px}
.el-rec{font:600 14px ui-rounded,"Nunito",sans-serif;padding:4px 7px;border-radius:8px;background:#f4efff;color:#2e2340}
.el-rec.off{background:#f2f2f2;color:#888}
#anx-edge{position:fixed;z-index:16;border:2px solid #ffcf40;background:#fff1b8;color:#2e2340;border-radius:14px;padding:5px 10px;font:800 13px ui-rounded,"Nunito",sans-serif;box-shadow:0 3px 10px #0003;white-space:nowrap}
#anx-bubble{position:fixed;left:50%;top:calc(var(--safe-t, 0px) + 110px);transform:translate(-50%,-20px);opacity:0;pointer-events:none;z-index:31;max-width:min(92vw,460px);background:#fffdf5;border:2px solid #b9a3ff;border-radius:14px;padding:8px 12px;font:600 14px/1.35 ui-rounded,"Nunito",sans-serif;color:#2e2340;box-shadow:0 6px 18px #0003;transition:opacity .3s,transform .3s}
#anx-bubble.on{opacity:1;transform:translate(-50%,0)}
img.em{height:1em;width:1em}
`; document.head.appendChild(s); }

export function initAnnex(api0) {
  A = api0; MISSIONS = A.MISSIONS; CLASSES = A.CLASSES; WORLD = A.WORLD; ON = WORLD === 1; glog = A.glog;
  if (ON) addMissions();
  if (!ON) return { ...api, wildDraw() {}, wildTap: () => false, prep() {}, late: () => false, draw() {}, signs() {}, tap: () => false, blocks: () => false, go: () => false, running: () => false, sfOff: () => false, mgOk: () => true, mgAny: () => true, mgDone() {}, fishGate: () => false, pondSign: (n) => (n > 0 ? `🎣 Рыбалка · ${n}` : '🎣 Рыбалка'), cantCard: () => '', classCard: () => '' };
  css(); document.addEventListener('click', onClick, true); setInterval(tick, 1000);
  window.__annex = {   // test hooks
    st: (id) => st(id), DEF, BAL: ANNEX_BAL, geo, holes, asked, late, run: () => RUN && { id: RUN.id, kind: RUN.kind, got: RUN.got, cur: RUN.cur, items: RUN.items.map((x) => ({ st: x.st, res: x.res, grade: x.grade, score: x.score })) },
    ready: (id) => { const e = st(id).ev; e.rdy = 1; e.w = 0; }, start: (id) => startEv(id), finish: () => finishEv(false), tick,
    build: (id) => { const a = st(id); a.bt = now() - 1; tick(); }, panel: (id) => openPanel(id), edgeShown: () => !!(EDGE && EDGE.style.display !== 'none'),
    advance(sec) { const ms = sec * 1000; for (const id of IDS) { const a = st(id); if (a.t) a.t -= ms; if (a.d) a.d -= ms; if (a.od) a.od -= ms; if (a.bt) a.bt -= ms; if (a.tr) a.tr.forEach((tr) => { if (tr) { tr.p -= ms; if (tr.t) tr.t -= ms; } }); if (a.wt) Object.values(a.wt).forEach((tr) => { tr.p -= ms; if (tr.t) tr.t -= ms; }); } tick(); },
    hold: (ms) => { const b = RUN && RUN.items[RUN.cur]; if (!b) return 'none'; b.st = 'hold'; b.h0 = performance.now() - ms; bloomUp(); return b.res; },
    trace: (jit = 0) => { if (!MIR || MIR.ph !== 'trace') return 'not tracing'; const F = figPts(RUN.items[RUN.cur].f); MIR.trace = F.map(([x, y]) => [x + (Math.random() - 0.5) * jit, y + (Math.random() - 0.5) * jit]); MIR.drawing = false; gradeFig(); return RUN.items[RUN.cur].grade; },
    traceHalf: () => { if (!MIR || MIR.ph !== 'trace') return 'not tracing'; const F = figPts(RUN.items[RUN.cur].f); MIR.trace = F.slice(0, Math.floor(F.length / 2)); MIR.drawing = true; return MIR.trace.length; },
    mir: () => MIR && { ph: MIR.ph, cur: RUN && RUN.cur }, catchAll: () => { const t = performance.now(); let n = 0; if (!RUN) return 0; for (const s of RUN.items) { const p = s.st === 'fall' && fallPos(s, t); if (p) { fallDown(p.x, p.y); n++; } } return n; },
    harvest, plant, levelUp, mgOk, wildTap, wildHits: () => [...WILD_HIT.entries()], wild: () => st('orchard').wt || {}, wildKeys: () => (A.wild ? A.wild() : []), edge: () => EDGE && EDGE.textContent,
    rects: () => RECTS.slice(), client: (wx, wy) => { const sc = A.scroller(), r = sc.getBoundingClientRect(), k = A.scale(); return { x: r.left + wx * k - sc.scrollLeft, y: r.top + wy * k - sc.scrollTop }; },
    tileClient: (x, y) => { const q = A.P(x, y), sc = A.scroller(), r = sc.getBoundingClientRect(), k = A.scale(); return { x: r.left + q.x * k - sc.scrollLeft, y: r.top + q.y * k - sc.scrollTop }; },
    budClient: () => { const b = RUN && RUN.items[RUN.cur]; if (!b) return null; const q = A.P(b.x, b.y), sc = A.scroller(), r = sc.getBoundingClientRect(), k = A.scale(); return { x: r.left + q.x * k - sc.scrollLeft, y: r.top + (q.y - 12) * k - sc.scrollTop, st: b.st, ready: performance.now() >= RUN.tc }; },
    meal: () => api.meal(), quiet: () => A.quiet(),
    elem: { info: () => ({ items: RX.all.length, recipes: RECIPES.length, maxL: RX.maxL, layer: RX.layer, steps: RX.steps }), book: () => ({ seen: seenN(), M: RX.all.length, rec: bookN(), R: RX.keys.length, cap: depthCap(), ttl: st('elcirc').ttl2 || 0 }),
      run: () => RUN && RUN.kind === 'storm' && { tasks: RUN.tasks.slice(), ti: RUN.ti, task: RUN.tasks[RUN.ti], bench: RUN.bench.slice(), res: RUN.res.map((r) => r.id), done2: RUN.done2, score: RUN.score, got: RUN.got, blobs: RUN.blobs, hints: RUN.hints, newIt: RUN.newIt, say: RUN.say, set: setList(), teach: RUN.teach },
      place: (x, k = -2) => place(x, k), resolve: (keep) => resolve(!!keep), pair: (a, b) => RX.pair[RX.key(a, b)] || null, next: (x) => nextPair(x), setTasks: (L) => { if (RUN && RUN.tasks) { RUN.tasks = L.slice(); RUN.ti = 0; RUN.got = 0; RUN.done2 = false; sayTask(); } return !!RUN; },
      learnAll: () => { RX.all.forEach((i) => { seen()[i] = 1; }); RX.keys.forEach((k) => { book()[k] = 1; }); return seenN(); }, lessonK: () => api.lessonK(CLASSES.findIndex((c) => c.id === 'elements')), recipes: () => RECIPES, names: () => Object.fromEntries(RX.all.map((k) => [k, ITEMS[k][0]])) },
    figClient: () => { if (!MIR || !RUN) return null; const r = MIR.cv.getBoundingClientRect(); return figPts(RUN.items[RUN.cur].f).map(([x, y]) => [r.left + x, r.top + y]); },
  };
  return {
    ...api, draw, signs, tap, wildDraw, wildTap, blocks, mgOk, mgAny, mgDone, fishGate, pondSign,
    late, running: () => !!RUN, prep: () => { try { if (ON && A.S() && A.S().story) lateCheck(); } catch (e) { console.error('annex', e); } },
    go(id) { if (!String(id).startsWith('@anx:')) return false; const x = id.slice(5); if (!DEF[x]) return false; openPanel(x); return true; },
    sfOff: () => built('obs'),   // the observatory's «Звездопад» replaces the random night starfall (it still opens the secret page on its first star)
    cantCard() { if (!ON || !A || !A.S()) return ''; const o = built('orchard') ? st('orchard').o : null, fi = built('pond') ? st('pond').n : null; if (o === null && fi === null) return '';
      return `<div class="card"><span class="remoji">🧺</span><div class="grow"><b>Кладовая столовой</b><div class="muted">${o !== null ? `🍊 мармелад: запас на ${o} мин — пока он есть, каждый обед с «Апельсиновым мармеладом» (+20 % к цене, настроение +${ANNEX_BAL.orchard.mood})` : ''}${o !== null && fi !== null ? '<br>' : ''}${fi !== null ? `🐟 рыба: запас на ${fi} мин — пока он есть, рыбный ужин (+10 % к цене, настроение +${ANNEX_BAL.pond.mood})` : ''}</div></div></div>`; },
    classCard(i) { if (!ON || !A || !A.S()) return ''; const id = IDS.find((x) => DEF[x].cls && DEF[x].cls === clsOf(i)); if (!id || !built(id)) return ''; const D = DEF[id], a = st(id);
      return `<div class="card"><span class="remoji">${D.emo}</span><div class="grow"><b>${D.name}</b> · ${D.prod.e} запас на ${a.n} мин<div class="muted">${D.prod.fx}</div></div><button class="btn small go" data-anx-open="${id}">Открыть</button></div>`; },
  };
}
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-anx-open]'); if (!b || !A) return; e.stopPropagation(); openPanel(b.dataset.anxOpen); }, true);
window.__anxName = (id) => (DEF[id] ? { n: DEF[id].name, e: DEF[id].emo, w: DEF[id].who, ev: EV_NAME[DEF[id].ev] || '' } : null);   // tikhon_chronicler: names for Tikhon's chronicle lines
