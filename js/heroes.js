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
  squadAt: [4, 10, 16],                    // tower places needed for squads 1, 2, 3
  item: [4, 8, 14, 24],                    // main stat of an item per rarity (sub stat = 40 %)
  itemSb: [0.05, 0.10, 0.15, 0.25],        // school items: + this share to the hero's post effects
  setP: 0.35,                              // share of dropped items that belong to a set
  oddsItem: [0.60, 0.28, 0.10, 0.02],      // item rarity: Звёздный зов, daily chest, ruins
  chestP: 0.05, ruinsP: 0.10,              // chance of an item: one daily chest opened, one ruin searched (hooks, not wired yet)
  callCost: 30, call10Cost: 270, pity: 10, // «✨ Звёздный зов»: 🔮 per pull, ×10 for 270; a ⭐⭐⭐+ item at least every 10 pulls
  ws: 3, wsUp: 0.25,                       // workshop: 3 items -> 1; chance the result is one rarity higher than the average
  v: { atkDiv: 400, defDiv: 400, spdDiv: 60, chDiv: 400, elem: 0.10, elemCap: 0.30 },   // valley numbers of a squad (spec file)
};
const B = HERO_BAL;
export const RAR = [{ s: '⭐', n: 'Обычный', c: '#8a8f99' }, { s: '⭐⭐', n: 'Редкий', c: '#3f8fe0' }, { s: '⭐⭐⭐', n: 'Эпический', c: '#a052e0' }, { s: '🌟', n: 'Легендарный', c: '#e09a12' }];
const ST = [{ e: '💪', n: 'Сила' }, { e: '🛡️', n: 'Стойкость' }, { e: '💨', n: 'Скорость' }, { e: '✨', n: 'Чары' }];
// species trait (PLACEHOLDER names: texts by Maria): which stat gets +trait
const TRAIT = { mothfox: [3, 'Чародейская пыльца'], petalear: [1, 'Терпеливые ушки'], fernhorn: [0, 'Крепкие рога'], starwhisker: [2, 'Лёгкие крылья'],
  mossmole: [1, 'Крепкие лапы'], owlbat: [2, 'Бесшумный полёт'], quartzhog: [0, 'Кварцевые иглы'], batbunny: [2, 'Прыгучесть'], geosnail: [1, 'Каменная раковина'], axolotl: [3, 'Подземный свет'] };
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
const SET_IDS = Object.keys(SETS);
function pc(x) { const v = x * 100; return (v < 10 && Math.abs(v - Math.round(v)) > 0.05 ? v.toFixed(1).replace('.', ',') : Math.round(v)) + ' %'; }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const pick = (o) => { let x = Math.random(), k = 0; for (; k < o.length - 1; k++) { x -= o[k]; if (x < 0) break; } return k; };
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

export function initHeroes(api) {
  const S = () => api.S();
  const H = () => { const s = S(); const h = (s.heroes ||= {}); h.items ||= []; h.nid ||= 1; h.m ||= {}; h.c ||= []; h.s ||= [[], [], []]; h.pity ||= 0; h.pulls ||= 0; return h; };
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
    const it = makeItem(Math.max(r.h.r >= 2 ? 1 : 0, pick(B.oddsItem)), {}); it.src = 'tower'; r.h.g[it.s] = it.id;   // he brings it wearing it
    r.h.brought = it.id;
    dirty();
    api.stats('hero', { k: 'roll', r: r.h.r, g: r.h.gift });
    if (quiet || api.ffwd()) { (H().quiet ||= []).push(r.id); return; }   // one summary card later (no journal line per hero)
    api.glog('imp', `🦸 ${r.name} стал героем: ${RAR[r.h.r].s} ${RAR[r.h.r].n}`);
    api.iq('cel', 'hero_' + r.id, revealFn(r.id));
  }
  // ---------------- stats, levels, skills ----------------
  const maxLv = (h) => B.maxLv[h.r];
  function baseStats(r) {
    const h = r.h, tr = TRAIT[r.sp], m = r.rk === 5 ? 1 + B.master : 1, l = 1 + B.lvStat * (h.lv - 1);
    return h.b.map((v, k) => Math.round(v * (tr && tr[0] === k ? 1 + B.trait : 1) * m * l));
  }
  const itemsOf = (r) => r.h.g.map((id) => (id ? itemById(id) : null));
  function stats(r) {
    const s = baseStats(r);
    for (const it of itemsOf(r)) if (it) it.st.forEach((v, k) => { s[k] += v; });
    return s;
  }
  const power = (r) => stats(r).reduce((a, b) => a + b, 0);
  function setsOf(r) {   // { setId: pieces } with >= 3 pieces -> k = 1 (3) or 1.5 (4)
    const n = {}; for (const it of itemsOf(r)) if (it && it.set) n[it.set] = (n[it.set] || 0) + 1;
    const out = {}; for (const [k, c] of Object.entries(n)) if (c >= 3) out[k] = c >= 4 ? 1.5 : 1;
    return out;
  }
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
  function offer(r) {   // 1 of 2: school and valley skills mixed; the hero's stats tilt it, rarity opens the rarer skills
    const h = r.h, st = stats(r), own = new Set(h.sk);
    const ok = SKILLS.filter((s) => !own.has(s.id) && (s.r || 0) <= h.r);
    if (!ok.length) return;
    const school = ok.filter((s) => s.k === 's'), valley = ok.filter((s) => s.k === 'v');
    const tilt = st[3] / Math.max(1, st[0] + st[3]);   // ✨ vs 💪
    let a, b;
    if (school.length && valley.length && Math.random() < 0.7) { a = rnd(school); b = rnd(valley); }   // usually a real trade-off
    else { const side = Math.random() < 0.3 + 0.4 * tilt ? (school.length ? school : valley) : (valley.length ? valley : school); a = rnd(side); b = rnd(ok.filter((s) => s !== a)) || null; }
    h.off = [a.id, b ? b.id : null].filter(Boolean);
  }
  function choose(r, id) { const h = r.h; if (!h.off || !h.off.includes(id)) return; h.sk.push(id); h.off = null; dirty(); api.stats('hero', { k: 'skill' }); api.toast(`${SK[id].e} ${r.name} выучил умение «${SK[id].n}»`); }
  function lvUp(r) {   // 🔮 speeds growth: one level at once
    const h = r.h; if (h.lv >= maxLv(h)) return;
    const c = B.lvStones(h.lv); if (api.stones() < c) { api.toast(`🔮 Нужно ${c} лунных камней`); return; }
    if (!api.stonesAdd(-c, 'hero_lv')) return;
    addXp(r, B.xpNeed(h.lv) - h.xp + 0.001, 'stones');
  }
  // ---------------- gear ----------------
  function itemById(id) { return H().items.find((x) => x.id === id) || null; }
  function makeItem(rar, o) {
    const s = o.s ?? rint(0, 3), set = o.set !== undefined ? o.set : (Math.random() < B.setP ? rnd(SET_IDS) : '');
    const t = set ? SETS[set].t : (o.t || (Math.random() < 0.5 ? 's' : 'b'));
    const main = Math.round(B.item[rar] * (0.85 + 0.3 * Math.random())), sub = Math.max(1, Math.round(main * 0.4));
    const st = [0, 0, 0, 0];
    if (t === 's') { st[3] = main; st[1] = sub; } else { const m = SLOT[s].m; st[m] = main; st[rnd([0, 1, 2].filter((k) => k !== m))] = sub; }
    const n = set ? SETS[set].p[s] : rnd(SLOT[s][t]);
    const it = { id: H().nid++, s, r: rar, t, set, st, n };
    H().items.push(it);
    return it;
  }
  const wornBy = (id) => tower().res.find((r) => r.h && r.h.g.includes(id)) || null;
  function equip(r, id) {
    const it = itemById(id); if (!r || !r.h || !it) return;
    const w = wornBy(id); if (w) w.h.g[w.h.g.indexOf(id)] = 0;   // moved freely: no loss, no fee
    r.h.g[it.s] = id; dirty(); syncValley();
  }
  function unequip(r, s) { if (r && r.h) { r.h.g[s] = 0; dirty(); syncValley(); } }
  // daily chest / valley ruins / weekly alliance prize: HOOKS (not wired in this build; the daily bar and the valley server come later)
  function drop(src, rar) {
    if (!api.towerOpen()) return null;
    const p = src === 'chest' ? B.chestP : src === 'ruins' ? B.ruinsP : 1;
    if (Math.random() >= p) return null;
    const it = makeItem(rar ?? pick(B.oddsItem), {}); it.src = src;
    api.toastBig(`🎒 Находка для героев: ${SLOT[it.s].e} ${it.n} ${RAR[it.r].s}`); api.stats('hero', { k: 'drop', r: it.r });
    return it;
  }
  function call(n) {   // paid «✨ Звёздный зов»: n pulls, odds shown, pity
    const c = n >= 10 ? B.call10Cost : B.callCost * n;
    if (api.stones() < c) { api.toast(`🔮 Нужно ${c} лунных камней`); return null; }
    if (!api.stonesAdd(-c, 'hero_call')) return null;
    const h = H(), out = [];
    for (let k = 0; k < n; k++) {
      h.pulls++; h.pity++;
      let r = pick(B.oddsItem); if (h.pity >= B.pity && r < 2) r = 2;   // pity: a ⭐⭐⭐+ item at least every B.pity pulls
      if (r >= 2) h.pity = 0;
      const it = makeItem(r, {}); it.src = 'call'; out.push(it.id);
    }
    lastPull = out; api.stats('hero', { k: 'call', n, r: Math.max(...out.map((id) => itemById(id).r)) });
    api.glog('imp', `✨ Звёздный зов ×${n}: ${out.map((id) => RAR[itemById(id).r].s).join(' ')}`);
    return out;
  }
  function workshop(ids) {   // 3 unwanted items -> 1 random item
    const L = ids.map(itemById).filter((it) => it && !wornBy(it.id));
    if (L.length !== B.ws) return null;
    const avg = L.reduce((a, it) => a + it.r, 0) / L.length;
    let r = Math.floor(avg); if (Math.random() < B.wsUp + (avg - r)) r++; r = Math.min(3, r);
    const sets = {}; L.forEach((it) => { if (it.set) sets[it.set] = (sets[it.set] || 0) + 1; });
    const ss = Object.entries(sets).find(([, c]) => c >= 2);
    const items = H().items; L.forEach((it) => items.splice(items.indexOf(it), 1));
    const it = makeItem(r, ss && Math.random() < 0.5 ? { set: ss[0] } : {}); it.src = 'ws';
    api.stats('hero', { k: 'ws', r }); lastWs = it.id; return it;
  }
  // ---------------- posts ----------------
  function postOf(id) {
    const h = H();
    for (const [ci, x] of Object.entries(h.m)) if (x === id) return { t: 'm', i: +ci };
    if (h.c.includes(id)) return { t: 'c' };
    for (let k = 0; k < 3; k++) if (h.s[k].includes(id)) return { t: 's', k };
    return null;
  }
  function unpost(id) { const h = H(); for (const k of Object.keys(h.m)) if (h.m[k] === id) delete h.m[k]; h.c = h.c.filter((x) => x !== id); h.s = h.s.map((l) => l.filter((x) => x !== id)); }
  const sqOpen = (k) => api.towerCap() >= B.squadAt[k];
  function setPost(r, p) {   // p: 'none' | 'c' | 'm<ci>' | 's<k>'
    const h = H(), id = r.id;
    if (p === 'none') { unpost(id); dirty(); syncValley(); return true; }
    if (p === 'c' && h.c.length >= 3 && !h.c.includes(id)) { api.toast('🏛 В совете все 3 места заняты'); return false; }
    if (p[0] === 's') { const k = +p.slice(1); if (!sqOpen(k)) return false; if (h.s[k].length >= 4 && !h.s[k].includes(id)) { api.toast(`⚔️ В отряде ${k + 1} уже 4 героя`); return false; } }
    unpost(id);
    if (p === 'c') h.c.push(id);
    else if (p[0] === 'm') { const ci = +p.slice(1); if (!api.isOpen(ci)) return false; h.m[ci] = id; }
    else if (p[0] === 's') h.s[+p.slice(1)].push(id);
    dirty(); syncValley(); api.stats('hero', { k: 'post', p: p[0] });
    return true;
  }
  function leave(r) { if (r && r.id) { unpost(r.id); dirty(); syncValley(); } }   // gear stays in the chest (it is the school's)
  const matchK = (r, ci) => { const C = api.classes()[ci]; if (!C) return 1; const fav = FAV_CLASS[r.sp] === C.id, el = r.rk === 5 && (CLASS_EL[C.id] === undefined ? (C.id === 'elements' || C.final) : CLASS_EL[C.id] === (r.el || 0)); return fav || el ? B.match : 1; };
  // ---------------- effects (cached; recomputed when something changes, else at most once a second) ----------------
  function calc() {
    const C = api.classes(), n = C.length, h = H();
    const e = { ex: Array(n).fill(0), rk: Array(n).fill(0), mood: Array(n).fill(0), lk: Array(n).fill(1), pay: 0, moodAll: 0, arr: 0, inc: {} };
    if (!api.towerOpen()) return e;
    for (const r of heroes()) {
      const lv = r.h.lv, st = setsOf(r);
      e.inc[r.id] = (1 + B.incLv * (lv - 1)) * (1 + skv(r, 'rich')) * (1 + (st.gold ? 0.4 * st.gold : 0));
    }
    for (const [cs, id] of Object.entries(h.m)) {
      const ci = +cs, r = byId(id); if (!r || ci >= n || !api.isOpen(ci)) continue;
      const s = stats(r), b = sb(r), st = setsOf(r);
      e.ex[ci] += s[3] * B.mentEx * matchK(r, ci) * b + skv(r, 'mentor') + (st.owl ? 0.03 * st.owl : 0);
      e.rk[ci] += skv(r, 'exam');
      e.mood[ci] += skv(r, 'insp') + (st.garden ? 3 * st.garden : 0);
      e.lk[ci] *= 1 - skv(r, 'quick');
    }
    for (const id of h.c) {
      const r = byId(id); if (!r) continue;
      const s = stats(r), b = sb(r), st = setsOf(r);
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
    const set = (id) => L.reduce((a, r) => a + (setsOf(r)[id] || 0), 0);
    const el = (q) => Math.min(V.elemCap, L.filter((r) => r.rk === 5 && (r.el || 0) === q).length * V.elem);
    return {
      n: L.length, power: sum.reduce((a, b) => a + b, 0), sum,
      atk: 1 + sum[0] / V.atkDiv + sk('banner'), def: 1 + sum[1] / V.defDiv + sk('guard') + 0.2 * set('deep'),
      troops: Math.floor(sum[2] / V.spdDiv) + Math.round(sk('scout')) + Math.round(2 * set('storm')), ruins: 1 + sum[3] / V.chDiv + sk('treasure'), siege: sk('siege'),
      terr: { forest: el(0) + 0.25 * set('dragon'), lake: el(1), mount: el(2), meadow: el(3) },   // fire: forest, water: by the lakes, earth: mountains, air: meadow
    };
  }
  let syncT = 0;
  function syncValley() {   // STUB: stores the squad numbers; the server call comes with the valley server change (spec file)
    const h = H(); h.vs = { at: Date.now(), sq: [0, 1, 2].map((k) => (sqOpen(k) ? squadNums(k) : null)) };
    // TODO(server, design/hero_valley_server_spec.md): POST {LAZY}/game/valley/squad { uid, world, week, squads: h.vs.sq } — not sent in this build
  }
  // ---------------- step (from stepTower: every frame, also in the offline catch-up) ----------------
  let xpAcc = 0, oneSec = 0;
  function step(dt) {
    if (api.edit() || !api.towerOpen()) return;
    if (!oldDone) {   // old saves: residents (and those at the door) are rolled once, quietly, one summary card
      oldDone = true; const T = tower(); let n = 0;
      for (const r of [...T.res, ...T.wait]) if (!r.h) { enter(r, null, true); n++; }
      if (n) H().oldN = (H().oldN || 0) + n;
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
  const itemLine = (it, extra = '') => `<span class="hx-it hx-i${it.r}">${SLOT[it.s].e} ${esc(it.n)} ${RAR[it.r].s}</span> <span class="muted">${it.st.map((v, k) => (v ? `${ST[k].e}${v}` : '')).filter(Boolean).join(' ')}${it.t === 's' ? ` · школа +${pc(B.itemSb[it.r])}` : ' · бой'}${it.set ? ` · ${SETS[it.set].e} ${esc(SETS[it.set].n)}` : ''}${extra}</span>`;
  const oddsTxt = (o) => o.map((p, k) => `${RAR[k].s} ${Math.round(p * 1000) / 10} %`.replace('.', ',')).join(' · ');
  const postTxt = (r) => { const p = r.id && postOf(r.id); if (!p) return 'без поста'; if (p.t === 'm') return `🎓 наставник: ${esc((api.classes()[p.i] || {}).name || '')}`; if (p.t === 'c') return `🏛 совет ${TN().twG}`; return `⚔️ отряд ${p.k + 1}`; };
  const badge = (r) => (r && r.h ? `${stars(r.h.r)} <span class="muted">ур. ${r.h.lv}${r.h.off ? ' · ❗ умение' : ''}</span>` : '');
  const tabBar = () => `<div class="hx-tabs">${[['tower', `${TN().emo} ${TN().tw}`], ['heroes', '🦸 Герои'], ['squad', '⚔️ Отряды'], ['chest', '🎒 Сундук']].map(([k, t]) => `<button class="btn small${tab === k ? '' : ' ghost'}" data-hx="tab:${k}">${t}${k === 'heroes' && heroes().some((r) => r.h.off) ? ' ❗' : ''}</button>`).join('')}</div>`;
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
    return s;
  }
  function squadTab() {
    const h = H(), free = heroes().filter((r) => !postOf(r.id));
    let s = `<p class="muted">Три отряда по 4 героя пойдут в ${TN().val}: 💪 Сила — атака, 🛡️ Стойкость — укрепление, 💨 Скорость — больше отрядов в день, ✨ Чары — больше с руин и шахт. ${[0, 1, 2, 3].map((e) => (e ? `${api.elemName(e)} — ${TN().tn[e]}` : `${api.masterWord()} ${api.elemName(e)} сильнее ${TN().tn[e]}`)).join(', ')}. В долине это заработает позже.</p>`;
    for (let k = 0; k < 3; k++) {
      if (!sqOpen(k)) { s += `<div class="card up locked"><span class="remoji">🔒</span><div class="grow"><b>Отряд ${k + 1}</b><div class="muted">откроется, когда будет ${B.squadAt[k]} мест</div></div></div>`; continue; }
      const v = squadNums(k), L = h.s[k].map(byId).filter(Boolean);
      s += `<h3>⚔️ Отряд ${k + 1} · мощь ${v.power}</h3>`;
      s += `<div class="hx-sq">${[0, 1, 2, 3].map((q) => { const r = L[q]; return r ? `<div class="hx-sqc" data-hx="card:${r.id}">${api.pic(r)}<b>${esc(r.name)}</b><span>${RAR[r.h.r].s} ур. ${r.h.lv}</span></div>` : `<div class="hx-sqc hx-empty" data-hx="sqpick:${k}">＋<span>место</span></div>`; }).join('')}</div>`;
      if (v.n) s += `<p class="muted">атака ×${v.atk.toFixed(2)} · укрепление ×${v.def.toFixed(2)} · +${v.troops} отр./день · руины ×${v.ruins.toFixed(2)}${v.siege ? ` · штурм +${pc(v.siege)}` : ''}${Object.entries(v.terr).filter(([, x]) => x > 0).map(([t, x]) => ` · ${TN().terr[t]} +${pc(x)}`).join('')}</p>`;
      if (sqPick === k) s += free.length ? `<div class="hx-pick">${free.map((r) => heroRow(r, `sqset:${k}:${r.id}`)).join('')}</div>` : '<p class="muted">Свободных героев нет: сними кого-нибудь с поста.</p>';
    }
    return s;
  }
  function chestTab() {
    const h = H(), items = h.items.slice().sort((a, b) => b.r - a.r || a.s - b.s);
    let s = '';
    s += `<h3>✨ Звёздный зов</h3><p class="muted">Призыв вещи для героев за 🔮 лунные камни. Шансы: ${oddsTxt(B.oddsItem)}. Гарантия: вещь ⭐⭐⭐ или лучше не реже, чем раз в ${B.pity} призывов (осталось ${Math.max(1, B.pity - h.pity)}). У тебя 🔮 ${api.stones()}.</p>
      <div class="hx-btns"><button class="btn" data-hx="call:1">Призвать ×1 <span class="cost">🔮${B.callCost}</span></button><button class="btn" data-hx="call:10">×10 <span class="cost">🔮${B.call10Cost}</span></button></div>`;
    if (lastPull && lastPull.length) s += `<div class="hx-pull">${lastPull.map((id, k) => { const it = itemById(id); return it ? `<div class="hx-card hx-flip hx-i${it.r}" style="animation-delay:${k * 0.12}s"><em>${SLOT[it.s].e}</em><b>${esc(it.n)}</b><span>${RAR[it.r].s}</span></div>` : ''; }).join('')}</div>`;
    s += `<h3>⚒️ Мастерская: 3 → 1</h3><p class="muted">Отметь 3 ненужные вещи (не надетые) — из них выйдет одна новая. Её редкость — около средней, иногда на ступень выше; две вещи одного набора могут дать вещь этого набора.</p>`;
    s += `<button class="btn wide${wsSel.size === B.ws ? '' : ' ghost'}" data-hx="wsgo">⚒️ Переплавить (${wsSel.size}/${B.ws})</button>`;
    if (lastWs && itemById(lastWs)) s += `<p>Вышло: ${itemLine(itemById(lastWs))}</p>`;
    s += `<h3>🎒 Сундук школы (${items.length})</h3><p class="muted">Все вещи общие: любую можно снять с одного героя и надеть на другого, ничего не теряется. 3 вещи одного набора на одном герое дают бонус набора, 4 — в полтора раза больше.</p>`;
    s += items.map((it) => { const w = wornBy(it.id); return `<div class="card up hx-itrow${wsSel.has(it.id) ? ' hx-sel' : ''}" ${w ? '' : `data-hx="ws:${it.id}"`}><span class="remoji">${SLOT[it.s].e}</span><div class="grow">${itemLine(it)}<div class="muted">${w ? `надета: ${esc(w.name)}` : wsSel.has(it.id) ? '✔ в мастерскую' : 'лежит в сундуке'}</div></div></div>`; }).join('') || '<p class="muted">Пусто.</p>';
    s += `<p class="muted">Ещё вещи будут приходить из ежедневных сундучков, руин долины и недельной награды альянса.</p>`;
    s += `<h3>Наборы</h3>` + SET_IDS.map((k) => `<p class="muted">${SETS[k].e} <b>${esc(SETS[k].n)}</b> (${SETS[k].t === 's' ? 'школа' : 'бой'}): ${SETS[k].d(1)}</p>`).join('');
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
    x += h.sk.map((id) => { const k = SK[id]; return `<div class="card up"><span class="remoji">${k.e}</span><div class="grow"><b>${esc(k.n)}</b> <span class="muted">${k.k === 's' ? 'школа' : 'долина'}</span><div class="muted">${k.d(k.v * (1 + 0.25 * h.r))}</div></div></div>`; }).join('') || (h.off ? '' : `<p class="muted">Каждые ${B.skillEvery} уровней герой выбирает одно умение из двух.</p>`);
    // gear
    x += `<h3>Снаряжение</h3><div class="hx-gear">${SLOT.map((sl, k) => { const it = h.g[k] ? itemById(h.g[k]) : null; return `<div class="hx-slot${gearSlot === k ? ' on' : ''}${it ? ' hx-i' + it.r : ''}" data-hx="gslot:${k}"><em>${sl.e}</em><span>${it ? esc(it.n) : sl.n}</span><i>${it ? RAR[it.r].s : 'пусто'}</i></div>`; }).join('')}</div>`;
    if (Object.keys(sets).length) x += Object.entries(sets).map(([k, m]) => `<p class="muted">${SETS[k].e} Набор «${esc(SETS[k].n)}»${m > 1 ? ' (полный)' : ''}: ${SETS[k].d(m)}</p>`).join('');
    if (gearSlot >= 0) {
      const cur = h.g[gearSlot], L = H().items.filter((it) => it.s === gearSlot && it.id !== cur).sort((a, b) => b.r - a.r).slice(0, 10);
      x += `<div class="hx-pick">${cur ? `<button class="btn small ghost" data-hx="unequip:${r.id}:${gearSlot}">Снять в сундук</button>` : ''}${L.map((it) => { const w = wornBy(it.id); return `<div class="card up hx-row" data-hx="equip:${r.id}:${it.id}"><span class="remoji">${SLOT[it.s].e}</span><div class="grow">${itemLine(it)}<div class="muted">${w ? `сейчас у ${esc(w.name)} — перейдёт к ${esc(r.name)}` : 'в сундуке'}</div></div></div>`; }).join('') || '<p class="muted">Других вещей для этого места пока нет.</p>'}</div>`;
    }
    // post
    x += `<h3>Пост</h3><div class="card up"><span class="remoji">${p ? (p.t === 'm' ? '🎓' : p.t === 'c' ? '🏛' : '⚔️') : '🛋️'}</span><div class="grow"><b>${postTxt(r)}</b><div class="muted">${p && p.t === 'm' ? `экзамен в классе +${pc(examB(p.i))}` : p && p.t === 'c' ? 'помогает всей школе' : p && p.t === 's' ? `мощь отряда ${squadNums(p.k).power}` : `просто живёт ${api.towerIn()} и приносит монеты`}</div></div><button class="btn small" data-hx="postpick">${postPick ? 'Скрыть' : 'Сменить'}</button></div>`;
    if (postPick) {
      const opt = [['c', `🏛 В совет ${TN().twG}`]];
      C.forEach((c, i) => { if (api.isOpen(i)) { const o = byId(H().m[i]); opt.push(['m' + i, `🎓 Наставник: ${esc(c.name)}${o && o !== r ? ` (вместо ${esc(o.name)})` : ''}${matchK(r, i) > 1 ? ' 💛' : ''}`]); } });
      for (let k = 0; k < 3; k++) if (sqOpen(k)) opt.push(['s' + k, `⚔️ Отряд ${k + 1} (${H().s[k].length}/4)`]);
      opt.push(['none', '🛋️ Без поста']);
      x += `<div class="hx-pick">${opt.map(([k, t]) => `<button class="btn wide ghost" data-hx="post:${r.id}:${k}">${t}</button>`).join('')}</div>`;
    }
    x += `<button class="btn wide ghost" data-hx="back">⬅ К героям</button>`;
    return x;
  }
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
    if (byId(id)) x += `<button class="btn wide" data-hx="card:${id}">Открыть карточку героя</button>`; else x += `<p class="muted" style="text-align:center">Ждёт места у двери.</p>`;
    return x;
  }
  let sumIds = [], sumOld = 0;
  function summaryFn() {   // the list is taken once (the panel re-renders while open)
    const h = H();
    if (h.quiet && h.quiet.length) { sumIds = h.quiet; sumOld = h.oldN || 0; h.quiet = []; h.oldN = 0; api.glog('imp', `🦸 Новые герои ${TN().twG}: ${sumIds.length}`); }
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
    api.save(); api.refresh();
  });

  const HERO = { enter, step, retake, xp, leave, incK, examB, rankB, moodB, lessonK, payK, arrK, inClass, drawMentors, tabHtml, tabBar, tabReset, towerSummary, badge, classCard, drop, openCard };
  window.__s8b = {   // test hook
    B, H, heroes: () => heroes().map((r) => ({ id: r.id, n: r.name, rk: r.rk, r: r.h.r, lv: r.h.lv, st: stats(r), g: r.h.g, sk: r.h.sk, off: r.h.off, post: postOf(r.id), inc: +incK(r).toFixed(3) })),
    rollStats: (n = 100000, gift = false) => { const c = [0, 0, 0, 0]; for (let k = 0; k < n; k++) c[pick(gift ? B.oddsGift : B.odds)]++; return c.map((x) => +(x / n).toFixed(4)); },
    enter: (r, a, q) => enter(r, a, q), addXp: (id, n) => addXp(byId(id), n), choose: (id, s) => choose(byId(id), s), equip: (id, it) => equip(byId(id), it), unequip: (id, s) => unequip(byId(id), s),
    post: (id, p) => setPost(byId(id), p), call: (n) => call(n), ws: (ids) => workshop(ids), drop: (src, rar) => drop(src, rar), make: (rar, o) => makeItem(rar, o || {}), sets: (id) => setsOf(byId(id)),
    eff: () => { const e = eff(); return JSON.parse(JSON.stringify(e)); }, squad: (k) => squadNums(k), vs: () => H().vs, sync: () => syncValley(), retake: (id, rk) => retake(byId(id), rk),
    open: (id) => openCard(id), tab: (t) => openTab(t), reveal: (id) => api.openPanel(revealFn(id)), flip: (id) => { flipped.add(id); api.refresh(); }, summary: () => api.openPanel(summaryFn), get tabNow() { return tab; },
  };
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
.hx-sq{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.hx-sqc{border:2px solid #d8d0ea;border-radius:10px;text-align:center;padding:4px 2px;font-size:11px;cursor:pointer;background:#fbf9ff}
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
