// World-2 mini-game «Вагонетка в штольне» (Maria 2026-11-25: «Хочу разные мини игры для двух миров», her pick of two ideas «2 поприкольнее»).
// A gnome-world student rides a mine cart on three rails into the mountain: a tap above the cart jumps to the upper rail, below to the
// lower one (a swipe up/down works too). Ore +2, a gem +10, every passed row of rubble +5; rubble or a broken rail ends the ride;
// a miner's helmet saves from one hit; dark stretches where only the cart's lamp lights the way. The cart speeds up.
// Same handle as runFlight (js/flight.js): the shell in minigame.js (tries, bonuses, reward, weekly table, continue) is shared.

const LANES = [0.40, 0.60, 0.80];                         // rail heights, share of the screen height
const SPEED0 = 0.42, SPEED_MAX = 0.9, SPEED_UP = 0.0065;   // W per second
const STEP = 0.62;                                         // distance between rows of obstacles in W
const PX = 0.26;                                           // where the cart rides, share of the width
export const PTS = { row: 5, ore: 2, gem: 10, helmet: 5 };
const ART_V = 1, imgs = {};   // painted art: art/cart/sprites_v1.jpg + bg_v1.jpg (SYNTX banana2, Maria's «Делай сразу с визуалом красивым»)
export function loadCartArt() { for (const k of ['bg', 'cart', 'rubble', 'barrier', 'ore', 'gem', 'helmet', 'frame', 'lantern', 'crystals']) if (!imgs[k]) { const im = new Image(); im.src = `assets/cart/${k}.webp?v=${ART_V}`; imgs[k] = im; } }
const okI = (k) => { const im = imgs[k]; return im && im.complete && im.naturalWidth ? im : null; };

export function runCart(box, o) {
  loadCartArt(); box.innerHTML = '';
  const cv = document.createElement('canvas'); cv.className = 'fl-cv'; box.appendChild(cv);
  const cx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function fit() {
    const r = box.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1);
    W = Math.max(200, r.width); H = Math.max(300, r.height);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  fit();
  const P = o.power || {}, B = o.boost || {};
  const st = { t: 0, started: false, over: false, x: 0, lane: 1, y: LANES[1], speed: SPEED0, score: 0, rings: 0, sparks: 0, rows: 0, shield: !!(P.shield || B.shield),
    magnet: Math.max(P.magnet || 0, B.magnet ? 0.45 : 0), dark: { t: 14 + Math.random() * 4, dur: 0, warned: false }, grace: 0,
    obs: [], items: [], fx: [], texts: [], deadT: 0, shake: 0, rowN: 0, ended: false, tilt: 0 };
  const me = new Image(); me.src = o.img;
  function addRow() {
    const x = st.obs.length ? Math.max(...st.obs.map((b) => b.x)) + STEP : 1.0;
    st.rowN++;
    const two = st.rowN > 8 && Math.random() < Math.min(0.55, 0.2 + st.rowN * 0.01);
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5), blocked = lanes.slice(0, two ? 2 : 1), free = lanes.filter((l) => !blocked.includes(l));
    for (const l of blocked) st.obs.push({ x, l, k: Math.random() < 0.35 && st.rowN > 4 ? 'gap' : 'rock', seed: Math.random() * 100, done: false });
    // ore on a free rail leading to the gap; now and then a gem or a helmet
    const fl = free[Math.floor(Math.random() * free.length)];
    for (let i = 0; i < 3; i++) st.items.push({ x: x - STEP + 0.16 + i * 0.12, l: fl, k: 'ore', got: false });
    if (Math.random() < 0.18) st.items.push({ x: x - STEP / 2 + 0.05, l: free[free.length - 1], k: 'gem', got: false });
    if (st.rowN > 5 && !st.shield && Math.random() < 0.08 * (P.featherK || 1)) st.items.push({ x: x + STEP / 2, l: Math.floor(Math.random() * 3), k: 'helmet', got: false });
    st.obs.push({ x, l: -1, done: false, row: true });   // marks the row for the score
  }
  for (let k = 0; k < 4; k++) addRow();

  // ---- input: tap above / below the cart, or swipe ----
  let down0 = null;
  const move = (d) => { if (st.over) return; const l = Math.max(0, Math.min(2, st.lane + d)); if (l !== st.lane) { st.lane = l; st.tilt = d * 0.25; o.snd && o.snd('pop', 2); } };
  const onDown = (e) => {
    e.preventDefault(); if (st.over) return;
    if (!st.started) { st.started = true; o.onStart && o.onStart(); return; }
    const r = cv.getBoundingClientRect(); down0 = { y: e.clientY, t: performance.now(), rel: e.clientY - r.top };
  };
  const onUp = (e) => {
    if (!down0) return; const dy = e.clientY - down0.y, cartY = st.y * H;
    if (Math.abs(dy) > 25) move(dy < 0 ? -1 : 1); else move(down0.rel < cartY ? -1 : 1);
    down0 = null;
  };
  cv.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', () => { down0 = null; });

  function crash(b) {
    if (st.shield) { st.shield = false; st.shake = 0.3; st.grace = 0.8; if (b) b.done = true; st.texts.push({ x: PX + 0.08, y: st.y - 0.07, s: 'Каска спасла!', t: 0, col: '#e0a400' }); o.snd && o.snd('special'); return; }
    st.over = true; st.deadT = 0; st.shake = 0.45; o.snd && o.snd('nope');
    for (let k = 0; k < 20; k++) st.fx.push({ x: PX, y: st.y * H / W, vx: (Math.random() - 0.3) * 0.9, vy: (Math.random() - 0.8) * 0.8, t: 0, life: 0.9, col: ['#8d7b6a', '#c9b49a', '#ffd76a'][k % 3] });
  }
  function step(dt) {
    st.t += dt;
    st.fx = st.fx.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1.2 * dt; return p.t < p.life; });
    st.texts = st.texts.filter((p) => (p.t += dt) < 1.1);
    st.shake = Math.max(0, st.shake - dt); st.tilt *= Math.pow(0.02, dt);
    if (st.over) { st.deadT += dt; if (st.deadT > 1.3 && !st.ended) { st.ended = true; o.onEnd({ score: st.score, rings: st.rings, sparks: st.sparks }); } return; }
    if (!st.started) return;
    st.speed = Math.min(SPEED_MAX, st.speed + SPEED_UP * dt);
    st.x += st.speed * (B.slow && st.t < 25 ? 0.85 : 1) * dt; st.grace = Math.max(0, st.grace - dt);
    st.y += (LANES[st.lane] - st.y) * Math.min(1, dt * 14);
    const D = st.dark;   // dark stretches: a warning, then 4 s with only the lamp
    if (st.t > 12 && !P.windImmune) {
      if (D.dur > 0) { D.dur -= dt; if (D.dur <= 0) { D.t = 10 + Math.random() * 6; D.warned = false; } }
      else { D.t -= dt; if (D.t <= 1.2 && !D.warned) { D.warned = true; st.texts.push({ x: 0.5, y: 0.18, s: 'Темнеет! Свети фонариком', t: 0, col: '#ffd76a' }); } if (D.t <= 0) D.dur = 4; }
    }
    if (Math.max(...st.obs.map((b) => b.x)) - st.x < 1.8) addRow();
    const lanePos = LANES.reduce((best, y, i) => (Math.abs(y - st.y) < Math.abs(LANES[best] - st.y) ? i : best), 0), onRail = Math.abs(LANES[lanePos] - st.y) < 0.06;
    for (const b of st.obs) {
      if (b.done) continue;
      const dx = b.x - st.x;
      if (b.row) { if (dx < 0) { b.done = true; st.rows++; st.score += PTS.row; o.onScore && o.onScore(st.score, st.rings); } continue; }
      const hitW = P.slim ? 0.035 : 0.05;
      if (Math.abs(dx) < hitW && onRail && b.l === lanePos && !st.grace) { crash(b); if (st.over) return; }
    }
    for (const it of st.items) {
      if (it.got) continue;
      const dx = it.x - st.x, sameLane = it.l === lanePos;
      const near = st.magnet && it.k !== 'helmet' && Math.abs(it.l - lanePos) === 1 && dx > -0.03 && dx < st.magnet * 0.5;
      if ((sameLane && Math.abs(dx) < 0.05) || (near && Math.abs(dx) < 0.05)) {
        it.got = true;
        if (it.k === 'ore') { st.rings++; st.score += PTS.ore + (P.spark || 0); o.snd && o.snd('tick'); }
        else if (it.k === 'gem') { st.sparks++; st.score += PTS.gem; st.texts.push({ x: PX + 0.1, y: LANES[it.l] - 0.08, s: `Самоцвет! +${PTS.gem}`, t: 0, col: '#ff6fa5' }); o.snd && o.snd('special'); }
        else { st.shield = true; st.score += PTS.helmet; st.texts.push({ x: PX + 0.1, y: st.y - 0.08, s: 'Каска — защита!', t: 0, col: '#e0a400' }); o.snd && o.snd('brew'); }
        for (let k = 0; k < 6; k++) st.fx.push({ x: PX, y: LANES[it.l] * H / W - 0.03, vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 0.5, t: 0, life: 0.5, col: it.k === 'gem' ? '#ff9ed0' : '#ffd76a' });
        o.onScore && o.onScore(st.score, st.rings);
      }
    }
    st.obs = st.obs.filter((b) => b.x - st.x > -0.6); st.items = st.items.filter((it) => it.x - st.x > -0.4);
  }

  // ---- drawing (code art in the world-2 palette: violet rock, warm lamps, wooden beams) ----
  const sx = (x) => (x - st.x + PX) * W * dpr;
  function frame9(x, top, bot, w) {   // the painted support frame cut in parts: two posts stretched tall, the beam across (no giant doorway)
    const im = okI('frame'); if (!im) return; const iw = im.naturalWidth, ih = im.naturalHeight, bh = ih * 0.2, pw = iw * 0.16, beamH = (bot - top) * 0.07, postW = w * 0.13;
    cx.drawImage(im, 0, bh, pw, ih - bh, x - w / 2, top + beamH * 0.8, postW, bot - top - beamH * 0.8); cx.drawImage(im, iw - pw, bh, pw, ih - bh, x + w / 2 - postW, top + beamH * 0.8, postW, bot - top - beamH * 0.8);
    cx.drawImage(im, 0, 0, iw, bh, x - w / 2 - w * 0.04, top, w * 1.08, beamH);
  }
  function pic(k, x, y, w, h, ax = 0.5, ay = 1) { const im = okI(k); if (!im) return false; const r = im.naturalHeight / im.naturalWidth; if (h == null) h = w * r; else if (w == null) w = h / r; cx.drawImage(im, x - w * ax, y - h * ay, w, h); return true; }
  function rock(x, y, r, seed) { cx.fillStyle = '#7d7088'; cx.strokeStyle = '#3c3346'; cx.lineWidth = 2 * dpr;
    for (let i = 0; i < 5; i++) { const a = seed + i * 1.7, rx = x + Math.cos(a) * r * 0.55, ry = y - Math.abs(Math.sin(a)) * r * 0.5 - (i === 4 ? r * 0.5 : 0), rr = r * (0.45 + ((seed * (i + 3)) % 1) * 0.2);
      cx.beginPath(); cx.ellipse(rx, ry, rr, rr * 0.82, a, 0, 7); cx.fill(); cx.stroke(); }
    cx.fillStyle = '#a89cb3'; cx.beginPath(); cx.arc(x - r * 0.2, y - r * 0.75, r * 0.12, 0, 7); cx.fill(); }
  function draw() {
    const Wp = W * dpr, Hp = H * dpr, u = Wp;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = cx.createLinearGradient(0, 0, 0, Hp); bg.addColorStop(0, '#2b2236'); bg.addColorStop(0.5, '#41334f'); bg.addColorStop(1, '#2a2131'); cx.fillStyle = bg; cx.fillRect(0, 0, Wp, Hp);
    { const im = okI('bg'); if (im) { const bw = Hp, off = ((st.x * 0.35 * u) % (2 * bw) + 2 * bw) % (2 * bw);   // the painted tunnel wall, mirrored every other copy so the joins match
      for (let k = -1; k < Wp / bw + 2; k++) { const x = k * bw - off; cx.save(); if (((k % 2) + 2) % 2) { cx.translate(x + bw, 0); cx.scale(-1, 1); cx.drawImage(im, 0, 0, bw, Hp); } else cx.drawImage(im, x, 0, bw, Hp); cx.restore(); } } }
    if (st.shake > 0) { const k = st.shake * 16 * dpr; cx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    // far wall: crystals glinting (parallax 0.3)
    if (!okI('bg')) for (let i = 0; i < 9; i++) { const px0 = ((i * 0.37 - st.x * 0.3) % 1.6 + 1.6) % 1.6 - 0.2, py = Hp * (0.12 + ((i * 0.53) % 0.2)), tw = 0.6 + 0.4 * Math.sin(st.t * 2 + i);
      cx.fillStyle = ['#b18cff', '#6fd6ff', '#ff9ed0'][i % 3]; cx.globalAlpha = 0.55 * tw; cx.beginPath(); cx.moveTo(px0 * u, py - 9 * dpr); cx.lineTo(px0 * u + 5 * dpr, py); cx.lineTo(px0 * u, py + 9 * dpr); cx.lineTo(px0 * u - 5 * dpr, py); cx.closePath(); cx.fill(); }
    cx.globalAlpha = 1;
    // wooden supports (parallax 1) and lamps on them
    for (let k = Math.floor((st.x - PX) / 0.5) - 1; k < Math.floor((st.x - PX) / 0.5) + 4; k++) {
      const x = sx(k * 0.5);
      if (okI('frame')) { if (k % 2 === 0) { frame9(x, Hp * 0.06, Hp * 0.9, u * 0.5); pic('lantern', x, Hp * 0.27, null, Hp * 0.1, 0.5, 0); const g = cx.createRadialGradient(x, Hp * 0.33, 2, x, Hp * 0.33, 70 * dpr); g.addColorStop(0, '#ffd77a88'); g.addColorStop(1, '#ffd77a00'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, Hp * 0.33, 70 * dpr, 0, 7); cx.fill(); } else if (((k % 4) + 4) % 4 === 1) pic('crystals', x, Hp * 0.93, u * 0.13, null); continue; }
      cx.fillStyle = '#6b4a2e'; cx.fillRect(x - 6 * dpr, Hp * 0.06, 12 * dpr, Hp * 0.9); cx.fillRect(x - 40 * dpr, Hp * 0.06, 80 * dpr, 12 * dpr);
      if (k % 2 === 0) { const g = cx.createRadialGradient(x, Hp * 0.13, 2, x, Hp * 0.13, 60 * dpr); g.addColorStop(0, '#ffd77acc'); g.addColorStop(1, '#ffd77a00'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, Hp * 0.13, 60 * dpr, 0, 7); cx.fill(); cx.fillStyle = '#ffe9a8'; cx.beginPath(); cx.arc(x, Hp * 0.13, 5 * dpr, 0, 7); cx.fill(); }
    }
    // rails with sleepers
    for (const ly of LANES) {
      const y = ly * Hp;
      for (let k = Math.floor((st.x - PX) / 0.08) - 1; k < Math.floor((st.x - PX) / 0.08) + 16; k++) { const x = sx(k * 0.08); cx.fillStyle = '#5a3f28'; cx.fillRect(x - 3 * dpr, y - 2 * dpr, 6 * dpr, 14 * dpr); }
      cx.fillStyle = '#b9b2c4'; cx.fillRect(0, y, Wp, 3 * dpr); cx.fillStyle = '#8e869b'; cx.fillRect(0, y + 9 * dpr, Wp, 2 * dpr);
    }
    // obstacles
    for (const b of st.obs) { if (b.row || b.done) continue; const x = sx(b.x), y = LANES[b.l] * Hp;
      if (b.k === 'gap' && okI('barrier')) { cx.fillStyle = '#120d18'; cx.beginPath(); cx.ellipse(x, y + 6 * dpr, 0.075 * u, 13 * dpr, 0, 0, 7); cx.fill(); pic('barrier', x, y + 4 * dpr, u * 0.17, null); continue; }
      if (b.k !== 'gap' && pic('rubble', x, y + 6 * dpr, u * 0.19, null)) continue;
      if (b.k === 'gap') { cx.fillStyle = '#120d18'; cx.beginPath(); cx.ellipse(x, y + 6 * dpr, 0.07 * u, 12 * dpr, 0, 0, 7); cx.fill(); cx.fillStyle = '#e8a33a'; cx.fillRect(x - 0.075 * u, y - 26 * dpr, 4 * dpr, 26 * dpr); cx.fillRect(x + 0.07 * u, y - 26 * dpr, 4 * dpr, 26 * dpr); cx.fillStyle = '#ffcf4a'; cx.fillRect(x - 0.075 * u, y - 28 * dpr, 0.15 * u, 6 * dpr); }
      else rock(x, y, 0.07 * u, b.seed); }
    // items
    for (const it of st.items) { if (it.got) continue; const x = sx(it.x), y = LANES[it.l] * Hp - 14 * dpr, bob = Math.sin(st.t * 5 + it.x * 9) * 2 * dpr;
      if (pic(it.k, x, y + bob + 8 * dpr, u * (it.k === 'gem' ? 0.05 : it.k === 'helmet' ? 0.085 : 0.065), null, 0.5, 0.6)) continue;
      if (it.k === 'ore') { cx.fillStyle = '#e0a640'; cx.strokeStyle = '#7a5320'; cx.lineWidth = 1.5 * dpr; cx.beginPath(); cx.moveTo(x - 8 * dpr, y + bob); cx.lineTo(x - 3 * dpr, y - 7 * dpr + bob); cx.lineTo(x + 6 * dpr, y - 5 * dpr + bob); cx.lineTo(x + 8 * dpr, y + 3 * dpr + bob); cx.lineTo(x, y + 7 * dpr + bob); cx.closePath(); cx.fill(); cx.stroke(); cx.fillStyle = '#fff3c4'; cx.fillRect(x - 2 * dpr, y - 4 * dpr + bob, 3 * dpr, 3 * dpr); }
      else if (it.k === 'gem') { const s = 11 * dpr; cx.fillStyle = '#ff7fc0'; cx.strokeStyle = '#8c2d63'; cx.lineWidth = 1.5 * dpr; cx.beginPath(); cx.moveTo(x, y - s + bob); cx.lineTo(x + s * 0.8, y - s * 0.2 + bob); cx.lineTo(x, y + s + bob); cx.lineTo(x - s * 0.8, y - s * 0.2 + bob); cx.closePath(); cx.fill(); cx.stroke(); cx.fillStyle = '#ffe0f0'; cx.beginPath(); cx.arc(x - s * 0.25, y - s * 0.35 + bob, s * 0.18, 0, 7); cx.fill(); }
      else { const s = 12 * dpr; cx.fillStyle = '#f2c03a'; cx.strokeStyle = '#7a5a10'; cx.lineWidth = 1.5 * dpr; cx.beginPath(); cx.arc(x, y + bob, s, Math.PI, 0); cx.closePath(); cx.fill(); cx.stroke(); cx.fillStyle = '#fff6c0'; cx.beginPath(); cx.arc(x, y - s * 0.5 + bob, s * 0.28, 0, 7); cx.fill(); } }
    // the cart and its rider
    const cxp = PX * u, cyp = st.y * Hp, cw = 0.16 * u, ch = 0.075 * u, fh = u * 0.15;
    cx.save(); cx.translate(cxp, cyp); cx.rotate(st.over ? Math.min(1.2, st.deadT * 2.5) : st.tilt);
    if (ok(me)) { const fw = fh * me.naturalWidth / me.naturalHeight; cx.save(); if (o.faceLeft) cx.scale(-1, 1); cx.drawImage(me, -fw / 2, (okI('cart') ? 9 * dpr - cw * 1.25 * 0.74 - fh * 0.62 : -ch - fh * 0.78) + Math.sin(st.t * 18) * dpr, fw, fh); cx.restore(); }
    if (st.shield && !okI('cart')) { cx.fillStyle = '#f2c03a'; cx.beginPath(); cx.arc(0, -ch - fh * 0.72, fh * 0.2, Math.PI, 0); cx.fill(); }
    if (okI('cart')) { if (st.shield) pic('helmet', 0, 9 * dpr - cw * 1.25 * 0.74 - fh * 0.5, fh * 0.42, null, 0.5, 1); pic('cart', 0, 9 * dpr, cw * 1.25, null); }
    else {
    cx.fillStyle = '#7a5235'; cx.strokeStyle = '#3e2818'; cx.lineWidth = 2.5 * dpr; cx.beginPath(); cx.moveTo(-cw / 2, -ch); cx.lineTo(cw / 2, -ch); cx.lineTo(cw / 2 - cw * 0.12, 0); cx.lineTo(-cw / 2 + cw * 0.12, 0); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle = '#a7a0b3'; cx.fillRect(-cw / 2, -ch, cw, 5 * dpr); cx.fillRect(-cw * 0.05, -ch, 4 * dpr, ch);
    for (const wx of [-cw * 0.28, cw * 0.28]) { cx.fillStyle = '#2f2a36'; cx.beginPath(); cx.arc(wx, 2 * dpr, 7 * dpr, 0, 7); cx.fill(); cx.fillStyle = '#9b93a8'; cx.save(); cx.translate(wx, 2 * dpr); cx.rotate(st.x * 40); cx.fillRect(-1 * dpr, -6 * dpr, 2 * dpr, 12 * dpr); cx.restore(); } }
    cx.restore();
    if (!st.over && st.started && st.speed > 0.6) for (let k = 0; k < 1; k++) st.fx.push({ x: PX - 0.06, y: st.y * H / W + 0.005, vx: -0.4, vy: -Math.random() * 0.2, t: 0, life: 0.3, col: '#ffcf6a' });
    for (const p of st.fx) { cx.globalAlpha = 1 - p.t / p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x * u, p.y * u, (2 + 3 * (1 - p.t / p.life)) * dpr, 0, 7); cx.fill(); }
    cx.globalAlpha = 1;
    // darkness: only the lamp around the cart
    if (st.dark.dur > 0) { const a = Math.min(1, st.dark.dur * 2, (4 - st.dark.dur) * 3); const g = cx.createRadialGradient(cxp + 0.12 * u, cyp - ch, u * 0.08, cxp + 0.12 * u, cyp - ch, u * 0.42);
      g.addColorStop(0, 'rgba(10,6,16,0)'); g.addColorStop(1, `rgba(10,6,16,${0.93 * a})`); cx.fillStyle = g; cx.fillRect(0, 0, Wp, Hp); }
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const p of st.texts) { cx.globalAlpha = Math.min(1, (1.1 - p.t) * 3); cx.font = `900 ${Math.round(18 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; const y = (p.y - p.t * 0.06) * Hp; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b2236'; cx.strokeText(p.s, p.x * u, y); cx.fillStyle = p.col; cx.fillText(p.s, p.x * u, y); }
    cx.globalAlpha = 1;
    if (!st.started) { cx.font = `800 ${Math.round(16 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b2236'; cx.fillStyle = '#ffe9a8';
      for (const [s, y] of [['Нажми выше вагонетки — на верхний рельс,', 0.2], ['ниже — на нижний. Объезжай завалы!', 0.25], ['Нажми, чтобы поехать', 0.31]]) { cx.strokeText(s, Wp / 2, Hp * y); cx.fillText(s, Wp / 2, Hp * y); } }
  }
  const ok = (im) => im && im.complete && im.naturalWidth;
  let raf = 0, last = performance.now(), alive = true;
  function loop(now) {
    if (!alive) return;
    let dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
    if (!document.hidden) while (dt > 0) { const h = Math.min(0.02, dt); step(h); dt -= h; }
    draw(); raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const onResize = () => fit(); window.addEventListener('resize', onResize);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointerup', onUp); window.removeEventListener('resize', onResize); },
    get state() { return st; },
    crash() { if (!st.over) { st.shield = false; crash(null); } },   // test hook
    revive() {   // continue from the same place (moonstones): 2.5 s through rubble, the rows right ahead cleared
      st.over = false; st.ended = false; st.deadT = 0; st.grace = 2.5;
      for (const b of st.obs) if (!b.row && b.x - st.x < 0.9) b.done = true;
      st.texts.push({ x: 0.5, y: 0.25, s: 'Едем дальше!', t: 0, col: '#ffd76a' });
    },
  };
}
