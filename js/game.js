// Magic school idle tycoon — v0.3: isometric campus with walking creatures.
import {
  OFFLINE_CAP_SEC, MAX_DESKS, MAX_ITEM_LEVEL, MAX_TEACHER_LEVEL, MAX_TIME_LEVEL,
  CLASSES, SPECIES, NAMES, MISSIONS, WORLDS, WORLD, META,
} from './data.js?v=114';
import { EMOJI_RE, emojiImage, preloadEmoji, watchEmoji, emojiHtml } from './emoji.js?v=114';

const SAVE_KEY = WORLD === 1 ? 'magicschool.save.v2' : 'magicschool.save.v2.w' + WORLD;   // every world keeps its own save
const saveKeyOf = (w) => (w === 1 ? 'magicschool.save.v2' : 'magicschool.save.v2.w' + w);
const VERSION = '0.9';
const BUILD = 114;   // keep equal to the ?v= number in index.html
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
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { S = JSON.parse(raw); migrate(); return; } } catch (e) { /* fresh */ }
  freshState();
}
let noSave = false;
function save() {
  if (noSave || !S) return;
  S.last = Date.now();
  S.world = {   // creatures and their progress, so the school keeps living across reloads
    arrivalT, procT,
    queue: queue.map((a) => a.id),
    wait: waitList.map((l) => l.map((a) => a.id)),
    agents: agents.filter((a) => a.state !== 'fly').map((a) => ({ id: a.id, sp: a.sp, name: a.name, x: a.x, y: a.y, speed: a.speed, state: a.state, c: a.c, desk: a.desk, bed: a.bed, seat: a.seat, prepared: a.prepared, t: a.t, dur: a.dur, goal: a.goal, since: a.since, woke: a.woke, mood: a.mood, paid: a.paid })),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
}

const cls = (id) => S.classes[CLASSES.findIndex((c) => c.id === id)];
const isOpen = (i) => S.classes[i].built && Date.now() >= S.classes[i].buildEnd;
const kindSum = (i, kind) => CLASSES[i].items.reduce((a, it, k) => a + (it.kind === kind ? S.classes[i].items[k] : 0), 0);
const rawSuccess = (i) => 0.6 + 0.015 * (S.classes[i].teacher - 1) + 0.01 * kindSum(i, 'success');
const MAX_CHANCE = 0.85;   // even the best class fails sometimes: the library always has work
const success = (i) => Math.min(MAX_CHANCE, rawSuccess(i));
const overflow = (i) => Math.max(0, rawSuccess(i) - MAX_CHANCE);   // chance above the cap is not wasted: each 1% gives +2% tuition
const tuition = (i) => Math.round(CLASSES[i].tuition * (1 + 0.08 * kindSum(i, 'tuition')) * (1 + 0.05 * (S.classes[i].teacher - 1)) * (1 + 2 * overflow(i)) * (1 + 0.03 * schoolStars()));   // every school star: +3% to every lesson
const lessonTime = (i) => CLASSES[i].lesson * Math.pow(0.92, S.classes[i].time);
const itemCost = (i, k) => Math.round(CLASSES[i].tuition * 2 * (1 + k) * Math.pow(1.25, S.classes[i].items[k]));
const teacherCost = (i) => Math.round(CLASSES[i].tuition * 6 * Math.pow(1.35, S.classes[i].teacher - 1));
const expandCost = (i) => Math.round(CLASSES[i].tuition * 120 * Math.pow(3, sizeOf(i) - 1));
const deskCost = (i) => Math.round(CLASSES[i].tuition * 15 * Math.pow(CLASSES[i].final ? 1.6 : 2.3, S.classes[i].desks - 2));   // exam desks grow slower: there are 21 of them
const timeCost = (i) => Math.round(CLASSES[i].tuition * 10 * Math.pow(1.6, S.classes[i].time));
const MAX_REC_LVL = 40;   // both reception upgrades stop at level 40
const recLvl = () => Math.min(MAX_REC_LVL, S.reception.level), adsLvl = () => Math.min(MAX_REC_LVL, S.reception.ads);
const procTime = () => 3.5 * Math.pow(0.92, recLvl() - 1);
// entry fee: grows with the school (half the lesson price of the most expensive open class); upset leavers get it back x refundRate()
const fee = () => { let mx = 0; for (let i = 0; i < CLASSES.length; i++) if (!CLASSES[i].final && isOpen(i)) mx = Math.max(mx, tuition(i)); return Math.max(3 + recLvl(), Math.round(mx * 0.5)); };
const arrivalInterval = () => 5 * Math.pow(0.9, adsLvl() - 1);
const recCost = () => Math.round(20 * Math.pow(1.4, S.reception.level - 1));
const adsCost = () => Math.round(30 * Math.pow(1.45, S.reception.ads - 1));

// ======================= director's office (Ruslan's idea, Maria's choices 2026-11-21) =======================
const DIR_UP = {
  refund: { emo: '💸', name: 'Правила возврата', max: 8, base: 1000000, k: 2.0, desc: (l) => `ушедшим возвращаем ${Math.round(refundRateAt(l) * 100)}% взноса` },
  care: { emo: '💗', name: 'Забота об учениках', max: 10, base: 500000, k: 1.9, desc: (l) => `в очередях грустят на ${Math.round((1 - careK(l)) * 100)}% медленнее` },
  keeper: { emo: '🧹', name: 'Дежурный завхоз', max: 10, base: 750000, k: 1.9, desc: (l) => `происшествия реже на ${Math.round(l * 10)}%, сами проходят за ${Math.round(INC_AUTO_AT(l) / 60)} мин` },
  ties: { emo: '🤝', name: 'Связи с инспекцией', max: 10, base: 500000, k: 1.9, desc: (l) => `награда за проверку +${l * 10}%, штраф −${l * 7}%` },
};
const DIR_COST = 50000, DIR_STARS = 2;
const dirBuilt = () => !!(S && S.dirBuilt);
const dirLvl = (k) => (S && S.dir && S.dir[k]) || 0;
const dirCost = (k) => Math.round(DIR_UP[k].base * Math.pow(DIR_UP[k].k, dirLvl(k)));
const refundRateAt = (l) => 3 - 0.25 * l;                 // 300% -> 100%
const refundRate = () => refundRateAt(dirLvl('refund'));
const careK = (l) => 1 - 0.06 * l;                         // mood drop x1 -> x0.4
const INC_AUTO_AT = (l) => 600 * (1 - 0.07 * l);           // 10 min -> 3 min
const G = { // helpers exposed to missions
  get S() { return S; }, cls, built: (id) => { const i = CLASSES.findIndex((c) => c.id === id); return isOpen(i); },
  item: (cid, iid) => { const i = CLASSES.findIndex((c) => c.id === cid); return S.classes[i].items[CLASSES[i].items.findIndex((x) => x.id === iid)]; },
  maxItem: () => Math.max(...S.classes.flatMap((c) => c.items)),
};

function earn(n, x, y, color, lift) { S.coins += n; S.stats.earned = (S.stats.earned || 0) + n; earnedThisSec += n; if (x !== undefined) popup(`+${fmt(n)}`, x, y, color || '#c98a00', lift); }
function spend(c) { if (S.coins < c) { toast('Не хватает монет 🪙'); return false; } S.coins -= c; return true; }

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
let HALLS = [], BUILDING = { x0: 7, y0: 0, x1: 22, y1: 0 }, OUTER_WALLS = [], GATE_TILE = { x: 14.5, y: 0 };
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
};
// ---- rooms assembled from parts (any size looks whole): seamless wall + floor textures, wall decor hung
// on the back walls and furniture placed on the floor by the engine. A themed room replaces its painted picture.
const THEMES = {
  herbs: { dir: 'assets/parts/herbs/', wallTiles: 4, floorTiles: 3, board: 'board',
    decor: ['window', 'herbs_rack', 'clock', 'shelf', 'window2'], iso: true, back: ['plant', 'lavender'], side: ['bookcase', 'table'], front: ['magic_pot', 'basket', 'barrel'], rug: 'rug' },
  // Potions (her wish 2026-11-21: no school board, students brew at their own cauldrons instead of sitting at desks)
  potions: { dir: 'assets/parts/potions/', wallTiles: 4, floorTiles: 3, board: 'poster', isoOnly: true, iso: true,
    decor: ['window', 'shelf', 'herbs_rack', 'cabinet', 'round_window'], back: ['barrel', 'barrel'], side: ['bookcase', 'table'], front: [], rug: 'rug',
    stations: ['station_pink', 'station_green', 'station_purple'], teacherProp: 'big_cauldron' },
  // Astronomy (her choice 2026-11-21: night observatory, a small telescope per student, big brass telescope + orrery, star chart instead of a board)
  stars: { dir: 'assets/parts/stars/', wallTiles: 4, floorTiles: 3, board: 'chart', isoOnly: true, iso: true,
    decor: ['window', 'shelf', 'clock', 'painting', 'round_window'], back: ['orrery', 'table'], side: ['bookcase', 'table'], front: [], rug: 'rug',
    stations: ['tel_gold', 'tel_silver', 'tel_rose'], teacherProp: 'big_telescope', h: { table: 24, bookcase: 36 } },
  // Charms (her choice 2026-11-21: lecterns with wands and floating spellbooks)
  charms: { dir: 'assets/parts/charms/', wallTiles: 4, floorTiles: 3, board: 'circle', isoOnly: true, iso: true,
    decor: ['window', 'mirror', 'shelf', 'wand_rack', 'painting'], back: ['crystal_ball', 'table'], side: ['bookcase', 'table'], front: [], rug: 'rug',
    stations: ['lectb_lilac', 'lectb_pink', 'lectb_mint'], teacherProp: 'big_book', h: { table: 26, bookcase: 36 }, facing: 'front' },   // her idea: students face us, the teacher stands at the front
  // Flight (her choice 2026-11-21: students sit on little clouds)
  flight: { dir: 'assets/parts/flight/', wallTiles: 4, floorTiles: 3, board: 'wing_poster', isoOnly: true, iso: true,
    decor: ['window', 'shelf', 'birds', 'painting', 'round_window'], back: ['tree', 'table'], side: ['bookcase', 'table'], front: [], rug: 'rug',
    stations: ['cloud_white', 'cloud_pink', 'cloud_lilac'], teacherProp: 'perch', h: { table: 24, bookcase: 36 }, sitOn: true },
  // Elements (her choice 2026-11-21: a pedestal with a crystal of one of the four elements per student)
  elements: { dir: 'assets/parts/elements/', wallTiles: 4, floorTiles: 3, board: 'el_poster', isoOnly: true, iso: true,
    decor: ['window', 'shelf', 'torch', 'planter', 'round_window'], back: ['fountain', ''], side: ['bookcase', ''], front: [], rug: 'rug',
    stations: ['cr_fire', 'cr_water', 'cr_earth', 'cr_air'], teacherProp: 'altar', h: { bookcase: 36 } },
  // Final exam (her choice 2026-11-21: a festive hall, single exam desks with scrolls, the examiners' table with an hourglass)
  final: { dir: 'assets/parts/final/', wallTiles: 4, floorTiles: 6, board: 'banner', isoOnly: true, iso: true,
    decor: ['window', 'sconce', 'diploma', 'clock', 'round_window', 'sconce'], back: ['candelabra', 'laurel'], side: ['trophy', ''], front: [], rug: 'rug',
    stations: ['exdesk_a', 'exdesk_b', 'exdesk_c'], teacherProp: 'commission' },
  // Reception (her choice 2026-11-21: the same look as the old picture, built from parts). The counter stands where the painted one was
  // (tiles blocked by recBlocked), a pink runner leads from the street entrance to the back passage.
  REC: { dir: 'assets/parts/reception/', wallTiles: 4, floorTiles: 3, board: 'map', isoOnly: true, iso: true,
    decor: ['window', 'notice', 'clock', 'lantern', 'shelf', 'window'], back: [], side: [], front: [], rug: '', runner: { u0: 4.3, u1: 6.3, color: '#eaa6b4' },
    h: { plant_big: 40, bush: 24 },
    extras: (s) => [{ n: 'counter', x: s.x0 + 1.75, y: s.y0 + 3.9 }, { n: 'coat_rack', x: s.x0 + 0.45, y: s.y0 + 0.5 }, { n: 'plant_big', x: s.x0 + 0.5, y: s.y1 - 0.5 },
      { n: 'bench_l', x: s.x1 - 0.7, y: s.y0 + 5.6 }, { n: 'bench_l', x: s.x1 - 0.7, y: s.y0 + 7.3 }, { n: 'bush', x: s.x1 - 0.5, y: s.y1 - 0.4 }, { n: 'signpost', x: s.x0 + 3.4, y: s.y1 - 0.6 }] },
  // Dorms (her choice 2026-11-21: small beds with blankets; the sleeper lies on its bed)
  DORM: { dir: 'assets/parts/dorm/', wallTiles: 4, floorTiles: 3, board: 'garland', isoOnly: true, iso: true,
    decor: ['window', 'shelf', 'painting', 'moon_clock', 'round_window'], back: [], side: [], front: [], rug: 'rug', beds: ['bed_pink', 'bed_mint', 'bed_lilac'],
    extras: (s) => [{ n: 'conc_desk', x: s.x0 + 1.4, y: s.y0 + 1.5 }, { n: 'nightstand', x: s.x0 + 0.5, y: s.y0 + 3.6 }, { n: 'toy_chest', x: s.x0 + 0.55, y: s.y1 - 0.6 }] },
  DORM2: { dir: 'assets/parts/dorm/', wallTiles: 4, floorTiles: 3, board: 'garland', isoOnly: true, iso: true,
    decor: ['round_window', 'painting', 'shelf', 'window', 'moon_clock'], back: [], side: [], front: [], rug: 'rug', beds: ['bed_lilac', 'bed_pink', 'bed_mint'],
    extras: (s) => [{ n: 'plant', x: s.x1 - 0.45, y: s.y1 - 0.5 }, { n: 'toy_chest', x: s.x0 + 0.5, y: s.y1 - 0.6 }] },
  // Director's office (Ruslan's idea 2026-11-21): the director sits behind a big desk
  DIR: { dir: 'assets/parts/director/', wallTiles: 4, floorTiles: 3, board: 'portrait', isoOnly: true, iso: true,
    decor: ['window', 'certificates', 'clock', 'shelf', 'banner'], back: [], side: [], front: [], rug: 'rug', h: { bookcase: 48 },
    extras: (s) => [{ n: 'desk', x: s.x0 + 2.6, y: s.y0 + 2.4 }, { n: 'armchair', x: s.x0 + 4.4, y: s.y0 + 4.2 }, { n: 'globe', x: s.x1 - 0.55, y: s.y0 + 0.6 },
      { n: 'bookcase', x: s.x0 + 0.45, y: s.y0 + 1.0 }, { n: 'palm', x: s.x0 + 0.5, y: s.y1 - 0.5 }, { n: 'tea_table', x: s.x0 + 3.2, y: s.y1 - 1.1 }, { n: 'cabinet', x: s.x1 - 0.5, y: s.y1 - 0.6 }] },
  // Library (her choice 2026-11-21: a cozy reading room, students read in soft armchair-poufs)
  LIB: { dir: 'assets/parts/library/', wallTiles: 4, floorTiles: 3, board: 'bookshelf', isoOnly: true, iso: true,
    decor: ['window', 'flying_books', 'bookshelf2', 'candles', 'map'], back: [], side: [], front: [], rug: 'rug',   // v2 (her «очень скучные цвета»): emerald walls, bright poufs
    seats: ['pouf_pink', 'pouf_green', 'pouf_lilac'], h: { plant: 44 },
    extras: (s) => [{ n: 'globe', x: s.x0 + 0.5, y: s.y0 + 0.5 }, { n: 'book_pile', x: s.x1 - 0.6, y: s.y0 + 0.6 }, { n: 'lib_desk', x: s.x0 + 3, y: s.y1 - 0.45 }, { n: 'plant', x: s.x0 + 0.5, y: s.y1 - 0.5 }] },
};
// wall decor: width in tiles along the wall, bottom edge as a share of the wall height
const DECOR = { flying_books: { w: 1.4, lo: 0.55, deep: 1.6 }, candles: { w: 0.9, lo: 0.55, deep: 1.6 }, portrait: { w: 1.2, lo: 0.3, deep: 0.7 }, certificates: { w: 1.3, lo: 0.4, deep: 0.6 }, notice: { w: 0.9, lo: 0.4, deep: 0.8 }, lantern: { w: 0.5, lo: 0.5, deep: 1.4 }, garland: { w: 2.6, lo: 0.62, deep: 0.5 }, moon_clock: { w: 0.8, lo: 0.5, deep: 1 }, bookshelf: { w: 1.4, lo: 0.0, deep: 1.2 }, bookshelf2: { w: 1.3, lo: 0.0, deep: 1.2 }, lamp: { w: 0.5, lo: 0.5, deep: 1.2 }, map: { w: 1.1, lo: 0.35, deep: 0.6 }, banner: { w: 1.0, lo: 0.28, deep: 0.7 }, sconce: { w: 0.6, lo: 0.45, deep: 1.4 }, diploma: { w: 0.8, lo: 0.4, deep: 0.6 }, el_poster: { w: 1.5, lo: 0.3, deep: 0.6 }, torch: { w: 0.6, lo: 0.45, deep: 1.5 }, planter: { w: 1.2, lo: 0.4, deep: 1.4 }, wing_poster: { w: 1.7, lo: 0.3, deep: 0.6 }, birds: { w: 1.4, lo: 0.4, deep: 1.2 }, circle: { w: 1.7, lo: 0.3, deep: 0.8 }, mirror: { w: 0.8, lo: 0.35, deep: 0.8 }, wand_rack: { w: 1.3, lo: 0.35, deep: 1.4 }, chart: { w: 1.9, lo: 0.28, deep: 0.6 }, painting: { w: 0.9, lo: 0.45, deep: 0.8 }, poster: { w: 1.9, lo: 0.28, deep: 0.6 }, round_window: { w: 1.0, lo: 0.42, deep: 0.6 }, cabinet: { w: 1.2, lo: 0.32, deep: 1.5 }, board: { w: 2.6, lo: 0.3, deep: 0.8 }, window: { w: 0.95, lo: 0.3, deep: 0.6 }, window2: { w: 0.95, lo: 0.3, deep: 0.6 }, shelf: { w: 1.7, lo: 0.45, deep: 2.2 }, herbs_rack: { w: 1.5, lo: 0.36, deep: 2 }, clock: { w: 0.9, lo: 0.5, deep: 1.2 } };
// floor props: height in world px (a creature is 30)
const PROP_H = { desk: 50, armchair: 30, palm: 44, tea_table: 22, cabinet: 34, counter: 82, bench_l: 32, bench_r: 32, signpost: 36, coat_rack: 42, bed_pink: 27, bed_mint: 27, bed_lilac: 27, conc_desk: 38, nightstand: 20, toy_chest: 20, pouf_pink: 20, pouf_green: 20, pouf_lilac: 20, lib_desk: 30, globe: 34, book_pile: 28, exdesk_a: 24, exdesk_b: 24, exdesk_c: 24, commission: 30, candelabra: 44, laurel: 42, trophy: 26, cr_fire: 30, cr_water: 30, cr_earth: 30, cr_air: 30, altar: 42, fountain: 30, lectb_lilac: 25, lectb_pink: 25, lectb_mint: 25, cloud_white: 17, cloud_pink: 17, cloud_lilac: 17, perch: 50, tree: 46, lect_lilac: 36, lect_pink: 36, lect_mint: 36, big_book: 52, crystal_ball: 26, tel_gold: 32, tel_silver: 32, tel_rose: 32, big_telescope: 46, orrery: 38, station_pink: 31, station_green: 31, station_purple: 31, big_cauldron: 40, plant: 46, lavender: 30, magic_pot: 27, barrel: 34, basket: 24, table: 34, bookcase: 40 };
const parts = {};
for (const [k, t] of Object.entries(THEMES)) for (const n of new Set(['wall', 'floor', t.rug, ...(t.isoOnly ? [] : [t.board, ...t.decor]), ...t.back, ...t.side, ...t.front, ...(t.stations || []), ...(t.seats || []), ...(t.beds || []), ...(t.extras ? t.extras({ x0: 0, y0: 0, x1: 0, y1: 0 }).map((o) => o.n) : []), ...(t.teacherProp ? [t.teacherProp] : []), ...(t.iso ? [t.board, ...t.decor].map((d) => 'iso_' + d) : [])])) {
  if (!n) continue; const im = new Image(); im.src = `${t.dir}${n}.webp?v=2111`; parts[k + '/' + n] = im;
}
const part = (th, n) => { const im = parts[th + '/' + n]; return im && im.complete && im.naturalWidth ? im : null; };
const THEMES_OFF = new Set();   // parts still being drawn: keep the painted pictures until they are in
const themeOf = (id) => { if (WORLD !== 1 || !id || THEMES_OFF.has(id)) return null; const ci = CLASS_SLOT.indexOf(id); const key = ci >= 0 ? CLASSES[ci].id : id; return THEMES[key] ? key : null; };
const dormSize = (k) => (S && S.dormUp && S.dormUp['size' + k]) || 1;      // 1..3, like class sizes
const dormDepth = (k) => ROOM + 2 * (dormSize(k) - 1);
const dormRows = (k) => 4 + 2 * (dormSize(k) - 1);                          // 4 beds per row: 16, 24, 32 per room
const DORM_STRIDE = 32;                                                     // bed index: room 1 = 0..31, room 2 = 32..63
function genLayout() {
  for (const k of Object.keys(SLOTS)) delete SLOTS[k];
  const rows = Math.ceil(NCLS / 2), CW = 5;   // corridors are wider than what a tall wall hides                        // CW: depth of a cross corridor
  let y = 0;
  // top: exam hall across the whole width, graduates' garden next to it (outside, no walls)
  SLOTS.EXAM = slot(7, y, [[13, y + 5], [13, y + 6]], {}, 17, 6, [[[14, y + 5], [14, y + 6]], [[15, y + 5], [15, y + 6]], [[16, y + 5], [16, y + 6]], [[17, y + 5], [17, y + 6]], [[23, y + 3], [24, y + 3]]]);
  SLOTS.GARDEN = slot(24, y, [[24, y + 3], [23, y + 3]], {}, 6, 6);
  if (WORLD === 1) SLOTS.DIR = slot(1, y, [[6, y + 3], [7, y + 3]], {}, 6, 6);   // director's office on the top row left of the exam hall: nothing tall stands in front of it (her report 2026-11-21: behind a class it was half hidden)
  y += 6;
  const hallTop = y; y += CW;
  let lastGap = null;
  for (let r = rows - 1; r >= 0; r--) {
    const li = 2 * r, ri = 2 * r + 1;
    const d = Math.max(depthOf(li), ri < NCLS ? depthOf(ri) : ROOM);
    const h1 = depthOf(li), y1 = y + d - h1, ym = y1 + Math.floor(h1 / 2);
    SLOTS['C' + li] = slot(7, y1, [[12, ym], [13, ym]], {}, ROOM, h1);                       // door to the main corridor (front side)
    if (ri < NCLS) { const h2 = depthOf(ri), y2 = y + d - h2; SLOTS['C' + ri] = slot(18, y2, [[20, y2 + h2 - 1], [20, y2 + h2]], {}, ROOM, h2, [[[21, y2 + h2 - 1], [21, y2 + h2]]]); }   // door to the cross corridor below
    y += d;
    lastGap = [y, y + CW]; y += CW;
  }
  const recY = y;
  // front block: library | reception | dorms
  SLOTS.LIB = slot(0, recY, [[2, recY], [2, recY - 1]], {}, 6, 8, [[[3, recY], [3, recY - 1]], [[5, recY + 3], [6, recY + 3]], [[5, recY + 4], [6, recY + 4]]]);   // own space: the reception's tall wall must not hide it
  // doors where the reception picture has its openings (her report 2026-11-21: students walked over the desk and through the railings):
  // back passage between the two newel posts (x15..17), street entrance where the pink carpet starts (x16..17), dorm through the open arch (row 0)
  SLOTS.REC = slot(12, recY, [[15, recY], [15, recY - 1]], {}, 9, 9,
    [[[16, recY], [16, recY - 1]], [[17, recY], [17, recY - 1]], [[16, recY + 8], [16, recY + 9]], [[17, recY + 8], [17, recY + 9]], [[20, recY], [21, recY]]]);
  SLOTS.DORM = slot(21, recY, [[21, recY], [20, recY]], {}, ROOM, dormDepth(1));
  SLOTS.DORM2 = slot(27, recY, [[27, recY + 3], [26, recY + 3]], {}, ROOM, dormDepth(2));
  BUILDING = { x0: 0, y0: hallTop, x1: 33, y1: recY + 8 };
  HALLS = [
    { x0: 7, y0: hallTop, x1: 24, y1: recY },                       // rows + corridors (rooms are cut out of it)
    { x0: 0, y0: lastGap[0], x1: 33, y1: recY },                     // the wide corridor along the front block
    { x0: 6, y0: recY, x1: 12, y1: recY + 8 },                       // reading court: as wide as what the reception's wall hides
    { x0: 15, y0: recY + 9, x1: 19, y1: recY + 14 },                // path from the gate (to the carpet of the reception)
  ];
  GATE_TILE = { x: 16.5, y: recY + 12.5 };
  GATE_Y = recY + 9;
  GH = recY + 16; GW = 36;
}
let GATE_Y = 0;
// region grid (rebuilt with the layout)
let REG = [];
const YOFF = 0;
const inGrid = (x, y) => x >= 0 && y >= -YOFF && x < GW && y < GH;
const regAt = (x, y) => (inGrid(x, y) ? REG[x][y + YOFF] : null);
function fillRect(r, id) { for (let x = r.x0; x < r.x1; x++) for (let y = r.y0; y < r.y1; y++) if (inGrid(x, y)) REG[x][y + YOFF] = id; }
const DOORS = new Set();
function buildGrid() {
  REG = Array.from({ length: GW }, () => Array(GH + YOFF + 2).fill(null));
  HALLS.forEach((h) => fillRect(h, 'hall'));
  Object.entries(SLOTS).forEach(([id, r]) => fillRect(r, id));
  DOORS.clear();
  Object.values(SLOTS).forEach((s) => { for (const [a, b] of [s.door, ...s.extra]) { DOORS.add(`${a[0]},${a[1]}|${b[0]},${b[1]}`); DOORS.add(`${b[0]},${b[1]}|${a[0]},${a[1]}`); } });
}
// ---- walls: one rule everywhere ----
// side: 'x0' / 'y0' = back sides (tall walls), 'x1' / 'y1' = front sides (knee walls); door tiles get no wall.
let EDGES = [];
function buildEdges() {
  EDGES = [];
  const doorAt = new Set();
  Object.values(SLOTS).forEach((sl) => [sl.door, ...sl.extra].forEach(([a, b]) => { doorAt.add(`${a[0]},${a[1]},${b[0] - a[0]},${b[1] - a[1]}`); doorAt.add(`${b[0]},${b[1]},${a[0] - b[0]},${a[1] - b[1]}`); }));
  const sides = [['x0', -1, 0], ['y0', 0, -1], ['x1', 1, 0], ['y1', 0, 1]];
  for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
    const id = regAt(x, y); if (!id || id === 'GARDEN') continue;
    if (id === 'hall' && y >= GATE_Y) continue;                    // the gate path is open
    for (const [side, dx, dy] of sides) {
      const nb = regAt(x + dx, y + dy);
      if (nb === id) continue;
      if (doorAt.has(`${x},${y},${dx},${dy}`)) continue;
      if (id === 'hall' && nb) continue;                             // a hall next to a room: the room owns that wall
      if (nb === 'hall' && id !== 'hall' && (side === 'x0' || side === 'y0') && false) continue;
      const lowSide = ((id === 'DORM' || id === 'DORM2') && side === 'x0') || (id === 'EXAM' && side === 'x0' && nb === 'DIR');   // low walls between neighbouring rooms so neither hides the other   // dorms share low walls with the reception and each other (they hid the rooms)
      EDGES.push({ x, y, side, id, tall: id !== 'hall' && (side === 'x0' || side === 'y0') && !lowSide });   // corridors get only low walls: they must never hide a room
    }
  }
}
genLayout(); buildGrid(); buildEdges(); decorateEdges();
const recBlocked = (x, y) => { const s = SLOTS.REC; return x - s.x0 <= 1 && y - s.y0 >= 1 && y - s.y0 <= 6; };   // tiles under the painted desk
function canStep(ax, ay, bx, by) {
  const ra = regAt(ax, ay), rb = regAt(bx, by);
  if (!ra || !rb) return false;
  if (ra === rb) return true;
  if ((ra === 'DORM2' || rb === 'DORM2') && !dorm2Built()) return false;
  if (rb === 'REC' && recBlocked(bx, by)) return false;   // the reception desk is not a floor
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
const clsTheme = (i) => { const th = themeOf(CLASS_SLOT[i]); return th ? THEMES[th] : null; };
const frontFacing = (i) => clsTheme(i)?.facing === 'front';   // students face the viewer, the teacher stands at the front
const sitsOn = (i) => !!clsTheme(i)?.sitOn;                     // students sit on their station (clouds)
function faceTeacher(a, i) { const tp = teacherPos(i); a.flip = (tp.x - tp.y) < (a.x - a.y); a.back = !frontFacing(i); }
function deskPos(i, d) {   // 3 columns across the room, rows from the board towards us: the first rows stay on the room picture
  const s = slotOf(i), w = s.x1 - s.x0, cols = CLASSES[i].final ? 7 : w >= 9 ? 4 : 3, gap = (w - 2.2) / (cols - 1);
  return { x: s.x0 + 1.1 + (d % cols) * gap, y: s.y0 + (frontFacing(i) ? 1.9 : 2.5) + Math.floor(d / cols) * 1.2 };
}
const seatPos = (i, d) => { const p = deskPos(i, d); if (frontFacing(i)) return { x: p.x - 0.45, y: p.y + 0.4 };   // charms: beside the lectern, on its left on screen (her ruling 2026-11-21)
  return { x: p.x, y: p.y + (sitsOn(i) ? 0.05 : 0.45) }; };   // in front of the desk (nearer to us): the desk is between the student and the board
// render-only stroll: the teacher walks slowly left and right along the board, pauses, turns to the class
function teacherGlow(tp, hh, col = 'rgba(255,244,205,0.6)') {   // soft light around a teacher so they stand out from the class
  const q = P(tp.x, tp.y), g = ctx.createRadialGradient(q.x, q.y - hh * 0.5, 2, q.x, q.y - hh * 0.5, hh * 0.75);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y - hh * 0.5, hh * 0.75, 0, Math.PI * 2); ctx.fill();
}
// the secretary leaves the counter only while nobody waits (her idea 2026-11-21): she pins notes on the board, then comes back
let secIdle = 0, secLast = 0, secU = 0;
function secretaryPos() {
  const now = performance.now() / 1000, dt = Math.min(0.2, now - (secLast || now)); secLast = now;
  const busy = processing || queue.some((q) => q.state === 'queue');   // only someone already standing at the counter calls her back
  secIdle = busy ? 0 : secIdle + dt;
  const target = !busy && secIdle > 3 ? 1 : 0, sp = target ? 1 / 2.5 : 1 / 1.4;     // waits 3 s, strolls out in 2.5 s, hurries back in 1.4 s
  secU = target > secU ? Math.min(1, secU + sp * dt) : Math.max(0, secU - sp * dt);
  const s = SLOTS.REC, home = { x: OFFICER.x, y: OFFICER.y }, board = { x: s.x0 + 3.6, y: s.y0 + 0.9 };
  const k = 0.5 - 0.5 * Math.cos(secU * Math.PI);
  // behind the counter she is never still: she paces along it (papers, the scroll shelf) and turns (her report «всегда стоит на одном месте боком»)
  const T = now % 7, pace = T < 2.5 ? T / 2.5 : T < 3.5 ? 1 : T < 6 ? 1 - (T - 3.5) / 2.5 : 0, pk = (0.5 - 0.5 * Math.cos(pace * Math.PI)) * (1 - k);
  const walkingBehind = (T < 2.5 || (T >= 3.5 && T < 6)) && k < 0.05;
  return { x: home.x + (board.x - home.x) * k, y: home.y + (board.y - home.y) * k + pk * 1.6, moving: (secU > 0 && secU < 1 && secU !== target) || walkingBehind, left: true };   // always turned toward the queue and the viewer, never to the wall (her report 2026-11-21)
}
function teacherWalk(i) {
  const b = teacherPos(i), s = slotOf(i), T = performance.now() / 1000 + i * 3.7;
  const span = Math.max(0.8, Math.min(2.2, (s.x1 - s.x0) / 2 - 1.4));
  const ph = (T % 9) / 9;                                         // 9 s loop: walk, stop, walk back, stop
  const u = ph < 0.35 ? ph / 0.35 : ph < 0.5 ? 1 : ph < 0.85 ? 1 - (ph - 0.5) / 0.35 : 0;
  const x = b.x - span + 2 * span * (0.5 - 0.5 * Math.cos(u * Math.PI)), y = b.y + Math.sin(T * 0.7) * 0.25;
  const moving = (ph < 0.35 || (ph >= 0.5 && ph < 0.85));
  return { x, y, moving, left: ph >= 0.5 && ph < 0.85 };
}
const teacherPos = (i) => { const s = slotOf(i); return frontFacing(i) ? { x: s.x0 + (s.x1 - s.x0) / 2 + 0.6, y: s.y1 - 0.9 } : { x: s.x0 + (s.x1 - s.x0) / 2 + 1.3, y: s.y0 + 1.0 }; };
let REC = SLOTS.REC, OFFICER = { x: REC.x0 + 0.75, y: REC.y0 + 3.3 };
const queueSlot = (k) => ({ x: REC.x0 + 3.0 + k * 0.7, y: REC.y0 + 4.6 });
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
  const a = { id: S.nextId++, sp: rnd(SPECIES), name: rnd(NAMES), x: GATE_TILE.x, y: GATE_TILE.y, z: 0,
    path: [], speed: 2.3 + Math.random() * 0.4, state: 'walk', onArrive: null, flip: false, t: 0, dur: 1, c: -1, desk: -1, ph: Math.random() * 6, mood: 80 };
  agents.push(a); queue.push(a); goQueue(a);
}
function goQueue(a) { const p = queueSlot(queue.indexOf(a)); a.goal = { t: 'q' }; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'queue'; }); }
function startNextProcess(live) {
  if (processing || !queue.length) return;
  if (live && secU > 0.02) return;   // the secretary first walks back to her counter
  const a = queue[0]; if (a.state !== 'queue') return;
  processing = a; procT = 0; a.state = 'process';
}
function finishProcess() {
  const a = processing; processing = null;
  queue.shift(); queue.forEach(goQueue);
  S.stats.enrolled++;
  a.paid = fee(); earn(a.paid, OFFICER.x + 1, OFFICER.y, '#c98a00');
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
const roomForWaker = (i) => i < 0 || waitList[i].length + wakersFor(i) < MAX_WAIT;
const sleepersFor = (i) => dorm.reduce((n, a) => n + (a && a.goal && a.goal.t === 'd' && a.goal.i === i ? 1 : 0), 0);
// dorm: upset students sleep here until there is room in the line of their class
let DS = SLOTS.DORM, DS2 = SLOTS.DORM2;
// beds of room 1 are 0..31, of room 2 32..63 (only the first ones exist, see bedExists)
const DORM_SPOTS = Array(64).fill(null);
function dormSpots() {
  for (const [k, R, x0, dx] of [[1, DS, 2.05, 1.12], [2, DS2, 1.0, 1.3]]) {
    const rows = dormRows(k), step = (R.y1 - R.y0 - 1.6) / rows;
    for (let b = 0; b < DORM_STRIDE; b++) { const r = Math.floor(b / 4), c = b % 4; DORM_SPOTS[(k - 1) * DORM_STRIDE + b] = { x: R.x0 + x0 + c * dx, y: R.y0 + 1.0 + Math.min(r, rows - 1) * step }; }
  }
}
dormSpots();
// concierge: everybody checks in at her desk before going to bed
let CONCIERGE = { x: DS.x0 + 0.6, y: DS.y0 + 1.4 };
const MAX_CONC = 10, DORM2_COST = 1500;
const dormExpandCost = (k) => Math.round(2500 * Math.pow(3, dormSize(k) - 1) * (k === 2 ? 1.5 : 1));
const dorm2Built = () => !!(S && S.dormUp && S.dormUp.room2);
const cap1 = () => 4 * dormRows(1), cap2 = () => 4 * dormRows(2);
const maxBeds = () => cap1() + (dorm2Built() ? cap2() : 0);
const dormUp = () => (S.dormUp ||= { beds: 1, conc: 1 });
const beds1 = () => Math.min(cap1(), 8 + dormUp().beds);                                             // 9 beds at level 1
const beds2 = () => (dorm2Built() ? Math.min(cap2(), 9 + Math.max(0, 8 + dormUp().beds - cap1())) : 0);   // 9 at once, then the upgrade fills it
const bedCount = () => beds1() + beds2();
const bedExists = (b) => (b < DORM_STRIDE ? b < beds1() : b - DORM_STRIDE < beds2());
const checkinTime = () => 2 * Math.pow(0.85, dormUp().conc - 1);
const bedsCost = () => Math.round(150 * Math.pow(1.6, dormUp().beds - 1));
const concCost = () => Math.round(100 * Math.pow(1.5, dormUp().conc - 1));
const dormLineSpot = (k) => ({ x: DS.x0 + 1.4, y: DS.y0 + 1.6 + k * 0.55 });
let dormLine = [], checkin = null, checkinT = 0;
const DORM_CAP = DORM_SPOTS.length;
const dorm = Array(DORM_CAP).fill(null);           // agent per bed (only the first bedCount() beds exist)
const freeBed = () => { for (let b = 0; b < DORM_CAP; b++) if (bedExists(b) && !dorm[b]) return b; return -1; };
const dormFree = () => freeBed() >= 0;
function goDorm(a, i, bed = freeBed()) {   // bed is reserved now, the student queues at the concierge first
  dorm[bed] = a; a.bed = bed; a.goal = { t: 'd', i }; a.c = -1; a.since = Date.now();
  dormLine.push(a); goDormLine(a);
}
function goDormLine(a) { const p = dormLineSpot(dormLine.indexOf(a)); a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'dline'; }); }
function toBed(a) { const p = DORM_SPOTS[a.bed]; a.state = 'walk'; walk(a, p.x, p.y, () => { a.state = 'sleep'; }); }
function stepConcierge(dt) {
  if (!checkin && dormLine.length && dormLine[0].state === 'dline') { checkin = dormLine[0]; checkinT = 0; checkin.state = 'checkin'; }
  if (!checkin) return;
  checkinT += dt;
  if (checkinT < checkinTime()) return;
  const a = checkin; checkin = null;
  dormLine.shift(); dormLine.forEach(goDormLine);
  popup('📝', a.x, a.y, '#7b5cd6', 44);
  toBed(a);
}
function leaveSchool(a) {   // no room anywhere: the student is upset and goes home — and the school pays its fee back with a penalty
  S.stats.left = (S.stats.left || 0) + 1;
  const back = Math.min(S.coins, Math.round((a.paid || fee()) * refundRate()));
  if (back > 0) { S.coins -= back; S.stats.refunded = (S.stats.refunded || 0) + back; popup(`−${fmt(back)}`, a.x, a.y, '#e0245e', 60); }
  popup('😢💔', a.x, a.y, '#c0436b', 44);
  a.c = -1; a.goal = { t: 'x' }; a.state = 'walk';
  walk(a, GATE_TILE.x, GATE_TILE.y + 1, () => { a.gone = true; });
}
function route(a, i) {   // send a student on to class i, or to the dorm when its line is full
  // nobody jumps the queue: while students sleep waiting for this class and its line is busy, a newcomer lies down behind them
  const behind = i >= 0 && sleepersFor(i) > 0 && lineCount(i) + sleepersFor(i) >= MAX_WAIT && dormFree();
  if (i < 0 || (!classFull(i) && !behind)) { goClass(a, i); return true; }
  if (!dormFree()) { leaveSchool(a); return false; }
  popup('😢', a.x, a.y, '#5b7fd6', 44);
  goDorm(a, i);
  return true;
}
function wakeSleepers() {   // the one who has waited longest wakes first
  const sl = []; for (let b = 0; b < DORM_CAP; b++) { const a = dorm[b]; if (a && a.state === 'sleep') sl.push(a); }
  sl.sort((p, q) => (p.since || 0) - (q.since || 0));
  for (const a of sl) {
    let i = a.goal.i; if (!isOpen(i)) i = nextClass(i - 1);
    if (i >= 0 && !roomForWaker(i)) continue;
    dorm[a.bed] = null; a.bed = -1; a.woke = true; popup('😊', a.x, a.y, '#2f9e7a', 44); goClass(a, i);
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
  walk(a, p.x, p.y, () => { a.state = 'study'; a.t = 0; a.dur = lessonTime(i) * (a.prepared ? 0.5 : 1); faceTeacher(a, i); });   // the teacher is at the back wall: the whole class sits with its back to us   // face the teacher
}
function finishLesson(a) {
  const i = a.c, p = deskPos(i, a.desk);
  const bonus = a.prepared ? libBonus() : 0; a.prepared = false;
  if (Math.random() < Math.max(0.05, Math.min(0.95, success(i) + bonus + moodBonus(a)))) { S.stats.passed++; earn(tuition(i), p.x, p.y, null, 46); a.mood = Math.min(100, moodOf(a) + 8); popup(rnd(['🎉', '🥳', '😄']), p.x - 0.3, p.y - 0.3, '#ff8a3d', 62); leaveDesk(a); }
  else { S.stats.failed++; popup('💧 не сдал', p.x, p.y, '#5b7fd6', 46); if (libFree()) { freeDeskOf(a); goLibrary(a, i); } else { a.t = 0; a.dur = lessonTime(i); } }
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
const libSeatsCost = () => Math.round(200 * Math.pow(1.6, libUp().seats - 1));
const libSpeedCost = () => Math.round(150 * Math.pow(1.5, libUp().speed - 1));
const libBonusCost = () => Math.round(250 * Math.pow(1.55, libUp().bonus - 1));
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
const WALK_K = 0.8;   // walking a bit slower: the rooms got bigger on screen
// ======================= mood (her ruling 2026-11-21) =======================
// Waiting makes students sad, lessons and the library cheer them up. Mood moves the exam chance by up to ±10%;
// a student whose mood falls very low while waiting gives up and goes home. Mood only falls while the game is open.
const MOOD_DROP = { queue: 0.5, process: 0, wait: 1.0, walkwait: 1.0, sleep: 0.45, dline: 0.5, checkin: 0 };
const moodOf = (a) => (a.mood ?? 80);
const moodBonus = (a) => (moodOf(a) - 60) / 400;   // mood 100: +10%, mood 20: -10%
const moodFace = (m) => (m >= 70 ? '😊' : m >= 40 ? '🙂' : m >= 20 ? '😟' : '😭');
function avgMood() { const l = agents.filter((a) => a.state !== 'fly' && !(a.goal && a.goal.t === 'x')); return l.length ? l.reduce((n, a) => n + moodOf(a), 0) / l.length : 80; }
function giveUp(a) {   // too sad to keep waiting: frees its place and goes home
  if (a.state === 'wait' || a.state === 'walkwait') { const l = waitList[a.c]; const k = l ? l.indexOf(a) : -1; if (k >= 0) { l.splice(k, 1); pullWaiting(a.c); } }
  else if (a.state === 'sleep') { if (a.bed >= 0 && dorm[a.bed] === a) dorm[a.bed] = null; a.bed = -1; }
  else return;
  S.stats.gaveUp = (S.stats.gaveUp || 0) + 1;
  hintOnce('mood', '😭', 'Ученик ушёл от тоски', 'Ученик слишком долго ждал своей очереди, совсем загрустил и ушёл домой. Ожидание огорчает учеников, уроки и библиотека радуют. Добавляй парты, сокращай уроки и ставь кровати, чтобы очереди были короче. Весёлые ученики к тому же лучше сдают экзамены.');
  popup('😭', a.x, a.y, '#c0436b', 44);
  leaveSchool(a);
}
function stepMood(a, dt, live) {
  let d = 0;
  if (a.state === 'study') d = incOf(a.c) ? -1.5 : 0.8;
  else if (a.state === 'read') d = 1.2;
  else if (MOOD_DROP[a.state] !== undefined) d = -MOOD_DROP[a.state] * (a.state === 'sleep' ? 1 - 0.05 * (dormUp().conc - 1) : 1) * careK(dirLvl('care'));   // a better dorm and the director's care keep them calmer
  if (d < 0 && !live) return;
  a.mood = Math.max(0, Math.min(100, moodOf(a) + d * dt));
  if (live && a.mood < 8 && (a.state === 'wait' || a.state === 'sleep')) giveUp(a);
}
function stepAgents(dt, live = false) {
  for (const a of agents) {
    a.ph += dt;
    if (a.state !== 'fly') stepMood(a, dt, live);
    if (a.state === 'fly') { a.t += dt; a.z += (40 + a.t * 60) * dt; a.x += a.vx * dt; a.y -= a.vx * dt; continue; }
    if (a.path.length) {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) { a.x = GATE_TILE.x; a.y = GATE_TILE.y; }   // never let a broken position freeze a creature
      const p = a.path[0], dx = p.x - a.x, dy = p.y - a.y, dist = Math.hypot(dx, dy), stepLen = Math.max(0, a.speed * WALK_K * dt);
      const sdx = dx - dy; if (Math.abs(sdx) > 0.01) a.flip = sdx < 0;
      a.back = dx + dy < -0.01;   // walking away from us: we see its back
      if (dist <= stepLen || dist < 1e-6) { a.x = p.x; a.y = p.y; a.path.shift(); if (!a.path.length) a.back = false;
        if (!a.path.length && a.onArrive) { const f = a.onArrive; a.onArrive = null; f(); } }
      else { a.x += dx / dist * stepLen; a.y += dy / dist * stepLen; }
      continue;
    }
    if (a.state === 'study') { if (!incOf(a.c)) a.t += dt; if (a.t >= a.dur) finishLesson(a); }   // an incident stops the lesson
    else if (a.state === 'done') leaveDesk(a);
    else if (a.state === 'read') { a.t += dt; if (a.t >= a.dur) finishReading(a); }
  }
  agents = agents.filter((a) => !(a.state === 'fly' && a.z > 400) && !a.gone);
}
// ======================= incidents (her ruling 2026-11-21: the game needs a challenge) =======================
// Now and then something goes wrong in a class: its lesson stops until the player taps the room. Left alone it ends by itself after 10 minutes.
const INCIDENTS = { herbs: ['🌿', 'растения разрослись и опутали парты'], potions: ['💥', 'взорвался котёл'], stars: ['☁️', 'тучи закрыли небо, телескопы ничего не видят'], charms: ['✨', 'заклинание вышло из-под контроля'], flight: ['🪶', 'ученики улетели под потолок'], elements: ['🔥', 'в классе пожар'], final: ['📜', 'экзаменационные листы разлетелись'] };
const INC_GENERIC = ['🤧', 'учитель простыл'];
const INC_MIN = 70, INC_MAX = 150, INC_AUTO = 600, INC_MAXN = 2;
const incOf = (i) => !!(S.inc && S.inc[i]);
const incInfo = (i) => (S.inc[i].k === 'g' ? INC_GENERIC : INCIDENTS[CLASSES[i].id] || INC_GENERIC);
let incT = 45;
function hintOnce(key, emo, title, text) {   // a short explanation the first time something happens
  S.hints ||= {}; if (S.hints[key] || tourStep >= 0) return; S.hints[key] = 1; save();
  openPanel(() => `<div class="sh-head"><span class="remoji big">${emo}</span><div><h2>${title}</h2><div class="muted">Подсказка</div></div><button class="x" data-close>✕</button></div><p>${text}</p><button class="btn wide" data-close>Понятно</button>`);
}
function stepIncidents(dt, live) {
  S.inc ||= {};
  for (const [i, x] of Object.entries(S.inc)) { x.t = (x.t || 0) + dt; if (x.t > INC_AUTO_AT(dirLvl('keeper'))) delete S.inc[i]; }
  if (!live || S.stats.graduated < 5 || tourStep >= 0) return;   // never while the game is closed, nor for a brand-new school
  incT -= dt; if (incT > 0) return;
  incT = (INC_MIN + Math.random() * (INC_MAX - INC_MIN)) * (1 + 0.1 * dirLvl('keeper'));
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i) && !S.inc[i]);
  if (Object.keys(S.inc).length >= INC_MAXN || !open.length) return;
  const i = rnd(open); S.inc[i] = { k: Math.random() < 0.3 ? 'g' : 'c', t: 0 };
  const [e, txt] = incInfo(i); toast(`${e} ${CLASSES[i].name}: ${txt}! Нажми на класс`); try { navigator.vibrate?.(80); } catch (er) { /* no vibration */ }
  hintOnce('inc', '💥', 'Происшествие!', `В классе «${CLASSES[i].name}» ${txt}. Урок остановился, ученики носятся по классу. Закрой подсказку и нажми на этот класс — всё починится. Если не трогать, через 10 минут пройдёт само, но школа потеряет монеты.`);
  dirtyPanel = true;
}
function fixIncident(i) {
  delete S.inc[i];
  for (const a of agents) if (a.c === i && a.state === 'study') { a.mood = Math.min(100, moodOf(a) + 10); popup(rnd(['😄', '🥰', '💖']), a.x, a.y, '#ff6fa3', 44); }   // everyone is relieved S.stats.fixed = (S.stats.fixed || 0) + 1;
  const s = slotOf(i); popup('✨ Починено!', (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, '#2f9e7a', 50);
  toast(`✨ ${CLASSES[i].name}: всё в порядке, урок продолжается`); save();
}
function panicPos(a) {   // where a panicking student is now: a wobbly loop around the room, different for everyone
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
const INSP_KINDS = {
  mood: { text: 'настроение учеников 60% и выше', check: () => avgMood() >= 60, now: () => `настроение ${Math.round(avgMood())}%` },
  noleave: { text: `расстроенными уйдут не больше ${NOLEAVE_MAX} учеников`, start: () => ({ v: leftNow() }), len: NOLEAVE_LEN, fail: (c) => leftNow() - c.v > NOLEAVE_MAX, now: (c) => `ушли: ${leftNow() - c.v} из ${NOLEAVE_MAX}` },   // was «nobody»: too hard (her report 2026-11-21)
  inc: { text: 'каждое происшествие исправлено быстрее чем за 20 секунд', start: () => { forceIncident(); return {}; }, fail: () => Object.values(S.inc || {}).some((x) => x.t > 20), now: () => (Object.keys(S.inc || {}).length ? '⚠️ происшествие!' : 'всё спокойно') },
  pass: { text: 'экзамены сдают 70% учеников и больше', start: () => ({ p: S.stats.passed, f: S.stats.failed }), check: (c) => { const p = S.stats.passed - c.p, f = S.stats.failed - c.f; return p + f >= 5 && p / (p + f) >= 0.7; }, now: (c) => { const p = S.stats.passed - c.p, f = S.stats.failed - c.f; return p + f ? `сдали ${Math.round(p / (p + f) * 100)}%` : 'экзаменов ещё не было'; } },
  earn: { text: 'школа заработает', start: () => ({ e: S.stats.earned || 0, goal: Math.max(300, Math.round((S.ema || 1) * 140 / 10) * 10) }), check: (c) => (S.stats.earned || 0) - c.e >= c.goal, now: (c) => `заработано ${fmt((S.stats.earned || 0) - c.e)} из ${fmt(c.goal)}` },
};
function forceIncident() {
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i) && !(S.inc && S.inc[i])); if (!open.length) return;
  const i = rnd(open); S.inc ||= {}; S.inc[i] = { k: 'c', t: 0 }; const [e, txt] = incInfo(i); toast(`${e} ${CLASSES[i].name}: ${txt}! Нажми на класс`);
}
const inspText = (c) => (c.kind === 'earn' ? `${INSP_KINDS.earn.text} ${fmt(c.goal)} 🪙` : INSP_KINDS[c.kind].text);
const INSP_SHORT = { mood: 'настроение 60%+', noleave: 'уйдут не больше 7', inc: 'чинить за 20 с', pass: 'экзамены 70%+', earn: 'заработок' };
const inspNextText = (k) => (k === 'earn' ? 'сколько школа заработает' : INSP_KINDS[k].text);
const calm = () => !!(S && S.calm);
function setCalm(on) {
  S.calm = on;
  const I = insp(); if (on) { I.cur = null; I.next = null; I.t = Math.max(I.t, INSP_WARN + 60); }   // a running check is cancelled without a fine
  toast(on ? '😌 Спокойный режим: инспектор не придёт' : '🧐 Инспектор снова будет приходить');
  save(); updateHud(); dirtyPanel = true;
}
function stepInspector(dt, live) {
  if (calm() || !live || S.stats.graduated < 20 || tourStep >= 0) return;
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
  const income = Math.max(200, Math.round((S.ema || 1) * 180 / 10) * 10), ties = dirLvl('ties');
  I.cur = null; I.t = INSP_EVERY;
  if (ok) { const rw = Math.round(income * (1 + 0.1 * ties)); I.stars = (I.stars || 0) + 1; I.passed = (I.passed || 0) + 1; S.coins += rw; S.stats.earned = (S.stats.earned || 0) + rw; inspResult = { ok, income: rw }; }
  else { const fine = Math.min(S.coins, Math.round(income / 2 * (1 - 0.07 * ties))); S.coins -= fine; I.failed = (I.failed || 0) + 1; inspResult = { ok, fine, text: inspText(c) }; }
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
function inspPanel() {
  const I = insp(), c = I.cur;
  return `<div class="sh-head"><span class="remoji big">🧐</span><div><h2>Инспектор и звёзды школы</h2><div class="muted">У школы ⭐ ${schoolStars()} · пройдено ${I.passed || 0}, провалено ${I.failed || 0}</div></div><button class="x" data-close>✕</button></div>
    ${c ? `<div class="card up"><span class="remoji">🧐</span><div class="grow"><b>Идёт проверка: ${inspText(c)}</b><div class="muted">${INSP_KINDS[c.kind].now(c)} · осталось ${mmss(c.left)}</div></div></div>`
      : S.stats.graduated < 20 ? '<p>Инспектор начнёт приходить, когда у школы будет 20 выпускников.</p>' : `<p>Следующая проверка через <b>${mmss(I.t)}</b>${I.next ? `: ${inspNextText(I.next)}` : ''}.</p>`}
    ${calmBlock()}
    <p class="muted">Раз в 12 минут игры приходит инспектор и 1–3 минуты проверяет что-то одно: настроение учеников, что почти никто не ушёл расстроенным (не больше 7 за минуту), как быстро ты чинишь происшествия, как сдают экзамены или сколько школа заработала. О проверке предупреждают за 40 секунд.</p>
    <p class="muted">Прошла — звезда школы (+3% к плате за все уроки) и награда. Не прошла — штраф. Звёзды тратятся на постройку новых классов, кабинета директора и открытие новых миров. Пока игра закрыта, инспектор не приходит.</p>`;
}
// how many students are in the school right now (her wish 2026-11-21)
const inSchool = () => agents.filter((a) => a.state !== 'fly' && !(a.goal && (a.goal.t === 'x' || a.goal.t === 'g')));
function peoplePanel() {
  const l = inSchool(), n = (f) => l.filter(f).length;
  const rows = [
    ['🛎️', 'в приёмной', n((a) => queue.includes(a))],
    ['📖', 'на уроках', n((a) => a.state === 'study')],
    ['🚪', 'в очереди у классов', n((a) => a.state === 'wait' || a.state === 'walkwait')],
    ['💤', 'в спальне ждут места', n((a) => a.state === 'sleep' || a.state === 'dline' || a.state === 'checkin' || (a.goal && a.goal.t === 'd'))],
    ['📚', 'в библиотеке', n((a) => a.state === 'read' || (a.goal && a.goal.t === 'l'))],
    ['🚶', 'идут по школе', n((a) => a.state === 'walk' && !queue.includes(a) && !(a.goal && (a.goal.t === 'd' || a.goal.t === 'l')))],
  ];
  return `<div class="sh-head"><span class="remoji big">👥</span><div><h2>Ученики в школе: ${l.length}</h2><div class="muted">Настроение ${moodFace(avgMood())} ${Math.round(avgMood())}% · всего выпустилось 🎓 ${fmt(S.stats.graduated)}</div></div><button class="x" data-close>✕</button></div>
    ${rows.map(([e, t, v]) => `<div class="card up"><span class="remoji">${e}</span><div class="grow"><b>${v}</b> ${t}</div></div>`).join('')}`;
}
function renderInsp() {
  const el = $('#insp'); if (!el || !S) return;
  const I = S.insp || {}, c = I.cur;
  const html = c ? `<button class="ipill live" data-insp>🧐 Проверка ${mmss(c.left)} · ${INSP_KINDS[c.kind].now(c)}</button>`
    : calm() ? `<button class="ipill" data-insp>😌 ⭐ ${schoolStars()}</button>`
    : `<button class="ipill" data-insp>⭐ ${schoolStars()}</button>`;   // the warning itself is the banner below (iwarn)   // the warning names what will be checked (her report 2026-11-21)
  const warn = !c && !calm() && I.next ? `<button class="iwarn" data-insp>🧐 Через ${mmss(I.t)} придёт инспектор<br><b>Проверит: ${inspNextText(I.next)}</b></button>` : '';   // full text of what will be checked, 40 s ahead (her wish 2026-11-21)
  const all = html + `<button class="ipill" data-people>👥 ${inSchool().length}</button>` + warn;
  if (el.dataset.h !== all) { el.dataset.h = all; morph(el, emojiHtml(all)); }   // in-place update: icons are never re-created (they blinked)
}
function stepWorld(dt, live = false) {
  stepIncidents(dt, live);
  stepInspector(dt, live);
  arrivalT -= dt;
  if (arrivalT <= 0) { arrivalT = arrivalInterval(); if (queue.length < 6) spawn(); }
  startNextProcess(live);
  if (processing) { procT = Math.min(procT + dt, procTime()); if (procT >= procTime()) finishProcess(); }
  stepConcierge(dt);
  wakeSleepers();
  S.classes.forEach((c, i) => { if (c.built && c.buildEnd && Date.now() >= c.buildEnd) { c.buildEnd = 0; toast(`✨ Построено: ${CLASSES[i].name}!`); dirtyPanel = true; staticKey = ''; } });
  stepAgents(dt, live);
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
const MARGIN = 900;
const BASEW = 54 * HW + 20;                                  // fixed zoom base (the first map's width): a bigger school does not shrink the view
computeBounds();
const P = (x, y) => ({ x: OX + (x - y) * HW, y: OY + (x + y) * HH });
let scale = 1, dpr = 1, viewW = 0, viewH = 0, zoom = 2.2, pinching = false;
const ZMIN = 0.9, ZMAX = 3.4;
const sprites = {};
// professors drawn one by one, each approved by Maria (class id -> file in assets/staff)
const STAFF_ART = { herbs: 'moss', potions: 'bubble', stars: 'lun', charms: 'spark', flight: 'breeze', elements: 'storm', final: 'owl' };
const STAFF_H = { moss: 58, bubble: 54, lun: 68, spark: 62, breeze: 56, storm: 68, owl: 60 };   // teachers clearly taller than students (30) — her ruling 2026-11-21
const STAFF_GLOW = { lun: 'rgba(255,240,190,0.95)' }, STAFF_GLOW_ALL = 'rgba(255,244,205,0.6)';   // every teacher glows softly (her wish 2026-11-21), Lun a bit more   // drawn height: Lun is tall, Bubble small and round
// school staff outside classes (secretary, concierge, director): own sprites, one by one with her approval
const STAFF_OTHER = ['secretary', 'concierge'];
for (const f of STAFF_OTHER) { const im = new Image(); im.src = `assets/staff/${f}.png?v=1`; sprites['staff_' + f] = im; }
const staffSprite = (f) => WORLD === 1 && STAFF_OTHER.includes(f) && sprites['staff_' + f]?.naturalWidth;
for (const [k, f] of Object.entries(STAFF_ART)) { const im = new Image(); im.src = `assets/staff/${f}.png?v=3`; sprites['staff_' + k] = im; }
for (const sp of SPECIES) for (const v of ['', '_back']) { const im = new Image(); im.src = `assets/creatures/${sp}${v}.png`; sprites[sp + v] = im; }   // front and back views
const arts = {};
for (const [k, a] of Object.entries(ART)) { const im = new Image(); im.onload = () => { staticKey = ''; }; im.src = a.src; arts[k] = im; }
const popups = [];
function popup(t, x, y, color, lift = 30) { popups.push({ text: t, x, y, color, t: 0, lift }); }

function resize() {
  const r = scroller.getBoundingClientRect();
  dpr = Math.min(3, window.devicePixelRatio || 1);
  viewW = r.width; viewH = r.height;
  viewW = r.width; viewH = r.height; zoom = Math.max(zoom, minZoom());
  scale = (r.width / BASEW) * zoom * ROOMS_K;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  $('#spacer').style.height = WH * scale + 'px'; $('#spacer').style.width = WW * scale + 'px';
  staticKey = '';
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
let staticKey = '';
const statQ = () => Math.min(scale * dpr, Math.sqrt(12e6 / (SW * SH)));   // px per world unit, capped (iOS canvas limit)
function statKey() { return S.classes.map((c, i) => (c.built ? (isOpen(i) ? 'o' : 'b') : (S.classes.findIndex((q) => !q.built) === i ? 'n' : 'l'))).join('') + statQ().toFixed(2); }
function drawStatic() {
  const k = statKey(); if (k === staticKey || (pinching && stat.width)) return; staticKey = k;
  const q = statQ();
  stat.width = Math.round(SW * q); stat.height = Math.round(SH * q);
  const c = sctx; c.setTransform(q, 0, 0, q, -MARGIN * q, -MARGIN * q);
  c.fillStyle = '#a9d98f'; c.fillRect(0, 0, WW, WH);
  c.fillStyle = '#9fd184'; for (let i = 0; i < 260; i++) c.fillRect((i * 97) % WW, (i * 211) % WH, 3, 2);
  // halls
  for (let x = 0; x < GW; x++) for (let y = -YOFF; y < GH; y++) {
    if (regAt(x, y) !== 'hall') continue;
    const inside = x >= BUILDING.x0 && x < BUILDING.x1 && y >= BUILDING.y0 && y < BUILDING.y1;
    const carpet = inside && x >= 14 && x <= 16 && y > BUILDING.y0;
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
  if (id === 'DORM' || id === 'DORM2') return { floor: '#efe0d2', wall: '#bcd3f2' };
  if (id === 'LIB') return { floor: '#e9dccb', wall: '#c9a27a' };
  return { floor: '#bfe6a6', wall: null };
}
// ---- wall pieces (thick, with a cap) ----
const TALL_H = () => WALLH * 0.95,   // as tall as the walls in the room pictures
     _unused = 0, KNEE_H = () => WALLH * 0.11, TH = 0.22;
const CAP = '#9a7ec6', STONE = '#f4efe9', STONE_D = '#e2d9cf';
function wallColor(id) {
  const ci = CLASS_SLOT.indexOf(id);
  if (ci >= 0) return CLASSES[ci].wall;
  return { REC: '#d9c4f0', DORM: '#bcd3f2', DORM2: '#bcd3f2', LIB: '#d8b48a', hall: '#e9e1f3' }[id] || '#e9e1f3';
}
function drawEdge(c, e, capOnly = false) {
  const { x, y, side } = e, h = e.tall ? TALL_H() : KNEE_H();
  let a, b, a2, b2;                                    // base line (a,b) and the cap's far line (a2,b2)
  if (side === 'x0') { a = P(x, y + 1); b = P(x, y); a2 = P(x - TH, y + 1); b2 = P(x - TH, y); }
  if (side === 'y0') { a = P(x, y); b = P(x + 1, y); a2 = P(x, y - TH); b2 = P(x + 1, y - TH); }
  if (side === 'x1') { a = P(x + 1, y); b = P(x + 1, y + 1); a2 = P(x + 1 + TH, y); b2 = P(x + 1 + TH, y + 1); }
  if (side === 'y1') { a = P(x + 1, y + 1); b = P(x, y + 1); a2 = P(x + 1, y + 1 + TH); b2 = P(x, y + 1 + TH); }
  if (capOnly) { /* the room's picture is the face */ }
  else if (e.tall && themeOf(e.id) && texWall(c, themeOf(e.id), e, a, b, h)) {   // themed room: its wall texture, baseboard
    poly(c, [a, b, up(b, 5), up(a, 5)], shade(wallColor(e.id), -55));
  }
  else if (e.tall) {   // inner face painted in the room colour, darker on the left side
    const col = wallColor(e.id);
    poly(c, [a, b, up(b, h), up(a, h)], side === 'x0' ? shade(col, -16) : col);
    poly(c, [a, b, up(b, 5), up(a, 5)], shade(col, -45));
    if (e.deco === 'window') { const m = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); poly(c, [up(m(0.28), h * 0.35), up(m(0.72), h * 0.35), up(m(0.72), h * 0.82), up(m(0.28), h * 0.82)], '#fff7dc', '#a77b4f'); }
    if (e.deco === 'board') poly(c, [up(a, h * 0.32), up(b, h * 0.32), up(b, h * 0.8), up(a, h * 0.8)], '#3f5f4a', '#a77b4f');
  } else {        // front knee wall: we see its outer stone face
    poly(c, [a2, b2, up(b2, h), up(a2, h)], side === 'x1' ? STONE_D : STONE, '#cfc3b8');
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
  const im = part(th, n); if (!im) return null;
  let m = patCache.get(c); if (!m) patCache.set(c, (m = {}));
  return (m[th + '/' + n] ||= c.createPattern(im, 'repeat'));
}
function texFloor(c, th, s) {
  const p = pat(c, th, 'floor'); if (!p) return false;
  const T = part(th, 'floor').naturalWidth / THEMES[th].floorTiles, o = P(0, 0);   // texture px per tile; world origin keeps pieces aligned
  p.setTransform(new DOMMatrix([HW / T, HH / T, -HW / T, HH / T, o.x, o.y]));
  poly(c, [P(s.x0, s.y1), P(s.x0, s.y0), P(s.x1, s.y0), P(s.x1, s.y1)]); c.fillStyle = p; c.fill();
  c.strokeStyle = '#00000018'; c.lineWidth = 1; c.stroke();
  return true;
}
const wallPx = (th) => { const im = part(th, 'wall'); return im ? (im.naturalWidth / THEMES[th].wallTiles) * (TALL_H() / im.naturalHeight) : 25; };   // wall-plane px per tile
function texWall(c, th, e, a, b, h) {
  const p = pat(c, th, 'wall'); if (!p) return false;
  const im = part(th, 'wall'), T = im.naturalWidth / THEMES[th].wallTiles;
  const alongY = e.side === 'x0' || e.side === 'x1';
  const o = alongY ? up(P(e.x + (e.side === 'x1' ? 1 : 0), 0), h) : up(P(0, e.y + (e.side === 'y1' ? 1 : 0)), h);
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
const ISO_W = { flying_books: 1.5, candles: 0.9, portrait: 1.3, certificates: 1.4, notice: 1.0, lantern: 0.6, garland: 2.6, moon_clock: 0.85, bookshelf: 1.5, bookshelf2: 1.4, lamp: 0.6, map: 1.2, banner: 1.1, sconce: 0.7, diploma: 0.9, el_poster: 1.6, torch: 0.75, planter: 1.35, wing_poster: 1.8, birds: 1.5, circle: 1.8, mirror: 0.95, wand_rack: 1.4, chart: 1.9, painting: 0.95, poster: 1.9, round_window: 1.15, cabinet: 1.3, board: 2.6, window: 1.15, window2: 1.15, shelf: 1.8, herbs_rack: 1.6, clock: 1.15 };
function hangIso(c, th, n, s, side, t0, lo) {
  const im = part(th, 'iso_' + n); if (!im) return false;
  const d = DECOR[n], w = ISO_W[n] || d.w, sw = w * HW, sh = sw * im.naturalHeight / im.naturalWidth, vert = Math.max(sh * 0.35, sh - w * HH);
  const tm = t0 + d.w / 2, base = side === 'y0' ? P(tm, s.y0) : P(s.x0, tm), m = up(base, lo * TALL_H() + vert / 2);
  const k = c === ctx ? scale * dpr : (c._q || 1);
  c.save(); c.translate(m.x, m.y); if (side === 'y0') c.scale(-1, 1);
  c.shadowColor = 'rgba(55,35,80,0.35)'; c.shadowBlur = 3 * k; c.shadowOffsetX = (side === 'y0' ? -1.2 : 1.2) * k; c.shadowOffsetY = 1.8 * k;
  c.drawImage(im, -sw / 2, -sh / 2, sw, sh); c.restore();
  return true;
}
function hang(c, th, n, s, side, t0, lo) {
  if (THEMES[th].iso && hangIso(c, th, n, s, side, t0, lo)) return;
  const im = part(th, n); if (!im) return;
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
  const T = THEMES[th];
  let k = 0;
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
function drawProp(o) {
  const im = part(o.th, o.n); if (!im) return;
  const p = P(o.x, o.y), h = ((THEMES[o.th] && THEMES[o.th].h) || {})[o.n] || PROP_H[o.n] || 30, w = h * im.naturalWidth / im.naturalHeight;
  { const rx = Math.min(w * 0.34, h * 0.5), cy = p.y - h * 0.02; const g = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, rx);   // soft contact shadow right under the object's footprint (her report: shadows looked detached)
    g.addColorStop(0, 'rgba(60,40,80,0.20)'); g.addColorStop(1, 'rgba(60,40,80,0)'); ctx.save(); ctx.translate(p.x, cy); ctx.scale(1, 0.42); ctx.translate(-p.x, -cy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, cy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.translate(p.x, p.y + h * 0.08); if (o.flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
}
function drawRugAt(c, th, s) {   // rooms without desks (library): a rug in the middle
  const im = THEMES[th].rug && part(th, THEMES[th].rug); if (!im) return;
  const w = s.x1 - s.x0, h = s.y1 - s.y0, d = Math.min(w, h) - 1.6, m = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2 + 0.3);
  const sw = d * HW * Math.SQRT2, sh = sw * im.naturalHeight / im.naturalWidth; c.drawImage(im, m.x - sw / 2, m.y - sh / 2, sw, sh);
}
function drawRug(c, th, s, i) {
  const im = part(th, THEMES[th].rug); if (!im) return;
  const w = s.x1 - s.x0, cols = w >= 9 ? 4 : 3, rows = Math.ceil(S.classes[i].desks / cols);
  const cx = (s.x0 + s.x1) / 2, cy = s.y0 + 2.6 + (rows - 1) * 0.6, d = Math.min(w - 1.2, 3.2 + rows * 0.6);
  const m = P(cx, cy), sw = d * HW * Math.SQRT2, sh = sw * im.naturalHeight / im.naturalWidth;
  c.drawImage(im, m.x - sw / 2, m.y - sh / 2, sw, sh);
}
// ---- PERFORMANCE (her report 2026-11-21: the game lags while swiping) ----
// A themed room (floor, rug, its tall walls, wall decor with soft shadows) is rendered ONCE into its own canvas and then
// drawn with a single drawImage per frame. It is rebuilt only when the room, its desks, the map or the zoom level change.
const roomCache = {};
const roomQ = () => Math.min(3, scale * dpr);
function themeReady(th) { let n = 0; for (const k in parts) if (k.startsWith(th + '/') && parts[k].complete && parts[k].naturalWidth) n++; return n; }
function roomKey(id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id), th = themeOf(id);
  return [s.x0, s.y0, s.x1, s.y1, ci >= 0 ? S.classes[ci].desks : 0, OX, OY, roomQ().toFixed(1), themeReady(th)].join(',');
}
function drawThemedRoom(id) {
  const rc = buildRoom(id); ctx.drawImage(rc.cv, rc.x, rc.y, rc.w, rc.h);
}
function warmRooms() {   // prepares one stale room picture per frame in advance, so swiping never has to wait for it
  if (pinching) return;
  for (const id of Object.keys(SLOTS)) if (cachedRoom(id)) { const rc = roomCache[id]; if (!rc || rc.key !== roomKey(id)) { buildRoom(id); return; } }
}
function buildRoom(id) {
  const key = roomKey(id); let rc = roomCache[id];
  if (!rc || (rc.key !== key && !pinching)) {
    const s = SLOTS[id], th = themeOf(id), q = roomQ();
    const L = P(s.x0, s.y1), B = P(s.x0, s.y0), R = P(s.x1, s.y0), F = P(s.x1, s.y1);
    const x0 = L.x - 14, x1 = R.x + 14, y0 = B.y - TALL_H() - 24, y1 = F.y + 12;
    const cv = (rc && rc.cv) || document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * q); cv.height = Math.ceil((y1 - y0) * q);
    const c = cv.getContext('2d'); c._q = q;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
    drawSlot(c, id);
    for (const e of EDGES) if (e.id === id && e.tall) drawEdge(c, e);
    drawWallDecor(c, id);
    rc = roomCache[id] = { key, cv, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  return rc;
}
const cachedRoom = (id) => { if (!themeOf(id) || (id === 'DIR' && !dirBuilt())) return false; const ci = CLASS_SLOT.indexOf(id); return ci < 0 || S.classes[ci].built; };
let VIEW = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
const onScreen = (x, y, mx = 140, my = 200) => x > VIEW.x0 - mx && x < VIEW.x1 + mx && y > VIEW.y0 - my && y < VIEW.y1 + my;
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
  if (id === 'DIR' && !dirBuilt()) {
    poly(c, [L, B, R, F], '#ecd2a8'); c.setLineDash([6, 5]); c.lineWidth = 2; poly(c, [L, B, R, F], null, '#ffffffcc'); c.setLineDash([]);
    c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(center.x - 62, center.y - 30, 124, 58, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
    text('👑 Кабинет директора', center.x, center.y - 15, 9.5, '#5d4a6e', c); text('🪙 ' + fmt(DIR_COST), center.x, center.y + 3, 12, '#7b5cd6', c); text('⭐ ' + DIR_STARS, center.x, center.y + 19, 11, '#c98a00', c);
    return;
  }
  if (id === 'DORM2' && !dorm2Built()) {
    poly(c, [L, B, R, F], '#ecd2a8'); c.setLineDash([6, 5]); c.lineWidth = 2; poly(c, [L, B, R, F], null, '#ffffffcc'); c.setLineDash([]);
    c.fillStyle = '#fffaf0'; c.beginPath(); c.roundRect(center.x - 58, center.y - 26, 116, 48, 10); c.fill(); c.strokeStyle = '#b98457'; c.lineWidth = 2.5; c.stroke();
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
    if (sq < Math.max(s.x1 - s.x0, s.y1 - s.y0)) {
      poly(c, [L, B, R, F], A.floor || col.floor, '#00000012');
      c.strokeStyle = '#00000014'; c.lineWidth = 1;
      for (let k = 1; k < s.y1 - s.y0; k++) { const a = P(s.x0, s.y0 + k), b = P(s.x1, s.y0 + k); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    }
    const L2 = P(s.x0, s.y0 + sq), R2 = P(s.x0 + sq, s.y0), F2 = P(s.x0 + sq, s.y0 + sq);
    const u = [A.R[0] - A.L[0], A.R[1] - A.L[1]], v = [A.F[0] - A.L[0], A.F[1] - A.L[1]];
    const U = [R2.x - L2.x, R2.y - L2.y], V = [F2.x - L2.x, F2.y - L2.y];
    const det = u[0] * v[1] - u[1] * v[0];
    const ia = v[1] / det, ib = -u[1] / det, ic = -v[0] / det, id2 = u[0] / det;      // inverse of [u v]
    const m11 = U[0] * ia + V[0] * ib, m12 = U[0] * ic + V[0] * id2, m21 = U[1] * ia + V[1] * ib, m22 = U[1] * ic + V[1] * id2;
    const e = L2.x - (m11 * A.L[0] + m12 * A.L[1]), f = L2.y - (m21 * A.L[0] + m22 * A.L[1]);
    c.save();
    // painted rooms are drawn whole (no cut): their walls are the reference height for the built ones
    c.transform(m11, m21, m12, m22, e, f); c.drawImage(art, 0, 0); c.restore();

  } else if (themeOf(id) && texFloor(c, themeOf(id), s)) {
    if (ci >= 0) drawRug(c, themeOf(id), s, ci); else drawRugAt(c, themeOf(id), s);
    const rn = THEMES[themeOf(id)].runner;
    if (rn) { poly(c, [P(s.x0 + rn.u0, s.y0), P(s.x0 + rn.u1, s.y0), P(s.x0 + rn.u1, s.y1), P(s.x0 + rn.u0, s.y1)], rn.color, '#c9849488'); }
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
  const g = P(15, GATE_TILE.y - 1), g2 = P(18, GATE_TILE.y - 1);
  c.strokeStyle = '#6c4fd1'; c.lineWidth = 5; c.beginPath(); c.moveTo(g.x, g.y); c.lineTo(g.x, g.y - 34); c.lineTo(g2.x, g2.y - 34); c.lineTo(g2.x, g2.y); c.stroke();
  text('ВОРОТА', (g.x + g2.x) / 2, (g.y + g2.y) / 2 - 40, 9, '#5a3fb0', c);
}
function drawSign(c, id) {
  const s = SLOTS[id], ci = CLASS_SLOT.indexOf(id), B = P(s.x0, s.y0);
  if (id === 'GARDEN' || (ci >= 0 && !S.classes[ci].built) || (id === 'DORM2' && !dorm2Built()) || (id === 'DIR' && !dirBuilt())) return;
  const name = ci >= 0 ? CLASSES[ci].emoji + ' ' + CLASSES[ci].name : id === 'REC' ? '🛎️ Приёмная' : id === 'LIB' ? '📚 Библиотека' : id === 'DIR' ? '👑 Кабинет директора' : id === 'DORM2' ? '🛏️ Спальня 2' : '🛏️ Спальня';
  const sp = id === 'REC' ? P(s.x0 + 7.5, s.y0 + 7) : up(B, (s.cut.left && s.cut.right) ? 14 : WALLH * 0.72 + 12);
  const fs = 12, hgt = 22;
  c.font = `800 ${fs}px ui-rounded,"Nunito","Segoe UI",sans-serif`; const tw = c.measureText(name).width + 22;
  const bg = ci >= 0 ? CLASSES[ci].wall : SIGN_BG[id] || '#ffffff';
  c.save(); c.shadowColor = '#3a2f4a55'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = bg; c.beginPath(); c.roundRect(sp.x - tw / 2, sp.y - hgt / 2, tw, hgt, 11); c.fill(); c.restore();
  c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.roundRect(sp.x - tw / 2, sp.y - hgt / 2, tw, hgt, 11); c.stroke();
  text(name, sp.x, sp.y + 0.5, fs, '#2e2340', c);
  signRects.push({ id, x0: sp.x - tw / 2, y0: sp.y - hgt / 2, x1: sp.x + tw / 2, y1: sp.y + hgt / 2 });
  if (ci >= 0) {   // how many wait for this class in the dorm: shows the bottleneck at a glance
    const z = sleepersFor(ci);
    if (z > 0) {
      const bx = sp.x + tw / 2 + 4, t = `💤 ${z} ждут`; c.font = '800 11px ui-rounded,"Nunito","Segoe UI",sans-serif';
      const bw = c.measureText(`${z} ждут`).width + 30;
      c.save(); c.shadowColor = '#3a2f4a44'; c.shadowBlur = 5; c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(bx, sp.y - 11, bw, 22, 11); c.fill(); c.restore();
      c.strokeStyle = '#5b7fd6'; c.lineWidth = 2; c.beginPath(); c.roundRect(bx, sp.y - 11, bw, 22, 11); c.stroke();
      text(t, bx + bw / 2, sp.y + 0.5, 11, '#3d5fb8', c);
      signRects.push({ id, x0: bx, y0: sp.y - 11, x1: bx + bw, y1: sp.y + 11 });   // the badge opens the class too
    }
  }
}
const SIGN_BG = { REC: '#d9c4f7', DORM: '#c2d8f7', LIB: '#f0cf9f', DIR: '#f5d77a' };
let signRects = [];   // tappable room signs of the last frame, world coords
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
  const bk = a.back && sprites[a.sp + '_back'], im = bk && bk.complete && bk.naturalWidth ? bk : sprites[a.sp];
  const s = P(x, y);
  const walking = (a.path && a.path.length > 0) || a._panic;
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
const director = { sp: 'starwhisker', ph: 0.9, flip: true, path: [] };

// ======================= guided tour =======================
// Each step: camera focus in tile coords (null = stay), title and text (Russian UI).
const TOUR = [
  { at: () => [14.5, SLOTS.REC.y0 + 4], title: 'Привет, директор! 👋', text: 'Это твоя Школа магии. Сюда приходят маленькие волшебные зверьки, чтобы учиться. Школа работает сама, даже когда игра закрыта. Давай покажу, как тут всё устроено.' },
  { at: () => [GATE_TILE.x, GATE_TILE.y - 1], title: 'Ворота', text: 'Новые ученики приходят через ворота. Чем лучше «Объявления о школе» (улучшаются в приёмной), тем чаще они приходят.' },
  { at: () => [OFFICER.x + 0.3, OFFICER.y], title: 'Приёмная и секретарь', text: 'Секретарь в розовой шляпе записывает новичков. Они стоят к ней в очереди, оранжевый кружок над ней — запись идёт. За каждого записанного ты получаешь взнос 🪙. Нажми на приёмную, чтобы сделать секретаря быстрее.' },
  { at: () => [14.5, SLOTS.REC.y0 - 4], title: 'Общий коридор', text: 'Записавшись, ученик идёт по коридору в свой класс. Все классы соединены этим коридором: ученики проходят их по порядку, один за другим.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Класс и урок', text: 'В классе ученик садится за парту. Учитель в фиолетовой шляпе ведёт урок. Зелёный кружок над учеником — сколько осталось до конца урока.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Экзамен', text: 'После урока экзамен. Сдал — платит за обучение 🪙 и идёт в следующий класс. Шанс сдать зависит от учителя и обстановки. Нажми на класс: там можно улучшить учителя, добавить парты, сократить урок и купить предметы.' },
  { at: () => [(SLOTS.LIB.x0 + SLOTS.LIB.x1) / 2, (SLOTS.LIB.y0 + SLOTS.LIB.y1) / 2], title: 'Библиотека 📚', text: 'Не сдал экзамен — идёт в библиотеку готовиться (жёлтый кружок). Потом возвращается в класс и пересдаёт. После подготовки урок у него короче, а шанс сдать выше.' },
  { at: () => { const [, h] = slotOf(1).door; return [h[0] + 0.5, h[1] + 1]; }, title: 'Очередь у класса', text: 'У двери каждого класса может ждать до 6 учеников. Если все места за партами заняты и очередь полная, ученик расстраивается 😢 и идёт в спальню.' },
  { at: () => [22, SLOTS.DORM.y0 + 3], title: 'Спальня и консьержка 🛏️', text: 'В спальне консьержка в зелёной шляпе записывает гостя, и он спит 💤, пока в его классе не освободится место. Если и кроватей нет — ученик уходит из школы 💔. Нажми на спальню, чтобы купить кровати.' },
  { at: () => [14.5, SLOTS.EXAM.y0 + 3], title: 'Финальный экзамен 📜', text: 'Кто прошёл все открытые классы, идёт в Экзаменационный зал в самом конце коридора и сдаёт финальный экзамен. Не сдал — готовится в библиотеке и пересдаёт. Нажми на зал, чтобы улучшить экзаменатора и обстановку.' },
  { at: () => [22, SLOTS.GARDEN.y0 + 3], title: 'Выпускники 🎓', text: 'Сдал финальный экзамен — выпускник! Он идёт в сад и улетает на своих крылышках. Число выпускников видно вверху экрана.' },
  { at: () => [(slotOf(2).x0 + slotOf(2).x1) / 2, (slotOf(2).y0 + slotOf(2).y1) / 2], title: 'Новые классы', text: 'На пустых местах можно построить новые классы — нажми на табличку с ценой. Чем больше классов, тем больше ученики платят за обучение.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Происшествия 💥', text: 'Иногда в классе что-то случается: взорвался котёл, растения опутали парты, учитель простыл. Ученики носятся по классу, урок стоит, над классом горит «Нажми!». Нажми на класс — и всё снова в порядке. Если не трогать, через 10 минут пройдёт само, но школа потеряет монеты.' },
  { at: () => [(slotOf(0).x0 + slotOf(0).x1) / 2, (slotOf(0).y0 + slotOf(0).y1) / 2], title: 'Настроение 😊', text: 'Долгие очереди и ожидание в спальне огорчают учеников 😟, уроки и библиотека радуют 😄. Весёлые сдают экзамены лучше. Совсем грустный ученик 😭 может уйти домой. Добавляй парты и сокращай уроки, чтобы никто долго не ждал.' },
  { at: null, title: 'Инспектор и звёзды ⭐', text: 'Раз в 12 минут приходит инспектор 🧐 и проверяет что-то одно: настроение, очереди, происшествия, экзамены или заработок. За 40 секунд слева вверху появится жёлтая карточка — там написано, что он будет проверять. Прошла проверку — получаешь звезду школы: она даёт +3% к плате за уроки, а звёзды нужны для новых классов.' },
  { at: null, title: 'Спокойный режим 😌', text: 'Не хочется проверок? В ⚙️ можно включить спокойный режим — инспектор не будет приходить. Когда захочешь заработать звёзды, просто выключи его.' },
  { at: null, title: 'Последнее 💡', text: 'Вверху: 🪙 монеты, 📈 доход в минуту, 🎓 выпускники. Слева под ними ⭐ звёзды школы и 👥 сколько учеников сейчас в школе (нажми — увидишь, где они). Справа внизу 📋 задания: кнопка «Выполнить» сама откроет нужную комнату. Слева внизу 🗺️ другие миры. Нажми на зверька — увидишь, что он делает. Повторить обучение можно в ⚙️. Удачи, директор!' },
];
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
  tourStep = i;
  const el = $('#tour');
  if (i < 0 || i >= TOUR.length) { el.classList.add('hidden'); tourStep = -1; S.tourDone = true; save(); return; }
  const st = TOUR[i];
  el.innerHTML = emojiHtml(`<div class="tour-card"><div class="tour-top"><b>${st.title}</b><span class="muted">${i + 1}/${TOUR.length}</span></div>
    <p>${st.text}</p><div class="tour-btns"><button class="btn ghost small" data-tour-skip>Пропустить</button>
    ${i > 0 ? '<button class="btn ghost small" data-tour-back>← Назад</button>' : ''}<button class="btn small" data-tour-next>${i === TOUR.length - 1 ? 'Понятно!' : 'Дальше →'}</button></div></div>`);
  el.classList.remove('hidden');
  const at = tourAt(st); if (at) requestAnimationFrame(() => focusTile(at[0], at[1]));
}

// ======================= tap on a creature: what is it doing? =======================
function statusOf(a) { return statusOf0(a) + ` · настроение ${moodFace(moodOf(a))} ${Math.round(moodOf(a))}%`; }
function statusOf0(a) {
  const cn = (i) => (i >= 0 && CLASSES[i] ? `«${CLASSES[i].name}»` : 'класс');
  const g = a.goal || {};
  if (queue.includes(a)) return a === processing ? 'записывается в школу у секретаря' : 'стоит в очереди в приёмной';
  if (a.state === 'study' && incOf(a.c)) return `урок остановлен: ${incInfo(a.c)[1]} — нажми на класс!`;
  if (a.state === 'study') return `учится: ${cn(a.c)}, до экзамена ${Math.max(0, Math.ceil(a.dur - a.t))} с`;
  if (a.state === 'wait' || a.state === 'walkwait') return `ждёт свободной парты: ${cn(a.c)}`;
  if (a.state === 'read' || g.t === 'l') return `готовится к пересдаче в библиотеке (${cn(g.i)})`;
  if (a.state === 'sleep') return `спит в спальне, ждёт места: ${cn(g.i)}`;
  if (a.state === 'dline' || a.state === 'checkin' || g.t === 'd') return 'записывается в спальню у консьержки';
  if (g.t === 'g' || a.state === 'fly') return 'выпускник! 🎓 идёт в сад';
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
  ctx.drawImage(stat, 0, 0, stat.width, stat.height, (MARGIN * scale - scroller.scrollLeft) * dpr, (MARGIN * scale - scroller.scrollTop) * dpr, SW * scale * dpr, SH * scale * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -scroller.scrollLeft * dpr, -scroller.scrollTop * dpr);

  const list = [];
  const zone = (x, y) => { const id = regAt(Math.floor(x), Math.floor(y)); if (id && id !== 'hall') { const s = SLOTS[id]; return (s.x0 + s.x1 + s.y0 + s.y1) / 2; } return x + y; };
  const add = (x, y, draw, bias = 0) => { const m = P(x, y); if (onScreen(m.x, m.y)) list.push({ k1: zone(x, y), k2: x + y + bias, draw }); };   // off-screen things are skipped
  VIEW = { x0: scroller.scrollLeft / scale, y0: scroller.scrollTop / scale, x1: (scroller.scrollLeft + scroller.clientWidth) / scale, y1: (scroller.scrollTop + scroller.clientHeight) / scale };
  const slotVisible = (s) => { const L = P(s.x0, s.y1), R = P(s.x1, s.y0), B = P(s.x0, s.y0), F = P(s.x1, s.y1); return R.x > VIEW.x0 - 40 && L.x < VIEW.x1 + 40 && F.y > VIEW.y0 - 40 && B.y - TALL_H() < VIEW.y1 + 40; };
  for (const id of Object.keys(SLOTS)) { const s = SLOTS[id]; if (!slotVisible(s)) continue; list.push({ k1: (s.x0 + s.x1 + s.y0 + s.y1) / 2, k2: -1e9, draw: cachedRoom(id) ? () => drawThemedRoom(id) : () => drawSlot(ctx, id) }); }
  list.push({ k1: GATE_TILE.x + GATE_TILE.y - 1, k2: 0, draw: () => drawGate(ctx) });
  for (const e of EDGES) {
    const painted = e.id !== 'hall' && e.tall && WORLD === 1 && !!arts[CLASS_SLOT.indexOf(e.id) >= 0 ? CLASSES[CLASS_SLOT.indexOf(e.id)].id : e.id]?.naturalWidth;   // painted rooms: only the cap on top of their own walls
    if (e.id === 'DORM2' && !dorm2Built()) continue;
    if (e.id === 'DIR' && !dirBuilt()) continue;
    if (e.id !== 'hall' && CLASS_SLOT.indexOf(e.id) >= 0 && !S.classes[CLASS_SLOT.indexOf(e.id)].built) continue;
    const sl = SLOTS[e.id];
    const k1 = e.id === 'hall' ? e.x + e.y : (sl.x0 + sl.x1 + sl.y0 + sl.y1) / 2;
    if (painted) { const sl0 = SLOTS[e.id], sq = Math.min(sl0.x1 - sl0.x0, sl0.y1 - sl0.y0); if (e.x < sl0.x0 + sq && e.y < sl0.y0 + sq) continue; }
    if (e.tall && cachedRoom(e.id)) continue;   // already inside the room's cached picture
    { const m = P(e.x + 0.5, e.y + 0.5); if (!onScreen(m.x, m.y)) continue; }
    list.push({ k1, k2: e.tall ? -1e9 + 1 : 1e9, draw: () => drawEdge(ctx, e) });
  }
  for (let i = 0; i < CLASSES.length; i++) {
    const st = S.classes[i]; if (!st.built) continue;
    const s = slotOf(i);
    if (!isOpen(i)) {
      const c = P((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2), left = Math.max(0, Math.ceil((st.buildEnd - Date.now()) / 1000));
      add((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, () => { emoji('🏗️', c.x, c.y - 14, 30); ctx.fillStyle = '#fffaf2ee'; rr(c.x - 40, c.y + 8, 80, 18, 9); ctx.fill(); text(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, c.x, c.y + 17, 11, '#5a3fb0'); });
      continue;
    }
    const tp = teacherWalk(i);   // the teacher strolls along the front of the class as if explaining (her wish 2026-11-21)
    { const own = WORLD === 1 && STAFF_ART[CLASSES[i].id] && sprites['staff_' + CLASSES[i].id];
      if (own && own.complete && own.naturalWidth) { const t1 = { sp: 'staff_' + CLASSES[i].id, ph: performance.now() / 1000 + i, flip: tp.left, path: tp.moving ? [1] : [] }; add(tp.x, tp.y, () => { const hh = STAFF_H[STAFF_ART[CLASSES[i].id]] || 58;
        { const q = P(tp.x, tp.y), g = ctx.createRadialGradient(q.x, q.y - hh * 0.5, 2, q.x, q.y - hh * 0.5, hh * 0.75); g.addColorStop(0, STAFF_GLOW[STAFF_ART[CLASSES[i].id]] || STAFF_GLOW_ALL); g.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y - hh * 0.5, hh * 0.75, 0, Math.PI * 2); ctx.fill(); }   // a soft glow so a dark professor stands out in a dark room
        drawCreature(t1, tp.x, tp.y, hh); }); }   // own drawn professor (her approval, one at a time)
      else { const t0 = staff[(i + 1) % staff.length], tch = { ...t0, back: frontFacing(i), flip: tp.left, path: tp.moving ? [1] : [], ph: performance.now() / 1000 + i }; add(tp.x, tp.y, () => (teacherGlow(tp, 42), drawCreature(tch, tp.x, tp.y, 42, (x, y) => drawHat(x, y - 40, '#6c4fd1')))); } }
    const thI = themeOf(CLASS_SLOT[i]), stations = thI && THEMES[thI].stations;   // potions: a little cauldron instead of a desk
    for (let d = 0; d < st.desks; d++) { const p = deskPos(i, d); if (stations && part(thI, stations[d % stations.length])) { const o = { n: stations[d % stations.length], x: p.x, y: p.y, th: thI }; add(p.x, p.y, () => drawProp(o)); } else add(p.x, p.y, () => drawDesk(p)); }
    for (const o of roomProps(i)) add(o.x, o.y, () => drawProp(o));
    CLASSES[i].items.forEach((it, k) => {
      if (!st.items[k]) return;
      const spots = [[s.x0 + 0.7, s.y0 + 0.7], [s.x0 + 5.3, s.y0 + 0.7], [s.x0 + 0.7, s.y0 + 5.2], [s.x0 + 5.3, s.y0 + 5.2]];
      const p = P(spots[k][0], spots[k][1]);
      add(spots[k][0], spots[k][1], () => emoji(it.emoji, p.x, p.y - 8, 14 + Math.min(8, st.items[k] / 3)));
    });
  }
  // library (themed): an armchair at every open reading place and a few things around
  if (SLOTS.DIR && dirBuilt()) { const s = SLOTS.DIR, dx = s.x0 + 2.0, dy = s.y0 + 1.75; add(dx, dy, () => drawCreature(director, dx, dy, 36, (x, y) => drawHat(x, y - 34, '#e0a100'))); }   // the director behind the desk
  for (const rid of ['LIB', 'REC', 'DORM', 'DORM2', 'DIR']) {
    const th = themeOf(rid); if (!th || (rid === 'DORM2' && !dorm2Built()) || (rid === 'DIR' && !dirBuilt())) continue;
    const T = THEMES[th], s = SLOTS[rid];
    if (rid === 'LIB') LIB_SPOTS.slice(0, libSeats()).forEach((q, k) => { const o = { n: T.seats[k % T.seats.length], x: q.x, y: q.y - 0.02, th }; add(o.x, o.y, () => drawProp(o)); });
    if (T.beds) { const from = rid === 'DORM' ? 0 : DORM_STRIDE, n = rid === 'DORM' ? beds1() : beds2();
      DORM_SPOTS.slice(from, from + n).forEach((q, k) => { const o = { n: T.beds[k % T.beds.length], x: q.x, y: q.y - 0.02, th }; add(o.x, o.y, () => drawProp(o)); }); }
    for (const o of (T.extras ? T.extras(s) : [])) { const oo = { ...o, th }; add(oo.x, oo.y, () => drawProp(oo)); }
  }
  // reception desk + officer
  add(CONCIERGE.x, CONCIERGE.y, () => drawCreature(staffSprite('concierge') ? { ...concierge, sp: 'staff_concierge', flip: false } : concierge, CONCIERGE.x, CONCIERGE.y, staffSprite('concierge') ? 50 : 34, (x, y) => {
    if (!staffSprite('concierge')) drawHat(x, y - 32, '#2f9e7a');
    if (checkin) ring(x + 18, y - 30, Math.min(1, checkinT / checkinTime()), '#2f9e7a');
  }));
  if (!themeOf('DORM')) add(CONCIERGE.x + 0.75, CONCIERGE.y, () => {
    const a = P(DS.x0 + 1.1, DS.y0 + 0.8), b = P(DS.x0 + 1.6, DS.y0 + 0.8), cc = P(DS.x0 + 1.6, DS.y0 + 2.1), d = P(DS.x0 + 1.1, DS.y0 + 2.1), h = 11;
    poly(ctx, [d, cc, up(cc, h), up(d, h)], '#7d8fb8'); poly(ctx, [cc, b, up(b, h), up(cc, h)], '#6a7ca5'); poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#a9b9dd', '#5d6f98');
    const m = P(DS.x0 + 1.35, DS.y0 + 1.2); emoji('🗝️', m.x, m.y - 15, 10); const n = P(DS.x0 + 1.35, DS.y0 + 1.8); emoji('📒', n.x, n.y - 15, 10);
  });
  const so = secretaryPos();
  add(so.x, so.y, () => drawCreature(staffSprite('secretary') ? { ...officer, sp: 'staff_secretary', flip: so.left, path: so.moving ? [1] : [] } : officer, so.x, so.y, staffSprite('secretary') ? 52 : 34, (x, y) => {
    if (!staffSprite('secretary')) drawHat(x, y - 32, '#d14f8f');
    if (processing) ring(x + 18, y - 30, Math.min(1, procT / procTime()), '#ff8a3d');
  }));
  if (!themeOf('REC') && !(arts.REC && arts.REC.naturalWidth)) add(OFFICER.x + 0.9, OFFICER.y, () => {
    const a = P(REC.x0 + 1.5, REC.y0 + 3.1), b = P(REC.x0 + 2.1, REC.y0 + 3.1), cc = P(REC.x0 + 2.1, REC.y0 + 5.9), d = P(REC.x0 + 1.5, REC.y0 + 5.9), h = 12;
    poly(ctx, [d, cc, up(cc, h), up(d, h)], '#9a6a41'); poly(ctx, [cc, b, up(b, h), up(cc, h)], '#86592f'); poly(ctx, [up(a, h), up(b, h), up(cc, h), up(d, h)], '#c99a68', '#8a5f3a');
    const m = P(REC.x0 + 1.8, REC.y0 + 3.6); emoji('📜', m.x, m.y - 16, 11); const n = P(REC.x0 + 1.8, REC.y0 + 5.4); emoji('🔔', n.x, n.y - 16, 11);
  });
  for (const a of agents) {
    // an incident in the class: its students leave their places and rush around the room in a panic (her wish 2026-11-21)
    const pn = panicPos(a), ax = pn ? pn.x : a.x, ay = pn ? pn.y : a.y;
    if (a.state !== 'fly') a.z = !pn && a.state === 'study' && !(a.path && a.path.length) && sitsOn(a.c) ? 9 : (a.state === 'read' && !(a.path && a.path.length) && themeOf('LIB') ? 6 : a.state === 'sleep' && !(a.path && a.path.length) && themeOf('DORM') ? 4 : 0);   // on a cloud / in an armchair
    if (pn) { a._panic = true; a.flip = pn.left; a.back = pn.up; } else if (a._panic) { a._panic = false; if (a.state === 'study') faceTeacher(a, a.c); }
    const draw = () => drawCreature(a, ax, ay, 30, (x, y) => {
      if (pn) { if (Math.sin(a.ph * 3 + a.id) > 0.2) emoji(a.id % 3 ? '❗' : '😱', x + 2, y - 36, 12); return; }
      if (a.state === 'study' && !a.path.length) ring(x + 13, y - 32, Math.min(1, a.t / a.dur));
      if (a.state === 'fly') emoji('✨', x - 12, y - 6, 10);
      if (a.state === 'read') { emoji('📚', x - 12, y - 30, 11); ring(x + 13, y - 32, Math.min(1, a.t / a.dur), '#e0a100'); }
      if (a.state === 'sleep') emoji('💤', x + 12, y - 30 - Math.abs(Math.sin(a.ph * 1.5)) * 4, 11);
      if (moodOf(a) < 35 && a.state !== 'study') emoji(moodFace(moodOf(a)), x - 13, y - 31, 11);   // sad ones show it
      else if (moodOf(a) >= 65 && a.state !== 'sleep') {   // happy ones show it too, now and then (her wish 2026-11-21)
        const cyc = (performance.now() / 1000 + a.id * 2.3) % 7;
        if (cyc < 1.6) { const f = moodOf(a) >= 90 ? ['🥰', '😄', '💖'][a.id % 3] : moodOf(a) >= 78 ? ['😄', '😊'][a.id % 2] : '🙂'; emoji(f, x - 13, y - 31 - Math.sin(cyc / 1.6 * Math.PI) * 4, 11); }
      }
    });
    if (a.state === 'fly') list.push({ k1: 1e9, k2: 0, draw }); else add(ax, ay, draw);
  }
  list.sort((p, q) => p.k1 - q.k1 || p.k2 - q.k2).forEach((o) => o.draw());
  // x-ray: every creature is drawn once more, faintly, on top: the ones hidden behind a wall show through as ghosts
  ctx.globalAlpha = 0.38;
  for (const a of agents) if (a.state !== 'fly') { const pn = panicPos(a), gx = pn ? pn.x : a.x, gy = pn ? pn.y : a.y, m = P(gx, gy); if (onScreen(m.x, m.y)) drawCreature(a, gx, gy, 30); }
  ctx.globalAlpha = 1;
  signRects = [];
  for (const id of Object.keys(SLOTS)) drawSign(ctx, id);
  drawIncidents();
  if (tourStep >= 0 && tourAt(TOUR[tourStep])) { const ta = tourAt(TOUR[tourStep]), f = P(ta[0], ta[1]), k = 1 + 0.12 * Math.sin(performance.now() / 250); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(f.x, f.y, 46 * k, 28 * k, 0, 0, Math.PI * 2); ctx.stroke(); }
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
let panelHtml = '';
function openPanel(fn) { $('#tour').classList.add('under-panel'); panel = fn; const sh = $('#sheet'); sh.style.transform = ''; panelHtml = emojiHtml(fn()); sh.innerHTML = panelHtml; sh.scrollTop = 0; $('#sheet-wrap').classList.remove('hidden'); updateHud(); }
function closePanel() { panel = null; $('#sheet-wrap').classList.add('hidden'); $('#tour').classList.remove('under-panel'); }   // the tour card hides while a panel is open
// Update the DOM in place: unchanged nodes (icons!) stay, only changed text and attributes are written.
// A fresh innerHTML re-created every <img> and on phones the icons blinked on each refresh.
function morph(el, html) {
  const t = document.createElement('template'); t.innerHTML = html;
  morphChildren(el, t.content);
}
function morphChildren(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let k = 0; k < bn.length; k++) {
    const x = an[k], y = bn[k];
    if (!x) { a.appendChild(y.cloneNode(true)); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y.cloneNode(true), x); continue; }
    if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType !== 1) continue;
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.nodeName === 'TEXTAREA' || x.nodeName === 'INPUT') continue;   // keep what the player typed
    morphChildren(x, y);
  }
  for (let k = an.length - 1; k >= bn.length; k--) a.removeChild(an[k]);
}
function refreshPanel() {   // re-render only when the content really changed (a fresh innerHTML every second made the icons blink)
  if (panel) { const h = emojiHtml(panel()); if (h !== panelHtml) { panelHtml = h; const sc = $('#sheet').scrollTop; morph($('#sheet'), h); $('#sheet').scrollTop = sc; } }
  updateHud();
}

function classPanel(i) {
  return () => {
    const C = CLASSES[i], st = S.classes[i];
    if (!isOpen(i)) {
      const left = Math.max(0, Math.ceil((st.buildEnd - Date.now()) / 1000));
      return `<div class="sh-head"><span class="remoji big">🏗️</span><div><h2>${C.name}</h2><div class="muted">Идёт стройка: ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div></div><button class="x" data-close>✕</button></div>`;
    }
    let h = `<div class="sh-head"><span class="remoji big">${C.emoji}</span><div><h2>${C.name}</h2><div class="muted">${C.final ? 'Последний шаг: сдал — стал выпускником 🎓, не сдал — в библиотеку' : `Урок ${i + 1} из ${CLASSES.length - 1}`}</div></div><button class="x" data-close>✕</button></div>
      <div class="stats3"><div><span>🪙</span><b>${fmt(tuition(i))}</b><i>плата</i></div><div><span>🎯</span><b>${pct(success(i))}</b><i>сдают экзамен</i></div><div><span>⏱️</span><b>${sec(lessonTime(i))}</b><i>урок</i></div></div>
      ${overflow(i) > 0 ? `<p class="muted">🎯 Шанс уже максимальный (${Math.round(MAX_CHANCE * 100)}%). Всё, что сверху (+${Math.round(overflow(i) * 100)}%), превращается в плату: <b>+${Math.round(overflow(i) * 200)}%</b>.</p>` : ''}
      <p class="muted">Очередь у двери: <b>${waitList[i].length}/${MAX_WAIT}</b>${sleepersFor(i) ? ` · в спальне ждут место: <b>${sleepersFor(i)}</b> 💤 — добавь парты или сократи урок, чтобы они быстрее вернулись` : ''}</p>`;
    h += `<div class="card up"><span class="remoji">🧙</span><div class="grow"><b>Учитель: ${C.teacher}</b><div class="muted">ур. ${st.teacher}/${MAX_TEACHER_LEVEL} · +5% платы и +1,5% к экзамену</div></div>
      ${st.teacher >= MAX_TEACHER_LEVEL ? '<span class="done">макс.</span>' : costBtn('↑', teacherCost(i), 'teacher', `data-i="${i}"`)}</div>`;
    h += `<div class="card up"><span class="remoji">🪑</span><div class="grow"><b>Парты: ${st.desks}/${maxDesksOf(i)}</b><div class="muted">больше учеников за раз</div></div>
      ${st.desks >= maxDesksOf(i) ? `<span class="done">${sizeOf(i) < MAX_SIZE && !C.final ? 'расширь класс' : 'макс.'}</span>` : costBtn('+1', deskCost(i), 'desk', `data-i="${i}"`)}</div>
    ${C.final ? '' : `<div class="card up"><span class="remoji">📐</span><div class="grow"><b>Расширить класс</b> <span class="muted">${['маленький', 'средний', 'большой'][sizeOf(i) - 1]}</span><div class="muted">${sizeOf(i) < MAX_SIZE ? `комната станет больше: до ${6 + 4 * sizeOf(i)} парт` : 'класс уже самый большой'}</div></div>
      ${sizeOf(i) >= MAX_SIZE ? '<span class="done">макс.</span>' : costBtn('↑', expandCost(i), 'expand', `data-i="${i}"`)}</div>`}`;
    h += `<div class="card up"><span class="remoji">⏱️</span><div class="grow"><b>Урок короче</b><div class="muted">ур. ${st.time}/${MAX_TIME_LEVEL} · −8% времени</div></div>
      ${st.time >= MAX_TIME_LEVEL ? '<span class="done">макс.</span>' : costBtn('↑', timeCost(i), 'time', `data-i="${i}"`)}</div>`;
    h += '<h3>Обстановка класса</h3>';
    C.items.forEach((it, k) => {
      const lv = st.items[k];
      h += `<div class="card up"><span class="remoji">${it.emoji}</span><div class="grow"><b>${it.name}</b> <span class="muted">ур. ${lv}</span>
        <div class="muted">${it.kind === 'tuition' ? '+8% платы' : rawSuccess(i) >= MAX_CHANCE ? `+2% платы (шанс уже ${Math.round(MAX_CHANCE * 100)}%)` : '+1% к экзамену'} за уровень</div><div class="lvbar"><i style="width:${lv / MAX_ITEM_LEVEL * 100}%"></i></div></div>
        ${lv >= MAX_ITEM_LEVEL ? '<span class="done">макс.</span>' : costBtn(lv ? '↑' : 'Купить', itemCost(i, k), 'item', `data-i="${i}" data-k="${k}"`)}</div>`;
    });
    return h;
  };
}
function dormPanel() {
  const u = dormUp(), used = dorm.filter(Boolean).length;
  return `<div class="sh-head"><span class="remoji big">🛏️</span><div><h2>Спальня</h2><div class="muted">Здесь ждут те, кому не хватило места у класса</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🛏️</span><b>${used}/${bedCount()}</b><i>кровати</i></div><div><span>📝</span><b>${sec(checkinTime())}</b><i>запись</i></div><div><span>💔</span><b>${S.stats.left || 0}</b><i>ушли из школы</i></div></div>
    <div class="card up"><span class="remoji">🛏️</span><div class="grow"><b>Больше кроватей</b> <span class="muted">${bedCount()}/${maxBeds()}</span><div class="muted">${bedCount() >= maxBeds() && !dorm2Built() ? 'первая спальня заполнена — построй вторую' : '+1 кровать: меньше зверьков уходит'}</div></div>
      ${bedCount() >= maxBeds() ? '<span class="done">макс.</span>' : costBtn('+1', bedsCost(), 'beds')}</div>
    <div class="card up"><span class="remoji">🏗️</span><div class="grow"><b>Вторая спальня</b><div class="muted">${dorm2Built() ? 'построена' : 'сразу +9 кроватей'}</div></div>
      ${dorm2Built() ? '<span class="done">✓ есть</span>' : costBtn('Построить', DORM2_COST, 'dorm2')}</div>
    ${[1, 2].filter((k) => k === 1 || dorm2Built()).map((k) => `<div class="card up"><span class="remoji">📐</span><div class="grow"><b>Расширить ${k === 1 ? 'первую' : 'вторую'} спальню</b> <span class="muted">${['маленькая', 'средняя', 'большая'][dormSize(k) - 1]}</span><div class="muted">${dormSize(k) < 3 ? `место до ${4 * (dormRows(k) + 2)} кроватей` : 'уже самая большая'}</div></div>
      ${dormSize(k) >= 3 ? '<span class="done">макс.</span>' : costBtn('↑', dormExpandCost(k), 'dormexp', `data-k="${k}"`)}</div>`).join('')}
    <div class="card up"><span class="remoji">🗝️</span><div class="grow"><b>Консьержка быстрее</b> <span class="muted">ур. ${u.conc}/${MAX_CONC}</span><div class="muted">−15% времени на запись</div></div>
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
    <div class="card up"><span class="remoji">⏳</span><div class="grow"><b>Быстрее подготовка</b> <span class="muted">ур. ${u.speed}/${MAX_LIB_LVL}</span><div class="muted">−12% времени за книгами</div></div>
      ${u.speed >= MAX_LIB_LVL ? '<span class="done">макс.</span>' : costBtn('↑', libSpeedCost(), 'libspeed')}</div>
    <div class="card up"><span class="remoji">💡</span><div class="grow"><b>Лучше подготовка</b> <span class="muted">ур. ${u.bonus}/${MAX_LIB_LVL}</span><div class="muted">+3% к шансу сдать после библиотеки</div></div>
      ${u.bonus >= MAX_LIB_LVL ? '<span class="done">макс.</span>' : costBtn('↑', libBonusCost(), 'libbonus')}</div>
    <p class="muted">После библиотеки урок у ученика в 2 раза короче, а шанс сдать выше на ${Math.round(libBonus() * 100)}%.</p>`;
}
function dirBuildPanel() {
  const st = schoolStars(), ok = st >= DIR_STARS;
  return `<div class="sh-head"><span class="remoji big">👑</span><div><h2>Кабинет директора</h2><div class="muted">Решения для всей школы</div></div><button class="x" data-close>✕</button></div>
    <p>Здесь ты будешь принимать решения для всей школы: правила возврата взноса ушедшим, забота об учениках, дежурный завхоз и связи с инспекцией.</p>
    <p class="muted">Нужно: 🪙${fmt(DIR_COST)} и звёзды школы <b>⭐ ${st}/${DIR_STARS}</b>${ok ? '' : ' — звёзды дают проверки инспектора 🧐'}.</p>
    <button class="btn wide" data-cost="${DIR_COST}" data-act="dirbuild" ${ok ? '' : 'disabled'}>Построить <span class="cost">🪙${fmt(DIR_COST)} ⭐${DIR_STARS}</span></button>`;
}
function dirPanel() {
  let h = `<div class="sh-head"><span class="remoji big">👑</span><div><h2>Кабинет директора</h2><div class="muted">Решения для всей школы</div></div><button class="x" data-close>✕</button></div>
    <p class="muted">Взнос новичка сейчас 🪙${fmt(fee())}. Кто уходит расстроенным, получает его назад: ${Math.round(refundRate() * 100)}%. Уже вернули: 🪙${fmt(S.stats.refunded || 0)}.</p>`;
  for (const [k, u] of Object.entries(DIR_UP)) {
    const l = dirLvl(k);
    h += `<div class="card up"><span class="remoji">${u.emo}</span><div class="grow"><b>${u.name}</b> <span class="muted">ур. ${l}/${u.max}</span><div class="muted">${u.desc(l)}</div></div>
      ${l >= u.max ? '<span class="done">макс.</span>' : costBtn('↑', dirCost(k), 'dir', `data-k="${k}"`)}</div>`;
  }
  return h;
}
function receptionPanel() {
  return `<div class="sh-head"><span class="remoji big">🛎️</span><div><h2>Приёмная</h2><div class="muted">Здесь новые ученики поступают в школу</div></div><button class="x" data-close>✕</button></div>
    <div class="stats3"><div><span>🪙</span><b>${fee()}</b><i>взнос</i></div><div><span>⏱️</span><b>${sec(procTime())}</b><i>оформление</i></div><div><span>🚶</span><b>${sec(arrivalInterval())}</b><i>новый ученик</i></div></div>
    <div class="card up"><span class="remoji">🧾</span><div class="grow"><b>Секретарь</b> <span class="muted">ур. ${recLvl()}/${MAX_REC_LVL}</span><div class="muted">быстрее оформляет, взнос больше</div></div>${S.reception.level >= MAX_REC_LVL ? '<span class="done">макс.</span>' : costBtn('↑', recCost(), 'rec')}</div>
    <div class="card up"><span class="remoji">📣</span><div class="grow"><b>Объявления о школе</b> <span class="muted">ур. ${adsLvl()}/${MAX_REC_LVL}</span><div class="muted">ученики приходят чаще</div></div>${S.reception.ads >= MAX_REC_LVL ? '<span class="done">макс.</span>' : costBtn('↑', adsCost(), 'ads')}</div>
    <p class="muted">Настроение учеников: <b>${moodFace(avgMood())} ${Math.round(avgMood())}%</b>. Долгие очереди огорчают, уроки и библиотека радуют. Весёлые сдают экзамен лучше, а совсем грустные уходят домой (ушли от тоски: ${S.stats.gaveUp || 0}).</p>
    <p class="muted">Всего поступило: ${S.stats.enrolled} · выпускников: ${S.stats.graduated} · ушли расстроенными: ${S.stats.left || 0}</p>`;
}
function buildPanel(i) {
  return () => {
    const C = CLASSES[i];
    return `<div class="sh-head"><span class="remoji big">${C.emoji}</span><div><h2>${C.name}</h2><div class="muted">Новый класс</div></div><button class="x" data-close>✕</button></div>
      <p>Ученики будут приходить сюда после предыдущего урока. Плата за урок: <b>🪙${fmt(C.tuition)}</b>.</p>
      <p class="muted">Стройка займёт ${C.buildTime >= 60 ? Math.round(C.buildTime / 60) + ' мин' : C.buildTime + ' с'}.</p>
      ${starsNeed(i) > schoolStars() ? `<p class="muted">Нужно звёзд школы: <b>⭐ ${schoolStars()}/${starsNeed(i)}</b>. Звёзды дают проверки инспектора 🧐${calm() ? ' — выключи спокойный режим в ⚙️, чтобы он приходил' : ''}.</p>` : ''}
      <button class="btn wide" data-cost="${C.build}" data-act="build" data-i="${i}" ${starsNeed(i) > schoolStars() ? 'disabled' : ''}>Построить <span class="cost">🪙${fmt(C.build)}${starsNeed(i) ? ` ⭐${starsNeed(i)}` : ''}</span></button>`;
  };
}
const starsNeed = (i) => (WORLD === 1 ? [0, 0, 0, 1, 3, 5][i] || 0 : 0);   // stars are needed in calm mode too: the player turns the inspector on when in the mood to earn them (her ruling 2026-11-21)   // charms 1, flight 3, elements 5 stars (classes already built stay)
function settingsPanel() {
  return `<div class="sh-head"><h2>Настройки</h2><button class="x" data-close>✕</button></div>
    <p class="muted">Версия ${VERSION} (сборка ${BUILD}). Это тестовая версия, картинки пока не все. Значки: Twemoji (CC-BY 4.0).</p>
    <p>Экзаменов сдано: ${S.stats.passed} · не сдано: ${S.stats.failed} · выпускников: ${S.stats.graduated}</p>
    <h3>🎵 Музыка</h3><button class="btn ghost wide" data-music="${musicOn() ? 0 : 1}">${musicOn() ? '🔇 Выключить музыку' : '🎵 Включить музыку'}</button>
    <h3>😌 Спокойный режим</h3>${calmBlock()}
    ${cloudBlock()}
    <h3>Отзыв</h3>
    <input id="fb-name" class="fb" placeholder="Твоё имя" value="${(localStorage.getItem('magicschool.name') || '').replace(/"/g, '&quot;')}">
    <textarea id="fb-text" class="fb" rows="4" placeholder="Что понравилось? Что сломалось или было непонятно?"></textarea>
    <div id="fb-pics" class="fb-pics"></div>
    <label class="btn ghost wide fb-add">📷 Добавить картинку (до 3)<input id="fb-file" type="file" accept="image/*" multiple hidden></label>
    <button class="btn wide" data-feedback>💌 Отправить отзыв</button>
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
async function sendFeedback() {
  const msg = ($('#fb-text').value || '').trim();
  const name = ($('#fb-name').value || '').trim().slice(0, 40);
  if (!msg) { toast('Напиши пару слов в поле отзыва'); return; }
  localStorage.setItem('magicschool.name', name);
  const built = S.classes.filter((c) => c.built).length;
  const text = `Отзыв о «Школе магии» от ${name || 'без имени'}:

${msg}

— версия ${VERSION} (сборка ${BUILD})
— ${deviceName()}
— монет ${fmt(S.coins)}, классов ${built}, выпускников ${S.stats.graduated}, ушли ${S.stats.left || 0}`;
  const btn = document.querySelector('[data-feedback]'); if (btn) { btn.disabled = true; btn.textContent = 'Отправляю…'; }
  try {
    const r = await fetch(FEEDBACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, images: fbPics }) });
    if (r.ok) { $('#fb-text').value = ''; fbPics = []; drawFbPics(); toast('Отзыв отправлен, спасибо! 💜'); if (btn) { btn.disabled = false; btn.textContent = '💌 Отправить отзыв'; } return; }
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
// upgrades pay back REWARD_SHARE of what they cost; counting missions pay for the minutes they really take at the current pace
const REWARD_SHARE = 0.3, TIME_SHARE = 0.25;
const nice = (x) => { const e = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, x))) - 1)); return Math.round(x / e) * e; };
function missionCost(m) {   // coins still needed from the current state to the target
  const C = CLASSES[m.i], st = m.i >= 0 ? S.classes[m.i] : null; let c = 0;
  switch (m.type) {
    case 'item': for (let L = st.items[m.k]; L < m.target; L++) c += C.tuition * 2 * (1 + m.k) * Math.pow(1.25, L); return c;
    case 'teacher': for (let L = st.teacher; L < m.target; L++) c += C.tuition * 6 * Math.pow(1.35, L - 1); return c;
    case 'desk': return deskCost(m.i);
    case 'time': return timeCost(m.i);
    case 'rec': for (let L = S.reception.level; L < m.target; L++) c += 20 * Math.pow(1.4, L - 1); return c;
    case 'beds': return bedsCost();
    case 'lib': return libSeatsCost();
    case 'build': return C.build;
  }
  return -1;
}
const RATE_KEY = { grad: 'graduated', exams: 'passed', enroll: 'enrolled', read: 'read' };
let rateLast = null;
function stepRates(sec) {   // per-second pace of every counter (EMA), measured while the game is open
  const now = { graduated: S.stats.graduated, passed: S.stats.passed, enrolled: S.stats.enrolled, read: S.stats.read || 0 };
  S.rt ||= {};
  if (rateLast) for (const k of Object.keys(now)) S.rt[k] = (S.rt[k] || 0) * 0.97 + ((now[k] - rateLast[k]) / sec) * 0.03;
  rateLast = now;
}
function rewardFor(m) {
  const cost = missionCost(m);
  if (cost >= 0) return Math.max(50, nice(cost * REWARD_SHARE));
  const perMin = Math.max(1, (S.ema || 1) * 60);
  if (m.type === 'earn') return Math.max(50, nice((m.n || 0) * TIME_SHARE));
  const key = RATE_KEY[m.type], rate = key ? (S.rt && S.rt[key]) || 0 : 0;
  const minutes = rate > 0.001 ? Math.min(15, Math.max(0.5, (m.n || 0) / (rate * 60))) : 3;
  return Math.max(50, nice(perMin * minutes * TIME_SHARE));
}
function makeMission() {
  const open = CLASSES.map((c, i) => i).filter((i) => isOpen(i));
  const kinds = [];
  kinds.push(() => { const n = rint(3, 8) * 10; return { type: 'grad', target: S.stats.graduated + n, text: `Выпусти ещё ${n} учеников 🎓` }; });
  kinds.push(() => { const n = rint(5, 15) * 10; return { type: 'enroll', target: S.stats.enrolled + n, text: `Прими в школу ещё ${n} новичков 🛎️` }; });
  kinds.push(() => { const n = Math.max(500, Math.round((S.ema || 1) * 60 * rint(3, 8) / 100) * 100); return { type: 'earn', target: (S.stats.earned || 0) + n, text: `Заработай ещё ${fmt(n)} монет 🪙` }; });
  kinds.push(() => { const n = rint(2, 6) * 5; return { type: 'read', target: (S.stats.read || 0) + n, text: `Пусть ${n} учеников подготовятся в библиотеке 📚` }; });
  kinds.push(() => { const n = rint(5, 15) * 10; return { type: 'exams', target: S.stats.passed + n, text: `Пусть ученики сдадут ещё ${n} экзаменов` }; });
  for (const i of open) {
    const st = S.classes[i], C = CLASSES[i];
    C.items.forEach((it, k) => { if (st.items[k] < MAX_ITEM_LEVEL) kinds.push(() => { const t = Math.min(MAX_ITEM_LEVEL, st.items[k] + rint(2, 4)); return { type: 'item', i, k, target: t, text: `Улучши «${it.name}» (${C.name}) до ур. ${t}` }; }); });
    if (st.teacher < MAX_TEACHER_LEVEL) kinds.push(() => { const t = Math.min(MAX_TEACHER_LEVEL, st.teacher + rint(1, 3)); return { type: 'teacher', i, target: t, text: `Улучши учителя (${C.name}) до ур. ${t}` }; });
    if (st.desks < maxDesksOf(i)) kinds.push(() => ({ type: 'desk', i, target: st.desks + 1, text: `Поставь ещё одну парту: ${C.name}` }));
    if (st.time < MAX_TIME_LEVEL) kinds.push(() => ({ type: 'time', i, target: st.time + 1, text: `Сократи урок: ${C.name}` }));
  }
  if (S.reception.level < MAX_REC_LVL) kinds.push(() => ({ type: 'rec', target: Math.min(MAX_REC_LVL, S.reception.level + rint(1, 3)), text: `Улучши секретаря в приёмной до ур. ${S.reception.level + 1}+` }));
  if (bedCount() < maxBeds()) kinds.push(() => ({ type: 'beds', target: bedCount() + 1, text: 'Купи ещё одну кровать в спальне 🛏️' }));
  if (libSeats() < MAX_LIB_SEATS) kinds.push(() => ({ type: 'lib', target: libSeats() + 1, text: 'Поставь ещё один стол в библиотеке 📚' }));
  const nextPlot = S.classes.findIndex((c) => !c.built);
  if (nextPlot >= 0) kinds.push(() => ({ type: 'build', i: nextPlot, target: 1, text: `Построй класс «${CLASSES[nextPlot].name}»` }));
  const m = kinds[Math.floor(Math.random() * kinds.length)]();
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
    default: return null;
  }
}
function missionList() {   // [{key, text, reward, ok, prog}]
  if (S.dyn && !S.dynList) S.dynList = [S.dyn];   // older saves had one generated mission
  S.dynList ||= [];
  const out = [];
  if (WORLD === 1 && S.mission < MISSIONS.length) { const m = MISSIONS[S.mission]; out.push({ key: 'f', text: m.text, reward: m.reward, ok: m.check(G), prog: null, go: missionGo(null, m.text) }); }
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
      default: return true;
    }
  };
  S.dynList = S.dynList.filter((m) => dynDone(m) || possible(m));
  for (const m of S.dynList) if (m.rv !== 2 && !dynDone(m)) {   // missions made before the fair rewards: priced again from what is left to do
    const pr = dynProgress(m); if (pr && ['grad', 'enroll', 'earn', 'read', 'exams'].includes(m.type)) m.n = pr[1] - pr[0];
    m.reward = rewardFor(m); m.rv = 2;
  }
  for (let tries = 0; out.length + S.dynList.length < MISSION_SLOTS && tries < 200; tries++) {
    const m = makeMission();
    if (S.dynList.some((x) => kindKey(x) === kindKey(m))) continue;
    S.dynList.push(m); made = true;
  }
  if (made) save();
  S.dynList.forEach((m, k) => out.push({ key: 'd' + k, text: m.text, reward: m.reward, ok: dynDone(m), prog: dynProgress(m), go: missionGo(m) }));
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
  const [id, sel] = m.go, s = SLOTS[id];
  closePanel();
  openRoom(id);
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
  if (key === 'f') S.mission++; else S.dynList.splice(+key.slice(1), 1);
  toast(`🎁 Награда 🪙${fmt(m.reward)}`); updateHud(); save();
}

// missions live behind a round button on the map (bottom right); a red badge shows how many can be claimed
function renderMission() {
  const list = missionList(), ready = list.filter((m) => m.ok).length, el = $('#quest');
  const key = 'b' + ready;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = emojiHtml(`<button class="mbtn ${ready ? 'ready' : ''}" data-missions aria-label="Задания">📋${ready ? `<span class="badge">${ready}</span>` : ''}</button>`);
}
// ======================= world map =======================
function readMetaLocal() { try { return JSON.parse(localStorage.getItem('magicschool.meta')) || {}; } catch (e) { return {}; } }
function worldStats(w) {   // {grads, coins} of a world's save
  if (w === WORLD) return { grads: S.stats.graduated, coins: S.coins, stars: schoolStars() };
  try { const o = JSON.parse(localStorage.getItem(saveKeyOf(w))); return o ? { grads: o.stats.graduated, coins: o.coins, stars: (o.insp && o.insp.stars) || 0 } : null; } catch (e) { return null; }
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
      const ok = src.grads >= n.grads && src.coins >= n.coins && (src.stars || 0) >= (n.stars || 0);
      right = ok ? `<button class="btn hot" data-world-open="${w.id}">Открыть 🪙${fmt(n.coins)}${n.stars ? ` ⭐${n.stars}` : ''}</button>` : '<span class="lock">🔒</span>';
      w._need = `🎓 ${fmt(Math.min(src.grads, n.grads))}/${fmt(n.grads)} выпускников · 🪙 ${fmt(Math.min(src.coins, n.coins))}/${fmt(n.coins)}${n.stars ? ` · ⭐ ${Math.min(src.stars || 0, n.stars)}/${n.stars}` : ''} в Школе магии`;
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
  if (WORLD !== 1 || !src || src.grads < n.grads || src.coins < n.coins || (src.stars || 0) < (n.stars || 0)) return;
  if (!confirm(`Открыть новый мир за 🪙${fmt(n.coins)}${n.stars ? ` и ⭐ ${n.stars}` : ''}? Они спишутся в Школе магии.`)) return;
  S.coins -= n.coins; if (n.stars) insp().stars -= n.stars; save();
  const m = readMetaLocal(); m.unlocked = [...new Set([...(m.unlocked || []), w])]; localStorage.setItem('magicschool.meta', JSON.stringify(m));
  toast('✨ Новый мир открыт!'); openPanel(worldsPanel);
}

function missionsPanel() {
  const list = missionList();
  return `<div class="sh-head"><span class="remoji big">📋</span><div><h2>Задания</h2><div class="muted">Выполняй и забирай награды. Новые появляются сразу</div></div><button class="x" data-close>✕</button></div>
    <div class="qbar">${list.map((m) => `<div class="q ${m.ok ? 'ok' : ''}"><span class="qi">${m.ok ? '🎁' : '📋'}</span>
      <span class="qt">${m.text}${m.prog && !m.ok ? ` <span class="qp">${fmt(Math.min(m.prog[0], m.prog[1]))}/${fmt(m.prog[1])}</span>` : ''}</span>
      ${m.ok ? `<button class="btn hot small" data-mission="${m.key}">Забрать 🪙${fmt(m.reward)}</button>` : `<span class="qgo"><span class="qr">🪙${fmt(m.reward)}</span>${m.go ? `<button class="btn small go" data-mgo="${m.key}">Выполнить ➜</button>` : ''}</span>`}</div>`).join('')}</div>`;
}
function updateHud() {
  $('#coins').textContent = fmt(S.coins);
  $('#stars').textContent = fmt(S.stats.graduated);
  $('#rate').textContent = fmt(S.ema * 60) + '/м';
  document.querySelectorAll('[data-cost]').forEach((el) => el.classList.toggle('poor', S.coins < +el.dataset.cost));
  renderMission(); renderInsp();
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#fx').appendChild(d); setTimeout(() => d.remove(), 1900); }

// ======================= pinch zoom =======================
const minZoom = () => 0.9;
function setZoom(z, cx, cy, wx, wy) {   // keep world point (wx, wy) under client point (cx, cy) of the scroller
  zoom = Math.max(minZoom(), Math.min(ZMAX, z));
  scale = (viewW / BASEW) * zoom * ROOMS_K;
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
  const sign = signRects.find((r) => wx >= r.x0 - 6 && wx <= r.x1 + 6 && wy >= r.y0 - 6 && wy <= r.y1 + 6);   // a sign always opens its room
  if (sign) { openRoom(sign.id); return; }
  // a tap inside a room (floor, or walls/sprites just above it) always opens the room
  for (const lift of [0, 20, 40]) {
    const a = (wx - OX) / HW, b = (wy + lift - OY) / HH;
    const tx = Math.floor((a + b) / 2), ty = Math.floor((b - a) / 2);
    const id = regAt(tx, ty);
    if (!id || id === 'hall') continue;
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
    if (id === 'DIR') { openPanel(dirBuilt() ? dirPanel : dirBuildPanel); return; }
    if (id === 'DORM' || id === 'DORM2') { openPanel(dormPanel); return; }
  }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, i = +d.i;
  if (d.close !== undefined) { closePanel(); return; }
  if (d.missions !== undefined) { openPanel(missionsPanel); return; }
  if (d.insp !== undefined) { openPanel(inspPanel); return; }
  if (d.people !== undefined) { openPanel(peoplePanel); return; }
  if (d.music !== undefined) { setMusic(d.music === '1'); if (panel === settingsPanel) { openPanel(settingsPanel); drawFbPics(); } return; }
  if (d.calm !== undefined) { setCalm(d.calm === '1'); if (panel === settingsPanel) { openPanel(settingsPanel); drawFbPics(); } return; }
  if (d.worlds !== undefined) { openPanel(worldsPanel); return; }
  if (d.world !== undefined) { goWorld(+d.world); return; }
  if (d.worldOpen !== undefined) { openWorld(+d.worldOpen); return; }
  if (d.mgo !== undefined) { goMission(d.mgo); return; }
  if (d.mission !== undefined) { claimMission(d.mission); if (panel === missionsPanel) refreshPanel(); return; }
  if (t.id === 'btn-settings') { openPanel(settingsPanel); drawFbPics(); return; }
  if (d.feedback !== undefined) { sendFeedback(); return; }
  if (d.fbDel !== undefined) { fbPics.splice(+d.fbDel, 1); drawFbPics(); return; }
  if (d.cloudNew !== undefined) { cloudCreate(); return; }
  if (d.cloudLoad !== undefined) { cloudLoad(); return; }
  if (d.backupRestore !== undefined) { restoreBackup(); return; }
  if (d.cloudCopy !== undefined) { navigator.clipboard?.writeText(cloudCode()).then(() => toast('Код скопирован'), () => window.prompt('Твой код:', cloudCode())); return; }
  if (d.cloudOff !== undefined) { if (confirm('Отключить облако на этом устройстве? Прогресс здесь останется, просто перестанет сохраняться в облако.')) { localStorage.removeItem(CODE_KEY); cloudState = ''; openPanel(settingsPanel); } return; }
  if (d.tourAgain !== undefined) { closePanel(); showTour(0); return; }
  if (d.tourNext !== undefined) { showTour(tourStep + 1); return; }
  if (d.tourBack !== undefined) { showTour(tourStep - 1); return; }
  if (d.tourSkip !== undefined) { showTour(-1); return; }
  if (d.reset !== undefined) { if (confirm('Точно начать заново? Весь прогресс пропадёт.')) { localStorage.removeItem(SAVE_KEY); S = null; location.reload(); } return; }
  const st = S.classes[i];
  if (d.act === 'teacher') { if (spend(teacherCost(i))) st.teacher++; }
  else if (d.act === 'desk') { if (st.desks < maxDesksOf(i) && spend(deskCost(i))) { st.desks++; pullWaiting(i); } }
  else if (d.act === 'expand') { if (sizeOf(i) < MAX_SIZE && spend(expandCost(i))) { st.size = sizeOf(i) + 1; relayout(); toast(`📐 ${CLASSES[i].name}: класс расширен!`); } }
  else if (d.act === 'time') { if (spend(timeCost(i))) st.time++; }
  else if (d.act === 'item') { if (spend(itemCost(i, +d.k))) st.items[+d.k]++; }
  else if (d.act === 'rec') { if (S.reception.level < MAX_REC_LVL && spend(recCost())) S.reception.level++; }
  else if (d.act === 'ads') { if (S.reception.ads < MAX_REC_LVL && spend(adsCost())) S.reception.ads++; }
  else if (d.act === 'beds') { if (bedCount() < maxBeds() && spend(bedsCost())) dormUp().beds++; }
  else if (d.act === 'dormexp') { const k = +d.k; if (dormSize(k) < 3 && spend(dormExpandCost(k))) { dormUp()['size' + k] = dormSize(k) + 1; relayout(); toast('📐 Спальня расширена!'); } }
  else if (d.act === 'dorm2') { if (!dorm2Built() && spend(DORM2_COST)) { dormUp().room2 = true; staticKey = ''; toast('✨ Вторая спальня построена!'); } }
  else if (d.act === 'dirbuild') { if (schoolStars() < DIR_STARS) { toast(`Нужно ⭐ ${DIR_STARS} звезды школы`); return; } if (!dirBuilt() && S.coins >= DIR_COST && spendStars(DIR_STARS) && spend(DIR_COST)) { S.dirBuilt = true; staticKey = ''; toast('👑 Кабинет директора построен!'); panel = dirPanel; } }
  else if (d.act === 'dir') { const k = d.k; if (dirLvl(k) < DIR_UP[k].max && spend(dirCost(k))) { S.dir ||= {}; S.dir[k] = dirLvl(k) + 1; } }
  else if (d.act === 'libseats') { if (libSeats() < MAX_LIB_SEATS && spend(libSeatsCost())) libUp().seats++; }
  else if (d.act === 'libspeed') { if (libUp().speed < MAX_LIB_LVL && spend(libSpeedCost())) libUp().speed++; }
  else if (d.act === 'libbonus') { if (libUp().bonus < MAX_LIB_LVL && spend(libBonusCost())) libUp().bonus++; }
  else if (d.act === 'conc') { if (dormUp().conc < MAX_CONC && spend(concCost())) dormUp().conc++; }
  else if (d.act === 'build') { if (starsNeed(i) > schoolStars()) { toast(`Нужно ⭐ ${starsNeed(i)} звёзд школы`); return; } if (S.coins >= CLASSES[i].build && spendStars(starsNeed(i)) && spend(CLASSES[i].build)) { st.built = true; st.buildEnd = Date.now() + CLASSES[i].buildTime * 1000; panel = classPanel(i); } }
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
    const r = await fetch(CLOUD + code, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    cloudState = r.ok ? `сохранено в облако в ${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}` : `облако не ответило (${r.status})`;
  } catch (e) { cloudState = 'нет сети: сохраню позже'; }
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
function adopt(raw) {   // replace the local save with a cloud one and restart the game on it
  if (!noSave) backupLocal('cloud');
  noSave = true;
  let o = null; try { o = JSON.parse(raw); } catch (e) { /* bad */ }
  if (o && o.v === 3 && o.saves) { for (const [k, v] of Object.entries(o.saves)) localStorage.setItem(k, v); if (o.meta) localStorage.setItem('magicschool.meta', JSON.stringify(o.meta)); }
  else localStorage.setItem(SAVE_KEY, raw);
  location.reload();
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
  const code = newCode(); localStorage.setItem(CODE_KEY, code);
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
  localStorage.setItem(CODE_KEY, code);
  adopt(rem.data);
}
function cloudBlock() {
  const code = cloudCode();
  if (code) return `<h3>☁️ Облачное сохранение</h3>
    <div class="cloud-code">${code}</div>
    <p class="muted">Синхронизация включена${cloudState ? ': ' + cloudState : ''}. На другом устройстве открой ⚙️ и введи этот код — там будет этот же прогресс.</p>
    <button class="btn ghost wide" data-cloud-copy>📋 Скопировать код</button>
    <button class="btn ghost wide" data-cloud-off>Отключить облако на этом устройстве</button>${backupBtn()}`;
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
  const o = b.data; for (const [k, v] of Object.entries(o.saves || {})) localStorage.setItem(k, v); if (o.meta) localStorage.setItem('magicschool.meta', JSON.stringify(o.meta));
  localStorage.setItem('magicschool.backup', JSON.stringify({ at: Date.now(), why: 'swap', data: cur }));
  // the restored game must win in the cloud too: push it right after the reload
  localStorage.setItem('magicschool.forcePush', '1');
  location.reload();
}

// ======================= loop, offline =======================
let earnedThisSec = 0, secT = 0, saveT = 0, last = performance.now(), panelT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // the first frame after a reload can be stamped before 'last': a negative dt made 0/0 = NaN positions (frozen reception, report 2026-11-21)
  stepWorld(dt, true);
  secT += dt; if (secT >= 1) { stepRates(secT); S.ema = S.ema * 0.97 + (earnedThisSec / secT) * 0.03; earnedThisSec = 0; secT = 0; updateHud(); }
  panelT += dt; if (panel && !panel.still && (dirtyPanel || panelT > 1)) { panelT = 0; dirtyPanel = false; refreshPanel(); }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); cloudPush(); }
  render();
  warmRooms();
  requestAnimationFrame(frame);
}
const LAYOUT = 9;
function relayout() {   // rebuild the map (a class was expanded): creatures keep their task, seats move with the rooms
  const snap = agents.length ? (save(), S.world) : null;
  genLayout(); buildGrid(); buildEdges(); decorateEdges();
  REC = SLOTS.REC; OFFICER = { x: REC.x0 + 0.75, y: REC.y0 + 3.3 };
  DS = SLOTS.DORM; DS2 = SLOTS.DORM2; CONCIERGE = { x: DS.x0 + 0.6, y: DS.y0 + 1.4 }; dormSpots();
  LS = SLOTS.LIB; libSpots();
  computeBounds(); staticKey = ''; resize();
  if (snap) {
    agents = []; queue = []; processing = null; dormLine = []; checkin = null;
    deskOcc.forEach((a) => a.fill(null)); waitList.forEach((l) => (l.length = 0)); dorm.fill(null); lib.fill(null);
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
    const a = { ...o, z: 0, path: [], onArrive: null, flip: false, ph: Math.random() * 6 };
    const broken = !Number.isFinite(a.x) || !Number.isFinite(a.y);   // saves from builds <= 85 could hold NaN (saved as null) positions
    if (broken) { a.x = GATE_TILE.x; a.y = GATE_TILE.y; }
    if (teleport || broken || !regAt(Math.floor(a.x), Math.floor(a.y))) {   // put it next to where it was going
      const g = a.goal || {}, at = (p) => { a.x = p.x; a.y = p.y; };
      if ((g.t === 'c' || g.t === 's') && g.i >= 0 && slotOf(g.i)) { const [, h] = slotOf(g.i).door; at({ x: h[0] + 0.5, y: h[1] + 0.5 }); }
      else if (g.t === 'd' && a.bed >= 0 && DORM_SPOTS[a.bed]) at(DORM_SPOTS[a.bed]);
      else if (g.t === 'l' && a.seat >= 0 && LIB_SPOTS[a.seat]) at(LIB_SPOTS[a.seat]);
      else if (g.t === 'g') { const [, h] = SLOTS.EXAM.door; at({ x: h[0] + 0.5, y: h[1] - 1 }); }
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
    if (g.t === 'l') { const n = (a.seat >= 0 && a.seat < libSeats() && !lib[a.seat]) ? a.seat : libSeat(); if (n >= 0) { goLibrary(a, g.i, n, a.state === 'read' ? a.t : 0); continue; } a.prepared = true; route(a, g.i); continue; }
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
// ======================= background music (her wish 2026-11-21; Suno via SYNTX) =======================
// Plays quietly in a loop over the playlist; starts on the first tap (phones allow sound only after a touch),
// pauses while the game is in the background; on/off in settings (localStorage magicschool.music).
const MUSIC = ['assets/music/cozy.mp3?v=1', 'assets/music/cozy-2.mp3?v=1'];
const music = new Audio(); music.volume = 0.35; music.preload = 'none';
let musicIdx = 0;
const musicOn = () => localStorage.getItem('magicschool.music') !== '0';
music.addEventListener('ended', () => { musicIdx = (musicIdx + 1) % MUSIC.length; music.src = MUSIC[musicIdx]; musicStart(); });
function musicStart() { if (!musicOn() || document.hidden) return; if (!music.src) music.src = MUSIC[musicIdx]; if (music.paused) music.play().catch(() => {}); }
document.addEventListener('pointerdown', () => { if (music.paused) musicStart(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else musicStart(); });
function setMusic(on) { localStorage.setItem('magicschool.music', on ? '1' : '0'); if (on) musicStart(); else music.pause(); toast(on ? '🎵 Музыка включена' : '🔇 Музыка выключена'); }
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (S) save(); cloudPush(true); return; }
  const away = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0; hiddenAt = 0;
  const gain = fastForward(away); welcomeBack(away, gain); last = performance.now(); save();
  cloudPull();   // maybe it was played on another device meanwhile
});
window.addEventListener('pagehide', () => { if (S) save(); });
window.addEventListener('resize', resize);

preloadEmoji();
watchEmoji();
load();
relayout();   // the map depends on the saved class sizes
if (location.hash.startsWith('#coins=')) { S.coins = +location.hash.slice(7) || S.coins; history.replaceState(null, '', location.pathname); } // test hook
window.__test = { P, SLOTS, focusTile, get secU() { return secU; }, holdArrivals: () => { arrivalT = 1e9; }, state: (f) => f(S), inspNow: (sec) => { insp().t = sec; }, avgMood: () => avgMood(), incident: (i) => { S.inc ||= {}; S.inc[i] = { k: "c", t: 0 }; }, get inc() { return S.inc; }, openRoom: (id) => openRoom(id), get agents() { return agents; }, get scale() { return scale; }, dbg: () => CLASSES.map((c, i) => ({ c: c.id, open: isOpen(i), desks: S.classes[i].desks, seated: deskOcc[i].filter(Boolean).length, waiting: waitList[i].length, walking: lineCount(i) - waitList[i].length, sleepers: dorm.filter((a) => a && a.goal && a.goal.i === i).length, sleepState: dorm.filter((a) => a && a.goal && a.goal.i === i).map((a) => a.state).join(',') })) };   // test hook: world -> screen
resize();
{ const h = P(14.5, SLOTS.REC.y0 + 1); scroller.scrollLeft = h.x * scale - scroller.clientWidth / 2; scroller.scrollTop = h.y * scale - scroller.clientHeight * 0.5; }
{ const away = (Date.now() - (S.last || Date.now())) / 1000; restoreWorld(); const gain = fastForward(away); welcomeBack(away, gain); }
updateHud();
if (!S.tourDone && WORLD === 1) setTimeout(() => { closePanel(); showTour(0); }, 600);
requestAnimationFrame(frame);
if (localStorage.getItem('magicschool.forcePush')) { localStorage.removeItem('magicschool.forcePush'); cloudForce(); } else cloudPull();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
