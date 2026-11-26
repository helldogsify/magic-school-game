// Hero system, client part (rework step 8 stage 5; Ruslan 2026-11-26, design/mechanics_rework.md and registry §5d «HERO ROLL»,
// «HERO ROSTER — REPLACED by GEAR»; rows C7.x in design/system_registry_rows_students.md; patch tools/_patch/heroes_s8b.py).
// - A Старший маг or a Мастер who moves into the tower (or waits at its door) becomes a HERO through a free ROLL: rarity
//   ⭐ 70 % / ⭐⭐ 22 % / ⭐⭐⭐ 7 % / 🌟 1 % (gifted students roll ODDS_GIFT), four stats 💪 🛡️ 💨 ✨ in the rarity's range and a
//   species trait; a card-flip reveal through the game's window queue. He keeps his own name; the biography is built from his path.
//   Residents of old saves are rolled once on load, quietly, with one summary card. The roll lives on the resident record (r.h).
// - Level: XP comes by itself in the tower (per minute, also while the game is closed) + master-classes + retakes; level raises
//   his stats (so his post bonus) and his tower income (level 1 = the old income exactly). Max level by rarity. Every SKILL_EVERY
//   levels a choice of 1 of 2 skills (school and valley skills mixed; offered by rarity and stats). 🔮 can buy a level.
// - Мастер promotion (retake) = big promotion: element opens, stats ×(1 + MASTER); rarity stays.
// - Gear: 4 slots 🎩 🧥 🪄 📿; items have rarity, stats, a tilt (school items add ✨ and boost post effects, battle items add
//   💪 🛡️ 💨) and maybe a set (bonus at 3 pieces, ×1.5 at 4). Every item lives in ONE shared chest (S.heroes.items) and moves
//   freely between heroes. Sources: tower entry (a hero brings one item), workshop 3 -> 1, paid «✨ Звёздный зов» (odds shown,
//   pity), hooks for the daily chest / valley ruins / weekly alliance prize (drop(src); not wired: daily bar and server later).
// - Posts (22 = max tower places): one MENTOR per class (incl. the final hall; stands beside the teacher; class bonuses),
//   3 COUNCIL seats (school-wide pay, mood, arrivals), 3 SQUADS × 4 (valley numbers computed here, server spec in
//   design/hero_valley_server_spec.md; the client call is a stub).
// Everything from game.js comes through `api` (getters). All art is a placeholder (emoji); texts are placeholders for Maria.
// REWORK «WORLDS = SQUADS» (tools/_patch/heroes_worlds.py, registry §5d): ONE squad of B.squadN per school (world); posts per school
// 7 mentors + 3 council + 5 squad = 15 = max tower places; the gear chest is the ACCOUNT's (magicschool.meta.hero), shared by the
// worlds; world-2 heroes have their own flavour (B.w2); farewell/swap: gear back to the chest, half his XP to the newcomer, fame +1 %.
// GEAR SOURCES (tools/_patch/gear_sources.py, registry §5d, C7.14): drop(src, rar, {tok, p, min, w, quiet}) is wired to the daily chests,
// the closed day «☀️ Сегодня», the old valley's ruins and the weekly alliance prizes; window.heroDrop() is the hook of the valley v2.
// WORLD-EXCLUSIVE POOLS: every world has its own sets and item names; new items carry w and drop only in their world.

// ======================= tuning (starting constants; final numbers in the whole-game economy check, registry §5b) =======================
export const HERO_BAL = {
  odds: [0.70, 0.22, 0.07, 0.01],          // free roll at the tower: ⭐ ⭐⭐ ⭐⭐⭐ 🌟
  oddsGift: [0.45, 0.35, 0.15, 0.05],      // a gifted student (students.js a.gift) rolls better
  stat: [[8, 16], [14, 24], [22, 34], [32, 46]],   // base range of each stat per rarity
  maxLv: [20, 30, 40, 50],                 // rarity changes max power (Ruslan «да, редкость влияет на его силу»)
  trait: 0.20,                             // species trait: +20 % to its stat
  master: 0.25,                            // Мастер promotion: every stat ×1.25
  lvStat: 0.04,                            // +4 % to base stats per level above 1
  xpMin: 1,                                // XP per minute of living in the tower (online and offline)
  xpRetake: 10, xpMc: 10, xpPromo: 60,     // XP for a retake trip, a master-class, a promotion to Мастер (at retake level 10 one elder in 3 still gets ~3 XP/min: 3× passive)
  xpNeed: (lv) => Math.round(60 * Math.pow(1.10, lv - 1)),   // XP from lv to lv+1 (lv 2 after 1 h, lv 20 ≈ 2 days, lv 50 ≈ 44 days of passive XP)
  incLv: 0.05,                             // +5 % of his tower income per level above 1 (level 1 = the old income)
  skillEvery: 5,                           // skill choice at levels 5, 10, 15 …
  lvStones: (lv) => 5 + 2 * lv,            // 🔮 for +1 level at once («ускорить рост»)
  mentEx: 0.0008,                          // mentor: + lesson-exam chance in his class per point of ✨ (✨ 20 -> +1.6 %)
  match: 1.5,                              // mentor in a class of his species' favourite class or of his element: ×1.5
  cPay: 0.0004, cMood: 0.03, cArr: 0.001,  // council seat: pay of every lesson + per ✨, mood after every lesson per 🛡️, arrivals per 💨
  squadN: 5,                               // heroes in the school's ONE squad (Ruslan «может тогда по 5 в отряде?»); 7 + 3 + 5 = 15 tower places
  fwXp: 0.5,                               // farewell: share of his total XP that passes to the newcomer (or to the next arrival)
  fwFame: 0.01, fwFameCap: 0.25,           // farewell: +1 % school fame each (tuition in every world, like «Слава школы»), at most +25 % [designer's cap]
  w2: { def: 0.10, mount: 0.10, mine: 0.25 },   // world 2 «подгорный народ»: 🛡️ +10 % to every hero, squad +10 % in the mountains, mines ×1.25
  item: [4, 8, 14, 24],                    // main stat of an item per rarity (sub stat = 40 %)
  itemSb: [0.05, 0.10, 0.15, 0.25],        // school items: + this share to the hero's post effects
  setP: 0.35,                              // share of dropped items that belong to a set
  oddsItem: [0.60, 0.28, 0.10, 0.02],      // item rarity: Звёздный зов, daily chest, ruins
  chestP: 0.05, ruinsP: 0.10,              // chance of an item: one daily chest opened (not cursed), one ruin searched (wired: gear_sources)
  dayP: 0.20,                              // chance of an item when the day «☀️ Сегодня» is closed, once a day for the account [designer's starting value]
  allyMin: [2, 1, 1],                      // weekly alliance prize, places 1-3: a GUARANTEED item of at least ⭐⭐⭐ / ⭐⭐ / ⭐⭐
  tokMax: 500,                             // drop tokens remembered (idempotent drops), oldest forgotten first
  callCost: 30, call10Cost: 270, pity: 10, // «✨ Звёздный зов»: 🔮 per pull, ×10 for 270; a ⭐⭐⭐+ item at least every 10 pulls
  ws: 3, wsUp: 0.25,                       // workshop: 3 items -> 1; chance the result is one rarity higher than the average
  valleyLive: false,                       // audit F4: valley skills (k 'v') are offered only when the valley server rule is live
  v: { atkDiv: 400, defDiv: 400, spdDiv: 60, chDiv: 400, elem: 0.10, elemCap: 0.30 },   // valley numbers of a squad (spec file)
};
const B = HERO_BAL;
export const RAR = [{ s: '⭐', n: 'Обычный', c: '#8a8f99' }, { s: '⭐⭐', n: 'Редкий', c: '#3f8fe0' }, { s: '⭐⭐⭐', n: 'Эпический', c: '#a052e0' }, { s: '🌟', n: 'Легендарный', c: '#e09a12' }];
const ST = [{ e: '💪', n: 'Сила' }, { e: '🛡️', n: 'Стойкость' }, { e: '💨', n: 'Скорость' }, { e: '✨', n: 'Чары' }];
// species trait (PLACEHOLDER names: texts by Maria): which stat gets +trait
const TRAIT = { mothfox: [3, 'Чародейская пыльца'], petalear: [1, 'Терпеливые ушки'], fernhorn: [0, 'Крепкие рога'], starwhisker: [2, 'Лёгкие крылья'],
  mossmole: [1, 'Крепкие лапы'], owlbat: [2, 'Бесшумный полёт'], quartzhog: [0, 'Кварцевые иглы'], batbunny: [2, 'Прыгучесть'], geosnail: [1, 'Каменная раковина'], axolotl: [3, 'Подземный свет'] };
// world flavour (PLACEHOLDER texts for Maria): which school a hero comes from changes his squad
const WORLD_TR = { 1: { n: 'Дети холмов', d: 'стихии, скорость и чары' }, 2: { n: 'Подгорный народ', d: `🛡️ Стойкость +${Math.round(B0().w2.def * 100)} %, в скалах +${Math.round(B0().w2.mount * 100)} %, шахты +${Math.round(B0().w2.mine * 100)} %` } };
function B0() { return HERO_BAL; }
const FAV_CLASS = { mothfox: 'charms', petalear: 'herbs', fernhorn: 'elements', starwhisker: 'flight' };   // lore/canon.md (same as students.js)
const CLASS_EL = { herbs: 2, potions: 1, stars: 3, charms: 0, flight: 3 };   // [J] element that fits a class (Elements and the final hall: any Мастер)
// skills (PLACEHOLDER texts). k: 's' school (works on a post) / 'v' valley (works in a squad); v: base value, ×(1 + 0.25 × rarity); r: min rarity to be offered
const SKILLS = [
  { id: 'mentor', e: '🎓', n: 'Наставница', k: 's', v: 0.03, d: (x) => `наставник: +${pc(x)} к экзамену в своём классе` },
  { id: 'rich', e: '💰', n: 'Богатый род', k: 's', v: 0.30, r: 1, d: (x) => `+${pc(x)} к его доходу; в совете ещё +${pc(x / 15)} к плате школы` },
  { id: 'insp', e: '🌟', n: 'Вдохновитель', k: 's', v: 4, d: (x) => `наставник: +${Math.round(x)} настроения после урока в классе; в совете +${Math.round(x / 2)} во всей школе` },
  { id: 'exam', e: '📜', n: 'Экзаменатор', k: 's', v: 0.02, d: (x) => `наставник: +${pc(x)} к экзамену на звание в своём классе` },
  { id: 'quick', e: '⏱️', n: 'Быстрый урок', k: 's', v: 0.06, d: (x) => `наставник: уроки в его классе на ${pc(x)} короче` },
  { id: 'herald', e: '📯', n: 'Глашатай', k: 's', v: 0.05, r: 1, d: (x) => `в совете: новички приходят на ${pc(x)} чаще` },
  { id: 'banner', e: '🚩', n: 'Знаменосец', k: 'v', v: 0.10, d: (x) => `отряд: +${pc(x)} к атаке` },
  { id: 'guard', e: '🛡️', n: 'Страж', k: 'v', v: 0.10, d: (x) => `отряд: +${pc(x)} к укреплению` },
  { id: 'scout', e: '🔭', n: 'Разведчик', k: 'v', v: 1, d: (x) => `отряд: +${Math.round(x)} отряд в долине в день` },
  { id: 'treasure', e: '🗝️', n: 'Кладоискатель', k: 'v', v: 0.25, d: (x) => `отряд: руины и шахты дают на ${pc(x)} больше` },
  { id: 'siege', e: '🏰', n: 'Штурм', k: 'v', v: 0.20, r: 1, d: (x) => `отряд: +${pc(x)} к атаке на замки и башни` },
];
const SK = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
// gear: 4 slots; names per tilt (PLACEHOLDERS: names and art by Maria)
const SLOT = [
  { e: '🎩', n: 'Голова', s: ['Шляпа мудреца', 'Колпак звездочёта', 'Венок наставника'], b: ['Шлем стража', 'Боевой капюшон', 'Рогатый шлем'], m: 1 },
  { e: '🧥', n: 'Мантия / доспех', s: ['Мантия наставника', 'Плащ учёного', 'Мантия со звёздами'], b: ['Кольчуга', 'Латы', 'Чешуйчатый доспех'], m: 1 },
  { e: '🪄', n: 'Посох / клинок', s: ['Посох учёного', 'Палочка мудреца', 'Жезл знаний'], b: ['Клинок', 'Боевой посох', 'Копьё'], m: 0 },
  { e: '📿', n: 'Амулет', s: ['Амулет памяти', 'Чётки терпения', 'Брошь вдохновения'], b: ['Оберег храбрости', 'Клык-амулет', 'Медальон стража'], m: 2 },
];
// sets (PLACEHOLDER names): bonus with 3 pieces on one hero, ×1.5 with all 4
const SETS = {
  dragon: { e: '🔥', n: 'Пламя дракона', t: 'b', p: ['Шлем дракона', 'Чешуя дракона', 'Клинок пламени', 'Коготь дракона'], d: (k) => `отряд: +${pc(0.25 * k)} к атаке в лесу` },
  deep: { e: '🌊', n: 'Песнь глубин', t: 'b', p: ['Корона прилива', 'Доспех из ракушек', 'Трезубец глубин', 'Жемчужина бездны'], d: (k) => `отряд: +${pc(0.2 * k)} к укреплению` },
  storm: { e: '🌪️', n: 'Крылья бури', t: 'b', p: ['Шлем ветров', 'Плащ бури', 'Посох молний', 'Перо грозы'], d: (k) => `отряд: +${Math.round(2 * k)} отряда в долине в день` },
  owl: { e: '🦉', n: 'Мудрость совы', t: 's', p: ['Совиная шляпа', 'Мантия совы', 'Посох совы', 'Совиное перо'], d: (k) => `наставник: +${pc(0.03 * k)} к экзамену в классе` },
  garden: { e: '🌸', n: 'Цветущий сад', t: 's', p: ['Венок из цветов', 'Мантия садовника', 'Посох-лоза', 'Амулет-бутон'], d: (k) => `наставник: +${Math.round(3 * k)} настроения в классе; в совете +${Math.round(1 * k)} во всей школе` },
  gold: { e: '💰', n: 'Золотой лис', t: 's', p: ['Золотая шляпа', 'Мантия с золотом', 'Золотой жезл', 'Монета-амулет'], d: (k) => `+${pc(0.4 * k)} к доходу героя` },
};
// world 2 «Подземное королевство»: its OWN sets, obtainable only there (Ruslan 2026-11-26 «уникальные вещи, которые выбить гачей можно
// только там»; PLACEHOLDER names for Maria). fx = the effect it uses (W1 set id) or a new one: mount (attack in the rocks), mine (mines)
Object.assign(SETS, {
  magma: { w: 2, fx: 'mount', e: '🌋', n: 'Жар горна', t: 'b', p: ['Шлем из вулканита', 'Кираса горна', 'Молот-магма', 'Уголёк-оберег'], d: (k) => `отряд: +${pc(0.25 * k)} к атаке в скалах` },
  crystal: { w: 2, fx: 'deep', e: '💎', n: 'Кристальный панцирь', t: 'b', p: ['Кристальный шлем', 'Кварцевая броня', 'Кристальное копьё', 'Сердце кристалла'], d: (k) => `отряд: +${pc(0.2 * k)} к укреплению` },
  lamp: { w: 2, fx: 'mine', e: '🏮', n: 'Фонарь рудокопа', t: 'b', p: ['Каска с фонарём', 'Куртка рудокопа', 'Кирка-секира', 'Фонарик-светлячок'], d: (k) => `отряд: шахты дают на ${pc(0.25 * k)} больше` },
  rune: { w: 2, fx: 'owl', e: '🪨', n: 'Руны старейшин', t: 's', p: ['Венец старейшины', 'Мантия рунописца', 'Резец рун', 'Камень-руна'], d: (k) => `наставник: +${pc(0.03 * k)} к экзамену в классе` },
  moss: { w: 2, fx: 'garden', e: '🍄', n: 'Грибной круг', t: 's', p: ['Шляпка-гриб', 'Плащ из мха', 'Посох-грибница', 'Спора-оберег'], d: (k) => `наставник: +${Math.round(3 * k)} настроения в классе; в совете +${Math.round(1 * k)} во всей школе` },
  vein: { w: 2, fx: 'gold', e: '🪙', n: 'Золотая жила', t: 's', p: ['Шлем с самородком', 'Мантия с рудой', 'Жезл-самородок', 'Слиток-оберег'], d: (k) => `+${pc(0.4 * k)} к доходу героя` },
});
const SET_IDS = Object.keys(SETS);
const SLOT_W2 = [   // world-2 item names per slot and tilt (PLACEHOLDERS for Maria)
  { s: ['Колпак рунописца', 'Каска рудознатца', 'Венец мудрого гнома'], b: ['Шлем подгорного стража', 'Каменный шлем', 'Шлем с гребнем'] },
  { s: ['Мантия рунописца', 'Фартук мастера', 'Плащ из мха'], b: ['Гранитная кираса', 'Кольчуга из жил', 'Сланцевый доспех'] },
  { s: ['Резец рунописца', 'Посох-сталактит', 'Жезл горна'], b: ['Боевой молот', 'Кирка-клевец', 'Топор глубин'] },
  { s: ['Янтарный амулет', 'Камешек-оберег', 'Руна памяти'], b: ['Клык пещерного зверя', 'Медальон глубин', 'Кварцевый оберег'] },
];
const POOL = { 1: { e: '🦋', n: 'Мотыльковые холмы' }, 2: { e: '⛏️', n: 'Подземное королевство' } };   // gear pools by world (W3+ -> pool 1 until it has its own)
const poolW = (w) => (POOL[w] ? w : 1);
const setIdsOf = (w) => SET_IDS.filter((k) => (SETS[k].w || 1) === poolW(w));
const itemW = (it) => poolW(it.w || (it.set && SETS[it.set] ? SETS[it.set].w || 1 : 1));   // items of old saves = world 1
function pc(x) { const v = x * 100; return (v < 10 && Math.abs(v - Math.round(v)) > 0.05 ? v.toFixed(1).replace('.', ',') : Math.round(v)) + ' %'; }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const pick = (o) => { let x = Math.random(), k = 0; for (; k < o.length - 1; k++) { x -= o[k]; if (x < 0) break; } return k; };
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

export function initHeroes(api) {
  const S = () => api.S();
  const H = () => { const s = S(); const h = (s.heroes ||= {}); h.m ||= {}; h.c ||= []; h.s ||= [[]]; return h; };   // this school's posts (squad: h.s[0])
  // ---- the ACCOUNT's gear chest (rework «WORLDS = SQUADS»): magicschool.meta.hero = { items, nid, pity, pulls, mig }; every meta
  // write in the game is read-modify-write, so this one is too (written at once after every change)
  const META = 'magicschool.meta';
  const metaGet = () => { try { return JSON.parse(localStorage.getItem(META) || '{}') || {}; } catch (e) { return {}; } };
  let CH = null;
  function chest() { if (!CH) { const m = metaGet(); CH = m.hero || {}; CH.items ||= []; CH.nid ||= 1; CH.pity ||= 0; CH.pulls ||= 0; CH.mig ||= {}; } return CH; }
  function putChest() { const m = metaGet(); m.hero = chest(); try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* full storage */ } }
  // old saves: a world's own chest (S.heroes.items) goes into the account chest once, ids renumbered, worn gear remapped;
  // squads 1-3 merge into the one squad (first B.squadN in order stay, the rest are without a post)
  function migSave(o, w) {
    const h = o && o.heroes; if (!h) return false; let ch = false;
    if (Array.isArray(h.items)) {
      const c = chest(), map = {};
      for (const it of h.items) { const n = { ...it, id: c.nid++ }; map[it.id] = n.id; c.items.push(n); }
      const T = o.tower || {};
      for (const r of [...(T.res || []), ...(T.wait || [])]) if (r && r.h) { r.h.g = (r.h.g || [0, 0, 0, 0]).map((id) => (id && map[id]) || 0); if (r.h.brought) r.h.brought = map[r.h.brought] || 0; }
      c.pity = Math.max(c.pity, h.pity || 0); c.pulls += h.pulls || 0; c.mig[w] = { n: h.items.length, at: Date.now() };
      delete h.items; delete h.nid; delete h.pity; delete h.pulls; ch = true;
    }
    if (Array.isArray(h.s) && (h.s.length > 1 || (h.s[0] || []).length > B.squadN)) { const all = [].concat(...h.s.map((l) => l || [])); h.s = [all.slice(0, B.squadN)]; h.sqMig = all.length; ch = true; }
    return ch;
  }
  let migDone = false;
  function migrateAll() {   // once per start: this world's save and every other world's save found on this device
    if (migDone || !S()) return; migDone = true;
    let any = migSave(S(), api.world());
    for (const w of [1, 2, 3]) {
      if (w === api.world()) continue; const k = api.saveKeyOf(w); let o = null;
      try { o = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { o = null; }
      if (o && migSave(o, w)) { try { localStorage.setItem(k, JSON.stringify(o)); any = true; } catch (e) { /* full storage */ } }
    }
    if (any) { putChest(); api.save(); dirty(); }
  }
  // other worlds: their heroes (read from their saves, cached 2 s): what they wear and their squad
  let elseT = 0, ELSE = [];
  function others() {
    if (performance.now() - elseT < 2000) return ELSE; elseT = performance.now(); ELSE = [];
    for (const x of api.otherWorlds()) { let o = null; try { o = JSON.parse(localStorage.getItem(api.saveKeyOf(x.w)) || 'null'); } catch (e) { o = null; }
      if (o) ELSE.push({ w: x.w, name: x.name, S: o }); }
    return ELSE;
  }
  function wornElse(id) {
    for (const x of others()) for (const r of ((x.S.tower || {}).res || []).concat((x.S.tower || {}).wait || [])) if (r && r.h && (r.h.g || []).includes(id)) return { r, w: x.w, name: x.name };
    return null;
  }
  const tower = () => api.towerUp();
  const heroes = () => (api.towerOpen() ? tower().res.filter((r) => r.h) : []);
  const byId = (id) => tower().res.find((r) => r.id === id && r.h) || null;
  let ver = 1, calcVer = 0, calcT = 0, E = null, oldDone = false;
  const dirty = () => { ver++; };

  // ---------------- roll ----------------
  function roll(gift) {
    const r = pick(gift ? B.oddsGift : B.odds), [lo, hi] = B.stat[r];
    return { r, b: [0, 1, 2, 3].map(() => rint(lo, hi)), lv: 1, xp: 0, sk: [], off: null, g: [0, 0, 0, 0], gift: gift ? 1 : 0, at: Date.now() };
  }
  // hero r enters (tower or its door): roll once, bring one item, queue the reveal (quiet during the offline catch-up / old saves)
  function enter(r, a, quiet) {
    if (!r || r.h) return;
    r.id ||= api.nextId();
    r.h = roll(!!(a && a.gift));
    { const hh = H(); if (hh.bank > 0) { const b = hh.bank; hh.bank = 0; r.h.fromFw = Math.round(b); setTimeout(() => addXp(r, b, 'fw'), 0); } }   // farewell XP waiting for the next hero
    const it = makeItem(Math.max(r.h.r >= 2 ? 1 : 0, pick(B.oddsItem)), {}); it.src = 'tower'; r.h.g[it.s] = it.id;   // he brings it wearing it
    r.h.brought = it.id;
    dirty();
    api.stats('hero', { k: 'roll', r: r.h.r, g: r.h.gift });
    if (quiet || api.ffwd()) { (H().quiet ||= []).push(r.id); return; }   // one summary card later (no journal line per hero)
    api.glog('imp', `🦸 ${r.name} стал героем: ${RAR[r.h.r].s} ${RAR[r.h.r].n}`);
    if (api.tkNote) api.tkNote('🦸', `${r.name} поселил(ась) в башне и стал(а) героем — ${RAR[r.h.r].n.toLowerCase()}. Начинаю для него(неё) новую страницу.`, 'hero_' + r.id);   // tikhon_chronicler, PLACEHOLDER text for Maria
    api.iq('cel', 'hero_' + r.id, revealFn(r.id));
  }
  // ---------------- stats, levels, skills ----------------
  const maxLv = (h) => B.maxLv[h.r];
  function baseStats(r, w = api.world()) {
    const h = r.h, tr = TRAIT[r.sp], m = r.rk === 5 ? 1 + B.master : 1, l = 1 + B.lvStat * (h.lv - 1);
    return h.b.map((v, k) => Math.round(v * (tr && tr[0] === k ? 1 + B.trait : 1) * m * l * (w === 2 && k === 1 ? 1 + B.w2.def : 1)));   // W2: 🛡️ +10 %
  }
  const itemsOf = (r) => r.h.g.map((id) => (id ? itemById(id) : null));
  function stats(r, w) {
    const s = baseStats(r, w);
    for (const it of itemsOf(r)) if (it) it.st.forEach((v, k) => { s[k] += v; });
    return s;
  }
  const power = (r) => stats(r).reduce((a, b) => a + b, 0);
  function setsOf(r) {   // { setId: pieces } with >= 3 pieces -> k = 1 (3) or 1.5 (4)
    const n = {}; for (const it of itemsOf(r)) if (it && it.set) n[it.set] = (n[it.set] || 0) + 1;
    const out = {}; for (const [k, c] of Object.entries(n)) if (c >= 3) out[k] = c >= 4 ? 1.5 : 1;
    return out;
  }
  function fxOf(r) { const o = {}; for (const [k, m] of Object.entries(setsOf(r))) { const f = SETS[k].fx || k; o[f] = (o[f] || 0) + m; } return o; }   // set bonuses by effect (W2 sets reuse W1 effects)
  const sb = (r) => 1 + itemsOf(r).reduce((a, it) => a + (it && it.t === 's' ? B.itemSb[it.r] : 0), 0);   // school items boost post effects
  const skv = (r, id) => (r.h.sk.includes(id) ? SK[id].v * (1 + 0.25 * r.h.r) : 0);
  function addXp(r, n, why) {
    const h = r && r.h; if (!h || h.lv >= maxLv(h)) return;
    h.xp += n;
    while (h.lv < maxLv(h) && h.xp >= B.xpNeed(h.lv)) {
      h.xp -= B.xpNeed(h.lv); h.lv++; dirty();
      if (h.lv % B.skillEvery === 0 && !h.off) offer(r);
      if (!api.ffwd()) api.toast(`⬆️ ${r.name}: уровень ${h.lv}${h.off ? ' · выбери умение' : ''}`);
      api.stats('hero', { k: 'lv', l: h.lv, r: h.r });
    }
    if (h.lv >= maxLv(h)) h.xp = 0;
  }
  function offer(r, again) {   // 1 of 2: school and valley skills mixed; the hero's stats tilt it, rarity opens the rarer skills
    const h = r.h, st = stats(r), own = new Set(h.sk);
    const ok = SKILLS.filter((s) => !own.has(s.id) && (s.r || 0) <= h.r && (s.k !== 'v' || B.valleyLive));   // audit F4: no dead valley skills before the valley
    if (!ok.length) { if (!again) h.skQ = (h.skQ || 0) + 1; return false; }   // nothing to offer now: the choice is kept for later
    const school = ok.filter((s) => s.k === 's'), valley = ok.filter((s) => s.k === 'v');
    const tilt = st[3] / Math.max(1, st[0] + st[3]);   // ✨ vs 💪
    let a, b;
    if (school.length && valley.length && Math.random() < 0.7) { a = rnd(school); b = rnd(valley); }   // usually a real trade-off
    else { const side = Math.random() < 0.3 + 0.4 * tilt ? (school.length ? school : valley) : (valley.length ? valley : school); a = rnd(side); b = rnd(ok.filter((s) => s !== a)) || null; }
    h.off = [a.id, b ? b.id : null].filter(Boolean);
    return true;
  }
  function choose(r, id) { const h = r.h; if (!h.off || !h.off.includes(id)) return; h.sk.push(id); h.off = null; dirty(); api.stats('hero', { k: 'skill' }); api.toast(`${SK[id].e} ${r.name} выучил умение «${SK[id].n}»`); }
  function lvUp(r) {   // 🔮 speeds growth: one level at once
    const h = r.h; if (h.lv >= maxLv(h)) return;
    const c = B.lvStones(h.lv); if (api.stones() < c) { api.toast(`🔮 Нужно ${c} лунных камней`); return; }
    if (!api.stonesAdd(-c, 'hero_lv')) return;
    addXp(r, B.xpNeed(h.lv) - h.xp + 0.001, 'stones');
  }
  // ---------------- gear ----------------
  function itemById(id) { return chest().items.find((x) => x.id === id) || null; }
  function makeItem(rar, o) {
    const pw = poolW(o.w ?? api.world()), s = o.s ?? rint(0, 3), set = o.set !== undefined ? o.set : (Math.random() < B.setP ? rnd(setIdsOf(pw)) : '');
    const t = set ? SETS[set].t : (o.t || (Math.random() < 0.5 ? 's' : 'b'));
    const main = Math.round(B.item[rar] * (0.85 + 0.3 * Math.random())), sub = Math.max(1, Math.round(main * 0.4));
    const st = [0, 0, 0, 0];
    if (t === 's') { st[3] = main; st[1] = sub; } else { const m = SLOT[s].m; st[m] = main; st[rnd([0, 1, 2].filter((k) => k !== m))] = sub; }
    const w = set ? SETS[set].w || 1 : pw, n = set ? SETS[set].p[s] : rnd(w === 2 ? SLOT_W2[s][t] : SLOT[s][t]);
    const it = { id: chest().nid++, s, r: rar, t, set, st, n, w };
    chest().items.push(it); putChest();
    return it;
  }
  const wornBy = (id) => tower().res.concat(tower().wait).find((r) => r.h && r.h.g.includes(id)) || null;   // this school
  function equip(r, id) {
    const it = itemById(id); if (!r || !r.h || !it) return;
    { const o = wornElse(id); if (o) { api.toast(`🎒 Эта вещь у ${o.r.name} (${o.name}) — сними её там`); return; } }   // another world's hero: only from his world
    const w = wornBy(id); if (w) w.h.g[w.h.g.indexOf(id)] = 0;   // moved freely: no loss, no fee
    r.h.g[it.s] = id; dirty(); syncValley();
  }
  function unequip(r, s) { if (r && r.h) { r.h.g[s] = 0; dirty(); syncValley(); } }
  // ---- gear sources (gear_sources.py, registry C7.14): daily chests, the closed day, ruins, weekly alliance prizes, valley v2 (window.heroDrop)
  // src: chest | day | ruins | alliance | v2ruin | boss | <any short word>; rar: fixed rarity or null (B.oddsItem); o.tok: one chance per
  // token (kept in the account chest, so the same chest / day / ruin / prize never pays twice, also across reloads); o.p: chance
  // (default by src: chestP, dayP, ruinsP; otherwise 1 = guaranteed); o.min: lowest rarity; o.w: world pool (default: the current world);
  // o.quiet: no toast (the caller shows it). Gear needs heroes: nothing drops until a tower stands in some world of the account.
  const P_OF = { chest: 'chestP', day: 'dayP', ruins: 'ruinsP', v2ruin: 'ruinsP' };
  const gearOn = () => api.towerOpen() || others().some((x) => x.S.tower && x.S.tower.built);
  function drop(src, rar, o = {}) {
    if (!gearOn()) return null;
    const c = chest(), tok = o.tok ? String(o.tok).slice(0, 80) : '';
    if (tok) { c.tok ||= {}; if (c.tok[tok]) return null; c.tok[tok] = Date.now();   // a token is spent even when the roll misses
      const ks = Object.keys(c.tok); if (ks.length > B.tokMax) ks.sort((a, b) => c.tok[a] - c.tok[b]).slice(0, ks.length - B.tokMax).forEach((k) => delete c.tok[k]); }
    const p = o.p ?? (P_OF[src] ? B[P_OF[src]] : 1);
    if (Math.random() >= p) { if (tok) putChest(); return null; }
    const r = Math.min(3, Math.max(o.min || 0, rar ?? pick(B.oddsItem)));
    const it = makeItem(r, { w: o.w }); it.src = String(src).slice(0, 8); putChest(); dirty();
    if (!o.quiet && !api.ffwd()) api.toastBig(`🎒 Находка для героев: ${label(it)}`);
    api.glog('imp', `🎒 Находка для героев: ${label(it)}`);
    api.stats('hero', { k: 'drop', r: it.r, s: it.src, w: itemW(it) });
    return it;
  }
  const label = (it) => `${SLOT[it.s].e} ${it.n} ${RAR[it.r].s}`;
  function call(n) {   // paid «✨ Звёздный зов»: n pulls, odds shown, pity
    const c = n >= 10 ? B.call10Cost : B.callCost * n;
    if (api.stones() < c) { api.toast(`🔮 Нужно ${c} лунных камней`); return null; }
    if (!api.stonesAdd(-c, 'hero_call')) return null;
    const h = chest(), out = [];
    for (let k = 0; k < n; k++) {
      h.pulls++; h.pity++;
      let r = pick(B.oddsItem); if (h.pity >= B.pity && r < 2) r = 2;   // pity: a ⭐⭐⭐+ item at least every B.pity pulls
      if (r >= 2) h.pity = 0;
      const it = makeItem(r, {}); it.src = 'call'; out.push(it.id);
    }
    putChest();
    lastPull = out; api.stats('hero', { k: 'call', n, r: Math.max(...out.map((id) => itemById(id).r)) });
    api.glog('imp', `✨ Звёздный зов ×${n}: ${out.map((id) => RAR[itemById(id).r].s).join(' ')}`);
    return out;
  }
  function workshop(ids) {   // 3 unwanted items -> 1 random item
    const L = ids.map(itemById).filter((it) => it && !wornBy(it.id) && !wornElse(it.id));
    if (L.length !== B.ws) return null;
    const avg = L.reduce((a, it) => a + it.r, 0) / L.length;
    let r = Math.floor(avg); if (Math.random() < B.wsUp + (avg - r)) r++; r = Math.min(3, r);
    const sets = {}; L.forEach((it) => { if (it.set) sets[it.set] = (sets[it.set] || 0) + 1; });
    const ss = Object.entries(sets).find(([, c]) => c >= 2);
    const items = chest().items; L.forEach((it) => items.splice(items.indexOf(it), 1));
    const it = makeItem(r, ss && Math.random() < 0.5 ? { set: ss[0] } : {}); it.src = 'ws'; putChest();
    api.stats('hero', { k: 'ws', r }); lastWs = it.id; return it;
  }
  // ---------------- posts ----------------
  function postOf(id) {
    const h = H();
    for (const [ci, x] of Object.entries(h.m)) if (x === id) return { t: 'm', i: +ci };
    if (h.c.includes(id)) return { t: 'c' };
    for (let k = 0; k < h.s.length; k++) if ((h.s[k] || []).includes(id)) return { t: 's', k };
    return null;
  }
  function unpost(id) { const h = H(); for (const k of Object.keys(h.m)) if (h.m[k] === id) delete h.m[k]; h.c = h.c.filter((x) => x !== id); h.s = h.s.map((l) => l.filter((x) => x !== id)); }
  const sqOpen = (k) => k === 0 && api.towerOpen();   // one squad per school, open with the tower
  function setPost(r, p) {   // p: 'none' | 'c' | 'm<ci>' | 's<k>'
    const h = H(), id = r.id;
    if (p === 'none') { unpost(id); dirty(); syncValley(); return true; }
    if (p === 'c' && h.c.length >= 3 && !h.c.includes(id)) { api.toast('🏛 В совете все 3 места заняты'); return false; }
    if (p[0] === 's') { const k = +p.slice(1); if (!sqOpen(k)) return false; if (h.s[k].length >= B.squadN && !h.s[k].includes(id)) { api.toast(`⚔️ В отряде уже ${B.squadN} героев`); return false; } }
    unpost(id);
    if (p === 'c') h.c.push(id);
    else if (p[0] === 'm') { const ci = +p.slice(1); if (!api.isOpen(ci)) return false; h.m[ci] = id; }
    else if (p[0] === 's') h.s[+p.slice(1)].push(id);
    dirty(); syncValley(); api.stats('hero', { k: 'post', p: p[0] });
    return true;
  }
  function leave(r) { if (r && r.id) { unpost(r.id); dirty(); syncValley(); } }   // gear stays in the chest (it is the account's)
  const xpTotal = (r) => { let t = r.h.xp || 0; for (let l = 1; l < r.h.lv; l++) t += B.xpNeed(l); return t; };
  // farewell of r (game.js towerFarewell moves the records): nw takes his post and half his XP; none -> XP banked for the next arrival
  function farewell(r, nw) {
    if (!r || !r.h) return 0; const h = H(), x = xpTotal(r) * B.fwXp, id = r.id;
    if (nw && nw.h) {
      unpost(nw.id);
      for (const k of Object.keys(h.m)) if (h.m[k] === id) h.m[k] = nw.id;
      h.c = h.c.map((v) => (v === id ? nw.id : v)); h.s = h.s.map((l) => l.map((v) => (v === id ? nw.id : v)));
      addXp(nw, x, 'fw');
    } else { unpost(id); h.bank = (h.bank || 0) + x; }
    api.stats('hero', { k: 'fw', r: r.h.r, lv: r.h.lv, nw: nw ? 1 : 0 });
    dirty(); syncValley(); return Math.round(x);
  }
  const weakest = () => heroes().filter((r) => !r.away && !r.mc).sort((a, b) => power(a) - power(b))[0] || null;
  const matchK = (r, ci) => { const C = api.classes()[ci]; if (!C) return 1; const fav = FAV_CLASS[r.sp] === C.id, el = r.rk === 5 && (CLASS_EL[C.id] === undefined ? (C.id === 'elements' || C.final) : CLASS_EL[C.id] === (r.el || 0)); return fav || el ? B.match : 1; };
  // ---------------- effects (cached; recomputed when something changes, else at most once a second) ----------------
  function calc() {
    const C = api.classes(), n = C.length, h = H();
    const e = { ex: Array(n).fill(0), rk: Array(n).fill(0), mood: Array(n).fill(0), lk: Array(n).fill(1), pay: 0, moodAll: 0, arr: 0, inc: {} };
    if (!api.towerOpen()) return e;
    for (const r of heroes()) {
      const lv = r.h.lv, st = fxOf(r);
      e.inc[r.id] = (1 + B.incLv * (lv - 1)) * (1 + skv(r, 'rich')) * (1 + (st.gold ? 0.4 * st.gold : 0));
    }
    for (const [cs, id] of Object.entries(h.m)) {
      const ci = +cs, r = byId(id); if (!r || ci >= n || !api.isOpen(ci)) continue;
      const s = stats(r), b = sb(r), st = fxOf(r);
      e.ex[ci] += s[3] * B.mentEx * matchK(r, ci) * b + skv(r, 'mentor') + (st.owl ? 0.03 * st.owl : 0);
      e.rk[ci] += skv(r, 'exam');
      e.mood[ci] += skv(r, 'insp') + (st.garden ? 3 * st.garden : 0);
      e.lk[ci] *= 1 - skv(r, 'quick');
    }
    for (const id of h.c) {
      const r = byId(id); if (!r) continue;
      const s = stats(r), b = sb(r), st = fxOf(r);
      e.pay += s[3] * B.cPay * b + skv(r, 'rich') / 15;
      e.moodAll += s[1] * B.cMood * b + skv(r, 'insp') / 2 + (st.garden ? 1 * st.garden : 0);
      e.arr += s[2] * B.cArr * b + skv(r, 'herald');
    }
    return e;
  }
  const eff = () => { if (!E || calcVer !== ver) { E = calc(); calcVer = ver; } return E; };
  const examB = (i) => (eff().ex[i] || 0);
  const rankB = (i) => (eff().rk[i] || 0);
  const moodB = (i) => (eff().mood[i] || 0) + eff().moodAll;
  const lessonK = (i) => eff().lk[i] ?? 1;
  const payK = () => 1 + eff().pay;
  const arrK = () => 1 + eff().arr;
  const incK = (r) => (r && r.h && r.id ? (eff().inc[r.id] ?? 1) : 1);
  // ---------------- squads -> valley numbers (client side; server change specified in design/hero_valley_server_spec.md) ----------------
  function squadNums(k) {
    const ids = H().s[k] || [], L = ids.map(byId).filter(Boolean), V = B.v;
    const sum = [0, 0, 0, 0]; L.forEach((r) => stats(r).forEach((v, q) => { sum[q] += v; }));
    const sk = (id) => L.reduce((a, r) => a + skv(r, id), 0);
    const set = (id) => L.reduce((a, r) => a + (fxOf(r)[id] || 0), 0);   // by effect: W2 sets count as their fx
    const el = (q) => Math.min(V.elemCap, L.filter((r) => r.rk === 5 && (r.el || 0) === q).length * V.elem);
    return {
      n: L.length, power: sum.reduce((a, b) => a + b, 0), sum,
      atk: 1 + sum[0] / V.atkDiv + sk('banner'), def: 1 + sum[1] / V.defDiv + sk('guard') + 0.2 * set('deep'),
      troops: Math.floor(sum[2] / V.spdDiv) + Math.round(sk('scout')) + Math.round(2 * set('storm')), ruins: 1 + sum[3] / V.chDiv + sk('treasure'), siege: sk('siege'),
      terr: { forest: el(0) + 0.25 * set('dragon'), lake: el(1), mount: el(2) + (api.world() === 2 && L.length ? B.w2.mount : 0) + 0.25 * set('mount'), meadow: el(3) },   // fire: forest, water: by the lakes, earth: mountains, air: meadow; W2 +10 % in the mountains
      mine: (1 + sum[3] / V.chDiv + sk('treasure')) * (api.world() === 2 ? 1 + B.w2.mine : 1) * (1 + 0.25 * set('mine')),   // + W2 set «Фонарь рудокопа»   // mines multiplier (W2 ×1.25)
    };
  }
  function otherSquads() {   // [{ w, name, n, power }] of the account's other schools
    return others().map((x) => { const hs = x.S.heroes || {}, s0 = (hs.s || [[]]).flat().slice(0, B.squadN), R = ((x.S.tower || {}).res || []).filter((r) => r && r.h);
      const L = s0.map((id) => R.find((r) => r.id === id)).filter(Boolean); if (!(x.S.tower && x.S.tower.built)) return { w: x.w, name: x.name, none: 1 };
      return { w: x.w, name: x.name, n: L.length, power: L.reduce((a, r) => a + stats(r, x.w).reduce((p, q) => p + q, 0), 0) }; });
  }
  let syncT = 0;
  function syncValley() {   // STUB: stores the squad numbers; the server call comes with the valley server change (spec file)
    const h = H(); h.vs = { at: Date.now(), w: api.world(), sq: [sqOpen(0) ? squadNums(0) : null] };
    // TODO(server, design/hero_valley_server_spec.md): POST {LAZY}/game/valley/squad { world, week, squad: h.vs.sq[0] } — squad identity = account + world; not sent in this build
  }
  // ---------------- step (from stepTower: every frame, also in the offline catch-up) ----------------
  let xpAcc = 0, oneSec = 0;
  function step(dt) {
    if (api.edit() || !api.towerOpen()) return;
    if (!oldDone) {   // old saves: residents (and those at the door) are rolled once, quietly, one summary card
      migrateAll(); api.fameUpd();   // worlds rework: account chest + one squad; farewell fame
      oldDone = true; const T = tower(); let n = 0;
      for (const r of [...T.res, ...T.wait]) if (!r.h) { enter(r, null, true); n++; }
      if (n) H().oldN = (H().oldN || 0) + n;
      for (const r of heroes()) {   // audit F4: a pending offer with a valley skill is re-rolled; banked choices come back when the valley is live
        const hh = r.h; if (!B.valleyLive && hh.off && hh.off.some((id) => SK[id] && SK[id].k === 'v')) { hh.off = null; offer(r); }
        if (B.valleyLive && !hh.off && hh.skQ > 0 && offer(r, true)) hh.skQ--;
      }
    }
    xpAcc += dt; oneSec += dt;
    if (xpAcc >= 5) { const m = xpAcc / 60 * B.xpMin; xpAcc = 0; for (const r of heroes()) if (!r.away) addXp(r, m, 'tower'); }
    if (oneSec >= 1) { oneSec = 0; ver++; }   // effects follow the school (classes opening, ranks) at least once a second
    const q = H().quiet;
    if (q && q.length && !api.ffwd()) api.iq('cel', 'hero_sum', summaryFn);
  }
  // ---------------- tower hooks ----------------
  function retake(r, rk) {   // back from the exam hall: XP; a new Мастер = big promotion
    if (!r || !r.h) return;
    const promo = rk === 5 && r.rk !== 5;
    addXp(r, B.xpRetake + (promo ? B.xpPromo : 0), 'retake');
    if (promo) { dirty(); api.stats('hero', { k: 'promo', r: r.h.r }); if (!api.ffwd()) api.toastBig(`🌟 ${r.name} стал ${TN().mI}! Стихия открыта, все характеристики +${Math.round(B.master * 100)} %`); }
  }
  const xp = (r, why) => addXp(r, why === 'mc' ? B.xpMc : why === 'retake' ? B.xpRetake : 0, why);
  const inClass = (r) => { const p = r && r.id && postOf(r.id); return !!(p && p.t === 'm' && api.isOpen(p.i)); };
  function drawMentors(add) {   // a mentor stands beside the teacher of his class (placeholder: the creature + 🎓)
    for (const [cs, id] of Object.entries(H().m)) {
      const ci = +cs, r = byId(id), s = api.slotOf(ci); if (!r || !s || !api.isOpen(ci) || r.away || r.mc) continue;
      const tp = api.teacherPos(ci), x = Math.max(s.x0 + 0.6, Math.min(s.x1 - 0.6, tp.x - 1.3)), y = Math.max(s.y0 + 0.6, Math.min(s.y1 - 0.6, tp.y + 0.4));
      if (window.__s8bDraw) window.__s8bDraw[ci] = { x, y, tp, s: [s.x0, s.y0, s.x1, s.y1] };   // test hook
      add(x, y, () => api.drawCreature({ sp: r.sp, rk: r.rk, el: r.el || 0, back: false, flip: false, path: [], ph: ci + performance.now() / 1000 }, x, y, 30, (sx, sy) => api.emoji('🎓', sx + 11, sy - 36, 12)));
    }
  }
  // ---------------- UI ----------------
  injectCss();
  let tab = 'tower', sel = 0, gearSlot = -1, postPick = false, sqPick = null, lastPull = null, lastWs = 0;
  const wsSel = new Set(), flipped = new Set();
  const W2 = () => api.world() === 2;   // world 2 «Чертог Хранителей» mirrors the same code with its own words
  const TN = () => (W2() ? { tw: 'Чертог', twG: 'Чертога', emo: '🗝️', val: '«Подземные чертоги»', mI: 'Хранителем', terr: { forest: '🍄 роща', lake: '💧 озёра', mount: '⛰️ скалы', meadow: '🪨 залы' }, tn: ['в грибной роще', 'у подземных озёр', 'в скалах', 'в каменных залах'] }
    : { tw: 'Башня', twG: 'башни', emo: '🏰', val: '«Волшебную долину»', mI: 'Мастером', terr: { forest: '🌲 лес', lake: '💧 озёра', mount: '⛰️ горы', meadow: '🌼 луг' }, tn: ['в лесу', 'у озёр', 'в горах', 'на лугах'] });
  const stars = (r) => `<span class="hx-r hx-r${r}">${RAR[r].s}</span>`;
  const statLine = (s) => s.map((v, k) => `<span class="hx-st">${ST[k].e} ${v}</span>`).join('');
  const itemLine = (it, extra = '') => `<span class="hx-it hx-i${it.r}">${SLOT[it.s].e} ${esc(it.n)} ${RAR[it.r].s}</span> <span class="muted">${it.st.map((v, k) => (v ? `${ST[k].e}${v}` : '')).filter(Boolean).join(' ')}${it.t === 's' ? ` · школа +${pc(B.itemSb[it.r])}` : ' · бой'}${it.set ? ` · ${SETS[it.set].e} ${esc(SETS[it.set].n)}` : ''}${itemW(it) !== poolW(api.world()) ? ` · ${POOL[itemW(it)].e} ${POOL[itemW(it)].n}` : ''}${extra}</span>`;
  const oddsTxt = (o) => o.map((p, k) => `${RAR[k].s} ${Math.round(p * 1000) / 10} %`.replace('.', ',')).join(' · ');
  const postTxt = (r) => { const p = r.id && postOf(r.id); if (!p) return 'без поста'; if (p.t === 'm') return `🎓 наставник: ${esc((api.classes()[p.i] || {}).name || '')}`; if (p.t === 'c') return `🏛 совет ${TN().twG}`; return '⚔️ отряд школы'; };
  const badge = (r) => (r && r.h ? `${stars(r.h.r)} <span class="muted">ур. ${r.h.lv}${r.h.off ? ' · ❗ умение' : ''}</span>` : '');
  const tabBar = () => `<div class="hx-tabs">${[['tower', `${TN().emo} ${TN().tw}`], ['heroes', '🦸 Герои'], ['squad', '⚔️ Отряд'], ['chest', '🎒 Сундук']].map(([k, t]) => `<button class="btn small${tab === k ? '' : ' ghost'}" data-hx="tab:${k}">${t}${k === 'heroes' && heroes().some((r) => r.h.off) ? ' ❗' : ''}</button>`).join('')}</div>`;
  function effLines() {
    const e = eff(), C = api.classes(), L = [];
    if (e.pay || e.moodAll || e.arr) L.push(`🏛 Совет: плата за уроки +${pc(e.pay)}, настроение после урока +${e.moodAll.toFixed(1).replace('.', ',')}, новички +${pc(e.arr)}`);
    C.forEach((c, i) => { if (e.ex[i] || e.rk[i] || e.mood[i] || e.lk[i] < 1) L.push(`🎓 ${esc(c.name)}: экзамен +${pc(e.ex[i])}${e.rk[i] ? `, звание +${pc(e.rk[i])}` : ''}${e.mood[i] ? `, настроение +${Math.round(e.mood[i])}` : ''}${e.lk[i] < 1 ? `, урок −${pc(1 - e.lk[i])}` : ''}`); });
    return L;
  }
  function towerSummary() {
    const L = heroes(); if (!L.length) return `<div class="card up"><span class="remoji">🦸</span><div class="grow"><b>Герои ${TN().twG}</b><div class="muted">Каждый, кто поселится здесь, станет героем: выпадет его редкость и характеристики (${oddsTxt(B.odds)}).</div></div></div>`;
    const ef = effLines();
    return `<div class="card up" data-hx="tab:heroes"><span class="remoji">🦸</span><div class="grow"><b>Героев: ${L.length}</b> <span class="muted">${L.map((r) => RAR[r.h.r].s).join(' ')}</span><div class="muted">${ef.length ? ef.slice(0, 3).join('<br>') : 'Поставь героев наставниками, в совет или в отряд — вкладка «🦸 Герои».'}</div></div></div>`;
  }
  function tabHtml(head) {
    if (tab === 'tower' || !api.towerOpen()) return null;
    const hd = head(`Герои: ${heroes().length} · места ${tower().res.length} из ${api.towerCap()}`) + tabBar();
    if (tab === 'heroes') return hd + heroesTab();
    if (tab === 'squad') return hd + squadTab();
    if (tab === 'chest') return hd + chestTab();
    return null;
  }
  function heroRow(r, act) {
    return `<div class="card up hx-row" data-hx="${act || 'card:' + r.id}">${api.pic(r)}<div class="grow"><b>${esc(r.name)}</b> ${badge(r)}<div class="muted">${esc(api.resTitle(r))} · ${postTxt(r)} · мощь ${power(r)}</div></div></div>`;
  }
  function heroesTab() {
    const L = heroes().slice().sort((a, b) => b.h.r - a.h.r || b.h.lv - a.h.lv), h = H(), C = api.classes();
    let s = '';
    const ef = effLines();
    s += `<h3>🏛 Совет ${TN().twG} (${h.c.filter(byId).length}/3)</h3><p class="muted">Советники помогают всей школе: ✨ Чары поднимают плату за уроки, 🛡️ Стойкость — настроение после урока, 💨 Скорость — приток новичков.</p>`;
    s += h.c.map(byId).filter(Boolean).map((r) => heroRow(r)).join('') || '<p class="muted">Пока никого. Открой героя и нажми «🏛 В совет».</p>';
    s += `<h3>🎓 Наставники классов</h3><p class="muted">Наставник стоит в классе рядом с учителем. Его ✨ Чары поднимают шанс экзамена; если это любимый класс его вида или класс его стихии — в полтора раза больше.</p>`;
    s += C.map((c, i) => { if (!api.isOpen(i)) return ''; const r = byId(h.m[i]); return `<div class="card up"><span class="remoji">${c.emoji}</span><div class="grow"><b>${esc(c.name)}</b><div class="muted">${r ? `${esc(r.name)} ${RAR[r.h.r].s} ур. ${r.h.lv} · экзамен +${pc(examB(i))}` : 'наставника нет'}</div></div>${r ? `<button class="btn small ghost" data-hx="card:${r.id}">Карточка</button>` : ''}</div>`; }).join('');
    if (ef.length) s += `<p class="muted">${ef.join('<br>')}</p>`;
    s += `<h3>🦸 Все герои (${L.length})</h3>` + (L.map((r) => heroRow(r)).join('') || '<p class="muted">Пока нет героев.</p>');
    s += `<p class="muted">Шансы редкости при заселении: ${oddsTxt(B.odds)}; у одарённых: ${oddsTxt(B.oddsGift)}. Опыт идёт сам, пока герой живёт здесь, и за мастер-классы и пересдачи.</p>`;
    { const wt = WORLD_TR[api.world()]; if (wt) s += `<p class="muted">Герои этой школы — ${esc(wt.n)}: ${wt.d}. Постов в школе ${7 + 3 + B.squadN}: 7 наставников, 3 советника, ${B.squadN} в отряде.</p>`; }
    return s;
  }
  function squadTab() {
    const h = H(), free = heroes().filter((r) => !postOf(r.id));
    let s = `<p class="muted">У каждой школы — один отряд из ${B.squadN} героев. Все отряды твоих школ сражаются вместе в одной долине. Отряд пойдёт в ${TN().val}: 💪 Сила — атака, 🛡️ Стойкость — укрепление, 💨 Скорость — больше отрядов в день, ✨ Чары — больше с руин и шахт. ${[0, 1, 2, 3].map((e) => (e ? `${api.elemName(e)} — ${TN().tn[e]}` : `${api.masterWord()} ${api.elemName(e)} сильнее ${TN().tn[e]}`)).join(', ')}. В долине это заработает позже.</p>`;
    for (let k = 0; k < 1; k++) {
      if (!sqOpen(k)) continue;
      const v = squadNums(k), L = h.s[k].map(byId).filter(Boolean);
      s += `<h3>⚔️ Отряд школы · мощь ${v.power}</h3>`;
      s += `<div class="hx-sq">${Array.from({ length: B.squadN }, (_, q) => q).map((q) => { const r = L[q]; return r ? `<div class="hx-sqc" data-hx="card:${r.id}">${api.pic(r)}<b>${esc(r.name)}</b><span>${RAR[r.h.r].s} ур. ${r.h.lv}</span></div>` : `<div class="hx-sqc hx-empty" data-hx="sqpick:${k}">＋<span>место</span></div>`; }).join('')}</div>`;
      if (v.n) s += `<p class="muted">атака ×${v.atk.toFixed(2)} · укрепление ×${v.def.toFixed(2)} · +${v.troops} отр./день · руины ×${v.ruins.toFixed(2)}${v.siege ? ` · штурм +${pc(v.siege)}` : ''}${Object.entries(v.terr).filter(([, x]) => x > 0).map(([t, x]) => ` · ${TN().terr[t]} +${pc(x)}`).join('')}</p>`;
      if (sqPick === k) s += free.length ? `<div class="hx-pick">${free.map((r) => heroRow(r, `sqset:${k}:${r.id}`)).join('')}</div>` : '<p class="muted">Свободных героев нет: сними кого-нибудь с поста.</p>';
    }
    const os = otherSquads();
    s += `<p class="muted hx-other">🌍 Отряды других твоих школ: ${os.length ? os.map((o) => `${esc(o.name)} — ${o.none ? 'башни ещё нет' : `${o.n}/${B.squadN} героев, мощь ${o.power}`}`).join(' · ') : 'пока нет: откроешь новый мир — будет новая школа и новый отряд'}.</p>`;
    return s;
  }
  function chestTab() {
    const h = chest(), items = h.items.slice().sort((a, b) => b.r - a.r || a.s - b.s);
    let s = '';
    const cw = poolW(api.world()), mySets = setIdsOf(cw), otherSets = SET_IDS.filter((k) => !mySets.includes(k));
    s += `<h3>✨ Звёздный зов</h3><p class="muted">Призыв вещи для героев за 🔮 лунные камни. Выпадают вещи этого мира (${POOL[cw].e} ${POOL[cw].n}) и его наборы: ${mySets.map((k) => SETS[k].e).join(' ')}; вещи другого мира выпадают только там. Шансы: ${oddsTxt(B.oddsItem)}. Гарантия: вещь ⭐⭐⭐ или лучше не реже, чем раз в ${B.pity} призывов (осталось ${Math.max(1, B.pity - h.pity)}). У тебя 🔮 ${api.stones()}.</p>
      <div class="hx-btns"><button class="btn" data-hx="call:1">Призвать ×1 <span class="cost">🔮${B.callCost}</span></button><button class="btn" data-hx="call:10">×10 <span class="cost">🔮${B.call10Cost}</span></button></div>`;
    if (lastPull && lastPull.length) s += `<div class="hx-pull">${lastPull.map((id, k) => { const it = itemById(id); return it ? `<div class="hx-card hx-flip hx-i${it.r}" style="animation-delay:${k * 0.12}s"><em>${SLOT[it.s].e}</em><b>${esc(it.n)}</b><span>${RAR[it.r].s}</span></div>` : ''; }).join('')}</div>`;
    s += `<h3>⚒️ Мастерская: 3 → 1</h3><p class="muted">Отметь 3 ненужные вещи (не надетые) — из них выйдет одна новая. Её редкость — около средней, иногда на ступень выше; две вещи одного набора могут дать вещь этого набора.</p>`;
    s += `<button class="btn wide${wsSel.size === B.ws ? '' : ' ghost'}" data-hx="wsgo">⚒️ Переплавить (${wsSel.size}/${B.ws})</button>`;
    if (lastWs && itemById(lastWs)) s += `<p>Вышло: ${itemLine(itemById(lastWs))}</p>`;
    s += `<h3>🎒 Сундук героев (${items.length})</h3><p class="muted">Один сундук на все твои школы. Любую вещь можно снять с одного героя и надеть на другого, ничего не теряется; вещь героя другой школы снимают в его школе. 3 вещи одного набора на одном герое дают бонус набора, 4 — в полтора раза больше.</p>`;
    s += items.map((it) => { const w = wornBy(it.id), o = w ? null : wornElse(it.id); return `<div class="card up hx-itrow${wsSel.has(it.id) ? ' hx-sel' : ''}" ${w || o ? '' : `data-hx="ws:${it.id}"`}><span class="remoji">${SLOT[it.s].e}</span><div class="grow">${itemLine(it)}<div class="muted">${w ? `надета: ${esc(w.name)}` : o ? `надета: ${esc(o.r.name)} · ${esc(o.name)}` : wsSel.has(it.id) ? '✔ в мастерскую' : 'лежит в сундуке'}</div></div></div>`; }).join('') || '<p class="muted">Пусто.</p>';
    s += `<p class="muted">Откуда берутся вещи: герой приносит одну, когда поселяется ${api.towerIn()}; 🎁 сундучки дня — ${pc(B.chestP)} за каждый открытый; ☀️ удачный день «Сегодня» — ${pc(B.dayP)}; 🏚 руины долины — ${pc(B.ruinsP)}; 🏆 недельная награда альянса — за 1–3 место точно; ⚒️ мастерская; ✨ Звёздный зов. Вещи каждого мира выпадают только в нём.</p>`;
    const setP = (k) => `<p class="muted">${SETS[k].e} <b>${esc(SETS[k].n)}</b> (${SETS[k].t === 's' ? 'школа' : 'бой'}): ${SETS[k].d(1)}</p>`;
    s += `<h3>Наборы этого мира</h3>` + mySets.map(setP).join('');
    if (otherSets.length) s += `<h3>Наборы другого мира</h3><p class="muted">Выпадают только там: ${POOL[3 - cw] ? `${POOL[3 - cw].e} ${POOL[3 - cw].n}` : 'в другом мире'}. Надеть их можно на любого героя.</p>` + otherSets.map(setP).join('');
    return s;
  }
  function bio(r) {
    const d = new Date(r.t || r.h.at), C = api.classes(), fc = FAV_CLASS[r.sp] ? C.find((c) => c.id === FAV_CLASS[r.sp]) : null;
    return `${esc(r.name)} пришёл в школу новичком${r.h.gift ? ' — одарённым' : ''}${fc ? `, больше всего любил «${esc(fc.name)}»` : ''}, вырос до звания «${esc(api.resTitle(r))}» и поселился ${api.towerIn()} ${d.toLocaleDateString('ru-RU')}.`;
  }
  function cardPanel() {
    const r = byId(sel), hd = (t, sub, img) => `<div class="sh-head">${img || '<span class="remoji big">🦸</span>'}<div><h2>${t}</h2><div class="muted">${sub}</div></div><button class="x" data-close>✕</button></div>`;
    if (!r) return hd('Герой', '') + '<p class="muted">Этого героя здесь больше нет.</p><button class="btn wide ghost" data-hx="back">⬅ К героям</button>';
    const h = r.h, s = stats(r), b = baseStats(r), tr = TRAIT[r.sp], C = api.classes(), p = postOf(r.id), sets = setsOf(r);
    let x = hd(esc(r.name), `${stars(h.r)} ${RAR[h.r].n} · ${esc(api.spName(r.sp))} · ${esc(api.resTitle(r))}`, api.pic(r));
    x += `<p class="muted">${bio(r)}</p>`;
    const need = B.xpNeed(h.lv);
    x += `<div class="card up"><span class="remoji">📈</span><div class="grow"><b>Уровень ${h.lv} из ${maxLv(h)}</b><div class="hx-bar"><i style="width:${h.lv >= maxLv(h) ? 100 : Math.round(h.xp / need * 100)}%"></i></div><div class="muted">${h.lv >= maxLv(h) ? 'высший уровень для его редкости' : `опыт ${Math.floor(h.xp)}/${need} · идёт сам (~${need - Math.floor(h.xp)} мин)`} · доход ×${incK(r).toFixed(2)}</div></div>${h.lv < maxLv(h) ? `<button class="btn small" data-hx="lvup:${r.id}">+1 ур. <span class="cost">🔮${B.lvStones(h.lv)}</span></button>` : ''}</div>`;
    x += `<div class="card up"><span class="remoji">💪</span><div class="grow"><b>Мощь ${s.reduce((a, c) => a + c, 0)}</b><div class="hx-stats">${s.map((v, k) => `<span class="hx-st">${ST[k].e} ${ST[k].n} <b>${v}</b>${v > b[k] ? ` <i>(+${v - b[k]})</i>` : ''}</span>`).join('')}</div><div class="muted">${tr ? `Черта вида: ${esc(tr[1])} (${ST[tr[0]].e} +${Math.round(B.trait * 100)} %)` : ''}${r.rk === 5 ? ` · Мастер ${api.elemName(r.el || 0)}: все +${Math.round(B.master * 100)} %` : ` · станет ${TN().mI} — все +` + Math.round(B.master * 100) + ' %'}</div></div></div>`;
    // skills
    x += `<h3>Умения</h3>`;
    if (h.off) x += `<p><b>Новое умение: выбери одно</b></p>` + h.off.map((id) => { const k = SK[id]; return `<button class="btn wide" data-hx="skill:${r.id}:${id}">${k.e} ${esc(k.n)} — <span class="muted">${k.d(k.v * (1 + 0.25 * h.r))}</span></button>`; }).join('');
    x += h.sk.map((id) => { const k = SK[id]; return `<div class="card up"><span class="remoji">${k.e}</span><div class="grow"><b>${esc(k.n)}</b> <span class="muted">${k.k === 's' ? 'школа' : B.valleyLive ? 'долина' : 'долина · заработает с Долиной'}</span><div class="muted">${k.d(k.v * (1 + 0.25 * h.r))}</div></div></div>`; }).join('') || (h.off ? '' : `<p class="muted">Каждые ${B.skillEvery} уровней герой выбирает одно умение из двух.</p>`);
    if (h.skQ && !B.valleyLive) x += `<p class="muted">🔒 Отложено выборов умения: ${h.skQ} — умения отряда откроются вместе с Долиной.</p>`;   // audit F4
    // gear
    x += `<h3>Снаряжение</h3><div class="hx-gear">${SLOT.map((sl, k) => { const it = h.g[k] ? itemById(h.g[k]) : null; return `<div class="hx-slot${gearSlot === k ? ' on' : ''}${it ? ' hx-i' + it.r : ''}" data-hx="gslot:${k}"><em>${sl.e}</em><span>${it ? esc(it.n) : sl.n}</span><i>${it ? RAR[it.r].s : 'пусто'}</i></div>`; }).join('')}</div>`;
    if (Object.keys(sets).length) x += Object.entries(sets).map(([k, m]) => `<p class="muted">${SETS[k].e} Набор «${esc(SETS[k].n)}»${m > 1 ? ' (полный)' : ''}: ${SETS[k].d(m)}</p>`).join('');
    if (gearSlot >= 0) {
      const cur = h.g[gearSlot], L = chest().items.filter((it) => it.s === gearSlot && it.id !== cur).sort((a, b) => b.r - a.r).slice(0, 10);
      x += `<div class="hx-pick">${cur ? `<button class="btn small ghost" data-hx="unequip:${r.id}:${gearSlot}">Снять в сундук</button>` : ''}${L.map((it) => { const w = wornBy(it.id), o = w ? null : wornElse(it.id); return `<div class="card up hx-row${o ? ' locked' : ''}" data-hx="equip:${r.id}:${it.id}"><span class="remoji">${SLOT[it.s].e}</span><div class="grow">${itemLine(it)}<div class="muted">${w ? `сейчас у ${esc(w.name)} — перейдёт к ${esc(r.name)}` : o ? `у ${esc(o.r.name)} (${esc(o.name)}) — снять можно только там` : 'в сундуке'}</div></div></div>`; }).join('') || '<p class="muted">Других вещей для этого места пока нет.</p>'}</div>`;
    }
    // post
    x += `<h3>Пост</h3><div class="card up"><span class="remoji">${p ? (p.t === 'm' ? '🎓' : p.t === 'c' ? '🏛' : '⚔️') : '🛋️'}</span><div class="grow"><b>${postTxt(r)}</b><div class="muted">${p && p.t === 'm' ? `экзамен в классе +${pc(examB(p.i))}` : p && p.t === 'c' ? 'помогает всей школе' : p && p.t === 's' ? `мощь отряда ${squadNums(p.k).power}` : `просто живёт ${api.towerIn()} и приносит монеты`}</div></div><button class="btn small" data-hx="postpick">${postPick ? 'Скрыть' : 'Сменить'}</button></div>`;
    if (postPick) {
      const opt = [['c', `🏛 В совет ${TN().twG}`]];
      C.forEach((c, i) => { if (api.isOpen(i)) { const o = byId(H().m[i]); opt.push(['m' + i, `🎓 Наставник: ${esc(c.name)}${o && o !== r ? ` (вместо ${esc(o.name)})` : ''}${matchK(r, i) > 1 ? ' 💛' : ''}`]); } });
      if (sqOpen(0)) opt.push(['s0', `⚔️ Отряд школы (${H().s[0].length}/${B.squadN})`]);
      opt.push(['none', '🛋️ Без поста']);
      x += `<div class="hx-pick">${opt.map(([k, t]) => `<button class="btn wide ghost" data-hx="post:${r.id}:${k}">${t}</button>`).join('')}</div>`;
    }
    if (!r.away && !r.mc) x += `<button class="btn wide ghost" data-hx="fw:${r.id}">👋 Проводить: откроет школу за морем</button><p class="muted">Вещи вернутся в сундук, половина опыта перейдёт новичку у двери (или следующему герою), слава школы +${Math.round(B.fwFame * 100)} %.${tower().wait.some((w) => w.h) ? ` Его место и пост займёт ${esc(tower().wait.find((w) => w.h).name)}.` : ''}</p>`;
    x += `<button class="btn wide ghost" data-hx="back">⬅ К героям</button>`;
    return x;
  }
  // ---- swap card: the newcomer at the door vs the weakest resident (Ruslan «пока не соберёшь супер сильные отряды»)
  function swapHtml(nw) {
    const o = weakest(); if (!nw || !nw.h || !o) return '';
    const pn = power(nw), po = power(o), row = (r, p, t) => `<div class="card up">${api.pic(r)}<div class="grow"><b>${esc(r.name)}</b> ${stars(r.h.r)} <span class="muted">ур. ${r.h.lv}</span><div class="muted">${t} · мощь <b>${p}</b> · ${statLine(stats(r))}</div></div></div>`;
    return `<h3>⚖️ Новичок или ${esc(o.name)}?</h3>${row(nw, pn, 'у двери')}${row(o, po, `слабейший ${api.towerIn()} · ${postTxt(o)}`)}`
      + `<p class="muted">${pn > po ? '💪 Новичок сильнее.' : pn < po ? 'Новичок слабее.' : 'Они равны.'} Проводы: ${esc(o.name)} откроет школу за морем (слава +${Math.round(B.fwFame * 100)} %), его вещи вернутся в сундук, ${esc(nw.name)} займёт его место и пост и получит половину его опыта.</p>`
      + `<button class="btn wide" data-hx="swap:${o.id}:${nw.id}">👋 Проводить ${esc(o.name)} и принять ${esc(nw.name)}</button><button class="btn wide ghost" data-close>Пусть подождёт</button>`;
  }
  let swapId = 0;
  function swapPanel() { const nw = tower().wait.find((x) => x.id === swapId); const hd = `<div class="sh-head"><span class="remoji big">⚖️</span><div><h2>Место ${TN().twG}</h2><div class="muted">${tower().res.length} из ${api.towerCap()} мест занято</div></div><button class="x" data-close>✕</button></div>`;
    return hd + (swapHtml(nw) || '<p class="muted">Сравнивать не с кем.</p>'); }
  const reveals = {};
  function revealFn(id) { return (reveals[id] ||= () => reveal(id)); }
  function reveal(id) {
    const r = byId(id) || tower().wait.find((x) => x.id === id);
    if (!r || !r.h) return `<div class="sh-head"><h2>Герой</h2><button class="x" data-close>✕</button></div><p class="muted">Этот герой уже ушёл.</p>`;
    const h = r.h, odds = h.gift ? B.oddsGift : B.odds, it = itemById(h.brought);
    let x = `<div class="sh-head"><span class="remoji big">🦸</span><div><h2>Новый герой ${TN().twG}!</h2><div class="muted">${esc(r.name)} · ${esc(api.resTitle(r))}${h.gift ? ' · ✨ одарённый' : ''}</div></div><button class="x" data-close>✕</button></div>`;
    if (!flipped.has(id)) {
      x += `<div class="hx-reveal"><div class="hx-card hx-back" data-hx="flip:${id}"><em>✨</em><b>?</b><span>Нажми, чтобы открыть</span></div></div>`;
      x += `<p class="muted" style="text-align:center">Шансы: ${oddsTxt(odds)}${h.gift ? ' (одарённый)' : ''}</p>`;
      return x;
    }
    x += `<div class="hx-reveal"><div class="hx-card hx-flip hx-i${h.r}">${api.pic(r)}<b>${RAR[h.r].s}</b><span>${RAR[h.r].n}</span></div></div>`;
    x += `<p style="text-align:center">${statLine(stats(r))}</p>`;
    const tr = TRAIT[r.sp]; if (tr) x += `<p class="muted" style="text-align:center">Черта вида: ${esc(tr[1])} (${ST[tr[0]].e} +${Math.round(B.trait * 100)} %) · до ур. ${maxLv(h)}</p>`;
    if (it) x += `<p style="text-align:center">Принёс с собой: ${itemLine(it)}</p>`;
    x += `<p class="muted" style="text-align:center">Шансы были: ${oddsTxt(odds)}</p>`;
    if (byId(id)) x += `<button class="btn wide" data-hx="card:${id}">Открыть карточку героя</button>`; else x += `<p class="muted" style="text-align:center">Ждёт места у двери.</p>` + swapHtml(r);
    return x;
  }
  let sumIds = [], sumOld = 0;
  function summaryFn() {   // the list is taken once (the panel re-renders while open)
    const h = H();
    if (h.quiet && h.quiet.length) { sumIds = h.quiet; sumOld = h.oldN || 0; h.quiet = []; h.oldN = 0; api.glog('imp', `🦸 Новые герои ${TN().twG}: ${sumIds.length}`); if (api.tkNote) api.tkNote('🦸', `Пока тебя не было, в башне появились новые герои: ${sumIds.length}. Всех записал.`); }   // tikhon_chronicler, PLACEHOLDER
    const L = sumIds.map((id) => byId(id) || tower().wait.find((x) => x.id === id)).filter((r) => r && r.h), old = sumOld;
    let x = `<div class="sh-head"><span class="remoji big">🦸</span><div><h2>${old ? `Жильцы ${TN().twG} стали героями` : `Новые герои ${TN().twG}`}</h2><div class="muted">${old ? 'Теперь здесь живут герои: у каждого своя редкость и характеристики' : 'Пока тебя не было'}</div></div><button class="x" data-close>✕</button></div>`;
    x += L.map((r) => `<div class="card up">${api.pic(r)}<div class="grow"><b>${esc(r.name)}</b> ${stars(r.h.r)}<div class="muted">${statLine(stats(r))}</div></div></div>`).join('');
    x += `<p class="muted">Шансы: ${oddsTxt(B.odds)}. Каждый принёс одну вещь — она уже на нём. Доход не изменился: он растёт с уровнем героев.</p><button class="btn wide" data-hx="tabopen:heroes">🦸 К героям</button>`;
    return x;
  }
  function classCard(i) {   // class panel: the mentor line
    if (!api.towerOpen()) return '';
    const r = byId(H().m[i]);
    if (!r) return heroes().length ? `<div class="card up"><span class="remoji">🎓</span><div class="grow"><b>Наставника нет</b><div class="muted">Героя можно поставить наставником этого класса: он поднимет шанс экзамена.</div></div><button class="btn small ghost" data-hx="tabopen:heroes">Герои</button></div>` : '';
    return `<div class="card up"><span class="remoji">🎓</span><div class="grow"><b>Наставник: ${esc(r.name)}</b> ${stars(r.h.r)} <span class="muted">ур. ${r.h.lv}</span><div class="muted">экзамен +${pc(examB(i))}${rankB(i) ? `, звание +${pc(rankB(i))}` : ''}${eff().mood[i] ? `, настроение +${Math.round(eff().mood[i])}` : ''}${lessonK(i) < 1 ? `, урок −${pc(1 - lessonK(i))}` : ''}</div></div><button class="btn small ghost" data-hx="card:${r.id}">Карточка</button></div>`;
  }
  function openCard(id) { sel = id; gearSlot = -1; postPick = false; api.openPanel(cardPanel); }
  function openTab(t) { tab = t; sqPick = null; api.openTower(); }
  const tabReset = () => { tab = 'tower'; sqPick = null; };   // a tap on the tower on the map opens its first tab
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-hx]'); if (!el) return;
    if (e.target.closest('[data-act]') && !e.target.closest('[data-act]').contains(el)) return;   // the game's own buttons inside a row (Отпустить)
    const [a, p1, p2] = el.dataset.hx.split(':');
    const r = p1 !== undefined ? byId(+p1) : null;
    if (a === 'tab') { tab = p1; sqPick = null; api.refresh(); return; }
    if (a === 'tabopen') { openTab(p1); return; }
    if (a === 'card') { openCard(+p1); return; }
    if (a === 'back') { openTab('heroes'); return; }
    if (a === 'flip') { flipped.add(+p1); api.sfx && api.sfx('fixed'); api.refresh(); return; }
    if (a === 'skill' && r) choose(r, p2);
    else if (a === 'lvup' && r) lvUp(r);
    else if (a === 'gslot') gearSlot = gearSlot === +p1 ? -1 : +p1;
    else if (a === 'equip' && r) { equip(r, +p2); gearSlot = -1; }
    else if (a === 'unequip' && r) { unequip(r, +p2); gearSlot = -1; }
    else if (a === 'postpick') postPick = !postPick;
    else if (a === 'post' && r) { if (setPost(r, p2)) postPick = false; }
    else if (a === 'sqpick') sqPick = sqPick === +p1 ? null : +p1;
    else if (a === 'sqset') { const h2 = byId(+p2); if (h2 && setPost(h2, 's' + p1)) sqPick = null; }
    else if (a === 'ws') { const id = +p1; if (wsSel.has(id)) wsSel.delete(id); else if (wsSel.size < B.ws) wsSel.add(id); }
    else if (a === 'wsgo') { if (wsSel.size === B.ws) { const it = workshop([...wsSel]); wsSel.clear(); if (it) api.toast(`⚒️ Вышло: ${SLOT[it.s].e} ${it.n} ${RAR[it.r].s}`); } else api.toast(`⚒️ Отметь ${B.ws} вещи`); }
    else if (a === 'call') call(+p1);
    else if (a === 'fw' && r) { if (confirm(`Проводить ${r.name}? ${r.name} откроет свою школу за морем. Вещи вернутся в сундук, половина опыта перейдёт новичку, слава школы +${Math.round(B.fwFame * 100)} %.`)) { api.farewell(r, null); api.save(); openTab('heroes'); return; } }
    else if (a === 'swap' && r) { const nw = tower().wait.find((x) => x.id === +p2); if (nw) { api.farewell(r, nw); api.save(); api.closePanel(); return; } }
    else if (a === 'swapcard') { swapId = +p1; api.openPanel(swapPanel); return; }
    api.save(); api.refresh();
  });

  // valley v2 (valley2_client.py): XP of a valley action to every hero of this school's squad; returns how many heroes got it
  function squadXp(n) { const L = ((H().s || [[]])[0] || []).map(byId).filter(Boolean); L.forEach((r) => addXp(r, n, 'valley')); if (L.length) dirty(); return L.length; }
  const HERO = { squadXp, enter, step, retake, xp, leave, farewell, incK, examB, rankB, moodB, lessonK, payK, arrK, inClass, drawMentors, tabHtml, tabBar, tabReset, towerSummary, badge, classCard, drop, openCard, label, gearOn };
  window.__s8b = {   // test hook
    B, H, chest: () => chest(), migrateAll: () => { migDone = false; migrateAll(); }, others: () => otherSquads(), wornElse: (id) => wornElse(id), weakest: () => weakest() && weakest().id, swap: (nw) => { swapId = nw; api.openPanel(swapPanel); }, xpTotal: (id) => xpTotal(byId(id)),
    heroes: () => heroes().map((r) => ({ id: r.id, n: r.name, rk: r.rk, r: r.h.r, lv: r.h.lv, st: stats(r), g: r.h.g, sk: r.h.sk, off: r.h.off, post: postOf(r.id), inc: +incK(r).toFixed(3) })),
    rollStats: (n = 100000, gift = false) => { const c = [0, 0, 0, 0]; for (let k = 0; k < n; k++) c[pick(gift ? B.oddsGift : B.odds)]++; return c.map((x) => +(x / n).toFixed(4)); },
    enter: (r, a, q) => enter(r, a, q), addXp: (id, n) => addXp(byId(id), n), choose: (id, s) => choose(byId(id), s), equip: (id, it) => equip(byId(id), it), unequip: (id, s) => unequip(byId(id), s),
    post: (id, p) => setPost(byId(id), p), call: (n) => call(n), ws: (ids) => workshop(ids), drop: (src, rar, o) => drop(src, rar, o || {}), pools: () => ({ 1: setIdsOf(1), 2: setIdsOf(2) }), itemW: (id) => itemW(itemById(id) || {}), make: (rar, o) => makeItem(rar, o || {}), sets: (id) => setsOf(byId(id)),
    eff: () => { const e = eff(); return JSON.parse(JSON.stringify(e)); }, squad: (k) => squadNums(k), vs: () => H().vs, sync: () => syncValley(), retake: (id, rk) => retake(byId(id), rk),
    open: (id) => openCard(id), tab: (t) => openTab(t), reveal: (id) => api.openPanel(revealFn(id)), flip: (id) => { flipped.add(id); api.refresh(); }, summary: () => api.openPanel(summaryFn), get tabNow() { return tab; },
  };
  // valley v2 hook (design/hero_valley_server_spec.md §8): the server decides a gear reward (special hex: ruins, boss) and hands the
  // client a drop token; the client calls window.heroDrop(src, tok, { min, w, p }) once: guaranteed unless p is given, idempotent by tok
  window.heroDrop = (src, tok, o) => { try { const it = drop(src || 'v2', null, { ...(o || {}), tok }); return it ? { id: it.id, n: it.n, r: it.r, s: it.s, set: it.set, w: itemW(it), label: label(it) } : null; } catch (e) { console.error('heroDrop', e); return null; } };
  return HERO;
}

function injectCss() {
  if (document.getElementById('hx-css')) return;
  const st = document.createElement('style'); st.id = 'hx-css';
  st.textContent = `
.hx-tabs{display:flex;gap:4px;margin:2px 0 8px;flex-wrap:wrap}.hx-tabs .btn{flex:1 1 22%;padding:6px 2px;font-size:13px;white-space:nowrap}
.hx-r{font-size:12px;white-space:nowrap}.hx-st{display:inline-block;margin:0 8px 2px 0;white-space:nowrap}.hx-st i{color:#3a9a4a;font-style:normal;font-size:12px}
.hx-stats{margin:3px 0}.hx-bar{height:7px;border-radius:4px;background:#e6e0f2;margin:4px 0;overflow:hidden}.hx-bar i{display:block;height:100%;background:linear-gradient(90deg,#9b7bf0,#f0c24a)}
.hx-it{font-weight:600}.hx-i0{--hc:#8a8f99}.hx-i1{--hc:#3f8fe0}.hx-i2{--hc:#a052e0}.hx-i3{--hc:#e09a12}.hx-it.hx-i1,.hx-it.hx-i2,.hx-it.hx-i3{color:var(--hc)}
.hx-gear{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:4px 0 6px}.hx-slot{border:2px solid var(--hc,#d8d0ea);border-radius:10px;padding:5px 2px;text-align:center;background:#fbf9ff;cursor:pointer;min-height:66px}
.hx-slot.on{box-shadow:0 0 0 3px #f0c24a}.hx-slot em{display:block;font-style:normal;font-size:22px}.hx-slot span{display:block;font-size:11px;line-height:1.15}.hx-slot i{display:block;font-size:10px;font-style:normal;color:#887}
.hx-pick{border-left:3px solid #c9b8f2;padding-left:6px;margin:4px 0 8px}.hx-row{cursor:pointer}.hx-itrow{cursor:pointer}.hx-sel{outline:3px solid #f0c24a}
.hx-sq{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.hx-other{border-top:1px dashed #c9b8f2;padding-top:6px}.hx-sqc{border:2px solid #d8d0ea;border-radius:10px;text-align:center;padding:4px 2px;font-size:11px;cursor:pointer;background:#fbf9ff}
.hx-sqc .fpic{margin:0 auto}.hx-sqc b,.hx-sqc span{display:block;line-height:1.2}.hx-empty{color:#9a8fc0;font-size:22px;padding-top:14px}.hx-empty span{font-size:11px}
.hx-btns{display:flex;gap:6px}.hx-btns .btn{flex:1}
.hx-reveal{display:flex;justify-content:center;margin:10px 0;perspective:700px}
.hx-card{width:150px;min-height:190px;border-radius:14px;border:3px solid var(--hc,#9b7bf0);background:radial-gradient(circle at 50% 30%,#fff,#efe7ff);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;padding:8px;box-shadow:0 6px 18px rgba(90,60,160,.25)}
.hx-card em{font-style:normal;font-size:44px}.hx-card b{font-size:20px}.hx-card span{font-size:13px;color:#665}
.hx-back{background:linear-gradient(135deg,#5b3fb0,#9b7bf0);color:#fff;cursor:pointer;animation:hxWob 1.6s ease-in-out infinite}.hx-back span{color:#f3eaff}.hx-back b{font-size:40px}
.hx-flip{animation:hxFlip .7s ease-out both}.hx-card.hx-i3{box-shadow:0 0 24px 6px rgba(240,180,40,.7)}.hx-card.hx-i2{box-shadow:0 0 18px 4px rgba(160,82,224,.5)}
.hx-pull{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:6px 0}.hx-pull .hx-card{width:auto;min-height:92px;padding:4px 2px}.hx-pull .hx-card em{font-size:22px}.hx-pull .hx-card b{font-size:10px;line-height:1.1}.hx-pull .hx-card span{font-size:10px}
@keyframes hxFlip{0%{transform:rotateY(90deg) scale(.8);opacity:.2}60%{transform:rotateY(-12deg) scale(1.05);opacity:1}100%{transform:rotateY(0) scale(1)}}
@keyframes hxWob{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg) scale(1.03)}}`;
  document.head.appendChild(st);
}
