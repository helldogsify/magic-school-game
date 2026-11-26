// «Долина» v2 — the rules engine of the valley as an asynchronous board game with hero squads (design/valley_boardgame.md incl.
// its «Updates» lines, registry §5d WORLDS = SQUADS, rows G6). Client Ruslan, session #00165a3f, 2026-11-26.
// ONE FILE, TWO HOMES: this exact file is game/js/valley2_engine.js (the browser's mock server and the board helpers) and
// N:\Services\LazyGirl\src\web\valley2Engine.js (the referee on the server). Keep both copies identical: the Lazy test
// scripts/test-valley2.ts compares them byte for byte. Pure: no I/O, no clock, no Math.random (now and rnd are passed in).
// Texts in Russian are game texts for players (placeholders for Maria).

export const V2 = {
  ver: 1,
  ap: { base: 10, mine: 3, mineCap: 4, today: 3, attack: 2, reinforce: 1, boss: 2 },   // ⚡ per Moscow day; costs (agreed «да»)
  move: { plain: 1, forest: 2, hills: 2, mine: 1, ruins: 1, tower: 1, shrine: 1, castle: 1, lair: 1 },   // Civ VI style: woods/hills cost 2
  exp: 3,                                   // battle = weighted coin P = A^3 / (A^3 + D^3) (agreed «монетка», shown in %)
  fort: { plain: 8, forest: 10, hills: 10, mine: 20, ruins: 18, tower: 18, shrine: 40, lair: 60, castle: 0 },   // neutral defenders
  tdef: { plain: 1, forest: 1.25, hills: 1.5, mine: 1, ruins: 1, tower: 1.5, shrine: 1.25, lair: 1.5, castle: 2 },   // terrain defence
  towerNb: 1.15,                            // an own watchtower next door: ×1.15 to the hex defence
  militia: 0.6,                             // [dev] an alliance's land defends itself: + 0.6 × its squads' average 🛡️ (enemy land = hard)
  fortCap: 3, reinforceK: 0.3, takenFort: 0.5, loseChip: 0.2, loseFloor: 0.3,
  garrison: 3,                              // up to 3 squads on a hex (castle: no limit)
  fortified: { ms: 6 * 3600000, k: 1.15 },  // a squad that has not moved for 6 h defends ×1.15 (Civ: defender that did not move)
  surrounded: 0.5,                          // «в окружении»: −50 % strength (agreed)
  perPlayer: 15, minR: 4, maxR: 9, castles: 6, fillK: 1.3, expDefault: 8,   // ~15 hexes per active player (agreed «да»)
  boss: { hpPer: 400, minPlayers: 4, weakK: 0.25, weakCap: 1.0, blow: 40, rage: 0.5 },   // strike back (Ruslan «Лучше чтобы бил»): blow 40 × (1 + 0.5 × share of HP lost)
  xp: { win: 12, lose: 5, reinforce: 1, move: 0, bossPer: 10, bossCap: 30 },   // hero XP of the acting squad per action (Ruslan «а было бы хорошо, чтобы качались»)
  glory: { claim: 1, take: 2, brave: 1, held: 1, ring: 1, bossKill: 10, bossPer: 100, quest: 5 },
  hold: { plain: 1, forest: 1, hills: 1, mine: 2, ruins: 2, tower: 2, shrine: 3, lair: 10, castle: 0 },
  prize: { stones: [15, 10, 5], gear: [2, 1, 1], partActs: 5 },
  hero: { stat: [[8, 16], [14, 24], [22, 34], [32, 46]], maxLv: [20, 30, 40, 50], trait: 0.2, master: 0.25, lvStat: 0.04, w2: 0.10, gear: 96, head: 1.15, n: 5, skCap: 0.9, elem: 0.10, elemCap: 0.30 },
  sqEvery: 60000, evMax: 120,
};
export const TYPES = ['plain', 'forest', 'hills', 'lake', 'peak', 'chasm', 'mine', 'ruins', 'tower', 'shrine', 'castle', 'boss', 'lair'];
export const IMPASS = new Set(['lake', 'peak', 'chasm']);
export const BOSSES = [
  { id: 'giant', n: 'Каменный великан', e: '🗿', weak: 1 },   // weak to water
  { id: 'dragon', n: 'Ледяной дракон', e: '🐉', weak: 0 },    // weak to fire
  { id: 'hydra', n: 'Болотная гидра', e: '🐍', weak: 3 },     // weak to air
  { id: 'serpent', n: 'Грозовой змей', e: '🌩️', weak: 2 },    // weak to earth
];
export const ELEM = ['🔥', '💧', '🌱', '🌪️'];
export const QUESTS = {
  forest: { n: 'Хозяева лесов', d: 'К воскресенью держать больше всех лесов (не меньше 3)' },
  hills: { n: 'Короли холмов', d: 'К воскресенью держать больше всех холмов (не меньше 3)' },
  towers: { n: 'Дозор', d: 'К воскресенью держать 2 сторожевые башни' },
  mines: { n: 'Рудокопы', d: 'К воскресенью держать 2 шахты' },
  boss: { n: 'Охотники на чудище', d: 'Нанести боссу больше всех урона' },
  raid: { n: 'Набег', d: 'Отбить у соперников 4 клетки за неделю' },
  ring: { n: 'Точки', d: 'Окружить и забрать 3 клетки за неделю' },
  shrine: { n: 'Хранители святилищ', d: 'К воскресенью держать святилище' },
};
export const COLORS = ['#e2574c', '#3b82d6', '#3fae5a', '#e0a020', '#9b59d0', '#e46fae', '#20a8a8', '#8a6d3b'];

// ---------------------------------------------------------------- time (same keys as the game and the old valley)
export const weekKey = (t) => Math.floor((t / 86400000 + 3) / 7);           // week starts Monday 00:00 UTC (= MG.weekKey)
export const weekEnd = (wk) => ((wk + 1) * 7 - 3) * 86400000;
export const mskDay = (t) => new Date(t + 3 * 3600000).toISOString().slice(0, 10);
export const mskDow = (t) => new Date(t + 3 * 3600000).getUTCDay();          // 0 = Sunday (Moscow)

// ---------------------------------------------------------------- hex geometry
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
export const key = (q, r) => q + ',' + r;
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const r2 = (x) => Math.round(x * 100) / 100;

function idx(V) { if (!V._i) { V._i = new Map(); V.cells.forEach((c, k) => V._i.set(key(c.q, c.r), k)); } return V._i; }
export const cellAt = (V, q, r) => { const k = idx(V).get(key(q, r)); return k == null ? null : V.cells[k]; };
export const nbs = (V, c) => DIRS.map(([a, b]) => cellAt(V, c.q + a, c.r + b)).filter(Boolean);
export const passable = (c) => !!c && !IMPASS.has(c.t) && c.t !== 'boss';
export const radiusFor = (exp) => { let R = V2.minR; while (R < V2.maxR && 1 + 3 * R * (R + 1) < V2.perPlayer * exp + 1) R++; return R; };

// ---------------------------------------------------------------- map generator (terrain incl. impassable lakes/peaks/chasms)
export function makeMap(seed, exp, nCastles = V2.castles) {
  const rnd = rng(seed), R = radiusFor(exp), cells = [];
  for (let q = -R; q <= R; q++) for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) cells.push({ q, r, t: 'plain', o: '', f: 0, tk: 0 });
  const V = { cells, R }, O = { q: 0, r: 0 };
  cellAt(V, 0, 0).t = 'boss';
  const rim = cells.filter((c) => dist(c, O) === R).sort((a, b) => Math.atan2(a.r + a.q / 2, a.q) - Math.atan2(b.r + b.q / 2, b.q));
  const off = Math.floor(rnd() * rim.length), castles = [];
  for (let k = 0; k < nCastles; k++) { const c = rim[(off + Math.round(k * rim.length / nCastles)) % rim.length]; c.t = 'castle'; c.slot = k; castles.push(c); }
  const keep = new Set(); for (const c of castles) for (const n of [c, ...nbs(V, c)]) keep.add(key(n.q, n.r));
  for (const n of nbs(V, cellAt(V, 0, 0))) keep.add(key(n.q, n.r));   // the ring around the boss stays open: squads must reach it
  const free = () => cells.filter((c) => c.t === 'plain' && !keep.has(key(c.q, c.r)));
  const connected = () => {   // every passable cell reachable from a castle
    const pass = cells.filter((c) => c.t !== 'boss' && !IMPASS.has(c.t)), seen = new Set([key(castles[0].q, castles[0].r)]), st = [castles[0]];
    while (st.length) { const c = st.pop(); for (const n of nbs(V, c)) { const k = key(n.q, n.r); if (!seen.has(k) && n.t !== 'boss' && !IMPASS.has(n.t)) { seen.add(k); st.push(n); } } }
    return pass.every((c) => seen.has(key(c.q, c.r)));
  };
  // impassable features ~12 % of the map: lakes (blobs), peaks (short chains), chasms (straight cracks)
  const want = Math.round(cells.length * 0.12); let placed = 0, tries = 0;
  while (placed < want && tries++ < 400) {
    const f = free(); if (!f.length) break;
    const kind = ['lake', 'peak', 'chasm'][Math.floor(rnd() * 3)], start = f[Math.floor(rnd() * f.length)], shape = [start];
    const len = kind === 'lake' ? 2 + Math.floor(rnd() * 3) : kind === 'peak' ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 2), dir = DIRS[Math.floor(rnd() * 6)];
    for (let k = 1; k < len; k++) {
      const last = shape[shape.length - 1];
      const nx = kind === 'chasm' ? cellAt(V, last.q + dir[0], last.r + dir[1]) : (() => { const o = nbs(V, shape[Math.floor(rnd() * shape.length)]).filter((n) => n.t === 'plain' && !keep.has(key(n.q, n.r)) && !shape.includes(n)); return o.length ? o[Math.floor(rnd() * o.length)] : null; })();
      if (!nx || nx.t !== 'plain' || keep.has(key(nx.q, nx.r)) || shape.includes(nx)) break; shape.push(nx);
    }
    for (const c of shape) c.t = kind;
    if (!connected()) { for (const c of shape) c.t = 'plain'; continue; }   // never cut the map: a feature that splits it is undone
    placed += shape.length;
  }
  const place = (t, n, ok = () => true) => { for (let k = 0; k < n; k++) { const f = free().filter(ok); if (!f.length) return; f[Math.floor(rnd() * f.length)].t = t; } };
  const per = Math.max(3, Math.round(cells.length / 22));
  place('shrine', 3, (c) => dist(c, O) >= 2 && dist(c, O) <= R - 2 && castles.every((k) => dist(k, c) >= 3));   // rare special hexes: gear
  place('mine', per, (c) => dist(c, O) <= R - 1); place('ruins', per); place('tower', per);
  place('hills', Math.round(cells.length * 0.13)); place('forest', Math.round(cells.length * 0.18));
  for (const c of cells) { c.f = V2.fort[c.t] || 0; c.tk = passable(c) && c.t !== 'castle' ? 1 : 0; }
  return { R, cells: cells.map((c) => ({ q: c.q, r: c.r, t: c.t, o: '', f: c.f, tk: c.tk, ...(c.slot != null ? { slot: c.slot } : {}) })) };
}

// ---------------------------------------------------------------- valley + hub (one hub = all valleys of a week)
export function newValley(id, week, exp, seed) {
  const m = makeMap(seed, exp), boss = BOSSES[((week % BOSSES.length) + BOSSES.length) % BOSSES.length];
  const hp = V2.boss.hpPer * Math.max(V2.boss.minPlayers, exp);
  return { id, week, seed, exp, R: m.R, cells: m.cells, slots: {}, als: {}, acc: {}, sq: {}, ev: [], boss: { id: boss.id, hp, max: hp, dmgA: {}, dmgU: {}, dead: 0 }, n: 0 };
}
export function newHub(week) { return { v: V2.ver, cur: { week, valleys: [], alv: {} }, last: null, prizes: {}, prevActive: 0 }; }
const activeOf = (V) => Object.values(V.acc).filter((a) => a.acts > 0).length;
const accCap = (V) => Math.ceil(V.exp * V2.fillK);

/** Rolls the hub to the week of `now`: finishes every valley of the old week (table, quests, prizes kept until claimed). */
export function hubTick(H, now) {
  const wk = weekKey(now); if (H.cur.week === wk) return null;
  const res = { week: H.cur.week, valleys: [] };
  let act = 0;
  for (const V of H.cur.valleys) { const f = finish(V); res.valleys.push({ id: V.id, table: f.table, quests: f.quests, acc: Object.fromEntries(Object.entries(V.acc).map(([u, a]) => [u, a.al])) }); act += activeOf(V); for (const p of f.prizes) addPrize(H, p.uid, p); }
  H.prevActive = H.cur.valleys.length ? Math.max(V2.boss.minPlayers, Math.round(act / H.cur.valleys.length)) : H.prevActive;
  H.last = res; H.cur = { week: wk, valleys: [], alv: {} };
  return res;
}
export function addPrize(H, uid, p) { const L = (H.prizes[uid] ||= []); L.push({ id: p.id, k: p.k, n: p.n || 0, rar: p.rar ?? null, why: p.why || '', wk: p.wk ?? H.cur.week }); if (L.length > 60) L.splice(0, L.length - 60); }

/** The valley of this account this week: the alliance's valley, else a valley with a free castle, else a new one. */
export function valleyFor(H, me, now) {
  hubTick(H, now);
  for (const V of H.cur.valleys) if (V.acc[me.uid]) return V;   // the account plays for the side it joined with this week
  let vi = H.cur.alv[me.al];
  if (vi == null) {
    vi = H.cur.valleys.findIndex((V) => Object.keys(V.slots).length < V2.castles && Object.keys(V.acc).length < accCap(V));
    if (vi < 0) { const wk = H.cur.week, n = H.cur.valleys.length; H.cur.valleys.push(newValley(`${wk}-${n + 1}`, wk, H.prevActive || V2.expDefault, (wk * 7919 + (n + 1) * 104729) >>> 0)); vi = n; }
    H.cur.alv[me.al] = vi;
  }
  const V = H.cur.valleys[vi];
  for (const [id, x] of Object.entries(H.snaps || {})) if (x.uid === me.uid && !V.sq[id]) register(V, me, x.w, x.snap, now, x.face);   // last week's squads come along
  return V;
}
export function join(V, me, now) {
  let a = V.acc[me.uid];
  if (!a) a = V.acc[me.uid] = { al: me.al, name: String(me.name || 'Школа').slice(0, 24), day: '', used: 0, td: '', bonus: 0, acts: 0, glory: 0, battles: 0 };
  else if (me.name) a.name = String(me.name).slice(0, 24);
  if (V.slots[a.al] == null) {
    const taken = new Set(Object.values(V.slots)), free = V.cells.filter((c) => c.t === 'castle' && !taken.has(c.slot));
    if (!free.length) return { err: 'В долине нет свободных замков' };
    const own = V.cells.filter((c) => c.t === 'castle' && taken.has(c.slot));
    free.sort((x, y) => Math.min(99, ...own.map((o) => dist(o, y))) - Math.min(99, ...own.map((o) => dist(o, x))) || x.slot - y.slot);
    const c = free[0]; V.slots[a.al] = c.slot; c.o = a.al;
    const qs = Object.keys(QUESTS), r = rng((V.seed ^ (c.slot + 1) * 2654435761) >>> 0), pick = [];
    while (pick.length < 2) { const q = qs[Math.floor(r() * qs.length)]; if (!pick.includes(q)) pick.push(q); }
    V.als[a.al] = { glory: 0, color: COLORS[c.slot % COLORS.length], quests: pick, raid: 0, ring: 0 };
  }
  return { a };
}
export const castleOf = (V, al) => (V.slots[al] == null ? null : V.cells.find((c) => c.t === 'castle' && c.slot === V.slots[al]));

// ---------------------------------------------------------------- squads (account + world) and anti-cheat caps
/** Server-side strength from submitted hero data. Every stat is clamped to what a hero of that rarity/level/rank could have. */
export function squadSnap(heroes, w, sk) {
  const H = V2.hero, clampd = [], L = (Array.isArray(heroes) ? heroes : []).slice(0, H.n).map((h, k) => {
    const r = clamp(Math.floor(num(h && h.r)), 0, 3), lv = clamp(Math.floor(num(h && h.lv, 1)), 1, H.maxLv[r]), rk = num(h && h.rk) >= 5 ? 5 : clamp(Math.floor(num(h && h.rk)), 0, 4);
    const cap = Math.round((H.stat[r][1] * (1 + H.trait) * (rk === 5 ? 1 + H.master : 1) * (1 + H.lvStat * (lv - 1)) * (w === 2 ? 1 + H.w2 : 1) + H.gear) * H.head);
    const st = [0, 1, 2, 3].map((q) => { const v = Math.max(0, Math.round(num(h && h.st && h.st[q]))); if (v > cap) clampd.push(`h${k}.s${q}:${v}>${cap}`); return Math.min(v, cap); });
    return { r, lv, rk, el: clamp(Math.floor(num(h && h.el)), 0, 3), st, nm: String((h && h.nm) || '').slice(0, 16), e: String((h && h.e) || '').slice(0, 8), id: Math.floor(num(h && h.id)) };
  });
  const sum = [0, 1, 2, 3].map((q) => L.reduce((a, h) => a + h.st[q], 0));
  const skv = (k) => { const v = clamp(num(sk && sk[k]), 0, H.skCap); if (sk && num(sk[k]) > H.skCap) clampd.push(`sk.${k}`); return v; };
  const ms = (e) => L.filter((h) => h.rk === 5 && h.el === e).length, eb = (e) => Math.min(H.elemCap, ms(e) * H.elem);
  return {
    snap: { n: L.length, sum, power: sum.reduce((a, b) => a + b, 0), atk: r2((sum[0] + 0.25 * (sum[1] + sum[2] + sum[3])) / 4 * (1 + skv('banner'))),
      def: r2((sum[1] + 0.25 * (sum[0] + sum[2] + sum[3])) / 4 * (1 + skv('guard'))), siege: r2(skv('siege')),
      el: { forest: eb(0), lake: eb(1), hills: eb(2), plain: eb(3) }, ms: [0, 1, 2, 3].map(ms), h: L.map((h) => ({ r: h.r, lv: h.lv, el: h.el, rk: h.rk, nm: h.nm, e: h.e, id: h.id })) },
    clamped: clampd,
  };
}
export function register(V, me, w, snap, now, face, H) {
  const j = join(V, me, now); if (j.err) return { ok: false, err: j.err };
  if (!snap || !snap.n) return { ok: false, err: 'Собери отряд героев в башне' };
  const id = `${me.uid}_w${w === 2 ? 2 : 1}`, home = castleOf(V, j.a.al);
  const s = V.sq[id] ||= { id, uid: me.uid, w: w === 2 ? 2 : 1, al: j.a.al, pos: [home.q, home.r], mv: now, surr: 0 };
  s.snap = snap; s.at = now; s.name = j.a.name; s.face = String(face || '').slice(0, 8);
  if (H) (H.snaps ||= {})[id] = { uid: me.uid, w: s.w, snap, face: s.face, at: now };   // kept across weeks
  return { ok: true, sq: s };
}
const squadsOn = (V, c) => Object.values(V.sq).filter((s) => s.pos[0] === c.q && s.pos[1] === c.r);
const terrB = (V, snap, c) => { const e = snap.el || {}; let b = c.t === 'forest' ? e.forest : c.t === 'hills' ? e.hills : c.t === 'plain' ? e.plain : 0; if (nbs(V, c).some((n) => n.t === 'lake')) b = Math.max(b || 0, e.lake || 0); return b || 0; };

// ---------------------------------------------------------------- strength and chance
export function attackOf(V, s, c) {
  return s.snap.atk * (1 + terrB(V, s.snap, c)) * (s.surr ? V2.surrounded : 1) * (c.t === 'tower' || c.t === 'lair' ? 1 + (s.snap.siege || 0) : 1);
}
export function alDef(V, al) { const L = Object.values(V.sq).filter((s) => s.al === al); return L.length ? L.reduce((a, s) => a + s.snap.def, 0) / L.length : 0; }
export function defenceOf(V, c, now) {
  const tw = c.o && nbs(V, c).some((n) => n.t === 'tower' && n.o === c.o) ? V2.towerNb : 1, td = V2.tdef[c.t] || 1;
  const base = c.f + (c.o ? V2.militia * alDef(V, c.o) : 0);
  let D = base * td * tw; const parts = [{ k: 'hex', v: r2(base * td * tw) }];
  for (const s of squadsOn(V, c)) if (s.al === c.o) { const v = s.snap.def * td * tw * (1 + terrB(V, s.snap, c)) * (now - s.mv >= V2.fortified.ms ? V2.fortified.k : 1) * (s.surr ? V2.surrounded : 1); D += v; parts.push({ k: s.id, v: r2(v) }); }
  return { D, parts };
}
export const chance = (A, D) => (D <= 0 ? 1 : A <= 0 ? 0 : A ** V2.exp / (A ** V2.exp + D ** V2.exp));

// ---------------------------------------------------------------- action points
export const minesOf = (V, al) => V.cells.filter((c) => c.t === 'mine' && c.o === al).length;
export function apOf(V, uid, now) {
  const a = V.acc[uid]; if (!a) return { max: 0, left: 0 };
  const day = mskDay(now); if (a.day !== day) { a.day = day; a.used = 0; a.bonus = 0; }
  const max = V2.ap.base + V2.ap.mine * Math.min(V2.ap.mineCap, minesOf(V, a.al)) + (a.td === day ? V2.ap.today : 0) + (a.bonus || 0);
  return { max, left: Math.max(0, max - a.used), mines: minesOf(V, a.al), today: a.td === day };
}
/** The client says the «☀️ Сегодня» bar was closed yesterday or today (TRUST: the server cannot check it; see valley2_deploy.md). */
export function reportToday(V, uid, now) { const a = V.acc[uid]; if (a) a.td = mskDay(now); }

// ---------------------------------------------------------------- enclosure («Точки») and «в окружении»
function enclosed(V, al) {   // cells NOT reachable from the map edge through cells not owned by `al`
  const seen = new Set(), st = [];
  for (const c of V.cells) if (dist(c, { q: 0, r: 0 }) === V.R && c.o !== al) { seen.add(key(c.q, c.r)); st.push(c); }
  while (st.length) { const c = st.pop(); for (const n of nbs(V, c)) { const k = key(n.q, n.r); if (!seen.has(k) && n.o !== al) { seen.add(k); st.push(n); } } }
  return V.cells.filter((c) => c.o !== al && !seen.has(key(c.q, c.r)));
}
function refreshSurr(V) {
  for (const s of Object.values(V.sq)) s.surr = 0;
  for (const al of Object.keys(V.slots)) { const E = new Set(enclosed(V, al).map((c) => key(c.q, c.r))); if (!E.size) continue; for (const s of Object.values(V.sq)) if (s.al !== al && E.has(key(s.pos[0], s.pos[1]))) s.surr = 1; }
}
function fill(V, al, uid, now, rnd, got) {
  let n = 0;
  for (const c of enclosed(V, al)) {
    if (!passable(c) || c.t === 'castle') continue;
    if (squadsOn(V, c).some((s) => s.al !== al)) continue;   // an enemy squad stands there: not taken, it is surrounded
    c.o = al; c.f = Math.max(Math.round((V2.fort[c.t] || 0) * V2.takenFort), 1); n++;
    if (c.tk) token(V, c, uid, rnd, got, now);
  }
  if (n) { V.als[al].glory += n * V2.glory.ring; V.als[al].ring += n; V.acc[uid].glory += n * V2.glory.ring; }
  return n;
}

// ---------------------------------------------------------------- rewards under hexes (small; gear only on special hexes)
let pid = 0;
const prizeId = (V, uid, now) => `${V.id}.${now.toString(36)}.${(pid++ % 1296).toString(36)}.${uid.slice(0, 4)}`;
const rollRar = (rnd, odds) => { let x = rnd(); for (let k = 0; k < odds.length; k++) { x -= odds[k]; if (x < 0) return k; } return 0; };
function token(V, c, uid, rnd, got, now) {
  c.tk = 0; const a = V.acc[uid], x = rnd();
  let p = null;
  if (c.t === 'shrine') p = { k: 'gear', rar: 1 + rollRar(rnd, [0.65, 0.28, 0.07]), why: 'Святилище' };
  else if (c.t === 'ruins') p = x < 0.3 ? { k: 'gear', rar: rollRar(rnd, [0.7, 0.25, 0.05]), why: 'Руины' } : { k: 'stones', n: 1, why: 'Руины' };
  else if (c.t === 'mine' || c.t === 'tower') { V.als[a.al].glory += 2; a.glory += 2; got.push({ k: 'glory', n: 2, q: c.q, r: c.r }); return; }
  else if (x < 0.35) { V.als[a.al].glory += 1; a.glory += 1; got.push({ k: 'glory', n: 1, q: c.q, r: c.r }); return; }
  else if (x < 0.6) { a.bonus = (a.bonus || 0) + 1; got.push({ k: 'ap', n: 1, q: c.q, r: c.r }); return; }
  else p = { k: 'coins', n: 5, why: 'Клад' };   // n = minutes of the school's income (the client pays)
  p.id = prizeId(V, uid, now); got.push({ ...p, q: c.q, r: c.r, uid });
}

// ---------------------------------------------------------------- retreat: a random own hex closer to the castle, none -> castle
function pushBack(V, s, rnd) {
  const home = castleOf(V, s.al), here = { q: s.pos[0], r: s.pos[1] }, d0 = dist(here, home);
  const ok = V.cells.filter((c) => c.o === s.al && passable(c) && !(c.q === here.q && c.r === here.r) && dist(c, home) < d0 && (c.t === 'castle' || squadsOn(V, c).length < V2.garrison));
  const to = ok.length ? ok[Math.floor(rnd() * ok.length)] : home;
  s.pos = [to.q, to.r]; return to;
}

// ---------------------------------------------------------------- actions (instant; the battle plays at once)
function ev(V, e) { V.ev.push(e); if (V.ev.length > V2.evMax) V.ev.splice(0, V.ev.length - V2.evMax); }
function pathCost(V, s, to, al) {   // cheapest path through own hexes (Dijkstra), cost = entering cost of each hex
  const start = cellAt(V, s.pos[0], s.pos[1]), D = new Map([[key(start.q, start.r), 0]]), Q = [[0, start]];
  while (Q.length) {
    Q.sort((a, b) => a[0] - b[0]); const [d, c] = Q.shift(); if (c === to) return d;
    if (d > (D.get(key(c.q, c.r)) ?? 1e9)) continue;
    for (const n of nbs(V, c)) { if (n.o !== al || !passable(n)) continue; const nd = d + (V2.move[n.t] || 1), k = key(n.q, n.r); if (nd < (D.get(k) ?? 1e9)) { D.set(k, nd); Q.push([nd, n]); } }
  }
  return Infinity;
}
/** One player action. me = { uid, al, name }; b = { op, sq, q, r }; returns { ok, err?, ...result, got: [rewards] }. */
export function act(V, me, b, now, rnd) {
  const j = join(V, me, now); if (j.err) return { ok: false, err: j.err };
  const a = j.a, al = a.al, op = b.op, got = [];
  const s = V.sq[b.sq]; if (!s || s.uid !== me.uid) return { ok: false, err: 'Это не твой отряд' };
  const ap = apOf(V, me.uid, now), here = cellAt(V, s.pos[0], s.pos[1]);
  const pay = (n) => { if (ap.left < n) return false; a.used += n; a.acts++; return true; };
  const evb = { t: now, who: a.name, al, sq: s.id, w: s.w };
  if (op === 'reinforce') {
    if (here.o !== al || here.t === 'castle') return { ok: false, err: 'Укреплять можно свою клетку, где стоит отряд (не замок)' };
    const cap = Math.round((V2.fort[here.t] || 8) * V2.fortCap); if (here.f >= cap) return { ok: false, err: 'Клетка уже укреплена до предела' };
    if (!pay(V2.ap.reinforce)) return { ok: false, err: `Не хватает ⚡: нужно ${V2.ap.reinforce}` };
    const add = Math.max(1, Math.round(s.snap.def * V2.reinforceK)); const was = here.f; here.f = Math.min(cap, here.f + add);
    ev(V, { ...evb, k: 'reinforce', q: here.q, r: here.r, ok: true, n: here.f - was });
    return { ok: true, op, cell: here, add: here.f - was, ap: apOf(V, me.uid, now), got, xp: V2.xp.reinforce, sqw: s.w };
  }
  const c = cellAt(V, num(b.q), num(b.r)); if (!c) return { ok: false, err: 'Нет такой клетки' };
  if (op === 'move') {
    if (c.o !== al || !passable(c)) return { ok: false, err: 'Ходить можно только по своим клеткам. Чужую или ничью — захвати' };
    if (c === here) return { ok: false, err: 'Отряд уже здесь' };
    if (c.t !== 'castle' && squadsOn(V, c).length >= V2.garrison) return { ok: false, err: `На клетке уже ${V2.garrison} отряда` };
    const cost = pathCost(V, s, c, al); if (!Number.isFinite(cost)) return { ok: false, err: 'Туда не дойти по своим клеткам' };
    if (!pay(cost)) return { ok: false, err: `Не хватает ⚡: нужно ${cost}` };
    s.pos = [c.q, c.r]; s.mv = now; refreshSurr(V);
    ev(V, { ...evb, k: 'move', q: c.q, r: c.r, ok: true, n: cost });
    return { ok: true, op, cost, ap: apOf(V, me.uid, now), got, xp: V2.xp.move, sqw: s.w };
  }
  if (op === 'boss') {
    const B = V.boss; if (B.dead) return { ok: false, err: 'Босс уже повержен' };
    if (dist(here, { q: 0, r: 0 }) !== 1) return { ok: false, err: 'Подойди к логову босса вплотную' };
    if (!pay(V2.ap.boss)) return { ok: false, err: `Не хватает ⚡: нужно ${V2.ap.boss}` };
    const kind = BOSSES.find((x) => x.id === B.id), wk = 1 + Math.min(V2.boss.weakCap, V2.boss.weakK * ((s.snap.ms || [])[kind.weak] || 0));
    const dmg = Math.max(1, Math.round(s.snap.atk * wk * (s.surr ? V2.surrounded : 1))); B.hp = Math.max(0, B.hp - dmg);
    B.dmgA[al] = (B.dmgA[al] || 0) + dmg; B.dmgU[me.uid] = (B.dmgU[me.uid] || 0) + dmg; a.battles++;
    ev(V, { ...evb, k: 'boss', q: 0, r: 0, ok: true, n: dmg });
    let kill = null, strike = [];
    if (B.hp) strike = bossStrike(V, rnd, now);   // the boss strikes back at every squad around its lair (each rolls), losers are pushed back
    if (!B.hp) {   // the boss falls: the top-damage alliance takes the lair, every participant gets gear by damage share
      B.dead = now; const top = Object.entries(B.dmgA).sort((x, y) => y[1] - x[1])[0][0], lair = cellAt(V, 0, 0);
      lair.t = 'lair'; lair.o = top; lair.f = V2.fort.lair; lair.tk = 0; V.als[top].glory += V2.glory.bossKill;
      const tot = Object.values(B.dmgU).reduce((x, y) => x + y, 0);
      for (const [u, d] of Object.entries(B.dmgU)) { const sh = d / tot; got.push({ k: 'gear', rar: sh >= 0.25 ? 2 : sh >= 0.08 ? 1 : 0, why: 'Босс', uid: u, id: prizeId(V, u, now) }); }
      kill = { top }; ev(V, { ...evb, k: 'bosskill', q: 0, r: 0, ok: true, n: 0, al: top }); fill(V, top, me.uid, now, rnd, got); refreshSurr(V);
    }
    return { ok: true, op, dmg, weak: wk > 1, boss: { hp: B.hp, max: B.max }, kill, strike, ap: apOf(V, me.uid, now), got, xp: Math.min(V2.xp.bossCap, Math.max(1, Math.round(dmg / V2.xp.bossPer))), sqw: s.w };
  }
  if (op !== 'attack') return { ok: false, err: 'Неизвестное действие' };
  if (!passable(c)) return { ok: false, err: c.t === 'boss' ? 'На босса — кнопка «Ударить босса»' : 'Сюда не пройти' };
  if (c.o === al) return { ok: false, err: 'Это ваша клетка' };
  if (c.t === 'castle') return { ok: false, err: 'Замки захватить нельзя' };
  if (dist(c, here) !== 1) return { ok: false, err: 'Нападать можно только на соседнюю клетку' };
  const A = attackOf(V, s, c), { D } = defenceOf(V, c, now), P = chance(A, D);
  if (!pay(V2.ap.attack)) return { ok: false, err: `Не хватает ⚡: нужно ${V2.ap.attack}` };
  const roll = rnd(), won = roll < P, was = c.o; a.battles++;
  const defenders = squadsOn(V, c).filter((x) => x.al === was).map((x) => x.id);
  const res = { ok: true, op, won, p: r2(P), A: r2(A), D: r2(D), roll: r2(roll), was, defenders, got, moved: [] };
  if (won) {
    for (const id of defenders) { const d = V.sq[id], to = pushBack(V, d, rnd); res.moved.push({ id, to: [to.q, to.r] }); }
    c.o = al; c.f = Math.max(1, Math.round((V2.fort[c.t] || 8) * V2.takenFort));
    const day = mskDay(now), gt = (c.gt ||= {}), g = was ? (gt[al] === day ? 0 : V2.glory.take) : V2.glory.claim;   // a hex retaken the same day gives no glory again (no ping-pong farming)
    gt[al] = day; V.als[al].glory += g; a.glory += g; if (was && g) V.als[al].raid++;
    if (c.tk) token(V, c, me.uid, rnd, got, now);
    if (c.t === 'castle' || squadsOn(V, c).length < V2.garrison) { s.pos = [c.q, c.r]; s.mv = now; }   // the winner moves in
    res.ring = fill(V, al, me.uid, now, rnd, got);
  } else {
    const to = pushBack(V, s, rnd); res.back = [to.q, to.r];
    c.f = Math.max(Math.ceil((V2.fort[c.t] || 8) * V2.loseFloor), Math.round(c.f - A * V2.loseChip));
    if (was) { V.als[al].glory += V2.glory.brave; a.glory += V2.glory.brave; V.als[was].glory += V2.glory.held; }
  }
  refreshSurr(V);
  ev(V, { ...evb, k: won ? (was ? 'take' : 'claim') : 'lose', q: c.q, r: c.r, ok: won, n: Math.round(P * 100), al2: was || '' });
  res.ap = apOf(V, me.uid, now); res.cell = c; res.xp = won ? V2.xp.win : V2.xp.lose; res.sqw = s.w;
  return res;
}
/** The boss strikes back after a hit: blow B = blow × (1 + rage × HP lost share) against each squad on the 6 hexes around the lair
 *  (squad defence × its hex terrain); P(pushed) = B³/(B³ + D³); a pushed squad follows the retreat rule. */
export function bossBlow(V) { const B = V.boss; return V2.boss.blow * (1 + V2.boss.rage * (1 - B.hp / B.max)); }
function bossStrike(V, rnd, now) {
  const blow = bossBlow(V), out = [];
  for (const s of Object.values(V.sq)) {
    const c = cellAt(V, s.pos[0], s.pos[1]); if (!c || dist(c, { q: 0, r: 0 }) !== 1) continue;
    const D = s.snap.def * (V2.tdef[c.t] || 1) * (s.surr ? V2.surrounded : 1), p = chance(blow, D), hit = rnd() < p;
    let to = null; if (hit) { const t = pushBack(V, s, rnd); to = [t.q, t.r]; s.mv = now; }
    out.push({ id: s.id, p: r2(p), hit: hit ? 1 : 0, to });
  }
  if (out.some((x) => x.hit)) { refreshSurr(V); ev(V, { t: now, who: '', al: '', k: 'bossstrike', q: 0, r: 0, ok: true, n: out.filter((x) => x.hit).length }); }
  return out;
}
/** Chance preview for the attack button (the same numbers the roll will use). */
export function odds(V, uid, sqId, q, r, now) {
  const s = V.sq[sqId], c = cellAt(V, q, r); if (!s || s.uid !== uid || !c) return { ok: false, err: 'Нет такой клетки' };
  const A = attackOf(V, s, c), d = defenceOf(V, c, now);
  return { ok: true, p: r2(chance(A, d.D)), A: r2(A), D: r2(d.D), parts: d.parts, cost: V2.ap.attack };
}

// ---------------------------------------------------------------- scoring, secret quests, Sunday
function holdOf(V, al) { return V.cells.reduce((a, c) => a + (c.o === al ? V2.hold[c.t] || 0 : 0), 0); }
const countT = (V, al, t) => V.cells.filter((c) => c.o === al && c.t === t).length;
export function questProg(V, al, q) {
  const X = V.als[al] || {}, others = Object.keys(V.slots).filter((x) => x !== al);
  const most = (t) => { const have = countT(V, al, t), need = Math.max(3, ...others.map((o) => countT(V, o, t) + 1)); return { have, need }; };
  const r = q === 'forest' ? most('forest') : q === 'hills' ? most('hills') : q === 'towers' ? { have: countT(V, al, 'tower'), need: 2 } : q === 'mines' ? { have: countT(V, al, 'mine'), need: 2 }
    : q === 'shrine' ? { have: countT(V, al, 'shrine'), need: 1 } : q === 'raid' ? { have: X.raid || 0, need: 4 } : q === 'ring' ? { have: X.ring || 0, need: 3 }
    : (() => { const d = V.boss.dmgA, have = d[al] || 0, best = Math.max(0, ...others.map((o) => d[o] || 0)); return { have, need: Math.max(1, best + 1) }; })();
  return { ...r, done: r.have >= r.need };
}
export function table(V) {
  return Object.keys(V.slots).map((al) => { const X = V.als[al], hold = holdOf(V, al), boss = Math.floor((V.boss.dmgA[al] || 0) / V2.glory.bossPer);
    return { al, glory: X.glory, hold, boss, score: X.glory + hold + boss, cells: V.cells.filter((c) => c.o === al).length }; })
    .sort((a, b) => b.score - a.score || b.cells - a.cells);
}
export function finish(V) {
  const quests = {};
  for (const al of Object.keys(V.slots)) quests[al] = V.als[al].quests.map((q) => ({ q, ...questProg(V, al, q) }));
  const T = table(V).map((x) => { const qd = quests[x.al].filter((q) => q.done).length * V2.glory.quest; return { ...x, quest: qd, score: x.score + qd }; }).sort((a, b) => b.score - a.score || b.cells - a.cells);
  const prizes = [];
  T.forEach((x, k) => {
    for (const [u, a] of Object.entries(V.acc)) {
      if (a.al !== x.al || !a.acts) continue;
      if (k < 3) { prizes.push({ uid: u, id: `${V.id}.p${k}.${u}`, k: 'stones', n: V2.prize.stones[k], why: `${k + 1}-е место в долине`, wk: V.week }); prizes.push({ uid: u, id: `${V.id}.g${k}.${u}`, k: 'gear', rar: V2.prize.gear[k], why: `${k + 1}-е место в долине`, wk: V.week }); }
      else if (a.acts >= V2.prize.partActs) prizes.push({ uid: u, id: `${V.id}.pp.${u}`, k: 'gear', rar: 0, why: 'Участие в неделе долины', wk: V.week });
      for (const q of quests[x.al]) if (q.done) prizes.push({ uid: u, id: `${V.id}.q${q.q}.${u}`, k: 'gear', rar: 1, why: `Тайное задание «${QUESTS[q.q].n}»`, wk: V.week });
    }
  });
  return { table: T, quests, prizes };
}

// ---------------------------------------------------------------- what a player sees
export function view(V, uid, now, names) {
  const a = uid ? V.acc[uid] : null, al = a ? a.al : '', sunday = mskDow(now) === 0, T = table(V);
  const als = {};
  for (const [id, slot] of Object.entries(V.slots)) { const X = V.als[id], h = castleOf(V, id), nm = (names && names[id]) || {};
    als[id] = { name: nm.name || 'Альянс', emo: nm.emo || '🤝', color: X.color, castle: [h.q, h.r], glory: X.glory, slot,
      quests: id === al || sunday ? X.quests.map((q) => ({ q, n: QUESTS[q].n, d: QUESTS[q].d, ...questProg(V, id, q) })) : null }; }
  const B = V.boss, kind = BOSSES.find((x) => x.id === B.id), top = Object.entries(B.dmgA).sort((x, y) => y[1] - x[1]);
  return {
    ok: true, v: V2.ver, id: V.id, week: V.week, ends: weekEnd(V.week), R: V.R, sunday,
    cells: V.cells.map((c) => [c.q, c.r, TYPES.indexOf(c.t), c.o, Math.round(c.f), c.tk]),
    als, table: T, ev: V.ev.slice(-50),
    sq: Object.values(V.sq).map((s) => ({ id: s.id, al: s.al, w: s.w, name: s.name, face: s.face, pos: s.pos, atk: s.snap.atk, def: s.snap.def, n: s.snap.n, power: s.snap.power, surr: s.surr, fort: now - s.mv >= V2.fortified.ms ? 1 : 0, mine: s.uid === uid ? 1 : 0, h: s.uid === uid ? s.snap.h : s.snap.h.map((h) => ({ r: h.r, el: h.el, rk: h.rk, e: h.e })) })),
    boss: { id: B.id, n: kind.n, e: kind.e, weak: kind.weak, hp: B.hp, max: B.max, dead: B.dead ? 1 : 0, top: top.slice(0, 3).map(([k, d]) => ({ al: k, d })), mine: uid ? B.dmgU[uid] || 0 : 0 },
    me: a ? { al, name: a.name, ap: apOf(V, uid, now), glory: a.glory, acts: a.acts } : null,
    bal: { ap: V2.ap, move: V2.move, garrison: V2.garrison, exp: V2.exp },
  };
}
