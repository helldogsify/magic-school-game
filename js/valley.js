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
const TINFO2 = {   // world 2: the dwarves' halls under the mountain (same rules, own names)
  plain: { n: 'Каменный зал', ico: '', col: '#8c95a3', d: 'Обычная земля.' },
  forest: { n: 'Грибная роща', ico: '🍄', col: '#5fa3a0', d: 'Защитникам легче: оборона ×1,25.' },
  mountain: { n: 'Скалы', ico: '⛰️', col: '#7d8594', d: 'Отбить трудно: оборона ×1,5.' },
  lake: { n: 'Подземное озеро', ico: '', col: '#2f6b73', d: 'Через озеро не пройти.' },
  mine: { n: 'Рудная жила', ico: '⛏️', col: '#b59a5a', d: 'Каждому в альянсе +1 отряд в день.' },
  ruins: { n: 'Древний чертог', ico: '🏚️', col: '#9aa0aa', d: 'Раз в день каждый из альянса находит здесь лунный камень.' },
  tower: { n: 'Застава', ico: '🛡️', col: '#a4a9b3', d: 'Оборона ×1,5, а соседние земли альянса — ×1,25.' },
  castle: { n: 'Крепость', ico: '🏰', col: '#b8bcc6', d: 'Дом альянса: оборона ×2. Чужая крепость — 5 очков.' },
};
const TI = () => (A && A.world && A.world() === 2 ? TINFO2 : TINFO);
const w2 = (a, b) => (A && A.world && A.world() === 2 ? b : a);   // a text of world 1 or of world 2
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
const freeCastle = (c) => c.t === 'castle' && !c.o;   // an unclaimed castle: the server keeps it for a new alliance (tester №49eo5hgg: the tip sent him there and «Занять» did nothing)
function reach(c) {
  if (!myAl() || c.t === 'lake' || freeCastle(c)) return false;
  const h = st.me.castle; if (h && h[0] === c.q && h[1] === c.r) return true;
  return nbs(c).some((x) => x.o === myAl());
}
function defOf(c) { const base = { forest: 1.25, mountain: 1.5, tower: 1.5, castle: 2 }[c.t] || 1; const tw = c.o && nbs(c).some((x) => x.t === 'tower' && x.o === c.o) ? 1.25 : 1; return base * tw; }
const alOf = (id) => (st && st.alliances[id]) || null;
const fmtLeft = (ms) => { const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000); return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`; };
const refillMs = () => { const D = 86400000, M = 3 * 3600000, t = Date.now(); return (Math.floor((t + M) / D) + 1) * D - M - t; };   // the server's day is Moscow time
const refillTxt = () => fmtLeft(refillMs());

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
const shade = (hex, k) => { const v = parseInt(hex.slice(1, 7), 16), f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); return `rgb(${f(v >> 16)},${f((v >> 8) & 255)},${f(v & 255)})`; };
const mix = (h1, h2, k) => { const a = parseInt(h1.slice(1, 7), 16), b = parseInt(h2.slice(1, 7), 16), m = (x, y) => Math.round(x + (y - x) * k); return '#' + [m(a >> 16, b >> 16), m((a >> 8) & 255, (b >> 8) & 255), m(a & 255, b & 255)].map((v) => v.toString(16).padStart(2, '0')).join(''); };
let march = null, burst = null, tut = -1, raf = 0, lastDraw = 0;
const TILES = {};   // painted tiles (art/valley/tiles_v1.jpg, SYNTX banana2, Maria's «Да» 2026-11-25); the code drawing stays as the fallback
function tileSet() {   // painted tiles of this world, loaded on first use (world 2: dwarven halls, art/valley/tiles_w2_v1.jpg)
  const w = W() === 2 ? 2 : 1; if (TILES[w]) return TILES[w]; const T = (TILES[w] = {});
  for (const k of ['plain', 'forest', 'mountain', 'lake', 'mine', 'ruins', 'tower', 'castle', 'path']) { const im = new Image(); im.src = `assets/valley/${w === 2 ? 'w2/' : ''}${k}.webp?v=${w === 2 ? 2 : 1}`; T[k] = im; }
  return T;
}
const tileImg = (c) => { const k = c.t === 'plain' && ((c.q * 7 + c.r * 13) & 3) === 0 ? 'path' : c.t, im = tileSet()[k]; return im && im.complete && im.naturalWidth ? im : null; };
const VAL = { mine: 3, castle: 4, ruins: 2.5, tower: 2 };
function tipOf() {   // the best move now: a cheap valuable neighbour; or what else to do
  if (!st || !st.me) return null;
  if (!st.me.left) return { text: `Отряды на сегодня кончились — новые ${st.me.troops} придут через ${refillTxt()}.` + ' Загляни в «События»: что делают друзья по альянсу.' };
  const mine = myAl(), opts = cells().filter((c) => c.o !== mine && reach(c) && c.t !== 'lake').map((c) => ({ c, need: Math.floor(c.g * defOf(c)) + 1 }));
  const ok = opts.filter((o) => o.need <= st.me.left).sort((x, y) => (VAL[y.c.t] || 1) / y.need - (VAL[x.c.t] || 1) / x.need);
  if (ok.length) { const o = ok[0], T = TI()[o.c.t], why = o.c.t === 'mine' ? ' Шахта даёт каждому в альянсе +1 отряд в день.' : o.c.t === 'ruins' ? ' В руинах каждый день лунный камень.' : o.c.t === 'tower' ? ' Башня защищает соседние земли.' : o.c.o ? ' Это земля соперников!' : '';
    return { text: `Займи «${T.n}» — нужно ${o.need} ${o.need === 1 ? 'отряд' : o.need < 5 ? 'отряда' : 'отрядов'}, у тебя ${st.me.left}.${why}`, c: o.c, need: o.need }; }
  if (opts.length) { const o = opts.sort((x, y) => x.need - y.need)[0]; return { text: `Рядом сильные защитники. Атакуй «${TI()[o.c.t].n}» всеми отрядами — даже без победы защитников станет меньше, и друзья добьют.`, c: o.c, need: st.me.left }; }
  return { text: 'Укрепи свою землю на границе, чтобы её не отобрали.' };
}
function draw() {
  if (!cv || !st) return; if (!geo) layout(); if (!geo) return;
  const cx = cv.getContext('2d'); cx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0); cx.clearRect(0, 0, cv.width / geo.dpr, cv.height / geo.dpr);
  const s = geo.s, mine = myAl(), T0 = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(T0 * 4), ext = s * 0.2, tip = tipOf();
  const all = cells().sort((a, b) => a.r - b.r || a.q - b.q);
  const ico = (e, x, y, z) => { const im = A.emojiImage && A.emojiImage(e); if (im) cx.drawImage(im, x - z / 2, y - z / 2, z, z); else { cx.font = `${z * 0.85}px serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(e, x, y); } };
  for (const c of all) {
    const { x, y } = px(c.q, c.r), T = TI()[c.t], al = alOf(c.o), lake = c.t === 'lake';
    const base = al ? mix(T.col, al.color, 0.38) : T.col, top = lake ? y + ext * 0.5 : y;
    if (!lake) { hexPath(cx, x, y + ext, s * 0.98); cx.fillStyle = shade(base, -0.38); cx.fill(); }   // the side of the raised tile
    const im = tileImg(c); hexPath(cx, x, top, s * 0.98);
    if (im) { cx.save(); cx.clip(); const z = s * 2.2; cx.drawImage(im, x - z / 2, top - z / 2, z, z); if (al) { cx.fillStyle = al.color + '38'; cx.fillRect(x - z / 2, top - z / 2, z, z); } if (c.t === 'castle' && !c.o) { cx.fillStyle = 'rgba(255,255,255,0.45)'; cx.fillRect(x - z / 2, top - z / 2, z, z); } cx.restore(); hexPath(cx, x, top, s * 0.98); }
    else { const g = cx.createRadialGradient(x - s * 0.35, top - s * 0.45, s * 0.05, x, top, s * 1.15); g.addColorStop(0, shade(base, lake ? 0.45 : 0.32)); g.addColorStop(1, base); cx.fillStyle = g; cx.fill(); }
    cx.lineWidth = 1.2; cx.strokeStyle = 'rgba(255,255,255,0.55)'; cx.stroke();
    if (al) { hexPath(cx, x, top, s * 0.88); cx.lineWidth = Math.max(2.5, s * 0.13); cx.strokeStyle = al.color; cx.stroke(); }
    if (im) { /* the painting already shows it */ }
    else if (lake) { cx.strokeStyle = 'rgba(255,255,255,0.75)'; cx.lineWidth = Math.max(1.2, s * 0.06); for (const [dy, ph] of [[-0.22, 0], [0.18, 1.7]]) { const sh = Math.sin(T0 * 1.6 + ph + c.q) * s * 0.08; cx.beginPath(); cx.moveTo(x - s * 0.42 + sh, top + s * dy); cx.quadraticCurveTo(x - s * 0.2 + sh, top + s * (dy - 0.12), x + sh, top + s * dy); cx.quadraticCurveTo(x + s * 0.2 + sh, top + s * (dy + 0.12), x + s * 0.42 + sh, top + s * dy); cx.stroke(); } }
    else if (c.t === 'forest') { ico('🌲', x - s * 0.3, top - s * 0.12, s * 0.62); ico('🌲', x + s * 0.3, top - s * 0.16, s * 0.62); ico('🌲', x, top - s * 0.36, s * 0.66); }
    else if (c.t === 'mountain') { ico('⛰️', x - s * 0.18, top - s * 0.22, s * 0.78); ico('⛰️', x + s * 0.28, top - s * 0.06, s * 0.55); }
    else if (T.ico) { if (c.t === 'castle' && !c.o) cx.globalAlpha = 0.45; ico(T.ico, x, top - s * 0.16, s * (c.t === 'castle' ? 1.12 : 0.82)); cx.globalAlpha = 1; }   // a free castle is pale: a new alliance will move in
    if (c.t === 'mine' || c.t === 'ruins') { const k = 0.5 + 0.5 * Math.sin(T0 * 3 + c.q * 2); cx.fillStyle = `rgba(255,255,255,${0.5 * k})`; cx.beginPath(); cx.arc(x + s * 0.3, top - s * 0.42, s * 0.07, 0, 7); cx.fill(); }   // a little sparkle on the valuable cells
    if (al && c.t !== 'castle') { const fx = x + s * 0.42, fy = top - s * 0.55; cx.strokeStyle = '#6b5a3a'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(fx, fy); cx.lineTo(fx, fy + s * 0.45); cx.stroke(); cx.fillStyle = al.color; cx.beginPath(); cx.moveTo(fx, fy); cx.lineTo(fx - s * 0.3, fy + s * 0.1 + Math.sin(T0 * 5 + c.r) * s * 0.03); cx.lineTo(fx, fy + s * 0.2); cx.closePath(); cx.fill(); }   // the alliance flag
    if (!lake && c.g > 0 && !(c.t === 'castle' && !c.o)) { const by = top + s * 0.52, rr = s * 0.3; cx.beginPath(); cx.arc(x, by, rr, 0, 7); cx.fillStyle = '#fff'; cx.fill(); cx.lineWidth = 2; cx.strokeStyle = al ? al.color : '#8a7fa8'; cx.stroke();
      cx.font = `900 ${Math.max(9, s * 0.36)}px ui-rounded,"Nunito",sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = al ? shade(al.color, -0.25) : '#4d4466'; cx.fillText(c.g, x, by + 0.5); }
    if (mine && c.o !== mine && reach(c)) { hexPath(cx, x, top, s * 0.94); cx.lineWidth = 2.5 + 1.5 * pulse; cx.strokeStyle = `rgba(255,255,255,${0.45 + 0.5 * pulse})`; cx.setLineDash([5, 4]); cx.stroke(); cx.setLineDash([]); }
    if (tip && tip.c && tip.c.q === c.q && tip.c.r === c.r && !sel) { hexPath(cx, x, top, s * (1.02 + 0.06 * pulse)); cx.lineWidth = 4; cx.strokeStyle = `rgba(255,200,40,${0.6 + 0.4 * pulse})`; cx.stroke(); }
  }
  if (tut === 0 && st.me && st.me.castle) { const p = px(st.me.castle[0], st.me.castle[1]); cx.beginPath(); cx.arc(p.x, p.y, s * (1.3 + 0.25 * pulse), 0, 7); cx.lineWidth = 4; cx.strokeStyle = '#ffd84a'; cx.stroke(); }
  if (sel) { const { x, y } = px(sel.q, sel.r); hexPath(cx, x, y, s * 1.04); cx.lineWidth = 4.5; cx.strokeStyle = '#ffd84a'; cx.stroke(); }
  const now = performance.now();
  if (march) { const k = Math.min(1, (now - march.t0) / 900), al = alOf(myAl()), col = al ? al.color : '#7b5cd6';
    for (let j = 0; j < 6; j++) { const u = Math.max(0, Math.min(1, k * 1.4 - j * 0.08)), e = u * u * (3 - 2 * u), x = march.a.x + (march.b.x - march.a.x) * e, yy = march.a.y + (march.b.y - march.a.y) * e - Math.sin(e * Math.PI) * s * 0.6;
      cx.beginPath(); cx.arc(x, yy, s * 0.13, 0, 7); cx.fillStyle = col; cx.fill(); cx.lineWidth = 1.5; cx.strokeStyle = '#fff'; cx.stroke(); }
    if (k >= 1 && !march.wait) march = null; }
  if (burst) { const k = (now - burst.t0) / 900; if (k > 1) burst = null; else { cx.beginPath(); cx.arc(burst.p.x, burst.p.y, s * (0.5 + 1.4 * k), 0, 7); cx.lineWidth = 6 * (1 - k); cx.strokeStyle = burst.ok ? `rgba(80,200,110,${1 - k})` : `rgba(230,80,80,${1 - k})`; cx.stroke();
    cx.font = `${s * 0.9}px serif`; cx.textAlign = 'center'; cx.globalAlpha = 1 - k; ico(burst.ok ? '🎉' : '💥', burst.p.x, burst.p.y - s * (0.6 + k), s * 0.9); cx.globalAlpha = 1; } }
}
function loop() {   // ~30 fps while the map is on screen (pulses, waves, flags, marching troops)
  if (!root) { raf = 0; return; } raf = requestAnimationFrame(loop);
  const t = performance.now(); if (tab !== 'map' || document.hidden || t - lastDraw < 33) return; lastDraw = t; draw();
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
#vl .vl-msg{margin-top:6px;font-weight:800;font-size:13.5px}
#vl .vl-tip{display:flex;align-items:center;gap:6px;margin:0 10px 6px;background:#fff6cf;border:2px solid #f2d06b;border-radius:12px;padding:5px 8px;font-size:12.5px;font-weight:700;line-height:1.3}
#vl .vl-map{background:radial-gradient(ellipse at 50% 40%,#f7f1ff 0%,#e9ddff 60%,#dccdf7 100%);border-radius:16px;margin:0 6px}
#vl.w2 .vl-map{background:radial-gradient(ellipse at 50% 40%,#5d6573 0%,#424955 60%,#2f343e 100%)}`;
  document.head.appendChild(e);
}
function cardHtml() {
  if (!st) return `<div class="vl-muted">${w2('Загружаю долину…', 'Загружаю чертоги…')}</div>`;
  if (!st.me) return `<b>${w2('Долина альянсов', 'Подземные чертоги')}</b><div class="vl-muted">Чтобы сражаться за земли, вступи в альянс (окно 🤝). Смотреть карту можно и так.</div>`;
  if (!sel) return `<b>Твой ход</b> <span class="vl-muted">· отрядов ${st.me.left} из ${st.me.troops}, новые через ${refillTxt()}</span><div class="vl-muted">Нажми на клетку с белой пунктирной рамкой — туда можно отправить отряды. Свои клетки можно укреплять. ${st.me.castle ? '' : ''}</div>${msg ? `<div class="vl-msg">${msg}</div>` : ''}`;
  const c = cellAt(sel.q, sel.r), T = TI()[c.t], al = alOf(c.o), mine = c.o === myAl(), can = mine || reach(c), d = defOf(c), need = Math.floor(c.g * d) + 1;
  n = Math.max(1, Math.min(n, st.me.left || 1));
  let act = '';
  if (c.t === 'lake') act = '';
  else if (freeCastle(c)) act = `<div class="vl-muted" style="margin-top:6px">${w2('🏰 Этот замок пока ничей: его получит новый альянс, когда придёт в долину. Захватить можно только замки других альянсов — а этот пока обходи стороной.', '🏰 Эта крепость пока ничья: её получит новый альянс, когда придёт в чертоги. Захватить можно только крепости других альянсов — а эту пока обходи стороной.')}</div>`;
  else if (mine) act = `<div class="vl-act"><div class="vl-step"><button data-vn="-1">−</button><span>${n}</span><button data-vn="1">+</button></div><button class="btn" data-vgo ${st.me.left ? '' : 'disabled'}>🛡 Укрепить</button></div>`
    + (c.t === 'ruins' ? `<div class="vl-act"><button class="btn ghost" data-vruin ${st.me.ruins.includes(c.q + ',' + c.r) ? 'disabled' : ''}>${w2('🏚 Обыскать руины (лунный камень)', '🏚 Обыскать чертог (лунный камень)')}</button></div>` : '');
  else if (can) act = `<div class="vl-act"><div class="vl-step"><button data-vn="-1">−</button><span>${n}</span><button data-vn="1">+</button></div><button class="btn hot" data-vgo ${st.me.left ? '' : 'disabled'}>⚔️ ${c.o ? 'Напасть' : 'Занять'}</button></div><div class="vl-muted" style="margin-top:4px">Чтобы взять с одного раза, нужно отрядов: <b>${need}</b> · у тебя сегодня: <b>${st.me.left}</b>${st.me.left < st.me.troops ? ` · новые ${st.me.troops} через ${refillTxt()}` : ''}</div>`;
  else act = '<div class="vl-muted" style="margin-top:6px">Сюда пока не дойти: сначала займи соседнюю клетку.</div>';
  return `<b>${T.ico ? T.ico + ' ' : ''}${T.n}</b> <span class="vl-muted">· ${al ? `<span style="color:${al.color};font-weight:800">${esc(al.emo)} ${esc(al.name)}</span>` : 'ничья земля'}${c.t !== 'lake' ? ` · защитников ${c.g}${d > 1 ? ` · оборона ×${String(+d.toFixed(2)).replace('.', ',')}` : ''}` : ''}</span>
    <div class="vl-muted">${T.d}</div>${act}${msg ? `<div class="vl-msg">${msg}</div>` : ''}`;
}
function listHtml() {
  if (!st) return '';
  if (tab === 'log') return st.events.length ? st.events.slice().reverse().map((e) => { const al = alOf(e.al), T = TI()[(cells().find((c) => c.q === e.q && c.r === e.r) || {}).t] || TINFO.plain, tm = new Date(e.t);
    const what = e.k === 'reinforce' ? `укрепил(а) «${T.n}» (+${e.n})` : e.ok ? `${e.k === 'take' ? 'отбил(а)' : 'занял(а)'} «${T.n}»` : `атаковал(а) «${T.n}», но не взял(а)`;
    return `<div class="vl-row"><span class="vl-dot" style="background:${al ? al.color : '#bbb'}"></span><span style="flex:1"><b>${esc(e.who)}</b> ${what}</span><span class="vl-muted">${String(tm.getHours()).padStart(2, '0')}:${String(tm.getMinutes()).padStart(2, '0')}</span></div>`; }).join('') : '<div class="vl-muted" style="padding:10px">Пока тихо — начни первым!</div>';
  if (tab === 'top') {
    const rows = st.table.map((x, k) => { const al = alOf(x.al); return `<div class="vl-row" ${x.al === myAl() ? 'style="box-shadow:0 0 0 2px #e8b923 inset;background:#fff8dc"' : ''}><b style="min-width:24px">${k < 3 ? ['🥇', '🥈', '🥉'][k] : k + 1 + '.'}</b><span class="vl-dot" style="background:${al ? al.color : '#bbb'}"></span><span style="flex:1">${al ? esc(al.emo) + ' ' + esc(al.name) : '?'}<div class="vl-muted">земель: ${x.cells}</div></span><b>${x.score}</b></div>`; }).join('');
    const last = st.last && st.last.table.length ? `<div class="vl-muted" style="margin-top:10px">Прошлая неделя: победил «${esc((alOf(st.last.table[0].al) || {}).name || 'альянс')}».</div>` : '';
    return `<div class="vl-muted" style="margin:4px 2px">${w2('Очки: замок врага 5, шахта, руины и башня по 2, остальные земли по 1.', 'Очки: крепость врага 5, рудная жила, древний чертог и застава по 2, остальные земли по 1.')} В конце недели каждому участнику: 1-е место 🔮${PRIZE[0]}, 2-е 🔮${PRIZE[1]}, 3-е 🔮${PRIZE[2]}.</div>${rows || '<div class="vl-muted">Пока никто не занял ни одной земли.</div>'}${last}`;
  }
  return `<div class="vl-muted" style="line-height:1.5;padding:4px 2px">
    <b>Как играть</b><br>• Каждый день твоя школа даёт отряды: ${st.me ? st.me.troops : 6} сегодня. Больше — за ${w2('кристальные шахты', 'рудные жилы')} альянса и за очки «Битвы альянсов» (дела дня, мини-игры, подарки).<br>
    • Отряды можно отправить на соседнюю с вашими землями клетку. Если отрядов больше, чем сила защитников, клетка ваша.<br>
    • Сила защитников = их число × оборона земли ${w2('(лес ×1,25, горы ×1,5, башня ×1,5, замок ×2)', '(грибная роща ×1,25, скалы ×1,5, застава ×1,5, крепость ×2)')}.<br>
    • Свои клетки можно укреплять, чтобы их не отобрали.<br>• Неделя длится до понедельника, потом ${w2('долина начинается', 'чертоги делят')} заново.</div>`;
}
function tipHtml() { const t = tipOf(); return t ? `<div class="vl-tip">💡 <span style="flex:1">${t.text}</span>${t.c ? '<button class="btn small" data-vtip>Показать</button>' : ''}</div>` : ''; }
const TUT0 = ['🏰 Это замок твоего альянса', 'Отсюда вы захватываете Волшебную долину. Цвет флажков и рамок — цвет вашего альянса.'];
const TUT0_W2 = ['🏰 Это крепость твоего альянса', 'Отсюда вы захватываете Подземные чертоги. Цвет флажков и рамок — цвет вашего альянса.'];
const TUT = [
  TUT0,
  ['⚔️ Куда можно идти', 'Мигающая белая рамка — соседние клетки, туда можно отправить отряды. Число в кружке — сколько там защитников.'],
  ['🏆 Как победить', 'Нажми на клетку, выбери число отрядов и «Занять». Отрядов должно быть больше, чем сила защитников. Каждый день — новые отряды. У кого к понедельнику больше земель, тот победил: каждый участник получит лунные камни.'],
];
function tutHtml() { const [h, t] = tut === 0 && W() === 2 ? TUT0_W2 : TUT[tut]; return `<b>${h}</b> <span class="vl-muted">· ${tut + 1} из ${TUT.length}</span><div class="vl-muted" style="margin-top:3px;font-size:13.5px">${t}</div><div class="vl-act"><button class="btn" data-vtut>${tut < TUT.length - 1 ? 'Дальше ➜' : 'Понятно, играем!'}</button></div>`; }
function render() {
  if (!root) return;
  const left = st ? st.ends - Date.now() : 0;
  root.innerHTML = A.emojiHtml(`<div class="vl-top"><button class="vl-x" data-vx>✕</button><h2>${w2('🚩 Долина', '⛏️ Чертоги')}</h2>${st && st.me ? `<span class="vl-pill">⚔️ ${st.me.left}/${st.me.troops}</span>` : ''}<span class="vl-pill">⏳ ${st ? fmtLeft(left) : '…'}</span>${tab === 'map' ? `<button class="vl-x" data-vzoom>${zoom > 1 ? '🔍−' : '🔍+'}</button>` : ''}</div>
    <div class="vl-tabs">${[['map', '🗺 Карта'], ['log', '📜 События'], ['top', '🏆 Таблица'], ['help', '❓ Как играть']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-vtab="${k}">${t}</button>`).join('')}</div>
    ${tab === 'map' ? `${tipHtml()}<div class="vl-map"><canvas></canvas></div><div class="vl-card">${tut >= 0 ? tutHtml() : cardHtml()}</div>` : `<div class="vl-list">${listHtml()}</div>`}`);
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
  const card = root.querySelector('.vl-card'); if (card) card.innerHTML = A.emojiHtml(tut >= 0 ? tutHtml() : cardHtml()); draw();
}
async function go() {
  if (busy || !sel) return; busy = true; msg = '⏳ Отряды в пути…'; render();
  const to = cellAt(sel.q, sel.r), own = cells().filter((c) => c.o === myAl()).sort((a, b) => (Math.abs(a.q - to.q) + Math.abs(a.r - to.r) + Math.abs(a.q + a.r - to.q - to.r)) - (Math.abs(b.q - to.q) + Math.abs(b.r - to.r) + Math.abs(b.q + b.r - to.q - to.r)))[0] || to;
  if (geo) march = { a: px(own.q, own.r), b: px(to.q, to.r), t0: performance.now(), wait: true };
  const t0 = performance.now();
  try {
    const d = await call('act', { q: sel.q, r: sel.r, n });
    await new Promise((ok) => setTimeout(ok, Math.max(0, 900 - (performance.now() - t0))));
    if (march) march.wait = false; if (geo && d.ok && d.power != null) burst = { p: px(to.q, to.r), t0: performance.now(), ok: !!d.won };
    if (!d.ok) msg = '❗ ' + (d.error || 'Не получилось');
    else if (d.won && d.cell && d.cell[3] === myAl() && d.power == null) msg = `🛡 Укреплено! Защитников: ${d.cell[4]}`;
    else if (d.won) { msg = `🎉 Победа! Земля ваша, на ней ${d.cell[4]} защитн.`; A.snd && A.snd('special'); A.onWin && A.onWin(); }
    else { msg = `💥 Не хватило сил: у защитников осталось ${d.cell[4]}. Добей их!`; A.snd && A.snd('nope'); }
  } catch (e) { msg = w2('❗ Нет связи с долиной, попробуй ещё раз', '❗ Нет связи с чертогами, попробуй ещё раз'); }
  busy = false; render();
}
async function ruin() {
  if (busy || !sel) return; busy = true;
  try { const d = await call('ruin', { q: sel.q, r: sel.r }); msg = d.ok ? (A.stones(1, `valley_ruin_${d.day}_${d.cell}_w${W()}`) ? w2('💎 В руинах нашёлся лунный камень! 🔮 +1', '💎 В древнем чертоге нашёлся лунный камень! 🔮 +1') : 'Сегодня камень уже найден') : '❗ ' + (d.error || 'Не получилось'); }
  catch (e) { msg = w2('❗ Нет связи с долиной', '❗ Нет связи с чертогами'); }
  busy = false; render();
}
function prizeCheck() {   // last week's place: 15 / 10 / 5 moonstones to every member of the alliance it was in
  if (!st || !st.last || !st.last.al) return;
  const k = st.last.table.findIndex((x) => x.al === st.last.al);
  if (k >= 0 && k < 3 && A.stones(PRIZE[k], `valley_${st.last.week}_w${W()}`)) A.toast(`${w2('🗺 Волшебная долина', '⛏️ Подземные чертоги')}: ${k + 1}-е место на прошлой неделе! 🔮 +${PRIZE[k]}`);
}
function onClick(e) {
  const b = e.target.closest('button'); if (!b || !root || !root.contains(b)) return; const d = b.dataset;
  if (d.vx !== undefined) return close();
  if (d.vtab) { tab = d.vtab; render(); return; }
  if (d.vzoom !== undefined) { zoom = zoom > 1 ? 1 : 1.6; centred = false; root.__scroll = null; render(); return; }
  if (d.vn) { n = Math.max(1, Math.min((st.me && st.me.left) || 1, n + +d.vn)); const s = root.querySelector('.vl-step span'); if (s) s.textContent = n; return; }
  if (d.vgo !== undefined) return void go();
  if (d.vtip !== undefined) { const t = tipOf(); if (t && t.c) { sel = { q: t.c.q, r: t.c.r }; n = t.need; msg = ''; render(); } return; }
  if (d.vtut !== undefined) { tut++; if (tut >= TUT.length) { tut = -1; try { localStorage.setItem('magicschool.valleyTut', '1'); } catch (e) { /* private */ } } render(); return; }
  if (d.vruin !== undefined) return void ruin();
}
export function open() {
  css(); if (root) return; root = document.createElement('div'); root.id = 'vl'; if (W() === 2) root.className = 'w2'; document.body.appendChild(root);
  root.addEventListener('click', onClick); tab = 'map'; sel = null; msg = ''; centred = false; render();
  if (!raf) raf = requestAnimationFrame(loop);
  call('state').then(() => { prizeCheck(); centred = false; try { if (st.me && !localStorage.getItem('magicschool.valleyTut')) tut = 0; } catch (e) { /* private */ } render(); }).catch(() => { msg = w2('❗ Нет связи с долиной', '❗ Нет связи с чертогами'); render(); });
  clearInterval(pollT); pollT = setInterval(() => { if (!root || busy || document.hidden) return; call('state').then(() => { if (tab !== 'map') render(); else { draw(); const c = root.querySelector('.vl-card'); if (c && !busy) c.innerHTML = A.emojiHtml(tut >= 0 ? tutHtml() : cardHtml()); const p = root.querySelector('.vl-pill'); if (p && st.me) p.textContent = `⚔️ ${st.me.left}/${st.me.troops}`; } }).catch(() => {}); }, 20000);
  A.onOpen && A.onOpen();
}
export function close() { clearInterval(pollT); if (root) root.remove(); root = null; cv = null; A.onClose && A.onClose(); }
export function initValley(api) {
  A = api;
  window.addEventListener('resize', () => { if (root && cv) { layout(); draw(); } });
  const reg = () => { if (!window.schoolMenu) { setTimeout(reg, 50); return; } window.schoolMenu.add({ attr: 'data-valley', icon: W() === 2 ? '⛏️' : '🚩', label: W() === 2 ? 'Чертоги' : 'Долина', sub: () => '' }); };
  setTimeout(reg, 0);
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-valley]')) open(); });
  window.__valley = { open, close, url: URL0, call: (op) => call(op), get st() { return st; }, sel: (q, r) => { sel = { q, r }; render(); }, setN: (v) => { n = v; }, go: () => go() };   // test hook
  return { open, close };
}
