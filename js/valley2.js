// «🚩 Долина» v2 — the valley as an asynchronous board game with hero squads (client Ruslan 2026-11-26, session #00165a3f;
// rules design/valley_boardgame.md, registry G6). Server: lazy /game/valley2/* (N:\Services\LazyGirl\src\web\gameValley2.ts).
// DEFAULT since the go-live prep (Ruslan «перезапускай долину на новую»): the ✨ «Долина» tile opens this screen; escape hatch
// localStorage magicschool.valley2 = '0' brings the old valley back (js/valley.js stays loaded only to pay its last weekly prize).
// LOCAL MOCK SERVER: localStorage magicschool.valley2Mock = '1' or ?v2mock — the same rules engine (js/valley2_engine.js) runs in
// the browser with two bot alliances; state in localStorage magicschool.v2mock; window.__valley2.mock.advance(hours) moves its clock.
// Art is a placeholder (emoji and code drawing; Maria's art later). Texts are placeholders for Maria.
import * as E from './valley2_engine.js?v=1';

const LS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const QS = new URLSearchParams(location.search);
export const flagOn = () => LS('magicschool.valley2') !== '0' || QS.has('valley2') || QS.has('v2mock');
const mockOn = () => LS('magicschool.valley2Mock') === '1' || QS.has('v2mock');
const URL0 = LS('magicschool.valley2Url') || 'https://lazy.vazuza.love/game/valley2';
const TI1 = {
  plain: ['Луг', '', '#bfe3a0'], forest: ['Лес', '🌲', '#7fbf7a'], hills: ['Холмы', '⛰️', '#cdb98f'], lake: ['Озеро', '', '#8cc7ef'], peak: ['Пик', '🏔️', '#a19db0'],
  chasm: ['Пропасть', '', '#4b4058'], mine: ['Кристальная шахта', '💎', '#c8b6f2'], ruins: ['Руины', '🏚️', '#e3cfa6'], tower: ['Сторожевая башня', '🗼', '#d9d2c3'],
  shrine: ['Святилище', '🏛️', '#f1dcff'], castle: ['Замок', '🏰', '#f1e3c6'], boss: ['Логово босса', '', '#6d4f74'], lair: ['Логово', '👑', '#d9b6dd'],
};
const TI2 = { ...TI1, plain: ['Каменный зал', '', '#8c95a3'], forest: ['Грибная роща', '🍄', '#5fa3a0'], hills: ['Скалы', '⛰️', '#7d8594'], lake: ['Подземное озеро', '', '#2f6b73'],
  mine: ['Рудная жила', '⛏️', '#b59a5a'], ruins: ['Древний чертог', '🏚️', '#9aa0aa'], tower: ['Застава', '🗼', '#a4a9b3'], castle: ['Крепость', '🏰', '#b8bcc6'] };
const TDESC = { plain: 'Ровная земля: шаг ⚡1.', forest: 'Защитникам легче (×1,25), шаг ⚡2.', hills: 'Защитникам легче (×1,5), шаг ⚡2.', lake: 'Сюда не пройти.', peak: 'Сюда не пройти.',
  chasm: 'Сюда не пройти.', mine: 'Каждому в альянсе +3 ⚡ в день.', ruins: 'Под руинами — лунный камень или вещь для героев.', tower: 'Оборона ×1,5 и ×1,15 соседним землям.',
  shrine: 'Редкое место: здесь лежит вещь для героев. Охраняется сильно.', castle: 'Дом альянса: захватить нельзя.', boss: 'Здесь живёт босс недели. Бейте его вместе!', lair: 'Логово поверженного босса: 10 очков в воскресенье.' };
const SKILLS = ['Огненный вал', 'Ледяной щит', 'Порыв ветра', 'Каменная кожа', 'Чары сна', 'Боевой клич', 'Звёздный дождь', 'Корни-ловушки'];
const RAR = ['⭐', '⭐⭐', '⭐⭐⭐', '🌟'];
let A = null, root = null, cv = null, st = null, sel = null, mySq = '', busy = false, msg = '', tab = 'map', odds = null, battle = null, pollT = 0, raf = 0, lastDraw = 0, regAt = 0, seenLast = '';
const view = { x: 0, y: 0, z: 1, fit: false };
const W = () => (A && A.world ? A.world() : 1);
const TI = () => (W() === 2 ? TI2 : TI1);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (p) => `${Math.round(p * 100)} %`;
const em = (h) => (A && A.emojiHtml ? A.emojiHtml(h) : h);

// ============================================================ transport: the server, or the local mock server
const M = { H: null, shift: 0, key: 'magicschool.v2mock' };
const mockNow = () => Date.now() + M.shift;
function mockLoad() {
  if (M.H) return; try { const d = JSON.parse(LS(M.key) || 'null'); if (d) { M.H = d.H || null; M.shift = d.shift || 0; } } catch (e) { /* fresh */ }
  if (!M.H) M.H = E.newHub(E.weekKey(mockNow()));
}
function mockSave() { try { localStorage.setItem(M.key, JSON.stringify({ H: M.H, shift: M.shift }, (k, v) => (k === '_i' ? undefined : v))); } catch (e) { /* full */ } }
const BOTS = [['bf1', 'BF', 'Лисья школа'], ['bf2', 'BF', 'Школа «Рыжий хвост»'], ['bf3', 'BF', 'Норка'], ['bo1', 'BO', 'Совиная башня'], ['bo2', 'BO', 'Школа Полуночи'], ['bo3', 'BO', 'Перо и свиток']];
const MOCK_NAMES = { ME: { name: 'Твой альянс', emo: '⭐' }, BF: { name: 'Лисья стая', emo: '🦊' }, BO: { name: 'Совиный круг', emo: '🦉' } };
const mockMe = () => (LS('magicschool.v2mockNoAlly') === '1' ? null : { uid: 'me', al: 'ME', name: (A.schoolName && A.schoolName()) || 'Моя школа' });
let mrnd = E.rng(Date.now() & 0xffff);
function botHeroes(k) { const b = 16 + k * 3; return Array.from({ length: 5 }, (_, j) => ({ r: j === 0 ? 2 : 1, lv: 6 + j, rk: j < 2 ? 5 : 3, el: (j + k) % 4, st: [b + j, b, b - 1, b + 2], nm: ['Рыжик', 'Уголёк', 'Сова', 'Перо', 'Тень', 'Искра'][(j + k) % 6], e: k < 3 ? '🦊' : '🦉' })); }
function mockBots(now) {   // the bot alliances play every 3 hours of the mock clock (only to test the board; never on the server)
  const V0 = M.H.cur.valleys[0]; if (!V0) return;
  BOTS.forEach(([uid, al, name], k) => {
    const me = { uid, al, name }, V = E.valleyFor(M.H, me, now);
    if (!V.sq[uid + '_w1']) E.register(V, me, 1, E.squadSnap(botHeroes(k), 1).snap, now, k < 3 ? '🦊' : '🦉');
    const a = V.acc[uid]; if (a.botAt && now - a.botAt < 3 * 3600000) return; a.botAt = now;
    for (let g = 0; g < 12; g++) {
      const ap = E.apOf(V, uid, now); if (ap.left <= 0) break;
      const s = V.sq[uid + '_w1'], here = E.cellAt(V, s.pos[0], s.pos[1]), nb = E.DIRS.map(([x, y]) => E.cellAt(V, s.pos[0] + x, s.pos[1] + y)).filter(Boolean);
      if (!V.boss.dead && E.dist(here, { q: 0, r: 0 }) === 1 && ap.left >= 2 && mrnd() < 0.5) { E.act(V, me, { op: 'boss', sq: s.id }, now, mrnd); continue; }
      const tg = nb.filter((c) => E.passable(c) && c.o !== al && c.t !== 'castle').map((c) => ({ c, p: E.odds(V, uid, s.id, c.q, c.r, now).p })).sort((x, y) => y.p - x.p + (x.c.o ? -0.1 : 0) - (y.c.o ? -0.1 : 0));
      if (tg.length && tg[0].p > 0.4 && ap.left >= 2) { const r = E.act(V, me, { op: 'attack', sq: s.id, q: tg[0].c.q, r: tg[0].c.r }, now, mrnd); if (r.ok) { for (const x of r.got || []) if (x.id) E.addPrize(M.H, x.uid || uid, x); continue; } }
      const front = V.cells.filter((c) => c.o === al && E.passable(c) && c !== here && E.nbs(V, c).some((n) => n.o !== al && E.passable(n) && n.t !== 'castle')).sort((x, y) => E.dist(x, { q: 0, r: 0 }) - E.dist(y, { q: 0, r: 0 }));
      let moved = false; for (const f of front.slice(0, 3)) if (E.act(V, me, { op: 'move', sq: s.id, q: f.q, r: f.r }, now, mrnd).ok) { moved = true; break; }
      if (moved) continue;
      if (here.o === al && here.t !== 'castle' && E.act(V, me, { op: 'reinforce', sq: s.id }, now, mrnd).ok) continue;
      break;
    }
  });
}
function mockHandle(op, b) {   // mirrors gameValley2.handle(): hub, prizes kept until claimed, claims return the same ids
  mockLoad(); const now = mockNow(), me = mockMe(), uid = 'me';
  E.hubTick(M.H, now);
  const V = me ? E.valleyFor(M.H, me, now) : null;
  if (V && me) { E.join(V, me, now); mockBots(now); }
  const unclaimed = () => (M.H.prizes[uid] || []).filter((p) => !p.c);
  const vw = () => { const v = V ? E.view(V, uid, now, MOCK_NAMES) : { ok: true, id: null, week: E.weekKey(now), ends: E.weekEnd(E.weekKey(now)), me: null };
    let last = null; if (M.H.last) { const lv = M.H.last.valleys.find((x) => x.acc[uid]); if (lv) last = { week: M.H.last.week, table: lv.table.map((x) => ({ ...x, ...(MOCK_NAMES[x.al] || {}) })), al: lv.acc[uid], quests: lv.quests[lv.acc[uid]] || [] }; }
    return { ...v, need: me ? null : 'ally', prizes: unclaimed(), last, mock: 1, now }; };
  let out;
  if (op === 'state') out = vw();
  else if (op === 'claim') { const ids = new Set(b.ids || []), got = (M.H.prizes[uid] || []).filter((p) => ids.has(p.id)); for (const p of got) p.c ||= now; out = { ok: true, got }; }
  else if (!me) out = { ok: false, error: 'Долина открыта только альянсам: вступи в альянс (окно 🤝)', need: 'ally' };
  else if (op === 'squad') { const { snap, clamped } = E.squadSnap(b.heroes, W(), b.sk); const r = E.register(V, me, W(), snap, now, b.face, M.H); out = { ok: r.ok, error: r.err, clamped: clamped.length, state: vw() }; }
  else if (op === 'today') { E.reportToday(V, uid, now); out = { ok: true, state: vw() }; }
  else if (op === 'odds') out = E.odds(V, uid, b.sq, b.q, b.r, now);
  else { const r = E.act(V, me, { op, sq: b.sq, q: b.q, r: b.r }, now, Math.random); if (r.ok) for (const x of r.got || []) if (x.id) E.addPrize(M.H, x.uid || uid, x);
    out = { ...r, cell: undefined, error: r.err, got: (r.got || []).filter((x) => !x.uid || x.uid === uid), state: vw() }; }
  mockSave(); return JSON.parse(JSON.stringify(out));
}
async function call(op, body) {
  let d;
  if (mockOn()) { await new Promise((ok) => setTimeout(ok, 60)); d = mockHandle(op, body || {}); }
  else {
    let tok = LS('magicschool.valleyTok') || '';
    if (!tok) try { tok = (await Promise.race([A.token(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))])).tok; } catch (e) { /* view only */ }
    const r = await fetch(`${URL0}/${op}?w=${W()}`, { method: op === 'state' ? 'GET' : 'POST', headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(op !== 'state' ? { 'Content-Type': 'application/json' } : {}) }, body: op !== 'state' ? JSON.stringify(body || {}) : undefined, cache: 'no-store' });
    d = await r.json().catch(() => ({ ok: false }));
  }
  if (d.state) st = d.state; else if (op === 'state' && d.ok) st = d;
  return d;
}

// ============================================================ board helpers
const cells = () => (st && st.cells ? st.cells.map(([q, r, t, o, f, tk]) => ({ q, r, t: E.TYPES[t], o, f, tk })) : []);
let cmap = null, cmapOf = null;
const cellAt = (q, r) => { if (cmapOf !== st) { cmapOf = st; cmap = new Map(cells().map((c) => [c.q + ',' + c.r, c])); } return cmap.get(q + ',' + r) || null; };
const myAl = () => (st && st.me ? st.me.al : '');
const mine = () => (st && st.sq ? st.sq.filter((s) => s.mine) : []);
const curSq = () => mine().find((s) => s.id === mySq) || mine()[0] || null;
const sqOn = (q, r) => (st && st.sq ? st.sq.filter((s) => s.pos[0] === q && s.pos[1] === r) : []);
const alOf = (id) => (st && st.als && st.als[id]) || null;
const fmtLeft = (ms) => { const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000); return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`; };
const nowT = () => (st && st.mock ? st.now : Date.now());
const passC = (c) => c && !['lake', 'peak', 'chasm', 'boss'].includes(c.t);
function pathCost(s, to) {   // same Dijkstra as the server, for the button price (the server decides)
  const start = cellAt(s.pos[0], s.pos[1]); if (!start) return Infinity; const D = new Map([[start.q + ',' + start.r, 0]]), Q = [[0, start]];
  while (Q.length) { Q.sort((a, b) => a[0] - b[0]); const [d, c] = Q.shift(); if (c === to) return d;
    for (const [a, b] of E.DIRS) { const n = cellAt(c.q + a, c.r + b); if (!n || n.o !== myAl() || !passC(n)) continue; const nd = d + (E.V2.move[n.t] || 1), k = n.q + ',' + n.r; if (nd < (D.get(k) ?? 1e9)) { D.set(k, nd); Q.push([nd, n]); } } }
  return Infinity;
}

// ============================================================ drawing (canvas, pan/zoom)
const S0 = 26;
const px = (q, r) => { const s = S0 * view.z; return { x: view.x + s * Math.sqrt(3) * (q + r / 2), y: view.y + s * 1.5 * r }; };
function hexPath(cx, x, y, s) { cx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); cx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); } cx.closePath(); }
const mix = (h1, h2, k) => { const a = parseInt(h1.slice(1, 7), 16), b = parseInt(h2.slice(1, 7), 16), m = (x, y) => Math.round(x + (y - x) * k); return '#' + [m(a >> 16, b >> 16), m((a >> 8) & 255, (b >> 8) & 255), m(a & 255, b & 255)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
function fitView() {
  if (!cv || !st || !st.R) return; const w = cv.clientWidth, h = cv.clientHeight, R = st.R;
  view.z = Math.min(w / (S0 * Math.sqrt(3) * (2 * R + 1.2)), h / (S0 * (3 * R + 2.2))) * 1.0; view.x = w / 2; view.y = h / 2; view.fit = true;
  const s = curSq(); if (s && view.z < 0.9) { view.z = 1.15; const p0 = { x: S0 * view.z * Math.sqrt(3) * (s.pos[0] + s.pos[1] / 2), y: S0 * view.z * 1.5 * s.pos[1] }; view.x = w / 2 - p0.x * 0.6; view.y = h / 2 - p0.y * 0.6; }
}
function sizeCv() { if (!cv) return; const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } return dpr; }
// Speed (Maria 2026-11-27 «Невероятно сильно лагает долина», tools/_patch/valley_perf.py): the board used to be painted whole 25 times
// a second (up to 271 hexes, a gradient and emoji text each). Now the still terrain is painted ONCE into an offscreen layer BG (the
// screen plus a margin for panning) and re-painted only when the board (st), the zoom, the screen size or the side change; every frame
// = one copy of the layer + the moving bits (lake waves, glows, the dashed targets, squads, selection). Pinch-zoom stretches the old
// layer until the fingers rest.
let BG = null, inputT = 0, dirty = true, sortedOf = null, sortedC = [], sqOf = null, sqCells = [];
const ico0 = (cx, e, x, y, z) => { const im = A.emojiImage && A.emojiImage(e); if (im) { cx.drawImage(im, x - z / 2, y - z / 2, z, z); return true; } cx.font = `${z * 0.85}px serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(e, x, y); return false; };
function sortedCells() { if (sortedOf !== st) { sortedOf = st; sortedC = cells().sort((a, b) => a.r - b.r || a.q - b.q); } return sortedC; }
function squadCells() { if (sqOf !== st) { sqOf = st; const by = new Map(); for (const q of (st && st.sq) || []) { const k = q.pos[0] + ',' + q.pos[1]; if (!by.has(k)) by.set(k, []); by.get(k).push(q); } sqCells = cells().filter((c) => by.has(c.q + ',' + c.r)).map((c) => [c, by.get(c.q + ',' + c.r)]); } return sqCells; }
function paintTerrain(dpr, cw, ch) {   // the still part of the board, into BG (css px of the layer = screen px + margin)
  const mx = Math.ceil(cw * 0.4), my = Math.ceil(ch * 0.4), lw = cw + 2 * mx, lh = ch + 2 * my;
  if (!BG) BG = { c: document.createElement('canvas') };
  const L = BG.c; if (L.width !== Math.round(lw * dpr) || L.height !== Math.round(lh * dpr)) { L.width = Math.round(lw * dpr); L.height = Math.round(lh * dpr); }
  const cx = L.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, lw, lh);
  const s = S0 * view.z, T = TI(); let miss = false;
  const ico = (e, x, y, z) => { if (!ico0(cx, e, x, y, z)) miss = true; };
  for (const c of sortedCells()) {
    const p = px(c.q, c.r), x = p.x + mx, y = p.y + my; if (x < -s * 2 || y < -s * 2 || x > lw + s * 2 || y > lh + s * 2) continue;
    const ti = T[c.t] || T.plain, a = alOf(c.o), base = a ? mix(ti[2], a.color, 0.35) : ti[2];
    if (!['lake', 'chasm'].includes(c.t)) { hexPath(cx, x, y + s * 0.16, s * 0.97); cx.fillStyle = mix(base, '#000000', 0.35); cx.fill(); }
    hexPath(cx, x, y, s * 0.97); const g = cx.createRadialGradient(x - s * 0.3, y - s * 0.4, s * 0.05, x, y, s * 1.1); g.addColorStop(0, mix(base, '#ffffff', 0.3)); g.addColorStop(1, base); cx.fillStyle = g; cx.fill();
    cx.lineWidth = 1; cx.strokeStyle = 'rgba(255,255,255,0.5)'; cx.stroke();
    if (a) { hexPath(cx, x, y, s * 0.86); cx.lineWidth = Math.max(2, s * 0.12); cx.strokeStyle = a.color; cx.stroke(); }
    if (c.t === 'chasm') { cx.strokeStyle = '#1e1726'; cx.lineWidth = Math.max(2, s * 0.12); cx.beginPath(); cx.moveTo(x - s * 0.5, y - s * 0.1); cx.lineTo(x - s * 0.1, y + s * 0.12); cx.lineTo(x + s * 0.15, y - s * 0.12); cx.lineTo(x + s * 0.5, y + s * 0.08); cx.stroke(); }
    else if (c.t === 'boss') { const B = st.boss; ico(B.dead ? '💀' : B.e, x, y - s * 0.05, s * 1.25); if (!B.dead) { cx.beginPath(); cx.arc(x, y, s * 0.82, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * B.hp / B.max); cx.lineWidth = s * 0.12; cx.strokeStyle = '#e2574c'; cx.stroke(); } }
    else if (c.t !== 'lake' && ti[1]) { if (c.t === 'forest') { ico(ti[1], x - s * 0.28, y - s * 0.1, s * 0.55); ico(ti[1], x + s * 0.28, y - s * 0.14, s * 0.55); } else ico(ti[1], x, y - s * 0.12, s * (c.t === 'castle' ? 1.05 : 0.75)); }
    if (passC(c) && c.t !== 'castle' && s > 18) { cx.font = `800 ${Math.max(8, s * 0.3)}px ui-rounded,sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = 'rgba(40,30,60,0.75)'; cx.fillText('🛡' + c.f, x, y + s * 0.55); }
  }
  Object.assign(BG, { st, z: view.z, ox: view.x, oy: view.y, mx, my, lw, lh, dpr, cw, ch, al: myAl(), w: W(), miss, tries: miss ? (BG.tries || 0) + 1 : 0, at: performance.now() });
  window.__v2paints = (window.__v2paints || 0) + 1;   // test hook: how many times the terrain was painted
}
function draw() {
  if (!cv || !st || !st.cells) return; const dpr = sizeCv(), cx = cv.getContext('2d'), cw = cv.clientWidth, ch = cv.clientHeight;
  if (!view.fit) fitView();
  const now = performance.now(), touching = now - inputT < 220;
  const same = BG && BG.st === st && BG.dpr === dpr && BG.cw === cw && BG.ch === ch && BG.al === myAl() && BG.w === W() && !(BG.miss && BG.tries < 6 && now - BG.at > 600);   // an emoji picture still loading: paint again a few times
  const inside = same && BG.z === view.z && Math.abs(view.x - BG.ox) <= BG.mx && Math.abs(view.y - BG.oy) <= BG.my;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  if (inside) {   // a plain copy of the visible part of the layer, whole device pixels
    const sx = Math.max(0, Math.min(BG.c.width - cv.width, Math.round((BG.mx - (view.x - BG.ox)) * dpr))), sy = Math.max(0, Math.min(BG.c.height - cv.height, Math.round((BG.my - (view.y - BG.oy)) * dpr)));
    cx.drawImage(BG.c, sx, sy, cv.width, cv.height, 0, 0, cv.width, cv.height);
  } else if (same && touching) {   // fingers still zooming: stretch the old layer, paint it anew when they rest
    const k = view.z / BG.z; cx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (view.x - k * (BG.mx + BG.ox)), dpr * (view.y - k * (BG.my + BG.oy))); cx.drawImage(BG.c, 0, 0, BG.lw, BG.lh);
  } else { paintTerrain(dpr, cw, ch); cx.drawImage(BG.c, Math.round(BG.mx * dpr), Math.round(BG.my * dpr), cv.width, cv.height, 0, 0, cv.width, cv.height); }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = S0 * view.z, T0 = now / 1000, pulse = 0.5 + 0.5 * Math.sin(T0 * 4), me = curSq(), al = myAl();
  const ico = (e, x, y, z) => ico0(cx, e, x, y, z), vis = (x, y) => !(x < -s * 2 || y < -s * 2 || x > cw + s * 2 || y > ch + s * 2);
  for (const c of sortedCells()) {   // the moving bits of the terrain: lake waves, the glow of a reward
    if (c.t === 'lake') { const { x, y } = px(c.q, c.r); if (!vis(x, y)) continue; cx.strokeStyle = 'rgba(255,255,255,0.7)'; cx.lineWidth = Math.max(1, s * 0.05); for (const dy of [-0.2, 0.18]) { const sh = Math.sin(T0 * 1.5 + c.q + dy * 9) * s * 0.08; cx.beginPath(); cx.moveTo(x - s * 0.4 + sh, y + s * dy); cx.quadraticCurveTo(x + sh, y + s * (dy - 0.12), x + s * 0.4 + sh, y + s * dy); cx.stroke(); } }
    else if (c.tk && (c.t === 'ruins' || c.t === 'shrine')) { const { x, y } = px(c.q, c.r); if (!vis(x, y)) continue; const k = 0.5 + 0.5 * Math.sin(T0 * 3 + c.q); cx.fillStyle = `rgba(255,240,120,${0.4 + 0.5 * k})`; cx.beginPath(); cx.arc(x + s * 0.4, y - s * 0.45, s * 0.1, 0, 7); cx.fill(); }
  }
  const hereC = me ? cellAt(me.pos[0], me.pos[1]) : null;
  if (hereC && !battle) for (const [a, b] of E.DIRS) { const c = cellAt(hereC.q + a, hereC.r + b); if (!c || c.o === al || !passC(c) || c.t === 'castle') continue;   // where my squad can strike
    const { x, y } = px(c.q, c.r); hexPath(cx, x, y, s * 0.93); cx.lineWidth = 2 + 1.5 * pulse; cx.strokeStyle = `rgba(255,255,255,${0.45 + 0.5 * pulse})`; cx.setLineDash([5, 4]); cx.stroke(); cx.setLineDash([]); }
  for (const [c, L] of squadCells()) { const { x, y } = px(c.q, c.r); if (!vis(x, y)) continue;   // squads: figures (placeholder: a coloured pawn with the school's emoji)
    L.forEach((q, k) => { const a = alOf(q.al), ox = (k - (L.length - 1) / 2) * s * 0.5, fx = x + ox, fy = y - s * 0.05, r = s * 0.3;
      cx.beginPath(); cx.ellipse(fx, fy + r * 1.1, r * 0.9, r * 0.35, 0, 0, 7); cx.fillStyle = 'rgba(0,0,0,0.25)'; cx.fill();
      cx.beginPath(); cx.moveTo(fx - r * 0.8, fy + r * 1.05); cx.quadraticCurveTo(fx, fy - r * 0.2, fx + r * 0.8, fy + r * 1.05); cx.closePath(); cx.fillStyle = a ? a.color : '#888'; cx.fill();
      cx.beginPath(); cx.arc(fx, fy - r * 0.15, r * 0.62, 0, 7); cx.fillStyle = '#fff'; cx.fill(); cx.lineWidth = q.mine ? 3 : 1.5; cx.strokeStyle = q.mine ? (q.id === (me && me.id) ? `rgba(255,200,40,${0.7 + 0.3 * pulse})` : '#f0c24a') : a ? a.color : '#888'; cx.stroke();
      ico(q.face || (q.h && q.h[0] && q.h[0].e) || '🧙', fx, fy - r * 0.15, r * 1.0);
      if (q.surr) ico('⛓️', fx + r * 0.7, fy - r * 0.8, r * 0.7); else if (q.fort) ico('🛡️', fx + r * 0.7, fy - r * 0.8, r * 0.6); });
  }
  if (sel) { const { x, y } = px(sel.q, sel.r); hexPath(cx, x, y, s * 1.03); cx.lineWidth = 4; cx.strokeStyle = '#ffd84a'; cx.stroke(); }
  if (battle && battle.arrow) { const a = px(battle.arrow[0], battle.arrow[1]), b = px(battle.arrow[2], battle.arrow[3]); cx.strokeStyle = 'rgba(255,90,60,0.9)'; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
}
// one draw per screen frame while a finger moves the map (pointer events used to draw on every event), 25 fps for the slow pulses otherwise
function loop() { if (!root) { raf = 0; return; } raf = requestAnimationFrame(loop); const t = performance.now(); if (tab !== 'map' || document.hidden) return; if (t - lastDraw < (dirty || t - inputT < 220 ? 14 : 40)) return; lastDraw = t; dirty = false; draw(); }
const moved0 = () => { dirty = true; inputT = performance.now(); };
function hitCell(e) { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, s = S0 * view.z; let best = null, bd = 1e9; for (const c of cells()) { const p = px(c.q, c.r), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = c; } } return best && bd < (s * 1.0) ** 2 ? best : null; }
function wirePan() {
  const P = new Map(); let moved = 0, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (P.size === 2) { const [a, b] = [...P.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', (e) => { if (!P.has(e.pointerId)) return; const [ox, oy] = P.get(e.pointerId), dx = e.clientX - ox, dy = e.clientY - oy; P.set(e.pointerId, [e.clientX, e.clientY]);
    if (P.size === 1) { view.x += dx; view.y += dy; moved += Math.abs(dx) + Math.abs(dy); } else if (P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; moved = 99; } moved0(); });
  const up = (e) => { if (!P.has(e.pointerId)) return; P.delete(e.pointerId); if (!P.size && moved < 8) { const c = hitCell(e); if (c) pick(c); } if (P.size < 2) pinch = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => P.delete(e.pointerId));
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); moved0(); }, { passive: false });
}
function zoomAt(cx0, cy0, k) { const r = cv.getBoundingClientRect(), x = cx0 - r.left, y = cy0 - r.top, z = Math.max(0.35, Math.min(3, view.z * k)); k = z / view.z; view.x = x - (x - view.x) * k; view.y = y - (y - view.y) * k; view.z = z; }

// ============================================================ screen
function css() {
  if (document.getElementById('v2-style')) return;
  const e = document.createElement('style'); e.id = 'v2-style';
  e.textContent = `#v2{position:fixed;inset:0;z-index:900;background:linear-gradient(#efe6ff,#fdf0e6);display:flex;flex-direction:column;font-family:ui-rounded,"Nunito","Segoe UI",sans-serif;color:#3a3150}
#v2.w2{background:linear-gradient(#3b414c,#2a2e36);color:#eef}
#v2 .v2-top{display:flex;align-items:center;gap:5px;padding:calc(env(safe-area-inset-top,0px) + 8px) 8px 4px}#v2 .v2-top h2{flex:1;margin:0;font-size:17px;white-space:nowrap}
#v2 .v2-x{min-width:36px;height:36px;padding:0 6px;border-radius:12px;border:0;background:#fff;font-size:17px;box-shadow:0 2px 0 #d9cdf5;color:#3a3150}
#v2 .v2-pill{background:#fff;border-radius:12px;padding:5px 8px;font-weight:800;font-size:13px;box-shadow:0 2px 0 #d9cdf5;white-space:nowrap;color:#3a3150}
#v2 .v2-tabs{display:flex;gap:4px;padding:0 8px 5px}#v2 .v2-tabs button{flex:1;border:0;border-radius:10px;padding:6px 2px;font:800 12px inherit;background:#f1eafd;color:#6b5a99}#v2 .v2-tabs button.on{background:#7b5cd6;color:#fff}
#v2 .v2-boss{margin:0 8px 5px;background:#fff;border-radius:12px;padding:4px 8px;font-size:12.5px;font-weight:800;display:flex;align-items:center;gap:6px;color:#3a3150}
#v2 .v2-hp{flex:1;height:10px;border-radius:6px;background:#f3d9d6;overflow:hidden}#v2 .v2-hp i{display:block;height:100%;background:linear-gradient(90deg,#e2574c,#f08a4b)}
#v2 .v2-map{flex:1;position:relative;margin:0 6px;border-radius:16px;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#f7f1ff 0%,#e3d6fb 70%,#d3c3f3 100%)}
#v2.w2 .v2-map{background:radial-gradient(ellipse at 50% 40%,#5d6573 0%,#424955 70%,#2f343e 100%)}
#v2 canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
#v2 .v2-zoom{position:absolute;right:6px;bottom:6px;display:flex;flex-direction:column;gap:4px}#v2 .v2-zoom button{width:34px;height:34px;border-radius:10px;border:0;background:#fffd;font:900 18px inherit;box-shadow:0 2px 0 #0002}
#v2 .v2-sqbar{display:flex;gap:5px;padding:5px 8px 0;overflow-x:auto}#v2 .v2-sq{border:2px solid #d8d0ea;border-radius:12px;background:#fff;padding:3px 8px;font-size:12px;font-weight:800;white-space:nowrap;color:#3a3150}#v2 .v2-sq.on{border-color:#f0c24a;box-shadow:0 0 0 2px #f0c24a}
#v2 .v2-card{background:#fff;color:#3a3150;border-radius:18px 18px 0 0;padding:9px 12px calc(env(safe-area-inset-bottom,0px) + 10px);box-shadow:0 -4px 14px #0002;min-height:92px;margin-top:5px}
#v2 .v2-card b{font-size:15px}#v2 .v2-muted{color:#7a6c99;font-size:12.5px;line-height:1.35}
#v2 .v2-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}#v2 .v2-act .btn{flex:1 1 40%}
#v2 .v2-msg{margin-top:6px;font-weight:800;font-size:13.5px}#v2 .v2-ch{font-size:20px;font-weight:900;color:#7b5cd6}
#v2 .v2-list{flex:1;overflow:auto;padding:0 12px 12px}#v2 .v2-row{background:#fff;color:#3a3150;border-radius:12px;padding:7px 10px;margin:5px 0;font-size:13.5px;display:flex;gap:8px;align-items:center}
#v2 .v2-dot{width:14px;height:14px;border-radius:50%;flex:none}
#v2 .v2-qc{background:linear-gradient(135deg,#3d2a6e,#6b4bb8);color:#fff;border-radius:14px;padding:10px 12px;margin:6px 0}#v2 .v2-qc .v2-muted{color:#e6dcff}
#v2 .v2-bar{height:8px;background:#ffffff40;border-radius:5px;overflow:hidden;margin-top:5px}#v2 .v2-bar i{display:block;height:100%;background:#f0c24a}
#v2-battle{position:fixed;inset:0;z-index:960;background:rgba(25,15,45,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:ui-rounded,"Nunito",sans-serif}
#v2-battle .bt-sides{display:flex;justify-content:space-between;width:min(92vw,420px);align-items:flex-end}#v2-battle .bt-side{text-align:center;width:45%}#v2-battle .bt-side em{font-style:normal;font-size:26px;letter-spacing:-4px}
#v2-battle .bt-side b{display:block;font-size:14px;margin-top:2px}#v2-battle .bt-side span{font-size:12px;opacity:.85}
#v2-battle .bt-tug{position:relative;width:min(92vw,420px);height:26px;border-radius:14px;background:linear-gradient(90deg,#e2574c 0%,#e2574c 50%,#3b82d6 50%,#3b82d6 100%);margin:16px 0 8px;box-shadow:0 0 0 3px #fff4 inset}
#v2-battle .bt-knot{position:absolute;top:-8px;width:16px;height:42px;margin-left:-8px;border-radius:8px;background:#ffd84a;box-shadow:0 0 14px #ffd84a;transition:left .38s cubic-bezier(.3,1.4,.5,1)}
#v2-battle .bt-pop{position:absolute;font-weight:900;font-size:15px;background:#fff;color:#4a2f8a;border-radius:12px;padding:4px 9px;animation:btPop 1.1s ease-out forwards;white-space:nowrap;max-width:62%;overflow:hidden;text-overflow:ellipsis}
#v2-battle .bt-res{font-size:24px;font-weight:900;min-height:34px;text-align:center;margin-top:34px}#v2-battle .bt-sub{font-size:14px;opacity:.9;text-align:center;max-width:90vw;min-height:20px}
#v2-battle .bt-got{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;justify-content:center}#v2-battle .bt-got div{background:#fff;color:#3a3150;border-radius:12px;padding:6px 10px;font-weight:800;animation:btIn .5s ease-out both}
#v2-battle .bt-skip{margin-top:16px}#v2-battle.plain .bt-tug,#v2-battle.plain .bt-side span{display:none}
@keyframes btPop{0%{transform:translateY(8px) scale(.6);opacity:0}20%{transform:translateY(0) scale(1.1);opacity:1}100%{transform:translateY(-34px) scale(1);opacity:0}}
@keyframes btIn{0%{transform:scale(.3) rotate(-10deg);opacity:0}100%{transform:scale(1);opacity:1}}`;
  document.head.appendChild(e);
}
function bossHtml() { if (!st || !st.boss) return ''; const B = st.boss; return `<div class="v2-boss"><span>${B.dead ? '💀' : B.e} ${esc(B.n)}</span><div class="v2-hp"><i style="width:${(100 * B.hp / B.max).toFixed(1)}%"></i></div><span>${B.dead ? 'повержен' : `${B.hp}/${B.max}`}</span><span title="слабость">${E.ELEM[B.weak]}</span></div>`; }
function sqBar() { const L = mine(); if (!L.length) return ''; return `<div class="v2-sqbar">${L.map((s) => `<button class="v2-sq${s.id === (curSq() || {}).id ? ' on' : ''}" data-v2sq="${s.id}">${esc(s.face || '🧙')} ${s.w === 2 ? 'Чертог' : 'Школа'} · ⚔️${Math.round(s.atk)} 🛡${Math.round(s.def)}${s.surr ? ' ⛓️' : ''}</button>`).join('')}</div>`; }
function cardHtml() {
  if (!st) return `<div class="v2-muted">Загружаю долину…</div>`;
  if (st.need === 'ally' || !st.me) return `<b>🤝 Долина — игра альянсов</b><div class="v2-muted">Чтобы выйти в долину со своим отрядом героев, вступи в альянс (окно 🤝). Каждую неделю альянсы спорят за земли, бьют общего босса и выполняют тайные задания.</div>`;
  const s = curSq();
  if (!s) { const tw = !A.towerBuilt || A.towerBuilt();   // the button closes the valley; js/heroes.js opens the tower on the «⚔️ Отряд» tab (data-hx tabopen:squad)
    return tw ? `<b>⚔️ Нет отряда</b><div class="v2-muted">В долину ходят герои из твоей Башни. Выбери до 5 героев — и они выйдут на карту у твоего замка.</div><div class="v2-act"><button class="btn" data-v2tower data-hx="tabopen:squad">⚔️ Собрать отряд</button></div>${msg ? `<div class="v2-msg">${msg}</div>` : ''}`
      : `<b>⚔️ Нет отряда</b><div class="v2-muted">В долину ходят герои из Башни. Сначала построй Башню в своей школе.</div><div class="v2-act"><button class="btn" data-v2tower data-hx="tabopen:squad">🏰 К Башне</button></div>${msg ? `<div class="v2-msg">${msg}</div>` : ''}`; }
  const ap = st.me.ap;
  if (!sel) return `<b>Твой ход</b> <span class="v2-muted">· ⚡ ${ap.left} из ${ap.max}${ap.mines ? ` (шахты +${Math.min(4, ap.mines) * 3})` : ''}${ap.today ? ' (☀️ +3)' : ''}</span><div class="v2-muted">Нажми на клетку с белой рамкой рядом с отрядом — её можно захватить. По своим клеткам отряд ходит. Ничьи земли берутся легко, чужие — трудно.</div>${msg ? `<div class="v2-msg">${msg}</div>` : ''}`;
  const c = cellAt(sel.q, sel.r), ti = TI()[c.t], a = alOf(c.o), here = cellAt(s.pos[0], s.pos[1]), L = sqOn(c.q, c.r);
  let act = '';
  const btn = (k, t, cost, hot) => `<button class="btn${hot ? ' hot' : ''}" data-v2go="${k}" ${ap.left < cost || busy ? 'disabled' : ''}>${t} · ⚡${cost}</button>`;
  if (c.t === 'boss') act = st.boss.dead ? '' : E.dist(here, c) === 1 ? `<div class="v2-act">${btn('boss', '💥 Ударить босса', E.V2.ap.boss, 1)}</div><div class="v2-muted">Урон = сила отряда${s.h && s.h.some((h) => h.rk === 5 && h.el === st.boss.weak) ? `, ×${(1 + Math.min(1, 0.25 * s.h.filter((h) => h.rk === 5 && h.el === st.boss.weak).length)).toFixed(2).replace('.', ',')} за мастеров ${E.ELEM[st.boss.weak]}` : ` (мастера ${E.ELEM[st.boss.weak]} бьют сильнее)`}. Ваш урон: ${st.boss.mine}.</div>` : '<div class="v2-muted">Подведи отряд к логову вплотную.</div>';
  else if (!passC(c)) act = '';
  else if (c.o === myAl()) {
    const same = here === c, cost = same ? 0 : pathCost(s, c);
    act = `<div class="v2-act">${!same ? (Number.isFinite(cost) ? btn('move', L.length && c.t !== 'castle' ? `👣 Встать в гарнизон (${L.length}/3)` : '👣 Перейти', cost) : '<span class="v2-muted">Туда не дойти по своим клеткам</span>') : ''}${same && c.t !== 'castle' ? btn('reinforce', '🛡 Укрепить', E.V2.ap.reinforce) : ''}</div>`;
  } else if (c.t === 'castle') act = '<div class="v2-muted">Замки захватить нельзя.</div>';
  else if (E.dist(here, c) === 1) act = `<div class="v2-act">${btn('attack', c.o ? '⚔️ Напасть' : '⚔️ Захватить', E.V2.ap.attack, 1)}</div><div class="v2-muted">Шанс победы: <span class="v2-ch">${odds && odds.q === c.q && odds.r === c.r ? pct(odds.p) : '…'}</span>${odds && odds.q === c.q && odds.r === c.r ? ` · сила ⚔️${Math.round(odds.A)} против 🛡${Math.round(odds.D)}` : ''}. Проиграешь — отряд отступит ближе к замку.</div>`;
  else act = '<div class="v2-muted">Отряд должен стоять рядом. Подойди по своим клеткам.</div>';
  return `<b>${ti[1] ? ti[1] + ' ' : ''}${ti[0]}</b> <span class="v2-muted">· ${a ? `<span style="color:${a.color};font-weight:800">${esc(a.emo)} ${esc(a.name)}</span>` : passC(c) ? 'ничья земля' : ''}${passC(c) && c.t !== 'castle' ? ` · 🛡${c.f}` : ''}${L.length ? ` · отрядов: ${L.length}` : ''}</span><div class="v2-muted">${TDESC[c.t] || ''}</div>${act}${msg ? `<div class="v2-msg">${msg}</div>` : ''}`;
}
function questsHtml() {
  if (!st || !st.als) return '';
  const my = alOf(myAl()), qs = my && my.quests ? my.quests : [];
  let h = `<div class="v2-muted" style="margin:4px 2px">Тайные задания знает только твой альянс. В воскресенье их раскрывают всем: за каждое выполненное — +${E.V2.glory.quest} очков и вещь для героев каждому, кто ходил.</div>`;
  h += qs.map((q) => `<div class="v2-qc"><b>🎯 ${esc(q.n)}</b>${q.done ? ' ✅' : ''}<div class="v2-muted">${esc(q.d)}</div><div class="v2-bar"><i style="width:${Math.min(100, 100 * q.have / Math.max(1, q.need))}%"></i></div><div class="v2-muted">${q.have} из ${q.need}</div></div>`).join('') || '<div class="v2-muted">Задания появятся, когда альянс выйдет в долину.</div>';
  if (st.sunday) h += '<h3>Задания соперников (воскресенье)</h3>' + Object.entries(st.als).filter(([k]) => k !== myAl()).map(([, a]) => (a.quests || []).map((q) => `<div class="v2-row"><span class="v2-dot" style="background:${a.color}"></span><span style="flex:1">${esc(a.emo)} ${esc(a.name)}: <b>${esc(q.n)}</b> ${q.done ? '✅' : `${q.have}/${q.need}`}</span></div>`).join('')).join('');
  else h += '<div class="v2-muted" style="margin-top:8px">🔒 Задания соперников откроются в воскресенье.</div>';
  return h;
}
function listHtml() {
  if (!st) return '';
  if (tab === 'quest') return questsHtml();
  if (tab === 'log') return (st.ev || []).slice().reverse().map((e) => { const a = alOf(e.al), c = cellAt(e.q, e.r), n = c ? TI()[c.t][0] : '', tm = new Date(e.t);
    const what = e.k === 'bossstrike' ? `🐲 босс отбросил отрядов: ${e.n}` : e.k === 'move' ? `перевёл(а) отряд на «${n}»` : e.k === 'reinforce' ? `укрепил(а) «${n}» (+${e.n})` : e.k === 'boss' ? `ударил(а) босса: −${e.n}` : e.k === 'bosskill' ? '👑 босс повержен!' : e.ok ? `${e.k === 'take' ? 'отбил(а)' : 'занял(а)'} «${n}» (шанс ${e.n} %)` : `не взял(а) «${n}» (шанс ${e.n} %)`;
    return `<div class="v2-row"><span class="v2-dot" style="background:${a ? a.color : '#bbb'}"></span><span style="flex:1"><b>${esc(e.who)}</b> ${what}</span><span class="v2-muted">${['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][tm.getDay()]} ${String(tm.getHours()).padStart(2, '0')}:${String(tm.getMinutes()).padStart(2, '0')}</span></div>`; }).join('') || '<div class="v2-muted" style="padding:10px">Пока тихо — начни первым!</div>';
  if (tab === 'top') {
    const rows = (st.table || []).map((x, k) => { const a = alOf(x.al); return `<div class="v2-row" ${x.al === myAl() ? 'style="box-shadow:0 0 0 2px #e8b923 inset;background:#fff8dc"' : ''}><b style="min-width:24px">${k < 3 ? ['🥇', '🥈', '🥉'][k] : k + 1 + '.'}</b><span class="v2-dot" style="background:${a ? a.color : '#bbb'}"></span><span style="flex:1">${a ? esc(a.emo) + ' ' + esc(a.name) : '?'}<div class="v2-muted">слава ${x.glory} · земли ${x.hold} · босс ${x.boss} · клеток ${x.cells}</div></span><b>${x.score}</b></div>`; }).join('');
    return `<div class="v2-muted" style="margin:4px 2px">Очки = слава (захваты, храбрые бои, «Точки», босс) + земли в воскресенье (луг/лес/холмы 1, шахта/руины/башня 2, святилище 3, логово 10) + тайные задания. Призы ждут на сервере, пока их не заберёшь: 1-е место 🔮${E.V2.prize.stones[0]}, 2-е 🔮${E.V2.prize.stones[1]}, 3-е 🔮${E.V2.prize.stones[2]} и вещи для героев.</div>${rows}${lastHtml()}`;
  }
  return `<div class="v2-muted" style="line-height:1.5;padding:4px 2px"><b>Как играть</b><br>
    • Неделя — одна настольная игра. С понедельника новая карта. Твой альянс начинает в замке на краю, в центре живёт босс.<br>
    • Твоя фигура — отряд из 5 героев каждой твоей школы. Сила — только от героев: их характеристики, вещи и стихии на своей земле.<br>
    • ⚡ Очки действий: ${E.V2.ap.base} в день, +${E.V2.ap.mine} за каждую шахту альянса, +${E.V2.ap.today} за закрытый день «☀️ Сегодня». Шаг ⚡1 (лес и холмы ⚡2), бой ⚡${E.V2.ap.attack}, укрепить ⚡${E.V2.ap.reinforce}, удар по боссу ⚡${E.V2.ap.boss}.<br>
    • Бой — это шанс: перед боем видно, сколько процентов на победу. Проиграл — отряд отступает на свою клетку ближе к замку.<br>
    • На клетке может стоять до 3 отрядов — это гарнизон, он защищает и ночью. Отряд, который долго стоит, окапывается (🛡️ +15 %).<br>
    • «Точки»: замкни кольцо своих клеток — всё внутри станет вашим. Чужой отряд внутри окружён (⛓️ сила −50 %). Земли у края карты и замки окружить нельзя.<br>
    • Под клетками награды: слава, ⚡, монеты; в руинах и святилищах — вещи для героев.<br>
    • Босса бьют все альянсы. Когда он падёт, логово получит тот, кто нанёс больше урона, а каждый, кто бил, — вещь для героев.</div>`;
}
function lastHtml() { if (!st || !st.last) return ''; const L = st.last, k = L.table.findIndex((x) => x.al === L.al); return `<h3>Прошлая неделя</h3>${L.table.map((x, j) => `<div class="v2-row" ${x.al === L.al ? 'style="background:#fff8dc"' : ''}><b>${j + 1}.</b><span style="flex:1">${esc(x.emo || '🤝')} ${esc(x.name || 'Альянс')}</span><b>${x.score}</b></div>`).join('')}<div class="v2-muted">Твой альянс: ${k + 1}-е место. Задания: ${(L.quests || []).map((q) => `${esc((E.QUESTS[q.q] || {}).n || q.q)} ${q.done ? '✅' : '❌'}`).join(', ')}</div>`; }
function render() {
  if (!root) return;
  const left = st && st.ends ? st.ends - nowT() : 0, ap = st && st.me ? st.me.ap : null;
  root.innerHTML = em(`<div class="v2-top"><button class="v2-x" data-v2x>✕</button><h2>${W() === 2 ? '⛏️ Долина' : '🚩 Долина'}${st && st.mock ? ' <small style="font-size:11px;color:#c0392b">МОК</small>' : ''}</h2>${ap ? `<span class="v2-pill">⚡ ${ap.left}/${ap.max}</span>` : ''}<span class="v2-pill">⏳ ${st ? fmtLeft(Math.max(0, left)) : '…'}</span></div>
    <div class="v2-tabs">${[['map', '🗺 Карта'], ['quest', '🎯 Задания'], ['log', '📜 События'], ['top', '🏆 Очки'], ['help', '❓']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-v2tab="${k}">${t}</button>`).join('')}</div>
    ${tab === 'map' ? `${bossHtml()}<div class="v2-map"><canvas></canvas><div class="v2-zoom"><button data-v2z="1">+</button><button data-v2z="-1">−</button><button data-v2z="0">⌂</button></div></div>${sqBar()}<div class="v2-card">${cardHtml()}</div>` : `<div class="v2-list">${listHtml()}</div>`}`);
  cv = root.querySelector('canvas'); if (cv) { wirePan(); draw(); }
}
function refreshCard() { if (!root) return; const c = root.querySelector('.v2-card'); if (c) c.innerHTML = em(cardHtml()); const b = root.querySelector('.v2-boss'); if (b) b.outerHTML = em(bossHtml()); const p = root.querySelector('.v2-pill'); if (p && st && st.me) p.textContent = `⚡ ${st.me.ap.left}/${st.me.ap.max}`; draw(); }
async function pick(c) {
  sel = { q: c.q, r: c.r }; msg = ''; odds = null; refreshCard();
  const s = curSq(), here = s && cellAt(s.pos[0], s.pos[1]);
  if (s && here && c.o !== myAl() && passC(c) && c.t !== 'castle' && E.dist(c, here) === 1) { const o = await call('odds', { sq: s.id, q: c.q, r: c.r }); if (o.ok && sel && sel.q === c.q && sel.r === c.r) { odds = { ...o, q: c.q, r: c.r }; refreshCard(); } }
}

// ============================================================ battle: tug-of-war (~4 s, swings both ways, skill pop-ups, skippable)
function tug(p, won) {   // keyframes of the knot: 0 = middle, +1 = attacker wins; close fights swing more
  const amp = 0.25 + 0.7 * (1 - Math.abs(2 * p - 1)), K = [], n = 8;
  for (let i = 1; i <= n; i++) { const t = i / n, drift = (won ? 1 : -1) * Math.pow(t, 2) * 0.8, sw = (i % 2 ? 1 : -1) * amp * (1 - t * 0.7) * (0.6 + Math.random() * 0.4); K.push(Math.max(-0.95, Math.min(0.95, drift + sw * (i < n ? 1 : 0)))); }
  K.push(won ? 1 : -1); return K;
}
function playBattle(o) {   // o: { p, won, att:{name, faces, heroes}, def:{name, faces}, title, sub, got, plain }
  return new Promise((done) => {
    const d = document.createElement('div'); d.id = 'v2-battle'; if (o.plain) d.className = 'plain';
    d.innerHTML = em(`<div style="font-size:15px;opacity:.85;margin-bottom:10px">${o.plain ? esc(o.plain) : o.head ? esc(o.head) : `⚔️ Идёт бой · шанс ${pct(o.p)}`}</div><div class="bt-sides"><div class="bt-side"><em>${o.att.faces}</em><b>${esc(o.att.name)}</b><span>⚔️ ${Math.round(o.A)}</span></div><div style="font-size:26px">⚡</div><div class="bt-side"><em>${o.def.faces}</em><b>${esc(o.def.name)}</b><span>🛡 ${Math.round(o.D)}</span></div></div>
      <div class="bt-tug"><div class="bt-knot" style="left:50%"></div></div><div class="bt-res"></div><div class="bt-sub"></div><div class="bt-got"></div><button class="btn bt-skip">Пропустить ⏩</button>`);
    document.body.appendChild(d); battle = battle || {};
    const knot = d.querySelector('.bt-knot'), tugEl = d.querySelector('.bt-tug'), K = tug(o.p, o.won), names = (o.att.heroes && o.att.heroes.length ? o.att.heroes : ['Отряд']);
    let i = 0, fin = false; const T = [];
    const pop = (txt, x) => { const e = document.createElement('div'); e.className = 'bt-pop'; e.textContent = txt; e.style.left = `${Math.max(0, Math.min(38, x))}%`; e.style.top = '34px'; tugEl.appendChild(e); setTimeout(() => e.remove(), 1100); };
    const end = () => { if (fin) return; fin = true; T.forEach(clearTimeout); knot.style.left = o.won ? '100%' : '0%';
      d.querySelector('.bt-res').textContent = o.title; d.querySelector('.bt-sub').innerHTML = em(o.sub || '');
      d.querySelector('.bt-got').innerHTML = em((o.got || []).map((g, k) => `<div style="animation-delay:${0.15 * k}s">${gotTxt(g)}</div>`).join(''));
      const b = d.querySelector('.bt-skip'); b.textContent = 'Дальше ➜'; b.onclick = () => { d.remove(); battle = null; done(); }; };
    d.querySelector('.bt-skip').onclick = end;
    const step = () => { if (fin) return; if (i >= K.length) return end(); const x = K[i]; knot.style.left = `${50 + 50 * x}%`;
      if (i < K.length - 1 && (i % 2 === 0 || Math.random() < 0.4)) { const mineSide = (i % 2 === 0) === (x > (K[i - 1] || 0)); pop(mineSide ? `${names[i % names.length]}: ${SKILLS[(i * 3 + names.length) % SKILLS.length]}!` : `${o.def.name}: ${SKILLS[(i * 5 + 1) % SKILLS.length]}!`, mineSide ? 52 + x * 20 : 10 + x * 20); }
      i++; T.push(setTimeout(step, i >= K.length ? 500 : 440)); };
    if (o.plain) end(); else T.push(setTimeout(step, 300));
  });
}
function strikeTxt(L) {   // the boss strikes back at the squads around its lair (Ruslan «Лучше чтобы бил»)
  if (!L || !L.length) return ''; const mineIds = new Set(mine().map((s) => s.id)), me = L.filter((x) => mineIds.has(x.id)), others = L.filter((x) => !mineIds.has(x.id) && x.hit).length;
  return (me.length ? (me.some((x) => x.hit) ? `Босс ударил в ответ и отбросил твой отряд (шанс был ${pct(me[0].p)}).` : `Босс ударил в ответ — твой отряд устоял (шанс удара ${pct(me[0].p)}).`) : '') + (others ? ` Отброшено чужих отрядов: ${others}.` : '');
}
function gotTxt(g) { return g.k === 'gear' ? `🎒 вещь ${RAR[g.rar || 0]}` : g.k === 'stones' ? `🔮 +${g.n}` : g.k === 'coins' ? '🪙 клад' : g.k === 'ap' ? `⚡ +${g.n}` : g.k === 'glory' ? `🏆 слава +${g.n}` : '🎁'; }
async function claimAll() {   // prizes wait on the server until claimed; the game pays each id once (keys v2_<id>)
  if (!st || !st.prizes || !st.prizes.length) return [];
  const d = await call('claim', { ids: st.prizes.map((p) => p.id) }); if (!d.ok) return [];
  const paid = [];
  for (const p of d.got || []) { const k = 'v2_' + p.id; let ok = false;
    if (p.k === 'stones') ok = A.stones && A.stones(p.n, k); else if (p.k === 'coins') ok = A.coins && A.coins(p.n, k); else if (p.k === 'gear') ok = A.gear && A.gear(p.rar || 0, k);
    if (ok) paid.push(p); }
  st.prizes = []; return paid;
}
async function go(op) {
  if (busy || !sel) return; const s = curSq(); if (!s) return; busy = true; msg = '⏳ …'; refreshCard();
  const c = cellAt(sel.q, sel.r), here = cellAt(s.pos[0], s.pos[1]), defA = alOf(c.o), before = st;
  try {
    const d = await call(op, { sq: s.id, q: sel.q, r: sel.r });
    if (!d.ok) { msg = '❗ ' + (d.error || 'Не получилось'); busy = false; refreshCard(); return; }
    A.stats && A.stats('valley2', { k: op, p: d.p != null ? Math.round(d.p * 100) : 0, w: d.won ? 1 : 0 });
    if (op === 'attack') {
      battle = { arrow: [here.q, here.r, c.q, c.r] };
      const defSq = (before.sq || []).filter((x) => x.pos[0] === c.q && x.pos[1] === c.r && x.al === c.o);
      await playBattle({ p: d.p, won: d.won, A: d.A, D: d.D, att: { name: s.name || 'Мой отряд', faces: (s.h || []).map((h) => h.e || '🧙').join('') || '🧙', heroes: (s.h || []).map((h) => h.nm).filter(Boolean) },
        def: { name: defA ? defA.name : 'Стражи земли', faces: defSq.length ? defSq.map((x) => x.face || '🛡️').join('') : (TI()[c.t][1] || '🛡️') + '🛡️' },
        title: d.won ? '🎉 Победа!' : '💥 Не вышло', sub: d.won ? `«${TI()[c.t][0]}» теперь ваша${d.ring ? ` · «Точки»: +${d.ring} клеток внутри кольца!` : ''}${d.moved && d.moved.length ? ` · защитники отступили` : ''}` : 'Отряд отступил на свою клетку ближе к замку.', got: d.got });
      if (d.won) { A.snd && A.snd('special'); } msg = (d.won ? `🎉 Победа (шанс был ${pct(d.p)})` : `💥 Поражение (шанс был ${pct(d.p)}) — отряд отступил`) + (d.xp ? ` · героям +${d.xp} опыта` : '');
    } else if (op === 'boss') { await playBattle({ head: '💥 Удар по боссу', p: 1, won: true, A: s.atk, D: st.boss.hp, att: { name: s.name || 'Мой отряд', faces: (s.h || []).map((h) => h.e || '🧙').join(''), heroes: (s.h || []).map((h) => h.nm).filter(Boolean) }, def: { name: st.boss.n, faces: st.boss.e }, title: d.kill ? '👑 Босс повержен!' : `💥 Урон ${d.dmg}`, sub: (d.weak ? 'Мастера нужной стихии бьют сильнее! ' : `У босса осталось ${d.boss.hp} из ${d.boss.max}. `) + strikeTxt(d.strike), got: d.got }); msg = `💥 Урон боссу: ${d.dmg}${d.xp ? ` · героям +${d.xp} опыта` : ''}`; const s2 = curSq(); sel = s2 ? { q: s2.pos[0], r: s2.pos[1] } : null; }
    else if (op === 'move') msg = `👣 Отряд перешёл (⚡${d.cost})`;
    else if (op === 'reinforce') msg = `🛡 Укреплено: +${d.add}`;
    if (d.xp > 0) heroXp(d.xp, d.sqw);
    if ((d.got || []).some((g) => g.id)) await claimAll();
    if (op === 'attack' || op === 'move') { const s2 = curSq(); sel = s2 ? { q: s2.pos[0], r: s2.pos[1] } : null; odds = null; }
  } catch (e) { msg = '❗ Нет связи с долиной, попробуй ещё раз'; }
  busy = false; render();
}
// hero XP from valley actions (Ruslan «а было бы хорошо, чтобы качались»): the server returns xp for the acting squad; a squad of
// another school (world) keeps it pending in localStorage until that school is opened
function heroXp(n, w) {
  let P = {}; try { P = JSON.parse(LS('magicschool.v2xp') || '{}') || {}; } catch (e) { P = {}; }
  if (n) P[w || W()] = (P[w || W()] || 0) + n;
  const mineN = P[W()] || 0; if (mineN && A.heroXp && A.heroXp(mineN)) delete P[W()];
  try { localStorage.setItem('magicschool.v2xp', JSON.stringify(P)); } catch (e) { /* full */ }
}
async function syncSquad() {   // this school's squad -> the server (account + world); at most once a minute
  if (!A.squad || (Date.now() - regAt < 60000 && curSq())) return; const q = A.squad(); if (!q || !q.heroes || !q.heroes.length) return;
  regAt = Date.now(); await call('squad', q).catch(() => {});
}
async function resultCheck() {   // Monday: last week's result (once per week per device), then the prizes
  if (!st || !st.last || seenLast === String(st.last.week) || LS('magicschool.v2last') === String(st.last.week)) { if (st && st.prizes && st.prizes.length) { const p = await claimAll(); if (p.length) A.toast(`🚩 Долина: ${p.map(gotTxt).join(', ')}`); } return; }
  seenLast = String(st.last.week); try { localStorage.setItem('magicschool.v2last', seenLast); } catch (e) { /* private */ }
  const L = st.last, k = L.table.findIndex((x) => x.al === L.al), paid = await claimAll();
  await playBattle({ plain: '🏆 Итоги прошлой недели в долине', p: 1, won: true, A: 0, D: 0, att: { name: L.table[k] ? `${L.table[k].emo || ''} ${L.table[k].name || ''}` : 'Твой альянс', faces: '🏰', heroes: [] }, def: { name: `очков: ${L.table[k] ? L.table[k].score : 0}`, faces: '🏆' }, title: `${k < 3 ? ['🥇', '🥈', '🥉'][k] : '🎖️'} ${k + 1}-е место`, sub: `Тайные задания: ${(L.quests || []).map((q) => `${(E.QUESTS[q.q] || {}).n || q.q} ${q.done ? '✅' : '❌'}`).join(', ') || '—'}`, got: paid });
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b || !root || !root.contains(b)) return; const d = b.dataset;
  if (d.v2x !== undefined) return close();
  if (d.v2tower !== undefined) { close(); return; }   // the same click goes on to js/heroes.js, which opens the tower
  if (d.v2tab) { tab = d.v2tab; render(); return; }
  if (d.v2sq) { mySq = d.v2sq; const s = curSq(); sel = s ? { q: s.pos[0], r: s.pos[1] } : null; odds = null; render(); return; }
  if (d.v2z !== undefined) { const r = cv.getBoundingClientRect(); if (d.v2z === '0') { view.fit = false; fitView(); } else zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.v2z === '1' ? 1.3 : 1 / 1.3); draw(); return; }
  if (d.v2go) return void go(d.v2go);
}
export async function open() {
  css(); if (root) return; root = document.createElement('div'); root.id = 'v2'; if (W() === 2) root.className = 'w2'; document.body.appendChild(root);
  root.addEventListener('click', onClick); tab = 'map'; sel = null; msg = ''; view.fit = false; render();
  if (!raf) raf = requestAnimationFrame(loop);
  try {
    await call('state'); render();
    heroXp(0); oldPrize(); weekStory();
    if (st && st.me) { if (!curSq()) regAt = 0; await syncSquad(); if (A.todayClosed && A.todayClosed() && !st.me.ap.today) await call('today', {}); const s = curSq(); if (s) mySq = s.id; render(); await resultCheck(); render(); }
  } catch (e) { msg = '❗ Нет связи с долиной'; render(); }
  clearInterval(pollT); pollT = setInterval(() => { if (!root || busy || battle || document.hidden) return; call('state').then(() => { if (tab === 'map') refreshCard(); else render(); }).catch(() => {}); }, 20000);
  A.stats && A.stats('valley2', { k: 'open' });
}
function weekStory() {   // tikhon_chronicler.py: Tikhon writes the valley's Monday story into the chronicle, one line a week
  if (!st || !st.me || !st.boss || !window.tikhonWeek) return; const k = 'magicschool.v2story'; if (LS(k) === String(st.week)) return;
  try { localStorage.setItem(k, String(st.week)); } catch (e) { /* private */ }
  const a = alOf(st.me.al); window.tikhonWeek(`Новая неделя в долине: в центре проснулся ${st.boss.n} ${st.boss.e}. ${a ? `${a.emo} ${a.name}` : 'Наш альянс'} начинает из замка на краю — тайные задания уже ждут.`);
}
function oldPrize() {   // the old valley stays loaded only to pay its last weekly place (its own idempotent key), once per week per device
  const k = 'magicschool.v1prize', wk = String(E.weekKey(Date.now())); if (LS(k) === wk || !window.__valley || !window.__valley.prize) return;
  try { localStorage.setItem(k, wk); } catch (e) { /* private */ } window.__valley.prize().catch(() => {});
}
export function close() { clearInterval(pollT); if (root) root.remove(); root = null; cv = null; battle = null; BG = null; sortedOf = sqOf = null; const b = document.getElementById('v2-battle'); if (b) b.remove(); }
export function initValley2(api) {
  A = api;
  window.addEventListener('resize', () => { if (root && cv) draw(); });
  // behind the flag the ✨ «Долина» tile and the alliance button open this screen (capture phase: the old valley's listener never fires)
  document.addEventListener('click', (e) => { if (!flagOn()) return; const t = e.target.closest && e.target.closest('[data-valley]'); if (!t) return; e.stopPropagation(); e.preventDefault(); open(); }, true);
  window.__valley2 = { open, close, flagOn, mockOn, get st() { return st; }, pick: (q, r) => { const c = cellAt(q, r); if (c) return pick(c); }, go: (op) => go(op), sq: (id) => { mySq = id; render(); }, tab: (t) => { tab = t; render(); }, view,
    zoom: (z, q, r) => { view.z = z; const p0 = { x: S0 * z * Math.sqrt(3) * (q + r / 2), y: S0 * z * 1.5 * r }; view.x = cv.clientWidth / 2 - p0.x; view.y = cv.clientHeight / 2 - p0.y; view.fit = true; draw(); },
    mock: { at: (t) => { mockLoad(); M.shift = t - Date.now(); mockSave(); }, advance: (h) => { mockLoad(); M.shift += h * 3600000; mockSave(); return call('state').then(() => { if (root) render(); return st; }); }, reset: () => { M.H = null; M.shift = 0; try { localStorage.removeItem(M.key); } catch (e) { /* */ } }, hub: () => M.H, now: () => mockNow() } };   // test hook
  return { open, close, isOpen: () => !!root, flagOn };
}
