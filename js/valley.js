// «🗺 Волшебная долина» — the alliance strategy (Maria 2026-11-25: «Я бы больше хотела прям стратегию», plan «Да, прикольно»).
// The map lives on the family server (lazy.vazuza.love/game/valley, gameValley.ts): a hex valley per world and per week; every player
// gets troops each day and sends them to take a neighbouring cell or to reinforce an own one. This module is only the screen.
const URL0 = (() => { try { return localStorage.getItem('magicschool.valleyUrl') || ''; } catch (e) { return ''; } })() || 'https://lazy.vazuza.love/game/valley';   // override: local tests only
const TN = ['plain', 'forest', 'mountain', 'lake', 'mine', 'ruins', 'tower', 'castle'];
const TINFO = {
  plain: { n: 'Луг', ico: '', col: '#bfe3a0', d: 'Обычная земля.' },
  forest: { n: 'Лес', ico: '🌲', col: '#7fbf7a', d: 'Защитникам легче: оборона ×1,25.' },
  mountain: { n: 'Горы', ico: '⛰️', col: '#b9b4c4', d: 'Отбить трудно: оборона ×1,5.' },
  lake: { n: 'Озеро', ico: '', col: '#8cc7ef', d: 'Через озеро не пройти.' },
  mine: { n: 'Кристальная шахта', ico: '💎', col: '#c8b6f2', d: 'Каждому в альянсе +1 отряд в день.' },
  ruins: { n: 'Руины', ico: '🏚️', col: '#e3cfa6', d: 'Раз в день каждый из альянса находит здесь лунный камень.' },
  tower: { n: 'Сторожевая башня', ico: '🛡️', col: '#d9d2c3', d: 'Оборона ×1,5, а соседние земли альянса — ×1,25.' },
  castle: { n: 'Замок', ico: '🏰', col: '#f1e3c6', d: 'Дом альянса: оборона ×2. Чужой замок — 5 очков.' },
};
const PRIZE = [15, 10, 5];
let A = null, root = null, cv = null, st = null, sel = null, n = 1, busy = false, msg = '', pollT = 0, tab = 'map', zoom = 1.6, centred = false;
const W = () => (A.world ? A.world() : 1);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function call(op, body) {
  let tok = ''; if (!(A.testTok && A.testTok())) try { tok = (await Promise.race([A.token(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))])).tok; } catch (e) { /* view only */ }
  const r = await fetch(`${URL0}/${op}?w=${W()}`, { method: body ? 'POST' : 'GET', headers: { ...(tok || (A.testTok && A.testTok()) ? { Authorization: 'Bearer ' + ((A.testTok && A.testTok()) || tok) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const d = await r.json().catch(() => ({ ok: false }));
  if (d.state) st = d.state; else if (op === 'state' && d.ok) st = d;
  return d;
}
const cells = () => (st ? st.cells.map(([q, r, t, o, g]) => ({ q, r, t: TN[t], o, g })) : []);
const cellAt = (q, r) => cells().find((c) => c.q === q && c.r === r);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const nbs = (c) => DIRS.map(([a, b]) => cellAt(c.q + a, c.r + b)).filter(Boolean);
const myAl = () => (st && st.me ? st.me.al : '');
function reach(c) {
  if (!myAl() || c.t === 'lake') return false;
  const h = st.me.castle; if (h && h[0] === c.q && h[1] === c.r) return true;
  return nbs(c).some((x) => x.o === myAl());
}
function defOf(c) { const base = { forest: 1.25, mountain: 1.5, tower: 1.5, castle: 2 }[c.t] || 1; const tw = c.o && nbs(c).some((x) => x.t === 'tower' && x.o === c.o) ? 1.25 : 1; return base * tw; }
const alOf = (id) => (st && st.alliances[id]) || null;
const fmtLeft = (ms) => { const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000); return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`; };

// ---- drawing
let geo = null;
function layout() {
  const box = root.querySelector('.vl-map'); if (!box || !st) return;
  const w = box.clientWidth * zoom, R = st.R, s = w / (Math.sqrt(3) * (2 * R + 1) + 0.2), h = s * (1.5 * (2 * R) + 2.2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  geo = { s, cx: w / 2, cy: h / 2, dpr };
}
const px = (q, r) => ({ x: geo.cx + geo.s * Math.sqrt(3) * (q + r / 2), y: geo.cy + geo.s * 1.5 * r });
function hexPath(cx, x, y, s) { cx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); cx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); } cx.closePath(); }
function draw() {
  if (!cv || !st) return; if (!geo) layout(); if (!geo) return;
  const cx = cv.getContext('2d'); cx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  const s = geo.s, all = cells(), mine = myAl();
  for (const c of all) {
    const { x, y } = px(c.q, c.r), T = TINFO[c.t], al = alOf(c.o);
    hexPath(cx, x, y, s * 0.97); cx.fillStyle = T.col; cx.fill();
    if (al) { cx.fillStyle = al.color + '55'; cx.fill(); hexPath(cx, x, y, s * 0.86); cx.lineWidth = Math.max(2, s * 0.14); cx.strokeStyle = al.color; cx.stroke(); }
    if (c.t === 'lake') { cx.strokeStyle = '#ffffffaa'; cx.lineWidth = 1.5; for (const dy of [-0.2, 0.15]) { cx.beginPath(); cx.moveTo(x - s * 0.4, y + s * dy); cx.quadraticCurveTo(x - s * 0.2, y + s * (dy - 0.12), x, y + s * dy); cx.quadraticCurveTo(x + s * 0.2, y + s * (dy + 0.12), x + s * 0.4, y + s * dy); cx.stroke(); } }
    if (T.ico) { const im = A.emojiImage && A.emojiImage(T.ico), z = s * (c.t === 'castle' ? 1.05 : 0.8); if (im) cx.drawImage(im, x - z / 2, y - z / 2 - s * 0.12, z, z); else { cx.font = `${z * 0.8}px serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(T.ico, x, y - s * 0.1); } }
    if (c.t !== 'lake' && (c.g > 0)) { cx.font = `800 ${Math.max(9, s * 0.42)}px ui-rounded,"Nunito",sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; const ty = y + s * (T.ico ? 0.5 : 0.05); cx.lineWidth = 3; cx.strokeStyle = '#fff'; cx.strokeText(c.g, x, ty); cx.fillStyle = al ? al.color : '#5b5470'; cx.fillText(c.g, x, ty); }
    if (mine && c.o !== mine && reach(c)) { hexPath(cx, x, y, s * 0.93); cx.setLineDash([4, 3]); cx.lineWidth = 2; cx.strokeStyle = '#ffffffdd'; cx.stroke(); cx.setLineDash([]); }
  }
  if (sel) { const { x, y } = px(sel.q, sel.r); hexPath(cx, x, y, s * 1.02); cx.lineWidth = 4; cx.strokeStyle = '#ffd84a'; cx.stroke(); }
}

// ---- screen
function css() {
  if (document.getElementById('vl-style')) return;
  const e = document.createElement('style'); e.id = 'vl-style';
  e.textContent = `#vl{position:fixed;inset:0;z-index:900;background:linear-gradient(#efe6ff,#fdf0e6);display:flex;flex-direction:column;font-family:ui-rounded,"Nunito","Segoe UI",sans-serif;color:#3a3150}
#vl .vl-top{display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 6px}#vl .vl-top h2{flex:1;margin:0;font-size:18px}
#vl .vl-x{min-width:38px;height:38px;padding:0 6px;border-radius:12px;border:0;background:#fff;font-size:18px;box-shadow:0 2px 0 #d9cdf5}
#vl .vl-pill{background:#fff;border-radius:12px;padding:5px 9px;font-weight:800;font-size:13px;box-shadow:0 2px 0 #d9cdf5;white-space:nowrap}
#vl .vl-tabs{display:flex;gap:4px;padding:0 10px 6px}#vl .vl-tabs button{flex:1;border:0;border-radius:10px;padding:6px 2px;font:800 12px inherit;background:#f1eafd;color:#6b5a99}#vl .vl-tabs button.on{background:#7b5cd6;color:#fff}
#vl .vl-map{flex:1;overflow:auto;padding:0 6px;-webkit-overflow-scrolling:touch}#vl canvas{display:block;margin:0 auto;touch-action:manipulation}
#vl .vl-list{flex:1;overflow:auto;padding:0 12px 12px}#vl .vl-row{background:#fff;border-radius:12px;padding:7px 10px;margin:5px 0;font-size:13.5px;display:flex;gap:8px;align-items:center}
#vl .vl-dot{width:14px;height:14px;border-radius:50%;flex:none}
#vl .vl-card{background:#fff;border-radius:18px 18px 0 0;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 10px);box-shadow:0 -4px 14px #0002;min-height:96px}
#vl .vl-card b{font-size:15px}#vl .vl-muted{color:#7a6c99;font-size:12.5px;line-height:1.35}
#vl .vl-act{display:flex;gap:6px;align-items:center;margin-top:8px}#vl .vl-act .btn{flex:1}
#vl .vl-step{display:flex;align-items:center;gap:4px;background:#f1eafd;border-radius:12px;padding:3px}#vl .vl-step button{width:34px;height:34px;border:0;border-radius:10px;background:#fff;font:900 18px inherit}#vl .vl-step span{min-width:26px;text-align:center;font-weight:900}
#vl .vl-msg{margin-top:6px;font-weight:800;font-size:13.5px}`;
  document.head.appendChild(e);
}
function cardHtml() {
  if (!st) return '<div class="vl-muted">Загружаю долину…</div>';
  if (!st.me) return `<b>Долина альянсов</b><div class="vl-muted">Чтобы сражаться за земли, вступи в альянс (окно 🤝). Смотреть карту можно и так.</div>`;
  if (!sel) return `<b>Твой ход</b><div class="vl-muted">Нажми на клетку с белой пунктирной рамкой — туда можно отправить отряды. Свои клетки можно укреплять. ${st.me.castle ? '' : ''}</div>${msg ? `<div class="vl-msg">${msg}</div>` : ''}`;
  const c = cellAt(sel.q, sel.r), T = TINFO[c.t], al = alOf(c.o), mine = c.o === myAl(), can = mine || reach(c), d = defOf(c), need = Math.floor(c.g * d) + 1;
  n = Math.max(1, Math.min(n, st.me.left || 1));
  let act = '';
  if (c.t === 'lake') act = '';
  else if (mine) act = `<div class="vl-act"><div class="vl-step"><button data-vn="-1">−</button><span>${n}</span><button data-vn="1">+</button></div><button class="btn" data-vgo ${st.me.left ? '' : 'disabled'}>🛡 Укрепить</button></div>`
    + (c.t === 'ruins' ? `<div class="vl-act"><button class="btn ghost" data-vruin ${st.me.ruins.includes(c.q + ',' + c.r) ? 'disabled' : ''}>🏚 Обыскать руины (лунный камень)</button></div>` : '');
  else if (can) act = `<div class="vl-act"><div class="vl-step"><button data-vn="-1">−</button><span>${n}</span><button data-vn="1">+</button></div><button class="btn hot" data-vgo ${st.me.left ? '' : 'disabled'}>⚔️ ${c.o ? 'Напасть' : 'Занять'}</button></div><div class="vl-muted" style="margin-top:4px">Чтобы взять с одного раза, нужно отрядов: <b>${need}</b></div>`;
  else act = '<div class="vl-muted" style="margin-top:6px">Сюда пока не дойти: сначала займи соседнюю клетку.</div>';
  return `<b>${T.ico ? T.ico + ' ' : ''}${T.n}</b> <span class="vl-muted">· ${al ? `<span style="color:${al.color};font-weight:800">${esc(al.emo)} ${esc(al.name)}</span>` : 'ничья земля'}${c.t !== 'lake' ? ` · защитников ${c.g}${d > 1 ? ` · оборона ×${String(+d.toFixed(2)).replace('.', ',')}` : ''}` : ''}</span>
    <div class="vl-muted">${T.d}</div>${act}${msg ? `<div class="vl-msg">${msg}</div>` : ''}`;
}
function listHtml() {
  if (!st) return '';
  if (tab === 'log') return st.events.length ? st.events.slice().reverse().map((e) => { const al = alOf(e.al), T = TINFO[(cells().find((c) => c.q === e.q && c.r === e.r) || {}).t] || TINFO.plain, tm = new Date(e.t);
    const what = e.k === 'reinforce' ? `укрепил(а) «${T.n}» (+${e.n})` : e.ok ? `${e.k === 'take' ? 'отбил(а)' : 'занял(а)'} «${T.n}»` : `атаковал(а) «${T.n}», но не взял(а)`;
    return `<div class="vl-row"><span class="vl-dot" style="background:${al ? al.color : '#bbb'}"></span><span style="flex:1"><b>${esc(e.who)}</b> ${what}</span><span class="vl-muted">${String(tm.getHours()).padStart(2, '0')}:${String(tm.getMinutes()).padStart(2, '0')}</span></div>`; }).join('') : '<div class="vl-muted" style="padding:10px">Пока тихо — начни первым!</div>';
  if (tab === 'top') {
    const rows = st.table.map((x, k) => { const al = alOf(x.al); return `<div class="vl-row" ${x.al === myAl() ? 'style="box-shadow:0 0 0 2px #e8b923 inset;background:#fff8dc"' : ''}><b style="min-width:24px">${k < 3 ? ['🥇', '🥈', '🥉'][k] : k + 1 + '.'}</b><span class="vl-dot" style="background:${al ? al.color : '#bbb'}"></span><span style="flex:1">${al ? esc(al.emo) + ' ' + esc(al.name) : '?'}<div class="vl-muted">земель: ${x.cells}</div></span><b>${x.score}</b></div>`; }).join('');
    const last = st.last && st.last.table.length ? `<div class="vl-muted" style="margin-top:10px">Прошлая неделя: победил «${esc((alOf(st.last.table[0].al) || {}).name || 'альянс')}».</div>` : '';
    return `<div class="vl-muted" style="margin:4px 2px">Очки: замок врага 5, шахта, руины и башня по 2, остальные земли по 1. В конце недели каждому участнику: 1-е место 🔮${PRIZE[0]}, 2-е 🔮${PRIZE[1]}, 3-е 🔮${PRIZE[2]}.</div>${rows || '<div class="vl-muted">Пока никто не занял ни одной земли.</div>'}${last}`;
  }
  return `<div class="vl-muted" style="line-height:1.5;padding:4px 2px">
    <b>Как играть</b><br>• Каждый день твоя школа даёт отряды: ${st.me ? st.me.troops : 6} сегодня. Больше — за кристальные шахты альянса и за очки «Битвы альянсов» (дела дня, мини-игры, подарки).<br>
    • Отряды можно отправить на соседнюю с вашими землями клетку. Если отрядов больше, чем сила защитников, клетка ваша.<br>
    • Сила защитников = их число × оборона земли (лес ×1,25, горы ×1,5, башня ×1,5, замок ×2).<br>
    • Свои клетки можно укреплять, чтобы их не отобрали.<br>• Неделя длится до понедельника, потом долина начинается заново.</div>`;
}
function render() {
  if (!root) return;
  const left = st ? st.ends - Date.now() : 0;
  root.innerHTML = A.emojiHtml(`<div class="vl-top"><button class="vl-x" data-vx>✕</button><h2>🗺️ Долина</h2>${st && st.me ? `<span class="vl-pill">⚔️ ${st.me.left}/${st.me.troops}</span>` : ''}<span class="vl-pill">⏳ ${st ? fmtLeft(left) : '…'}</span>${tab === 'map' ? `<button class="vl-x" data-vzoom>${zoom > 1 ? '🔍−' : '🔍+'}</button>` : ''}</div>
    <div class="vl-tabs">${[['map', '🗺 Карта'], ['log', '📜 События'], ['top', '🏆 Таблица'], ['help', '❓ Как играть']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-vtab="${k}">${t}</button>`).join('')}</div>
    ${tab === 'map' ? `<div class="vl-map"><canvas></canvas></div><div class="vl-card">${cardHtml()}</div>` : `<div class="vl-list">${listHtml()}</div>`}`);
  const keep = root.__scroll; cv = root.querySelector('canvas'); geo = null;
  if (cv) { layout(); draw(); cv.addEventListener('click', tap); const box = root.querySelector('.vl-map'); box.addEventListener('scroll', () => { root.__scroll = [box.scrollLeft, box.scrollTop]; });
    if (!centred && st && geo) { centred = true; const h = st.me && st.me.castle, p = h ? px(h[0], h[1]) : { x: geo.cx, y: geo.cy }; box.scrollLeft = p.x - box.clientWidth / 2; box.scrollTop = p.y - box.clientHeight / 2; } else if (keep) { box.scrollLeft = keep[0]; box.scrollTop = keep[1]; } }
}
function tap(e) {
  if (!st || !geo) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 1e9; for (const c of cells()) { const p = px(c.q, c.r), d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = c; } }
  if (!best || bd > (geo.s * 1.1) ** 2) return;
  sel = { q: best.q, r: best.r }; msg = ''; const need = Math.floor(best.g * defOf(best)) + 1;
  n = best.o === myAl() ? Math.min(3, (st.me && st.me.left) || 1) : Math.min(need, (st.me && st.me.left) || 1);
  const card = root.querySelector('.vl-card'); if (card) card.innerHTML = A.emojiHtml(cardHtml()); draw();
}
async function go() {
  if (busy || !sel) return; busy = true; msg = '⏳ Отряды в пути…'; render();
  try {
    const d = await call('act', { q: sel.q, r: sel.r, n });
    if (!d.ok) msg = '❗ ' + (d.error || 'Не получилось');
    else if (d.won && d.cell && d.cell[3] === myAl() && d.power == null) msg = `🛡 Укреплено! Защитников: ${d.cell[4]}`;
    else if (d.won) { msg = `🎉 Победа! Земля ваша, на ней ${d.cell[4]} защитн.`; A.snd && A.snd('special'); A.onWin && A.onWin(); }
    else { msg = `💥 Не хватило сил: у защитников осталось ${d.cell[4]}. Добей их!`; A.snd && A.snd('nope'); }
  } catch (e) { msg = '❗ Нет связи с долиной, попробуй ещё раз'; }
  busy = false; render();
}
async function ruin() {
  if (busy || !sel) return; busy = true;
  try { const d = await call('ruin', { q: sel.q, r: sel.r }); msg = d.ok ? (A.stones(1, `valley_ruin_${d.day}_${d.cell}_w${W()}`) ? '💎 В руинах нашёлся лунный камень! 🔮 +1' : 'Сегодня камень уже найден') : '❗ ' + (d.error || 'Не получилось'); }
  catch (e) { msg = '❗ Нет связи с долиной'; }
  busy = false; render();
}
function prizeCheck() {   // last week's place: 15 / 10 / 5 moonstones to every member of the alliance it was in
  if (!st || !st.last || !st.last.al) return;
  const k = st.last.table.findIndex((x) => x.al === st.last.al);
  if (k >= 0 && k < 3 && A.stones(PRIZE[k], `valley_${st.last.week}_w${W()}`)) A.toast(`🗺 Волшебная долина: ${k + 1}-е место на прошлой неделе! 🔮 +${PRIZE[k]}`);
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b || !root || !root.contains(b)) return; const d = b.dataset;
  if (d.vx !== undefined) return close();
  if (d.vtab) { tab = d.vtab; render(); return; }
  if (d.vzoom !== undefined) { zoom = zoom > 1 ? 1 : 1.6; centred = false; root.__scroll = null; render(); return; }
  if (d.vn) { n = Math.max(1, Math.min((st.me && st.me.left) || 1, n + +d.vn)); const s = root.querySelector('.vl-step span'); if (s) s.textContent = n; return; }
  if (d.vgo !== undefined) return void go();
  if (d.vruin !== undefined) return void ruin();
}
export function open() {
  css(); if (root) return; root = document.createElement('div'); root.id = 'vl'; document.body.appendChild(root);
  root.addEventListener('click', onClick); tab = 'map'; sel = null; msg = ''; centred = false; render();
  call('state').then(() => { prizeCheck(); centred = false; render(); }).catch(() => { msg = '❗ Нет связи с долиной'; render(); });
  clearInterval(pollT); pollT = setInterval(() => { if (!root || busy || document.hidden) return; call('state').then(() => { if (tab !== 'map') render(); else { draw(); const c = root.querySelector('.vl-card'); if (c && !busy) c.innerHTML = A.emojiHtml(cardHtml()); const p = root.querySelector('.vl-pill'); if (p && st.me) p.textContent = `⚔️ ${st.me.left}/${st.me.troops}`; } }).catch(() => {}); }, 20000);
  A.onOpen && A.onOpen();
}
export function close() { clearInterval(pollT); if (root) root.remove(); root = null; cv = null; A.onClose && A.onClose(); }
export function initValley(api) {
  A = api;
  window.addEventListener('resize', () => { if (root && cv) { layout(); draw(); } });
  const reg = () => { if (!window.schoolMenu) { setTimeout(reg, 50); return; } window.schoolMenu.add({ attr: 'data-valley', icon: '🗺️', label: 'Долина', sub: () => '' }); };
  setTimeout(reg, 0);
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-valley]')) open(); });
  window.__valley = { open, close, url: URL0, call: (op) => call(op), get st() { return st; }, sel: (q, r) => { sel = { q, r }; render(); }, setN: (v) => { n = v; }, go: () => go() };   // test hook
  return { open, close };
}
