// Magic school idle tycoon — v0.3: isometric campus with walking creatures.
import './clock.js?v=470';   // build audit 2026-11-24: trusted clock (server time), must stay the first import
import './edit_guard.js?v=531';   // room editor (?edit only): in-memory storage, no cloud
import {
  OFFLINE_CAP_SEC, MAX_DESKS, MAX_ITEM_LEVEL, MAX_TEACHER_LEVEL, MAX_TIME_LEVEL,
  CLASSES, SPECIES, NAMES, MISSIONS, WORLDS, WORLD, META,
} from './data.js?v=531';
import { EMOJI_RE, emojiImage, preloadEmoji, watchEmoji, emojiHtml } from './emoji.js?v=531';
import { initMinigame } from './minigame.js?v=531';
import { initChests } from './chests.js?v=531';
import { initValley } from './valley.js?v=531';
import { log as glog, tail as gtail, entries as gentries, lineOf as gline, dump as gdump } from './gamelog.js?v=531';
import { initLore } from './lore.js?v=531';
import { initAvatar } from './avatar.js?v=531';
// mini-game «Зельеварка» (match-3, js/minigame.js): a pill on the main screen, its own overlay; the school keeps living under it
const MG = initMinigame({ state: () => S, earn: (n) => bonus(n), rate: () => rateNow(), save: () => save(), stones: () => stones(), spendStones: (n) => stonesAdd(-n), toast: (t) => toast(t), fmt: (n) => fmt(n), emojiHtml, emojiImage,
  audioOut: () => { if (!sfxOn() || document.hidden) return null; const c = audio(); return c && c.state === 'running' ? { c, out: AOUT } : null; },
  onOpen: () => { if (S.inc && Object.keys(S.inc).length) { S.inc = {}; dirtyPanel = true; } },   // a running incident is fixed quietly: the class cannot be tapped from the mini-game
  onFinish: (sc, stars) => { if (sc > 0) warAdd('mg', 5 + 5 * (stars || 0)); topPush(true); },   // ⚔️ battle points per round   // a new weekly best goes to the top at once
  world: () => WORLD,   // world 2 plays «Вагонетка» in place of the flight
  tester: () => { try { return AV.isMod(); } catch (e) { return false; } },   // Maria's phone: «+20 попыток» for tests
  flyers: () => FORM_KEYS.filter((k) => S.forms && S.forms[k] && S.forms[k].seen).map((k) => ({ k, src: formImg(k), name: formTitle(k), faceLeft: !!FACES_LEFT[k.split(':')[0]] })),   // who may fly in «Полёт через кольца»: every look opened in the album
  onClose: () => { incT = Math.max(incT, 30); renderInsp(); updateHud(); } });   // no incident the very second the player comes back
// daily chests (js/chests.js, Maria 2026-11-23 «Ежедневные сундучки надо»): a tile in the ✨ menu, own overlay, state S.chest per world
const VALLEY = initValley({ token: () => anonToken(), world: () => WORLD, emojiHtml, emojiImage, toast: (t) => toast(t), stones: (n, k) => stonesAdd(n, k),
  testTok: () => { try { return localStorage.getItem('magicschool.valleyTok') || ''; } catch (e) { return ''; } } });   // 🗺 alliance strategy (js/valley.js, server lazy /game/valley)
const CHESTS = initChests({ state: () => S, earn: (n) => bonus(n), rate: () => rateNow(), save: () => save(), toast: (t) => toast(t), fmt: (n) => fmt(n), emojiHtml,
  audioOut: () => { if (!sfxOn() || document.hidden) return null; const c = audio(); return c && c.state === 'running' ? { c, out: AOUT } : null; },
  mgCharge: () => MG.addCharges(1) /* the shared pool, above 3 too (her «должна приплюсываться») */, onClose: () => { renderInsp(); updateHud(); } });

const LORE = initLore({ state: () => S, save: () => save(), emojiHtml, on: () => WORLD === 1,
  music: { on: () => musicOn(), pause: () => music.pause(), resume: () => musicStart() },
  audioOut: () => { if (!sfxOn() || document.hidden) return null; const c = audio(); return c && c.state === 'running' ? { c, out: AOUT } : null; }, onClose: () => { renderInsp(); updateHud(); },   // «Летопись» (her wish 2026-11-23)
  facts: () => ({ allBuilt: S.classes.every((c, i) => isOpen(i)), grads: S.stats.graduated || 0, masters: (S.stats.ranks || [])[5] || 0, forms: S.forms || {},
    cls: (id) => { const i = CLASSES.findIndex((c) => c.id === id); return i < 0 ? { built: false, lvl: 0 } : { built: isOpen(i), lvl: S.classes[i].teacher || 1 }; },
    has: (id) => (id === 'dorm2' ? NEWDORM && dorm2Built() : id === 'cant' ? cantBuilt() : id === 'shop' ? shopOpen() : id === 'dir' ? dirBuilt() : id === 'tower' ? towerOpen() : true) }) });

const SAVE_KEY = WORLD === 1 ? 'magicschool.save.v2' : 'magicschool.save.v2.w' + WORLD;   // every world keeps its own save
const saveKeyOf = (w) => (w === 1 ? 'magicschool.save.v2' : 'magicschool.save.v2.w' + w);
const VERSION = '0.9';
const BUILD = 531;   // keep equal to the ?v= number in index.html
const $ = (s, r = document) => r.querySelector(s);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

// ======================= state & economy =======================
let S;
function freshState() {
  S = {
    v: 2, coins: 50, nextId: 1, last: Date.now(), mission: 0, ema: 0,
    reception: { level: 1, ads: 1 },
    dormUp: { beds: 1, conc: 1 },
    classes: CLASSES.map((c, i) => ({ built: i === 0 || !!c.final, buildEnd: 0, teacher: 1, desks: c.final ? 4 : 2, time: 0, items: c.items.map(() => 0) })),
    stats: { graduated: 0, passed: 0, failed: 0, enrolled: 0, left: 0 },
  };
}
function migrate() {   // classes added to the game later (the final exam) appear in old saves
  while (S.classes.length < CLASSES.length) { const c = CLASSES[S.classes.length]; S.classes.push({ built: !!c.final, buildEnd: 0, teacher: 1, desks: c.final ? 4 : 2, time: 0, items: c.items.map(() => 0) }); }
}
function load() {
  if (EDIT) { editState(); return; }
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { S = JSON.parse(raw); migrate(); migrateForms(); return; } } catch (e) { /* fresh */ }
  freshState();
}
let noSave = false;
function save() {
  if (noSave || !S) return;
  const run = catchLeft > 0 ? catchLeft + catchExtra : 0;
  S.last = Date.now() - Math.round(run * 1000);   // a catch-up still running: its rest is lived through at the next start
  if (run > 0) S.catchPend = { rest: run, left: catchLeft, extra: catchExtra, real: catchReal, gain: catchGain, simT: catchSimT }; else delete S.catchPend;   // tester №0b9ldbcf: a reload mid catch-up lost the paid hours and the real time away
  S.world = {   // creatures and their progress, so the school keeps living across reloads
    arrivalT, procT,
    queue: queue.map((a) => a.id),
    wait: waitList.map((l) => l.map((a) => a.id)),
    agents: agents.filter((a) => a.state !== 'fly' && a.state !== 'vanish' && !a.mcls && !(a.goal && a.goal.t === 'tw')).map((a) => ({ id: a.id, sp: a.sp, name: a.name, x: a.x, y: a.y, speed: a.speed, state: a.state, c: a.c, desk: a.desk, bed: a.bed, seat: a.seat, prepared: a.prepared, t: a.t, dur: a.dur, goal: a.goal, since: a.since, woke: a.woke, mood: a.mood, paid: a.paid, rk: a.rk, el: a.el, retake: a.retake, fed: a.fed, les: a.les, rest: a.rest, dream: a.dream, pk: a.pk })),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
}

// ---- balance (rebalance 2026-11-22, her goal: world 1 in ~1.5 weeks, first master on ~day 5; tuned with tools/sim_driver.js) ----
const BAL_NEW = { chance0: 0.45, maxChance: 0.8, item: 1.5, teacher: 1.6, expand: 600, expandK: 4, desk: 3.0, examDesk: 1.8, time: 2.0, rec: 1.5, ads: 1.55,
  build: [0, 2000, 12000, 3000000, 20000000, 100000000], buildTime: [0, 60, 600, 3600, 3 * 3600, 6 * 3600], tower: 50000000, pay: 0.55, lesson: 2, floorM: 0.5, floorG: 1.08, itemHi: 1.25 };   // pace floor (build 297, her pick «Мягкая планка»): 0.5 min of income for the 1st level, x1.08 per level   // lesson: length multiplier of every lesson (build 184, her «ученики слишком быстро сменяются»: 2.6 s at max level was shorter than the walk)   // pay 0.45 since build 178 (0.5 in 177): the queue fix (build 176) nearly doubled the flow; sim back to Elements ~4.2 d, first master ~5 d
const BAL_OLD = { pay: 1, chance0: 0.6, maxChance: 0.85, item: 1.25, teacher: 1.35, expand: 120, expandK: 3, desk: 2.3, examDesk: 1.6, time: 1.6, rec: 1.4, ads: 1.45, build: [], buildTime: [], tower: 500000 };
BAL_NEW.lessonLate = { charms: 1.4, flight: 1.4, elements: 1.4 };   // build 237, her pick «1 вариант для стихий» (42 waiting for Elements): these classes x1.4 instead of BAL.lesson x2; Flight too, else the queue only moved to Flight (her save: 40 waiting there); sim all classes 4.7 d, first master 5.2 d
Object.assign(BAL_NEW.lessonLate, { gems: 1.4, guards: 1.4, lake: 1.4 });   // build audit 2026-11-24: world 2's 4th-6th halls, like charms/flight/elements (they ran x2.0, +43% longer)
// build audit 2026-11-24 (pacing sim with the EMA): the old ladder 50K / 1M / 60M / 150M left ~3 game days with no new class (Charms d0.7 -> Flight d3.7) and Stars came only after the first offline gap; itemHi 2.5 made item levels 26-40 cost ~8300 days of income
const BAL = { ...BAL_NEW };   // live since build 153 (tuned with the pacing simulation; BAL_OLD kept for comparison runs)
const buildCost = (i) => (WORLD <= 2 && BAL.build[i] !== undefined ? BAL.build[i] : CLASSES[i].build);
const buildTime = (i) => (WORLD <= 2 && BAL.buildTime[i] !== undefined ? BAL.buildTime[i] : CLASSES[i].buildTime);
const cls = (id) => S.classes[CLASSES.findIndex((c) => c.id === id)];
const isOpen = (i) => S.classes[i].built && Date.now() >= S.classes[i].buildEnd;
const kindSum = (i, kind) => CLASSES[i].items.reduce((a, it, k) => a + (it.kind === kind ? S.classes[i].items[k] : 0), 0);
const rawSuccess = (i) => BAL.chance0 + 0.015 * (S.classes[i].teacher - 1) + 0.01 * kindSum(i, 'success');
const success = (i) => Math.min(BAL.maxChance, rawSuccess(i));
const overflow = (i) => Math.max(0, rawSuccess(i) - BAL.maxChance);   // chance above the cap is not wasted: each 1% gives +2% tuition
const W2_PAY = 0.5;   // build audit 2026-11-24: was 0.7; caravans now bring ~1/4 of world-2 income (w2_report.md). World 2 pays less (pacing sim 2026-11-22: first Хранитель ~day 7, all halls ~6.5, album ~10; her «мир 2 недели, мастер ~неделя»)
const tuition = (i) => Math.round(CLASSES[i].tuition * (1 + 0.08 * kindSum(i, 'tuition')) * (1 + 0.05 * (S.classes[i].teacher - 1)) * (1 + 2 * overflow(i)) * (1 + 0.03 * schoolStars()) * (i === NCLS - 1 ? 1 + 0.03 * mastersLiving() : 1) * BAL.pay * (WORLD === 2 ? W2_PAY * relicK() : 1) * boostK() * (WORLD === 1 && S && S.lore && S.lore.prize ? 1.1 : 1));   // «Последняя ночь» prize   // BAL.pay: one knob for every income (build 177, her «усложняй экономику»)   // every school star: +3% to every lesson
const lessonTime = (i) => CLASSES[i].lesson * ((BAL.lessonLate || {})[CLASSES[i].id] || BAL.lesson || 1) * Math.pow(0.92, S.classes[i].time) * (loreQ('teachers') ? 0.97 : 1);
const itemCost = (i, k) => { const raw = CLASSES[i].tuition * 2 * (1 + k) * Math.pow(BAL.item, Math.min(25, S.classes[i].items[k])) * Math.pow(BAL.itemHi, Math.max(0, S.classes[i].items[k] - 25)); return Math.round(Math.max(raw, paced(raw, S.classes[i].items[k] + 1) * itemW(i))); };
// build audit 2026-11-24: Herbology earns ~1/100 of Elements per lesson, but the pace floor priced its items like Elements' ones
// (payback ~930 days vs ~11): the floor part of an item price is scaled by the class's lesson price against the dearest open class
const itemW = (i) => { if (WORLD !== 1) return 1; let mx = 0; for (let j = 0; j < CLASSES.length; j++) if (!CLASSES[j].final && isOpen(j)) mx = Math.max(mx, CLASSES[j].tuition); return mx > 0 ? Math.min(1, Math.max(0.01, CLASSES[i].tuition / mx)) : 1; };   // levels 26..40 (build 299, her pick «Предметы в классах 25→40»): x2.5 per level, sim keeps all classes ~4.5 d
const teacherCost = (i) => paced(CLASSES[i].tuition * 6 * Math.pow(BAL.teacher, S.classes[i].teacher - 1), S.classes[i].teacher);
const expandCost = (i) => paced(CLASSES[i].tuition * BAL.expand * Math.pow(BAL.expandK, sizeOf(i) - 1), sizeOf(i));
const deskCost = (i) => paced(CLASSES[i].tuition * 15 * Math.pow(CLASSES[i].final ? BAL.examDesk : BAL.desk, S.classes[i].desks - 2), S.classes[i].desks - 1);   // exam desks grow slower: there are 21 of them
const timeCost = (i) => paced(CLASSES[i].tuition * 10 * Math.pow(BAL.time, S.classes[i].time), S.classes[i].time + 1);
const MAX_REC_LVL = 40;   // both reception upgrades stop at level 40
const recLvl = () => Math.min(MAX_REC_LVL, S.reception.level), adsLvl = () => Math.min(MAX_REC_LVL, S.reception.ads);
const procTime = () => 3.5 * Math.pow(0.92, recLvl() - 1) / bossProcK();   // bossProcK: an ad campaign brings a helper to the reception (build 238)
// entry fee: grows with the school (half the lesson price of the most expensive open class); upset leavers get it back x refundRate()
const fee = () => { let mx = 0; for (let i = 0; i < CLASSES.length; i++) if (!CLASSES[i].final && isOpen(i)) mx = Math.max(mx, tuition(i)); return Math.max(3 + recLvl(), Math.round(mx * 0.5)); };
// ---- pace floor (her rulings 2026-11-23: «покупки должны всегда соответствовать темпу игры», «Нужно всё перевести на такой формат.
// Чтобы старичкам тоже было сложно качаться, а не только новичкам»): an upgrade level never costs less than paceMin(n) minutes of the
// school's income (slow average S.paceEma, ~5 min), n = the number of that purchase (1 = first level). The usual price stays when it
// is higher, so the normal path does not change; what was dirt cheap for a big school (the first levels of a newly opened class, a new
// feature, catching up after a break) now costs real time. PACE_FREE: the first hour of a new school pays the old prices.
// Buildings (classes, shop, canteen, director, tower, trading yard, 2nd dorm) keep fixed prices: they are the timing gates.
const PACE_FREE = 2000;   // coins per minute of income not counted
const paceMin = (n) => (BAL.floorM || 0) * Math.pow(BAL.floorG || 1, Math.max(0, n - 1));
const paceInc = () => Math.max(0, ((S && (S.paceEma ?? S.ema)) || 0) * 60 - PACE_FREE);
// frozen floors (tester №73po7zf1, 2026-11-24: prices of a growing school crept up every second, 178K -> 179K -> 180K ... +20% in 25 s on screen):
// the floor of an upgrade level is taken once and kept until something is bought or a room is opened, so the shown price stands still
const PRICE_FROZEN = new Map(); let PRICE_AT = 0;   // build audit 2026-11-24 (same tester): a purchase re-priced every other line too; now a line
// gets a new floor only when its own level changes (new key); all floors are renewed at most every 10 min, and only when a panel opens
const paceFloor = (price, n) => { const k = Math.round(price) + '|' + n; let f = PRICE_FROZEN.get(k); if (f === undefined) { f = paceInc() * paceMin(n); PRICE_FROZEN.set(k, f); } return f; };
const paced = (price, n) => Math.round(Math.max(price, paceFloor(price, n)));
const arrivalInterval = () => 5 * Math.pow(0.9, adsLvl() - 1) / bossArrK();   // bossArrK: the director's contract tariff and ad campaigns (build 238, tester Ruslan's idea)
const recCost = () => paced(20 * Math.pow(BAL.rec, S.reception.level - 1), S.reception.level);
const adsCost = () => paced(30 * Math.pow(BAL.ads, S.reception.ads - 1), S.reception.ads);

// ======================= director's office (Ruslan's idea, Maria's choices 2026-11-21) =======================
const DIR_UP = {
  refund: { emo: '💸', name: 'Правила возврата', max: 8, base: 500000, k: 1.9, desc: (l) => `ушедшим возвращаем ${Math.round(refundRateAt(l) * 100)}% взноса, их отзыв ${String(+(1 + l / 8).toFixed(2)).replace('.', ',')}★` },
  care: { emo: '💗', name: 'Забота об учениках', max: 10, base: 500000, k: 1.9, desc: (l) => `в очередях грустят на ${Math.round((1 - careK(l)) * 100)}% медленнее` },
  keeper: { emo: '🧹', name: 'Дежурный завхоз', max: 10, base: 750000, k: 1.9, desc: (l) => `происшествия ${l ? `в ${String(+(1 + 0.1 * l).toFixed(1)).replace('.', ',')} раза реже` : 'как обычно'}, сами проходят за ${Math.round(INC_AUTO_AT(l) / 60)} мин` },   // build 264: the old «реже на 100%» read as «never» (her «Вообще без происшествий не может быть»); the pause between incidents is x(1 + 0.1 l)
  ties: { emo: '🤝', name: 'Связи с инспекцией', max: 10, base: 500000, k: 1.9, desc: (l) => `награда за проверку +${l * 10}%, штраф −${l * 7}%` },
};
// ---- the school shop (her ruling 2026-11-21): between lessons some students drop in to buy a treat; coins + mood ----
const SHOP_COST = 150000, SHOP_MAX = 10;
const shopUp = () => (S.shop ||= { built: false, seller: 1, shelves: 1, goods: 1 });
const shopOpen = () => WORLD <= 2 && !!(S && bReady(S.shop));
const shopChance = () => 0.12 + 0.03 * (shopUp().shelves - 1);                 // share of students who drop in after a lesson
const shopTime = () => 2.2 * Math.pow(0.88, shopUp().seller - 1);              // seconds to serve one
const loreQ = (k) => !!(WORLD === 1 && S && S.lore && S.lore.quiz && S.lore.quiz[k] && S.lore.quiz[k].done);   // Tikhon's exam passed for chapter k (js/lore.js)
const shopPrice = () => Math.max(5, Math.round(fee() * (0.5 + 0.15 * (shopUp().goods - 1)) * (1 + 0.03 * (shopUp().seller - 1)) * (loreQ('school') ? 1.05 : 1)));   // build audit 2026-11-24: the seller also sells +3% dearer per level (his speed alone did nothing while the line was short)
const shopCost = (k) => paced(SHOP_COST * 0.4 * Math.pow(1.9, shopUp()[k] - 1), shopUp()[k]);
const SHOP_SPOTS = (s) => [0, 1, 2, 3, 4, 5].map((k) => ({ x: s.x0 + 2.75, y: s.y0 + 1.6 + k * 0.62 }));   // a line in front of the counter: the first is served, the rest wait (her ask)
// ---- the canteen (her choices 2026-11-22: its own house on the lawn between Charms and the masters' tower; a snack after a lesson
// for coins and mood, a fed student passes the next lesson a little easier; the cook is a little dragon) ----
const CANT_COST = 500000, CANT_TIME = 600, CANT_NEED = 2;   // needs the third class (Stars) open
const CANT_MAX = { cook: 10, tables: 5, menu: 10 };
const cantUp = () => (S.cant ||= { built: false, end: 0, cook: 1, tables: 1, menu: 1 });
const cantBuilt = () => WORLD <= 2 && !!(S && S.cant && S.cant.built);
const cantOpen = () => cantBuilt() && Date.now() >= (S.cant.end || 0);
const cantChance = () => 0.15 + 0.03 * (cantUp().tables - 1);              // share of students who go to eat after a lesson
const cantServe = () => 2.0 * Math.pow(0.88, cantUp().cook - 1);           // seconds the cook needs to fill one tray
const CANT_EAT = 4;                                                         // seconds at the table
const cantPrice = () => Math.max(5, Math.round(fee() * (0.6 + 0.15 * (cantUp().menu - 1)) * (1 + 0.03 * (cantUp().cook - 1)) * (loreQ('school') ? 1.05 : 1)));   // build audit 2026-11-24: the cook: +3% per level, as the seller
const cantMood = () => 20 + 2 * (cantUp().menu - 1);
const FED_BONUS = 0.05;                                                     // a fed student: +5% on the next exam
const cantCost = (k) => paced(CANT_COST * 0.4 * Math.pow(1.9, cantUp()[k] - 1), cantUp()[k]);
const CANT_DISHES = ['🥣', '🍲', '🥞', '🍝', '🥗', '🥧', '🍰', '🍪', '🍩', '🧁', '🍵'];
const cantDishes = () => CANT_DISHES.slice(0, Math.min(CANT_DISHES.length, cantUp().menu + 1));
const cantTables = () => cantUp().tables + 1;                               // 2..6 tables, 2 seats each
const CANT_TABLES = (s) => [[1.2, 2.5], [2.9, 2.5], [1.2, 3.9], [2.9, 3.9], [1.2, 5.3], [2.9, 5.3]].map(([x, y]) => ({ x: s.x0 + x, y: s.y0 + y }));
const cantSeatPos = (k) => { const t = CANT_TABLES(SLOTS.CANT)[k >> 1]; return { x: t.x + (k & 1 ? 0.62 : -0.62), y: t.y + 0.02, flip: !(k & 1) }; };
const CANT_SPOTS = (s) => [0, 1, 2, 3, 4, 5].map((k) => ({ x: s.x0 + 4.7, y: s.y0 + 2.0 + k * 0.62 }));   // the line in front of the counter
const CANT_COOK = (s) => ({ x: s.x0 + 4.6, y: s.y0 + 0.75 });
const DIR_COST = 50000, DIR_STARS = 2;
const bReady = (o) => !!(o && o.built && Date.now() >= (o.end || 0));   // built and the construction time is over
const BTIME = { SHOP: 600, TRADE: 600, DIR: 1800, EXPED: 1800, TOWER: 1800, DORM2: 600 };
const bObj = (id) => (id === 'SHOP' ? S.shop : id === 'TRADE' ? S.w2 && S.w2.trade : id === 'EXPED' ? S.w2 && S.w2.exped : id === 'DIR' ? (WORLD === 2 ? S.w2 && S.w2.throne : { built: S.dirBuilt, end: S.dirEnd })
  : id === 'TOWER' ? S.tower : id === 'DORM2' ? S.dormUp && { built: S.dormUp.room2, end: S.dormUp.room2End } : null);
const dirBuilt = () => !!(S && (WORLD === 2 ? S.w2 && bReady(S.w2.throne) : S.dirBuilt && Date.now() >= (S.dirEnd || 0)));
const dirLvl = (k) => (S && S.dir && S.dir[k]) || 0;
const dirCost = (k) => paced(DIR_UP[k].base * Math.pow(DIR_UP[k].k, dirLvl(k)), dirLvl(k) + 1);
const refundRateAt = (l) => 1 - 0.1 * l;   // build audit 2026-11-24: 100% -> 20% (was 300% -> 100%: a refund three times the fee read like a penalty)
const leaverStars = () => (WORLD === 1 ? 1 + dirLvl('refund') / 8 : 1);   // build audit 2026-11-24: «Правила возврата» also soften the leavers' reviews: ★1 -> ★2 at level 8 (the rating is the school's goal)
const refundRate = () => (WORLD === 2 ? 1 : refundRateAt(dirLvl('refund')));   // world 2 has no director to lower the penalty: just the fee back (her report 2026-11-22: coins drained to 0 by refunds)
// world 2 (her report 2026-11-22: «прямо перед глазами в 0 ушли деньги»): newcomers kept arriving every 5 s while the
// 2-desk halls were full and the dorm too, 2 of 3 left and each took 300% of its fee back. Now no one is admitted while full.
const schoolFull = () => !dormFree();   // the dorm is the school's buffer: when every bed is taken, the school is overloaded
const careK = (l) => 1 - 0.06 * l;                         // mood drop x1 -> x0.4
// build audit 2026-11-24 (tester Гоща: reception and ads looked like 99 students/s, the school took ~0.5/s, the panel said «0,0 с»,
// the last ads levels up to 513M did nothing): an arrival that finds the gate closed (q = the reception line is full, b = the school is
// full) waits at the gate (up to GATE_PEND newcomers) and comes in as soon as there is room, instead of being thrown away while only
// a very fast arrival timer caught the short moments of room; one more arrival is turned away. When more than 25% are turned away
// more ads change nothing, so they stop selling (back on below 10%) and the panel says what to upgrade instead
const GATE_PEND = 6, gate = () => (S.gate ||= { q: 0, b: 0, full: 0, pend: 0, lastQ: 1 });
function gateArrive() { const g = gate(), w = 0.03, away = g.pend >= GATE_PEND; if (!away) g.pend++; g.q = g.q * (1 - w) + (away && !g.lastQ ? w : 0); g.b = g.b * (1 - w) + (away && g.lastQ ? w : 0); const blk = g.q + g.b; if (blk > 0.25) g.full = 1; else if (blk < 0.1) g.full = 0; }
const gatePend = () => gate().pend > 0;
function gateLet(okQ, okB) { const g = gate(); g.lastQ = okQ ? 1 : 0; if (!(okQ && okB)) return false; g.pend--; return true; }
const adsFull = () => !!(S && S.gate && S.gate.full);
const adsWhy = () => (gate().q > gate().b ? '🚦 Новички приходят чаще, чем секретарь успевает их оформлять: больше объявлений не помогут, сначала улучшай секретаря.' : '🏫 Школа полна: новички приходят чаще, чем освобождаются места (новенький входит, только когда в спальне свободно больше 4 кроватей). Больше объявлений не помогут: ставь парты, расширяй классы, сокращай уроки и покупай кровати.');
const INC_AUTO_AT = (l) => 600 * (1 - 0.07 * l);           // 10 min -> 3 min
// ---- director's routine (build 238, tester Ruslan's wish, Maria's pick 2026-11-22: contract tariff, ad campaigns, parents' letters) ----
// World 1 only, after the office is built. State in S.boss = { plan, camp: { k, end, cd }, mail: { t, cur }, rep }.
const boss = () => (S.boss ||= { plan: 'normal', camp: null, mail: { t: MAIL_FIRST, cur: null }, rep: 0 });
const bossOn = () => WORLD === 1 && dirBuilt();
const PLANS = {   // the contract a newcomer signs: fee, how many come, the mood they come with
  cheap: { emo: '🤝', name: 'Доступный', fee: 0.75, arr: 1.5, proc: 1.5, mood: 85, sad: 0.75, desc: 'взнос ×0,75, ученики приходят и оформляются в 1,5 раза быстрее, в очередях грустят на 25% медленнее. Выгодно, когда в школе есть свободные места' },
  normal: { emo: '📄', name: 'Обычный', fee: 1, arr: 1, proc: 1, mood: 80, sad: 1, desc: 'обычный взнос, обычный поток учеников' },
  prestige: { emo: '🎩', name: 'Престижный', fee: 1.5, arr: 0.6, proc: 1, mood: 95, sad: 1.5, desc: 'взнос ×1,5, приходят на 40% реже, весёлыми, но требовательные: в очередях грустят в 1,5 раза быстрее. Выгодно, когда школа полна, а очереди короткие' },
};
// build audit 2026-11-24: in a full school only the fee counted, so «Престижный» always won and «Доступный» only lost 30% of fees;
// now cheap = more students when there are free places and calmer lines, prestige = more money but sadder in long lines (a.pk)
const planOf = () => (bossOn() && PLANS[boss().plan]) || PLANS.normal;
// ad campaigns: 5 minutes each, then a 15-minute pause before the next one; cost = that many entry fees.
// build audit 2026-11-24: a full school admits the same number whatever the ads, so the arrival boost was wasted and every campaign
// lost money below ~20 newcomers a minute; «День открытых дверей» was never best. Now: flyers = cheap, more students while there
// are free places; open day = mood for the whole school; fair = the money one (fee +60%, pays back from ~7 newcomers a minute)
const CAMPS = {
  flyers: { emo: '📰', name: 'Листовки в городе', arr: 1.5, proc: 1.2, fee: 1.1, cost: 4, desc: 'ученики приходят в 1,5 раза чаще (если есть места), взнос +10%' },
  open: { emo: '🎪', name: 'День открытых дверей', arr: 2, proc: 1.5, fee: 1, cost: 8, mood: 15, desc: 'все ученики сразу +15 настроения (весёлые лучше сдают экзамены), новички приходят весёлыми и вдвое чаще (если есть места)' },
  fair: { emo: '🎡', name: 'Волшебная ярмарка', arr: 1, proc: 1.5, fee: 1.6, cost: 20, desc: 'взнос новичков +60%, в приёмной помогает волонтёр' },
};
const CAMP_LEN = 300, CAMP_PAUSE = 900;
const campCost = (k) => Math.max(300, Math.round(fee() * planOf().fee * CAMPS[k].cost / 10) * 10);
const campNow = () => { if (!bossOn()) return null; const c = boss().camp; return c && c.k && Date.now() < c.end ? CAMPS[c.k] : null; };
const campWait = () => { const c = bossOn() && boss().camp; return c ? Math.max(0, (c.cd - Date.now()) / 1000) : 0; };   // seconds until a new campaign may start
const bossArrK = () => planOf().arr * ((campNow() || {}).arr || 1);
const bossProcK = () => planOf().proc * ((campNow() || {}).proc || 1);
const entryFee = () => Math.max(1, Math.round(fee() * planOf().fee * ((campNow() || {}).fee || 1) * firmK()));   // what a newcomer pays at the reception
function startCamp(k) {
  if (!bossOn() || !CAMPS[k] || campNow() || campWait() > 0) return;
  if (!spend(campCost(k))) return;
  const now = Date.now(); boss().camp = { k, end: now + CAMP_LEN * 1000, cd: now + (CAMP_LEN + CAMP_PAUSE) * 1000 }; S.stats.camps = (S.stats.camps || 0) + 1;   // counted for the missions
  arrivalT = Math.min(arrivalT, arrivalInterval()); if (CAMPS[k].mood) cheerAll(CAMPS[k].mood, '🎈');
  toast(`${CAMPS[k].emo} Акция «${CAMPS[k].name}» началась на 5 минут!`); save();
}
// parents' letters: every 8-15 minutes of play one complaint; three answers; no deadline since build 240 (only while the game is on screen)
const MAIL_FIRST = 300, MAIL_MIN = 480, MAIL_MAX = 900, REP_MAX = 5;
const MAILS = [
  ['⏳', 'Мой ребёнок целый час простоял в очереди у класса и так и не попал на урок!'],
  ['🛏️', 'Нам написали, что пришлось ночевать в общежитии, потому что в классе не было места. Мы платили не за это!'],
  ['📉', 'Почему мой ребёнок провалил экзамен? Может, учителя плохо объясняют?'],
  ['💰', 'Взнос за поступление слишком большой. Соседняя школа берёт меньше!'],
  ['💥', 'Мне рассказали, что у вас на уроке что-то взорвалось. Это вообще безопасно?'],
  ['😢', 'Мой ребёнок приходит грустный. Ему у вас скучно.'],
  ['🍽️', 'Чем вы кормите детей? Жалуются, что всё время голодные.'],
];
const mailPayCost = () => { const c = boss().mail.cur, v = Math.max(200, Math.round((rateNow() || 1) * 20 / 10) * 10); return c ? (c.pay ||= v) : v; };   // fixed for the letter (it moved every second)
const FIRM_SEC = 600, firmK = () => (bossOn() && (boss().firm || 0) > Date.now() ? 1.25 : 1);   // build audit 2026-11-24: a refused letter: the school knows its worth, newcomers pay +25% for 10 minutes (refuse was strictly worse than the open lesson)
const repK = () => 1 + 0.05 * (bossOn() ? boss().rep || 0 : 0);   // the school's name among parents: inspection reward ±5% per point
function cheerAll(d, icon) {   // every student in school gets mood d
  for (const a of agents) if (a.state !== 'fly' && a.state !== 'vanish' && !(a.goal && a.goal.t === 'x')) { a.mood = Math.max(0, Math.min(100, moodOf(a) + d)); if (icon && Math.random() < 0.35) popup(icon, a.x, a.y, d > 0 ? '#ff6fa3' : '#5b7fd6', 44); }
}
function stepBoss(dt, live) {
  if (!bossOn()) return;
  const B = boss();
  if (B.camp && B.camp.k && Date.now() >= B.camp.end) { if (live) toast(`${CAMPS[B.camp.k].emo} Рекламная акция закончилась`); B.camp.k = null; dirtyPanel = true; }
  const M = B.mail;
  if (M.cur) { if (live) M.cur.t = (M.cur.t || 0) + dt; return; }   // build 240 (her «10 мин это слишком жестко»): no deadline, the letter simply waits for an answer; no new letter meanwhile
  if (!live || calm() || MG.isOpen() || S.stats.graduated < 20 || tourStep >= 0) return;   // only while playing (not inside the mini-game); the calm mode has no complaints either
  M.t -= dt; if (M.t > 0) return;
  M.t = MAIL_MIN + Math.random() * (MAIL_MAX - MAIL_MIN);
  M.cur = { m: Math.floor(Math.random() * MAILS.length), name: rnd(NAMES), t: 0 };
  toast('✉️ Письмо от родителей! Загляни в кабинет директора'); try { navigator.vibrate?.(60); } catch (e) { /* no vibration */ }
  hintOnce('mail', '✉️', 'Письмо от родителей', 'Родители учеников иногда жалуются директору. Над кабинетом директора 👑 появляется конверт ✉️: нажми на кабинет и ответь. Можно вернуть деньги, пригласить на открытый урок или отказать. От ответа зависят настроение учеников и репутация школы (она меняет награду инспектора). Письмо подождёт, пока ты ответишь, а новые не придут, пока не ответишь на это.');
  dirtyPanel = true;
}
let mailResult = '';
function answerMail(how, auto) {
  const B = boss(), M = B.mail; if (!M.cur) return;
  if (how === 'pay') { if (!spend(mailPayCost())) return; B.rep = Math.min(REP_MAX, (B.rep || 0) + 1); cheerAll(10, '💖'); mailResult = '💐 Родители довольны: деньги вернули, извинения приняты. Репутация школы выросла, ученики повеселели.'; }
  else if (how === 'lesson') {
    if (Math.random() < 0.6) { cheerAll(8, '😊'); mailResult = '🎓 Открытый урок понравился! Родители успокоились, ученики гордятся школой.'; }
    else { B.rep = Math.max(-REP_MAX, (B.rep || 0) - 1); cheerAll(-5); mailResult = '😕 Открытый урок не убедил родителей. Репутация школы немного упала.'; }
  } else if (auto) { B.rep = Math.max(-REP_MAX, (B.rep || 0) - 1); cheerAll(-12, '😟'); mailResult = '📭 На письмо никто не ответил. Родители обиделись: репутация упала, ученики загрустили.'; }
  else { B.rep = Math.max(-REP_MAX, (B.rep || 0) - 1); cheerAll(-6, '😟'); B.firm = Date.now() + FIRM_SEC * 1000; mailResult = '😤 Родители обиделись на отказ: репутация упала. Зато все видят, что школа знает себе цену: взнос новичков +25% на 10 минут.'; }
  M.cur = null; dirtyPanel = true; if (!auto) S.stats.mails = (S.stats.mails || 0) + 1; save();   // mails: counted for the missions
  toast(auto ? '📭 Письмо родителей осталось без ответа' : mailResult.split(':')[0].split('!')[0]);
}
let mailRect = null;
// The letter has its own window (build 311, tester «письмо в кабинете директора открывается в общем меню директора. Должно открываться
// в отдельной своей менюшке, где ты конкретно по этому письму принимаешь решение по клику на пришедшее письмо»): the envelope over the
// office, the letter card in the director's panel and Tikhon's report open it; after the answer it shows how it went.
function mailPanel() {
  const M = boss().mail;
  if (!M.cur) return `<div class="sh-head"><span class="remoji big">✉️</span><div><h2>Письмо от родителей</h2><div class="muted">Ответ отправлен</div></div><button class="x" data-close>✕</button></div>
    <p>${mailResult || 'Новых писем нет.'}</p><button class="btn wide" data-close>Хорошо</button>`;
  const [e, t] = MAILS[M.cur.m] || MAILS[0];
  return `<div class="sh-head"><span class="remoji big">✉️</span><div><h2>Письмо от родителей</h2><div class="muted">ученика ${M.cur.name}</div></div><button class="x" data-close>✕</button></div>
    <div class="card up"><span class="remoji">${e}</span><div class="grow">«${t}»</div></div>
    <p class="muted">Как ответить? От ответа зависят настроение учеников и репутация школы у родителей (сейчас ${(boss().rep || 0) > 0 ? '+' : ''}${boss().rep || 0}).</p>
    <button class="btn wide" data-cost="${mailPayCost()}" data-act="mail" data-k="pay">💐 Извиниться и вернуть деньги (репутация +1) <span class="cost">🪙${fmt(mailPayCost())}</span></button>
    <button class="btn ghost wide" data-act="mail" data-k="lesson">🎓 Пригласить на открытый урок <span class="cost">60%</span></button>
    <button class="btn ghost wide" data-act="mail" data-k="no">🙅 Отказать (взнос новичков +25% на 10 мин)</button>`;
}
function drawMail() {   // a bobbing envelope over the director's office while a letter waits
  if (!bossOn() || !S.boss || !S.boss.mail || !S.boss.mail.cur || !SLOTS.DIR) return;
  const s = SLOTS.DIR, c = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), T = performance.now();
  const k = 1 + 0.1 * Math.sin(T / 200), y = c.y - 30 - 6 * Math.sin(T / 300);   // same look as the incident badge, so it is seen on the dark office wall
  mailRect = { x0: c.x - 42, y0: y - 34, x1: c.x + 42, y1: y + 54, t: T };
  ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(c.x, y, 30 * k, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e0a100'; ctx.lineWidth = 3; ctx.stroke();
  emoji('✉️', c.x, y, 36 * k);
  ctx.fillStyle = '#ff4d6d'; rr(c.x - 40, y + 30, 80, 22, 11); ctx.fill(); text('Письмо!', c.x, y + 41, 11, '#ffffff');
}
function bossBlock() {   // the routine part of the director's panel
  const B = boss(), M = B.mail, cn = campNow(), w = campWait();
  let h = '';
  if (M.cur) { const [e, t] = MAILS[M.cur.m] || MAILS[0];
    h += `<div class="card up" style="border:2px solid #e8b923;background:#fff8dc"><span class="remoji">✉️</span><div class="grow"><b>Письмо от родителей ученика ${M.cur.name}</b><div class="muted">${e} ${t.length > 48 ? t.slice(0, 46) + '…' : t}</div></div><button class="btn small hot" data-mailopen>Открыть</button></div>`; }
  else if (mailResult) h += `<p class="muted">${mailResult}</p>`;
  const rep = B.rep || 0;
  h += `<p class="muted">Репутация у родителей: <b>${rep > 0 ? '+' : ''}${rep}</b> (от −${REP_MAX} до +${REP_MAX}), награда инспектора ${rep >= 0 ? '+' : '−'}${Math.abs(rep * 5)}%. Письма приходят раз в 8–15 минут игры.</p>`;
  h += `<h3>📜 Договор с учениками</h3><p class="muted">Взнос новичка сейчас 🪙${fmt(entryFee())}, приходят ${perMin(arrivalInterval())} в минуту${adsFull() ? ' (школа полна: больше не помещается, поэтому важнее взнос)' : ''}. Ушедшие расстроенными получают назад свой взнос × правила возврата.</p>`;
  for (const [k, p] of Object.entries(PLANS)) h += `<div class="card up"><span class="remoji">${p.emo}</span><div class="grow"><b>${p.name}</b><div class="muted">${p.desc}</div></div>${B.plan === k ? '<span class="done">выбран</span>' : `<button class="btn ghost" data-act="plan" data-k="${k}">Выбрать</button>`}</div>`;
  h += `<h3>📣 Рекламные акции</h3>`;
  if (cn) h += `<p>${cn.emo} Идёт акция «${cn.name}»: ещё ${mmss((B.camp.end - Date.now()) / 1000)}.</p>`;
  else if (w > 0) h += `<p class="muted">Следующую акцию можно запустить через ${mmss(w)}.</p>`;
  else h += `<p class="muted">Акция идёт 5 минут, потом перерыв 15 минут. ${adsFull() ? 'Сейчас школа полна: лишние ученики не войдут, так что выгоднее ярмарка (надбавка к взносу) или день открытых дверей (настроение).' : 'Пока в школе есть свободные места, листовки и день открытых дверей приводят больше учеников.'}</p>`;
  for (const [k, c] of Object.entries(CAMPS)) h += `<div class="card up"><span class="remoji">${c.emo}</span><div class="grow"><b>${c.name}</b><div class="muted">${c.desc}</div></div>${cn || w > 0 ? '' : costBtn('▶', campCost(k), 'camp', `data-k="${k}"`)}</div>`;
  h += `<h3>🏛️ Улучшения кабинета</h3>`;
  return h;
}
const G = { // helpers exposed to missions
  get S() { return S; }, calm: () => calm(), cls, built: (id) => { const i = CLASSES.findIndex((c) => c.id === id); return isOpen(i); },
  item: (cid, iid) => { const i = CLASSES.findIndex((c) => c.id === cid); return S.classes[i].items[CLASSES[i].items.findIndex((x) => x.id === iid)]; },
  maxItem: () => Math.max(...S.classes.flatMap((c) => c.items)),
  // features added since build 237 (story missions 2026-11-23)
  stars: () => schoolStars(), dir: () => dirBuilt(), shop: () => shopOpen(), cant: () => cantBuilt(), tower: () => towerOpen(),
  court: () => courtUp(), named: () => !!schoolName(), ally: () => !!myAl(), mg: () => S.mg || {}, masters: () => (S.stats.ranks || [])[5] || 0,
  trade: () => tradeOpen(), tradeAway: () => !!(tradeOpen() && trade().away), w2: () => W2(),
};

// ---- the school's outflow and the refund cap (build 275, tester's report «должен показывать реальный прирост с учётом ушедших ...
// школа может быть в минусе ... не должно быть такого что я в нуле и не могу из нуля выйти»; her pick «Потолок возвратов»):
// refunds to leavers and inspection fines are counted as outflow (S.outEma, like S.ema for income); refunds per minute may take
// at most half of the school's income (budget S.refBud refilled at 0.5 x income), the rest of the leavers go without money.
let outThisSec = 0;
function spendOut(n, kind) { if (!(n > 0)) return; S.coins -= n; S.stats[kind] = (S.stats[kind] || 0) + n; if (!ffwd) outThisSec += n; }
const refundCap = () => 0.5 * (S.ema || 0) * 60;
window.__leave = (a) => leaveSchool(a);   // test hook
function stepRefund(dt) { const cap = refundCap(); S.refBud = Math.min(cap, (S.refBud ?? cap) + 0.5 * (S.ema || 0) * dt); }
function earn(n, x, y, color, lift) { S.coins += n; S.stats.earned = (S.stats.earned || 0) + n; earnedThisSec += n; if (x !== undefined) popup(`+${fmt(n)}`, x, y, color || '#c98a00', lift); }
// build audit 2026-11-24: a one-off payout (chest, mini-game, moon, caravan, expedition, rumble chest, tower release) is not the school's
// running income: it must not lift the income average, or every «N minutes of income» reward and every price floor balloons after it
// (a chest then a mini-game round paid ~1160 min instead of 10; prices x14-x32 for half an hour after the chests)
function bonus(n, x, y, color, lift) { if (!(n > 0)) return; S.coins += n; S.stats.bonus = (S.stats.bonus || 0) + n; if (x !== undefined) popup(`+${fmt(n)}`, x, y, color || '#c98a00', lift); }
const rateNow = () => (steadyRate() || S.ema || 0) / boostK();   // income per second for pricing rewards and costs: spikes clipped, a running boost taken out
function spend(c) { if (!Number.isFinite(c) || c < 0) return false; if (S.coins < c) { toast('Не хватает монет 🪙'); return false; } S.coins -= c; return true; }   // a purchase: the next prices are taken anew

// ======================= world geometry (isometric tile map) =======================
// Tile coords (x, y). Screen: sx = OX + (x - y) * HW, sy = OY + (x + y) * HH.
// HH/HW = 0.62 matches the angle of the room art.
// ROOMS_K: rooms are drawn 1.5x bigger than at first while creatures, signs and icons keep their on-screen size
const ROOMS_K = 1.5;
const HW = 16 * ROOMS_K, HH = HW * 0.62;
const ROOM = 6;                                    // rooms are 6x6 tiles
const WALLH = ROOM * 2 * HW * 0.3676;              // wall height in the art, relative to room width
// ======================= adaptive layout =======================
// The map is GENERATED top-down from the class list: exam hall + garden, class rows on both sides of the main
// corridor (a row is as deep as its bigger room), reception, dorms, gate. Expanding a class re-runs it (relayout()).
// Wall rule: outer walls of the building are tall, partitions next to halls are low (cut.left / cut.right).
let GW = 32, GH = 60;
let PATHS = [], HALLS = [], BUILDING = { x0: 7, y0: 0, x1: 22, y1: 0 }, OUTER_WALLS = [], GATE_TILE = { x: 14.5, y: 0 };
const SLOTS = {};
function slot(x0, y0, door, cut = {}, w = ROOM, h = ROOM, extra = []) { return { x0, y0, x1: x0 + w, y1: y0 + h, door, cut, extra }; }
const NCLS = CLASSES.length - 1;                                  // classes before the final exam
const CLASS_SLOT = [...CLASSES.map((c, i) => (c.final ? 'EXAM' : 'C' + i))];
const MAX_SIZE = 3;
const sizeOf = (i) => (S && S.classes && S.classes[i] && S.classes[i].size) || 1;
const depthOf = (i) => ROOM + 2 * (sizeOf(i) - 1);                // 6, 8, 10 tiles
const maxDesksOf = (i) => (CLASSES[i].final ? 21 : 6 + 4 * (sizeOf(i) - 1));   // 6, 10, 14; the wide exam hall: 21 (3 rows of 7)
const MAX_DESKS_ABS = 21;
const ART = {                                               // room pictures with floor corners in image px
  ...((window.__EDIT) ? { DORM: { src: 'assets/parts/dorm/dm_tree.webp?v=1', L: [60, 669], R: [1090, 519], F: [452, 897], band: 1, fill: 1 }, DORM2: { src: 'assets/parts/dorm/dm_tree_nodoor.webp?v=1', L: [60, 669], R: [1090, 519], F: [452, 897], band: 1, fill: 1 } } : {}),   /* the tree dorms: editor only until her OK */
  REC: { src: 'assets/parts/reception/rc_room.webp?v=1', L: [11, 689], R: [953, 699], F: [502, 952] },   /* the Arrival Hall (live since her OK 2026-11-25) */   /* the Arrival Hall, painted from the approved concept */
};
// ---- rooms assembled from parts (any size looks whole): seamless wall + floor textures, wall decor hung
// on the back walls and furniture placed on the floor by the engine. A themed room replaces its painted picture.
const THEMES = {
  // World 2, Hall of Runes (her approved mood concept art/concepts/w2/hall_runes_v1.jpg): cold granite, glowing rune tablets, braziers
  // World 2, the mine (Штольня; her plan 2026-11-22): rock walls with timber, a tunnel mouth with rails instead of a board,
  // students dig at glowing ore veins, the teacher by a big ore cart with a winch
  mine: { w2: true, dir: 'assets/parts/mine/', wallTiles: 4, floorTiles: 3, board: 'tunnel', isoOnly: true, iso: true,
    decor: ['lantern', 'map', 'rack', 'sign', 'rope'], back: ['ore_heap', 'barrels'], side: ['logs', 'post_lantern'], front: [], rug: '',
    stations: ['ore_orange', 'ore_blue', 'ore_green'], teacherProp: 'cart_winch', h: { ore_heap: 30, barrels: 34, logs: 26, post_lantern: 46, ore_orange: 26, ore_blue: 26, ore_green: 26, cart_winch: 40 } },
  // World 2, the forge (Кузня; her plan 2026-11-22): sooty stone, a stone hearth with fire instead of a board,
  // students hammer at anvils with glowing metal, the teacher by the bellows and coal brazier
  forge: { w2: true, dir: 'assets/parts/forge/', wallTiles: 4, floorTiles: 3, board: 'hearth', isoOnly: true, iso: true,
    decor: ['tongs', 'shield', 'shelf', 'lantern', 'chain'], back: ['coal', 'quench'], side: ['weapon_rack', 'grindstone'], front: [], rug: '',
    stations: ['anv_red', 'anv_shoe', 'anv_gold'], teacherProp: 'bellows', h: { coal: 24, quench: 34, weapon_rack: 40, grindstone: 36, anv_red: 26, anv_shoe: 26, anv_gold: 26, bellows: 40 } },
  // World 2, the gem hall (Гранильня): violet stone with embedded crystals, a glass cabinet of cut gems instead of a board,
  // students at small cutting benches, the teacher by a split glowing geode
  gems: { w2: true, dir: 'assets/parts/gems/', wallTiles: 4, floorTiles: 3, board: 'gcab', isoOnly: true, iso: true,
    decor: ['cuts', 'gsconce', 'shelf', 'gtap', 'gcrys'], back: ['crystal_rock', 'chest'], side: ['drawers', 'scales'], front: [], rug: '',
    stations: ['wb_violet', 'wb_blue', 'wb_green'], teacherProp: 'geode', h: { crystal_rock: 30, chest: 26, drawers: 44, scales: 28, wb_violet: 24, wb_blue: 24, wb_green: 24, geode: 44 } },
  // World 2, the guard hall (Зал стражей): granite with knotwork bands, a war banner in a stone ring instead of a board,
  // students train at armoured dummies, the teacher by a stone table of weapons
  guards: { w2: true, dir: 'assets/parts/guards/', wallTiles: 4, floorTiles: 3, board: 'gbanner', isoOnly: true, iso: true,
    decor: ['shields', 'gtorch', 'axes', 'helm', 'warhorn'], back: ['gbrazier', 'sandbags'], side: ['spear_stand', 'shield_barrel'], front: [], rug: '',
    stations: ['dummy_a', 'dummy_b', 'dummy_c'], teacherProp: 'arms_table', h: { gbrazier: 34, sandbags: 22, spear_stand: 44, shield_barrel: 30, dummy_a: 34, dummy_b: 34, dummy_c: 34, arms_table: 30 } },
  // World 2, the lake hall (Озёрный зал): wet cave rock with glowing moss, a stone arch onto the underground lake instead
  // of a board, students in little boats, the teacher at a jetty post with a lantern
  lake: { w2: true, dir: 'assets/parts/lake/', wallTiles: 4, floorTiles: 3, board: 'lakearch', isoOnly: true, iso: true,
    decor: ['net', 'oars', 'bluelamp', 'lakemap', 'fishstring'], back: ['net_rack', 'mush_rock'], side: ['fish_barrel', 'net_pile'], front: [], rug: '',
    stations: ['boat_lamp', 'boat_net', 'boat_fish'], teacherProp: 'jetty', h: { net_rack: 38, mush_rock: 26, fish_barrel: 30, net_pile: 22, boat_lamp: 20, boat_net: 20, boat_fish: 20, jetty: 44 } },
  // World 2, the oath hall (Палата клятв, the final): solemn granite with gold runes, a relief of the dwarf king instead of
  // a board, oath pedestals for the students, the elder by the golden oath anvil
  oath: { w2: true, dir: 'assets/parts/oath/', wallTiles: 4, floorTiles: 6, board: 'kingrelief', isoOnly: true, iso: true,
    decor: ['oathbanner', 'goldcandle', 'names', 'wallgong', 'goldhammers', 'goldcandle'], back: ['obrazier', 'kneel_statue'], side: ['hourglass_st', 'gong_frame'], front: [], rug: '',
    stations: ['ped_book', 'ped_anvil', 'ped_scroll'], teacherProp: 'oath_anvil', h: { obrazier: 40, kneel_statue: 40, hourglass_st: 34, gong_frame: 40, ped_book: 24, ped_anvil: 24, ped_scroll: 24, oath_anvil: 40 } },
  // World 2, the gate hall (Привратный зал = reception): rough granite with knotwork, hexagonal slabs, a stone map of the
  // kingdom, a dark stone counter where the world-1 desk stands (same spot, recBlocked), cloak stand, braziers, stone benches
  REC_W2: { w2: true, dir: 'assets/parts/gate/', wallTiles: 4, floorTiles: 3, board: 'kmap', isoOnly: true, iso: true,
    decor: ['slit', 'gnotice', 'runeclock', 'glamp', 'ledgers', 'slit'], back: [], side: [], front: [], rug: '',
    h: { g_counter: 82, g_cloaks: 46, g_brazier: 44, g_bench: 30, g_crystal: 24, g_signpost: 40, g_runestone: 52, g_barrel: 30, g_chest: 26 },
    extras: (s) => [{ n: 'g_counter', x: s.x0 + 1.75, y: s.y0 + 3.9 }, { n: 'g_cloaks', x: s.x0 + 0.45, y: s.y0 + 0.5 }, { n: 'g_brazier', x: s.x0 + 0.5, y: s.y1 - 0.5 },
      { n: 'g_bench', x: s.x1 - 0.7, y: s.y0 + 5.6 }, { n: 'g_bench', x: s.x1 - 0.7, y: s.y0 + 7.3 }, { n: 'g_crystal', x: s.x1 - 0.5, y: s.y1 - 0.4 }, { n: 'g_signpost', x: s.x0 + 3.4, y: s.y1 - 0.6 },
      { n: 'g_runestone', x: s.x1 - 0.6, y: s.y0 + 0.7 }, { n: 'g_barrel', x: s.x1 - 0.5, y: s.y0 + 3.0 }, { n: 'g_chest', x: s.x0 + 0.5, y: s.y0 + 6.6 }] },
  // World 2, the sleeping cells (Кельи = dorms): dark wood panelling over stone, plank floor with straw, short wooden beds
  // with knotwork wool blankets, the keeper's desk with the key board
  DORM_W2: { w2: true, dir: 'assets/parts/cells/', wallTiles: 4, floorTiles: 3, board: 'hookboard', isoOnly: true, iso: true,
    decor: ['roundwin', 'cshelf', 'embroid', 'moondial', 'clamp'], back: [], side: [], front: [], rug: '', beds: ['bed_red', 'bed_green', 'bed_blue'], load: ['conc_desk'],
    h: { bed_red: 27, bed_green: 27, bed_blue: 27, conc_desk: 38, c_nightstand: 22, c_chest: 22, mush_pot: 24, blankets: 20 },
    extras: (s) => [{ n: 'c_nightstand', x: s.x0 + 0.5, y: s.y0 + 3.6 }, { n: 'c_chest', x: s.x0 + 0.55, y: s.y1 - 0.6 }] },
  DORM2_W2: { w2: true, dir: 'assets/parts/cells/', wallTiles: 4, floorTiles: 3, board: 'hookboard', isoOnly: true, iso: true,
    decor: ['embroid', 'moondial', 'cshelf', 'roundwin', 'clamp'], back: [], side: [], front: [], rug: '', beds: ['bed_blue', 'bed_red', 'bed_green'],
    h: { bed_red: 27, bed_green: 27, bed_blue: 27, mush_pot: 24, blankets: 20 },
    extras: (s) => [{ n: 'mush_pot', x: s.x1 - 0.45, y: s.y1 - 0.5 }, { n: 'blankets', x: s.x0 + 0.5, y: s.y1 - 0.6 }] },
  // World 2, the hall of annals (Чертог летописей = library): red-brown stone with gold lines and rune medallions,
  // herringbone oak, a carved stone bookcase instead of the board, leather cushions for readers
  LIB_W2: { w2: true, dir: 'assets/parts/annals/', wallTiles: 4, floorTiles: 3, board: 'bigshelf', isoOnly: true, iso: true,
    decor: ['ambwin', 'scrollcase', 'kingtree', 'hanglamps', 'kmap2'], back: [], side: [], front: [], rug: '',
    seats: ['pouf_red', 'pouf_green2', 'pouf_blue'], h: { pouf_red: 18, pouf_green2: 18, pouf_blue: 18, a_globe: 38, a_books: 30, lib_desk: 30, a_fern: 36, a_stonebook: 32 },
    extras: (s) => [{ n: 'a_globe', x: s.x0 + 0.5, y: s.y0 + 0.5 }, { n: 'a_books', x: s.x1 - 0.6, y: s.y0 + 0.6 }, { n: 'lib_desk', x: s.x0 + 3, y: s.y1 - 0.45 }, { n: 'a_fern', x: s.x0 + 0.5, y: s.y1 - 0.5 },
      { n: 'a_stonebook', x: s.x1 - 0.55, y: s.y1 - 0.6 }] },
  // World 2, the elder's throne hall (her «Ок, делай» 2026-11-23): royal granite with gold knotwork, red-black marble,
  // a mountain-and-crown relief instead of a board, the throne behind the king, the depth orb where he goes to think
  DIR_W2: { w2: true, dir: 'assets/parts/throne/', wallTiles: 4, floorTiles: 3, board: 'crownrelief', isoOnly: true, iso: true,
    decor: ['crownbanner', 'tshield', 'tbrazier', 'crownniche', 'taxes'], back: [], side: [], front: [], rug: '',
    h: { throne_seat: 56, t_runner: 14, t_brazier: 40, t_brazier2: 40, t_statue: 50, t_maptable: 28, t_orb: 40, t_candel: 44, t_chest: 26 },
    extras: (s) => [{ n: 'throne_seat', x: s.x0 + 1.3, y: s.y0 + 1.0 }, { n: 't_orb', x: s.x0 + 4.9, y: s.y0 + 0.6 }, { n: 't_statue', x: s.x0 + 0.5, y: s.y1 - 0.5 },
      { n: 't_statue', x: s.x1 - 0.5, y: s.y1 - 0.5, flip: true }, { n: 't_brazier', x: s.x0 + 0.5, y: s.y0 + 2.6 }, { n: 't_brazier2', x: s.x0 + 2.8, y: s.y0 + 0.5 },
      { n: 't_maptable', x: s.x0 + 3.4, y: s.y0 + 3.6 }, { n: 't_chest', x: s.x1 - 0.6, y: s.y0 + 2.6 }, { n: 't_candel', x: s.x1 - 0.5, y: s.y0 + 4.2 }] },
  // World 2, the feasting hall (Пиршественный зал): warm stone and wood, slate menu in runes, long feast tables, a big stew cauldron
  CANT_W2: { w2: true, dir: 'assets/parts/feast/', wallTiles: 4, floorTiles: 3, board: 'menu', isoOnly: true, iso: true,
    decor: ['window', 'pots', 'plates', 'dried_herbs', 'clock'], back: [], side: [], front: [], rug: '',
    h: { counter: 44, table: 27, stove: 42, barrels: 36, bread: 22, cauldron: 32, herb_pot: 28 },
    extras: (s) => THEMES.CANT.extras(s) },
  // World 2, the gem shop (Самоцветная лавка): teal stone with gold trim, a glass cabinet of amulets, a carved counter with scales
  SHOP_W2: { w2: true, dir: 'assets/parts/gemshop/', wallTiles: 4, floorTiles: 3, board: 'jar_shelf', isoOnly: true, iso: true,
    decor: ['window', 'toy_rack', 'owl_clock', 'cabinet', 'map'], back: [], side: [], front: [], rug: '', h: { berry_plant: 36, counter: 66, toy_table: 34, quill_barrel: 32, candy_stand: 34, book_crate: 26, floss_cauldron: 30 },
    extras: (s) => THEMES.SHOP.extras(s) },
  runes: { w2: true, dir: 'assets/parts/runes/', wallTiles: 4, floorTiles: 3, board: 'board', isoOnly: true, iso: true,
    decor: ['torch', 'shield', 'banner', 'niche', 'plaque'], back: ['brazier', 'brazier'], side: ['bookcase', 'runestone'], front: [], rug: '',
    stations: ['st_blue', 'st_teal', 'st_violet'], teacherProp: 'rune_altar', h: { bookcase: 50, brazier: 36, runestone: 30, rune_altar: 40, st_blue: 24, st_teal: 24, st_violet: 24 } },
  herbs: { dir: 'assets/parts/herbs/', wallTiles: 4, floorTiles: 3, board: 'board',
    decor: ['bigwin', 'clock', 'bigwin'], iso: true, back: ['plant', 'lavender'], side: ['bookcase', 'table'], front: ['magic_pot', 'basket', 'barrel'], rug: 'rug' },
  // Potions (her wish 2026-11-21: no school board, students brew at their own cauldrons instead of sitting at desks)
  potions: { dir: 'assets/parts/potions/', wallTiles: 4, floorTiles: 3, board: 'poster', isoOnly: true, iso: true,
    decor: ['potwin', 'potwin'], back: ['barrel', ''], side: ['bookcase', 'table'], front: [], rug: '',
    stations: ['station_pink', 'station_green', 'station_purple'] },
  // Astronomy (her choice 2026-11-21: night observatory, a small telescope per student, big brass telescope + orrery, star chart instead of a board)
  stars: { dir: 'assets/parts/stars/', wallTiles: 4, floorTiles: 3, board: 'chart', isoOnly: true, iso: true,
    decor: ['stwin', 'clock', 'stwin'], back: ['', ''], side: ['', 'table'], front: [], rug: 'rug',   // no old shelf with the ball beside the big telescope
    stations: ['st_desk'], h: { table: 24, bookcase: 36, st_desk: 40 } },
  // Charms (her choice 2026-11-21: lecterns with wands and floating spellbooks)
  charms: { dir: 'assets/parts/charms/', wallTiles: 4, floorTiles: 3, board: 'circle', isoOnly: true, iso: true,
    decor: ['chwin', 'chportrait'], back: ['', ''], side: ['', 'table'], front: [], rug: 'rug',
    stations: ['lectb_lilac', 'lectb_pink', 'lectb_mint'], teacherProp: 'big_book', h: { table: 26, bookcase: 36 }, facing: 'front' },   // her idea: students face us, the teacher stands at the front
  // Flight (her choice 2026-11-21: students sit on little clouds)
  flight: { dir: 'assets/parts/flight/', wallTiles: 4, floorTiles: 3, board: 'flopen', isoOnly: true, iso: true,
    decor: ['flwin', 'chportrait', 'wing_poster', 'chportrait'], back: ['', ''], side: ['', 'table'], front: [], rug: 'rug',
    stations: ['cloud_white', 'cloud_pink', 'cloud_lilac'], teacherProp: 'perch', h: { table: 24, bookcase: 36 }, sitOn: true },
  // Elements (her choice 2026-11-21: a pedestal with a crystal of one of the four elements per student)
  elements: { dir: 'assets/parts/elements/', wallTiles: 2, floorTiles: 3, board: 'el_painting', isoOnly: true, iso: true,
    decor: [], back: ['', ''], side: ['', ''], front: [], rug: 'rug',
    bays: { w: 2, y0: ['el_med_earth', 'el_med_air', 'el_painting', 'el_win_b'], x0: ['el_med_water', 'el_win_a', 'el_med_fire', 'el_win_b', ''] },   // one arch of the arcade = 2 tiles; what hangs in each arch, from the corner out
    stations: ['cr_fire', 'cr_water', 'cr_earth', 'cr_air'], h: { bookcase: 36 } },
  // Final exam (her choice 2026-11-21: a festive hall, single exam desks with scrolls, the examiners' table with an hourglass)
  final: { dir: 'assets/parts/final/', wallTiles: 4, floorTiles: 6, board: 'banner', isoOnly: true, iso: true,
    decor: ['window', 'sconce', 'diploma', 'clock', 'round_window', 'sconce'], back: ['candelabra', 'laurel'], side: ['trophy', ''], front: [], rug: 'rug', rugFlip: true, rugScale: 1.6,
    stations: ['exdesk_a', 'exdesk_b', 'exdesk_c'], teacherProp: 'commission' },
  // Reception (her choice 2026-11-21: the same look as the old picture, built from parts). The counter stands where the painted one was
  // (tiles blocked by recBlocked), a pink runner leads from the street entrance to the back passage.
  REC: { dir: 'assets/parts/reception/', wallTiles: 8, floorTiles: 3, board: 'map', isoOnly: true, iso: true, arrival: true, capCol: '#efe5d3', skirtCol: '#cbb68f',   /* redesign 2026-11-25: the Arrival Hall */
    decor: [], back: [], side: [], front: [], rug: '', runner: { u0: 4.2, u1: 5.8, color: '#7f9fd4', edge: '#d8b25c' },
    h: { rc_counter: 52, rc_archive: 80, rc_files: 54, rc_bench: 40, rc_tree: 46, rc_umbrellas: 34, rc_lamp: 50, rc_vase: 30, rc_trunks: 34, rc_teatable: 34, rc_board: 42, rc_clock: 19 },
    extras: (s) => [{ n: 'rc_counter', x: s.x0 + 1.75, y: s.y0 + 3.9 }, { n: 'rc_archive', x: s.x0 + 0.32, y: s.y0 + 1.55 }, { n: 'rc_board', x: s.x0 + 1.3, y: s.y0 + 0.08, lift: WALLH * 0.95 * 0.26 }, { n: 'rc_clock', x: s.x0 + 1.3, y: s.y0 + 0.06, lift: WALLH * 0.95 * 0.66 },
      { n: 'rc_files', x: s.x0 + 0.32, y: s.y0 + 5.7 }, { n: 'rc_bench', x: s.x0 + 0.4, y: s.y0 + 7.3 }, { n: 'rc_tree', x: s.x0 + 0.6, y: s.y1 - 0.55 }, { n: 'rc_umbrellas', x: s.x0 + 3.3, y: s.y1 - 0.45 },
      { n: 'rc_tree', x: s.x0 + 6.75, y: s.y1 - 0.55 }, { n: 'rc_lamp', x: s.x0 + 2.4, y: s.y0 + 0.4 }, { n: 'rc_vase', x: s.x0 + 7.6, y: s.y0 + 0.4 }, { n: 'rc_trunks', x: s.x1 - 0.6, y: s.y1 - 0.9 },
      { n: 'rc_teatable', x: s.x1 - 0.65, y: s.y0 + 6.0 }] },
  // Dorms (her choice 2026-11-21: small beds with blankets; the sleeper lies on its bed)
  DORM: { dir: 'assets/parts/dorm/', wallTiles: 4, floorTiles: 3, board: 'garland', isoOnly: true, iso: true,
    decor: ['window', 'shelf', 'painting', 'moon_clock', 'round_window'], back: [], side: [], front: [], rug: 'rug', beds: ['bed_pink', 'bed_mint', 'bed_lilac'], load: ['conc_desk'],
    extras: (s) => [{ n: 'nightstand', x: s.x0 + 0.5, y: s.y0 + 3.6 }, { n: 'toy_chest', x: s.x0 + 0.55, y: s.y1 - 0.6 }] },
  DORM2: { dir: 'assets/parts/dorm/', wallTiles: 4, floorTiles: 3, board: 'garland', isoOnly: true, iso: true,
    decor: ['round_window', 'painting', 'shelf', 'window', 'moon_clock'], back: [], side: [], front: [], rug: 'rug', beds: ['bed_lilac', 'bed_pink', 'bed_mint'],
    extras: (s) => [{ n: 'plant', x: s.x1 - 0.45, y: s.y1 - 0.5 }, { n: 'toy_chest', x: s.x0 + 0.5, y: s.y1 - 0.6 }] },
  // The curiosity shop (her choice 2026-11-21: «ближе ко второму варианту» — magic curiosities, not a canteen)
  SHOP: { dir: 'assets/parts/shop/', wallTiles: 4, floorTiles: 3, board: 'jar_shelf', isoOnly: true, iso: true,
    decor: ['window', 'toy_rack', 'owl_clock', 'cabinet', 'map'], back: [], side: [], front: [], rug: 'rug', h: { berry_plant: 42, counter: 70 },
    extras: (s) => [{ n: 'counter', x: s.x0 + 1.5, y: s.y0 + 2.6 }, { n: 'toy_table', x: s.x0 + 4.2, y: s.y0 + 3.6 }, { n: 'quill_barrel', x: s.x1 - 0.5, y: s.y0 + 0.6 },
      { n: 'candy_stand', x: s.x1 - 0.6, y: s.y0 + 2.2 }, { n: 'book_crate', x: s.x0 + 0.6, y: s.y1 - 0.6 }, { n: 'berry_plant', x: s.x1 - 0.5, y: s.y1 - 0.5 }, { n: 'floss_cauldron', x: s.x0 + 3.2, y: s.y1 - 0.7 }] },
  // Director's office (Ruslan's idea 2026-11-21): the director sits behind a big desk
  DIR: { dir: 'assets/parts/director/', wallTiles: 4, floorTiles: 3, board: 'portrait', isoOnly: true, iso: true,
    decor: ['window', 'certificates', 'clock', 'shelf', 'banner'], back: [], side: [], front: [], rug: 'rug', h: { bookcase: 48 },
    extras: (s) => [{ n: 'desk', x: s.x0 + 2.6, y: s.y0 + 2.4 }, { n: 'armchair', x: s.x0 + 4.4, y: s.y0 + 4.2 }, { n: 'globe', x: s.x1 - 0.55, y: s.y0 + 0.6 },
      { n: 'bookcase', x: s.x0 + 0.45, y: s.y0 + 1.0 }, { n: 'palm', x: s.x0 + 0.5, y: s.y1 - 0.5 }, { n: 'tea_table', x: s.x0 + 3.2, y: s.y1 - 1.1 }, { n: 'cabinet', x: s.x1 - 0.5, y: s.y1 - 0.6 }] },
  // Masters' tower (2026-11-22): indigo star stone, marble floor with gold stars, four element crystals on pedestals, a velvet sofa in the middle
  // World 2, Чертог Хранителей: dark granite with gold veins, four keeper altars in the corners, a stone hearth in the middle
  TOWER_W2: { w2: true, dir: 'assets/parts/keepers/', wallTiles: 4, floorTiles: 3, board: 'kp_relief', isoOnly: true, iso: true,
    decor: ['kp_fire', 'kp_sconce', 'kp_banner', 'kp_window', 'kp_deep'], back: [], side: [], front: [], rug: '',
    h: { hearth: 46, kchair: 60, anvil: 52, basin: 46, obelisk: 84, bellows: 52, lectern: 52, mushpot: 50 },
    extras: (s) => [{ n: 'anvil', x: s.x0 + 0.8, y: s.y0 + 0.8 }, { n: 'basin', x: s.x1 - 0.8, y: s.y0 + 0.8 }, { n: 'obelisk', x: s.x0 + 0.8, y: s.y1 - 0.8 }, { n: 'bellows', x: s.x1 - 0.8, y: s.y1 - 0.8 },
      { n: 'hearth', x: s.x0 + 3.5, y: s.y0 + 3.5 }, { n: 'kchair', x: s.x1 - 1.0, y: s.y0 + 3.5 }, { n: 'lectern', x: s.x0 + 1.0, y: s.y0 + 2.0 }, { n: 'mushpot', x: s.x0 + 2.4, y: s.y0 + 0.7 }, { n: 'mushpot', x: s.x1 - 0.8, y: s.y1 - 2.4 }] },
  TOWER: { dir: 'assets/parts/tower/', wallTiles: 4, floorTiles: 3, board: 'masters_art', isoOnly: true, iso: true,
    decor: ['stained', 'sconce', 'window', 'trophies', 'banner'], back: [], side: [], front: [], rug: '',
    extras: (s) => [{ n: 'fire_ped', x: s.x0 + 0.7, y: s.y0 + 0.7 }, { n: 'water_ped', x: s.x1 - 0.7, y: s.y0 + 0.7 }, { n: 'earth_ped', x: s.x0 + 0.7, y: s.y1 - 0.7 }, { n: 'air_ped', x: s.x1 - 0.7, y: s.y1 - 0.7 },
      { n: 'sofa', x: s.x0 + 3, y: s.y0 + 3 }, { n: 'gold_chair', x: s.x0 + 3, y: s.y0 + 0.8 }, { n: 'lectern', x: s.x0 + 0.8, y: s.y0 + 3 }, { n: 'moon_plant', x: s.x1 - 0.6, y: s.y0 + 3 }] },
  // Canteen (2026-11-22): peach tiles over a honey wainscot, terracotta floor; counter with the soup pot, tables with checkered cloths
  CANT: { dir: 'assets/parts/canteen/', wallTiles: 4, floorTiles: 3, board: 'menu', isoOnly: true, iso: true,
    decor: ['window', 'pots', 'plates', 'dried_herbs', 'clock'], back: [], side: [], front: [], rug: '',
    h: { counter: 44, table: 27, stove: 42, barrels: 36, bread: 22, cauldron: 30, herb_pot: 30 },
    extras: (s) => [{ n: 'counter', x: s.x0 + 4.2, y: s.y0 + 1.35, flip: true }, { n: 'stove', x: s.x0 + 5.45, y: s.y0 + 0.5 }, { n: 'barrels', x: s.x0 + 0.55, y: s.y0 + 0.6 },
      { n: 'bread', x: s.x0 + 5.5, y: s.y0 + 2.05 }, { n: 'cauldron', x: s.x0 + 5.4, y: s.y1 - 0.55 }, { n: 'herb_pot', x: s.x0 + 0.5, y: s.y1 - 0.5 },
      ...CANT_TABLES(s).slice(0, S && S.cant ? cantTables() : 6).map((t) => ({ n: 'table', x: t.x, y: t.y - 0.02, flip: true }))] },
  // Library (her choice 2026-11-21: a cozy reading room, students read in soft armchair-poufs)
  LIB: { dir: 'assets/parts/library/', wallTiles: 4, floorTiles: 3, board: 'bookshelf', isoOnly: true, iso: true,
    decor: ['window', 'flying_books', 'bookshelf2', 'candles', 'map'], back: [], side: [], front: [], rug: 'rug',   // v2 (her «очень скучные цвета»): emerald walls, bright poufs
    seats: ['pouf_pink', 'pouf_green', 'pouf_lilac'], h: { plant: 44 },
    extras: (s) => [{ n: 'globe', x: s.x0 + 0.5, y: s.y0 + 0.5 }, { n: 'book_pile', x: s.x1 - 0.6, y: s.y0 + 0.6 }, { n: 'lib_desk', x: s.x0 + 3, y: s.y1 - 0.45 }, { n: 'plant', x: s.x0 + 0.5, y: s.y1 - 0.5 }] },
};
// wall decor: width in tiles along the wall, bottom edge as a share of the wall height
const DECOR = { kp_relief: { w: 2.5, lo: 0.08, deep: 1.0 }, kp_fire: { w: 1.0, lo: 0.03, deep: 1.0 }, kp_deep: { w: 1.0, lo: 0.03, deep: 1.0 }, kp_sconce: { w: 0.4, lo: 0.45, deep: 1.2 }, kp_banner: { w: 0.7, lo: 0.25, deep: 0.5 }, kp_window: { w: 0.75, lo: 0.3, deep: 0.8 }, crownrelief: { w: 2.0, lo: 0.05, deep: 1.0 }, crownbanner: { w: 0.5, lo: 0.25, deep: 0.5 }, tshield: { w: 0.6, lo: 0.35, deep: 0.8 }, tbrazier: { w: 0.45, lo: 0.45, deep: 1.2 }, crownniche: { w: 0.6, lo: 0.3, deep: 1.0 }, taxes: { w: 0.7, lo: 0.35, deep: 0.8 }, bigshelf: { w: 1.6, lo: 0.0, deep: 1.2 }, ambwin: { w: 0.6, lo: 0.3, deep: 0.6 }, scrollcase: { w: 0.6, lo: 0.0, deep: 1.2 }, kingtree: { w: 0.8, lo: 0.25, deep: 0.6 }, hanglamps: { w: 0.8, lo: 0.4, deep: 1.0 }, kmap2: { w: 0.9, lo: 0.35, deep: 0.5 }, hookboard: { w: 1.8, lo: 0.3, deep: 0.8 }, roundwin: { w: 0.7, lo: 0.3, deep: 0.8 }, cshelf: { w: 0.9, lo: 0.4, deep: 1.0 }, embroid: { w: 0.6, lo: 0.3, deep: 0.5 }, moondial: { w: 0.6, lo: 0.35, deep: 0.8 }, clamp: { w: 0.35, lo: 0.45, deep: 1.0 }, kmap: { w: 1.8, lo: 0.1, deep: 1.0 }, slit: { w: 0.4, lo: 0.25, deep: 0.6 }, gnotice: { w: 0.8, lo: 0.35, deep: 0.6 }, runeclock: { w: 0.6, lo: 0.4, deep: 0.8 }, glamp: { w: 0.4, lo: 0.45, deep: 1.2 }, ledgers: { w: 0.9, lo: 0.4, deep: 1.0 }, kingrelief: { w: 2.6, lo: 0.0, deep: 1.0 }, oathbanner: { w: 0.7, lo: 0.25, deep: 0.5 }, goldcandle: { w: 0.45, lo: 0.4, deep: 1.0 }, names: { w: 1.1, lo: 0.4, deep: 0.5 }, wallgong: { w: 0.7, lo: 0.3, deep: 1.0 }, goldhammers: { w: 0.7, lo: 0.35, deep: 0.8 }, lakearch: { w: 2.0, lo: 0.0, deep: 1.0 }, net: { w: 1.0, lo: 0.25, deep: 0.6 }, oars: { w: 0.6, lo: 0.3, deep: 0.8 }, bluelamp: { w: 0.35, lo: 0.4, deep: 1.0 }, lakemap: { w: 0.9, lo: 0.4, deep: 0.5 }, fishstring: { w: 0.35, lo: 0.3, deep: 0.8 }, gbanner: { w: 2.0, lo: 0.05, deep: 1.0 }, shields: { w: 1.2, lo: 0.3, deep: 0.8 }, gtorch: { w: 0.4, lo: 0.45, deep: 1.2 }, axes: { w: 0.9, lo: 0.3, deep: 0.8 }, helm: { w: 0.5, lo: 0.35, deep: 1.0 }, warhorn: { w: 0.8, lo: 0.35, deep: 0.8 }, gcab: { w: 2.0, lo: 0.05, deep: 1.0 }, cuts: { w: 0.8, lo: 0.3, deep: 0.5 }, gsconce: { w: 0.45, lo: 0.45, deep: 1.2 }, gtap: { w: 0.8, lo: 0.3, deep: 0.5 }, gcrys: { w: 0.5, lo: 0.35, deep: 1.0 }, hearth: { w: 2.1, lo: 0.0, deep: 1.2 }, tongs: { w: 0.9, lo: 0.35, deep: 0.8 }, chain: { w: 0.4, lo: 0.3, deep: 0.8 }, tunnel: { w: 2.4, lo: 0.0, deep: 1.0 }, rack: { w: 1.0, lo: 0.35, deep: 1.0 }, sign: { w: 0.7, lo: 0.4, deep: 0.6 }, rope: { w: 0.45, lo: 0.3, deep: 1.0 }, shield: { w: 0.8, lo: 0.4, deep: 0.8 }, niche: { w: 0.8, lo: 0.25, deep: 1.0 }, plaque: { w: 0.75, lo: 0.35, deep: 0.8 }, menu: { w: 0.8, lo: 0.3, deep: 0.8 }, plates: { w: 1.1, lo: 0.35, deep: 1.4 }, pots: { w: 1.1, lo: 0.4, deep: 1.2 }, dried_herbs: { w: 0.8, lo: 0.35, deep: 1.2 }, stained: { w: 0.95, lo: 0.3, deep: 0.6 }, masters_art: { w: 1.4, lo: 0.32, deep: 0.7 }, trophies: { w: 1.3, lo: 0.4, deep: 1.4 }, jar_shelf: { w: 1.1, lo: 0.25, deep: 1.3 }, toy_rack: { w: 1.2, lo: 0.4, deep: 1.4 }, owl_clock: { w: 0.7, lo: 0.45, deep: 1.2 }, flying_books: { w: 1.4, lo: 0.55, deep: 1.6 }, candles: { w: 0.9, lo: 0.55, deep: 1.6 }, portrait: { w: 1.2, lo: 0.3, deep: 0.7 }, certificates: { w: 1.3, lo: 0.4, deep: 0.6 }, notice: { w: 0.9, lo: 0.4, deep: 0.8 }, lantern: { w: 0.5, lo: 0.5, deep: 1.4 }, garland: { w: 2.6, lo: 0.62, deep: 0.5 }, moon_clock: { w: 0.8, lo: 0.5, deep: 1 }, bookshelf: { w: 1.4, lo: 0.0, deep: 1.2 }, bookshelf2: { w: 1.3, lo: 0.0, deep: 1.2 }, lamp: { w: 0.5, lo: 0.5, deep: 1.2 }, map: { w: 1.1, lo: 0.35, deep: 0.6 }, banner: { w: 1.0, lo: 0.28, deep: 0.7 }, sconce: { w: 0.6, lo: 0.45, deep: 1.4 }, diploma: { w: 0.8, lo: 0.4, deep: 0.6 }, el_poster: { w: 1.5, lo: 0.3, deep: 0.6 }, torch: { w: 0.6, lo: 0.45, deep: 1.5 }, planter: { w: 1.2, lo: 0.4, deep: 1.4 }, wing_poster: { w: 1.7, lo: 0.3, deep: 0.6 }, birds: { w: 1.4, lo: 0.4, deep: 1.2 }, circle: { w: 1.7, lo: 0.3, deep: 0.8 }, mirror: { w: 0.8, lo: 0.35, deep: 0.8 }, wand_rack: { w: 1.3, lo: 0.35, deep: 1.4 }, chart: { w: 1.9, lo: 0.28, deep: 0.6 }, painting: { w: 0.9, lo: 0.45, deep: 0.8 }, poster: { w: 1.9, lo: 0.28, deep: 0.6 }, round_window: { w: 1.0, lo: 0.42, deep: 0.6 }, cabinet: { w: 1.2, lo: 0.32, deep: 1.5 }, board: { w: 2.6, lo: 0.3, deep: 0.8 }, window: { w: 0.95, lo: 0.3, deep: 0.6 }, window2: { w: 0.95, lo: 0.3, deep: 0.6 }, shelf: { w: 1.7, lo: 0.45, deep: 2.2 }, herbs_rack: { w: 1.5, lo: 0.36, deep: 2 }, clock: { w: 0.9, lo: 0.5, deep: 1.2 } };
// floor props: height in world px (a creature is 30)
const PROP_H = { fire_ped: 42, water_ped: 42, earth_ped: 42, air_ped: 42, sofa: 22, gold_chair: 30, lectern: 32, moon_plant: 40, toy_table: 34, quill_barrel: 34, candy_stand: 32, book_crate: 26, floss_cauldron: 30, desk: 50, armchair: 30, palm: 44, tea_table: 22, cabinet: 34, counter: 82, bench_l: 32, bench_r: 32, signpost: 36, coat_rack: 42, bed_pink: 27, bed_mint: 27, bed_lilac: 27, conc_desk: 38, nightstand: 20, toy_chest: 20, pouf_pink: 20, pouf_green: 20, pouf_lilac: 20, lib_desk: 30, globe: 34, book_pile: 28, exdesk_a: 24, exdesk_b: 24, exdesk_c: 24, commission: 30, candelabra: 44, laurel: 42, trophy: 26, cr_fire: 30, cr_water: 30, cr_earth: 30, cr_air: 30, altar: 42, fountain: 30, lectb_lilac: 25, lectb_pink: 25, lectb_mint: 25, cloud_white: 17, cloud_pink: 17, cloud_lilac: 17, perch: 50, tree: 46, lect_lilac: 36, lect_pink: 36, lect_mint: 36, big_book: 52, crystal_ball: 26, tel_gold: 32, tel_silver: 32, tel_rose: 32, big_telescope: 46, orrery: 38, station_pink: 42, station_green: 42, station_purple: 42, big_cauldron: 40, plant: 46, lavender: 30, magic_pot: 27, barrel: 34, basket: 24, table: 34, bookcase: 40 };
if (WORLD === 1 && (window.__EDIT)) { Object.assign(THEMES.DORM, { moon: 1, h: { dm_nest_canopy: 74, dm_moth_lamp: 50, dm_mushrooms: 20, dm_table: 22 }, load: ['conc_desk', 'dm_nest_canopy', 'dm_moth_lamp', 'dm_mushrooms', 'dm_table'], extras: (s) => [{ n: 'dm_moth_lamp', x: s.x0 + 3.5, y: s.y0 + 0.45 }, { n: 'dm_mushrooms', x: s.x1 - 0.4, y: s.y0 + 0.45 }, { n: 'dm_table', x: s.x1 - 0.5, y: s.y1 - 0.6 }, { n: 'dm_mushrooms', x: s.x0 + 0.45, y: s.y1 - 0.5 }, { n: 'dm_moth_lamp', x: s.x1 - 0.45, y: (s.y0 + s.y1) / 2 }] }); Object.assign(THEMES.DORM2, { moon: 1, h: { dm_nest_canopy: 74, dm_moth_lamp: 50, dm_mushrooms: 20, dm_table: 22 }, load: ['dm_nest_canopy', 'dm_moth_lamp', 'dm_mushrooms', 'dm_table'], extras: (s) => [{ n: 'dm_moth_lamp', x: s.x0 + 3.5, y: s.y0 + 0.45 }, { n: 'dm_mushrooms', x: s.x1 - 0.4, y: s.y0 + 0.45 }, { n: 'dm_table', x: s.x1 - 0.5, y: s.y1 - 0.6 }, { n: 'dm_mushrooms', x: s.x0 + 0.45, y: s.y1 - 0.5 }, { n: 'dm_moth_lamp', x: s.x1 - 0.45, y: (s.y0 + s.y1) / 2 }] }); }   /* the Moon dorms: their own furniture */
const parts = {};
let partsVer = 0;   // bumped on every part load: themeReady() answers from its cache until then
for (const [k, t] of Object.entries(THEMES)) if (!!t.w2 === (WORLD === 2)) for (const n of new Set(['wall', 'floor', t.rug, ...(t.isoOnly ? [] : [t.board, ...t.decor]), ...t.back, ...t.side, ...t.front, ...(t.stations || []), ...(t.seats || []), ...(t.beds || []), ...(t.load || []), ...(t.extras ? t.extras({ x0: 0, y0: 0, x1: 0, y1: 0 }).map((o) => o.n) : []), ...(t.teacherProp ? [t.teacherProp] : []), ...(t.iso && !t.bays ? [t.board, ...t.decor].map((d) => 'iso_' + d) : [])])) {
  if (!n) continue; const im = new Image(); im.onload = () => { partsVer++; }; im.src = `${t.dir}${n}.webp?v=${n === 'rc_umbrellas' ? 2203 : 2202}`; parts[k + '/' + n] = im;
}
for (const [n, f] of [['wall', 'el_arcade'], ['floor', 'el_floor'], ...['el_med_fire', 'el_med_water', 'el_med_earth', 'el_med_air', 'el_win_a', 'el_win_b', 'el_painting'].map((q) => [q, q])]) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/${f}.webp?v=3`; if (WORLD === 1) parts['elements/' + n] = im; }   // Elements: the concept's arcade wall and what hangs in its arches
for (const n of ['wall', 'floor']) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/fl_${n}.webp?v=1`; if (WORLD === 1) parts['flight/' + n] = im; }   // Flight redesign
for (const n of ['wall', 'floor']) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/ch_${n}.webp?v=1`; if (WORLD === 1) parts['charms/' + n] = im; }
if (WORLD === 1) Object.assign(THEMES.final, { decor: [], back: ['', ''], side: ['', ''], teacherProp: '', bays: { w: 2.4, y0: ['exwin', 'exboard', 'exwin', 'exboard', 'exwin', 'exboard', 'exwin'], x0: [] } });   /* exam hall redesign (live since her OK 2026-11-25) */
for (const [n, f] of [['wall', 'ex_wall'], ['floor', 'ex_floor'], ['iso_exwin', 'ex_window_day'], ['exboard', 'ex_board']]) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/${f}.webp?v=1`; if (WORLD === 1) parts['final/' + n] = im; }   // Final exam hall redesign   // Charms redesign
for (const n of ['wall', 'floor']) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/st_${n}.webp?v=1`; if (WORLD === 1) parts['stars/' + n] = im; }   // Stargazing redesign
for (const [n, f] of [['wall', 'rc_wall'], ['floor', 'rc_floor'], ['rc_arch', 'rc_arch'], ['rc_win', 'rc_win'], ['rc_star', 'rc_star'], ['rc_plane', 'rc_plane']]) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/reception/${f}.webp?v=1`; if (WORLD === 1) parts['REC/' + n] = im; }   /* the Arrival Hall (reception redesign) */
for (const n of ['wall', 'floor']) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/pot_${n}.webp?v=1`; if (WORLD === 1) parts['potions/' + n] = im; }   // Potions redesign
for (const n of ['wall', 'floor']) { const im = new Image(); im.onload = () => { partsVer++; staticKey = ''; }; im.src = `assets/parts/items/herbs_${n}.webp?v=1`; if (WORLD === 1) parts['herbs/' + n] = im; }
const part = (th, n) => { const im = parts[th + '/' + n]; return im && im.complete && im.naturalWidth ? im : null; };
const THEMES_OFF = new Set();   // parts still being drawn: keep the painted pictures until they are in
const themeOf = (id) => { if (WORLD > 2 || !id || THEMES_OFF.has(id)) return null; const ci = CLASS_SLOT.indexOf(id); const key = ci >= 0 ? (WORLD === 2 && CLASSES[ci].final ? 'oath' : CLASSES[ci].id) : WORLD === 2 && THEMES[id + '_W2'] ? id + '_W2' : id; return THEMES[key] && !!THEMES[key].w2 === (WORLD === 2) ? key : null; };   // each world uses only its own themes (world 2 'final' must not take the world-1 exam hall)
const dormSize = (k) => (S && S.dormUp && S.dormUp['size' + k]) || 1;      // 1..3, like class sizes
const dormDepth = (k) => ROOM + 2 * (dormSize(k) - 1);
const dormRows = (k) => 4 + 2 * (dormSize(k) - 1);                          // 4 beds per row: 16, 24, 32 per room
const DORM_STRIDE = 32;                                                     // bed index: room 1 = 0..31, room 2 = 32..63
// World 2 «Чертоги под горой» (her plan approved 2026-11-22, design/w2_plan_v1.png): one wide pillared great hall (the nave)
// runs from the gate hall deep into the mountain; class pairs open on both sides of it (left rooms: door in their front-right
// knee wall, right rooms: their back-left wall toward the nave is low and has the door); rows are 5 tiles of cave apart
// (more than a tall wall hides); the oath hall closes the nave, the hall of glory (graduates leave) is left of it;
// the front block (library | gate hall | dorms) keeps world 1's relative geometry, so all queues and staff spots still fit.
const NAVE_X0 = 13, NAVE_X1 = 20, ROW_GAP = 5;
function genLayoutW2() {
  const rows = Math.ceil(NCLS / 2);
  let y = 0;
  SLOTS.EXAM = slot(8, y, [[16, y + 5], [16, y + 6]], {}, 17, 6, [[[17, y + 5], [17, y + 6]]]);
  SLOTS.GARDEN = slot(2, y, [[8, y + 3], [7, y + 3]], {}, 6, 6);
  SLOTS.DIR = slot(25, y, [[25, y + 3], [24, y + 3]], {}, 6, 6);   // world 2: the elder's throne hall right of the oath hall
  y += 6;
  const naveTop = y; y += ROW_GAP - 1;
  let firstGap = null;
  for (let r = rows - 1; r >= 0; r--) {
    const li = 2 * r, ri = 2 * r + 1;
    const d = Math.max(depthOf(li), ri < NCLS ? depthOf(ri) : ROOM);
    const h1 = depthOf(li), y1 = y + d - h1, ym = y1 + Math.floor(h1 / 2);
    SLOTS['C' + li] = slot(NAVE_X0 - ROOM, y1, [[NAVE_X0 - 1, ym], [NAVE_X0, ym]], {}, ROOM, h1);
    if (ri < NCLS) { const h2 = depthOf(ri), y2 = y + d - h2, ym2 = y2 + Math.floor(h2 / 2); SLOTS['C' + ri] = slot(NAVE_X1, y2, [[NAVE_X1, ym2], [NAVE_X1 - 1, ym2]], {}, ROOM, h2, [[[NAVE_X1, ym2 + 1], [NAVE_X1 - 1, ym2 + 1]]]); }
    y += d; if (!firstGap) firstGap = [y, y + ROW_GAP]; y += ROW_GAP;
  }
  const recY = y;
  PATHS = [];
  SLOTS.LIB = slot(0, recY, [[5, recY + 3], [6, recY + 3]], {}, 6, 8, [[[5, recY + 4], [6, recY + 4]]]);
  SLOTS.REC = slot(12, recY, [[15, recY], [15, recY - 1]], {}, 9, 9,
    [[[16, recY], [16, recY - 1]], [[17, recY], [17, recY - 1]], [[16, recY + 8], [16, recY + 9]], [[17, recY + 8], [17, recY + 9]], [[20, recY], [21, recY]]]);
  SLOTS.DORM = slot(21, recY, [[21, recY], [20, recY]], {}, ROOM, dormDepth(1));
  SLOTS.DORM2 = slot(27, recY, [[27, recY + 3], [26, recY + 3]], {}, ROOM, dormDepth(2));
  BUILDING = { x0: 0, y0: naveTop, x1: 33, y1: recY + 8 };
  HALLS = [
    { x0: NAVE_X0, y0: naveTop, x1: NAVE_X1, y1: recY },          // the great hall
    { x0: 6, y0: recY - 2, x1: NAVE_X0, y1: recY },               // passage from the great hall to the reading court
    { x0: 6, y0: recY, x1: 12, y1: recY + 8 },                     // reading court in front of the library
    { x0: 15, y0: recY + 9, x1: 19, y1: recY + 14 },              // path from the gate
  ];
  SLOTS.TRADE = slot(8, recY + 9, [[13, recY + 11], [14, recY + 11]], {}, 6, 5);   // the trading yard: an open cobbled yard left of the gate road
  HALLS.push({ x0: 14, y0: recY + 10, x1: 15, y1: recY + 13 });
  { const rb = recY - ROW_GAP;   // the gem shop left of the bottom-left hall, a road down to the reading court
    SLOTS.SHOP = slot(0, recY + 13, [[4, recY + 13], [4, recY + 12]], {}, 6, 6, [[[5, recY + 13], [5, recY + 12]]]);   // front-left, in the open
    PATHS.push({ x0: 3, y0: recY + 8, x1: 8, y1: recY + 13 }); }
  { const r0 = Math.min(SLOTS.C0.y0, SLOTS.C1 ? SLOTS.C1.y0 : SLOTS.C0.y0);   // the feasting hall right of the bottom row, a road from the great hall
    PATHS.push({ x0: NAVE_X1, y0: r0 - 5, x1: 33, y1: r0 - 3 }, { x0: 30, y0: r0 - 3, x1: 32, y1: r0 });
    SLOTS.CANT = slot(28, r0, [[30, r0], [30, r0 - 1]], {}, 6, 6, [[[31, r0], [31, r0 - 1]]]);
    PATHS.push({ x0: 33, y0: r0 - 3, x1: 39, y1: r0 - 1 });   // the road runs on past the feasting hall to the Keepers' hall
    SLOTS.TOWER = slot(39, r0 - 6, [[39, r0 - 3], [38, r0 - 3]], {}, 7, 7, [[[39, r0 - 2], [38, r0 - 2]]]); }   // Чертог Хранителей: open ground, 5 tiles from the gates of the deep and the feasting hall, nothing tall in front
  { const m = SLOTS.C3 || SLOTS.C1; if (m) SLOTS.EXPED = slot(28, m.y0, [[28, m.y0 + 3], [27, m.y0 + 3]], {}, 6, 6); }   // the gates of the deep: an open yard right of the middle row   // a short way from the gate road into the yard
  GATE_TILE = { x: 16.5, y: recY + 12.5 };
  GATE_Y = recY + 9;
  { const L5 = SLOTS.C5; LAKE = L5 ? { cx: L5.x1 + 6, cy: (L5.y0 + L5.y1) / 2 - 1, rx: 4.0, ry: 4.8 } : null; }   // the underground lake (plan item)
  GH = recY + 21; GW = 50;
}
// World 1 layout «двор с фонтаном» (her pick 2026-11-22, design/layout_C_court.png): the rooms stand along the two far edges of the
// school with their tall walls toward the forest, so nothing tall stands in front of the corridors; in the middle a big open court
// (fountain, benches, trees) ringed by the corridor; the front block (library, reception, dorms, shop) faces it with low walls.
//   back row (y = 0): exam hall x0..17, Charms, Flight, Elements, the director's office; the graduates' garden beyond, by a path
//   left column (x = 0): Herbs, Potions, Stars stacked; classes grow deeper into the court
let COURT = null, LAWNS = []; const COURT_LAYOUT = true;
const inCourt = (x, y) => WORLD === 1 && COURT && x >= COURT.x0 && x < COURT.x1 && y >= COURT.y0 && y < COURT.y1;
const courtC = () => ({ x: (COURT.x0 + COURT.x1) / 2, y: (COURT.y0 + COURT.y1) / 2 });
const courtBlocked = (x, y) => { if (!inCourt(x, y)) return false; if (GAL_T && GAL_T.has(x * 1000 + y)) return true; const c = courtC(); return Math.abs(x + 0.5 - c.x) < 1.6 && Math.abs(y + 0.5 - c.y) < 1.6; };   // the fountain   // the open court rectangle (decor and the courtyard life use it)
// ======================= the court colonnade (agreed plan item 2, her pick «2» = columns + garlands, design/gallery_plan_v1.jpg) =======================
// Columns stand on the edge tiles of the court lawn every ~3 tiles, from corner to corner, leaving the cross paths to the fountain
// and the graduates' garden open; garlands hang between neighbouring columns. Column tiles are blocked for walking (no one walks
// through a column). Art: art/parts/gallery/sheet_r0.jpg (SYNTX banana2, 2 tokens) -> assets/parts/outdoor/gal_*.webp.
var GAL, GAL_G, GAL_T;   // var + set only in galLayout: genLayout may run before this line
function galLayout() {
  GAL = []; GAL_G = []; GAL_T = new Set(); if (WORLD !== 1 || !COURT) return;
  const { x0, y0, x1, y1 } = COURT, c = courtC(), G = SLOTS.GARDEN, seen = new Map();
  const pathX = [Math.floor(c.x - 1.7) + 1, Math.ceil(c.x + 0.7) - 1], pathY = [Math.floor(c.y - 1.7) + 1, Math.ceil(c.y + 0.7) - 1];   // tiles with |x + 0.5 - c| < 1.2 (fixed: was one tile off)   // cross path tiles (as drawStatic paints them)
  // segments of one edge between the openings (cross path, the garden's path) and the corners; a column beside an opening carries a lantern
  const segs = (a, b, opens) => { const out = []; let lo = a; for (const [o0, o1] of [...opens].sort((p, q) => p[0] - q[0])) { if (o0 - 1 - lo >= 1) out.push([lo, o0 - 1]); lo = Math.max(lo, o1 + 1); } if (b - lo >= 1) out.push([lo, b]); return out; };
  const side = (fixed, horiz, a, b, opens) => {
    for (const [s0, s1] of segs(a, b, opens)) {
      const n = Math.max(1, Math.round((s1 - s0) / 3)), row = [];
      for (let i = 0; i <= n; i++) { const t = Math.round(s0 + i * (s1 - s0) / n), x = horiz ? t : fixed, y = horiz ? fixed : t, k = x * 1000 + y;
        const corner = (x === x0 || x === x1 - 1) && (y === y0 || y === y1 - 1), byPath = opens.some(([o0, o1]) => t === o0 - 1 || t === o1 + 1);
        let col = seen.get(k); if (!col) { col = { n: corner ? 'gal_urn' : byPath ? 'gal_lamp' : 'gal_rose', x: x + 0.5, y: y + 0.5 }; seen.set(k, col); GAL.push(col); GAL_T.add(k); }
        row.push(col); }
      for (let i = 0; i + 1 < row.length; i++) GAL_G.push([row[i], row[i + 1]]);
    }
  };
  const gPath = G && G.y0 > y0 ? [[G.x0 + 2, G.x0 + 3]] : [];   // the path from the gallery to the garden's arch crosses the back edge
  side(y0, true, G && G.y0 <= y0 ? G.x1 + 1 : x0, x1 - 1, [pathX, ...gPath]);   // back edge
  side(x1 - 1, false, y0, y1 - 1, [pathY]);                                     // right edge
  side(y1 - 1, true, x0, x1 - 1, [pathX]);                                      // front edge
  side(x0, false, G && G.x0 <= x0 + 1 ? G.y1 + 1 : y0, y1 - 1, [pathY]);         // left edge
}
function genLayoutCourt() {
  // Build 241 (her pick «1» of design/layout2_v1.png after the designer review): study goes round the court, 1-2-3 up the left
  // column from the entrance, 4-5-6 along the back row; the exam hall at the back corner between them; the court is smaller and
  // closed on every side: the front row (shop, director, reception, dorms) and a right column (canteen, masters' tower).
  // The exam hall stays a long hall (its desks stand in rows along the left wall, her earlier ruling), so it is not a square.
  const C = (i, ...a) => (SLOTS['C' + i] = slot(...a));
  const GAP = 3, CWD = 8, BAND = 3, CW = 26, CH = 20; LAWNS = [];   // court 26x20 (was ~34x31): a third smaller, closed by buildings
  SLOTS.EXAM = slot(0, 0, [[8, 5], [8, 6]], {}, 17, 6, [[[9, 5], [9, 6]], [[10, 5], [10, 6]], [[11, 5], [11, 6]], [[12, 5], [12, 6]]]);
  const dRow = Math.max(6, ...[3, 4, 5].map(depthOf));
  let x = 17 + GAP; LAWNS.push({ x0: 17, y0: 6, x1: 17 + GAP, y1: dRow });
  for (const i of [3, 4, 5]) { const d = depthOf(i); C(i, x, 0, [[x + 3, d - 1], [x + 3, d]], {}, CWD, d, [[[x + 4, d - 1], [x + 4, d]]]); x += CWD; if (i !== 5) { LAWNS.push({ x0: x, y0: 6, x1: x + GAP, y1: dRow }); x += GAP; } }   // doors down into the court
  const XR = x;
  let y = 6 + GAP;
  for (const i of [2, 1, 0]) { const d = depthOf(i), ym = y + Math.floor(d / 2); C(i, 0, y, [[CWD - 1, ym], [CWD, ym]], {}, CWD, d, [[[CWD - 1, ym + 1], [CWD, ym + 1]]]); y += d + GAP; }   // class 1 nearest the entrance, doors right into the gallery
  y -= GAP;
  const colEnd = y;
  // Build 244 (her «добьём финальное расположение ... библиотека черти где»): one closed rectangle as wide as the back row:
  // left column | court | right column (canteen, library, tower) aligned with the back row's right end; the front row closes it;
  // the graduates' garden is the court's corner under the exam hall's doors, so graduates leave the exam straight into it.
  // build 248 (her «у части комнат нету стен»): the front row and the right column get tall walls toward the court; the gallery
  // in front of them is 4 tiles (WIDE), as deep as what a tall wall hides, so the walls hide only gallery, never the court
  const WIDE = 4, cx0 = CWD + BAND, cy0 = dRow + BAND, Xr = XR - 6, cx1 = Xr - WIDE, cy1 = cy0 + 23, Yf = cy1 + WIDE;
  COURT = { x0: cx0, y0: cy0, x1: cx1, y1: cy1 };
  PATHS = [];
  { const qx1 = Math.floor((cx0 + cx1) / 2 - 1.7) + 1, qy1 = Math.floor((cy0 + cy1) / 2 - 1.7) + 1;   // her «все это должно стоять вот тут по центру»: the garden in the middle of the court's back-left quarter (up to the cross paths)
    const gx = cx0 + Math.floor((qx1 - cx0 - 6) / 2), gy = cy0 + Math.floor((qy1 - cy0 - 6) / 2);
    SLOTS.GARDEN = slot(gx, gy, [[gx + 2, gy], [gx + 2, gy - 1]], {}, 6, 6, [[[gx + 3, gy], [gx + 3, gy - 1]]]); }   // her «поставь арку ... красиво, логично»: one entrance on the garden's axis (x0+3) from the gallery under the exam hall: arch -> straight path -> gazebo in the middle; no side door (the garden is the graduates' own dead end)
  galLayout();   // plan item 2: the colonnade round the court lawn
  // right column under Elements (build 252, her «у ежика ушла стена где он на полку книжку клал»): library on top (its tall back
  // wall faces the gallery under the back row), a 4-tile lawn, the canteen (tall back wall too); the masters' tower stands outside
  // on the lawn to the right, a path from the gallery corner leads to it
  SLOTS.LIB = slot(Xr, cy0, [[Xr, cy0 + 3], [Xr - 1, cy0 + 3]], {}, 6, 8, [[[Xr, cy0 + 4], [Xr - 1, cy0 + 4]]]);
  SLOTS.CANT = slot(Xr, cy0 + 12, [[Xr, cy0 + 14], [Xr - 1, cy0 + 14]], {}, 6, 6, [[[Xr, cy0 + 15], [Xr - 1, cy0 + 15]]]);
  SLOTS.TOWER = slot(XR + 2, cy1 - 2, [[XR + 2, cy1 + 1], [XR + 1, cy1 + 1]], {}, 6, 6, [[[XR + 2, cy1 + 2], [XR + 1, cy1 + 2]]]);
  PATHS.push({ x0: XR, y0: cy1, x1: XR + 2, y1: Yf });
  // front row (build 250, her «плинтусы и мебель заходят друг на друга»): shop | gap | reception (its middle door looks up the court at
  // the fountain) | dorm | dorm 2 | gap | director. A 1-tile gap keeps one room's wall off the furniture of the next one; the dorms
  // stay glued to the reception (the concierge stands at its desk)
  const rx = Math.round((cx0 + cx1) / 2) - 4;
  SLOTS.REC = slot(rx, Yf, [[rx + 3, Yf], [rx + 3, Yf - 1]], {}, 9, 9,
    [[[rx + 4, Yf], [rx + 4, Yf - 1]], [[rx + 5, Yf], [rx + 5, Yf - 1]], [[rx + 4, Yf + 8], [rx + 4, Yf + 9]], [[rx + 5, Yf + 8], [rx + 5, Yf + 9]], [[rx + 8, Yf], [rx + 9, Yf]]]);
  { SLOTS.REC.door = SLOTS.REC.extra[0]; SLOTS.REC.extra = SLOTS.REC.extra.slice(1); }   /* the Arrival Hall: a 2-tile arched doorway to the court (editor only for now) */
  SLOTS.SHOP = slot(rx - 10, Yf, [[rx - 8, Yf], [rx - 8, Yf - 1]], {}, 6, 6, [[[rx - 7, Yf], [rx - 7, Yf - 1]]]);   // 4-tile lawn: the reception keeps its tall left wall behind the secretary (her «Плинтус на секретаря также заходит»)
  const NEWD = (window.__EDIT), dx0 = XR + 4, dy0 = cy0 - 1;   /* the dorm pavilions: Спальня right of the library, Спальня 2 left of Звездочётство */
  if (!NEWD) { SLOTS.DORM = slot(rx + 9, Yf, [[rx + 9, Yf], [rx + 8, Yf]], {}, ROOM, dormDepth(1)); SLOTS.DORM2 = slot(rx + 15, Yf, [[rx + 15, Yf + 3], [rx + 14, Yf + 3]], {}, ROOM, dormDepth(2)); }
  else { SLOTS.DORM = slot(dx0, dy0, [[dx0, dy0 + 2], [dx0 - 1, dy0 + 2]], {}, ROOM, 10, [[[dx0, dy0 + 3], [dx0 - 1, dy0 + 3]]]);
  SLOTS.DORM2 = slot(-11, 9, [[-6, 13], [-5, 13]], {}, ROOM, 10, [[[-6, 14], [-5, 14]]]); }   /* same as Спальня, its door in the front-right side towards Звездочётство */
  if (NEWD) PATHS.push({ x0: XR, y0: cy0 - 3, x1: dx0, y1: cy0 + 3, paved: 1 }, { x0: -5, y0: 6, x1: -1, y1: 15, paved: 1 }, { x0: -1, y0: 6, x1: CWD, y1: 9, paved: 1 });   /* paths to their doors */
  SLOTS.DIR = slot(rx + 22, Yf, [[rx + 25, Yf], [rx + 25, Yf - 1]], {}, 6, 6);
  BUILDING = { x0: 0, y0: 6, x1: XR, y1: Yf + 10 };
  HALLS = [
    { x0: CWD, y0: 6, x1: XR, y1: cy0 },                               // gallery under the back row, to the right edge
    { x0: CWD, y0: cy0, x1: Xr, y1: Yf },                              // the court and the gallery round it (rooms are cut out of it)
    { x0: Xr, y0: cy1, x1: XR, y1: Yf },                               // gallery corner under the tower, in front of the second dorm
    { x0: CWD, y0: Yf, x1: CWD + BAND, y1: Math.max(Yf, colEnd) },  // the left gallery runs on beside the lowest class (its doors open here: build 245 left Herbs' doors on the lawn)
    { x0: rx + 3, y0: Yf + 9, x1: rx + 7, y1: Yf + 14 },               // path from the gate
  ];
  GATE_TILE = { x: rx + 4.5, y: Yf + 12.5 };
  GATE_Y = Yf + 9;
  GH = Math.max(Yf + 16, colEnd + 4); GW = XR + 14;
  if (NEWD) { const OX = 15, sh = (r) => { r.x0 += OX; r.x1 += OX; };   /* room on the left for Спальня 2: the whole map moves right */
    for (const sl of Object.values(SLOTS)) { sh(sl); for (const d of [sl.door, ...sl.extra]) for (const q of d) q[0] += OX; }
    [...HALLS, ...PATHS, ...LAWNS, COURT, BUILDING].forEach(sh); GATE_TILE.x += OX; GW += OX; galLayout(); }
}
function genLayout() {
  for (const k of Object.keys(SLOTS)) delete SLOTS[k];
  if (WORLD === 2) { for (const k of Object.keys(SLOTS)) delete SLOTS[k]; return genLayoutW2(); }
  return genLayoutCourt();

}
let GATE_Y = 0, LAKE = null;
const lakeD = (x, y, m = 0) => (LAKE ? Math.pow((x - LAKE.cx) / (LAKE.rx + m), 2) + Math.pow((y - LAKE.cy) / (LAKE.ry + m), 2) : 9);   // < 1 inside the lake grown by m tiles
function lakeRing(m = 0, n = 64) { const o = []; for (let k = 0; k < n; k++) { const an = k / n * Math.PI * 2, w = 1 + 0.06 * Math.sin(an * 3 + 1) + 0.04 * Math.sin(an * 5 + 2); o.push(P(LAKE.cx + Math.cos(an) * (LAKE.rx + m) * w, LAKE.cy + Math.sin(an) * (LAKE.ry + m) * w)); } return o; }
// region grid (rebuilt with the layout)
let REG = [];
const YOFF = 0;
const inGrid = (x, y) => x >= 0 && y >= -YOFF && x < GW && y < GH;
const regAt = (x, y) => (inGrid(x, y) ? REG[x][y + YOFF] : null);
function fillRect(r, id) { for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) if (inGrid(x, y)) REG[x][y + YOFF] = id; }
const DOORS = new Set();
function buildGrid() {
  bfsVer++;   // the map changed: cached paths are stale
  REG = Array.from({ length: GW }, () => Array(GH + YOFF + 2).fill(null));
  HALLS.forEach((h) => fillRect(h, 'hall'));
  LAWNS.forEach((h) => fillRect(h, null));   // lawn gaps between rooms (courtyard school)
  PATHS.forEach((h) => fillRect(h, 'path'));
  Object.entries(SLOTS).forEach(([id, r]) => fillRect(r, id));
  DOORS.clear();
  Object.values(SLOTS).forEach((s) => { for (const [a, b] of [s.door, ...s.extra]) { DOORS.add(`${a[0]},${a[1]}|${b[0]},${b[1]}`); DOORS.add(`${b[0]},${b[1]}|${a[0]},${a[1]}`); } });
}
// ---- walls: one rule everywhere ----
// side: 'x0' / 'y0' = back sides (tall walls), 'x1' / 'y1' = front sides (knee walls); door tiles get no wall.
let EDGES = [];
// behind and 1 beside only: a wall that continues a room's outer wall along the same line is right (her «Исчезли остальные стены коридора» on 220)
function roomNear(x, y, side) {   // a room close behind, beside or ahead along the line of a would-be tall corridor wall: the wall would rise next to it (her screenshots on 214 and 218)
  for (let dx = -3; dx <= (side === 'y0' ? 1 : -1); dx++) for (let dy = -3; dy <= (side === 'x0' ? 1 : -1); dy++) { const r = regAt(x + dx, y + dy); if (r && r !== 'hall' && r !== 'path') return true; }
  return false;
}
function dropLooseHallWalls() {   // a tall corridor wall must join another tall wall at both ends, or it stands with a free end in the air (her «Корявая стена» on 221)
  const ends = (e) => (e.side === 'x0' ? [[e.x, e.y], [e.x, e.y + 1]] : e.side === 'y0' ? [[e.x, e.y], [e.x + 1, e.y]] : []);
  for (const side of ['x0', 'y0']) {
    const W = EDGES.filter((e) => e.hallWall && e.side === side), seen = new Set();
    for (const e0 of W) {
      if (seen.has(e0)) continue;
      const run = W.filter((e) => (side === 'x0' ? e.x === e0.x : e.y === e0.y)).sort((p, q) => (side === 'x0' ? p.y - q.y : p.x - q.x));
      let k = run.indexOf(e0), a = k, b = k; while (a > 0 && (side === 'x0' ? run[a - 1].y === run[a].y - 1 : run[a - 1].x === run[a].x - 1)) a--; while (b < run.length - 1 && (side === 'x0' ? run[b + 1].y === run[b].y + 1 : run[b + 1].x === run[b].x + 1)) b++;
      const part = run.slice(a, b + 1); part.forEach((e) => seen.add(e));
      const p0 = ends(part[0])[0], p1 = ends(part[part.length - 1])[1];
      const joined = (pt) => EDGES.some((e) => e.tall && !part.includes(e) && ends(e).some(([x, y]) => x === pt[0] && y === pt[1]));
      if (!joined(p0) || !joined(p1)) part.forEach((e) => { e.tall = false; e.hallWall = false; e.wallTheme = undefined; });
    }
  }
}
function dropShortHallWalls() {   // a tall corridor wall shorter than 3 tiles looks like a stray piece: back to a knee wall
  for (const side of ['x0', 'y0']) {
    const W = EDGES.filter((e) => e.hallWall && e.side === side), key = (e) => (side === 'y0' ? e.y + ':' + e.x : e.x + ':' + e.y);
    const has = new Set(W.map(key));
    for (const e of W) {
      const line = side === 'y0' ? e.y : e.x, t = side === 'y0' ? e.x : e.y; let a = t, b = t;
      while (has.has(line + ':' + (a - 1))) a--; while (has.has(line + ':' + (b + 1))) b++;
      if (b - a + 1 < 3) { e.tall = false; e.hallWall = false; e.wallTheme = undefined; }
    }
  }
}
function buildEdges() {
  EDGES = [];
  const doorAt = new Set();
  Object.values(SLOTS).forEach((sl) => [sl.door, ...sl.extra].forEach(([a, b]) => { doorAt.add(`${a[0]},${a[1]},${b[0] - a[0]},${b[1] - a[1]}`); doorAt.add(`${b[0]},${b[1]},${a[0] - b[0]},${a[1] - b[1]}`); }));
  const sides = [['x0', -1, 0], ['y0', 0, -1], ['x1', 1, 0], ['y1', 0, 1]];
  for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
    const id = regAt(x, y); if (!id || id === 'GARDEN' || id === 'TRADE' || id === 'EXPED' || id === 'path') continue;
    if (id === 'hall' && y >= GATE_Y) continue;                    // the gate path is open
    for (const [side, dx, dy] of sides) {
      const nb = regAt(x + dx, y + dy);
      if (nb === id) continue;
      if (doorAt.has(`${x},${y},${dx},${dy}`)) continue;
      if (id === 'hall' && nb) continue;                             // a hall next to a room: the room owns that wall
      if (id === 'hall' && WORLD === 1 && !nb && (side === 'x0' || side === 'y0') && !roomNear(x, y, side) && x >= BUILDING.x0 && x < BUILDING.x1 && y >= BUILDING.y0 && y < BUILDING.y1) { EDGES.push({ x, y, side, id, tall: true, hallWall: true, wallTheme: 'REC' }); continue; }   // corridor back wall with only grass behind it: a real tall wall (her «добавь стены где можно»)
      if (nb === 'hall' && id !== 'hall' && (side === 'x0' || side === 'y0') && false) continue;
      const lowSide = (WORLD === 2 && side === 'x0' && (nb === 'hall' || (id === 'EXAM' && nb === 'GARDEN'))) || (WORLD === 1 && side === 'x0' && ['SHOP', 'DIR', 'DORM', 'DORM2'].includes(id) && nb !== 'hall') || ((id === 'DORM' || id === 'DORM2') && side === 'x0') || (id === 'EXAM' && side === 'x0' && nb === 'DIR') || (nb === 'SHOP' && side === 'x0')   // the class next to the shop keeps a low wall so the shop stays visible   // low walls between neighbouring rooms so neither hides the other   // dorms share low walls with the reception and each other (they hid the rooms)
      EDGES.push({ x, y, side, id, tall: id !== 'hall' && (side === 'x0' || side === 'y0') && !lowSide });   // corridors get only low walls: they must never hide a room
    }
  }
  dropShortHallWalls();
  dropLooseHallWalls();
}
genLayout(); buildGrid(); buildEdges(); decorateEdges();
const gardenBlocked = (x, y) => { const g = SLOTS.GARDEN; return false && WORLD === 1 && g && x - g.x0 >= 2 && x - g.x0 <= 3 && y - g.y0 >= 2 && y - g.y0 <= 3; };   // the fountain's 2x2 tiles (off: the centre is the graduation circle now)
const recBlocked = (x, y) => { const s = SLOTS.REC; return x - s.x0 <= 1 && y - s.y0 >= 1 && y - s.y0 <= 6; };   // tiles under the painted desk
function canStep(ax, ay, bx, by) {
  const ra = regAt(ax, ay), rb = regAt(bx, by);
  if (!ra || !rb) return false;
  if (ra === rb) return rb === 'GARDEN' ? !gardenBlocked(bx, by) : rb === 'hall' ? !courtBlocked(bx, by) : true;
  if ((ra === 'path' && rb === 'hall') || (ra === 'hall' && rb === 'path')) return true;   // the garden path leaves the building through an opening
  if ((ra === 'DORM2' || rb === 'DORM2') && !dorm2Built()) return false;
  if (rb === 'REC' && recBlocked(bx, by)) return false;   // the reception desk is not a floor
  if (rb === 'GARDEN' && gardenBlocked(bx, by)) return false;
  if (rb === 'hall' && courtBlocked(bx, by)) return false;
  return DOORS.has(`${ax},${ay}|${bx},${by}`);
}
// Path search (build 236, her «Загрузилась через секунд 10»: the offline catch-up spent ~7 s of 11 here): a typed-array BFS
// with an index queue instead of Map + Array.shift, and finished tile paths are cached until the map changes.
var bfsCache = new Map(), bfsVer = 0, bfsKeyVer = "", bfsAdj = null, bfsPrev = null, bfsSeen = null, bfsQx = null, bfsQy = null, bfsGen = 0;   // var: buildGrid() runs at load before this line
// canStep() of every tile towards its 4 neighbours, built once per map (boot speed 2026-11-23: canStep inside the BFS was ~a third
// of the offline catch-up). canStep only changes with the map and the second dorm: the same key as bfsCache.
function bfsAdjOf(W, H, id) {
  const t = new Uint8Array(W * H);
  for (let x = -1; x <= GW; x++) for (let y = -YOFF - 1; y <= GH + 2; y++) {
    const c = id(x, y);
    for (let d = 0; d < 4; d++) { const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0); if (nx < -1 || ny < -YOFF - 1 || nx > GW || ny > GH + 2) continue; if (canStep(x, y, nx, ny)) t[c] |= 1 << d; }
  }
  return t;
}
function bfs(sx, sy, tx, ty) {
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  const ver = bfsVer + ':' + (dorm2Built() ? 1 : 0); if (ver !== bfsKeyVer) { bfsCache.clear(); bfsKeyVer = ver; bfsAdj = null; }
  const ck = ((sx + 64) * 512 + (sy + 64)) * 262144 + (tx + 64) * 512 + (ty + 64);
  const hit = bfsCache.get(ck); if (hit) return hit.map((q) => ({ x: q.x, y: q.y }));
  const W = GW + 2, H = GH + YOFF + 4, id = (x, y) => (x + 1) * H + (y + YOFF + 1);
  if (sx < -1 || sy < -YOFF - 1 || sx > GW || sy > GH + 2 || tx < -1 || ty < -YOFF - 1 || tx > GW || ty > GH + 2) return [];
  if (!bfsAdj || bfsAdj.length !== W * H) bfsAdj = bfsAdjOf(W, H, id);
  if (!bfsPrev || bfsPrev.length !== W * H) { bfsPrev = new Int32Array(W * H); bfsSeen = new Uint32Array(W * H); bfsQx = new Int16Array(W * H); bfsQy = new Int16Array(W * H); bfsGen = 0; }
  const prev = bfsPrev, seen = bfsSeen, qx = bfsQx, qy = bfsQy, gen = ++bfsGen; let qh = 0, qt = 0;   // reused buffers: a tile is visited when seen[] holds this search's number
  const s0 = id(sx, sy); prev[s0] = s0; seen[s0] = gen; qx[qt] = sx; qy[qt++] = sy; let found = sx === tx && sy === ty;
  while (qh < qt && !found) {
    const x = qx[qh], y = qy[qh++], cur = id(x, y);
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!((bfsAdj[cur] >> d) & 1)) continue;   // canStep() from the table (never true outside the grid)
      const k = id(nx, ny); if (seen[k] === gen) continue;
      seen[k] = gen; prev[k] = cur; qx[qt] = nx; qy[qt++] = ny; if (nx === tx && ny === ty) { found = true; break; }
    }
  }
  if (!found) return [];
  const out = []; let k = id(tx, ty);
  while (true) { const x = Math.floor(k / H) - 1, y = (k % H) - YOFF - 1; out.push({ x: x + 0.5, y: y + 0.5 }); if (k === s0) break; k = prev[k]; }
  out.reverse(); out.shift();
  if (bfsCache.size > 6000) bfsCache.clear(); bfsCache.set(ck, out);
  return out.map((q) => ({ x: q.x, y: q.y }));
}
// Ruslan's feedback 2026-11-22 («ходят по очень ровным траекториям ... более рандомные»): every creature keeps its own
// lane inside the corridors (a personal offset from the tile centres) plus a little jitter per step. A point stays inside
// its tile, and two neighbouring tiles always share a walkable edge, so a path can never cut through a wall.
function pathTo(a, tx, ty) {
  const p = bfs(a.x, a.y, tx, ty); p.pop();
  if (a.lx === undefined) { a.lx = (Math.random() - 0.5) * 0.56; a.ly = (Math.random() - 0.5) * 0.56; }
  const cl = (v) => Math.max(-0.38, Math.min(0.38, v));
  for (const q of p) { const k = WORLD === 2 && regAt(Math.floor(q.x), Math.floor(q.y)) === 'path' ? 0.35 : 1;   // world-2 roads: walk near the middle
    q.x = Math.floor(q.x) + 0.5 + cl(a.lx * k + (Math.random() - 0.5) * 0.22 * k); q.y = Math.floor(q.y) + 0.5 + cl(a.ly * k + (Math.random() - 0.5) * 0.22 * k); }
  p.push({ x: tx, y: ty }); return p;
}

const slotOf = (i) => SLOTS[CLASS_SLOT[i]];
const clsTheme = (i) => { const th = themeOf(CLASS_SLOT[i]); return th ? THEMES[th] : null; };
const frontFacing = (i) => clsTheme(i)?.facing === 'front';   // students face the viewer, the teacher stands at the front
const sitsOn = (i) => !!clsTheme(i)?.sitOn;                     // students sit on their station (clouds)
function faceTeacher(a, i) { const tp = teacherPos(i); a.flip = (tp.x - tp.y) < (a.x - a.y); a.back = !frontFacing(i); }
const sideHall = (i) => !!CLASSES[i].final && WORLD === 1;   // the exam hall faces its left wall
function deskPos(i, d) { const p = deskPos0(i, d), o = deskOv(i, d); return o ? { x: p.x + (o.dx || 0), y: p.y + (o.dy || 0) } : p; }   // the room editor may move a student's place
function deskPos0(i, d) {   // 3 columns across the room, rows from the board towards us: the first rows stay on the room picture
  if (sideHall(i)) { const s = slotOf(i), per = 3, gy = (s.y1 - s.y0 - 2.2) / (per - 1); return { x: s.x0 + 3.2 + Math.floor(d / per) * 1.95, y: s.y0 + 1.1 + (d % per) * gy }; }   // rows of 3 along the left wall, 7 rows deep into the hall
  const s = slotOf(i), w = s.x1 - s.x0, cols = CLASSES[i].final ? 7 : w >= 9 ? 4 : 3, lm = WORLD === 1 && (CLASSES[i].id === 'herbs' || CLASSES[i].id === 'potions' || CLASSES[i].id === 'stars') ? 1.65 : 1.1, gap = (w - lm - 1.1) / (cols - 1);   // Herbology: the first column steps away from the planter boxes (her «Да» to moving the row)
  return { x: s.x0 + lm + (d % cols) * gap, y: s.y0 + (frontFacing(i) ? 1.9 : 2.5) + Math.floor(d / cols) * (CLASSES[i].final ? 1.45 : 1.2) };   // exam rows wider apart: each student clearly sits at his own desk
}
const seatPos = (i, d) => { const p = deskPos(i, d);   // exam hall: desks stay in the sideHall rows, students sit as before (her ruling 2026-11-22)
  if (frontFacing(i)) return { x: p.x - 0.45, y: p.y + 0.4 };   // charms: beside the lectern, on its left on screen (her ruling 2026-11-21)
  return { x: p.x, y: p.y + (sitsOn(i) ? 0.05 : CLASSES[i].final ? 0.32 : 0.45) }; };   // in front of the desk (nearer to us): the desk is between the student and the board
// render-only stroll: the teacher walks slowly left and right along the board, pauses, turns to the class
function teacherGlow(tp, hh, col = 'rgba(255,244,205,0.6)') {   // soft light around a teacher so they stand out from the class
  const q = P(tp.x, tp.y), g = ctx.createRadialGradient(q.x, q.y - hh * 0.5, 2, q.x, q.y - hh * 0.5, hh * 0.75);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y - hh * 0.5, hh * 0.75, 0, Math.PI * 2); ctx.fill();
}
// the secretary leaves the counter only while nobody waits (her idea 2026-11-21): she pins notes on the board, then comes back
// The secretary moves only with a reason (her ruling 2026-11-21: «должна быть логика у этого движения»):
//  - while a newcomer is being enrolled she stands at the counter and works;
//  - every 5 enrolment forms she carries the stack to the scroll shelf on the wall behind her and comes back;
//  - when nobody waits for 3 s she goes to pin a note on the notice board.
// secU = 0 at the counter, 1 at the trip's goal; enrolment waits until she is back (live only).
let secIdle = 0, secLast = 0, secU = 0, secForms = 0, secTrip = null, secHold = 0, secClock = 0, secNext = 'shelf';
const SEC_STAMPS = 3 * 0.85, SEC_WRITES = 2 * 1.6;   // every pose at least ~2.5 s (her rule 2026-11-22: nothing may flash by)
function secretaryPos() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (secLast || now)); secLast = now;
  const waiting = processing || queue.some((q) => q.state === 'queue');
  secIdle = waiting ? 0 : secIdle + dt;
  // her routine at the counter (her ruling 2026-11-21: «штамп - штамп - штамп - пишет - пишет - отошла»):
  // 3 stamps, 2 writing spells, then she walks away (to the shelf with the stack, next time to the map with a note)
  if (!secTrip && secU === 0) {
    secClock += dt;
    if (secClock > SEC_STAMPS + SEC_WRITES) { secClock = 0; if (queue.length < 3) { secTrip = secNext; secNext = secNext === 'shelf' ? 'board' : 'shelf'; } }   // a long line keeps her at the counter (tester Гоща: «барсук медленно обрабатывает»): stamp, stamp, stamp, write, write, again
  }
  let target = 0;
  if (secTrip === 'shelf') { target = 1; if (secU >= 1) { secHold += dt; if (secHold > 2.2) { secTrip = 'back'; secHold = 0; } } }
  else if (secTrip === 'board') { target = 1; if (secU >= 1) { secHold += dt; if (secHold > 2.6) { secTrip = 'back'; secHold = 0; } } }   // stays to pin the note, then comes back
  else if (secTrip === 'back') { target = 0; if (secU <= 0) secTrip = null; }
  const sp = target ? 1 / 1.6 : 1 / 1.2;
  secU = target > secU ? Math.min(1, secU + sp * dt) : target < secU ? Math.max(0, secU - sp * dt) : secU;   // BUG fixed: at the goal she used to slip back every other frame (the jitter she saw)
  const s = SLOTS.REC, home = { x: OFFICER.x, y: OFFICER.y };
  const goal = (secTrip === 'board' || (secTrip === 'back' && secGoal === 'board')) ? { x: s.x0 + 1.3, y: s.y0 + 0.5 } : { x: s.x0 + 0.55, y: s.y0 + 1.3 };   // under the school map on the back wall (she pins notes to it) / scroll shelf
  if (secTrip === 'board' || secTrip === 'shelf') secGoal = secTrip;
  const k = 0.5 - 0.5 * Math.cos(secU * Math.PI);
  const moving = secU > 0 && secU < 1;
  // pose: at the counter she writes the form and stamps it at the end; carries the stack to the shelf; pins the note at the board
  let pose = 'write';
  if (secTrip === 'shelf' || (secTrip === 'back' && secGoal === 'shelf' && secU > 0)) pose = secTrip === 'shelf' ? 'carry' : 'walk';
  else if (secGoal === 'board' && secU > 0) pose = secU >= 1 ? 'pin' : 'walk';
  else pose = secClock < SEC_STAMPS ? 'stamp' : 'write';   // at the counter: writes ~1.7 s, stamps ~0.7 s, so both are seen even when enrolment is very fast
  secretaryPos.lastPose = pose;
  const hit = pose === 'stamp' ? ((secClock % 0.85) > 0.6 ? 3 : -2) : 0;   // each stamp: raise, then thump down
  return { x: home.x + (goal.x - home.x) * k, y: home.y + (goal.y - home.y) * k, moving, left: false, pose, hit };   // never mirrored (her ruling)
}
let secGoal = 'board';
function teacherWalk(i) {
  const b = teacherPos(i), s = slotOf(i), T = performance.now() / 1000 + i * 3.7;
  const span = Math.max(0.8, Math.min(2.2, (s.x1 - s.x0) / 2 - 1.4));
  const ph = (T % 16) / 16;                                        // 16 s loop: walk 3 s, stop 5 s, walk back 3 s, stop 5 s
  const W = 3 / 16, u = ph < W ? ph / W : ph < 0.5 ? 1 : ph < 0.5 + W ? 1 - (ph - 0.5) / W : 0;
  const x = b.x - span + 2 * span * (0.5 - 0.5 * Math.cos(u * Math.PI)), y = b.y + Math.sin(T * 0.7) * 0.25;
  const moving = (ph < W || (ph >= 0.5 && ph < 0.5 + W));
  const inStop = ph >= 0.5 + W ? (ph - 0.5 - W) * 16 : ph >= W && ph < 0.5 ? (ph - W) * 16 : 0;
  return { x, y, moving, left: ph >= 0.5 && ph < 0.5 + W, stop: ph >= 0.5 + W ? 1 : 0, cyc: Math.floor(T / 16), inStop };
}
const teacherPos = (i) => { const s = slotOf(i); return frontFacing(i) ? { x: s.x0 + (s.x1 - s.x0) / 2 + 0.6, y: s.y1 - 0.9 } : { x: s.x0 + (s.x1 - s.x0) / 2 + 1.3, y: s.y0 + 1.0 }; };
let REC = SLOTS.REC, OFFICER = { x: REC.x0 + 0.75, y: REC.y0 + 3.3 };
const queueSlot = (k) => (k < 6 ? { x: REC.x0 + 3.0 + k * 0.7, y: REC.y0 + 4.6 } : { x: REC.x0 + 3.0 + (11 - k) * 0.7, y: REC.y0 + 3.75 });   // a second row behind the first (snake) for a long line
const queueCap = () => 6 + Math.floor(Math.max(0, recLvl() - 16) / 4);   // 6 places, 12 at reception level 40 (tester Гоща: arrivals at max ads were lost at the door)
function waitSpot(i, k) { const [, h] = slotOf(i).door; return { x: h[0] + 0.5 + (k % 2) * 0.6 - 0.3, y: h[1] + 0.5 + Math.floor(k / 2) * 0.6 }; }

// ======================= agents =======================
let agents = [];
let queue = [];
const deskOcc = CLASSES.map(() => Array(MAX_DESKS_ABS).fill(null));
const waitList = CLASSES.map(() => []);
let processing = null; let procT = 0;
let arrivalT = 1;

function walk(a, tx, ty, then) { a.path = pathTo(a, tx, ty); a.onArrive = then; if (!a.path.length && then) { a.onArrive = null; then(); } }
function spawn() {
  if (EDIT) return;   // the editor shows empty rooms
  const a = { id: S.nextId++, sp: rnd(SPECIES), name: rnd(NAMES), x: GATE_TILE.x, y: GATE_TILE.y, z: 0,
    path: [], speed: 2.3 + Math.random() * 0.4, state: 'walk', onArrive: null, flip: false, t: 0, dur: 1, c: -1, desk: -1, ph: Math.random() * 6, mood: Math.min(100, planOf().mood + ((campNow() || {}).mood || 0)), pk: planOf().sad };
  agents.push(a); queue.push(a); goQueue(a);
}
function goQueue(a) { const p = queueSlot(queue.indexOf(a)); a.goal = { t: 'q' }; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'queue'; }); }
function startNextProcess(live) {
  if (processing || !queue.length) return;
  if (live && secU > 0.02) return;   // the secretary first walks back to her counter
  const a = queue[0]; if (a.state !== 'queue') { const q = queueSlot(0); if (!(a.goal && a.goal.t === 'q' && a.state === 'walk' && Math.hypot(a.x - q.x, a.y - q.y) < 0.6)) return; a.path = []; a.onArrive = null; }   // almost at the counter: taken at once
  processing = a; procT = 0; a.state = 'process';
}
function finishProcess() {
  const a = processing; processing = null;
  queue.shift(); queue.forEach(goQueue);
  S.stats.enrolled++; secForms++;
  a.paid = entryFee(); earn(a.paid, OFFICER.x + 1, OFFICER.y, '#c98a00');
  a.state = 'walk';
  route(a, nextClass(-1));
}
const MAX_WAIT = 6;                                   // students allowed to wait in the line of a class
// line of a class = waiting + already walking there
const lineCount = (i) => waitList[i].length + agents.reduce((n, a) => n + (a.goal && a.goal.t === 'c' && a.goal.i === i && (a.state === 'walk') ? 1 : 0), 0);
const classFull = (i) => i >= 0 && waitList[i].length >= MAX_WAIT;   // the line = only those standing at the door
// sleepers go first (her rule 2026-11-21: one waited 10 min for a half-empty class while newcomers kept walking in):
// a waker needs room in the standing line plus the other wakers already on their way; newcomers walking there do not block it
const wakersFor = (i) => agents.reduce((n, a) => n + (a.woke && a.goal && a.goal.t === 'c' && a.goal.i === i && a.state === 'walk' ? 1 : 0), 0);
// room = free desks + free places at the door; everybody already walking there counts (sleepers are woken first each step)
const freeDesksN = (i) => { let n = 0; for (let d = 0; d < S.classes[i].desks; d++) if (!deskOcc[i][d]) n++; return n; };
const roomForWaker = (i) => i < 0 || waitList[i].length + wakersFor(i) < MAX_WAIT + freeDesksN(i);   // newcomers walking there do not block a sleeper (Sonya's report 2026-11-22)
const sleepersFor = (i) => dorm.reduce((n, a) => n + (a && a.goal && a.goal.t === 'd' && a.goal.i === i ? 1 : 0), 0);
// dorm: upset students sleep here until there is room in the line of their class
let DS = SLOTS.DORM, DS2 = SLOTS.DORM2;
// beds of room 1 are 0..31, of room 2 32..63 (only the first ones exist, see bedExists)
const DORM_SPOTS = Array(64).fill(null);
function dormSpots() {
  if (WORLD === 1 && (window.__EDIT)) { for (const [k, R] of [[1, DS], [2, DS2]]) { const wide = R.x1 - R.x0 > R.y1 - R.y0, Ln = wide ? R.x1 - R.x0 : R.y1 - R.y0, step = (Ln - 2.4) / 4;   /* the tree dorms: nests for four in two rows along the long side */
      for (let b = 0; b < DORM_STRIDE; b++) { const n = Math.floor(b / 4), row = n % 2, i = Math.floor(n / 2), q = b % 4, along = 2.2 + i * step + step / 2 - 0.6, across = row ? 4.35 : 2.0, cx = R.x0 + (wide ? along : across), cy = R.y0 + (wide ? across : along);
        DORM_SPOTS[(k - 1) * DORM_STRIDE + b] = { x: cx + (q % 2 ? 0.32 : -0.32), y: cy + (q < 2 ? -0.22 : 0.26), nest: { x: cx, y: cy } }; } }
    return; }
  for (const [k, R, x0, dx] of [[1, DS, 2.05, 1.12], [2, DS2, 1.0, 1.3]]) {
    const rows = dormRows(k), step = (R.y1 - R.y0 - 1.6) / rows;
    for (let b = 0; b < DORM_STRIDE; b++) { const r = Math.floor(b / 4), c = b % 4; DORM_SPOTS[(k - 1) * DORM_STRIDE + b] = { x: R.x0 + x0 + c * dx, y: R.y0 + 1.0 + Math.min(r, rows - 1) * step }; }
  }
}
dormSpots();
// concierge: everybody checks in at her desk before going to bed
let CONCIERGE = WORLD === 1 && (window.__EDIT) ? { x: DS.x0 + 0.65, y: DS.y0 + 0.75 } : { x: DS.x0 - 0.55, y: DS.y0 + 1.1 };   /* world 1: Баю-Бая inside her dorm pavilion, behind the door */
const MAX_CONC = 10, DORM2_COST = 1500;
const dormExpandCost = (k) => paced(2500 * Math.pow(3, dormSize(k) - 1) * (k === 2 ? 1.5 : 1), dormSize(k));
const dorm2Built = () => !!(S && S.dormUp && S.dormUp.room2 && Date.now() >= (S.dormUp.room2End || 0));
const cap1 = () => 4 * dormRows(1), cap2 = () => 4 * dormRows(2);
const maxBeds = () => cap1() + (dorm2Built() ? cap2() : 0);
const dormUp = () => (S.dormUp ||= { beds: 1, conc: 1 });
const beds1 = () => Math.min(cap1(), 8 + dormUp().beds);                                             // 9 beds at level 1
const beds2 = () => (dorm2Built() ? Math.min(cap2(), 9 + Math.max(0, 8 + dormUp().beds - cap1())) : 0);   // 9 at once, then the upgrade fills it
const bedCount = () => beds1() + beds2();
const bedExists = (b) => (b < DORM_STRIDE ? b < beds1() : b - DORM_STRIDE < beds2());
const checkinTime = () => 2 * Math.pow(0.85, dormUp().conc - 1);
const bedsCost = () => paced(150 * Math.pow(1.6, dormUp().beds - 1), dormUp().beds);
const concCost = () => paced(100 * Math.pow(1.5, dormUp().conc - 1), dormUp().conc);
const dormLineSpot = (k) => (WORLD === 1 && (window.__EDIT) ? { x: CONCIERGE.x - 0.05, y: Math.min(DS.y1 - 0.4, CONCIERGE.y + 3.55 + k * 0.5) } : { x: DS.x0 - 1.5, y: DS.y0 + 1.5 + k * 0.6 });   /* world 1: the line waits inside, along the wall past the door */   // the check-in line waits in the reception, by the dorm door
let dormLine = [], checkin = null, checkinT = 0;
const NEWDORM = WORLD === 1 && !!window.__EDIT;   /* the tree dorms with two concierges: editor only until her OK */
const concOff = (rid) => { const R = NEWDORM && RLAY.rooms[rid], o = R && R.items && R.items['conc#1']; return { dx: (o && o.dx) || 0, dy: (o && o.dy) || 0 }; };   /* moved in the editor */
const CON2 = { line: [], cur: null, t: 0, keyAt: -1e9, x: 0, y: 0 };   /* Ляля-Люля, Спальня 2 */
const LYALYA = (() => { const im = new Image(); im.src = 'assets/staff/concierge2.webp?v=1'; return im; })();
function concPlace() { if (!NEWDORM) return; const o1 = concOff('DORM'), o2 = concOff('DORM2'); CONCIERGE = { x: DS.x0 + 0.65 + o1.dx, y: DS.y0 + 0.75 + o1.dy }; CON2.x = DS2.x1 - 0.75 + o2.dx; CON2.y = DS2.y0 + 2.3 + o2.dy; }
const toTwin = (a) => NEWDORM && dorm2Built() && a.bed >= DORM_STRIDE;
const line2Spot = (k) => ({ x: CON2.x + 0.15, y: Math.min(DS2.y1 - 0.4, CON2.y + 3.9 + k * 0.5) });
function goLine2(a) { const p = line2Spot(CON2.line.indexOf(a)); a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'dline'; }); }
function stepConcierge2(dt) {   /* Ляля-Люля checks in the guests of Спальня 2 */
  if (!CON2.cur && CON2.line.length && CON2.line[0].state === 'dline') { CON2.cur = CON2.line[0]; CON2.t = 0; CON2.cur.state = 'checkin'; }
  if (!CON2.cur) return; CON2.t += dt; if (CON2.t < checkinTime()) return;
  const a = CON2.cur; CON2.cur = null; CON2.line.shift(); CON2.line.forEach(goLine2); popup('📝', a.x, a.y, '#4f86c6', 44); CON2.keyAt = performance.now() / 1000; toBed(a);
}
const DORM_CAP = DORM_SPOTS.length;
const dorm = Array(DORM_CAP).fill(null);           // agent per bed (only the first bedCount() beds exist)
const freeBed = () => { for (let b = 0; b < DORM_CAP; b++) if (bedExists(b) && !dorm[b]) return b; return -1; };
const dormFree = () => freeBed() >= 0;
function goDorm(a, i, bed = freeBed()) {   // bed is reserved now, the student queues at the concierge first
  dorm[bed] = a; a.bed = bed; a.goal = { t: 'd', i }; a.c = -1; a.since = Date.now();
  if (toTwin(a)) { CON2.line.push(a); goLine2(a); } else { dormLine.push(a); goDormLine(a); }
}
function goDormLine(a) { const p = dormLineSpot(dormLine.indexOf(a)); a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'dline'; }); }
function toBed(a) { const p = DORM_SPOTS[a.bed]; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'sleep'; }); }
function stepConcierge(dt) {
  if (!checkin && dormLine.length && dormLine[0].state === 'dline' && !conciergeAway()) { checkin = dormLine[0]; checkinT = 0; checkin.state = 'checkin'; }
  if (!checkin) return;
  checkinT += dt;
  if (checkinT < checkinTime()) return;
  const a = checkin; checkin = null;
  dormLine.shift(); dormLine.forEach(goDormLine);
  popup('📝', a.x, a.y, '#7b5cd6', 44);
  conKeyAt = performance.now() / 1000;
  toBed(a);
}
function leaveSchool(a) {   // no room anywhere: the student is upset and goes home — and the school pays its fee back with a penalty
  if (a.retake) { retakeHome(a); return; }   // an elder on a retake never leaves the school: he just goes back to the tower
  S.stats.left = (S.stats.left || 0) + 1; review(a, leaverStars());
  const want = Math.min(S.coins, Math.round((a.paid || fee()) * refundRate())), back = Math.max(0, Math.min(want, Math.floor(S.refBud ?? refundCap())));   // build 275: the refund cap
  if (back > 0) { S.refBud = (S.refBud ?? refundCap()) - back; spendOut(back, 'refunded'); popup(`−${fmt(back)}`, a.x, a.y, '#e0245e', 60); }
  if (want > back) S.stats.unpaid = (S.stats.unpaid || 0) + (want - back);   // the till is empty this minute: he leaves without (all of) his money
  popup('😢💔', a.x, a.y, '#c0436b', 44);
  a.c = -1; a.goal = { t: 'x' }; a.state = 'walk';
  walk(a, GATE_TILE.x, GATE_TILE.y + 1, () => { a.gone = true; });
}
function route(a, i) {   // send a student on to class i, or to the dorm when its line is full
  // her rule 2026-11-22: everybody stands at the door first, the dorm only when the door line is full.
  // Sleepers already woken and walking back keep their places (roomForWaker counts them), so nobody is overtaken.
  if (i < 0 || waitList[i].length < MAX_WAIT) { goClass(a, i); return true; }   // the door line decides, not the walkers (Sonya's report 2026-11-22: dorm full, lines empty)
  if (courtRoom()) { goCourt(a, i); return true; }   // build 259: the court first (mood rises there), the dorm only when the court is full
  if (!dormFree()) { leaveSchool(a); return false; }
  popup('😢', a.x, a.y, '#5b7fd6', 44);
  goDorm(a, i);
  return true;
}
function wakeSleepers() {   // the one who has waited longest goes back first
  // also those still on their way to the dorm or waiting at the concierge: when the door line has room they turn back
  // at once instead of checking in first (her rule 2026-11-22)
  const sl = []; for (let b = 0; b < DORM_CAP; b++) { const a = dorm[b]; if (a && a.goal && a.goal.t === 'd' && (a.state === 'sleep' || a.state === 'dline' || a.state === 'checkin' || a.state === 'walk')) sl.push(a); }
  for (const a of courtList) if (!a.goal.brk) sl.push(a);   // build 259: those waiting in the court go back the same way (oldest first); a break ends by itself
  if (!sl.length) return;
  sl.sort((p, q) => (p.since || 0) - (q.since || 0));
  let moved = false;
  for (const a of sl) {
    let i = a.goal.i; if (!isOpen(i)) i = nextClass(i - 1);
    if (i >= 0 && !roomForWaker(i)) continue;
    if (a.goal.t === 'k') { leaveCourt(a); a.woke = true; popup('😊', a.x, a.y, '#2f9e7a', 44); goClass(a, i); continue; }
    if (a.state !== 'sleep') {   // not checked in yet (or walking to the bed): leave the concierge line
      const k = dormLine.indexOf(a); if (k >= 0) { dormLine.splice(k, 1); moved = true; }
      if (checkin === a) { checkin = null; checkinT = 0; }
      { const k2 = CON2.line.indexOf(a); if (k2 >= 0) { CON2.line.splice(k2, 1); moved = true; } if (CON2.cur === a) { CON2.cur = null; CON2.t = 0; } }
    }
    dorm[a.bed] = null; a.bed = -1; a.woke = true; popup('😊', a.x, a.y, '#2f9e7a', 44); goClass(a, i);
  }
  if (moved) { dormLine.forEach((w) => { if (w.state === 'dline' || w.state === 'walk') goDormLine(w); }); CON2.line.forEach((w) => { if (w.state === 'dline' || w.state === 'walk') goLine2(w); }); }   // the line moves up
}
function nextClass(i) { for (let k = i + 1; k < CLASSES.length; k++) if (isOpen(k)) return k; return -1; }
// ======================= dorm roles (agreed plan, her pick «2 и 3», 2026-11-23) =======================
// (2) a nap before the Final exam gives +10% at the exam; (3) tiredness: after NAP_N lessons a student is tired and naps in the
// dorm when a bed is free, then his next REST_L lessons are shorter (x REST_K). Nappers live here: they skip the concierge.
// The last NAP_KEEP free beds stay for students waiting for a desk. World 1 only for now (world 2 has its own pacing).
const NAP_ON = () => WORLD === 1 && !window.__napOff, NAP_N = 3, NAP_T = 8, REST_L = 2, REST_K = 0.75, DREAM_BONUS = 0.1, NAP_KEEP = 3;
function freeBeds() { let n = 0; for (let b = 0; b < DORM_CAP; b++) if (bedExists(b) && !dorm[b]) n++; return n; }
function napWhy(a, n) {
  if (!NAP_ON() || a.retake || a.mcls || n < 0 || freeBeds() <= NAP_KEEP) return '';
  if (CLASSES[n].final && !a.dream) return 'final';
  return (a.les || 0) >= NAP_N ? 'tired' : '';
}
function goNap(a, n, why) {
  const bed = freeBed(); dorm[bed] = a; a.bed = bed; a.goal = { t: 'n', i: n, k: why }; a.c = -1; a.since = Date.now();
  popup(why === 'final' ? '🌙' : '🥱', a.x, a.y, '#7b5cd6', 44);
  napToBed(a, 0);
}
function napToBed(a, t) { const p = DORM_SPOTS[a.bed]; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'nap'; a.t = t; a.dur = NAP_T; }); }
function finishNap(a) {
  if (a.bed >= 0 && dorm[a.bed] === a) dorm[a.bed] = null; a.bed = -1;
  const g = a.goal; a.les = 0; a.rest = REST_L; if (g.k === 'final') a.dream = true;
  S.stats.naps = (S.stats.naps || 0) + 1;
  popup(g.k === 'final' ? '✨🌙' : '✨😊', a.x, a.y, '#2f9e7a', 44);
  a.mood = Math.min(100, moodOf(a) + 6);
  route(a, g.i);
}
const nappers = (k) => dorm.reduce((n, a) => n + (a && a.goal && a.goal.t === 'n' && (!k || a.goal.k === k) ? 1 : 0), 0);
// ======================= the court (build 259, agreed plan «жизнь во дворе») =======================
// A student whose class has no room at the door waits in the court instead of the dorm: mood rises there. The dorm takes
// the overflow when the court is full. In the court they pass the time: chat on the benches, play tag round the fountain,
// throw a coin into it, try wand sparks, feed the birds, read under a tree; each activity lasts at least 2.5 s.
const courtList = [];
const COURT_CAP0 = 14;
// fountain upgrades (build 279, agreed plan: tap the fountain): benches = places in the court, fountain level = how fast mood rises
// there, «Монетка на счастье» = a coin thrown into the fountain gives that student +N% at his next exam
const MAX_BENCH = 10, MAX_FOUNT = 10, MAX_COIN = 10;
const courtUp = () => (S.courtUp ||= { bench: 1, fount: 1, coin: 0 });
const courtCap = () => (WORLD === 1 && COURT ? COURT_CAP0 + 3 * (courtUp().bench - 1) : 0);
const fountMoodK = () => 1 + 0.2 * (courtUp().fount - 1);
const coinLuck = () => (courtUp().coin ? 0.05 + 0.01 * (courtUp().coin - 1) : 0);   // build audit 2026-11-24: +1% per level (was +0.5% for 17.5B in her save)
const fountLineK = () => (WORLD === 1 && COURT ? 1 - 0.04 * (courtUp().fount - 1) : 1);   // build audit 2026-11-24: the fountain also calms the lines (court mood hit 100 in ~30 s at level 1, so its levels were wasted)
function courtBenches() {   // build 282 (her «Но они должны рисоваться»): every bench level puts one more real bench into the court
  const c = courtC(), W = COURT.x1 - COURT.x0, H = COURT.y1 - COURT.y0, out = [];
  [[0.75, 1], [2.36, 0], [3.93, 1], [5.5, 0]].forEach(([an, f]) => out.push({ x: c.x + Math.cos(an) * 3.6, y: c.y + Math.sin(an) * 3.6, f }));
  const extra = [];
  for (const [fx, fy] of [[0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) {   // the three lawn quarters (the graduates' garden takes the fourth)
    const x = COURT.x0 + W * fx, y = COURT.y0 + H * fy;
    extra.push({ x: x + 2.6, y: y - 1.6, f: 1 }, { x: x - 2.4, y: y + 2.8, f: 0 }, { x: x + 2.9, y: y + 2.7, f: 1 });
  }
  return out.concat(extra.slice(0, Math.max(0, (courtUp().bench || 1) - 1)));
}
// court prices follow the pace of the school (her «Как-то дёшево покупается фонтан. Покупки должны всегда соответствовать темпу
// игры», build 292): the base price grows with the entry fee (half the best lesson price), so a rich school pays more;
// a young school (fee <= 10) keeps the old prices. Steps per level a bit flatter (x2.0 / x2.1) since the base is already big.
const paceK = () => Math.max(1, fee() / 10);
const benchCost = () => Math.round(4000 * paceK() * Math.pow(2.0, courtUp().bench - 1));
const fountCost = () => Math.round(6000 * paceK() * Math.pow(2.0, courtUp().fount - 1));
const coinCost = () => Math.round(2000 * paceK() * Math.pow(1.6, courtUp().coin));   // build audit 2026-11-24: was 15000 x 2.1^level
const courtRoom = () => courtList.length < courtCap();
const courtFor = (i) => courtList.reduce((n, a) => n + (a.goal && a.goal.i === i && !a.goal.brk ? 1 : 0), 0);
const COURT_MOOD = 0.6;   // mood per second while waiting in the court
const COURT_BREAK = 0.3;  // share of students who take a short break in the court after a lesson (the court stays alive when nobody waits)
const courtBreakOk = () => courtCap() > 0 && courtList.length < courtCap() - 4;   // breaks leave room for those who really wait
const COURT_ACTS = ['bench', 'bench', 'tag', 'coin', 'sparks', 'birds', 'read', 'read', 'swing', 'tea', 'tea'];
// ======================= court lawn zones (her «Супер! Делаем», plan design/court_zones_plan_v1.jpg) =======================
// Each lawn quarter has its own role: reading garden (back-right), playground (front-left), tea glade (front-right); the
// back-left one is the graduates' garden. Break activities happen in their own corner. Art: art/parts/court_zones/sheet_r0.jpg
// (SYNTX banana2, 2 tokens) cut by tools/cut_court_zones.py -> assets/parts/outdoor/cz_*.webp.
function courtZones() {
  const W = COURT.x1 - COURT.x0, H = COURT.y1 - COURT.y0, q = (fx, fy) => ({ x: COURT.x0 + W * fx, y: COURT.y0 + H * fy });
  const R = q(0.78, 0.22), G = q(0.22, 0.78), T = q(0.78, 0.78);
  return { read: R, play: G, tea: T,
    cushions: [{ x: R.x - 1.5, y: R.y + 2.0 }, { x: R.x + 1.3, y: R.y + 1.8 }], shelf: { x: R.x - 0.3, y: R.y - 2.7 }, bath: { x: R.x - 3.6, y: R.y + 0.6 },   // her «кормление птичек происходит за деревом и не видно»: in the open left of the tree
    swing: { x: G.x, y: G.y }, target: { x: G.x + 0.7, y: G.y - 3.1 }, hop: { x: G.x - 3.0, y: G.y - 2.6 },
    picnic: { x: T.x - 0.2, y: T.y + 2.5 }, lanterns: [{ x: T.x - 3.2, y: T.y + 0.4 }, { x: T.x + 1.3, y: T.y - 2.8 }] };
}
function courtSpots() {   // fixed points per activity (a small fixed set keeps the path cache warm)
  if (courtSpots.ver === bfsVer + ':' + courtUp().bench && courtSpots.v) return courtSpots.v;
  const c = courtC(), W = COURT.x1 - COURT.x0, H = COURT.y1 - COURT.y0, ok = (p) => regAt(Math.floor(p.x), Math.floor(p.y)) === 'hall' && !courtBlocked(Math.floor(p.x), Math.floor(p.y));
  const v = { bench: [], tag: [], coin: [], sparks: [], birds: [], read: [], swing: [], tea: [] }, Z = courtZones();
  for (const b of courtBenches()) v.bench.push({ x: b.x + 0.08, y: b.y + 0.08, seat: true });   // build 264: the sitter sits ON the bench (pose «sit»)
  for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; v.tag.push({ x: c.x + Math.cos(an) * 2.7, y: c.y + Math.sin(an) * 2.7 }); }
  for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; v.tag.push({ x: Z.play.x + Math.cos(an) * 2.4, y: Z.play.y + 0.3 + Math.sin(an) * 2.4 }); }   // tag round the swing too
  for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + Math.PI / 4; v.coin.push({ x: c.x + Math.cos(an) * 2.7, y: c.y + Math.sin(an) * 2.7 }); }
  for (const q of Z.cushions) v.read.push({ x: q.x - 0.4, y: q.y - 0.3, seat: true });   // on the cushion (drawn after it: render adds +0.6 depth)   // reading garden: one reader per cushion, two more under the tree
  v.read.push({ x: Z.read.x + 1.0, y: Z.read.y + 1.1 }, { x: Z.read.x - 0.6, y: Z.read.y + 1.1 });   // in front of the trunk, never behind it
  v.birds.push({ x: Z.bath.x + 0.6, y: Z.bath.y + 0.9 }, { x: Z.bath.x - 0.5, y: Z.bath.y + 1.1 });
  v.sparks.push({ x: Z.target.x - 0.3, y: Z.target.y + 2.2, look: Z.target }, { x: Z.target.x + 1.6, y: Z.target.y + 1.7, look: Z.target }, { x: Z.target.x - 1.6, y: Z.target.y + 1.6, look: Z.target });
  v.swing.push({ x: Z.swing.x - 0.18, y: Z.swing.y + 0.18, seat: true });
  v.tea.push({ x: Z.picnic.x - 1.25, y: Z.picnic.y + 0.2, seat: true }, { x: Z.picnic.x + 0.25, y: Z.picnic.y + 1.25, seat: true }, { x: Z.picnic.x + 1.2, y: Z.picnic.y - 0.15, seat: true });
  for (const k of Object.keys(v)) v[k] = v[k].filter(ok);
  courtSpots.ver = bfsVer + ':' + courtUp().bench; courtSpots.v = v; return v;
}
function goCourt(a, i, brk = false) {
  a.goal = { t: 'k', i, brk }; a.c = -1; if (!brk) a.since = a.since || Date.now(); a.bed = -1;
  if (!courtList.includes(a)) courtList.push(a);
  if (!brk) popup('⛲', a.x, a.y, '#3a9fd0', 44);
  courtAct(a);
}
function leaveCourt(a) { const k = courtList.indexOf(a); if (k >= 0) courtList.splice(k, 1); a.act = null; }
function courtAct(a) {   // pick the next activity and walk to its spot
  const v = courtSpots(), near = (q) => Math.hypot(q.x - a.x, q.y - a.y) < 7;
  // build 273: the next activity is one with a spot close by (in her demo they spent most of the time crossing the court)
  const acts = inCourt(Math.floor(a.x), Math.floor(a.y)) ? COURT_ACTS.filter((k) => (v[k] || []).some(near)) : [];
  let act = rnd(acts.length ? acts : COURT_ACTS); if (!v[act] || !v[act].length) act = 'tag';
  const l0 = v[act] || [], l = l0.some(near) && acts.length ? l0.filter(near) : l0; if (!l.length) { a.state = 'court'; a.act = 'idle'; a.t = 0; a.dur = 3; return; }
  let p = rnd(l);
  if (p.seat) { const free = l.filter((q) => !q.seat || !courtList.some((o) => o !== a && o.act === act && o.spot === q)); if (!free.length) { act = 'tag'; p = rnd(v.tag); } else p = rnd(free); }   // one sitter per bench / cushion / swing / picnic place
  a.act = act; a.spot = p; a.laps = act === 'tag' ? 3 + Math.floor(Math.random() * 3) : 0;
  const j = p.seat ? 0 : 0.3;
  a.state = 'walk'; walk(a, p.x + (Math.random() - 0.5) * j, p.y + (Math.random() - 0.5) * j, () => courtArrive(a));
}
function courtArrive(a) {
  if (!(a.goal && a.goal.t === 'k')) return;
  a.state = 'court'; a.t = 0;
  if (a.act === 'tag') { a.dur = 0.35; return; }   // a short stop, then on round the fountain
  a.dur = 4.5 + Math.random() * 4;   // build 273: longer in each pose (her demo: half the time they were walking between spots)
  if (a.act === 'coin') { const c = courtC(); a.flip = (c.x - c.y) < (a.x - a.y); a.back = (c.x + c.y) < (a.x + a.y); }
  else if (a.spot && a.spot.look) { const c = a.spot.look; a.flip = (c.x - c.y) < (a.x - a.y); a.back = false; }   // the wand practice faces the target
  else if (a.act === 'tea') { const c = courtZones().picnic; a.flip = (c.x - c.y) < (a.x - a.y); a.back = false; }   // round the picnic, facing the tea
  else a.back = false;
}
function courtFx(a, x, y) {   // what each court activity shows (render only; every loop lasts 2.5 s or more)
  const T = performance.now() / 1000 + a.id * 0.77, u = (T % 3) / 3;
  if (a.act === 'bench') { if (u < 0.45) emoji(['💬', '💕', '😄', '🎶'][Math.floor(T / 3 + a.id) % 4], x + (a.id % 2 ? 12 : -12), y - 34 - u * 10, 11); }
  else if (a.act === 'tag') { if (u < 0.3) emoji('😆', x - 12, y - 32, 10); }
  else if (a.act === 'coin') { const f = Math.min(1, a.t / 1.2), c = courtC(), q = P(c.x, c.y), mx = x + (q.x - x) * f, my = y - 26 + (q.y - 30 - (y - 26)) * f - Math.sin(f * Math.PI) * 26;
    if (f < 1) emoji('🪙', mx, my, 10); else if (a.t < 2.2) emoji('✨', q.x, q.y - 34 - (a.t - 1.2) * 8, 14); }
  else if (a.act === 'sparks') { for (let k = 0; k < 3; k++) { const an = T * 2.1 + k * 2.094; emoji('✨', x + (a.flip ? -14 : 14) + Math.cos(an) * 8, y - 24 + Math.sin(an) * 5 - k * 2, 8 + 2 * Math.sin(T * 3 + k)); } }
  else if (a.act === 'birds' && !courtPose(a)) { for (let k = 0; k < 2; k++) { const hop = Math.abs(Math.sin(T * 2.4 + k * 1.7)) * 5; emoji('🐦', x + (k ? 16 : -15), y + 4 - hop, 9); } }
  else if (a.act === 'read' && !courtPose(a)) emoji('📖', x + (a.flip ? -11 : 11), y - 18, 11);
  else if (a.act === 'tea') { if (u < 0.45) emoji(['☕', '🧁', '💬', '😋'][Math.floor(T / 3 + a.id) % 4], x + (a.id % 2 ? 12 : -12), y - 30 - u * 10, 11); }
  else if (a.act === 'swing') { if (u < 0.35) emoji('😄', x - 12, y - 40, 10); }
}
function stepCourt(a, dt) {
  a.t += dt; if (a.t < a.dur) return;
  if (a.act === 'tag' && a.laps-- > 0) { const v = courtSpots().tag, p = rnd(v); a.state = 'walk'; walk(a, p.x, p.y, () => courtArrive(a)); return; }
  if (a.act === 'coin') { const c = courtC(); popup(coinLuck() ? '🍀✨' : '🪙✨', c.x, c.y, '#d4a017', 50); if (coinLuck()) { a.luck = coinLuck(); LORE.event('coin'); } }   // «Монетка на счастье»: luck for the next exam
  if (a.goal.brk && (a.acts = (a.acts || 0) + 1) >= 2) { a.acts = 0; leaveCourt(a); route(a, a.goal.i); return; }   // a break = two activities, then on to the next class
  courtAct(a);
}
function goClass(a, i) {
  if (i < 0) { goGraduate(a); return; }
  const [, h] = slotOf(i).door;
  a.c = i; a.state = 'walk'; a.goal = { t: 'c', i };
  walk(a, h[0] + 0.5, h[1] + 0.5, () => arriveClass(a, i));
}
function arriveClass(a, i) {
  a.woke = false;
  const d = freeDesk(i);
  if (d < 0 && waitList[i].length >= MAX_WAIT) {   // the line filled up while walking here
    a.state = 'walk';
    if (dormFree()) { popup('😢', a.x, a.y, '#5b7fd6', 44); goDorm(a, i); } else leaveSchool(a);
    return;
  }
  if (d < 0) { waitList[i].push(a); const p = waitSpot(i, waitList[i].length - 1); a.state = 'walkwait'; walk(a, p.x, p.y, () => { a.state = 'wait'; }); return; }
  seat(a, i, d);
}
function freeDesk(i) { for (let d = 0; d < S.classes[i].desks; d++) if (!deskOcc[i][d]) return d; return -1; }
function seat(a, i, d) {
  const p = seatPos(i, d);
  deskOcc[i][d] = a.id; a.desk = d; a.c = i; a.state = 'walk'; a.goal = { t: 's', i, d };
  walk(a, p.x, p.y, () => { a.state = 'study'; a.t = 0; a.dur = lessonTime(i) * (a.prepared ? 0.5 : 1) * (a.rest > 0 ? REST_K : 1); faceTeacher(a, i); });   // a rested student learns faster (dorm roles)   // the teacher is at the back wall: the whole class sits with its back to us   // face the teacher
}
// ======================= world 2: ore -> goods -> caravans (her «Супер, делай» 2026-11-22) =======================
// Every passed lesson in the mine (Штольня) brings ore to the store (capacity grows with the store upgrade); every passed
// lesson in the forge (Кузня) forges 2 ore into 1 item, without ore that lesson pays half; the gem cutters (Гранильня)
// sometimes cut a gem (4% a lesson). Items and gems go to the caravans (Торговый двор, next step).
const W2 = () => (S.w2 ||= { ore: 0, items: 0, gems: 0, store: 1 });
const oreCap = () => Math.round(40 * Math.pow(1.8, W2().store - 1));
const storeCost = () => paced(tuition(2) * 120 * Math.pow(2.0, W2().store - 1), W2().store);
const MAX_STORE = 15, ORE_FORGE = 2, ORE_MINE = 3, GEM_CHANCE = 0.04;   // build audit 2026-11-24: the mine (after the forge in the chain) dug 1, the forge took 2 -> half the forge lessons paid half forever; now 3 per mine lesson, the surplus fills the store, which feeds the forge while the mine stands (cave-in, incident)
const mineOpen = () => { const m = CLASSES.findIndex((c) => c.id === 'mine'); return m >= 0 && isOpen(m); };
const w2Id = (i) => (WORLD === 2 ? CLASSES[i].id : '');
const w2Pay = (i) => (w2Id(i) === 'forge' && W2().ore < ORE_FORGE && mineOpen() ? 0.5 : 1);   // a forge lesson without ore pays half (build audit 2026-11-24: not before the mine is open, the player cannot help it then)
const FISH_CHANCE = 0.15, FISH_MAX = 30;   // the lake hall's catch for the feasting hall
function w2Lesson(i, p) {
  const id = w2Id(i); if (!id) return; const w = W2();
  if (id === 'mine') { const n = Math.min(ORE_MINE, oreCap() - w.ore); if (n > 0) { w.ore += n; S.stats.ore = (S.stats.ore || 0) + n; if (!ffwd) popup('⛏️ +' + n, p.x + 0.4, p.y - 0.2, '#8a6d3b', 30); } }   // build audit 2026-11-24: a full store is the normal state now, no popup for it
  else if (id === 'forge') { if (w.ore >= ORE_FORGE) { w.ore -= ORE_FORGE; w.items++; S.stats.forged = (S.stats.forged || 0) + 1; if (!ffwd) popup('⚒️ +1', p.x + 0.4, p.y - 0.2, '#b0602c', 30); } else if (!ffwd) popup('нет руды', p.x + 0.4, p.y - 0.2, '#7a7a7a', 30); }
  else if (id === 'lake' && Math.random() < FISH_CHANCE) { if ((w.fish || 0) < FISH_MAX) { w.fish = (w.fish || 0) + 1; S.stats.fish = (S.stats.fish || 0) + 1; if (!ffwd) popup('🐟 +1', p.x + 0.4, p.y - 0.2, '#3f8fc0', 36); } else if (!ffwd && !cantBuilt()) popup('🐟 садок полон', p.x + 0.4, p.y - 0.2, '#7a7a7a', 36); }   // build audit 2026-11-24: the cap was silent
  else if (id === 'gems' && Math.random() < GEM_CHANCE) { w.gems++; S.stats.gemsCut = (S.stats.gemsCut || 0) + 1; if (!ffwd) popup('💎 +1', p.x + 0.4, p.y - 0.2, '#7b5cd6', 40); }
}
// ---- caravans (Торговый двор): items and gems are loaded into the wagon; a full wagon leaves by itself (or by the button)
// and comes back after the trip with coins. Works offline (stepWorld). Her plan 2026-11-22: about a third of world-2 income.
const TRADE_COST = 20000, MAX_TUP = 15;
const trade = () => { const w = W2(); return (w.trade ||= { built: false, wagon: 1, road: 1, price: 1, load: 0, gems: 0, away: 0, value: 0 }); };
const tradeOpen = () => WORLD === 2 && !!(S && S.w2 && bReady(S.w2.trade));
const wagonCap = () => 20 + 10 * (trade().wagon - 1);
const tripTime = () => Math.round(180 * Math.pow(0.9, trade().road - 1));
// build audit 2026-11-24: goods were priced off the forge (25 of 1845 base tuition) -> caravans gave 2-6% of income instead of
// the planned third. Now off the most expensive open hall (like fee()): an item = 0.6 of its lesson, a gem = 2.5 lessons;
// with every hall open that is ~27% of world-2 income at price level 1. Wagon and road decide how many goods get sold.
const ITEM_K = 0.6, GEM_K = 2.5, PRICE_STEP = 0.08, CARAVAN_WAIT = 300;
const topPay = () => { let mx = 0; for (let i = 0; i < CLASSES.length; i++) if (!CLASSES[i].final && isOpen(i)) mx = Math.max(mx, tuition(i)); return mx; };
const itemPrice = () => Math.round(Math.max(tuition(1), topPay() * ITEM_K) * (1 + PRICE_STEP * (trade().price - 1)));
const gemPrice = () => Math.round(Math.max(tuition(3) * 4, topPay() * GEM_K) * (1 + PRICE_STEP * (trade().price - 1)));
const tupCost = (k) => paced(TRADE_COST * 0.6 * Math.pow(k === 'wagon' ? 2.6 : 2.4, trade()[k] - 1), trade()[k]);   // steeper (sim: all 15 levels were bought by day ~4)
const loadValue = () => trade().load * itemPrice() + trade().gems * gemPrice();
let tradeAcc = 0;
function sendCaravan() { const T = trade(); if (T.away || !(T.load + T.gems)) return; T.value = loadValue(); T.away = tripTime(); T.trip = T.away; T.load = 0; T.gems = 0; T.wt = 0; if (!ffwd) toast(`🐐 Караван ушёл: вернётся через ${mmss(T.away)} с 🪙${fmt(T.value)}`); }
function stepTrade(dt) {
  if (!tradeOpen()) return; const T = trade(), w = W2();
  if (T.away) { T.away = Math.max(0, T.away - dt); if (!T.away) { const s = SLOTS.TRADE; earn(T.value, s.x0 + 3, s.y0 + 2, '#c98a00', 60); S.stats.caravans = (S.stats.caravans || 0) + 1; if (!ffwd) toast(`🐐 Караван вернулся: 🪙 +${fmt(T.value)}`); T.value = 0; } return; }
  tradeAcc += dt; if (tradeAcc < 1) return; tradeAcc = 0;
  const room = wagonCap() - T.load - T.gems; if (room > 0) { const g = Math.min(room, w.gems); T.gems += g; w.gems -= g; const it = Math.min(room - g, w.items); T.load += it; w.items -= it; }
  if (T.load + T.gems >= wagonCap() || (T.load + T.gems > 0 && (T.wt = (T.wt || 0) + 1) >= CARAVAN_WAIT)) sendCaravan();   // build audit 2026-11-24: a big wagon on a small school stood half-full for an hour; now it also leaves after 5 min
}
function tradePanel() {
  const T = trade(), w = W2();
  if (!T.built) { const fi = CLASSES.findIndex((c) => c.id === 'forge'), ok = fi >= 0 && isOpen(fi);
    return `<div class="sh-head"><span class="remoji big">🐐</span><div><h2>Торговый двор</h2><div class="muted">Караваны везут изделия наверх, к людям</div></div><button class="x" data-close>✕</button></div>
    <p>Изделия из Кузни ⚒️ и самоцветы 💎 грузятся в повозку. Полная повозка сама уходит с караваном и возвращается с монетами.</p>
    ${ok ? `<button class="btn wide" data-cost="${TRADE_COST}" data-act="tradebuild">Построить <span class="cost">🪙${fmt(TRADE_COST)}</span></button>` : '<p><b>Сначала построй Кузню ⚒️</b> — там делают изделия.</p>'}`; }
  const up = (k, emo, name, txt, mx) => `<div class="card up"><span class="remoji">${emo}</span><div class="grow"><b>${name}</b> <span class="muted">ур. ${T[k]}/${mx}</span><div class="muted">${txt}</div></div>
      ${T[k] >= mx ? '<span class="done">макс.</span>' : costBtn('↑', tupCost(k), 'tup', `data-k="${k}"`)}</div>`;
  return `<div class="sh-head"><span class="remoji big">🐐</span><div><h2>Торговый двор</h2><div class="muted">${T.away ? `Караван в пути: вернётся через ${mmss(T.away)}` : 'Повозка грузится'}</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>📦</span><b>${T.load + T.gems}/${wagonCap()}</b><i>в повозке</i></div><div><span>⚒️</span><b>${fmt(w.items)}</b><i>на складе</i></div><div><span>💰</span><b>${fmt(T.away ? T.value : loadValue())}</b><i>${T.away ? 'везут' : 'стоит груз'}</i></div></div>
    <p class="muted">Изделие ⚒️ стоит 🪙${fmt(itemPrice())}, самоцвет 💎 — 🪙${fmt(gemPrice())}. Дорога: ${mmss(tripTime())}. Полная повозка уходит сама, неполная — через 5 минут. Цена изделий растёт вместе с платой за уроки в самом дорогом зале.${w.items > wagonCap() * 2 ? ' <b>Повозка не успевает вывозить изделия — улучши повозку или дорогу.</b>' : ''}</p>
    ${T.away ? '' : `<button class="btn wide" data-act="caravan" ${T.load + T.gems ? '' : 'disabled'}>Отправить сейчас <span class="cost">🪙${fmt(loadValue())}</span></button>`}
    ${(() => { const nx = (k, now, next) => (T[k] >= MAX_TUP ? `сейчас ${now}` : `сейчас ${now} → станет ${next}`);   // her «как было -10% пути так и осталось»: the card showed only the per-level step
      return up('wagon', '🛒', 'Повозка больше', `${nx('wagon', wagonCap() + ' мест', wagonCap() + 10 + ' мест')} (+10 за уровень)`, MAX_TUP)
        + up('road', '🛤️', 'Дорога короче', `путь ${nx('road', mmss(tripTime()), mmss(Math.round(180 * Math.pow(0.9, T.road))))} (−10% за уровень)`, MAX_TUP)
        + up('price', '⚖️', 'Цена выше', `${nx('price', '+' + Math.round(PRICE_STEP * 100 * (T.price - 1)) + '%', '+' + Math.round(PRICE_STEP * 100 * T.price) + '%')} к цене изделий и самоцветов`, MAX_TUP); })()}${T.away ? '<p class="muted">Караван, который уже в пути, едет со старым временем; новое время — со следующего рейса.</p>' : ''}`;
}
// ---- the elder's throne + rumble from the depths (world 2) ----
const THRONE_COST = 20000000, THRONE_NEED = 'guards';
const RUMBLE_WARN = 40, RUMBLE_LEN = 90, RUMBLE_MIN = 720, RUMBLE_MAX = 1080, THRONE_MAX = 10;
const THRONE_UP = {
  watch: { emo: '🛡️', name: 'Дозор у глубин', base: 4000000, k: 2.0, desc: (l) => `на защиту ${RUMBLE_LEN + 10 * l} с` },
  props: { emo: '🪵', name: 'Крепь в тоннелях', base: 5000000, k: 2.0, desc: (l) => `нужно отбить на ${8 * l}% меньше` },
  loot: { emo: '💰', name: 'Добыча из глубин', base: 3000000, k: 1.9, desc: (l) => `сундук +${15 * l}%` },
};
const throne = () => { const w = W2(); return (w.throne ||= { built: false, t: RUMBLE_MIN, cur: null, won: 0, lost: 0, watch: 0, props: 0, loot: 0 }); };
const thCost = (k) => paced(THRONE_UP[k].base * Math.pow(THRONE_UP[k].k, throne()[k] || 0), (throne()[k] || 0) + 1);
const guardsIdx = () => CLASSES.findIndex((c) => c.id === THRONE_NEED);
// build audit 2026-11-24: the need climbed to 15 after 12 wins and never dropped, while 6 guard desks pass ~9 in 90 s -> every
// rumble lost. Now a heat level (+1 a win, -3 a loss, 0..12) and never more than 70% of what the guard hall really passed lately.
const rumbleRate = () => { const T = throne(); if (T.rate) return T.rate; const g = guardsIdx(); return g >= 0 ? S.classes[g].desks * success(g) / lessonTime(g) * 0.5 : 0.05; };   // guard passes per second (measured live, or a cautious estimate)
const rumbleHeat = () => { const T = throne(); return T.heat ?? Math.min(12, T.won); };
const rumbleNeed = () => Math.max(2, Math.round(Math.min(3 + rumbleHeat(), 0.7 * rumbleRate() * rumbleLen()) * (1 - 0.08 * (throne().props || 0))));
const CAVE_LEN = 180;   // a cave-in left alone clears itself in 3 minutes (world 2 has no caretaker upgrade; it lasted 10 min)
const rumbleLen = () => RUMBLE_LEN + 10 * (throne().watch || 0);
const rumbleOn = () => WORLD === 2 && dirBuilt() && guardsIdx() >= 0 && isOpen(guardsIdx());
function rumbleChest() { const c = Math.round(Math.max(500, (rateNow() || 1) * 120) * (1 + 0.15 * (throne().loot || 0))), g = 1 + Math.floor(Math.random() * 3); return { c, g }; }
function stepRumble(dt, live) {
  if (!rumbleOn()) return;
  const T = throne(); if (!live) { T.pc = 0; T.rt = 0; return; }   // build audit 2026-11-24: the pass meter only counts live time
  if (calm() || tourStep >= 0 || (typeof MG !== 'undefined' && MG.isOpen())) { T.pc = 0; T.rt = 0; return; }
  T.rt = (T.rt || 0) + dt; if (T.rt >= 60) { const r = (T.pc || 0) / T.rt; T.rate = T.rate ? T.rate * 0.7 + r * 0.3 : r; T.rt = 0; T.pc = 0; }   // build audit 2026-11-24: live guard-hall pass rate
  if (!T.cur) {
    T.t -= dt;
    if (T.t <= RUMBLE_WARN && !T.warned) { T.warned = 1; toast('🌑 Из глубин доносится гул! Скоро тени полезут наверх'); hintOnce('rumble', '🌑', 'Гул из глубин', `Через ${RUMBLE_WARN} секунд из глубины горы полезут тени. Пока длится защита, каждый сданный урок в Зале стражей 🛡️ отбивает одну тень. Отбьёте сколько нужно — получите сундук с монетами и самоцветами. Не успеете — обвал закроет один зал, его надо будет расчистить нажатием.`); }
    if (T.t <= 0) { T.cur = { left: rumbleLen(), need: rumbleNeed(), got: 0 }; T.warned = 0; if (S.inc) delete S.inc[guardsIdx()];   // the guards rally: their hall is cleared at once
      toast(`🌑 Тени лезут из глубин! Отбейте ${T.cur.need} в Зале стражей 🛡️`); sfx('stars'); }
    return;
  }
  T.cur.left -= dt;
  if (T.cur.got >= T.cur.need) { const { c, g } = rumbleChest(); bonus(c); W2().gems += g; T.heat = Math.min(12, rumbleHeat() + 1); T.won++; S.stats.rumbleWon = (S.stats.rumbleWon || 0) + 1; toast(`🎁 Тени отбиты! Сундук: 🪙 +${fmt(c)} и 💎 +${g}`); T.cur = null; T.t = RUMBLE_MIN + Math.random() * (RUMBLE_MAX - RUMBLE_MIN); dirtyPanel = true; return; }
  if (T.cur.left <= 0) {
    T.lost++; T.heat = Math.max(0, rumbleHeat() - 3); T.cur = null; T.t = RUMBLE_MIN + Math.random() * (RUMBLE_MAX - RUMBLE_MIN);
    const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i) && !(S.inc && S.inc[i]) && i !== guardsIdx());
    if (open.length && Object.keys(S.inc || {}).length < INC_MAXN) { const i = rnd(open); S.inc ||= {}; S.inc[i] = { k: 'r', t: Math.max(0, INC_AUTO_AT(dirLvl('keeper')) - CAVE_LEN) }; toast(`🪨 Тени прорвались: обвал в зале «${CLASSES[i].name}»! Нажми на зал, чтобы расчистить (сам расчистится через 3 минуты)`); }   // build audit 2026-11-24: starts near the end of the auto-clear time; no third blocked hall
    else toast('🌑 Тени прорвались, но залы устояли');
    dirtyPanel = true;
  }
}
function rumbleLesson(i, p) {   // a passed lesson in the guard hall during the defence beats one shadow
  const T = WORLD === 2 && S.w2 && S.w2.throne; if (!T || CLASSES[i].id !== THRONE_NEED) return;
  if (!ffwd && rumbleOn()) T.pc = (T.pc || 0) + 1;   // build audit 2026-11-24: counted for the adaptive need
  if (!T.cur) return;
  T.cur.got++; if (!ffwd) popup(`🛡️ ${T.cur.got}/${T.cur.need}`, p.x, p.y - 0.4, '#3b6fd6', 54);
}
function throneBuildPanel() {
  const gi = guardsIdx(), ok = gi >= 0 && isOpen(gi);
  return `<div class="sh-head"><span class="remoji big">👑</span><div><h2>Трон старейшины</h2><div class="muted">Здесь решают судьбу всей школы</div></div><button class="x" data-close>✕</button></div>
    <p>Старейшина слушает гул из глубин горы. Когда тени полезут наверх, ученики Зала стражей 🛡️ отобьют их, а школа получит сундук с добычей.</p>
    ${ok ? `<button class="btn wide" data-cost="${THRONE_COST}" data-act="thronebuild">Построить <span class="cost">🪙${fmt(THRONE_COST)}</span></button>` : '<p><b>Сначала построй Зал стражей 🛡️</b> — без стражей тени не отбить.</p>'}`;
}
function thronePanel() {
  const T = throne(), c = T.cur;
  let h = `<div class="sh-head"><span class="remoji big">👑</span><div><h2>Трон старейшины</h2><div class="muted">${c ? `🌑 Тени лезут! Осталось ${mmss(c.left)}` : calm() ? 'Спокойный режим: гула нет' : `Следующий гул примерно через ${mmss(T.t)}`}</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🛡️</span><b>${c ? `${c.got}/${c.need}` : rumbleNeed()}</b><i>${c ? 'отбито' : 'нужно отбить'}</i></div><div><span>🎁</span><b>${T.won}</b><i>побед</i></div><div><span>🪨</span><b>${T.lost}</b><i>обвалов</i></div></div>
    <p class="muted">Пока идёт защита, каждый сданный урок в Зале стражей отбивает одну тень. Больше парт и сильнее учитель в Зале стражей — быстрее защита. С каждой победой теней становится больше, после прорыва — меньше. Больше, чем успевает Зал стражей, их не бывает.</p>`;
  for (const [k, u] of Object.entries(THRONE_UP)) {
    const l = T[k] || 0;
    h += `<div class="card up"><span class="remoji">${u.emo}</span><div class="grow"><b>${u.name}</b> <span class="muted">ур. ${l}/${THRONE_MAX}</span><div class="muted">сейчас: ${u.desc(l)}${l < THRONE_MAX ? `<br>станет: ${u.desc(l + 1)}` : ''}</div></div>
      ${l >= THRONE_MAX ? '<span class="done">макс.</span>' : costBtn('↑', thCost(k), 'throneup', `data-k="${k}"`)}</div>`;
  }
  return h;
}
// ---- the gates of the deep: expeditions and relics (world 2) ----
const EXPED_COST = 60000000, EXPED_NEED = 'gems';
const RELICS = [['👑', 'Корона первого короля'], ['📯', 'Рог глубин'], ['🗝️', 'Древний ключ'], ['🪨', 'Скрижаль предков'], ['💎', 'Сердце горы'], ['🏆', 'Кубок пира'],
  ['🔨', 'Молот прародителя'], ['🗺️', 'Карта забытых шахт'], ['🔥', 'Негаснущий уголь'], ['❄️', 'Ледяная руна'], ['🔔', 'Колокол тишины'], ['📜', 'Свиток основателей']];
const DEPTHS = [{ name: 'Ближние штольни', emo: '⛏️', min: 30, need: 5, relic: 0.3, pool: 6, gems: [1, 3] },
  { name: 'Забытые залы', emo: '🕳️', min: 120, need: 15, relic: 0.7, pool: 10, gems: [3, 6] },
  { name: 'Корни горы', emo: '🔥', min: 480, need: 40, relic: 1, pool: 12, gems: [8, 12] }];
const EXPED_MAX = 10;
const exped = () => { const w = W2(); return (w.exped ||= { built: false, seekers: 0, gear: 0, camp: 0, cur: null, relics: {}, trips: 0 }); };
const expedOpen = () => WORLD === 2 && !!(S && S.w2 && bReady(S.w2.exped));
const seekCap = () => 50;   // build audit 2026-11-24: the camp raised this cap, which no trip ever needed
const campGems = (d) => (exped().camp || 0) * (d + 1);   // the camp now gives extra gems per trip: +1/+2/+3 per level for the near/forgotten/deep trips
const tripMin = (d) => Math.round(DEPTHS[d].min * Math.pow(0.92, exped().gear || 0));
const exCostUp = (k) => paced(EXPED_COST * 0.15 * Math.pow(2.0, exped()[k] || 0), (exped()[k] || 0) + 1);
function relicK() { const r = S && S.w2 && S.w2.exped && S.w2.exped.relics; return r ? 1 + 0.02 * Object.keys(r).length : 1; }
function w2Seeker() { if (!expedOpen()) return; const E = exped(); if (E.seekers < seekCap()) E.seekers++; }
function sendExped(d) { const E = exped(), D = DEPTHS[d]; if (!D || E.cur || E.seekers < D.need) return; E.seekers -= D.need; E.cur = { d, end: Date.now() + tripMin(d) * 60000 }; toast(`🎒 Отряд ушёл в «${D.name}»: вернётся через ${tripMin(d)} мин`); }
function stepExped() {
  if (!expedOpen()) return; const E = exped(); if (!E.cur || Date.now() < E.cur.end) return;
  const D = DEPTHS[E.cur.d], coins = Math.round(Math.max(1000, (rateNow() || 1) * 60 * D.min * 0.12) * (1 + 0.05 * (exped().gear || 0))), g = D.gems[0] + Math.floor(Math.random() * (D.gems[1] - D.gems[0] + 1));
  bonus(coins); W2().gems += g; E.trips++; const cg = campGems(E.cur.d); W2().gems += cg; S.stats.expeds = (S.stats.expeds || 0) + 1;
  let msg = `🎒 Отряд вернулся из «${D.name}»: 🪙 +${fmt(coins)}, 💎 +${g + cg}`;
  if (Math.random() < D.relic) { const fr = [...Array(D.pool).keys()].filter((q) => !E.relics[q]), k = fr.length ? rnd(fr) : Math.floor(Math.random() * D.pool); /* build audit 2026-11-24: no duplicates while new relics are left (album mean was ~12 days, ~29 copies) */ if (!E.relics[k]) { E.relics[k] = 1; msg += ` и реликвия ${RELICS[k][0]} «${RELICS[k][1]}»!`; } else { const extra = coins; bonus(extra); msg += ` и копия реликвии ${RELICS[k][0]} (продана: 🪙 +${fmt(extra)})`; } }
  E.cur = null; if (!ffwd) toast(msg); dirtyPanel = true;
}
function expedPanel() {
  const E = exped();
  if (!E.built) { const gi = CLASSES.findIndex((c) => c.id === EXPED_NEED), ok = gi >= 0 && isOpen(gi);
    return `<div class="sh-head"><span class="remoji big">🕳️</span><div><h2>Врата глубин</h2><div class="muted">Отсюда искатели уходят вглубь горы</div></div><button class="x" data-close>✕</button></div>
    <p>Выпускники становятся искателями. Отряд уходит в глубины на 30 минут — 8 часов (даже когда игра закрыта) и приносит монеты, самоцветы и древние реликвии. Каждая реликвия навсегда добавляет +2% к плате за уроки во втором мире.</p>
    ${ok ? `<button class="btn wide" data-cost="${EXPED_COST}" data-act="expedbuild">Построить <span class="cost">🪙${fmt(EXPED_COST)}</span></button>` : '<p><b>Сначала построй Гранильню 💎</b> — без мастеров камня в глубины не спуститься.</p>'}`; }
  const n = Object.keys(E.relics).length;
  let h = `<div class="sh-head"><span class="remoji big">🕳️</span><div><h2>Врата глубин</h2><div class="muted">${E.cur ? `Отряд в «${DEPTHS[E.cur.d].name}»: вернётся через ${mmss((E.cur.end - Date.now()) / 1000)}` : 'Отряд в лагере'}</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🎒</span><b>${E.seekers}/${seekCap()}</b><i>искатели</i></div><div><span>🏺</span><b>${n}/${RELICS.length}</b><i>реликвии</i></div><div><span>💰</span><b>+${n * 2}%</b><i>к плате</i></div></div>
    <p class="muted">Каждый выпускник второго мира становится искателем. Найденная реликвия навсегда добавляет +2% к плате за уроки. Отряд приносит только новые реликвии, пока они есть на этой глубине; потом копии продаются.</p>`;
  DEPTHS.forEach((D, d) => { const can = !E.cur && E.seekers >= D.need;
    h += `<div class="card up"><span class="remoji">${D.emo}</span><div class="grow"><b>${D.name}</b><div class="muted">${tripMin(d)} мин · нужно 🎒 ${D.need} · реликвия ${Math.round(D.relic * 100)}% (найдено ${Object.keys(E.relics).filter((q) => +q < D.pool).length}/${D.pool}) · 💎 ${D.gems[0] + campGems(d)}–${D.gems[1] + campGems(d)}</div></div>
      <button class="btn" data-act="exped" data-k="${d}" ${can ? '' : 'disabled'}>Отправить</button></div>`; });
  h += '<h3>Реликвии</h3><div class="stats3" style="flex-wrap:wrap">' + RELICS.map(([e, nm], k) => `<div style="min-width:30%"><span>${E.relics[k] ? `<img src="assets/relics/r${k}.webp" alt="" style="width:44px;height:44px;object-fit:contain">` : '❔'}</span><i>${E.relics[k] ? nm : '???'}</i></div>`).join('') + '</div>';
  for (const [k, emo, nm, txt0] of [['gear', '🪢', 'Снаряжение', '−8% времени похода и +5% монет за уровень'], ['camp', '⛺', 'Лагерь искателей', '+1 за уровень, в глубинах больше']]) { const l = E[k] || 0, b = (d) => { E[k] = (E[k] || 0) + d; }, mx = l >= EXPED_MAX;
    const txt = (k === 'gear' ? nn('первый поход', tripMin(0) + ' мин', peek(b, () => tripMin(0)) + ' мин', mx) : nn('самоцветов за поход сверху', '+' + campGems(0), '+' + peek(b, () => campGems(0)), mx)) + ` (${txt0})`;
    h += `<div class="card up"><span class="remoji">${emo}</span><div class="grow"><b>${nm}</b> <span class="muted">ур. ${l}/${EXPED_MAX}</span><div class="muted">${txt}</div></div>
      ${l >= EXPED_MAX ? '<span class="done">макс.</span>' : costBtn('↑', exCostUp(k), 'expedup', `data-k="${k}"`)}</div>`; }
  return h;
}
function w2Section(i) {
  const id = w2Id(i), w = WORLD === 2 ? W2() : null; if (!w) return '';
  if (id === 'mine') return `<h3>Склад руды</h3><p class="muted">Каждый сданный урок здесь приносит ⛏️ ${ORE_MINE} руды. Руду забирает Кузня: из 2 руды выходит 1 изделие ⚒️. Запас на складе кормит Кузню, когда Штольня стоит (обвал или происшествие): чем больше склад, тем дольше Кузня работает без перерыва.</p>
    <div class="card up"><span class="remoji">📦</span><div class="grow"><b>Склад: ${fmt(w.ore)}/${fmt(oreCap())}</b> <span class="muted">ур. ${w.store}/${MAX_STORE}</span><div class="muted">${w.ore >= oreCap() ? 'склад полон. ' : ''}${nn('вмещает', fmt(oreCap()), fmt(peek((d) => { w.store += d; }, oreCap)), w.store >= MAX_STORE)}</div></div>
      ${w.store >= MAX_STORE ? '<span class="done">макс.</span>' : costBtn('↑', storeCost(), 'store')}</div>`;
  if (id === 'forge') return `<h3>Руда и изделия</h3><p class="muted">Каждый сданный урок забирает ⛏️ 2 руды из Штольни и даёт ⚒️ 1 изделие. Когда Штольня построена, урок без руды платит вдвое меньше.</p>
    <div class="stats3"><div><span>⛏️</span><b>${fmt(w.ore)}</b><i>руда</i></div><div><span>⚒️</span><b>${fmt(w.items)}</b><i>изделия</i></div><div><span>💎</span><b>${fmt(w.gems)}</b><i>самоцветы</i></div></div>`;
  if (id === 'lake') return `<h3>Светящаяся рыба</h3><p class="muted">После урока здесь иногда ловят 🐟 рыбу (${Math.round(FISH_CHANCE * 100)}%). Её подают в Пиршественном зале: обед с рыбой стоит вдвое дороже. Сейчас: <b>${w.fish || 0}/${FISH_MAX}</b>${!cantBuilt() && (w.fish || 0) >= FISH_MAX ? ' — садок полон, построй Пиршественный зал' : ''}.</p>`;   // build audit 2026-11-24
  if (id === 'gems') return `<h3>Самоцветы</h3><p class="muted">После каждого сданного урока есть шанс ${Math.round(GEM_CHANCE * 100)}%, что ученик огранит 💎 самоцвет. Сейчас: <b>${fmt(w.gems)}</b>.</p>`;
  return '';
}
function finishLesson(a) {
  const i = a.c, p = deskPos(i, a.desk);
  const dream = (a.dream && CLASSES[i].final ? DREAM_BONUS : 0) + (CLASSES[i].final && loreQ('world') ? 0.03 : 0);   // + Tikhon's exam «Мир»
  if (CLASSES[i].final) a.dream = false;   // dorm roles: slept before the Final (build audit 2026-11-24: this sat inside the comment above, the bonus never wore off)
  a.les = (a.les || 0) + 1; if (a.rest > 0) a.rest--;   // dorm roles: tiredness grows with every lesson, the rest wears off
  const bonus = (a.prepared ? libBonus() : 0) + (a.fed ? FED_BONUS : 0) + (mcActive(i) ? MC_BONUS : 0) + (a.luck || 0) + dream; a.prepared = false; a.fed = false; a.luck = 0;   // a meal in the canteen helps one exam
  if (Math.random() < Math.max(0.05, Math.min(0.95, success(i) + bonus + moodBonus(a)))) { S.stats.passed++; passAt[i] = performance.now(); formXp(a, i); mcLesson(i); if (CLASSES[i].final && !ffwd) examSeal(i, a.desk); earn(Math.round(tuition(i) * payMul(a) * w2Pay(i)), p.x, p.y, null, 46); w2Lesson(i, p); rumbleLesson(i, p); rankTry(a, i, p); a.mood = Math.min(100, moodOf(a) + 8); popup(rnd(['🎉', '🥳', '😄']), p.x - 0.3, p.y - 0.3, '#ff8a3d', 62); leaveDesk(a); }
  else { S.stats.failed++; (window.__failAt ||= {})[i] = performance.now(); popup('💧 не сдал', p.x, p.y, '#5b7fd6', 46); if (libFree()) { freeDeskOf(a); goLibrary(a, i); } else { a.t = 0; a.dur = lessonTime(i); } }
}
// library: students who failed study here, then go back to their class for the exam again
let LS = SLOTS.LIB;
// 16 reading places (4x4); upgrades open more of them, speed up reading and raise the exam bonus
const LIB_SPOTS = [];
function libSpots() { LIB_SPOTS.length = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) LIB_SPOTS.push({ x: LS.x0 + 1.1 + c * 1.3, y: LS.y0 + 1.8 + r * 1.6 }); }
libSpots();
const MAX_LIB_SEATS = 16, MAX_LIB_LVL = 10;
const libUp = () => (S.libUp ||= { seats: 1, speed: 1, bonus: 1 });
const libSeats = () => Math.min(MAX_LIB_SEATS, 7 + libUp().seats);           // 8 seats at level 1
const libTime = () => 6 * Math.pow(0.88, libUp().speed - 1);
const libBonus = () => 0.15 + 0.03 * (libUp().bonus - 1);
const libSeatsCost = () => paced(200 * Math.pow(1.6, libUp().seats - 1), libUp().seats);
const libSpeedCost = () => paced(150 * Math.pow(1.5, libUp().speed - 1), libUp().speed);
const libBonusCost = () => paced(250 * Math.pow(1.55, libUp().bonus - 1), libUp().bonus);
const lib = Array(LIB_SPOTS.length).fill(null);
const libSeat = () => { for (let k = 0; k < libSeats(); k++) if (!lib[k]) return k; return -1; };
const libFree = () => libSeat() >= 0;
function freeDeskOf(a) { const i = a.c; deskOcc[i][a.desk] = null; a.desk = -1; pullWaiting(i); }
function goLibrary(a, i, seatNo = libSeat(), t = 0) {
  lib[seatNo] = a; a.seat = seatNo; a.goal = { t: 'l', i }; a.c = -1; a.state = 'walk';
  const p = LIB_SPOTS[seatNo];
  walk(a, p.x, p.y, () => { a.state = 'read'; a.t = t; a.dur = libTime(); a.flip = true; });
}
function finishReading(a) {
  S.stats.read = (S.stats.read || 0) + 1;
  lib[a.seat] = null; a.seat = -1; a.prepared = true;
  popup('💡', a.x, a.y, '#e0a100', 44);
  route(a, a.goal.i);
}
const shopLine = [];
function lineSort(line, place) {   // students who reached the line go ahead of those still walking there
  const before = line.slice(), sorted = line.filter((a) => a.inLine).concat(line.filter((a) => !a.inLine));
  if (sorted.every((a, k) => a === before[k])) return; line.length = 0; line.push(...sorted);
  sorted.forEach((a, k) => { if (a !== before[k]) place(a); });
}
function shopPlace(a) { const k = shopLine.indexOf(a), sp = SHOP_SPOTS(SLOTS.SHOP)[Math.min(k, 5)]; a.state = 'walk'; walk(a, sp.x, sp.y, () => { a.inLine = true; if (lineSort(shopLine, shopPlace), shopLine.indexOf(a) !== k) return; a.state = k === 0 ? 'shopping' : 'shopwait'; a.t = 0; a.dur = shopTime(); a.back = true; }); }
function goShop(a, next) {
  if (shopLine.length >= 6) { route(a, next); return; }   // the line is full: maybe next time
  a.goal = { t: 'shop', n: next }; a.c = -1; shopLine.push(a); shopPlace(a);
}
function finishShopping(a) {
  const gem = WORLD === 2 && S.w2 && S.w2.gems > 0; if (gem) S.w2.gems--;   // world 2: an amulet with a gem sells for x3
  const p = shopPrice() * (gem ? 3 : 1); earn(p, a.x, a.y, '#d96b9f', 44); if (gem && !ffwd) popup('💎', a.x + 0.3, a.y - 0.5, '#7b5cd6', 50); S.stats.shop = (S.stats.shop || 0) + 1;
  a.mood = Math.min(100, (a.mood ?? 80) + 15); popup(rnd(['🍭', '🧁', '🪶', '📜', '🍬']), a.x - 0.3, a.y - 0.3, '#d96b9f', 60);
  a.back = false; a.inLine = false; const k = shopLine.indexOf(a); if (k >= 0) shopLine.splice(k, 1); route(a, a.goal.n);
  shopLine.forEach(shopPlace);   // the line moves up
}
const cantLine = [], cantSeats = Array(12).fill(null);
function cantPlace(a) { const k = cantLine.indexOf(a), sp = CANT_SPOTS(SLOTS.CANT)[Math.min(k, 5)]; a.state = 'walk'; walk(a, sp.x, sp.y, () => { a.inLine = true; if (lineSort(cantLine, cantPlace), cantLine.indexOf(a) !== k) return; a.state = k === 0 ? 'cantbuy' : 'cantwait'; a.t = 0; a.dur = cantServe(); a.back = true; }); }
function goCanteen(a, next) {
  if (cantLine.length >= 6) { route(a, next); return; }   // the line is full: maybe next time
  a.goal = { t: 'cant', n: next }; a.c = -1; cantLine.push(a); cantPlace(a);
}
const freeCantSeat = () => { for (let k = 0; k < 2 * cantTables(); k++) if (!cantSeats[k]) return k; return -1; };
function cantServed(a) {   // the tray is ready: pay, take a seat (or wait at the counter while every seat is taken)
  const k = freeCantSeat(); if (k < 0) { a.t = a.dur; return; }
  const fish = WORLD === 2 && S.w2 && S.w2.fish > 0; if (fish) S.w2.fish--; a.fish = fish;   // a glowing-fish dinner: double price, extra mood
  earn(cantPrice() * (fish ? 2 : 1), a.x, a.y, '#e08a3d', 44); S.stats.cant = (S.stats.cant || 0) + 1;
  a.dish = fish ? '🐟' : rnd(cantDishes()); a.cseat = k; cantSeats[k] = a;
  a.back = false; a.inLine = false; const i = cantLine.indexOf(a); if (i >= 0) cantLine.splice(i, 1);
  const p = cantSeatPos(k); a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'eat'; a.t = 0; a.dur = CANT_EAT; a.flip = p.flip; a.back = false; });
  cantLine.forEach(cantPlace);   // the line moves up
}
function finishEating(a) {
  if (a.cseat >= 0 && cantSeats[a.cseat] === a) cantSeats[a.cseat] = null; a.cseat = -1;
  a.mood = Math.min(100, moodOf(a) + cantMood() + (a.fish ? 10 : 0)); a.fed = true; a.fish = false;
  popup(rnd(['😋', '🥰', '😊']), a.x - 0.3, a.y - 0.3, '#e08a3d', 60);
  route(a, a.goal.n);
}
function leaveDesk(a) {
  const i = a.c;
  deskOcc[i][a.desk] = null; a.desk = -1; a.state = 'walk';
  const n = nextClass(i), why = napWhy(a, n);
  if (why) goNap(a, n, why);   // dorm roles: a nap before the Final or when tired
  else if (cantOpen() && SLOTS.CANT && n >= 0 && Math.random() < cantChance()) goCanteen(a, n);
  else if (shopOpen() && n >= 0 && Math.random() < shopChance()) goShop(a, n);
  else if (n >= 0 && courtBreakOk() && Math.random() < COURT_BREAK) goCourt(a, n, true);   // build 259: a break in the court
  else route(a, n);
  pullWaiting(i);
}
function pullWaiting(i) {
  while (waitList[i].length) { const d = freeDesk(i); if (d < 0) break; seat(waitList[i].shift(), i, d); }
  waitList[i].forEach((w, k) => { const p = waitSpot(i, k); w.state = 'walkwait'; walk(w, p.x, p.y, () => { w.state = 'wait'; }); });
}
// ======================= school rating (build 241, tester Ruslan's idea, Maria's pick 2026-11-22: «Рейтинг сейчас, топ потом») =======================
// Every graduate leaves a review of 1..5 stars: the higher the rank and the better the mood, the better; a master's review is
// golden and weighs x3. Everyone who leaves the school upset leaves 1 star. The rating is a moving average over ~300 recent
// reviews, so a school can climb back. Pure goal for now (no economy effect); a leaderboard of schools comes later.
const RATE_N = 300, RATE_GOLD_W = 3;
const RANK_STARS = [3, 3.5, 4, 4.5, 5, 5];
const REVIEW_TXT = {
  1: ['Не нашлось места, ушёл домой 😢', 'Очереди огромные, больше не приду', 'Ждал-ждал и ушёл ни с чем'],
  2: ['Учили так себе', 'Было скучновато'],
  3: ['Нормальная школа', 'Неплохо, но можно лучше'],
  4: ['Хорошая школа, мне понравилось!', 'Учителя толковые 👍'],
  5: ['Лучшая школа магии! ✨', 'Всем советую, чудесно!', 'Спасибо учителям! 💖'],
};
function rating() {   // old saves: start from their whole history (graduates ~3.5 stars, everyone who left 1 star)
  if (S.rating) return S.rating;
  const g = S.stats.graduated || 0, l = S.stats.left || 0;
  return (S.rating = { v: g + l ? (g * 3.5 + l) / (g + l) : 0, n: g + l, gold: (S.stats.ranks || [])[5] || 0, bad: l, last: [] });
}
const ratingVal = () => (S && (S.rating || (S.stats.graduated || S.stats.left)) ? rating().v : 0);
const ratingTxt = () => (ratingVal() ? ratingVal().toFixed(2).replace('.', ',') : '—');   // two decimals since build 288 (her «Много с одинаковой оценкой и непонятно почему он первый в списке»)
const r2 = (v) => (+v).toFixed(2).replace('.', ',');   // a rating in the tops: 4,13
function review(a, stars, gold) {
  const R = rating(), w = gold ? RATE_GOLD_W : 1;
  stars = Math.max(1, Math.min(5, stars));
  R.v = R.n ? R.v + (stars - R.v) * Math.min(1, w / Math.min(RATE_N, R.n + w)) : stars; R.n += w;
  if (gold) R.gold = (R.gold || 0) + 1; if (stars <= 1) R.bad = (R.bad || 0) + 1;
  const txt = rnd(REVIEW_TXT[Math.round(stars)]);
  R.last.unshift({ n: a.name || '', s: stars, g: gold ? 1 : 0, t: txt }); if (R.last.length > 8) R.last.length = 8;
}
function reviewGraduate(a) {
  const rk = a.rk || 0, m = moodOf(a);
  review(a, RANK_STARS[rk] + (m >= 70 ? 0.5 : m < 40 ? -0.5 : 0), rk === 5);
  if (rk === 5 && !ffwd) popup('🏅 золотой отзыв!', a.x, a.y - 0.4, '#b8860b', 70);
  if (!ffwd && !document.hidden) hintOnce('rating', '🏅', 'Рейтинг школы', 'Теперь у школы есть рейтинг — он слева вверху 🏅. Каждый выпускник оставляет отзыв: чем выше звание и лучше настроение, тем больше звёзд, а Мастера оставляют золотые отзывы. Кто уходит из школы расстроенным, ставит 1 звезду. Поднять рейтинг как можно выше — главная цель школы. Нажми на 🏅, чтобы почитать отзывы.');
}
const starRow = (s) => '★'.repeat(Math.round(s)) + '☆'.repeat(5 - Math.round(s));
function cashPanel() {   // «Казна школы» (build 275): what comes in and goes out per minute
  const inc = (S.ema || 0) * 60, out = (S.outEma || 0) * 60, net = inc - out, mx = Math.max(inc, out, 1);
  const bar = (v, col) => `<div style="height:12px;border-radius:6px;margin:4px 0;background:${col};width:${Math.max(2, Math.round(v / mx * 100))}%"></div>`;
  return `<div class="sh-head"><span class="remoji big">💰</span><div><h2>Казна школы</h2><div class="muted">Сколько приходит и уходит за минуту</div></div><button class="x" data-close>✕</button></div>
    <div class="card up"><div class="grow"><b>📈 Приходит: +${fmt(inc)} в минуту</b>${bar(inc, '#58c27d')}<div class="muted">уроки, взносы новичков, магазин, столовая</div></div></div>
    <div class="card up"><div class="grow"><b>📉 Уходит: −${fmt(out)} в минуту</b>${bar(out, '#e0607e')}<div class="muted">возвраты ушедшим и штрафы инспектора</div></div></div>
    <div class="card up" style="border:2px solid ${net >= 0 ? '#58c27d' : '#e0607e'}"><div class="grow"><b>${net >= 0 ? '🙂 Школа в плюсе' : '⚠️ Школа в минусе'}: ${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))} в минуту</b></div></div>
    <p class="muted">Кто уходит из школы расстроенным, получает взнос назад (сейчас ${Math.round(refundRate() * 100)}%). Но за минуту школа возвращает не больше половины своего дохода (сейчас до 🪙${fmt(refundCap())}), остальные уходят без денег — так школа никогда не застрянет в нуле. Всего вернули: 🪙${fmt(S.stats.refunded || 0)}${S.stats.unpaid ? ` · не хватило кассы на 🪙${fmt(S.stats.unpaid)}` : ''}${S.stats.fined ? ` · штрафы: 🪙${fmt(S.stats.fined)}` : ''}.</p>
    <p class="muted">Как тратить меньше: больше парт и кроватей, чтобы никто не уходил; «Правила возврата» у директора; «Престижный» договор, если учеников приходит больше, чем мест.</p>`;
}
function ratingPanel() {
  const R = rating();
  const rows = R.last.map((r) => `<div class="card up"><span class="remoji">${r.g ? '🏅' : r.s <= 1 ? '😢' : '🎓'}</span><div class="grow"><b>${r.n}</b> <span style="color:#d49a00">${starRow(r.s)}</span><div class="muted">«${r.t}»</div></div></div>`).join('');
  return `<div class="sh-head"><span class="remoji big">🏅</span><div><h2>Рейтинг школы: ${ratingTxt()} из 5</h2><div class="muted">Главная цель — поднять его как можно выше</div></div><button class="x" data-close>✕</button></div>
    <div class="center big-txt" style="color:#d49a00">${starRow(ratingVal() || 0)}</div>
    <button class="btn wide" data-top>🏆 Топ школ</button>
    <p>Каждый выпускник оставляет отзыв: чем выше его звание и лучше настроение, тем больше звёзд. Мастера оставляют <b>золотые отзывы</b> 🏅 — они весят втрое больше. Каждый, кто ушёл из школы расстроенным (не нашлось места или загрустил в очереди), ставит 1 звезду.</p>
    <p class="muted">Рейтинг считается по последним ~300 отзывам, так что его всегда можно поднять. Золотых отзывов: ${fmt(R.gold || 0)} · плохих: ${fmt(R.bad || 0)}.</p>
    <p class="muted">Как поднять: больше парт и кроватей, чтобы никто не уходил; сильные учителя и экзамены на звания; хорошее настроение (библиотека, магазин, столовая, забота директора). Если учеников приходит больше, чем школа успевает учить, выбери у директора «Престижный» договор.</p>
    ${rows ? '<h3>Последние отзывы</h3>' + rows : ''}`;
}
function goGraduate(a) {
  const g = SLOTS.GARDEN;
  a.c = -1; a.state = 'walk'; a.goal = { t: 'g' };
  if (a.retake) { retakeHome(a); return; }   // an elder from the tower after his retake: not a new graduate
  const tx = WORLD === 1 ? g.x0 + 3 + (Math.random() - 0.5) * 0.4 : WORLD === 2 ? g.x0 + 3.55 + (Math.random() - 0.5) * 0.3 : g.x0 + 1 + Math.random() * 4, ty = WORLD === 1 ? g.y0 + 3 + (Math.random() - 0.5) * 0.4 : WORLD === 2 ? g.y0 + 4.3 + (Math.random() - 0.5) * 0.2 : g.y0 + 1 + Math.random() * 4;   // world 2: in front of the great crystal of the hall of glory   // into the gazebo (her wish: they vanish there, like through a magic fireplace)
  walk(a, tx, ty, () => {
    S.stats.graduated++; reviewGraduate(a); w2Seeker(); gainXp(a);
    if (helperAdmit(a)) return;                       // mages and elder mages stay as teachers' helpers (elders replace mages)
    if (towerCandidate(a) && towerAdmit(a)) return;   // rare graduates stay in the masters' tower                       // mages stay as teachers' helpers (two per class, different kinds)
    popup('🎓 ⭐+1', a.x, a.y, '#7b5cd6', 46);
    if (WORLD <= 2) { a.state = 'vanish'; a.t = 0; return; }   // world 2 (hall of glory): they vanish in the crystal's light   // a swirl of magic light in the gazebo and the graduate is gone
    a.state = 'fly'; a.t = 0; a.vx = (Math.random() < 0.5 ? -1 : 1) * 0.6;
  });
}
const VANISH_T = 2.8;
function drawGradCircle() {   // the graduation circle in the middle of the graduates' garden: gold rings, slowly turning star runes, a soft pulse (brighter while someone graduates)
  const g = SLOTS.GARDEN, cx = g.x0 + 3, cy = g.y0 + 3, T = performance.now() / 1000, busy = agents.some((a) => a.state === 'vanish');
  const ring = (r) => { const pts = []; for (let k = 0; k < 36; k++) { const an = k / 36 * Math.PI * 2; pts.push(P(cx + Math.cos(an) * r, cy + Math.sin(an) * r)); } return pts; };
  const pulse = 0.55 + 0.25 * Math.sin(T * 2) + (busy ? 0.25 : 0), m = P(cx, cy);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, 0.35 * pulse + (busy ? 0.2 : 0)); ctx.drawImage(glowSprite('255,210,120'), m.x - 70, m.y - 40, 140, 80); ctx.restore();
  ctx.save(); ctx.globalAlpha = Math.min(1, pulse);
  poly(ctx, ring(1.9), 'rgba(190,150,255,0.22)'); ctx.lineWidth = 4.5; poly(ctx, ring(1.9), null, '#e7b53c'); ctx.lineWidth = 2; poly(ctx, ring(1.45), null, '#b98cf0'); poly(ctx, ring(0.55), 'rgba(255,225,150,0.35)', '#e7b53c');
  ctx.restore();
  for (let k = 0; k < 8; k++) { const an = T * 0.35 + k * Math.PI / 4, p = P(cx + Math.cos(an) * 1.68, cy + Math.sin(an) * 1.68); fxStar(p.x, p.y - 1, 3, 0.6 + 0.4 * pulse, k % 2 ? '255,214,120' : '210,170,255'); }
}
function drawVanish(a, x, y) {   // magic-fireplace style (her wish): violet-gold flames burst up around the graduate, he spins, shrinks, fades, a last flash (2.8 s)
  const u = Math.min(1, a.t / VANISH_T), s0 = P(x, y), T = a.t;
  const col = u < 0.15 ? u / 0.15 : u > 0.82 ? (1 - u) / 0.18 : 1;
  const fade = u < 0.4 ? 1 : Math.max(0, 1 - (u - 0.4) / 0.35), sc = 1 - 0.6 * Math.max(0, (u - 0.35) / 0.45);
  const body = () => { if (fade > 0) { ctx.save(); ctx.globalAlpha = fade; drawCreature({ ...a, path: [], flip: Math.sin(T * (4 + T * 6)) > 0 }, x, y, 30 * Math.max(0.3, sc)); ctx.restore(); } };
  if (WORLD !== 1) body();
  fxTop.push(() => {
    if (WORLD === 1) body();   // world 1: inside the gazebo, drawn over it
    ctx.save();
    ctx.globalAlpha = (WORLD === 1 ? 0.5 : 0.3) * col; ctx.drawImage(glowSprite('170,110,255'), s0.x - 34, s0.y - 120, 68, 140);   // the light column (brighter in world 1: her «ярче») (soft: the graduate must stay visible)
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 9; k++) {   // flame tongues licking up from the floor, each 0.9 s
      const v = ((T * 1.1 + k * 0.37) % 1), fx = s0.x + (k % 2 ? 1 : -1) * (9 + Math.sin(k * 2.3) * 5) * (1 - v * 0.5), fy = s0.y - 4 - v * 62 * (0.6 + 0.4 * col), r = (9 - v * 7) * (0.6 + 0.4 * col);
      ctx.globalAlpha = col * (1 - v) * 0.4; ctx.drawImage(glowSprite(k % 3 === 0 ? '255,200,110' : k % 3 === 1 ? '200,130,255' : '150,220,255'), fx - r, fy - r * 1.6, r * 2, r * 3.2);
    }
    ctx.restore();
    for (let k = 0; k < 12; k++) { const an = T * (3 + k * 0.25) + k * 0.52, r = 16 * (1 - u * 0.4), hy = ((T * 0.8 + k * 0.083) % 1) * 75;   // sparks spiral up
      fxStar(s0.x + Math.cos(an) * r, s0.y - 6 - hy + Math.sin(an) * r * 0.35, 1.6, col * (1 - hy / 90), k % 2 ? '255,214,120' : '210,170,255'); }
    if (u > 0.72 && u < 0.97) { const v = (u - 0.72) / 0.25; ctx.save(); ctx.globalAlpha = (1 - v) * 0.6; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('255,245,220'), s0.x - 30 - v * 30, s0.y - 50 - v * 30, 60 + v * 60, 60 + v * 60); ctx.restore(); }   // the last flash: he is gone
    if (WORLD === 1 && u > 0.55) { const v = (u - 0.55) / 0.45; ctx.save(); ctx.globalAlpha = v < 0.8 ? 1 : (1 - v) / 0.2; emoji('🎓', s0.x + Math.sin(v * 9) * 6, s0.y - 70 - v * 70, 16 + v * 6); ctx.restore(); }   // the graduate's cap flies up into the sky
  });
}
const WALK_K = 0.8;   // walking a bit slower: the rooms got bigger on screen
// ======================= mood (her ruling 2026-11-21) =======================
// Waiting makes students sad, lessons and the library cheer them up. Mood moves the exam chance by up to ±10%;
// a student whose mood falls very low while waiting gives up and goes home. Mood only falls while the game is open.
const MOOD_DROP = { queue: 0.5, process: 0, wait: 1.0, walkwait: 1.0, sleep: 0.45, dline: 0.5, checkin: 0 };
const moodOf = (a) => (a.mood ?? 80);
const moodBonus = (a) => (moodOf(a) - 60) / 400;   // mood 100: +10%, mood 20: -10%
const moodFace = (m) => (m >= 70 ? '😊' : m >= 40 ? '🙂' : m >= 20 ? '😟' : '😭');
function avgMood() { const l = agents.filter((a) => a.state !== 'fly' && a.state !== 'vanish' && !(a.goal && a.goal.t === 'x')); return l.length ? l.reduce((n, a) => n + moodOf(a), 0) / l.length : 80; }
function giveUp(a) {   // too sad to keep waiting: frees its place and goes home
  if (a.state === 'wait' || a.state === 'walkwait') { const l = waitList[a.c]; const k = l ? l.indexOf(a) : -1; if (k >= 0) { l.splice(k, 1); pullWaiting(a.c); } }
  else if (a.state === 'sleep') { if (a.bed >= 0 && dorm[a.bed] === a) dorm[a.bed] = null; a.bed = -1; }
  else return;
  S.stats.gaveUp = (S.stats.gaveUp || 0) + 1;
  hintOnce('mood', '😭', 'Ученик ушёл от тоски', 'Ученик слишком долго ждал своей очереди, совсем загрустил и ушёл домой. Ожидание огорчает учеников, уроки и библиотека радуют. Добавляй парты, сокращай уроки и ставь кровати, чтобы очереди были короче. Весёлые ученики к тому же лучше сдают экзамены.');
  popup('😭', a.x, a.y, '#c0436b', 44);
  leaveSchool(a);
}
// ---- darkness and light (world 2)
const LIGHT_MAX = 10, LIGHT_STEP = 0.09, DARK_MOOD = 2.2, DARK_FLOOR = -0.3;
const DARK0 = { runes: 0.35, forge: 0.25, mine: 0.6, gems: 0.45, guards: 0.55, lake: 0.75, final: 0.3 };   // deeper halls are darker; the forge has its own fire
const lightLvl = (i) => (WORLD === 2 && S.w2 && S.w2.light && S.w2.light[i]) || 0;
const hallDark = (i) => (WORLD === 2 && i >= 0 && CLASSES[i] ? Math.max(0, Math.round(((DARK0[CLASSES[i].id] || 0) - LIGHT_STEP * lightLvl(i)) * 1e6) / 1e6) : 0);   // rounded: 0.45 - 5 x 0.09 left 5e-17 «darkness»
const lightMax = (i) => (CLASSES[i] ? Math.min(LIGHT_MAX, Math.ceil(((DARK0[CLASSES[i].id] || 0) - 1e-9) / LIGHT_STEP)) : LIGHT_MAX);   // levels a hall really needs to be fully lit
const lightCost = (i) => paced(CLASSES[i].tuition * 20 * Math.pow(1.9, lightLvl(i)), lightLvl(i) + 1);
function lightHtml(i) {
  if (WORLD !== 2) return '';
  const l = lightLvl(i), dk = hallDark(i), mood = Math.max(DARK_FLOOR, 0.8 - DARK_MOOD * dk);
  return `<div class="card up"><span class="remoji">🕯️</span><div class="grow"><b>Светильники</b> <span class="muted">ур. ${l}/${lightMax(i)}</span><div class="muted">${dk > 0 ? `${nn('темнота', Math.round(dk * 100) + '%', Math.max(0, Math.round(peek((d) => { S.w2.light ||= {}; S.w2.light[i] = lightLvl(i) + d; if (!S.w2.light[i]) delete S.w2.light[i]; }, () => hallDark(i)) * 100)) + '%', l >= LIGHT_MAX)} · ${mood < 0 ? 'на уроке ученики грустят' : 'на уроке ученикам пока неуютно'}` : 'в зале светло · на уроке ученики радуются'} (−${Math.round(LIGHT_STEP * 100)}% темноты за уровень)</div></div>
    ${dk <= 1e-9 || l >= lightMax(i) ? '<span class="done">светло</span>' : costBtn('↑', lightCost(i), 'light', `data-i="${i}"`)}</div>`;
}
function stepMood(a, dt, live) {
  let d = 0;
  if (a.goal && a.goal.t === 'k') d = COURT_MOOD * fountMoodK();   // build 259: waiting in the court cheers them up
  else if (a.state === 'study') { d = incOf(a.c) ? -1.5 : Math.max(DARK_FLOOR, 0.8 - DARK_MOOD * hallDark(a.c));   // build audit 2026-11-24: the lake hall took -30 mood a lesson (a pass gives +8)
    if (live && d < 0 && !incOf(a.c) && !(S.hints && S.hints.dark)) hintOnce('dark', '🕯️', 'В зале темно', `В зале «${CLASSES[a.c].name}» темно, и на уроке ученикам грустно. Открой этот зал и поставь 🕯️ Светильники: в светлом зале ученики на уроке радуются и лучше сдают экзамены.`); }
  else if (a.state === 'read') d = 1.2;
  else if (a.state === 'nap') d = 1;   // dorm roles: a nap cheers them up
  else if (MOOD_DROP[a.state] !== undefined) d = -MOOD_DROP[a.state] * (a.state === 'sleep' ? 1 - 0.05 * (dormUp().conc - 1) : 1) * careK(dirLvl('care')) * (a.pk || 1) * fountLineK();   // a better dorm and the director's care keep them calmer
  if (d < 0 && !live) return;
  a.mood = Math.max(0, Math.min(100, moodOf(a) + d * dt));
  if (live && a.mood < 8 && (a.state === 'wait' || a.state === 'sleep')) giveUp(a);
}
function stepAgents(dt, live = false) {
  for (const a of agents) {
    a.ph += dt;
    if (a.state !== 'fly' && a.state !== 'vanish') stepMood(a, dt, live);
    if (a.state === 'vanish') { a.t += dt; if (a.t >= VANISH_T) a.gone = true; continue; }
    if (a.state === 'fly') { a.t += dt; a.z += (40 + a.t * 60) * dt; a.x += a.vx * dt; a.y -= a.vx * dt; continue; }
    if (a.path.length) {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) { a.x = GATE_TILE.x; a.y = GATE_TILE.y; }   // never let a broken position freeze a creature
      if (a.pauseT > 0) { a.pauseT -= dt; if (a.pauseT > 0.4 && Math.random() < dt * 1.5) a.flip = !a.flip; continue; }   // stopped to look around
      if (live && a.path.length > 3 && Math.random() < dt * 0.035 && regAt(Math.floor(a.x), Math.floor(a.y)) === 'hall') a.pauseT = 0.5 + Math.random() * 1.3;
      const pace = 0.82 + 0.36 * (0.5 + 0.5 * Math.sin(a.ph * 0.6 + a.id * 1.7));   // everyone speeds up and slows down a little on the way
      const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy), stepLen = Math.max(0, a.speed * pace * WALK_K * dt);
      const sdx = dx - dy; if (Math.abs(sdx) > 0.01) a.flip = sdx < 0;
      a.back = dx + dy < -0.01;   // walking away from us: we see its back
      if (dist <= stepLen || dist < 1e-6) { a.x = p.x; a.y = p.y; a.path.shift(); if (!a.path.length) a.back = false;
        if (!a.path.length && a.onArrive) { const f = a.onArrive; a.onArrive = null; f(); } }
      else { a.x += dx / dist * stepLen; a.y += dy / dist * stepLen; }
      continue;
    }
    if (a.state === 'study') { if (!incOf(a.c)) a.t += dt; if (a.t >= a.dur) finishLesson(a); }   // an incident stops the lesson
    else if (a.state === 'done') leaveDesk(a);
    else if (a.state === 'court') stepCourt(a, dt);
    else if (a.state === 'read') { a.t += dt; if (a.t >= a.dur) finishReading(a); }
    else if (a.state === 'nap') { a.t += dt; if (a.t >= a.dur) finishNap(a); }   // dorm roles
    else if (a.state === 'cantbuy') { a.t += dt; if (a.t >= a.dur) cantServed(a); }
    else if (a.state === 'eat') { a.t += dt; if (a.t >= a.dur) finishEating(a); }
    else if (a.state === 'mclass') { a.t += dt; if (a.t >= a.dur) mcHome(a); }
    else if (a.state === 'shopping') { if (!(live && foxU > 0.02)) a.t += dt; if (a.t >= a.dur) finishShopping(a); }   // the fox serves only from behind his counter
  }
  agents = agents.filter((a) => !(a.state === 'fly' && a.z > 400) && !a.gone);
}
// ======================= incidents (her ruling 2026-11-21: the game needs a challenge) =======================
// Now and then something goes wrong in a class: its lesson stops until the player taps the room. Left alone it ends by itself after 10 minutes.
const INCIDENTS = { herbs: ['🌿', 'растения разрослись и опутали парты'], potions: ['💥', 'взорвался котёл'], stars: ['☁️', 'тучи закрыли небо, телескопы ничего не видят'], charms: ['✨', 'заклинание вышло из-под контроля'], flight: ['🪶', 'ученики улетели под потолок'], elements: ['🔥', 'в классе пожар'], final: ['📜', 'экзаменационные листы разлетелись'] };
const INC_GENERIC = ['🤧', 'учитель простыл'];
const INC_MIN = 70, INC_MAX = 150, INC_AUTO = 600, INC_MAXN = 2;
const incOf = (i) => !!(S.inc && S.inc[i]);
const INCIDENTS_W2 = { runes: ['🪨', 'руны осыпались со стены'], forge: ['🔥', 'горн погас'], mine: ['🪨', 'в штольне просела крепь'], gems: ['💎', 'рассыпались самоцветы'], guards: ['🛡️', 'сломались манекены'], lake: ['🌊', 'лодки унесло течением'], final: ['🕯️', 'погасли свечи клятвы'] };
const incInfo = (i) => (S.inc[i].k === 'r' ? ['🪨', 'обвал завалил зал'] : S.inc[i].k === 'g' ? INC_GENERIC : (WORLD === 2 ? INCIDENTS_W2 : INCIDENTS)[CLASSES[i].id] || INC_GENERIC);
let incT = 45;
function hintOnce(key, emo, title, text) {   // a short explanation the first time something happens
  S.hints ||= {}; if (S.hints[key] || tourStep >= 0) return; S.hints[key] = 1; save(); glog('hint', title, WORLD);
  openPanel(() => `<div class="sh-head"><span class="remoji big">${emo}</span><div><h2>${title}</h2><div class="muted">Подсказка</div></div><button class="x" data-close>✕</button></div><p>${text}</p><button class="btn wide" data-close>Понятно</button>`);
}
// build audit 2026-11-24: a game left open on screen with nobody at it lost more than a closed one (incidents only start live and
// then stop a class for 10 min, students leave with refunds). Nobody has touched the screen for 2 min = treated like a closed game.
const idleNow = () => performance.now() - (window.__inputAt || 0) > 120000;
function stepIncidents(dt, live) {
  S.inc ||= {};
  if (MG.isOpen()) return;   // build 278 (tester Соня): the school is quiet while the player brews potions
  for (const [i, x] of Object.entries(S.inc)) { x.t = (x.t || 0) + dt; if (x.t > (live && !idleNow() ? INC_AUTO_AT(dirLvl('keeper')) : Math.min(30, INC_AUTO_AT(dirLvl('keeper'))))) delete S.inc[i]; }   // away (catch-up) the caretaker fixes it within 30 s: an incident left open stopped its class for 10 min of the catch-up and emptied the rating (tester О-Дин: 3.9 -> 1.9 after 15 min away)
  if (!live || idleNow() || S.stats.graduated < 5 || tourStep >= 0) return;   // never while the game is closed, nor for a brand-new school, nor while nobody touches it (build audit 2026-11-24)
  incT -= dt; if (incT > 0) return;
  incT = (INC_MIN + Math.random() * (INC_MAX - INC_MIN)) * (1 + 0.1 * dirLvl('keeper'));
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i) && !S.inc[i] && !(WORLD === 2 && S.w2 && S.w2.throne && (S.w2.throne.cur || S.w2.throne.warned) && CLASSES[i].id === THRONE_NEED));   // the guard hall is never hit while it defends
  if (Object.keys(S.inc).length >= INC_MAXN || !open.length) return;
  const i = rnd(open); S.inc[i] = { k: Math.random() < 0.3 ? 'g' : 'c', t: 0 }; sfx(incSound(i)); glog('event', 'происшествие: ' + CLASSES[i].name, WORLD);
  const [e, txt] = incInfo(i); toast(`${e} ${CLASSES[i].name}: ${txt}! Нажми на класс`); try { navigator.vibrate?.(80); } catch (er) { /* no vibration */ }
  hintOnce('inc', '💥', 'Происшествие!', `В классе «${CLASSES[i].name}» ${txt}. Урок остановился, ученики носятся по классу. Закрой подсказку и нажми на этот класс — всё починится. Если не трогать, через 10 минут пройдёт само, но школа потеряет монеты.`);
  dirtyPanel = true;
}
function fixIncident(i) {
  sfx('fixed');
  delete S.inc[i];
  for (const a of agents) if (a.c === i && a.state === 'study') { a.mood = Math.min(100, moodOf(a) + 10); popup(rnd(['😄', '🥰', '💖']), a.x, a.y, '#ff6fa3', 44); }   // everyone is relieved
  S.stats.fixed = (S.stats.fixed || 0) + 1;   // (build audit 2026-11-24: was inside the comment above)
  const s = slotOf(i); popup('✨ Починено!', (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, '#2f9e7a', 50);
  toast(`✨ ${CLASSES[i].name}: всё в порядке, урок продолжается`); save();
}
const STAR_DUTY = window.__starDuty = {};   // per class: { id, t0, from, to } — one student at the big telescope at a time
function dutyPos(a) { const d = STAR_DUTY[a.c]; if (!d || d.id !== a.id || a.state !== 'study' || (a.path && a.path.length)) return null; const u = (performance.now() - d.t0) / 1000; if (u >= 7) return null;   // the whole trip fits into one lesson (lessons are ~10 s on a grown school)
  const k = u < 1.8 ? u / 1.8 : u < 5.2 ? 1 : 1 - (u - 5.2) / 1.8, e = k * k * (3 - 2 * k), x = d.from.x + (d.to.x - d.from.x) * e, y = d.from.y + (d.to.y - d.from.y) * e;
  const tg = u < 1.8 ? d.to : u < 5.2 ? d.look : d.from; return { x, y, duty: 1, left: (tg.x - tg.y) < (x - y), up: u < 5.2 ? (tg.x + tg.y) < (x + y) + 0.01 : false }; }   // her «не подходил вплотную ... был повернут лицом к нам»: faces where he goes, at the telescope he turns his back to us and looks into it
function panicPos(a) {   // where a panicking student is now: a wobbly loop around the room, different for everyone
  { const dp = WORLD === 1 && STAR_DUTY[a.c] && dutyPos(a); if (dp) return dp; }
  if (a.state !== 'study' || !incOf(a.c) || (a.path && a.path.length)) return null;
  const s = slotOf(a.c); if (!s) return null;
  const T = performance.now() / 1000, k = a.id * 1.7, sp = 0.55 + (a.id % 5) * 0.09;
  const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2 + 0.6, rx = (s.x1 - s.x0) / 2 - 0.9, ry = (s.y1 - s.y0) / 2 - 1.3;
  const ang = T * sp + k, w = Math.sin(T * 1.9 + k) * 0.25;
  const x = cx + Math.cos(ang) * rx * (0.55 + 0.35 * Math.sin(k)) + w, y = cy + Math.sin(ang * 1.3) * ry * (0.6 + 0.3 * Math.cos(k));
  const dx = -Math.sin(ang) * rx, dy = Math.cos(ang * 1.3) * ry * 1.3;
  return { x, y, left: dx - dy < 0, up: dx + dy < 0 };
}
function drawIncidents() {
  if (!S.inc) return;
  const k = 1 + 0.12 * Math.sin(performance.now() / 180);
  for (const i of Object.keys(S.inc)) {
    const s = slotOf(+i); if (!s) continue;
    const c = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), [e] = incInfo(+i);
    ctx.fillStyle = '#ff4d6d33'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 70 * k, 42 * k, 0, 0, Math.PI * 2); ctx.fill();
    emoji(e, c.x, c.y - 40, 40 * k);
    ctx.fillStyle = '#ff4d6d'; rr(c.x - 38, c.y - 8, 76, 22, 11); ctx.fill(); text('Нажми!', c.x, c.y + 3, 11, '#ffffff');
  }
}
// ======================= inspector + school stars (her ruling 2026-11-21) =======================
// Every ~12 minutes of play an inspector checks one thing for 3 minutes. Passed: a school star (+3% to every lesson,
// needed for new classes and worlds) and a reward. Failed: a fine. The goal is announced 40 s ahead. Only while the game is open.
const INSP_EVERY = 720, INSP_FIRST = 420, INSP_LEN = 180, INSP_WARN = 40;
function spendStars(n) { if (!n) return true; if (schoolStars() < n) { toast(`Нужно ⭐ ${n} звёзд школы`); return false; } insp().stars -= n; return true; }
const schoolStars = () => (S && S.insp && S.insp.stars) || 0;
const insp = () => (S.insp ||= { t: INSP_FIRST, stars: 0, cur: null, passed: 0, failed: 0 });
const NOLEAVE_MAX = 7, NOLEAVE_LEN = 60;   // her ruling 2026-11-21: one minute, up to 7 may leave
const leftNow = () => (S.stats.left || 0) + (S.stats.gaveUp || 0);
// the steady income per second: like S.ema, but one big payout (a chest, a prize, a caravan) is clipped to 3x the usual rate, so the
// inspector's «школа заработает» goal is never set from a spike (her «Цель нереалистичная»: 58M asked while the school earns ~4M a minute)
const steadyRate = () => (S.steadyEma ??= Math.min(S.ema || 0, S.paceEma ?? S.ema ?? 0));
const INSP_KINDS = {
  mood: { text: 'настроение учеников 60% и выше', check: () => avgMood() >= 60, now: () => `настроение ${Math.round(avgMood())}%` },
  noleave: { text: `расстроенными уйдут не больше ${NOLEAVE_MAX} учеников`, start: () => ({ v: leftNow() }), len: NOLEAVE_LEN, fail: (c) => leftNow() - c.v > NOLEAVE_MAX, now: (c) => `ушли: ${leftNow() - c.v} из ${NOLEAVE_MAX}` },   // was «nobody»: too hard (her report 2026-11-21)
  inc: { text: 'каждое происшествие исправлено быстрее чем за 20 секунд', start: () => { forceIncident(); return {}; }, fail: () => Object.values(S.inc || {}).some((x) => x.t > 20), now: () => (Object.keys(S.inc || {}).length ? '⚠️ происшествие!' : 'всё спокойно') },
  pass: { text: 'экзамены сдают 70% учеников и больше', start: () => ({ p: S.stats.passed, f: S.stats.failed, g: passGoal() }), check: (c) => { const p = S.stats.passed - c.p, f = S.stats.failed - c.f; return p + f >= 5 && p / (p + f) >= (c.g || 0.7); }, now: (c) => { const p = S.stats.passed - c.p, f = S.stats.failed - c.f; return p + f ? `сдали ${Math.round(p / (p + f) * 100)}%` : 'экзаменов ещё не было'; } },
  earn: { text: 'школа заработает', start: () => ({ e: S.stats.earned || 0, goal: Math.max(300, Math.round((steadyRate() || 1) * 140 / 10) * 10) }), check: (c) => (S.stats.earned || 0) - c.e >= c.goal, now: (c) => `заработано ${fmt((S.stats.earned || 0) - c.e)} из ${fmt(c.goal)}` },
};
function forceIncident() {
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i) && !(S.inc && S.inc[i])); if (!open.length) return;
  const i = rnd(open); S.inc ||= {}; S.inc[i] = { k: 'c', t: 0 }; sfx(incSound(i)); const [e, txt] = incInfo(i); toast(`${e} ${CLASSES[i].name}: ${txt}! Нажми на класс`);
}
// build audit 2026-11-24: «70% pass» was nearly unwinnable for a young school (base chance 45%): the goal is the school's own average
// chance + 5 points, between 50% and 70%
const passGoal = () => { const o = CLASSES.map((c, i) => i).filter((i) => isOpen(i)); const m = o.length ? o.reduce((a, i) => a + success(i), 0) / o.length : 0.45; return Math.max(0.5, Math.min(0.7, Math.round((m + 0.05) * 20) / 20)); };
const inspText = (c) => (c.kind === 'earn' ? `${INSP_KINDS.earn.text} ${fmt(c.goal)} 🪙` : c.kind === 'pass' ? `экзамены сдают ${Math.round((c.g || 0.7) * 100)}% учеников и больше` : INSP_KINDS[c.kind].text);
const INSP_SHORT = { mood: 'настроение 60%+', noleave: 'уйдут не больше 7', inc: 'чинить за 20 с', pass: 'экзамены сдают', earn: 'заработок' };
const inspNextText = (k) => (k === 'earn' ? 'сколько школа заработает' : k === 'pass' ? `экзамены сдают ${Math.round(passGoal() * 100)}% учеников и больше` : INSP_KINDS[k].text);
const calm = () => !!(S && S.calm);
function setCalm(on) {
  const I = insp();
  if (on && I.cur) { S.calmAfter = 1; toast('😌 Проверка уже идёт: спокойный режим включится, как только она закончится'); save(); dirtyPanel = true; return; }   // build audit 2026-11-24: switching it on cancelled a failing check without the fine
  if (!on) S.calmAfter = 0;
  S.calm = on;
  if (on) { I.cur = null; I.next = null; I.t = Math.max(I.t, INSP_WARN + 60); }   // a running check is cancelled without a fine
  toast(on ? '😌 Спокойный режим: инспектор не придёт' : '🧐 Инспектор снова будет приходить');
  save(); updateHud(); dirtyPanel = true;
}
function stepInspector(dt, live) {
  if (calm() || !live || idleNow() || MG.isOpen() || S.stats.graduated < 20 || tourStep >= 0) return;   // build audit 2026-11-24: nor while nobody is at the screen   // the inspector waits while the mini-game is open (a running check pauses too)
  const I = insp();
  if (!I.cur) {
    I.t -= dt;
    if (I.t <= INSP_WARN && !I.next) { I.next = rnd(Object.keys(INSP_KINDS)); toast(`🧐 Скоро инспектор! Проверит: ${inspNextText(I.next)}`);
      hintOnce('insp', '🧐', 'Скоро придёт инспектор', `Через 40 секунд придёт инспектор и проверит: <b>${inspNextText(I.next)}</b>. Это написано в жёлтой карточке слева вверху. Пройдёшь проверку — школа получит звезду ⭐ (+3% к плате за все уроки, звёзды нужны для новых классов) и награду. Не пройдёшь — небольшой штраф. Не хочешь проверок — включи спокойный режим 😌 в ⚙️.`); }
    if (I.t <= 0) { const kind = I.next || 'mood', K = INSP_KINDS[kind]; I.cur = { kind, left: K.len || INSP_LEN, failed: false, ...(K.start ? K.start() : {}) }; I.next = null; toast(`🧐 Инспектор пришёл! Проверка ${(K.len || INSP_LEN) >= 120 ? Math.round((K.len || INSP_LEN) / 60) + ' минуты' : '1 минуту'}`); }
    return;
  }
  const c = I.cur, K = INSP_KINDS[c.kind];
  c.left -= dt;
  if (K.fail && K.fail(c)) c.failed = true;
  if (c.failed || c.left <= 0) finishInspection();
}
let inspResult = null;
function finishInspection() {
  const I = insp(), c = I.cur, K = INSP_KINDS[c.kind];
  const ok = !c.failed && (K.check ? K.check(c) : true);
  const income = Math.max(200, Math.round((rateNow() || 1) * 180 / 10) * 10), ties = dirLvl('ties');   // build audit 2026-11-24: steady rate (a payout right before the end gave x5 of it)
  I.cur = null; I.t = INSP_EVERY;
  if (ok) { const rw = Math.round(income * (1 + 0.1 * ties) * repK()); I.stars = (I.stars || 0) + 1; I.passed = (I.passed || 0) + 1; if (I.stars > STAR_STONE_FROM && stonesAdd(1)) setTimeout(() => toast(`⭐ Звезда ${I.stars}: ${ST_ICON} +1 лунный камень`), 1500); S.coins += rw; S.stats.earned = (S.stats.earned || 0) + rw; inspResult = { ok, income: rw }; }
  else { const fine = Math.min(S.coins, Math.round(income / 2 * (1 - 0.07 * ties))); spendOut(fine, 'fined'); I.failed = (I.failed || 0) + 1; inspResult = { ok, fine, text: inspText(c) }; }
  if (S.calmAfter) { S.calmAfter = 0; setCalm(true); }   // calm mode asked for during the check
  openPanel(inspResultPanel); updateHud(); save();
}
function inspResultPanel() {
  const r = inspResult || { ok: true, income: 0 };
  return r.ok ? `<div class="sh-head"><span class="remoji big">🌟</span><div><h2>Проверка пройдена!</h2><div class="muted">Инспектор доволен школой</div></div><button class="x" data-close>✕</button></div>
    <p class="center">Школа получила звезду: теперь их <b>⭐ ${schoolStars()}</b>. Каждая звезда даёт +3% к плате за все уроки.</p><div class="center big-txt">🪙 +${fmt(r.income)}</div><button class="btn wide" data-close>Ура!</button>`
    : `<div class="sh-head"><span class="remoji big">😤</span><div><h2>Проверка не пройдена</h2><div class="muted">Надо было: ${r.text}</div></div><button class="x" data-close>✕</button></div>
    <p class="center">Штраф: <b>🪙 ${fmt(r.fine)}</b>. В следующий раз получится!</p><button class="btn wide" data-close>Понятно</button>`;
}
const mmss = (x) => `${Math.floor(Math.max(0, x) / 60)}:${String(Math.floor(Math.max(0, x) % 60)).padStart(2, '0')}`;
function calmBlock() {
  return calm()
    ? `<p class="muted">Спокойный режим включён: инспектор не приходит, проверок и штрафов нет. Звёзды школы в этом режиме не появляются — когда захочешь их заработать (они нужны для новых классов), выключи спокойный режим.</p><button class="btn ghost wide" data-calm="0">🧐 Выключить спокойный режим</button>`
    : `<p class="muted">В спокойном режиме инспектор не приходит: никаких проверок и штрафов, но и новых звёзд школы не будет. Звёзды нужны для новых классов — зарабатывай их, когда есть настроение. Включить и выключить можно в любой момент.</p><button class="btn ghost wide" data-calm="1">😌 Включить спокойный режим</button>`;
}
const STAR_STONE_FROM = 15;   // from the 16th star every new star also gives a moonstone (her «тратить некуда»)
function inspPanel() {   // short and plain (her «миллион текста и глаза пугаются»)
  const I = insp(), c = I.cur, n = schoolStars(), row = (ic, t) => `<div class="card up"><span class="remoji">${ic}</span><div class="grow">${t}</div></div>`;
  return `<div class="sh-head"><span class="remoji big">⭐</span><div><h2>Звёзды школы</h2><div class="muted">проверок пройдено ${I.passed || 0}, провалено ${I.failed || 0}</div></div><button class="x" data-close>✕</button></div>
    <div class="card" style="justify-content:center;text-align:center;font-size:19px"><b>⭐ ${n} = +${3 * n}% к плате за уроки</b></div>
    <h3>Что даёт звезда</h3>
    ${row('💰', '<b>+3% к плате за все уроки</b>, пока звезда у школы')}
    ${row(ST_IMG(24), `<b>+1 лунный камень</b> за каждую новую звезду после ${STAR_STONE_FROM}-й`)}
    ${row('🏗️', 'Нужны для постройки классов, кабинета директора и новых миров (тогда тратятся)')}
    <h3>Как получить</h3>
    ${row('🧐', 'Пройти проверку инспектора. Он приходит примерно раз в 15 минут, пока ты играешь, за провал — штраф')}
    ${c ? row('⏳', `<b>Сейчас проверка: ${inspText(c)}</b><div class="muted">${INSP_KINDS[c.kind].now(c)} · осталось ${mmss(c.left)}</div>`)
      : S.stats.graduated < 20 ? '<p class="muted">Инспектор начнёт приходить, когда у школы будет 20 выпускников.</p>' : `<p class="muted">Следующая проверка через <b>${mmss(I.t)}</b>${I.next ? `: ${inspNextText(I.next)}` : ''}.</p>`}
    ${calmBlock()}`;
}
// how many students are in the school right now (her wish 2026-11-21)
const inSchool = () => agents.filter((a) => a.state !== 'fly' && a.state !== 'vanish' && !(a.goal && (a.goal.t === 'x' || a.goal.t === 'g')));
// ======================= ranks and the album (her design 2026-11-22) =======================
// Every student enters as a novice. After a passed lesson in a class that holds the exam for its NEXT rank, the student
// tries that exam (low chance): passed -> the student itself gets the new outfit on the spot (her ruling: «наряд получает
// он сам, пройдя экзамен»). Rank 5 = master of one of the four elements (exam hall). The album (🎓) has a card per
// species x form: it opens when a student first reaches that form; students of that form gather XP with passed lessons
// and the card level is bought with coins: +5% pay from every student in that form.
const SP_NAMES = { mothfox: 'Лисичка-мотылёк', petalear: 'Ушастик', fernhorn: 'Рогатик', starwhisker: 'Крылоушка',
  mossmole: 'Мшистик', owlbat: 'Сумрачный совёнок', quartzhog: 'Кварцевый ёжик', batbunny: 'Медный крольчонок', geosnail: 'Улитка-жеода', axolotl: 'Пещерный тритон' };
const SP_H = { geosnail: 0.72, axolotl: 0.85, owlbat: 1.05 };
const CRAWLERS = { geosnail: 1 }, FACES_LEFT = { geosnail: 1 };   // her «Все улитки двигаются задом наперед ... не прыгали а ползали» (2026-11-23)   // world-2 creatures: wide ones are drawn lower so they do not look huge
const SP_GLOW = { owlbat: 1, quartzhog: 1, mossmole: 1 };      // dark creatures get a soft rim light in the dark halls
// world 2 has dwarven ranks, not mages (her remark 2026-11-22: «наверное же уже тут не маги»)
const RANKS = WORLD === 2 ? ['Новичок', 'Подмастерье', 'Мастеровой', 'Умелец', 'Старший мастер', 'Хранитель'] : ['Новичок', 'Ученик', 'Младший маг', 'Маг', 'Старший маг', 'Мастер'];
const RANKS_TO = WORLD === 2 ? ['новичком', 'подмастерьем', 'мастеровым', 'умельцем', 'старшим мастером', 'хранителем'] : ['новичком', 'учеником', 'младшим магом', 'магом', 'старшим магом', 'мастером'];
const ELEMS = [{ name: WORLD === 2 ? 'горна' : 'огня', emo: '🔥', col: '255,106,43' }, { name: WORLD === 2 ? 'глубин' : 'воды', emo: '💧', col: '63,169,245' }, { name: WORLD === 2 ? 'камня' : 'земли', emo: '🌱', col: '90,160,44' }, { name: WORLD === 2 ? 'ветров' : 'воздуха', emo: '🌪️', col: '255,120,190' }];
const RANK_AT = (i) => (CLASSES[i].final ? 5 : [1, 1, 2, 2, 3, 4][i] || 0);   // the rank exam each class holds
const RANK_BASE = [0, 0.30, 0.20, 0.12, 0.05, 0.025];    // chance at upgrade level 0 (rank 5: all four elements together)
const RANK_STEP = [0, 0.01, 0.01, 0.01, 0.01, 0.004];   // + per «Шанс экзамена» level
const RANK_MUL = [1, 1.3, 1.7, 2.2, 3, 5];              // a student in that rank pays this much more for every lesson
const FORM_BASE = [10000, 40000, 250000, 1200000, 6000000, 30000000];   // first card level price per rank
const MAX_EX_LVL = 20, MAX_XPL_LVL = 10, FORM_MAX = 20;
const exLvl = (i) => S.classes[i].ex || 0, xplLvl = (i) => S.classes[i].xpl || 0;
const rankChance = (i) => RANK_BASE[RANK_AT(i)] + RANK_STEP[RANK_AT(i)] * exLvl(i) + helpBonus(i);
const exCost = (i) => paced(CLASSES[i].tuition * 300 * Math.pow(2.0, exLvl(i)), exLvl(i) + 1);
const xplCost = (i) => paced(CLASSES[i].tuition * 200 * Math.pow(1.8, xplLvl(i)), xplLvl(i) + 1);
const fkey = (sp, rk, el) => sp + ':' + rk + (rk === 5 ? ':' + el : '');
const FORM_KEYS = SPECIES.flatMap((sp) => [0, 1, 2, 3, 4].map((rk) => fkey(sp, rk)).concat([0, 1, 2, 3].map((el) => fkey(sp, 5, el))));
const formSt = (k) => { S.forms ||= {}; return (S.forms[k] ||= { lvl: 1, xp: 0, seen: k.split(':')[1] === '0' }); };
const formOf = (a) => fkey(a.sp, a.rk || 0, a.el || 0);
const formRank = (k) => +k.split(':')[1];
const formTitle = (k) => { const [, rk, el] = k.split(':'); return +rk === 5 ? 'Мастер ' + ELEMS[el].name : RANKS[rk]; };
const formName = (k) => `${SP_NAMES[k.split(':')[0]]} — ${formTitle(k)}`;
const formNeed = (l) => Math.round(25 * Math.pow(1.6, l - 1));
const formCost = (k) => paced(FORM_BASE[formRank(k)] * Math.pow(2.1, formSt(k).lvl - 1), formSt(k).lvl);
const payMul = (a) => (SPECIES.includes(a.sp) ? RANK_MUL[a.rk || 0] * (1 + 0.05 * (formSt(formOf(a)).lvl - 1)) : 1);
const formReady = (k) => { const f = formSt(k); return f.seen && f.lvl < FORM_MAX && f.xp >= formNeed(f.lvl); };
function migrateForms() {   // build 149: the old per-species levels (builds 143-148) move into the album, nothing is lost
  if (!S || S.formsV) return;
  S.formsV = 1; S.forms ||= {};
  const OLD_TIERS = [1, 5, 10, 15, 20];
  for (const [sp, o] of Object.entries(S.spl || {})) {
    if (!SPECIES.includes(sp) || !o) continue;
    const f = formSt(fkey(sp, 0)); f.lvl = Math.min(FORM_MAX, Math.max(f.lvl, o.lvl || 1)); f.xp = Math.max(f.xp, o.xp || 0); f.seen = true;
    OLD_TIERS.forEach((v, t) => { if (t > 0 && (o.lvl || 1) >= v) formSt(fkey(sp, t)).seen = true; });   // outfits already earned stay open in the album
  }
}
function formXp(a, i) { if (SPECIES.includes(a.sp)) formSt(formOf(a)).xp += (1 + xplLvl(i)) * (loreQ('races') ? 1.05 : 1); }
let ffwd = false;   // true while fastForward() lives through the time the game was closed
function rankTry(a, i, p) {   // the rank exam right after a passed lesson
  const T = RANK_AT(i);
  if (!T || !SPECIES.includes(a.sp) || (a.rk || 0) !== T - 1) return;
  S.classes[i].rkTry = (S.classes[i].rkTry || 0) + 1;
  if (Math.random() >= rankChance(i)) return;
  a.rk = T; if (T === 5) a.el = Math.floor(Math.random() * 4);
  S.classes[i].rkPass = (S.classes[i].rkPass || 0) + 1;
  S.stats.ranks ||= [0, 0, 0, 0, 0, 0]; S.stats.ranks[T]++;
  popup(`🌟 ${T === 5 ? 'Мастер ' + ELEMS[a.el].name + '!' : RANKS[T] + '!'}`, p.x + 0.4, p.y - 0.6, '#b8860b', 80);
  const k = formOf(a), f = formSt(k);
  if (!f.seen) {
    f.seen = true;
    const gift = Math.max(300, Math.round((rateNow() || 1) * 60 * (1 + T)));
    S.coins += gift; S.stats.earned = (S.stats.earned || 0) + gift;
    if (!ffwd) toast(`📖 Новая карточка в альбоме: ${formName(k)} · 🪙 +${fmt(gift)}`);
  }
  if (!document.hidden && !ffwd) hintOnce('rank', '🌟', 'Ученик получил звание!', 'После урока ученик может сдать экзамен на следующее звание. Сдал — сразу получает новый наряд и дальше платит за уроки больше. Не сдал — ничего страшного, попробует в следующем классе.<br><br>Звания по порядку: Ученик (Травология, Зельеварение) → Младший маг (Звездочётство, Чары) → Маг (Полёты) → Старший маг (Магия стихий) → Мастер одной из четырёх стихий (Экзаменационный зал).<br><br>Каждый вид зверька в каждом наряде — карточка в альбоме 🎓. Там их можно улучшать.');
}
function rankSection(i) {   // the class panel part about the rank exam held here
  const T = RANK_AT(i); if (!T) return '';
  const st = S.classes[i], ch = rankChance(i);
  const who = T === 5 ? (WORLD === 2 ? 'Старший мастер → Хранитель горы' : 'Старший маг → Мастер стихии') : `${RANKS[T - 1]} → ${RANKS[T]}`;
  const cells = T === 5 ? ELEMS.map((e) => `<div><span>${e.emo}</span><b>${(ch / 4 * 100).toFixed(1).replace('.0', '')}%</b><i>${WORLD === 2 ? 'хранитель' : 'мастер'} ${e.name}</i></div>`).join('')
    : `<div><span>🌟</span><b>${pct(ch)}</b><i>сдают</i></div><div><span>🎯</span><b>${fmt(st.rkPass || 0)}</b><i>получили</i></div><div><span>💰</span><b>×${RANK_MUL[T]}</b><i>плата</i></div>`;
  return `<h3>Экзамен на звание</h3><p class="muted">После урока его пробуют только ученики со званием «${RANKS[T - 1]}»: <b>${who}</b>.</p>
    <div class="stats3${T === 5 ? ' four' : ''}">${cells}</div>
    <div class="card up"><span class="remoji">🌟</span><div class="grow"><b>Шанс экзамена</b> <span class="muted">ур. ${exLvl(i)}/${MAX_EX_LVL}</span><div class="muted">${nn('шанс', pc1(ch), pc1(peek((d) => { st.ex = exLvl(i) + d; }, () => rankChance(i))), exLvl(i) >= MAX_EX_LVL)} (+${pc1(RANK_STEP[T])} за уровень)</div></div>
      ${exLvl(i) >= MAX_EX_LVL ? '<span class="done">макс.</span>' : costBtn('↑', exCost(i), 'exlvl', `data-i="${i}"`)}</div>
    <div class="card up"><span class="remoji">📈</span><div class="grow"><b>Опыт</b> <span class="muted">ур. ${xplLvl(i)}/${MAX_XPL_LVL}</span><div class="muted">${nn('опыт карточке ученика за урок', '+' + (1 + xplLvl(i)), '+' + (2 + xplLvl(i)), xplLvl(i) >= MAX_XPL_LVL)}</div></div>
      ${xplLvl(i) >= MAX_XPL_LVL ? '<span class="done">макс.</span>' : costBtn('↑', xplCost(i), 'xpllvl', `data-i="${i}"`)}</div>`;
}
const formImg = (k) => { const [sp, rk, el] = k.split(':'); if (+rk === 5 && sprites[sp + '_m' + el]?.naturalWidth) return `assets/creatures/${sp}_m${el}.png?v=1`; const t = Math.min(4, +rk); return `assets/creatures/${sp}${t ? '_t' + t : ''}.png${t ? '?v=' + (TIER_V[sp] || 1) : ''}`; };   // the album follows TIER_V too
let albumSp = SPECIES[0];
function formCounts() {   // how many of each form are in the school now: students, tower residents, helper mages
  const c = {}, inc = (k) => { c[k] = (c[k] || 0) + 1; };
  for (const a of inSchool()) if (SPECIES.includes(a.sp)) inc(formOf(a));
  if (S.tower) [...(S.tower.res || []), ...(S.tower.wait || [])].forEach((r) => inc(fkey(r.sp, r.rk, r.el || 0)));
  for (const l of Object.values(S.helpers || {})) l.forEach((h) => inc(fkey(h.sp, h.rk || 3, h.el || 0)));
  return c;
}
let FC = {};
function formCard(k) {
  const f = formSt(k), rk = formRank(k), el = +(k.split(':')[2] || 0), need = formNeed(f.lvl);
  const pic = `<div class="fpic${f.seen ? '' : ' sil'}${rk === 5 ? ' master' : ''}"${rk === 5 ? ` style="--ec:rgb(${ELEMS[el].col})"` : ''}><img src="${formImg(k)}">${rk === 5 && f.seen ? `<em>${ELEMS[el].emo}</em>` : ''}</div>`;
  if (!f.seen) return `<div class="card up locked">${pic}<div class="grow"><b>${formTitle(k)}</b><div class="muted">${rk === 5 ? 'сдай экзамен на Мастера в Экзаменационном зале' : `ещё никто не стал ${RANKS_TO[rk]}`}</div></div><span class="muted">❔</span></div>`;
  return `<div class="card up">${pic}<div class="grow"><b>${formTitle(k)}</b> <span class="muted">ур. ${f.lvl}/${FORM_MAX}</span>
    <div class="muted">плата за урок ×${+(RANK_MUL[rk] * (1 + 0.05 * (f.lvl - 1))).toFixed(2)} · в школе сейчас: <b>${FC[k] || 0}</b></div>
    ${f.lvl < FORM_MAX ? `<div class="lvbar"><i style="width:${Math.min(100, f.xp / need * 100)}%"></i></div><div class="muted">опыт ${fmt(Math.min(f.xp, need))}/${fmt(need)}</div>` : ''}</div>
    ${f.lvl >= FORM_MAX ? '<span class="done">макс.</span>' : f.xp >= need ? costBtn('↑', formCost(k), 'formlvl', `data-k="${k}"`) : '<span class="muted">копит опыт</span>'}</div>`;
}
function speciesPanel() {   // 🎓 album (own button at the bottom; her ruling 2026-11-22: it levels the student IN THAT OUTFIT)
  const seen = FORM_KEYS.filter((k) => formSt(k).seen).length; FC = formCounts();
  const tabs = SPECIES.map((sp) => `<button class="chip${sp === albumSp ? ' on' : ''}${FORM_KEYS.some((k) => k.startsWith(sp + ':') && formReady(k)) ? ' dot' : ''}" data-alb="${sp}"><img src="assets/creatures/${sp}.png"></button>`).join('');
  return `<div class="sh-head"><span class="remoji big">🎓</span><div><h2>Альбом учеников</h2><div class="muted">Открыто карточек: ${seen} из ${FORM_KEYS.length}</div></div><button class="x" data-close>✕</button></div>
    <div class="chips">${tabs}</div><h3>${SP_NAMES[albumSp]}</h3>
    ${FORM_KEYS.filter((k) => k.startsWith(albumSp + ':')).map(formCard).join('')}
    <p class="muted">Звание ученик получает сам, сдав экзамен после урока. Каждый сданный урок даёт опыт карточке его вида и наряда. Накопился опыт — улучши карточку: все такие ученики платят на 5% больше.</p>`;
}
// ======================= the masters' tower (her choice 2026-11-22: rare graduates must not vanish) =======================
// Elder mages (rank 4) and masters (rank 5) who pass the final exam do not fly away: they move into the tower, live there
// and bring coins every second (also while the game is closed). Few places; more are bought. When the tower is full the
// newcomer waits by the door (up to TOWER_WAIT); the player frees a place by letting a resident go for a big reward.
const TOWER_BASE = 4, TOWER_MAXUP = 16, TOWER_WAIT = 3;
const TW = WORLD === 2 ? { name: 'Чертог Хранителей', emo: '🗝️', inN: 'в Чертоге Хранителей', inS: 'в Чертоге', elder: 'Старший мастер', elders: 'Старшие мастера', eldersD: 'Старшим мастерам', elderI: 'Старшим мастером', master: 'Хранитель', masterA: 'Хранителя', masters: 'Хранители', mastersG: 'Хранителей', masterTitle: 'Хранитель ', mage: 'Умелец', helpers: 'Помощники-умельцы', craft: 'своё ремесло' }
  : { name: 'Башня мастеров', emo: '🏰', inN: 'в Башне мастеров', inS: 'в башне', elder: 'Старший маг', elders: 'Старшие маги', eldersD: 'Старшим магам', elderI: 'Старшим магом', master: 'Мастер', masterA: 'Мастера', masters: 'Мастера', mastersG: 'Мастеров', masterTitle: 'Мастер ', mage: 'Маг', helpers: 'Помощники-маги', craft: 'магию' };   // tower texts per world
const towerUp = () => (S.tower ||= { built: false, cap: 0, res: [], wait: [] });
const towerOpen = () => WORLD <= 2 && !!(S && bReady(S.tower));
const towerCap = () => TOWER_BASE + towerUp().cap;
const towerCost = () => BAL.tower;
// build audit 2026-11-24: places grew x2.3 each (12th 6.8B, 20th 5.33T, never paid back); x1.45: all 20 cost ~25B in total
const towerCapCost = () => paced(BAL.tower * 0.4 * Math.pow(1.45, towerUp().cap), towerUp().cap + 1);
const RES_K = { 4: 0.015, 5: 0.05 };   // coins per second = tuition of the last class x this
const resRate = (r) => { const li = NCLS - 1; return isOpen(li) ? tuition(li) * (RES_K[r.rk] || 0) : 0; };
const towerRate = () => (towerOpen() ? towerUp().res.reduce((n, r) => n + resRate(r), 0) : 0);
const mastersLiving = () => (towerOpen() ? towerUp().res.filter((r) => r.rk === 5).length : 0);
const resTitle = (r) => (r.rk === 5 ? TW.masterTitle + ELEMS[r.el || 0].name : RANKS[r.rk]);
const releaseReward = (r) => Math.round(resRate(r) * 3600);   // one hour of what it brings
function towerCandidate(a) { return towerOpen() && SPECIES.includes(a.sp) && (a.rk || 0) >= (towerUp().onlyM ? 5 : 4); }   // onlyM (her request 2026-11-22): elder mages are refused automatically and graduate as usual
function towerAdmit(a) {   // the graduate walks from the garden into the tower (or waits at its door)
  const T = towerUp(), r = { sp: a.sp, rk: a.rk, el: a.el || 0, name: a.name, t: Date.now() };
  const s = SLOTS.TOWER;
  if (T.res.length < towerCap()) {
    a.state = 'walk'; a.goal = { t: 'tw' };
    T.res.push(r);   // the place is taken at once (a reload while walking keeps the resident); the walk is only for the eye
    walk(a, s.x0 + 1.5 + Math.random() * 3, s.y0 + 1.5 + Math.random() * 3, () => { a.gone = true; popup(TW.emo, a.x, a.y, '#7b5cd6', 44); });
    if (!ffwd) toast(`${TW.emo} ${a.name} (${resTitle(r)}) поселился ${TW.inN}`);
  } else if (T.wait.length < TOWER_WAIT) {
    T.wait.push(r); a.state = 'walk'; a.goal = { t: 'tw' };
    walk(a, s.x0 + 2.4 + (T.wait.length - 1) * 0.7, s.y0 - 0.5, () => { a.gone = true; });
    if (!ffwd) toast(`${TW.emo} ${WORLD === 2 ? 'Чертог полон' : 'Башня полна'}: ${a.name} (${resTitle(r)}) ждёт у двери`);
  } else return false;
  return true;
}
function towerPull() { const T = towerUp(); while (T.wait.length && T.res.length < towerCap()) T.res.push(T.wait.shift()); }
let towerT = 0;
let retakeAcc = 0;
function stepTower(dt) {
  if (WORLD <= 2) { retakeAcc += dt; if (retakeAcc >= 1) { retakeAcc -= 1; stepRetake(1); stepMasterClass(1); } }   // helpers retake even without the tower
  if (!towerOpen()) return;
  towerT += dt; if (towerT < 1) return;
  const n = towerRate() * towerT; towerT = 0;
  if (n > 0) { S.coins += n; S.stats.earned = (S.stats.earned || 0) + n; S.stats.tower = (S.stats.tower || 0) + n; earnedThisSec += n; }
}
// ---- master retakes (her choice 2026-11-22): an elder mage living in the tower now and then walks to the exam hall,
// sits the final exam again and tries the master exam once more; passed -> master; either way he comes back to the tower.
const RETAKE_MAX = 10;
const retakeLvl = () => towerUp().prep || 0;
const retakeInterval = () => Math.round(300 * Math.pow(0.85, retakeLvl()));   // 5 min -> ~1 min at level 10
const retakeCost = () => paced(BAL.tower * 0.15 * Math.pow(2.0, retakeLvl()), retakeLvl() + 1);
function stepRetake(dt) {
  const T = towerUp(), FI = CLASSES.findIndex((c) => c.final);
  const helpers = []; for (const [ci, l] of Object.entries(S.helpers || {})) l.forEach((h) => { h.id ||= S.nextId++; helpers.push([+ci, h]); });
  const all = [...(towerOpen() ? T.res.map((r) => [-1, r]) : []), ...helpers];
  all.forEach(([, r]) => { r.id ||= S.nextId++; if (r.away && !agents.some((a) => a.retake === r.id)) r.away = false; });   // lost walker (reload): he is home again
  if (all.some(([, r]) => r.away)) return;                  // one at a time
  const pool = all.filter(([ci, r]) => r.rk === 4 && (ci < 0 || isOpen(ci)));
  if (!pool.length || FI < 0 || !isOpen(FI)) { T.rt = retakeInterval(); return; }
  T.rt = (T.rt ?? retakeInterval()) - dt;
  if (T.rt > 0) return;
  T.rt = retakeInterval();
  const [ci, r] = pool[Math.floor(Math.random() * pool.length)];
  r.away = true;
  const [d] = ci < 0 ? SLOTS.TOWER.door : slotOf(ci).door;
  const a = { id: S.nextId++, sp: r.sp, rk: 4, el: 0, name: r.name, x: d[0] + 0.5, y: d[1] + 0.5, z: 0, path: [], speed: 2.5, state: 'walk', onArrive: null, flip: false, t: 0, dur: 1, c: -1, desk: -1, ph: Math.random() * 6, mood: 95, paid: 0, retake: r.id };
  agents.push(a);
  if (!ffwd) toast(`📜 ${r.name} (${TW.elder}) пошёл пересдавать экзамен на ${TW.masterA}`);
  goClass(a, FI);
}
// ---- master-classes (her choice 2026-11-22, variant 1): masters do not study any more, so their album cards never grew.
// Now and then a master (tower resident or master helper) walks to the Elements class, stands at the front beside the teacher
// and shows magic for MC_DUR s: every lesson passed there meanwhile gives his master card XP and the class +MC_BONUS exam chance.
// Only while the game is open (no master-classes in the offline catch-up); one at a time.
const MC_DUR = 90, MC_GAP = 60, MC_BONUS = 0.05, MC_XP = 10;
let mcGap = 20, mcLastEl = -1;   // elements take turns (her ruling 2026-11-22: «старались по очереди стихии идти», air went twice in a row)
const mcClass = () => CLASSES.findIndex((c) => c.id === (WORLD === 2 ? 'lake' : 'elements'));   // the class where the rank-4 exam is held
const mcActive = (i) => agents.some((a) => a.mcls && a.state === 'mclass' && a.mcC === i);
function mcMasters() {   // [classIndex or -1 for the tower, record] of every master who can go
  const out = towerOpen() ? towerUp().res.filter((r) => r.rk === 5).map((r) => [-1, r]) : [];
  for (const [ci, l] of Object.entries(S.helpers || {})) l.forEach((h) => { if (h.rk === 5) out.push([+ci, h]); });
  return out;
}
function stepMasterClass(dt) {
  if (WORLD > 2 || ffwd) return;
  const all = mcMasters();
  all.forEach(([, r]) => { if (r.mc && !agents.some((a) => a.mcls === r.id)) r.mc = false; });   // lost walker (reload): he is home again
  if (all.some(([, r]) => r.mc)) return;
  const i = mcClass(); if (i < 0 || !isOpen(i)) return;
  mcGap -= dt; if (mcGap > 0) return;
  const pool = all.filter(([ci, r]) => !r.away && (ci < 0 || isOpen(ci))); if (!pool.length) { mcGap = 10; return; }
  mcGap = MC_GAP;
  let pick = pool;
  for (let k = 1; k <= 4; k++) { const e = (mcLastEl + k + 4) % 4, l = pool.filter(([, r]) => (r.el || 0) === e); if (l.length) { pick = l; break; } }   // the next element in turn that has a master free
  const [ci, r] = pick[Math.floor(Math.random() * pick.length)];
  mcLastEl = r.el || 0;
  r.id ||= S.nextId++; r.mc = true;
  const [d] = ci < 0 ? SLOTS.TOWER.door : slotOf(ci).door;
  const a = { id: S.nextId++, sp: r.sp, rk: 5, el: r.el || 0, name: r.name, x: d[0] + 0.5, y: d[1] + 0.5, z: 0, path: [], speed: 2.5, state: 'walk', onArrive: null, flip: false, t: 0, dur: MC_DUR, c: -1, mcC: i, desk: -1, ph: Math.random() * 6, mood: 100, paid: 0, mcls: r.id, mcHome: ci };
  agents.push(a);
  toast(`✨ ${r.name} (${resTitle({ rk: 5, el: r.el || 0 })}) идёт вести мастер-класс в «${CLASSES[i].name}»`);
  const tp = teacherPos(i), s = slotOf(i);
  walk(a, Math.max(s.x0 + 0.8, tp.x - 2.2), tp.y + 0.5, () => { a.state = 'mclass'; a.t = 0; faceTeacher(a, i); a.back = false; a.flip = !a.flip; });   // faces the class
}
function mcHome(a) {   // the master-class is over: back to the tower (or to the class he helps)
  a.state = 'walk'; const ci = a.mcHome;
  const done = () => { a.gone = true; for (const [, r] of mcMasters()) if (r.id === a.mcls) r.mc = false; };
  if (ci >= 0 && slotOf(ci)) { const [, dh] = slotOf(ci).door; walk(a, dh[0] + 0.5, dh[1] + 0.5, done); return; }
  const s = SLOTS.TOWER; walk(a, s.x0 + 1.5 + Math.random() * 3, s.y0 + 1.5 + Math.random() * 3, done);
}
function mcLesson(i) {   // a lesson passed in class i: the master teaching there learns too
  const a = agents.find((x) => x.mcls && x.state === 'mclass' && x.mcC === i); if (!a) return 0;
  formSt(fkey(a.sp, 5, a.el)).xp += MC_XP * (1 + xplLvl(i));
  return MC_BONUS;
}
function retakeHome(a) {   // back from the exam hall: update the resident, walk into the tower (or back to the class he helps)
  const T = towerUp(), r = T.res.find((x) => x.id === a.retake), s = SLOTS.TOWER;
  if (!r) for (const [ci, l] of Object.entries(S.helpers || {})) {
    const k = l.findIndex((x) => x.id === a.retake); if (k < 0) continue;
    const h = l[k]; h.rk = a.rk || 4; h.el = a.el || 0; h.away = false;
    if (h.rk === 5 && towerOpen() && T.res.length < towerCap()) {   // a new master moves into the tower, his helper place is free again
      l.splice(k, 1); T.res.push({ sp: h.sp, rk: 5, el: h.el, name: h.name, t: Date.now(), id: h.id });
      if (!ffwd) toast(`${TW.emo} ${h.name} (${resTitle(h)}) переехал ${TW.inN}`);
      break;
    }
    const [, dh] = slotOf(+ci).door; a.c = -1; a.state = 'walk'; a.goal = { t: 'tw' };
    walk(a, dh[0] + 0.5, dh[1] + 0.5, () => { a.gone = true; });
    return;
  }
  if (r) { r.rk = a.rk || 4; r.el = a.el || 0; r.away = false; }
  a.c = -1; a.state = 'walk'; a.goal = { t: 'tw' };
  walk(a, s.x0 + 1.5 + Math.random() * 3, s.y0 + 1.5 + Math.random() * 3, () => { a.gone = true; });
}
function towerPos(k) {   // render-only: residents stroll slowly in a ring around the velvet sofa, each now and then stops
  const s = SLOTS.TOWER, n = Math.max(1, towerUp().res.length), T = performance.now() / 1000;
  const ph = (T * 0.09 + k * 0.37) % 1, walking = ph < 0.55;
  const ang = k * 2 * Math.PI / n + 0.5 * Math.sin(T * 0.11 + k * 1.3) + (walking ? 0 : 0), r = 1.75 + 0.25 * Math.sin(k * 2.1);
  const x = s.x0 + 3 + Math.cos(ang) * r, y = s.y0 + 3 + Math.sin(ang) * r * 0.9;
  const dx = -Math.sin(ang), dy = Math.cos(ang), dir = Math.cos(T * 0.11 + k * 1.3) >= 0 ? 1 : -1;
  return { x: Math.min(s.x1 - 0.5, Math.max(s.x0 + 0.5, x)), y: Math.min(s.y1 - 0.5, Math.max(s.y0 + 0.5, y)), moving: walking, flip: (dx - dy) * dir < 0 };
}
function towerPanel() {
  const T = towerUp(), LC = CLASSES[NCLS - 1], FC = CLASSES.find((c) => c.final), MC = CLASSES[mcClass()] || LC, W2T = WORLD === 2;
  const head = (sub) => `<div class="sh-head"><span class="remoji big">${TW.emo}</span><div><h2>${TW.name}</h2><div class="muted">${sub}</div></div><button class="x" data-close>✕</button></div>`;
  if (!T.built) return `${head(W2T ? 'Дом для самых искусных выпускников' : 'Дом для самых сильных выпускников')}
    <p>${TW.elders} и ${TW.masters} после финального экзамена не ${W2T ? 'уходят' : 'улетают'}, а живут здесь. Каждый жилец приносит монеты каждую секунду — даже когда игра закрыта. ${TW.masters} ещё и поднимают плату в зале «${LC.name}» на 3% каждый.</p>
    <p class="muted">Мест сначала ${TOWER_BASE}, потом можно докупить.</p>
    ${isOpen(NCLS - 1) ? `<button class="btn wide" data-cost="${towerCost()}" data-act="towerbuild">Построить <span class="cost">🪙${fmt(towerCost())}</span></button>` : `<p><b>Сначала построй «${LC.name}» ${LC.emoji}</b> — там ученики становятся ${W2T ? 'Старшими мастерами' : 'Старшими магами'}.</p>`}`;
  const pic = (r) => `<div class="fpic${r.rk === 5 ? ' master' : ''}"${r.rk === 5 ? ` style="--ec:rgb(${ELEMS[r.el].col})"` : ''}><img src="${formImg(fkey(r.sp, r.rk, r.el))}">${r.rk === 5 ? `<em>${ELEMS[r.el].emo}</em>` : ''}</div>`;
  const res = T.res.map((r, k) => `<div class="card up">${pic(r)}<div class="grow"><b>${r.name}</b> <span class="muted">${resTitle(r)}</span><div class="muted">${r.away ? `📜 сейчас пересдаёт экзамен на ${TW.masterA}` : r.mc ? '✨ сейчас ведёт мастер-класс' : `🪙 ${fmt(resRate(r))} в секунду`}</div></div>
    ${r.away || r.mc ? '' : `<button class="btn ghost" data-act="towerfree" data-k="${k}">Отпустить <span class="cost">🎁 ${fmt(releaseReward(r))}</span></button>`}</div>`).join('');
  const elders = T.res.filter((r) => r.rk === 4).length, away = T.res.find((r) => r.away);
  const retake = `<h3>Пересдача на ${TW.masterA}</h3><p class="muted">${!elders ? `Когда ${TW.inS} живёт ${TW.elder}, он время от времени ходит ${W2T ? 'в Палату клятв' : 'в Экзаменационный зал'} пересдавать экзамен на ${TW.masterA}.` : away ? `Сейчас <b>${away.name}</b> пересдаёт экзамен.` : `Следующий ${TW.elder} пойдёт на пересдачу через <b>${mmss(Math.max(0, T.rt ?? retakeInterval()))}</b>. Шанс стать ${W2T ? 'Хранителем' : 'Мастером'}: ${(rankChance(CLASSES.findIndex((c) => c.final)) * 100).toFixed(1)}%.`}</p>
    <div class="card up"><span class="remoji">📜</span><div class="grow"><b>${W2T ? 'Подготовка хранителей' : 'Подготовка мастеров'}</b> <span class="muted">ур. ${retakeLvl()}/${RETAKE_MAX}</span><div class="muted">${nn('пересдача раз в', mmss(retakeInterval()), mmss(peek((d) => { towerUp().prep = retakeLvl() + d; }, retakeInterval)), retakeLvl() >= RETAKE_MAX)}</div></div>
      ${retakeLvl() >= RETAKE_MAX ? '<span class="done">макс.</span>' : costBtn('↑', retakeCost(), 'towerprep')}</div>`;
  const wait = T.wait.map((r, k) => `<div class="card up locked">${pic(r)}<div class="grow"><b>${r.name}</b> <span class="muted">${resTitle(r)}</span><div class="muted">ждёт места у двери</div></div>
    <button class="btn ghost" data-act="towerno" data-k="${k}">Не брать</button></div>`).join('');
  return `${head(`Живут ${T.res.length} из ${towerCap()} · 🪙 ${fmt(towerRate() * 60)} в минуту`)}
    <div class="card up"><span class="remoji">🛏️</span><div class="grow"><b>Ещё одно место</b> <span class="muted">${towerCap()}/${TOWER_BASE + TOWER_MAXUP}</span><div class="muted">${TW.inS} смогут жить больше ${TW.mastersG}</div></div>
      ${T.cap >= TOWER_MAXUP ? '<span class="done">макс.</span>' : costBtn('+1', towerCapCost(), 'towercap')}</div>
    <div class="card up"><span class="remoji">🚪</span><div class="grow"><b>Принимать только ${TW.mastersG}</b><div class="muted">${T.onlyM ? `включено: ${TW.eldersD} ${W2T ? 'Чертог отказывает сам' : 'башня отказывает сама'}, они просто выпускаются` : `выключено: ${W2T ? 'в Чертог' : 'в башню'} просятся и ${TW.elders}`}</div></div>
      <button class="btn${T.onlyM ? '' : ' ghost'}" data-act="toweronly">${T.onlyM ? 'Вкл' : 'Выкл'}</button></div>
    ${T.wait.length ? `<h3>Ждут у двери: ${T.wait.length}</h3>${wait}<p class="muted">Освободи место — и первый ждущий сразу заселится. Если мест нет, а у двери уже ${TOWER_WAIT}, следующие выпускаются как обычно.</p>` : ''}
    <h3>Мастер-классы ✨</h3><p class="muted">${TW.masters} по очереди ходят в «${MC.name}» и показывают ученикам ${TW.craft} (1,5 минуты, только пока игра открыта). Пока идёт мастер-класс, ученики там сдают на 5% лучше, а карточка ${TW.masterA} в альбоме получает опыт за каждый сданный урок.</p>
    ${retake}
    <h3>Жильцы</h3>${res || `<p class="muted">Пока никого. Сюда попадут ученики, которые сдали финальный экзамен ${TW.elderI} или ${W2T ? 'Хранителем' : 'Мастером'}.</p>`}`;
}
// ======================= helper mages (her ruling 2026-11-22) =======================
// A student who passes the final exam as a «Маг» (rank 3) stays and helps a teacher: at most two helpers per class and
// never two of the same kind in one class; when no class can take him, he graduates as usual. Helpers stroll between
// their class and the corridor in front of it, and each one raises the rank exam chance of that class.
const HELP_MAX = 2, HELP_BONUS = 0.03;
const helpersAll = () => (S.helpers ||= {});
const helpersOf = (i) => (S && S.helpers && S.helpers[i]) || [];
const HELP_BONUS_ELDER = 0.03;
const helpBonus = (i) => helpersOf(i).reduce((n, h) => n + (h.away ? 0 : (h.rk || 3) >= 4 ? HELP_BONUS_ELDER : HELP_BONUS), 0);
const helpersCount = () => Object.values(helpersAll()).reduce((n, l) => n + l.length, 0);
function helperSlot(sp) {   // the class with the fewest helpers that has no helper of this kind yet
  let best = -1;
  for (let i = 0; i < NCLS; i++) {
    if (!isOpen(i)) continue;
    const h = helpersOf(i);
    if (h.length >= HELP_MAX || h.some((x) => x.sp === sp)) continue;
    if (best < 0 || h.length < helpersOf(best).length) best = i;
  }
  return best;
}
// Her ruling 2026-11-22 («После того как открываются старшие маги, они заменяют тех кто у преподавателей тусуется.
// Переодически ходят тоже на повышение»): an elder (rank 4) graduate takes a free helper place or replaces a «Маг»
// (that one graduates); elder helpers go to master retakes like the tower elders; a new master moves to the tower.
function elderSlot(sp) {   // [class, index of the mage to replace or -1 for a free place]
  const free = helperSlot(sp); if (free >= 0) return [free, -1];
  for (let i = 0; i < NCLS; i++) { if (!isOpen(i)) continue; const h = helpersOf(i), k = h.findIndex((x) => (x.rk || 3) === 3 && x.sp === sp); if (k >= 0) return [i, k]; }   // same kind: the class stays varied
  for (let i = 0; i < NCLS; i++) { if (!isOpen(i)) continue; const h = helpersOf(i); if (h.some((x) => x.sp === sp)) continue; const k = h.findIndex((x) => (x.rk || 3) === 3); if (k >= 0) return [i, k]; }
  return [-1, -1];
}
function helperAdmit(a) {
  if (WORLD > 2 || !SPECIES.includes(a.sp) || ((a.rk || 0) !== 3 && (a.rk || 0) !== 4)) return false;
  let i, k = -1;
  if (a.rk === 4) [i, k] = elderSlot(a.sp); else i = helperSlot(a.sp);
  if (i < 0) return false;
  const list = (helpersAll()[i] ||= []);
  if (k >= 0) { const old = list.splice(k, 1)[0]; if (!ffwd) toast(`🎓 ${old.name} (${TW.mage}) уступил место: пришёл ${TW.elder}, а он выпустился`); }
  list.push({ sp: a.sp, name: a.name, rk: a.rk, el: 0, id: S.nextId++ });   // taken at once; the walk back to the class is for the eye
  const [, h] = slotOf(i).door; a.state = 'walk'; a.goal = { t: 'tw' };
  walk(a, h[0] + 0.5, h[1] + 0.5, () => { a.gone = true; });
  if (!ffwd) toast(`🪄 ${a.name} (${RANKS[a.rk]}) остался помогать: ${CLASSES[i].emoji} ${CLASSES[i].name}`);
  return true;
}
const helpPaths = {};
function helperRoute(i, k) {   // inside spot -> door -> a little way into the corridor (cached per layout)
  const s = slotOf(i), key = [s.x0, s.y0, s.x1, s.y1, k].join(',');
  let r = helpPaths[i + ':' + k];
  if (r && r.key === key) return r;
  const inside = { x: k ? s.x1 - 1.3 : s.x0 + 1.3, y: s.y0 + 1.9 };
  const [d0, h] = s.door, dx = h[0] - d0[0], dy = h[1] - d0[1];
  let out = { x: h[0] + 0.5 + dx * 1.5 + (k ? 0.8 : -0.8) * Math.abs(dy), y: h[1] + 0.5 + dy * 1.5 + (k ? 0.8 : -0.8) * Math.abs(dx) };
  if (!regAt(Math.floor(out.x), Math.floor(out.y))) out = { x: h[0] + 0.5, y: h[1] + 0.5 };
  const pts = [inside, ...bfs(inside.x, inside.y, h[0] + 0.5, h[1] + 0.5), out];
  const cum = [0]; for (let n = 1; n < pts.length; n++) cum.push(cum[n - 1] + Math.hypot(pts[n].x - pts[n - 1].x, pts[n].y - pts[n - 1].y));
  r = helpPaths[i + ':' + k] = { key, pts, cum, len: cum[cum.length - 1] };
  return r;
}
function helperPos(i, k) {   // render-only: helps inside 16 s, walks out, looks around the corridor 5 s, walks back
  const r = helperRoute(i, k), walkT = Math.max(1, r.len / 1.1), inT = 16, outT = 5, cyc = inT + outT + 2 * walkT;
  const T = (performance.now() / 1000 + i * 7.3 + k * (cyc / 2)) % cyc;
  let d, moving = false, back = false;
  if (T < inT) d = 0;
  else if (T < inT + walkT) { d = (T - inT) / walkT * r.len; moving = true; }
  else if (T < inT + walkT + outT) d = r.len;
  else { d = (1 - (T - inT - walkT - outT) / walkT) * r.len; moving = true; back = true; }
  let n = 1; while (n < r.cum.length - 1 && r.cum[n] < d) n++;
  const a = r.pts[n - 1], b = r.pts[n] || a, seg = Math.max(1e-6, r.cum[n] - r.cum[n - 1]), u = Math.min(1, Math.max(0, (d - r.cum[n - 1]) / seg));
  const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
  const dir = back ? { x: a.x - b.x, y: a.y - b.y } : { x: b.x - a.x, y: b.y - a.y };
  const sway = moving ? 0 : Math.sin(performance.now() / 900 + k) * 0.15;
  return { x: x + sway, y, moving, flip: moving ? (dir.x - dir.y) < 0 : k === 1, back: moving && (dir.x + dir.y) < 0 };
}
function helpersHtml(i) {
  if (WORLD > 2 || CLASSES[i].final) return '';
  const h = helpersOf(i);
  return `<div class="card up"><span class="remoji">🪄</span><div class="grow"><b>${TW.helpers}: ${h.length}/${HELP_MAX}</b><div class="muted">${h.length ? h.map((x) => `${x.name} (${RANKS[x.rk || 3]}, ${SP_NAMES[x.sp]})${x.away ? ` — пересдаёт на ${TW.masterA}` : ''}`).join(', ') : `выпускник со званием «${TW.mage}» останется помогать, если здесь нет помощника его вида`} · +${HELP_BONUS * 100}% к экзамену на звание за каждого. ${TW.elder} сменяет ${WORLD === 2 ? 'Умельца' : 'Мага'} и время от времени ходит пересдавать на ${TW.masterA}</div></div></div>`;
}
function peoplePanel() {
  const l = inSchool(), n = (f) => l.filter(f).length;
  const rows = [
    ['🛎️', 'в приёмной', n((a) => queue.includes(a))],
    ['📖', 'на уроках', n((a) => a.state === 'study')],
    ['🚪', 'в очереди у классов', n((a) => a.state === 'wait' || a.state === 'walkwait')],
    ...(courtCap() ? [['⛲', 'ждут места во дворе', n((a) => a.goal && a.goal.t === 'k' && !a.goal.brk)], ['🌳', 'на перемене во дворе', n((a) => a.goal && a.goal.t === 'k' && a.goal.brk)]] : []),
    ['💤', 'в спальне ждут места', n((a) => a.state === 'sleep' || a.state === 'dline' || a.state === 'checkin' || (a.goal && a.goal.t === 'd'))],
    ['📚', 'в библиотеке', n((a) => a.state === 'read' || (a.goal && a.goal.t === 'l'))],
    ...(cantOpen() ? [['🍽️', 'в столовой', n((a) => a.goal && a.goal.t === 'cant')]] : []),
    ['🚶', 'идут по школе', n((a) => a.state === 'walk' && !queue.includes(a) && !(a.goal && (a.goal.t === 'd' || a.goal.t === 'l')))],
  ];
  return `<div class="sh-head"><span class="remoji big">👥</span><div><h2>Ученики в школе: ${l.length}</h2><div class="muted">Настроение ${moodFace(avgMood())} ${Math.round(avgMood())}% · всего выпустилось 🎓 ${fmt(S.stats.graduated)}</div></div><button class="x" data-close>✕</button></div>
    ${rows.map(([e, t, v]) => `<div class="card up"><span class="remoji">${e}</span><div class="grow"><b>${v}</b> ${t}</div></div>`).join('')}
`;
}
function renderInsp() {
  const el = $('#insp'); if (!el || !S) return;
  const I = S.insp || {}, c = I.cur;
  const html = c ? `<button class="ipill live" data-insp>🧐 Проверка ${mmss(c.left)} · ${INSP_KINDS[c.kind].now(c)}</button>`
    : calm() ? `<button class="ipill" data-insp>😌 ⭐ ${schoolStars()}</button>`
    : `<button class="ipill" data-insp>⭐ ${schoolStars()}</button>`;   // the warning itself is the banner below (iwarn)   // the warning names what will be checked (her report 2026-11-21)
  const warn = !c && !calm() && I.next ? `<button class="iwarn" data-insp>🧐 Через ${mmss(I.t)} придёт инспектор<br><b>Проверит: ${inspNextText(I.next)}</b></button>` : '';   // full text of what will be checked, 40 s ahead (her wish 2026-11-21)
  const res = WORLD === 2 && S.w2 ? `<button class="ipill" data-w2res>⛏️ ${fmt(S.w2.ore)} · ⚒️ ${fmt(S.w2.items)}${S.w2.gems ? ` · 💎 ${fmt(S.w2.gems)}` : ''}</button>` : '';   // world 2: ore, items, gems
  // build 304 (her «Много кнопок на экране ... меню-раскладку»): top, alliance and people live in the ✨ menu; build 306 (her «Миры повторяются,
  // не нужно их в раскладке, зельеварка тоже, звезды тоже. Рейтинг верни ... вверху, а альбом ... внизу»): rating, mini-game, stars, worlds, album stay on screen
  const all = `<button class="ipill rate" data-rating>🏅 ${ratingTxt()}</button>` + MG.pill() + html + res + warn;   // build 306 (her «Рейтинг верни на прежнее место вверху»)
  if (el.dataset.h !== all) { el.dataset.h = all; morph(el, emojiHtml(all)); }
  { let sh = document.getElementById('stones-hud'); if (!sh) { sh = document.createElement('div'); sh.id = 'stones-hud'; el.parentElement.appendChild(sh); }   // moonstones alone at the top right, shimmering (tester №73po7zf1, 2026-11-24)
    const sp = `<button class="ipill stones" data-stones aria-label="Лунные камни">${ST_IMG(20)}<b>${stones()}</b></button>`; if (sh.dataset.h !== sp) { sh.dataset.h = sp; sh.innerHTML = sp; } }   // in-place update: icons are never re-created (they blinked)
  renderMenu();
}
// ======================= main-screen menu (build 304) =======================
// One round ✨ button (bottom left) opens a 3-column grid of big labelled tiles; her picks 2026-11-23: tiles (variant A), a red number
// on the button = everything inside that waits for her. Every tile is a plain button with the SAME data-* attribute as before, so the
// global click handler opens the same panels. Never put an emoji inside an attribute here (emojiHtml would turn it into <img>).
// Other features add tiles with addMenuItem({ attr: 'data-xxx', icon: '🎁', label: 'Сундучки', sub: () => 'text', badge: () => n, glow: () => bool })
const menuExtra = [];
function addMenuItem(it) { menuExtra.push(it); renderMenu(); }
window.schoolMenu = { add: addMenuItem, close: () => setMenu(false) };   // for other modules (js/*.js), which cannot import game.js
let menuOpen = false;
function menuItems() {
  const ally = [allyGifts.length ? '🎁 ' + allyGifts.length : '', ownReqs.length ? '📩 ' + ownReqs.length : ''].filter(Boolean).join(' · ');
  const base = [
    { attr: 'data-top', icon: '🏆', label: 'Топ школ' },
    { attr: 'data-ally', icon: '🤝', label: 'Альянс', sub: ally, badge: allyGifts.length + ownReqs.length },
    { attr: 'data-people', icon: '👥', label: 'Ученики', sub: String(inSchool().length) },
    { attr: 'data-mg', icon: '🧪', label: 'Мини-игры', sub: (() => { const n = MG.charges(); return n ? `попыток: ${n}` : ''; })() },   // also in the menu (tester №73po7zf1, Maria's pick «И там, и там»: the 🧪 pill stays)
  ];
  for (const it of menuExtra) base.push({ attr: it.attr, icon: it.icon, label: it.label, sub: it.sub ? it.sub() : '', badge: it.badge ? it.badge() : 0, glow: it.glow ? it.glow() : false });
  return base;
}
function renderMenu() {
  const btn = $('#menubtn'), grid = $('#menugrid'); if (!btn || !grid || !S) return;
  const list = menuItems(), n = list.reduce((a, it) => a + (it.badge || 0), 0), glow = list.some((it) => it.glow);
  const bh = `${menuOpen ? '✖' : '✨'}${n && !menuOpen ? `<span class="badge">${n}</span>` : ''}`;
  if (btn.dataset.h !== bh) { btn.dataset.h = bh; morph(btn, emojiHtml(bh)); }
  btn.classList.toggle('ready', !menuOpen && !n && glow);   // nothing to count, but something can be bought (album cards): soft gold pulse as before
  btn.classList.toggle('open', menuOpen);
  const gh = list.map((it) => `<button class="mtile${it.glow ? ' glow' : ''}" ${it.attr}><span class="mi">${it.icon}</span><span class="ml">${it.label}</span>${it.sub ? `<small>${it.sub}</small>` : ''}${it.badge ? `<span class="badge">${it.badge}</span>` : ''}</button>`).join('');
  if (grid.dataset.h !== gh) { grid.dataset.h = gh; morph(grid, emojiHtml(gh)); }
}
$('#menudim')?.addEventListener('pointerdown', (e) => { e.preventDefault(); setMenu(false); });   // a tap on the map around the menu closes it
function setMenu(on) {
  menuOpen = on; $('#stage').classList.toggle('menu-on', on); renderMenu();
  if (!panel) $('#tour').classList.toggle('under-panel', on);   // the tour card hides under the menu as it does under panels
}
function stepWorld(dt, live = false) {
  stepIncidents(dt, live);
  stepInspector(dt, live);
  stepBoss(dt, live);
  stepAdvisor(dt, live);
  stepRefund(dt);
  stepTrade(dt);
  stepMoon();
  stepStones(dt);
  stepExped();
  stepRumble(dt, live);
  arrivalT -= dt;
  if (arrivalT <= 0) { arrivalT = arrivalInterval(); gateArrive(); } if (gatePend() && gateLet(queue.length < queueCap(), !(WORLD === 2 ? schoolFull() : freeBeds() <= 4))) spawn();   // world 1 too: nobody new comes while the court and the dorm are (almost) full   // world 2: nobody new comes while every line and every bed is taken
  startNextProcess(live);
  if (processing) { procT = Math.min(procT + dt, procTime()); if (procT >= procTime()) finishProcess(); }
  concPlace(); stepConcierge(dt); if (NEWDORM) stepConcierge2(dt);
  wakeSleepers();
  if (cantBuilt() && S.cant.end && Date.now() >= S.cant.end) { S.cant.end = 0; toast(WORLD === 2 ? '🍖 Пиршественный зал открыт!' : '🍽️ Столовая открыта!'); dirtyPanel = true; staticKey = ''; }
  S.classes.forEach((c, i) => { if (c.built && c.buildEnd && Date.now() >= c.buildEnd) { c.buildEnd = 0; toast(`✨ Построено: ${CLASSES[i].name}!`); dirtyPanel = true; staticKey = ''; } });
  stepAgents(dt, live);
  stepTower(dt);
  for (let i = popups.length - 1; i >= 0; i--) { const p = popups[i]; p.t += dt; p.lift += 26 * dt; if (p.t > 1.3) popups.splice(i, 1); }
}

// ======================= rendering =======================
const canvas = $('#world'), ctx = canvas.getContext('2d');
const scroller = $('#view');
// world pixel bounds
let MINE, MAXE, MINS, MAXS, OX, OY, WW, WH, SW, SH;
function computeBounds() {
  MINE = 1e9; MAXE = -1e9; MINS = 1e9; MAXS = -1e9;
  for (let x = 0; x < GW; x++) for (let y = -YOFF; y < GH; y++) if (regAt(x, y)) { MINE = Math.min(MINE, x - y - 1); MAXE = Math.max(MAXE, x - y + 1); MINS = Math.min(MINS, x + y); MAXS = Math.max(MAXS, x + y + 2); }
  OX = -MINE * HW + 10 + MARGIN; OY = -MINS * HH + WALLH + 40 + MARGIN;
  WW = (MAXE - MINE) * HW + 20 + 2 * MARGIN; WH = (MAXS - MINS) * HH + WALLH + 80 + 2 * MARGIN;
  SW = WW - 2 * MARGIN; SH = WH - 2 * MARGIN;   // the static layer covers the school only, not the grass margin
}
// MARGIN = grass around the school, so the camera can put any place (gate, garden) in the middle of the screen
const MARGIN = 520;   // 900 until build 197 (her «Очень большая карта, много лишнего»): enough to centre any place at the usual zoom
const BASEW = 54 * HW + 20;                                  // fixed zoom base (the first map's width): a bigger school does not shrink the view
computeBounds();
const P = (x, y) => ({ x: OX + (x - y) * HW, y: OY + (x + y) * HH });
let scale = 1, dpr = 1, viewW = 0, viewH = 0, zoom = 2.2, pinching = false;
const ZMIN = 0.9, ZMAX = 3.4;
const sprites = {};
// professors drawn one by one, each approved by Maria (class id -> file in assets/staff)
const STAFF_ART = { herbs: 'moss', potions: 'bubble', stars: 'lun', charms: 'spark', flight: 'breeze', elements: 'storm', final: 'owl' };
const STAFF_V = {granite: 2, burav: 2, hammer: 2, iskra: 2, koren: 3 };   // per-name cache version of redrawn staff sprites (world-2 grim style, her pick 2026-11-23)
const STAFF_ART_W2 = { runes: 'granite', mine: 'burav', forge: 'hammer', gems: 'iskra', guards: 'grom', lake: 'tisha', final: 'koren' };   // world 2 teachers (her pick 2026-11-22: old dwarf rune master «Мастер Гранит»)
const staffOf = (cid) => (WORLD === 1 ? STAFF_ART : WORLD === 2 ? STAFF_ART_W2 : {})[cid];   // per world: world-2 'final' must not take the owl
const STAFF_H = { koren: 50, tisha: 52, grom: 56, iskra: 50, hammer: 56, burav: 54, granite: 54, moss: 58, bubble: 54, lun: 68, spark: 62, breeze: 56, storm: 68, owl: 60 };   // teachers clearly taller than students (30) — her ruling 2026-11-21
// teachers' pose sheets (her ask 2026-11-22: animations for every teacher): walk while strolling, two kinds of stops,
// proud for a moment right after a student of the class passes; art one teacher at a time (art/staff/<name>_poses.jpg)
const TEACHER_POSES = { koren: ['explain', 'strike', 'read'], tisha: ['explain', 'net', 'lantern'], grom: ['explain', 'block', 'horn'], iskra: ['explain', 'loupe', 'polish'], hammer: ['explain', 'strike', 'inspect'], burav: ['explain', 'dig', 'wipe'], granite: ['explain', 'carve', 'read'], moss: ['explain', 'water', 'sniff', 'read'], bubble: ['explain', 'stir', 'pour', 'sniff'], lun: ['map', 'spyglass', 'book', 'sphere'], spark: ['explain', 'star', 'curtsy', 'polish', 'book'], breeze: ['explain', 'map', 'wind', 'goggles', 'owl'], storm: ['explain', 'fire', 'water', 'leaves', 'breeze'], owl: ['announce', 'write', 'hourglass', 'glasses', 'seal'] };
const TEACHER_FLY = { moss: true, bubble: true, lun: true, spark: true, breeze: true, storm: true, owl: true };
const NO_PROUD = { lun: true };
const WALK_POSE = { granite: ['step1', 'pass1', 'step2', 'pass2'], burav: ['step1', 'pass1', 'step2', 'pass2'], hammer: ['step1', 'pass1', 'step2', 'pass2'], iskra: ['step1', 'pass1', 'step2', 'pass2'], grom: ['step1', 'pass1', 'step2', 'pass2'], tisha: ['step1', 'pass1', 'step2', 'pass2'], koren: ['step1', 'pass1', 'step2', 'pass2'] };   // walking frames cycled every 180 ms (her report: one walking picture looked like hopping on one leg)   // dwarves do not fly: their own walking picture while moving
const FLY_LEFT = { breeze: true };   // flight frames drawn heading LEFT (her report 2026-11-22: «Капитан ветерок летает задом наперед»)   // her choice 2026-11-22: Lun has no joy pose, keeps his stop pose   // two flight frames <name>_fly1/fly2 (her ruling: «Парение не похоже на полет ... позу полета рисовать»)
for (const [n, l] of Object.entries(TEACHER_POSES)) for (const f of [...l, ...(NO_PROUD[n] ? [] : ['proud']), ...(TEACHER_FLY[n] ? ['fly1', 'fly2'] : []), ...(WALK_POSE[n] || [])]) { const im = new Image(); im.onerror = () => {}; im.src = `assets/staff/${n}_${f}.png?v=${STAFF_V[n] || 1}`; sprites[n + '_' + f] = im; }
const passAt = {};
function teacherPose(i, tp) {
  const n = staffOf(CLASSES[i].id), l = n && TEACHER_POSES[n]; if (!l) return null;
  if (tp.moving && WALK_POSE[n]) { const wl = WALK_POSE[n], im = sprites[n + '_' + wl[Math.floor(performance.now() / 180) % wl.length]]; if (im && im.complete && im.naturalWidth) return im; }
  if (tp.moving && tp.left && TEACHER_FLY[n]) { const im = sprites[n + (Math.floor(performance.now() / 170) % 2 ? '_fly2' : '_fly1')]; if (im && im.complete && im.naturalWidth) return im; }   // flying back: wings flap
  if (tp.moving) { const b = sprites['staff_' + CLASSES[i].id]; return b && b.complete && b.naturalWidth ? b : null; }   // the standing picture, rocked or lifted by drawPose
  // her report 2026-11-22 («переливание колбы ... буквально моргание»): in a busy class a pass came every second and the proud
  // pose ate the whole stop. Now a stop pose always shows for its first 3.2 s; proud may only close a stop, once.
  const f = !NO_PROUD[n] && tp.inStop > 3.2 && performance.now() - (passAt[i] || -1e9) < 4000 ? 'proud' : l[((tp.cyc || 0) * 2 + (tp.stop || 0)) % l.length];
  const im = sprites[n + '_' + f]; return im && im.complete && im.naturalWidth ? im : null;
}
const STAFF_GLOW = { lun: 'rgba(255,240,190,0.95)' }, STAFF_GLOW_ALL = 'rgba(255,244,205,0.6)';   // every teacher glows softly (her wish 2026-11-21), Lun a bit more   // drawn height: Lun is tall, Bubble small and round
// school staff outside classes (secretary, concierge, director): own sprites, one by one with her approval
const STAFF_OTHER = ['secretary', 'concierge'];
const SP2 = WORLD === 2 ? 'w2_' : '';   // world-2 staff pictures (gatekeeper, cells keeper, chronicler; her pick of the grim style 2026-11-23)
const SEC_POSES = ['write', 'stamp', 'carry', 'pin'];   // pose sprites of the secretary (her ruling 2026-11-21: real animations, not sliding)
for (const f of SEC_POSES) { const im = new Image(); im.src = `assets/staff/${SP2}sec_${f}.png?v=2`; sprites['sec_' + f] = im; }
// a full-body pose picture standing on the floor (with a soft shadow); a gentle step while walking
// Moving staff (her choice 2026-11-22, variants 1+2): a frozen mid-step picture slid along the floor looked like flying with
// a leg up, so a moving figure now WADDLES (rocks side to side with a little hop in step) or HOVERS on its wings
// (lifted, slow sway, smaller shadow, a few sparkles under the feet).
function drawPose(im, x, y, H, flip, moving, style = 'waddle') {
  const q = P(x, y), w = H * im.naturalWidth / im.naturalHeight, t = performance.now() / 1000, hover = moving && style === 'hover';
  const step = moving && style === 'step';   // real walking frames: only a small bob in time with the steps, no rocking
  const lift = hover ? 9 + Math.sin(t * 3) * 2 : step ? Math.abs(Math.sin(t * Math.PI / 0.36)) * 1.2 : moving ? Math.abs(Math.sin(t * 6.5)) * 2.6 : 0;
  const tilt = hover ? Math.sin(t * 2.2) * 0.035 : step ? 0 : moving ? Math.sin(t * 6.5) * 0.075 : 0;
  const sh = hover ? 0.7 : 1;
  ctx.fillStyle = '#00000026'; ctx.beginPath(); ctx.ellipse(q.x, q.y, H * 0.28 * sh, H * 0.11 * sh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(q.x, q.y - lift); ctx.rotate(tilt); if (flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -H, w, H); ctx.restore();
  if (hover) for (let k = 0; k < 3; k++) {   // sparkles drifting down from the feet
    const u = ((t * 0.9 + k / 3) % 1), px = q.x + Math.sin(t * 4 + k * 2.1) * w * 0.18, py = q.y - lift + 2 + u * (lift - 2);
    ctx.save(); ctx.globalAlpha = 0.85 * (1 - u); ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(px, py, 1.6 + (1 - u) * 1.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
// The concierge (her ask 2026-11-21: animations): writes the guest into the book, then hands over the key;
// with nobody to check in she yawns with her candle and now and then walks along the dorm wall to see that all sleep.
const CON_POSES = ['write', 'key', 'yawn', 'walk'];
for (const f of CON_POSES) { const im = new Image(); im.src = `assets/staff/${SP2}con_${f}.png?v=1`; sprites['con_' + f] = im; }
let conU = 0, conTrip = 0, conIdle = 0, conLast = 0, conKeyAt = -1e9;
function conciergePos() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (conLast || now)); conLast = now;
  conIdle = checkin || dormLine.length ? 0 : conIdle + dt;
  if (!conTrip && conU === 0 && conIdle > 8) { conTrip = 1; conIdle = 0; }
  if (conTrip === 1 && conU >= 1) conTrip = -1;
  if (conTrip === -1 && conU <= 0) conTrip = 0;
  if (conTrip) conU = Math.max(0, Math.min(1, conU + conTrip * dt / 2.2));
  const k = 0.5 - 0.5 * Math.cos(conU * Math.PI), far = WORLD === 1 && (window.__EDIT) ? { x: CONCIERGE.x + 1.2, y: CONCIERGE.y + 0.1 } : { x: CONCIERGE.x - 0.1, y: CONCIERGE.y + 3.2 };
  let pose;
  if (conTrip) pose = 'walk';
  else if (now - conKeyAt < 2.5) pose = 'key';   // hands the key over for a while after each check-in (it used to flash by)
  else if (checkin) pose = 'write';
  else pose = (now % 8) < 2.6 ? 'yawn' : 'write';
  return { x: CONCIERGE.x + (far.x - CONCIERGE.x) * k, y: CONCIERGE.y + (far.y - CONCIERGE.y) * k, pose, moving: !!conTrip, flip: conTrip === 1 ? false : conTrip === -1 };
}
const conciergeAway = () => conU > 0.02;
// The librarian hedgehog (her choice 2026-11-21): reads at his desk, carries a stack of books to the shelf and puts one up,
// comes back reading; when the room is full of readers he sometimes goes «shhh».
// The headmaster lion (her yes 2026-11-21): signs papers behind his desk, walks to the window and thinks, comes back and raises his scepter.
const DIR_POSES = ['sign', 'think', 'walk', 'proud'];
for (const f of DIR_POSES) { const im = new Image(); im.src = `assets/staff/${SP2}dir_${f}.png?v=2`; sprites['dir_' + f] = im; }
if (WORLD === 1) for (const f of DIR_POSES) { const im = new Image(); im.src = `assets/staff/dirstar_${f}.png?v=1`; sprites['dirstar_' + f] = im; }   // «Звёздный директор» (final chapter prize)
const dirSpr = (pose) => { const st = WORLD === 1 && S && S.lore && S.lore.prize && sprites['dirstar_' + pose]; return st && st.naturalWidth ? st : sprites['dir_' + pose]; };
let dirU = 0, dirTrip = 0, dirClock = 0, dirHold = 0, dirLast = 0;
function directorPos() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (dirLast || now)); dirLast = now;
  const s = SLOTS.DIR, home = { x: s.x0 + 2.0, y: s.y0 + 1.75 }, spot = { x: s.x0 + 4.3, y: s.y0 + 0.8 };
  if (!dirTrip) { dirClock += dt; if (dirClock > 10) { dirClock = 0; dirTrip = 1; } }
  if (dirTrip === 1) { dirU = Math.min(1, dirU + dt / 2.4); if (dirU >= 1) { dirHold += dt; if (dirHold > 4) { dirHold = 0; dirTrip = -1; } } }
  else if (dirTrip === -1) { dirU = Math.max(0, dirU - dt / 2.4); if (dirU <= 0) dirTrip = 0; }
  const k = 0.5 - 0.5 * Math.cos(dirU * Math.PI);
  let pose = 'sign';
  if (dirTrip === 1) pose = dirU >= 1 ? 'think' : 'walk';
  else if (dirTrip === -1) pose = 'walk';
  else if (dirClock < 3) pose = 'proud';   // back at his desk: raises the scepter for a moment
  return { x: home.x + (spot.x - home.x) * k, y: home.y + (spot.y - home.y) * k, pose, moving: dirU > 0 && dirU < 1, flip: dirTrip === -1 };
}
// ======================= Chronicler Tikhon, the director's advisor (build 251, tester Ruslan's idea; Maria's picks 2026-11-23:
// a new character «Летописец Тихон», the 📋 button stays but the quests come from him) =======================
// He stands by the director's desk, reports the school's problems (with a «Показать» button that opens the right room and
// lights the button that helps), suggests what to improve, and gives the quests with a line of the school's chronicle.
const TIKHON_POSES = ['read', 'explain', 'lantern', 'staff'];
for (const f of TIKHON_POSES) { const im = new Image(); im.src = `assets/staff/tikhon_${f}.png?v=1`; sprites['tikhon_' + f] = im; }
const ADV_NAME = 'Летописец Тихон';
const tikhonOn = () => WORLD === 1 && bossOn() && !!SLOTS.DIR;
const tikhonPic = (h = 64) => `<img src="assets/staff/tikhon_explain.png?v=1" alt="" style="height:${h}px;width:auto;flex:none">`;
const ADV_QUOTES = [
  'Триста лет я веду летопись этой школы. Хорошие главы пишутся терпением.',
  'Ученик, которому нашлось место, запомнит школу навсегда. И тот, кому не нашлось, — тоже.',
  'Мудрый директор смотрит не на монеты, а на лица учеников.',
  'Очередь — это вопрос, который школа ещё не решила.',
  'Звёзды над школой светят тем ярче, чем меньше в ней грустных учеников.',
];
const MISSION_LORE = {
  f: 'Так начинается история нашей школы. Я запишу каждый твой шаг.',
  grad: 'Каждый выпускник — новая страница в летописи школы.',
  enroll: 'Слава о школе летит быстрее совы — встречай новичков.',
  earn: 'Казна школы любит терпение, директор.',
  read: 'Мудрость начинается в библиотеке. Уж я-то знаю.',
  exams: 'Экзамен — это урок, который пришёл проверить сам себя.',
  item: 'Хороший инструмент — половина заклинания.',
  teacher: 'Растёт учитель — растут и ученики.',
  desk: 'Ещё одна парта — ещё одна судьба в летописи.',
  time: 'Время — самое дорогое волшебство. Береги его.',
  rec: 'Приёмная — лицо школы. Пусть оно улыбается быстрее.',
  beds: 'Усталому ученику нужна кровать, а не очередь.',
  lib: 'Новый стол в библиотеке — новый читатель.',
  build: 'Летопись ждёт новую главу: пора строить!',
  court: 'Во дворе ученики отдыхают душой. Пусть там будет уютно.',
  dir: 'Директор правит школой из кабинета. Я подскажу, если что.',
  shop: 'Сладость после урока — лучшая награда, поверь старику.',
  cant: 'Сытый ученик учится вдвое охотнее.',
  tower: 'Мастера — гордость школы. Им нужен свой дом.',
  room: 'Мелочи делают школу большой.',
  rank: 'Звание — это ступенька. Пусть ученики поднимаются выше.',
  mg: 'Котёл бурлит — значит, в школе жизнь!',
  gift: 'Дружба школ крепче любой стены.',
  w2: 'Под горой ценят руду, молот и честную торговлю.',
};
// leavers of the last 3 minutes: sampled every 10 s of play
const advLog = []; let advSampleT = 0;
function stepAdvisor(dt, live) {
  if (!live || !tikhonOn()) return;
  advSampleT -= dt; if (advSampleT > 0) return; advSampleT = 10;
  advLog.push(leftNow()); if (advLog.length > 19) advLog.shift();
}
const prestigeOn = () => !!(S.boss && S.boss.plan === 'prestige');
const bedsLeft = () => bedCount() < maxBeds();
const pupils = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'ученик' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'ученика' : 'учеников');
const advLeft = () => (advLog.length > 1 ? advLog[advLog.length - 1] - advLog[0] : 0);
let advCache = null, advCacheAt = 0;
function advReport() {   // [{hot, emo, text, go}] — go: [room id, selector] | 'missions' | null
  if (advCache && performance.now() - advCacheAt < 2000) return advCache;
  const out = [];
  let b = -1, bn = 0;
  for (let i = 0; i < CLASSES.length; i++) if (isOpen(i)) { const n = waitList[i].length + sleepersFor(i) + agents.reduce((m, a) => m + (a.goal && a.goal.t === 'k' && a.goal.i === i && !a.goal.brk ? 1 : 0), 0); /* court waiters too (build 259) */ if (n > bn) { bn = n; b = i; } }
  if (b >= 0 && bn >= 12) {
    const desk = S.classes[b].desks < maxDesksOf(b), time = S.classes[b].time < MAX_TIME_LEVEL, nm = CLASSES[b].name;
    if (desk || time) out.push({ hot: bn >= 25, emo: '⏳', text: `У класса «${nm}» ждут ${bn} ${pupils(bn)}. ${desk ? 'Поставь там ещё парту' : 'Сократи там урок'} — очередь станет короче.`, go: [CLASS_SLOT[b], desk ? '[data-act="desk"]' : '[data-act="time"]'] });
    else if (!prestigeOn()) out.push({ hot: bn >= 25, emo: '⏳', text: `У класса «${nm}» ждут ${bn} ${pupils(bn)}, а он уже улучшен до предела. Учеников приходит больше, чем школа может выучить: «Престижный» договор приведёт меньше учеников, зато они платят больше.`, go: ['DIR', '[data-act="plan"][data-k="prestige"]'] });
    else out.push({ hot: false, emo: '⏳', text: `У класса «${nm}» ждут ${bn} ${pupils(bn)}. Он улучшен до предела, и «Престижный» договор уже выбран — больше тут ничего не сделать. ${bedsLeft() ? 'Пусть ждут в спальне, а не уходят: добавь кроватей.' : 'Ученики подождут во дворе и в спальне.'}`, go: bedsLeft() ? ['DORM', '[data-act="beds"]'] : null });   // her report: «Тихон предлагает престижный договор дважды, но у меня и так престижный договор выбран»
  }
  if (!dormFree()) out.push({ hot: true, emo: '🛏️', text: 'Все кровати в спальне заняты: новичкам негде подождать, и они уходят домой. Добавь кровати.', go: ['DORM', '[data-act="beds"]'] });
  const lv = advLeft();
  if (lv >= 5 && !prestigeOn()) out.push({ hot: lv >= 15, emo: '💔', text: `За последние минуты ушли расстроенными ${lv} ${pupils(lv)} — рейтинг школы падает. Если учеников приходит больше, чем школа успевает учить, попробуй «Престижный» договор.`, go: ['DIR', '[data-act="plan"][data-k="prestige"]'] });
  else if (lv >= 5) { const care = dirLvl('care') < DIR_UP.care.max;
    out.push({ hot: lv >= 15, emo: '💔', text: `За последние минуты ушли расстроенными ${lv} ${pupils(lv)} — рейтинг школы падает. ${bedsLeft() ? 'Добавь кроватей в спальне, чтобы новичкам было где подождать.' : care ? 'Улучши «Заботу об учениках» — в очередях будут грустить медленнее.' : 'Престижный договор уже выбран, кровати и забота на максимуме — школа делает всё, что может.'}`, go: bedsLeft() ? ['DORM', '[data-act="beds"]'] : care ? ['DIR', '[data-act="dir"][data-k="care"]'] : null }); }
  const m = avgMood();
  if (m < 50) out.push({ hot: m < 35, emo: '😟', text: `Ученики грустят: настроение ${Math.round(m)}%. Их радуют библиотека, магазин и столовая, а «Забота об учениках» помогает в очередях.`, go: ['DIR', '[data-act="dir"][data-k="care"]'] });
  { const fi = (S.ema || 0) * 60, fo = (S.outEma || 0) * 60;   // build 275: money flowing out
    if (fi > 0 && fo >= fi * 0.3) out.push({ hot: fo >= fi * 0.45, emo: '📉', text: `${fo >= fi ? 'Школа в минусе!' : 'Казна худеет:'} возвраты ушедшим и штрафы забирают ${Math.round(fo / fi * 100)}% дохода. ${dirLvl('refund') < DIR_UP.refund.max ? 'Улучши «Правила возврата» — ушедшим будем возвращать меньше.' : bedsLeft() ? 'Добавь кроватей, чтобы новички не уходили.' : 'Добавь парт в переполненные классы.'}`, go: dirLvl('refund') < DIR_UP.refund.max ? ['DIR', '[data-act="dir"][data-k="refund"]'] : bedsLeft() ? ['DORM', '[data-act="beds"]'] : null }); }
  const inc = Object.keys(S.inc || {});
  if (inc.length) out.push({ hot: true, emo: '💥', text: `В классе «${CLASSES[+inc[0]].name}» происшествие — урок стоит! Нажми на класс, чтобы всё починить.`, go: [CLASS_SLOT[+inc[0]], null] });
  if (boss().mail.cur) out.push({ hot: true, emo: '✉️', text: 'Пришло письмо от родителей — ответь, когда будет минутка.', go: 'mail' });
  const ready = missionList().filter((x) => x.ok).length;
  if (ready) out.push({ hot: false, emo: '🎁', text: `Выполнено заданий: ${ready}. Забери награды!`, go: 'missions' });
  advCacheAt = performance.now(); advCache = out;
  return out;
}
const advHot = () => tikhonOn() && advReport().some((r) => r.hot);
// His walk round the school (her «Тихон должен иногда прогуливаться по школе», build 254): every 3-5 minutes of play he leaves the
// office with his staff, visits 2-3 places (the court, a class door, the reception) and stops at each for 4-6 s to read his
// scroll, raise the lantern or explain something, then comes back. Render-only, like the teachers' strolls; never while the game is closed.
const TK = { x: 0, y: 0, path: [], stops: [], hold: 0, pose: 'staff', on: false, wait: 150 + Math.random() * 60, last: 0, flip: false, speed: 1.6 };
window.__tk = TK;   // test hook
const tkHome = () => ({ x: SLOTS.DIR.x0 + 1.25, y: SLOTS.DIR.y0 + 3.7 });
function tkPlaces() {   // reachable stops for one walk, in a sensible order
  const out = [], add = (x, y) => { if (x !== undefined && bfs(TK.x, TK.y, x, y).length) out.push({ x, y }); };
  if (COURT) { const c = courtC(); const sp = [[-4, -3], [4, -3], [-4, 3], [4, 3], [0, -4], [0, 4]]; const [dx, dy] = sp[Math.floor(Math.random() * sp.length)]; add(Math.floor(c.x + dx) + 0.5, Math.floor(c.y + dy) + 0.5); }
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i) && SLOTS[CLASS_SLOT[i]] && SLOTS[CLASS_SLOT[i]].door);
  for (let n = 0; n < 2 && open.length; n++) { const i = open.splice(Math.floor(Math.random() * open.length), 1)[0], d = SLOTS[CLASS_SLOT[i]].door[0]; add(d[0] + 0.5, d[1] + 0.5); }
  return out.sort(() => Math.random() - 0.5).slice(0, 3);
}
function stepTikhonWalk() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (TK.last || now)); TK.last = now;
  if (!TK.on) {
    TK.wait -= dt; if (TK.wait > 0) return;
    const h = tkHome(); TK.x = h.x; TK.y = h.y;
    TK.stops = tkPlaces(); TK.wait = 180 + Math.random() * 120;
    if (!TK.stops.length) return;
    TK.stops.push({ x: h.x, y: h.y, home: true }); TK.on = true; TK.hold = 0; TK.path = pathTo(TK, TK.stops[0].x, TK.stops[0].y);
    return;
  }
  if (TK.hold > 0) { TK.hold -= dt; if (TK.hold <= 0) { TK.stops.shift(); if (TK.stops.length) TK.path = pathTo(TK, TK.stops[0].x, TK.stops[0].y); } return; }
  if (!TK.path.length) {   // arrived at a stop
    if (!TK.stops.length || TK.stops[0].home) { TK.on = false; TK.stops = []; return; }
    TK.hold = 4 + Math.random() * 2; TK.pose = ['read', 'lantern', 'explain'][Math.floor(Math.random() * 3)]; return;
  }
  const p = TK.path[0], dx = p.x - TK.x, dy = p.y - TK.y, dist = Math.hypot(dx, dy), st = TK.speed * WALK_K * dt;
  if (Math.abs(dx - dy) > 0.01) TK.flip = dx - dy > 0;   // his staff pose looks to the left: mirror when walking right on screen
  if (dist <= st) { TK.x = p.x; TK.y = p.y; TK.path.shift(); } else { TK.x += dx / dist * st; TK.y += dy / dist * st; }
}
function tikhonPos() {   // by the window side of the desk; a pose at least 3 s (her rule: every pose >= 2.5 s)
  stepTikhonWalk();
  if (TK.on) return { x: TK.x, y: TK.y, pose: TK.hold > 0 ? TK.pose : 'staff', moving: TK.hold <= 0, flip: TK.flip };
  const s = SLOTS.DIR, now = performance.now() / 1000;
  const pose = advHot() ? (Math.floor(now / 3) % 2 ? 'read' : 'explain') : ['staff', 'read', 'staff', 'explain', 'lantern'][Math.floor(now / 4) % 5];
  return { x: s.x0 + 1.25, y: s.y0 + 3.7, pose };   // left of the desk, by the bookcase: never over the director's walk to the window
}
let tikhonRect = null;   // build 278 (tester's report «Тихон когда ходит по школе он не кликабельный ... иконка с бумагой ... должна открывать меню Тихона»): his body and scroll badge are tappable, wherever he walks
function drawCrown() {   // the old director's crown on the desk: shown when the riddle wants it (morning) and forever after the prize
  if (WORLD !== 1 || !SLOTS.DIR || !dirBuilt() || !LORE.crown()) { window.__crownRect = null; return; }
  const s = SLOTS.DIR, m = up(P(s.x0 + 3.3, s.y0 + 2.3), 40), T = performance.now(); emoji('👑', m.x, m.y + Math.sin(T / 600) * 2, 15);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(T / 400); ctx.drawImage(glowSprite('255,214,120'), m.x - 18, m.y - 18, 36, 36); ctx.restore();
  window.__crownRect = { x0: m.x - 22, y0: m.y - 22, x1: m.x + 22, y1: m.y + 22, t: T };
}
function drawTikhonBadge(p) {   // a scroll over his head while he has something important to report
  const c = P(p.x, p.y), T = performance.now(), hot = advHot();
  tikhonRect = { x0: c.x - 30, y0: c.y - (hot ? 118 : 70), x1: c.x + 30, y1: c.y + 6, t: T };
  if (!hot) return;
  const k = 1 + 0.1 * Math.sin(T / 220), y = c.y - 88 - 5 * Math.sin(T / 320);
  ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(c.x, y, 23 * k, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e0a100'; ctx.lineWidth = 3; ctx.stroke();
  emoji('📜', c.x, y, 30 * k);
}
let advTargets = [];
function advisorBlock(own = false) {   // top of the director's panel (own: inside Tikhon's own window, no second name card)
  const rep = advReport(); advTargets = rep.map((r) => r.go);
  const items = rep.map((r, k) => `<div class="card up"${r.hot ? ' style="border:2px solid #ffb4a8"' : ''}><span class="remoji">${r.emo}</span><div class="grow">${r.text}</div>${r.go ? `<button class="btn small go" data-advgo="${k}">${r.go === 'missions' ? 'Задания' : r.go === 'mail' ? 'Открыть' : 'Показать'}</button>` : ''}</div>`).join('');
  const quote = ADV_QUOTES[Math.floor(Date.now() / 60000) % ADV_QUOTES.length];
  return `<div class="card up" style="align-items:center">${own ? '' : tikhonPic(70)}<div class="grow">${own ? '' : `<b>${ADV_NAME}</b><div class="muted">советник директора и летописец школы</div>`}<div>«${rep.length ? 'Директор, вот что я заметил:' : 'В школе всё спокойно, директор. ' + quote}»</div></div></div>
    ${items}
    <button class="btn ghost wide" data-missions>📋 Задания от Тихона</button>`;
}
function tikhonPanel() {   // his own window (tester «По Тихону открывается весь кабинет директора а должен открываться только меню Тихона Тихон отдельное личность»): a tap on him opens only his report and quests
  return `<div class="sh-head">${tikhonPic(56)}<div><h2>${ADV_NAME}</h2><div class="muted">советник директора и летописец школы</div></div><button class="x" data-close>✕</button></div>` + advisorBlock(true);
}
function advGo(k) {
  const g = advTargets[+k]; if (!g) return;
  if (g === 'missions') { openPanel(missionsPanel); return; }
  if (g === 'mail') { openPanel(mailPanel); return; }
  goTarget(g);
}
// The fox shopkeeper (her choice 2026-11-21: a curiosity shop): hands over the treat while a student is shopping,
// counts coins after a sale; when the shop is empty he polishes a crystal ball or carries a box of glowing jars to the shelf.
const FOX_POSES = ['give', 'coins', 'carry', 'polish'];
const COOK_POSES = ['stir', 'give', 'fire', 'taste'];
for (const f of COOK_POSES) { const im = new Image(); im.src = `assets/staff/${SP2}cook_${f}.png?v=1`; sprites['cook_' + f] = im; }
// The dragon cook (her choice 2026-11-22): hands a tray while someone is served (held at least 2.6 s); when the line is empty
// he stirs the soup 5 s, breathes a flame at the stove 3 s, tastes from the ladle 3 s (every pose >= 2.5 s, her rule).
let cookGiveT = 0, cookLast = 0;
function cookPose() {
  const now = performance.now() / 1000, dt = Math.min(0.2, cookLast ? now - cookLast : 0); cookLast = now;
  if (cantLine.some((a) => a.state === 'cantbuy')) cookGiveT = 2.6; else cookGiveT = Math.max(0, cookGiveT - dt);
  if (cookGiveT > 0) return 'give';
  const t = now % 11; return t < 5 ? 'stir' : t < 8 ? 'fire' : 'taste';
}
for (const f of FOX_POSES) { const im = new Image(); im.src = `assets/staff/${SP2}fox_${f}.png?v=1`; sprites['fox_' + f] = im; }
let foxU = 0, foxTrip = 0, foxClock = 0, foxHold = 0, foxLast = 0, foxSold = 0, foxCoinsT = 0;
function foxPos() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (foxLast || now)); foxLast = now;
  const s = SLOTS.SHOP, home = { x: s.x0 + 1.5, y: s.y0 + 1.5 }, shelf = { x: s.x0 + 3.4, y: s.y0 + 0.55 };
  const shopping = shopLine.length > 0;
  if ((S.stats.shop || 0) > foxSold) { foxSold = S.stats.shop || 0; foxCoinsT = Math.max(foxCoinsT, 2.6); }
  foxCoinsT = Math.max(0, foxCoinsT - dt);
  if (!foxTrip && (!shopping || foxClock > 0)) { foxClock += dt; if (foxClock > 4) { foxClock = 0; foxTrip = 1; } }
  if (foxTrip === 1) { foxU = Math.min(1, foxU + dt / 2.2); if (foxU >= 1) { foxHold += dt; if (foxHold > 2.6) { foxHold = 0; foxTrip = -1; } } }
  else if (foxTrip === -1) { foxU = Math.max(0, foxU - dt / 2.2); if (foxU <= 0) foxTrip = 0; }
  const k = 0.5 - 0.5 * Math.cos(foxU * Math.PI);
  let pose = 'polish';
  if (foxTrip === 1) pose = 'carry'; else if (foxTrip === -1) pose = 'polish';
  else if (foxCoinsT > 0) pose = 'coins'; else if (shopping) pose = 'give';
  return { x: home.x + (shelf.x - home.x) * k, y: home.y + (shelf.y - home.y) * k, pose, moving: foxU > 0 && foxU < 1, flip: foxTrip === -1 };
}
const LIB_POSES = ['read', 'carry', 'shelve', 'shh'];
for (const f of LIB_POSES) { const im = new Image(); im.src = `assets/staff/${SP2}lib_${f}.png?v=1`; sprites['lib_' + f] = im; }
let libU = 0, libTrip = 0, libClock = 0, libHold = 0, libLast = 0;
function librarianPos() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (libLast || now)); libLast = now;
  const s = SLOTS.LIB, home = { x: s.x0 + 3.0, y: s.y1 - 1.25 }, shelf = { x: s.x0 + 1.0, y: s.y0 + 0.55 };
  if (!libTrip) { libClock += dt; if (libClock > 9) { libClock = 0; libTrip = 1; } }
  if (libTrip === 1) { libU = Math.min(1, libU + dt / 2.6); if (libU >= 1) { libHold += dt; if (libHold > 2.8) { libHold = 0; libTrip = -1; } } }
  else if (libTrip === -1) { libU = Math.max(0, libU - dt / 2.6); if (libU <= 0) libTrip = 0; }
  const k = 0.5 - 0.5 * Math.cos(libU * Math.PI), readers = lib.filter(Boolean).length;
  let pose = 'read';
  if (libTrip === 1) pose = libU >= 1 ? 'shelve' : 'carry';
  else if (libTrip === -1) pose = 'read';
  else if (readers >= 5 && libClock > 5 && libClock < 8) pose = 'shh';
  return { x: home.x + (shelf.x - home.x) * k, y: home.y + (shelf.y - home.y) * k, pose, moving: libU > 0 && libU < 1, flip: pose === 'carry' };
}
function drawSecretary(so) {
  const im = so.pose !== 'walk' && sprites['sec_' + so.pose], ok = im && im.complete && im.naturalWidth;
  if (!ok) { drawCreature({ ...officer, sp: 'staff_secretary', flip: false, path: so.moving ? [1] : [], ph: performance.now() / 1000 }, so.x, so.y, 52); return; }
  const q = P(so.x, so.y), H = 52, half = false;   // all poses are full-body now (her report: the half-body ones showed a cut waist)
  const h = half ? H * 0.72 : H, w = h * im.naturalWidth / im.naturalHeight, lift = (so.pose === 'write' || so.pose === 'stamp') && !so.moving ? 12 : 0;   // behind the counter she stands on a little step: the paper shows above it, her feet stay hidden   // half-body poses sit on the counter top so paper, pencil and stamp are visible above it (her ask 2026-11-21)
  const bob = so.moving && so.pose !== 'carry' ? Math.abs(Math.sin(performance.now() / 260)) * 1.2 : 0;   // no shaking with the stack of papers (her report 2026-11-21); a slow gentle step otherwise
  ctx.fillStyle = '#00000026'; ctx.beginPath(); ctx.ellipse(q.x, q.y, H * 0.3, H * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(im, q.x - w / 2, q.y - lift - h - bob + (so.hit || 0), w, h);
  // no extra emoji: the pose pictures already show the pencil and the pin (her report 2026-11-21)
}
for (const f of STAFF_OTHER) { const im = new Image(); im.src = `assets/staff/${SP2}${f}.png?v=1`; sprites['staff_' + f] = im; }
const staffSprite = (f) => WORLD <= 2 && STAFF_OTHER.includes(f) && sprites['staff_' + f]?.naturalWidth;
for (const [k, f] of Object.entries(WORLD === 2 ? STAFF_ART_W2 : STAFF_ART)) { const im = new Image(); im.src = `assets/staff/${f}.png?v=${STAFF_V[f] ? 10 + STAFF_V[f] : 3}`; sprites['staff_' + k] = im; }
const M_ART_W2 = ['mossmole', 'owlbat', 'quartzhog', 'batbunny', 'geosnail', 'axolotl'];   // world-2 keepers drawn so far
if (WORLD <= 2) for (const sp of (WORLD === 2 ? M_ART_W2 : SPECIES)) for (let e = 0; e < 4; e++) for (const v of ['', '_back']) { const im = new Image(); im.onerror = () => {}; im.src = `assets/creatures/${sp}_m${e}${v}.png?v=1`; sprites[sp + '_m' + e + v] = im; }   // element masters (her «вау», 2026-11-22)
const TIER_V = { owlbat: 2, mothfox: 2, petalear: 2, fernhorn: 2 };   // + build of the paws fix: the Старший маг (t4) of mothfox, petalear and fernhorn had 5 limbs (her «рук больше чем нужно»)   // outfit pictures redrawn under the same names get a new cache version
if (WORLD <= 2) for (const sp of SPECIES) for (let t = 1; t < 5; t++) for (const v of ['', '_back']) { const im = new Image(); im.onerror = () => {}; im.src = `assets/creatures/${sp}_t${t}${v}.png?v=${TIER_V[sp] || 1}`; sprites[sp + '_t' + t + v] = im; }   // outfit stages (drawn later; missing ones fall back)
for (const sp of SPECIES) for (const v of ['', '_back']) { const im = new Image(); im.src = `assets/creatures/${sp}${v}.png`; sprites[sp + v] = im; }   // front and back views
// court poses (build 264, her pick «2»: real poses instead of icons; first test sheet: the moth fox without an outfit)
const COURT_POSE = { bench: 'sit', tag: 'run', coin: 'coin', read: 'read', sparks: 'wand', birds: 'birds', swing: 'sit', tea: 'sit' };
const COURT_POSE_ART = SPECIES.flatMap((sp) => [sp, sp + '_t1', sp + '_t2', sp + '_t3', sp + '_t4']);   // every world-1 look (build 273, her «Делай»); a missing picture falls back to the standing sprite
if (WORLD === 1) for (const k of COURT_POSE_ART) for (const p of Object.values(COURT_POSE)) { const im = new Image(); im.onerror = () => {}; im.src = `assets/creatures/${k}_k_${p}.png?v=2`; sprites[k + '_k_' + p] = im; }
const COURT_POSE_K = 1.2;   // plan item 6, her pick «1»: students busy in the court are drawn 1.2x bigger (small at the normal zoom)
function courtPose(a) {   // the pose picture of a student busy in the court, or null (then the usual sprite and the icons)
  if (WORLD !== 1 || !a.goal || a.goal.t !== 'k' || !COURT_POSE[a.act]) return null;
  if (!(a.state === 'court' || (a.act === 'tag' && a.path && a.path.length))) return null;
  const rk = Math.min(4, a.rk || 0); if ((a.rk || 0) >= 5) return null;
  const im = sprites[a.sp + (rk ? '_t' + rk : '') + '_k_' + COURT_POSE[a.act]];
  return im && im.complete && im.naturalWidth ? im : null;
}
const arts = {};
for (const [k, a] of Object.entries(ART)) { const im = new Image(); im.onload = () => { staticKey = ''; }; im.src = a.src; arts[k] = im; }
const popups = [];
function popup(t, x, y, color, lift = 30) { popups.push({ text: t, x, y, color, t: 0, lift }); }

function resize() {
  const r = scroller.getBoundingClientRect();
  dpr = Math.min(window.__dprCap || 2, window.devicePixelRatio || 1);   // 2, not 3: a 3x iPhone drew 2.25x more pixels every frame and got hot (tester 2026-11-23); the picture looks the same
  viewW = r.width; viewH = r.height;
  viewW = r.width; viewH = r.height; zoom = Math.max(zoom, minZoom());
  scale = (refW(r.width) / BASEW) * zoom * ROOMS_K;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  { const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr); if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; } }   // only on a real size change (iOS fires 'resize' on scrolls too)
  $('#spacer').style.height = WH * scale + 'px'; $('#spacer').style.width = WW * scale + 'px';
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
// emoji are drawn from the bundled Twemoji pictures (same look on every device); text may contain emoji
function emoji(e, x, y, size, c = ctx) {
  const im = emojiImage(e);
  if (im) { const k = size * 1.15; c.drawImage(im, x - k / 2, y - k / 2, k, k); return; }
  c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y);
}
function text(t, x, y, size, color, c = ctx, weight = 800) {
  c.font = `${weight} ${size}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`; c.textBaseline = 'middle'; c.fillStyle = color;
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(t)) { c.textAlign = 'center'; c.fillText(t, x, y); return; }
  // split into text and emoji parts, measure, then draw left to right around the centre
  const parts = []; let last = 0, m; EMOJI_RE.lastIndex = 0;
  while ((m = EMOJI_RE.exec(t))) { if (m.index > last) parts.push([0, t.slice(last, m.index)]); parts.push([1, m[0]]); last = m.index + m[0].length; }
  if (last < t.length) parts.push([0, t.slice(last)]);
  const em = size * 1.15, wOf = (p) => (p[0] ? em : c.measureText(p[1]).width);
  let cx = x - parts.reduce((a, p) => a + wOf(p), 0) / 2;
  c.textAlign = 'left';
  for (const p of parts) { const w = wOf(p); if (p[0]) emoji(p[1], cx + w / 2, y, size, c); else c.fillText(p[1], cx, y); cx += w; }
  c.textAlign = 'center';
}
function poly(c, pts, fill, stroke) { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
const up = (p, h) => ({ x: p.x, y: p.y - h });

// ---- static layer (floors, rooms, walls) cached in an offscreen canvas ----
const stat = document.createElement('canvas'); const sctx = stat.getContext('2d');
let staticKey = '', staticN = 0;
const statQ = () => Math.sqrt(12e6 / (SW * SH));   // px per world unit: always the iOS canvas limit, so zooming never redraws the whole ground (it froze the game on every pinch, her report build 211)
function statKey() { return ['SHOP', 'TRADE', 'EXPED', 'DIR', 'TOWER', 'DORM2'].map((k) => { const o = bObj(k); return o && o.built ? (bReady(o) ? 'R' : 'b') : '-'; }).join('') + (cantBuilt() ? (cantOpen() ? 'C' : 'c') : '') + S.classes.map((c, i) => (c.built ? (isOpen(i) ? 'o' : 'b') : (S.classes.findIndex((q) => !q.built) === i ? 'n' : 'l'))).join('') + statQ().toFixed(2); }
// ======================= territory (roadmap step 2, her wish 2026-11-22: «очень волшебные и красивые с большим количеством деталей») =======================
// Grass and outdoor paths are iso textures; the lawn around the school is dotted with magic trees, bushes and small things,
// placed by a fixed hash of the tile so the picture never changes between visits (only where nothing is built or planned).
const OUT_V = { moontree: 2 };   // outdoor pictures redrawn under the same name get a new cache version (phones keep ?v=1 copies up to a day)
const OUT_H = { moontree: 240, oak: 180, blossom: 150, willow: 165, goldtree: 150, fir: 172, toadhouse: 96, glowmush: 40, crystals: 44, berrybush: 44, fern: 38, hedge: 42, roses: 40, roses2: 40, boulder: 40, bells: 38,
  fountain: 100, flowerarch: 118, gazebo: 132, founder: 96, bench_a: 34, bench_b: 34, topiary_ball: 42, topiary_spiral: 48, hedge_long: 26, peonybed: 30, hydrangea: 40, crystalball: 40,
  lantern_gold: 76, lantern_blue: 76, owl_statue: 62, fox_statue: 62, flowerbed: 34, signpost2: 58, urn: 46, flowerbox: 26, gate_big: 170,
  runestone: 44, stump: 32, starflowers: 30, pumpkin: 60, well: 70, beehive: 46, birdbath: 42, chestmush: 34, fairyring: 46, gal_rose: 84, gal_lamp: 84, gal_urn: 94,
  st_star: 70, st_fox: 60, st_owl: 66, st_tikhon: 44, cz_swing: 112, cz_target: 68, cz_picnic: 58, cz_cushions: 40, cz_bookshelf: 74, cz_lanterns: 92 };   // big enough to read at the normal zoom   // world px; a class wall is ~106, a student 30 (her ruling: trees must be big)
// World 2 (cold mountain kingdom): the same composed territory, drawn with cave things instead of trees and flowers.
// The world-1 layout names are mapped to cave sprites (null = nothing there); the pictures load into the same 'outdoor/<name>' keys.
// the lake's things: [name, dx, dy from the lake centre (tiles), scale, flip]
const LAKE_ITEMS = [['lk_rocks', -3.4, -2.4, 1], ['lk_pier', -2.6, 0.4, 1], ['lk_post', -4.3, 1.5, 1], ['lk_fish', -4.5, -0.2, 1], ['lk_boat', -1.6, 1.8, 1], ['lk_boat2', 1.2, -1.4, 1, 1], ['lk_lilies', 1.8, 2.0, 1], ['lk_lilies', -0.6, -3.0, 0.9], ['lk_crystal', 2.6, -3.2, 1], ['lk_rocks', 4.0, 1.0, 1, 1], ['lk_crystal', 3.4, 3.5, 0.8, 1]];
const OUT_H_W2 = { lk_pier: 62, lk_boat: 44, lk_boat2: 58, lk_post: 62, lk_lilies: 24, lk_crystal: 56, lk_rocks: 40, lk_fish: 26, stalag_a: 168, stalag_b: 176, stalag_c: 160, mush_teal: 140, mush_violet: 128, crystal_big: 120, boulder: 40, rubble: 28, glowmush: 38, crystals: 40, ore: 36, minecart: 46, lantern: 76, runestone: 44, dwarf_statue: 64, gate_big: 200 };
const CAVE_OF = { oak: 'stalag_a', fir: 'stalag_b', willow: 'stalag_c', blossom: 'mush_teal', goldtree: 'mush_violet', toadhouse: 'crystal_big', fern: 'rubble', berrybush: 'glowmush', hedge: 'boulder', roses: 'crystals', roses2: 'crystals',
  bells: 'glowmush', boulder: 'boulder', stump: 'ore', starflowers: 'glowmush', flowerbed: 'rubble', birdbath: 'ore', chestmush: 'glowmush', pumpkin: 'minecart', well: 'minecart', beehive: 'ore', fairyring: 'crystal_big',
  runestone: 'runestone', lantern_gold: 'lantern', lantern_blue: 'lantern', owl_statue: null, fox_statue: null, flowerbox: 'rubble', urn: 'lantern', signpost2: 'runestone', founder: 'dwarf_statue',
  lk_pier: 'lk_pier', lk_boat: 'lk_boat', lk_boat2: 'lk_boat2', lk_post: 'lk_post', lk_lilies: 'lk_lilies', lk_crystal: 'lk_crystal', lk_rocks: 'lk_rocks', lk_fish: 'lk_fish',
  hydrangea: 'glowmush', peonybed: 'crystals', crystalball: 'crystals', flowerarch: 'runestone', fountain: 'crystal_big', gazebo: 'mush_teal', bench_a: 'boulder', bench_b: 'boulder', topiary_ball: 'glowmush', topiary_spiral: 'crystals', gate_big: 'gate_big' };
const outName = (n) => (WORLD === 2 ? CAVE_OF[n] || null : n);
if (WORLD === 2) { for (const k of Object.keys(OUT_H)) delete OUT_H[k]; Object.assign(OUT_H, OUT_H_W2); }
const OUT_DIR = WORLD === 2 ? 'cave' : 'outdoor';
const LAKE_WATER = new Image(); if (WORLD === 2) { LAKE_WATER.onload = () => { staticKey = ''; }; LAKE_WATER.src = 'assets/parts/cave/lk_water.webp?v=1'; }
const outLo = {}, outMid = {}, outSh = {}, outTint = {};   // outTint[n] = { mid: [lvl1, lvl2], lo: [lvl1, lvl2] }: darker, cooler copies for the deep forest
const OUT_TREE = new Set(['oak', 'fir', 'willow', 'blossom', 'goldtree', 'stalag_a', 'stalag_b', 'stalag_c', 'mush_teal', 'mush_violet']);
function tintCopies(src) { return [0.17, 0.32].map((a) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = `rgba(26,38,70,${a})`; x.fillRect(0, 0, c.width, c.height); return c; }); }   // outSh: a tiny dark silhouette of each sprite; drawn stretched it gives a soft cast shadow   // small copies (240 px tall) for the far view: downscaling an 800 px tree every frame is slow
for (const n of ['grass', 'path', ...Object.keys(OUT_H)]) { const im = new Image(); im.onload = () => { staticKey = ''; partsVer++; if (OUT_H[n]) { const c = document.createElement('canvas'), k = 40 / im.naturalHeight; c.width = Math.max(4, Math.round(im.naturalWidth * k)); c.height = 40; const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgb(38,48,62)'; x.fillRect(0, 0, c.width, c.height); outSh[n] = c; } if (im.naturalHeight > 560) { const c = document.createElement('canvas'), k = 440 / im.naturalHeight; c.width = Math.round(im.naturalWidth * k); c.height = 440; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); outMid[n] = c; } if (im.naturalHeight > 300) { const c = document.createElement('canvas'), k = 240 / im.naturalHeight; c.width = Math.round(im.naturalWidth * k); c.height = 240; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); outLo[n] = c; } if (OUT_TREE.has(n) && outMid[n] && outLo[n]) outTint[n] = { mid: tintCopies(outMid[n]), lo: tintCopies(outLo[n]) }; }; im.src = `assets/parts/${OUT_DIR}/${n}.webp?v=2`; parts['outdoor/' + n] = im; }
let GRASS_ON = true, BG_OFF = false;
const hash2 = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
if (WORLD === 1) for (const n of ['honey', 'mosaic']) { const im = new Image(); im.onload = () => { staticKey = ''; partsVer++; }; im.src = `assets/parts/outdoor/${n}.webp?v=${OUT_V[n] || 1}`; parts['outdoor/' + n] = im; }   // paving art (art/parts/paving, SYNTX 4 tokens)
let garlandLo = null;   // a small copy: the 917-px picture shrunk to ~90 px every frame lost its colours
if (WORLD === 1) { const im = new Image(); im.onload = () => { partsVer++; let src = im, w = im.naturalWidth; while (w > 300) { w = Math.round(w / 2); const c = document.createElement('canvas'); c.width = w; c.height = Math.round(im.naturalHeight * w / im.naturalWidth); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); src = c; } garlandLo = src; }; im.src = 'assets/parts/outdoor/gal_garland.webp?v=1'; parts['outdoor/gal_garland'] = im; }   // court colonnade garlands (no shadow)
let OUTDOOR = [], outKey = '', OUT_ON = true, entrancePath = null, entranceDecal = null, gardenDecal = null;   // the random scatter is off (her verdict 2026-11-22: «понатыкано тыщу элементов», and it lagged)
// Composed territory (her ruling: no random scatter; «продумай как оно должно быть, и их размеры»):
//  - a forest of tree groves in a band 6..24 tiles away from every building (the school stands in a clearing),
//    each grove 3-5 big trees of one character with undergrowth at its edge;
//  - the lawn next to the school stays clear;
//  - a few small scenes tied to buildings: the magic glade, the apiary, the wishing-well corner, the blossom grove by the garden.
const GROVES = [['oak', 'oak', 'fir', 'fir'], ['fir', 'fir', 'fir', 'oak'], ['blossom', 'blossom', 'goldtree'], ['willow', 'oak', 'fir'], ['goldtree', 'oak', 'blossom', 'oak'], ['oak', 'willow', 'oak']];
const UNDER = ['fern', 'berrybush', 'boulder', 'glowmush', 'stump', 'hedge', 'fern', 'bells'];
function layoutOutdoor() {
  const key = GW + ':' + GH + ':' + (WORLD === 1 && S.courtUp ? S.courtUp.bench : 1) + ':' + ['world', 'races', 'teachers', 'school'].map((k) => (loreQ(k) ? 1 : 0)).join('') + ':' + Object.values(SLOTS).map((s) => s.x0 + ',' + s.y0 + ',' + s.x1 + ',' + s.y1).join(';'); if (key === outKey) return; outKey = key;
  const X0 = -80, Y0 = -60, X1 = GW + 65, Y1 = GH + 50, NX = X1 - X0, NY = Y1 - Y0, dist = new Int16Array(NX * NY).fill(999), q = [];
  for (let x = X0; x < X1; x++) for (let y = Y0; y < Y1; y++) if (regAt(x, y)) { dist[(x - X0) * NY + (y - Y0)] = 0; q.push(x, y); }
  for (let h = 0; h < q.length; h += 2) { const x = q[h], y = q[h + 1], d = dist[(x - X0) * NY + (y - Y0)];   // chessboard distance to the nearest building or path
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nx = x + dx, ny = y + dy; if (nx < X0 || ny < Y0 || nx >= X1 || ny >= Y1) continue; const k = (nx - X0) * NY + (ny - Y0); if (dist[k] > d + 1) { dist[k] = d + 1; q.push(nx, ny); } } }
  const D = (x, y) => { x = Math.floor(x); y = Math.floor(y); return x < X0 || y < Y0 || x >= X1 || y >= Y1 ? 999 : dist[(x - X0) * NY + (y - Y0)]; };
  const inWorld = (x, y) => { const m = P(x, y); return m.x > -40 && m.x < WW + 40 && m.y > 40 && m.y < WH + 160; };   // trees may stand right at the map edge (crowns cut by it)
  const G0 = GATE_TILE, front = (x, y) => (Math.abs(x - G0.x - 0.5) < 10 && y > G0.y - 4) || (y > BUILDING.y1 && D(x, y) < 10);   // the view of the entrance and the south front stays open
  const behind = new Set(); for (const e of EDGES) if (e.hallWall) for (let k = 1; k <= 5; k++) for (let j = -2; j <= 2; j++) behind.add(e.side === 'y0' ? (e.x + j) + ',' + (e.y - k) : (e.x - k) + ',' + (e.y + j));   // the tall corridor walls hide what stands just behind them
  const TD = WORLD === 2 && SLOTS.DIR, out = [], put = (n, x, y, minD, sc = 1) => { n = outName(n); if (!n) return false; if (WORLD === 1 && ['DORM', 'DORM2'].some((k) => { const q = SLOTS[k]; return q && x > q.x0 - 2 && x < q.x1 + 2 && y > q.y0 - 2 && y < q.y1 + 2; })) return false;   /* keep clear of the dorm pavilions */ if (TD && x > TD.x0 - 1 && x < TD.x1 + 5 && y > TD.y0 - 1 && y < TD.y1 + 5) return false; if (WORLD === 2 && SLOTS.CANT && x > SLOTS.CANT.x0 - 1 && x < SLOTS.CANT.x1 + 5 && y > SLOTS.CANT.y0 - 4 && y < SLOTS.CANT.y1 + 5) return false; if (WORLD === 2 && SLOTS.EXPED && x > SLOTS.EXPED.x0 - 1 && x < SLOTS.EXPED.x1 + 5 && y > SLOTS.EXPED.y0 - 1 && y < SLOTS.EXPED.y1 + 5) return false; if (D(x, y) < minD || !inWorld(x, y) || behind.has(Math.floor(x) + ',' + Math.floor(y))) return false; if (minD >= 4 && front(x, y)) return false; if (LAKE && (lakeD(x, y, 1.6) < 1 || (minD >= 4 && x + y > LAKE.cx + LAKE.cy && lakeD(x, y, 7) < 1))) return false; out.push({ n, x, y, th: 'outdoor', s: sc, flip: hash2(Math.floor(x * 7), Math.floor(y * 7), 5) < 0.5 }); return true; };
  // scenes, each tied to a building (skipped when that building's slot is missing)
  const zones = [];
  const keep = [];   // every scene / entrance item: no tree may stand in front of (down-screen of) it
  const scene = (cx, cy, items) => { zones.push([cx, cy]); for (const [n, dx, dy, sc] of items) if (put(n, cx + dx, cy + dy, 1, sc || 1)) keep.push([cx + dx, cy + dy]); };
  const coversKept = (x, y) => keep.some(([ix, iy]) => { const k = ((x + y) - (ix + iy)) / 2, side = Math.abs((x - y) - (ix - iy)); return k > -1 && k < 8 && side < 3.2; });
  if (SLOTS.CANT && SLOTS.DORM2) scene(SLOTS.CANT.x1 + 5, (SLOTS.LIB.y0 + SLOTS.LIB.y1) / 2, [   // build 244: right of the right column   // the magic glade: a fairy ring in a circle of rune stones, glowing mushrooms and crystals
    ['fairyring', 0, 0, 1.2], ['runestone', -2.6, -0.4], ['runestone', 0.4, -2.6], ['runestone', 2.6, 0.5], ['runestone', -0.3, 2.7], ['glowmush', -1.6, -1.8], ['glowmush', 1.9, 1.7], ['crystals', 1.8, -1.6], ['crystals', -1.9, 1.8, 0.9], ['bells', 3.4, -2.2], ['toadhouse', 4.2, 2.6]]);
  if (WORLD === 1 && COURT && SLOTS.CANT) scene((SLOTS.CANT.x0 + SLOTS.CANT.x1) / 2, (SLOTS.CANT.y1 + COURT.y1) / 2, [   // plan item 3: the small glade on the lawn under the canteen (between the gallery, the director and the tower)
    ['fairyring', -0.6, 0, 1.0], ['runestone', -2.0, -0.6], ['runestone', -0.5, -1.7, 0.9], ['glowmush', -1.8, 1.2], ['toadhouse', 0.9, 1.7, 0.7], ['crystals', -2.4, 2.0, 0.8]]);   // the right part is hidden by the tower's tall wall: everything stays left/front
  if (SLOTS.TOWER && slotOf(5)) scene(SLOTS.TOWER.x1 + 5, SLOTS.TOWER.y0 + 3, [   // build 244: right of the tower   // the apiary between the Elements class and the tower
    ['beehive', -0.9, -0.8], ['beehive', 0.9, -1.1], ['starflowers', -1.4, 0.8], ['roses', 0.3, 0.9], ['bells', 1.5, 0.5], ['starflowers', 0.2, -2.4], ['roses2', -1.2, 2.6], ['bells', 1.1, 2.7]]);
  if (slotOf(2)) scene(slotOf(2).x0 - 3.6, (slotOf(2).y0 + slotOf(2).y1) / 2, [   // the wishing-well corner left of the classes
    ['well', 0, 0], ['birdbath', 1.4, 2.2], ['pumpkin', -1.2, -2.6], ['berrybush', -1.6, 1.4], ['stump', 1.5, -1.6], ['chestmush', -0.4, 2.9], ['roses', 1.6, 3.6]]);
  if (SLOTS.GARDEN) scene(slotOf(5).x1 + 5, 3, [   // build 244: the garden moved into the court; the grove stays right of the back row   // a blossom grove beside the graduates' garden
    ['blossom', -1.2, -1.6, 0.95], ['blossom', 1.6, -0.4, 1.05], ['blossom', -0.6, 1.8], ['roses', -2.4, 0.4], ['starflowers', 0.6, 0.4], ['roses2', 2.6, 2.0]]);
  { const g = GATE_TILE, cx = Math.floor(g.x) + 0.5, gy = g.y - 1;   // the entrance (path tiles x cx-1.5..cx+2.5): lanterns along the path, guardians at the gate, flowers
    const L = cx - 2.1, R = cx + 3.1;
    for (const [n, x, y, sc] of [['lantern_gold', L, gy - 2, 1], ['lantern_blue', R, gy - 2, 1], ['lantern_blue', L - 0.4, gy + 3.4, 1], ['lantern_gold', R + 0.6, gy + 3.4, 1],
      ['owl_statue', L - 1, gy + 0.6, 1], ['fox_statue', R + 1, gy + 0.6, 1], ['flowerbed', L - 3, gy - 0.7, 1.1], ['flowerbed', R + 3, gy + 1.6, 1.1],
      ['flowerbox', L - 1.6, gy - 2.3, 1], ['urn', L - 0.5, gy + 6.4, 1], ['urn', R + 0.9, gy + 6.4, 1], ['signpost2', R + 2.6, gy + 5.2, 1], ['roses', L - 2.6, gy + 2.6, 0.9], ['roses2', R + 2.8, gy - 1.6, 0.9],
      ['founder', L - 4.6, gy + 4.4, 1], ['hydrangea', L - 3.6, gy + 6.2, 1], ['peonybed', L - 5.8, gy + 2.6, 1], ['crystalball', R + 4.4, gy + 3.4, 1], ['hydrangea', R + 5.2, gy + 1.8, 0.9]])   // moved here from the garden (her «поставь в другом месте просто. У входа например»)
      if (put(n, x, y, 1, sc)) keep.push([x, y]);
    if (WORLD === 1) { MOON_AT.x = L - 6.4; MOON_AT.y = gy + 6.8; out.push({ n: 'moontree', x: MOON_AT.x, y: MOON_AT.y, th: 'outdoor', s: 1 }); keep.push([MOON_AT.x, MOON_AT.y]); }   // the Moon Tree (tester №73po7zf1, her pick)
    entrancePath = { x0: cx - 1.5, x1: cx + 2.5, y0: g.y + 0.5, y1: g.y + (WORLD === 1 ? 22.5 : 8.5) };   // world 1: the path comes out of the forest
    if (WORLD === 1) for (let k = 0; k < 3; k++) { const y = gy + 10 + k * 4; if (put('lantern_gold', L - 0.3, y, 1, 0.75)) keep.push([L - 0.3, y]); if (put('lantern_gold', R + 0.3, y, 1, 0.75)) keep.push([R + 0.3, y]); } }
  // the forest: grove centres on a loose grid in the band, away from scenes and the entrance
  const G = GATE_TILE;
  if (WORLD === 1 && COURT) {   // the magic court (her «место игровое с фонтаном, тусовкой учеников»): fountain in the middle, benches round the plaza, trees and flowers in the lawn corners, lanterns on the paths
    const c = courtC(), R = 3.6, W = COURT.x1 - COURT.x0, H = COURT.y1 - COURT.y0, add = (n, x, y, sc = 1, fl = false) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (regAt(Math.floor(x) + dx, Math.floor(y) + dy) !== 'hall') return; out.push({ n, x, y, th: 'outdoor', s: sc, flip: fl }); keep.push([x, y]); };
    add('fountain', c.x + 0.89, c.y + 0.89, 1.45);   // her «Не по центру»: the basin's ground centre lands on the mosaic centre
    for (const b of courtBenches()) add(b.f ? 'bench_a' : 'bench_b', b.x, b.y, 1.1);   // 4 round the plaza + one per bench level on the lawns
    for (const [fx, fy] of [[0.78, 0.22], [0.22, 0.78], [0.78, 0.78]]) {   // the back-left quarter holds the graduates' garden (centred there since her «по центру»)   // a corner garden in each quarter of the lawn
      const x = COURT.x0 + W * fx, y = COURT.y0 + H * fy;
      if (fx < 0.5) continue;   // the playground has no tree (the swing stands there)
      add(fx < 0.5 === fy < 0.5 ? 'blossom' : 'goldtree', x, y, 0.95); add(fy < 0.5 ? 'hydrangea' : 'peonybed', x + 2.4, y + 0.4);
    }
    { const Z = courtZones();   // the zones' own things
      Z.cushions.forEach((q, k) => add('cz_cushions', q.x, q.y, k ? 0.8 : 0.9, !!k)); add('cz_bookshelf', Z.shelf.x, Z.shelf.y); add('birdbath', Z.bath.x, Z.bath.y);
      add('cz_swing', Z.swing.x, Z.swing.y); add('cz_target', Z.target.x, Z.target.y); add('topiary_ball', Z.play.x + 3.0, Z.play.y + 2.6);
      add('cz_picnic', Z.picnic.x, Z.picnic.y); Z.lanterns.forEach((q, k) => add('cz_lanterns', q.x, q.y, 1, !!k)); }
    [['world', 'st_star', -4.6, 4.2], ['races', 'st_fox', 4.2, -4.6], ['teachers', 'st_owl', 1.9, 5.6], ['school', 'st_tikhon', 5.6, 1.9]].forEach(([k, n, dx, dy]) => { if (loreQ(k)) add(n, c.x + 0.5 + dx, c.y + 0.6 + dy, 1.6); });   // Tikhon's exam statuettes: left and right of the mosaic and flanking its front path, 1.6x (her «Их очень плохо в игре видно»: never behind the fountain)
    for (const [dx, dy] of [[-5.2, 0], [5.2, 0], [0, -5.2], [0, 5.2]]) add('lantern_gold', c.x + dx + (dx ? 0 : 1.4), c.y + dy + (dy ? 0 : 1.4), 0.9);
    for (const g of GAL || []) out.push({ n: g.n, x: g.x, y: g.y, th: 'outdoor', s: 1 });   // the colonnade (plan item 2)
    for (const [a, b] of GAL_G || []) out.push({ n: 'gal_garland', x: (a.x + b.x) / 2 + 0.01, y: (a.y + b.y) / 2 + 0.01, th: 'outdoor', g: [a, b] });
  }
  if (SLOTS.GARDEN) { const g = SLOTS.GARDEN, X = g.x0, Y = g.y0;   // the graduates' garden: arch at the door, fountain plaza, founder statue, gazebo, benches, flowers
    for (const [n, dx, dy, fl, sc] of WORLD === 1 ? [['flowerarch', 3.6, 0.5, false], ['gazebo', 3.42, 3.42], ...[0.75, 2.25, 3.75, 5.25].flatMap((t) => [['hedge_long', t, 5.75, false, 1.45], ['hedge_long', 5.75, t, true, 1.45], ['hedge_long', 0.25, t, true, 1.45]]), ['hedge_long', 0.75, 0.25, false, 1.45], ['hedge_long', 5.25, 0.25, false, 1.45]]   // a low flowering hedge closes the garden; the arch is the only way in   // one axis (her «сделай так как сделал бы дизайнер»): arch on the entrance (its posts' midpoint on the door centre x0+3), the gazebo's floor disc centred on the circle (sprite anchor +0.42 tiles: the disc centre is 0.145 h above the picture's bottom), no lanterns (on the cross axis one stood in front of the gazebo; the circle gives the light); the graduate is drawn on top (drawVanish) so the gazebo never hides him (her «Выпуск учеников должен быть понятнее и ярче. А тут все навалено»): only the arch, the magic circle (drawGradCircle) and two lanterns
      : [['flowerarch', 1.6, 0.5, false], ['crystalball', 3.55, 3.6], ['gazebo', 4.95, 1.1], ['bench_b', 2.5, 5.5], ['bench_a', 5.5, 3.3],   // calm layout (her «слишком много навалено деталей»): four big things far apart, one bench, two topiaries
      ['topiary_spiral', 0.75, 1.3], ['topiary_ball', 0.8, 5.45]]) {
      const nn = outName(n); if (nn) out.push({ n: nn, x: X + dx, y: Y + dy, th: 'outdoor', s: sc || 1, flip: !!fl }); keep.push([X + dx, Y + dy]); } }
  // The clearing around the school (her «на поляне ... мало деталей стало красивых»): small composed vignettes every ~5 tiles
  // in the band 2..6 tiles from the buildings; a vignette gets its tree only where the tree cannot hide a building behind it.
  const VIGN = [
    [['blossom', 0, 0], ['roses', 1.1, 0.9], ['starflowers', -1.0, 1.1], ['roses2', 0.4, -1.2]],
    [['willow', 0, 0], ['bells', 1.2, 0.6], ['fern', -1.1, 0.9], ['glowmush', 0.6, 1.4]],
    [['goldtree', 0, 0], ['berrybush', 1.2, 0.8], ['stump', -1.1, 0.7], ['starflowers', 0.2, 1.4]],
    [[null, 0, 0], ['boulder', 0, 0], ['crystals', 1.0, 0.6], ['runestone', -0.9, 0.5], ['glowmush', 0.2, 1.2]],
    [[null, 0, 0], ['flowerbed', 0, 0], ['birdbath', 1.3, 0.4], ['roses', -1.2, 0.8]],
    [[null, 0, 0], ['stump', 0, 0], ['glowmush', 0.9, 0.5], ['berrybush', -1.0, 0.8], ['fern', 0.6, -1.0]],   // the pumpkin cottage stays one per map (her «слишком много домиков тыкв»)
    [['blossom', 0, 0], ['flowerbed', 1.3, 1.0], ['bells', -1.0, 1.0]],
    [[null, 0, 0], ['chestmush', 0, 0], ['glowmush', 0.9, 0.7], ['fern', -0.9, 0.6], ['bells', 0.3, -1.0]],
  ];
  const hidesBuilding = (x, y) => { for (let k = 1; k <= 7; k++) for (let j = -1; j <= 1; j++) if (regAt(Math.floor(x - k + j), Math.floor(y - k - j))) return true; return false; };   // a tall tree covers what is up-screen of it
  // lanterns along the outdoor stone paths, every ~4 tiles on alternating sides
  { let k = 0; for (let x = X0; x < X1; x++) for (let y = Y0; y < Y1; y++) { if (regAt(x, y) !== 'path') continue; if ((x * 7 + y * 3) % 9) continue;   // sparse (her «слишком много фонарей»)
      for (const [dx, dy] of [[1, 0], [0, 1]]) { const nx = x + dx, ny = y + dy; if (regAt(nx, ny)) continue; if (put(k++ % 2 ? 'lantern_gold' : 'lantern_blue', nx + 0.5 - dx * 0.25, ny + 0.5 - dy * 0.25, 1, 0.85)) break; } } }
  const vspots = [];
  for (let gx = X0; gx < X1; gx += 4) for (let gy = Y0; gy < Y1; gy += 4) {
    const x = gx + 0.5 + hash2(gx, gy, 111) * 3, y = gy + 1 + hash2(gx, gy, 112) * 3, d = D(x, y);
    if (d < 2 || d > 6 || !inWorld(x, y) || front(x, y) || zones.some(([zx, zy]) => Math.hypot(zx - x, zy - y) < 5.5) || vspots.some(([vx, vy]) => Math.hypot(vx - x, vy - y) < 3.8)) continue;
    if (hash2(gx, gy, 113) < 0.12) continue;   // leave some lawn open
    vspots.push([x, y]);
    const v = VIGN[Math.floor(hash2(gx, gy, 114) * VIGN.length)], tree = v[0][0] && d >= 3 && !hidesBuilding(x, y) && !coversKept(x, y);
    v.forEach(([n, dx, dy], k) => { if (!n || (k === 0 && !tree)) return; put(n, x + dx, y + dy, 1, k === 0 ? 0.9 + hash2(gx, gy, 115) * 0.15 : 0.85 + hash2(gx, gy, 116 + k) * 0.3); });
    if (!tree && v[0][0]) put(['roses', 'starflowers', 'bells'][Math.floor(hash2(gx, gy, 117) * 3)], x, y, 1);   // no room for the tree: flowers in its place
  }
  // The forest (her «Всё еще некрасиво, думай»): one tree per jittered cell instead of mixed groves.
  //  - an organic edge line ~8-11 tiles from the buildings, with a soft band of bushes in front of it;
  //  - species by area: a dark fir forest behind the school (top of the screen), oaks and willows at the sides,
  //    blossom and golden trees only as rare accents on the edge;
  //  - the deeper, the darker and cooler the trees (depth tint) and the darker the forest floor under them.
  const SC = { x: (BUILDING.x0 + BUILDING.x1) / 2, y: (BUILDING.y0 + BUILDING.y1) / 2 };
  const vnoise = (x, y, f, k) => { const X = Math.floor(x / f), Y = Math.floor(y / f), u = x / f - X, v = y / f - Y, sm = (t) => t * t * (3 - 2 * t);
    const a = hash2(X, Y, k), b2 = hash2(X + 1, Y, k), c = hash2(X, Y + 1, k), d2 = hash2(X + 1, Y + 1, k); return a + (b2 - a) * sm(u) + (c - a) * sm(v) + (a - b2 - c + d2) * sm(u) * sm(v); };
  const edgeAt = (x, y) => 8 + 3 * vnoise(x, y, 9, 81);
  const DEEP = 4;   // beyond edge + DEEP tiles the forest is made of fewer, bigger trees on a 3-tile grid (her «Издалека делай»: ~half the trees to draw)
  for (const step of [2, 3]) for (let gx = X0; gx < X1; gx += step) for (let gy = Y0; gy < Y1; gy += step) {
    const x = gx + 0.3 + hash2(gx, gy, 91 + step) * (step - 0.6), y = gy + 0.3 + hash2(gx, gy, 92 + step) * (step - 0.6), d = D(x, y), e = edgeAt(x, y);
    if ((step === 2) !== (d < e + DEEP)) continue;
    if (!inWorld(x, y) || zones.some(([zx, zy]) => Math.hypot(zx - x, zy - y) < 7) || (Math.abs(x - G.x) < 8 && y > G.y - 4 && y < G.y + 16)) continue;
    if (d >= e - 1.6 && d < e) { if (hash2(gx, gy, 93) < 0.55) put(['fern', 'hedge', 'berrybush', 'fern', 'roses', 'bells', 'boulder'][Math.floor(hash2(gx, gy, 94) * 7)], x, y, 4, 0.9 + hash2(gx, gy, 95) * 0.3); continue; }   // the soft edge
    if (d < e) continue;
    const depth = Math.min(1, (d - e) / 14);
    if (hash2(gx, gy, 96) > 0.5 + 0.45 * Math.min(1, (d - e) / 4)) continue;   // thin at the edge, closed canopy deeper in
    const back = (SC.x + SC.y) - (x + y), side = Math.abs((x - y) - (SC.x - SC.y));   // >0: behind the school (top of the screen)
    const firZone = back > 18 || vnoise(x, y, 14, 97) < 0.3, r = hash2(gx, gy, 98);
    let n;
    if (d - e < 2.5 && r < 0.12) n = r < 0.06 ? 'blossom' : 'goldtree';   // accents only on the edge
    else if (firZone) n = r < 0.82 ? 'fir' : 'oak';
    else n = r < 0.55 ? 'oak' : r < 0.78 ? 'willow' : 'fir';
    const sc = ((n === 'fir' ? 0.95 : 0.88) + hash2(gx, gy, 99) * 0.3) * (step === 3 ? 1.35 : 1);
    if (coversKept(x, y)) continue;
    if (put(n, x, y, 6, sc)) out[out.length - 1].depth = depth;
  }
  if (WORLD === 2 && LAKE) for (const [n, dx, dy, sc, fl] of LAKE_ITEMS) out.push({ n, x: LAKE.cx + dx, y: LAKE.cy + dy, th: 'outdoor', s: sc || 1, flip: !!fl });   // the lake's pier, boats and shore
  OUTDOOR = out;
}
// The iso grass repeats on an axis-aligned rectangle 2N*HW x 2N*HH: it is rendered once into a small tile canvas and then
// filled as a plain (scale-only) pattern. Filling the rotated pattern itself every frame cost ~25x the whole frame (her «Очень лагать стало»).
const GRASS_K = 3, GRASS_N = 8;   // tile canvas px per world unit; tiles covered by one grass picture (bigger = the repeat is less visible)
let grassTile = null;
const grassPats = new WeakMap();
function grassPat(c) {
  if (!grassTile) { const im = part('outdoor', 'grass'); if (!im) return null;
    const t = document.createElement('canvas'); t.width = Math.round(2 * GRASS_N * HW * GRASS_K); t.height = Math.round(2 * GRASS_N * HH * GRASS_K);
    const tc = t.getContext('2d'), pt = tc.createPattern(im, 'repeat'), T = im.naturalWidth / GRASS_N;
    pt.setTransform(new DOMMatrix([HW / T, HH / T, -HW / T, HH / T, 0, 0])); tc.setTransform(GRASS_K, 0, 0, GRASS_K, 0, 0); tc.fillStyle = pt; tc.fillRect(0, 0, 2 * GRASS_N * HW, 2 * GRASS_N * HH);
    grassTile = t; }
  let p = grassPats.get(c); if (!p) { p = c.createPattern(grassTile, 'repeat'); p.setTransform(new DOMMatrix([1 / GRASS_K, 0, 0, 1 / GRASS_K, 0, 0])); grassPats.set(c, p); }
  return p;
}
const isOpat = (c) => isoPat(c, 'path', 3);
function isoPat(c, n, tiles) {   // a ground texture laid on the iso grid, aligned to the world origin
  const p = pat(c, 'outdoor', n); if (!p) return null;
  const T = part('outdoor', n).naturalWidth / tiles, o = P(0, 0);
  p.setTransform(new DOMMatrix([HW / T, HH / T, -HW / T, HH / T, o.x, o.y])); return p;
}
// ambient life on the lawn (code only): fireflies over glowing things, butterflies over flowers, petals from blossom trees
const OUT_FIREFLY = new Set(['glowmush', 'crystals', 'bells', 'fairyring', 'runestone']), OUT_BUTTERFLY = new Set(['roses', 'roses2', 'starflowers', 'bells', 'hedge']);
const glowCache = {};
function glowSprite(rgb) {   // a soft round glow, rendered once per colour (drawImage is far cheaper than a gradient every frame)
  if (glowCache[rgb]) return glowCache[rgb];
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.35, `rgba(${rgb},0.45)`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (glowCache[rgb] = c);
}
function outFx(o, p, h) {
  const T = fxNow() + (o.x * 7.3 + o.y * 3.1);
  if (o.n === 'fountain') {   // jets from the top bowl: drops arc out and fall back (2.6 s), a soft glow over the water (3 s)
    { const lg = window.__luckGlow, u = lg ? (performance.now() - lg) / 2500 : 1; if (u < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8 * (1 - u); ctx.drawImage(glowSprite('140,255,150'), p.x - h * 0.6, p.y - h * 0.95, h * 1.2, h * 0.8); ctx.restore(); emoji('🍀', p.x, p.y - h * 0.6 - u * 14, 30 + 8 * Math.sin(u * Math.PI)); } }   // a lucky coin: 🍀 over the fountain for 2.5 s (the riddle's catch window)
    const tx = p.x, ty = p.y - h * 0.62, L = WORLD === 1 && S.courtUp ? S.courtUp.fount || 1 : 1, C = WORLD === 1 && S.courtUp ? S.courtUp.coin || 0 : 0, g = (L - 1) / 9;   // fountain level 1..10, coin level 0..10
    ctx.save(); ctx.globalAlpha = Math.min(1, 0.35 + 0.45 * g + 0.15 * Math.sin(T * Math.PI * 2 / 3)); const gw = h * (0.9 + 0.7 * g); ctx.drawImage(glowSprite(fountCol().glow), tx - gw / 2, p.y - h * 0.45 - h * 0.2 - g * h * 0.15, gw, h * (0.5 + 0.45 * g)); ctx.restore();
    const nJ = 8 + 2 * (L - 1), jh = 0.18 * (1 + 0.1 * (L - 1)), dr = 1.6 + 0.22 * (L - 1);   // more, higher, bigger drops with every level
    for (let k = 0; k < nJ; k++) { const u = ((T + k * 2.6 / nJ) / 2.6) % 1, an = k * Math.PI * 2 / nJ, vx = Math.cos(an) * h * 0.3, vy = Math.sin(an) * h * 0.12, x = tx + vx * u, y = ty + vy * u - Math.sin(u * Math.PI) * h * jh + u * h * 0.2;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.9; ctx.fillStyle = fountCol().drop; ctx.beginPath(); ctx.arc(x, y, dr, 0, Math.PI * 2); ctx.fill(); }
    if (L >= 3) { const hh = h * (0.3 + 0.07 * (L - 3)), w0 = 2 + 0.3 * (L - 3), gr = ctx.createLinearGradient(0, ty, 0, ty - hh);   // a tall central jet: a water column with a spray crown
      gr.addColorStop(0, `rgba(${fountCol().orb},0.85)`); gr.addColorStop(1, 'rgba(230,253,255,0.15)'); ctx.globalAlpha = 1; ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(tx - w0, ty); ctx.quadraticCurveTo(tx - w0 * 0.4 + Math.sin(T * 5) * 0.8, ty - hh * 0.6, tx, ty - hh); ctx.quadraticCurveTo(tx + w0 * 0.4 + Math.sin(T * 5 + 1) * 0.8, ty - hh * 0.6, tx + w0, ty); ctx.fill();
      for (let k = 0; k < 12; k++) { const u = ((T * 0.9 + k / 12) % 1), an = k * 0.52, x = tx + Math.cos(an) * u * h * 0.16, y = ty - hh - Math.sin(u * Math.PI) * h * 0.06 + u * u * hh * 0.7;
        ctx.globalAlpha = 0.9 * (1 - u); ctx.fillStyle = fountCol().jet; ctx.beginPath(); ctx.arc(x, y, dr * 0.9, 0, Math.PI * 2); ctx.fill(); } }
    if (L >= 5) for (let k = 0; k < Math.min(6, L - 4); k++) { const an = T * 0.6 + k * Math.PI * 2 / Math.min(6, L - 4), ox = tx + Math.cos(an) * h * 0.55, oy = ty - h * 0.05 + Math.sin(an) * h * 0.2 + Math.sin(T * 1.7 + k) * 3, r = 6 + 0.6 * Math.sin(T * 2 + k);   // floating water orbs
      ctx.globalAlpha = 0.8; ctx.drawImage(glowSprite('150,235,255'), ox - r * 3, oy - r * 3, r * 6, r * 6); ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(215,250,255,0.9)'; ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ox - r * 0.35, oy - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
    if (L >= 8) for (let k = 0; k < 6; k++) { const an = T * 0.9 + k * 1.047, sx = tx + Math.cos(an) * h * 0.55, sy = ty - h * 0.55 + Math.sin(an) * h * 0.18 - ((T * 0.5 + k / 6) % 1) * h * 0.2; fxStar(sx, sy, 3.2, 1, k % 2 ? '255,236,150' : '190,240,255'); }   // sparkles over a great fountain
    for (let k = 0; k < C; k++) { const an = k * 2.4 + 0.5, rr = 0.15 + 0.22 * ((k * 0.37) % 1), gx = tx + Math.cos(an) * h * rr * 1.4, gy = p.y - h * 0.3 + Math.sin(an) * h * rr * 0.45, tw = 0.5 + 0.5 * Math.sin(T * 2.3 + k * 1.7);   // coins glinting in the basin
      ctx.globalAlpha = 0.5 + 0.5 * tw; ctx.fillStyle = '#e8b83a'; ctx.beginPath(); ctx.ellipse(gx, gy, 2.2, 1.3, 0, 0, Math.PI * 2); ctx.fill(); if (tw > 0.85) fxStar(gx, gy - 1, 1.6, 0.9); }
    ctx.globalAlpha = 1;
  }
  if (o.n === 'lantern_gold' || o.n === 'lantern_blue') {   // the crystal flame glows softly (3 s), two motes drift around it (6 s)
    const rgb = o.n === 'lantern_gold' ? '255,214,120' : '150,200,255', gx = p.x, gy = p.y - h * 0.42, gl = 0.55 + 0.25 * Math.sin(T * Math.PI * 2 / 3), r = h * 0.38;
    ctx.save(); ctx.globalAlpha = gl; ctx.drawImage(glowSprite(rgb), gx - r, gy - r, r * 2, r * 2);
    for (let k = 0; k < 2; k++) { const an = T * Math.PI * 2 / 6 + k * Math.PI, mx = gx + Math.cos(an) * h * 0.22, my = gy - 4 + Math.sin(an * 1.5) * h * 0.12; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(T * 2.1 + k); ctx.drawImage(glowSprite(rgb), mx - 4, my - 4, 8, 8); }
    ctx.restore();
  }

  if (OUT_FIREFLY.has(o.n)) for (let k = 0; k < 2; k++) {   // a firefly drifts on a slow loop (6 s) and glows softly (3 s)
    const an = T * Math.PI * 2 / 6 + k * Math.PI, x = p.x + Math.cos(an) * h * 0.45, y = p.y - h * 0.6 + Math.sin(an * 2) * h * 0.18 - k * 6, gl = 0.55 + 0.45 * Math.sin(T * Math.PI * 2 / 3 + k * 2);
    ctx.save(); ctx.globalAlpha = 0.9 * gl; ctx.drawImage(glowSprite('255,245,150'), x - 5, y - 5, 10, 10); ctx.restore();
  }
  if (OUT_BUTTERFLY.has(o.n) && hash2(Math.floor(o.x), Math.floor(o.y), 9) < 0.6) {   // a butterfly circles the flowers (8 s), wings open and close smoothly (1.2 s)
    const an = T * Math.PI * 2 / 8, x = p.x + Math.cos(an) * 14, y = p.y - h - 6 + Math.sin(an * 1.5) * 5, f = 0.35 + 0.65 * Math.abs(Math.sin(T * Math.PI / 1.2));
    const col = ['#ff9ccf', '#ffd45e', '#a9c8ff', '#c9a2ff'][Math.floor(hash2(Math.floor(o.x), Math.floor(o.y), 8) * 4)];
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(an) > 0 ? 1 : -1, 1); ctx.fillStyle = col; ctx.strokeStyle = '#6b4a8a'; ctx.lineWidth = 0.5;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 2.4 * f, -1, 2.6 * f + 0.3, 2.2, sd * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(sd * 1.8 * f, 1.6, 1.7 * f + 0.2, 1.4, -sd * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = '#5a3f6e'; ctx.fillRect(-0.4, -2, 0.8, 4.5); ctx.restore();
  }
  if (o.n === 'blossom') for (let k = 0; k < 3; k++) {   // petals fall slowly (5 s) swaying
    const u = ((T + k * 1.7) / 5) % 1, x = p.x + (k - 1) * 12 + Math.sin(u * Math.PI * 3 + k) * 5, y = p.y - h * 0.75 + u * h * 0.75, al = Math.sin(u * Math.PI);
    ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = '#ffc3dc'; ctx.strokeStyle = '#d98ab0'; ctx.lineWidth = 0.4; ctx.translate(x, y); ctx.rotate(u * 6 + k);
    ctx.beginPath(); ctx.ellipse(0, 0, 2, 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}
function drawEntrancePath(c0 = ctx, baking = false) {   // the flagstone path continues outside the gate: pre-rendered once, then one drawImage per frame
  const e = entrancePath; if (!e) return;
  if (!entranceDecal || entranceDecal.key !== outKey) { const st = part('outdoor', 'path'); if (!st) return;
    const pts = [P(e.x0, e.y0), P(e.x1, e.y0), P(e.x1, e.y1), P(e.x0, e.y1)], minX = Math.min(...pts.map((q) => q.x)), minY = Math.min(...pts.map((q) => q.y)), maxX = Math.max(...pts.map((q) => q.x)), maxY = Math.max(...pts.map((q) => q.y)), K = 3;
    const cv = document.createElement('canvas'); cv.width = Math.ceil((maxX - minX) * K); cv.height = Math.ceil((maxY - minY) * K); const c = cv.getContext('2d');
    c.setTransform(K, 0, 0, K, -minX * K, -minY * K); const pt = isoPat(c, 'path', 3); if (!pt) return;
    const g = c.createLinearGradient(0, pts[0].y, 0, pts[2].y); poly(c, pts); c.fillStyle = pt; c.fill();
    c.globalCompositeOperation = 'destination-out'; g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(WORLD === 1 ? 0.82 : 0.65, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = g; c.fillRect(minX, minY, maxX - minX, maxY - minY);   // fades into the grass
    entranceDecal = { key: outKey, cv, x: minX, y: minY, w: maxX - minX, h: maxY - minY }; }
  const d = entranceDecal;
  if (baking) { d.baked = d.x > MARGIN && d.y > MARGIN && d.x + d.w < MARGIN + SW && d.y + d.h < MARGIN + SH; if (d.baked) c0.drawImage(d.cv, d.x, d.y, d.w, d.h); return; }
  if (d.baked || d.x + d.w < VIEW.x0 || d.x > VIEW.x1 || d.y + d.h < VIEW.y0 || d.y > VIEW.y1) return;
  ctx.drawImage(d.cv, d.x, d.y, d.w, d.h);
}
function outShadow(c, o) {   // the cast shadow of an outdoor object on the grass (baked into the static layer when it lies inside it)
  const im = part('outdoor', o.n), sh = outSh[o.n]; if (!im || !sh) return false;
  const p = P(o.x, o.y), h = (OUT_H[o.n] || 28) * (o.s || 1), w = h * im.naturalWidth / im.naturalHeight;
  if (!(o.depth > 0.2)) {   // under the closed canopy cast shadows are not seen: the forest floor patch is enough there
    const base = OUT_H[o.n] || 28, e = castShadow(o.n, o.flip, sh, base * im.naturalWidth / im.naturalHeight, base), k = (o.s || 1); c.drawImage(e.cv, p.x + e.ox * k, p.y + h * 0.02 + e.oy * k, e.w * k, e.h * k);
    c.fillStyle = 'rgba(40,52,46,0.12)'; c.beginPath(); c.ellipse(p.x, p.y, w * 0.16, w * 0.06, 0, 0, Math.PI * 2); c.fill(); }
  if (o.depth !== undefined && (c !== ctx || zoom >= 1.2)) {   /* from afar the tinted trees already read as deep forest: skip ~500 floor patches per frame */ const rx = w * 0.75, ry = rx * 0.45, a0 = c.globalAlpha; c.globalAlpha = 0.3 + 0.35 * o.depth; c.drawImage(glowSprite('30,58,38'), p.x - rx, p.y - ry * 0.6 - ry, rx * 2, ry * 2); c.globalAlpha = a0; }   // the forest floor: overlapping dark patches under the canopy
  return true;
}
// Trees grow out of the ground (build 285, her «корни должны быть утоплены в землю, кое-где насыпана земля на них ... Не проще сделать
// генерацию земли, а ты сам сверху налепишь на деревья? А кое-где корни просто обрежешь»): the spreading roots at the bottom of a
// tree picture are cut off, and an earth mound (SYNTX sheet art/parts/outdoor/soil_mounds.jpg, 2 tokens) covers the trunk base.
// per tree picture (measured on the sprites at 160 px): cut = share of the height cut from the bottom (where the roots spread),
// x = trunk centre at the cut (0..1 of the width), mw = mound width (share of the tree width)
const TREE_GROUND = { oak: { cut: 0.17, x: 0.52, mw: 0.5 }, fir: { cut: 0.14, x: 0.5, mw: 0.4 }, willow: { cut: 0.17, x: 0.49, mw: 0.42 },
  blossom: { cut: 0.18, x: 0.47, mw: 0.46 }, goldtree: { cut: 0.18, x: 0.55, mw: 0.44 }, moontree: { cut: 0.17, x: 0.55, mw: 0.42 } };
const SOIL = [0, 1].map((k) => { const im = new Image(); im.onload = () => { staticKey = ''; partsVer++; }; im.src = `assets/parts/outdoor/soil_${k}.webp?v=1`; return im; });
// ======================= the Moon Tree by the gate (tester «землитексту рко» №73po7zf1: «Возле входа у главных ворот школы нужно поставить
// особенное красивое дерево ... на нём могут вырастать плоды иногда»; Maria's pick «3» Лунное древо, look «Справа в виде луны») =======================
// Fruits ripen only at night by the phone's clock (21:30-5:30), one every MOON_EVERY s, at most MOON_MAX; the night counts even while the
// game is closed (timestamps). A tap collects them: each is worth MOON_PAY s of the steady income. Daytime tap = a hint when they ripen.
const MOON_AT = { x: 0, y: 0 }, MOON_EVERY = 300, MOON_MAX = 3, MOON_PAY = 180;
const moonNightAt = (t) => { const d = new Date(t), h = d.getHours() + d.getMinutes() / 60; return h >= 21.5 || h < 5.5; };
const moonNight = () => { const h = window.__hour; return h != null ? (h >= 21.5 || h < 5.5) : moonNightAt(Date.now()); };
const moonSt = () => (S.moon ||= { f: 0, acc: 0, last: Date.now() });
function stepMoon() {   // growth from the night minutes since the last look (cheap: at most once every 5 s)
  if (WORLD !== 1) return; const M = moonSt(), now = Date.now();
  if (now - M.last < 5000) return;
  let t = Math.max(M.last, now - 86400000);
  if (window.__hour != null) { if (moonNight()) M.acc += (now - M.last) / 1000; }
  else for (; t < now; t += 60000) if (moonNightAt(t)) M.acc += Math.min(60, (now - t) / 1000);
  M.last = now;
  while (M.acc >= MOON_EVERY && M.f < MOON_MAX) { M.f++; M.acc -= MOON_EVERY; if (!ffwd) dirtyPanel = true; }
  if (M.f >= MOON_MAX) M.acc = 0;
}
let moonRect = null;
const MOON_FRUIT = [[0.28, 0.21], [0.57, 0.08], [0.85, 0.19]];   // spots in the crown (share of the picture's width / height)
// the disc inside the crescent is a window into the night sky: nebula clouds turn slowly, stars circle and twinkle (her «Мне не нравится
// это белое в луне. Оно должно как-то анимироваться ... Крутится там внутри него»); drawn in depth order right over the tree picture
const moonNeb = [0, 1].map((seed) => {   // two cloud layers, made once
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  if (!seed) { const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, '#2c2f7a'); g.addColorStop(0.6, '#4b4aa8'); g.addColorStop(1, '#9d8fe0'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  let s = seed * 97 + 13; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cols = seed ? ['255,170,230', '150,220,255', '255,255,255'] : ['190,150,255', '120,200,255', '255,180,240'];
  for (let k = 0; k < 9; k++) { const a = r() * 6.28, d = 14 + r() * 40, px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d, rr = 14 + r() * 26, g = x.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, `rgba(${cols[k % 3]},${seed ? 0.45 : 0.55})`); g.addColorStop(1, `rgba(${cols[k % 3]},0)`); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  return c;
});
const moonOff = document.createElement('canvas'); moonOff.width = moonOff.height = 128;
function drawMoonDisc(cx, cy, r, T) {
  const x = moonOff.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, 128, 128);
  x.save(); x.translate(64, 64); x.rotate(T * 0.12); x.drawImage(moonNeb[0], -64, -64); x.restore();
  x.save(); x.translate(64, 64); x.rotate(-T * 0.21); x.globalAlpha = 0.8; x.drawImage(moonNeb[1], -64, -64); x.restore();
  x.globalAlpha = 1; x.fillStyle = '#fff';
  for (let k = 0; k < 18; k++) { const f = ((k * 0.618) % 1), a = k * 2.4 + T * (0.08 + (k % 3) * 0.05), d = 8 + f * 50, tw = 0.5 + 0.5 * Math.sin(T * 2.3 + k * 1.7), sz = 0.7 + tw * (k % 4 ? 1 : 1.8);
    x.globalAlpha = 0.45 + 0.55 * tw; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, sz, 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = 'destination-in';   // soft rim: the sky melts into the moonstone edge
  const m = x.createRadialGradient(64, 64, 0, 64, 64, 64); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.8, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, 128, 128);
  ctx.drawImage(moonOff, cx - r, cy - r, r * 2, r * 2);
}
let moonFx = null;   // where the tree was drawn this frame: its glow and fruits go on top after the night tint (drawMoonFx)
function drawMoonTree(o, p, w, h) {
  const top = p.y + h * 0.05 - h;
  moonRect = { x0: p.x - w * 0.45, y0: top, x1: p.x + w * 0.45, y1: p.y, t: performance.now() };
  drawMoonDisc(p.x - w / 2 + 0.608 * w, top + 0.415 * h, 0.236 * w, performance.now() / 1000);   // the living night sky inside the crescent
  moonFx = { p, w, h, top };
}
function drawMoonFx() {   // after drawDayNight: the moon disc glows at night, ripe fruits shine in the crown (day or night)
  const f = moonFx; moonFx = null; if (!f || WORLD !== 1) return;
  const { p, w, h, top } = f, T = performance.now() / 1000, D = dayTint(), tt = D.sun.map((v, i) => (v + D.shade[i]) / 2), L = Math.min(1, Math.max(0, 1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (L > 0.05) { ctx.globalAlpha = L * (0.55 + 0.12 * Math.sin(T * 1.3)); const r = w * 0.5; ctx.drawImage(glowSprite('150,185,255'), p.x - w / 2 + 0.61 * w - r, top + 0.415 * h - r, r * 2, r * 2); }
  const n = (S.moon && S.moon.f) || 0, rr = Math.max(4, w * 0.045);
  for (let k = 0; k < n; k++) { const [u, v] = MOON_FRUIT[k], x = p.x - w / 2 + u * w, y = top + v * h; ctx.globalAlpha = 0.75 + 0.2 * Math.sin(T * 2 + k * 2); ctx.drawImage(glowSprite('190,215,255'), x - rr * 3.5, y - rr * 3.5, rr * 7, rr * 7); }
  ctx.restore();
  for (let k = 0; k < n; k++) { const [u, v] = MOON_FRUIT[k]; emoji('🌙', p.x - w / 2 + u * w, top + v * h + Math.sin(T * 1.6 + k * 2) * 1.5, rr * 2.4); }
}
const DEW_AT = [[1.0, 4.5], [1.5, 5.0], [4.5, 1.0], [5.0, 1.5], [4.4, 4.9], [4.9, 4.3]];   // lawn spots inside the hedge, clear of the gazebo's circle
const DEW_IMG = (() => { const im = new Image(); im.src = 'assets/parts/outdoor/dew.webp?v=1'; return im; })();
const PUKH_IM = [0, 1].map((k) => { const im = new Image(); im.src = `assets/lore/pukh_${k}.webp?v=1`; return im; });
let pukh = null, pukhNext = performance.now() + (600 + Math.random() * 900) * 1000, pukhHit = null;   // next flight after 10-25 min of play
function drawPukh() {   // secret «Совёнок Пух»: the owlet crosses the screen now and then
  pukhHit = null; if (WORLD !== 1 || !LORE) return; const now = performance.now();
  if (document.hidden) { pukhNext = Math.max(pukhNext, now + 60000); return; }
  if (!pukh) { if (now < pukhNext || window.__pukhOff) return; const dir = Math.random() < 0.5 ? 1 : -1; pukh = { t0: now, dir, y: 0.2 + Math.random() * 0.35, dur: 8000 }; }
  const u = (now - pukh.t0) / pukh.dur; if (u >= 1) { pukh = null; pukhNext = now + (600 + Math.random() * 900) * 1000; return; }
  const vw = VIEW.x1 - VIEW.x0, vh = VIEW.y1 - VIEW.y0, sz = 62 / scale;   // ~62 screen px whatever the zoom
  let x = pukh.dir > 0 ? VIEW.x0 - sz + u * (vw + sz * 2) : VIEW.x1 + sz - u * (vw + sz * 2), y = VIEW.y0 + vh * pukh.y + Math.sin(u * Math.PI * 3) * vh * 0.04;
  if (pukh.caught) { const c = (now - pukh.caught) / 1000; x = pukh.cx + Math.sin(c * 6) * sz * 0.8 * Math.max(0, 1 - c) + pukh.dir * c * c * vw * 0.5; y = pukh.cy - Math.cos(c * 6) * sz * 0.6 * Math.max(0, 1 - c) + sz * 0.6 - c * vh * 0.25; if (c > 2.2) { pukh = null; pukhNext = now + (600 + Math.random() * 900) * 1000; return; } }   // a happy loop, then off
  const im = PUKH_IM[Math.floor(now / 170) % 2]; if (!im.complete || !im.naturalWidth) return; const h = sz * im.naturalHeight / im.naturalWidth;
  ctx.save(); ctx.translate(x, y); if (pukh.dir < 0) ctx.scale(-1, 1); ctx.drawImage(im, -sz / 2, -h / 2, sz, h); ctx.restore();
  pukhHit = window.__pukhPos = { x, y, r: sz * 0.75 };
}
let sfall = null, sfNext = performance.now() + (20 + Math.random() * 40) * 1000, sfWasNight = false, sfHits = [], sfBursts = [];   /* secret «Звездопад» */
const sfNight = () => { const d = new Date(), h = window.__hour ?? d.getHours() + d.getMinutes() / 60; return h >= 22 || h < 5; };
function drawStarfall() {   /* secret «Звездопад»: shooting stars over the school at night, a tap catches one */
  sfHits = []; if (WORLD !== 1 || !LORE) return; const now = performance.now();
  if (document.hidden || !sfNight()) { sfWasNight = false; sfNext = Math.max(sfNext, now + 60000); if (!sfall) return; }
  else if (!sfWasNight) { sfWasNight = true; sfNext = Math.min(sfNext, now + (20 + Math.random() * 40) * 1000); }   /* night just began or the game came back: the first starfall soon */
  const vw = VIEW.x1 - VIEW.x0, vh = VIEW.y1 - VIEW.y0, k = 1 / scale;
  if (!sfall && now >= sfNext && !window.__sfOff) { const dir = Math.random() < 0.5 ? 1 : -1; sfall = { t0: now, stars: Array.from({ length: 6 }, (_, j) => ({ d: j * 1100 + Math.random() * 500, dur: 1700 + Math.random() * 700, x: 0.1 + Math.random() * 0.8, y: 0.04 + Math.random() * 0.3, dir, len: 0.22 + Math.random() * 0.1 })) }; }
  if (sfall) {
    let alive = false;
    for (const st of sfall.stars) {
      const u = (now - sfall.t0 - st.d) / st.dur; if (st.caught || u >= 1) continue; alive = true; if (u < 0) continue;
      const dx = st.dir * vw * st.len, dy = vh * st.len * 0.55, x = VIEW.x0 + vw * st.x + dx * u, y = VIEW.y0 + vh * st.y + dy * u, al = Math.min(1, u * 5, (1 - u) * 4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.85; const g = ctx.createLinearGradient(x, y, x - dx * 0.55, y - dy * 0.55); g.addColorStop(0, 'rgba(255,246,205,0.95)'); g.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 3.2 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 0.55, y - dy * 0.55); ctx.stroke();
      ctx.globalAlpha = al; ctx.drawImage(glowSprite('255,240,190'), x - 20 * k, y - 20 * k, 40 * k, 40 * k); ctx.restore(); fxStar(x, y, 4.2 * k, al);
      sfHits.push({ st, x, y, r: 34 * k });
    }
    if (!alive) { const found = ((S.lore || {}).sec || {}).star; sfall = null; sfNext = now + (found ? 180 + Math.random() * 240 : 60 + Math.random() * 60) * 1000; }
  }
  sfBursts = sfBursts.filter((b) => now - b.t < 900);
  for (const b of sfBursts) { const u = (now - b.t) / 900; for (let m = 0; m < 8; m++) { const an = m * Math.PI / 4 + b.r; fxStar(b.x + Math.cos(an) * u * 26 * k, b.y + Math.sin(an) * u * 26 * k, 2.4 * k * (1 - u), 1 - u); } }
  window.__sfPos = sfHits.length ? { x: sfHits[0].x, y: sfHits[0].y } : null;
}
function drawDewFx() {   // secret «Роса»: dawn dew in the graduates' garden, bright over the morning tint
  if (WORLD !== 1 || !SLOTS.GARDEN || !LORE.dew()) { window.__dewHit = null; return; }
  const g = SLOTS.GARDEN, T = performance.now() / 1000, pts = DEW_AT.map(([dx, dy]) => { const m = P(g.x0 + dx, g.y0 + dy); return [m.x, m.y - 4]; });
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  pts.forEach(([x, y], k) => { ctx.globalAlpha = 0.35 + 0.15 * Math.sin(T * 1.3 + k * 1.3); ctx.drawImage(glowSprite('200,240,255'), x - 22, y - 26, 44, 34); });   // a soft morning shine on the wet grass
  ctx.restore();
  const im = DEW_IMG, ok = im.complete && im.naturalWidth, W = 34, H = ok ? W * im.naturalHeight / im.naturalWidth : 28;
  pts.forEach(([x, y], k) => {
    if (ok) { ctx.save(); ctx.translate(x, y + 4); ctx.rotate(Math.sin(T * 0.8 + k * 1.7) * 0.04); if (k % 2) ctx.scale(-1, 1); ctx.drawImage(im, -W / 2, -H, W, H); ctx.restore(); }   // the tuft stands on its base, sways a little
    else emoji('💧', x, y, 13);
    const tw = Math.pow(Math.max(0, Math.sin(T * 0.9 + k * 2.1)), 6); if (tw > 0.05) fxStar(x + (k % 2 ? -8 : 8), y - H * 0.55, 6 * tw, tw, '255,255,255');   // now and then a drop catches the light
  });
  window.__dewHit = { pts, t: performance.now() };
}
function tapMoon() {
  stepMoon(); const M = moonSt(), n = M.f;
  if (!n) {
    if (moonNight()) toast(`🌙 Лунный плод созреет через ${mmss(Math.max(1, MOON_EVERY - M.acc))}`);
    else toast('🌙 Лунное древо: плоды созревают только ночью, с 21:30 до 5:30. Загляни ночью!');
    return;
  }
  const v = Math.max(50, Math.round(n * MOON_PAY * (steadyRate() || S.ema || 1)));
  M.f = 0; S.stats.moon = (S.stats.moon || 0) + n;
  { let pearl = 0; for (let k = 0; k < n; k++) if (Math.random() < 0.05) pearl++; if (pearl && stonesAdd(pearl)) setTimeout(() => toast(`🌙 Лунная жемчужина! ${ST_ICON} +${pearl} лунный камень`), 900); }   // the premium currency's rare free source
  bonus(v, MOON_AT.x, MOON_AT.y - 2, '#7f9cff', 70); popup(n > 1 ? `🌙×${n}` : '🌙', MOON_AT.x + 0.4, MOON_AT.y - 3, '#7f9cff', 60);
  hintOnce('moon', '🌙', 'Лунное древо', `Это Лунное древо у ворот. Его плоды созревают только ночью, с 21:30 до 5:30: каждые ${MOON_EVERY / 60} минут по одному, до ${MOON_MAX} сразу. Ночь идёт, даже когда игра закрыта, — загляни утром и собери. Каждый плод стоит ${MOON_PAY / 60} минуты дохода школы.`);
  save();
}
// ======================= «Лунный камень» — the premium currency (Maria 2026-11-24, name approved) =======================
// One balance for both worlds and every device: magicschool.meta.stones = { n, got: { key: time } } (the meta travels with the cloud
// save; every meta write in the game is read-modify-write). Earned for free only with effort; real-money packs are shown as «скоро».
const ST_ICON = '🔮';   // plain text (toasts)
const ST_IMG = (h = 18) => `<img src="assets/ui/moonstone.webp?v=1" alt="" style="height:${h}px;width:auto;vertical-align:-${Math.round(h * 0.2)}px">`;   // the moonstone picture (art/moonstone, SYNTX)
const stMeta = () => { try { return JSON.parse(localStorage.getItem('magicschool.meta') || '{}') || {}; } catch (e) { return {}; } };
const stones = () => { const m = stMeta(); return (m.stones && m.stones.n) || 0; };
function stonesAdd(n, key) {   // key: a one-time source (never paid twice); returns true when paid
  const m = stMeta(), st = (m.stones ||= { n: 0, got: {} }); st.got ||= {};
  if (key && st.got[key]) return false;
  st.n = Math.max(0, (st.n || 0) + n); if (key) st.got[key] = Date.now();
  try { localStorage.setItem('magicschool.meta', JSON.stringify(m)); } catch (e) { return false; }
  dirtyPanel = true; return true;
}
const ST_ACH = [   // big one-time goals, per world (key wN_id; the second world's opening once), amounts in stones
  { id: 'grad1k', t: '1 000 выпускников', n: 5, ok: () => S.stats.graduated >= 1000 },
  { id: 'allbuilt', t: 'Все классы построены', n: 20, ok: () => S.classes.every((c) => c.built) },
  { id: 'master', t: WORLD === 2 ? 'Первый Хранитель' : 'Первый Мастер', n: 20, ok: () => ((S.stats.ranks || [])[5] || 0) > 0 },
  { id: 'grad100k', t: '100 000 выпускников', n: 15, ok: () => S.stats.graduated >= 100000 },
  { id: 'w2', t: 'Открыт второй мир', n: 15, ok: () => (stMeta().unlocked || []).includes(2) },
];
const stKey = (a) => (a.id === 'w2' ? '' : 'w' + WORLD + '_') + a.id;
let stCheckT = 0, lvBack = false;
function stepStones(dt) {   // checks the goals every 5 s (also during the catch-up: a goal reached while away pays on return)
  if (WORLD > 2 || !S) return; stCheckT += dt; if (stCheckT < 5) return; stCheckT = 0;
  for (const a of ST_ACH) if (a.ok() && stonesAdd(a.n, stKey(a)) && !ffwd) toast(`${ST_ICON} +${a.n} лунных камней: ${a.t}!`);
  { const extra = schoolStars() - STAR_STONE_FROM; if (extra > 0 && stonesAdd(extra, 'w' + WORLD + '_starsback') && !ffwd) toast(`⭐ За звёзды сверх ${STAR_STONE_FROM}: ${ST_ICON} +${extra} лунных камней`); }   // once: stars gathered before build 451
  if (!lvBack) {   // build audit 2026-11-24: levels reached before the level stones existed (build 439) were never paid; the same keys as gainXp, so never twice
    lvBack = true; let sum = 0; const L = schoolLevel();
    for (let l = 5; l <= L; l += 5) { const n = 3 + Math.floor(l / 10); if (stonesAdd(n, `w${WORLD}_lv${l}`)) sum += n; }
    if (sum && !ffwd) setTimeout(() => toast(`🌟 За уровни школы до ${L - (L % 5)}: ${ST_ICON} +${sum} лунных камней`), 1500);
  }
}
const GOLD_MIN = 30, GOLD_CAP = 120;   // «Звёздный час»: lessons pay x2 (boostK); minutes per purchase, most that can be stacked
const ST_SHOP = [
  { k: 'mg', icon: '🧪', name: 'Попытка в мини-игре', txt: '+1 попытка с наградой', price: 5, can: () => true, why: () => '',
    buy: () => MG.addCharges(1) },
  { k: 'gold', icon: '🌟', name: 'Звёздный час', get txt() { const left = (S.goldEnd || 0) - Date.now(); return `плата за уроки ×2 на ${GOLD_MIN} минут в этом мире${left > 0 ? ` · идёт ещё ${mmss(left / 1000)}` : ''}`; }, price: 10,   // build audit 2026-11-24: a sink in both worlds (her «тратить некуда»)
    can: () => (S.goldEnd || 0) - Date.now() < (GOLD_CAP - GOLD_MIN) * 60000, why: () => `Звёздный час можно копить до ${GOLD_CAP / 60} часов`,
    buy: () => { const now = Date.now(); S.goldEnd = Math.max(now, S.goldEnd || 0) + GOLD_MIN * 60000; } },
  { k: 'moon', icon: '🌙', name: 'Лунное древо созревает', txt: 'все 3 лунных плода сразу, днём тоже', get price() { return WORLD === 1 ? Math.min(8, 3 * Math.max(1, MOON_MAX - moonSt().f)) : 8; }, can: () => WORLD === 1 && moonSt().f < MOON_MAX, why: () => (WORLD === 1 ? 'плоды уже созрели' : 'Лунное древо растёт в первом мире'),
    buy: () => { moonSt().f = MOON_MAX; } },
];
const FOUNT_COL = {   // magic water of the court fountain: glow, drops, jet, the floating orbs
  aqua: { name: 'Бирюзовая', glow: '140,240,230', drop: '#d6fbff', jet: '#e6fdff', orb: '200,250,255', price: 0 },
  rose: { name: 'Розовая', hue: 330, glow: '255,160,215', drop: '#ffe0f2', jet: '#fff0f8', orb: '255,210,238', price: 30 },
  moon: { name: 'Лунная', hue: 248, glow: '165,165,255', drop: '#e2deff', jet: '#f1efff', orb: '212,206,255', price: 40 },
  rainbow: { name: 'Радужная', rainbow: true, price: 150 },   // replaced the gold (her «как моча выглядит»)
};
const hslRgb = (h, s, l) => { const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))); return [f(0), f(8), f(4)]; };
const hexOf = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
function fountCol() {
  let k = (stMeta().stones || {}).fnt; if (k === 'gold') k = 'rainbow';
  const f = FOUNT_COL[k] || FOUNT_COL.aqua; if (!f.rainbow) return f;
  const hue = ((performance.now() / 1000) * 15) % 360;   // smooth: a full circle in 24 s (the picture cross-fades between cached tints)
  return { name: f.name, price: f.price, rainbow: true, hue, glow: hslRgb(hue, 0.85, 0.72).join(','), drop: hexOf(hslRgb(hue, 0.9, 0.92)), jet: hexOf(hslRgb(hue, 0.9, 0.95)), orb: hslRgb(hue, 0.85, 0.85).join(',') };
}
const fountTintC = new Map();
function fountTint(im, hue) {   // a copy of the fountain picture with its cyan water turned to `hue` (cached per picture and colour)
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; if (!w) return im;
  const key = hue + '|' + (im.src || '') + '|' + w + 'x' + h; let c = fountTintC.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  try {
    const d = x.getImageData(0, 0, w, h), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 10) continue; const r = a[i] / 255, g = a[i + 1] / 255, b = a[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
      if (dl < 0.06 || dl / (mx + 1e-6) < 0.12) continue;
      let H = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; H *= 60; if (H < 0) H += 360;
      if (H < 150 || H > 205) continue;
      const L = (mx + mn) / 2, C = dl, hh = hue / 60, X = C * (1 - Math.abs((hh % 2) - 1)), m0 = L - C / 2;
      const q = hh < 1 ? [C, X, 0] : hh < 2 ? [X, C, 0] : hh < 3 ? [0, C, X] : hh < 4 ? [0, X, C] : hh < 5 ? [X, 0, C] : [C, 0, X];
      a[i] = (q[0] + m0) * 255; a[i + 1] = (q[1] + m0) * 255; a[i + 2] = (q[2] + m0) * 255;
    }
    x.putImageData(d, 0, 0);
  } catch (e) { return im; }
  fountTintC.set(key, c); return c;
}

const ST_SOON = [['👘', 'Наряды для учеников'], ['🪧', 'Табличка школы']];   // alliance goals exist since build 454
const ST_PACKS = [[30, '99 ₽'], [100, '299 ₽'], [350, '899 ₽']];   // real-money packs (her «делай всё»): shown, not sold yet
function stonesPanel() {
  const n = stones(), got = (stMeta().stones || {}).got || {};
  const ach = ST_ACH.map((a) => { const done = !!got[stKey(a)];
    return `<div class="card up"><span class="remoji">${done ? '✅' : '🎯'}</span><div class="grow"><b>${a.t}</b><div class="muted">${done ? 'получено' : 'цель'}</div></div><b>${ST_IMG()} ${a.n}</b></div>`; }).join('');
  const shop = ST_SHOP.map((it) => { const ok = it.can();
    return `<div class="card up"><span class="remoji">${it.icon}</span><div class="grow"><b>${it.name}</b><div class="muted">${ok ? it.txt : it.why()}</div></div><button class="btn small" data-stbuy="${it.k}" ${ok && n >= it.price ? '' : 'disabled'}>${ST_IMG(15)} ${it.price}</button></div>`; }).join('');
  return `<div class="sh-head"><span class="remoji big">${ST_IMG(44)}</span><div><h2>Лунные камни</h2><div class="muted">Редкая волшебная валюта — одна на оба мира</div></div><button class="x" data-close>✕</button></div>
    <div class="card" style="justify-content:center;font-size:22px"><b>${ST_IMG(26)} ${n}</b></div>
    <h3>Как добыть</h3><p class="muted">Лунные камни дают: большие достижения школы в каждом мире (ниже); каждые 5 уровней школы 🌟; каждая звезда школы ⭐ сверх ${STAR_STONE_FROM}; все дела дня 📅 (${DQ_STONES} в день); цели альянса 🤝 (по ${AQ_STONES} за цель каждую неделю); особые задания 🎁; 1–3 место в недельном турнире мини-игр (🥇 15, 🥈 10, 🥉 5). А ещё ночью на Лунном древе иногда вызревает лунная жемчужина 🌙.</p>${ach}
    <h3>Лавка</h3>${shop}
    ${WORLD === 1 ? `<h3>Волшебная вода фонтана</h3><p class="muted">Цвет воды и сияния фонтана во дворе. Купленный цвет остаётся навсегда.</p>${Object.entries(FOUNT_COL).map(([k, f]) => { const ow = (stMeta().stones || {}).own || {}, own = !f.price || ow['fnt_' + k] || (k === 'rainbow' && ow.fnt_gold), cur = fountCol().name === f.name;
      return `<div class="card up"><span class="remoji" style="width:26px;height:26px;border-radius:50%;background:${f.rainbow ? 'conic-gradient(#ff9ad5,#c9a0ff,#8fd3ff,#9ff0c8,#ffe28f,#ff9ad5)' : `rgb(${f.glow})`};display:inline-block"></span><div class="grow"><b>${f.name}</b><div class="muted">${cur ? 'сейчас в фонтане' : own ? 'куплено' : ''}${f.price ? `${cur || own ? ' · ' : ''}цена ${ST_IMG(13)} ${f.price}` : cur ? '' : 'бесплатно'}</div></div>${cur ? '<span class="done">✓</span>' : `<button class="btn small" data-stfnt="${k}" ${own || n >= f.price ? '' : 'disabled'}>${own ? 'Выбрать' : `${ST_IMG(15)} ${f.price}`}</button>`}</div>`; }).join('')}` : ''}
    <h3>Скоро</h3>${ST_SOON.map(([i, t]) => `<div class="card up" style="opacity:.6"><span class="remoji">${i}</span><div class="grow"><b>${t}</b></div><span class="muted">скоро</span></div>`).join('')}
    <h3>Наборы камней</h3><p class="muted">Покупка за деньги появится позже.</p>${ST_PACKS.map(([k, pr]) => `<div class="card up" style="opacity:.6"><span class="remoji">${ST_IMG(30)}</span><div class="grow"><b>${k} лунных камней</b></div><button class="btn small" disabled>${pr} · скоро</button></div>`).join('')}`;
}
function stonesFount(k) {   // buy (once) and choose a fountain water colour
  const f = FOUNT_COL[k]; if (!f) return; const m = stMeta(), st = (m.stones ||= { n: 0, got: {} }); st.own ||= {};
  if (f.price && !st.own['fnt_' + k] && !(k === 'rainbow' && st.own.fnt_gold)) { if ((st.n || 0) < f.price) { toast(`Нужно ${ST_ICON} ${f.price}`); return; } st.n -= f.price; st.own['fnt_' + k] = Date.now(); }
  st.fnt = k; localStorage.setItem('magicschool.meta', JSON.stringify(m)); save(); toast(`⛲ Вода в фонтане: ${f.name.toLowerCase()}`); dirtyPanel = true;
}
function stonesBuy(k) {
  const it = ST_SHOP.find((x) => x.k === k); if (!it) return;
  if (!it.can()) { toast(it.why()); return; } if (stones() < it.price) { toast(`Нужно ${ST_ICON} ${it.price}`); return; }
  const price = it.price; if (!stonesAdd(-price)) { toast('Не получилось сохранить покупку'); return; }   // build audit 2026-11-24: pay first, then give
  it.buy(); save(); toast(`${it.icon} ${it.name}!`); dirtyPanel = true;
}
// ======================= «Уровень школы» (Maria 2026-11-24: «Может быть нужно в игре ввести какие-то уровни? ... в топах соревноваться
// ими ... понимать кто насколько развит, и что он может позволить себе») =======================
// Experience per graduate grows with his rank (novice 1 ... master 30); old saves start from their history (graduates + ranks reached).
// Level n needs LV_K * n^LV_P experience in total (guess: ~level 50 for a nearly finished world 1; tune with the pacing sims).
// Every 5 levels: moonstones. One level per world (each world has its own top).
const XP_RANK = [1, 2, 4, 8, 15, 30], LV_EASY = 10, LV_C0 = 100, LV_G = 1.2;   // curve since build 439: easy start, then +20% per level
function schoolXp() {
  if (S.xp == null) { const r = S.stats.ranks || []; let x = S.stats.graduated || 0; for (let k = 1; k < 6; k++) x += (r[k] || 0) * (XP_RANK[k] - 1); S.xp = x; }
  return S.xp;
}
const lvNeed = (n) => { const e = Math.min(n, LV_EASY); let x = e * (e + 1) - 2; if (n > LV_EASY) x += LV_C0 * (Math.pow(LV_G, n - LV_EASY) - 1) / (LV_G - 1); return Math.round(Math.max(0, x)); };   // total experience for level n
function schoolLevel() { const x = schoolXp(); let n = 1; while (n < 999 && lvNeed(n + 1) <= x) n++; return n; }
function gainXp(a) {
  const before = schoolLevel(); S.xp = schoolXp() + XP_RANK[Math.min(5, a.rk || 0)];
  const now = schoolLevel(); if (now <= before) return;
  S.lvTop = Math.max(S.lvTop || before, now);
  for (let l = before + 1; l <= now; l++) if (l % 5 === 0) { const n = 3 + Math.floor(l / 10); if (stonesAdd(n, `w${WORLD}_lv${l}`) && !ffwd) setTimeout(() => toast(`🌟 Уровень школы ${l}! ${ST_ICON} +${n} лунных камня`), 600); }
  if (!ffwd) { toast(`🌟 Уровень школы ${now}!`); updateHud(); }
}
function levelPanel() {
  const n = schoolLevel(), x = schoolXp(), a = lvNeed(n), b = lvNeed(n + 1), pct = Math.max(0, Math.min(100, Math.round((x - a) / (b - a) * 100)));
  return `<div class="sh-head"><span class="remoji big">🌟</span><div><h2>Уровень школы ${n}</h2><div class="muted">${WORLD === 2 ? 'Мир гномов' : 'Школа магии'}</div></div><button class="x" data-close>✕</button></div>
    <div class="card"><div class="grow"><b>Опыт: ${fmt(x - a)} из ${fmt(b - a)}</b><div style="height:12px;border-radius:6px;background:#efe6ff;margin-top:6px"><div style="height:12px;border-radius:6px;background:#a98bf0;width:${pct}%"></div></div></div></div>
    <p>Школа получает опыт за каждого выпускника. Чем выше его звание, тем больше опыта: новичок — ${XP_RANK[0]}, ${RANKS[3].toLowerCase()} — ${XP_RANK[3]}, ${RANKS[5].toLowerCase()} — ${XP_RANK[5]}.</p>
    <p>Каждые 5 уровней школа получает ${ST_IMG()} лунные камни. Уровень видно в топе школ, а задания подбираются по силам школы.</p>`;
}
function drawTreeGrounded(o, im, p, w, h) {   // false = not a grounded tree (draw as usual)
  const g = WORLD === 1 && TREE_GROUND[o.n], soil = SOIL[(Math.round(o.x * 7 + o.y * 13) & 1)];
  if (!g || !soil.naturalWidth) return false;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, top = p.y + h * 0.05 - h, keep = 1 - g.cut;
  ctx.drawImage(o.flip ? flipped(im) : im, 0, 0, iw, ih * keep, p.x - w / 2, top, w, h * keep);   // the spreading roots are cut off
  const cx = p.x - w / 2 + (o.flip ? 1 - g.x : g.x) * w, cy = top + h * keep, mw = g.mw * w, mh = mw * soil.naturalHeight / soil.naturalWidth * 0.75;
  ctx.save(); ctx.translate(cx, cy); if ((Math.round(o.x * 3 + o.y * 5) & 1)) ctx.scale(-1, 1);
  ctx.drawImage(soil, -mw / 2, -mh * 0.55, mw, mh); ctx.restore();   // the mound's upper half covers the cut trunk: it goes into the ground
  return true;
}
function drawOut(o) {
  let im = part('outdoor', o.n); if (!im) return;
  if (o.g) return drawGarland(o, im);
  const p = P(o.x, o.y), h = (OUT_H[o.n] || 28) * (o.s || 1), w = h * im.naturalWidth / im.naturalHeight;
  { const dh = h * scale * dpr, lv = o.depth > 0.6 ? 1 : o.depth > 0.25 ? 0 : -1, t = lv >= 0 && outTint[o.n];   // nearest smaller copy (big downscales every frame are slow); deep trees use the tinted copies
    if (outLo[o.n] && dh < 230) im = t ? t.lo[lv] : outLo[o.n]; else if (outMid[o.n] && (dh < 430 || t)) im = t ? t.mid[lv] : outMid[o.n]; }
  let im2 = null, mix = 0;
  if (o.n === 'fountain' && fountCol().hue != null) { const F = fountCol();   // the painted water takes the bought colour
    if (F.rainbow) { const st = 15, k = Math.floor(F.hue / st); mix = F.hue / st - k; im2 = fountTint(im, ((k + 1) * st) % 360); im = fountTint(im, (k * st) % 360); }   // rainbow: cross-fade of the two nearest of 24 tints
    else im = fountTint(im, F.hue); }
  if (!drawTreeGrounded(o, im, p, w, h)) ctx.drawImage(o.flip ? flipped(im) : im, p.x - w / 2, p.y + h * 0.05 - h, w, h);
  if (im2 && mix > 0.01) { ctx.save(); ctx.globalAlpha = mix; ctx.drawImage(o.flip ? flipped(im2) : im2, p.x - w / 2, p.y + h * 0.05 - h, w, h); ctx.restore(); }
  if (o.n === 'moontree') drawMoonTree(o, p, w, h);
  if (zoom >= 1.3 || o.n === 'fountain') outFx(o, p, h);   // the fountain's water shows at every zoom (it grows with its upgrades)   // zoomed out the life is too small to see: save the iPhone's work
}
// ======================= day and night (her pick from the location review, 2026-11-23) =======================
// The sky follows the phone's clock: day 8-17:30, golden evening, blue night 22-5, pink dawn. Night = one multiply fill over the
// world; lanterns, lamp columns, paper lanterns and the fountain then glow, fireflies drift over the court lawns.
const DN_KEYS = [   // [hour, sun-side colour, shade-side colour, sun side (-1 west/left, 1 east/right), golden rim]   (her «Закат светом, а не заливкой»: two-sided light)
  [0, [92, 104, 178], [92, 104, 178], 1, 0], [5.2, [92, 104, 178], [92, 104, 178], 1, 0], [6.1, [250, 200, 205], [170, 160, 215], 1, 0.5], [7.2, [255, 238, 222], [232, 224, 242], 1, 0.3], [8.2, [255, 255, 255], [255, 255, 255], 1, 0],
  [17.5, [255, 255, 255], [255, 255, 255], -1, 0], [18.4, [255, 240, 214], [240, 232, 245], -1, 0.3], [19.2, [255, 214, 158], [226, 200, 240], -1, 0.6], [19.9, [255, 176, 156], [186, 166, 230], -1, 0.45],
  [20.6, [190, 168, 232], [146, 146, 216], -1, 0.1], [21.4, [118, 124, 196], [104, 112, 188], -1, 0], [22, [92, 104, 178], [92, 104, 178], -1, 0], [24, [92, 104, 178], [92, 104, 178], -1, 0]];
const DN_LIGHT = { lantern_gold: [0.42, '255,214,120', 1], lantern_blue: [0.42, '150,200,255', 1], gal_lamp: [0.72, '255,214,140', 0.7], cz_lanterns: [0.7, '255,170,190', 0.9], fountain: [0.45, '140,240,230', 1.4], glowmush: [0.5, '170,150,255', 0.7], crystals: [0.5, '200,170,255', 0.7] };
function dayTint() {
  const d = new Date(), h = window.__hour ?? d.getHours() + d.getMinutes() / 60;
  for (let k = 1; k < DN_KEYS.length; k++) if (h <= DN_KEYS[k][0]) { const A = DN_KEYS[k - 1], B = DN_KEYS[k], u = (h - A[0]) / (B[0] - A[0] || 1), mix = (p, q) => p.map((v, i) => Math.round(v + (q[i] - v) * u));
    return { sun: mix(A[1], B[1]), shade: mix(A[2], B[2]), side: B[3], rim: A[4] + (B[4] - A[4]) * u }; }
  const N = DN_KEYS[0]; return { sun: N[1], shade: N[2], side: 1, rim: 0 };
}
const dnMask = document.createElement('canvas');
let dnPoolC = null, dnPoolL = -1;
function dnPool(L) {   // a soft radial pool in the warm evening colour (transparent edge), cached per light level step
  const q = Math.round(L * 20) / 20; if (dnPoolC && dnPoolL === q) return dnPoolC; dnPoolL = q;
  const c = dnPoolC || (dnPoolC = document.createElement('canvas')); c.width = c.height = 64; const x = c.getContext('2d'); x.clearRect(0, 0, 64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32), col = `${255},${Math.round(255 - 60 * q)},${Math.round(255 - 110 * q)}`; g.addColorStop(0, `rgba(${col},0.85)`); g.addColorStop(0.55, `rgba(${col},0.45)`); g.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c;
}   // the night tint with the lit rooms cut out
let litEdges = new Map(), litEdgesOf = null;
function litRooms() {   // screen polygons (device px) of every built room: floor plus its back walls
  if (litEdgesOf !== EDGES) { litEdgesOf = EDGES; litEdges = new Map(); for (const e of EDGES) if (e.side === 'x0' || e.side === 'y0') litEdges.set(`${e.id},${e.x},${e.y},${e.side}`, 1); }
  const k = scale * dpr, ox = scroller.scrollLeft * dpr, oy = scroller.scrollTop * dpr, S2 = (m) => ({ x: m.x * k - ox, y: m.y * k - oy }), out = [];
  for (const [id, s] of Object.entries(SLOTS)) {
    const ci = CLASS_SLOT.indexOf(id);
    if (id === 'GARDEN' || id === 'TRADE' || (ci >= 0 && !S.classes[ci].built) || (id === 'DORM2' && !dorm2Built()) || (id === 'DIR' && !dirBuilt()) || (id === 'TOWER' && !towerOpen()) || (id === 'CANT' && !cantBuilt()) || (id === 'SHOP' && !shopOpen())) continue;
    const a = P(s.x0, s.y1), b = P(s.x0, s.y0), c = P(s.x1, s.y0), d = P(s.x1, s.y1);
    if (!onScreen(b.x, b.y, 600, 600) && !onScreen(d.x, d.y, 600, 600)) continue;
    const eh = (x, y, sd) => (litEdges.has(`${id},${x},${y},${sd}`) ? WALLH : 0), q = [];   // her «Часть дороги подсвечивается как комната»: no light over a doorway
    for (let y = s.y1 - 1; y >= s.y0; y--) { const h = eh(s.x0, y, 'x0'); q.push(up(P(s.x0, y + 1), h), up(P(s.x0, y), h)); }
    for (let x = s.x0; x < s.x1; x++) { const h = eh(x, s.y0, 'y0'); q.push(up(P(x, s.y0), h), up(P(x + 1, s.y0), h)); }
    q.push(c, d, a); const q2 = q.map(S2); q2.s = s; out.push(q2);
    if (WORLD === 1 && ART[id] && arts[id] && arts[id].naturalWidth) q2.extra = []; if (q2.extra) { for (let x = s.x0; x < s.x1; x++) if (!litEdges.has(`${id},${x},${s.y0},y0`)) q2.extra.push([up(P(x, s.y0), WALLH * 0.5), up(P(x + 1, s.y0), WALLH * 0.5), up(P(x + 1, s.y0), WALLH), up(P(x, s.y0), WALLH)].map(S2)); for (let y = s.y0; y < s.y1; y++) if (!litEdges.has(`${id},${s.x0},${y},x0`)) q2.extra.push([up(P(s.x0, y), WALLH * 0.5), up(P(s.x0, y + 1), WALLH * 0.5), up(P(s.x0, y + 1), WALLH), up(P(s.x0, y), WALLH)].map(S2)); }   /* the painted Arrival Hall: the wall over its doorway stays lit at night, only the opening shows the dark court */
  }
  return out;
}
let dnDark = false;
const DN_ALWAYS = new Set(['fountain', 'glowmush', 'crystals']);   // magic lights glow by themselves
function lampOn(o) {   // the light level at which this lamp is lit: nearest to the gate first
  if (o._on !== undefined) return o._on; const g = GATE_TILE, d = Math.hypot(o.x - g.x, o.y - g.y) / Math.hypot(GW, GH);
  return (o._on = 0.08 + 0.42 * Math.min(1, d * 1.6));   // all lit by late dusk (~20:30), so the lamplighter is seen
}
// her pick «4»: moon and stars over the forest at the top of the map (world px, fixed), shown at night
let DN_STARS = null;
let MOON_DISC = null;
function moonDisc() {   // the painted moon, drawn once at 256 px: ivory disc, soft grey-blue maria, craters with lit rims, darker lower-right limb
  if (MOON_DISC) return MOON_DISC;
  const N = 256, R = 122, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d'), C = N / 2;
  c.beginPath(); c.arc(C, C, R, 0, Math.PI * 2); c.clip();
  let g = c.createRadialGradient(C - R * 0.35, C - R * 0.35, R * 0.1, C, C, R); g.addColorStop(0, '#fffdf2'); g.addColorStop(0.55, '#f6eed4'); g.addColorStop(0.9, '#ddd3b8'); g.addColorStop(1, '#c4bba4'); c.fillStyle = g; c.fillRect(0, 0, N, N);
  const blot = (x, y, r, al) => { const q = c.createRadialGradient(C + x * R, C + y * R, 0, C + x * R, C + y * R, r * R); q.addColorStop(0, `rgba(150,150,160,${al})`); q.addColorStop(0.7, `rgba(150,150,160,${al * 0.6})`); q.addColorStop(1, 'rgba(150,150,160,0)'); c.fillStyle = q; c.fillRect(0, 0, N, N); };
  for (const [x, y, r, al] of [[-0.3, -0.25, 0.32, 0.42], [0.12, -0.38, 0.22, 0.36], [0.28, -0.05, 0.26, 0.34], [-0.05, 0.12, 0.2, 0.3], [-0.42, 0.25, 0.18, 0.28], [0.2, 0.35, 0.14, 0.22]]) blot(x, y, r, al);   // the dark «seas»
  for (const [x, y, r] of [[0.15, 0.58, 0.11], [-0.55, -0.05, 0.08], [0.5, 0.3, 0.07], [0.42, -0.5, 0.06]]) {   // craters: a dark bowl with a light rim on the lit (upper-left) side
    const X = C + x * R, Y = C + y * R, rr = r * R; c.fillStyle = 'rgba(140,132,118,0.28)'; c.beginPath(); c.arc(X, Y, rr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,245,0.6)'; c.lineWidth = rr * 0.22; c.beginPath(); c.arc(X + rr * 0.12, Y + rr * 0.12, rr * 0.9, Math.PI * 0.05, Math.PI * 1.0); c.stroke(); }
  g = c.createRadialGradient(C - R * 0.45, C - R * 0.45, R * 0.6, C - R * 0.2, C - R * 0.2, R * 1.45); g.addColorStop(0, 'rgba(40,40,80,0)'); g.addColorStop(1, 'rgba(40,40,80,0.45)'); c.fillStyle = g; c.fillRect(0, 0, N, N);   // shade towards the lower right
  c.restore && c.restore(); c.strokeStyle = 'rgba(255,255,240,0.5)'; c.lineWidth = 3; c.beginPath(); c.arc(C, C, R - 1.5, Math.PI * 0.9, Math.PI * 1.75); c.stroke();   // bright limb on the lit side
  return (MOON_DISC = cv);
}
function drawSky(T, L) {
  if (!DN_STARS || DN_STARS.w !== WW) { DN_STARS = []; DN_STARS.w = WW; let h = 7; const rn = () => ((h = (h * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 90; k++) DN_STARS.push({ x: rn() * WW, y: 20 + Math.pow(rn(), 1.6) * WH * 0.2, r: 0.8 + rn() * 1.8, ph: rn() * 6.3 }); }
  const a = Math.max(0, Math.min(1, (L - 0.3) / 0.4)); if (a <= 0) return;
  for (const st of DN_STARS) { if (st.x < VIEW.x0 - 10 || st.x > VIEW.x1 + 10 || st.y < VIEW.y0 - 10 || st.y > VIEW.y1 + 10) continue; const tw = 0.45 + 0.55 * Math.abs(Math.sin(T * 0.9 + st.ph)); fxStar(st.x, st.y, st.r * 1.6, a * tw, st.ph > 4.5 ? '200,220,255' : '255,250,225'); }
  const o0 = P(0, 0), mr = 34, mx = o0.x + 300, my = o0.y - 360, north = 1;   // the moon hangs at one spot in the sky over the northern forest (world-fixed: it scrolls with the map)
  if (mx + mr * 5 < VIEW.x0 || mx - mr * 5 > VIEW.x1 || my + mr * 5 < VIEW.y0 || my - mr * 5 > VIEW.y1) { window.__moonHit = null; return; }
  window.__moonHit = { x: mx, y: my, r: mr * 1.6, t: performance.now() }; const a0 = a; { const a = a0 * north;
  if (S && S.lore && S.lore.prize) { const sx = mx - mr * 3, sy = my + mr * 0.9, tw = 0.75 + 0.25 * Math.sin(T * 1.7); fxStar(sx, sy, mr * 0.45 * tw, a * north, '255,236,170'); }   // the director's star (final prize)   // only over forest, never over a room
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * a; ctx.drawImage(glowSprite('170,190,255'), mx - mr * 5, my - mr * 5, mr * 10, mr * 10); ctx.globalAlpha = 0.55 * a; ctx.drawImage(glowSprite('255,244,210'), mx - mr * 2, my - mr * 2, mr * 4, mr * 4); ctx.restore();   // a wide cool halo and a warm close glow
  ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(moonDisc(), mx - mr, my - mr, mr * 2, mr * 2);   // solid: the forest must not show through the moon
  const cx = mx + ((T * 3) % (mr * 6)) - mr * 3; ctx.globalAlpha = 0.45 * a * Math.max(0, 1 - Math.abs(cx - mx) / (mr * 3)); ctx.fillStyle = '#3a3566'; ctx.beginPath(); ctx.ellipse(cx, my + mr * 0.35, mr * 1.3, mr * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + mr * 0.5, my + mr * 0.55, mr * 0.9, mr * 0.09, 0, 0, Math.PI * 2); ctx.fill();   // a thin cloud drifts across (a full pass ~70 s)
  ctx.restore(); }
}
function lampGlow(l, T, L) {
  if (l.pot) { const f = 0.8 + 0.2 * Math.sin(T * 7.1 + l.x) * Math.sin(T * 3.3 + l.y), r = l.r * 1.9; ctx.globalAlpha = 0.5 * L * f; ctx.drawImage(glowSprite('255,120,40'), l.x - r, l.y - r * 0.6, r * 2, r * 1.2);   // the embers: small, deep orange, flickering
    const g = l.r * 2.6; ctx.globalAlpha = 0.32 * L * (0.85 + 0.15 * Math.sin(T * 1.6 + l.x)); ctx.drawImage(glowSprite(l.liq), l.x - g, l.ly - g * 0.7, g * 2, g * 1.4); return; }   // the brew glows in its own colour
 const f = 0.85 + 0.15 * Math.sin(T * 5.3 + l.x * 0.7 + l.y), r = Math.min(l.r, 10) * 2.4; ctx.globalAlpha = 0.36 * L * f; ctx.drawImage(glowSprite('255,160,80'), l.x - r, l.y - r, r * 2, r * 2); const c = Math.min(l.r, 10) * 0.9; ctx.globalAlpha = 0.4 * L * f; ctx.drawImage(glowSprite('255,200,120'), l.x - c, l.y - c, c * 2, c * 2); }   // her «Котлы странно ночью светятся» / «Здесь то же самое»: a small warm flame glow, no white core
function drawHallDark() {   // world 2: dark halls (multiply), their lamps glow brighter with every level of «Светильники»
  const k = scale * dpr, ox = scroller.scrollLeft * dpr, oy = scroller.scrollTop * dpr, S2 = (m) => [m.x * k - ox, m.y * k - oy], T = performance.now() / 1000, rooms = [];
  for (let i = 0; i < CLASSES.length; i++) {
    const id = CLASS_SLOT[i], s = SLOTS[id]; if (!s || !isOpen(i)) continue;
    const a = P(s.x0, s.y1), b = P(s.x0, s.y0), c = P(s.x1, s.y0), d = P(s.x1, s.y1); if (!onScreen(b.x, b.y, 600, 600) && !onScreen(d.x, d.y, 600, 600)) continue;
    const tall = (sd) => EDGES.some((e) => e.id === id && e.side === sd && e.tall), hx = tall('x0') ? WALLH : 14, hy = tall('y0') ? WALLH : 14;   // low knee walls: do not darken the corridor above them
    rooms.push({ i, id, s, dk: hallDark(i), q: [up(a, hx), up(b, hx), up(b, hy), up(c, hy), c, d, a].map(S2) });
  }
  if (!rooms.length) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply';
  for (const r of rooms) { if (r.dk <= 0.005) continue; ctx.fillStyle = `rgb(${Math.round(255 - 175 * r.dk)},${Math.round(255 - 160 * r.dk)},${Math.round(255 - 105 * r.dk)})`; ctx.beginPath(); r.q.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const r of rooms) { const l = lightLvl(r.i) / LIGHT_MAX, s = r.s, W = s.x1 - s.x0, D = s.y1 - s.y0, L = 0.25 + 0.75 * l;
    if (l > 0) { const pool = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), pr = Math.max(W, D) * HW * 0.7; ctx.globalAlpha = 0.2 * l; ctx.drawImage(glowSprite('255,190,110'), pool.x - pr, pool.y - pr * 0.6, pr * 2, pr * 1.2); }
    const rc = roomCache[r.id]; for (const lp of (rc && rc.lamps) || []) lampGlow(lp, T, L); }
  ctx.restore();
}
function drawDayNight() {
  const D = dayTint(), t = D.sun.map((v, i) => (v + D.shade[i]) / 2), dark = 1 - (t[0] + t[1] + t[2]) / 765; dnDark = dark > 0.035; if (dark < 0.02) return;
  const L = Math.min(1, dark * 2.2), lit = L >= 0.08 ? litRooms() : [];   // her «в комнатах конечно должен гореть свет тоже»: built rooms keep their light at night
  const W0 = ctx.canvas.width, H0 = ctx.canvas.height, mc = dnMask, mx = mc.getContext('2d'); if (mc.width !== W0 || mc.height !== H0) { mc.width = W0; mc.height = H0; }
  const gr = mx.createLinearGradient(D.side < 0 ? 0 : W0, 0, D.side < 0 ? W0 : 0, H0 * 0.6); gr.addColorStop(0, `rgb(${D.sun.join(',')})`); gr.addColorStop(1, `rgb(${D.shade.join(',')})`);   // the sun side is warm, the far side in a lilac shade
  mx.globalCompositeOperation = 'copy'; mx.fillStyle = gr; mx.fillRect(0, 0, W0, H0);
  if (lit.length) { mx.globalCompositeOperation = 'source-over'; mx.beginPath(); for (const q of lit) { q.forEach((m, k) => (k ? mx.lineTo(m.x, m.y) : mx.moveTo(m.x, m.y))); mx.closePath(); for (const e2 of q.extra || []) { e2.forEach((m, k) => (k ? mx.lineTo(m.x, m.y) : mx.moveTo(m.x, m.y))); mx.closePath(); } }
    const ev = [255, Math.round(255 - 50 * L), Math.round(255 - 95 * L)]; mx.fillStyle = `rgb(${ev[0]},${ev[1]},${ev[2]})`; mx.fill(); }
  if (L >= 0.08) { const k = scale * dpr, ox = scroller.scrollLeft * dpr, oy = scroller.scrollTop * dpr, pool = dnPool(L); mx.globalCompositeOperation = 'lighten';   // her «Свет из дверей выглядит странно»: door light and the students' lantern light lift the darkness (capped), no additive white blobs
    const put = (x, y, rx, ry) => { const m = P(x, y); mx.drawImage(pool, m.x * k - ox - rx * k, m.y * k - oy - ry * k, rx * 2 * k, ry * 2 * k); };
    for (const q of lit) for (const d of [q.s.door, ...(q.s.extra || [])]) { if (d && d[1]) put(d[1][0] + 0.5, d[1][1] + 0.5, HW * 1.6, HH * 1.6); }
    for (const a of agents) { if (a.state === 'fly' || a.state === 'vanish') continue; const rg = regAt(Math.floor(a.x), Math.floor(a.y)); if (rg && rg !== 'hall' && rg !== 'path') continue; put(a.x, a.y, HW * 0.9, HH * 1.3); } }   // her «что-то вечернее, лампы светятся»: rooms get a warm evening lamplight, a little dimmer than the day
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(mc, 0, 0);
  ctx.restore();
  if (D.rim > 0.02) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; const W1 = ctx.canvas.width, H1 = ctx.canvas.height, g2 = ctx.createRadialGradient(D.side < 0 ? 0 : W1, H1 * 0.15, 0, D.side < 0 ? 0 : W1, H1 * 0.15, Math.max(W1, H1) * 0.95);
    g2.addColorStop(0, `rgba(255,170,80,${(0.32 * D.rim).toFixed(3)})`); g2.addColorStop(0.45, `rgba(255,140,90,${(0.12 * D.rim).toFixed(3)})`); g2.addColorStop(1, 'rgba(255,170,120,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, W1, H1); ctx.restore(); }   // the low sun's golden light from its side
  if (L < 0.08) return;   // lights only once it gets dark
  const T = performance.now() / 1000;
  drawSky(T, L);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const q of lit) { const s = q.s, W = s.x1 - s.x0, D = s.y1 - s.y0;   // lamps in the rooms: sconces along both back walls, a soft pool of light on the floor
    const pool = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), pr = Math.max(W, D) * HW * 0.75; ctx.globalAlpha = 0.22 * L; ctx.drawImage(glowSprite('255,190,110'), pool.x - pr, pool.y - pr * 0.6, pr * 2, pr * 1.2);
    const rc = roomCache[Object.keys(SLOTS).find((k) => SLOTS[k] === s)]; for (const l of (rc && rc.lamps) || []) lampGlow(l, T, L); }   // her pick «1»: the lamps painted in the room light up
  for (const l of frameLamps) lampGlow(l, T, L);   // candles, braziers, cauldron fires standing on the floor
  for (const a of agents) { if (a.state === 'fly' || a.state === 'vanish') continue; const rg = regAt(Math.floor(a.x), Math.floor(a.y)); if (rg && rg !== 'hall' && rg !== 'path') continue;   // the little lantern each student carries outside
    const m = P(a.x, a.y); if (!onScreen(m.x, m.y)) continue; const f = 0.85 + 0.15 * Math.sin(T * 4 + a.id), lx = m.x + (a.flip ? -9 : 9), ly = m.y - 12 - (a.z || 0); ctx.globalAlpha = 0.8 * L * f; ctx.drawImage(glowSprite('255,225,150'), lx - 4, ly - 4, 8, 8); }
  for (const o of OUTDOOR) { const d = DN_LIGHT[o.n]; if (!d || o.px === undefined || o.px < VIEW.x0 - 80 || o.px > VIEW.x1 + 80 || o.py < VIEW.y0 - 40 || o.py > VIEW.y1 + 200) continue;
    const lit1 = DN_ALWAYS.has(o.n) ? L : Math.max(0, Math.min(1, (L - lampOn(o)) / 0.08)); if (lit1 <= 0) continue;   // her pick «5»: the lamplighter lights them one by one from the gate inwards (and puts them out in the morning)
    const h = (OUT_H[o.n] || 40) * (o.s || 1), y = o.py + h * 0.05 - h * d[0], r = h * 0.55 * d[2] * (0.92 + 0.08 * Math.sin(T * 2 + o.px)); ctx.globalAlpha = 0.75 * lit1; ctx.drawImage(glowSprite(d[1]), o.px - r, y - r, r * 2, r * 2);
    if (lit1 < 1 && lit1 > 0.2) { ctx.globalAlpha = (1 - lit1) * 0.9; ctx.drawImage(glowSprite('255,250,220'), o.px - 6, y - 6, 12, 12); }   // the spark of lighting
    if (o.n !== 'fountain' && o.n !== 'glowmush' && o.n !== 'crystals') { ctx.globalAlpha = 0.35 * lit1; ctx.drawImage(glowSprite(d[1]), o.px - r * 1.4, o.py - r * 0.5, r * 2.8, r); } }   // a pool of light on the ground
  if (COURT) for (let k = 0; k < 18; k++) { const an = T * (0.15 + (k % 5) * 0.03) + k * 2.4, x = COURT.x0 + 2 + ((k * 7.3) % (COURT.x1 - COURT.x0 - 4)) + Math.cos(an) * 1.5, y = COURT.y0 + 2 + ((k * 5.1) % (COURT.y1 - COURT.y0 - 4)) + Math.sin(an * 1.3) * 1.2, m = P(x, y), tw = 0.5 + 0.5 * Math.sin(T * 3 + k * 1.9);   // fireflies
    ctx.globalAlpha = L * (0.3 + 0.6 * tw); ctx.drawImage(glowSprite('230,255,150'), m.x - 6, m.y - 26 - 6, 12, 12); }
  ctx.restore();
}
function drawGarland(o, im) {   // a garland swag hung between the tops of two columns: the picture's bow corners are pinned to the column tops
  const top = (c) => { const p = P(c.x, c.y), h = OUT_H[c.n] || 84; return { x: p.x, y: p.y + h * 0.05 - h * (c.n === 'gal_urn' ? 0.62 : 0.9) }; };
  let A = top(o.g[0]), B = top(o.g[1]); if (A.x > B.x) [A, B] = [B, A];
  if (garlandLo && Math.hypot(B.x - A.x, B.y - A.y) * scale * dpr < garlandLo.width * 1.2) im = garlandLo;
  const W = im.width || im.naturalWidth, H = im.height || im.naturalHeight, ux = (B.x - A.x) / W, uy = (B.y - A.y) / W, k = 1.3 * Math.hypot(B.x - A.x, B.y - A.y) / W, pin = 0.07 * H;   // a little deeper than the picture: thicker, reads better
  ctx.save(); ctx.transform(ux, uy, 0, k, A.x, A.y - pin * k); ctx.drawImage(im, 0, 0); ctx.restore();
}
// ======================= corridors (roadmap step 2, last part; her «Да, можно коридоры делать. Да покрасивше») =======================
// Herringbone parquet with star inlays on every inner corridor tile (the pink runner stays), free-standing furniture along the
// corridor edges every few tiles (never near a door or a queue), and floating candles drifting over the corridors (code).
// world 2: dark granite slabs and dwarven things (armour, barrels, crates, anvil, weapon rack, brazier, crystal, candles, bench)
const CORR_H = WORLD === 2 ? { ex_abyss: 92, ex_winch: 50, ex_gear: 32, ex_tent: 54, ex_crates: 38, ex_seekers: 60, t_wagon: 50, t_wagon_full: 50, t_goat: 34, t_stall_pots: 50, t_stall_tools: 50, t_crates_tall: 48, t_crane: 56, t_crates: 36, t_scales: 30, pillar: 74, dwarf_statue: 66, runestone: 46, minecart: 46, armor: 56, barrels: 36, crates: 40, anvil: 34, weapon_rack: 46, brazier: 44, crystal_ped: 46, candle_stand: 58, bench: 26 }
  : { monstera: 44, lavender_pot: 32, bench: 32, armor: 54, globe: 40, bookcase: 44, candelabra: 52, noticeboard: 42, portrait: 44, flowerbox: 30, chestbench: 32, rug_round: 20, fernpot: 36, books: 28, scrolls: 28, catbed: 22 };
const CORR_SET = WORLD === 2 ? ['armor', 'barrels', 'brazier', 'crates', 'weapon_rack', 'crystal_ped', 'anvil', 'candle_stand', 'bench']
  : ['monstera', 'bench', 'globe', 'lavender_pot', 'portrait', 'armor', 'bookcase', 'noticeboard', 'candelabra'];
const CORR_DIR = WORLD === 2 ? 'corridor_w2' : 'corridor';
for (const n of ['floor', ...(WORLD === 2 ? ['t_floor'] : []), ...Object.keys(CORR_H)]) { const im = new Image(); im.onload = () => { staticKey = ''; partsVer++; }; im.src = `assets/parts/${CORR_DIR}/${n}.webp?v=${WORLD === 2 ? 2 : 1}`; parts['corridor/' + n] = im; }
let CORR = [], CANDLES = [], corrKey = '';
function layoutCorridor() {
  const key = outKey + '|' + Object.values(SLOTS).map((s) => s.x0 + ',' + s.y0).join(';'); if (key === corrKey) return; corrKey = key;
  if (WORLD === 2) return layoutNaveW2();
  // World 1 (her «подумай как и главное ГДЕ будут стоять украшения»): places chosen from a map of what the camera sees and where
  // students walk or queue (tools/corridor_plan.png): A = the strip in front of a class's knee wall, low things only (anything taller
  // would hide the students); B = the quiet spot of the main corridor before each crossing, one big thing; C = the far edge of the wide
  // front corridor with only grass behind it, a row of tall things; D = the reading court by the library, low things.
  const out = [], put = (n, x, y, flip = false) => { if (COURT_LAYOUT) return; if (regAt(Math.floor(x), Math.floor(y)) === 'hall') out.push({ n, x, y, th: 'corridor', flip }); };   // the courtyard layout gets its own decor (next step)
  const front = SLOTS.REC.y0 - 5, LOW = ['flowerbox', 'chestbench', 'fernpot', 'books', 'scrolls', 'catbed', 'lavender_pot', 'bench', 'rug_round'], LONG = new Set(['flowerbox', 'chestbench', 'bench']);
  let k = 0; const low = () => LOW[k++ % LOW.length];
  const rowA = (y, xs) => xs.forEach((x) => { const n = low(); put(n, x, y + 0.35, LONG.has(n)); });
  for (const s of Object.values(SLOTS)) {   // A: under every class row (left column, right column) and under the exam hall, not in the busy front corridor
    if (s.y1 >= front) continue;
    if (s.x0 === 7 && s.x1 - s.x0 === 6) rowA(s.y1, [7.7, 9.7, 11.5]);
    else if (s.x0 === 18) rowA(s.y1, [18.6, 22.9]);   // the right class's door is at x 20-21
    else if (s === SLOTS.EXAM) { rowA(s.y1, [7.7, 9.7, 11.5]); rowA(s.y1, [18.7, 20.7, 22.7]); }
  }
  const BIG = ['globe', 'armor', 'monstera']; let b = 0;
  for (const s of Object.values(SLOTS)) if (s.x0 === 7 && s.x1 - s.x0 === 6 && s.y1 <= front) put(BIG[b++ % BIG.length], 14.55, s.y1 - 1.45);   // B
  const TALL = ['bookcase', 'portrait', 'candelabra', 'noticeboard', 'monstera', 'globe']; let t = 0;
  for (let x = 24.6; x < BUILDING.x1 - 0.5; x += 2.6) if (!regAt(Math.floor(x), front - 1)) put(TALL[t++ % TALL.length], x, front + 0.38);   // C
  if (SLOTS.LIB) { put('books', SLOTS.LIB.x1 + 0.45, SLOTS.LIB.y0 + 1.3); put('scrolls', SLOTS.LIB.x1 + 0.45, SLOTS.LIB.y0 + 6.4); put('fernpot', SLOTS.LIB.x1 + 0.45, SLOTS.LIB.y0 + 4.0); }   // D
  const inside = (x, y) => regAt(x, y) === 'hall' && x >= BUILDING.x0 && x < BUILDING.x1 && y >= BUILDING.y0 && y < BUILDING.y1;
  CORR = out;
  CANDLES = []; let c = 0;
  for (let x = BUILDING.x0; x < BUILDING.x1; x += 4) for (let y = BUILDING.y0; y < BUILDING.y1; y += 4) if ([[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [-1, -1], [-2, -2], [-2, 0], [0, -2], [-1, -2], [-2, -1]].every(([dx, dy]) => inside(x + dx, y + dy)) && !inCourt(x, y) && !inCourt(x - 2, y - 2)) CANDLES.push({ x: x + 0.5 + hash2(x, y, 141) * 0.6, y: y + 0.5 + hash2(x, y, 142) * 0.6, k: c++ });
}
// World 2: every thing has its planned place (her ruling «Сразу должна понимать где и какие предметы будут стоять для красоты»):
// pillars in two rows along the great hall every 4 tiles (none in front of a door), a brazier beside every other pillar,
// two dwarf-king statues at the door of the oath hall, a rune stone where the great hall meets the gate hall,
// mine carts outside the mine (Штольня); floating candles over the great hall.
function layoutNaveW2() {
  const N = HALLS[0], out = [], doorY = { L: [], R: [] };
  for (const d of DOORS) { const [a] = d.split('|').map((t) => t.split(',').map(Number)); if (a[0] === NAVE_X0) doorY.L.push(a[1]); if (a[0] === NAVE_X1 - 1) doorY.R.push(a[1]); }
  let k = 0;
  for (let y = N.y0 + 2.5; y < N.y1 - 1.5; y += 4) {
    for (const [x, side, bx] of [[NAVE_X0 + 0.22, 'L', NAVE_X0 + 0.95], [NAVE_X1 - 0.22, 'R', NAVE_X1 - 0.95]]) {
      if (doorY[side].some((dy) => Math.abs(dy + 0.5 - y) < 2)) continue;   // keep doors and their queues free
      out.push({ n: 'pillar', x, y, th: 'corridor' });
      if (k++ % 2 === 0) out.push({ n: 'brazier', x: bx, y: y + 0.6, th: 'corridor' });
    }
  }
  out.push({ n: 'dwarf_statue', x: 14.4, y: N.y0 + 0.7, th: 'corridor' }, { n: 'dwarf_statue', x: 18.6, y: N.y0 + 0.7, th: 'corridor', flip: true });
  out.push({ n: 'runestone', x: NAVE_X0 + 0.6, y: N.y1 - 0.8, th: 'corridor' });
  const m = slotOf(2); if (m) for (const [dx, dy] of [[-1.4, 1.5], [-3.2, 2.4], [-5.0, 3.3]]) out.push({ n: 'minecart', x: m.x0 + dx, y: m.y0 + dy, th: 'corridor', flip: true });
  const ex = SLOTS.EXPED; if (ex && expedOpen()) {   // the gates of the deep: two rune pillars at the cave mouth, lanterns, a cart of gear, a rune stone
    for (const [n, dx, dy, fl] of [['ex_abyss', 4.1, 3.0], ['brazier', 3.0, 0.8], ['brazier', 2.4, 5.2], ['ex_tent', 1.1, 1.1], ['ex_gear', 0.9, 5.0], ['ex_winch', 5.7, 1.0, true], ['ex_crates', 5.5, 5.4], ['ex_seekers', 1.9, 3.0]]) out.push({ n, x: ex.x0 + dx, y: ex.y0 + dy, th: 'corridor', flip: !!fl }); }   // her «Делай» (art for the gates): door -> squad -> abyss on one axis
  const t = SLOTS.TRADE; if (t && tradeOpen()) {   // the yard: stalls along the back, crane and crates at the sides, the wagon + goat in front (the caravan)
    for (const [n, dx, dy, fl] of [['t_stall_pots', 1.0, 0.6], ['t_stall_tools', 3.2, 0.6], ['t_crane', 5.3, 0.9, true], ['t_crates_tall', 0.6, 2.4], ['t_scales', 2.2, 2.0], ['t_crates', 5.2, 3.9]]) out.push({ n, x: t.x0 + dx, y: t.y0 + dy, th: 'corridor', flip: !!fl });
    out.push({ n: 'caravan', x: t.x0 + 3.2, y: t.y0 + 3.6, th: 'corridor' });
  }
  CORR = out;
  CANDLES = []; let c = 0;
  for (let y = N.y0 + 4.5; y < N.y1 - 1; y += 4) CANDLES.push({ x: 16.5 + hash2(c, 7, 141) * 0.8 - 0.4, y, k: c++ });
}
function drawCaravan(o) {   // home: wagon (empty or loaded) with the goat; leaving / coming back: they ride along the road out of the cave (12 s)
  const T = trade(), wg = part('corridor', T.load + T.gems > 0 || T.away ? 't_wagon_full' : 't_wagon'), gt = part('corridor', 't_goat'); if (!wg || !gt) return;
  let x = o.x, y = o.y; const out = T.away ? (T.trip || T.away) - T.away : 0, back = T.away;
  if (T.away) { const u = out < 12 ? out / 12 : back < 12 ? back / 12 : 1; if (u >= 1) return; x = o.x - u * 16; y = o.y + u * 2; }   // further than the map: not drawn
  const p = P(x, y), hw = CORR_H.t_wagon, ww = hw * wg.naturalWidth / wg.naturalHeight, hg = CORR_H.t_goat, gw = hg * gt.naturalWidth / gt.naturalHeight, bob = T.away ? Math.abs(Math.sin(performance.now() / 160)) * 1.5 : 0;
  ctx.drawImage(propShadow(), p.x - ww * 0.45, p.y - ww * 0.16, ww * 0.9, ww * 0.32);
  ctx.drawImage(sized(wg, hw * scale * dpr), p.x - ww / 2 + ww * 0.12, p.y - hw * 0.94, ww, hw);
  const g = P(x - 1.1, y + 0.1); ctx.drawImage(flipped(sized(gt, hg * scale * dpr)), g.x - gw / 2, g.y - hg * 0.96 - bob, gw, hg);   // the goat faces left, toward the road out
}
function drawCorr(o) {
  if (o.n === 'caravan') return drawCaravan(o);
  if (o.n === 'ex_seekers' && (!expedOpen() || exped().cur)) return;   // the squad is away in the depths
  const im = part('corridor', o.n); if (!im) return;
  const p = P(o.x, o.y), h = CORR_H[o.n] || 36, w = h * im.naturalWidth / im.naturalHeight;
  if (zoom >= 1.2) { const rx = Math.min(w * 0.4, h * 0.55); ctx.drawImage(propShadow(), p.x - rx, p.y - rx * 0.42, rx * 2, rx * 0.84); }
  const sm = sized(im, h * scale * dpr); ctx.drawImage(o.flip ? flipped(sm) : sm, p.x - w / 2, p.y + h * 0.06 - h, w, h);
  if (o.n === 'candelabra' && zoom >= 1.2) { const T = fxNow() + o.x; for (const dx of [-0.3, 0, 0.3]) { ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(T * Math.PI * 2 / 2.8 + dx * 9); ctx.drawImage(glowSprite('255,210,130'), p.x + dx * w - 8, p.y - h * 0.97 - 8, 16, 16); ctx.restore(); } }
}
function drawCandles() {   // candles floating over the corridors: each bobs slowly (4 s) with a soft flame glow
  if (zoom < 1.2) return;
  const T = fxNow();
  for (const q of CANDLES) {
    const m = P(q.x, q.y); if (m.x < VIEW.x0 - 20 || m.x > VIEW.x1 + 20 || m.y < VIEW.y0 - 20 || m.y > VIEW.y1 + 120) continue;
    const bob = Math.sin((T + q.k * 0.9) * Math.PI * 2 / 4) * 3, x = m.x, y = m.y - 56 + bob;   // above the students' heads, below the walls' tops
    ctx.save(); ctx.globalAlpha = 0.55 + 0.2 * Math.sin(T * 2.3 + q.k); ctx.drawImage(glowSprite('255,205,120'), x - 14, y - 18, 28, 28); ctx.restore();   // warm halo
    ctx.fillStyle = '#fff6e6'; ctx.strokeStyle = '#a88b6c'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.roundRect(x - 2.4, y, 4.8, 11, 1.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f3e2c4'; ctx.beginPath(); ctx.ellipse(x, y, 2.4, 0.9, 0, 0, Math.PI * 2); ctx.fill();   // melted top
    ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.ellipse(x, y - 3.2, 1.7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff8d8'; ctx.beginPath(); ctx.ellipse(x, y - 2.6, 0.8, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
}
let hallWallsWait = false;   // the reception pictures were not loaded yet: redraw the ground once they are
function bakeHallWalls(c, q) {   // tall corridor walls (reception wallpaper) and their decor, drawn once into the ground layer
  const W = EDGES.filter((e) => e.hallWall); hallWallsWait = false; if (!W.length) return; if (!part('REC', 'wall') || !part('REC', 'iso_window')) { hallWallsWait = true; return; }
  W.sort((p, r) => (p.x + p.y) - (r.x + r.y));
  for (const e of W) drawEdge(c, e);
  c._q = q;
  for (const side of ['y0', 'x0']) {   // decor along each straight run of wall
    const lines = {};
    for (const e of W) if (e.side === side) (lines[side === 'y0' ? e.y : e.x] ||= []).push(side === 'y0' ? e.x : e.y);
    let k = 0;
    for (const [L, ts] of Object.entries(lines)) {
      ts.sort((p, r) => p - r); let st = ts[0];
      for (let i = 1; i <= ts.length; i++) if (i === ts.length || ts[i] !== ts[i - 1] + 1) {
        const a = st, b = ts[i - 1] + 1; if (b - a >= 2) { const sl = side === 'y0' ? { x0: a, y0: +L } : { x0: +L, y0: a }; k = fillWall(c, 'REC', sl, side, a + 0.2, b - 0.2, ['window', 'lantern', 'notice', 'lantern', 'window', 'clock', 'shelf'], k); }
        st = ts[i];
      }
    }
  }
  c._q = undefined;
}
function drawStatic() {
  if (hallWallsWait && part('REC', 'wall') && part('REC', 'iso_window')) staticKey = '';
  const k = statKey(); if (k === staticKey || (pinching && stat.width)) return; staticKey = k; staticN++;
  const q = statQ();
  stat.width = Math.round(SW * q); stat.height = Math.round(SH * q);
  const c = sctx; c.setTransform(q, 0, 0, q, -MARGIN * q, -MARGIN * q);
  c.fillStyle = '#a9d98f'; c.fillRect(0, 0, WW, WH);
  { const g = WORLD <= 2 && GRASS_ON && grassPat(c); if (g) { c.fillStyle = g; c.fillRect(0, 0, WW, WH); } else { c.fillStyle = '#9fd184'; for (let i = 0; i < 260; i++) c.fillRect((i * 97) % WW, (i * 211) % WH, 3, 2); } }
  const stone = WORLD <= 2 && isoPat(c, 'path', 3);
  const courtGrass = WORLD === 1 && COURT && isoPat(c, 'grass', 4);
  const honey = WORLD === 1 && COURT && isoPat(c, 'honey', 3);   // the gallery's warm flagstones
  const corrFloor = WORLD <= 2 && (() => { const pt = pat(c, 'corridor', 'floor'); if (!pt) return null; const T = part('corridor', 'floor').naturalWidth / 3, o = P(0, 0); pt.setTransform(new DOMMatrix([HW / T, HH / T, -HW / T, HH / T, o.x, o.y])); return pt; })();
  // halls
  for (let x = 0; x < GW; x++) for (let y = -YOFF; y < GH; y++) {
    const rid = regAt(x, y); if (rid !== 'hall' && rid !== 'path') continue;
    const inside = rid === 'hall' && x >= BUILDING.x0 && x < BUILDING.x1 && y >= BUILDING.y0 && y < BUILDING.y1;
    const carpet = WORLD > 2 && inside && x >= 14 && x <= 16 && y > BUILDING.y0;   // world 1: no pink runner any more, parquet everywhere (her «Зачем розовая полоса плитки по коридору»)
    if (inCourt(x, y) && courtGrass) { const cc = courtC(), r = Math.hypot(x + 0.5 - cc.x, (y + 0.5 - cc.y)); poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]); const G = SLOTS.GARDEN, gp = G && G.y0 > COURT.y0 && x >= G.x0 + 2 && x <= G.x0 + 3 && y < G.y0; c.fillStyle = gp || r < 4.6 || Math.abs(x + 0.5 - cc.x) < 1.2 || Math.abs(y + 0.5 - cc.y) < 1.2 ? stone : courtGrass; c.fill(); continue; }   // the court: grass, a round flagstone plaza and paths in a cross
    if (inside && WORLD === 1 && COURT && stone) { poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]); if (honey) { c.fillStyle = honey; c.fill(); } else { c.fillStyle = stone; c.fill(); c.fillStyle = 'rgba(236,178,112,0.30)'; c.fill(); } continue; }   // paving idea (her «Разное мощение»): the gallery is warm honey stone, the court paths stay lilac   // build 241: the gallery round the court is stone, not the classrooms' parquet (designer review)   // build 241: the gallery round the court is stone, not the classrooms' parquet (designer review)
    if (inside && !carpet && WORLD <= 2 && corrFloor) { poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]); c.fillStyle = corrFloor; c.fill(); continue; }   // parquet with star inlays
    const col = carpet ? (y % 2 ? '#d98f97' : '#dd979f') : inside ? (x % 2 ? '#d7a46e' : '#dcab76') : ((x + y) % 2 ? '#e9dcc4' : '#efe4cf');
    if (!inside && stone) { poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)]); c.fillStyle = stone; c.fill(); continue; }   // outdoor paths: rune flagstones
    poly(c, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], col, inside ? '#c08d58' : '#e3d3b6');
    if (carpet && y % 3 === 0) { const m = P(x + 0.5, y + 0.5); emoji('✦', m.x, m.y, 7, c); }
  }
  if (WORLD === 2 && LAKE) {   // the underground lake: wet dark shore, water with its texture, a wet rim
    c.save(); poly(c, lakeRing(0.9)); c.fillStyle = 'rgba(28,34,48,0.22)'; c.fill(); poly(c, lakeRing(0.45)); c.fillStyle = 'rgba(28,34,48,0.22)'; c.fill(); poly(c, lakeRing(0)); c.fillStyle = '#1c3a55'; c.fill(); c.clip();
    if (LAKE_WATER.naturalWidth) { const pt = c.createPattern(LAKE_WATER, 'repeat'), T = LAKE_WATER.naturalWidth / 3, o = P(0, 0); pt.setTransform(new DOMMatrix([HW / T, HH / T, -HW / T, HH / T, o.x, o.y])); c.globalAlpha = 0.9; c.fillStyle = pt; poly(c, lakeRing(0)); c.fill(); c.globalAlpha = 1; }
    const m0 = P(LAKE.cx, LAKE.cy), g = c.createRadialGradient(m0.x, m0.y, 4, m0.x, m0.y, LAKE.ry * HH * 2.2); g.addColorStop(0, 'rgba(8,20,40,0.45)'); g.addColorStop(0.7, 'rgba(8,20,40,0.15)'); g.addColorStop(1, 'rgba(120,200,230,0.25)'); c.fillStyle = g; poly(c, lakeRing(0)); c.fill();
    c.restore(); c.save(); c.lineWidth = 4; c.strokeStyle = 'rgba(70,78,96,0.95)'; poly(c, lakeRing(0.05)); c.stroke(); c.lineWidth = 1.4; c.strokeStyle = 'rgba(150,215,240,0.55)'; poly(c, lakeRing(-0.12)); c.stroke(); c.restore();
  }
  const mos = WORLD === 1 && COURT && part('outdoor', 'mosaic');
  if (mos) { const cc = courtC(), R = 4.6, Wm = mos.naturalWidth, T = Wm / (2 * R), o = P(cc.x - R, cc.y - R); c.save(); c.transform(HW / T, HH / T, -HW / T, HH / T, o.x, o.y); c.drawImage(mos, 0, 0); c.restore(); }   // the mosaic picture, flat on the ground
  else if (WORLD === 1 && COURT && stone) {   // paving idea: a mosaic plaza round the fountain — cream ring, gold borders, an eight-pointed star of teal and lilac
    const cc = courtC(), ring = (r, n = 48) => { const o = []; for (let k = 0; k < n; k++) { const an = k / n * Math.PI * 2; o.push(P(cc.x + Math.cos(an) * r, cc.y + Math.sin(an) * r)); } return o; };
    c.save(); poly(c, ring(4.55)); c.fillStyle = 'rgba(255,244,222,0.55)'; c.fill();
    for (let k = 0; k < 16; k++) { const a0 = k / 16 * Math.PI * 2, a1 = (k + 0.5) / 16 * Math.PI * 2, a2 = (k + 1) / 16 * Math.PI * 2, r0 = 1.9, r1 = k % 2 ? 3.3 : 4.15;
      poly(c, [P(cc.x + Math.cos(a0) * r0, cc.y + Math.sin(a0) * r0), P(cc.x + Math.cos(a1) * r1, cc.y + Math.sin(a1) * r1), P(cc.x + Math.cos(a2) * r0, cc.y + Math.sin(a2) * r0)]);
      c.fillStyle = k % 2 ? 'rgba(186,150,236,0.55)' : 'rgba(110,200,205,0.55)'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(214,170,70,0.8)'; c.stroke(); }
    c.lineWidth = 2.2; c.strokeStyle = 'rgba(214,170,70,0.9)'; poly(c, ring(4.5)); c.stroke(); c.lineWidth = 1.2; poly(c, ring(4.25)); c.stroke();
    for (let k = 0; k < 24; k++) { const an = k / 24 * Math.PI * 2, m = P(cc.x + Math.cos(an) * 4.38, cc.y + Math.sin(an) * 4.38); c.fillStyle = k % 2 ? 'rgba(110,200,205,0.9)' : 'rgba(186,150,236,0.9)'; c.beginPath(); c.ellipse(m.x, m.y, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill(); }
    c.restore(); }
  if (WORLD === 1 && COURT) {   // hopscotch chalked on the playground lawn (court zones): 1, 2, 3|4, 5, 6|7, 8 along the y axis
    const h = courtZones().hop, cells = [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]];
    c.save(); c.lineWidth = 1.3; c.strokeStyle = 'rgba(255,255,255,0.8)';
    cells.forEach(([dx, dy], k) => { const x = h.x + dx * 0.9 - 0.45, y = h.y + dy * 0.9, w = 0.9;
      poly(c, [P(x, y), P(x + w, y), P(x + w, y + w), P(x, y + w)]); c.stroke(); const m = P(x + w / 2, y + w / 2); c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '700 8px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(k + 1), m.x, m.y); });
    c.restore(); }
  if (WORLD === 1) { const pt = isoPat(c, 'path', 3); if (pt) for (const r of PATHS) if (r.paved) { poly(c, [P(r.x0, r.y0), P(r.x1, r.y0), P(r.x1, r.y1), P(r.x0, r.y1)]); c.fillStyle = pt; c.fill(); } }   /* the flagstone paths to the dorm pavilions */
  if (WORLD <= 2 && OUT_ON) { layoutOutdoor(); entranceDecal = null; drawEntrancePath(c, true); for (const o of OUTDOOR) { const q = P(o.x, o.y), r = (OUT_H[o.n] || 28) * (o.s || 1) * 1.3; o.baked = q.x - r > MARGIN && q.x + r < MARGIN + SW && q.y - r > MARGIN && q.y + r < MARGIN + SH && outShadow(c, o); } }   // ground shadows go into the cached layer
  if (WORLD === 1) bakeHallWalls(c, q);
  // gate
  // the gate is drawn in the depth-sorted list (drawGate)
  // rooms from back to front
  // rooms are drawn per frame, depth-sorted together with the creatures (see render)
}
function roomColors(id) {
  const ci = CLASS_SLOT.indexOf(id);
  if (ci >= 0) return { floor: CLASSES[ci].floor, wall: CLASSES[ci].wall };
  if (id === 'REC') return { floor: '#f3e4cf', wall: '#cdb6f0' };
  if (id === 'DORM' || id === 'DORM2') return { floor: '#efe0d2', wall: '#bcd3f2' };
  if (id === 'LIB') return { floor: '#e9dccb', wall: '#c9a27a' };
  if (id === 'TOWER') return { floor: '#e4dcf3', wall: '#9d84d8' };
  if (id === 'CANT') return { floor: '#f4e6cf', wall: '#f0b98a' };
  return { floor: '#bfe6a6', wall: null };
}
// ---- wall pieces (thick, with a cap) ----
const TALL_H = () => WALLH * 0.95,   // as tall as the walls in the room pictures
     _unused = 0, KNEE_H = () => WALLH * 0.11, TH = 0.22;
const CAP = '#9a7ec6', STONE = '#f4efe9', STONE_D = '#e2d9cf';
function wallColor(id) {
  const ci = CLASS_SLOT.indexOf(id);
  if (ci >= 0) return CLASSES[ci].wall;
  return { REC: '#d9c4f0', DORM: '#bcd3f2', DORM2: '#bcd3f2', LIB: '#d8b48a', TOWER: '#9d84d8', hall: '#e9e1f3' }[id] || '#e9e1f3';
}
function drawEdge(c, e, capOnly = false) {
  if ((e.id === 'REC' || e.id === 'DORM' || e.id === 'DORM2') && WORLD === 1 && arts[e.id] && arts[e.id].naturalWidth && (e.tall || e.side === 'x0' || e.side === 'y0')) return;   /* the painted Arrival Hall has its own walls */
  const { x, y, side } = e, h = e.tall ? TALL_H() : KNEE_H();
  let a, b, a2, b2;                                    // base line (a,b) and the cap's far line (a2,b2)
  if (side === 'x0') { a = P(x, y + 1); b = P(x, y); a2 = P(x - TH, y + 1); b2 = P(x - TH, y); }
  if (side === 'y0') { a = P(x, y); b = P(x + 1, y); a2 = P(x, y - TH); b2 = P(x + 1, y - TH); }
  if (side === 'x1') { a = P(x + 1, y); b = P(x + 1, y + 1); a2 = P(x + 1 + TH, y); b2 = P(x + 1 + TH, y + 1); }
  if (side === 'y1') { a = P(x + 1, y + 1); b = P(x, y + 1); a2 = P(x + 1, y + 1 + TH); b2 = P(x, y + 1 + TH); }
  if (capOnly) { /* the room's picture is the face */ }
  else if (e.tall && (e.wallTheme || themeOf(e.id)) && texWall(c, e.wallTheme || themeOf(e.id), e, a, b, h)) {   // themed room: its wall texture, baseboard
    poly(c, [a, b, up(b, 5), up(a, 5)], e.wallTheme ? '#8a6a8f' : WORLD === 1 && themeOf(e.id) === 'herbs' ? '#6e4a2e' : shade(wallColor(e.id), -55));   // Herbology: dark wooden skirting, not a green strip
  }
  else if (e.tall) {   // inner face painted in the room colour, darker on the left side
    const col = wallColor(e.id);
    poly(c, [a, b, up(b, h), up(a, h)], side === 'x0' ? shade(col, -16) : col);
    poly(c, [a, b, up(b, 5), up(a, 5)], shade(col, -45));
    if (e.deco === 'window') { const m = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); poly(c, [up(m(0.28), h * 0.35), up(m(0.72), h * 0.35), up(m(0.72), h * 0.82), up(m(0.28), h * 0.82)], '#fff7dc', '#a77b4f'); }
    if (e.deco === 'board') poly(c, [up(a, h * 0.32), up(b, h * 0.32), up(b, h * 0.8), up(a, h * 0.8)], '#3f5f4a', '#a77b4f');
  } else {        // front knee wall: we see its outer stone face
    poly(c, [a2, b2, up(b2, h), up(a2, h)], side === 'x1' ? STONE_D : STONE, zoom >= 1.2 ? '#cfc3b8' : null);
  }
  poly(c, [up(a, h), up(b, h), up(b2, h), up(a2, h)], CAP, '#7f64ab');   // the cap shows the thickness
}
function decorateEdges() {   // windows on outer walls and on rooms without a board, boards in classes
  const n = {};
  for (const e of EDGES) {
    if (!e.tall) continue;
    const key = e.id + e.side; n[key] = (n[key] || 0) + 1;
    const ci = CLASS_SLOT.indexOf(e.id), sl = SLOTS[e.id];
    if (ci >= 0 && e.side === 'y0' && sl && e.x >= sl.x0 + 2 && e.x <= sl.x0 + 3) e.deco = 'board';
    else if (n[key] % 3 === 2) e.deco = 'window';
  }
}
// ---- one wall rule for the whole school ----
// tall wall: outer walls and walls with nothing behind them (plaster in the room colour, windows, white cap, baseboard)
function tallWall(c, a, b, color, shadeD = 0, windows = true) {
  const h = WALLH * 0.72, A2 = up(a, h), B2 = up(b, h);
  poly(c, [a, b, B2, A2], shadeD ? shade(color, shadeD) : color, '#00000014');
  poly(c, [a, b, up(b, 6), up(a, 6)], shade(color, -40));                                   // baseboard
  poly(c, [A2, B2, up(b, h + 4), up(a, h + 4)], '#ffffff');                                  // cap
  if (!windows) return;
  const len = Math.hypot(b.x - a.x, b.y - a.y) / (HW * 1.18);                               // tiles along the wall
  const n = Math.max(1, Math.floor(len / 3));
  for (let k = 0; k < n; k++) {
    const t0 = (k + 0.5) / n - 0.09, t1 = (k + 0.5) / n + 0.09, lerp = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const p0 = lerp(t0), p1 = lerp(t1), lo = h * 0.32, hi = h * 0.78;
    poly(c, [up(p0, lo), up(p1, lo), up(p1, hi), up(p0, hi)], '#fff7dc', '#a77b4f');     // window with a warm glow
    const m = lerp((t0 + t1) / 2); c.strokeStyle = '#a77b4f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(up(m, lo).x, up(m, lo).y); c.lineTo(up(m, hi).x, up(m, hi).y); c.stroke();
  }
}
// low partition: a wooden railing towards a hall or a room behind, so the view stays open
function railing(c, a, b) {
  const h = WALLH * 0.2, len = Math.hypot(b.x - a.x, b.y - a.y) / (HW * 1.18), n = Math.max(2, Math.round(len * 1.5));
  for (let k = 0; k <= n; k++) {
    const t = k / n, p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    c.fillStyle = '#c99a68'; c.fillRect(p.x - 1.5, p.y - h, 3, h);
  }
  poly(c, [up(a, h), up(b, h), up(b, h + 4), up(a, h + 4)], '#b98457', '#8a5f3a');
  poly(c, [a, b, up(b, 3), up(a, 3)], '#a57b4f');
}
// ---- themed rooms: textures through pattern transforms, so walls and floors of any length stay continuous ----
const patCache = new WeakMap();
function pat(c, th, n) {
  const im = texPart(th, n); if (!im) return null;
  let m = patCache.get(c); if (!m) patCache.set(c, (m = {}));
  return (m[th + '/' + n + '/' + LAY_VER] ||= c.createPattern(im, 'repeat'));
}
function texFloor(c, th, s) {
  const p = pat(c, th, 'floor'); if (!p) return false;
  const T = texPart(th, 'floor').naturalWidth / THEMES[th].floorTiles, o = P(0, 0);   // texture px per tile; world origin keeps pieces aligned
  p.setTransform(new DOMMatrix([HW / T, HH / T, -HW / T, HH / T, o.x, o.y]));
  poly(c, [P(s.x0, s.y1), P(s.x0, s.y0), P(s.x1, s.y0), P(s.x1, s.y1)]); c.fillStyle = p; c.fill();
  c.strokeStyle = '#00000018'; c.lineWidth = 1; c.stroke();
  return true;
}
const wallPx = (th) => { const im = texPart(th, 'wall'); return im ? (im.naturalWidth / THEMES[th].wallTiles) * (TALL_H() / im.naturalHeight) : 25; };   // wall-plane px per tile
function texWall(c, th, e, a, b, h) {
  const p = pat(c, th, 'wall'); if (!p) return false;
  const im = texPart(th, 'wall'), T = im.naturalWidth / THEMES[th].wallTiles;
  const alongY = e.side === 'x0' || e.side === 'x1';
  const bz = THEMES[th].bays && SLOTS[e.id], o = alongY ? up(P(e.x + (e.side === 'x1' ? 1 : 0), bz ? bz.y0 : 0), h) : up(P(bz ? bz.x0 : 0, e.y + (e.side === 'y1' ? 1 : 0)), h);   // an arcade starts with a pilaster in the room's corner
  p.setTransform(new DOMMatrix([(alongY ? -HW : HW) / T, HH / T, 0, h / im.naturalHeight, o.x, o.y]));
  poly(c, [a, b, up(b, h), up(a, h)]); c.fillStyle = p; c.fill();
  if (e.side === 'x0') poly(c, [a, b, up(b, h), up(a, h)], 'rgba(70,45,95,0.12)');   // the left wall is in shade
  { const g2 = c.createLinearGradient(0, Math.min(a.y, b.y) - h, 0, Math.max(a.y, b.y)); g2.addColorStop(0, 'rgba(255,250,235,0.16)'); g2.addColorStop(0.55, 'rgba(255,250,235,0)'); g2.addColorStop(1, 'rgba(60,40,80,0.10)');
    poly(c, [a, b, up(b, h), up(a, h)], g2); }
  { const sl = SLOTS[e.id]; if (sl) {   // the inner back corner gets a soft shadow on both walls
    const along = alongY ? e.y - sl.y0 : e.x - sl.x0;
    if (along < 1.5) { const cn = P(sl.x0, sl.y0), far = alongY ? P(sl.x0, sl.y0 + 1.5) : P(sl.x0 + 1.5, sl.y0);
      const g3 = c.createLinearGradient(cn.x, cn.y, far.x, far.y); g3.addColorStop(0, 'rgba(60,40,80,0.22)'); g3.addColorStop(1, 'rgba(60,40,80,0)');
      poly(c, [a, b, up(b, h), up(a, h)], g3); } } }
  // soft shadow where the wall meets the floor
  const g = c.createLinearGradient(0, Math.max(a.y, b.y), 0, Math.max(a.y, b.y) - h * 0.25); g.addColorStop(0, 'rgba(60,40,80,0.18)'); g.addColorStop(1, 'rgba(60,40,80,0)');
  poly(c, [a, b, up(b, h * 0.25), up(a, h * 0.25)], g);
  return true;
}
// a flat sprite hung on a back wall: side 'y0' runs along x (back-right wall), 'x0' along y (back-left wall)
// iso_* sprites are drawn in the room's own angle for the back-left wall (with depth: shelves stick out, windows are set in);
// on the back-right wall they are mirrored. They are placed as they are, not skewed.
const ISO_W = { jar_shelf: 1.2, toy_rack: 1.3, owl_clock: 0.8, flying_books: 1.5, candles: 0.9, portrait: 1.3, certificates: 1.4, notice: 1.0, lantern: 0.6, garland: 2.6, moon_clock: 0.85, bookshelf: 1.5, bookshelf2: 1.4, lamp: 0.6, map: 1.2, banner: 1.1, sconce: 0.7, diploma: 0.9, el_poster: 1.6, torch: 0.75, planter: 1.35, wing_poster: 1.8, birds: 1.5, circle: 1.8, mirror: 0.95, wand_rack: 1.4, chart: 1.9, painting: 0.95, poster: 1.9, round_window: 1.15, cabinet: 1.3, board: 2.6, window: 1.15, window2: 1.15, shelf: 1.8, herbs_rack: 1.6, clock: 1.15 };
DECOR.bigwin = { w: 1.25, lo: 0.3, deep: 0.6 }; ISO_W.bigwin = 1.45;   // windows sit higher, above the planter boxes like in the concept
DECOR.potwin = { w: 1.15, lo: 0.3, deep: 0.6 }; ISO_W.potwin = 1.3;
DECOR.stwin = { w: 1.2, lo: 0.3, deep: 0.6 }; ISO_W.stwin = 1.2;
DECOR.exwin = { w: 1.3, lo: 0.2, deep: 0.6 }; ISO_W.exwin = 1.9; DECOR.exboard = { w: 1.7, lo: 0.36, deep: 0.5 };   // Final exam hall: curtained windows and honour boards
DECOR.chwin = { w: 1.3, lo: 0.22, deep: 0.6 }; ISO_W.chwin = 1.4;   // Charms: arched windows with lilac curtains
DECOR.flwin = { w: 1.1, lo: 0.3, deep: 0.6 }; ISO_W.flwin = 1.0; DECOR.flopen = { w: 1.5, lo: 0.12, deep: 0.6 }; ISO_W.flopen = 1.6; DECOR.elwin = { w: 0.75, lo: 0.2, deep: 0.6 }; ISO_W.elwin = 0.75;   // Flight: brass portholes and one big open arched window (her «суперское открытое окно»)
DECOR.el_med_fire = { w: 1.05, lo: 0.35, deep: 0.5 }; DECOR.el_med_water = DECOR.el_med_earth = DECOR.el_med_air = DECOR.el_med_fire; DECOR.el_win_a = { w: 0.77, lo: 0.3, deep: 0.01 }; DECOR.el_win_b = { w: 0.62, lo: 0.3, deep: 0.01 }; DECOR.el_painting = { w: 0.97, lo: 0.38, deep: 0.8 }; const EL_HUNG = new Map(), EL_BLOOM = {};   // Elements: medallions, windows and the painting sit inside the arches
DECOR.rc_arch = { w: 2.25, lo: 0, deep: 0.4 }; DECOR.rc_win = { w: 0.6, lo: 0.2, deep: 0.5 };   /* Arrival Hall: the arched doorway over the court opening, pointed windows */
DECOR.chportrait = { w: 1.05, lo: 0.3, deep: 0.6 }; const CH_SLOTS = new Map();   // free wall places between the windows: the portrait takes the first one, ribbons the rest   // Stargazing: round porthole windows   // Potions: tall gothic windows with stained glass
const HERBS_WINS = new Map();   // where the big windows were hung (world px), for the night glass drawn every frame
function hangIso(c, th, n, s, side, t0, lo) {
  const im0 = part(th, 'iso_' + n); if (!im0) return false; const im = layHT ? tintIm(im0, layHT) : im0;
  const d = DECOR[n], w = ISO_W[n] || d.w, sw = w * HW, sh = sw * im.naturalHeight / im.naturalWidth, vert = Math.max(sh * 0.35, sh - w * HH);
  const tm = t0 + d.w / 2, base = side === 'y0' ? P(tm, s.y0) : P(s.x0, tm), m = up(base, lo * TALL_H() + vert / 2);
  const k = c === ctx ? scale * dpr : (c._q || 1);
  c.save(); c.translate(m.x, m.y); if (side === 'y0') c.scale(-1, 1);
  c.shadowColor = 'rgba(55,35,80,0.35)'; c.shadowBlur = 3 * k; c.shadowOffsetX = (side === 'y0' ? -1.2 : 1.2) * k; c.shadowOffsetY = 1.8 * k;
  c.drawImage(im, -sw / 2, -sh / 2, sw, sh); c.restore();
  if (n === 'bigwin' || n === 'potwin' || n === 'stwin' || n === 'chwin' || n === 'flwin' || n === 'flopen' || n === 'elwin' || n === 'exwin') HERBS_WINS.set(Math.round(m.x) + ',' + Math.round(m.y), { x: m.x, y: m.y, sw, sh, flip: side === 'y0', side, tm, s0: s.x0 + ',' + s.y0, night: n === 'exwin' ? 'ex_window_night' : n === 'potwin' ? 'pot_window_night' : n === 'stwin' ? 'st_window_night' : n === 'chwin' ? 'ch_window_night' : n === 'flwin' ? 'fl_window_night' : n === 'flopen' ? 'fl_openwin_night' : n === 'elwin' ? 'el_window_night' : 'herbs_window_night', w: DECOR[n].w });
  return true;
}
function hang(c, th, n, s, side, t0, lo) {
  { const o = layHang(th, n, s, side, t0, lo); if (!o) return; t0 = o.t0; lo = o.lo; layHT = o.tint; }   // room editor
  if (THEMES[th].bays && (n.startsWith('el_win') || n === 'el_painting')) EL_HUNG.set(s.x0 + ',' + s.y0 + side + Math.round(t0 * 10), { s0: s.x0 + ',' + s.y0, side, t0, lo, n });   // for the night glass and the lightning
  if (n === 'chportrait') { CH_SLOTS.set(s.x0 + ',' + s.y0 + side + Math.round(t0 * 10), { s0: s.x0 + ',' + s.y0, side, t: t0 + DECOR[n].w / 2 }); return; }   // her «Портрет на окнах тебя не смущает да?»: a reserved place, not over a window
  if (THEMES[th].iso && hangIso(c, th, n, s, side, t0, lo)) return;
  const im0 = part(th, n); if (!im0) return; const im = layHT ? tintIm(im0, layHT) : im0;
  const d = DECOR[n], H = TALL_H(), wpx = wallPx(th), hp = d.w * wpx * im.naturalHeight / im.naturalWidth;
  const at = (t) => (side === 'y0' ? P(t, s.y0) : P(s.x0, t));
  const L = side === 'y0' ? at(t0) : at(t0 + d.w), R = side === 'y0' ? at(t0 + d.w) : at(t0);   // the viewer's left end of the picture
  const top = up(L, lo * H + hp);
  const k = c === ctx ? scale * dpr : (c._q || 1), deep = DECOR[n].deep || 1;   // shadow offsets are in device px
  c.save(); c.transform((R.x - L.x) / im.naturalWidth, (R.y - L.y) / im.naturalWidth, 0, hp / im.naturalHeight, top.x, top.y);
  c.shadowColor = 'rgba(55,35,80,0.42)'; c.shadowBlur = 3 * k * deep; c.shadowOffsetX = (side === 'y0' ? -1.6 : 1.6) * k * deep; c.shadowOffsetY = 2.6 * k * deep;
  c.drawImage(im, 0, 0); c.restore();
}
function wallRun(id, side) {   // the longest stretch of tall wall of a room on one side, in tiles along it
  const ts = EDGES.filter((e) => e.id === id && e.tall && e.side === side).map((e) => (side === 'y0' ? e.x : e.y)).sort((p, q) => p - q);
  let best = null, st = null;
  for (let k = 0; k < ts.length; k++) {
    if (st === null || ts[k] !== ts[k - 1] + 1) st = ts[k];
    if (!best || ts[k] + 1 - st > best[1] - best[0]) best = [st, ts[k] + 1];
  }
  return best;
}
function fillWall(c, th, s, side, a, b, list, k0) {   // hang decor evenly along [a, b), cycling through the list
  const pick = []; let used = 0, k = k0;
  for (let n = 0; n < 12; n++) { const nm = list[k % list.length], w = DECOR[nm].w; if (used + w + (pick.length ? 0.55 : 0) > b - a - 0.3) break; used += w + (pick.length ? 0.55 : 0); pick.push(nm); k++; }
  if (!pick.length) return k;
  const gap = (b - a - pick.reduce((p, nm) => p + DECOR[nm].w, 0)) / (pick.length + 1);
  let t = a + gap;
  for (const nm of pick) { hang(c, th, nm, s, side, t, DECOR[nm].lo); t += DECOR[nm].w + gap; }
  return k;
}
function drawWallDecor(c, id) {
  const th = themeOf(id), s = SLOTS[id]; if (!th) return;
  if (WORLD === 1 && ART[id] && ART[id].band && arts[id] && arts[id].naturalWidth) return;   /* the painted Moon dorms have their own walls */
  const T = THEMES[th];
  let k = 0;
  if (T.arrival && WORLD === 1 && arts.REC && arts.REC.naturalWidth) return;
  if (T.arrival) {   /* Arrival Hall: the doorway frames the 2-tile opening in the back wall, a pointed window on each side of it */
    const d = (s.door || [])[0]; const gx = d ? d[0] : s.x0 + 3;
    hang(c, th, 'rc_arch', s, 'y0', gx - 0.125, 0); hang(c, th, 'rc_win', s, 'y0', gx - 1.45, DECOR.rc_win.lo); hang(c, th, 'rc_win', s, 'y0', gx + 2.85, DECOR.rc_win.lo);
    { const H = TALL_H(); for (let x = gx; x < gx + 2; x++) { const a = P(x, s.y0), b = P(x + 1, s.y0), a2 = P(x, s.y0 - TH), b2 = P(x + 1, s.y0 - TH); poly(c, [up(a, H), up(b, H), up(b2, H), up(a2, H)], '#efe5d3', '#c9b593'); } }   /* the wall's cap runs on over the doorway */
    return;
  }
  if (T.bays) {   // an arcade: one thing per arch, counted from the corner, so it always sits in the middle of its arch
    for (const side of ['y0', 'x0']) { const r = wallRun(id, side); if (!r) continue; const c0 = side === 'y0' ? s.x0 : s.y0, L = T.bays[side];
      for (let a = c0, n = 0; a + T.bays.w <= r[1] + 0.01; a += T.bays.w, n++) { const nm = L[n]; if (nm && DECOR[nm] && a >= r[0] - 0.01) hang(c, th, nm, s, side, a + (T.bays.w - DECOR[nm].w) / 2, DECOR[nm].lo); } }
    return;
  }
  const r = wallRun(id, 'y0');
  if (r) {   // the board in the middle of the back-right wall (the teacher stands under it), decor on both sides
    const mid = (r[0] + r[1]) / 2, bw = DECOR[T.board].w;
    hang(c, th, T.board, s, 'y0', mid - bw / 2, DECOR[T.board].lo);
    k = fillWall(c, th, s, 'y0', r[0], mid - bw / 2 - 0.1, T.decor, k);
    k = fillWall(c, th, s, 'y0', mid + bw / 2 + 0.1, r[1], T.decor, k);
  }
  const l = wallRun(id, 'x0');
  if (l) fillWall(c, th, s, 'x0', l[0], l[1], T.decor, k);
}
// furniture of a themed class: corners at the back, a bookcase by the left wall, small things in the free strip in front
// ---- redesigned rooms: built-in, staged furnishing items (stage 0 = not bought, 1 = lvl 1-9, 2 = 10-24, 3 = 25-39, 4 = 40)
const ITEM_IMS = {};
function itemIm(n) { if (layCur && !layCur.n) layCur.n = n; let im = ITEM_IMS[n]; if (!im) { im = ITEM_IMS[n] = new Image(); im.src = `assets/parts/items/${n}.webp?v=${n === 'pot_hearth' || n === 'fl_hoop' || n === 'fl_basket' || n === 'fl_bell' ? 3 : n === 'ex_bell' ? 4 : 2}`; } return im.complete && im.naturalWidth ? im : null; }
const stageOf = (lv) => (!lv ? 0 : lv < 10 ? 1 : lv < 25 ? 2 : lv < 40 ? 3 : 4);
function itemDraw(n, x, y, h, o = {}) {   // a sprite standing on tile (x, y): bottom-centre on the floor point, lift = px above the floor
  const im = itemIm(n); if (!im) return null; const p = P(x, y), w = h * im.naturalWidth / im.naturalHeight, top = p.y + (o.down || 0) - (o.lift || 0) - h;
  if (o.shadow && zoom >= 1.2) ctx.drawImage(propShadow(), p.x - w * 0.4, p.y - w * 0.12, w * 0.8, w * 0.24);
  ctx.save(); if (o.alpha != null) ctx.globalAlpha = o.alpha; if (o.flip) { ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.translate(-p.x, 0); } ctx.drawImage(im, p.x - w / 2 + (o.dx || 0), top, w, h); ctx.restore();
  return { x: p.x + (o.dx || 0), top, w, h };
}
const daylight = () => { const h = window.__hour ?? (new Date().getHours() + new Date().getMinutes() / 60); return h >= 7 && h < 18.5 ? Math.min(1, (h - 7) / 1.5, (18.5 - h) / 1.5) : 0; };
// ---- room editor layer (Maria 2026-11-24: «приложение редактор ... подвинуть куда я хочу, покрасить стены»): layouts/layouts.json
// changes a class room on top of the code: moves / scales / flips / hides its built-in items (keyed sprite#n in drawing order),
// adds new sprites (anchored to the nearest room corner, so the layout stays inside small, medium and big rooms), moves or hides
// wall decor (side:sprite#n, shift along the wall + height), recolours or swaps the wall and floor textures. Empty = the code's room.
// The editor itself is js/editor.js, loaded only with ?edit (js/edit_guard.js keeps her real save untouched there).
const EDIT = window.__EDIT || null;
let RLAY = { v: 1, rooms: {} }, LAY_VER = 0;
const LAY_ENT = [], LAY_WALLS = {}, LAY_SEEN = {}, LAY_IMS = {}, texCache = new Map();
let layCur = null, layHangN = {};
function setLayout(L) { RLAY = L && L.rooms ? L : { v: 1, rooms: {} }; LAY_VER++; texCache.clear(); }
if (!EDIT) fetch('layouts/layouts.json?v=458').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.rooms && Object.keys(j.rooms).length) setLayout(j); }).catch(() => {});
const layIm = (src) => { let im = LAY_IMS[src]; if (!im) { im = LAY_IMS[src] = new Image(); im.src = `assets/parts/${src}.webp?v=${src === 'reception/rc_umbrellas' ? 'e2' : 'e1'}`; } return im.complete && im.naturalWidth ? im : null; };
function texPart(th, n) {   // the wall / floor texture of a room, recoloured or swapped by the layout
  const base = part(th, n), o = RLAY.rooms[th] && RLAY.rooms[th][n]; if (!o || (!o.tex && !o.col)) return base;
  const key = th + '/' + n + '/' + LAY_VER; if (texCache.has(key)) return texCache.get(key);
  const src = o.tex ? parts[o.tex] : base; if (!src || !src.complete || !src.naturalWidth) return base;
  const cv = document.createElement('canvas'); cv.width = src.naturalWidth; cv.height = src.naturalHeight; const x = cv.getContext('2d'); x.drawImage(src, 0, 0);
  if (o.col) { x.globalCompositeOperation = 'color'; x.globalAlpha = o.amt ?? 0.6; x.fillStyle = o.col; x.fillRect(0, 0, cv.width, cv.height); }
  if (o.bri) { x.globalCompositeOperation = o.bri > 0 ? 'screen' : 'multiply'; x.globalAlpha = Math.min(1, Math.abs(o.bri)); x.fillStyle = o.bri > 0 ? '#ffffff' : '#000000'; x.fillRect(0, 0, cv.width, cv.height); }
  x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(src, 0, 0);
  const k = n === 'wall' ? 'wallTiles' : 'floorTiles', st = o.tex ? THEMES[o.tex.split('/')[0]] : null;   // another room's texture keeps its own size per tile
  cv.naturalWidth = st && st[k] ? src.naturalWidth * THEMES[th][k] / st[k] : src.naturalWidth; cv.naturalHeight = src.naturalHeight;
  texCache.set(key, cv); return cv;
}
function layHang(th, n, s, side, t0, lo) {   // wall decor of a room: the layout may shift it along the wall, raise it or hide it
  const id = s.x0 + ',' + s.y0, cnt = (layHangN[id] ||= {}), k0 = side + ':' + n; cnt[k0] = (cnt[k0] || 0) + 1;
  const key = k0 + '#' + cnt[k0], R = RLAY.rooms[th], o = R && R.walls && R.walls[key], w = (DECOR[n] && DECOR[n].w) || 1;
  if (o) { if (o.hide) { if (EDIT) (LAY_WALLS[th] ||= []).push({ key, n, side, t0, lo, hide: 1 }); return null; } t0 += o.dt || 0; lo += o.dlo || 0;
    t0 = side === 'y0' ? Math.max(s.x0, Math.min(s.x1 - w, t0)) : Math.max(s.y0, Math.min(s.y1 - w, t0)); lo = Math.max(-0.3, Math.min(1.6, lo)); }
  if (EDIT) { const im = (THEMES[th].iso && part(th, 'iso_' + n)) || part(th, n); let bb = null;
    if (im) { const H = TALL_H(), tm = t0 + w / 2, base = side === 'y0' ? P(tm, s.y0) : P(s.x0, tm);
      if (THEMES[th].iso && part(th, 'iso_' + n)) { const sw = (ISO_W[n] || w) * HW, sh = sw * im.naturalHeight / im.naturalWidth, vert = Math.max(sh * 0.35, sh - (ISO_W[n] || w) * HH), m = up(base, lo * H + vert / 2); bb = { x0: m.x - sw / 2, y0: m.y - sh / 2, x1: m.x + sw / 2, y1: m.y + sh / 2 }; }
      else { const hp = w * wallPx(th) * im.naturalHeight / im.naturalWidth, m = up(base, lo * H + hp / 2), sw = w * HW; bb = { x0: m.x - sw / 2, y0: m.y - hp / 2 - sw * 0.31, x1: m.x + sw / 2, y1: m.y + hp / 2 + sw * 0.31 }; } }
    (LAY_WALLS[th] ||= []).push({ key, n, side, t0, lo, bb, ov: o || null }); }
  return { t0, lo, tint: hasTint(o) ? o : null };
}
function layBox(c, a) {   // editor only: the picture a room entry draws, as a world-px box (hit test + selection frame)
  const im = a[0], n = a.length; let x, y, w, h;
  if (n >= 9) { x = a[5]; y = a[6]; w = a[7]; h = a[8]; } else { x = a[1]; y = a[2]; w = n >= 5 ? a[3] : im.naturalWidth || im.width; h = n >= 5 ? a[4] : im.naturalHeight || im.height; }
  const t = c.getTransform(), K = dpr * scale, sx = scroller.scrollLeft * dpr, sy = scroller.scrollTop * dpr, b = layCur.bb;
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const X = (t.a * px + t.c * py + t.e + sx) / K, Y = (t.b * px + t.d * py + t.f + sy) / K;
    if (X < b.x0) b.x0 = X; if (X > b.x1) b.x1 = X; if (Y < b.y0) b.y0 = Y; if (Y > b.y1) b.y1 = Y; }
}
const hasTint = (o) => !!(o && (o.col || o.bri || o.sat || o.con));
const tintCache = new WeakMap();
function tintIm(im, t) {   // a recoloured copy of a picture: saturation + contrast (pixels), colour (hue, like the walls), lighter / darker
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; if (!w || !h) return im;
  const key = [t.col || '', t.amt ?? 0.6, t.bri || 0, t.sat || 0, t.con || 0].join('|'); let m = tintCache.get(im); if (!m) tintCache.set(im, (m = new Map()));
  let cv = m.get(key); if (cv) return cv;
  cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
  if (t.sat || t.con) { try { const d = x.getImageData(0, 0, w, h), p = d.data, S = 1 + (t.sat || 0), K = 1 + (t.con || 0);
    for (let k = 0; k < p.length; k += 4) { if (!p[k + 3]) continue; const r = p[k], g = p[k + 1], b = p[k + 2], L = 0.299 * r + 0.587 * g + 0.114 * b;
      p[k] = (L + (r - L) * S - 128) * K + 128; p[k + 1] = (L + (g - L) * S - 128) * K + 128; p[k + 2] = (L + (b - L) * S - 128) * K + 128; }
    x.putImageData(d, 0, 0); } catch (e) { /* unreadable picture: colour and light only */ } }
  if (t.col) { x.globalCompositeOperation = 'color'; x.globalAlpha = t.amt ?? 0.6; x.fillStyle = t.col; x.fillRect(0, 0, w, h); }
  if (t.bri) { x.globalCompositeOperation = t.bri > 0 ? 'screen' : 'multiply'; x.globalAlpha = Math.min(1, Math.abs(t.bri)); x.fillStyle = t.bri > 0 ? '#ffffff' : '#000000'; x.fillRect(0, 0, w, h); }
  x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(im, 0, 0);
  cv.naturalWidth = w; cv.naturalHeight = h; m.set(key, cv); return cv;
}
let layHT = null;   // the colour of the wall decor piece being hung
{ const di = ctx.drawImage; ctx.drawImage = function (...a) {   // pictures of an edited room entry: recoloured; in the editor also measured
  if (layCur) { if (layCur.tint && a[0] && this.globalCompositeOperation !== 'lighter') a[0] = tintIm(a[0], layCur.tint);
    if (EDIT && this.globalCompositeOperation !== 'lighter' && this.globalAlpha > 0.5 && a[0] && (a[0].naturalWidth || a[0].width) > 24) layBox(this, a); }
  return di.apply(this, a); }; }
function layRun(ent, draw) { const prev = layCur; layCur = ent; ent.bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; try { draw(); } finally { layCur = prev; }
  if (EDIT && ent.kind === 'desk' && !(ent.bb.x1 > ent.bb.x0)) { const m = P(ent.x, ent.y); ent.bb = { x0: m.x - HW * 0.75, x1: m.x + HW * 0.75, y0: m.y - 30, y1: m.y + HH * 0.6 }; }   /* plain desks are drawn as shapes, not pictures */
  if (EDIT && ent.key && ent.bb.x1 > ent.bb.x0) LAY_ENT.push(ent); }
function deskScaled(i, d, p, draw) {   /* a student's place scaled by the room editor around its floor point; its night lights follow */
  const k = (deskOv(i, d) || {}).k || 1; if (k === 1) { draw(); return; } const m = P(p.x, p.y), n0 = frameLamps.length;
  ctx.save(); ctx.translate(m.x, m.y); ctx.scale(k, k); ctx.translate(-m.x, -m.y); try { draw(); } finally { ctx.restore(); }
  for (let q = n0; q < frameLamps.length; q++) { const l = frameLamps[q]; l.x = m.x + (l.x - m.x) * k; l.y = m.y + (l.y - m.y) * k; if (l.ly != null) l.ly = m.y + (l.ly - m.y) * k; l.r *= k; }
}
const deskOv = (i, d) => { const R = RLAY.rooms[CLASSES[i].id]; return (R && R.desks && R.desks[d]) || null; };
function layAdd(i, s, add) {   // wraps the room's add(): each entry is one item; the layout moves / scales / flips / hides it
  const cid = typeof i === 'string' ? i : CLASSES[i].id, R = RLAY.rooms[cid], items = (R && R.items) || {}, seen = (LAY_SEEN[cid] ||= { names: [], xy: [] }), cnt = {};
  let j = -1;
  return (x, y, draw, bias = 0, name) => {
    j++; const jj = j, xy = Math.round(x * 10) + ',' + Math.round(y * 10), known = seen.xy[jj] === xy, nm = name || (known ? seen.names[jj] : null);
    let key = null; if (nm && nm !== '_') { cnt[nm] = (cnt[nm] || 0) + 1; key = nm + '#' + cnt[nm]; }
    const ov = key && items[key];
    const learn = (ent) => { if (!name) { seen.xy[jj] = xy; seen.names[jj] = ent.n && !/_night$/.test(ent.n) ? ent.n : '_'; } };
    if (ov && ov.hide) { if (EDIT) LAY_ENT.push({ cid, kind: 'item', key, n: nm, x, y, ov, hidden: 1, bb: null }); return; }
    if (!ov) { add(x, y, () => { const ent = { cid, kind: 'item', key, n: name || null, x, y, ov: null, tint: (R && R.allTint) || null }; layRun(ent, draw); learn(ent); }, bias); return; }
    const x1 = x + (ov.dx || 0), y1 = y + (ov.dy || 0);
    add(Math.max(s.x0 + 0.05, Math.min(s.x1 - 0.05, x1)), Math.max(s.y0 + 0.05, Math.min(s.y1 - 0.05, y1)), () => { const m0 = P(x, y), m1 = P(x1, y1), k = ov.k || 1, f = ov.flip ? -1 : 1, px = m0.x + (ov.px || 0), py = m0.y + (ov.py || 0), n0 = frameLamps.length, lf = ov.lift || 0;
      ctx.save(); ctx.translate(m1.x - m0.x + px, m1.y - m0.y + py - lf); ctx.scale(k * f, k); if (ov.r) ctx.rotate(ov.r * f * Math.PI / 180); if (ov.sk) ctx.transform(1, ov.sk * f, 0, 1, 0, 0); ctx.translate(-px, -py);
      const ent = { cid, kind: 'item', key, n: name || null, x, y, ov, tint: hasTint(ov) ? ov : (R && R.allTint) || null }; layRun(ent, draw); learn(ent); ctx.restore();
      for (let q = n0; q < frameLamps.length; q++) { const l = frameLamps[q]; l.x = px + (l.x - px) * k * f + m1.x - m0.x; l.y = py + (l.y - py) * k + m1.y - m0.y - lf; if (l.ly != null) l.ly = py + (l.ly - py) * k + m1.y - m0.y - lf; l.r *= k; } }, bias + (ov.z || 0));   // ov.z: the editor's «Вперёд / Назад»
  };
}
function layPos(a, s) {   // an added item's tile from its corner anchor, kept inside the room
  const x = a.ax === 'x1' ? s.x1 - a.x : s.x0 + a.x, y = a.ay === 'y1' ? s.y1 - a.y : s.y0 + a.y;
  return { x, y };   // no limits: she may put things anywhere, even outside the walls
}
function layExtra(i, s, add) {   // sprites added in the editor
  const cid = typeof i === 'string' ? i : CLASSES[i].id, R = RLAY.rooms[cid]; if (!R || !R.add) return;
  R.add.forEach((a, j) => {
    const q = layPos(a, s), wx = a.wall === 'x0' ? s.x0 + 0.1 : q.x, wy = a.wall === 'y0' ? s.y0 + 0.1 : q.y;
    add(Math.max(s.x0 + 0.05, Math.min(s.x1 - 0.05, wx)), Math.max(s.y0 + 0.05, Math.min(s.y1 - 0.05, wy)), () => layRun({ cid, kind: 'add', key: 'add#' + j, j, n: a.src, x: q.x, y: q.y, ov: a, tint: hasTint(a) ? a : R.allTint || null }, () => {
      const im = layIm(a.src); if (!im) return; const h = a.h || 40, w = h * im.naturalWidth / im.naturalHeight;
      if (a.wall) { const b = up(a.wall === 'x0' ? P(s.x0, q.y) : P(q.x, s.y0), a.lift || 0); ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, (a.wall === 'x0' ? -1 : 1) * HH / HW + (a.sk || 0), 0, 1, 0, 0);   /* a.sk: the editor's slant */ if (a.flip) ctx.scale(-1, 1); if (a.rot) ctx.rotate(a.rot * (a.flip ? -1 : 1) * Math.PI / 180); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); return; }
      const p = P(q.x, q.y); if (!a.lift && !a.flat && zoom >= 1.2) ctx.drawImage(propShadow(), p.x - w * 0.4, p.y - w * 0.12, w * 0.8, w * 0.24);
      ctx.save(); if (a.flip) { ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.translate(-p.x, 0); } if (a.rot) { const by = a.flat ? p.y : p.y - (a.lift || 0); ctx.translate(p.x, by); ctx.rotate(a.rot * (a.flip ? -1 : 1) * Math.PI / 180); ctx.translate(-p.x, -by); } if (a.sk) { ctx.translate(p.x, p.y); ctx.transform(1, a.sk, 0, 1, 0, 0); ctx.translate(-p.x, -p.y); } ctx.drawImage(im, p.x - w / 2, a.flat ? p.y - h / 2 : p.y - (a.lift || 0) - h, w, h); /* flat (rugs): centred on the floor point */ ctx.restore();
    }), a.flat ? -1e5 + (a.bias || 0) : a.bias || 0);   // a rug goes under the desks and everyone
  });
}
function editState() {   // the editor's school: every class built, at the chosen size, all items at the chosen stage, full desks
  freshState(); noSave = true;
  S.classes.forEach((c, i) => { c.built = true; c.buildEnd = 0; c.teacher = 10; if (!CLASSES[i].final) c.size = EDIT.size; c.items = c.items.map(() => EDIT.stage); });
  S.classes.forEach((c, i) => { c.desks = maxDesksOf(i); }); S.tourDone = true;   // no intro tour over the room
  S.cant = { built: true, end: 0, cook: 1, tables: 1, menu: 1 }; S.shop = { built: true, end: 0, seller: 1, shelves: 1, goods: 1 }; S.tower = { built: true, end: 0, cap: 0, res: [], wait: [] };   /* every building stands in the editor */
  S.dirBuilt = true; S.dirEnd = 0; S.dormUp.room2 = true; S.dormUp.room2End = 0;
}
const EX_BOW = {};   /* exam hall: when the portrait last bowed to a graduate */
const ROOM_ART = {
  ...(WORLD === 1 ? { final(i, s, st, add) {   /* world 2's final hall has its own theme and keeps the item emoji */
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, now = performance.now(), me = s.x0 + ',' + s.y0, K = [0, 0.75, 0.88, 1, 1.05];
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2)), pass = now - (passAt[i] || -1e9);
    add(s.x0 + 0.05, s.y0 + 0.05, () => { for (const wv of HERBS_WINS.values()) { if (wv.s0 !== me) continue; const im = nt > 0.03 && itemIm(wv.night); if (im) { ctx.save(); ctx.globalAlpha = nt; ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } } });
    /* the portrait of the director as a student on the short wall the students face; the polite boy bows now and then and to every graduate */
    { const t = s.y0 + (s.y1 - s.y0) / 2, cyc = (T + 5) % 17, b = EX_BOW[i] || (EX_BOW[i] = { pa: 0, at: -1e9 }), pa = passAt[i] || 0; if (pa !== b.pa) { if (pa - b.at > 20000) b.at = pa; b.pa = pa; } const bow = cyc > 15.2 || now - b.at < 2200;
      add(s.x0 + 0.1, t, () => { const im = itemIm(bow ? 'ex_portrait1' : 'ex_portrait0'); if (!im) return; const b = up(P(s.x0, t), TALL_H() * 0.6), h = 64, w = h * im.naturalWidth / im.naturalHeight; ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, -HH / HW, 0, 1, 0, 0); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); }); }
    /* the examiners' table in front of the portrait, the seal and the bell of silence on it */
    const tx = s.x0 + 1.25, ty = s.y0 + (s.y1 - s.y0) / 2 + 0.15, TH = 56;
    add(tx, ty, () => { const r = itemDraw('ex_table', tx, ty, TH, { shadow: 1 }); if (!r) return;
      const sb = stageOf(lv('bell')); if (sb) { const p = P(tx - 0.02, ty - 0.5), h = 28 * K[sb], im = itemIm('ex_bell'), cyc = (T + 2) % 11, sw = cyc < 1.6 ? Math.sin(cyc * 9) * (1 - cyc / 1.6) * 0.5 : 0; if (im) { const w = h * im.naturalWidth / im.naturalHeight, by = p.y - TH * 0.62; ctx.drawImage(im, p.x - w / 2, by - h, w, h);
        if (sw) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.abs(sw); ctx.drawImage(glowSprite('230,240,255'), p.x - 9, by - h * 0.62, 18, 14); ctx.restore(); }
        if (cyc < 2.6) { const u = cyc / 2.6; ctx.globalAlpha = Math.min(1, (1 - u) * 2); emoji('🤫', p.x + 6 + u * 4, by - h - 4 - u * 14, 8); ctx.globalAlpha = 1; } } }
      const ss = stageOf(lv('seal')); if (ss) { const p = P(tx + 0.04, ty + 0.3), h = 28 * K[ss], im = itemIm('ex_seal'); if (im) { const w = h * im.naturalWidth / im.naturalHeight, by = p.y - TH * 0.6, gl = 0.35 + 0.2 * Math.sin(T * 1.7) + (pass < 1500 ? 0.5 * (1 - pass / 1500) : 0); ctx.drawImage(im, p.x - w / 2, by - h, w, h);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, gl); ctx.drawImage(glowSprite('200,120,255'), p.x - 16, by - h * 0.55, 32, 18); ctx.restore(); if (dnDark) frameLamps.push({ pot: 1, x: p.x, y: by - h * 0.3, r: 5, liq: '190,120,255', ly: by - h * 0.5 }); } } });
    /* the big hourglass in the front-left corner (canon: the Owl turns it before every question): sand keeps running and a golden shimmer starts each new question every 12 s; the whole-sprite turn looked clumsy (her IMG_9849) */
    const sh = stageOf(lv('hourglass')); if (sh) { const hx = s.x0 + 0.62, hy = s.y1 - 0.62; add(hx, hy, () => { const r = itemDraw('ex_hourglass', hx, hy, 58 * K[sh], { shadow: 1 }); if (!r) return; const cx = r.x, cy = r.top + r.h * 0.3, gh = r.h * 0.5;
      ctx.fillStyle = 'rgba(255,215,110,0.85)'; ctx.fillRect(cx - 0.45, cy - 1, 0.9, gh * 0.16); for (let m = 0; m < 3; m++) { const u = (T * 1.3 + m / 3) % 1; ctx.globalAlpha = 1 - u; ctx.fillRect(cx - 0.6, cy + u * gh * 0.22, 1.2, 1.2); } ctx.globalAlpha = 1;
      const ph = T % 12; if (ph < 1.4) { const u = ph / 1.4; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * Math.sin(u * Math.PI); ctx.drawImage(glowSprite('255,215,120'), cx - r.w * 0.45, cy - gh * 0.45, r.w * 0.9, gh * 0.9); ctx.restore(); fxStar(cx + r.w * 0.18, cy - gh * 0.3 + u * gh * 0.5, 3 * Math.sin(u * Math.PI), Math.sin(u * Math.PI), '255,235,170'); }
      if (sh >= 4) { const tw = Math.pow(Math.max(0, Math.sin(T * 1.3)), 8); if (tw > 0.05) fxStar(cx - r.w * 0.2, cy - gh * 0.2, 3 * tw, tw, '255,230,150'); } }); }
    /* candles of concentration float along the back wall between the bays */
    const sc = stageOf(lv('candles')); if (sc) { const xs = [4.8, 9.6, 2.4, 12, 7.2, 14.4].slice(0, [0, 2, 3, 4, 6][sc]);
      for (const dx of xs) { const cx = s.x0 + dx, cy = s.y0 + 0.3; add(cx, cy, () => { const im = itemIm('ex_candle'); if (!im) return; const p = P(cx, cy), h = 20, w = h * im.naturalWidth / im.naturalHeight, y = p.y - TALL_H() * 0.42 + Math.sin(T * 1.1 + dx) * 2.5 - h; ctx.drawImage(im, p.x - w / 2, y, w, h);
        const f = 0.75 + 0.25 * Math.sin(T * 9 + dx * 3) * Math.sin(T * 3.3 + dx); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (dnDark ? 0.75 : 0.4) * f; ctx.drawImage(glowSprite('255,205,120'), p.x - 9, y - 7, 18, 16); ctx.restore(); if (dnDark) frameLamps.push({ x: p.x, y: y + 2, r: 8 }); }); } }
  } } : {}),
  elements(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, me = s.x0 + ',' + s.y0, tp = teacherPos(i), now = performance.now();
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2));
    const flat = (q, im, fn) => { const d = DECOR[q.n], H = TALL_H(), hp = d.w * wallPx('elements') * im.naturalHeight / im.naturalWidth, at = (t) => (q.side === 'y0' ? P(t, s.y0) : P(s.x0, t));
      const L = q.side === 'y0' ? at(q.t0) : at(q.t0 + d.w), R = q.side === 'y0' ? at(q.t0 + d.w) : at(q.t0), top = up(L, q.lo * H + hp); fn(L, R, top, hp); };   // the same skew hang() used
    const hung = [...EL_HUNG.values()].filter((q) => q.s0 === me);
    add(s.x0 + 0.05, s.y0 + 0.05, () => {
      if (nt > 0.03) for (const q of hung) { const im = q.n.startsWith('el_win') && itemIm(q.n + '_night'); if (im) flat(q, im, (L, R, top, hp) => { ctx.save(); ctx.globalAlpha = nt; ctx.transform((R.x - L.x) / im.naturalWidth, (R.y - L.y) / im.naturalWidth, 0, hp / im.naturalHeight, top.x, top.y); ctx.drawImage(im, 0, 0); ctx.restore(); }); }
      const f = T % 9, pq = hung.find((q) => q.n === 'el_painting'), pim = pq && part('elements', 'el_painting');   // lightning over the storm painting now and then
      if (pim && f < 0.35) flat(pq, pim, (L, R, top, hp) => { const w = Math.abs(R.x - L.x), cx = top.x + (R.x - L.x) / 2, cy = top.y + (R.y - L.y) / 2 + hp / 2; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (f < 0.12 || (f > 0.2 && f < 0.3)) ? 0.55 : 0.15; ctx.drawImage(glowSprite('215,228,255'), cx - w * 0.6, cy - hp * 0.45, w * 1.2, hp * 0.9); ctx.restore(); });
    });
    const stand = { brazier: [s.x0 + 0.75, s.y0 + 0.75], fountain: [s.x0 + 1.75, s.y0 + 0.55], rocks: [s.x0 + 4.2, s.y0 + 0.6], tornado: [s.x0 + 5.75, s.y0 + 0.6] };   // along the back-right wall like in the concept, lower than the window sills and medallions; rocks and dome between the teacher's two stops (x0+3.1 and x0+7.5), where she only walks past
    const K = [0, 0.75, 0.88, 1, 1.05];
    const sb = stageOf(lv('brazier')); if (sb) { const [bx, by] = stand.brazier; add(bx, by, () => { const r = itemDraw('el_brazier', bx, by, 52 * K[sb], { shadow: 1 }); if (!r) return; const f = 0.8 + 0.2 * Math.sin(T * 8) * Math.sin(T * 3.1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * f + (dnDark ? 0.25 : 0); ctx.drawImage(glowSprite('255,150,60'), r.x - 22, r.top - 4, 44, 34); ctx.restore();
      if (sb >= 4) for (let m = 0; m < 3; m++) { const u = (T * 0.7 + m / 3) % 1; fxStar(r.x + Math.sin(u * 7 + m) * 5, r.top - u * 22, 2 * (1 - u), 1 - u, '255,200,110'); } if (dnDark) frameLamps.push({ pot: 1, x: r.x, y: r.top + 8, r: 6, liq: '255,150,70', ly: r.top }); }); }
    const sf = stageOf(lv('fountain')); if (sf) { const [fx, fy] = stand.fountain; add(fx, fy, () => { const r = itemDraw('el_fountain', fx, fy, 40 * K[sf], { shadow: 1 }); if (!r) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let m = 0; m < 2; m++) { const u = (T * 0.6 + m / 2) % 1; ctx.globalAlpha = 0.35 * (1 - u); ctx.strokeStyle = 'rgba(200,240,255,1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(r.x - r.w * 0.1, r.top + r.h * 0.52, 3 + u * 9, 1.2 + u * 2.6, 0, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }); }
    const sr = stageOf(lv('rocks')); if (sr) { const [rx, ry] = stand.rocks; add(rx, ry, () => { itemDraw('el_rocks', rx, ry, 36 * K[sr], { shadow: 1, lift: Math.sin(T * 1.2) * 2.5 }); }); }
    const sw = stageOf(lv('tornado')); if (sw) { const [wx, wy] = stand.tornado; add(wx, wy, () => { const im = itemIm('el_whirl'); if (!im) return; const p = P(wx, wy), h = 38 * K[sw], w = h * im.naturalWidth / im.naturalHeight; if (zoom >= 1.2) ctx.drawImage(propShadow(), p.x - w * 0.4, p.y - w * 0.12, w * 0.8, w * 0.24); ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1 + Math.sin(T * 9) * 0.03, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); }); }
    { const ax = s.x0 + 4.95, cyc = T % 14, hid = cyc > 12 ? Math.sin((cyc - 12) / 2 * Math.PI) : 0;   // her secret fernhorn drawing on the wainscot ledge; now and then it ducks down out of sight
      add(ax, s.y0 + 0.2, () => { const im = itemIm('el_drawing'); if (!im) return; const b = up(P(ax, s.y0 + 0.12), TALL_H() * 0.262), h = 15 * (1 - 0.85 * hid), w = 15 * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, b.x - w / 2, b.y - h, w, h); }); }
    { const fa = (window.__failAt || {})[i] || 0, pa = passAt[i] || 0, b = EL_BLOOM[i] || (EL_BLOOM[i] = { pa: 0, at: -1e9 });   // her mood cloud over her head
      if (pa !== b.pa) { if (pa - b.at > 25000) b.at = pa; b.pa = pa; }
      const rain = now - fa < 2500, bloom = !rain && now - b.at < 1800;
      if (rain || bloom) { const w = teacherWalk(i); add(w.x + 0.3, w.y + 0.3, () => { const p = P(w.x, w.y), y0 = p.y - (STAFF_H[staffOf(CLASSES[i].id)] || 58) * 1.05 - 8 + Math.sin(T * 0.9) * 1.5, x0 = p.x + 4; emoji('☁️', x0, y0, 15);   // follows her, above her head
        if (rain) { ctx.fillStyle = 'rgba(110,160,230,0.95)'; for (let m = 0; m < 5; m++) { const u = (T * 1.6 + m / 5) % 1; ctx.beginPath(); ctx.ellipse(x0 - 6 + m * 3, y0 + 5 + u * 14, 1.1, 2.4, 0, 0, Math.PI * 2); ctx.fill(); } }
        if (bloom) { const u = (now - b.at) / 1800; for (let m = 0; m < 3; m++) { const an = m * 2.1 + u * 2; ctx.globalAlpha = 1 - u; emoji('🌸', x0 + Math.cos(an) * (10 + u * 7), y0 + Math.sin(an) * (6 + u * 4), 7); } ctx.globalAlpha = 1; } }); } }
  },
  elementsOff(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, W = s.x1 - s.x0, depth = s.y1 - s.y0, me = s.x0 + ',' + s.y0, tp = teacherPos(i), now = performance.now();
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2));
    add(s.x0 + 0.05, s.y0 + 0.05, () => { for (const wv of HERBS_WINS.values()) { if (wv.s0 !== me) continue; const im = nt > 0.03 && itemIm(wv.night); if (im) { ctx.save(); ctx.globalAlpha = nt; ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } } });
    const slots = [...CH_SLOTS.values()].filter((q) => q.s0 === me).sort((a, b) => (a.side === b.side ? a.t - b.t : a.side === 'x0' ? -1 : 1));
    const onWall = (sd, t, hgt, draw) => add(sd === 'x0' ? s.x0 + 0.1 : t, sd === 'x0' ? t : s.y0 + 0.1, () => { const b = up(sd === 'x0' ? P(s.x0, t) : P(t, s.y0), hgt); ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, (sd === 'x0' ? -1 : 1) * HH / HW, 0, 1, 0, 0); draw(b); ctx.restore(); });
    // 1) the painting of the storm of her birth, lightning flashes over it now and then
    { const q = slots[0]; if (q) onWall(q.side, q.t, TALL_H() * 0.55, () => { const im = itemIm('el_painting'); if (!im) return; const h = 56, w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -w / 2, -h / 2, w, h); const f = (T % 9); if (f < 0.35) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (f < 0.12 || (f > 0.2 && f < 0.3)) ? 0.7 : 0.2; ctx.drawImage(glowSprite('220,230,255'), -w * 0.4, -h * 0.45, w * 0.8, h * 0.6); ctx.restore(); } }); }
    // fire -> the stone fire bowl in the back corner
    const sb = stageOf(lv('brazier')); if (sb) { const k = [0, 0.75, 0.88, 1, 1.05][sb], bx = s.x0 + 0.7, by = s.y0 + 0.7; add(bx, by, () => { const r = itemDraw('el_brazier', bx, by, 62 * k, { shadow: 1 }); if (!r) return; const f = 0.8 + 0.2 * Math.sin(T * 8) * Math.sin(T * 3.1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 * f + (dnDark ? 0.25 : 0); ctx.drawImage(glowSprite('255,150,60'), r.x - 26, r.top - 4, 52, 40); ctx.restore();
      if (sb >= 4) for (let m = 0; m < 3; m++) { const u = (T * 0.7 + m / 3) % 1; fxStar(r.x + Math.sin(u * 7 + m) * 6, r.top - u * 26, 2.2 * (1 - u), 1 - u, '255,200,110'); } if (dnDark) frameLamps.push({ pot: 1, x: r.x, y: r.top + 8, r: 7, liq: '255,150,70', ly: r.top }); }); }
    // water -> the carved fish fountain by the back wall
    const sf = stageOf(lv('fountain')); if (sf) { const k = [0, 0.75, 0.88, 1, 1.05][sf], fx = s.x1 - 1.2, fy = s.y0 + 0.62; add(fx, fy, () => { const r = itemDraw('el_fountain', fx, fy, 50 * k, { shadow: 1 }); if (!r) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let m = 0; m < 2; m++) { const u = (T * 0.6 + m / 2) % 1; ctx.globalAlpha = 0.35 * (1 - u); ctx.strokeStyle = 'rgba(200,240,255,1)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(r.x - r.w * 0.1, r.top + r.h * 0.52, 4 + u * 12, 1.5 + u * 4, 0, 0, Math.PI * 2); ctx.stroke(); } ctx.restore(); }); }
    // earth -> floating mossy rocks over a plinth, bobbing
    const sr = stageOf(lv('rocks')); if (sr) { const k = [0, 0.75, 0.88, 1, 1.05][sr], q = slots.filter((z) => z.side === 'x0')[1], rx = q ? s.x0 + 0.6 : s.x0 + 0.7, ry = q ? q.t : Math.min(s.y1 - 1.2, s.y0 + 3); add(rx, ry, () => { itemDraw('el_rocks', rx, ry, 58 * k, { shadow: 1, lift: Math.sin(T * 1.2) * 3 }); }); }
    // air -> the whirlwind in a glass dome by the back wall
    const sw = stageOf(lv('tornado')); if (sw) { const k = [0, 0.75, 0.88, 1, 1.05][sw], wx = s.x0 + 2.3, wy = s.y0 + 0.5; add(wx, wy, () => { const im = itemIm('el_whirl'); if (!im) return; const p = P(wx, wy), h = 48 * k, w = h * im.naturalWidth / im.naturalHeight; ctx.save(); ctx.translate(p.x, p.y + h * 0.02); ctx.scale(1 + Math.sin(T * 9) * 0.03, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore(); if (sw >= 4) fxStar(p.x + Math.cos(T * 5) * 6, p.y - h * 0.5 + Math.sin(T * 5) * 3, 2, 0.8, '230,240,255'); }); }
    // 2) the secret drawing of a fernhorn beside her; now and then she hides it
    { const dx0 = Math.max(s.x0 + 2.0, tp.x - 1.7), dy0 = tp.y + 0.35, cyc = T % 14, hid = cyc > 12 ? Math.sin((cyc - 12) / 2 * Math.PI) : 0; add(dx0, dy0, () => { const im = itemIm('el_drawing'); if (!im) return; const p = P(dx0, dy0), h = 20 * (1 - 0.75 * hid), w = 20 * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, p.x - w / 2, p.y - h, w, h); if (hid > 0.5) emoji('❗', p.x + 10, p.y - 28, 9); }); }
    // 4) her mood cloud under the ceiling: rain when a student fails, flowers when one passes
    { const cx = s.x0 + W * 0.62, cy = s.y0 + depth * 0.72, fa = (window.__failAt || {})[i] || 0, pa = (typeof passAt !== 'undefined' && passAt[i]) || 0, rain = now - fa < 2500, bloom = now - pa < 1800 && !rain;
      add(cx + 0.9, cy + 0.9, () => { const p = P(cx, cy), y0 = p.y - 95 + Math.sin(T * 0.8) * 3, x0 = p.x + Math.sin(T * 0.3) * 14; ctx.save(); ctx.fillStyle = rain ? 'rgba(150,160,185,0.92)' : 'rgba(250,252,255,0.92)'; for (const [dx, dy, r] of [[-11, 2, 8], [0, -3, 10], [11, 2, 8], [0, 4, 9]]) { ctx.beginPath(); ctx.arc(x0 + dx, y0 + dy, r, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
        if (rain) { ctx.fillStyle = 'rgba(140,190,240,0.85)'; for (let m = 0; m < 6; m++) { const u = ((T * 1.6 + m / 6) % 1); ctx.beginPath(); ctx.ellipse(x0 - 12 + m * 5, y0 + 10 + u * 30, 1, 2.2, 0, 0, Math.PI * 2); ctx.fill(); } }
        if (bloom) { const u = (now - pa) / 1800; for (let m = 0; m < 4; m++) { const an = m * 1.57 + u * 2; ctx.globalAlpha = 1 - u; emoji('🌸', x0 + Math.cos(an) * (12 + u * 14), y0 + Math.sin(an) * (6 + u * 8), 8); } ctx.globalAlpha = 1; } }); }
  },
  flight(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, W = s.x1 - s.x0, depth = s.y1 - s.y0, me = s.x0 + ',' + s.y0;
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2));
    add(s.x0 + 0.05, s.y0 + 0.05, () => { for (const wv of HERBS_WINS.values()) { if (wv.s0 !== me) continue; const im = nt > 0.03 && itemIm(wv.night); if (im) { ctx.save(); ctx.globalAlpha = nt; ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } } });
    const slots = [...CH_SLOTS.values()].filter((q) => q.s0 === me).sort((a, b) => (a.side === b.side ? a.t - b.t : a.side === 'x0' ? -1 : 1));
    const onWall = (sd, t, hgt, draw) => add(sd === 'x0' ? s.x0 + 0.1 : t, sd === 'x0' ? t : s.y0 + 0.1, () => { const b = up(sd === 'x0' ? P(s.x0, t) : P(t, s.y0), hgt); ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, (sd === 'x0' ? -1 : 1) * HH / HW, 0, 1, 0, 0); draw(b); ctx.restore(); });
    const rafter = TALL_H() * 0.97;   // the rafters' height: ropes and the bell hang from there
    // a wooden propeller on the back wall (decor)
    { const q = slots.find((z) => z.side === 'y0'); if (q) onWall('y0', q.t, TALL_H() * 0.5, () => { const im = itemIm('fl_prop'); if (!im) return; const w = 40, h = w * im.naturalHeight / im.naturalWidth; ctx.rotate(Math.sin(T * 0.4) * 0.06); ctx.drawImage(im, -w / 2, -h / 2, w, h); }); }
    // kites -> paper kites on the walls in the free places, tails flutter
    const sk = stageOf(lv('kites')); if (sk) { const ks = slots.filter((q) => !(q.side === 'y0' && q === slots.find((z) => z.side === 'y0'))).slice(0, [0, 1, 2, 3, 3][sk]);
      ks.forEach((q, m) => onWall(q.side, q.t, TALL_H() * 0.62, () => { const im = itemIm('fl_kite'); if (!im) return; const h = sk >= 4 ? 64 : 56, w = h * im.naturalWidth / im.naturalHeight; ctx.rotate(-0.12 + Math.sin(T * 1.7 + m * 2) * 0.05); ctx.drawImage(im, -w / 2, -h / 2, w, h); })); }
    // hoops -> golden rings on ropes from the rafters over the room, swaying
    const sh = stageOf(lv('hoops')); if (sh) { const spots = [[0.3, 0.42], [0.62, 0.3], [0.45, 0.6], [0.75, 0.55]].slice(0, sh);
      spots.forEach(([fx, fy], m) => { const hx = s.x0 + W * fx, hy = s.y0 + depth * fy; add(hx + 0.6, hy + 0.6, () => { const im = itemIm('fl_hoop'); if (!im) return; const p = P(hx, hy), top = p.y - rafter - 40, len = 64 + m * 10, h = len, w = h * im.naturalWidth / im.naturalHeight, sw = Math.sin(T * 1.1 + m * 1.7) * 0.07;
        ctx.save(); ctx.translate(p.x, top); ctx.rotate(sw); ctx.drawImage(im, -w / 2, 0, w, h); ctx.restore(); }); }); }
    // feathers -> the wicker basket of feather cushions in the back-left corner
    const sf = stageOf(lv('feathers')); if (sf) { const k = [0, 0.7, 0.85, 1, 1.08][sf], fx = s.x0 + 0.75, fy = s.y0 + 0.75; add(fx, fy, () => { const r = itemDraw('fl_basket', fx, fy, 63 * k, { shadow: 1 }); if (!r) return;
      if (sf >= 4) { const u = (T * 0.15) % 1; emoji('🪶', r.x + Math.sin(T * 1.3) * 14, r.top - 20 + u * 40, 9); } }); }   // at 40 a feather floats down
    // windbell -> the brass wind bell hanging from the rafter by the first window, crystals swing and glint
    const sb = stageOf(lv('windbell')); if (sb) { const w0 = [...HERBS_WINS.values()].filter((wv) => wv.s0 === me && wv.side === 'y0').sort((a, b) => b.tm - a.tm)[0], bx = w0 ? w0.tm - 1.05 : s.x1 - 1.5, k = [0, 0.75, 0.88, 1, 1.05][sb];
      add(bx, s.y0 + 0.15, () => { const im = itemIm('fl_bell'); if (!im) return; const b = up(P(bx, s.y0 + 0.15), rafter), h = 62 * k, w = h * im.naturalWidth / im.naturalHeight; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(T * 2.1) * 0.06); ctx.drawImage(im, -w / 2, 0, w, h); ctx.restore(); const tw = Math.pow(Math.max(0, Math.sin(T * 1.6)), 6); if (tw > 0.05) fxStar(b.x + 3, b.y + h * 0.8, 3 * tw, tw, '220,240,255'); }); }
    // now and then a gust of air with leaves blows in through a window
    { const gu = (T % 11) / 11, w1 = [...HERBS_WINS.values()].find((wv) => wv.s0 === me); if (w1 && gu < 0.35) add(s.x1, s.y1, () => { const u = gu / 0.35; for (let m = 0; m < 3; m++) { const v = u - m * 0.08; if (v <= 0 || v >= 1) continue; ctx.globalAlpha = Math.sin(v * Math.PI) * 0.9; emoji(m % 2 ? '🌸' : '🌿', w1.x + (w1.flip ? -1 : 1) * v * 120, w1.y + v * 70 + Math.sin(v * 12 + m) * 8, 8); } ctx.globalAlpha = 1; }); }
  },
  charms(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, W = s.x1 - s.x0, me = s.x0 + ',' + s.y0, tp = teacherPos(i);
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2));
    const wins = (sd) => [...HERBS_WINS.values()].filter((wv) => wv.s0 === me && wv.side === sd).map((wv) => wv.tm).sort((a, b) => a - b);
    const gapsOf = (sd, a, b, min) => { const out = []; let prev = a; for (const t of [...wins(sd), b]) { if (t - prev > min) out.push((prev + t) / 2); prev = t; } return out; };
    const onWall = (sd, t, hgt, draw) => add(sd === 'x0' ? s.x0 + 0.1 : t, sd === 'x0' ? t : s.y0 + 0.1, () => { const b = up(sd === 'x0' ? P(s.x0, t) : P(t, s.y0), hgt); ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, (sd === 'x0' ? -1 : 1) * HH / HW, 0, 1, 0, 0); draw(b); ctx.restore(); });   // a flat picture laid onto a wall plane
    add(s.x0 + 0.05, s.y0 + 0.05, () => { for (const wv of HERBS_WINS.values()) { if (wv.s0 !== me) continue; const im = nt > 0.03 && itemIm(wv.night); if (im) { ctx.save(); ctx.globalAlpha = nt; ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } } });
    // the enchanted royal portrait (canon) on the window wall: winks and blows a heart to Iskra now and then
    const slots = [...CH_SLOTS.values()].filter((q) => q.s0 === me).sort((a, b) => (a.side === b.side ? a.t - b.t : a.side === 'x0' ? -1 : 1)), ps = slots[0] || { side: 'x0', t: s.y0 + 2.4 }; const xsl = slots.filter((q) => q.side === 'x0'), onX = !!xsl[1];   // a long window wall holds the wand cabinet in its second free place; a short one leaves it the back corner
    { const t = ps.t, sd = ps.side, cyc = (T + 3) % 8, wink = cyc > 5, wu = wink ? (cyc - 5) / 3 : 0; onWall(sd, t, TALL_H() * 0.58, () => { const im = itemIm(wink ? 'ch_portrait1' : 'ch_portrait0'); if (!im) return; const bo = wink ? 1 + 0.06 * Math.sin(Math.min(1, wu * 4) * Math.PI) : 1, h = 60 * bo, w = h * im.naturalWidth / im.naturalHeight; ctx.drawImage(im, -w / 2 + (wink ? w * 0.08 : 0), -h / 2, w, h);
        if (wink && wu < 0.5) for (let m = 0; m < 6; m++) { const an = m * 1.05 + wu * 3, rr = 18 + wu * 30; fxStar(Math.cos(an) * rr, Math.sin(an) * rr * 0.9, 3.5 * (1 - wu * 2), 1 - wu * 2, '255,170,220'); } });   // pink sparkles burst round the frame
      if (wink) add(s.x1, s.y1, () => { const a = up(sd === 'x0' ? P(s.x0, t) : P(t, s.y0), TALL_H() * 0.62), b = P(tp.x, tp.y);   // a stream of hearts pops out of the portrait and drifts to Iskra
        for (let m = 0; m < 4; m++) { const u = wu * 1.3 - m * 0.12; if (u <= 0 || u >= 1) continue; const x = a.x + 14 + (b.x - a.x) * u * 0.8 + Math.sin(u * 9 + m) * 6, y = a.y - 8 + (b.y - 50 - a.y) * u * 0.8 - Math.sin(u * Math.PI) * 34; ctx.globalAlpha = Math.min(1, (1 - u) * 2.5, u * 8); emoji(m % 2 ? '💖' : '💗', x, y, 6 + u * 3); } ctx.globalAlpha = 1; }); }
    // wands -> the gilded wand cabinet against the back wall, between the windows
    const sw = stageOf(lv('wands')); if (sw) { const k = [0, 0.75, 0.88, 1, 1.05][sw], cx = onX ? s.x0 + 0.55 : s.x0 + 0.62, cy = onX ? xsl[1].t : s.y0 + 0.62; add(cx, cy, () => { const r = itemDraw('ch_wands', cx, cy, 82 * k, { shadow: 1 }); if (!r) return; const tw = Math.pow(Math.max(0, Math.sin(T * 1.4)), 8); if (tw > 0.05) fxStar(r.x - r.w * 0.05, r.top + r.h * (0.3 + 0.1 * Math.floor(T / 4.5 % 3)), 4 * tw + (sw >= 4 ? 2 : 0), tw, '255,220,250'); }); }
    // mirror -> tall gold mirror on the back wall, a rainbow shimmer sweeps over the glass
    const sm = stageOf(lv('mirror')); if (sm) { const k = [0, 0.75, 0.88, 1, 1.05][sm], mx = s.x1 - 1.0, my = s.y0 + 0.45; add(mx, my, () => { const r = itemDraw('ch_mirror', mx, my, 84 * k, { shadow: 1 }); if (!r) return; const u = (T * 0.25) % 1.6; if (u < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * Math.sin(u * Math.PI); ctx.drawImage(glowSprite('255,230,255'), r.x - r.w * 0.35, r.top + r.h * (0.1 + u * 0.7) - 10, r.w * 0.7, 20); ctx.restore(); } if (sm >= 4) fxStar(r.x + Math.sin(T) * r.w * 0.2, r.top + r.h * 0.4, 3, 0.8, '255,255,255'); }); }
    // crystal -> the crystal ball on its golden stand in the back corner
    const sc = stageOf(lv('crystal')); if (sc) { const k = [0, 0.75, 0.88, 1, 1.05][sc], bx = onX ? s.x0 + 0.62 : s.x1 - 2.35, by = onX ? s.y0 + 0.62 : s.y0 + 0.5; add(bx, by, () => { const r = itemDraw('ch_ball', bx, by, 46 * k, { shadow: 1 }); if (!r) return; const cyb = r.top + r.h * 0.3; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(T * 1.8); ctx.drawImage(glowSprite('230,170,255'), r.x - 22, cyb - 22, 44, 44); ctx.restore();
      for (let m = 0; m < (sc >= 4 ? 5 : 3); m++) { const an = T * 1.1 + m * 2.1; fxStar(r.x + Math.cos(an) * 16, cyb + Math.sin(an) * 6, 2, 0.5 + 0.5 * Math.sin(an * 2), m % 2 ? '255,200,250' : '210,190,255'); } if (dnDark) frameLamps.push({ pot: 1, x: r.x, y: cyb + 10, r: 4, liq: '220,170,255', ly: cyb }); }); }
    // ribbons -> silk ribbon garlands along the walls (1-4), swaying, a bell twinkles
    const sr = stageOf(lv('ribbons')); if (sr) { const spots = [...HERBS_WINS.values()].filter((wv) => wv.s0 === me).sort((a, b) => (a.side === b.side ? a.tm - b.tm : a.side === 'x0' ? -1 : 1)).map((wv) => [wv.side, wv.tm]).slice(0, sr);
      for (const [sd, t] of spots) onWall(sd, t, TALL_H() * 0.93, () => { const im = itemIm('ch_ribbons'); if (!im) return; const w = 62, h = w * im.naturalHeight / im.naturalWidth; ctx.rotate(Math.sin(T * 1.3 + t) * 0.04); ctx.drawImage(im, -w / 2, -h / 2, w, h); const tw = Math.pow(Math.max(0, Math.sin(T * 0.9 + t * 2)), 10); if (tw > 0.05) fxStar(0, h * 0.25, 3 * tw, tw, '255,230,150'); }); }
    // a crystal chandelier over the rug
    { const ox = s.x0 + W * 0.6, oy = s.y0 + (s.y1 - s.y0) * 0.52; add(ox + 0.8, oy + 0.8, () => { const p = P(ox, oy), lift = 72; ctx.strokeStyle = 'rgba(190,150,80,0.9)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(p.x, p.y - lift - 90); ctx.lineTo(p.x, p.y - lift - 24); ctx.stroke(); ctx.save(); ctx.shadowColor = 'rgba(90,40,80,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3; const r = itemDraw('ch_chandelier', ox, oy, 78, { lift }); ctx.restore(); if (!r) return; for (let m = 0; m < 3; m++) { const tw = Math.pow(Math.max(0, Math.sin(T * 1.7 + m * 2.2)), 6); if (tw > 0.05) fxStar(r.x + (m - 1) * r.w * 0.28, r.top + r.h * 0.55, 3 * tw, tw, '255,255,240'); } ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dnDark ? 0.6 : 0.25; ctx.drawImage(glowSprite('255,225,170'), r.x - 44, r.top + r.h * 0.3 - 26, 88, 60); ctx.restore(); if (dnDark) frameLamps.push({ x: r.x, y: r.top + r.h * 0.5, r: 10 }); }); }
  },
  stars(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, W = s.x1 - s.x0, me = s.x0 + ',' + s.y0;
    const free = s.y0 + 2.5 + (Math.ceil(maxDesksOf(i) / 3) - 1) * 1.2 + 1.0, wallEnd = Math.min(s.y1 - 1.0, free), tp = teacherPos(i);
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2));
    add(s.x0 + 0.05, s.y0 + 0.05, () => { for (const wv of HERBS_WINS.values()) { if (wv.s0 !== me) continue; const im = nt > 0.03 && itemIm(wv.night); if (im) { ctx.save(); ctx.globalAlpha = nt; ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } } });   // portholes: starry glass at night
    // the big telescope on its platform (where the teacher's telescope stood) + the duty student
    const stl = stageOf(lv('telescope')), bx = s.x0 + 1.05, by = s.y0 + 0.95;   // the platform fills the back-left corner
    if (stl) { const k = [0, 0.8, 0.9, 1, 1.05][stl]; add(bx, by, () => { const r = itemDraw('st_bigtel', bx, by, 76 * k, { shadow: 1 }); if (r && stl >= 4) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.12 + 0.05 * Math.sin(T); ctx.fillStyle = 'rgba(200,220,255,1)'; ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.28, r.top + r.h * 0.05); ctx.lineTo(r.x + r.w * 0.5, r.top - 60); ctx.lineTo(r.x + r.w * 0.75, r.top - 50); ctx.lineTo(r.x + r.w * 0.34, r.top + r.h * 0.12); ctx.closePath(); ctx.fill(); ctx.restore(); } }); }   // a beam of starlight at 40
      const dut = STAR_DUTY[i], now = performance.now(); if (stl && (!dut || now - dut.t0 > 7000)) { if (!dut || now > dut.next) { const cand = agents.filter((a) => a.c === i && a.state === 'study' && !(a.path && a.path.length) && (a.dur || 0) - (a.t || 0) > 7.3); if (cand.length) { const a = cand[Math.floor(Math.random() * cand.length)]; STAR_DUTY[i] = { id: a.id, t0: now, from: { x: a.x, y: a.y }, to: { x: bx + 0.05, y: by + 0.22 }, look: { x: bx - 0.6, y: by - 0.6 }, next: now + 60000 + Math.random() * 60000 }; } else if (dut) dut.next = now + 20000; } }
    // warm lamps like the concept (desk lamps + a floor lamp); they glow brighter at night
    const lampAt = (x, y, h, stand) => { const p = P(x, y), top = p.y - h; if (stand) { ctx.strokeStyle = '#a8813f'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, top + 6); ctx.stroke(); ctx.fillStyle = '#a8813f'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
      const sw = stand ? 9 : 5, sh = stand ? 8 : 5; ctx.fillStyle = '#f6e3b4'; ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(p.x - sw * 0.55, top); ctx.lineTo(p.x + sw * 0.55, top); ctx.lineTo(p.x + sw, top + sh); ctx.lineTo(p.x - sw, top + sh); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dnDark ? 0.75 : 0.4; ctx.drawImage(glowSprite('255,206,120'), p.x - sw * 3, top - sw * 1.5, sw * 6, sw * 5); ctx.restore(); if (dnDark) frameLamps.push({ x: p.x, y: top + sh, r: stand ? 10 : 6 }); };
    for (let d = 1; d < st.desks; d += 3) { const q = deskPos(i, d); add(q.x + 0.02, q.y + 0.02, () => lampAt(q.x + 0.28, q.y - 0.32, 22, false)); }   // on the desk's back corner
    add(s.x0 + 0.45, s.y0 + 2.55, () => lampAt(s.x0 + 0.45, s.y0 + 2.55, 50, true));   // a floor lamp by the window wall, past the telescope platform
    // the armillary globe in the back-right corner
    const sg = stageOf(lv('globe')); if (sg) { const gx = s.x1 - 0.7, gy = s.y0 + 0.75, k = [0, 0.75, 0.88, 1, 1.05][sg]; add(gx, gy, () => { const r = itemDraw('st_globe', gx, gy, 62 * k, { shadow: 1 }); if (r) { const an = T * 0.9; fxStar(r.x + Math.cos(an) * r.w * 0.3, r.top + r.h * 0.3 + Math.sin(an) * r.h * 0.08, 3, 0.6 + 0.4 * Math.sin(an * 2), '255,226,150'); } }); }
    // the hourglass against the back wall beside the globe (left of it the teacher walks)
    const sh = stageOf(lv('hourglass')); if (sh) { const hx = s.x0 + 0.62, hy = Math.max(s.y0 + 3.4, wallEnd - 0.35), k = [0, 0.75, 0.88, 1, 1.05][sh]; add(hx, hy, () => { const r = itemDraw('st_hourglass', hx, hy, 56 * k, { shadow: 1 }); if (!r) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.08 * Math.sin(T * 1.7); ctx.drawImage(glowSprite('255,214,120'), r.x - 16, r.top + r.h * 0.55 - 12, 32, 28); ctx.restore();
      if (sh >= 4) for (let m = 0; m < 3; m++) { const u = (T * 0.6 + m / 3) % 1; fxStar(r.x, r.top + r.h * (0.45 + u * 0.3), 1.6, 1 - u, '255,236,150'); } }); }   // sand glows; at 40 golden sparks trickle down
    // framed star maps on the window wall, in the gaps between windows
    const sm = stageOf(lv('maps')); if (sm) { const ws = [...HERBS_WINS.values()].filter((wv) => wv.s0 === me && wv.side === 'x0').map((wv) => wv.tm).sort((a, b) => a - b), gaps = []; let prev = s.y0 + 0.3; for (const t of [...ws, wallEnd]) { if (t - prev > 1.9) gaps.push((prev + t) / 2); prev = t; }
      gaps.slice(0, [0, 1, 1, 2, 3][sm]).forEach((t) => add(s.x0 + 0.1, t, () => { const im = itemIm('st_map'); if (!im) return; const b = up(P(s.x0, t), TALL_H() * 0.62), h = 34, w = h * im.naturalWidth / im.naturalHeight; ctx.save(); ctx.translate(b.x, b.y); ctx.transform(1, -HH / HW, 0, 1, 0, 0); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); })); }   // the flat map is sheared onto the wall plane
    // a brass orrery hanging from the ceiling over the rug (decor)
    { const rows = Math.ceil(maxDesksOf(i) / 3), ox = s.x0 + W * 0.55, oy = s.y0 + 2.5 + (rows - 1) * 0.6; add(ox + 0.8, oy + 0.8, () => { const p = P(ox, oy), lift = 128; ctx.strokeStyle = 'rgba(120,90,50,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x, p.y - lift - 50); ctx.lineTo(p.x, p.y - lift - 18); ctx.stroke(); const r = itemDraw('st_orrery', ox, oy, 30 + Math.sin(T) * 0.5, { lift }); if (r) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(glowSprite('255,214,130'), r.x - 12, r.top + r.h * 0.5 - 12, 24, 24); ctx.restore(); if (dnDark) frameLamps.push({ x: r.x, y: r.top + r.h * 0.6, r: 6 }); } }); }
  },
  potions(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000, W = s.x1 - s.x0, depth = s.y1 - s.y0;
    const free = s.y0 + 2.5 + (Math.ceil(maxDesksOf(i) / 3) - 1) * 1.2 + 1.0, wallEnd = Math.min(s.y1 - 1.0, free), me = s.x0 + ',' + s.y0;
    const D = dayTint(), tt = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (tt[0] + tt[1] + tt[2]) / 765) * 2.2)), dl = daylight();
    add(s.x0 + 0.05, s.y0 + 0.05, () => {   // windows: soft light patches on the floor by day, starry glass at night
      for (const wv of HERBS_WINS.values()) { if (wv.s0 !== me) continue; const hw = wv.w / 2, sk = 0.45, Q = (u, v) => (wv.side === 'x0' ? P(s.x0 + v, wv.tm + u + v * sk) : P(wv.tm + u + v * sk, s.y0 + v));
        if (dl > 0) for (const [g0, g1] of [[-hw * 0.8, -0.05], [0.05, hw * 0.8]]) for (let k = 0; k < 3; k++) { const e = 0.07 * (2 - k), a = Q(g0 - e, 0.12 - e), b = Q(g1 + e, 0.12 - e), c = Q(g1 + e, 1.2 + e), d = Q(g0 - e, 1.2 + e); ctx.fillStyle = `rgba(255,232,190,${0.07 * dl})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); }
        const im = nt > 0.03 && itemIm(wv.night); if (im) { ctx.save(); ctx.globalAlpha = nt; ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } } });
    // jars -> a tall rack against the window wall
    const sj = stageOf(lv('jars')); if (sj && wallEnd - (s.y0 + 2.3) > 1.4) { const k = [0, 0.7, 0.85, 1, 1][sj], h = 84 * k, y = s.y0 + 2.4; add(s.x0 + 0.4, y + 1, () => { const im = itemIm('pot_rack'); if (!im) return; const w = h * im.naturalWidth / im.naturalHeight, L = w / HW, c = P(s.x0 + 0.45, y + L); ctx.drawImage(im, c.x - 2, c.y - h * 0.985, w, h);
      if (sj >= 4) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let m = 0; m < 4; m++) { const tw = Math.pow(Math.max(0, Math.sin(T * 1.3 + m * 1.7)), 4); ctx.globalAlpha = 0.5 * tw; ctx.drawImage(glowSprite(['190,120,255', '120,255,170', '255,170,90', '255,120,200'][m]), c.x + w * (0.25 + m * 0.15) - 7, c.y - h * (0.45 + (m % 2) * 0.2) - 7, 14, 14); } ctx.restore(); } }); }   // at 40 the jars glow one by one
    // cauldrons -> the hearth with the big copper cauldron on the back wall
    const sh = stageOf(lv('cauldron')); if (sh) { const k = [0, 0.8, 0.9, 1, 1.05][sh], h = 128 * k, hx = s.x1 - 1.3, hy = s.y0 + 0.7; add(hx, hy, () => { const r = itemDraw('pot_hearth', hx, hy, h, { shadow: 1 }); if (!r) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.1 * Math.sin(T * 6) * Math.sin(T * 2.3); ctx.drawImage(glowSprite('255,140,60'), r.x - 22, r.top + h * 0.78 - 16, 44, 30); ctx.restore();   // the fire flickers
      ctx.fillStyle = 'rgba(150,240,170,0.5)'; for (let m = 0; m < 2 + sh; m++) { const u = (T * 0.35 + m / (2 + sh)) % 1; ctx.globalAlpha = 0.6 * (1 - u); ctx.beginPath(); ctx.arc(r.x - 6 + Math.sin(T + m * 2) * 5, r.top + h * 0.58 - u * 34, 2.5 + u * 4, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;   // green steam rises from the brew
      if (dnDark) frameLamps.push({ pot: 1, x: r.x, y: r.top + h * 0.8, r: 8, liq: '150,240,170', ly: r.top + h * 0.6 }); }); }
    // candles -> iron sconces on the walls, more with each stage
    const sc = stageOf(lv('candles')); if (sc) { const wins = (sd) => [...HERBS_WINS.values()].filter((wv) => wv.s0 === me && wv.side === sd).map((wv) => wv.tm).sort((a, b) => a - b), gaps = (sd, a, b) => { const ws = wins(sd), out = []; let prev = a; for (const t of [...ws, b]) { if (t - prev > 1.7) out.push((prev + t) / 2); prev = t; } return out; };   // sconces only in the wall gaps between windows (her rule: nothing over a window)
const gx = gaps('x0', s.y0 + 0.3, wallEnd), gy = [], all = []; for (let m = 0; m < Math.max(gx.length, gy.length); m++) { if (gx[m] != null) all.push(['x0', gx[m]]); if (gy[m] != null) all.push(['y0', gy[m]]); } const spots = all.slice(0, [0, 2, 3, 4, 5][sc]);
      for (const [sd, t] of spots) add(sd === 'x0' ? s.x0 + 0.1 : t, sd === 'x0' ? t : s.y0 + 0.1, () => { const im = itemIm('pot_sconce'); if (!im) return; const b = up(sd === 'x0' ? P(s.x0, t) : P(t, s.y0), TALL_H() * 0.5), h = 24, w = h * im.naturalWidth / im.naturalHeight;
        ctx.save(); ctx.translate(b.x, b.y); if (sd === 'y0') ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
        const f = 0.85 + 0.15 * Math.sin(T * 7 + t * 3); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.25 + (dnDark ? 0.25 : 0)) * f; ctx.drawImage(glowSprite('255,200,120'), b.x - 14 + (sd === 'y0' ? 3 : -3), b.y - h - 8, 28, 28); ctx.restore(); }); }   // each candle glows warm
    // recipes -> a lectern with the big book beside the teacher
    const sr = stageOf(lv('recipes')); if (sr) { const tp = teacherPos(i), lx = Math.max(s.x0 + 2.2, tp.x - 2.6), ly = tp.y + 0.15, k = [0, 0.75, 0.88, 1, 1.05][sr]; add(lx, ly, () => { const r = itemDraw('pot_lectern', lx, ly, 52 * k, { shadow: 1 }); if (!r) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.08 * Math.sin(T * 1.5); ctx.drawImage(glowSprite('200,170,255'), r.x - 20, r.top - 8, 40, 26); if (sr >= 4) for (let m = 0; m < 3; m++) { const u = (T * 0.4 + m / 3) % 1; fxStar(r.x - 8 + m * 8, r.top - u * 26, 3 * (1 - u), 1 - u, '220,200,255'); } ctx.restore(); }); }   // the book glows; at 40 sparks rise from its pages
  },
  herbs(i, s, st, add) {
    const lv = (id) => st.items[CLASSES[i].items.findIndex((x) => x.id === id)] || 0, T = performance.now() / 1000;
    const depth = s.y1 - s.y0, W = s.x1 - s.x0, free = s.y0 + (frontFacing(i) ? 1.9 : 2.5) + (Math.ceil(maxDesksOf(i) / 3) - 1) * 1.2 + 1.0;
    const wallEnd = Math.min(s.y1 - 1.0, free);   // the left wall is free from the bookcase to the side table
    // sunbeams from the windows across the floor (day)
    const dl = daylight(); if (dl > 0) add(s.x0 + 0.05, s.y0 + 0.05, () => { ctx.save();   // like the concept (her «сделай так, как на картинке»): each window lays a soft pale-gold patch of its own shape on the floor in front of it, two panes split by the bar; no haze, no dust
      for (const wv of HERBS_WINS.values()) { if (wv.s0 !== s.x0 + ',' + s.y0) continue; const hw = DECOR.bigwin.w / 2, sk = 0.45;
        const Q = (u, v) => (wv.side === 'x0' ? P(s.x0 + v, wv.tm + u + v * sk) : P(wv.tm + u + v * sk, s.y0 + v));
        for (const [g0, g1] of [[-hw * 0.82, -0.05], [0.05, hw * 0.82]]) for (let k = 0; k < 3; k++) { const e = 0.07 * (2 - k), a = Q(g0 - e, 0.12 - e), b = Q(g1 + e, 0.12 - e), c = Q(g1 + e, 1.25 + e), d = Q(g0 - e, 1.25 + e);   // three nested layers = soft edges
          ctx.fillStyle = `rgba(255,238,195,${0.075 * dl})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); } }
      ctx.restore(); });
    // planters along the left wall
    const sp = stageOf(lv('pots')), units = [], wall0 = s.y0 + 2.3;   // big boxes on the floor along the window wall, as long as the wall allows
    const PL = { herbs_planter1: 2.8, herbs_planter2: 3.6 };   // length along the wall in tiles at full size (h = 70 px)
    if (sp) { let at = wall0; const want = sp === 1 ? ['herbs_planter1'] : sp === 2 ? ['herbs_planter2'] : ['herbs_planter2', 'herbs_planter1'];
      for (const n of want) { const left = wallEnd - at; if (left < 1.6) break; const k = Math.min(1, left / PL[n]); units.push([n, at + PL[n] * k / 2, 70 * k]); at += PL[n] * k + 0.15; } }
    for (const [n, y, h] of units) add(s.x0 + 0.4, y, () => { const im = itemIm(n); if (!im) return; const w = h * im.naturalWidth / im.naturalHeight, L = w / HW, c = P(s.x0 + 0.5, y + L / 2); ctx.drawImage(im, c.x - 2, c.y - h * 0.985, w, h); });   // the sprite's left-bottom (the box's front-left floor corner) stands on the floor at the box's far end, so the box sits flat against the wall
    if (sp >= 4) add(s.x0 + 0.5, s.y0 + 3.3, () => { for (let k = 0; k < 3; k++) { const q = P(s.x0 + 0.5, s.y0 + 2.6 + k * 0.9), an = T * 1.3 + k * 2.1; emoji('🦋', q.x + Math.cos(an) * 10, q.y - 54 + Math.sin(an * 1.7) * 6, 9); } });   // butterflies over a full planter
    // the seed cabinet against the board wall
    const ss = stageOf(lv('seeds')); if (ss) { const cx = s.x0 + 2.35, cy = s.y0 + 0.32, h = [0, 34, 42, 62, 62][ss]; add(cx, cy, () => { const r = itemDraw('herbs_cabinet' + Math.min(3, ss), cx, cy, h, { shadow: ss >= 3, down: ss < 3 ? -26 : 0 });
      if (r && ss >= 4) { const tw = Math.pow(Math.max(0, Math.sin(T * 1.2)), 6); if (tw > 0.05) fxStar(r.x - r.w * 0.1, r.top + r.h * 0.25, 5 * tw, tw); } }); }   // a small shelf hangs on the wall; the full cabinet stands
    // the big windows at night: the glass turns into a starry sky, fading in with the dusk (her «окна то тоже должны темнеть»)
    { const D = dayTint(), t = D.sun.map((v, j) => (v + D.shade[j]) / 2), nt = Math.min(1, Math.max(0, (1 - (t[0] + t[1] + t[2]) / 765) * 2.2)); if (nt > 0.03) add(s.x0 + 0.05, s.y0 + 0.05, () => { ctx.save(); ctx.globalAlpha = nt; for (const wv of HERBS_WINS.values()) { const im = wv.s0 === s.x0 + ',' + s.y0 && itemIm(wv.night); if (!im) continue; ctx.save(); ctx.translate(wv.x, wv.y); if (wv.flip) ctx.scale(-1, 1); ctx.drawImage(im, -wv.sw / 2, -wv.sh / 2, wv.sw, wv.sh); ctx.restore(); } ctx.restore(); }); }
    // the cloud watering can over the planters
    const sc = stageOf(lv('can')); if (sc) { const cx = s.x0 + 0.55, cy = s.y0 + 3.4, k = [0, 0.6, 0.8, 1, 1.1][sc]; add(cx + 0.2, cy + 0.2, () => { const r = itemDraw('herbs_can', cx, cy, 34 * k, { lift: 40 + Math.sin(T * 1.4) * 2.5 });
      if (!r) return; ctx.fillStyle = 'rgba(150,200,240,0.85)'; for (let d = 0; d < 3 + sc; d++) { const u = ((T * 0.9 + d / (3 + sc)) % 1), x = r.x - r.w * 0.38 + (d % 3) * 2.5, y = r.top + r.h * 0.6 + u * 40; ctx.globalAlpha = 1 - u; ctx.beginPath(); ctx.ellipse(x, y, 1.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;   // drops falling onto the plants
      if (sc >= 4) { ctx.save(); ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ['#ff8a8a', '#ffd27a', '#9be39b', '#8ac4ff', '#c59bff'].forEach((c, j) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(r.x, r.top + r.h + 22, 18 - j * 2.2, Math.PI, 0); ctx.stroke(); }); ctx.restore(); } }); }   // a small rainbow under the cloud
    // the sun lamp hanging from the ceiling over the desks
    const sl = stageOf(lv('sunlamp')); if (sl) { const lx = s.x0 + W * 0.5, ly = s.y0 + Math.min(depth * 0.45, 3.6), k = [0, 0.55, 0.75, 1, 1.15][sl]; add(lx + 0.6, ly + 0.6, () => {
      const p = P(lx, ly), h = 30 * k, lift = 58, topY = p.y - lift - 55; ctx.strokeStyle = 'rgba(110,80,50,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x, topY); ctx.lineTo(p.x, p.y - lift - h * 0.75); ctx.stroke();   // the cord from the ceiling
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.1 + 0.06 * sl / 4) * (dnDark ? 1.6 : 1); ctx.drawImage(glowSprite('255,214,130'), p.x - 26 * k, p.y - 10 * k, 52 * k, 20 * k);   // a small soft pool right under the lamp   // a warm pool of light on the desks
      ctx.globalAlpha = 0.35; ctx.drawImage(glowSprite('255,225,150'), p.x - h, p.y - lift - h * 1.3, h * 2, h * 2); ctx.restore();
      itemDraw('herbs_sun', lx, ly, h, { lift: lift - h * 0.25 });
      if (sl >= 4) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.1 + 0.04 * Math.sin(T); ctx.fillStyle = 'rgba(255,220,150,1)'; ctx.beginPath(); ctx.moveTo(p.x - 6, p.y - lift - h * 0.4); ctx.lineTo(p.x + 6, p.y - lift - h * 0.4); ctx.lineTo(p.x + 46, p.y); ctx.lineTo(p.x - 46, p.y); ctx.closePath(); ctx.fill(); ctx.restore(); }   // a cone of light at the top level
      if (dnDark) frameLamps.push({ x: p.x, y: p.y - lift - h * 0.5, r: 8 * k }); }); }
  },
};
function roomProps(i) {
  const id = CLASS_SLOT[i], th = themeOf(id); if (!th) return [];
  const s = SLOTS[id], T = THEMES[th], w = s.x1 - s.x0, cols = CLASSES[i].final ? 7 : w >= 9 ? 4 : 3;
  const rows = Math.ceil(maxDesksOf(i) / cols), free = s.y0 + (frontFacing(i) ? 1.9 : 2.5) + (rows - 1) * 1.2 + 1.0;   // first free row behind the last seats
  const out = [{ n: T.back[0], x: s.x0 + 0.45, y: s.y0 + 0.45 }, { n: T.back[1], x: s.x1 - 0.5, y: s.y0 + 0.5 }, { n: T.side[0], x: s.x0 + 0.42, y: s.y0 + 1.7 }];
  if (s.y1 - free >= 1.2) out.push({ n: T.side[1], x: s.x0 + 0.5, y: free + 0.45, flip: true });
  if (T.front[0]) out.push({ n: T.front[0], x: s.x0 + 0.5, y: s.y1 - 0.45 });
  if (T.front[1]) out.push({ n: T.front[1], x: s.x1 - 0.55, y: s.y1 - 0.5 });
  if (T.front[2] && s.y1 - free >= 2.4) out.push({ n: T.front[2], x: s.x1 - 0.6, y: free + 0.5 });
  if (T.teacherProp) { const tp = teacherPos(i); out.push({ n: T.teacherProp, x: Math.max(s.x0 + 0.9, tp.x - 3.0), y: tp.y + 0.1 }); }   // beside the teacher's walking path, never in front of it
  return out.map((o) => ({ ...o, th }));
}
// ---- per-frame drawing without save/restore and gradients (build 207, her «Подлагивает»): mirrored copies and shadow pictures are made once
const flipCache = new WeakMap();
function flipped(im) {   // a mirrored copy of a picture or canvas
  let f = flipCache.get(im); if (f) return f;
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; if (!w) return im;
  f = document.createElement('canvas'); f.width = w; f.height = h; const x = f.getContext('2d'); x.translate(w, 0); x.scale(-1, 1); x.drawImage(im, 0, 0); flipCache.set(im, f); return f;
}
const sizeCache = new WeakMap();
function sized(im, px) {   // a downscaled copy near the drawn size (128 or 256 px tall): downscaling a big sprite every frame is slow
  const ih = im.naturalHeight || im.height; if (!ih) return im;
  const t = px <= 110 ? 128 : px <= 230 ? 256 : 0; if (!t || ih <= t * 1.3) return im;
  let m = sizeCache.get(im); if (!m) sizeCache.set(im, (m = {}));
  if (!m[t]) { const c = document.createElement('canvas'), k = t / ih; c.width = Math.max(1, Math.round((im.naturalWidth || im.width) * k)); c.height = t; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height); m[t] = c; }
  return m[t];
}
let crShadowCv = null;
function creatureShadow() { if (crShadowCv) return crShadowCv; const c = document.createElement('canvas'); c.width = 40; c.height = 16; const x = c.getContext('2d'); x.fillStyle = '#00000026'; x.beginPath(); x.ellipse(20, 8, 20, 8, 0, 0, Math.PI * 2); x.fill(); return (crShadowCv = c); }
let propShadowCv = null;
function propShadow() {   // the soft contact shadow under room furniture, drawn once (it was a new radial gradient for every prop every frame)
  if (propShadowCv) return propShadowCv;
  const c = document.createElement('canvas'); c.width = 64; c.height = 28; const x = c.getContext('2d'), g = x.createRadialGradient(32, 14, 0, 32, 14, 32);
  g.addColorStop(0, 'rgba(60,40,80,0.20)'); g.addColorStop(1, 'rgba(60,40,80,0)'); x.setTransform(1, 0, 0, 0.42, 0, 14 - 14 * 0.42); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (propShadowCv = c);
}
const castCache = new Map();
function castShadow(n, flip, sh, w, h) {   // the cast shadow of an outdoor sprite pre-rendered at its base size; drawn scaled by o.s
  const key = n + (flip ? 'f' : ''); let e = castCache.get(key); if (e) return e;
  const K = 2, ext = { x0: -w / 2 - 4, x1: w / 2 + 0.62 * h + 4, y0: -4, y1: h * 0.32 };   // shear: x' = x - 0.62*y (y in -h..0: to the right), y' = -0.3*y (down)
  const cv = document.createElement('canvas'); cv.width = Math.ceil((ext.x1 - ext.x0) * K); cv.height = Math.ceil((ext.y1 - ext.y0) * K);
  const c = cv.getContext('2d'); c.setTransform(K, 0, 0, K, -ext.x0 * K, -ext.y0 * K); c.globalAlpha = 0.3; c.transform(1, 0, -0.62, -0.3, 0, 0); if (flip) c.scale(-1, 1); c.drawImage(sh, -w / 2, -h, w, h);
  e = { cv, ox: ext.x0, oy: ext.y0, w: cv.width / K, h: cv.height / K, bw: w, bh: h }; castCache.set(key, e); return e;
}
function drawProp(o) {
  const im = part(o.th, o.n); if (!im) return;
  const p = P(o.x, o.y), h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30, w = h * im.naturalWidth / im.naturalHeight;
  if (zoom >= 1.2) { const rx = Math.min(w * 0.34, h * 0.5), cy = p.y - h * 0.02; ctx.drawImage(propShadow(), p.x - rx, cy - rx * 0.42, rx * 2, rx * 0.84); }   // soft contact shadow right under the object's footprint (her report: shadows looked detached)
  ctx.drawImage(o.flip ? flipped(im) : im, p.x - w / 2, p.y + h * 0.08 - (o.lift || 0) - h, w, h);
  if (dnDark && isLightIm(im)) { const top = p.y + h * 0.08 - (o.lift || 0) - h, liq = POT_LIQ[o.n];   // a Potions desk: ember under the pot + the brew's glow over the rim
    if (liq) { const sp = lightSpots(im)[0]; frameLamps.push({ pot: 1, x: p.x - w / 2 + (sp ? (o.flip ? 1 - sp.u : sp.u) : 0.5) * w, y: sp ? top + sp.v * h : top + h * 0.75, r: Math.max(4, Math.min(9, w * 0.12)), liq: liq.join(','), ly: top + h * 0.28 }); }
    else for (const sp of lightSpots(im)) frameLamps.push({ x: p.x - w / 2 + (o.flip ? 1 - sp.u : sp.u) * w, y: top + sp.v * h, r: Math.max(4, Math.min(14, Math.sqrt(sp.n) * w / 64)) }); }   // night lamps
}
function drawRugAt(c, th, s) {   // rooms without desks (library): a rug in the middle
  const im = THEMES[th].rug && part(th, THEMES[th].rug); if (!im) return;
  const w = s.x1 - s.x0, h = s.y1 - s.y0, d = Math.min(w, h) - 1.6, m = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2 + 0.3);
  const sw = d * HW * Math.SQRT2, sh = sw * im.naturalHeight / im.naturalWidth; c.drawImage(im, m.x - sw / 2, m.y - sh / 2, sw, sh);
}
const rugDyn = (i) => { const R = RLAY.rooms[CLASSES[i].id]; return !!EDIT || !!(R && R.items && R.items['rug#1']); };   // the class rug as an editor item
function drawRug(c, th, s, i) {
  const im = part(th, THEMES[th].rug); if (!im) return;
  const w = s.x1 - s.x0, cols = w >= 9 ? 4 : 3, rows = Math.ceil(S.classes[i].desks / cols);
  const cx = (s.x0 + s.x1) / 2, cy = s.y0 + 2.6 + (rows - 1) * 0.6, d = Math.min(w - 1.2, 3.2 + rows * 0.6);
  const T = THEMES[th];
  if (T.rugFlip) {   // the exam runner: centred in the hall and never longer than the room (her report: it went under the wall with many desks)
    const h = s.y1 - s.y0, m = P((s.x0 + s.x1) / 2, s.y0 + h / 2 + 0.2), sw = (w - 3) * HW * 1.15, sh = sw * im.naturalHeight / im.naturalWidth;
    c.save(); c.translate(m.x, m.y); c.scale(-1, 1); c.drawImage(im, -sw / 2, -sh / 2, sw, sh); c.restore(); return;
  }
  const m = P(cx, cy), sw = d * HW * Math.SQRT2 * (T.rugScale || 1), sh = sw * im.naturalHeight / im.naturalWidth;   // rugs of different shapes per room (her question 2026-11-21: why are all rugs round)
  c.save(); c.translate(m.x, m.y); if (T.rugFlip) c.scale(-1, 1); c.drawImage(im, -sw / 2, -sh / 2, sw, sh); c.restore();
}
// ---- PERFORMANCE (her report 2026-11-21: the game lags while swiping) ----
// A themed room (floor, rug, its tall walls, wall decor with soft shadows) is rendered ONCE into its own canvas and then
// drawn with a single drawImage per frame. It is rebuilt only when the room, its desks, the map or the zoom level change.
const roomCache = {};
const roomQ = () => Math.min(3, Math.max(2, dpr));   // fixed: zooming never rebuilds every room picture (her report: the worst freeze when resizing)
const themeReadyMemo = {}; let themeReadyVer = -1;
function themeReady(th) {   // it scanned every loaded picture for every room every frame (the profile's top line after the outdoor art came in)
  if (themeReadyVer !== partsVer) { for (const k in themeReadyMemo) delete themeReadyMemo[k]; themeReadyVer = partsVer; }
  if (themeReadyMemo[th] !== undefined) return themeReadyMemo[th];
  let n = 0; for (const k in parts) if (k.startsWith(th + '/') && parts[k].complete && parts[k].naturalWidth) n++; return (themeReadyMemo[th] = n);
}
function roomKey(id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id), th = themeOf(id);
  return [s.x0, s.y0, s.x1, s.y1, ci >= 0 ? S.classes[ci].desks : 0, OX, OY, roomQ().toFixed(1), themeReady(th), LAY_VER].join(',');
}
function drawThemedRoom(id) {
  const rc = buildRoom(id); ctx.drawImage(rc.cv, rc.x, rc.y, rc.w, rc.h);
}
function warmRooms() {   // prepares one stale room picture per frame in advance, so swiping never has to wait for it
  if (pinching) return;
  for (const id of Object.keys(SLOTS)) if (cachedRoom(id)) { const rc = roomCache[id]; if (!rc || rc.key !== roomKey(id)) { buildRoom(id); return; } }
}
let roomBuilds = 0;
// ---- night lamps: flame spots of light-source sprites (scanned once per picture)
const LIGHT_RE = /candle|sconce|lamp|lantern|brazier|torch|fire|stove|hearth|chandel|cauldron|furnace/, LIGHT_KEY = /^potions[/]station_/;   // + the Potions desks (a fire under each cauldron)
let lightIms = null, frameLamps = [];
function isLightIm(im) {
  if (!lightIms) { lightIms = new WeakSet(); for (const k in parts) if ((LIGHT_RE.test(k.split('/')[1] || '') && !/^cr_/.test(k.split('/')[1] || '')) || LIGHT_KEY.test(k)) lightIms.add(parts[k]); }
  return lightIms.has(im);
}
function lightSpots(im) {   // normalized centres of the bright warm (flame) blobs of a picture, max 8
  if (im._ls) return im._ls;
  const W = 64, H = Math.max(8, Math.round(64 * im.naturalHeight / im.naturalWidth)), c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, W, H); let d; try { d = x.getImageData(0, 0, W, H).data; } catch (e) { return (im._ls = []); }
  const hot = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3]; hot[i] = a > 150 && r > 225 && g > 150 && b < 200 && r - b > 55 ? 1 : 0; }
  const out = [], seen = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { if (!hot[i] || seen[i]) continue; let n = 0, sx = 0, sy = 0; const st = [i]; seen[i] = 1;
    while (st.length) { const j = st.pop(), px = j % W, py = (j / W) | 0; n++; sx += px; sy += py; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + dx, qy = py + dy, k = qy * W + qx; if (qx >= 0 && qy >= 0 && qx < W && qy < H && hot[k] && !seen[k]) { seen[k] = 1; st.push(k); } } }
    if (n >= 2) out.push({ u: (sx / n + 0.5) / W, v: (sy / n + 0.5) / H, n }); }
  out.sort((a, b) => b.n - a.n); return (im._ls = out.slice(0, 8));
}
function recordLamps(c, list, x0, y0, q) {   // while a cached room is drawn: every light sprite's flames -> world points
  const orig = c.drawImage;
  c.drawImage = function (im, ...a) {
    if (im && im.naturalWidth && isLightIm(im) && a.length >= 4) { const [dx, dy, dw, dh] = a.length >= 8 ? a.slice(4, 8) : a, T = this.getTransform();
      for (const sp of lightSpots(im)) { const lx = dx + sp.u * dw, ly = dy + sp.v * dh, X = T.a * lx + T.c * ly + T.e, Y = T.b * lx + T.d * ly + T.f; list.push({ x: X / q + x0, y: Y / q + y0, r: Math.max(4, Math.min(14, Math.sqrt(sp.n) * dw / 64)) }); } }
    return orig.call(this, im, ...a);
  };
  return () => { delete c.drawImage; };
}
function buildRoom(id) {
  const key = roomKey(id); let rc = roomCache[id];
  if (!rc || (rc.key !== key && !pinching)) {
    roomBuilds++;
    const s = SLOTS[id], th = themeOf(id), q = roomQ();
    const L = P(s.x0, s.y1), B = P(s.x0, s.y0), R = P(s.x1, s.y0), F = P(s.x1, s.y1);
    const x0 = L.x - 14, x1 = R.x + 14, y0 = B.y - TALL_H() - 24, y1 = F.y + 12;
    const cv = (rc && rc.cv) || document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * q); cv.height = Math.ceil((y1 - y0) * q);
    const c = cv.getContext('2d'); c._q = q;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
    const lamps = [], stop = recordLamps(c, lamps, x0, y0, q);
    { const s0 = s.x0 + ',' + s.y0; layHangN[s0] = {}; if (th) delete LAY_WALLS[th]; for (const [k, v] of HERBS_WINS) if (v.s0 === s0) HERBS_WINS.delete(k); for (const [k, v] of CH_SLOTS) if (v.s0 === s0) CH_SLOTS.delete(k); for (const [k, v] of EL_HUNG) if (v.s0 === s0) EL_HUNG.delete(k); }   // a rebuilt room hangs its decor afresh
    drawSlot(c, id);
    for (const e of EDGES) if (e.id === id && e.tall) drawEdge(c, e);
    drawWallDecor(c, id);
    stop();
    rc = roomCache[id] = { key, cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0, lamps };
  }
  return rc;
}
const cachedRoom = (id) => { if (!themeOf(id) || (id === 'DIR' && !dirBuilt()) || (id === 'SHOP' && !shopOpen()) || (id === 'TOWER' && !towerOpen()) || (id === 'CANT' && !cantOpen())) return false; const ci = CLASS_SLOT.indexOf(id); return ci < 0 || S.classes[ci].built; };
let VIEW = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
const onScreen = (x, y, mx = 140, my = 200) => x > VIEW.x0 - mx && x < VIEW.x1 + mx && y > VIEW.y0 - my && y < VIEW.y1 + my;
const bBusy = (id) => { const o = id === 'CANT' ? cantUp() : bObj(id); return !!(o && o.built && Date.now() < (o.end || 0)); };   // under construction: the plot keeps only fence and props
function drawSlot(c, id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id);
  const L = P(s.x0, s.y1), B = P(s.x0, s.y0), R = P(s.x1, s.y0), F = P(s.x1, s.y1);
  const center = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2);
  if (id === 'GARDEN' && WORLD <= 2 && part('outdoor', 'path')) {   // the garden floor: grass (from the ground layer), a round flagstone plaza and the path from the arch
    if (!gardenDecal || gardenDecal.key !== outKey + staticKey) {
      const K = 3, minX = Math.min(L.x, B.x) - 10, maxX = Math.max(R.x, F.x) + 10, minY = B.y - 10, maxY = F.y + 10;
      const cv = document.createElement('canvas'); cv.width = Math.ceil((maxX - minX) * K); cv.height = Math.ceil((maxY - minY) * K); const g = cv.getContext('2d');
      g.setTransform(K, 0, 0, K, -minX * K, -minY * K); const pt = isoPat(g, 'path', 3);
      const cx = s.x0 + 3, cy = s.y0 + 3, ring = []; for (let k = 0; k < 40; k++) { const an = k / 40 * Math.PI * 2; ring.push(P(cx + Math.cos(an) * 2.6, cy + Math.sin(an) * 2.6)); }
      g.fillStyle = pt; poly(g, ring); g.fill(); if (WORLD === 1) { poly(g, [P(cx - 0.8, s.y0), P(cx + 0.8, s.y0), P(cx + 0.8, cy), P(cx - 0.8, cy)]); g.fill(); } else { poly(g, [P(s.x0, cy - 0.8), P(cx, cy - 0.8), P(cx, cy + 0.8), P(s.x0, cy + 0.8)]); g.fill(); }   // world 1: paths from the arch and from the court door
      g.strokeStyle = 'rgba(150,120,170,0.55)'; g.lineWidth = 1.5; poly(g, ring); g.stroke();
      gardenDecal = { key: outKey + staticKey, cv, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    c.drawImage(gardenDecal.cv, gardenDecal.x, gardenDecal.y, gardenDecal.w, gardenDecal.h);
    return;
  }
  if (id === 'GARDEN') {
    poly(c, [L, B, R, F], '#c3eaa9', '#ffffff');
    emoji('⛲', center.x, center.y - 8, 26, c); emoji('🌳', B.x, B.y + 16, 28, c); emoji('🌸', R.x - 22, R.y, 18, c); emoji('🌷', L.x + 24, L.y, 16, c);
    text('Сад выпускников', center.x, F.y + 10, 9, '#3f6e2e', c);
    return;
  }
  if (ci >= 0 && !S.classes[ci].built) { drawPlot(c, s, ci, L, B, R, F, center); return; }
  if (id === 'SHOP' && !shopOpen()) {
    siteGround(c, L, B, R, F, center);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 56, center.y - 26, 112, 48, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
    text(WORLD === 2 ? 'Самоцветная лавка' : '🛍️ Лавка', center.x, center.y - 11, 10, '#5d4a6e', c); text('🪙 ' + fmt(SHOP_COST), center.x, center.y + 8, 12, '#7b5cd6', c);
    return;
  }
  if (id === 'CANT' && !cantBuilt()) {
    siteGround(c, L, B, R, F, center);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 56, center.y - 26, 112, 48, 10); c.fill(); c.strokeStyle = '#e08a3d'; c.lineWidth = 2.5; c.stroke();
    text(WORLD === 2 ? 'Пиршественный зал' : '🍽️ Столовая', center.x, center.y - 11, 10, '#5d4a6e', c);
    if (isOpen(CANT_NEED)) text('🪙 ' + fmt(CANT_COST), center.x, center.y + 8, 12, '#7b5cd6', c); else text('🔒 ' + CLASSES[CANT_NEED].name, center.x, center.y + 8, 10, '#8a7a99', c);
    return;
  }
  if (id === 'TOWER' && !towerOpen()) {
    siteGround(c, L, B, R, F, center);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 62, center.y - 26, 124, 48, 10); c.fill(); c.strokeStyle = '#8f6ef0'; c.lineWidth = 2.5; c.stroke();
    text(WORLD === 2 ? 'Чертог Хранителей' : '🏰 Башня мастеров', center.x, center.y - 11, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(towerCost()), center.x, center.y + 8, 12, '#7b5cd6', c);
    return;
  }
  if (id === 'DIR' && !dirBuilt()) {
    siteGround(c, L, B, R, F, center);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 62, center.y - 30, 124, 58, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
    if (WORLD === 2) { text('👑 Трон старейшины', center.x, center.y - 15, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(THRONE_COST), center.x, center.y + 3, 12, '#7b5cd6', c); text('нужен Зал стражей', center.x, center.y + 19, 8.5, '#8a7a9a', c); }
    else { text('👑 Кабинет директора', center.x, center.y - 15, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(DIR_COST), center.x, center.y + 3, 12, '#7b5cd6', c); text('⭐ ' + DIR_STARS, center.x, center.y + 19, 11, '#c98a00', c); }
    return;
  }
  if (id === 'EXPED') {   // granite road yard before the gates of the deep; before it is built, a dashed plot with the price
    const fl = expedOpen() && isOpat(c);
    if (fl) { poly(c, [L, B, R, F]); c.fillStyle = fl; c.fill(); return; }
    poly(c, [L, B, R, F], '#5d5a58'); c.setLineDash([6, 5]); c.lineWidth = 2; poly(c, [L, B, R, F], null, '#ffffffaa'); c.setLineDash([]);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 60, center.y - 30, 120, 58, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
    text('Врата глубин', center.x, center.y - 15, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(EXPED_COST), center.x, center.y + 3, 12, '#7b5cd6', c); text('нужна Гранильня', center.x, center.y + 19, 8.5, '#8a7a9a', c);
    return;
  }
  if (id === 'TRADE') {   // cobbled yard; before it is built, a dashed plot with the price
    const fl = tradeOpen() && pat(c, 'corridor', 't_floor');
    if (fl) { const T0 = part('corridor', 't_floor').naturalWidth / 3, o = P(0, 0); fl.setTransform(new DOMMatrix([HW / T0, HH / T0, -HW / T0, HH / T0, o.x, o.y])); poly(c, [L, B, R, F]); c.fillStyle = fl; c.fill(); return; }
    poly(c, [L, B, R, F], '#6d6a66'); c.setLineDash([6, 5]); c.lineWidth = 2; poly(c, [L, B, R, F], null, '#ffffffaa'); c.setLineDash([]);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 60, center.y - 26, 120, 48, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
    text('🐐 Торговый двор', center.x, center.y - 11, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(TRADE_COST), center.x, center.y + 8, 12, '#7b5cd6', c);
    return;
  }
  if (id === 'DORM2' && !dorm2Built()) {
    siteGround(c, L, B, R, F, center);
    if (bBusy(id)) return; c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 58, center.y - 26, 116, 48, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
    text('🛏️ Вторая спальня', center.x, center.y - 11, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(DORM2_COST), center.x, center.y + 8, 12, '#7b5cd6', c);
    return;
  }
  const col = roomColors(id);
  const artKey = ci >= 0 ? CLASSES[ci].id : id;
  const art = WORLD === 1 ? arts[artKey] : null;
  if (art && art.complete && art.naturalWidth) {
    const A = ART[artKey];
    // the picture is square: it keeps its size in the back corner; an expanded room gets plain floor (and built walls) beyond it
    const sq = Math.min(s.x1 - s.x0, s.y1 - s.y0);
    if (!A.band && sq < Math.max(s.x1 - s.x0, s.y1 - s.y0)) {
      poly(c, [L, B, R, F], A.floor || col.floor, '#00000012');
      c.strokeStyle = '#00000014'; c.lineWidth = 1;
      for (let k = 1; k < s.y1 - s.y0; k++) { const a = P(s.x0, s.y0 + k), b = P(s.x1, s.y0 + k); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    }
    const L2 = A.fill ? P(s.x0, s.y1) : P(s.x0, s.y0 + sq), R2 = A.fill ? P(s.x1, s.y0) : P(s.x0 + sq, s.y0), F2 = A.fill ? P(s.x1, s.y1) : P(s.x0 + sq, s.y0 + sq);   /* A.fill: the picture covers the whole room */
    const u = [A.R[0] - A.L[0], A.R[1] - A.L[1]], v = [A.F[0] - A.L[0], A.F[1] - A.L[1]];
    const U = [R2.x - L2.x, R2.y - L2.y], V = [F2.x - L2.x, F2.y - L2.y];
    const det = u[0] * v[1] - u[1] * v[0];
    const ia = v[1] / det, ib = -u[1] / det, ic = -v[0] / det, id2 = u[0] / det;      // inverse of [u v]
    const m11 = U[0] * ia + V[0] * ib, m12 = U[0] * ic + V[0] * id2, m21 = U[1] * ia + V[1] * ib, m22 = U[1] * ic + V[1] * id2;
    const e = L2.x - (m11 * A.L[0] + m12 * A.L[1]), f = L2.y - (m21 * A.L[0] + m22 * A.L[1]);
    c.save();
    // painted rooms are drawn whole (no cut): their walls are the reference height for the built ones
    if (false) {   /* a deeper room: the picture's back part, then its 2-tile middle band repeated, then its front band (with the front ledge) */
      const D = s.y1 - s.y0, H = TALL_H() * 1.6, lg = 26, dv = { x: -HW, y: HH }, x0 = s.x0 - 0.4, x1 = s.x1 + 0.6, y = (t) => s.y0 + t;
      const band = (a0, b0, sh, front, first) => { c.save(); c.beginPath(); const La = P(x0, y(a0 + sh)), Lb = P(x0, y(b0 + sh)), Ra = P(x1, y(a0 + sh)), Rb = P(x1, y(b0 + sh));
        const pts = first ? [{ x: Lb.x - 60, y: Lb.y - 4000 }, { x: Lb.x - 60, y: Lb.y }, Lb, { x: Rb.x, y: Rb.y + lg }, { x: Rb.x + 900, y: Rb.y + lg }, { x: Rb.x + 900, y: Lb.y - 4000 }]
          : [up(La, H), up(Lb, H), front ? { x: Lb.x, y: Lb.y + lg } : Lb, front ? { x: Rb.x, y: Rb.y + lg } : Rb, { x: Rb.x, y: Rb.y + lg }, { x: Ra.x, y: Ra.y + lg }, Ra, La];
        pts.forEach((q, k) => (k ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.clip(); c.translate(dv.x * sh, dv.y * sh); c.transform(m11, m21, m12, m22, e, f); c.drawImage(art, 0, 0); c.restore(); };
      band(0, sq - 2, 0, false, true); for (let t = sq - 2; t < D - 2; t += 2) band(sq - 4, sq - 2, t - (sq - 4), false, false); band(sq - 2, sq, D - sq, true, false);
    } else { c.transform(m11, m21, m12, m22, e, f); c.drawImage(art, 0, 0); }
    c.restore();

  } else if (themeOf(id) && texFloor(c, themeOf(id), s)) {
    if (ci >= 0) { if (!rugDyn(ci)) drawRug(c, themeOf(id), s, ci); } else drawRugAt(c, themeOf(id), s);   /* an editable class rug is drawn with the room's items */
    const rn = THEMES[themeOf(id)].runner;
    if (rn && rn.edge) { poly(c, [P(s.x0 + rn.u0, s.y0), P(s.x0 + rn.u1, s.y0), P(s.x0 + rn.u1, s.y1), P(s.x0 + rn.u0, s.y1)], rn.color); c.strokeStyle = rn.edge; c.lineWidth = 1.6; for (const u of [rn.u0 + 0.12, rn.u1 - 0.12]) { const a = P(s.x0 + u, s.y0), b = P(s.x0 + u, s.y1); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); } }   /* blue runner with gold edges */
    { const st = THEMES[themeOf(id)].arrival && part(themeOf(id), 'rc_star'); if (st) { const m = P(s.x0 + (rn.u0 + rn.u1) / 2, s.y0 + 4.4), r = 1.55 * Math.SQRT2; c.drawImage(st, m.x - r * HW, m.y - r * HH, 2 * r * HW, 2 * r * HH); } }   /* the golden star mosaic */
    if (rn && !rn.edge) { poly(c, [P(s.x0 + rn.u0, s.y0), P(s.x0 + rn.u1, s.y0), P(s.x0 + rn.u1, s.y1), P(s.x0 + rn.u0, s.y1)], rn.color, '#c9849488'); }
  } else {
    poly(c, [L, B, R, F], col.floor, '#00000012');
    c.strokeStyle = '#0000000d'; c.lineWidth = 1;
    for (let k = 1; k < ROOM; k++) { const a = P(s.x0 + k, s.y0), b = P(s.x0 + k, s.y1); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    const lh = s.cut.left ? 8 : WALLH * 0.72, rh = s.cut.right ? 8 : WALLH * 0.72;
    if (false) {
      const a = P(s.x0 + 2.2, s.y0), b = P(s.x0 + 4.6, s.y0);
      poly(c, [up(a, rh * 0.35), up(b, rh * 0.35), up(b, rh * 0.8), up(a, rh * 0.8)], '#3f5f4a', '#a77b4f');
    }
    if (id === 'REC') { const q = (x, y) => P(s.x0 + x, s.y0 + y); emoji('🪴', q(0.6, 0.6).x, q(0.6, 0.6).y - 8, 18, c); emoji('🪴', q(9.4, 7.4).x, q(9.4, 7.4).y - 8, 18, c); emoji('🗺️', q(0.2, 2).x, q(0.2, 2).y - 34, 16, c); poly(c, [q(4, 0.3), q(6, 0.3), q(6, 7.7), q(4, 7.7)], '#e9b8c9'); poly(c, [q(2.6, 3.9), q(9.5, 3.9), q(9.5, 5.1), q(2.6, 5.1)], '#c7b5ee88'); }
    if (id === 'LIB') { const q = (x, y) => P(s.x0 + x, s.y0 + y); [[0.5, 0.5], [2, 0.4], [3.5, 0.4], [5, 0.4]].forEach(([x, y]) => emoji('📚', q(x, y).x, q(x, y).y - 14, 20, c)); emoji('🕯️', q(5.5, 5.5).x, q(5.5, 5.5).y - 8, 14, c); LIB_SPOTS.slice(0, libSeats()).forEach((p) => { const t = P(p.x, p.y + 0.55); emoji('📖', t.x, t.y - 4, 12, c); }); }
    if (id === 'DORM2') emoji('🧸', F.x - 20, F.y - 14, 16, c);
    if (id === 'DORM') emoji('🪴', B.x, B.y + 8, 16, c);
  }
  if (id === 'DORM' && !themeOf(id)) DORM_SPOTS.slice(0, beds1()).forEach((p) => { const q = P(p.x, p.y + 0.2); emoji('🛏️', q.x, q.y - 6, 18, c); });
  if (id === 'DORM2' && !themeOf(id)) DORM_SPOTS.slice(DORM_STRIDE, DORM_STRIDE + beds2()).forEach((p) => { const q = P(p.x, p.y + 0.2); emoji('🛏️', q.x, q.y - 6, 18, c); });
}
// outer stone walls of the building where no room supplies a wall: [x0, y0, x1, y1, height]
// OUTER_WALLS come from genLayout()
function wallSeg([x0, y0, x1, y1, k]) {
  const a = P(x0, y0), b = P(x1, y1);
  if (k < 0.5) { railing(ctx, a, b); return; }
  tallWall(ctx, a, b, '#cbb9e2', x0 === x1 ? -14 : 0, true);
}
function drawGate(c) {
  const im = WORLD <= 2 && part('outdoor', 'gate_big'), GA = WORLD === 2 ? { ax: 0.495, ay: 0.76, tx: 0.536, ty: 0.172, rot: Math.atan(0.22), fs: 8.5, fill: '#26304a', stroke: 'rgba(236,240,252,0.85)', l1: -4.4, l2: 4.6 } : { ax: 0.49, ay: 0.86, tx: 0.494, ty: 0.342, rot: Math.atan(0.42), fs: 6.6, fill: '#5a3418', stroke: 'rgba(255,240,215,0.8)', l1: -3.6, l2: 3.8 };   // world 2: the rock gate (plaque above the arch)
  if (im) {   // the painted gate over the path, its own shadow, and the school name on its hanging plank
    const cx = Math.floor(GATE_TILE.x) + 1, p = P(cx, GATE_TILE.y - 1), h = OUT_H.gate_big, w = h * im.naturalWidth / im.naturalHeight, ox = p.x - w * GA.ax, oy = p.y - h * GA.ay;
    if (outSh.gate_big) { c.save(); c.globalAlpha = 0.26; c.translate(p.x, p.y); c.transform(1, 0, -0.62, -0.3, 0, 0); c.drawImage(outSh.gate_big, -w * GA.ax, -h * GA.ay, w, h); c.restore(); }
    c.drawImage(im, ox, oy, w, h);
    c.save(); c.translate(ox + w * GA.tx, oy + h * GA.ty); c.rotate(GA.rot); c.textAlign = 'center';
    for (const [t, dy] of WORLD === 2 ? [['Чертоги', GA.l1], ['под горой', GA.l2]] : [['Школа', GA.l1], ['магии', GA.l2]]) { c.font = `800 ${GA.fs}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`; c.lineWidth = 1.6; c.strokeStyle = GA.stroke; c.strokeText(t, 0, dy); c.fillStyle = GA.fill; c.fillText(t, 0, dy); }
    c.restore();
    return;
  }
  const g = P(15, GATE_TILE.y - 1), g2 = P(18, GATE_TILE.y - 1);
  c.strokeStyle = '#6c4fd1'; c.lineWidth = 5; c.beginPath(); c.moveTo(g.x, g.y); c.lineTo(g.x, g.y - 34); c.lineTo(g2.x, g2.y - 34); c.lineTo(g2.x, g2.y); c.stroke();
  text('ВОРОТА', (g.x + g2.x) / 2, (g.y + g2.y) / 2 - 40, 9, '#5a3fb0', c);
}
const signCache = new Map();
// plan item 4 (bigger, clearer room labels): plates keep a readable size on the phone screen (~13 px text) instead of a fixed world
// size that shrank to ~9 px at the normal zoom; far out (signIcons) a plate shows only the room's icon, bigger
const SIGN_ICON_SCALE = 0.34;
const signIcons = () => scale < SIGN_ICON_SCALE;
const signK = () => Math.round(Math.min(signIcons() ? 4 : 2.6, Math.max(1, 13.5 / (12 * scale))) * 4) / 4;
const signLabel = (label) => (signIcons() ? label.split(' ')[0] : label);
function signPill(label, bg, fs, hgt, border, ink) {   // a rounded name plate rendered once per text, colour and resolution
  const K = signK(); fs *= K; hgt *= K;
  const res = Math.max(1, Math.round(scale * dpr * 4) / 4), key = label + '|' + bg + '|' + fs + '|' + res;
  let e = signCache.get(key); if (e) return e;
  const m = document.createElement('canvas').getContext('2d'); m.font = `800 ${fs}px ui-rounded,"Nunito","Segoe UI",sans-serif`;
  const tw = m.measureText(label).width + 22 * K, pad = 8 * K, w = tw + pad * 2, h = hgt + pad * 2, rr = Math.min(11 * K, hgt / 2);
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w * res); cv.height = Math.ceil(h * res); const c = cv.getContext('2d'); c.scale(res, res);
  c.save(); c.shadowColor = '#3a2f4a55'; c.shadowBlur = 6 * K; c.shadowOffsetY = 2 * K; c.fillStyle = bg; c.beginPath(); c.roundRect(pad, pad, tw, hgt, rr); c.fill(); c.restore();
  c.strokeStyle = border; c.lineWidth = 2 * K; c.beginPath(); c.roundRect(pad, pad, tw, hgt, rr); c.stroke();
  text(label, w / 2, h / 2 + 0.5, fs, ink, c);
  e = { cv, w, h, tw, hh: hgt / 2 };
  // build 258: remember the plate only once its emoji pictures and the font are loaded; a plate cached too early kept a missing icon
  // and a fallback font for good (seen on «Библиотека», «Травология»)
  EMOJI_RE.lastIndex = 0; const ems = label.match(EMOJI_RE) || [], ready = ems.every((x) => emojiImage(x)) && (!document.fonts || document.fonts.status === 'loaded');
  if (ready) { if (signCache.size > 120) signCache.clear(); signCache.set(key, e); }
  return e;
}
function drawSign(c, id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id), B = P(s.x0, s.y0);
  if (id === 'GARDEN' && WORLD <= 2) {   // drawn over everything like the room signs, above the gazebo (world 2: the hall of glory)
    const pl = WORLD === 2 ? signPill(signLabel('🎓 Зал славы'), '#d6dcf2', 12, 22, '#ffffff', '#2e3a5a') : signPill(signLabel('🎓 Сад выпускников'), '#d9f2c9', 12, 22, '#ffffff', '#2e5a22'), q = WORLD === 1 ? P(s.x0 + 3.6, s.y0 + 0.5) : P(s.x0 + 1.3, s.y0 + 1.2); c.drawImage(pl.cv, q.x - pl.w / 2, q.y - (WORLD === 1 ? 138 : 150) - pl.h / 2, pl.w, pl.h); return; }
  if (id === 'GARDEN' || (id === 'EXPED' && !expedOpen()) || (id === 'TRADE' && !tradeOpen()) || (ci >= 0 && !S.classes[ci].built) || (id === 'DORM2' && !dorm2Built()) || (id === 'DIR' && !dirBuilt()) || (id === 'TOWER' && !towerOpen()) || (id === 'CANT' && !cantBuilt())) return;
  const name = ci >= 0 ? CLASSES[ci].emoji + ' ' + CLASSES[ci].name : id === 'REC' ? (WORLD === 2 ? '🛎️ Привратный зал' : '🛎️ Приёмная') : id === 'TRADE' ? '💰 Торговый двор' : id === 'EXPED' ? '🎒 Врата глубин' : WORLD === 2 && id === 'LIB' ? '📚 Чертог летописей' : WORLD === 2 && id === 'DORM' ? '🛏️ Кельи' : WORLD === 2 && id === 'DORM2' ? '🛏️ Вторые кельи' : id === 'LIB' ? '📚 Библиотека' : id === 'DIR' ? (WORLD === 2 ? '👑 Трон старейшины' : '👑 Кабинет директора') : id === 'SHOP' ? (WORLD === 2 ? '💎 Самоцветная лавка' : '🛍️ Лавка') : id === 'TOWER' ? TW.emo + ' ' + TW.name : id === 'CANT' ? (WORLD === 2 ? '🍖 Пиршественный зал' : '🍽️ Столовая') : id === 'DORM2' ? '🛏️ Спальня 2' : '🛏️ Спальня';
  const midBack = WORLD === 1 && ['DORM', 'DORM2', 'DIR', 'SHOP'].includes(id);   // build 258: front-row rooms put their sign over the middle of their tall back wall (on the corner it hung over the gallery)
  const sp = id === 'REC' ? P(s.x0 + 7.5, s.y0 + 7) : midBack ? up(P((s.x0 + s.x1) / 2, s.y0), WALLH * 0.72 + 12) : up(B, (s.cut.left && s.cut.right) ? 14 : WALLH * 0.72 + 12);
  const fs = 12, hgt = 22, bg = ci >= 0 ? CLASSES[ci].wall : SIGN_BG[id] || '#ffffff';
  const pill = signPill(signLabel(name), bg, fs, hgt, '#ffffff', '#2e2340'), tw = pill.tw;   // cached bitmap: the shadow blur and the text were redrawn for every sign every frame
  if (onScreen(sp.x, sp.y, 160, 40)) c.drawImage(pill.cv, sp.x - pill.w / 2, sp.y - pill.h / 2, pill.w, pill.h);
  signRects.push({ id, x0: sp.x - tw / 2, y0: sp.y - pill.hh, x1: sp.x + tw / 2, y1: sp.y + pill.hh });
  if (ci >= 0) {   // how many wait for this class in the dorm: shows the bottleneck at a glance
    const z = sleepersFor(ci), k = courtFor(ci);
    if (z + k > 0) {
      // under its own sign with the class emoji (Maria 2026-11-23 read the badge beside «Звездочётство» as the exam's, and the one beside
      // «Полёты на крыльях» as Elements': to the right of the plate it hung over the neighbouring hall)
      const t = `${CLASSES[ci].emoji} ${k ? '⛲' + k + ' ' : ''}${z ? '💤' + z + ' ' : ''}ждут`, pb = signPill(t, '#ffffff', 11, 22, '#5b7fd6', '#3d5fb8'), bw = pb.tw, bx = sp.x - bw / 2, by = sp.y + pill.hh + pb.hh + 3 * signK();
      if (onScreen(sp.x, by, 160, 40)) c.drawImage(pb.cv, sp.x - pb.w / 2, by - pb.h / 2, pb.w, pb.h);
      signRects.push({ id, x0: bx, y0: by - pb.hh, x1: bx + bw, y1: by + pb.hh });   // the badge opens the class too
    }
  }
}
const SIGN_BG = { EXPED: '#c9c3e6', TRADE: '#e8d4b0', CANT: '#f9d3a5', REC: '#d9c4f7', DORM: '#c2d8f7', LIB: '#f0cf9f', DIR: '#f5d77a', SHOP: '#f7c1d9', TOWER: '#cdbdf2' };
let signRects = [];   // tappable room signs of the last frame, world coords
// ---- building sites (art/build/props_v1.jpg, SYNTX): plots with a fence and a sign board; magic construction with progress ----
const BLD = {};
for (const n of ['fence', 'sign', 'planks', 'bricks', 'scaffold', 'crane', 'barrow', 'hammer', 'saw']) { const im = new Image(); im.onload = () => { staticKey = ''; }; im.src = `assets/build/${n}.webp?v=1`; BLD[n] = im; }
const bImg = (n) => { const im = BLD[n]; return im && im.complete && im.naturalWidth ? im : null; };
function bDraw(c, n, x, y, h, flip = false, a = 1) {   // bottom-centre anchored
  const im = bImg(n); if (!im) return false; const w = h * im.naturalWidth / im.naturalHeight;
  c.save(); c.globalAlpha = a; c.translate(x, y); if (flip) c.scale(-1, 1); c.drawImage(im, -w / 2, -h, w, h); c.restore(); return true;
}
function fenceEdge(c, a, b) {   // pickets along one edge of the plot; the picture runs «/», mirrored for «\»
  const im = bImg('fence'); if (!im) return; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), n = Math.max(1, Math.round(len / 46));
  for (let k = 0; k < n; k++) { const p0 = { x: a.x + dx * k / n, y: a.y + dy * k / n }, p1 = { x: a.x + dx * (k + 1) / n, y: a.y + dy * (k + 1) / n };
    const w = Math.abs(p1.x - p0.x) * 1.04, h = w * im.naturalHeight / im.naturalWidth, rise = p1.y < p0.y === p1.x > p0.x;   // «/» when going right means going up
    const lx = Math.min(p0.x, p1.x), by = Math.max(p0.y, p1.y) + 2;
    c.save(); if (rise) c.drawImage(im, lx, by - h, w, h); else { c.translate(lx + w, 0); c.scale(-1, 1); c.drawImage(im, 0, by - h, w, h); } c.restore(); }
}
function siteGround(c, L, B, R, F, center) {
  poly(c, [L, B, R, F], '#ecd2a8');
  { let h = 7; c.fillStyle = '#d9b98a'; for (let k = 0; k < 26; k++) { h = (h * 9301 + 49297) % 233280; const u = h / 233280; h = (h * 9301 + 49297) % 233280; const v = h / 233280;
    const x = L.x + (R.x - L.x) * (0.15 + 0.7 * u), y = B.y + (F.y - B.y) * (0.2 + 0.6 * v); c.beginPath(); c.ellipse(x, y, 3, 1.5, 0, 0, 7); c.fill(); } }   // pebbles
  if (!bImg('fence')) { c.setLineDash([6, 5]); c.lineWidth = 2; poly(c, [L, B, R, F], null, '#ffffffcc'); c.setLineDash([]); return; }
  fenceEdge(c, L, B); fenceEdge(c, B, R);
  const lerp = (p, q, k) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
  const pl = lerp(center, L, 0.55), br = lerp(center, R, 0.5); bDraw(c, 'planks', pl.x, pl.y + 10, 26); bDraw(c, 'bricks', br.x, br.y + 12, 30);
  c.fillStyle = '#8a5f38'; c.fillRect(center.x - 3, center.y + 14, 6, 26);   // the post of the sign board
  fenceEdge(c, L, F); fenceEdge(c, F, R);
}
const BUILD_T0 = {};   // other buildings: the time left when first seen gives the bar its length
function buildFx(key, s, left, total) {
  const now = performance.now() / 1000, cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
  if (!total) { BUILD_T0[key] = Math.max(BUILD_T0[key] || 0, left); total = BUILD_T0[key]; }
  const prog = Math.max(0, Math.min(1, 1 - left / Math.max(1, total)));
  const at = (x, y) => P(x, y);
  { const p = at(s.x0 + 1.0, s.y0 + 0.7); bDraw(ctx, 'scaffold', p.x, p.y, 62); }
  { const p = at(s.x1 - 0.7, s.y0 + 1.3); bDraw(ctx, 'scaffold', p.x, p.y, 58, true); }
  { const p = at(s.x0 + 0.7, s.y1 - 1.4); bDraw(ctx, 'crane', p.x, p.y, 92); }
  const pile = at(cx - 1.7, cy + 0.3); bDraw(ctx, 'bricks', pile.x, pile.y, 30);
  { const p = at(cx + 1.3, cy + 0.6); bDraw(ctx, 'planks', p.x, p.y, 24); }
  { const p = at(cx + 0.4, s.y1 - 0.9); bDraw(ctx, 'barrow', p.x, p.y, 26); }
  // bricks fly by magic from the stack to the back walls, one after another
  for (let k = 0; k < 3; k++) { const u = ((now * 0.55 + k / 3) % 1), tgt = at(s.x0 + 1.4 + k * 1.3, s.y0 + 0.3), x = pile.x + (tgt.x - pile.x) * u, y = pile.y - 22 + (tgt.y - 30 - (pile.y - 22)) * u - Math.sin(u * Math.PI) * 46;
    ctx.globalAlpha = u > 0.9 ? (1 - u) * 10 : 1; ctx.fillStyle = '#c8644a'; ctx.strokeStyle = '#7a3a2a'; ctx.lineWidth = 1; ctx.save(); ctx.translate(x, y); ctx.rotate(u * 6); ctx.fillRect(-5, -3, 10, 6); ctx.strokeRect(-5, -3, 10, 6); ctx.restore();
    ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(x - 6, y + 3, 1.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  { const p = at(s.x0 + 0.9, cy - 0.3), hit = Math.max(0, Math.sin(now * 7)); ctx.save(); ctx.translate(p.x, p.y - 48); ctx.rotate(-0.9 + hit * 0.9); bDraw(ctx, 'hammer', 0, 12, 26); ctx.restore();
    if (hit > 0.97) for (let k = 0; k < 3; k++) { ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(p.x + 8 + k * 4, p.y - 44 - k * 3, 2, 0, 7); ctx.fill(); } }
  { const p = at(cx + 0.6, s.y0 + 0.8), sw = Math.sin(now * 5) * 7; bDraw(ctx, 'saw', p.x + sw, p.y - 30 + Math.abs(sw) * 0.3, 24); }
  for (let k = 0; k < 6; k++) { const u = (now * 0.4 + k * 0.17) % 1, p = at(s.x0 + 0.8 + ((k * 1.7) % (s.x1 - s.x0 - 1.6)), s.y0 + 0.8 + ((k * 2.3) % (s.y1 - s.y0 - 1.6)));
    ctx.globalAlpha = Math.sin(u * Math.PI); ctx.fillStyle = k % 2 ? '#c9a7ff' : '#ffe08a'; ctx.beginPath(); ctx.arc(p.x, p.y - 10 - u * 40, 2.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  // the board: «Строится» + progress bar + time left
  const c = at(cx, cy); ctx.fillStyle = '#8a5f38'; ctx.fillRect(c.x - 2.5, c.y - 4, 5, 20);
  ctx.fillStyle = '#f3dcb2'; rr(c.x - 46, c.y - 34, 92, 34, 7); ctx.fill(); ctx.strokeStyle = '#a5744a'; ctx.lineWidth = 2; ctx.stroke();
  text(`Строится · ${Math.round(prog * 100)}%`, c.x, c.y - 25, 9, '#5d4a3a');
  ctx.fillStyle = '#e2c79c'; rr(c.x - 38, c.y - 18, 76, 7, 3.5); ctx.fill(); ctx.fillStyle = '#7b5cd6'; rr(c.x - 38, c.y - 18, Math.max(7, 76 * prog), 7, 3.5); ctx.fill();
  text(left >= 3600 ? `${Math.floor(left / 3600)} ч ${Math.floor((left % 3600) / 60)} мин` : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, c.x, c.y - 5, 9.5, '#5a3fb0');
}
function drawPlot(c, s, ci, L, B, R, F, center) {
  const next = S.classes.findIndex((q) => !q.built) === ci;
  siteGround(c, L, B, R, F, center);
  if (!next) { c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 16, center.y - 2, 32, 22, 6); c.fill(); c.strokeStyle = '#a5744a'; c.lineWidth = 2; c.stroke(); emoji('🔒', center.x, center.y + 9, 14, c); return; }
  const C = CLASSES[ci];
  c.fillStyle = '#f3dcb2'; c.beginPath(); c.roundRect(center.x - 54, center.y - 26, 108, 48, 10); c.fill();
  c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
  text(C.emoji + ' ' + C.name, center.x, center.y - 11, 9.5, '#5d4a6e', c);
  text('🪙 ' + fmt(buildCost(ci)), center.x, center.y + 8, 12, '#7b5cd6', c);
}
function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, v + d)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

// ---- animation pilot: frame sheets in assets/anim (art/anim_pilot: puppet.py = warped game sprite, video2sheet.py = SYNTX video, green screen)
const ANIM_MODE = new URLSearchParams(location.search).get('anim') || localStorage.getItem('magicschool.anim');   // the link, or the Settings switch on Maria's device
const ANIM_SHEETS = ({
  puppet: { idle: { src: 'assets/anim/mothfox_puppet.webp', n: 24, cols: 24, fw: 209, fh: 180, fps: 12 } },
  video: { idle: { src: 'assets/anim/mothfox_vidle.webp', n: 70, cols: 10, fw: 267, fh: 180, fps: 12 }, walk: { src: 'assets/anim/mothfox_vwalk.webp', n: 36, cols: 10, fw: 244, fh: 203, fps: 12 } },
})[ANIM_MODE] || null;
if (ANIM_SHEETS) for (const k in ANIM_SHEETS) { const im = new Image(); im.src = ANIM_SHEETS[k].src + '?v=1'; ANIM_SHEETS[k].im = im; }
function animPilot(a, sp0, cpose, walking) {
  if (!ANIM_SHEETS || sp0 !== 'mothfox' || cpose || a._tierImg || a.back || (a.rk || 0)) return null;
  const A = (walking && ANIM_SHEETS.walk) || ANIM_SHEETS.idle; return A.im.complete && A.im.naturalWidth ? A : null;
}
// ---- lesson effects (?anim=fx pilot): body motion + a floating wand with star sparkles, drawn by the game
const LESSON_FX = ANIM_MODE === 'fx' ? { charms: 1 } : null;
const TAIL_TIPS = { fernhorn: [0.9, 0.565], fernhorn_t1: [0.88, 0.6], fernhorn_t2: [0.88, 0.6] };   // fernhorn casts with the dandelion on its tail (share of width, height)
const CAST_POSES = { mothfox: [0.1, 0.183], mothfox_t1: [0.767, 0.067], mothfox_t2: [0.747, 0.194], petalear: [0.812, 0.167], petalear_t1: [0.792, 0.222], petalear_t2: [0.201, 0.178], starwhisker: [0.783, 0.228], starwhisker_t1: [0.802, 0.233], starwhisker_t2: [0.794, 0.222] };   // looks that have a «cast» picture: where the wand tip is (share of width, height)
for (const k of Object.keys(CAST_POSES)) { const im = new Image(); im.src = `assets/creatures/${k}_cast.png?v=2`; sprites[k + '_cast'] = im; }
function lessonSparks(F, a, s, z, h, w, fl) {   // star sparkles from the wand tip while the paw is up
  const now = F.T; a._fx ||= []; const P = a._fx;
  if (window.__fxProbe) { const m = ctx.getTransform(); window.__fxProbe[a.id] = [m.a * s.x + m.c * (s.y - z) + m.e, m.b * s.x + m.d * (s.y - z) + m.f, m.a * h]; }   // test hook: the feet on the canvas
  if ((F.castIm || F.tailOn) && F.tip) {
    const tx = s.x + (fl ? -1 : 1) * (F.tip[0] - 0.5) * w, ty = s.y - z - h + F.tip[1] * h;
    if (!a._fxLast || now - a._fxLast > 0.06) { a._fxLast = now; for (let k = 0; k < 3; k++) P.push({ x: tx, y: ty, vx: (Math.random() - 0.5) * h * 1.1, vy: (-Math.random() * 0.9 - 0.25) * h * 0.8, t0: now, life: 0.6 + Math.random() * 0.5, c: FX_COLS[Math.floor(Math.random() * FX_COLS.length)], r: h * (0.05 + Math.random() * 0.05) }); }
    if (typeof glowSprite === 'function') { const gs = h * 0.45; ctx.globalAlpha = 0.85; ctx.drawImage(glowSprite('255,225,150'), tx - gs / 2, ty - gs / 2, gs, gs); ctx.globalAlpha = 1; }
  }
  for (let k = P.length - 1; k >= 0; k--) { const q = P[k], u = now - q.t0; if (u > q.life || u < 0) { P.splice(k, 1); continue; }
    star4(q.x + q.vx * u, q.y + q.vy * u + u * u * h * 0.6, q.r * (1 - u / q.life * 0.5), q.c, 1 - u / q.life); }
  if (P.length > 50) P.splice(0, P.length - 50);
}
function lessonFx(a) {
  if (!LESSON_FX || a.state !== 'study' || !CLASSES[a.c] || !LESSON_FX[CLASSES[a.c].id] || !SPECIES.includes(a.sp)) return null;
  const T = performance.now() / 1000 + (a.id || 0) * 0.613, P = 2.6, ph = (T % P) / P;   // one cast every 2.6 s, students out of step
  const flick = ph > 0.5 && ph < 0.62 ? Math.sin((ph - 0.5) / 0.12 * Math.PI) : 0;      // the quick swing of the wand
  const look = a.sp + ((a.rk || 0) ? '_t' + Math.min(4, a.rk) : ''), CP = !a.back && CAST_POSES[look], ci = CP && sprites[look + '_cast'];
  const up = ph > 0.25 && ph < 0.9, castOn = !!(ci && ci.complete && ci.naturalWidth) && up, TT = !a.back && TAIL_TIPS[look];   // the paw is up most of the cast   // the paw is up for about a second of every cast
  return { T, ph, flick, kind: CLASSES[a.c].id, castIm: castOn ? ci : null, tip: CP || TT, tailOn: !!TT && up };
}
function lessonBody(F, s, z, h) {   // breathing, a slow sway, a little hop and lean into the cast; feet stay on the floor
  const br = 1 + 0.025 * Math.sin(F.T * 2.4), sw = Math.sin(F.T * 1.3) * 0.03 + F.flick * 0.06, hop = F.flick * h * 0.05;
  ctx.translate(s.x, s.y - z - hop); ctx.rotate(sw); ctx.scale(1 / Math.sqrt(br), br); ctx.translate(-s.x, -(s.y - z));
}
function star4(x, y, r, col, alpha) {
  ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath();
  for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, rr = k % 2 ? r * 0.38 : r; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}
const FX_COLS = ['#ffd75e', '#ffe9a8', '#c9a6ff', '#ff9fd8', '#ffffff'];
function lessonWand(F, a, s, z, h, fl) {   // the wand floats above the shoulder, swings, its tip throws sparkles
  const side = fl ? -1 : 1, bob = Math.sin(F.T * 2) * h * 0.03;
  const gx = s.x + side * h * 0.5, gy = s.y - z - h * 0.42 + bob;                          // the grip, in the air beside the head
  const ang = side * (0.75 - F.flick * 1.0 + Math.sin(F.T * 1.7) * 0.15), L = h * 0.5;     // tilted outwards, flicks over
  const tx = gx + Math.sin(ang) * L, ty = gy - Math.cos(ang) * L;
  if (window.__fxProbe) { const m = ctx.getTransform(); window.__fxProbe[a.id] = [m.a * s.x + m.c * (s.y - z) + m.e, m.b * s.x + m.d * (s.y - z) + m.f, m.a * h]; }   // test hook: the feet on the canvas
  ctx.lineCap = 'round'; ctx.strokeStyle = '#6b4226'; ctx.lineWidth = Math.max(3, h * 0.08); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = '#a8703f'; ctx.lineWidth = Math.max(1.5, h * 0.035); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
  const glow = 0.35 + 0.65 * Math.max(F.flick, 0.3 + 0.2 * Math.sin(F.T * 6));
  if (typeof glowSprite === 'function') { const gs = h * (0.6 + F.flick * 0.6); ctx.globalAlpha = glow; ctx.drawImage(glowSprite('255,220,140'), tx - gs / 2, ty - gs / 2, gs, gs); ctx.globalAlpha = 1; }
  star4(tx, ty, h * 0.11 * (0.8 + glow * 0.5), '#fff4c2', 1);
  // sparkles: born at the tip during the flick, drift out and fade
  const now = F.T; a._fx ||= []; const P = a._fx;
  if (F.flick > 0.15 && (!a._fxLast || now - a._fxLast > 0.04)) { a._fxLast = now; for (let k = 0; k < 4; k++) P.push({ x: tx, y: ty, vx: (Math.random() - 0.5 + side * 0.6) * h * 0.9, vy: (-Math.random() * 0.9 - 0.2) * h * 0.8, t0: now, life: 0.7 + Math.random() * 0.5, c: FX_COLS[Math.floor(Math.random() * FX_COLS.length)], r: h * (0.06 + Math.random() * 0.06) }); }
  for (let k = P.length - 1; k >= 0; k--) { const q = P[k], u = now - q.t0; if (u > q.life || u < 0) { P.splice(k, 1); continue; }
    star4(q.x + q.vx * u, q.y + q.vy * u + u * u * h * 0.6, q.r * (1 - u / q.life * 0.5), q.c, 1 - u / q.life); }
  if (P.length > 60) P.splice(0, P.length - 60);
}
function drawPilot(A, s, h, bob, z, fl, a, walking) {
  const k = Math.floor(performance.now() / 1000 * A.fps + (a.id || 0) * 5) % A.n, sx = (k % A.cols) * A.fw, sy = Math.floor(k / A.cols) * A.fh, sc = h / 180, dw = A.fw * sc, dh = A.fh * sc;
  ctx.save(); ctx.translate(s.x, s.y - z - (A === ANIM_SHEETS.walk ? 0 : bob)); if (fl) ctx.scale(-1, 1); ctx.drawImage(A.im, sx, sy, A.fw, A.fh, -dw / 2, -dh, dw, dh); ctx.restore();
}
function drawCreature(a, x, y, h, extra) {
  const sp0 = a.sp; h *= SP_H[sp0] || 1;   // world-2 wide creatures (snail, salamander) are drawn lower
  const cpose = courtPose(a); if (cpose) h *= cpose.naturalHeight / 420 * 1.18 * COURT_POSE_K;   // pose sheets keep their sizes relative to the tallest pose (420 px)
  const rk = SPECIES.includes(a.sp) ? (a.rk || 0) : 0, tr = Math.min(4, rk), mf = rk === 5 && sprites[a.sp + '_m' + (a.el || 0) + (a.back ? '_back' : '')];
  const tf = mf && mf.complete && mf.naturalWidth ? mf : tr && sprites[a.sp + '_t' + tr + (a.back ? '_back' : '')];
  if (rk === 5) {   // master of an element: a glow in the element's colour (until the masters get their own art)
    const s0 = P(x, y), c = ELEMS[a.el || 0].col, g = ctx.createRadialGradient(s0.x, s0.y - h * 0.5 - (a.z || 0), 2, s0.x, s0.y - h * 0.5 - (a.z || 0), h * 0.85);
    g.addColorStop(0, `rgba(${c},0.55)`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s0.x, s0.y - h * 0.5 - (a.z || 0), h * 0.85, 0, Math.PI * 2); ctx.fill();
  }
  if (tf && tf.complete && tf.naturalWidth) a = { ...a, sp: a.sp + '_t' + tr, back: false, _tierImg: tf };
  if (rk === 5) h *= 1.12;   // masters stand a little taller
  const bk = a.back && sprites[a.sp + '_back'], im = cpose ? cpose : a._tierImg ? a._tierImg : bk && bk.complete && bk.naturalWidth ? bk : sprites[a.sp];
  const s = P(x, y);
  const walking = (a.path && a.path.length > 0 && !(a.pauseT > 0)) || a._panic;
  const crawl = CRAWLERS[sp0], cr = crawl && walking ? Math.sin(a.ph * 5) : 0;   // a snail does not hop: its body stretches and pulls up as it crawls
  const bob = crawl ? 0 : walking ? Math.abs(Math.sin(a.ph * 9)) * 2 : Math.sin(a.ph * 2) * 0.6, sx = 1 + 0.07 * cr, sy = 1 - 0.045 * cr;
  const fl = FACES_LEFT[sp0] && (a._tierImg || im !== bk) ? !a.flip : a.flip;
  const AP = animPilot(a, sp0, cpose, walking);   // animation pilot (?anim=)   // the snail pictures look left (all but the plain back view), the code expects right
  const z = a.z || 0;
  if (!a._ghost) ctx.drawImage(creatureShadow(), s.x - h * 0.3, s.y - h * 0.12, h * 0.6, h * 0.24);   // cached oval (was a path fill per creature per frame)
  if (SP_GLOW[sp0] && !a._ghost) { ctx.globalAlpha = 0.32; const gs = h * 1.5; ctx.drawImage(glowSprite('185,205,255'), s.x - gs / 2, s.y - bob - z - h * 0.55 - gs / 2, gs, gs); ctx.globalAlpha = 1; }   // rim light: dark creatures stay visible in the cave
  const FXL = lessonFx(a); if (FXL) { ctx.save(); lessonBody(FXL, s, z, h); }   // lesson effect pilot (?anim=fx)
  if (AP) drawPilot(AP, s, h, bob, z, fl, a, walking);
  else if (FXL && FXL.castIm) { const ci = FXL.castIm, w = h * ci.naturalWidth / ci.naturalHeight, sm = sized(ci, h * scale * dpr); ctx.drawImage(fl ? flipped(sm) : sm, s.x - w / 2, s.y - bob - z - h, w, h); FXL.w = w; }   // the casting pose
  else if (im && im.complete && im.naturalWidth) { const w = h * im.naturalWidth / im.naturalHeight; const sm = sized(im, h * scale * dpr); ctx.drawImage(fl ? flipped(sm) : sm, s.x - w * sx / 2, s.y - bob - z - h * sy, w * sx, h * sy); 
    if (sp0 === 'mossmole' && !a._tierImg) { const lg = glowSprite('255,240,170'), r = h * 0.32; ctx.globalAlpha = 0.75; for (const fx of [0.1, 0.9]) ctx.drawImage(lg, s.x - w / 2 + w * (a.flip ? 1 - fx : fx) - r / 2, s.y - bob - z - h * 0.985 - r / 2, r, r); ctx.globalAlpha = 1; } }   // the lanterns on its antennae glow   // no save/restore per creature, a small copy of the sprite (build 207)
  else { ctx.fillStyle = '#ffd6e8'; ctx.beginPath(); ctx.ellipse(s.x, s.y - bob - z - h / 2, h / 2.6, h / 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
  if (FXL) { ctx.restore(); lessonSparks(FXL, a, s, z, h, FXL.w || h, fl); }   // the student casts by itself (no floating wand)
  if (rk === 5) {   // twinkling sparks of the element orbit a master: rarity you can see from afar
    const T = performance.now() / 1000 + (a.ph || 0), c = ELEMS[a.el || 0].col;
    for (let k = 0; k < 3; k++) {
      const ang = T * 1.4 + k * 2.09, px = s.x + Math.cos(ang) * h * 0.48, py = s.y - z - h * 0.55 + Math.sin(ang) * h * 0.28, tw = 0.5 + 0.5 * Math.sin(T * 5 + k * 1.7), r = 2 + 2.2 * tw;
      ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * tw; ctx.fillStyle = '#fff'; ctx.strokeStyle = `rgb(${c})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py - r * 1.6); ctx.lineTo(px + r * 0.45, py - r * 0.45); ctx.lineTo(px + r * 1.6, py); ctx.lineTo(px + r * 0.45, py + r * 0.45); ctx.lineTo(px, py + r * 1.6); ctx.lineTo(px - r * 0.45, py + r * 0.45); ctx.lineTo(px - r * 1.6, py); ctx.lineTo(px - r * 0.45, py - r * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }
  if (extra) extra(s.x, s.y - z);
}
function ring(x, y, frac, color = '#3fbf6f') {
  if (zoom < 1.2) return;   // too small to read from afar: skip (build 207, speed)
  ctx.fillStyle = '#ffffffe6'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 4.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
}
function drawHat(x, y, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y, 10, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  emoji('⭐', x, y - 7, 6);
}
function drawCounter(p, top = '#d9a36e', side = '#a8713f', hw = 0.55) {   // a plain box: canteen counter and tables until the art is in
  const a = P(p.x - hw, p.y - 0.28), b = P(p.x + hw, p.y - 0.28), cc = P(p.x + hw, p.y + 0.28), d = P(p.x - hw, p.y + 0.28);
  const h = 10;
  poly(ctx, [d, cc, up(cc, h), up(d, h)], side);
  poly(ctx, [cc, b, up(b, h), up(cc, h)], side);
  poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], top, '#8a5f3a');
}
// ======================= living classes =======================
// Effects of a lesson over the students who are really studying (state 'study', seated, no incident), one theme per class
// (her plan 2026-11-22). Drawn in code, no new art; every looping phase lasts at least ~2.5 s (her rule: nothing may blink).
const fxNow = () => performance.now() / 1000;
let FX_DEMO = false;   // test only (__test.fxDemo): every desk acts as if a student studies there
function studentAt(i, d) {   // the student studying at desk d of class i right now, or null
  if (FX_DEMO) return { id: i * 31 + d + 1, t: ((fxNow() + d * 0.9) % 4) / 4, dur: 1 };
  const id = deskOcc[i][d]; if (!id) return null;
  const a = agentById.get(id);
  return a && a.state === 'study' && !(a.path && a.path.length) && !incOf(i) ? a : null;
}
let agentById = new Map(), fxTop = [];   // fxTop: effects drawn above everything in the room (steam, sparks)
function fxLeaf(x, y, r, ang, col = '#7cc36a', line = '#3f7a3a') {   // a small leaf: pointed ellipse with a midrib
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.strokeStyle = line; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, -r * 0.62, r, 0); ctx.quadraticCurveTo(0, r * 0.62, -r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(r * 0.8, 0); ctx.stroke();
  ctx.restore();
}
// Herbology: a clay pot on every desk; while a student studies, a sprout grows in it over the lesson (bud at the end),
// sways slowly, and a leaf circles around it (one turn = 7 s)
function herbsDeskFx(i, d, p) {
  const a = studentAt(i, d), m = P(p.x + 0.34, p.y - 0.06), bx = m.x, by = m.y - 9;   // the desk top is 9 px high
  if (a) {
    const g = Math.max(0, Math.min(1, a.t / a.dur)), T = fxNow() + a.id * 0.77, sway = Math.sin(T * Math.PI * 2 / 4.2) * (0.6 + g);
    const h = 4 + 13 * g, tx = bx + sway * 1.6, ty = by - 5.5 - h;
    ctx.strokeStyle = '#4f9a45'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by - 5.5); ctx.quadraticCurveTo(bx - sway * 0.6, by - 5.5 - h * 0.55, tx, ty); ctx.stroke();
    const pairs = 1 + Math.floor(g * 2.99);
    for (let k = 0; k < pairs; k++) {
      const f = (k + 1) / (pairs + 0.6), lx = bx + (tx - bx) * f, ly = by - 5.5 - h * f, r = 2 + 2.2 * Math.min(1, g * 1.5) * (1 - k * 0.18);
      fxLeaf(lx - r * 0.85, ly, r, -0.5 + sway * 0.08); fxLeaf(lx + r * 0.85, ly, r, Math.PI + 0.5 + sway * 0.08);
    }
    if (g > 0.75) { const b = (g - 0.75) / 0.25, col = ['#ff8fc0', '#c79bff', '#ffd25a', '#8fd0ff'][a.id % 4];   // a bud opens at the end of the lesson
      ctx.fillStyle = col; ctx.strokeStyle = '#7a4a9a'; ctx.lineWidth = 0.6;
      for (let k = 0; k < 5; k++) { const an = k * 1.2566 + sway * 0.1; ctx.beginPath(); ctx.ellipse(tx + Math.cos(an) * 1.9 * b, ty + Math.sin(an) * 1.9 * b, 1.6 * b + 0.3, 1.1 * b + 0.3, an, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.arc(tx, ty, 1.1 * b + 0.2, 0, Math.PI * 2); ctx.fill(); }
  }
  // the pot (in front of the stem's base)
  ctx.fillStyle = '#c9744c'; ctx.strokeStyle = '#6b4a7a'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(bx - 3.4, by - 5); ctx.lineTo(bx + 3.4, by - 5); ctx.lineTo(bx + 2.4, by + 0.5); ctx.lineTo(bx - 2.4, by + 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#dd8d62'; rr(bx - 4, by - 6.6, 8, 2.2, 1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a3a2a'; ctx.beginPath(); ctx.ellipse(bx, by - 6.5, 3, 0.8, 0, 0, Math.PI * 2); ctx.fill();
  if (a) {   // a leaf drifts around the pot: slow circle, rising and falling
    const T = fxNow() + a.id * 1.31, ang = T * Math.PI * 2 / 7, lx = bx + Math.cos(ang) * 12, ly = by - 15 + Math.sin(ang) * 4.5 - Math.sin(T * Math.PI * 2 / 5) * 3;
    fxLeaf(lx, ly, 3.4, ang * 1.5, '#8fd66a', '#3f7a3a');
  }
}
// Potions: the cauldron of a studying student bubbles (bubbles rise and pop, 2.6 s each) and lets off steam of its colour (3.4 s puffs)
const POT_LIQ = { station_pink: [242, 150, 205], station_green: [140, 215, 140], station_purple: [190, 150, 240] };
function potionsFx(i, d, p, o) {
  const a = studentAt(i, d); if (!a) return;
  const im = part(o.th, o.n); if (!im) return;
  const h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30, w = h * im.naturalWidth / im.naturalHeight;
  const m = P(o.x, o.y), sx = m.x + (o.flip ? -1 : 1) * w * 0.04, sy = m.y + h * 0.08 - h * 0.76;   // middle of the brew's surface
  const c = POT_LIQ[o.n] || [200, 170, 240], T = fxNow() + a.id * 0.61;
  fxTop.push(() => { for (let k = 0; k < 3; k++) {   // steam (above the students): soft coloured puffs rising and spreading, 3.6 s each
    const u = ((T + k * 1.2) / 3.6) % 1, r = 3.5 + u * 8, y = sy - 5 - u * 34, x = sx + Math.sin((T + k) * 1.1) * 3 + (k - 1) * 3 * u;
    const al = Math.sin(u * Math.PI) * (u < 0.15 ? u / 0.15 : 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);   // a soft wisp, no hard edge
    g.addColorStop(0, `rgba(${Math.min(255, c[0] + 30)},${Math.min(255, c[1] + 30)},${Math.min(255, c[2] + 30)},${0.7 * al})`); g.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},${0.38 * al})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  } });
  for (let k = 0; k < 3; k++) {   // bubbles: grow on the surface, rise a little, pop into a ring
    const u = ((T + k * 0.87) / 2.6) % 1, bx = sx + (k - 1) * 3.4 + Math.sin(k * 2.1 + a.id) * 1.2;
    if (u < 0.82) { const v = u / 0.82, r = 0.8 + 1.9 * v, by = sy - v * 5;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.9)`; ctx.strokeStyle = `rgba(${c[0] * 0.55 | 0},${c[1] * 0.45 | 0},${c[2] * 0.6 | 0},0.9)`; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(bx - r * 0.35, by - r * 0.35, r * 0.32, 0, Math.PI * 2); ctx.fill(); }
    else { const v = (u - 0.82) / 0.18, by = sy - 5;   // pop
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - v)})`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(bx, by, 2.7 + v * 3, 0, Math.PI * 2); ctx.stroke();
      for (let q = 0; q < 4; q++) { const an = q * 1.5708 + 0.6; ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${1 - v})`; ctx.beginPath(); ctx.arc(bx + Math.cos(an) * (3 + v * 4), by + Math.sin(an) * (3 + v * 4) * 0.7, 0.8, 0, Math.PI * 2); ctx.fill(); } }
  }
}
// Stargazing: three little stars twinkle above the lens of a busy telescope (each fades in and out over 2.8-3.8 s);
// while anyone studies, a comet crosses the room once every 11 s (the flight takes 3 s)
function fxStar(x, y, r, al, col = '255,236,150') {
  ctx.save(); ctx.globalAlpha = al;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6); g.addColorStop(0, `rgba(${col},0.7)`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fffbe8'; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x + r * 0.4, y - r * 0.4); ctx.lineTo(x + r * 1.6, y); ctx.lineTo(x + r * 0.4, y + r * 0.4); ctx.lineTo(x, y + r * 1.6); ctx.lineTo(x - r * 0.4, y + r * 0.4); ctx.lineTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.4, y - r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
let fxCometDone = new Set();
function starsFx(i, d, p, o) {
  const a = studentAt(i, d); if (!a) return;
  const im = part(o.th, o.n); if (!im) return;
  const h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30, w = h * im.naturalWidth / im.naturalHeight;
  const m = P(o.x, o.y), lx = m.x + (o.flip ? -1 : 1) * w * (o.n === 'st_desk' ? -0.12 : 0.17), ly = m.y + h * 0.08 - h * (o.n === 'st_desk' ? 0.98 : 0.95);   // the big end of the tube
  const T = fxNow() + a.id * 0.53, cols = ['255,236,150', '200,220,255', '255,200,235'];
  if (o.n === 'st_desk' && Math.floor((fxNow() + a.id * 3.7) / 9) % 2 === 0) { const qx = m.x + (o.flip ? 1 : -1) * w * 0.08, qy = m.y - h * 0.55, u = (T * 0.8) % 1; fxTop.push(() => fxStar(qx + Math.sin(T * 5) * 3, qy - u * 6, 2.2, 0.9 - u * 0.6, '255,226,140')); return; }   // writing phase: a golden quill sparkle over the parchment
  fxTop.push(() => { for (let k = 0; k < 3; k++) {
    const per = 2.8 + k * 0.5, u = ((T + k * 1.1) / per) % 1, al = Math.pow(Math.sin(u * Math.PI), 1.5);
    const an = -1.9 + k * 0.75 + Math.sin(a.id + k) * 0.3, dist = 9 + k * 4;
    fxStar(lx + Math.cos(an) * dist, ly + Math.sin(an) * dist * 0.8, 1.4 + 0.9 * al, 0.25 + 0.75 * al, cols[(k + a.id) % 3]);
  } });
  if (!fxCometDone.has(i)) {   // one comet per class, at most
    fxCometDone.add(i);
    const u = ((fxNow() + i * 4.3) / 11) % 1;
    if (u < 3 / 11) {
      const v = u / (3 / 11), s = slotOf(i), A0 = P(s.x0, s.y0 + 3.6), B0 = P(s.x0 + 4.6, s.y0);   // across the back walls, high up: left wall -> right wall
      const A = { x: A0.x, y: A0.y - 78 }, B = { x: B0.x, y: B0.y - 50 };
      const x = A.x + (B.x - A.x) * v, y = A.y + (B.y - A.y) * v - Math.sin(v * Math.PI) * 8, al = Math.min(1, Math.sin(v * Math.PI) * 1.6);
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), tx = x - dx / L * 44, ty = y - dy / L * 44;
      fxTop.push(() => { ctx.save(); ctx.globalAlpha = al;
        const g = ctx.createLinearGradient(tx, ty, x, y); g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(255,245,215,0.95)');
        ctx.strokeStyle = g; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore(); fxStar(x, y, 3, al, '255,226,140'); });
    }
  }
}
// Charms: the spellbook over a busy lectern glows softly and every 4 s a spell bursts from it: little stars drift out
// and fade over 2.5 s (pink, gold, lilac), drawn above the students
function charmsFx(i, d, p, o) {
  const a = studentAt(i, d); if (!a) return;
  const im = part(o.th, o.n); if (!im) return;
  const h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30;
  const m = P(o.x, o.y), bx = m.x + (o.flip ? -1 : 1) * h * 0.16, by = m.y + h * 0.08 - h * 0.78;   // the floating book
  const T = fxNow() + a.id * 1.37, u = (T / 4) % 1, cols = ['255,140,200', '255,214,90', '190,150,255'];
  fxTop.push(() => {
    const gl = 0.35 + 0.25 * Math.sin(T * Math.PI * 2 / 3), g = ctx.createRadialGradient(bx, by, 0, bx, by, 13);   // soft glow, 3 s pulse
    g.addColorStop(0, `rgba(255,220,250,${gl})`); g.addColorStop(1, 'rgba(255,220,250,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fill();
    const v = u / 0.62; if (v > 1) return;   // the burst lasts 2.5 s of the 4 s cycle
    const ease = 1 - Math.pow(1 - v, 2), al = v < 0.12 ? v / 0.12 : 1 - (v - 0.12) / 0.88;
    for (let k = 0; k < 6; k++) {
      const an = k * Math.PI / 3 + a.id * 0.7, dist = 3 + 12 * ease * (0.8 + 0.3 * ((k * 7 + a.id) % 3) / 2);   // a ring of stars spreading from the book, rising a little
      fxStar(bx + Math.cos(an) * dist, by + Math.sin(an) * dist * 0.6 - v * 7, 1.1 + 0.6 * (1 - v), Math.max(0, al), cols[(k + a.id) % 3]);
    }
  });
}
// Flight: a busy cloud floats up and down with its student (one slow wave = 4.5 s) and a feather drifts down past them (6 s fall)
const flightLift = (id) => 4 + 4 * Math.sin((fxNow() + id * 0.83) * Math.PI * 2 / 4.5);
function flightFx(i, d, p, o) {
  const a = studentAt(i, d); if (!a) return;
  const m = P(o.x, o.y), T = fxNow() + a.id * 1.9, u = (T / 6) % 1, al = Math.min(1, Math.sin(u * Math.PI) * 2);
  const fx = m.x + 9 + Math.sin(u * Math.PI * 3) * 6, fy = m.y - 58 + u * 52;
  fxTop.push(() => { ctx.save(); ctx.globalAlpha = al * 0.95; emoji('🪶', fx, fy, 9); ctx.restore(); });
}
// Elements: the crystal of a busy pedestal glows in its colour (3 s pulse) and its element plays above it:
// fire - embers rise (2.8 s), water - drops circle and fall back (3 s), earth - two leaves circle (5 s), air - a little whirl turns (3 s)
const EL_ST = { cr_fire: [0, '255,120,40'], cr_water: [1, '70,170,245'], cr_earth: [2, '100,175,60'], cr_air: [3, '235,150,215'] };
function elementsFx(i, d, p, o) {
  const a = studentAt(i, d); if (!a) return;
  const [el, col] = EL_ST[o.n] || [0, '255,200,120'], h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30;
  const m = P(o.x, o.y), cx = m.x, cy = m.y + h * 0.08 - h * 0.8, T = fxNow() + a.id * 0.91;
  fxTop.push(() => {
    const gl = 0.3 + 0.2 * Math.sin(T * Math.PI * 2 / 3), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    g.addColorStop(0, `rgba(${col},${gl})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    if (el === 0) for (let k = 0; k < 3; k++) { const u = ((T + k * 0.93) / 2.8) % 1, x = cx + Math.sin(u * 6 + k * 2) * 4, y = cy - 6 - u * 24, r = 2.8 * (1 - u) + 0.8;
      ctx.fillStyle = `rgba(255,${200 - u * 120 | 0},60,${Math.sin(u * Math.PI)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,250,200,${0.8 * Math.sin(u * Math.PI)})`; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
    else if (el === 1) for (let k = 0; k < 3; k++) { const an = T * Math.PI * 2 / 3 + k * 2.094, x = cx + Math.cos(an) * 11, y = cy - 9 + Math.sin(an) * 4, r = 2.5 + 0.5 * Math.sin(an);
      ctx.fillStyle = 'rgba(120,200,255,0.9)'; ctx.strokeStyle = 'rgba(40,110,190,0.9)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.quadraticCurveTo(x + r, y - r * 0.2, x, y + r); ctx.quadraticCurveTo(x - r, y - r * 0.2, x, y - r * 1.8); ctx.fill(); ctx.stroke(); }
    else if (el === 2) for (let k = 0; k < 2; k++) { const an = T * Math.PI * 2 / 5 + k * Math.PI; fxLeaf(cx + Math.cos(an) * 12, cy - 9 + Math.sin(an) * 4.5, 3.6, an * 1.3, '#8fd66a', '#3f7a3a'); }
    else { ctx.save(); ctx.translate(cx, cy - 10); ctx.rotate(T * Math.PI * 2 / 3); ctx.lineCap = 'round';   // the whirl: three arcs turning
      for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(${col},${0.8 - k * 0.2})`; ctx.lineWidth = 1.8 - k * 0.35; ctx.beginPath(); ctx.arc(0, 0, 5 + k * 4, k * 2.1, k * 2.1 + 2.4); ctx.stroke(); }
      ctx.restore(); }
  });
}
// Exam: a quill writes on the scroll of a busy exam desk (glides along the line for 3 s, then the next line) and the written
// lines grow with the exam; a passed exam stamps a red wax seal with a gold star over the desk (2.6 s)
let fxSeals = [];
function examFx(i, d, p, o) {
  const a = studentAt(i, d); if (!a) return;
  const h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30, m = P(o.x, o.y), sgn = o.flip ? -1 : 1;
  const sx = m.x + sgn * h * 0.08, sy = m.y + h * 0.08 - h * 0.66, T = fxNow() + a.id * 0.7, g = Math.max(0, Math.min(1, a.t / a.dur));
  const lines = Math.min(3, Math.floor(g * 3.2));
  fxTop.push(() => {
    ctx.strokeStyle = 'rgba(70,50,110,0.75)'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
    for (let k = 0; k <= lines && k < 3; k++) { const len = k < lines ? 1 : ((T / 3) % 1), y = sy - 2 + k * 2.2; ctx.beginPath(); ctx.moveTo(sx - 5, y); ctx.lineTo(sx - 5 + 10 * len, y + 0.6 * len); ctx.stroke(); }
    const u = (T / 3) % 1, qx = sx - 5 + 10 * u, qy = sy - 2 + Math.min(2, lines) * 2.2 - 6 + Math.sin(u * Math.PI * 6) * 0.8;
    emoji('🪶', qx + 3, qy, 10);
  });
}
function examSeal(i, d) { const p = deskPos(i, d); fxSeals.push({ x: p.x, y: p.y, t: fxNow() }); if (fxSeals.length > 30) fxSeals.shift(); }
function drawSeals() {
  const now = fxNow(); fxSeals = fxSeals.filter((q) => now - q.t < 2.6);
  for (const q of fxSeals) {
    const v = (now - q.t) / 2.6, m = P(q.x, q.y); if (!onScreen(m.x, m.y)) continue;
    const sc = v < 0.15 ? 1.4 - 0.4 * (v / 0.15) : 1, al = v > 0.7 ? 1 - (v - 0.7) / 0.3 : 1, x = m.x, y = m.y - 30 - v * 6, r = 7 * sc;
    ctx.save(); ctx.globalAlpha = al;
    if (v < 0.3) { const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6); g.addColorStop(0, `rgba(255,230,150,${0.7 * (1 - v / 0.3)})`); g.addColorStop(1, 'rgba(255,230,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill(); }   // the flash
    ctx.fillStyle = '#c8323c'; ctx.strokeStyle = '#7a1424'; ctx.lineWidth = 0.9; ctx.beginPath();
    for (let k = 0; k <= 24; k++) { const an = k / 24 * Math.PI * 2, rr2 = r * (1 + 0.08 * Math.sin(an * 5)); k ? ctx.lineTo(x + Math.cos(an) * rr2, y + Math.sin(an) * rr2) : ctx.moveTo(x + rr2, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,160,160,0.6)'; ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, Math.PI * 2); ctx.stroke();
    ctx.restore(); fxStar(x, y, r * 0.38, al, '255,214,90');
  }
}
const STATION_FX = { potions: potionsFx, stars: starsFx, charms: charmsFx, flight: flightFx, elements: elementsFx, final: examFx };
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
const director = { sp: 'starwhisker', ph: 0.9, flip: true, path: [] };

// ======================= guided tour =======================
// Each step: camera focus in tile coords (null = stay), title and text (Russian UI).
const TOUR_W1 = [
  { at: () => [(SLOTS.REC.x0 + SLOTS.REC.x1) / 2, SLOTS.REC.y0 + 4], title: 'Привет, директор! 👋', text: 'Это твоя Школа магии. Сюда приходят маленькие волшебные зверьки, чтобы учиться. Школа работает сама, даже когда игра закрыта. Давай покажу, как тут всё устроено.' },
  { at: () => [GATE_TILE.x, GATE_TILE.y - 1], title: 'Ворота', text: 'Новые ученики приходят через ворота. Чем лучше «Объявления о школе» (улучшаются в приёмной), тем чаще они приходят.' },
  { at: () => [OFFICER.x + 0.3, OFFICER.y], title: 'Приёмная и секретарь', text: 'Секретарь в розовой шляпе записывает новичков. Они стоят к ней в очереди, оранжевый кружок над ней — запись идёт. За каждого записанного ты получаешь взнос 🪙. Нажми на приёмную, чтобы сделать секретаря быстрее.' },
  { at: () => [(SLOTS.REC.x0 + SLOTS.REC.x1) / 2, SLOTS.REC.y0 - 4], title: 'Общий коридор', text: 'Записавшись, ученик идёт по коридору в свой класс. Все классы соединены этим коридором: ученики проходят их по порядку, один за другим.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Класс и урок', text: 'В классе ученик садится за парту. Учитель в фиолетовой шляпе ведёт урок. Зелёный кружок над учеником — сколько осталось до конца урока.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Экзамен', text: 'После урока экзамен. Сдал — платит за обучение 🪙 и идёт в следующий класс. Шанс сдать зависит от учителя и обстановки. Нажми на класс: там можно улучшить учителя, добавить парты, сократить урок и купить предметы.' },
  { at: () => [(SLOTS.LIB.x0 + SLOTS.LIB.x1) / 2, (SLOTS.LIB.y0 + SLOTS.LIB.y1) / 2], title: 'Библиотека 📚', text: 'Не сдал экзамен — идёт в библиотеку готовиться (жёлтый кружок). Потом возвращается в класс и пересдаёт. После подготовки урок у него короче, а шанс сдать выше.' },
  { at: () => { const [, h] = slotOf(1).door; return [h[0] + 0.5, h[1] + 1]; }, title: 'Очередь у класса', text: 'У двери каждого класса может ждать до 6 учеников. Если все места за партами заняты и очередь полная, ученик идёт ждать в Волшебный двор ⛲.' },
  { at: () => (COURT ? [courtC().x, courtC().y] : null), title: 'Волшебный двор ⛲', text: 'Посередине школы — двор с фонтаном. Здесь ждут свободной парты (настроение растёт) и отдыхают на переменах: гуляют, читают, бросают монетку в фонтан. Нажми на фонтан, чтобы поставить больше скамеек и прокачать фонтан.' },
  { at: () => [(SLOTS.DORM.x0 + SLOTS.DORM.x1) / 2, SLOTS.DORM.y0 + 3], title: 'Спальня и консьержка 🛏️', text: 'Когда и во дворе нет места, ученик идёт в спальню. Консьержка в зелёной шляпе записывает гостя, и он спит 💤, пока в его классе не освободится место. Если и кроватей нет — ученик уходит из школы 💔. Нажми на спальню, чтобы купить кровати.' },
  { at: () => [14.5, SLOTS.EXAM.y0 + 3], title: 'Финальный экзамен 📜', text: 'Кто прошёл все открытые классы, идёт в Экзаменационный зал в самом конце коридора и сдаёт финальный экзамен. Не сдал — готовится в библиотеке и пересдаёт. Нажми на зал, чтобы улучшить экзаменатора и обстановку.' },
  { at: () => [(SLOTS.GARDEN.x0 + SLOTS.GARDEN.x1) / 2, SLOTS.GARDEN.y0 + 3], title: 'Выпускники 🎓', text: 'Сдал финальный экзамен — выпускник! Он идёт в Сад выпускников и исчезает в волшебном огне ✨, а школе оставляет отзыв ⭐ — из отзывов складывается рейтинг школы 🏅. Число выпускников видно вверху экрана.' },
  { at: () => [(slotOf(2).x0 + slotOf(2).x1) / 2, (slotOf(2).y0 + slotOf(2).y1) / 2], title: 'Новые классы', text: 'На пустых местах можно построить новые классы — нажми на табличку с ценой. Чем больше классов, тем больше ученики платят за обучение.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Происшествия 💥', text: 'Иногда в классе что-то случается: взорвался котёл, растения опутали парты, учитель простыл. Ученики носятся по классу, урок стоит, над классом горит «Нажми!». Нажми на класс — и всё снова в порядке. Если не трогать, через 10 минут пройдёт само, но школа потеряет монеты.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Настроение 😊', text: 'Долгие очереди и ожидание в спальне огорчают учеников 😟, уроки и библиотека радуют 😄. Весёлые сдают экзамены лучше. Совсем грустный ученик 😭 может уйти домой. Добавляй парты и сокращай уроки, чтобы никто долго не ждал.' },
  { at: null, title: 'Инспектор и звёзды ⭐', text: 'Раз в 12 минут приходит инспектор 🧐 и проверяет что-то одно: настроение, очереди, происшествия, экзамены или заработок. За 40 секунд слева вверху появится жёлтая карточка — там написано, что он будет проверять. Прошла проверку — получаешь звезду школы: она даёт +3% к плате за уроки, а звёзды нужны для новых классов.' },
  { at: null, title: 'Спокойный режим 😌', text: 'Не хочется проверок? В ⚙️ можно включить спокойный режим — инспектор не будет приходить. Когда захочешь заработать звёзды, просто выключи его.' },
  { at: null, title: 'Последнее 💡', text: 'Вверху: 🪙 монеты, 📈 доход в минуту (нажми — «Казна школы»), 🎓 выпускники. Под ними: 🏅 рейтинг, 🏆 топ школ, 🤝 альянсы, 🧪 мини-игра «Зельеварка», ⭐ звёзды школы и 👥 ученики (нажми — увидишь, где они). Справа внизу 📋 задания от летописца Тихона: кнопка «Выполнить» сама откроет нужное место. Слева внизу 🗺️ другие миры и 🎓 альбом учеников. Нажми на зверька — увидишь, что он делает. Повторить обучение можно в ⚙️. Удачи, директор!' },
];
const roomAt = (id, dy = 0) => () => { const s = SLOTS[id]; return s ? [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2 + dy] : null; };
const clsAt = (id) => () => { const i = CLASSES.findIndex((c) => (id === 'final' ? c.final : c.id === id)); const s = i >= 0 && SLOTS[CLASS_SLOT[i]]; return s ? [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2] : null; };
// world 2 had no tour at all (it showed the world-1 text from ⚙️)
const TOUR_W2 = [
  { at: roomAt('REC'), title: 'Добро пожаловать под гору! ⛏️', text: 'Это второй мир — гномья школа в пещере под горой. Сюда приходят пещерные зверьки учиться рунам и ремёслам. Многое устроено как в Школе магии, но здесь своё хозяйство: руда, изделия и караваны.' },
  { at: roomAt('REC'), title: 'Привратный зал', text: 'Привратница записывает новичков, за каждого школа получает взнос 🪙. Нажми на зал, чтобы она работала быстрее, а «Объявления» звали учеников чаще.' },
  { at: clsAt('runes'), title: 'Залы и уроки', text: 'Ученики проходят залы по порядку: урок, экзамен, плата за обучение 🪙. Нажми на зал: там учитель, парты, предметы и экзамен на звание.' },
  { at: clsAt('mine'), title: 'Руда и Кузня ⚒️', text: 'В Штольне ⛏️ ученики добывают руду, она копится на складе (вверху ⛏️). В Кузне ⚒️ из 2 руды куют изделие. Без руды урок в Кузне приносит половину платы — следи за складом и расширяй его в Штольне.' },
  { at: clsAt('gems'), title: 'Самоцветы 💎', text: 'В Гранильне ученики иногда гранят самоцвет — он стоит дорого и уезжает с караваном.' },
  { at: roomAt('TRADE'), title: 'Торговый двор 🐐', text: 'Изделия ⚒️ и самоцветы 💎 грузятся в повозку. Полная повозка сама уходит с караваном и возвращается с монетами. Улучшай повозку, дорогу и цену.' },
  { at: roomAt('DORM'), title: 'Кельи 🛏️', text: 'Если у зала нет места, ученик ждёт в Кельях. Когда заняты все кельи, новички не приходят — школа переполнена. Добавляй парты и кровати.' },
  { at: clsAt('final'), title: 'Палата клятв и Зал славы 🎓', text: 'В конце — Палата клятв, финальный экзамен. Выпускник идёт в Зал славы и исчезает в свете кристалла.' },
  { at: null, title: 'Последнее 💡', text: 'Вверху ⛏️ ⚒️ 💎 — руда, изделия и самоцветы. Справа внизу 📋 задания ведут по шагам. 🧪 Зельеварка, 🏅 рейтинг, 🏆 топ и 🤝 альянсы работают и здесь. В Школу магии можно вернуться через 🗺️ слева внизу. Обучение повторяется в ⚙️.' },
];
const TOUR = WORLD === 2 ? TOUR_W2 : TOUR_W1;
// Short intros of the features added since build 237 (2026-11-23): shown once, when the feature opens, with the camera on it;
// one at a time, never over a panel, the mini-game or the tour, at least INTRO_GAP s apart. The world-1 tour itself covers 'court'.
const INTRO_GAP = 60;
const INTROS = [
  { key: 'court', when: () => WORLD === 1 && !!COURT && S.stats.graduated >= 3, steps: () => [TOUR_W1.find((t) => t.title.startsWith('Волшебный двор'))] },
  { key: 'mg', when: () => S.stats.graduated >= 10, steps: () => [WORLD === 2 ? { at: null, title: 'Мини-игры ✨', text: 'Вверху есть кнопка 🧪 — мини-игры этого мира: «Огранка самоцветов», «Башня из руды» и «Вагонетка в штольне». За игру школа получает монеты, за 2–3 звезды ещё ✨ Вдохновение (плата за уроки +10%). Попытки копятся: +1 каждый час.' } : { at: null, title: 'Зельеварка 🧪', text: 'Вверху есть кнопка 🧪 — мини-игра «Зельеварка». Меняй местами ингредиенты, собирай три в ряд и вари зелья по рецепту. За игру школа получает монеты, за 2–3 звезды ещё ✨ Вдохновение (плата за уроки +10%). Попытки копятся: +1 каждые 20 минут.' }] },
  { key: 'dir', when: () => WORLD === 1 && (dirBuilt() || isOpen(2)), steps: () => [
    { at: roomAt('DIR'), title: 'Кабинет директора 👑', text: dirBuilt() ? 'В кабинете директора ты выбираешь договор с учениками, запускаешь рекламные акции 📣, отвечаешь на письма родителей ✉️ и улучшаешь правила школы.' : `Здесь можно построить кабинет директора 👑 (🪙${fmt(DIR_COST)} и ⭐ ${DIR_STARS} звезды школы — их дают проверки инспектора). В нём выбирают договор с учениками, запускают рекламные акции и отвечают на письма родителей.` },
    { at: roomAt('DIR'), title: 'Летописец Тихон 🐢', text: 'В кабинете живёт летописец Тихон. Он иногда гуляет по школе — нажми на него, и он расскажет, что в школе не так и что улучшить. Задания 📋 тоже от него.' }] },
  { key: 'shop', when: () => WORLD === 1 && isOpen(2), steps: () => [
    { at: roomAt('SHOP'), title: 'Лавка 🛍️', text: 'Между уроками ученики заходят в лавку за сладостями: школа получает монеты, а у ученика поднимается настроение. Нажми на лавку, чтобы её открыть и улучшить.' },
    { at: roomAt('CANT'), title: 'Столовая 🍽️', text: 'После урока часть учеников идёт обедать к повару-дракончику. Обед — это монеты и настроение, а сытый ученик легче сдаёт следующий экзамен.' }] },
  { key: 'tower2', when: () => WORLD === 2 && isOpen(NCLS - 1), steps: () => [{ at: roomAt('TOWER'), title: 'Чертог Хранителей 🗝️', text: 'Лучшие выпускники — Старшие мастера и Хранители — могут остаться жить в Чертоге Хранителей и приносить школе монеты. Старший мастер оттуда иногда пересдаёт экзамен на Хранителя.' }] },
  { key: 'tower', when: () => WORLD === 1 && isOpen(NCLS - 1), steps: () => [{ at: roomAt('TOWER'), title: 'Башня мастеров 🏰', text: 'Лучшие выпускники — Старшие маги и Мастера — могут остаться жить в Башне мастеров и приносить школе монеты. Старший маг из башни иногда пересдаёт экзамен на Мастера.' }] },
  { key: 'social', when: () => ratingVal() > 0 && S.stats.graduated >= 30, steps: () => [
    { at: null, title: 'Рейтинг и топ школ 🏆', text: 'Каждый выпускник оставляет отзыв, из них складывается рейтинг школы 🏅. Нажми 🏆 — там топ школ всех игроков. Впиши название школы и своё имя, чтобы попасть в таблицу.' },
    { at: null, title: 'Альянсы 🤝', text: 'Кнопка 🤝 — альянсы: объединяйся с другими школами, дари друзьям подарки 🎁 и ✨ Вдохновение. Свой альянс можно создать или вступить в чужой.' }] },
  { key: 'trade', when: () => WORLD === 2 && !!SLOTS.TRADE && CLASSES.some((c, i) => c.id === 'forge' && isOpen(i)), steps: () => [TOUR_W2.find((t) => t.title.startsWith('Торговый двор'))] },
];
let introT = 20, tourList = TOUR, introKey = '';
function stepIntros(dt) {   // called from the frame loop while the game is on screen
  if (!S || tourStep >= 0 || panel || MG.isOpen() || document.hidden) return;
  introT -= dt; if (introT > 0) return; introT = 3;
  S.hints ||= {};
  if (!S.tourDone) return;
  const it = INTROS.find((x) => !S.hints['i_' + x.key] && x.when());
  if (!it) return;
  S.hints['i_' + it.key] = 1; introT = INTRO_GAP; save();
  const steps = it.steps().filter(Boolean); if (!steps.length) return;
  tourList = steps; introKey = it.key; showTour(0);
}
let tourStep = -1;
function focusTile(x, y, smooth = true) {   // the point goes to the middle of the free part of the screen (above the tour card)
  const p = P(x, y);
  const box = $('#tour:not(.hidden)') || (panel ? $('#sheet') : null);   // a tour card or an open panel covers the bottom   // the container is not animated, unlike the card sliding in
  const sr = scroller.getBoundingClientRect();
  const boxTop = box && box.id === 'sheet' ? window.innerHeight - box.offsetHeight : box ? box.getBoundingClientRect().top : 0;   // the sheet slides in: use its layout size
  const freeH = box ? Math.max(120, boxTop - 12 - sr.top) : scroller.clientHeight;
  scroller.scrollTo({ left: p.x * scale - scroller.clientWidth / 2, top: p.y * scale - 15 * scale - freeH / 2, behavior: smooth ? 'smooth' : 'auto' });
}
const tourAt = (st) => (typeof st.at === 'function' ? st.at() : st.at);
function showTour(i) {
  if (EDIT) { tourStep = -1; $('#tour').classList.add('hidden'); return; }   /* the room editor: no intro cards, no camera jumps */
  tourStep = i;
  const el = $('#tour');
  if (i < 0 || i >= tourList.length) { el.classList.add('hidden'); tourStep = -1; if (tourList === TOUR) { S.tourDone = true; S.hints ||= {}; S.hints[WORLD === 1 ? 'i_court' : 'i_trade'] = 1; } tourList = TOUR; introKey = ''; save(); return; }
  const st = tourList[i];
  el.innerHTML = emojiHtml(`<div class="tour-card"><div class="tour-top"><b>${st.title}</b>${tourList.length > 1 ? `<span class="muted">${i + 1}/${tourList.length}</span>` : ''}</div>
    <p>${st.text}</p><div class="tour-btns">${tourList.length > 1 ? '<button class="btn ghost small" data-tour-skip>Пропустить</button>' : ''}
    ${i > 0 ? '<button class="btn ghost small" data-tour-back>← Назад</button>' : ''}<button class="btn small" data-tour-next>${i === tourList.length - 1 ? 'Понятно!' : 'Дальше →'}</button></div></div>`);
  el.classList.remove('hidden');
  const at = tourAt(st); if (at) requestAnimationFrame(() => focusTile(at[0], at[1]));
}

// ======================= tap on a creature: what is it doing? =======================
function statusOf(a) { return statusOf0(a) + ` · настроение ${moodFace(moodOf(a))} ${Math.round(moodOf(a))}%`; }
function statusOf0(a) {
  const cn = (i) => (i >= 0 && CLASSES[i] ? `«${CLASSES[i].name}»` : 'класс');
  const g = a.goal || {};
  if (a.mcls) return a.state === 'mclass' ? `ведёт мастер-класс: показывает ученикам магию ${ELEMS[a.el || 0].emo}, ещё ${Math.max(0, Math.ceil(a.dur - a.t))} с` : a.t === 0 ? 'идёт вести мастер-класс' : 'возвращается после мастер-класса';
  if (queue.includes(a)) return a === processing ? 'записывается в школу у секретаря' : 'стоит в очереди в приёмной';
  if (a.state === 'study' && incOf(a.c)) return `урок остановлен: ${incInfo(a.c)[1]} — нажми на класс!`;
  if (a.state === 'study') return `учится: ${cn(a.c)}, до экзамена ${Math.max(0, Math.ceil(a.dur - a.t))} с${a.rest > 0 ? ' · выспался, учится быстрее' : ''}${a.dream && CLASSES[a.c] && CLASSES[a.c].final ? ' · выспался перед экзаменом 🌙 +10%' : ''}`;
  if (a.state === 'wait' || a.state === 'walkwait') return `ждёт свободной парты: ${cn(a.c)}`;
  if (a.state === 'read' || g.t === 'l') return `готовится к пересдаче в библиотеке (${cn(g.i)})`;
  if (g.t === 'k') return `${g.brk ? 'перемена во дворе, потом' : 'ждёт места во дворе:'} ${cn(g.i)} — ${{ bench: 'болтает на скамейке 💬', tag: 'играет в догонялки у фонтана 😆', coin: 'бросает монетку в фонтан 🪙', sparks: 'пробует искры из палочки ✨', birds: 'кормит птичек 🐦', read: 'читает под деревом 📖' }[a.act] || 'гуляет во дворе'}`;
  if (g.t === 'n') return g.k === 'final' ? `${a.state === 'nap' ? 'высыпается' : 'идёт выспаться'} перед Финальным экзаменом 🌙 (+10% к шансу)` : `устал после уроков и ${a.state === 'nap' ? 'спит' : 'идёт спать'} 💤, потом будет учиться быстрее`;   // dorm roles
  if (a.state === 'sleep') return `спит в спальне, ждёт места: ${cn(g.i)}`;
  if (a.state === 'dline' || a.state === 'checkin' || g.t === 'd') return 'записывается в спальню у консьержки';
  if (g.t === 'cant') return a.state === 'eat' ? `обедает в столовой ${a.dish || '🍲'}` : a.state === 'cantbuy' || a.state === 'cantwait' ? 'стоит в очереди к повару' : 'идёт в столовую';
  if (g.t === 'shop') return a.state === 'shopping' ? 'покупает вкусняшку в лавке 🍭' : 'идёт в лавку';
  if (g.t === 'g' || a.state === 'fly' || a.state === 'vanish') return 'выпускник! 🎓 идёт в сад';
  if (g.t === 'x') return 'расстроился и уходит из школы 💔';
  if (g.t === 's' || g.t === 'c') return `идёт на урок: ${cn(g.i)}`;
  return 'гуляет по школе';
}
function creatureAt(clientX, clientY) {
  const r = scroller.getBoundingClientRect();
  const wx = (clientX - r.left + scroller.scrollLeft) / scale, wy = (clientY - r.top + scroller.scrollTop) / scale;
  let best = null, bd = 1e9;
  for (const a of agents) {
    const p = P(a.x, a.y), cy = p.y - 15 - (a.z || 0);
    const d = Math.hypot(wx - p.x, (wy - cy) * 0.8);
    if (d < 16 && d < bd) { best = a; bd = d; }
  }
  return best;
}

function render() {
  drawStatic();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#a9d98f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  { const g = WORLD <= 2 && GRASS_ON && !BG_OFF && grassPat(ctx); if (g) {   // grass only where the cached static layer (which has it) does not cover the view
      const vx0 = scroller.scrollLeft / scale - 2, vy0 = scroller.scrollTop / scale - 2, vx1 = vx0 + scroller.clientWidth / scale + 4, vy1 = vy0 + scroller.clientHeight / scale + 4;
      const sx0 = MARGIN, sy0 = MARGIN, sx1 = MARGIN + SW, sy1 = MARGIN + SH, strips = [];
      if (vy0 < sy0) strips.push([vx0, vy0, vx1, Math.min(vy1, sy0)]);
      if (vy1 > sy1) strips.push([vx0, Math.max(vy0, sy1), vx1, vy1]);
      const my0 = Math.max(vy0, sy0), my1 = Math.min(vy1, sy1);
      if (my1 > my0) { if (vx0 < sx0) strips.push([vx0, my0, Math.min(vx1, sx0), my1]); if (vx1 > sx1) strips.push([Math.max(vx0, sx1), my0, vx1, my1]); }
      if (strips.length) {   // whole tile pictures (drawImage is far cheaper than a pattern fill); the static layer is drawn over them
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -scroller.scrollLeft * dpr, -scroller.scrollTop * dpr);
        const tw = 2 * GRASS_N * HW, th = 2 * GRASS_N * HH, done = new Set();
        for (const [a, b, c2, d] of strips) { if (c2 <= a || d <= b) continue;
          for (let i = Math.floor(a / tw); i * tw < c2; i++) for (let j = Math.floor(b / th); j * th < d; j++) { const key = i + ',' + j; if (done.has(key)) continue; done.add(key); ctx.drawImage(grassTile, i * tw, j * th, tw + 0.5, th + 0.5); } }
        ctx.setTransform(1, 0, 0, 1, 0, 0); } } }
  ctx.drawImage(stat, 0, 0, stat.width, stat.height, (MARGIN * scale - scroller.scrollLeft) * dpr, (MARGIN * scale - scroller.scrollTop) * dpr, SW * scale * dpr, SH * scale * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -scroller.scrollLeft * dpr, -scroller.scrollTop * dpr);

  const list = [];
  agentById = new Map(agents.map((a) => [a.id, a])); fxTop = []; frameLamps.length = 0; LAY_ENT.length = 0; fxCometDone = new Set();
  const zone = (x, y) => { const id = regAt(Math.floor(x), Math.floor(y)); if (id && id !== 'hall' && SLOTS[id]) { const s = SLOTS[id]; return (s.x0 + s.x1 + s.y0 + s.y1) / 2; } return x + y; };
  const add = (x, y, draw, bias = 0) => { const m = P(x, y); if (onScreen(m.x, m.y)) list.push({ k1: zone(x, y), k2: x + y + bias, draw }); };   // off-screen things are skipped
  VIEW = { x0: scroller.scrollLeft / scale, y0: scroller.scrollTop / scale, x1: (scroller.scrollLeft + scroller.clientWidth) / scale, y1: (scroller.scrollTop + scroller.clientHeight) / scale };
  const slotVisible = (s) => { const L = P(s.x0, s.y1), R = P(s.x1, s.y0), B = P(s.x0, s.y0), F = P(s.x1, s.y1); return R.x > VIEW.x0 - 40 && L.x < VIEW.x1 + 40 && F.y > VIEW.y0 - 40 && B.y - TALL_H() < VIEW.y1 + 40; };
  for (const id of Object.keys(SLOTS)) { const s = SLOTS[id]; if (!slotVisible(s)) continue; list.push({ k1: (s.x0 + s.x1 + s.y0 + s.y1) / 2, k2: -1e9, draw: cachedRoom(id) ? () => drawThemedRoom(id) : () => drawSlot(ctx, id) }); }
  list.push({ k1: Math.floor(GATE_TILE.x) + 1 + GATE_TILE.y - 1, k2: 0, draw: () => drawGate(ctx) });
  if (WORLD <= 2) { layoutCorridor(); for (const o of CORR) add(o.x, o.y, () => drawCorr(o)); }
  if (WORLD <= 2 && OUT_ON) { layoutOutdoor(); drawEntrancePath();   // cheap pre-check with the cached screen point before the full add()
    const vx0 = VIEW.x0 - 140, vx1 = VIEW.x1 + 140, vy0 = VIEW.y0 - 20, vy1 = VIEW.y1 + 220;
    const vis = []; for (const o of OUTDOOR) { if (o.px === undefined) { const m = P(o.x, o.y); o.px = m.x; o.py = m.y; } if (o.px < vx0 || o.px > vx1 || o.py < vy0 || o.py > vy1) continue; vis.push(o); }
    for (const o of vis) if (!o.baked) outShadow(ctx, o);   // ground layer first (shadows, forest floor), then the objects depth-sorted
    for (const o of vis) add(o.x, o.y, () => drawOut(o));
    if (WORLD === 1 && SLOTS.GARDEN) add(SLOTS.GARDEN.x0 + 1.2, SLOTS.GARDEN.y0 + 1.2, drawGradCircle); }   // the graduation circle lies on the floor: drawn before anyone standing on it
  for (const e of EDGES) {
    const painted = e.id !== 'hall' && e.tall && WORLD === 1 && !!arts[CLASS_SLOT.indexOf(e.id) >= 0 ? CLASSES[CLASS_SLOT.indexOf(e.id)].id : e.id]?.naturalWidth;   // painted rooms: only the cap on top of their own walls
    if (e.id === 'DORM2' && !dorm2Built()) continue;
    if (e.id === 'DIR' && !dirBuilt()) continue;
    if (e.id === 'SHOP' && !shopOpen()) continue;
    if (e.id === 'TOWER' && !towerOpen()) continue;
    if (e.id === 'CANT' && !cantBuilt()) continue;
    if (e.id !== 'hall' && CLASS_SLOT.indexOf(e.id) >= 0 && !S.classes[CLASS_SLOT.indexOf(e.id)].built) continue;
    const sl = SLOTS[e.id];
    const k1 = e.id === 'hall' ? e.x + e.y : (sl.x0 + sl.x1 + sl.y0 + sl.y1) / 2;
    if (painted) { const sl0 = SLOTS[e.id], sq = Math.min(sl0.x1 - sl0.x0, sl0.y1 - sl0.y0); if (e.x < sl0.x0 + sq && e.y < sl0.y0 + sq) continue; }
    if (e.tall && cachedRoom(e.id)) continue;   // already inside the room's cached picture
    if (e.hallWall) continue;   // corridor walls are baked into the ground layer
    { const m = P(e.x + 0.5, e.y + 0.5); if (!onScreen(m.x, m.y)) continue; }
    list.push({ k1, k2: e.tall || e.side === 'x0' || e.side === 'y0' ? -1e9 + 1 : 1e9, draw: () => drawEdge(ctx, e) });   // build 254: low BACK walls go behind the room's people and furniture like tall ones (her «На Тихона теперь плинтус заходит»); only front knee walls are drawn over them
  }
  for (let i = 0; i < CLASSES.length; i++) {
    const st = S.classes[i]; if (!st.built) continue;
    const s = slotOf(i);
    if (!isOpen(i)) {
      const c = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), left = Math.max(0, Math.ceil((st.buildEnd - Date.now()) / 1000));
      add((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, () => buildFx('c' + i, s, left, buildTime(i)));   // magic construction (her «Да» 2026-11-25)
      continue;
    }
    const tp = teacherWalk(i);   // the teacher strolls along the front of the class as if explaining (her wish 2026-11-21)
    { const own = staffOf(CLASSES[i].id) && sprites['staff_' + CLASSES[i].id];
      const pim = teacherPose(i, tp);
      if (pim) { const hh = (STAFF_H[staffOf(CLASSES[i].id)] || 58) * 1.05; add(tp.x, tp.y, () => { teacherGlow(tp, hh, STAFF_GLOW[staffOf(CLASSES[i].id)] || STAFF_GLOW_ALL); drawPose(pim, tp.x, tp.y, hh, tp.moving && tp.left && TEACHER_FLY[staffOf(CLASSES[i].id)] && FLY_LEFT[staffOf(CLASSES[i].id)] ? !tp.left : tp.left, tp.moving, WALK_POSE[staffOf(CLASSES[i].id)] ? 'step' : tp.left ? 'hover' : 'waddle'); }); }
      else if (own && own.complete && own.naturalWidth) { const t1 = { sp: 'staff_' + CLASSES[i].id, ph: performance.now() / 1000 + i, flip: tp.left, path: tp.moving ? [1] : [] }; add(tp.x, tp.y, () => { const hh = STAFF_H[staffOf(CLASSES[i].id)] || 58;
        { const q = P(tp.x, tp.y), g = ctx.createRadialGradient(q.x, q.y - hh * 0.5, 2, q.x, q.y - hh * 0.5, hh * 0.75); g.addColorStop(0, STAFF_GLOW[staffOf(CLASSES[i].id)] || STAFF_GLOW_ALL); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y - hh * 0.5, hh * 0.75, 0, Math.PI * 2); ctx.fill(); }   // a soft glow so a dark professor stands out in a dark room
        drawCreature(t1, tp.x, tp.y, hh); }); }   // own drawn professor (her approval, one at a time)
      else { const t0 = staff[(i + 1) % staff.length], tch = { ...t0, back: frontFacing(i), flip: tp.left, path: tp.moving ? [1] : [], ph: performance.now() / 1000 + i }; add(tp.x, tp.y, () => (teacherGlow(tp, 42), drawCreature(tch, tp.x, tp.y, 42, (x, y) => drawHat(x, y - 40, '#6c4fd1')))); } }
    const thI = themeOf(CLASS_SLOT[i]), stations = thI && THEMES[thI].stations;   // potions: a little cauldron instead of a desk
    for (let d = 0; d < st.desks; d++) { const p = deskPos(i, d); if (stations && part(thI, stations[d % stations.length])) { const o = { n: stations[d % stations.length], x: p.x, y: p.y, th: thI, flip: sideHall(i) !== !!(deskOv(i, d) && deskOv(i, d).flip) }; const sfx = STATION_FX[CLASSES[i].id]; add(p.x, p.y, () => layRun({ cid: CLASSES[i].id, kind: 'desk', key: 'desk#' + d, d, x: p.x, y: p.y, n: o.n, tint: (RLAY.rooms[CLASSES[i].id] || {}).deskTint || null }, () => { if (CLASSES[i].id === 'flight') { const sa = studentAt(i, d); o.lift = sa ? flightLift(sa.id) : 0; } deskScaled(i, d, p, () => { drawProp(o); if (sfx) sfx(i, d, p, o); }); })); } else add(p.x, p.y, () => layRun({ cid: CLASSES[i].id, kind: 'desk', key: 'desk#' + d, d, x: p.x, y: p.y, n: null }, () => { deskScaled(i, d, p, () => { drawDesk(p); if (CLASSES[i].id === 'herbs') herbsDeskFx(i, d, p); }); })); }
    const addL = layAdd(i, s, add);   // room editor: items can be moved, scaled, flipped, hidden
    if (thI && THEMES[thI].rug && rugDyn(i)) addL((s.x0 + s.x1) / 2, s.y0 + 2.6, () => drawRug(ctx, thI, s, i), -1e5, 'rug');   /* the class rug, under the desks and everyone */
    for (const o of roomProps(i)) addL(o.x, o.y, () => drawProp(o), 0, o.n);
    layExtra(i, s, add);
    if (ROOM_ART[CLASSES[i].id]) ROOM_ART[CLASSES[i].id](i, s, st, addL);   // a redesigned room draws its own built-in items and light
    else CLASSES[i].items.forEach((it, k) => {
      if (!st.items[k]) return;
      const spots = [[s.x0 + 0.7, s.y0 + 0.7], [s.x0 + 5.3, s.y0 + 0.7], [s.x0 + 0.7, s.y0 + 5.2], [s.x0 + 5.3, s.y0 + 5.2]];
      const p = P(spots[k][0], spots[k][1]);
      add(spots[k][0], spots[k][1], () => emoji(it.emoji, p.x, p.y - 8, 14 + Math.min(8, st.items[k] / 3)));
    });
  }
  // library (themed): an armchair at every open reading place and a few things around
  if (SLOTS.DIR && dirBuilt()) { const dp = directorPos(), im = dirSpr(dp.pose === 'walk' && WORLD === 1 && !(S.lore && S.lore.prize) ? 'proud' : dp.pose); if (WORLD <= 2 && im && im.naturalWidth) add(dp.x, dp.y, () => { teacherGlow(dp, 64); drawPose(im, dp.x, dp.y, WORLD === 2 ? 58 : S.lore && S.lore.prize ? 84 : 64, dp.flip, dp.moving, WORLD === 2 ? 'step' : 'hover'); }); else { const s = SLOTS.DIR, dx = s.x0 + 2.0, dy = s.y0 + 1.75; add(dx, dy, () => drawCreature(director, dx, dy, 36, (x, y) => drawHat(x, y - 34, '#e0a100'))); } }
  if (tikhonOn()) { const tp = tikhonPos(), im = sprites['tikhon_' + tp.pose]; if (im && im.naturalWidth) add(tp.x, tp.y, () => { teacherGlow(tp, 60); drawPose(im, tp.x, tp.y, 60, !!tp.flip, !!tp.moving, tp.moving ? 'waddle' : 'hover'); drawTikhonBadge(tp); }); }   // Tikhon, the advisor (build 251)
  if (WORLD === 1 && SLOTS.DIR) { const s = SLOTS.DIR; add(s.x0 + 3.3, s.y0 + 2.4, drawCrown); }
  if (NEWDORM && SLOTS.DORM) { concPlace(); const o1 = concOff('DORM'), co = conciergePos(), th = themeOf('DORM'), aD = layAdd('DORM', SLOTS.DORM, add), bx = CONCIERGE.x - o1.dx, by = CONCIERGE.y - o1.dy;   /* Баю-Бая with her desk: one item, drawn at her unmoved place (the editor layer moves it) */
    aD(bx, by + 0.75, () => { const im = sprites['con_' + co.pose]?.naturalWidth ? (co.pose === 'walk' ? sprites['staff_concierge'] : sprites['con_' + co.pose]) : sprites['staff_concierge']; if (im && im.naturalWidth) { drawPose(im, co.x - o1.dx, co.y - o1.dy, 62, co.flip, co.moving); if (checkin) { const q = P(co.x - o1.dx, co.y - o1.dy); ring(q.x - 24, q.y - 62, Math.min(1, checkinT / checkinTime()), '#2f9e7a'); } } const d = th && part(th, 'conc_desk'); if (d) drawProp({ n: 'conc_desk', x: bx - 0.05, y: by + 0.75, th }); }, 0, 'conc');
    if (dorm2Built() && SLOTS.DORM2) { const o2 = concOff('DORM2'), aD2 = layAdd('DORM2', SLOTS.DORM2, add), cx = CON2.x - o2.dx, cy = CON2.y - o2.dy;   /* Ляля-Люля with her desk */
      aD2(cx, cy + 0.75, () => { if (LYALYA.complete && LYALYA.naturalWidth) { drawPose(LYALYA, cx, cy, 62, false, false); if (CON2.cur) { const q = P(cx, cy); ring(q.x - 24, q.y - 62, Math.min(1, CON2.t / checkinTime()), '#4f86c6'); } } const d = th && part(th, 'conc_desk'); if (d) drawProp({ n: 'conc_desk', x: cx - 0.05, y: cy + 0.75, th }); }, 0, 'conc'); } }
  else if (themeOf('DORM') && part(themeOf('DORM'), 'conc_desk')) { const o = { n: 'conc_desk', x: CONCIERGE.x - 0.05, y: CONCIERGE.y + 0.75, th: themeOf('DORM') }; add(o.x, o.y, () => drawProp(o)); }   // her desk in front of her
  for (const rid of ['LIB', 'REC', 'DORM', 'DORM2', 'DIR', 'SHOP', 'TOWER', 'CANT']) {
    const th = themeOf(rid); if (!th || !SLOTS[rid] || (rid === 'CANT' && !cantOpen()) || (rid === 'DORM2' && !dorm2Built()) || (rid === 'DIR' && !dirBuilt()) || (rid === 'SHOP' && !shopOpen()) || (rid === 'TOWER' && !towerOpen())) continue;
    const T = THEMES[th], s = SLOTS[rid];
    if (rid === 'LIB') LIB_SPOTS.slice(0, libSeats()).forEach((q, k) => { const o = { n: T.seats[k % T.seats.length], x: q.x, y: q.y - 0.02, th }; add(o.x, o.y, () => drawProp(o)); });
    if (T.beds && WORLD === 1 && (window.__EDIT)) { const from = rid === 'DORM' ? 0 : DORM_STRIDE, n = rid === 'DORM' ? beds1() : beds2(), aN = layAdd(rid, s, add);   /* one nest per four places, drawn behind its sleepers */
      for (let b = 0; b < (EDIT ? DORM_STRIDE : n); b += 4) { const c = DORM_SPOTS[from + b].nest, o = { n: 'dm_nest_canopy', x: c.x, y: c.y, th }, num = b / 4 + 1; aN(c.x - 0.45, c.y - 0.45, () => { drawProp(o); if (EDIT) { const m = P(c.x, c.y); ctx.save(); ctx.font = '800 9px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#6b3fb0'; ctx.strokeText(String(num), m.x, m.y + 6); ctx.fillText(String(num), m.x, m.y + 6); ctx.restore(); } }, 0, 'dm_nest'); }   /* the editor shows all 8, numbered: players get them in this order */ }
    else if (T.beds) { const from = rid === 'DORM' ? 0 : DORM_STRIDE, n = rid === 'DORM' ? beds1() : beds2();
      DORM_SPOTS.slice(from, from + n).forEach((q, k) => { const o = { n: T.beds[k % T.beds.length], x: q.x, y: q.y - 0.02, th }; add(o.x, o.y, () => drawProp(o)); }); }
    const addR = (rid === 'REC' || rid === 'DORM' || rid === 'DORM2') && WORLD === 1 ? layAdd(rid, s, add) : null;   /* the reception's furniture is editable in the room editor */
    for (const o of (T.extras ? T.extras(s) : [])) { const oo = { ...o, th }; if (addR) addR(oo.x, oo.y, () => drawProp(oo), 0, oo.n); else add(oo.x, oo.y, () => drawProp(oo)); }
    if (addR) layExtra(rid, s, add);
    if (T.arrival) { const pl = part(th, 'rc_plane'); if (pl) for (let m = 0; m < 2; m++) { const T0 = performance.now() / 1000 + m * 4.5, u = (T0 % 9) / 9; if (u > 0.55) continue; const v = u / 0.55, x = s.x0 + 1.75 + (1.3 - 1.75) * v, y = s.y0 + 3.6 + (0.4 - 3.6) * v;   /* paper airplanes fly from the counter to the notice board */
      add(x + 0.4, y + 0.4, () => { const p = P(x, y), h = 46 + Math.sin(v * Math.PI) * 22, w = 13; ctx.save(); ctx.globalAlpha = Math.min(1, v * 6, (1 - v) * 6); ctx.translate(p.x, p.y - h); ctx.rotate(-0.35 + Math.sin(v * 9) * 0.08); ctx.drawImage(pl, -w / 2, -w * 0.35, w, w * 0.7); ctx.restore(); }); } }
  }
  // reception desk + officer
  if (WORLD <= 2 && SLOTS.LIB) { const lo = librarianPos(), im = sprites['lib_' + lo.pose]; if (im && im.naturalWidth) add(lo.x, lo.y, () => { teacherGlow(lo, 56, 'rgba(255,244,200,0.85)'); drawPose(im, lo.x, lo.y, 56, lo.flip, lo.moving); }); }   // glow: he blended into the dark green room (her report)
  if (WORLD <= 2) for (const [ci, list] of Object.entries(helpersAll())) {   // helper mages stroll between their class and the corridor
    const i = +ci; if (!slotOf(i) || !isOpen(i)) continue;
    list.forEach((h, k) => { if (h.away || h.mc) return; const p = helperPos(i, k); add(p.x, p.y, () => drawCreature({ sp: h.sp, rk: h.rk || 3, el: h.el || 0, back: p.back, flip: p.flip, path: p.moving ? [1] : [], ph: k + i + performance.now() / 1000 }, p.x, p.y, 30)); });
  }
  if (towerOpen() && SLOTS.TOWER) {   // residents of the masters' tower stroll; those waiting stand at the door outside
    const T = towerUp();
    T.res.forEach((r, k) => { if (r.away || r.mc) return; const p = towerPos(k); add(p.x, p.y, () => drawCreature({ sp: r.sp, rk: r.rk, el: r.el, back: false, flip: p.flip, path: p.moving ? [1] : [], ph: k * 1.7 + performance.now() / 1000 }, p.x, p.y, 30)); });
    T.wait.forEach((r, k) => { const s = SLOTS.TOWER, x = s.x0 + 2.4 + k * 0.7, y = s.y0 - 0.5; add(x, y, () => drawCreature({ sp: r.sp, rk: r.rk, el: r.el, back: false, flip: true, path: [], ph: k }, x, y, 30, (sx, sy) => emoji('⏳', sx + 12, sy - 34, 12))); });
  }
  for (const id of ['SHOP', 'TRADE', 'EXPED', 'DIR', 'TOWER', 'DORM2']) { const o = bObj(id), s = SLOTS[id]; if (!s || !o || !o.built || Date.now() >= (o.end || 0)) continue;
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, c = P(cx, cy), left = Math.ceil((o.end - Date.now()) / 1000);
    add(cx, cy, () => buildFx(id, s, Math.max(0, left), BTIME[id] || 0)); }
  if (cantBuilt() && SLOTS.CANT) {   // canteen: counter with pots, tables; the cook stands behind the counter (dragon art comes later)
    const s = SLOTS.CANT;
    if (!cantOpen()) { const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, c = P(cx, cy), left = Math.max(0, Math.ceil((S.cant.end - Date.now()) / 1000));
      add(cx, cy, () => buildFx('CANT', s, left, CANT_TIME)); }
    else {
      const ck = CANT_COOK(s), now = performance.now() / 1000, busy = cantLine.some((a) => a.state === 'cantbuy');
      const themed = !!part(themeOf('CANT') || 'CANT', 'counter');
      if (!themed) [3.6, 4.7].forEach((dx, k) => { const q = { x: s.x0 + dx, y: s.y0 + 1.35 }; add(q.x, q.y, () => { drawCounter(q); const m = P(q.x, q.y); emoji(k ? '🍲' : '🥧', m.x, m.y - 14, 13); }); });
      const cim = sprites['cook_' + cookPose()];
      if (cim && cim.naturalWidth) add(ck.x, ck.y, () => { teacherGlow(ck, 52, 'rgba(255,225,190,0.75)'); drawPose(cim, ck.x, ck.y, 52, false, false); });
      else add(ck.x, ck.y, () => { const m = P(ck.x, ck.y), hop = busy ? Math.abs(Math.sin(now * 5)) * 3 : 0; teacherGlow(ck, 40, 'rgba(255,225,190,0.75)'); emoji('🐲', m.x, m.y - 18 - hop, 30); if (busy) emoji('🔥', m.x + 14, m.y - 4, 10); });
      if (!themed) CANT_TABLES(s).slice(0, cantTables()).forEach((t) => add(t.x, t.y, () => drawCounter(t, '#e9c79a', '#c99a68', 0.45)));
    }
  }
  if (shopOpen() && SLOTS.SHOP) { const fo = foxPos(), im = sprites['fox_' + fo.pose]; if (im && im.naturalWidth) add(fo.x, fo.y, () => { teacherGlow(fo, 56, 'rgba(255,240,200,0.7)'); drawPose(im, fo.x, fo.y, 56, fo.flip, fo.moving); }); }
  const co = conciergePos();
  if (NEWDORM) { /* drawn with her desk above */ }
  else if (staffSprite('concierge') && sprites['con_' + co.pose]?.naturalWidth) add(co.x, co.y, () => { drawPose(co.pose === 'walk' ? sprites['staff_concierge'] : sprites['con_' + co.pose], co.x, co.y, 62, co.flip, co.moving); if (checkin) { const q = P(co.x, co.y); ring(q.x - 24, q.y - 62, Math.min(1, checkinT / checkinTime()), '#2f9e7a'); } });
  else add(CONCIERGE.x, CONCIERGE.y, () => drawCreature(staffSprite('concierge') ? { ...concierge, sp: 'staff_concierge', flip: false } : concierge, CONCIERGE.x, CONCIERGE.y, staffSprite('concierge') ? 62 : 34, (x, y) => {
    if (!staffSprite('concierge')) drawHat(x, y - 32, '#2f9e7a');
    if (checkin) ring(x + 18, y - 30, Math.min(1, checkinT / checkinTime()), '#2f9e7a');
  }));
  if (!themeOf('DORM')) add(CONCIERGE.x + 0.75, CONCIERGE.y, () => {
    const a = P(DS.x0 + 1.1, DS.y0 + 0.8), b = P(DS.x0 + 1.6, DS.y0 + 0.8), cc = P(DS.x0 + 1.6, DS.y0 + 2.1), d = P(DS.x0 + 1.1, DS.y0 + 2.1), h = 11;
    poly(ctx, [d, cc, up(cc, h), up(d, h)], '#7d8fb8'); poly(ctx, [cc, b, up(b, h), up(cc, h)], '#6a7ca5'); poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#a9b9dd', '#5d6f98');
    const m = P(DS.x0 + 1.35, DS.y0 + 1.2); emoji('🗝️', m.x, m.y - 15, 10); const n = P(DS.x0 + 1.35, DS.y0 + 1.8); emoji('📒', n.x, n.y - 15, 10);
  });
  const so = secretaryPos();
  add(so.x, so.y, () => { if (staffSprite('secretary')) { drawSecretary(so); const q = P(so.x, so.y); if (processing) ring(q.x - 26, q.y - 62, Math.min(1, procT / procTime()), '#ff8a3d'); return; } drawCreature(officer, so.x, so.y, 34, (x, y) => {
    drawHat(x, y - 32, '#d14f8f');
    if (processing) ring(x + 18, y - 30, Math.min(1, procT / procTime()), '#ff8a3d');
  }); });
  if (!themeOf('REC') && !(arts.REC && arts.REC.naturalWidth)) add(OFFICER.x + 0.9, OFFICER.y, () => {
    const a = P(REC.x0 + 1.5, REC.y0 + 3.1), b = P(REC.x0 + 2.1, REC.y0 + 3.1), cc = P(REC.x0 + 2.1, REC.y0 + 5.9), d = P(REC.x0 + 1.5, REC.y0 + 5.9), h = 12;
    poly(ctx, [d, cc, up(cc, h), up(d, h)], '#9a6a41'); poly(ctx, [cc, b, up(b, h), up(cc, h)], '#86592f'); poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#c99a68', '#8a5f3a');
    const m = P(REC.x0 + 1.8, REC.y0 + 3.6); emoji('📜', m.x, m.y - 16, 11); const n = P(REC.x0 + 1.8, REC.y0 + 5.4); emoji('🔔', n.x, n.y - 16, 11);
  });
  for (const a of agents) {
    // an incident in the class: its students leave their places and rush around the room in a panic (her wish 2026-11-21)
    const pn = panicPos(a), ax = pn ? pn.x : a.x, ay = pn ? pn.y : a.y;
    if (a.state !== 'fly') a.z = !pn && a.state === 'study' && !(a.path && a.path.length) && sitsOn(a.c) ? 9 + (CLASSES[a.c].id === 'flight' && !incOf(a.c) ? flightLift(a.id) : 0) : (a.state === 'read' && !(a.path && a.path.length) && themeOf('LIB') ? 6 : (a.state === 'sleep' || a.state === 'nap') && !(a.path && a.path.length) && themeOf('DORM') ? 4 : 0);   // on a cloud / in an armchair
    if (a.state === 'court' && a.act === 'bench' && courtPose(a)) a.z = 6;   // sits on the bench seat
    if (a.state === 'court' && a.act === 'swing' && courtPose(a) && !(a.path && a.path.length)) a.z = 26 + 5 * Math.abs(Math.sin(performance.now() / 1000 * 2.6));   // on the swing seat, swinging
    if (pn) { a._panic = true; a.flip = pn.left; a.back = pn.up; } else if (a._panic) { a._panic = false; if (a.state === 'study') faceTeacher(a, a.c); }
    const draw = () => drawCreature(a, ax, ay, 30, (x, y) => {
      if (pn && !pn.duty) { if (Math.sin(a.ph * 3 + a.id) > 0.2) emoji(a.id % 3 ? '❗' : '😱', x + 2, y - 36, 12); return; }
      if (a.state === 'study' && !a.path.length) ring(x + 13, y - 32, Math.min(1, a.t / a.dur));
      if (a.state === 'fly') emoji('✨', x - 12, y - 6, 10);
      if (a.state === 'mclass') { const T = performance.now() / 1000 + a.id, e = ELEMS[a.el || 0].emo;   // the master shows magic: his element circles above his paws (one turn 4.5 s)
        for (let k = 0; k < 3; k++) { const an = T * Math.PI * 2 / 4.5 + k * 2.094, r = 1 + 0.25 * Math.sin(T * 1.3 + k); emoji(e, x + Math.cos(an) * 17 * r, y - 22 + Math.sin(an) * 7 * r, 9 + 2 * Math.sin(an)); }
        ring(x + 13, y - 36, Math.min(1, a.t / a.dur), `rgb(${ELEMS[a.el || 0].col})`); }
      if (a.state === 'read') { emoji('📚', x - 12, y - 30, 11); ring(x + 13, y - 32, Math.min(1, a.t / a.dur), '#e0a100'); }
      if (a.state === 'eat' && !a.path.length) { emoji(a.dish || '🍲', x + (a.flip ? -14 : 14), y - 12, 12); ring(x + 13, y - 32, Math.min(1, a.t / a.dur), '#e08a3d'); }
      if (a.state === 'sleep') emoji('💤', x + 12, y - 30 - Math.abs(Math.sin(a.ph * 1.5)) * 4, 11);
      if (a.state === 'nap') { emoji(a.goal && a.goal.k === 'final' ? '🌙' : '💤', x - 12, y - 30 - Math.abs(Math.sin(a.ph * 1.5)) * 4, 11); ring(x + 13, y - 32, Math.min(1, a.t / a.dur), '#7b5cd6'); }   // dorm roles
      if (a.state === 'court' && a.goal && a.goal.t === 'k') courtFx(a, x, y);
      if (zoom < 1.2) return;   // mood faces are unreadable from afar
      if (moodOf(a) < 35 && a.state !== 'study') emoji(moodFace(moodOf(a)), x - 13, y - 31, 11);   // sad ones show it
      else if (moodOf(a) >= 65 && a.state !== 'sleep') {   // happy ones show it too, now and then (her wish 2026-11-21)
        const cyc = (performance.now() / 1000 + a.id * 2.3) % 7;
        if (cyc < 1.6) { const f = moodOf(a) >= 90 ? ['🥰', '😄', '💖'][a.id % 3] : moodOf(a) >= 78 ? ['😄', '😊'][a.id % 2] : '🙂'; emoji(f, x - 13, y - 31 - Math.sin(cyc / 1.6 * Math.PI) * 4, 11); }
      }
    });
    if (a.state === 'vanish') { add(ax, ay, () => drawVanish(a, ax, ay), 0.3); continue; }
    if (a.state === 'fly') list.push({ k1: 1e9, k2: 0, draw }); else if (a.state === 'court' && a.spot && (a.act === 'read' || (a.spot.seat && a.act === 'tea'))) add(ax + 0.6, ay + 0.6, draw); else add(ax, ay, draw);   // build 327: every court reader is drawn over the cushions (her «все еще сидят под текстурой подушек»); build 325 put this comment before «else add» and hid every other student (her «Все ученики стали прозрачными!»)   // her «Ученики должны быть выше подушек»: sitters on a cushion / the picnic blanket are drawn over it
  }
  list.sort((p, q) => p.k1 - q.k1 || p.k2 - q.k2).forEach((o) => o.draw());
  for (const f of fxTop) f();
  fxTop = [];
  if (WORLD <= 2) drawCandles();
  drawSeals();
  // x-ray: every creature is drawn once more, faintly, on top: the ones hidden behind a wall show through as ghosts
  ctx.globalAlpha = 0.38;
  if (zoom >= 1.1) for (const a of agents) if (a.state !== 'fly' && a.state !== 'vanish') { const pn = panicPos(a), gx = pn ? pn.x : a.x, gy = pn ? pn.y : a.y, m = P(gx, gy); if (onScreen(m.x, m.y)) (a._ghost = true, drawCreature(a, gx, gy, 30), a._ghost = false); }
  ctx.globalAlpha = 1;
  if (WORLD === 1) drawDayNight(); else if (WORLD === 2) drawHallDark();
  drawDewFx();   // secret «Роса» (lore stage 4): dawn dew in the graduates' garden
  drawPukh();   // secret «Совёнок Пух»: the owlet flies over now and then
  drawStarfall();   /* secret «Звездопад» */
  drawMoonFx();   // the Moon Tree glow and fruits stay bright at night   // day and night (signs stay bright: drawn after)
  signRects = [];
  for (const id of Object.keys(SLOTS)) drawSign(ctx, id);
  if (WORLD === 1 && COURT) {   // build 279: the fountain has a sign too: it opens the court's upgrades
    const c = courtC(), q = up(P(c.x + 0.89, c.y + 0.89), 150), pl = signPill(signLabel('⛲ Двор'), '#d6f0ff', 12, 22, '#ffffff', '#2e2340');
    if (onScreen(q.x, q.y, 160, 40)) ctx.drawImage(pl.cv, q.x - pl.w / 2, q.y - pl.h / 2, pl.w, pl.h);
    signRects.push({ id: 'FOUNT', x0: q.x - pl.tw / 2, y0: q.y - pl.hh, x1: q.x + pl.tw / 2, y1: q.y + pl.hh });
  }
  drawIncidents();
  drawMail();
  if (tourStep >= 0 && tourList[tourStep] && tourAt(tourList[tourStep])) { const ta = tourAt(tourList[tourStep]), f = P(ta[0], ta[1]), k = 1 + 0.12 * Math.sin(performance.now() / 250); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(f.x, f.y, 46 * k, 28 * k, 0, 0, Math.PI * 2); ctx.stroke(); }
  for (const p of popups) { const s = P(p.x, p.y); ctx.globalAlpha = Math.max(0, 1 - p.t / 1.3); text(p.text, s.x, s.y - p.lift, 12, p.color); ctx.globalAlpha = 1; }
}

// ======================= UI =======================
function fmt(n) {
  if (!Number.isFinite(n)) return '—';   // build audit 2026-11-24: never «NaN» / «InfinityT» on screen
  n = Math.floor(n);
  if (n < 1000) return String(n);
  if (n >= 1e21) return n.toExponential(1).replace('.', ',').replace('e+', 'e');
  const u = [['Qi', 1e18], ['Qa', 1e15], ['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [s, v] of u) if (n >= v) return (n / v).toFixed(n / v < 10 ? 1 : 0).replace('.', ',') + s;
  return String(n);
}
const pct = (x) => Math.round(x * 100) + '%';
const sec = (x) => x.toFixed(1).replace('.', ',') + ' с';
const perMin = (s) => { const v = 60 / Math.max(1e-6, s); return v >= 100 ? fmt(Math.round(v)) : String(+v.toFixed(v < 10 ? 1 : 0)).replace('.', ','); };   // build audit 2026-11-24: «12 в минуту» instead of «0,0 с»
function costBtn(label, cost, act, extra = '') { return `<button class="btn" data-cost="${cost}" data-act="${act}" ${extra}>${label} <span class="cost">🪙${fmt(cost)}</span></button>`; }

let panel = null; let dirtyPanel = false;
let panelHtml = '';
function openPanel(fn) { setTimeout(() => { const h = document.querySelector('#sheet h2'); if (h && panel === fn) glog('open', h.textContent, WORLD); }, 0); if (Date.now() - PRICE_AT > 600000) { PRICE_FROZEN.clear(); PRICE_AT = Date.now(); } $('#tour').classList.add('under-panel'); panel = fn; const sh = $('#sheet'); sh.style.transform = ''; panelHtml = emojiHtml(fn()); sh.innerHTML = panelHtml; sh.scrollTop = 0; $('#sheet-wrap').classList.remove('hidden'); updateHud(); }
function gameLogPanel() {   // the event journal (newest first)
  const L = gentries().slice(-200).reverse();
  return `<div class="sh-head"><span class="remoji big">📜</span><div><h2>Журнал событий</h2><div class="muted">что происходило в игре: сообщения, подсказки, окна, нажатия, события</div></div><button class="x" data-close>✕</button></div>
    <button class="btn ghost wide" data-gamelogcopy>📋 Скопировать весь журнал</button>
    <div style="font:500 12px ui-monospace,Menlo,monospace;white-space:pre-wrap;line-height:1.45;margin-top:10px">${L.length ? L.map((e) => escTxt(gline(e))).join('\n') : 'Пока пусто'}</div>`;
}
gameLogPanel.still = true;
// ---- 🔔 notifications for players (Maria 2026-11-25: «это не для меня а для людей, просматривать оповещения которые они упустили»):
// the messages, hints and events of the journal, newest first; new ones (since the last look) highlighted; unread count on the menu tile
const NOTIF_SEEN = 'magicschool.notifSeen';
const notifSeen = () => +(localStorage.getItem(NOTIF_SEEN) || 0);
const notifOf = (e) => e[2] === 'toast' || e[2] === 'event' || e[2] === 'hint' || (e[2] === 'app' && /^возвращение/.test(e[3]));
const notifList = () => gentries().filter(notifOf);
const notifUnread = () => { const t = notifSeen(); let n = 0; const L = gentries(); for (let k = L.length - 1; k >= 0 && L[k][0] > t; k--) if (notifOf(L[k])) n++; return n; };
function notifText(e) {
  if (e[2] === 'app') { const m = /не было (\d+) мин, заработано (.+)$/.exec(e[3]); return m ? `💤 Пока тебя не было (${+m[1] >= 120 ? Math.round(m[1] / 60) + ' ч' : m[1] + ' мин'}), школа заработала 🪙${m[2]}` : e[3]; }
  if (e[2] === 'event') return '⚠️ ' + e[3].replace(/^происшествие: (.+)$/, 'Происшествие в классе «$1»');
  if (e[2] === 'hint') return '💡 ' + e[3];
  return e[3];
}
function notifPanel() {
  const prev = notifPanel.prev ?? notifSeen(), L = notifList().slice(-150).reverse();
  const today = new Date().toDateString(), yest = new Date(Date.now() - 86400000).toDateString();
  let day = '', rows = '';
  for (const e of L) {
    const d = new Date(e[0]), ds = d.toDateString(), lab = ds === today ? 'Сегодня' : ds === yest ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (lab !== day) { day = lab; rows += `<h3 style="margin:12px 2px 4px">${lab}</h3>`; }
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, fresh = e[0] > prev;
    rows += `<div class="card" style="padding:7px 10px;margin:4px 0;gap:8px;align-items:flex-start;${fresh ? 'background:#fff6cf;box-shadow:0 0 0 2px #f2d06b inset' : ''}"><span class="muted" style="font-weight:800;min-width:40px">${hm}</span><span class="grow" style="line-height:1.3">${escTxt(notifText(e))}${e[1] && e[1] !== WORLD ? ' <span class="muted">· другой мир</span>' : ''}</span></div>`;
  }
  return `<div class="sh-head"><span class="remoji big">🔔</span><div><h2>Оповещения</h2><div class="muted">Всё, что игра тебе сообщала — если что-то пропустил. Новые выделены.</div></div><button class="x" data-close>✕</button></div>
    ${rows || '<p class="muted">Пока оповещений нет.</p>'}`;
}
function openNotif() { notifPanel.prev = notifSeen(); localStorage.setItem(NOTIF_SEEN, String(Date.now())); openPanel(notifPanel); }
addMenuItem({ attr: 'data-notif', icon: '🔔', label: 'Оповещения', sub: () => { const n = notifUnread(); return n ? `новых: ${n > 99 ? '99+' : n}` : ''; } });   // no red badge: toasts are frequent and would bury the real ones (gifts, chests) on the ✨ button
function closePanel() { if (panel) glog('open', 'закрыто окно', WORLD); panel = null; $('#sheet-wrap').classList.add('hidden'); $('#tour').classList.remove('under-panel'); }   // the tour card hides while a panel is open
// Update the DOM in place: unchanged nodes (icons!) stay, only changed text and attributes are written.
// A fresh innerHTML re-created every <img> and on phones the icons blinked on each refresh.
function morph(el, html) {
  const t = document.createElement('template'); t.innerHTML = html;
  morphChildren(el, t.content);
}
function morphChildren(a, b) {
  const an = [...a.childNodes].filter((n) => n.id !== 'mhint'), bn = [...b.childNodes];   // the mission hint plate sits on a card: a refresh threw it away every second, it blinked and jumped (tester 2026-11-23)
  for (let k = 0; k < bn.length; k++) {
    const x = an[k], y = bn[k];
    if (!x) { a.appendChild(y.cloneNode(true)); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y.cloneNode(true), x); continue; }
    if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType !== 1) continue;
    const pu = x.classList.contains('pulse');
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name) && !(at.name === 'style' && x.querySelector(':scope > #mhint'))) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (pu) x.classList.add('pulse');   // the lit card keeps glowing through refreshes
    if (x.nodeName === 'TEXTAREA' || x.nodeName === 'INPUT') continue;   // keep what the player typed
    morphChildren(x, y);
  }
  for (let k = an.length - 1; k >= bn.length; k--) a.removeChild(an[k]);
}
function refreshPanel() {   // re-render only when the content really changed (a fresh innerHTML every second made the icons blink)
  if (panel) { const h = emojiHtml(panel()); if (h !== panelHtml) { panelHtml = h; const sc = $('#sheet').scrollTop; morph($('#sheet'), h); $('#sheet').scrollTop = sc; } }
  updateHud();
}

// upgrade cards say «now -> next» (her «Подобную работу проведи со всеми комнатами, чтобы было понятно», 2026-11-23: cards showed only the per-level step and looked as if nothing changed)
function peek(bump, f) { bump(1); try { return f(); } finally { bump(-1); } }   // the value one level up: raise the level, read, put it back
const nn = (label, a, b, mx) => (mx ? `${label} ${a}` : `${label} ${a} → ${b}`);
const pc1 = (x) => String(Math.round(x * 1000) / 10).replace('.', ',') + '%';
const nnC = (label, a, b, mx) => { const f = fmt(a) === fmt(b) && a !== b ? (v) => Math.round(v).toLocaleString('ru-RU') : fmt; return nn(label, '🪙' + f(a), '🪙' + f(b), mx); };   // 1,9K -> 1,9K hid a +2% step: exact numbers then
function classPanel(i) {
  return () => {
    const C = CLASSES[i], st = S.classes[i];
    if (!isOpen(i)) {
      const left = Math.max(0, Math.ceil((st.buildEnd - Date.now()) / 1000));
      return `<div class="sh-head"><span class="remoji big">🏗️</span><div><h2>${C.name}</h2><div class="muted">Идёт стройка: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div></div><button class="x" data-close>✕</button></div>`;
    }
    let h = `<div class="sh-head"><span class="remoji big">${C.emoji}</span><div><h2>${C.name}</h2><div class="muted">${C.final ? 'Последний шаг: сдал — стал выпускником 🎓, не сдал — в библиотеку' : `Урок ${i + 1} из ${CLASSES.length - 1}`}</div></div><button class="x" data-close>✕</button></div>
      <div class="stats3"><div><span>🪙</span><b>${fmt(tuition(i))}</b><i>плата</i></div><div><span>🎯</span><b>${pct(success(i))}</b><i>сдают экзамен</i></div><div><span>⏱️</span><b>${sec(lessonTime(i))}</b><i>урок</i></div></div>
      ${overflow(i) > 0 ? `<p class="muted">🎯 Шанс уже максимальный (${Math.round(BAL.maxChance * 100)}%). Всё, что сверху (+${Math.round(overflow(i) * 100)}%), превращается в плату: <b>+${Math.round(overflow(i) * 200)}%</b>.</p>` : ''}
      <p class="muted">Очередь у двери: <b>${waitList[i].length}/${MAX_WAIT}</b>${sleepersFor(i) ? ` · в спальне ждут место: <b>${sleepersFor(i)}</b> 💤 — добавь парты или сократи урок, чтобы они быстрее вернулись` : ''}</p>${rankSection(i)}${helpersHtml(i)}`;
    h += `<div class="card up"><span class="remoji">🧙</span><div class="grow"><b>Учитель: ${C.teacher}</b><div class="muted">ур. ${st.teacher}/${MAX_TEACHER_LEVEL} · ${(() => { const mx = st.teacher >= MAX_TEACHER_LEVEL, b = (d) => { st.teacher += d; }; return `${nnC('плата', tuition(i), peek(b, () => tuition(i)), mx)} · ${nn('сдают', pct(success(i)), pct(peek(b, () => success(i))), mx)}`; })()} (+5% платы и +1,5% к экзамену за уровень)</div></div>
      ${st.teacher >= MAX_TEACHER_LEVEL ? '<span class="done">макс.</span>' : costBtn('↑', teacherCost(i), 'teacher', `data-i="${i}"`)}</div>`;
    h += `<div class="card up"><span class="remoji">🪑</span><div class="grow"><b>Парты: ${st.desks}/${maxDesksOf(i)}</b><div class="muted">больше учеников за раз</div></div>
      ${st.desks >= maxDesksOf(i) ? `<span class="done">${sizeOf(i) < MAX_SIZE && !C.final ? 'расширь класс' : 'макс.'}</span>` : costBtn('+1', deskCost(i), 'desk', `data-i="${i}"`)}</div>
    ${C.final ? '' : `<div class="card up"><span class="remoji">📐</span><div class="grow"><b>Расширить класс</b> <span class="muted">${['маленький', 'средний', 'большой'][sizeOf(i) - 1]}</span><div class="muted">${sizeOf(i) < MAX_SIZE ? `комната станет больше: до ${6 + 4 * sizeOf(i)} парт` : 'класс уже самый большой'}</div></div>
      ${sizeOf(i) >= MAX_SIZE ? '<span class="done">макс.</span>' : costBtn('↑', expandCost(i), 'expand', `data-i="${i}"`)}</div>`}`;
    h += `<div class="card up"><span class="remoji">⏱️</span><div class="grow"><b>Урок короче</b><div class="muted">ур. ${st.time}/${MAX_TIME_LEVEL} · ${nn('урок', sec(lessonTime(i)), sec(peek((d) => { st.time += d; }, () => lessonTime(i))), st.time >= MAX_TIME_LEVEL)} (−8% за уровень)</div></div>
      ${st.time >= MAX_TIME_LEVEL ? '<span class="done">макс.</span>' : costBtn('↑', timeCost(i), 'time', `data-i="${i}"`)}</div>`;
    h += lightHtml(i);
    h += w2Section(i);
    h += '<h3>Обстановка класса</h3>';
    C.items.forEach((it, k) => {
      const lv = st.items[k];
      h += `<div class="card up"><span class="remoji">${it.emoji}</span><div class="grow"><b>${it.name}</b> <span class="muted">ур. ${lv}</span>
        <div class="muted">${(() => { const mx = lv >= MAX_ITEM_LEVEL, b = (d) => { st.items[k] += d; }, pay = it.kind === 'tuition' || rawSuccess(i) >= BAL.maxChance;
          return (pay ? nnC('плата', tuition(i), peek(b, () => tuition(i)), mx) : nn('сдают', pct(success(i)), pct(peek(b, () => success(i))), mx)) + ' · '; })()}${it.kind === 'tuition' ? '+8% платы' : rawSuccess(i) >= BAL.maxChance ? `+2% платы (шанс уже ${Math.round(BAL.maxChance * 100)}%)` : '+1% к экзамену'} за уровень</div><div class="lvbar"><i style="width:${lv / MAX_ITEM_LEVEL * 100}%"></i></div></div>
        ${lv >= MAX_ITEM_LEVEL ? '<span class="done">макс.</span>' : costBtn(lv ? '↑' : 'Купить', itemCost(i, k), 'item', `data-i="${i}" data-k="${k}"`)}</div>`;
    });
    return h;
  };
}
function fountainPanel() {
  const u = courtUp(), n = courtList.filter((a) => !a.goal.brk).length, b = courtList.length - n;
  return `<div class="sh-head"><span class="remoji big">⛲</span><div><h2>Волшебный двор</h2><div class="muted">Здесь ждут свободной парты и отдыхают на перемене</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🪑</span><b>${courtList.length}/${courtCap()}</b><i>места во дворе</i></div><div><span>😊</span><b>+${Math.round(COURT_MOOD * fountMoodK() * 60)}</b><i>настроения в минуту</i></div><div><span>🍀</span><b>${coinLuck() ? '+' + (Math.round(coinLuck() * 1000) / 10) + '%' : '—'}</b><i>монетка к экзамену</i></div></div>
    <div class="card up"><span class="remoji">🪑</span><div class="grow"><b>Больше скамеек</b> <span class="muted">ур. ${u.bench}/${MAX_BENCH}</span><div class="muted">${nn('мест во дворе', courtCap(), peek((d) => { u.bench += d; }, courtCap), u.bench >= MAX_BENCH)} (+3 за уровень): ждут здесь, а не в спальне</div></div>
      ${u.bench >= MAX_BENCH ? '<span class="done">макс.</span>' : costBtn('↑', benchCost(), 'cbench')}</div>
    <div class="card up"><span class="remoji">⛲</span><div class="grow"><b>Волшебный фонтан</b> <span class="muted">ур. ${u.fount}/${MAX_FOUNT}</span><div class="muted">${nn('настроение во дворе', '+' + Math.round(COURT_MOOD * fountMoodK() * 60), '+' + Math.round(COURT_MOOD * peek((d) => { u.fount += d; }, fountMoodK) * 60), u.fount >= MAX_FOUNT)} в минуту (+20% за уровень); в очередях всей школы грустят на ${4 * (u.fount - 1)}% медленнее (−4% за уровень)</div></div>
      ${u.fount >= MAX_FOUNT ? '<span class="done">макс.</span>' : costBtn('↑', fountCost(), 'cfount')}</div>
    <div class="card up"><span class="remoji">🍀</span><div class="grow"><b>Монетка на счастье</b> <span class="muted">ур. ${u.coin}/${MAX_COIN}</span><div class="muted">бросил монетку в фонтан — ${u.coin ? nn('к следующему экзамену', '+' + pc1(coinLuck()), '+' + pc1(peek((d) => { u.coin += d; }, coinLuck)), u.coin >= MAX_COIN) + ' (+1% за уровень)' : '+5% к следующему экзамену'}</div></div>
      ${u.coin >= MAX_COIN ? '<span class="done">макс.</span>' : costBtn(u.coin ? '↑' : 'Открыть', coinCost(), 'ccoin')}</div>
    <p class="muted">Ждут места: <b>${n}</b> · на перемене: <b>${b}</b></p>`;
}
function dormPanel() {
  const u = dormUp(), used = dorm.filter(Boolean).length;
  return `<div class="sh-head"><span class="remoji big">🛏️</span><div><h2>Спальня</h2><div class="muted">${NAP_ON() ? 'Здесь ученики высыпаются и ждут места в классе' : 'Здесь ждут те, кому не хватило места у класса'}</div></div><button class="x" data-close>✕</button></div>
    ${NAP_ON() ? `<div class="card"><span class="remoji">🌙</span><div class="grow"><b>Сон</b><div class="muted">После ${NAP_N} уроков ученик устаёт 🥱 и ложится поспать, если есть свободная кровать. Выспавшийся следующие ${REST_L} урока учится на ${Math.round((1 - REST_K) * 100)}% быстрее. Перед Финальным экзаменом ученики высыпаются 🌙: +${Math.round(DREAM_BONUS * 100)}% к шансу сдать. ${NAP_KEEP} кровати всегда остаются для тех, кто ждёт места в классе.</div><div>Сейчас спят: устали — <b>${nappers('tired')}</b>, перед экзаменом — <b>${nappers('final')}</b>. Всего выспались: <b>${fmt(S.stats.naps || 0)}</b></div></div></div>` : ''}
    <div class="stats3"><div><span>🛏️</span><b>${used}/${bedCount()}</b><i>кровати</i></div><div><span>📝</span><b>${sec(checkinTime())}</b><i>запись</i></div><div><span>💔</span><b>${S.stats.left || 0}</b><i>ушли из школы</i></div></div>
    <div class="card up"><span class="remoji">🛏️</span><div class="grow"><b>Больше кроватей</b> <span class="muted">${bedCount()}/${maxBeds()}</span><div class="muted">${bedCount() >= maxBeds() && !dorm2Built() ? 'первая спальня заполнена — построй вторую' : '+1 кровать: меньше зверьков уходит'}</div></div>
      ${bedCount() >= maxBeds() ? '<span class="done">макс.</span>' : costBtn('+1', bedsCost(), 'beds')}</div>
    <div class="card up"><span class="remoji">🏗️</span><div class="grow"><b>Вторая спальня</b><div class="muted">${dorm2Built() ? 'построена' : 'сразу +9 кроватей'}</div></div>
      ${dorm2Built() ? '<span class="done">✓ есть</span>' : costBtn('Построить', DORM2_COST, 'dorm2')}</div>
    ${[1, 2].filter((k) => k === 1 || dorm2Built()).map((k) => `<div class="card up"><span class="remoji">📐</span><div class="grow"><b>Расширить ${k === 1 ? 'первую' : 'вторую'} спальню</b> <span class="muted">${['маленькая', 'средняя', 'большая'][dormSize(k) - 1]}</span><div class="muted">${dormSize(k) < 3 ? `место до ${4 * (dormRows(k) + 2)} кроватей` : 'уже самая большая'}</div></div>
      ${dormSize(k) >= 3 ? '<span class="done">макс.</span>' : costBtn('↑', dormExpandCost(k), 'dormexp', `data-k="${k}"`)}</div>`).join('')}
    <div class="card up"><span class="remoji">🗝️</span><div class="grow"><b>Консьержка быстрее</b> <span class="muted">ур. ${u.conc}/${MAX_CONC}</span><div class="muted">${nn('запись', sec(checkinTime()), sec(peek((d) => { u.conc += d; }, checkinTime)), u.conc >= MAX_CONC)} (−15% за уровень), спящие грустят на ${5 * (u.conc - 1)}% медленнее (−5% за уровень)</div></div>
      ${u.conc >= MAX_CONC ? '<span class="done">макс.</span>' : costBtn('↑', concCost(), 'conc')}</div>
    <p class="muted">У консьержки в очереди: ${dormLine.length}</p>
    ${CLASSES.map((C, i) => [C, sleepersFor(i)]).filter((x) => x[1]).map(([C, n]) => `<p class="muted">Ждут место в классе ${C.emoji} ${C.name}: <b>${n}</b></p>`).join('')}`;
}
function libPanel() {
  const u = libUp(), used = lib.filter(Boolean).length;
  return `<div class="sh-head"><span class="remoji big">📚</span><div><h2>Библиотека</h2><div class="muted">Здесь готовятся те, кто не сдал экзамен</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>📖</span><b>${used}/${libSeats()}</b><i>места</i></div><div><span>⏱️</span><b>${sec(libTime())}</b><i>подготовка</i></div><div><span>🎯</span><b>+${Math.round(libBonus() * 100)}%</b><i>к пересдаче</i></div></div>
    <div class="card up"><span class="remoji">📖</span><div class="grow"><b>Больше мест</b> <span class="muted">${libSeats()}/${MAX_LIB_SEATS}</span><div class="muted">+1 стол: больше учеников готовятся сразу</div></div>
      ${libSeats() >= MAX_LIB_SEATS ? '<span class="done">макс.</span>' : costBtn('+1', libSeatsCost(), 'libseats')}</div>
    <div class="card up"><span class="remoji">⏳</span><div class="grow"><b>Быстрее подготовка</b> <span class="muted">ур. ${u.speed}/${MAX_LIB_LVL}</span><div class="muted">${nn('подготовка', sec(libTime()), sec(peek((d) => { u.speed += d; }, libTime)), u.speed >= MAX_LIB_LVL)} (−12% за уровень)</div></div>
      ${u.speed >= MAX_LIB_LVL ? '<span class="done">макс.</span>' : costBtn('↑', libSpeedCost(), 'libspeed')}</div>
    <div class="card up"><span class="remoji">💡</span><div class="grow"><b>Лучше подготовка</b> <span class="muted">ур. ${u.bonus}/${MAX_LIB_LVL}</span><div class="muted">${nn('к шансу сдать после библиотеки', '+' + Math.round(libBonus() * 100) + '%', '+' + Math.round(peek((d) => { u.bonus += d; }, libBonus) * 100) + '%', u.bonus >= MAX_LIB_LVL)} (+3% за уровень)</div></div>
      ${u.bonus >= MAX_LIB_LVL ? '<span class="done">макс.</span>' : costBtn('↑', libBonusCost(), 'libbonus')}</div>
    <p class="muted">После библиотеки урок у ученика в 2 раза короче, а шанс сдать выше на ${Math.round(libBonus() * 100)}%.</p>`;
}
function cantPanel() {
  const u = cantUp(), head = (sub) => `<div class="sh-head"><span class="remoji big">🍽️</span><div><h2>${WORLD === 2 ? 'Пиршественный зал' : 'Столовая'}</h2><div class="muted">${sub}</div></div><button class="x" data-close>✕</button></div>`;
  if (!u.built) return `${head('Обеды для учеников')}
    <p>После урока часть учеников идёт в столовую: стоит в очереди к повару-дракончику, садится за стол и ест. Школа получает монеты, у ученика сильно поднимается настроение, а сытый ученик на следующем экзамене сдаёт на ${Math.round(FED_BONUS * 100)}% легче.</p>
    ${isOpen(CANT_NEED) ? `<button class="btn wide" data-cost="${CANT_COST}" data-act="cantbuild">Построить <span class="cost">🪙${fmt(CANT_COST)}</span></button><p class="muted">Стройка займёт ${Math.round(CANT_TIME / 60)} минут.</p>` : `<p class="muted">🔒 Сначала откройте класс «${CLASSES[CANT_NEED].name}».</p>`}`;
  if (!cantOpen()) { const left = Math.max(0, Math.ceil((u.end - Date.now()) / 1000)); return `${head('Идёт стройка')}<p>🏗️ Столовая откроется через ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}.</p>`; }
  const row = (k, emo, name, desc) => `<div class="card up"><span class="remoji">${emo}</span><div class="grow"><b>${name}</b> <span class="muted">ур. ${u[k]}/${CANT_MAX[k]}</span><div class="muted">${desc}</div></div>${u[k] >= CANT_MAX[k] ? '<span class="done">макс.</span>' : costBtn('↑', cantCost(k), 'cantup', `data-k="${k}"`)}</div>`;
  return `${head(`Накормлено: ${fmt(S.stats.cant || 0)}`)}
    <div class="stats3"><div><span>🪙</span><b>${fmt(cantPrice())}</b><i>за обед</i></div><div><span>🚶</span><b>${Math.round(cantChance() * 100)}%</b><i>заходят</i></div><div><span>⏱️</span><b>${sec(cantServe())}</b><i>раздача</i></div></div>
    ${(() => { const b = (k) => (d) => { u[k] += d; }, mx = (k) => u[k] >= CANT_MAX[k];
      return row('cook', '🐲', 'Повар', `${nn('раздача', sec(cantServe()), sec(peek(b('cook'), cantServe)), mx('cook'))} · ${nnC('обед', cantPrice(), peek(b('cook'), cantPrice), mx('cook'))} (быстрее на 12% и обед +3% за уровень)`)
        + row('tables', '🪑', 'Столы', `${nn('столов', cantTables(), peek(b('tables'), cantTables), mx('tables'))} · ${nn('заходят', Math.round(cantChance() * 100) + '%', Math.round(peek(b('tables'), cantChance) * 100) + '%', mx('tables'))}`)
        + row('menu', '📜', 'Меню', `${nnC('обед', cantPrice(), peek(b('menu'), cantPrice), mx('menu'))} · ${nn('настроение', '+' + cantMood() + '%', '+' + peek(b('menu'), cantMood) + '%', mx('menu'))}. Сейчас: ${cantDishes().join(' ')}`); })()}
    <p class="muted">Обед поднимает настроение на ${cantMood()}%. Сытый ученик сдаёт следующий экзамен на ${Math.round(FED_BONUS * 100)}% легче.</p>${WORLD === 2 ? `<div class="card up"><span class="remoji">🐟</span><div class="grow"><b>Светящаяся рыба: ${(S.w2 && S.w2.fish) || 0}/${FISH_MAX}</b><div class="muted">её ловят на уроках в Озёрном зале. Ужин из рыбы стоит вдвое дороже и поднимает настроение ещё на 10%</div></div></div>` : ''}`;
}
function shopPanel() {
  const u = shopUp();
  if (!u.built) return `<div class="sh-head"><span class="remoji big">🛍️</span><div><h2>${WORLD === 2 ? 'Самоцветная лавка' : 'Лавка'}</h2><div class="muted">Сладости и мелочи для учеников</div></div><button class="x" data-close>✕</button></div>
    <p>Между уроками ученики будут заходить в лавку за вкусняшками: школа получает монеты, а у ученика поднимается настроение.</p>
    <button class="btn wide" data-cost="${SHOP_COST}" data-act="shopbuild">Построить <span class="cost">🪙${fmt(SHOP_COST)}</span></button>`;
  const row = (k, emo, name, lvl, desc) => `<div class="card up"><span class="remoji">${emo}</span><div class="grow"><b>${name}</b> <span class="muted">ур. ${lvl}/${SHOP_MAX}</span><div class="muted">${desc}</div></div>${lvl >= SHOP_MAX ? '<span class="done">макс.</span>' : costBtn('↑', shopCost(k), 'shopup', `data-k="${k}"`)}</div>`;
  return `<div class="sh-head"><span class="remoji big">🛍️</span><div><h2>${WORLD === 2 ? 'Самоцветная лавка' : 'Лавка'}</h2><div class="muted">Продано: ${fmt(S.stats.shop || 0)}</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🪙</span><b>${fmt(shopPrice())}</b><i>за покупку</i></div><div><span>🚶</span><b>${Math.round(shopChance() * 100)}%</b><i>заходят</i></div><div><span>⏱️</span><b>${sec(shopTime())}</b><i>обслуживание</i></div></div>
    ${(() => { const b = (k) => (d) => { u[k] += d; }, mx = (k) => u[k] >= SHOP_MAX;
      return row('seller', '🧑‍🍳', 'Продавец', u.seller, `${nn('обслуживание', sec(shopTime()), sec(peek(b('seller'), shopTime)), mx('seller'))} · ${nnC('покупка', shopPrice(), peek(b('seller'), shopPrice), mx('seller'))} (быстрее на 12% и покупка +3% за уровень)`)
        + row('shelves', '🧺', 'Витрины', u.shelves, `${nn('заходят', Math.round(shopChance() * 100) + '%', Math.round(peek(b('shelves'), shopChance) * 100) + '%', mx('shelves'))} (+3% за уровень)`)
        + row('goods', '🍭', 'Товары', u.goods, `${nnC('покупка', shopPrice(), peek(b('goods'), shopPrice), mx('goods'))} (+15% взноса за уровень)`); })()}
    <p class="muted">Покупка поднимает настроение ученика на 15%.</p>`;
}
function dirBuildPanel() {
  const st = schoolStars(), ok = st >= DIR_STARS;
  return `<div class="sh-head"><span class="remoji big">👑</span><div><h2>Кабинет директора</h2><div class="muted">Решения для всей школы</div></div><button class="x" data-close>✕</button></div>
    <p>Здесь ты будешь принимать решения для всей школы: договор с учениками и взнос, рекламные акции, письма родителей, правила возврата взноса ушедшим, забота об учениках, дежурный завхоз и связи с инспекцией.</p>
    <p class="muted">Нужно: 🪙${fmt(DIR_COST)} и звёзды школы <b>⭐ ${st}/${DIR_STARS}</b>${ok ? '' : ' — звёзды дают проверки инспектора 🧐'}.</p>
    <button class="btn wide" data-cost="${DIR_COST}" data-act="dirbuild" ${ok ? '' : 'disabled'}>Построить <span class="cost">🪙${fmt(DIR_COST)} ⭐${DIR_STARS}</span></button>`;
}
function dirPanel() {
  let h = `<div class="sh-head"><span class="remoji big">👑</span><div><h2>Кабинет директора</h2><div class="muted">Решения для всей школы</div></div><button class="x" data-close>✕</button></div>
    ${tikhonOn() ? advisorBlock() : ''}
    <p class="muted">Взнос новичка сейчас 🪙${fmt(entryFee())}. Кто уходит расстроенным, получает его назад: ${Math.round(refundRate() * 100)}%. Уже вернули: 🪙${fmt(S.stats.refunded || 0)}.</p>` + bossBlock();
  for (const [k, u] of Object.entries(DIR_UP)) {
    const l = dirLvl(k);
    h += `<div class="card up"><span class="remoji">${u.emo}</span><div class="grow"><b>${u.name}</b> <span class="muted">ур. ${l}/${u.max}</span><div class="muted">сейчас: ${u.desc(l)}${l < u.max ? `<br>станет: ${u.desc(l + 1)}` : ''}${k === 'refund' ? ' <i>(чем меньше, тем выгоднее школе)</i>' : ''}</div></div>
      ${l >= u.max ? '<span class="done">макс.</span>' : costBtn('↑', dirCost(k), 'dir', `data-k="${k}"`)}</div>`;
  }
  return h;
}
function receptionPanel() {
  return `<div class="sh-head"><span class="remoji big">🛎️</span><div><h2>Приёмная</h2><div class="muted">Здесь новые ученики поступают в школу</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🪙</span><b>${entryFee()}</b><i>взнос</i></div><div><span>⏱️</span><b>${perMin(procTime())}</b><i>оформляют в минуту</i></div><div><span>🚶</span><b>${perMin(arrivalInterval())}</b><i>приходят в минуту</i></div></div>
    <div class="card up"><span class="remoji">🧾</span><div class="grow"><b>Секретарь</b> <span class="muted">ур. ${recLvl()}/${MAX_REC_LVL}</span><div class="muted">${(() => { const mx = S.reception.level >= MAX_REC_LVL, b = (d) => { S.reception.level += d; }; return `${nn('оформляют в минуту', perMin(procTime()), perMin(peek(b, procTime)), mx)}${peek(b, entryFee) !== entryFee() ? ' · ' + nnC('взнос', entryFee(), peek(b, entryFee), mx) : mx ? ' · взнос 🪙' + fmt(entryFee()) : ''}`; })()}</div></div>${S.reception.level >= MAX_REC_LVL ? '<span class="done">макс.</span>' : costBtn('↑', recCost(), 'rec')}</div>
    <div class="card up"><span class="remoji">📣</span><div class="grow"><b>Объявления о школе</b> <span class="muted">ур. ${adsLvl()}/${MAX_REC_LVL}</span><div class="muted">${nn('приходят в минуту', perMin(arrivalInterval()), perMin(peek((d) => { S.reception.ads += d; }, arrivalInterval)), S.reception.ads >= MAX_REC_LVL)}${adsFull() && S.reception.ads < MAX_REC_LVL ? '<br>' + adsWhy() : ''}</div></div>${S.reception.ads >= MAX_REC_LVL ? '<span class="done">макс.</span>' : adsFull() ? '<span class="done">хватает</span>' : costBtn('↑', adsCost(), 'ads')}</div>
    <p class="muted">Настроение учеников: <b>${moodFace(avgMood())} ${Math.round(avgMood())}%</b>. Долгие очереди огорчают, уроки и библиотека радуют. Весёлые сдают экзамен лучше, а совсем грустные уходят домой (ушли от тоски: ${S.stats.gaveUp || 0}).</p>
    <p class="muted">Сейчас школа принимает ~${perMin(1 / Math.max(1e-6, (S.rt && S.rt.enrolled) || 0))} новичков в минуту${adsFull() ? ', больше не помещается' : ''}.</p>
    <p class="muted">Всего поступило: ${S.stats.enrolled} · выпускников: ${S.stats.graduated} · ушли расстроенными: ${S.stats.left || 0}</p>`;
}
function buildPanel(i) {
  return () => {
    const C = CLASSES[i];
    return `<div class="sh-head"><span class="remoji big">${C.emoji}</span><div><h2>${C.name}</h2><div class="muted">Новый класс</div></div><button class="x" data-close>✕</button></div>
      <p>Ученики будут приходить сюда после предыдущего урока. Плата за урок: <b>🪙${fmt(C.tuition)}</b>.</p>
      <p class="muted">Стройка займёт ${buildTime(i) >= 3600 ? +(buildTime(i) / 3600).toFixed(1) + ' ч' : buildTime(i) >= 60 ? Math.round(buildTime(i) / 60) + ' мин' : buildTime(i) + ' с'}.</p>
      ${starsNeed(i) > schoolStars() ? `<p class="muted">Нужно звёзд школы: <b>⭐ ${schoolStars()}/${starsNeed(i)}</b>. Звёзды дают проверки инспектора 🧐${calm() ? ' — выключи спокойный режим в ⚙️, чтобы он приходил' : ''}.</p>` : ''}
      <button class="btn wide" data-cost="${buildCost(i)}" data-act="build" data-i="${i}" ${starsNeed(i) > schoolStars() ? 'disabled' : ''}>Построить <span class="cost">🪙${fmt(buildCost(i))}${starsNeed(i) ? ` ⭐${starsNeed(i)}` : ''}</span></button>`;
  };
}
const starsNeed = (i) => (WORLD === 1 ? [0, 0, 0, 1, 3, 5][i] || 0 : 0);   // stars are needed in calm mode too: the player turns the inspector on when in the mood to earn them (her ruling 2026-11-21)   // charms 1, flight 3, elements 5 stars (classes already built stay)
function settingsPanel() {
  return `<div class="sh-head"><h2>Настройки</h2><button class="x" data-close>✕</button></div>
    <p class="muted">Версия ${VERSION} (сборка ${BUILD}). Это тестовая версия, картинки пока не все. Значки: Twemoji (CC-BY 4.0).</p>
    <p>Экзаменов сдано: ${S.stats.passed} · не сдано: ${S.stats.failed} · выпускников: ${S.stats.graduated}</p>
    <h3>🎵 Музыка</h3><button class="btn ghost wide" data-music="${musicOn() ? 0 : 1}">${musicOn() ? '🔇 Выключить музыку' : '🎵 Включить музыку'}</button>
    <h3>🔔 Звуки</h3><button class="btn ghost wide" data-sfx="${sfxOn() ? 0 : 1}">${sfxOn() ? '🔕 Выключить звуки происшествий' : '🔔 Включить звуки происшествий'}</button>
    <h3>😌 Спокойный режим</h3>${calmBlock()}
    ${cloudBlock()}
    <h3>Отзыв</h3>
    <input id="fb-name" class="fb" placeholder="Твоё имя" value="${(localStorage.getItem('magicschool.name') || '').replace(/"/g, '&quot;')}">
    <textarea id="fb-text" class="fb" rows="4" placeholder="Что понравилось? Что сломалось или было непонятно?"></textarea>
    <div id="fb-pics" class="fb-pics"></div>
    <label class="btn ghost wide fb-add">📷 Добавить картинку (до 3)<input id="fb-file" type="file" accept="image/*" multiple hidden></label>
    <button class="btn wide" data-feedback>💌 Отправить отзыв</button>${fbReplies().length ? `<button class="btn ghost wide" data-replies>💌 Ответы на отзывы (${fbReplies().length})</button>` : ''}
    <button class="btn ghost wide" data-gamelog>📜 Журнал событий</button>${AV.isMod() ? `<button class="btn ghost wide" data-animpilot>🧪 Проба анимаций: ${localStorage.getItem('magicschool.anim') === 'fx' ? 'включена' : 'выключена'}</button>` : ''}
    <button class="btn ghost wide" data-tour-again>❓ Как играть (обучение)</button>
    <button class="btn ghost wide" data-reset>Начать игру заново</button>`;
}
settingsPanel.still = true;   // contains a text field: never re-render it automatically
function deviceName() {
  const ua = navigator.userAgent;
  const m = ua.match(/iPhone OS [\d_]+|iPad; CPU OS [\d_]+|Android [\d.]+[^;)]*;?[^;)]*/);
  return (m ? m[0].replace(/_/g, '.') : ua.slice(0, 60)) + ` · экран ${screen.width}x${screen.height}`;
}
const FEEDBACK_URL = 'https://lazy.vazuza.love/game/feedback';   // relay of the family bot: goes straight to Maria's Telegram
// pictures for the feedback: shrunk to <= 1280 px JPEG in the browser before sending
let fbPics = [];
function drawFbPics() {
  const el = $('#fb-pics'); if (!el) return;
  el.innerHTML = fbPics.map((d, k) => `<div class="fb-pic"><img src="${d}" alt=""><button class="x" data-fb-del="${k}">✕</button></div>`).join('');
}
function shrinkImage(file) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = () => { URL.revokeObjectURL(url); bad(new Error('image')); };
    im.src = url;
  });
}
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'fb-file') return;
  for (const f of [...e.target.files].slice(0, 3 - fbPics.length)) { try { fbPics.push(await shrinkImage(f)); } catch (err) { toast('Не получилось открыть картинку'); } }
  e.target.value = ''; drawFbPics();
});
// ---- answers from the author (Maria 2026-11-23: «Хочу сделать возможность отвечать на запрос тестировщика ... Я хочу мочь прислать ответ»):
// every feedback carries this phone's id (№xxxxxxxx); Maria answers the feedback message in Telegram with a reply, the relay keeps the
// answer, the game asks for it (players who wrote: at the start, every minute and on return) and shows it in its own window.
const REPLIES_URL = 'https://lazy.vazuza.love/game/replies';
function fbId() { let v = localStorage.getItem('magicschool.fbid'); if (!/^[a-z0-9]{8}$/.test(v || '')) { v = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); localStorage.setItem('magicschool.fbid', v); } return v; }
const fbReplies = () => { try { return JSON.parse(localStorage.getItem('magicschool.fbreplies') || '[]'); } catch (e) { return []; } };
let replyBusy = false;
async function checkReplies() {
  if (replyBusy || !localStorage.getItem('magicschool.fbsent') || document.hidden) return;
  if (!window.__ready) { setTimeout(checkReplies, 5000); return; }   // not under the loading curtain
  replyBusy = true;
  try {
    const old = fbReplies(), since = old.reduce((m, r) => Math.max(m, r.t || 0), 0);
    const r = await fetch(`${REPLIES_URL}?id=${fbId()}&since=${since}`, { cache: 'no-store' }); if (!r.ok) return;
    const got = ((await r.json()).replies || []).filter((x) => x && x.text && x.t > since);
    if (!got.length) return;
    localStorage.setItem('magicschool.fbreplies', JSON.stringify(old.concat(got.map((x) => ({ ...x, seen: 0 }))).slice(-30)));
    if (panel || tourStep >= 0) toast('💌 Автор игры ответил на твой отзыв: открой ⚙️ → «Ответы на отзывы»'); else openPanel(repliesPanel);
  } catch (e) { /* offline: next time */ } finally { replyBusy = false; }
}
function repliesPanel() {
  const list = fbReplies(); localStorage.setItem('magicschool.fbreplies', JSON.stringify(list.map((x) => ({ ...x, seen: 1 }))));
  const rows = list.slice().reverse().map((x) => `<div class="card up" style="display:block">${x.q ? `<div class="muted">Ты писал(а): «${escTxt(x.q)}»</div>` : ''}<div style="margin-top:4px;white-space:pre-wrap">${escTxt(x.text)}</div><div class="muted" style="margin-top:4px;font-size:12px">${new Date(x.t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div></div>`).join('');
  return `<div class="sh-head"><span class="remoji big">💌</span><div><h2>Ответ автора игры</h2><div class="muted">на твои отзывы</div></div><button class="x" data-close>✕</button></div>
    ${rows || '<p class="muted">Ответов пока нет.</p>'}<button class="btn wide" data-close>Спасибо! 💜</button>`;
}
setTimeout(checkReplies, 8000); setInterval(checkReplies, 60000);   // every minute (her «Ничего не было»: at 3 min the answer looked lost)
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(checkReplies, 3000); });
async function sendFeedback() {
  const msg = ($('#fb-text').value || '').trim();
  const name = ($('#fb-name').value || '').trim().slice(0, 40);
  if (!msg) { toast('Напиши пару слов в поле отзыва'); return; }
  localStorage.setItem('magicschool.name', name);
  const built = S.classes.filter((c) => c.built).length;
  const text = `Отзыв о «Школе магии» от ${name || 'без имени'} (№${fbId()}):

${msg}

— версия ${VERSION} (сборка ${BUILD})
— ${deviceName()}
— монет ${fmt(S.coins)}, классов ${built}, выпускников ${S.stats.graduated}, ушли ${S.stats.left || 0}, рейтинг ${ratingTxt()}

📜 Последние события (журнал игры):
${gtail(30)}`;
  const btn = document.querySelector('[data-feedback]'); if (btn) { btn.disabled = true; btn.textContent = 'Отправляю…'; }
  try {
    const r = await fetch(FEEDBACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, images: fbPics }) });
    if (r.ok) { localStorage.setItem('magicschool.fbsent', '1'); setTimeout(checkReplies, 60000); $('#fb-text').value = ''; fbPics = []; drawFbPics(); toast('Отзыв отправлен, спасибо! 💜'); if (btn) { btn.disabled = false; btn.textContent = '💌 Отправить отзыв'; } return; }
    if (r.status === 429) { toast('Слишком много отзывов подряд, попробуй через 10 минут'); if (btn) { btn.disabled = false; btn.textContent = '💌 Отправить отзыв'; } return; }
  } catch (e) { /* no network or relay down: fall back to sharing */ }
  if (btn) { btn.disabled = false; btn.textContent = '💌 Отправить отзыв'; }
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Не получилось отправить: отзыв скопирован, вставь его в сообщение автору'); }
  catch (e) { window.prompt('Скопируй отзыв и отправь автору игры:', text); }
}


// ======================= endless missions =======================
// The fixed chain (data.js) comes first; then a new mission is generated each time from the state of the school.
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// ---- fair mission rewards (her ruling 2026-11-21: «Задания не соразмерны полученным деньгам») ----
// ---- mission kinds for the features added since build 237 (2026-11-23, her «Обновить нужно все задания и обучения ... весь пул
// уже не затрагивает нововведения»). 'up' = raise an upgrade «ур. a → b» (UPS, per class: CUPS); 'cnt' = make a counter grow (CNTS).
// cost() = price of the next level now, k = its growth per level: the reward pays back REWARD_SHARE of the whole way.
const slotOfId = (id) => { const i = CLASSES.findIndex((c) => (id === 'final' ? c.final : c.id === id)); return i >= 0 ? CLASS_SLOT[i] : null; };
const openId = (id) => { const i = CLASSES.findIndex((c) => c.id === id); return i >= 0 && isOpen(i); };
const UPS = {
  cbench: { g: 'court', name: 'Скамейки во дворе', on: () => WORLD === 1 && !!COURT, lvl: () => courtUp().bench, max: () => MAX_BENCH, cost: () => benchCost(), k: 2.0, go: () => ['FOUNT', '[data-act="cbench"]'] },
  cfount: { g: 'court', name: 'Волшебный фонтан', on: () => WORLD === 1 && !!COURT, lvl: () => courtUp().fount, max: () => MAX_FOUNT, cost: () => fountCost(), k: 2.0, go: () => ['FOUNT', '[data-act="cfount"]'] },
  ccoin: { g: 'court', name: 'Монетка на счастье', on: () => WORLD === 1 && !!COURT, lvl: () => courtUp().coin, max: () => MAX_COIN, cost: () => coinCost(), k: 1.6, go: () => ['FOUNT', '[data-act="ccoin"]'] },
  ...Object.fromEntries(Object.keys(DIR_UP).map((k) => ['dir_' + k, { g: 'dir', name: DIR_UP[k].name, on: () => bossOn(), lvl: () => dirLvl(k), max: () => DIR_UP[k].max, cost: () => dirCost(k), k: DIR_UP[k].k, go: () => ['DIR', `[data-act="dir"][data-k="${k}"]`] }])),
  ...Object.fromEntries([['seller', 'Продавец'], ['shelves', 'Витрины'], ['goods', 'Товары']].map(([k, name]) => ['shop_' + k, { g: 'shop', name: name + ' в лавке', on: () => shopOpen(), lvl: () => shopUp()[k], max: () => SHOP_MAX, cost: () => shopCost(k), k: 1.9, go: () => ['SHOP', `[data-act="shopup"][data-k="${k}"]`] }])),
  ...Object.fromEntries([['cook', 'Повар'], ['tables', 'Столы'], ['menu', 'Меню']].map(([k, name]) => ['cant_' + k, { g: 'cant', name: name + ' в столовой', on: () => cantOpen(), lvl: () => cantUp()[k], max: () => CANT_MAX[k], cost: () => cantCost(k), k: 1.9, go: () => ['CANT', `[data-act="cantup"][data-k="${k}"]`] }])),
  towercap: { g: 'tower', name: WORLD === 2 ? 'Места в Чертоге Хранителей' : 'Места в Башне мастеров', show: (v) => v + TOWER_BASE, unit: 'мест', text: (t) => `Расширь ${WORLD === 2 ? 'Чертог Хранителей' : 'Башню мастеров'} до ${t + TOWER_BASE} мест`, on: () => towerOpen(), lvl: () => towerUp().cap, max: () => TOWER_MAXUP, cost: () => towerCapCost(), k: 1.45, go: () => ['TOWER', '[data-act="towercap"]'] },
  towerprep: { g: 'tower', name: WORLD === 2 ? 'Подготовка хранителей' : 'Подготовка мастеров', on: () => towerOpen(), lvl: () => retakeLvl(), max: () => RETAKE_MAX, cost: () => retakeCost(), k: 2.0, go: () => ['TOWER', '[data-act="towerprep"]'] },
  ads: { g: 'room', name: 'Объявления о школе', on: () => !adsFull(), lvl: () => S.reception.ads, max: () => MAX_REC_LVL, cost: () => adsCost(), k: BAL.ads, go: () => ['REC', '[data-act="ads"]'] },
  libspeed: { g: 'room', name: 'Быстрее подготовка (библиотека)', on: () => true, lvl: () => libUp().speed, max: () => MAX_LIB_LVL, cost: () => libSpeedCost(), k: 1.5, go: () => ['LIB', '[data-act="libspeed"]'] },
  libbonus: { g: 'room', name: 'Лучше подготовка (библиотека)', on: () => true, lvl: () => libUp().bonus, max: () => MAX_LIB_LVL, cost: () => libBonusCost(), k: 1.55, go: () => ['LIB', '[data-act="libbonus"]'] },
  conc: { g: 'room', name: 'Консьержка быстрее', on: () => true, lvl: () => dormUp().conc, max: () => MAX_CONC, cost: () => concCost(), k: 1.5, go: () => ['DORM', '[data-act="conc"]'] },
  store: { g: 'w2', name: 'Склад руды', on: () => WORLD === 2 && openId('mine'), lvl: () => W2().store, max: () => MAX_STORE, cost: () => storeCost(), k: 2.0, go: () => [slotOfId('mine'), '[data-act="store"]'] },
  ...Object.fromEntries([['wagon', 'Повозка больше', 2.6], ['road', 'Дорога короче', 2.4], ['price', 'Цена выше', 2.4]].map(([k, name, gk]) => ['tup_' + k, { g: 'w2', name: name + ' (Торговый двор)', on: () => tradeOpen(), lvl: () => trade()[k], max: () => MAX_TUP, cost: () => tupCost(k), k: gk, go: () => ['TRADE', `[data-act="tup"][data-k="${k}"]`] }])),
};
const CUPS = {   // per class (m.i)
  ex: { g: 'rank', name: 'Шанс экзамена на звание', on: (i) => RANK_AT(i) > 0, lvl: (i) => exLvl(i), max: () => MAX_EX_LVL, cost: (i) => exCost(i), k: 2.0, act: 'exlvl' },
  xpl: { g: 'rank', name: 'Опыт за урок', on: (i) => RANK_AT(i) > 0, lvl: (i) => xplLvl(i), max: () => MAX_XPL_LVL, cost: (i) => xplCost(i), k: 1.8, act: 'xpllvl' },
  light: { g: 'w2', name: 'Светильники', on: (i) => WORLD === 2 && hallDark(i) > 1e-9, lvl: (i) => lightLvl(i), max: (i) => lightMax(i), cost: (i) => lightCost(i), k: 1.9, act: 'light' },
  expand: { g: 'room', name: 'Расширить класс', on: (i) => !CLASSES[i].final, lvl: (i) => sizeOf(i), max: () => MAX_SIZE, cost: (i) => expandCost(i), k: BAL.expandK, act: 'expand' },
};
const upOf = (m) => { const U = m.i >= 0 && CUPS[m.k] ? CUPS[m.k] : UPS[m.k]; return U ? { ...U, on: () => U.on(m.i), lvl: () => U.lvl(m.i), max: () => U.max(m.i), cost: () => U.cost(m.i), go: () => (U.go ? U.go() : [CLASS_SLOT[m.i], `[data-act="${U.act}"]`]) } : null; };
const rankSum = () => (S.stats.ranks || []).reduce((a, b) => a + (b || 0), 0);
const formSum = () => FORM_KEYS.reduce((a, k) => a + ((S.forms && S.forms[k] && S.forms[k].lvl) || 0), 0);
const lowEx = () => { let b = -1; for (let i = 0; i < CLASSES.length; i++) if (isOpen(i) && RANK_AT(i) && exLvl(i) < MAX_EX_LVL && (b < 0 || exLvl(i) < exLvl(b))) b = i; return b < 0 ? null : [CLASS_SLOT[b], '[data-act="exlvl"]']; };
// build audit 2026-11-24: other schools in my alliance (-1 = the top list is not loaded yet); a founder alone got gift tasks he could never do
const allyMates = () => { const a = myAl(); if (!a) return 0; if (!topList) return -1; const me = anonUid() + '_w' + WORLD; return allyMembers(a).filter((x) => x.id !== me).length; };
const nOf = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
const CNTS = {
  shop: { g: 'shop', on: () => shopOpen(), now: () => S.stats.shop || 0, n: () => rint(3, 8) * 10, text: (n) => `Пусть ученики купят в лавке ещё ${n} сладостей 🍭`, go: () => ['SHOP', '[data-act="shopup"][data-k="shelves"]'] },
  cant: { g: 'cant', on: () => cantOpen(), now: () => S.stats.cant || 0, n: () => rint(3, 8) * 10, text: (n) => `Накорми в столовой ещё ${n} учеников 🍲`, go: () => ['CANT', '[data-act="cantup"][data-k="tables"]'] },
  ranks: { g: 'rank', on: () => S.stats.graduated >= 10, now: rankSum, n: () => rint(2, 6) * 5, text: (n) => `Пусть ещё ${n} ${nOf(n, 'ученик получит', 'ученика получат', 'учеников получат')} звание 🌟`, go: lowEx },
  masters: { g: 'rank', on: () => isOpen(NCLS - 1) && ((S.stats.ranks || [])[4] || 0) > 0, now: () => (S.stats.ranks || [])[5] || 0, n: () => rint(1, 3), text: (n) => `Пусть ещё ${n} ${nOf(n, 'ученик получит', 'ученика получат', 'учеников получат')} высшее звание «${RANKS[RANKS.length - 1]}» 🌟`, go: () => [slotOfId('final'), '[data-act="exlvl"]'] },
  camps: { g: 'dir', on: () => bossOn(), cost: () => Math.min(...Object.keys(CAMPS).map((k) => campCost(k))), back: 1, now: () => S.stats.camps || 0, n: () => 1, text: () => 'Проведи рекламную акцию в кабинете директора 📣', go: () => ['DIR', '[data-act="camp"]'] },
  mails: { g: 'dir', on: () => bossOn() && S.stats.graduated >= 20 && !calm(), now: () => S.stats.mails || 0, n: () => 1, text: () => 'Ответь на письмо родителей ✉️', go: () => ['DIR', '[data-mailopen]'] },   // build 313 moved the answers into their own window
  games: { g: 'mg', on: () => WORLD === 2, now: () => mgRounds(), n: () => rint(2, 4), text: (n) => `Сыграй ещё ${n} ${nOf(n, 'раз', 'раза', 'раз')} в мини-игры ✨`, go: () => ['@mg', null] },   // world 2: Огранка, Башня, Вагонетка
  pot: { g: 'mg', on: () => WORLD === 1, now: () => (S.mg && S.mg.pot) || 0, n: () => rint(2, 4), text: (n) => `Свари ещё ${n} ${nOf(n, 'зелье', 'зелья', 'зелий')} в Зельеварке 🧪`, go: () => ['@mg', null] },
  gifts: { g: 'gift', on: () => allyMates() > 0, keep: () => allyMates() !== 0, now: () => S.stats.gifts || 0, n: () => 1, text: () => 'Отправь подарок другу из альянса 🎁', go: () => ['@ally', null] },
  forms: { g: 'rank', on: () => FORM_KEYS.some(formReady), now: formSum, n: () => 1, text: () => 'Улучши карточку ученика в альбоме 🎓', go: () => ['@album', null],
    cost: () => Math.min(...FORM_KEYS.filter(formReady).map(formCost)) },
  ore: { g: 'w2', on: () => WORLD === 2 && openId('mine'), now: () => S.stats.ore || 0, n: () => rint(3, 8) * 10, text: (n) => `Добудь в Штольне ещё ${n} руды ⛏️`, go: () => [slotOfId('mine'), '[data-act="desk"]'] },
  forged: { g: 'w2', on: () => WORLD === 2 && openId('mine') && openId('forge'), now: () => S.stats.forged || 0, n: () => rint(2, 5) * 10, text: (n) => `Выкуй в Кузне ещё ${n} ${nOf(n, 'изделие', 'изделия', 'изделий')} ⚒️`, go: () => [slotOfId('forge'), '[data-act="desk"]'] },
  caravans: { g: 'w2', on: () => tradeOpen(), now: () => S.stats.caravans || 0, n: () => rint(1, 3), text: (n) => `Отправь ещё ${n} ${nOf(n, 'караван', 'каравана', 'караванов')} 🐐`, go: () => ['TRADE', '[data-act="caravan"]'] },
};
// where a story mission's go points: '#classId' -> that class's room; the rest as is
const storyGo = (go) => (go && go[0] && go[0][0] === '#' ? [slotOfId(go[0].slice(1)), go[1]] : go);
// story «first Master» (tester 2026-11-23: «перекидывает туда где ты не можешь ничего прокачать»): a Master comes only from an elder mage (rank 4,
// made in the Elements class) passing the rank exam in the exam hall. No elder in school -> the Elements rank exam; else the cheaper of the two chance upgrades
const ELDER_I = () => CLASSES.findIndex((c, i) => !c.final && RANK_AT(i) === 4), FINAL_I = () => CLASSES.findIndex((c) => c.final);
const eldersNow = () => inSchool().filter((a) => SPECIES.includes(a.sp) && (a.rk || 0) === 4).length;
const isMasterStory = (m) => !!m && (m.id === 'master' || m.id === 'w_master');
function masterGo() {
  const E = ELDER_I(), F = FINAL_I(), up = (i) => isOpen(i) && exLvl(i) < MAX_EX_LVL;
  if (E >= 0 && up(E) && (!eldersNow() || !up(F) || exCost(E) < exCost(F))) return [CLASS_SLOT[E], '[data-act="exlvl"]'];
  return [CLASS_SLOT[F], up(F) ? '[data-act="exlvl"]' : null];
}
function masterHint() {
  const E = ELDER_I(), F = FINAL_I(), n = eldersNow(), W2 = WORLD === 2;
  if (!n) return `📋 Сначала нужен ${W2 ? 'Старший мастер' : 'Старший маг'}: его дают в классе «${CLASSES[E].name}» (шанс ${pct(rankChance(E))} за урок)`;
  return `📋 ${W2 ? 'Старших мастеров' : 'Старших магов'} сейчас: ${n} · каждый станет ${RANKS_TO[5]} с шансом ${pct(rankChance(F))} за урок`;
}
// story chain: S.story = ids of claimed missions; old saves kept an index S.mission into the 13 first (v1) ones
function storyCur() {
  if (!S.story) { S.story = {}; if (WORLD === 1) MISSIONS.filter((m) => m.v1).slice(0, S.mission || 0).forEach((m) => { S.story[m.id] = 1; }); }
  return MISSIONS.find((m) => !S.story[m.id]) || null;
}
const storyBuilds = () => { const c = storyCur(); return !!(c && c.build); };   // the story itself asks to build the next class
// build audit 2026-11-24: Tikhon's rewards were sized for the old prices (60 000 for a 150 000 000 class, while the level mission for the same
// class would pay 30 %). A story step that builds something now pays at least REWARD_SHARE of that building's live price, like the level
// missions, and every step at least STORY_MIN minutes of the school's steady income; the listed reward stays the floor (early chain unchanged).
const STORY_COST = { dir: () => DIR_COST, shop: () => SHOP_COST, cant: () => CANT_COST, tower: () => towerCost(), w_trade: () => TRADE_COST };
const STORY_MIN = 3;
function storyReward(m) {
  let cost = 0, inc = 1;
  try { const i = m.build ? CLASSES.findIndex((c) => c.id === m.build) : -1; cost = i >= 0 ? buildCost(i) : STORY_COST[m.id] ? STORY_COST[m.id]() : 0; } catch (e) { cost = 0; }
  try { inc = qPerMin(); } catch (e) { inc = 1; }   // qPerMin is declared further down the module
  return Math.max(m.reward, nice(Math.max(cost * REWARD_SHARE, inc * STORY_MIN)));
}
const storyNote = (m) => { try { const t = m.note && m.note(G); return t ? ` (${t})` : ''; } catch (e) { return ''; } };   // e.g. calm mode: no letters come
window.__ms = { list: () => missionList(), make: () => makeMission(), go: (k) => goMission(k), claim: (k) => claimMission(k), story: () => storyCur(), goT: (g) => goTarget(g), hint: () => (document.getElementById('mhint') || {}).textContent || '', introNow: () => { introT = 0; }, tour: () => [tourStep, tourList.length, introKey], UPS, CNTS, CUPS };   // test hook
// upgrades pay back REWARD_SHARE of what they cost; counting missions pay for the minutes they really take at the current pace
const REWARD_SHARE = 0.3, TIME_SHARE = 0.25;
const nice = (x) => { const e = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, x))) - 1)); return Math.round(x / e) * e; };
// coins a mission still needs, with today's prices (build 310, tester «в заданиях видеть сколько нужно денег на выполнение задания. Если
// не хватает красным, если хватает зелёным»): multi-level upgrades = the next price x the geometric growth; -1 = not a purchase
const geoN = (k, n) => (n <= 0 ? 0 : k === 1 ? n : (Math.pow(k, n) - 1) / (k - 1));
function sumLevels(get, set, cost, target, max = 1e9) {   // the real price of every level from now to target (state restored)
  const L0 = get(); let c = 0;
  try { for (let L = L0; L < Math.min(target, max); L++) { set(L); c += cost(); } } finally { set(L0); }
  return c;
}
function missionNeed(m) {
  try {
    const st = m.i >= 0 ? S.classes[m.i] : null;
    switch (m.type) {
      case 'item': return sumLevels(() => st.items[m.k], (v) => { st.items[m.k] = v; }, () => itemCost(m.i, m.k), m.target, MAX_ITEM_LEVEL);
      case 'teacher': return sumLevels(() => st.teacher, (v) => { st.teacher = v; }, () => teacherCost(m.i), m.target);
      case 'rec': return sumLevels(() => S.reception.level, (v) => { S.reception.level = v; }, () => recCost(), m.target, MAX_REC_LVL);
      case 'up': {
        if (m.i >= 0 && (m.k === 'ex' || m.k === 'xpl')) return sumLevels(() => st[m.k] || 0, (v) => { st[m.k] = v; }, () => (m.k === 'ex' ? exCost(m.i) : xplCost(m.i)), m.target);
        if (m.k === 'ads') return sumLevels(() => S.reception.ads, (v) => { S.reception.ads = v; }, () => adsCost(), m.target, MAX_REC_LVL);
        const U = upOf(m); if (!U) return -1;   // other upgrades: today's price, then the plain step or the pace floor, whichever is higher
        const L0 = U.lvl(), c0 = U.cost(); let c = 0;
        for (let j = 0; j < m.target - L0; j++) c += Math.max(c0 * Math.pow(U.k, j), paceInc() * paceMin(L0 + 1 + j));
        return c;
      }
      default: return missionCost(m);
    }
  } catch (e) { return -1; }
}
function missionCost(m) {   // coins still needed from the current state to the target
  const C = CLASSES[m.i], st = m.i >= 0 ? S.classes[m.i] : null; let c = 0;
  switch (m.type) {
    case 'item': for (let L = st.items[m.k]; L < m.target; L++) c += C.tuition * 2 * (1 + m.k) * Math.pow(BAL.item, L); return c;
    case 'teacher': for (let L = st.teacher; L < m.target; L++) c += C.tuition * 6 * Math.pow(BAL.teacher, L - 1); return c;
    case 'desk': return deskCost(m.i);
    case 'time': return timeCost(m.i);
    case 'rec': for (let L = S.reception.level; L < m.target; L++) c += 20 * Math.pow(BAL.rec, L - 1); return c;
    case 'beds': return bedsCost();
    case 'lib': return libSeatsCost();
    case 'build': return buildCost(m.i);   // was buildCost(i): ReferenceError on his father's phone (build 174)
    case 'up': { const U = upOf(m); if (!U) return -1; const n = Math.max(0, m.target - U.lvl()); return U.cost() * (Math.pow(U.k, n) - 1) / (U.k - 1); }
    case 'cnt': { const K = CNTS[m.k]; return K && K.cost && K.on() ? K.cost() : -1; }
  }
  return -1;
}
// build audit 2026-11-24: counting missions without a measured pace were all priced at 3 minutes; rough minutes per unit instead
const CNT_EST = { pot: 3, gifts: 5, mails: 10, caravans: 8 };
const RATE_KEY = { grad: 'graduated', exams: 'passed', enroll: 'enrolled', read: 'read' };
const CNT_RATE = ['shop', 'cant', 'ranks', 'masters', 'ore', 'forged'];   // counting missions priced by their measured pace
let rateLast = null;
function stepRates(sec) {   // per-second pace of every counter (EMA), measured while the game is open
  const now = { graduated: S.stats.graduated, passed: S.stats.passed, enrolled: S.stats.enrolled, read: S.stats.read || 0 };
  for (const k of CNT_RATE) now['c_' + k] = CNTS[k].now();
  S.rt ||= {};
  if (rateLast) for (const k of Object.keys(now)) S.rt[k] = (S.rt[k] || 0) * 0.97 + ((now[k] - rateLast[k]) / sec) * 0.03;
  rateLast = now;
}
function rewardFor(m) {
  const cost = missionCost(m);
  if (cost >= 0) return Math.max(50, nice(cost * ((m.type === 'cnt' && CNTS[m.k] && CNTS[m.k].back) || REWARD_SHARE)));   // back: a mission that only spends coins (an ad campaign) pays them back
  const perMin = Math.max(1, (rateNow() || 1) * 60);
  if (m.type === 'earn') return Math.max(50, nice((m.n || 0) * TIME_SHARE));
  const key = m.type === 'cnt' ? (CNT_RATE.includes(m.k) ? 'c_' + m.k : null) : RATE_KEY[m.type], rate = key ? (S.rt && S.rt[key]) || 0 : 0;
  const minutes = rate > 0.001 ? Math.min(60, Math.max(0.5, (m.n || 0) / (rate * 60))) : m.type === 'cnt' ? Math.min(60, (CNT_EST[m.k] || 3) * Math.max(1, m.n || 1)) : 3;   // build audit 2026-11-24: cap 15 -> 60 min (a 1-hour mission paid like a 15-minute one)
  return Math.max(50, nice(perMin * minutes * TIME_SHARE));
}
const lvMul = () => 1 + 0.15 * (schoolLevel() - 1);   // counting missions grow with the school level (her «задания по уровню»)
const lvN = (n, step) => Math.max(step, Math.round(n * lvMul() / step) * step);
function makeMission(onlyNew, tries = 0) {   // onlyNew: draw from the new kinds only (the one-time refresh of old lists)
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i));
  const kinds = [], wts = [], add = (f, w = 1) => { kinds.push(f); wts.push(w); };
  add(() => { const n = lvN(rint(3, 8) * 10, 10); return { type: 'grad', target: S.stats.graduated + n, text: `Выпусти ещё ${n} учеников 🎓` }; });
  add(() => { const n = lvN(rint(5, 15) * 10, 10); return { type: 'enroll', target: S.stats.enrolled + n, text: `Прими в школу ещё ${n} новичков 🛎️` }; });
  add(() => { const n = Math.max(500, Math.round((rateNow() || 1) * 60 * rint(3, 8) / 100) * 100); return { type: 'earn', target: (S.stats.earned || 0) + n, text: `Заработай ещё ${fmt(n)} монет 🪙` }; });
  add(() => { const n = lvN(rint(2, 6) * 5, 5); return { type: 'read', target: (S.stats.read || 0) + n, text: `Пусть ${n} учеников подготовятся в библиотеке 📚` }; });
  add(() => { const n = lvN(rint(5, 15) * 10, 10); return { type: 'exams', target: S.stats.passed + n, text: `Пусть ученики сдадут ещё ${n} экзаменов` }; });
  for (const i of open) {
    const st = S.classes[i], C = CLASSES[i];
    C.items.forEach((it, k) => { if (st.items[k] < MAX_ITEM_LEVEL) add(() => { const t = Math.min(MAX_ITEM_LEVEL, st.items[k] + rint(2, 4)); return { type: 'item', i, k, target: t, text: `Улучши «${it.name}» (${C.name}) до ур. ${t}` }; }); });
    if (st.teacher < MAX_TEACHER_LEVEL) add(() => { const t = Math.min(MAX_TEACHER_LEVEL, st.teacher + rint(1, 3)); return { type: 'teacher', i, target: t, text: `Улучши учителя (${C.name}) до ур. ${t}` }; });
    if (st.desks < maxDesksOf(i)) add(() => ({ type: 'desk', i, target: st.desks + 1, text: `Поставь ещё одну парту: ${C.name}` }));
    if (st.time < MAX_TIME_LEVEL) add(() => ({ type: 'time', i, target: st.time + 1, text: `Сократи урок: ${C.name}` }));
  }
  if (S.reception.level < MAX_REC_LVL) add(() => ({ type: 'rec', target: Math.min(MAX_REC_LVL, S.reception.level + rint(1, 3)), text: `Улучши секретаря в приёмной до ур. ${S.reception.level + 1}+` }));
  if (bedCount() < maxBeds()) add(() => ({ type: 'beds', target: bedCount() + 1, text: 'Купи ещё одну кровать в спальне 🛏️' }));
  if (libSeats() < MAX_LIB_SEATS) add(() => ({ type: 'lib', target: libSeats() + 1, text: 'Поставь ещё один стол в библиотеке 📚' }));
  const nextPlot = S.classes.findIndex((c) => !c.built);
  const storyBuild = storyBuilds();   // Sonya's report 2026-11-22: the same class twice in the list
  if (nextPlot >= 0 && !storyBuild) add(() => ({ type: 'build', i: nextPlot, target: 1, text: `Построй класс «${CLASSES[nextPlot].name}»` }));
  for (const [k, U] of Object.entries(UPS)) if (U.on() && U.lvl() < U.max()) add(() => { const t = Math.min(U.max(), U.lvl() + rint(1, 3)); return { type: 'up', k, target: t, text: U.text ? U.text(t) : `Улучши «${U.name}» до ур. ${t}` }; }, U.g === 'room' ? 1 : 2);
  for (const i of open) for (const [k, U] of Object.entries(CUPS)) if (U.on(i) && U.lvl(i) < U.max()) add(() => { const t = Math.min(U.max(), U.lvl(i) + (k === 'expand' ? 1 : rint(1, 3))); return { type: 'up', k, i, target: t, text: k === 'expand' ? `Расширь класс «${CLASSES[i].name}» 📐` : `Улучши «${U.name}» (${CLASSES[i].name}) до ур. ${t}` }; }, 0.5);
  for (const [k, K] of Object.entries(CNTS)) if (K.on()) add(() => { const n = K.n(); return { type: 'cnt', k, n, target: K.now() + n, text: K.text(n) }; }, k === 'pot' || k === 'gifts' ? 1.5 : 2.5);
  if (onlyNew && wts.some((w) => w >= 1.5)) for (let j = 0; j < wts.length; j++) if (wts[j] < 1.5) wts[j] = 0;
  let r = Math.random() * wts.reduce((a, b) => a + b, 0), pick = 0; while (pick < kinds.length - 1 && (r -= wts[pick]) > 0) pick++;
  const m = kinds[pick]();
  if (['item', 'teacher', 'rec', 'up', 'desk', 'time', 'beds', 'lib', 'build'].includes(m.type) && tries < 30) {   // within reach (her «не накидывали то на что тяжело накопить»)
    const budget = Math.max(S.coins || 0, (steadyRate() || S.ema || 0) * 60 * 25), lo = m.type === 'up' && upOf(m) ? upOf(m).lvl() + 1 : null;
    const cur = { item: () => S.classes[m.i].items[m.k] + 1, teacher: () => S.classes[m.i].teacher + 1, rec: () => S.reception.level + 1 }[m.type];
    const floor = cur ? cur() : lo;
    while (floor != null && m.target > floor && missionNeed(m) > budget) m.target--;
    if (missionNeed(m) > budget) return makeMission(onlyNew, tries + 1);
    if (m.text) m.text = m.text.replace(/ур\. \d+/, 'ур. ' + (m.type === 'up' && upOf(m) && upOf(m).show ? upOf(m).show(m.target) : m.target));
  }
  if (m.type === 'rec') m.text = `Улучши секретаря в приёмной до ур. ${m.target}`;
  const statNow = { grad: S.stats.graduated, enroll: S.stats.enrolled, earn: S.stats.earned || 0, read: S.stats.read || 0, exams: S.stats.passed }[m.type];
  if (statNow !== undefined) m.n = m.target - statNow;
  m.reward = rewardFor(m); m.rv = 2;
  return m;
}
function dynDone(m) {
  switch (m.type) {
    case 'grad': return S.stats.graduated >= m.target;
    case 'exams': return S.stats.passed >= m.target;
    case 'enroll': return S.stats.enrolled >= m.target;
    case 'earn': return (S.stats.earned || 0) >= m.target;
    case 'read': return (S.stats.read || 0) >= m.target;
    case 'item': return S.classes[m.i].items[m.k] >= m.target;
    case 'teacher': return S.classes[m.i].teacher >= m.target;
    case 'desk': return S.classes[m.i].desks >= m.target;
    case 'time': return S.classes[m.i].time >= m.target;
    case 'rec': return S.reception.level >= m.target;
    case 'beds': return bedCount() >= m.target;
    case 'lib': return libSeats() >= m.target;
    case 'build': return S.classes[m.i].built;
    case 'up': { const U = upOf(m); return !U || U.lvl() >= m.target; }
    case 'cnt': { const K = CNTS[m.k]; return !K || K.now() >= m.target; }
    default: return true;
  }
}
const MISSION_SLOTS = 6;
function dynProgress(m) {   // [now, target] for the progress counter
  switch (m.type) {
    case 'grad': return [S.stats.graduated, m.target];
    case 'exams': return [S.stats.passed, m.target];
    case 'enroll': return [S.stats.enrolled, m.target];
    case 'earn': return [S.stats.earned || 0, m.target];
    case 'read': return [S.stats.read || 0, m.target];
    case 'item': return [S.classes[m.i].items[m.k], m.target];
    case 'teacher': return [S.classes[m.i].teacher, m.target];
    case 'desk': return [S.classes[m.i].desks, m.target];
    case 'time': return [S.classes[m.i].time, m.target];
    case 'rec': return [S.reception.level, m.target];
    case 'beds': return [bedCount(), m.target];
    case 'lib': return [libSeats(), m.target];
    case 'up': { const U = upOf(m); return U ? (U.show ? [U.show(U.lvl()), U.show(m.target)] : [U.lvl(), m.target]) : null; }   // build 302: places, not levels, where the panel shows places
    case 'cnt': { const K = CNTS[m.k]; return K ? [Math.max(0, K.now() - (m.target - m.n)), m.n] : null; }   // counted from the mission's start: «12/40»
    default: return null;
  }
}
function missionList() {   // [{key, text, reward, ok, prog}]
  if (S.dyn && !S.dynList) S.dynList = [S.dyn];   // older saves had one generated mission
  S.dynList ||= [];
  const out = [];
  { const m = storyCur(); if (m) out.push({ key: 'f', type: 'f', lk: 'f', text: m.text + storyNote(m), reward: storyReward(m), ok: m.check(G), prog: m.prog ? m.prog(G) : null, go: isMasterStory(m) ? masterGo() : m.go ? storyGo(m.go) : missionGo(null, m.text) }); }
  let made = false;
  const kindKey = (x) => [x.type, x.i ?? '', x.k ?? ''].join(':');   // one mission per kind at a time
  const seen = new Set(); S.dynList = S.dynList.filter((x) => !seen.has(kindKey(x)) && seen.add(kindKey(x)));
  // drop missions that became impossible (limits added later, e.g. reception max 40)
  const possible = (m) => {
    switch (m.type) {
      case 'rec': return m.target <= MAX_REC_LVL && S.reception.level < MAX_REC_LVL;
      case 'item': return m.target <= MAX_ITEM_LEVEL;
      case 'teacher': return m.target <= MAX_TEACHER_LEVEL;
      case 'desk': return m.target <= maxDesksOf(m.i);
      case 'time': return m.target <= MAX_TIME_LEVEL;
      case 'beds': return m.target <= maxBeds();
      case 'lib': return m.target <= MAX_LIB_SEATS;
      case 'up': { const U = upOf(m); return !!U && U.on() && m.target <= U.max(); }
      case 'cnt': { const K = CNTS[m.k]; return !!K && (K.keep ? K.keep() : K.on()); }   // keep: a gift mission waits while the alliance list loads
      default: return true;
    }
  };
  const storyBuild = storyBuilds();
  const sg = out[0] && out[0].go, twin = (m) => !!(sg && sg[1] && m.type !== 'grad' && m.type !== 'earn' && ['item', 'teacher', 'desk', 'rec', 'up', 'build'].includes(m.type) && (missionGo(m) || []).join('|') === sg.join('|'));   // the same button as the story mission (her w2 save: tablets twice)
  S.dynList = S.dynList.filter((m) => dynDone(m) || (possible(m) && !(storyBuild && m.type === 'build') && !twin(m)));   // the story already asks to build it
  for (const m of S.dynList) if (m.rv !== 2 && !dynDone(m)) {   // missions made before the fair rewards: priced again from what is left to do
    const pr = dynProgress(m); if (pr && ['grad', 'enroll', 'earn', 'read', 'exams'].includes(m.type)) m.n = pr[1] - pr[0];
    m.reward = rewardFor(m); m.rv = 2;
  }
  let fresh = false;   // 2026-11-23: old lists were full of old kinds; once, keep what is done and two unfinished ones, fill the rest with new kinds
  if (!S.mv3) { S.mv3 = 1; if (S.dynList.length) { const done = S.dynList.filter(dynDone), left = S.dynList.filter((m) => !dynDone(m)); S.dynList = [...done, ...left.slice(0, 2)]; fresh = true; } made = true; }
  for (let tries = 0; out.length + S.dynList.length < MISSION_SLOTS && tries < 200; tries++) {
    const m = makeMission(fresh);
    if (S.dynList.some((x) => kindKey(x) === kindKey(m)) || twin(m)) continue;
    S.dynList.push(m); made = true;
  }
  if (made) save();
  S.dynList.forEach((m, k) => out.push({ key: 'd' + k, need: dynDone(m) ? 0 : Math.round(missionNeed(m)), type: m.type, lk: m.type === 'up' ? (upOf(m) || {}).g : m.type === 'cnt' ? (CNTS[m.k] || {}).g : m.type, unit: m.type === 'up' ? (upOf(m) || {}).unit : undefined, text: m.type === 'up' && (upOf(m) || {}).text ? upOf(m).text(m.target) : m.text, reward: m.reward, ok: dynDone(m), prog: dynProgress(m), go: missionGo(m) }));
  return out;
}
// «Выполнить»: where a mission is done -> [room id, selector of the button to light up in its panel]
function missionGo(m, text) {
  const C = (i) => CLASS_SLOT[i], exam = CLASS_SLOT[CLASSES.length - 1];
  const weakest = () => { let b = -1; for (let i = 0; i < CLASSES.length; i++) if (isOpen(i) && (b < 0 || sleepersFor(i) > sleepersFor(b))) b = i; return b < 0 ? 'REC' : C(b); };
  if (m) switch (m.type) {
    case 'item': return [C(m.i), `[data-act="item"][data-k="${m.k}"]`];
    case 'teacher': case 'desk': case 'time': case 'build': return [C(m.i), `[data-act="${m.type}"]`];
    case 'rec': return ['REC', '[data-act="rec"]'];
    case 'enroll': return ['REC', '[data-act="ads"]'];
    case 'beds': return ['DORM', '[data-act="beds"]'];
    case 'lib': case 'read': return ['LIB', '[data-act="libseats"]'];
    case 'grad': case 'exams': return [exam, '[data-act="desk"]'];
    case 'earn': return [weakest(), '[data-act="desk"]'];
    case 'up': { const U = upOf(m); return U ? U.go() : null; }
    case 'cnt': { const K = CNTS[m.k]; return K ? K.go() : null; }
  }
  // fixed missions: read the text
  const t = text || '';
  const i = CLASSES.findIndex((c) => t.includes(c.name) || t.includes(c.name.slice(0, -2)));
  if (/приёмн|секретар/i.test(t)) return ['REC', '[data-act="rec"]'];
  if (/Выпусти/.test(t)) return [exam, '[data-act="desk"]'];
  if (i >= 0) {
    if (/Построй/.test(t)) return [C(i), '[data-act="build"]'];
    if (/учител/i.test(t)) return [C(i), '[data-act="teacher"]'];
    if (/парт/i.test(t)) return [C(i), '[data-act="desk"]'];
    const k = CLASSES[i].items.findIndex((it) => t.includes(it.name));
    if (k >= 0) return [C(i), `[data-act="item"][data-k="${k}"]`];
    return [C(i), null];
  }
  for (let j = 0; j < CLASSES.length; j++) { const k = CLASSES[j].items.findIndex((it) => t.includes(it.name)); if (k >= 0) return [C(j), `[data-act="item"][data-k="${k}"]`]; }
  const nb = S.classes.findIndex((c) => !c.built);
  if (/Построй/.test(t) && nb >= 0) return [C(nb), '[data-act="build"]'];
  if (/предмет/.test(t)) return [C(0), '[data-act="item"]'];
  return null;
}
function goMission(key) {
  const list = missionList(), m = list.find((x) => x.key === key); if (!m || !m.go) return;
  goTarget(m.go);
  showMissionHint(key, m.go[1]);
}
// build 265 (her «очень трудно по памяти прожать с какого уровня на какой надо прокачать. Должна быть подсказка что например с 3 -> 7»):
// while the room opened from a mission stays open, a plate above its panel says what to do: «ур. 3 → 7»; it follows the progress
let mHint = null;
function missionHintText(m, sel) {
  if (m.ok) return '✅ Задание выполнено — забери награду в «Заданиях»';
  const P0 = m.prog, LV = { item: 'ур.', teacher: 'учитель ур.', time: 'урок ур.', rec: 'секретарь ур.', up: 'ур.' }, CNT = { desk: 'парт', beds: 'кроватей', lib: 'мест' };
  if (P0 && m.unit) return `📋 ${m.unit}: ${P0[0]} → ${P0[1]}`;
  if (P0 && LV[m.type]) return `📋 ${LV[m.type]} ${P0[0]} → ${P0[1]}`;
  if (P0 && CNT[m.type]) return `📋 ${CNT[m.type]}: ${P0[0]} → ${P0[1]}`;
  if (P0) return `📋 ${m.text} · осталось ${fmt(Math.max(0, P0[1] - P0[0]))}`;
  const tm = /(?:до|на)\s+(\d+)/.exec(m.text) || /(\d+)\s*(?:-?го\s*)?(?:ур|уровн)/.exec(m.text);   // fixed story missions: the target is in the text, the current level on the lit card
  const b = sel && document.querySelector('#sheet ' + sel), card = b && (b.closest('.card') || b), cm = card && /ур\.\s*(\d+)/.exec(card.textContent);
  if (tm && cm) return `📋 ур. ${cm[1]} → ${tm[1]}`;
  if (m.key === 'f' && isMasterStory(storyCur())) return masterHint();
  return `📋 ${m.text}`;
}
function showMissionHint(key, sel) { mHint = { key, sel, fn: null, t: 0 }; setTimeout(() => { if (mHint && mHint.key === key) { mHint.fn = panel; updMissionHint(); } }, 150); }
function updMissionHint() {   // build 267 (her «Оно не в видном месте было ... Должно быть рядом с кнопкой покупки»): the plate sits on the lit card, right above its buy button; the top plate is only the fallback
  let el = document.getElementById('mhint');
  if (!mHint || !mHint.fn || panel !== mHint.fn) { if (el) el.remove(); if (mHint && mHint.fn) mHint = null; return; }
  const m = missionList().find((x) => x.key === mHint.key);
  if (!m) { if (el) el.remove(); mHint = null; return; }
  const b = mHint.sel && document.querySelector('#sheet ' + mHint.sel), card = b && (b.closest('.card') || b.parentElement);
  if (!el) { el = document.createElement('div'); el.id = 'mhint'; }
  const base = 'z-index:60;background:#fff6cf;border:2px solid #e2b23c;border-radius:12px;padding:3px 10px;font:800 14px ui-rounded,"Nunito","Segoe UI",sans-serif;color:#5a4410;box-shadow:0 3px 10px #0003;pointer-events:none;white-space:normal;line-height:1.25;';
  if (card && b) {   // on the card: its right edge over the button, half above the card's top edge
    if (el.parentElement !== card) { if (getComputedStyle(card).position === 'static') card.style.position = 'relative'; card.appendChild(el); }
    const cr = card.getBoundingClientRect(), br = b.getBoundingClientRect();
    el.style.cssText = base + `position:absolute;right:${Math.max(4, cr.right - br.right)}px;max-width:${Math.round(cr.width - 8)}px;overflow:hidden`;
    const html = emojiHtml(missionHintText(m, mHint.sel)); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
    el.style.top = `${Math.round(br.top - cr.top) - el.offsetHeight - 3}px`; return;
  } else {
    if (el.parentElement !== document.body) document.body.appendChild(el);
    const r = $('#sheet').getBoundingClientRect();
    el.style.cssText = base + `position:fixed;left:50%;transform:translateX(-50%);top:${Math.max(8, r.top - 40)}px;max-width:94vw;overflow:hidden;text-overflow:ellipsis`;
  }
  const html = emojiHtml(missionHintText(m, mHint.sel)); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
}
setInterval(updMissionHint, 400);
function goTarget(go) {   // open a room and light up the button that helps (missions and Tikhon's reports)
  const [id, sel] = go, s = SLOTS[id];
  closePanel();
  if (id === '@mg') { MG.open(); return; }
  if (id === '@top') openTop(); else if (id === '@ally') openAlly(); else if (id === '@insp') openPanel(inspPanel); else if (id === '@album') openPanel(speciesPanel);
  else if (id === 'FOUNT') { if (!COURT) return; openPanel(fountainPanel); const c = courtC(); setTimeout(() => focusTile(c.x, c.y), 60); }
  else openRoom(id);
  if (s) setTimeout(() => focusTile((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), 60);   // after the panel is up: the room goes above it
  if (!sel) return;
  setTimeout(() => {   // light up the button that does it
    const b = document.querySelector('#sheet ' + sel); if (!b) return;
    const card = b.closest('.card') || b;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse');
  }, 120);
}
function claimMission(key) {
  const list = missionList(), m = list.find((x) => x.key === key);
  if (!m || !m.ok) return;
  S.coins += m.reward;
  if (key === 'f') { const c = storyCur(); if (c) { S.story[c.id] = 1; if (c.v1) S.mission = (S.mission || 0) + 1; } } else S.dynList.splice(+key.slice(1), 1);
  toast(`🎁 Награда 🪙${fmt(m.reward)}`); updateHud(); save();
}

// missions live behind a round button on the map (bottom right); a red badge shows how many can be claimed
function renderMission() {
  qTick(); const ready = qReadyAll(), el = $('#quest');
  const key = 'b' + ready;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = emojiHtml(`<button class="mbtn ${ready ? 'ready' : ''}" data-missions aria-label="Задания">📋${ready ? `<span class="badge">${ready}</span>` : ''}</button>`);
}
// ======================= world map =======================
function readMetaLocal() { try { return JSON.parse(localStorage.getItem('magicschool.meta')) || {}; } catch (e) { return {}; } }
function worldStats(w) {   // {grads, coins} of a world's save
  if (w === WORLD) return { grads: S.stats.graduated, coins: S.coins, stars: schoolStars(), masters: (S.stats.ranks || [])[5] || 0 };
  try { const o = JSON.parse(localStorage.getItem(saveKeyOf(w))); return o ? { grads: o.stats.graduated, coins: o.coins, stars: (o.insp && o.insp.stars) || 0, masters: (o.stats.ranks || [])[5] || 0 } : null; } catch (e) { return null; }
}
const worldOpen = (w) => w === 1 || (readMetaLocal().unlocked || []).includes(w);
function worldsPanel() {
  const rows = WORLDS.map((w) => {
    const cur = w.id === WORLD, open = worldOpen(w.id);
    let right = '';
    if (cur) right = '<span class="done">ты здесь</span>';
    else if (w.soon) right = '<span class="muted">скоро</span>';
    else if (open) right = `<button class="btn" data-world="${w.id}">Перейти</button>`;
    else {
      const src = worldStats(WORLD === 1 ? 1 : 1) || { grads: 0, coins: 0 }, n = w.need;
      const ok = src.grads >= n.grads && src.coins >= n.coins && (src.stars || 0) >= (n.stars || 0) && (src.masters || 0) >= (n.masters || 0);
      right = ok ? `<button class="btn hot" data-world-open="${w.id}">Открыть 🪙${fmt(n.coins)}</button>` : '<span class="lock">🔒</span>';
      w._need = `🎓 ${fmt(Math.min(src.grads, n.grads))}/${fmt(n.grads)} выпускников · 🪙 ${fmt(Math.min(src.coins, n.coins))}/${fmt(n.coins)}${n.stars ? ` · ⭐ ${Math.min(src.stars || 0, n.stars)}/${n.stars}` : ''}${n.masters ? ` · 🌟 Мастер стихии ${Math.min(src.masters || 0, n.masters)}/${n.masters}` : ''} в Школе магии`;
    }
    return `<div class="card up world ${cur ? 'cur' : ''}"><span class="remoji big">${w.emoji}</span><div class="grow"><b>${w.name}</b><div class="muted">${w.desc}</div>${w._need && !open ? `<div class="muted">${w._need}</div>` : ''}</div>${right}</div>`;
  }).join('');
  return `<div class="sh-head"><span class="remoji big">🗺️</span><div><h2>Карта миров</h2><div class="muted">В каждом мире своя школа, свои ученики и свои монеты</div></div><button class="x" data-close>✕</button></div>${rows}`;
}
function goWorld(w) {
  save(); cloudPush(true);
  const m = readMetaLocal(); m.current = w; localStorage.setItem('magicschool.meta', JSON.stringify(m));
  noSave = true; setTimeout(() => location.reload(), 150);
}
function openWorld(w) {
  const n = WORLDS.find((x) => x.id === w).need, src = worldStats(1);
  if (WORLD !== 1 || !src || src.grads < n.grads || src.coins < n.coins || (src.stars || 0) < (n.stars || 0) || (src.masters || 0) < (n.masters || 0)) return;
  if (!confirm(`Открыть новый мир за 🪙${fmt(n.coins)}? Монеты спишутся в Школе магии${n.stars ? ', звёзды ⭐ останутся у тебя' : ''}.`)) return;
  S.coins -= n.coins; save();   // build audit 2026-11-24: the stars are a requirement, no longer spent
  const m = readMetaLocal(); m.unlocked = [...new Set([...(m.unlocked || []), w])]; localStorage.setItem('magicschool.meta', JSON.stringify(m));
  toast('✨ Новый мир открыт!'); openPanel(worldsPanel);
}

// ======================= quest tabs (build 454, Maria 2026-11-24: «разложить задания по вкладкам, как в хороших онлайн-играх»; her «Да!»
// to the plan): 📖 story (Tikhon's chain) · 📅 daily (4 simple tasks, reset at local midnight, all 4 -> moonstones) · 🌟 by level (the
// generated missions that follow the school level and what it can afford + the level milestones) · 🤝 alliance (3 shared weekly goals,
// every member's share travels in his top entry: aw week, ag/am/ap graduates/mini-game rounds/gifts of that week) · 🎁 special (one-time:
// Telegram channel, avatar, alliance, invite a friend by code: her «какой-то код выдавать и вводить»). Red counters on tabs with a reward.
const Q_TG = 'https://t.me/begemoti4ka';   // her channel («Мой тгк пока»)
const QF_ON = true;   // top fields aw/ag/am/ap/rf: Firestore rules allow them (her «да» 2026-11-24)
const DQ_STONES = 2, DQ_MIN = 5, AQ_STONES = 3, REF_LV = 5, REF_IN_STONES = 3;
const SP_LIST = [
  { id: 'tg', icon: '📣', t: 'Подпишись на канал разработчика в Telegram', s: 'новости игры и подсказки', n: 5 },
  { id: 'ava', icon: '🖼️', t: 'Поставь аватарку', s: 'засчитается, когда её одобрят', n: 3 },
  { id: 'ally', icon: '🤝', t: 'Вступи в альянс или создай свой', s: '', n: 3 },
  { id: 'ref', icon: '💌', t: 'Пригласи друга', s: `друг вводит твой код и доводит школу до ${REF_LV}-го уровня (награда — за первого друга)`, n: 10 },
];
let qTab = '';
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[data-tglink]')) setTimeout(() => { qMetaSet((q) => { q.tg ||= Date.now(); }); if (panel === missionsPanel) refreshPanel(); }, 1500); });   // a real link: iOS PWAs ignore window.open from a delegated handler
const qDay = (t = new Date(Date.now())) => `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;   // the same local day as the chests
const mgRounds = () => ((S.mg && S.mg.n) || 0) + ((S.mg && S.mg.f && S.mg.f.n) || 0) + ((S.mg && S.mg.g && S.mg.g.n) || 0);   // potion + flight rounds ever played
const qMeta = () => { const m = stMeta(); return m.q || {}; };
function qMetaSet(fn) { const m = stMeta(); m.q ||= {}; fn(m.q); try { localStorage.setItem('magicschool.meta', JSON.stringify(m)); } catch (e) { /* full storage */ } dirtyPanel = true; }
const stGot = (key) => !!((stMeta().stones || {}).got || {})[key];
const qPerMin = () => Math.max(1, (steadyRate() || S.ema || 0) * 60);
// ---- 📅 daily
const DQ = [
  { id: 'mg', on: () => true, n: () => 1, text: () => 'Сыграй в мини-игру 🧪', now: mgRounds, go: () => ['@mg', null] },
  { id: 'grad', on: () => true, n: () => lvN(20, 10), text: (n) => `Выпусти ${n} учеников 🎓`, now: () => S.stats.graduated, go: () => missionGo({ type: 'grad' }) },
  { id: 'chest', on: () => true, n: () => 1, text: () => 'Открой сундучок дня 🎁', done: () => { const c = S.chest; return !!c && c.day === qDay() && (c.k > 0 || c.done || c.dead); }, go: () => ['@chest', null] },
  { id: 'moon', on: () => WORLD === 1, n: () => 1, text: () => 'Собери плоды Лунного древа 🌙', now: () => S.stats.moon || 0, go: () => ['@moon', null] },
  { id: 'gift', on: () => allyMates() > 0, n: () => 1, text: () => 'Подари подарок другу из альянса 🎁', done: () => { if (allyMates() === 0) return true; const L = giftLog(); return [...Object.values(L.g || {}), ...Object.values(L.b || {})].reduce((a, b) => a + b, 0) >= 1; }, go: () => ['@ally', null] },   // build 457: everything sent today counts
  { id: 'read', on: () => (S.stats.read || 0) > 0, n: () => lvN(10, 5), text: (n) => `Пусть ${n} учеников позанимаются в библиотеке 📚`, now: () => S.stats.read || 0, go: () => ['LIB', '[data-act="libseats"]'] },
  { id: 'earn', on: () => true, n: () => Math.max(500, nice(qPerMin() * 10)), text: (n) => `Заработай ${fmt(n)} монет 🪙`, now: () => S.stats.earned || 0, go: () => null },
];
function dqSt() {   // today's 4 tasks: the mini-game and graduates always, two more picked by the date (the same all day)
  const day = qDay();
  if (S.dq && S.dq.day === day) return S.dq;
  let h = WORLD * 7; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rest = DQ.filter((t) => t.id !== 'mg' && t.id !== 'grad' && t.on());
  for (let k = rest.length - 1; k > 0; k--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (k + 1); [rest[k], rest[j]] = [rest[j], rest[k]]; }
  const ids = ['mg', 'grad', ...rest.slice(0, 2).map((t) => t.id)], b = {}, n = {};
  for (const id of ids) { const t = DQ.find((x) => x.id === id); n[id] = t.n(); if (t.now) b[id] = t.now(); }
  S.dq = { day, ids, b, n, r: Math.max(50, nice(qPerMin() * DQ_MIN)), c: {} };
  save(); return S.dq;
}
function dqList() {
  const d = dqSt();
  return d.ids.map((id) => { const t = DQ.find((x) => x.id === id); if (!t) return null;
    const have = t.done ? (t.done() ? d.n[id] : 0) : Math.max(0, t.now() - (d.b[id] || 0)), ok = have >= d.n[id];
    return { id, text: t.text(d.n[id]), have: Math.min(have, d.n[id]), need: d.n[id], ok, got: !!d.c[id], go: t.go() };
  }).filter(Boolean);
}
const dqAllKey = () => 'dq_' + qDay();   // one moonstone prize a day for both worlds
const dqAllReady = () => { const L = dqList(); return L.length > 0 && L.every((x) => x.got) && !stGot(dqAllKey()) && !S.dq.all; };
// ---- 🤝 alliance (week = the mini-game week, Monday 00:00 UTC)
function aqSt() {   // build audit 2026-11-24: a new alliance starts the count again (the week's work no longer travels with the player)
  const wk = MG.weekKey(), al = myAl();
  if (!S.aq || S.aq.wk !== wk || (S.aq.al != null && S.aq.al !== al)) S.aq = { wk, al, g0: S.stats.graduated, m0: mgRounds(), p0: S.stats.gifts || 0 };
  else if (S.aq.al == null) S.aq.al = al;   // saves from before: keep this week's count
  return S.aq;
}
const aqMine = () => { const a = aqSt(); return { ag: Math.max(0, S.stats.graduated - a.g0), am: Math.max(0, mgRounds() - a.m0), ap: Math.max(0, (S.stats.gifts || 0) - a.p0) }; };
function aqGoals() {
  if (!myAl()) return null;
  const wk = aqSt().wk, me = anonUid() + '_w' + WORLD, mine = aqMine();
  const rows = allyMembers(myAl()).filter((x) => x.id !== me && x.aw === wk).map((x) => ({ ...x, g0: Math.max(0, x.g - x.ag) }));
  rows.push({ ...mine, g0: aqSt().g0 });
  const n = Math.max(2, rows.length), sum = (k) => rows.reduce((a, x) => a + (x[k] || 0), 0);
  return { wk, n: rows.length, goals: [
    { id: 'g', text: 'Выпустите вместе учеников 🎓', have: sum('ag'), need: nice(Math.max(100 * n, 0.1 * sum('g0'))), mine: mine.ag },
    { id: 'm', text: 'Сыграйте вместе в мини-игры 🧪', have: sum('am'), need: 8 * n, mine: mine.am },
    ...(allyMates() === 0 ? [] : [{ id: 'p', text: 'Подарите друг другу подарки 🎁', have: sum('ap'), need: 5 * n, mine: mine.ap }]),   // build audit 2026-11-24: no gift goal for an alliance of one
  ].map((g) => ({ ...g, ok: g.have >= g.need, key: `al_${wk}_${g.id}_w${WORLD}` })) };
}
const qTopFields = (I) => { if (!QF_ON) return {}; const a = aqMine(), q = qMeta(); return { aw: I(aqSt().wk), ag: I(a.ag), am: I(a.am), ap: I(a.ap), ...(q.rf ? { rf: { stringValue: q.rf } } : {}), ...(WAR_ON && S.war ? { wp: I(S.war.pts), ...(S.war.pwk ? { wpp: I(S.war.ppts), wpw: I(S.war.pwk) } : {}) } : {}) }; };
const WAR_ON = true;   // top fields wp/wpp/wpw (Firestore rules)
const qTopKey = () => { if (!QF_ON) return ''; const a = aqMine(); return [aqSt().wk, a.ag, a.am, a.ap, qMeta().rf || '', S.war ? S.war.pts : 0].join(','); };
// ---- 🎁 special
const REF_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function myRefCode() { let c = qMeta().my; if (!c) { c = Array.from({ length: 6 }, () => REF_ABC[Math.floor(Math.random() * REF_ABC.length)]).join(''); qMetaSet((q) => { q.my ||= c; }); c = qMeta().my || c; } return c; }
const refCanEnter = () => !qMeta().rf && WORLD === 1 && schoolLevel() <= REF_LV && !(stMeta().unlocked || []).includes(2);
const refFriends = () => (topList || []).filter((x) => x.rf && x.rf === qMeta().my && !x.id.startsWith(anonUid() + '_'));
function spOk(id) {
  switch (id) {
    case 'tg': return !!qMeta().tg;
    case 'ava': return !!AV.img(anonUid());
    case 'ally': return !!myAl();
    case 'ref': return refFriends().some((x) => x.lv >= REF_LV);
  }
  return false;
}
const spReady = (s) => spOk(s.id) && !stGot('sp_' + s.id);
function refEnter(raw) {
  const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!refCanEnter()) { toast(qMeta().rf ? 'Код друга уже введён' : `Код друга вводят только новички (до ${REF_LV}-го уровня школы)`); return false; }
  if (!/^[A-Z2-9]{6}$/.test(c)) { toast('Код — это 6 букв и цифр, например ABC234'); return false; }
  if (c === myRefCode()) { toast('Это твой собственный код 🙂'); return false; }
  qMetaSet((q) => { q.rf = c; });
  if (stonesAdd(REF_IN_STONES, 'sp_refin')) toast(`💌 Код друга принят! ${ST_ICON} +${REF_IN_STONES} лунных камня`);
  save(); topPush(true); return true;
}
try { const r = new URLSearchParams(location.search).get('ref'); if (r) localStorage.setItem('magicschool.refin', r); } catch (e) { /* no storage */ }
let qTickT = 0;
function gemMigrate() {   // once: world 2's potion records go to world 1 (the bigger number wins), world 2's slot starts clean for «Огранка самоцветов»
  if (WORLD !== 2 || !S || !S.mg || S.mg.gemMig) return;
  try {
    const k1 = saveKeyOf(1), o1 = JSON.parse(localStorage.getItem(k1) || 'null'), a = S.mg;
    if (o1) { const b = (o1.mg ||= {}); b.best = Math.max(b.best || 0, a.best || 0); if (a.wk && a.wk === b.wk) b.wb = Math.max(b.wb || 0, a.wb || 0); else if (a.wk && a.wk > (b.wk || 0)) { b.wk = a.wk; b.wb = a.wb || 0; }
      if (a.pw && a.pw === b.pw) b.pm = Math.max(b.pm || 0, a.pm || 0); localStorage.setItem(k1, JSON.stringify(o1)); }
    a.best = 0; a.wb = 0; a.pm = 0; a.gemMig = Date.now(); save(); topPush(true);
  } catch (e) { /* next time */ }
}
function qTick() { gemMigrate();   // from renderMission: a code that came with the invite link is applied once the school is loaded
  if (!S || Date.now() - qTickT < 3000) return; qTickT = Date.now(); try { warTick(); } catch (e) { /* the battle never stops the game */ }
  const r = localStorage.getItem('magicschool.refin'); if (!r) return;
  localStorage.removeItem('magicschool.refin');
  if (refCanEnter() && r.toUpperCase() !== qMeta().my) refEnter(r);
}
async function refShare() {
  const code = myRefCode(), url = `${location.origin}${location.pathname}?ref=${code}`;
  const text = `Заходи в мою «Школу магии»! 🪄 Мой код друга: ${code} — введи его в «Заданиях» → «Особые» и получишь лунные камни.`;
  try { if (navigator.share) { await navigator.share({ text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Приглашение скопировано — отправь его другу'); } catch (e) { window.prompt('Скопируй и отправь другу:', `${text}\n${url}`); }
}
// ---- counters
function qCounts() {
  const list = missionList(), d = dqList(), A = aqGoals();
  return {
    story: list.filter((m) => m.key === 'f' && m.ok).length,
    day: d.filter((x) => x.ok && !x.got).length + (dqAllReady() ? 1 : 0),
    lvl: list.filter((m) => m.key !== 'f' && m.ok).length,
    ally: A ? A.goals.filter((g) => g.ok && !stGot(g.key)).length : 0,
    sp: SP_LIST.filter(spReady).length,
  };
}
const qReadyAll = () => { try { const c = qCounts(); return c.story + c.day + c.lvl + c.ally + c.sp; } catch (e) { return missionList().filter((m) => m.ok).length; } };
// ---- the window
const Q_TABS = [['story', '📖', 'Сюжет'], ['day', '📅', 'Ежедневные'], ['lvl', '🌟', 'По уровню'], ['ally', '🤝', 'Альянс'], ['sp', '🎁', 'Особые']];
function qStyle() {
  if (document.getElementById('qtabs-style')) return;
  const st = document.createElement('style'); st.id = 'qtabs-style';
  st.textContent = `.qtabs{display:flex;gap:4px;margin:-4px 0 6px;padding:8px 4px 2px;overflow-x:auto;scrollbar-width:none}.qtabs::-webkit-scrollbar{display:none}
.qtab{position:relative;flex:1 0 auto;min-width:58px;display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 4px 4px;border:0;border-radius:12px;background:#f1eafd;color:#6b5a99;font:800 11px ui-rounded,"Nunito","Segoe UI",sans-serif;cursor:pointer}
.qtab .remoji,.qtab img{font-size:19px;height:19px}.qtab.on{background:#7b5cd6;color:#fff;box-shadow:0 2px 6px #7b5cd655}
.qtab .qb{position:absolute;top:-3px;right:-2px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#e5364b;color:#fff;font:800 11px/17px ui-rounded,"Nunito","Segoe UI",sans-serif;box-shadow:0 0 0 2px #fff}
.qnote{font-size:12.5px;color:#7a6c99;margin:2px 2px 6px;line-height:1.3}.qsub{display:block;font-size:12px;color:#8a7cab;font-weight:600}
.qbig{background:#fff4c2;border-radius:14px;padding:8px 10px;margin-top:6px;display:flex;align-items:center;gap:8px;font-weight:800;font-size:13.5px}
.qcode{font:900 22px ui-monospace,Consolas,monospace;letter-spacing:3px;color:#5a3fb8;background:#f1eafd;border-radius:10px;padding:4px 10px;display:inline-block;margin:4px 0}`;
  document.head.appendChild(st);
}
const qBtnGo = (go, attr) => (go ? `<button class="btn small go" ${attr}>Выполнить ➜</button>` : '');
function qRow(m) {   // a story / level mission, the same look as before
  const tk = WORLD === 1;
  return `<div class="q ${m.ok ? 'ok' : ''}"><span class="qi">${m.ok ? '🎁' : '📋'}</span>
      <span class="qt">${m.text}${m.prog && !m.ok ? ` <span class="qp">${fmt(Math.min(m.prog[0], m.prog[1]))}/${fmt(m.prog[1])}</span>` : ''}${tk && MISSION_LORE[m.lk || m.type] ? `<span class="muted" style="display:block;font-style:italic;font-size:12px">${MISSION_LORE[m.lk || m.type]}</span>` : ''}</span>
      ${m.ok ? `<button class="btn hot small" data-mission="${m.key}">Забрать 🪙${fmt(m.reward)}</button>` : `<span class="qgo">${m.key !== 'f' && S.mswap !== qDay() ? `<button class="btn small ghost" data-mswap="${m.key}" title="Заменить задание" style="float:right;margin-left:4px">🔄</button>` : ''}${m.need > 0 ? `<span class="qneed" style="display:block;font-size:12px;font-weight:800;color:${S.coins >= m.need ? '#2f9e5a' : '#d0304e'}">нужно 🪙${fmt(m.need)}</span>` : ''}<span class="qr">🪙${fmt(m.reward)}</span>${qBtnGo(m.go, `data-mgo="${m.key}"`)}</span>`}</div>`;
}
function qStoryTab(list) {
  const m = list.find((x) => x.key === 'f'), done = MISSIONS.filter((x) => S.story && S.story[x.id]).length;
  return `<div class="qnote">История школы идёт по порядку: следующее задание откроется, когда заберёшь награду. Пройдено ${done} из ${MISSIONS.length}.</div>
    <div class="qbar">${m ? qRow(m) : '<div class="q ok"><span class="qi">🏆</span><span class="qt">Вся история этого мира пройдена! Новые главы появятся с обновлениями.</span></div>'}</div>`;
}
function qDayTab() {
  const L = dqList(), d = S.dq, all = L.every((x) => x.got), gotAll = stGot(dqAllKey()) || d.all;
  const mid = new Date(Date.now()); mid.setHours(24, 0, 0, 0); const left = Math.max(0, mid - Date.now()), hh = Math.floor(left / 3600000), mm = Math.floor((left % 3600000) / 60000);
  const rows = L.map((x) => `<div class="q ${x.ok && !x.got ? 'ok' : ''}"><span class="qi">${x.got ? '✅' : x.ok ? '🎁' : '📅'}</span>
      <span class="qt">${x.text}${!x.ok && x.need > 1 ? ` <span class="qp">${fmt(x.have)}/${fmt(x.need)}</span>` : ''}</span>
      ${x.got ? '<span class="done">готово</span>' : x.ok ? `<button class="btn hot small" data-dqc="${x.id}">Забрать 🪙${fmt(d.r)}</button>` : `<span class="qgo"><span class="qr">🪙${fmt(d.r)}</span>${qBtnGo(x.go, `data-dqgo="${x.id}"`)}</span>`}</div>`).join('');
  const prize = gotAll ? `<div class="qbig">✅ Все дела дня сделаны, лунные камни получены. Новые дела через ${hh} ч ${mm} мин</div>`
    : `<div class="qbig ${all ? 'ok' : ''}">${ST_IMG(24)}<span style="flex:1">Сделай все ${L.length} дела — получишь ${DQ_STONES} лунных камня</span>${all ? `<button class="btn hot small" data-dqall>Забрать ${ST_IMG(16)} ${DQ_STONES}</button>` : `<span class="qp">${L.filter((x) => x.got).length}/${L.length}</span>`}</div>`;
  return `<div class="qnote">Новые дела каждый день в полночь (через ${hh} ч ${mm} мин). За каждое — монеты.</div><div class="qbar">${rows}</div>${prize}`;
}
function qLvlTab(list) {
  const L = list.filter((m) => m.key !== 'f'), lv = schoolLevel(), next = [];
  for (let l = Math.ceil((lv + 1) / 5) * 5; next.length < 3; l += 5) next.push(l);
  const ms = next.map((l) => `<span class="qp" style="margin-right:10px">ур. ${l} → ${ST_IMG(14)} ${3 + Math.floor(l / 10)}</span>`).join('');
  return `<div class="qnote">Задания подстраиваются под уровень школы 🌟${lv} и под то, на что хватает монет. Сделал одно — сразу появится новое. ${S.mswap !== qDay() ? 'Не нравится задание? 🔄 заменит одно в день.' : 'Замена задания сегодня уже использована.'}</div>
    <div class="qbar">${L.map(qRow).join('')}</div>
    <div class="qbig" style="background:#f1eafd;font-weight:700;flex-wrap:wrap">🌟 Лунные камни за уровни школы (приходят сами): ${ms}</div>`;
}
function qAllyTab() {
  if (!myAl()) return `<div class="qnote">Общие цели на неделю есть у каждого альянса: выполняете вместе — награду получает каждый участник.</div>
    <div class="qbar"><div class="q"><span class="qi">🤝</span><span class="qt">Сначала вступи в альянс или создай свой</span><button class="btn small go" data-qgo="@ally">Альянсы ➜</button></div></div>`;
  const A = aqGoals(), wkEnd = (A.wk + 1) * 7 * 86400000 - 3 * 86400000, left = Math.max(0, wkEnd - Date.now()), dd = Math.floor(left / 86400000), hh = Math.floor((left % 86400000) / 3600000);
  const rows = A.goals.map((g) => { const got = stGot(g.key);
    return `<div class="q ${g.ok && !got ? 'ok' : ''}"><span class="qi">${got ? '✅' : g.ok ? '🎁' : '🤝'}</span>
      <span class="qt">${g.text} <span class="qp">${fmt(Math.min(g.have, g.need))}/${fmt(g.need)}</span><span class="qsub">твой вклад: ${fmt(g.mine)}</span></span>
      ${got ? '<span class="done">получено</span>' : g.ok ? `<button class="btn hot small" data-alq="${g.id}">Забрать ${ST_IMG(16)} ${AQ_STONES}</button>` : `<span class="qr">${ST_IMG(16)} ${AQ_STONES}</span>`}</div>`; }).join('');
  const lag = topList ? '' : '<div class="qnote">Загружаю вклад участников…</div>';
  return `<div class="qnote">Цели всего альянса на эту неделю (до конца ${dd} д ${hh} ч). За каждую — ${AQ_STONES} лунных камня каждому участнику. Участников, игравших на этой неделе: ${A.n}. Вклад друзей обновляется раз в минуту.</div>${lag}<div class="qbar">${rows}</div><button class="btn wide" data-war style="margin-top:8px">⚔️ Битва альянсов</button>`;
}
function qSpTab() {
  const rows = SP_LIST.map((s) => { const got = stGot('sp_' + s.id), ok = spOk(s.id);
    let act = '';
    if (got) act = '<span class="done">получено</span>';
    else if (ok) act = `<button class="btn hot small" data-spc="${s.id}">Забрать ${ST_IMG(16)} ${s.n}</button>`;
    else if (s.id === 'tg') act = `<a class="btn small go" href="${Q_TG}" target="_blank" rel="noopener" data-tglink style="text-decoration:none;display:inline-block">Открыть ➜</a>`;
    else if (s.id === 'ava') act = `<button class="btn small go" data-qgo="@top">Выполнить ➜</button>`;
    else if (s.id === 'ally') act = `<button class="btn small go" data-qgo="@ally">Выполнить ➜</button>`;
    else act = `<span class="qr">${ST_IMG(16)} ${s.n}</span>`;
    return `<div class="q ${ok && !got ? 'ok' : ''}"><span class="qi">${got ? '✅' : s.icon}</span><span class="qt">${s.t} · ${ST_IMG(14)} ${s.n}${s.s ? `<span class="qsub">${s.s}</span>` : ''}</span>${act}</div>`; }).join('');
  const fr = refFriends(), q = qMeta();
  const inv = `<div class="qbig" style="background:#f6f0ff;flex-direction:column;align-items:stretch;font-weight:700">
      <div>💌 Твой код друга: <span class="qcode">${myRefCode()}</span></div>
      <div class="qsub">Друг вводит его у себя в «Заданиях» → «Особые» (или просто открывает игру по твоей ссылке) и получает ${REF_IN_STONES} лунных камня. Когда его школа дойдёт до ${REF_LV}-го уровня, ты получишь ${SP_LIST[3].n}. Чтобы друг был виден, ему нужно дать школе имя в «Топе».</div>
      ${fr.length ? `<div class="qsub">Пришли по твоему коду: ${fr.map((x) => `${escTxt(x.name)} (🌟${x.lv})`).join(', ')}</div>` : ''}
      <button class="btn wide" data-refshare style="margin-top:6px">📤 Поделиться приглашением</button>
      ${refCanEnter() ? `<button class="btn ghost wide" data-refin style="margin-top:4px">🔑 Меня пригласил друг — ввести его код (${ST_IMG(14)} ${REF_IN_STONES})</button>` : q.rf ? `<div class="qsub" style="margin-top:4px">Ты пришёл по коду друга ${escTxt(q.rf)} ✓</div>` : ''}
    </div>`;
  return `<div class="qnote">Разовые задания: каждое можно выполнить один раз, награда — лунные камни.</div><div class="qbar">${rows}</div>${inv}`;
}
function missionsPanel() {
  qStyle();
  const list = missionList(), c = qCounts(), tk = WORLD === 1;   // world 1: the quests come from Chronicler Tikhon (build 251, her pick)
  if (!qTab) qTab = (Q_TABS.find(([k]) => c[k] > 0) || Q_TABS[0])[0];
  if (qTab === 'ally' && myAl() && (!topList || Date.now() - topLoadedAt > 60000) && !missionsPanel.loading) { missionsPanel.loading = true; topPush(true).finally(() => topLoad().finally(() => { missionsPanel.loading = false; if (panel === missionsPanel) refreshPanel(); })); }
  if (qTab === 'sp' && (!topList || Date.now() - topLoadedAt > 120000) && !missionsPanel.loading) { missionsPanel.loading = true; Promise.all([topLoad(), AV.load()]).finally(() => { missionsPanel.loading = false; if (panel === missionsPanel) refreshPanel(); }); }
  const tabs = Q_TABS.map(([k, ic, nm]) => `<button class="qtab ${qTab === k ? 'on' : ''}" data-qtab="${k}"><span class="remoji">${ic}</span>${nm}${c[k] ? `<span class="qb">${c[k]}</span>` : ''}</button>`).join('');
  const body = qTab === 'story' ? qStoryTab(list) : qTab === 'day' ? qDayTab() : qTab === 'lvl' ? qLvlTab(list) : qTab === 'ally' ? qAllyTab() : qSpTab();
  return `<div class="sh-head">${tk ? tikhonPic(56) : '<span class="remoji big">📋</span>'}<div><h2>${tk ? 'Задания от Тихона' : 'Задания'}</h2><div class="muted">${tk ? '«Летопись школы пишется твоими делами, директор»' : 'Выполняй и забирай награды'}</div></div><button class="x" data-close>✕</button></div>
    <div class="qtabs">${tabs}</div>${body}`;
}
function qGo(go) {
  if (!go) return;
  if (go[0] === '@chest') { closePanel(); if (window.__chests) window.__chests.open(); return; }
  if (go[0] === '@moon') { closePanel(); if (WORLD === 1) setTimeout(() => focusTile(MOON_AT.x, MOON_AT.y), 60); toast('🌙 Плоды созревают ночью — нажми на Лунное древо, чтобы собрать'); return; }
  goTarget(go);
}
function qClick(d) {   // true when the button was ours
  if (d.qtab !== undefined) { qTab = d.qtab; refreshPanel(); const sh = $('#sheet'); if (sh) sh.scrollTop = 0; return true; }
  if (d.qgo !== undefined) { qGo([d.qgo, null]); return true; }
  if (d.dqgo !== undefined) { const x = dqList().find((t) => t.id === d.dqgo); if (x) qGo(x.go); return true; }
  if (d.dqc !== undefined) { const x = dqList().find((t) => t.id === d.dqc); if (x && x.ok && !x.got) { S.dq.c[x.id] = 1; S.coins += S.dq.r; warAdd('dq', WAR_PTS.dq); toast(`🎁 Награда 🪙${fmt(S.dq.r)}`); updateHud(); save(); } refreshPanel(); return true; }
  if (d.dqall !== undefined) { if (dqAllReady()) { S.dq.all = 1; if (stonesAdd(DQ_STONES, dqAllKey())) toast(`📅 Все дела дня! ${ST_ICON} +${DQ_STONES} лунных камня`); save(); } refreshPanel(); return true; }
  if (d.mswap !== undefined) {   // build audit 2026-11-24: a stuck level mission can be swapped, once a day
    const k = +String(d.mswap).slice(1), m = S.dynList && S.dynList[k];
    if (m && !dynDone(m)) { if (S.mswap === qDay()) toast('Заменить задание можно раз в день'); else { S.mswap = qDay(); S.dynList.splice(k, 1); missionList(); save(); toast('🔄 Задание заменено'); } }
    refreshPanel(); return true;
  }
  if (d.alq !== undefined) { const A = aqGoals(), g = A && A.goals.find((x) => x.id === d.alq); if (g && g.ok && stonesAdd(AQ_STONES, g.key)) { toast(`🤝 Цель альянса! ${ST_ICON} +${AQ_STONES} лунных камня`); save(); } refreshPanel(); return true; }
  if (d.sp !== undefined) { if (d.sp === 'tg') { window.open(Q_TG, '_blank'); setTimeout(() => qMetaSet((q) => { q.tg = Date.now(); }), 1500); } return true; }
  if (d.spc !== undefined) { const s = SP_LIST.find((x) => x.id === d.spc); if (s && spReady(s) && stonesAdd(s.n, 'sp_' + s.id)) { toast(`${s.icon} ${ST_ICON} +${s.n} лунных камней`); save(); } refreshPanel(); return true; }
  if (d.refshare !== undefined) { refShare(); return true; }
  if (d.refin !== undefined) { const v = window.prompt('Код друга (6 букв и цифр):', ''); if (v) { refEnter(v); refreshPanel(); } return true; }
  return false;
}
window.__q = { S: () => S, counts: () => qCounts(), dq: () => dqList(), aq: () => aqGoals(), ref: (c) => refEnter(c), code: () => myRefCode(), tab: (k) => { qTab = k; } };   // test hook
function lvBar() {   // «🏫 Уровень 64» and the experience bar across the purple plate under the coins row
  const top = $('#top'); if (!top || !S) return; let el = $('#lvbar');
  if (!$('#topslim')) { const st = document.createElement('style'); st.id = 'topslim';   // her «великовата»: everything a bit lower
    st.textContent = '#top{padding:calc(var(--safe-t) + 4px) 10px 3px;gap:5px;row-gap:0}#top .res{padding:3px 9px 3px 5px;font-size:15px}#top .res .ico{font-size:16px}#top .gear{width:32px;height:32px;font-size:17px}#lvbar{padding:2px 6px 0 !important;font-size:12px !important}#lvbar>span:nth-of-type(2){height:6px !important}@media (min-width:1400px){#sheet{zoom:1.25}#top{zoom:1.2}#insp{zoom:1.2}#menugrid{zoom:1.2}}';   // big monitors: bigger windows and text (her pick «5»)
    document.head.appendChild(st); }
  if (!el) { top.style.flexWrap = 'wrap'; el = document.createElement('button'); el.id = 'lvbar'; el.dataset.level = ''; el.setAttribute('aria-label', 'Уровень школы');
    el.style.cssText = 'flex:1 0 100%;display:flex;align-items:center;gap:8px;background:none;border:0;padding:4px 6px 0;color:#fff;font:800 13px ui-rounded,"Nunito",sans-serif;text-shadow:0 1px 2px #3a2a7a66'; top.appendChild(el); }
  const n = schoolLevel(), x = schoolXp(), a = lvNeed(n), b = lvNeed(n + 1), pct = Math.max(0, Math.min(100, Math.floor((x - a) / (b - a) * 100))), h = `🌟 Уровень ${n}|${pct}`;
  if (el.dataset.h === h) return; el.dataset.h = h;
  el.innerHTML = emojiHtml(`🌟 <span>Уровень ${n}</span>`) + `<span style="flex:1;height:8px;border-radius:4px;background:#ffffff40;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#ffe08a,#ffc24d);border-radius:4px"></span></span><span style="font-size:11px;opacity:.9">${pct}%</span>`;
}
function updateHud() {
  lvBar();
  $('#coins').textContent = fmt(S.coins);
  $('#stars').textContent = fmt(S.stats.graduated);
  const net = ((S.ema || 0) - (S.outEma || 0)) * 60, rt = $('#rate');   // the real gain: income minus refunds and fines (build 275)
  rt.textContent = (net < 0 ? '−' : '') + fmt(Math.abs(net)) + '/м'; rt.style.color = net < 0 ? '#d0304e' : '';
  document.querySelectorAll('[data-cost]').forEach((el) => el.classList.toggle('poor', S.coins < +el.dataset.cost));
  renderMission(); renderInsp();
  const sb = $('#spbtn'); if (sb) sb.classList.toggle('ready', FORM_KEYS.some((k) => formReady(k) && S.coins >= formCost(k)));   // glows when a card level can be bought (back on the screen, build 306)
}
function toast(t) { glog('toast', t, WORLD); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#fx').appendChild(d); setTimeout(() => d.remove(), 1900); }

// ======================= pinch zoom =======================
// wide screens (tester Гоша, 2560x1440: «Адаптируй пожалуйста игру под разные разрешения экрана»): the map fills the whole window; the
// scale keeps the look of a 720 px wide column (phones are narrower: unchanged) and the zoom floor grows so the map always covers the window
const refW = (w) => Math.min(w, 720);
const minZoom = () => Math.max(0.9, viewW && WW ? viewW / (WW * refW(viewW) / BASEW * ROOMS_K) : 0, viewH && WH ? viewH / (WH * refW(viewW) / BASEW * ROOMS_K) : 0);
function setZoom(z, cx, cy, wx, wy) {   // keep world point (wx, wy) under client point (cx, cy) of the scroller
  zoom = Math.max(minZoom(), Math.min(ZMAX, z));
  scale = (refW(viewW) / BASEW) * zoom * ROOMS_K;
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
  const sl = scroller.scrollLeft, st = scroller.scrollTop; scroller.style.overflow = 'hidden'; scroller.scrollLeft = sl; scroller.scrollTop = st;   // no native pan or momentum under the pinch (her «дергается»)
  pinch = { d0: tdist(e.touches), z0: zoom, wx: (sl + m.x) / scale, wy: (st + m.y) / scale };
  pinching = true;
}, { passive: false });
scroller.addEventListener('touchmove', (e) => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const m = tmid(e.touches);
  setZoom(pinch.z0 * tdist(e.touches) / pinch.d0, m.x, m.y, pinch.wx, pinch.wy);
}, { passive: false });
function endPinch(e) { if (pinch && e.touches.length < 2) { pinch = null; pinching = false; pinchedAt = Date.now(); } if (!e.touches.length && scroller.style.overflow) { const sl = scroller.scrollLeft, st = scroller.scrollTop; scroller.style.overflow = ''; scroller.scrollLeft = sl; scroller.scrollTop = st; } }   // native scroll back only when every finger is up   // no forced ground redraw any more: its resolution no longer depends on the zoom (the redraw froze the game on every pinch release, her report build 212)
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
// PC: drag the map with the mouse (touch screens already pan natively)
scroller.addEventListener('pointermove', (e) => {
  if (!down || e.pointerType !== 'mouse' || !(e.buttons & 1)) return;
  scroller.scrollLeft = down.sl - (e.clientX - down.x); scroller.scrollTop = down.st - (e.clientY - down.y);
  scroller.style.cursor = 'grabbing';
});
window.addEventListener('pointerup', () => { scroller.style.cursor = ''; });
// Taps use the 'click' event: phones fire it only for a real tap (never after a scroll), while pointerup
// was often cancelled on Android because the browser took the touch for the start of a scroll.
scroller.addEventListener('click', (e) => {
  const d0 = down; down = null;
  if (d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 12) return;   // mouse drag on a PC is not a tap
  if (pinching || Date.now() - pinchedAt < 300) return;
  const r = scroller.getBoundingClientRect();
  const wx = (e.clientX - r.left + scroller.scrollLeft) / scale, wy = (e.clientY - r.top + scroller.scrollTop) / scale;
  // inverse projection; try the floor point and points slightly lower (taps on walls / tall sprites)
  const mr = mailRect; if (mr && performance.now() - mr.t < 600 && wx >= mr.x0 && wx <= mr.x1 && wy >= mr.y0 && wy <= mr.y1) { openPanel(mailPanel); return; }   // the envelope over the office opens the letter (build 311)
  { const h = sfHits.find((q) => Math.hypot(wx - q.x, wy - q.y) < q.r); if (h) { h.st.caught = 1; sfBursts.push({ x: h.x, y: h.y, t: performance.now(), r: Math.random() }); S.stardust = (S.stardust || 0) + 1; popup('+1 ✨', h.x, h.y, '#f4d35e', 26); save(); LORE.event('star'); return; } }   /* secret «Звездопад»: a caught star */
  if (pukh && !pukh.caught && pukhHit && Math.hypot(wx - pukhHit.x, wy - pukhHit.y) < pukhHit.r) { pukh.caught = performance.now(); pukh.cx = pukhHit.x; pukh.cy = pukhHit.y; LORE.event('pukh'); return; }   // secret «Совёнок Пух»
  const dw = window.__dewHit; if (dw && performance.now() - dw.t < 600 && dw.pts.some(([x, y]) => Math.hypot(wx - x, wy - (y - 10)) < 28) && LORE.event('dew')) return;   // secret «Роса»
  const mh = window.__moonHit; if (mh && performance.now() - mh.t < 600 && Math.hypot(wx - mh.x, wy - mh.y) < mh.r) { LORE.event('moon'); return; }   // the director's riddle, line 1
  const cr = window.__crownRect; if (cr && performance.now() - cr.t < 600 && wx >= cr.x0 && wx <= cr.x1 && wy >= cr.y0 && wy <= cr.y1 && LORE.event('crown')) return;   // line 5
  { const m = moonRect; if (WORLD === 1 && m && performance.now() - m.t < 600 && wx >= m.x0 && wx <= m.x1 && wy >= m.y0 && wy <= m.y1) { tapMoon(); return; } }   // the Moon Tree
  const tk = tikhonRect; if (tk && performance.now() - tk.t < 600 && wx >= tk.x0 && wx <= tk.x1 && wy >= tk.y0 && wy <= tk.y1) { if (TK.on && LORE.event('tikhon')) return; openPanel(tikhonPanel); return; }   // walking Tikhon at dusk talks (line 3)   // Tikhon (or his scroll) opens his own report window, wherever he walks
  const sign = signRects.find((r) => wx >= r.x0 - 6 && wx <= r.x1 + 6 && wy >= r.y0 - 6 && wy <= r.y1 + 6);   // a sign always opens its room
  if (sign) { if (sign.id === 'FOUNT') openPanel(fountainPanel); else openRoom(sign.id); return; }
  if (WORLD === 1 && COURT) for (const lift of [0, 20, 40, 60]) {   // build 279: a tap on the fountain opens the court's upgrades
    const a = (wx - OX) / HW, b = (wy + lift - OY) / HH, tx = (a + b) / 2, ty = (b - a) / 2, c = courtC();
    if (Math.abs(tx - c.x) < 2 && Math.abs(ty - c.y) < 2) { if (!LORE.event('fount')) openPanel(fountainPanel); return; }
  }
  // a tap inside a room (floor, or walls/sprites just above it) always opens the room
  for (const lift of [0, 20, 40]) {
    const a = (wx - OX) / HW, b = (wy + lift - OY) / HH;
    const tx = Math.floor((a + b) / 2), ty = Math.floor((b - a) / 2);
    const id = regAt(tx, ty);
    if (!id || id === 'hall' || id === 'path') continue;
    openRoom(id); return;
  }
  // in the corridors a tap on a creature tells what it is doing
  const who = creatureAt(e.clientX, e.clientY);
  if (who) toast(`${who.name}: ${statusOf(who)}`);
});
function openRoom(id) {
  { const ci = CLASS_SLOT.indexOf(id); if (ci >= 0 && incOf(ci)) { fixIncident(ci); return; } }   // a tap on a class in trouble fixes it
  {
    const ci = CLASS_SLOT.indexOf(id);
    if (ci >= 0) {
      if (S.classes[ci].built) openPanel(classPanel(ci));
      else if (S.classes.findIndex((c) => !c.built) === ci) openPanel(buildPanel(ci));
      else toast('Сначала построй предыдущий класс');
      return;
    }
    if (id === 'REC') { openPanel(receptionPanel); return; }
    if (id === 'GARDEN') { toast(`🎓 Выпускников: ${S.stats.graduated}`); return; }
    if (id === 'LIB') { openPanel(libPanel); return; }
    if (id === 'DIR') { openPanel(WORLD === 2 ? (dirBuilt() ? thronePanel : throneBuildPanel) : dirBuilt() ? dirPanel : dirBuildPanel); return; }
    { const o = bObj(id); if (o && o.built && Date.now() < (o.end || 0)) { toast(`🏗️ Идёт стройка: ещё ${mmss((o.end - Date.now()) / 1000)}`); return; } }
    if (id === 'SHOP') { openPanel(shopPanel); return; }
    if (id === 'CANT') { openPanel(cantPanel); return; }
    if (id === 'TOWER') { openPanel(towerPanel); return; }
    if (id === 'TRADE') { openPanel(tradePanel); return; }
    if (id === 'EXPED') { openPanel(expedPanel); return; }
    if (id === 'DORM' || id === 'DORM2') { openPanel(dormPanel); return; }
  }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, i = +d.i;
  { const ks = Object.keys(d); if (ks.length) glog('tap', ks.map((k) => (d[k] ? `${k}=${d[k]}` : k)).join(' ').slice(0, 80) + (t.textContent ? ' «' + t.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) + '»' : ''), WORLD); }   // the event journal: what was pressed
  if (t.id === 'menubtn') { setMenu(!menuOpen); return; }
  if (menuOpen && t.closest('#menugrid')) setMenu(false);   // a tile closes the menu, then opens its panel below as before
  if (d.close !== undefined) { closePanel(); return; }
  if (AV.click(d)) return;   // avatar buttons
  if (d.war !== undefined) { openWar(); return; }
  if (qClick(d)) return;
  if (d.missions !== undefined) { openPanel(missionsPanel); return; }
  if (d.insp !== undefined) { openPanel(inspPanel); return; }
  if (d.people !== undefined) { openPanel(peoplePanel); return; }
  if (d.rating !== undefined) { openPanel(ratingPanel); return; }
  if (d.cash !== undefined) { openPanel(cashPanel); return; }
  if (d.w2res !== undefined) { const mi = CLASSES.findIndex((c) => c.id === 'mine'); if (mi >= 0 && isOpen(mi)) openPanel(classPanel(mi)); else toast('⛏️ Руду добывают в Штольне — построй её'); return; }
  if (d.species !== undefined) { openPanel(speciesPanel); return; }
  if (d.alb !== undefined) { albumSp = d.alb; refreshPanel(); return; }
  if (d.sfx !== undefined) { setSfx(d.sfx === '1'); if (panel === settingsPanel) { openPanel(settingsPanel); drawFbPics(); } return; }
  if (d.music !== undefined) { setMusic(d.music === '1'); if (panel === settingsPanel) { openPanel(settingsPanel); drawFbPics(); } return; }
  if (d.calm !== undefined) { setCalm(d.calm === '1'); if (panel === settingsPanel) { openPanel(settingsPanel); drawFbPics(); } return; }
  if (d.worlds !== undefined) { openPanel(worldsPanel); return; }
  if (d.world !== undefined) { goWorld(+d.world); return; }
  if (d.worldOpen !== undefined) { openWorld(+d.worldOpen); return; }
  if (d.mgo !== undefined) { goMission(d.mgo); return; }
  if (d.advgo !== undefined) { advGo(d.advgo); return; }
  if (d.mission !== undefined) { claimMission(d.mission); if (panel === missionsPanel) refreshPanel(); return; }
  if (t.id === 'btn-settings') { openPanel(settingsPanel); drawFbPics(); return; }
  if (d.feedback !== undefined) { sendFeedback(); return; }
  if (d.replies !== undefined) { openPanel(repliesPanel); return; }
  if (d.notif !== undefined) { openNotif(); return; }
  if (d.gamelog !== undefined) { openPanel(gameLogPanel); return; }
  if (d.animpilot !== undefined) { if (localStorage.getItem('magicschool.anim') === 'fx') localStorage.removeItem('magicschool.anim'); else localStorage.setItem('magicschool.anim', 'fx'); save(); location.reload(); return; }   // the pilot switch (moderator only)
  if (d.gamelogcopy !== undefined) { const t = gdump(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('📜 Журнал скопирован')).catch(() => window.prompt('Скопируй журнал:', t)); return; }
  if (d.fbDel !== undefined) { fbPics.splice(+d.fbDel, 1); drawFbPics(); return; }
  if (d.cloudNew !== undefined) { cloudCreate(); return; }
  if (d.top !== undefined) { openTop(); return; }
  if (d.mgsub !== undefined) { mgSub = d.mgsub; const v = document.getElementById('school-name')?.value, vn = document.getElementById('school-nick')?.value; refreshPanel(); const e = document.getElementById('school-name'), en = document.getElementById('school-nick'); if (e && v != null) e.value = v; if (en && vn != null) en.value = vn; return; }
  if (d.allyshow !== undefined) { allyShown = allyShown === d.allyshow ? '' : d.allyshow; refreshPanel(); return; }
  if (d.toptab !== undefined) { topTab = d.toptab; const v = document.getElementById('school-name')?.value, vn = document.getElementById('school-nick')?.value; refreshPanel(); const e = document.getElementById('school-name'), en = document.getElementById('school-nick'); if (e && v != null) e.value = v; if (en && vn != null) en.value = vn; return; }
  if (d.ally !== undefined) { openAlly(); return; }
  if (d.stones !== undefined) { openPanel(stonesPanel); return; }
  if (d.level !== undefined) { openPanel(levelPanel); return; }
  if (d.stbuy !== undefined) { stonesBuy(d.stbuy); return; }
  if (d.stfnt !== undefined) { stonesFount(d.stfnt); return; }
  if (d.mg !== undefined) { MG.open(); return; }
  if (d.allyclaim !== undefined) { allyClaim(); return; }
  if (d.allygift !== undefined) { allySend(d.allygift, 'gift'); return; }
  if (d.allyboost !== undefined) { allySend(d.allyboost, 'boost'); return; }
  if (d.allycopy !== undefined) { const c = myAl(); navigator.clipboard?.writeText(c).then(() => toast('Код альянса скопирован: ' + c), () => window.prompt('Код альянса:', c)); return; }
  if (d.allyopen !== undefined) { allyToggleOpen(); return; }
  if (d.allyleave !== undefined) { allyLeave(); return; }
  if (d.allyjoin !== undefined) { allyJoin(document.getElementById('ally-code')?.value); return; }
  if (d.allyjoinid !== undefined) { allyJoin(d.allyjoinid); return; }
  if (d.allycreate !== undefined) { allyCreate(); return; }
  if (d.reqsend !== undefined) { reqSend(d.reqsend); return; }
  if (d.reqcancel !== undefined) { reqCancel(d.reqcancel); return; }
  if (d.reqok !== undefined) { reqAnswer(d.reqok, true); return; }
  if (d.reqno !== undefined) { reqAnswer(d.reqno, false); return; }
  if (d.mailopen !== undefined) { openPanel(mailPanel); return; }
  if (d.allykick !== undefined) { allyKick(d.allykick); return; }
  if (d.allylead !== undefined) { allyLead(d.allylead); return; }
  if (d.allyedit !== undefined) { allyEdit(); return; }
  if (d.allydisband !== undefined) { allyDisband(); return; }
  if (d.allyemo !== undefined) { allyEmo = ALLY_EMOS[+d.allyemo] || '🦄'; refreshAlly(); return; }   // an index: emojiHtml turns an emoji inside an attribute into an <img> and broke 6 of the 12 buttons (her «не все гербы нажимаются»)
  if (d.schoolName !== undefined) { saveSchoolName(); return; }
  if (d.cloudLoad !== undefined) { cloudLoad(); return; }
  if (d.backupRestore !== undefined) { restoreBackup(); return; }
  if (d.cloudCopy !== undefined) { navigator.clipboard?.writeText(cloudCode()).then(() => toast('Код скопирован'), () => window.prompt('Твой код:', cloudCode())); return; }
  if (d.cloudOff !== undefined) { if (confirm('Отключить облако на этом устройстве? Прогресс здесь останется, просто перестанет сохраняться в облако.')) { localStorage.removeItem(CODE_KEY); localStorage.setItem('magicschool.cloudOff', '1'); cloudState = ''; openPanel(settingsPanel); } return; }
  if (d.tourAgain !== undefined) { closePanel(); tourList = TOUR; showTour(0); return; }
  if (d.tourNext !== undefined) { showTour(tourStep + 1); return; }
  if (d.tourBack !== undefined) { showTour(tourStep - 1); return; }
  if (d.tourSkip !== undefined) { showTour(-1); return; }
  if (d.reset !== undefined) { if (confirm('Точно начать заново? Весь прогресс пропадёт.')) { localStorage.removeItem(SAVE_KEY); S = null; location.reload(); } return; }
  const st = S.classes[i];
  if (d.act === 'teacher') { if (spend(teacherCost(i))) st.teacher++; }
  else if (d.act === 'desk') { if (st.desks < maxDesksOf(i) && spend(deskCost(i))) { st.desks++; pullWaiting(i); } }
  else if (d.act === 'expand') { if (sizeOf(i) < MAX_SIZE && spend(expandCost(i))) { st.size = sizeOf(i) + 1; relayout(); toast(`📐 ${CLASSES[i].name}: класс расширен!`); } }
  else if (d.act === 'time') { if (spend(timeCost(i))) st.time++; }
  else if (d.act === 'light') { if (WORLD === 2 && lightLvl(i) < lightMax(i) && hallDark(i) > 1e-9 && spend(lightCost(i))) { const W = W2(); W.light ||= {}; W.light[i] = lightLvl(i) + 1; } }
  else if (d.act === 'item') { if (spend(itemCost(i, +d.k))) st.items[+d.k]++; }
  else if (d.act === 'rec') { if (S.reception.level < MAX_REC_LVL && spend(recCost())) S.reception.level++; }
  else if (d.act === 'ads') { if (S.reception.ads < MAX_REC_LVL && !adsFull() && spend(adsCost())) S.reception.ads++; }
  else if (d.act === 'cbench') { if (courtUp().bench < MAX_BENCH && spend(benchCost())) { courtUp().bench++; staticKey = ''; toast('🪑 Во дворе поставили новую скамейку!'); } }
  else if (d.act === 'cfount') { if (courtUp().fount < MAX_FOUNT && spend(fountCost())) courtUp().fount++; }
  else if (d.act === 'ccoin') { if (courtUp().coin < MAX_COIN && spend(coinCost())) courtUp().coin++; }
  else if (d.act === 'beds') { if (bedCount() < maxBeds() && spend(bedsCost())) dormUp().beds++; }
  else if (d.act === 'dormexp') { const k = +d.k; if (dormSize(k) < 3 && spend(dormExpandCost(k))) { dormUp()['size' + k] = dormSize(k) + 1; relayout(); toast('📐 Спальня расширена!'); } }
  else if (d.act === 'dorm2') { if (!(S.dormUp && S.dormUp.room2) && spend(DORM2_COST)) { dormUp().room2 = true; dormUp().room2End = Date.now() + BTIME.DORM2 * 1000; staticKey = ''; toast('✨ Вторая спальня построена!'); } }
  else if (d.act === 'formlvl') { const f = formSt(d.k); if (formReady(d.k) && spend(formCost(d.k))) { f.xp -= formNeed(f.lvl); f.lvl++; toast(`✨ ${formName(d.k)}: уровень ${f.lvl}!`); } }
  else if (d.act === 'thronebuild') { const gi = guardsIdx(); if (!throne().built && gi >= 0 && isOpen(gi) && spend(THRONE_COST)) { throne().built = true; throne().end = Date.now() + BTIME.DIR * 1000; staticKey = ''; toast('👑 Трон старейшины готов! Слушайте гул из глубин'); } }
  else if (d.act === 'throneup') { const k = d.k; if ((throne()[k] || 0) < THRONE_MAX && spend(thCost(k))) throne()[k] = (throne()[k] || 0) + 1; }
  else if (d.act === 'expedbuild') { const gi = CLASSES.findIndex((c) => c.id === EXPED_NEED); if (!exped().built && gi >= 0 && isOpen(gi) && spend(EXPED_COST)) { exped().built = true; exped().end = Date.now() + BTIME.EXPED * 1000; corrKey = ''; staticKey = ''; toast('🕳️ Врата глубин открыты! Выпускники станут искателями'); } }
  else if (d.act === 'exped') { sendExped(+d.k); }
  else if (d.act === 'expedup') { const k = d.k; if ((exped()[k] || 0) < EXPED_MAX && spend(exCostUp(k))) exped()[k] = (exped()[k] || 0) + 1; }
  else if (d.act === 'tradebuild') { const fi = CLASSES.findIndex((c) => c.id === 'forge'); if (!trade().built && fi >= 0 && isOpen(fi) && spend(TRADE_COST)) { trade().built = true; trade().end = Date.now() + BTIME.TRADE * 1000; corrKey = ''; staticKey = ''; toast('🐐 Торговый двор построен!'); } }
  else if (d.act === 'caravan') sendCaravan();
  else if (d.act === 'tup') { const k = d.k; if (trade()[k] < MAX_TUP && spend(tupCost(k))) trade()[k]++; }
  else if (d.act === 'store') { if (W2().store < MAX_STORE && spend(storeCost())) { W2().store++; toast('📦 Склад руды больше!'); } }
  else if (d.act === 'exlvl') { if (exLvl(i) < MAX_EX_LVL && spend(exCost(i))) st.ex = exLvl(i) + 1; }
  else if (d.act === 'xpllvl') { if (xplLvl(i) < MAX_XPL_LVL && spend(xplCost(i))) st.xpl = xplLvl(i) + 1; }
  else if (d.act === 'shopbuild') { if (!(S.shop && S.shop.built) && spend(SHOP_COST)) { shopUp().built = true; S.shop.end = Date.now() + BTIME.SHOP * 1000; staticKey = ''; toast(WORLD === 2 ? '💎 Самоцветная лавка открыта!' : '🛍️ Лавка открыта!'); panel = shopPanel; } }
  else if (d.act === 'towerbuild') { if (!(S.tower && S.tower.built) && isOpen(NCLS - 1) && spend(towerCost())) { towerUp().built = true; S.tower.end = Date.now() + BTIME.TOWER * 1000; staticKey = ''; toast(WORLD === 2 ? '🗝️ Чертог Хранителей построен!' : '🏰 Башня мастеров построена!'); panel = towerPanel; } }
  else if (d.act === 'towerprep') { if (retakeLvl() < RETAKE_MAX && spend(retakeCost())) { towerUp().prep = retakeLvl() + 1; towerUp().rt = Math.min(towerUp().rt ?? 1e9, retakeInterval()); } }
  else if (d.act === 'towercap') { if (towerUp().cap < TOWER_MAXUP && spend(towerCapCost())) { towerUp().cap++; towerPull(); } }
  else if (d.act === 'towerfree') { const T = towerUp(), r = T.res[+d.k]; if (r && !r.away && confirm(`Отпустить ${r.name} (${resTitle(r)})? Школа получит 🎁 ${fmt(releaseReward(r))}.`)) { bonus(releaseReward(r)); T.res.splice(+d.k, 1); towerPull(); toast(`🎁 ${r.name} отправился в большое путешествие`); } }
  else if (d.act === 'towerno') { towerUp().wait.splice(+d.k, 1); }
  else if (d.act === 'toweronly') { const T = towerUp(); T.onlyM = !T.onlyM; if (T.onlyM) { const n = T.wait.length; T.wait = T.wait.filter((r) => r.rk === 5); if (n > T.wait.length) toast(`${TW.emo} Отказано ${TW.eldersD} у двери: ${n - T.wait.length}`); } }
  else if (d.act === 'cantbuild') { if (!cantBuilt() && isOpen(CANT_NEED) && spend(CANT_COST)) { const u = cantUp(); u.built = true; u.end = Date.now() + CANT_TIME * 1000; staticKey = ''; toast(WORLD === 2 ? '🏗️ Пиршественный зал строится!' : '🏗️ Столовая строится!'); panel = cantPanel; } }
  else if (d.act === 'cantup') { const k = d.k; if (cantUp()[k] < CANT_MAX[k] && spend(cantCost(k))) cantUp()[k]++; }
  else if (d.act === 'shopup') { const k = d.k; if (shopUp()[k] < SHOP_MAX && spend(shopCost(k))) shopUp()[k]++; }
  else if (d.act === 'dirbuild') { if (schoolStars() < DIR_STARS) { toast(`Нужно ⭐ ${DIR_STARS} звезды школы`); return; } if (!S.dirBuilt && S.coins >= DIR_COST && spendStars(DIR_STARS) && spend(DIR_COST)) { S.dirBuilt = true; S.dirEnd = Date.now() + BTIME.DIR * 1000; staticKey = ''; toast('👑 Кабинет директора построен!'); panel = dirPanel; } }
  else if (d.act === 'plan') { if (PLANS[d.k]) { boss().plan = d.k; toast(`${PLANS[d.k].emo} Договор: ${PLANS[d.k].name}`); } }
  else if (d.act === 'camp') startCamp(d.k);
  else if (d.act === 'mail') { answerMail(d.k); if (panel === mailPanel) refreshPanel(); }
  else if (d.act === 'dir') { const k = d.k; if (dirLvl(k) < DIR_UP[k].max && spend(dirCost(k))) { S.dir ||= {}; S.dir[k] = dirLvl(k) + 1; } }
  else if (d.act === 'libseats') { if (libSeats() < MAX_LIB_SEATS && spend(libSeatsCost())) libUp().seats++; }
  else if (d.act === 'libspeed') { if (libUp().speed < MAX_LIB_LVL && spend(libSpeedCost())) libUp().speed++; }
  else if (d.act === 'libbonus') { if (libUp().bonus < MAX_LIB_LVL && spend(libBonusCost())) libUp().bonus++; }
  else if (d.act === 'conc') { if (dormUp().conc < MAX_CONC && spend(concCost())) dormUp().conc++; }
  else if (d.act === 'build') { if (starsNeed(i) > schoolStars()) { toast(`Нужно ⭐ ${starsNeed(i)} звёзд школы`); return; } if (S.coins >= buildCost(i) && spendStars(starsNeed(i)) && spend(buildCost(i))) { st.built = true; st.buildEnd = Date.now() + buildTime(i) * 1000; panel = classPanel(i); } }
  else return;
  refreshPanel(); save();
});
$('#sheet-bg').addEventListener('click', closePanel);
// Swipe the panel down to close it: drag its header, or pull down when it is scrolled to the top.
{
  const sh = $('#sheet'); let sw = null;
  sh.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('textarea, input')) return;
    const onHead = !!e.target.closest('.sh-head');
    sw = { y0: e.touches[0].clientY, dy: 0, onHead, top: sh.scrollTop <= 0, active: false };
  }, { passive: true });
  sh.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const dy = e.touches[0].clientY - sw.y0;
    if (!sw.active) { if (dy > 8 && (sw.onHead || (sw.top && sh.scrollTop <= 0))) sw.active = true; else if (Math.abs(dy) > 8) { sw = null; return; } else return; }
    e.preventDefault();
    sw.dy = Math.max(0, dy); sh.style.transition = 'none'; sh.style.transform = `translateY(${sw.dy}px)`;
  }, { passive: false });
  const end = () => {
    if (!sw) return; const s0 = sw; sw = null; if (!s0.active) return;
    sh.style.transition = 'transform .2s ease-out';
    if (s0.dy > Math.min(140, sh.offsetHeight * 0.25)) { sh.style.transform = 'translateY(100%)'; setTimeout(() => { closePanel(); sh.style.transition = ''; sh.style.transform = ''; }, 200); }
    else { sh.style.transform = ''; setTimeout(() => { sh.style.transition = ''; }, 200); }
  };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}


// ======================= cloud save (transfer code) =======================
// Firestore REST, collection "saves", document id = transfer code. Rules allow get/create/update of one known code only.
// ======================= top of schools (build 244, tester Ruslan's idea, Maria's go 2026-11-23 «теперь можно следующий этап») =======================
// Firestore collection top/{uid}_w{world}: name, w, r (rating), n (reviews), g (graduates), gold, build, updated.
// Every device signs in anonymously (Firebase Auth REST, no SDK); the rules let a device write only its own entries,
// anyone may read the list. A school enters the table after TOP_MIN reviews (else a new school with 3 graduates would lead).
const FB_KEY = 'AIzaSyC2BiopoOBIkkFKf1RkkbKyOSHCgZMZSTg';   // the public web key of the Firebase project (safe to ship: access is decided by the rules)
const TOP_URL = 'https://firestore.googleapis.com/v1/projects/magic-school-game-2ae0f/databases/(default)/documents/top';
const TOP_MIN = 300, TOP_EVERY = 60, NAME_KEY = 'magicschool.schoolName', ANON_KEY = 'magicschool.anon';
const WNAME_KEY = WORLD === 1 ? NAME_KEY : NAME_KEY + '.w' + WORLD;   // every world keeps its own school name (her «Названия для школы должны быть на каждый мир свое»)
if (WORLD > 1 && localStorage.getItem(WNAME_KEY) === null && localStorage.getItem(NAME_KEY)) localStorage.setItem(WNAME_KEY, localStorage.getItem(NAME_KEY));   // once: the old shared name, then it is changed on its own
const schoolName = () => (localStorage.getItem(WNAME_KEY) || '').trim();
const NICK_KEY = 'magicschool.nick';   // build 249 (her «отдельной графой ... подписывать своё имя (ник)»)
const playerNick = () => (localStorage.getItem(NICK_KEY) || '').trim();
const cleanName = (s) => String(s || '').replace(/[<>"&\n\r\t]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const escTxt = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let anonBusy = null;
async function anonToken() {   // an id token of this device's anonymous account (signs up once, then refreshes)
  let A = null; try { A = JSON.parse(localStorage.getItem(ANON_KEY)); } catch (e) { /* none */ }
  if (A && A.tok && A.exp > Date.now() + 60000) return A;
  if (anonBusy) return anonBusy;
  anonBusy = (async () => {
    let r;
    if (A && A.refresh) {
      r = await fetch('https://securetoken.googleapis.com/v1/token?key=' + FB_KEY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(A.refresh) });
      if (r.ok) { const d = await r.json(); A = { uid: d.user_id, refresh: d.refresh_token, tok: d.id_token, exp: Date.now() + (+d.expires_in || 3600) * 1000 }; localStorage.setItem(ANON_KEY, JSON.stringify(A)); return A; }
    }
    r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FB_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
    if (!r.ok) throw new Error('auth ' + r.status);
    const d = await r.json(); A = { uid: d.localId, refresh: d.refreshToken, tok: d.idToken, exp: Date.now() + (+d.expiresIn || 3600) * 1000 };
    localStorage.setItem(ANON_KEY, JSON.stringify(A)); return A;
  })();
  try { return await anonBusy; } finally { anonBusy = null; }
}
let topSentAt = 0, topSentKey = '';
// tests never reach the public top (her «В школах много тестовых стоит», 2026-11-23: two «Тестовая» schools came from a Claude test that
// loaded her save on 127.0.0.1): no writes from a local or LAN server or an automated browser, unless the address has ?top=1
const TOP_TEST = !/[?&]top=1/.test(location.search) && (!!navigator.webdriver || /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|\[::1\])/.test(location.hostname));
async function topPush(force) {   // our line in the table (only with a school name); quietly does nothing offline
  if (TOP_TEST || !S || !schoolName() || !(S.rating || S.stats.graduated)) return;
  const R = rating(), key = [schoolName(), playerNick(), myAl(), R.v.toFixed(2), R.n, schoolLevel(), S.stats.graduated, MG.weekBest(), MG.prevBest(), MG.flightBest(), MG.flightPrev(), qTopKey()].join('|');
  if (!force && (key === topSentKey || Date.now() - topSentAt < TOP_EVERY * 1000)) return;
  topSentAt = Date.now();
  try {
    const A = await anonToken();
    const I = (v) => ({ integerValue: String(Math.round(v || 0)) });
    const body = { fields: { name: { stringValue: schoolName() }, ...(playerNick() ? { nick: { stringValue: playerNick() } } : {}), ...(myAl() ? { al: { stringValue: myAl() } } : {}), w: I(WORLD), lv: I(Math.max(1, Math.min(1000, schoolLevel()))), r: { doubleValue: Math.max(0, Math.min(5, +R.v.toFixed(3))) }, n: I(R.n), g: I(S.stats.graduated), gold: I(R.gold), ...qTopFields(I), mg: I(MG.weekBest()), mw: I(MG.weekKey()), ...(MG.prevBest() ? { pm: I(MG.prevBest()), pw: I(MG.weekKey() - 1) } : {}), fl: I(MG.flightBest()), flw: I(MG.weekKey()), ...(MG.flightPrev() ? { fpm: I(MG.flightPrev()), fpw: I(MG.weekKey() - 1) } : {}), ...(G3_ON ? { g3: I(MG.gBest()), g3w: I(MG.weekKey()), ...(MG.gPrev() ? { g3pm: I(MG.gPrev()), g3pw: I(MG.weekKey() - 1) } : {}) } : {}), build: I(BUILD), updated: I(Date.now()) } };   // mg/mw: «Зельеварка» best of this week
    const r = await fetch(`${TOP_URL}/${A.uid}_w${WORLD}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok }, body: JSON.stringify(body) });
    if (r.ok) topSentKey = key;
  } catch (e) { /* offline: next time */ }
}
let topList = null, topErr = '', topLoadedAt = 0;
async function topLoad() {
  try {
    const r = await fetch(TOP_URL + '?pageSize=300', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
    const d = await r.json(), num = (f) => (f ? +(f.integerValue ?? f.doubleValue ?? 0) : 0);
    topList = (d.documents || []).map((x) => ({ id: x.name.split('/').pop(), name: (x.fields.name || {}).stringValue || '?', nick: (x.fields.nick || {}).stringValue || '', al: (x.fields.al || {}).stringValue || '', w: num(x.fields.w), r: num(x.fields.r), n: num(x.fields.n), lv: num(x.fields.lv), rf: (x.fields.rf || {}).stringValue || '', aw: num(x.fields.aw), ag: num(x.fields.ag), am: num(x.fields.am), ap: num(x.fields.ap), wp: num(x.fields.wp), wpp: num(x.fields.wpp), wpw: num(x.fields.wpw), g: num(x.fields.g), gold: num(x.fields.gold), mg: num(x.fields.mg), mw: num(x.fields.mw), pm: num(x.fields.pm), pw: num(x.fields.pw), fl: num(x.fields.fl), flw: num(x.fields.flw), fpm: num(x.fields.fpm), fpw: num(x.fields.fpw), g3: num(x.fields.g3), g3w: num(x.fields.g3w), g3pm: num(x.fields.g3pm), g3pw: num(x.fields.g3pw) }));
    topErr = ''; topLoadedAt = Date.now(); mgPrizeCheck();
  } catch (e) { topErr = 'Не получилось загрузить топ — проверь интернет'; }
  await AV.load();   // approved avatars (every 5 min at most)
  if (panel === topPanel) { const v = document.getElementById('school-name')?.value, vn = document.getElementById('school-nick')?.value; refreshPanel(); const e = document.getElementById('school-name'), en = document.getElementById('school-nick'); if (e && v != null) e.value = v; if (en && vn != null) en.value = vn; }   // keep what is being typed
}
// ======================= alliances and gifts (build 262, her wish «альянсы, союзы, друг другу плюшки отправлять»; her picks:
// open list AND invite codes (the founder chooses), a free magic gift (3 a day to each ally) and «Вдохновение» (+10% lesson pay
// for 10 min, 1 a day to each ally), a top of alliances) =======================
// Firestore: alliances/{code} {name, emo, open, owner, w, created} (anyone reads, the founder edits); membership = field al of
// the player's top/{uid}_w{world} entry (S.al in the save); gifts/{id} {from, fname, to, w, kind, t} — the sender writes, only
// the receiver reads and deletes (claims). The value of a gift is counted by the receiver (3 minutes of HIS income), so a
// sender can never inflate it. The daily limits are kept on the sender's device.
const ALLY_URL = 'https://firestore.googleapis.com/v1/projects/magic-school-game-2ae0f/databases/(default)/documents';
const ALLY_EMOS = ['🦄', '🐉', '🦉', '🌙', '⭐', '🔮', '🌸', '🍄', '🔥', '❄️', '🌈', '👑'];
const GIFT_DAY = 3, BOOST_DAY = 1, BOOST_MIN = 10, BOOST_MAX_MIN = 60, ALLY_MAX = 6;   // 10 -> 6 (her pick «6 школ»): members above it stay, new ones wait
let allyList = null, allyGifts = [], allyMsg = '', allyPollT = 5, allyEmo = '🦄', myReqs = [], ownReqs = [];   // join requests (build 268): mine and those to my alliance
function boostK() { const now = Date.now(); return (S && S.boostEnd && now < S.boostEnd ? 1.1 : 1) * (S && S.goldEnd && now < S.goldEnd ? 2 : 1); }   // build audit 2026-11-24: x2 while «Звёздный час» (moonstones) runs   // «Вдохновение»: +10% to every lesson (a function: tuition() may run before this block)
const myAl = () => (S && S.al) || '';
const allyOf = (code) => (allyList || []).find((a) => a.id === code);
const anonUid = () => { try { return (JSON.parse(localStorage.getItem(ANON_KEY)) || {}).uid || ''; } catch (e) { return ''; } };
// player avatars (Maria 2026-11-23, js/avatar.js): an on-device 18+ check, then her approval; shown in the top, the alliance and the profile
const AV = initAvatar({ url: ALLY_URL, token: () => anonToken(), uid: () => anonUid(), name: () => schoolName(), toast: (t) => toast(t), esc: (s) => escTxt(s), changed: () => avChanged() });
function avChanged() {   // re-render the open top / alliance window, keeping what is typed
  if (panel === topPanel) { const v = document.getElementById('school-name')?.value, vn = document.getElementById('school-nick')?.value; refreshPanel(); const e = document.getElementById('school-name'), en = document.getElementById('school-nick'); if (e && v != null) e.value = v; if (en && vn != null) en.value = vn; }
  else if (panel === allyPanel) refreshAlly();
}
const today = () => qDay();   // build audit 2026-11-24: local midnight like the daily tasks (was UTC)
function giftLog() { const g = (S.giftLog ||= { day: today(), g: {}, b: {} }); if (g.day !== today()) { g.day = today(); g.g = {}; g.b = {}; } return g; }
function allyMembers(code) { const a = allyOf(code), k = (a && a.kick) || []; return (topList || []).filter((x) => x.w === WORLD && x.al === code && !k.includes(x.id.replace(/_w\d$/, ''))); }   // kicked schools drop out at once (build 270)
async function allyLoad() {
  try {
    const r = await fetch(ALLY_URL + '/alliances?pageSize=300', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
    const d = await r.json(), v = (f) => (f ? f.stringValue ?? (f.booleanValue ?? +(f.integerValue ?? 0)) : '');
    allyList = (d.documents || []).map((x) => ({ id: x.name.split('/').pop(), name: v(x.fields.name) || '?', emo: v(x.fields.emo) || '🦄', open: !!v(x.fields.open), owner: v(x.fields.owner), w: +v(x.fields.w) || 1,
      motto: v(x.fields.motto) || '', kick: ((x.fields.kick && x.fields.kick.arrayValue && x.fields.kick.arrayValue.values) || []).map((k) => k.stringValue) }));
    allyMsg = ''; return true;
  } catch (e) { allyMsg = 'Не получилось загрузить альянсы — проверь интернет'; return false; }
}
async function allyPoll() {   // gifts sent to me (any world; claimed in the world they were sent for)
  if (!schoolName()) return;
  try {
    const A = await anonToken();
    const r = await fetch(ALLY_URL + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'gifts' }], where: { fieldFilter: { field: { fieldPath: 'to' }, op: 'EQUAL', value: { stringValue: A.uid } } } } }) });
    if (!r.ok) return;
    const d = await r.json();
    if (await allyLoad() && myAl()) {   // build 270: the founder may kick a school or disband the alliance; the player leaves by himself
      const a = allyOf(myAl());
      if (!a || (a.kick || []).includes(A.uid)) { const nm = a ? a.name : ''; S.al = ''; save(); topPush(true); toast(a ? `🚪 Тебя исключили из альянса «${nm}»` : '💥 Альянс распущен'); }
    }
    await reqPoll(A);
    allyGifts = d.filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), fname: x.document.fields.fname?.stringValue || '?', kind: x.document.fields.kind?.stringValue, w: +(x.document.fields.w?.integerValue || 1) })).filter((g) => g.w === WORLD);
    updateHud(); if (panel === allyPanel) refreshAlly();
  } catch (e) { /* offline */ }
}
function allyTick() { if (document.hidden) return; allyPollT -= 1; if (allyPollT <= 0) { allyPollT = 60; allyPoll(); } }   // once a second from the frame loop
async function allyClaim() {
  if (!allyGifts.length) return;
  const A = await anonToken().catch(() => null); if (!A) return;
  let coins = 0, boosts = 0;
  for (const g of allyGifts.slice()) {
    const r = await fetch(`${ALLY_URL}/gifts/${g.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + A.tok } }).catch(() => null);
    if (!r || !r.ok) continue;   // claimed only once: the gift is gone from the cloud before it is counted
    if (g.kind === 'boost') { boosts++; S.boostEnd = Math.min(Date.now() + BOOST_MAX_MIN * 60000, Math.max(Date.now(), S.boostEnd || 0) + BOOST_MIN * 60000); }
    else coins += Math.max(300, Math.round((rateNow() || 1) * 180 / 10) * 10);
  }
  if (coins) S.coins += coins;   // a gift is not the school's own income: it must not lift the income rate or the inspector's «earn» check
  allyGifts = []; save(); updateHud();
  toast(`🎁 Подарки получены${coins ? ': 🪙' + fmt(coins) : ''}${boosts ? `${coins ? ' и' : ':'} ✨ Вдохновение` : ''}`);
  refreshAlly();
}
async function allySend(toUid, kind) {
  const L = giftLog(), k = kind === 'boost' ? 'b' : 'g', lim = kind === 'boost' ? BOOST_DAY : GIFT_DAY;
  if ((L[k][toUid] || 0) >= lim) { toast('На сегодня этому союзнику уже всё отправлено'); return; }
  try {
    const A = await anonToken();
    const r = await fetch(ALLY_URL + '/gifts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok },
      body: JSON.stringify({ fields: { from: { stringValue: A.uid }, fname: { stringValue: schoolName().slice(0, 24) }, to: { stringValue: toUid }, w: { integerValue: String(WORLD) }, kind: { stringValue: kind }, t: { integerValue: String(Date.now()) } } }) });
    if (!r.ok) throw new Error(r.status);
    L[k][toUid] = (L[k][toUid] || 0) + 1; S.stats.gifts = (S.stats.gifts || 0) + 1; warAdd('gift', WAR_PTS.gift); save();   // gifts: counted for the missions
    toast(kind === 'boost' ? '✨ Вдохновение отправлено!' : '🎁 Подарок отправлен!');
  } catch (e) { toast('Не получилось отправить — проверь интернет'); }
  refreshAlly();
}
const ALLY_CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
async function allyCreate() {
  const name = cleanName(document.getElementById('ally-name')?.value), emo = allyEmo, open = !!document.getElementById('ally-open')?.checked;
  if (!name) { toast('Напиши название альянса'); return; }
  let code = 'A'; for (let i = 0; i < 7; i++) code += ALLY_CODE_CH[Math.floor(Math.random() * ALLY_CODE_CH.length)];
  try {
    const A = await anonToken();
    const r = await fetch(`${ALLY_URL}/alliances/${code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok },
      body: JSON.stringify({ fields: { name: { stringValue: name }, emo: { stringValue: emo }, open: { booleanValue: open }, owner: { stringValue: A.uid }, w: { integerValue: String(WORLD) }, created: { integerValue: String(Date.now()) } } }) });
    if (!r.ok) throw new Error(r.status);
    S.al = code; save(); await topPush(true); await allyLoad(); await topLoad();
    toast(`${emo} Альянс «${name}» создан!`);
  } catch (e) { toast('Не получилось создать — проверь интернет'); }
  refreshAlly();
}
async function allyJoin(code) {
  code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { toast('Впиши код альянса'); return; }
  try {
    const r = await fetch(`${ALLY_URL}/alliances/${code}`, { cache: 'no-store' });
    if (!r.ok) { toast('Такого альянса нет — проверь код'); return; }
    if (!allyList) await allyLoad();
    if (((allyOf(code) || {}).kick || []).includes(anonUid())) { toast('Тебя исключили из этого альянса — вступить снова нельзя'); return; }
    if (allyMembers(code).filter((x) => x.id !== anonUid() + '_w' + WORLD).length >= ALLY_MAX) { toast(`В альянсе уже ${ALLY_MAX} школ`); return; }
    S.al = code; save(); await topPush(true); await allyLoad(); await topLoad();
    const a = allyOf(code); toast(`${a ? a.emo + ' ' : ''}Ты в альянсе${a ? ' «' + a.name + '»' : ''}!`);
  } catch (e) { toast('Не получилось — проверь интернет'); }
  refreshAlly();
}
async function allyLeave() { if (!confirm('Выйти из альянса?')) return; S.al = ''; save(); await topPush(true); await topLoad(); toast('🚪 Альянс покинут'); refreshAlly(); }
// ---- join requests (build 268, her «Как вступить в альянс чужой может? Нет нигде подачи заявки»): any alliance can be asked
// to let you in; its founder sees the requests in his panel and accepts or declines; the applicant joins by himself when
// he sees «ok» (only he may write his own top entry). Firestore reqs/{uid}_{code} {from, fname, nick, r, al, owner, w, t, st}.
const fsv = (f) => (f ? f.stringValue ?? +(f.integerValue ?? f.doubleValue ?? 0) : '');
async function reqQuery(A, field) {
  const r = await fetch(ALLY_URL + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'reqs' }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: A.uid } } } } }) });
  if (!r.ok) return [];
  return (await r.json()).filter((x) => x.document).map((x) => { const f = x.document.fields; return { id: x.document.name.split('/').pop(), fname: fsv(f.fname), nick: fsv(f.nick), r: +fsv(f.r) || 0, al: fsv(f.al), w: +fsv(f.w) || 1, st: fsv(f.st) }; });
}
async function reqPoll(A) {
  myReqs = (await reqQuery(A, 'from')).filter((q) => q.w === WORLD);
  for (const q of myReqs.slice()) {
    if (q.st === 'wait') continue;
    await fetch(`${ALLY_URL}/reqs/${q.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + A.tok } }).catch(() => null);
    myReqs = myReqs.filter((x) => x !== q);
    const a = allyOf(q.al) || {};
    if (q.st === 'ok' && !myAl()) { S.al = q.al; save(); topPush(true).then(topLoad).then(refreshAlly); toast(`🎉 Тебя приняли в альянс${a.name ? ' «' + a.name + '»' : ''}!`); }
    else if (q.st === 'no') toast(`😔 Альянс${a.name ? ' «' + a.name + '»' : ''} отклонил заявку`);
  }
  if (!allyList) await allyLoad();
  const al = allyOf(myAl());
  ownReqs = al && al.owner === A.uid ? (await reqQuery(A, 'owner')).filter((q) => q.st === 'wait' && q.al === al.id) : [];
}
async function reqSend(code) {
  const a = allyOf(code); if (!a) return;
  try {
    const A = await anonToken(), R = rating();
    const r = await fetch(`${ALLY_URL}/reqs/${A.uid}_${code}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok },
      body: JSON.stringify({ fields: { from: { stringValue: A.uid }, fname: { stringValue: schoolName().slice(0, 24) }, nick: { stringValue: playerNick().slice(0, 20) }, r: { doubleValue: +R.v.toFixed(2) }, al: { stringValue: code }, owner: { stringValue: a.owner }, w: { integerValue: String(WORLD) }, t: { integerValue: String(Date.now()) }, st: { stringValue: 'wait' } } }) });
    if (!r.ok) throw new Error(r.status);
    myReqs.push({ id: `${A.uid}_${code}`, al: code, st: 'wait', w: WORLD });
    toast(`📩 Заявка в «${a.name}» отправлена. Когда её примут, ты сразу окажешься в альянсе`);
  } catch (e) { toast('Не получилось отправить заявку — проверь интернет'); }
  refreshAlly();
}
async function reqCancel(code) {
  try { const A = await anonToken(); await fetch(`${ALLY_URL}/reqs/${A.uid}_${code}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + A.tok } }); } catch (e) { /* offline */ }
  myReqs = myReqs.filter((q) => q.al !== code); toast('Заявка отменена'); refreshAlly();
}
async function reqAnswer(id, ok) {
  const q = ownReqs.find((x) => x.id === id); if (!q) return;
  if (ok && allyMembers(q.al).length >= ALLY_MAX) { toast(`В альянсе уже ${ALLY_MAX} школ`); return; }
  try {
    const A = await anonToken();
    const r = await fetch(`${ALLY_URL}/reqs/${id}?updateMask.fieldPaths=st`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok }, body: JSON.stringify({ fields: { st: { stringValue: ok ? 'ok' : 'no' } } }) });
    if (!r.ok) throw new Error(r.status);
    ownReqs = ownReqs.filter((x) => x.id !== id);
    toast(ok ? `✅ «${q.fname}» принята — школа появится в альянсе, как только её игрок зайдёт в игру` : `Заявка «${q.fname}» отклонена`);
  } catch (e) { toast('Не получилось — проверь интернет'); }
  updateHud(); refreshAlly();
}
// ---- founder's tools (build 270, her «как создатель альянса должна мочь выгнать из альянса, может ещё какие-то подобные действия»):
// kick a school (its uid goes to the alliance's kick list; the player leaves by himself and cannot join again), hand the
// leadership to a member, edit name / crest / motto, disband (delete the alliance; members leave on their next poll).
async function allyPatch(fields, mask) {
  const A = await anonToken();
  const r = await fetch(`${ALLY_URL}/alliances/${myAl()}?${mask.map((m) => 'updateMask.fieldPaths=' + m).join('&')}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(r.status);
}
async function allyKick(uid) {
  const a = allyOf(myAl()), m = allyMembers(myAl()).find((x) => x.id.startsWith(uid + '_w')); if (!a) return;
  if (!confirm(`Выгнать «${m ? m.name : 'школу'}» из альянса? Вернуться в него она уже не сможет.`)) return;
  try { const k = [...new Set([...(a.kick || []), uid])].slice(-50); await allyPatch({ kick: { arrayValue: { values: k.map((v) => ({ stringValue: v })) } } }, ['kick']); a.kick = k; toast(`🚪 «${m ? m.name : 'Школа'}» исключена из альянса`); }
  catch (e) { toast('Не получилось — проверь интернет'); }
  refreshAlly();
}
async function allyLead(uid) {
  const a = allyOf(myAl()), m = allyMembers(myAl()).find((x) => x.id.startsWith(uid + '_w')); if (!a || !m) return;
  if (!confirm(`Передать главенство в альянсе «${m.name}»? Управлять альянсом будет она, а ты останешься участником.`)) return;
  try { await allyPatch({ owner: { stringValue: uid } }, ['owner']); a.owner = uid; ownReqs = []; toast(`👑 Глава альянса теперь «${m.name}»`); }
  catch (e) { toast('Не получилось — проверь интернет'); }
  refreshAlly();
}
async function allyEdit() {
  const a = allyOf(myAl()); if (!a) return;
  const name = cleanName(document.getElementById('ally-ename')?.value) || a.name, motto = cleanName(document.getElementById('ally-motto')?.value || '').slice(0, 60);
  try { await allyPatch({ name: { stringValue: name }, emo: { stringValue: allyEmo }, motto: { stringValue: motto } }, ['name', 'emo', 'motto']); Object.assign(a, { name, emo: allyEmo, motto }); toast(`${allyEmo} Альянс обновлён`); }
  catch (e) { toast('Не получилось — проверь интернет'); }
  refreshAlly();
}
async function allyDisband() {
  const a = allyOf(myAl()); if (!a) return;
  if (!confirm(`Распустить альянс «${a.name}»? Все школы выйдут из него, вернуть его будет нельзя.`)) return;
  try { const A = await anonToken(); const r = await fetch(`${ALLY_URL}/alliances/${a.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + A.tok } }); if (!r.ok) throw new Error(r.status);
    allyList = (allyList || []).filter((x) => x !== a); S.al = ''; save(); await topPush(true); await topLoad(); toast('💥 Альянс распущен'); }
  catch (e) { toast('Не получилось — проверь интернет'); }
  refreshAlly();
}
async function allyToggleOpen() {
  const a = allyOf(myAl()); if (!a) return;
  try {
    const A = await anonToken();
    const r = await fetch(`${ALLY_URL}/alliances/${a.id}?updateMask.fieldPaths=open`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok }, body: JSON.stringify({ fields: { open: { booleanValue: !a.open } } }) });
    if (!r.ok) throw new Error(r.status);
    a.open = !a.open; toast(a.open ? '🔓 Альянс открыт: вступить может любой' : '🔒 Теперь вступают по заявкам — ты их принимаешь сам(а)');
  } catch (e) { toast('Не получилось — проверь интернет'); }
  refreshAlly();
}
function refreshAlly() { if (panel !== allyPanel) return; const keep = {}; ['ally-name', 'ally-code', 'ally-ename', 'ally-motto'].forEach((k) => { const e = document.getElementById(k); if (e) keep[k] = e.value; }); const ck = document.getElementById('ally-open')?.checked; refreshPanel(); for (const [k, v] of Object.entries(keep)) { const e = document.getElementById(k); if (e) e.value = v; } const c = document.getElementById('ally-open'); if (c && ck !== undefined) c.checked = ck; }
function openAlly() { openPanel(allyPanel); Promise.all([allyLoad(), topLoad(), allyPoll()]).finally(() => { const a = allyOf(myAl()); if (a) allyEmo = a.emo; refreshAlly(); }); }
// ======================= ⚔️ Битва альянсов (Maria 2026-11-25: «начать разрабатывать эти все клановые движухи», the weekly format «Да»):
// every alliance of the world in one weekly table (week = MG.weekKey(), Monday 00:00 UTC); points come from ACTIVITY, not school size:
// a daily task +10 (4 a day), a mini-game round +5 +5 per star (10 rounds a day), a gift to an ally +3, a school level +20.
// Every member's points travel in his top entry: wp (this week, week = aw), wpp / wpw (last week's total and its week) so the last
// week can be ranked after members already started the new one. Places 1-3 pay 15 / 10 / 5 moonstones to every member (key
// war_<wk>_wN, from 15 min after the week ends); the winner wears «🏆 Чемпион недели» in the alliance top for the next week.
const WAR_PRIZE = [15, 10, 5], WAR_CAP = { dq: 4, mg: 10 }, WAR_PTS = { dq: 10, gift: 3, lv: 20 };
function warSt() {
  const wk = MG.weekKey(), day = qDay();
  if (!S.war) S.war = { wk, pts: 0, lv: schoolLevel() };
  if (S.war.wk !== wk) S.war = { wk, pts: 0, lv: S.war.lv ?? schoolLevel(), pwk: S.war.wk, ppts: S.war.pts || 0, pal: S.war.al || '' };
  if (S.war.day !== day) { S.war.day = day; S.war.c = { dq: 0, mg: 0 }; }
  S.war.al = myAl();
  return S.war;
}
function warAdd(kind, n) {   // points for the alliance (only while in one); daily caps per kind
  if (!S || !myAl()) return; const w = warSt();
  if (WAR_CAP[kind] != null) { if ((w.c[kind] || 0) >= WAR_CAP[kind]) return; w.c[kind] = (w.c[kind] || 0) + 1; }
  w.pts += n; dirtyPanel = true;
}
let warPrizeT = 0, warLoadAsked = 0;
function warTick() {   // from qTick (every 3 s): school levels -> points; last week's prize once the table is known
  const w = warSt(), L = schoolLevel();
  if (L > (w.lv || 0)) { if (myAl()) w.pts += WAR_PTS.lv * (L - (w.lv || L)); w.lv = L; }
  if (w.pwk !== w.wk - 1 || !w.pal || stGot(`war_${w.pwk}_w${WORLD}`)) return;
  const start = ((w.wk * 7) - 3) * 86400000; if (Date.now() - start < 15 * 60000) return;   // members push their last points first
  if (!topList || Date.now() - topLoadedAt > 600000) { if (Date.now() - warLoadAsked > 120000) { warLoadAsked = Date.now(); topLoad(); } return; }
  if (Date.now() - warPrizeT < 30000) return; warPrizeT = Date.now();
  const place = warTable(w.pwk).findIndex((a) => a.id === w.pal);
  if (place >= 0 && place < WAR_PRIZE.length && stonesAdd(WAR_PRIZE[place], `war_${w.pwk}_w${WORLD}`)) {
    toast(`⚔️ Битва альянсов: ${place + 1}-е место! ${ST_ICON} +${WAR_PRIZE[place]} лунных камней`); save();
  }
}
function warTable(wk) {   // [{id, a, pts, m:[{id, name, pts}]}] of a week, best first; my own line from the save (fresher than the top)
  const me = anonUid() + '_w' + WORLD, w = S.war || {}, groups = {};
  const ptsOf = (x) => (x.aw === wk ? x.wp || 0 : x.wpw === wk ? x.wpp || 0 : 0);
  for (const x of (topList || []).filter((t) => t.w === WORLD && t.id !== me)) {
    const p = ptsOf(x); if (!x.al) continue; (groups[x.al] ||= []).push({ id: x.id, name: x.name, pts: p });
  }
  const myPts = wk === w.wk ? w.pts || 0 : wk === w.pwk ? w.ppts || 0 : 0, myAlW = wk === w.wk ? myAl() : wk === w.pwk ? w.pal : '';
  if (myAlW) (groups[myAlW] ||= []).push({ id: me, name: schoolName() || 'Моя школа', pts: myPts });
  return Object.entries(groups).map(([id, m0]) => { const a = allyOf(id), k = (a && a.kick) || [], m = m0.filter((x) => !k.includes(x.id.replace(/_w\d+$/, '')));
    return { id, a, m: m.sort((p, q) => q.pts - p.pts), pts: m.reduce((n, x) => n + x.pts, 0) }; })
    .filter((x) => x.a && x.a.w === WORLD && x.pts > 0).sort((p, q) => q.pts - p.pts);
}
const warChamp = () => { if (!S || !topList) return ''; const t = warTable(MG.weekKey() - 1); return t.length ? t[0].id : ''; };
function warPanel() {
  const w = warSt(), wk = w.wk, T = warTable(wk), mine = T.findIndex((x) => x.id === myAl());
  const left = Math.max(0, ((wk + 1) * 7 - 3) * 86400000 - Date.now()), dd = Math.floor(left / 86400000), hh = Math.floor((left % 86400000) / 3600000);
  const champ = warChamp(), ca = champ && allyOf(champ);
  const head = `<div class="sh-head"><span class="remoji big">⚔️</span><div><h2>Битва альянсов</h2><div class="muted">Неделя битвы: до конца ${dd} д ${hh} ч</div></div><button class="x" data-close>✕</button></div>`;
  const prize = `<div class="qbig" style="flex-wrap:wrap;font-weight:700">🏆 Награда каждому участнику: 1-е место ${ST_IMG(16)} ${WAR_PRIZE[0]} · 2-е ${ST_IMG(16)} ${WAR_PRIZE[1]} · 3-е ${ST_IMG(16)} ${WAR_PRIZE[2]}</div>`;
  const how = `<h3>Как заработать очки</h3><div class="muted" style="line-height:1.5">📅 дело из «Ежедневных» — +${WAR_PTS.dq} (до 4 в день)<br>🧪 раунд мини-игры — +5 и ещё +5 за каждую звезду (до 10 в день)<br>🎁 подарок союзнику — +${WAR_PTS.gift}<br>🌟 новый уровень школы — +${WAR_PTS.lv}<br>Очки считаются, только пока ты в альянсе.</div>`;
  const last = ca ? `<p class="muted">🏆 Чемпион прошлой недели: <b>${ca.emo} ${escTxt(ca.name)}</b></p>` : '';
  const rows = T.length ? T.slice(0, 20).map((x, k) => `<div class="card up" style="padding:7px 10px${x.id === myAl() ? ';border:2px solid #e8b923;background:#fff8dc' : ''}"><span style="font-weight:900;min-width:26px">${k < 3 ? ['🥇', '🥈', '🥉'][k] : k + 1 + '.'}</span><span class="remoji">${x.a.emo}</span><div class="grow"><b>${escTxt(x.a.name)}</b>${x.id === myAl() ? ' <span class="muted">(твой)</span>' : ''}<div class="muted">школ: ${x.m.length}</div></div><b>${fmt(x.pts)}</b></div>`).join('')
    : '<p class="muted">На этой неделе очков пока нет ни у кого — начни первым!</p>';
  let my = '';
  if (myAl()) {
    const me = T[mine], mem = me ? me.m : [{ id: anonUid() + '_w' + WORLD, name: schoolName(), pts: w.pts }];
    my = `<h3>Твой альянс${me ? `: ${mine + 1}-е место, ${fmt(me.pts)} очков` : ''}</h3>` + mem.map((x) => `<div class="card" style="padding:5px 10px;margin:3px 0">${AV.img(x.id, 28)}<span class="grow">${escTxt(x.name)}${x.id === anonUid() + '_w' + WORLD ? ' <span class="muted">(ты)</span>' : ''}</span><b>${fmt(x.pts)}</b></div>`).join('');
  } else my = `<div class="q"><span class="qi">🤝</span><span class="qt">Вступи в альянс, чтобы сражаться вместе с ним</span><button class="btn small go" data-qgo="@ally">Альянсы ➜</button></div>`;
  const wait = topList ? '' : '<p class="muted">Загружаю таблицу…</p>';
  return head + prize + wait + `<h3>Таблица недели</h3>` + rows + my + last + how;
}
function openWar() { openPanel(warPanel); topPush(true).finally(() => Promise.all([topLoad(), allyLoad()]).finally(() => { if (panel === warPanel) refreshPanel(); })); }
window.__war = { st: () => warSt(), add: (k, n) => warAdd(k, n), table: (wk) => warTable(wk ?? MG.weekKey()), tick: () => { warPrizeT = 0; warTick(); }, champ: () => warChamp() };   // test hook
function allyPanel() {
  const head = `<div class="sh-head"><span class="remoji big">🤝</span><div><h2>Альянс</h2><div class="muted">Союз школ: подарки друг другу и общий рейтинг</div></div><button class="x" data-close>✕</button></div>`;
  if (!schoolName()) return head + '<p>Чтобы вступить в альянс, сначала придумай название своей школы.</p><button class="btn wide" data-top>🏆 Придумать название</button>';
  let h = head;
  if (allyGifts.length) h += `<div class="card up" style="border:2px solid #e8b923;background:#fff8dc"><span class="remoji">🎁</span><div class="grow"><b>Тебе прислали подарков: ${allyGifts.length}</b><div class="muted">от: ${[...new Set(allyGifts.map((g) => escTxt(g.fname)))].join(', ')}</div></div><button class="btn hot small" data-allyclaim>Забрать</button></div>`;
  if (S.boostEnd && Date.now() < S.boostEnd) h += `<p>✨ <b>Вдохновение</b>: ещё ${mmss((S.boostEnd - Date.now()) / 1000)} — плата за уроки +10%.</p>`;
  if (allyMsg) h += `<p class="muted">${allyMsg}</p>`;
  const me = anonUid() + '_w' + WORLD, code = myAl();
  if (code) {
    const a = allyOf(code), mem = allyMembers(code).sort((x, y) => y.r - x.r), L = giftLog();
    const avg = mem.length ? mem.reduce((n, x) => n + x.r, 0) / mem.length : 0;
    h += `<div class="card up"><span class="remoji big">${a ? a.emo : '🤝'}</span><div class="grow"><b>${a ? escTxt(a.name) : 'Альянс'}</b>${a && a.motto ? `<div><i>«${escTxt(a.motto)}»</i></div>` : ''}${a && a.owner === anonUid() ? ' <span class="muted">👑 ты глава</span>' : ''}<div class="muted">код ${code} · ${a && a.open ? '🔓 вход свободный, без заявок' : '🔒 по заявкам'} · школ ${mem.length}/${ALLY_MAX} · сила 💪 ${avg ? r2(avg * mem.length) : '—'} · средний 🏅 ${avg ? r2(avg) : '—'}</div></div><button class="btn small" data-allycopy>Код</button></div>`;
    h += '<button class="btn wide" data-valley>🚩 Волшебная долина</button><button class="btn wide ghost" data-war>⚔️ Битва альянсов: очки недели</button><h3>Школы альянса</h3>' + (mem.length ? mem.map((x) => {
      const uid = x.id.replace(/_w\d$/, ''), gi = L.g[uid] || 0, bo = L.b[uid] || 0;
      return `<div class="card up"${x.id === me ? ' style="border:2px solid #e8b923;background:#fff8dc"' : ''}>${AV.img(x.id)}<div class="grow"><b>${escTxt(x.name)}</b>${x.id === me ? ' <span class="muted">(ты)</span>' : ''}${x.nick ? `<div>👤 ${escTxt(x.nick)}</div>` : ''}<div class="muted">🏅 ${r2(x.r)} · 🎓 ${fmt(x.g)}</div></div>${x.id === me ? '' : `<button class="btn small" data-allygift="${uid}" ${gi >= GIFT_DAY ? 'disabled' : ''}>🎁 ${GIFT_DAY - gi}</button><button class="btn small" data-allyboost="${uid}" ${bo >= BOOST_DAY ? 'disabled' : ''}>✨ ${BOOST_DAY - bo}</button>${a && a.owner === anonUid() ? `<button class="btn small ghost" data-allylead="${uid}" title="Сделать главой">👑</button><button class="btn small ghost" data-allykick="${uid}" title="Выгнать">🚪</button>` : ''}`}</div>`;
    }).join('') : '<p class="muted">Загружаю…</p>');
    h += `<p class="muted">🎁 Волшебный подарок: союзник получит монеты — столько, сколько его школа зарабатывает за 3 минуты. ✨ Вдохновение: +10% к плате за уроки на 10 минут. Каждому союзнику в день — ${GIFT_DAY} подарка и ${BOOST_DAY} вдохновение, у тебя при этом ничего не убывает.</p>`;
    if (a && a.owner === anonUid()) h += '<h3>📩 Заявки на вступление</h3>' + (ownReqs.length ? ownReqs.map((q) => `<div class="card up" style="border:2px solid #b9a4f0"><div class="grow"><b>${escTxt(q.fname)}</b>${q.nick ? `<div>👤 ${escTxt(q.nick)}</div>` : ''}<div class="muted">🏅 ${r2(q.r)}</div></div><button class="btn small hot" data-reqok="${q.id}">Принять</button><button class="btn small ghost" data-reqno="${q.id}">Нет</button></div>`).join('') : '<p class="muted">Новых заявок нет. Заявку может подать любая школа из списка альянсов.</p>');
    if (a && a.owner === anonUid()) h += `<h3>👑 Управление альянсом</h3><p class="muted">У каждой школы: 👑 — передать главенство, 🚪 — выгнать.</p>
      <input id="ally-ename" class="fb" maxlength="24" value="${escTxt(a.name)}" placeholder="Название альянса">
      <input id="ally-motto" class="fb" maxlength="60" value="${escTxt(a.motto || '')}" placeholder="Девиз альянса (его видят все)">
      <div class="muted" style="margin-top:6px">Герб:</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${ALLY_EMOS.map((e, k) => `<button class="btn small ${e === allyEmo ? '' : 'ghost'}" data-allyemo="${k}">${e}</button>`).join('')}</div>
      <button class="btn wide" data-allyedit>💾 Сохранить название, девиз и герб</button>`;
    if (a && a.owner === anonUid()) h += `<button class="btn ghost wide" data-allyopen>${a.open ? '🔒 Принимать только по заявкам' : '🔓 Открыть вход для всех (без заявок)'}</button>`;
    if (a && a.owner === anonUid()) h += '<button class="btn ghost wide" data-allydisband>💥 Распустить альянс</button>';
    h += '<button class="btn ghost wide" data-allyleave>🚪 Выйти из альянса</button>';
    return h;
  }
  const open = (allyList || []).filter((a) => a.w === WORLD).map((a) => ({ ...a, mem: allyMembers(a.id) })).filter((a) => a.mem.length > 0 && a.mem.length < ALLY_MAX).sort((x, y) => y.open - x.open || y.mem.length - x.mem.length);   // every alliance with room: open ones -> join, closed ones -> a request (build 268)
  const asked = (id) => myReqs.some((q) => q.al === id && q.st === 'wait');
  h += `<h3>Вступить по коду</h3><input id="ally-code" class="fb" maxlength="10" placeholder="Например: A7K2QM9X"><button class="btn wide" data-allyjoin>🤝 Вступить</button>`;
  h += '<h3>Альянсы</h3>' + (!allyList ? '<p class="muted">Загружаю…</p>' : open.length ? open.map((a) => { const avg = a.mem.reduce((n, x) => n + x.r, 0) / a.mem.length;
    return `<div class="card up"><span class="remoji">${a.emo}</span><div class="grow"><b>${escTxt(a.name)}</b>${a.motto ? `<div><i>«${escTxt(a.motto)}»</i></div>` : ''}<div class="muted">${a.open ? '🔓 вход свободный' : '🔒 по заявке'} · школ ${a.mem.length}/${ALLY_MAX} · 💪 ${r2(avg * a.mem.length)} · средний 🏅 ${r2(avg)}</div></div>${a.open ? `<button class="btn small" data-allyjoinid="${a.id}">Вступить</button>` : asked(a.id) ? `<button class="btn small ghost" data-reqcancel="${a.id}">Заявка ✓ (отменить)</button>` : `<button class="btn small" data-reqsend="${a.id}">Подать заявку</button>`}</div>`; }).join('') : '<p class="muted">Альянсов пока нет — создай свой!</p>');
  h += `<h3>Создать свой альянс</h3><input id="ally-name" class="fb" maxlength="24" placeholder="Название альянса">
    <div class="muted" style="margin-top:6px">Герб:</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${ALLY_EMOS.map((e, k) => `<button class="btn small ${e === allyEmo ? '' : 'ghost'}" data-allyemo="${k}">${e}</button>`).join('')}</div>
    <label class="muted" style="display:block;margin:6px 0"><input type="checkbox" id="ally-open" checked> Вход для всех, без заявок (иначе — по заявкам, ты принимаешь сам(а))</label>
    <button class="btn wide" data-allycreate>✨ Создать альянс</button>`;
  return h;
}
allyPanel.still = true;   // has text fields
let allyShown = '';   // the alliance whose members are open in the top
function allyMembersHtml(x) {
  const mineHere = myAl() === x.id, full = x.m.length >= ALLY_MAX, asked = (myReqs || []).some((q) => q.al === x.id && q.st === 'wait');
  const act = mineHere ? '' : myAl() ? '<p class="muted">Чтобы вступить сюда, сначала выйди из своего альянса (окно 🤝).</p>' : full ? `<p class="muted">В альянсе уже ${ALLY_MAX} школ — мест нет.</p>`
    : x.a.open ? `<button class="btn wide" data-allyjoinid="${x.id}">🤝 Вступить</button>` : asked ? `<button class="btn wide ghost" data-reqcancel="${x.id}">Заявка отправлена ✓ (отменить)</button>` : `<button class="btn wide" data-reqsend="${x.id}">📩 Подать заявку</button>`;
  return `<div style="margin:-4px 0 10px 14px;border-left:3px solid #c9b8ee;padding-left:8px">${x.m.slice().sort((p, q) => q.r - p.r || q.g - p.g).map((m) => `<div class="card up" style="padding:6px 10px">${AV.img(m.id, 34)}<div class="grow"><b>${escTxt(m.name)}</b>${x.a.owner && m.id.replace(/_w\d+$/, '') === x.a.owner ? ' 👑' : ''}${m.nick ? ` <span class="muted">👤 ${escTxt(m.nick)}</span>` : ''}<div class="muted">🏅 ${r2(m.r)}${m.lv ? ` · 🌟 ${m.lv}` : ''} · 🎓 ${fmt(m.g)}</div></div></div>`).join('')}${act}</div>`;
}
function allyTopRows() {   // the top of alliances by strength = the SUM of its schools' ratings (her pick 2026-11-23: a one-school alliance led the mean-rating table)
  const groups = {};
  for (const x of (topList || []).filter((t) => t.w === WORLD && t.al)) (groups[x.al] ||= []).push(x);
  const rows = Object.entries(groups).map(([id, m0]) => { const a = allyOf(id), k = (a && a.kick) || [], m = m0.filter((x) => !k.includes(x.id.replace(/_w\d+$/, ''))), sum = m.reduce((n, x) => n + x.r, 0);
    return { id, a, m, s: sum, r: m.length ? sum / m.length : 0, g: m.reduce((n, x) => n + x.g, 0) }; }).filter((x) => x.a && x.m.length).sort((p, q) => Math.round(q.s * 100) - Math.round(p.s * 100) || q.g - p.g);
  if (!rows.length) return '<p class="muted">Пока ни одного альянса — создай свой в окне 🤝!</p>';
  const champ = warChamp();
  return '<p class="muted">Нажми на альянс, чтобы увидеть его школы.</p>' + rows.slice(0, 30).map((x, k) => `<button class="card up" data-allyshow="${x.id}" style="width:100%;text-align:left;font:inherit;cursor:pointer${x.id === myAl() ? ';border:2px solid #e8b923;background:#fff8dc' : ''}"><span class="remoji">${x.a.emo}</span><div class="grow"><b>${k + 1}. ${escTxt(x.a.name)}</b>${x.id === champ ? ' <span style="color:#c58a00;font-weight:800">🏆 Чемпион недели</span>' : ''}${x.id === myAl() ? ' <span class="muted">(твой)</span>' : ''}<div class="muted">💪 сила ${r2(x.s)} · средний 🏅 ${r2(x.r)} · школ ${x.m.length} · 🎓 ${fmt(x.g)} выпускников</div></div><span class="muted">${allyShown === x.id ? '▲' : '▼'}</span></button>${allyShown === x.id ? allyMembersHtml(x) : ''}`).join('');
}
let topTab = 's';
function openTop() { topPush(true).finally(() => Promise.all([topLoad(), allyLoad()]).finally(() => { if (panel === topPanel) refreshPanel(); })); openPanel(topPanel); }
function lvTopHtml(all, mine) {   // schools by level (all named schools of this world, no review minimum); older builds sent no level
  const l = all.filter((x) => x.lv > 0).sort((a, b) => b.lv - a.lv || b.g - a.g);
  if (!l.length) return '<p class="muted">Уровни появятся в топе, когда школы обновят игру.</p>';
  return '<h3>Самые развитые школы</h3><p class="muted">Уровень школы растёт с каждым выпускником: чем выше звание, тем больше опыта.</p>' + l.slice(0, 50).map((x, k) => `<div class="card up"${mine(x) ? ' style="border:2px solid #e8b923;background:#fff8dc"' : ''}><span class="remoji">${['🥇', '🥈', '🥉'][k] || ''}</span>${AV.img(x.id)}<div class="grow"><b>${k + 1}. ${escTxt(x.name)}</b>${mine(x) ? ' <span class="muted">(ты)</span>' : ''}${x.nick ? `<div>👤 ${escTxt(x.nick)}</div>` : ''}<div class="muted">🎓 ${fmt(x.g)} выпускников · 🏅 ${r2(x.r)}</div></div><b>🌟 ${x.lv}</b></div>`).join('');
}
function topPanel() {
  let me = ''; try { me = (JSON.parse(localStorage.getItem(ANON_KEY)) || {}).uid || ''; } catch (e) { /* none */ }
  const mine = (x) => me && x.id === me + '_w' + WORLD;
  const all = (topList || []).filter((x) => x.w === WORLD);
  const ok = all.filter((x) => x.n >= TOP_MIN).sort((a, b) => Math.round(b.r * 100) - Math.round(a.r * 100) || b.gold - a.gold || b.g - a.g), wait = all.filter((x) => x.n < TOP_MIN);
  const rows = ok.slice(0, 50).map((x, k) => `<div class="card up"${mine(x) ? ' style="border:2px solid #e8b923;background:#fff8dc"' : ''}><span class="remoji">${['🥇', '🥈', '🥉'][k] || ''}</span>${AV.img(x.id)}<div class="grow"><b>${k + 1}. ${escTxt(x.name)}</b>${mgChamp(x)}${x.al && allyOf(x.al) ? ' ' + allyOf(x.al).emo : ''}${mine(x) ? ' <span class="muted">(ты)</span>' : ''}${x.nick ? `<div>👤 ${escTxt(x.nick)}</div>` : ''}<div class="muted">🏅 ${r2(x.r)} · 🎓 ${fmt(x.g)} выпускников · золотых отзывов ${fmt(x.gold)}</div></div></div>`).join('');
  const myPlace = ok.findIndex(mine);
  const nameBox = `<h3>Название твоей школы${WORLDS.length > 1 ? ` в ${WORLD === 2 ? 'мире гномов' : 'Школе магии'}` : ''}</h3><p class="muted" style="margin:0 0 4px">У каждого мира своё название, имя (ник) общее.</p><input id="school-name" class="fb" maxlength="24" placeholder="Например: Звёздная академия" value="${escTxt(schoolName())}"><h3>Твоё имя (ник)</h3><input id="school-nick" class="fb" maxlength="20" placeholder="Как тебя подписать в топе" value="${escTxt(playerNick() || localStorage.getItem('magicschool.name') || '')}"><button class="btn wide" data-school-name>💾 Сохранить</button>`;
  return `<div class="sh-head"><span class="remoji big">🏆</span><div><h2>Топ школ</h2><div class="muted">${WORLD === 2 ? 'Мир гномов' : 'Школа магии'} · по рейтингу 🏅</div></div><button class="x" data-close>✕</button></div>
    ${schoolName() ? `<p>Твоя школа «<b>${escTxt(schoolName())}</b>»${playerNick() ? ` (👤 ${escTxt(playerNick())})` : ''}: рейтинг 🏅 ${ratingTxt()}${myPlace >= 0 ? `, <b>${myPlace + 1}-е место</b>` : rating().n < TOP_MIN ? ` — в топ попадёт после ${TOP_MIN} отзывов (сейчас ${fmt(rating().n)})` : ''}.</p>` : '<p><b>Придумай название школы</b> и впиши своё имя, чтобы школа появилась в топе. Их увидят все игроки.</p>'}
    ${nameBox}${AV.myBox()}${AV.modBox()}
    <div style="display:flex;gap:6px;margin:10px 0"><button class="btn ${topTab === 's' ? '' : 'ghost'}" data-toptab="s">🏫 Школы</button><button class="btn ${topTab === 'l' ? '' : 'ghost'}" data-toptab="l">🌟 Уровень</button><button class="btn ${topTab === 'a' ? '' : 'ghost'}" data-toptab="a">🤝 Альянсы</button><button class="btn ${topTab === 'm' ? '' : 'ghost'}" data-toptab="m">🎮 Игры</button></div>
    ${topTab === 'l' ? lvTopHtml(all, mine) : topTab === 'm' ? mgTopHtml(mine) : topTab === 'a' ? '<h3>Лучшие альянсы</h3><p class="muted">Место альянса — по силе 💪: это сумма рейтингов всех его школ. Каждая школа добавляет альянсу силы.</p>' + allyTopRows() : topErr ? `<p class="muted">${topErr}</p>` : !topList ? '<p class="muted">Загружаю топ…</p>' : rows ? '<h3>Лучшие школы</h3>' + rows : '<p class="muted">Пока в топе никого нет — стань первой школой!</p>'}
    ${topTab === 'm' || topTab === 'l' ? '' : wait.length ? `<p class="muted">Ещё набирают отзывы: ${wait.length} ${wait.length === 1 ? 'школа' : 'школ'}.</p>` : ''}
    ${topTab === 'm' || topTab === 'l' ? '' : `<p class="muted">Места — по рейтингу 🏅 с точностью до сотых; при равном рейтинге выше та школа, у которой больше золотых отзывов. В топ попадают школы, у которых не меньше ${TOP_MIN} отзывов. Рейтинг обновляется раз в минуту, пока игра открыта.</p>`}`;
}
// ---- weekly tables and prizes of the mini-games (build 358 potions, flight added later; her picks «Призы за неделю», «Полёт через кольца») ----
const MG_PRIZE = [60, 30, 15];   // minutes of «Вдохновение» for places 1-3 of last week (capped at 60 like every boost)
const MG_GAMES = {
  p: { cur: 'mg', w: 'mw', pm: 'pm', pw: 'pw', title: WORLD === 2 ? 'Огранка самоцветов' : 'Зельеварка', icon: WORLD === 2 ? '💎' : '🧪', mark: ' 🏆', best: () => MG.weekBest(), prev: () => MG.prevBest(), due: () => MG.prizeDue(), claim: () => MG.claim() },
  f: { cur: 'fl', w: 'flw', pm: 'fpm', pw: 'fpw', title: WORLD === 2 ? 'Вагонетка в штольне' : 'Полёт через кольца', icon: WORLD === 2 ? '⛏️' : '🪽', mark: WORLD === 2 ? ' ⛏️' : ' 🪽', best: () => MG.flightBest(), prev: () => MG.flightPrev(), due: () => MG.flightPrizeDue(), claim: () => MG.claimFlight() },
};
MG_GAMES.g = { cur: 'g3', w: 'g3w', pm: 'g3pm', pw: 'g3pw', title: WORLD === 2 ? 'Башня из руды' : 'Рыбалка', icon: WORLD === 2 ? '🏗️' : '🎣', mark: WORLD === 2 ? ' 🏗️' : ' 🎣', best: () => MG.gBest(), prev: () => MG.gPrev(), due: () => MG.gPrizeDue(), claim: () => MG.claimG() };   // the third game's weekly table (fields g3*)
const G3_ON = true;   // Firestore rules allow g3 / g3w / g3pm / g3pw
let mgSub = 'p';
function mgLastWeek(g = 'p') {   // last week's table of this world: an entry still in that week or already moved on (previous-week fields)
  const G = MG_GAMES[g], w = MG.weekKey() - 1;
  return (topList || []).filter((x) => x.w === WORLD).map((x) => ({ ...x, lw: x[G.w] === w ? x[G.cur] : x[G.pw] === w ? x[G.pm] : 0 })).filter((x) => x.lw > 0).sort((a, b) => b.lw - a.lw);
}
const mgChamp = (x) => (topList ? Object.keys(MG_GAMES).map((g) => { const l = mgLastWeek(g); return l.length && l[0].id === x.id ? MG_GAMES[g].mark : ''; }).join('') : '');   // last week's champions
function mgPrizeCheck() {
  if (!S || !schoolName()) return;
  let me = ''; try { me = (JSON.parse(localStorage.getItem(ANON_KEY)) || {}).uid || ''; } catch (e) { /* none */ }
  if (!me) return;
  for (const g of Object.keys(MG_GAMES)) {
    const G = MG_GAMES[g]; if (!G.due()) continue;
    const place = mgLastWeek(g).findIndex((x) => x.id === me + '_w' + WORLD), prev = G.prev();
    G.claim();
    if (place < 0 || place > 2) continue;
    const min = MG_PRIZE[place], now = Date.now(), stn = [15, 10, 5][place]; stonesAdd(stn, `mgtop_${g}_${MG.weekKey() - 1}_w${WORLD}`);   // + moonstones (her «делай всё»)
    S.boostEnd = Math.min(now + BOOST_MAX_MIN * 60000, Math.max(now, S.boostEnd || 0) + min * 60000); save(); updateHud();
    const medal = ['🥇', '🥈', '🥉'][place];
    openPanel(() => `<div class="sh-head"><span class="remoji big">${medal}</span><div><h2>${place + 1}-е место: ${G.title}!</h2><div class="muted">Итоги прошлой недели</div></div><button class="x" data-close>✕</button></div>
      <p>Твоя школа «<b>${escTxt(schoolName())}</b>» заняла <b>${place + 1}-е место</b> в турнире «${G.title}» с результатом <b>${prev.toLocaleString('ru-RU')}</b>!</p>
      <p>Приз: ✨ <b>Вдохновение на ${min} минут</b> — плата за уроки +10%, и ${ST_IMG()} <b>${stn} лунных камней</b>.${place === 0 ? ` А ещё всю эту неделю у названия твоей школы в топе горит${G.mark}.` : ''}</p>
      <button class="btn wide" data-close>Ура!</button>`);
    return;   // one panel at a time; the other game's prize comes with the next top load
  }
}
setTimeout(() => { try { if (MG.prizeDue() || MG.flightPrizeDue()) topLoad(); } catch (e) { /* not ready */ } }, 25000);   // the new week's prize does not wait for the top to be opened
function mgTopHtml(mine) {   // weekly table of a mini-game: every named school of this world with a score this week (no review minimum)
  const G = MG_GAMES[mgSub] || MG_GAMES.p;
  const wk = MG.weekKey(), end = ((wk + 1) * 7 - 3) * 86400000, left = Math.max(0, end - Date.now());
  const d = Math.floor(left / 86400000), h = Math.floor(left % 86400000 / 3600000);
  const list = (topList || []).filter((x) => x.w === WORLD && x[G.w] === wk && x[G.cur] > 0).sort((a, b) => b[G.cur] - a[G.cur]);
  const rows = list.slice(0, 50).map((x, k) => `<div class="card up"${mine(x) ? ' style="border:2px solid #e8b923;background:#fff8dc"' : ''}><span class="remoji">${['🥇', '🥈', '🥉'][k] || ''}</span>${AV.img(x.id)}<div class="grow"><b>${k + 1}. ${escTxt(x.name)}</b>${mgChamp(x)}${x.al && allyOf(x.al) ? ' ' + allyOf(x.al).emo : ''}${mine(x) ? ' <span class="muted">(ты)</span>' : ''}${x.nick ? `<div>👤 ${escTxt(x.nick)}</div>` : ''}<div class="muted">${G.icon} ${x[G.cur].toLocaleString('ru-RU')} очков</div></div></div>`).join('');
  const my = G.best(), place = list.findIndex(mine), lw = mgLastWeek(mgSub).slice(0, 3);
  return `<div style="display:flex;gap:6px;margin:4px 0 8px">${Object.keys(MG_GAMES).map((g) => `<button class="btn small ${mgSub === g ? '' : 'ghost'}" data-mgsub="${g}">${MG_GAMES[g].icon} ${MG_GAMES[g].title}</button>`).join('')}</div>
    <h3>${G.icon} ${G.title}: рекорды недели</h3><p class="muted">Лучший результат каждой школы за эту неделю. Призы: 🥇 ✨ 60 мин Вдохновения и${G.mark} у названия на неделю, 🥈 30 мин, 🥉 15 мин. Новая неделя начнётся через ${d ? d + ' д ' : ''}${h} ч.</p>
    <p>Твой рекорд недели: <b>${my.toLocaleString('ru-RU')}</b>${place >= 0 ? ` — <b>${place + 1}-е место</b>` : my && !schoolName() ? ' (впиши название школы, чтобы попасть в таблицу)' : ''}</p>
    <button class="btn wide" data-mg>${G.icon} Играть</button>
    ${lw.length ? `<h3>Победители прошлой недели</h3>${lw.map((x, k) => `<div class="card up"${mine(x) ? ' style="border:2px solid #e8b923;background:#fff8dc"' : ''}><span class="remoji">${['🥇', '🥈', '🥉'][k]}</span><div class="grow"><b>${escTxt(x.name)}</b>${mine(x) ? ' <span class="muted">(ты)</span>' : ''}<div class="muted">${G.icon} ${x.lw.toLocaleString('ru-RU')} очков · приз ✨ ${MG_PRIZE[k]} мин Вдохновения</div></div></div>`).join('')}<h3>Эта неделя</h3>` : ''}
    ${topErr ? `<p class="muted">${topErr}</p>` : !topList ? '<p class="muted">Загружаю…</p>' : rows || '<p class="muted">На этой неделе ещё никто не играл — стань первой!</p>'}`;
}
topPanel.still = true;   // has the name field: no automatic re-render while typing
function saveSchoolName() {
  const el = document.getElementById('school-name'); if (!el) return;
  const v = cleanName(el.value);
  if (!v) { toast('Напиши название школы'); return; }
  const nk = cleanName((document.getElementById('school-nick') || {}).value).slice(0, 20);
  localStorage.setItem(WNAME_KEY, v); if (nk) localStorage.setItem(NICK_KEY, nk); else localStorage.removeItem(NICK_KEY);
  toast(`🏫 Школа «${v}»${nk ? ', директор ' + nk : ''} — записано`);
  topPush(true).finally(topLoad); refreshPanel();
}
const CLOUD = 'https://firestore.googleapis.com/v1/projects/magic-school-game-2ae0f/databases/(default)/documents/saves/';
const CODE_KEY = 'magicschool.cloud';
const cloudCode = () => localStorage.getItem(CODE_KEY) || '';
function newCode() {
  const abc = '23456789ABCDEFGHJKMNPQRSTUVWXYZ', r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map((b) => abc[b % abc.length]).join('');
  return `KOT-${c.slice(0, 4)}-${c.slice(4)}`;
}
const normCode = (t) => { const c = String(t || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^KOT/, ''); return c.length === 8 ? `KOT-${c.slice(0, 4)}-${c.slice(4)}` : null; };
let cloudLast = 0, cloudBusy = false, cloudState = '';
// SAFETY (2026-11-21: a girl lost everything on two devices): progress is never replaced by a smaller one automatically.
// progressOf() is a number that only grows while someone plays: graduates, newcomers and coins earned, over all worlds.
function progressOf(bundle) {
  let o = bundle; if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return 0; } }
  if (!o) return 0;
  const saves = o.v === 3 && o.saves ? Object.values(o.saves) : [o];
  let p = 0;
  for (const raw of saves) { let x = raw; if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { continue; } } const st = (x && x.stats) || {}; p += (st.graduated || 0) * 1000 + (st.enrolled || 0) * 10 + (st.earned || 0); }
  return p;
}
function localBundle() { return { v: 3, meta: readMetaLocal(), saves: Object.fromEntries(WORLDS.map((w) => [saveKeyOf(w.id), w.id === WORLD ? JSON.stringify(S) : localStorage.getItem(saveKeyOf(w.id))]).filter((x) => x[1])) }; }
function backupLocal(why) {   // the whole local progress is kept before anything replaces it (one copy, the bigger one wins)
  try {
    const b = localBundle(), old = JSON.parse(localStorage.getItem('magicschool.backup') || 'null');
    if (old && progressOf(old.data) > progressOf(b)) return;
    localStorage.setItem('magicschool.backup', JSON.stringify({ at: Date.now(), why, data: b }));
  } catch (e) { /* storage full: nothing else to do */ }
}
async function cloudPush(force = false) {
  const code = cloudCode(); if (!code || cloudBusy || noSave) return;   // never while a cloud save is being adopted (reload): that pushed the old empty game
  if (!force && Date.now() - cloudLast < 30_000) return;
  cloudBusy = true; cloudLast = Date.now();
  try {
    save();
    const all = localBundle();
    // the cloud holds more progress than this device: take it instead of overwriting it
    const rem = await cloudGet(code).catch(() => undefined);
    if (rem === undefined) throw new Error('offline');
    if (rem && rem.data && progressOf(rem.data) > progressOf(all)) { cloudBusy = false; if (!noSave) adopt(rem.data); return; }
    const body = { fields: { data: { stringValue: JSON.stringify(all) }, updated: { integerValue: String(S.last) }, build: { integerValue: String(BUILD) } } };
    const txt = JSON.stringify(body);   // keepalive bodies are limited to 64 KB: a bigger save threw «Failed to fetch» and showed «нет сети» forever (her save, build 208)
    const r = await fetch(CLOUD + code, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: txt, keepalive: txt.length < 60000 });
    cloudState = r.ok ? `сохранено в облако в ${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}` : `облако не ответило (${r.status})`;
  } catch (e) { cloudState = 'нет сети: сохраню позже'; console.warn('cloud push', e); }
  cloudBusy = false;
}
async function cloudForce() {   // after restoring a backup: write it to the cloud even if the cloud has more
  const code = cloudCode(); if (!code) return;
  save();
  const body = { fields: { data: { stringValue: JSON.stringify(localBundle()) }, updated: { integerValue: String(S.last) }, build: { integerValue: String(BUILD) } } };
  try { await fetch(CLOUD + code, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { /* later */ }
}
async function cloudGet(code) {
  const r = await fetch(CLOUD + code);
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error('http ' + r.status);
  const d = await r.json();
  return { data: d.fields?.data?.stringValue, updated: +(d.fields?.updated?.integerValue || 0) };
}
// build audit 2026-11-24: the moonstone balance is shared by the device and the cloud; adopting a cloud save or a backup replaced it
// wholesale (stones earned on this device were lost). Now: the larger balance, every one-time key and every bought colour kept.
function keepStones(meta) { try { const loc = stMeta().stones; if (!loc) return meta; meta ||= {}; const st = (meta.stones ||= { n: 0, got: {} });
  st.n = Math.max(st.n || 0, loc.n || 0); st.got = { ...(loc.got || {}), ...(st.got || {}) }; if (loc.own || st.own) st.own = { ...(loc.own || {}), ...(st.own || {}) }; } catch (e) { /* keep as is */ } return meta; }
function adopt(raw) {   // replace the local save with a cloud one and restart the game on it
  if (!noSave) backupLocal('cloud');
  noSave = true;
  let o = null; try { o = JSON.parse(raw); } catch (e) { /* bad */ }
  if (o && o.v === 3 && o.saves) { for (const [k, v] of Object.entries(o.saves)) localStorage.setItem(k, v); if (o.meta) localStorage.setItem('magicschool.meta', JSON.stringify(keepStones(o.meta))); }
  else localStorage.setItem(SAVE_KEY, raw);
  location.reload();
}
// every player gets a cloud code automatically (her ruling 2026-11-22: «облачные сохранения были у всех сразу и не надо было
// ничего для этого делать»); only an explicit «Отключить облако» on this device stops it (magicschool.cloudOff)
async function cloudAuto() {
  if (cloudCode() || localStorage.getItem('magicschool.cloudOff')) return;
  localStorage.setItem(CODE_KEY, newCode());
  await cloudPush(true);
}
function cloudHint() {   // once per device: show the code so the player can write it down
  if (!cloudCode() || localStorage.getItem('magicschool.cloudShown') || tourStep >= 0 || panel || !S || (S.stats.enrolled || 0) < 3) return;
  localStorage.setItem('magicschool.cloudShown', '1');
  openPanel(() => `<div class="sh-head"><span class="remoji big">☁️</span><div><h2>Твоя школа сохраняется в облако</h2><div class="muted">Сама, ничего делать не нужно</div></div><button class="x" data-close>✕</button></div>
    <p>Это код твоей школы. Запиши его или скопируй себе в заметки: по нему школа откроется на другом телефоне или если игра пропадёт.</p>
    <div class="cloud-code">${cloudCode()}</div>
    <button class="btn wide" data-cloud-copy>📋 Скопировать код</button>
    <p class="muted">Код всегда можно посмотреть в ⚙️ → «Облачное сохранение».</p>`);
}
async function cloudPull() {   // a newer save made on another device wins
  const code = cloudCode(); if (!code) return false;
  try {
    const rem = await cloudGet(code);
    if (rem && rem.data && rem.updated > (S.last || 0) + 3000) {   // updated = time of the last push from any world
      if (progressOf(rem.data) >= progressOf(localBundle())) { adopt(rem.data); return true; }
      cloudPush(true);   // newer but SMALLER progress (an empty game on another device): keep ours and put it back into the cloud
    }
  } catch (e) { /* offline: keep playing locally */ }
  return false;
}
async function cloudCreate() {
  const code = newCode(); localStorage.setItem(CODE_KEY, code); localStorage.removeItem('magicschool.cloudOff');
  await cloudPush(true);
  openPanel(settingsPanel);
  toast(cloudState.startsWith('сохранено') ? '☁️ Прогресс в облаке! Запиши код' : '⚠️ ' + cloudState);
}
async function cloudLoad() {
  const code = normCode($('#cloud-in').value);
  if (!code) { toast('Код выглядит так: KOT-XXXX-XXXX'); return; }
  let rem = null;
  try { rem = await cloudGet(code); } catch (e) { toast('Нет связи с облаком, попробуй позже'); return; }
  if (!rem || !rem.data) { toast('Такого кода нет. Проверь буквы и цифры'); return; }
  const gr = (b) => { let o = b; try { o = typeof b === 'string' ? JSON.parse(b) : b; } catch (e) { return 0; } const sv = o && o.v === 3 ? Object.values(o.saves || {}) : [o]; return sv.reduce((n, r) => { try { const x = typeof r === 'string' ? JSON.parse(r) : r; return n + ((x && x.stats && x.stats.graduated) || 0); } catch (e) { return n; } }, 0); };
  const here = progressOf(localBundle()), there = progressOf(rem.data);
  const msg = `По коду: ${fmt(gr(rem.data))} выпускников. На этом устройстве: ${fmt(gr(localBundle()))}.
` + (there < here ? 'ВНИМАНИЕ: по коду прогресса МЕНЬШЕ, чем здесь! Всё равно загрузить? (Твой прогресс отсюда сохранится в запасной копии в ⚙️)' : 'Загрузить прогресс по коду? Прогресс этого устройства сохранится в запасной копии в ⚙️.');
  if (!confirm(msg)) return;
  localStorage.setItem(CODE_KEY, code); localStorage.removeItem('magicschool.cloudOff'); localStorage.setItem('magicschool.cloudShown', '1');
  adopt(rem.data);
}
function cloudBlock() {
  const code = cloudCode();
  if (code) return `<h3>☁️ Облачное сохранение</h3>
    <div class="cloud-code">${code}</div>
    <p class="muted">Синхронизация включена${cloudState ? ': ' + cloudState : ''}. На другом устройстве открой ⚙️ и введи этот код — там будет этот же прогресс.</p>
    <button class="btn ghost wide" data-cloud-copy>📋 Скопировать код</button>
    <button class="btn ghost wide" data-cloud-off>Отключить облако на этом устройстве</button>
    <p class="muted">Есть другой код (например, старый)? Введи его — загрузится прогресс по тому коду.</p>
    <input id="cloud-in" class="fb" placeholder="KOT-XXXX-XXXX" autocapitalize="characters" autocomplete="off">
    <button class="btn ghost wide" data-cloud-load>Загрузить прогресс по коду</button>${backupBtn()}`;   // Ruslan 2026-11-22: the auto code (build 170) hid the field, his old code could not be entered
  return `<h3>☁️ Облачное сохранение</h3>
    <p class="muted">Сохрани прогресс в облако и получи код. По коду прогресс можно открыть на другом телефоне или компьютере.</p>
    <button class="btn wide" data-cloud-new>☁️ Сохранить в облако и получить код</button>
    <input id="cloud-in" class="fb" placeholder="Есть код? Введи: KOT-XXXX-XXXX" autocapitalize="characters" autocomplete="off">
    <button class="btn ghost wide" data-cloud-load>Загрузить прогресс по коду</button>${backupBtn()}`;
}
function backupInfo() { try { return JSON.parse(localStorage.getItem('magicschool.backup') || 'null'); } catch (e) { return null; } }
function backupBtn() {
  const b = backupInfo(); if (!b) return '';
  const d = new Date(b.at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<p class="muted">Запасная копия прогресса этого устройства от ${d}.</p><button class="btn ghost wide" data-backup-restore>↩️ Вернуть запасную копию</button>`;
}
function restoreBackup() {
  const b = backupInfo(); if (!b) return;
  if (!confirm('Вернуть прогресс из запасной копии? Текущий прогресс тоже сохранится как запасная копия.')) return;
  const cur = localBundle(); noSave = true;
  const o = b.data; for (const [k, v] of Object.entries(o.saves || {})) localStorage.setItem(k, v); if (o.meta) localStorage.setItem('magicschool.meta', JSON.stringify(keepStones(o.meta)));
  localStorage.setItem('magicschool.backup', JSON.stringify({ at: Date.now(), why: 'swap', data: cur }));
  // the restored game must win in the cloud too: push it right after the reload
  localStorage.setItem('magicschool.forcePush', '1');
  location.reload();
}

// ======================= loop, offline =======================
let earnedThisSec = 0, secT = 0, saveT = 0, last = performance.now(), panelT = 0;
let renderMs = 0;   // average time of one render (test hook __test.renderMs)
// power saving (tester blazar, iPhone 14: «через пару минут начинает нагреваться»): while nobody touches the screen the school is drawn
// 30 times a second, not 60 (a 120 Hz screen gets 60 while touched); creatures walk slowly, the eye does not see it, the phone stays cool
let inputAt = 0, drawnAt = 0; const fpsStat = { drawn: 0, skipped: 0 };
for (const ev of ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'keydown']) window.addEventListener(ev, () => { inputAt = window.__inputAt = performance.now(); }, { passive: true, capture: true });
window.addEventListener('scroll', () => { inputAt = performance.now(); }, { passive: true, capture: true });
function frame(now) {
  if (bootOn && bootFrame(now)) { requestAnimationFrame(frame); return; }   // loading screen (bootFrame)
  if (now - drawnAt < (now - inputAt > 1500 ? 28 : 12)) { fpsStat.skipped++; requestAnimationFrame(frame); return; }   // 'last' is not moved: the next frame lives through both
  drawnAt = now; fpsStat.drawn++;
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // the first frame after a reload can be stamped before 'last': a negative dt made 0/0 = NaN positions (frozen reception, report 2026-11-21)
  if (catchLeft > 0) catchUpSlice(dt); else stepWorld(dt, true);   // the time the game was closed is lived through first, a slice per frame
  stepIntros(dt);   // feature intros (2026-11-23)
  secT += dt; if (secT >= 1) { stepRates(secT); S.ema = S.ema * 0.97 + (earnedThisSec / secT) * 0.03; S.steadyEma = steadyRate() * 0.99 + Math.min(earnedThisSec / secT, 3 * steadyRate() + 1) * 0.01; S.paceEma = (S.paceEma ?? S.ema) * 0.997 + S.ema / boostK() * 0.003; earnedThisSec = 0; S.outEma = (S.outEma || 0) * 0.97 + (outThisSec / secT) * 0.03; outThisSec = 0; secT = 0; updateHud(); cloudHint(); topPush(); allyTick(); }
  panelT += dt; if (panel && !panel.still && (dirtyPanel || panelT > 1)) { panelT = 0; dirtyPanel = false; refreshPanel(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); cloudPush(); }
  if (!MG.isOpen()) { const t0 = performance.now(); render(); renderMs = renderMs * 0.95 + (performance.now() - t0) * 0.05; }
  warmRooms();
  requestAnimationFrame(frame);
}
const LAYOUT = window.__EDIT ? 16 : 15;   // 16: dorm pavilions in the wings, map moved 15 tiles right (2026-11-25)
const LAYOUT_15 = 15;   // 15: library on top of the right column, tower outside (build 252); 14: front row with gaps (build 250); 10: world 1 courtyard layout (build 229); 11: «круг к экзамену» (build 243); 12: library + garden moved (build 245); 13: tall walls + 4-tile gallery (build 248)
function relayout() {   // rebuild the map (a class was expanded): creatures keep their task, seats move with the rooms
  const snap = agents.length ? (save(), S.world) : null;
  genLayout(); buildGrid(); buildEdges(); decorateEdges();
  REC = SLOTS.REC; OFFICER = { x: REC.x0 + 0.75, y: REC.y0 + 3.3 };
  DS = SLOTS.DORM; DS2 = SLOTS.DORM2; CONCIERGE = WORLD === 1 && (window.__EDIT) ? { x: DS.x0 + 0.65, y: DS.y0 + 0.75 } : { x: DS.x0 - 0.55, y: DS.y0 + 1.1 }; dormSpots();
  LS = SLOTS.LIB; libSpots();
  computeBounds(); staticKey = ''; resize();
  if (snap) {
    agents = []; queue = []; processing = null; dormLine = []; checkin = null; CON2.line = []; CON2.cur = null; shopLine.length = 0; cantLine.length = 0; cantSeats.fill(null);
    deskOcc.forEach((a) => a.fill(null)); waitList.forEach((l) => (l.length = 0)); dorm.fill(null); lib.fill(null); courtList.length = 0;
    S.world = snap; restoreWorld(true);
  }
}   // bump when the map changes: old creature positions are dropped
function restoreWorld(teleport = false) {
  // a new map after an update: keep every creature and its task, just move it onto the new map (never restart the school)
  if (S.layout !== LAYOUT) { S.layout = LAYOUT; teleport = true; }
  const w = S.world; if (!w) return;
  arrivalT = w.arrivalT ?? 1; procT = 0;
  const byId = new Map();
  for (const o of w.agents) {
    if (o.goal && o.goal.t === 'tw') continue;   // walkers into the tower / back to a helper place / home from a retake are only for the eye (the record is already there): after a reload they froze in place (her screenshot 2026-11-22)
    const a = { ...o, z: 0, path: [], onArrive: null, flip: false, ph: Math.random() * 6 };
    const broken = !Number.isFinite(a.x) || !Number.isFinite(a.y);   // saves from builds <= 85 could hold NaN (saved as null) positions
    if (broken) { a.x = GATE_TILE.x; a.y = GATE_TILE.y; }
    if (teleport || broken || !regAt(Math.floor(a.x), Math.floor(a.y))) {   // put it next to where it was going
      const g = a.goal || {}, at = (p) => { a.x = p.x; a.y = p.y; };
      if ((g.t === 'c' || g.t === 's') && g.i >= 0 && slotOf(g.i)) { const [, h] = slotOf(g.i).door; at({ x: h[0] + 0.5, y: h[1] + 0.5 }); }
      else if ((g.t === 'd' || g.t === 'n') && a.bed >= 0 && DORM_SPOTS[a.bed]) at(DORM_SPOTS[a.bed]);
      else if (g.t === 'l' && a.seat >= 0 && LIB_SPOTS[a.seat]) at(LIB_SPOTS[a.seat]);
      else if (g.t === 'g') { const [, h] = SLOTS.EXAM.door; at({ x: h[0] + 0.5, y: h[1] - 1 }); }
      else if (g.t === 'k' && COURT) { const c = courtC(); at({ x: c.x + 3, y: c.y + 3 }); }
      else if (g.t === 'q' || a.state === 'queue' || a.state === 'process') at(queueSlot(0));
      else at(GATE_TILE);
    }
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
    if ((a.state === 'study' || a.state === 'done') && deskOcc[a.c][a.desk] === a.id) { if (teleport) { const p = seatPos(a.c, a.desk); a.x = p.x; a.y = p.y; } faceTeacher(a, a.c); continue; }
    if (queue.includes(a)) { goQueue(a); continue; }
    const wi = waitList.findIndex((l) => l.includes(a));
    if (wi >= 0) { if (teleport) { const p = waitSpot(wi, waitList[wi].indexOf(a)); a.x = p.x; a.y = p.y; } continue; }
    const g = a.goal || { t: 'c', i: nextClass(-1) };
    if (g.t === 'd') {
      const bed = (a.bed >= 0 && a.bed < DORM_CAP && bedExists(a.bed) && !dorm[a.bed]) ? a.bed : freeBed();
      if (bed >= 0 && a.state === 'sleep') { dorm[bed] = a; a.bed = bed; const p = DORM_SPOTS[bed]; a.x = p.x; a.y = p.y; continue; }
      if (bed >= 0) { goDorm(a, g.i, bed); continue; }
    }
    if (g.t === 'n') {   // dorm roles: a nap goes on in the same bed (or another free one), else straight on to the class
      const bed = (a.bed >= 0 && a.bed < DORM_CAP && bedExists(a.bed) && !dorm[a.bed]) ? a.bed : freeBed();
      if (bed >= 0) { dorm[bed] = a; a.bed = bed; if (a.state === 'nap') { const p = DORM_SPOTS[bed]; a.x = p.x; a.y = p.y; } else napToBed(a, 0); continue; }
      a.bed = -1; route(a, g.i); continue;
    }
    if (g.t === 'l') { const n = (a.seat >= 0 && a.seat < libSeats() && !lib[a.seat]) ? a.seat : libSeat(); if (n >= 0) { goLibrary(a, g.i, n, a.state === 'read' ? a.t : 0); continue; } a.prepared = true; route(a, g.i); continue; }
    if (g.t === 'x') { a.state = 'walk'; walk(a, GATE_TILE.x, GATE_TILE.y + 1, () => { a.gone = true; }); continue; }
    if (g.t === 'k') { if (courtRoom() && !g.brk) goCourt(a, g.i); else route(a, g.i); continue; }
    if (g.t === 'tw') continue;   // was walking into the masters' tower: already counted as a resident
    if (g.t === 'shop') { if (shopOpen() && SLOTS.SHOP) goShop(a, g.n); else route(a, g.n); continue; }
    if (g.t === 'cant') { if (cantOpen() && SLOTS.CANT) goCanteen(a, g.n); else route(a, g.n); continue; }
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
  ffwd = true; try { for (let t = 0; t < sec; t += stepDt) stepWorld(stepDt); } finally { ffwd = false; }
  popups.length = 0; earnedThisSec = 0;
  $('#fx').innerHTML = '';
  return S.coins - before;
}
// Catch-up in slices (boot speed 2026-11-23, her «Оптимизируй игру, долго при запуске прогружается мир»): the same steps as
// fastForward(), but in slices: at the start under the loading screen (bootFrame), after a return from the background a few
// dozen ms per frame with the world on screen. Before, the whole catch-up ran before the first frame (her save, 2 h away:
// 7-8.7 s of a blank screen at 4x CPU throttling). Same step size as before: a coarser step changes the economy (2 h on her
// save: 420M coins at 0.5 s, 308M at 1 s, 167M at 2 s). Real time that passes meanwhile is added to the rest.
var catchLeft = 0, catchDt = 0.25, catchAll = 0, catchAway = 0, catchGain = 0, catchBox = null, catchReal = 0, catchLeft0 = 0, catchOut = 0, catchExtra = 0, catchSimT = 0;   // build audit 2026-11-24: real time away (uncapped), leavers and refunds of the catch-up, time paid without living it through
const catchMs = () => Math.max(45, Math.min(250, 3 * renderMs));   // simulation time per frame: ~3/4 of the main thread, the picture still moves
// offline limit 4 h (Maria 2026-11-24): the first 2 h are lived through step by step as before; the rest is paid at the rate those 2 h
// earned (living through all 4 h held the loading screen ~1.7x longer: 9.4 s instead of 5.5 s on the PC, far more on a phone)
const CATCH_SIM = 2 * 3600;
function catchUp(sec) {
  const real = sec; sec = Math.min(OFFLINE_CAP_SEC, sec); if (sec < 1) return;
  if (catchLeft <= 0) { catchAll = 0; catchAway = 0; catchGain = 0; catchReal = 0; catchLeft0 = 0; catchOut = 0; catchExtra = 0; catchSimT = 0; }
  catchReal += real;
  const simAdd = Math.min(sec, Math.max(0, CATCH_SIM - catchLeft)); catchExtra = Math.min(OFFLINE_CAP_SEC - CATCH_SIM, catchExtra + sec - simAdd);
  catchLeft += simAdd; catchAway = Math.min(OFFLINE_CAP_SEC, catchAway + sec); catchAll = Math.max(catchAll, catchLeft);
  catchDt = catchLeft > 600 ? 0.5 : 0.25;
}
function catchUpSlice(dt, budget = catchMs()) {
  catchLeft += dt;   // the clock keeps going while we catch up
  const keep = popups.splice(0), fx = $('#fx'), fxN = fx.childElementCount, e0 = earnedThisSec, c0 = S.coins, t0 = performance.now();
  const l0 = leftNow(), p0 = S.stats.passed, f0 = S.stats.failed, er0 = S.stats.earned || 0, o0 = (S.stats.refunded || 0) + (S.stats.fined || 0);
  ffwd = true;
  try { while (catchLeft > 0 && performance.now() - t0 < budget) { stepWorld(catchDt); catchLeft -= catchDt; catchSimT += catchDt; } } finally { ffwd = false; }
  popups.length = 0; popups.push(...keep); earnedThisSec = e0; catchGain += S.coins - c0;
  catchLeft0 += leftNow() - l0; catchOut += (S.stats.refunded || 0) + (S.stats.fined || 0) - o0;
  { const c = S.insp && S.insp.cur; if (c) { if (c.v !== undefined) c.v += leftNow() - l0; if (c.p !== undefined) { c.p += S.stats.passed - p0; c.f += S.stats.failed - f0; } if (c.e !== undefined) c.e += (S.stats.earned || 0) - er0; } }   // build audit 2026-11-24: time away never counts into a running check   // as fastForward(): no flying coins or toasts from the past
  while (fx.childElementCount > fxN) fx.lastElementChild.remove();
  if (catchLeft > 0) {
    if (!catchBox && catchAll > 20 && !bootOn) { catchBox = document.createElement('div'); catchBox.className = 'catchup'; catchBox.style.cssText = 'position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:4;background:#fffaffee;color:#5a3fb0;font:700 13px ui-rounded,system-ui,sans-serif;padding:6px 12px;border-radius:14px;box-shadow:0 2px 8px #3a2f4a33;pointer-events:none;white-space:nowrap'; $('#stage').appendChild(catchBox); }
    const t = `⏳ Школа догоняет время: ${Math.min(99, Math.round(100 * (1 - catchLeft / catchAll)))}%`;
    if (catchBox && catchBox.dataset.t !== t) { catchBox.dataset.t = t; catchBox.textContent = t; }
    return;
  }
  catchLeft = 0; if (catchBox) { catchBox.remove(); catchBox = null; }
  if (catchExtra > 0 && catchSimT > 0 && catchGain > 0) { const x = Math.round(catchGain / catchSimT * catchExtra); S.coins += x; S.stats.earned = (S.stats.earned || 0) + x; catchGain += x; }   // the hours past the lived-through 2 h
  catchExtra = 0;
  updateHud(); dirtyPanel = true;
  if (panel || tourStep >= 0) { if (catchAway >= 60 && catchGain >= 1) toast(`🪙 +${fmt(catchGain)}: школа жила, пока тебя не было`); } else welcomeBack(catchReal, catchGain);   // never over an open panel or the tour
  save();
}
window.__catch = () => ({ left: catchLeft, all: catchAll, gain: catchGain });   // test hook
// Loading screen (her idea 2026-11-23: «экран загрузки что-то типа «летим в школу»»): index.html shows #boot at once; under it
// the time the game was closed is lived through at full speed (the world is not drawn meanwhile) and the pictures of the map,
// the staff and the creatures come in (court poses, outfits and teacher poses keep loading afterwards); the map is baked under
// the curtain, then it fades out and the school is there whole, without pictures popping in.
var bootOn = !!document.getElementById('boot'), bootT0 = 0, bootImgs = null, bootDrawn = 0, bootShown = 0.04, bootG0 = -1, bootAway = false;
const BOOT_MAX_MS = 9000;   // a slow network never holds the player longer: the rest of the pictures pop in as before
function bootFrame(now) {
  const dt = Math.max(0, Math.min(1, (now - last) / 1000)); last = now; if (!bootT0) bootT0 = now;
  if (!bootImgs) bootImgs = [...Object.values(parts), ...Object.values(arts), ...Object.entries(sprites).filter(([k]) => k.startsWith('staff_') || SPECIES.includes(k.replace(/_back$/, ''))).map(([, im]) => im)].filter((im) => im && im.src);
  if (bootG0 < 0) bootG0 = S.stats.graduated;   // graduates before the catch-up (counters below)
  if (catchLeft > 0) catchUpSlice(dt, 220);
  const imgP = bootImgs.length ? bootImgs.filter((im) => im.complete).length / bootImgs.length : 1, cuP = catchAll ? 1 - catchLeft / catchAll : 1;
  // the bar never stalls: it follows the real progress and creeps on by itself meanwhile (never past 95% before the end); transform = smooth while busy
  const real = 0.04 + 0.96 * (catchAll ? (cuP + imgP) / 2 : imgP); bootShown = Math.min(Math.max(real, bootShown + 0.006 * Math.min(4, dt * 60)), catchLeft > 0 || imgP < 1 ? 0.95 : 1);
  const bar = document.getElementById('boot-bar'); if (bar) bar.style.transform = `scaleX(${bootShown.toFixed(3)})`;
  if (catchAll >= 60) {   // «while you were away»: live counters of what the school did meanwhile
    if (!bootAway) { bootAway = true; const m = Math.round(catchReal / 60), box = document.getElementById('boot-away'); if (box) box.style.display = ''; const t = document.getElementById('boot-time'); if (t) t.textContent = (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`) + (catchReal > OFFLINE_CAP_SEC + 60 ? ` (школа работает без тебя до ${OFFLINE_CAP_SEC / 3600} ч)` : ''); }
    const c = document.getElementById('boot-coins'), gr = document.getElementById('boot-grads');
    if (c) c.textContent = fmt(Math.max(0, catchGain)); if (gr) gr.textContent = fmt(S.stats.graduated - bootG0);
  }
  if (catchLeft > 0 || (imgP < 1 && now - bootT0 < BOOT_MAX_MS)) return true;
  if (bootDrawn < 2) { render(); bootDrawn++; if (bar) bar.style.transform = 'scaleX(1)'; return true; }   // the map is baked under the curtain
  bootOn = false; window.__ready = performance.now(); glog('app', `запуск игры, сборка ${BUILD}, мир ${WORLD}`, WORLD);
  const el = document.getElementById('boot'); if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; setTimeout(() => el.remove(), 450); }
  return false;
}
function welcomeBack(sec, gain) {   // build audit 2026-11-24: the real time away, the 4 h limit said plainly, losses shown too
  glog('app', `возвращение: не было ${Math.round(sec / 60)} мин, заработано ${fmt(gain || 0)}`, WORLD);
  if (sec < 60 || (gain < 1 && catchLeft0 < 1)) return;
  const hm = (m) => (m >= 60 ? Math.floor(m / 60) + ' ч ' : '') + (m % 60) + ' мин', mins = Math.round(sec / 60), capH = OFFLINE_CAP_SEC / 3600, over = sec > OFFLINE_CAP_SEC + 60;
  const lost = catchLeft0 >= 1 ? `<p class="center muted">😢 Ушли расстроенными: ${fmt(catchLeft0)}${catchOut >= 1 ? `, им вернули 🪙 ${fmt(catchOut)}` : ''}. Чтобы уходило меньше — больше мест в классах и спальне.</p>` : '';
  openPanel(() => `<div class="sh-head"><h2>С возвращением!</h2><button class="x" data-close>✕</button></div>
    <p class="center">Тебя не было ${hm(mins)}. ${over ? `Без тебя школа работает до ${capH} ч — столько и засчитано.` : 'Школа жила своей жизнью.'}</p>
    <div class="center big-txt">🪙 ${gain >= 0 ? '+' : '−'}${fmt(Math.abs(gain))}</div>${lost}<button class="btn wide" data-close>Ура!</button>`);
}
// ======================= incident sounds (build 256, her wish «во время происшествий проигрывать звуковой эффект ... тематический,
// нераздражающий») =======================
// Made by the browser itself (Web Audio), no files: short (under 1.5 s), soft (quiet master, low-pass at 4.5 kHz, slow attacks),
// one sound per kind of incident. On/off in settings (localStorage magicschool.sfx); only while the game is on screen.
const SFX_KEY = 'magicschool.sfx';
// Silent in tests (build 314, her «Периодически на Montenegro-PC начинает играть музыка игры. Не допускай этого»): Claude sessions open the game
// in background browsers on the PC; on a local test server (localhost / LAN) or in an automated browser there is never any sound,
// unless the URL asks for it with ?sound=1. Players on the real site are not affected.
const QUIET = !/[?&]sound=1/.test(location.search) && (!!navigator.webdriver || /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|\[::1\])/.test(location.hostname));
const sfxOn = () => !QUIET && localStorage.getItem(SFX_KEY) !== '0';
let AC = null, AOUT = null, NOISE = null, BUS = null;
function audio() {   // created on the first touch (phones allow sound only after one)
  if (QUIET) return null;
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500;
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    AOUT = AC.createGain(); AOUT.gain.value = 0.32; AOUT.connect(lp); lp.connect(comp); comp.connect(AC.destination);
    NOISE = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
}
document.addEventListener('pointerdown', () => { if (sfxOn()) audio(); }, { passive: true });
function env(g, t0, a, d, v) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
function tone(t0, f0, f1, dur, v, type = 'sine', a = 0.02) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  env(g, t0, a, dur, v); o.connect(g); g.connect(BUS || AOUT); o.start(t0); o.stop(t0 + a + dur + 0.05);
}
function hiss(t0, dur, v, type, f0, f1, q = 1, a = 0.03) {   // filtered noise
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = NOISE;
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + a + dur);
  env(g, t0, a, dur, v); s.connect(f); f.connect(g); g.connect(BUS || AOUT); s.start(t0, Math.random()); s.stop(t0 + a + dur + 0.05);
}
// loudness per sound (dB), measured on rendered copies: every peak near -14 dB, the chime of a fix a little quieter (-18)
const SFX_DB = { potions: 3.5, charms: 10.5, elements: 12, flight: 15, herbs: 12.5, stars: 16.5, final: 16.5, sneeze: 12, fixed: 10 };
const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
const SFX = {   // build 259 (her «Звуки слишком короткие»): every sound 2-3 s with a soft tail
  potions(t) { tone(t, 150, 55, 0.5, 0.5, 'sine', 0.01); hiss(t, 0.9, 0.35, 'lowpass', 1400, 160, 0.7, 0.01);   // a soft «poof» of the cauldron
    for (let k = 0; k < 12; k++) { const u = k / 12; tone(t + 0.35 + u * 1.9 + Math.random() * 0.06, 300 + Math.random() * 280, 650 + Math.random() * 350, 0.07, 0.13 * (1 - 0.6 * u)); } },   // then bubbling that calms down
  charms(t) { for (let k = 0; k < 16; k++) { const u = k / 16, f = PENTA[1 + Math.floor(Math.random() * 8)]; tone(t + u * 1.7 + Math.random() * 0.05, f, f * 1.01, 0.7, 0.09 * (1 - 0.5 * u), 'triangle', 0.005); }   // sparkles scattering
    tone(t, 760, 300, 1.6, 0.08, 'sine', 0.08); tone(t + 0.4, 520, 260, 1.4, 0.05, 'sine', 0.1); },   // a magic «wooo» sliding down twice
  elements(t) { hiss(t, 1.4, 0.25, 'bandpass', 300, 1200, 0.8, 0.25); hiss(t + 0.9, 1.4, 0.18, 'bandpass', 700, 300, 0.8, 0.3);   // the flame flares up and dies down
    for (let k = 0; k < 22; k++) hiss(t + 0.1 + Math.random() * 2.2, 0.025, 0.12, 'highpass', 1800, 1800, 0.7, 0.003); },   // crackles
  flight(t) { hiss(t, 1.5, 0.22, 'bandpass', 400, 2000, 1.2, 0.35); tone(t + 0.05, 330, 990, 1.4, 0.07, 'sine', 0.2);   // an airy whoosh upwards
    for (let k = 0; k < 6; k++) hiss(t + 1.2 + k * 0.17, 0.09, 0.12, 'bandpass', 1500, 1300, 2, 0.02); },   // and wings fluttering under the ceiling
  herbs(t) { hiss(t, 1.0, 0.16, 'bandpass', 2400, 1600, 1.5, 0.2); hiss(t + 0.9, 1.2, 0.14, 'bandpass', 2000, 1400, 1.5, 0.25);   // leaves rustling in two waves
    [196, 247, 294, 330].forEach((f, k) => tone(t + 0.2 + k * 0.42, f, f * 1.12, 0.6, 0.1, 'triangle', 0.04)); },   // something growing, note by note
  stars(t) { hiss(t, 1.6, 0.3, 'lowpass', 650, 160, 0.8, 0.35); hiss(t + 0.3, 1.2, 0.2, 'bandpass', 380, 200, 0.9, 0.3);   // a far, soft thunder (above 150 Hz: phone speakers play nothing lower)
    hiss(t + 1.4, 1.3, 0.22, 'lowpass', 500, 150, 0.8, 0.3); },   // and a second roll
  final(t) { for (let k = 0; k < 18; k++) { const u = k / 18; hiss(t + u * 2.0 + Math.random() * 0.05, 0.08, 0.14 * (1 - 0.5 * u), 'bandpass', 3200, 2600, 1.2, 0.01); }   // papers fluttering down
    hiss(t, 1.6, 0.06, 'bandpass', 900, 1500, 0.7, 0.4); },   // and the air they stir
  sneeze(t) { tone(t, 260, 360, 0.45, 0.06, 'sine', 0.15); tone(t + 0.55, 300, 440, 0.45, 0.07, 'sine', 0.15);   // «ah… ah…»
    hiss(t + 1.1, 0.3, 0.24, 'bandpass', 2200, 1200, 1, 0.01);   // «choo!»
    hiss(t + 1.9, 0.18, 0.08, 'bandpass', 1400, 1800, 1.5, 0.05); hiss(t + 2.2, 0.18, 0.07, 'bandpass', 1400, 1800, 1.5, 0.05); },   // a little sniff-sniff
  fixed(t) { [784, 988, 1175, 1568].forEach((f, k) => tone(t + k * 0.12, f, f, 0.9, 0.07, 'triangle', 0.005));   // a chime: all is well again
    for (let k = 0; k < 6; k++) { const f = PENTA[4 + Math.floor(Math.random() * 5)]; tone(t + 0.6 + k * 0.15, f, f, 0.6, 0.03, 'sine', 0.01); } },   // with a soft shimmer
};
function sfx(name) {
  if (!sfxOn() || document.hidden || ffwd || !SFX[name]) return;
  const c = audio(); if (!c || c.state !== 'running') return;
  try { BUS = c.createGain(); BUS.gain.value = Math.pow(10, (SFX_DB[name] || 0) / 20); BUS.connect(AOUT); SFX[name](c.currentTime + 0.02); } catch (e) { /* never break the game for a sound */ } finally { BUS = null; }
}
const incSound = (i) => (S.inc && S.inc[i] && S.inc[i].k === 'g' ? 'sneeze' : SFX[CLASSES[i].id] ? CLASSES[i].id : 'charms');
function setSfx(on) { localStorage.setItem(SFX_KEY, on ? '1' : '0'); if (on) { audio(); setTimeout(() => sfx('fixed'), 60); } toast(on ? '🔔 Звуки включены' : '🔕 Звуки выключены'); }
window.__sfx = sfx;   // test hook
// ======================= background music (her wish 2026-11-21; Suno via SYNTX) =======================
// Plays quietly in a loop over the playlist; starts on the first tap (phones allow sound only after a touch),
// pauses while the game is in the background; on/off in settings (localStorage magicschool.music).
const MUSIC = WORLD === 2 ? ['assets/music/dwarf.mp3?v=1', 'assets/music/dwarf-2.mp3?v=1'] : ['assets/music/cozy.mp3?v=1', 'assets/music/cozy-2.mp3?v=1'];   // world 2: dwarven hall music (Suno via SYNTX)
const music = new Audio(); music.volume = 0.35; music.preload = 'none';
let musicIdx = 0;
const musicOn = () => !QUIET && localStorage.getItem('magicschool.music') !== '0';
music.addEventListener('ended', () => { musicIdx = (musicIdx + 1) % MUSIC.length; music.src = MUSIC[musicIdx]; musicStart(); });
function musicStart() { if (!musicOn() || document.hidden || window.__bookMusicOn) return; if (!music.src) music.src = MUSIC[musicIdx]; if (music.paused) music.play().catch(() => {}); }
document.addEventListener('pointerdown', () => { if (music.paused) musicStart(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else musicStart(); });
function setMusic(on) { localStorage.setItem('magicschool.music', on ? '1' : '0'); if (on) musicStart(); else music.pause(); toast(on ? '🎵 Музыка включена' : '🔇 Музыка выключена'); }
// a newer build on the server reloads the game by itself (on start and every time it comes back to the screen)
async function checkUpdate() {
  if (bootOn || catchLeft > 0 || panel) { setTimeout(checkUpdate, 3000); return; }   // never reload in the middle of the catch-up or over an open window such as the welcome (tester №0b9ldbcf)
  try {
    const t = await (await fetch('index.html?nc=' + Date.now(), { cache: 'no-store' })).text();
    const m = t.match(/game\.js\?v=(\d+)/); const v = m ? +m[1] : 0;
    if (v > BUILD && sessionStorage.getItem('magicschool.reloadedFor') !== String(v)) { sessionStorage.setItem('magicschool.reloadedFor', String(v)); if (S) save(); location.reload(); }
  } catch (e) { /* offline */ }
}
setTimeout(checkUpdate, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (S) save(); cloudPush(true); return; }
  const h0 = hiddenAt; hiddenAt = 0;
  (window.__clockSync ? window.__clockSync() : Promise.resolve()).then(() => {   // build audit 2026-11-24: a clock moved meanwhile is corrected first
    if (document.hidden) return; const away = h0 ? Math.max(0, (Date.now() - h0) / 1000) : 0;
    catchUp(away); last = performance.now(); save();
    cloudPull();   // maybe it was played on another device meanwhile
  });
});
window.addEventListener('pagehide', () => { if (S) save(); });
// build audit 2026-11-24: two tabs of the game overwrote each other's save every 5 s. The newest tab plays; an older one stops saving
// and says so (button: play here = reload, which in turn stops the other).
try { if (!EDIT) { const bc = new BroadcastChannel('magicschool.tab'), me = Math.random(); bc.onmessage = (e) => { if (!e.data || e.data.id === me || e.data.w !== WORLD) return;
  noSave = true; if (document.getElementById('dup-tab')) return; const d = document.createElement('div'); d.id = 'dup-tab';
  d.style.cssText = 'position:fixed;inset:0;z-index:99;background:#2a1f3dcc;display:flex;align-items:center;justify-content:center;padding:24px;font:600 17px ui-rounded,system-ui,sans-serif;color:#fff;text-align:center';
  d.innerHTML = '<div style="background:#fffaff;color:#3a2f4a;border-radius:18px;padding:20px 18px;max-width:320px">Игра открыта в другом окне — играть можно только в одном, чтобы прогресс не потерялся.<br><br><button class="btn wide" id="dup-here">Играть здесь</button></div>';
  document.body.appendChild(d); document.getElementById('dup-here').onclick = () => location.reload(); }; bc.postMessage({ id: me, w: WORLD }); } } catch (e) { /* no BroadcastChannel */ }
window.addEventListener('resize', resize);

preloadEmoji();
watchEmoji();
load();
relayout();   // the map depends on the saved class sizes
// world 2 compensation, once (her report 2026-11-22): until build 231 every student who left took 300% of the fee back;
// the fair refund is 100%, so the extra 200% (2/3 of all refunds so far) goes back to the player
if (WORLD === 2 && !S.w2fix) { S.w2fix = 1; const back = Math.round((S.stats.refunded || 0) * 2 / 3); if (back > 0) { S.coins += back; setTimeout(() => toast(`🪙 +${fmt(back)}: вернули лишнее, что ушло ученикам`), 2500); } }
if (location.hash.startsWith('#coins=') && /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname)) { S.coins = +location.hash.slice(7) || S.coins; history.replaceState(null, '', location.pathname); } // test hook
// pacing simulation hook (tools/sim_run.js drives it in a test browser; not used by the game itself)
let simSecT = 0;
window.__sim = {
  step: (dt, live) => {   // build audit 2026-11-24: S.ema / S.steadyEma / S.paceEma move per simulated second exactly like frame() (keep in sync), so the pace floor is exercised; live === false = offline catch-up, its income is not counted (as catchUpSlice)
    const e0 = earnedThisSec; stepWorld(dt);
    if (live === false) { earnedThisSec = e0; return; }
    simSecT += dt; if (simSecT < 1) return;
    stepRates(simSecT); S.ema = S.ema * 0.97 + (earnedThisSec / simSecT) * 0.03; S.steadyEma = steadyRate() * 0.99 + Math.min(earnedThisSec / simSecT, 3 * steadyRate() + 1) * 0.01; S.paceEma = (S.paceEma ?? S.ema) * 0.997 + S.ema / boostK() * 0.003; earnedThisSec = 0; simSecT = 0;
  },
  bal: (o) => Object.assign(BAL, BAL_NEW, o || {}),
  get S() { return S; },
  addStar: () => { insp().stars = (insp().stars || 0) + 1; },
  options() {
    const o = [], add = (act, cost, x = {}) => o.push({ act, cost, ...x });
    CLASSES.forEach((C, i) => {
      const st = S.classes[i];
      if (!st.built) { add('build', buildCost(i), { i, stars: starsNeed(i) }); return; }
      if (!isOpen(i)) return;
      if (st.teacher < MAX_TEACHER_LEVEL) add('teacher', teacherCost(i), { i });
      if (st.desks < maxDesksOf(i)) add('desk', deskCost(i), { i });
      if (!C.final && sizeOf(i) < MAX_SIZE) add('expand', expandCost(i), { i });
      if (st.time < MAX_TIME_LEVEL) add('time', timeCost(i), { i });
      C.items.forEach((it, k) => { if (st.items[k] < MAX_ITEM_LEVEL) add('item', itemCost(i, k), { i, k }); });
      if (RANK_AT(i) && exLvl(i) < MAX_EX_LVL) add('exlvl', exCost(i), { i });
      if (RANK_AT(i) && xplLvl(i) < MAX_XPL_LVL) add('xpllvl', xplCost(i), { i });
    });
    if (S.reception.level < MAX_REC_LVL) add('rec', recCost());
    if (S.reception.ads < MAX_REC_LVL && !adsFull()) add('ads', adsCost());
    if (bedCount() < maxBeds()) add('beds', bedsCost());
    if (!dorm2Built()) add('dorm2', DORM2_COST);
    [1, 2].forEach((k) => { if ((k === 1 || dorm2Built()) && dormSize(k) < 3) add('dormexp', dormExpandCost(k), { k }); });
    if (dormUp().conc < MAX_CONC) add('conc', concCost());
    if (libSeats() < MAX_LIB_SEATS) add('libseats', libSeatsCost());
    if (libUp().speed < MAX_LIB_LVL) add('libspeed', libSpeedCost());
    if (libUp().bonus < MAX_LIB_LVL) add('libbonus', libBonusCost());
    if (WORLD === 1) {
      if (!cantBuilt()) { if (isOpen(CANT_NEED)) add('cantbuild', CANT_COST); } else if (cantOpen()) Object.keys(CANT_MAX).forEach((k) => { if (cantUp()[k] < CANT_MAX[k]) add('cantup', cantCost(k), { k }); });
      if (!shopOpen()) add('shopbuild', SHOP_COST); else ['seller', 'shelves', 'goods'].forEach((k) => { if (shopUp()[k] < SHOP_MAX) add('shopup', shopCost(k), { k }); });
      if (!towerOpen()) { if (isOpen(NCLS - 1)) add('towerbuild', towerCost()); } else if (towerUp().cap < TOWER_MAXUP) add('towercap', towerCapCost());
      if (!dirBuilt()) add('dirbuild', DIR_COST, { stars: DIR_STARS }); else Object.keys(DIR_UP).forEach((k) => { if (dirLvl(k) < DIR_UP[k].max) add('dir', dirCost(k), { k }); });
      if (COURT) { const u = courtUp(); if (u.bench < MAX_BENCH) add('cbench', benchCost()); if (u.fount < MAX_FOUNT) add('cfount', fountCost()); if (u.coin < MAX_COIN) add('ccoin', coinCost()); }   // build audit 2026-11-24: the court was not in the pacing sim
    }
    if (WORLD === 2) {   // pacing sim: the ore store and the trading yard
      // build audit 2026-11-24: the world-2 bot never paid for the feature buildings, so its pacing was too fast
      if (!shopOpen() && !(S.shop && S.shop.built)) add('shopbuild', SHOP_COST);
      if (!cantBuilt() && isOpen(CANT_NEED)) add('cantbuild', CANT_COST);
      if (!(S.tower && S.tower.built) && isOpen(NCLS - 1)) add('towerbuild', towerCost());
      if (!throne().built && guardsIdx() >= 0 && isOpen(guardsIdx())) add('thronebuild', THRONE_COST);
      { const gi = CLASSES.findIndex((c) => c.id === EXPED_NEED); if (!exped().built && gi >= 0 && isOpen(gi)) add('expedbuild', EXPED_COST); }
      if (W2().store < MAX_STORE && CLASSES.some((c, i) => c.id === 'mine' && isOpen(i))) add('store', storeCost());
      if (!trade().built) { const fi = CLASSES.findIndex((c) => c.id === 'forge'); if (fi >= 0 && isOpen(fi)) add('tradebuild', TRADE_COST); } else ['wagon', 'road', 'price'].forEach((k) => { if (trade()[k] < MAX_TUP) add('tup', tupCost(k), { k }); });
    }
    FORM_KEYS.forEach((k) => { if (formReady(k)) add('formlvl', formCost(k), { k }); });
    return o;
  },
  buy(op) { const b = document.createElement('button'); b.dataset.act = op.act; if (op.i !== undefined) b.dataset.i = op.i; if (op.k !== undefined) b.dataset.k = op.k; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); },
  stars: () => schoolStars(),
  inSchool: () => inSchool().length,
};
window.__pukh = () => { pukhNext = 0; }; window.__starfall = () => { sfNext = 0; };   // test hook: send Pukh now
window.__test = { P, SLOTS, focusTile, fps: () => ({ ...fpsStat, dpr }), edges: (x0, y0, x1, y1) => EDGES.filter((e) => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1).map((e) => `${e.x},${e.y},${e.side},${e.id},${e.tall ? 'T' : 'k'}${e.hallWall ? 'H' : ''}`), vanishDemo: (t) => { const g = SLOTS.GARDEN, src = agents.find((a) => SPECIES.includes(a.sp)); if (!src) return 0; agents.push({ ...src, id: S.nextId++, x: g.x0 + (WORLD === 1 ? 3 : 4.85), y: g.y0 + (WORLD === 1 ? 3 : 1.35), path: [], state: 'vanish', t: t || 0, goal: { t: 'g' }, c: -1, desk: -1 }); return 1; }, reg: (x, y) => regAt(x, y), world: () => ({ WW, WH, GW, GH, MARGIN, SW, SH, HW, HH, GATE: GATE_TILE, GATE_Y, BUILDING }), get renderMs() { return renderMs; }, get staticN() { return staticN; }, get roomBuilds() { return roomBuilds; }, bgOff: (v) => { BG_OFF = !!v; }, get outdoorN() { return OUTDOOR.length; }, outShN: () => Object.keys(outSh).length + '/' + Object.keys(outLo).length, outOn: (v) => { OUT_ON = !!v; }, grassOn: (v) => { GRASS_ON = !!v; staticKey = ''; }, fxDemo: (v) => { FX_DEMO = !!v; }, seal: (i, d) => examSeal(i, d), zoomAt: (z, x, y) => { setZoom(z, 0, 0, 0, 0); focusTile(x, y, false); }, libDbg: () => ({ trip: libTrip, u: libU }), secDbg: () => ({ pose: secretaryPos.lastPose, trip: secTrip, u: secU, w: !!(processing || queue.some((q) => q.state === "queue")), hold: secHold }), get secPose() { return secretaryPos.lastPose; }, get secU() { return secU; }, holdArrivals: () => { arrivalT = 1e9; }, state: (f) => f(S), inspNow: (sec) => { insp().t = sec; }, avgMood: () => avgMood(), incident: (i) => { S.inc ||= {}; S.inc[i] = { k: "c", t: 0 }; }, get inc() { return S.inc; }, openRoom: (id) => openRoom(id), get agents() { return agents; }, get scale() { return scale; }, dbg: () => CLASSES.map((c, i) => ({ c: c.id, open: isOpen(i), desks: S.classes[i].desks, seated: deskOcc[i].filter(Boolean).length, waiting: waitList[i].length, walking: lineCount(i) - waitList[i].length, sleepers: dorm.filter((a) => a && a.goal && a.goal.i === i).length, sleepState: dorm.filter((a) => a && a.goal && a.goal.i === i).map((a) => a.state).join(',') })) };   // test hook: world -> screen
resize();
{ const h = P((SLOTS.REC.x0 + SLOTS.REC.x1) / 2, SLOTS.REC.y0 + 1); scroller.scrollLeft = h.x * scale - scroller.clientWidth / 2; scroller.scrollTop = h.y * scale - scroller.clientHeight * 0.5; }
{ const away = (Date.now() - (S.last || Date.now())) / 1000, pd = S.catchPend; delete S.catchPend; restoreWorld(); catchUp(away);
  if (pd && catchLeft > 0 && away >= pd.rest - 5) { const more = Math.max(0, away - pd.rest);   // resume the catch-up a reload cut short: same split, same total, the real time away
    catchLeft = Math.min(CATCH_SIM, pd.left + more); catchExtra = Math.min(OFFLINE_CAP_SEC - CATCH_SIM, pd.extra + Math.max(0, pd.left + more - catchLeft)); catchAll = catchLeft; catchDt = catchLeft > 600 ? 0.5 : 0.25;
    catchReal = pd.real + more; catchGain = pd.gain; catchSimT = pd.simT; } }   // lived through under the loading screen (bootFrame)
updateHud();
if (!S.tourDone && WORLD <= 2) setTimeout(() => { closePanel(); showTour(0); }, 600);   // world 2 has its own tour since 2026-11-23
requestAnimationFrame(frame);
window.__booted = true;   // the boot watchdog in index.html stays quiet
if (localStorage.getItem('magicschool.forcePush')) { localStorage.removeItem('magicschool.forcePush'); cloudForce(); } else if (cloudCode()) cloudPull(); else cloudAuto();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});   // always look for a new service worker
// the update() above, made while the start is still loading, never settled in tests (2026-11-23: a new sw.js stayed uninstalled
// for good); ask again a little later and every time the game comes back to the screen
const swUpdate = () => { try { navigator.serviceWorker?.getRegistration().then((r) => r && r.update()).catch(() => {}); } catch (e) { /* no service worker */ } };
setTimeout(swUpdate, 8000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) swUpdate(); });
if (EDIT) {   // room editor: js/editor.js gets the game's room tools
  window.__EDIT_API = { EDIT, S, SLOTS, CLASSES, CLASS_SLOT, THEMES, DECOR, parts, P, up, HW, HH, TALL_H, slotOf, sizeOf, focusTile, setZoom,
    get zoom() { return zoom; }, get scale() { return scale; }, get dpr() { return dpr; }, scroller, canvas,
    get layout() { return RLAY; }, setLayout, entries: () => LAY_ENT.slice(), walls: (th) => (LAY_WALLS[th] || []).slice(), layPos, layIm, texPart, thumb: (n, th) => { const im = n && (ITEM_IMS[n] || parts[th + '/' + n] || parts[th + '/iso_' + n] || LAY_IMS[n]); return im ? im.src : ''; },
    zoomAt: (z, x, y) => { setZoom(z, 0, 0, 0, 0); focusTile(x, y, false); } };
  import('./editor.js?v=531').then((m) => m.initEditor(window.__EDIT_API)).catch((e) => { console.error(e); alert('Редактор не загрузился: ' + e.message); });
}
