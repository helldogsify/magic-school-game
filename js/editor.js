// Room editor (Maria 2026-11-24: «приложение редактор ... подвинуть куда я хочу, покрасить стены и тд. И потом кнопку сохранить
// (но она не опубликовывается) и опубликовать, тогда сборка готова будет»). Loaded by game.js only with ?edit; the layout data
// and how the game applies it: game.js «room editor layer». Phone + desktop: one finger / mouse drags an item, elsewhere it pans.
// Save = draft on the PC (editor API through lazy.vazuza.love) + this device; Publish = the PC commits layouts/layouts.json as a build.
export function initEditor(A) {
  const E = A.EDIT, $ = (s, r = document) => r.querySelector(s);
  const RMS = [{ id: 'REC', name: 'Приёмная', emoji: '🛎️' }, { id: 'DORM', name: 'Спальня', emoji: '🛏️' }, { id: 'DORM2', name: 'Спальня 2', emoji: '🛏️' }, { id: 'CANT', name: 'Столовая', emoji: '🍽️' }, { id: 'LIB', name: 'Библиотека', emoji: '📚' }, { id: 'TOWER', name: 'Башня мастеров', emoji: '🏰' }, { id: 'TOWER_L', slot: 'TOWER', name: 'Башня мастеров (длинная)', emoji: '🏰' }, ...(A.pond && A.pond() ? [{ id: 'POND', name: 'Пруд', emoji: '🎣' }] : [])], RM = RMS.find((r) => r.id === E.cls);   /* rooms that are not classes */
  const ci = RM ? -1 : Math.max(0, A.CLASSES.findIndex((c) => c.id === E.cls)), C = RM || A.CLASSES[ci], cid = C.id, s = RM ? (RM.id === 'POND' ? A.pond() : A.SLOTS[RM.slot || RM.id]) : A.slotOf(ci);   /* the pond is not a slot: its box (game.js pondBox) */
  const KEY_LS = 'magicschool.editor.key', DRAFT_LS = 'magicschool.editor.draft';
  const q = new URLSearchParams(location.search); if (q.get('key')) { localStorage.setItem(KEY_LS, q.get('key')); const u = new URL(location.href); u.searchParams.delete('key'); history.replaceState(null, '', u); }   // the key stays on this device, not in the address
  const key = localStorage.getItem(KEY_LS) || '';
  const api = (p) => `${E.api}/${p}?key=${encodeURIComponent(key)}`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let deskAll = false, tab = 'items', L = { v: 1, rooms: {} }, sel = null, undo = [], dirty = false, night = false;
  const room = () => (L.rooms[cid] ||= {});
  const apply = (walls) => { if (walls) A.setLayout(L); else if (A.layout !== L) A.setLayout(L); dirty = true; localStorage.setItem(DRAFT_LS, JSON.stringify({ ...L, t: Date.now() })); status(''); };
  const snap = () => { undo.push(JSON.stringify(L)); if (undo.length > 60) undo.shift(); };
  const tidy = () => { const R = room(); if (R.desks) for (const k of Object.keys(R.desks)) { const o = R.desks[k]; if (!o.dx && !o.dy && !o.flip && !(o.k && o.k !== 1)) delete R.desks[k]; } for (const k of ['items', 'walls', 'desks', 'allTint', 'deskTint']) if (R[k] && !Object.keys(R[k]).length) delete R[k]; if (R.add && !R.add.length) delete R.add; if (!Object.keys(R).length) delete L.rooms[cid]; };

  // ---------- UI ----------
  document.body.classList.add('editing');
  const css = document.createElement('style'); css.textContent = `
body.editing #view::after { content: ''; display: block; height: 55vh; }   /* room to scroll the map's bottom out from under the editor's panel (her «Не дает вниз сделать») */
body.editing #top, body.editing #quest, body.editing #insp, body.editing .mbtn, body.editing #menugrid, body.editing #menudim, body.editing #sheet-wrap, body.editing #fx, body.editing .ipill, body.editing #tour { display: none !important; }
#ed-top, #ed-bot, #ed-sel { position: fixed; left: 0; right: 0; z-index: 90; font: 600 14px ui-rounded, system-ui, -apple-system, sans-serif; color: #4a2f7a; }
#ed-top { top: 0; padding: calc(env(safe-area-inset-top) + 6px) 8px 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; background: #fffaf2ee; box-shadow: 0 2px 10px #3a2f4a33; }
#ed-top select, #ed-top button, #ed-sel button, #ed-bot button { font: inherit; border: 0; border-radius: 12px; padding: 7px 10px; background: #efe6ff; color: #4a2f7a; }
#ed-top .on { background: #7b5cd6; color: #fff; }
#ed-top .grow { flex: 1; }
#ed-top .save { background: #d8f2dc; } #ed-top .pub { background: #7b5cd6; color: #fff; }
#ed-st { font-size: 12px; color: #8a7a99; width: 100%; }
#ed-bot { bottom: 0; background: #fffaf2f2; box-shadow: 0 -2px 10px #3a2f4a33; padding: 6px 8px calc(env(safe-area-inset-bottom) + 6px); }
#ed-tabs, #ed-groups { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; }
#ed-tabs .on, #ed-groups .on { background: #7b5cd6; color: #fff; }
#ed-groups button { font-size: 12px; padding: 5px 9px; white-space: nowrap; }
#ed-grid { display: flex; gap: 6px; overflow-x: auto; height: 84px; }
#ed-grid img { height: 76px; min-width: 40px; max-width: 110px; object-fit: contain; background: #f3ecfa; border-radius: 10px; padding: 3px; flex: none; }
#ed-layers { display: none; max-height: 170px; overflow-y: auto; }
#ed-layers .lr { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 6px; }
#ed-layers .li { width: 58px; height: 58px; border-radius: 10px; background: #f3ecfa; border: 2px solid transparent; padding: 2px; display: flex; align-items: center; justify-content: center; }
#ed-layers .li img { max-width: 100%; max-height: 100%; }
#ed-layers .li.on { border-color: #7b5cd6; background: #e4d8ff; }
#ed-layers .li.off { opacity: .35; }
#ed-layers h4 { margin: 4px 0; font-size: 13px; }
#ed-wall { display: none; max-height: 170px; overflow-y: auto; }
#ed-wall h4 { margin: 4px 0; font-size: 13px; }
#ed-wall .row { display: flex; gap: 6px; overflow-x: auto; align-items: center; padding-bottom: 4px; }
#ed-wall .sw { width: 30px; height: 30px; border-radius: 50%; flex: none; border: 2px solid #fff; box-shadow: 0 0 0 1px #c9b8e8; padding: 0; }
#ed-wall .sw.on { box-shadow: 0 0 0 3px #7b5cd6; }
#ed-wall .tx { width: 64px; height: 44px; object-fit: cover; border-radius: 8px; flex: none; border: 2px solid transparent; }
#ed-wall .tx.on { border-color: #7b5cd6; }
#ed-wall label { font-size: 12px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
#ed-col { position: fixed; left: 8px; right: 8px; z-index: 91; display: none; background: #fffaf2f5; border-radius: 16px; box-shadow: 0 4px 16px #3a2f4a44; padding: 8px 10px; font: 600 13px ui-rounded, system-ui, -apple-system, sans-serif; color: #4a2f7a; max-height: 34vh; overflow-y: auto; }
#ed-col .row:first-of-type { flex-wrap: nowrap; }
#ed-col { left: 0; right: 0; border-radius: 16px 16px 0 0; padding-bottom: calc(env(safe-area-inset-bottom) + 8px); }
.edt .row { display: flex; gap: 6px; overflow-x: auto; align-items: center; padding-bottom: 6px; flex-wrap: wrap; }
.edt .tsw { width: 24px; height: 24px; border-radius: 50%; flex: none; border: 2px solid #fff; box-shadow: 0 0 0 1px #c9b8e8; padding: 0; }
.edt .tsw.on { box-shadow: 0 0 0 3px #7b5cd6; }
.edt label { font-size: 12px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.edt button.w { font: inherit; border: 0; border-radius: 12px; padding: 6px 10px; background: #efe6ff; color: #4a2f7a; }
#ed-sel { bottom: 150px; display: none; justify-content: center; gap: 6px; flex-wrap: wrap; padding: 0 8px; pointer-events: none; }
#ed-sel button { pointer-events: auto; box-shadow: 0 2px 8px #3a2f4a44; background: #fffaf2; min-width: 42px; }
#ed-ov { position: fixed; pointer-events: none; z-index: 80; }
@media (min-width: 900px) { #ed-grid { height: 104px; } #ed-grid img { height: 96px; } #ed-sel { bottom: 175px; } }`;
  document.head.appendChild(css);
  const names = A.CLASSES.filter((c) => !c.w2 && c.id).map((c) => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${c.emoji || ''} ${c.name}</option>`).join('') + RMS.map((c) => `<option value="${c.id}"${c.id === cid ? ' selected' : ''}>${c.emoji} ${c.name}</option>`).join('');
  const top = document.createElement('div'); top.id = 'ed-top'; top.innerHTML = `
<select id="ed-cls" aria-label="Класс">${names}</select>
<span><button data-size="1">Мал.</button> <button data-size="2">Сред.</button> <button data-size="3">Бол.</button></span>
<button id="ed-stage" title="Уровень предметов класса">Ур. ${E.stage}</button>
<button id="ed-day">☀️ День</button>
<button id="ed-undo">↶</button><button id="ed-go" style="display:none;background:#ffe3a8"></button>
<span class="grow"></span>
<button id="ed-save" class="save">💾 Сохранить</button><button id="ed-pub" class="pub">🚀 Опубликовать</button>
<div id="ed-st"></div>`;
  document.body.appendChild(top);
  top.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', +b.dataset.size === E.size));
  const bot = document.createElement('div'); bot.id = 'ed-bot'; bot.innerHTML = `
<div id="ed-tabs"><button data-tab="items" class="on">🪑 Предметы</button><button data-tab="layers">📚 Слои</button><button data-tab="game">🎮 Игровые</button><button data-tab="wall">🎨 Стены и пол</button><button id="ed-hidden" style="display:none"></button></div>
<div id="ed-items"><div id="ed-groups"></div><div id="ed-grid"></div></div>
<div id="ed-layers"></div><div id="ed-col" class="edt"></div><div id="ed-game" style="display:none;padding:4px 2px 8px;font-size:13px;line-height:1.4">🎮 Места учеников: парты, котлы, кафедры. Коснись места, чтобы выбрать, потом тяни его. Ученики сядут туда, куда ты поставишь. Кнопка «🔗 Все вместе» двигает сразу все места. Убрать место нельзя — ученикам будет некуда сесть.</div><div id="ed-wall"></div>`;
  document.body.appendChild(bot); document.body.appendChild($('#ed-col'));   // the colour panel lives outside the bottom panel (it replaces it while open)
  const selBar = document.createElement('div'); selBar.id = 'ed-sel'; document.body.appendChild(selBar);
  const ov = document.createElement('canvas'); ov.id = 'ed-ov'; document.body.appendChild(ov); const oc = ov.getContext('2d');
  function status(t) { $('#ed-st').textContent = t || (dirty ? 'Есть несохранённые изменения' : ''); }
  const reload = (o) => { const u = new URL(location.href); for (const [k, v] of Object.entries(o)) u.searchParams.set(k, v); u.searchParams.delete('key'); localStorage.setItem(DRAFT_LS, JSON.stringify({ ...L, t: Date.now() })); location.href = u.toString(); };
  $('#ed-cls').onchange = (e) => reload({ c: e.target.value });
  top.querySelectorAll('[data-size]').forEach((b) => (b.onclick = () => reload({ size: b.dataset.size })));
  $('#ed-stage').onclick = () => { const st = [1, 10, 25, 40], n = st[(st.indexOf(E.stage) + 1) % st.length] ?? 40; reload({ stage: n }); };
  $('#ed-day').onclick = () => { night = !night; window.__hour = night ? 23 : 13; $('#ed-day').textContent = night ? '🌙 Ночь' : '☀️ День'; };
  window.__hour = 13;
  $('#ed-undo').onclick = () => { if (!undo.length) return; L = JSON.parse(undo.pop()); sel = null; A.setLayout(L); dirty = true; showSel(); };
  bot.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { bot.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); tab = b.dataset.tab; $('#ed-items').style.display = tab === 'items' ? '' : 'none'; $('#ed-wall').style.display = tab === 'wall' ? 'block' : 'none'; $('#ed-layers').style.display = tab === 'layers' ? 'block' : 'none'; $('#ed-game').style.display = tab === 'game' ? 'block' : 'none'; sel = null; showSel(); if (tab === 'wall') wallUi(); if (tab === 'layers') layersUi(); selBar.style.bottom = bot.offsetHeight + 8 + 'px'; }));

  // ---------- save / publish ----------
  async function call(p, body) {
    const r = await fetch(api(p), body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j;
  }
  $('#ed-save').onclick = async () => { tidy(); status('Сохраняю…'); try { await call('draft', { ...L, t: Date.now() }); dirty = false; status('Сохранено ✓ (игроки этого пока не видят)'); } catch (e) { status('Не получилось сохранить на компьютер: ' + e.message + '. На этом устройстве черновик сохранён.'); } };
  $('#ed-pub').onclick = async () => {
    tidy(); if (!confirm('Опубликовать расстановку? Игроки увидят её после перезапуска игры.')) return;
    status('Публикую… это займёт до минуты'); try { await call('draft', { ...L, t: Date.now() }); const j = await call('publish', {}); dirty = false; status(`Опубликовано ✓ Сборка ${j.build || ''}. Игрокам — закрыть игру и открыть снова.`); } catch (e) { status('Не получилось опубликовать: ' + e.message); } };

  // ---------- load the draft: the newer of this device and the PC, else the published layout ----------
  (async () => {
    let loc = null; try { loc = JSON.parse(localStorage.getItem(DRAFT_LS) || 'null'); } catch (e) { loc = null; }
    let srv = null; try { srv = await call('draft'); } catch (e) { srv = null; }
    let pub = null; try { const r = await fetch('layouts/layouts.json?t=' + Date.now()); pub = r.ok ? await r.json() : null; } catch (e) { pub = null; }
    const pick = [loc, srv && srv.rooms ? srv : null].filter(Boolean).sort((a, b) => (b.t || 0) - (a.t || 0))[0] || pub;
    if (pick && pick.rooms) { L = { v: 1, rooms: pick.rooms, t: pick.t }; A.setLayout(L); }
    status(srv ? '' : key ? 'Компьютер не отвечает — сохраняю только на этом устройстве' : 'Нет ключа редактора: сохранять можно только на этом устройстве');
  })();

  // ---------- camera ----------
  const mid = { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
  const look = () => {   // the room's middle (walls included) in the free space between the top bar and the palette
    A.setZoom(innerWidth >= 900 ? 2.6 : 2.0, 0, 0, 0, 0); const c = A.P(mid.x, mid.y), sc = A.scroller, tb = $('#ed-top').offsetHeight, bb = $('#ed-bot').offsetHeight;
    sc.scrollLeft = c.x * A.scale - sc.clientWidth / 2; sc.scrollTop = (c.y - A.TALL_H() * 0.5) * A.scale - (tb + (sc.clientHeight - bb - tb) / 2); };
  const waitBoot = () => { if (document.getElementById('boot')) return setTimeout(waitBoot, 150); look(); setTimeout(look, 700); };   // the game puts the camera at the gate when it starts
  waitBoot();

  // ---------- geometry ----------
  const stageRect = () => A.canvas.getBoundingClientRect();
  const toClient = (wx, wy) => { const r = stageRect(); return { x: wx * A.scale - A.scroller.scrollLeft + r.left, y: wy * A.scale - A.scroller.scrollTop + r.top }; };
  const toWorld = (cx, cy) => { const r = stageRect(); return { x: (cx - r.left + A.scroller.scrollLeft) / A.scale, y: (cy - r.top + A.scroller.scrollTop) / A.scale }; };
  const tileDelta = (dX, dY) => ({ dx: (dX / A.HW + dY / A.HH) / 2, dy: (dY / A.HH - dX / A.HW) / 2 });   // world px -> tiles (inverse of P)
  const inRoom = (x, y) => ({ x, y });   // no limits (her «ставить куда хочу без ограничений»)
  const vis = (e) => (tab === 'game') === (e.kind === 'desk');   // the students' places only in the «Игровые» tab, the rest only outside it
  const myEnts = () => A.entries().filter((e) => e.cid === cid && e.bb);
  const myWalls = () => A.walls(cid).filter((w) => w.bb && !w.hide);
  function hitAll(cx, cy) {   // everything under the finger, smallest first: a small hidden thing is usually the one she is after
    const w = toWorld(cx, cy), pad = 3 / A.scale + 1, out = [], inb = (b, p) => w.x >= b.x0 - p && w.x <= b.x1 + p && w.y >= b.y0 - p && w.y <= b.y1 + p;
    for (const e of myEnts()) if (vis(e) && inb(e.bb, pad)) out.push({ t: e.kind, key: e.key, e });
    if (tab !== 'game') for (const ww of myWalls()) if (inb(ww.bb, 0)) out.push({ t: 'wall', key: ww.key, e: ww });
    const area = (h) => (h.e.bb.x1 - h.e.bb.x0) * (h.e.bb.y1 - h.e.bb.y0);
    return out.sort((p, q) => area(p) - area(q));
  }
  const hit = (cx, cy) => hitAll(cx, cy)[0] || null;
  const onSel = (cx, cy) => (sel ? hitAll(cx, cy).find((h) => h.key === sel.key) || null : null);
  const curEnt = () => { if (!sel) return null; if (sel.t === 'wall') return myWalls().find((w) => w.key === sel.key) || null; return myEnts().find((e) => e.key === sel.key) || null; };

  // ---------- drag ----------
  let drag = null;
  function start(cx, cy, h) {   // only the SELECTED item is dragged (her «из под пальца при свайпе ... ускользают»)
    h = h || onSel(cx, cy); if (!h) return false;
    snap(); const R = room(), w0 = toWorld(cx, cy);
    if (h.t === 'item') { R.items ||= {}; let o = R.items[h.key]; if (!o) { const m = A.P(h.e.x, h.e.y), b = h.e.bb; o = R.items[h.key] = { dx: 0, dy: 0, px: Math.round(((b.x0 + b.x1) / 2 - m.x) * 10) / 10, py: Math.round((b.y1 - m.y) * 10) / 10 }; } drag = { h, w0, o0: { ...o } }; }
    else if (h.t === 'add') { const a = R.add[h.e.j], p = A.layPos(a, s); drag = { h, w0, a, p0: p, lift0: a.lift || 0 }; }
    else if (h.t === 'desk') { R.desks ||= {}; const ks = deskAll ? myEnts().filter((e) => e.kind === 'desk').map((e) => e.d) : [h.e.d]; drag = { h, w0, set: ks.map((k) => [k, { ...(R.desks[k] || {}) }]) }; }
    else { R.walls ||= {}; const o = R.walls[h.key] ||= {}; drag = { h, w0, o0: { ...o } }; }
    showSel(); return true;
  }
  function move(cx, cy) {
    if (!drag) return; const w = toWorld(cx, cy), dX = w.x - drag.w0.x, dY = w.y - drag.w0.y, R = room();
    if (drag.h.t === 'desk') { const d = tileDelta(dX, dY); for (const [k, o0] of drag.set) R.desks[k] = { ...o0, dx: Math.round(((o0.dx || 0) + d.dx) * 100) / 100, dy: Math.round(((o0.dy || 0) + d.dy) * 100) / 100 }; apply(false); return; }
    if (drag.h.t === 'item') { const o = R.items[drag.h.key], d = tileDelta(dX, dY), e = drag.h.e, p = inRoom(e.x + (drag.o0.dx || 0) + d.dx, e.y + (drag.o0.dy || 0) + d.dy); o.dx = Math.round((p.x - e.x) * 100) / 100; o.dy = Math.round((p.y - e.y) * 100) / 100; apply(false); }
    else if (drag.h.t === 'add') { const a = drag.a;
      if (a.wall) { const t = a.wall === 'x0' ? -dX / A.HW : dX / A.HW, vy = dY - t * A.HH; a.lift = Math.round(Math.max(0, Math.min(A.TALL_H() * 1.1, drag.lift0 - vy))); const p = inRoom(a.wall === 'y0' ? drag.p0.x + t : drag.p0.x, a.wall === 'x0' ? drag.p0.y + t : drag.p0.y); anchor(a, p); }
      else { const d = tileDelta(dX, dY); anchor(a, inRoom(drag.p0.x + d.dx, drag.p0.y + d.dy)); }
      apply(false); }
    else { const o = R.walls[drag.h.key], side = drag.h.e.side, t = side === 'x0' ? -dX / A.HW : dX / A.HW, vy = dY - t * A.HH;
      o.dt = Math.round(((drag.o0.dt || 0) + t) * 100) / 100; o.dlo = Math.round(((drag.o0.dlo || 0) - vy / A.TALL_H()) * 100) / 100; wallApplyThrottled(); }
  }
  let wq = 0; const wallApplyThrottled = () => { if (wq) return; wq = requestAnimationFrame(() => { wq = 0; apply(true); }); };
  function anchor(a, p) { a.ax = p.x - s.x0 <= s.x1 - p.x ? 'x0' : 'x1'; a.ay = p.y - s.y0 <= s.y1 - p.y ? 'y0' : 'y1'; a.x = Math.round((a.ax === 'x0' ? p.x - s.x0 : s.x1 - p.x) * 100) / 100; a.y = Math.round((a.ay === 'y0' ? p.y - s.y0 : s.y1 - p.y) * 100) / 100; }
  const stage = $('#stage');
  let down = null;
  // the first touch only selects; a swipe that does not start on the selected item pans the room; a second tap on the same spot
  // picks the next thing under the finger
  stage.addEventListener('pointerdown', (e) => { if (e.target.closest('#ed-top, #ed-bot, #ed-sel')) return;
    if (!e.isPrimary) { if (down) down.multi = true; return; }
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, h: onSel(e.clientX, e.clientY) };
    if (down.h) { e.stopPropagation(); e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (er) { /* */ } } }, true);
  stage.addEventListener('pointermove', (e) => { if (!down || e.pointerId !== down.id) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
    if (down.h && !down.multi) { e.stopPropagation(); e.preventDefault(); if (down.moved && !drag) start(down.x, down.y, down.h); if (drag) move(e.clientX, e.clientY); } }, true);
  function tap(cx, cy) {
    const hs = hitAll(cx, cy); if (!hs.length) { sel = null; showSel(); status(''); return; }
    let k = 0; if (sel) { const i = hs.findIndex((h) => h.key === sel.key); if (i >= 0) k = (i + 1) % hs.length; }
    sel = { t: hs[k].t, key: hs[k].key }; showSel();
    status(hs.length > 1 ? `Здесь ${hs.length} предмета друг на друге — коснись ещё раз, чтобы выбрать следующий` : '');
  }
  const end = (e) => { if (drag) { e.stopPropagation(); drag = null; tidy(); showSel(); } else if (down && !down.moved && !down.multi && e.type === 'pointerup' && e.pointerId === down.id) tap(down.x, down.y); if (!down || e.pointerId === down.id) down = null; };
  stage.addEventListener('pointerup', end, true); stage.addEventListener('pointercancel', end, true);
  stage.addEventListener('touchstart', (e) => { if (e.touches.length === 1 && onSel(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault(); }, { capture: true, passive: false });   // the page must not scroll under the selected item
  stage.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { capture: true, passive: false });
  stage.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, true);   // the game must not open its room windows

  // ---------- the selection bar ----------
  function showSel() {
    const R = room(); selBar.innerHTML = ''; if (!sel) { selBar.style.display = 'none'; $('#ed-col').style.display = 'none'; hiddenBtn(); if (tab === 'layers') layersUi(); return; }
    const b = (t, f, title) => { const x = document.createElement('button'); x.textContent = t; if (title) x.title = title; x.onclick = () => { snap(); f(); tidy(); showSel(); }; selBar.appendChild(x); };
    if (sel.t === 'item') { const o = () => (R.items ||= {})[sel.key] ||= { dx: 0, dy: 0, ...pivotOf(sel.key) };
      b('➖', () => { o().k = Math.round(Math.max(0.3, (o().k || 1) / 1.1) * 100) / 100; apply(false); }, 'Меньше'); b('➕', () => { o().k = Math.round(Math.min(3, (o().k || 1) * 1.1) * 100) / 100; apply(false); }, 'Больше');
      b('⇋ Развернуть', () => { o().flip = !o().flip || undefined; apply(false); }, 'Повернуть другим боком');
      b('⬆ Выше', () => { o().lift = (o().lift || 0) + 6; apply(false); }, 'Поднять'); b('⬇ Ниже', () => { o().lift = (o().lift || 0) - 6 || undefined; apply(false); }, 'Опустить');
      b('↶', () => { o().r = ((o().r || 0) - 5) % 360 || undefined; apply(false); }, 'Повернуть влево'); b('↷', () => { o().r = ((o().r || 0) + 5) % 360 || undefined; apply(false); }, 'Повернуть вправо');
      b('⟋', () => { o().sk = Math.round(((o().sk || 0) - 0.05) * 100) / 100 || undefined; apply(false); }, 'Скосить, как левая стена'); b('⟍', () => { o().sk = Math.round(((o().sk || 0) + 0.05) * 100) / 100 || undefined; apply(false); }, 'Скосить, как правая стена');
      b('⏫ Вперёд', () => { o().z = (o().z || 0) + 1; apply(false); }, 'Поверх соседей'); b('⏬ Назад', () => { o().z = (o().z || 0) - 1 || undefined; apply(false); }, 'За соседей');
      b('🗑', () => { o().hide = 1; sel = null; apply(false); }, 'Убрать');
      b('Как было', () => { delete R.items[sel.key]; apply(false); }, 'Вернуть как было'); }
    else if (sel.t === 'add') { const j = +sel.key.split('#')[1], a = R.add && R.add[j]; if (!a) { sel = null; return showSel(); }
      b('➖', () => { a.h = Math.max(8, Math.round((a.h || 40) / 1.1)); apply(false); }, 'Меньше'); b('➕', () => { a.h = Math.min(400, Math.round((a.h || 40) * 1.1)); apply(false); }, 'Больше');
      b('⇋ Развернуть', () => { a.flip = !a.flip || undefined; apply(false); }, 'Повернуть другим боком');
      b('↶', () => { a.rot = ((a.rot || 0) - 5) % 360 || undefined; apply(false); }, 'Повернуть влево'); b('↷', () => { a.rot = ((a.rot || 0) + 5) % 360 || undefined; apply(false); }, 'Повернуть вправо');
      b('⟋', () => { a.sk = Math.round(((a.sk || 0) - 0.05) * 100) / 100 || undefined; apply(false); }, 'Скосить, как левая стена'); b('⟍', () => { a.sk = Math.round(((a.sk || 0) + 0.05) * 100) / 100 || undefined; apply(false); }, 'Скосить, как правая стена');
      b('⏫ Вперёд', () => { a.bias = (a.bias || 0) + 1; apply(false); }, 'Поверх соседей'); b('⏬ Назад', () => { a.bias = (a.bias || 0) - 1 || undefined; apply(false); }, 'За соседей');
      b(a.flat ? '▯ Поставить' : '▭ Положить', () => { a.flat = a.flat ? undefined : 1; if (a.flat) { delete a.wall; a.lift = 0; } apply(false); }, a.flat ? 'Поставить стоя' : 'Положить на пол, как ковёр');
      b('⬆', () => { a.lift = Math.round((a.lift || 0) + 6); apply(false); }, 'Выше'); b('⬇', () => { a.lift = Math.max(0, Math.round((a.lift || 0) - 6)); apply(false); }, 'Ниже');
      b(a.wall ? '⬇ На пол' : '🖼 На стену', () => { const p = A.layPos(a, s); if (a.wall) { delete a.wall; a.lift = 0; } else { a.wall = p.x - s.x0 < p.y - s.y0 ? 'x0' : 'y0'; a.lift = Math.round(A.TALL_H() * 0.55); } apply(false); });
      b('⧉', () => { const c = clone(a); c.x = (c.x || 0) + 0.6; R.add.push(c); sel = { t: 'add', key: 'add#' + (R.add.length - 1) }; apply(false); }, 'Копия');
      b('🗑', () => { R.add.splice(j, 1); sel = null; apply(false); }, 'Убрать'); }
    else if (sel.t === 'desk') { const d = +sel.key.split('#')[1], o = () => (R.desks ||= {})[d] ||= {};
      const ks = () => (deskAll ? myEnts().filter((e) => e.kind === 'desk').map((e) => e.d) : [d]), sc = (f) => { for (const k of ks()) { const q = (R.desks ||= {})[k] ||= {}; q.k = Math.round(Math.min(3, Math.max(0.3, (q.k || 1) * f)) * 100) / 100; if (q.k === 1) delete q.k; } apply(false); };
      b('➖', () => sc(1 / 1.1), deskAll ? 'Все места меньше' : 'Меньше'); b('➕', () => sc(1.1), deskAll ? 'Все места больше' : 'Больше');
      b('⇋ Развернуть', () => { o().flip = !o().flip || undefined; apply(false); }, 'Повернуть другим боком');
      b(deskAll ? '🔗 Все вместе: да' : '🔗 Все вместе: нет', () => { deskAll = !deskAll; }, 'Тянуть все места сразу');
      b('Как было', () => { if (R.desks) delete R.desks[d]; apply(false); }, 'Вернуть место'); b('Все как было', () => { delete R.desks; apply(false); }, 'Вернуть все места'); }
    else { const o = () => (R.walls ||= {})[sel.key] ||= {};
      b('🗑', () => { o().hide = 1; sel = null; apply(true); }, 'Убрать со стены'); b('Как было', () => { delete R.walls[sel.key]; apply(true); }, 'Вернуть как было'); }
    b(colOpen ? '🎨 Цвет ▾' : '🎨 Цвет', () => { colOpen = !colOpen; }, 'Перекрасить');
    if (tab === 'layers') layersUi();
    selBar.style.display = 'flex'; selBar.style.bottom = bot.offsetHeight + 8 + 'px'; hiddenBtn(); colPanel();
  }
  function pivotOf(k) { const e = myEnts().find((x) => x.key === k); if (!e) return { px: 0, py: 0 }; const m = A.P(e.x, e.y); return { px: Math.round(((e.bb.x0 + e.bb.x1) / 2 - m.x) * 10) / 10, py: Math.round((e.bb.y1 - m.y) * 10) / 10 }; }
  function hiddenBtn() {   // «Вернуть убранные (N)»
    const R = room(), hi = Object.keys(R.items || {}).filter((k) => R.items[k].hide).length + Object.keys(R.walls || {}).filter((k) => R.walls[k].hide).length, hb = $('#ed-hidden');
    hb.style.display = hi ? '' : 'none'; hb.textContent = `↩ Вернуть убранные (${hi})`;
    hb.onclick = () => { snap(); for (const k of Object.keys(R.items || {})) if (R.items[k].hide) delete R.items[k].hide; for (const k of Object.keys(R.walls || {})) if (R.walls[k].hide) delete R.walls[k].hide; tidy(); apply(true); hiddenBtn(); };
  }

  // ---------- layers: every thing of the room, front first; a tap selects it even when it is hidden behind others ----------
  function layersUi() {
    const all = A.entries().filter((e) => e.cid === cid && e.key && e.kind !== 'desk'), seen = new Set(), list = [];
    for (let k = all.length - 1; k >= 0; k--) { const e = all[k]; if (!seen.has(e.key)) { seen.add(e.key); list.push(e); } }
    const row = (arr, kind) => arr.map((e) => `<button class="li${sel && sel.key === e.key ? ' on' : ''}${e.hidden || e.hide ? ' off' : ''}" data-k="${e.key}" data-t="${kind || e.kind}" data-h="${e.hidden || e.hide ? 1 : ''}"><img src="${A.thumb(e.n, cid)}" alt=""></button>`).join('');
    $('#ed-layers').innerHTML = `<h4>В комнате (первые — ближние к тебе, бледные — убранные)</h4><div class="lr">${row(list)}</div><h4>На стенах</h4><div class="lr">${row(A.walls(cid), 'wall')}</div>`;
    $('#ed-layers').querySelectorAll('.li').forEach((b) => (b.onclick = () => { const R = room();
      if (b.dataset.h) { snap(); const o = (b.dataset.t === 'wall' ? R.walls : R.items) || {}; if (o[b.dataset.k]) delete o[b.dataset.k].hide; tidy(); apply(b.dataset.t === 'wall'); }
      sel = { t: b.dataset.t, key: b.dataset.k }; showSel(); }));
  }

  // ---------- palette: every sprite of the game ----------
  let groups = [], gsel = 0;
  fetch('layouts/sprites.json?t=' + Date.now()).then((r) => r.json()).then((j) => { groups = j.groups || []; const i0 = groups.findIndex((g) => g.id === 'items'); gsel = i0 >= 0 ? i0 : 0; drawGroups(); }).catch(() => { $('#ed-grid').textContent = 'Список предметов не загрузился'; });
  function drawGroups() {
    $('#ed-groups').innerHTML = groups.map((g, k) => `<button data-g="${k}" class="${k === gsel ? 'on' : ''}">${g.name} (${g.list.length})</button>`).join('');
    $('#ed-groups').querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { gsel = +b.dataset.g; drawGroups(); }));
    const g = groups[gsel]; $('#ed-grid').innerHTML = g ? g.list.map((n) => `<img loading="lazy" data-src="${g.id}/${n}" src="assets/parts/${g.id}/${n}.webp" alt="">`).join('') : '';
    $('#ed-grid').querySelectorAll('img').forEach((im) => (im.onclick = () => addSprite(im.dataset.src, im)));
  }
  function addSprite(src, im) {
    snap(); const R = room(); R.add ||= []; const a = { src, h: Math.round(Math.max(24, Math.min(90, (im.naturalHeight || 300) / 5))) };
    if (/^rugs\/|(^|[/_])(rug|carpet|mat)(_|$)/.test(src)) { a.flat = 1; a.h = Math.round(3.4 * A.HW * Math.SQRT2 * (im.naturalHeight || 1) / (im.naturalWidth || 1)); }   // rugs lie on the floor, ~3.4 tiles wide
    look();   // the new thing appears in THIS class: bring it on screen
    anchor(a, inRoom(mid.x, mid.y)); R.add.push(a); sel = { t: 'add', key: 'add#' + (R.add.length - 1) }; apply(false); showSel();
  }

  // ---------- walls and floor ----------
  const COLS = ['#f4d9e8', '#e9d6ff', '#cfe3ff', '#cdeedd', '#fff1c7', '#ffd9b8', '#f2b8c6', '#b9a3e8', '#8fb8e8', '#9fd6b3', '#e8c27a', '#b98457', '#8a6a5a', '#6b5a8a', '#3d4a6b', '#ffffff'];
  // ---------- colour of things (her «остальные все предметы тоже можно было так перекрашивать»): hue, strength, light, saturation, contrast ----------
  let colOpen = false, colFor = '';
  const tintBlock = (o) => `<div class="row"><button class="tsw${!o.col ? ' on' : ''}" data-tcol="" title="Без краски" style="background:linear-gradient(135deg,#fff 45%,#e05 50%,#fff 55%)"></button>${COLS.map((c) => `<button class="tsw${o.col === c ? ' on' : ''}" data-tcol="${c}" style="background:${c}"></button>`).join('')}<input type="color" data-tcolp value="${o.col || '#e9d6ff'}" title="Свой цвет"></div>
<div class="row"><label>Сила цвета <input type="range" min="0" max="100" value="${Math.round((o.amt ?? 0.6) * 100)}" data-tk="amt"></label><label>Светлее / темнее <input type="range" min="-70" max="70" value="${Math.round((o.bri || 0) * 100)}" data-tk="bri"></label></div>
<div class="row"><label>Насыщенность <input type="range" min="-100" max="150" value="${Math.round((o.sat || 0) * 100)}" data-tk="sat"></label><label>Контраст <input type="range" min="-60" max="100" value="${Math.round((o.con || 0) * 100)}" data-tk="con"></label></div>`;
  function wireTint(el, get, walls, redraw) {
    const set = (f) => { snap(); const o = get(); f(o); for (const k of ['col', 'bri', 'sat', 'con']) if (!o[k]) delete o[k]; if (o.amt === undefined || o.amt === 0.6) delete o.amt; tidy(); apply(walls); redraw(); };
    el.querySelectorAll('[data-tcol]').forEach((b) => (b.onclick = () => set((o) => { o.col = b.dataset.tcol || undefined; })));
    el.querySelectorAll('[data-tcolp]').forEach((b) => (b.onchange = () => set((o) => { o.col = b.value; })));
    el.querySelectorAll('[data-tk]').forEach((b) => (b.onchange = () => set((o) => { o[b.dataset.tk] = +b.value / 100; })));
  }
  const colPanel = () => {
    const el = $('#ed-col'); if (!sel || !colOpen) { el.style.display = 'none'; bot.style.display = ''; colFor = ''; return; }
    const R = room(); let get, walls = false, title = '🎨 Цвет предмета', all = true;
    if (sel.t === 'item') get = () => (R.items ||= {})[sel.key] ||= { dx: 0, dy: 0, ...pivotOf(sel.key) };
    else if (sel.t === 'add') { const j = +sel.key.split('#')[1]; get = () => R.add[j]; }
    else if (sel.t === 'desk') { get = () => (R.deskTint ||= {}); title = '🎨 Цвет всех мест учеников класса'; all = false; }
    else { get = () => (R.walls ||= {})[sel.key] ||= {}; walls = true; all = false; }
    const o = get();
    el.innerHTML = `<b>${title}</b>${tintBlock(o)}<div class="row"><button class="w" data-done style="background:#7b5cd6;color:#fff">✓ Готово</button><button class="w" data-reset>Сбросить цвет</button>${all ? '<button class="w" data-all>🪄 Так же — всем предметам класса</button>' : ''}</div>`;
    wireTint(el, get, walls, colPanel);
    el.querySelector('[data-reset]').onclick = () => { snap(); const t = get(); for (const k of ['col', 'amt', 'bri', 'sat', 'con']) delete t[k]; tidy(); apply(walls); colPanel(); };
    const ab = el.querySelector('[data-all]'); if (ab) ab.onclick = () => { snap(); const t = get(), c = {}; for (const k of ['col', 'amt', 'bri', 'sat', 'con']) if (t[k] !== undefined) c[k] = t[k]; R.allTint = c; tidy(); apply(false); status('Цвет применён ко всем предметам класса (кроме тех, у кого свой цвет)'); };
    el.querySelector('[data-done]').onclick = () => { colOpen = false; showSel(); };
    el.style.display = 'block'; el.style.top = 'auto'; el.style.bottom = '0'; bot.style.display = 'none'; selBar.style.display = 'none';   /* the colour panel takes the palette's place, the room stays visible */
    if (colFor !== sel.key) { colFor = sel.key; const e = curEnt(); if (e && e.bb) { const sc = A.scroller, tb = $('#ed-top').offsetHeight, free = innerHeight - tb - el.offsetHeight; sc.scrollLeft = (e.bb.x0 + e.bb.x1) / 2 * A.scale - sc.clientWidth / 2; sc.scrollTop = (e.bb.y0 + e.bb.y1) / 2 * A.scale - (tb + free / 2) + A.canvas.getBoundingClientRect().top; } }   /* bring the thing into view */
  };
  function wallUi() {
    const R = room(), texs = Object.keys(A.parts).filter((k) => /\/(wall|floor)$/.test(k) && A.parts[k].complete && A.parts[k].naturalWidth);
    const sec = (n, title) => { const o = R[n] || {}; return `<h4>${title}</h4>
<div class="row"><button class="sw${!o.col ? ' on' : ''}" data-n="${n}" data-col="" title="Без краски" style="background:linear-gradient(135deg,#fff 45%,#e05 50%,#fff 55%)"></button>${COLS.map((c) => `<button class="sw${o.col === c ? ' on' : ''}" data-n="${n}" data-col="${c}" style="background:${c}"></button>`).join('')}<input type="color" data-n="${n}" value="${o.col || '#e9d6ff'}" title="Свой цвет"></div>
<div class="row"><label>Сила цвета <input type="range" min="0" max="100" value="${Math.round((o.amt ?? 0.6) * 100)}" data-n="${n}" data-k="amt"></label><label>Светлее/темнее <input type="range" min="-60" max="60" value="${Math.round((o.bri || 0) * 100)}" data-n="${n}" data-k="bri"></label></div>
<div class="row"><img class="tx${!o.tex ? ' on' : ''}" data-n="${n}" data-tex="" src="${(A.parts[cid + '/' + n] || {}).src || ''}" title="Свой узор класса">${texs.filter((k) => k.endsWith('/' + n) && k !== cid + '/' + n).map((k) => `<img class="tx${o.tex === k ? ' on' : ''}" data-n="${n}" data-tex="${k}" src="${A.parts[k].src}">`).join('')}</div>`; };
    $('#ed-wall').innerHTML = sec('wall', '🧱 Стены') + sec('floor', '🟫 Пол') + `<h4>🪑 Все предметы класса (у кого нет своего цвета)</h4><div id="ed-allt" class="edt">${tintBlock(R.allTint || {})}</div>`;
    wireTint($('#ed-allt'), () => (room().allTint ||= {}), false, wallUi);
    const set = (n, f) => { snap(); const o = (R[n] ||= {}); f(o); for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '' || o[k] === 0) delete o[k]; if (!Object.keys(o).length) delete R[n]; tidy(); apply(true); };
    $('#ed-wall').querySelectorAll('.sw[data-n]').forEach((b) => (b.onclick = () => { set(b.dataset.n, (o) => { o.col = b.dataset.col || undefined; }); wallUi(); }));
    $('#ed-wall').querySelectorAll('input[type=color][data-n]').forEach((b) => (b.onchange = () => { set(b.dataset.n, (o) => { o.col = b.value; }); wallUi(); }));
    $('#ed-wall').querySelectorAll('input[type=range][data-n]').forEach((b) => (b.onchange = () => set(b.dataset.n, (o) => { o[b.dataset.k] = +b.value / 100; if (b.dataset.k === 'amt' && +b.value === 60) o.amt = undefined; })));
    $('#ed-wall').querySelectorAll('.tx').forEach((b) => (b.onclick = () => { set(b.dataset.n, (o) => { o.tex = b.dataset.tex || undefined; }); wallUi(); }));
  }

  // ---------- overlay: thin frames on what can be moved, a bold one on the selection ----------
  let goT = 0;
  function goCheck() {   // the screen shows another class than the one being edited: offer to switch to it
    const r = stageRect(), w = toWorld(r.left + r.width / 2, r.top + r.height * 0.45), td = tileDelta(w.x - A.P(0, 0).x, w.y - A.P(0, 0).y), b = $('#ed-go');
    const j = A.CLASSES.findIndex((c, i) => { const q = A.slotOf(i); return q && td.dx >= q.x0 && td.dx < q.x1 && td.dy >= q.y0 && td.dy < q.y1; });
    const rm = j < 0 ? RMS.find((r) => { const q = !r.slot && A.SLOTS[r.id]; return q && td.dx >= q.x0 && td.dx < q.x1 && td.dy >= q.y0 && td.dy < q.y1; }) : null;   /* the reception and the dorms too */
    const to = j >= 0 ? A.CLASSES[j] : rm;
    if (to && to.id !== cid) { b.style.display = ''; b.textContent = `✏️ Править «${to.name}»`; b.onclick = () => reload({ c: to.id }); } else b.style.display = 'none';
  }
  function frame() {
    requestAnimationFrame(frame); if (performance.now() - goT > 500) { goT = performance.now(); goCheck(); }
    const r = stageRect(), d = devicePixelRatio || 1; if (ov.width !== Math.round(r.width * d) || ov.height !== Math.round(r.height * d)) { ov.width = Math.round(r.width * d); ov.height = Math.round(r.height * d); }
    Object.assign(ov.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    oc.setTransform(d, 0, 0, d, -r.left * d, -r.top * d); oc.clearRect(r.left, r.top, r.width, r.height);
    const box = (b, on) => { const a = toClient(b.x0, b.y0), c = toClient(b.x1, b.y1); oc.lineWidth = on ? 2.5 : 1; oc.setLineDash(on ? [] : [4, 4]); oc.strokeStyle = on ? '#7b5cd6' : 'rgba(123,92,214,0.35)'; oc.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y); };
    for (const e of myEnts()) if (vis(e)) box(e.bb, sel && sel.key === e.key);
    for (const w of myWalls()) box(w.bb, sel && sel.key === w.key);
  }
  requestAnimationFrame(frame);
  window.addEventListener('beforeunload', () => { localStorage.setItem(DRAFT_LS, JSON.stringify({ ...L, t: Date.now() })); });
  window.__ed = { get L() { return L; }, hit, select: (t, k) => { sel = { t, key: k }; showSel(); }, ents: myEnts, walls: myWalls, start, move, end: () => { drag = null; tidy(); showSel(); } };   // test hooks
}
