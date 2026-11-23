// Mini-game 2 «Полёт через кольца» (Maria 2026-11-23: her picks — she chooses who flies, the round lasts until the first storm
// cloud, it lives behind the 🧪 pill next to «Зельеварка» with shared tries, art from one SYNTX sheet).
// Only the gameplay lives here: runFlight(box, opts) draws into its own canvas and calls opts.onEnd(result) once.
// The shell (start screen, tries, reward, weekly table) stays in minigame.js.

const ART_V = 2;
const WIND_ACC = 1.1;   // W per s^2 of a gust   // 2: ring re-cut (her «Кольцо обрезается снизу»)
const ART = ['ring', 'storm1', 'storm2', 'spark', 'cloud1', 'cloud2', 'feather', 'castle', 'rainbow'];
const imgs = {};
export function loadFlightArt() {
  for (const k of ART) if (!imgs[k]) { const im = new Image(); im.src = `assets/flight/${k}.webp?v=${ART_V}`; im.onerror = () => { im.bad = true; }; imgs[k] = im; }
}
const ok = (im) => im && !im.bad && im.complete && im.naturalWidth;

// tuning (CSS px are scaled by the canvas width W, so phones of any size play the same)
const G = 2.1, LIFT = 2.5, VMAX = 1.25;        // in W per second^2 / W per second
const SPEED0 = 0.40, SPEED_MAX = 0.78, SPEED_UP = 0.006;   // W per second, growth per second
const GAP0 = 0.40, GAP_MIN = 0.25, GAP_DOWN = 0.0035;      // gap between storm clouds, share of the height, shrink per gate
const STEP = 0.78;                                          // distance between gates in W
export const PTS = { ring: 10, center: 5, spark: 2, feather: 5 };

export function runFlight(box, o) {
  box.innerHTML = '';
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
  const st = { t: 0, started: false, over: false, hold: false, x: 0, y: 0.45, vy: 0, speed: SPEED0, score: 0, rings: 0, sparks: 0, streak: 0, shield: !!(P.shield || B.shield),
    magnet: Math.max(P.magnet || 0, B.magnet ? 0.24 : 0), wind: { t: 11 + Math.random() * 5, dur: 0, dir: 0, warned: false }, rainbows: 0,
    gates: [], items: [], fx: [], texts: [], bg: [], lastGap: 0.45, gateN: 0, deadT: 0, shake: 0 };
  // background clouds (parallax)
  for (let k = 0; k < 6; k++) st.bg.push({ x: Math.random() * 1.6, y: 0.05 + Math.random() * 0.6, s: 0.25 + Math.random() * 0.3, k: Math.random() < 0.6 ? 'cloud1' : 'cloud2', p: 0.25 + Math.random() * 0.25 });
  const me = new Image(); me.src = o.img;
  const R = () => 0.075;   // creature radius in W
  function addGate() {
    const gap = Math.max(GAP_MIN, GAP0 - GAP_DOWN * st.gateN);
    let c = 0.2 + gap / 2 + Math.random() * (0.8 - gap) * 0.85;
    c = Math.max(st.lastGap - 0.32, Math.min(st.lastGap + 0.32, c)); c = Math.max(0.08 + gap / 2, Math.min(0.92 - gap / 2, c));
    const moving = st.gateN > 6 && Math.random() < 0.4, amp = moving ? 0.05 + Math.random() * 0.04 : 0;
    if (amp) c = Math.max(0.08 + gap / 2 + amp, Math.min(0.92 - gap / 2 - amp, c));
    st.lastGap = c; st.gateN++;
    const x = st.gates.length ? st.gates[st.gates.length - 1].x + STEP : 1.1;   // the first gate comes after a short free flight
    st.gates.push({ x, c, cc: c, amp, ph: Math.random() * 6.3, gap, done: false, rb: st.gateN > 5 && st.gateN % 7 === 0, k: Math.random() < 0.5 ? 'storm1' : 'storm2', seed: Math.random() * 1000 });
    // sparkles on a soft wave towards the next gate; now and then a golden feather (a shield against one cloud)
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const u = (i + 1) / (n + 1); st.items.push({ x: x + 0.18 + u * (STEP - 0.36), y: c + Math.sin(u * Math.PI * 2 + Math.random()) * gap * 0.25, k: 'spark', got: false }); }
    if (st.gateN > 4 && Math.random() < 0.12 * (P.featherK || 1) && !st.shield) st.items.push({ x: x + STEP / 2, y: c, k: 'feather', got: false });
  }
  for (let k = 0; k < 4; k++) addGate();

  // ---- input: hold to rise ----
  const down = (e) => { e.preventDefault(); if (st.over) return; st.hold = true; if (!st.started) { st.started = true; o.onStart && o.onStart(); } };
  const up = () => { st.hold = false; };
  cv.addEventListener('pointerdown', down); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  cv.style.touchAction = 'none';

  function hitGate(g) {   // circle against the two cloud columns of a gate (a little forgiving)
    const r = R() * 0.72 * (P.slim ? 0.82 : 1), gx = g.x - st.x + 0.28, half = 0.09;
    if (Math.abs(gx - 0.28) > half + r) return false;
    const yTop = (g.cc - g.gap / 2) * H / W, yBot = (g.cc + g.gap / 2) * H / W, y = st.y * H / W;
    return y - r < yTop || y + r > yBot;
  }
  function crash() {
    if (st.shield) { st.shield = false; st.shake = 0.3; st.texts.push({ x: 0.28, y: st.y, s: 'Перо спасло!', t: 0, col: '#e0a400' }); o.snd && o.snd('special'); st.vy = -0.6; st.grace = 0.8; return; }
    st.over = true; st.deadT = 0; st.shake = 0.4; o.snd && o.snd('nope');
    for (let k = 0; k < 18; k++) st.fx.push({ x: 0.28, y: st.y * H / W, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.7) * 0.8, t: 0, life: 0.9, col: ['#b9a3e6', '#ffffff', '#ffd76a'][k % 3] });
  }
  function step(dt) {
    st.t += dt;
    st.bg.forEach((b) => { b.x -= (st.started ? st.speed : 0.08) * b.p * dt; if (b.x < -0.6) { b.x = 1.3 + Math.random() * 0.4; b.y = 0.05 + Math.random() * 0.6; } });
    st.fx = st.fx.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.9 * dt; return p.t < p.life; });
    st.texts = st.texts.filter((p) => (p.t += dt) < 1.1);
    st.shake = Math.max(0, st.shake - dt);
    if (st.over) { st.deadT += dt; st.vy += G * dt; st.y += st.vy * dt * W / H; if (st.deadT > 1.3 && !st.ended) { st.ended = true; o.onEnd({ score: st.score, rings: st.rings, sparks: st.sparks }); } return; }
    if (!st.started) { st.y = 0.45 + Math.sin(st.t * 3) * 0.015; return; }
    st.speed = Math.min(SPEED_MAX, st.speed + SPEED_UP * dt);
    st.vy += (st.hold ? -LIFT : G) * dt; st.vy = Math.max(-VMAX, Math.min(VMAX, st.vy));
    st.y += st.vy * dt * W / H;
    if (st.y < 0.04) { st.y = 0.04; st.vy = Math.max(0, st.vy); } if (st.y > 0.96) { st.y = 0.96; st.vy = Math.min(0, st.vy); }   // the sky has soft edges
    for (const g of st.gates) g.cc = g.c + (g.amp ? g.amp * Math.sin(st.t * 1.3 + g.ph) : 0);
    const W8 = st.wind;   // a gust now and then: a warning first, then 2.5 s of wind up or down
    if (st.t > 10) {
      if (W8.dur > 0) { W8.dur -= dt; if (!P.windImmune) st.vy += W8.dir * WIND_ACC * dt; if (W8.dur <= 0) { W8.t = 12 + Math.random() * 6; W8.warned = false; } }
      else { W8.t -= dt; if (W8.t <= 1.2 && !W8.warned) { W8.warned = true; W8.dir = Math.random() < 0.5 ? -1 : 1; st.texts.push({ x: 0.42, y: 0.12, s: P.windImmune ? 'Ветер! (тебе не страшен)' : W8.dir < 0 ? 'Ветер вверх!' : 'Ветер вниз!', t: 0, col: '#4a7bd0' }); } if (W8.t <= 0) W8.dur = 2.5; }
    }
    st.x += st.speed * (B.slow && st.t < 25 ? 0.85 : 1) * dt; st.grace = Math.max(0, (st.grace || 0) - dt);
    if (st.gates.length && st.gates[st.gates.length - 1].x - st.x < 1.6) addGate();
    for (const g of st.gates) {
      if (!st.grace && hitGate(g)) { crash(); return; }
      if (!g.done && g.x - st.x + 0.28 < 0.28) {   // passed through the ring of this gate
        g.done = true; st.rings++; st.streak++;
        const center = Math.abs(st.y - g.cc) < g.gap * 0.18;
        const pts = (PTS.ring + (center ? PTS.center : 0)) * (g.rb ? 2 : 1); st.score += pts; if (g.rb) { st.rainbows++; o.snd && o.snd('special'); }
        st.texts.push({ x: 0.36, y: st.y - 0.04, s: g.rb ? `Радуга! +${pts}` : center ? `Точно! +${pts}` : `+${pts}`, t: 0, col: center ? '#ff6fa5' : '#7b5cd6' });
        o.snd && o.snd('pop', Math.min(9, st.streak % 10));
        for (let k = 0; k < 8; k++) st.fx.push({ x: 0.28, y: g.cc * H / W, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, t: 0, life: 0.6, col: '#ffd76a' });
        o.onScore && o.onScore(st.score, st.rings);
      }
    }
    for (const it of st.items) {
      if (it.got) continue;
      if (st.magnet && it.k === 'spark') { const mx = it.x - st.x, my = (it.y - st.y) * H / W; if (mx > -0.05 && Math.hypot(mx, my) < st.magnet) { const k = Math.min(1, 7 * dt); it.x -= mx * k; it.y -= (it.y - st.y) * k; } }   // magnet pulls sparkles in
      const dx = it.x - st.x, dy = (it.y - st.y) * H / W;
      if (Math.hypot(dx, dy) < R() * 0.95) {
        it.got = true;
        if (it.k === 'spark') { st.sparks++; st.score += PTS.spark + (P.spark || 0); o.snd && o.snd('tick'); }
        else { st.shield = true; st.score += PTS.feather; st.texts.push({ x: 0.36, y: st.y - 0.05, s: 'Золотое перо — защита!', t: 0, col: '#e0a400' }); o.snd && o.snd('brew'); }
        o.onScore && o.onScore(st.score, st.rings);
      }
    }
    st.gates = st.gates.filter((g) => g.x - st.x > -0.6); st.items = st.items.filter((it) => it.x - st.x > -0.4);
  }
  function drawImg(k, x, y, w, h, a = 1) {   // w or h may be null: the picture keeps its own proportions
    const im = imgs[k]; if (!ok(im)) return false; const r = im.naturalHeight / im.naturalWidth;
    if (w == null) w = h / r; else if (h == null) h = w * r; else { const k2 = Math.min(w, h / r); w = k2; h = k2 * r; }
    cx.globalAlpha = a; cx.drawImage(im, x - w / 2, y - h / 2, w, h); cx.globalAlpha = 1; return true;
  }
  function draw() {
    const Wp = W * dpr, Hp = H * dpr, u = Wp;   // 1 world unit = canvas width
    cx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = cx.createLinearGradient(0, 0, 0, Hp); sky.addColorStop(0, '#cdb8f2'); sky.addColorStop(0.55, '#f6d2ea'); sky.addColorStop(1, '#ffe8d6');
    cx.fillStyle = sky; cx.fillRect(0, 0, Wp, Hp);
    if (st.shake > 0) { const k = st.shake * 16 * dpr; cx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    // far: the school castle and a rainbow drifting very slowly
    const far = -((st.x * 0.06) % 2.4);
    for (const off of [0, 2.4]) { drawImg('rainbow', (far + off + 0.9) * u, Hp * 0.42, u * 0.9, null, 0.45); drawImg('castle', (far + off + 0.35) * u, Hp - u * 0.3, null, u * 0.62, 0.55); }
    for (const b of st.bg) drawImg(b.k, b.x * u, b.y * Hp, u * b.s * 1.6, null, 0.8);
    // gates: storm clouds above and below the gap, the ring in the gap
    for (const g of st.gates) {
      const gx = (g.x - st.x + 0.28) * u, top = (g.cc - g.gap / 2) * Hp, bot = (g.cc + g.gap / 2) * Hp, cw = u * 0.24, ch = u * 0.17;
      for (let y = top - ch * 0.45, i = 0; y > -ch; y -= ch * 0.72, i++) drawImg(g.k, gx + Math.sin(g.seed + i) * u * 0.02, y, cw, null) || (cx.fillStyle = '#7d6f9a', cx.beginPath(), cx.arc(gx, y, ch * 0.45, 0, 7), cx.fill());
      for (let y = bot + ch * 0.45, i = 0; y < Hp + ch; y += ch * 0.72, i++) drawImg(g.k, gx + Math.cos(g.seed + i) * u * 0.02, y, cw, null) || (cx.fillStyle = '#7d6f9a', cx.beginPath(), cx.arc(gx, y, ch * 0.45, 0, 7), cx.fill());
      const rh = g.gap * Hp * 0.92;
      if (g.rb && !g.done) { const rg = cx.createRadialGradient(gx, g.cc * Hp, rh * 0.1, gx, g.cc * Hp, rh * 0.62); ['#ff9ec7aa', '#ffd76aaa', '#9be7a8aa', '#9fc8ffaa', '#c9a7ff00'].forEach((col, i) => rg.addColorStop(i / 4, col)); cx.fillStyle = rg; cx.beginPath(); cx.ellipse(gx, g.cc * Hp, rh * 0.42, rh * 0.62, 0, 0, 7); cx.fill(); }
      if (!drawImg('ring', gx, g.cc * Hp, null, rh, g.done ? 0.35 : 1)) { cx.strokeStyle = g.done ? '#f2c03a66' : '#f2c03a'; cx.lineWidth = 6 * dpr; cx.beginPath(); cx.ellipse(gx, g.cc * Hp, rh * 0.18, rh * 0.48, 0, 0, 7); cx.stroke(); }
    }
    for (const it of st.items) {
      if (it.got) continue;
      const x = (it.x - st.x + 0.28) * u, y = it.y * Hp, s = u * (it.k === 'feather' ? 0.11 : 0.06) * (1 + 0.1 * Math.sin(st.t * 6 + it.x * 9));
      if (!drawImg(it.k, x, y, s, s * 1.3)) { cx.fillStyle = '#f2c03a'; cx.beginPath(); cx.arc(x, y, s * 0.35, 0, 7); cx.fill(); }
    }
    if (st.wind.dur > 0) {   // wind streaks
      cx.strokeStyle = 'rgba(255,255,255,0.7)'; cx.lineWidth = 2 * dpr; cx.lineCap = 'round';
      for (let k = 0; k < 14; k++) { const sx = ((k * 0.37 + st.t * 1.7) % 1.2 - 0.1) * Wp, sy = ((k * 0.61) % 1) * Hp + st.wind.dir * ((st.t * 260 * dpr) % (Hp * 0.2)); cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(sx - 40 * dpr, sy - st.wind.dir * 14 * dpr); cx.stroke(); }
    }
    // the flyer
    const fx = 0.28 * u, fy = st.y * Hp, fh = u * 0.2;
    if (ok(me)) {
      const fw = fh * me.naturalWidth / me.naturalHeight, flap = st.hold && !st.over ? 1 + 0.06 * Math.sin(st.t * 30) : 1;
      cx.save(); cx.translate(fx, fy); cx.rotate(st.over ? st.deadT * 5 : Math.max(-0.45, Math.min(0.5, st.vy * 0.35)));
      if (o.faceLeft) cx.scale(-1, 1);
      if (st.shield) { const g = cx.createRadialGradient(0, 0, fh * 0.2, 0, 0, fh * 0.7); g.addColorStop(0, '#fff6b000'); g.addColorStop(0.8, '#ffd76a88'); g.addColorStop(1, '#ffd76a00'); cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, fh * 0.7, 0, 7); cx.fill(); }
      cx.drawImage(me, -fw / 2, -fh / 2 * flap, fw, fh * flap); cx.restore();
    } else { cx.fillStyle = '#b98be8'; cx.beginPath(); cx.arc(fx, fy, u * 0.06, 0, 7); cx.fill(); }
    if (st.hold && !st.over) for (let k = 0; k < 2; k++) st.fx.push({ x: 0.22, y: st.y * H / W + 0.03, vx: -0.3 - Math.random() * 0.2, vy: (Math.random() - 0.3) * 0.2, t: 0, life: 0.45, col: ['#ffffff', '#ffd76a', '#f6b3d6'][k + Math.floor(Math.random() * 2)] });
    for (const p of st.fx) { cx.globalAlpha = 1 - p.t / p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x * u, p.y * u, (2 + 3 * (1 - p.t / p.life)) * dpr, 0, 7); cx.fill(); }
    cx.globalAlpha = 1; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const p of st.texts) { cx.globalAlpha = Math.min(1, (1.1 - p.t) * 3); cx.font = `900 ${Math.round(18 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; const y = (p.y - p.t * 0.06) * Hp; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#fff'; cx.strokeText(p.s, Math.min(Wp - 90 * dpr, p.x * u + 40 * dpr), y); cx.fillStyle = p.col; cx.fillText(p.s, Math.min(Wp - 90 * dpr, p.x * u + 40 * dpr), y); }
    cx.globalAlpha = 1;
    if (!st.started) { cx.font = `800 ${Math.round(17 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#fff'; const s = 'Нажми и держи — взлетишь, отпусти — опустишься'; cx.strokeText(s, Wp / 2, Hp * 0.78); cx.fillStyle = '#5a3fb0'; cx.fillText(s, Wp / 2, Hp * 0.78); }
  }
  let raf = 0, last = performance.now(), alive = true;
  function loop(now) {
    if (!alive) return;
    let dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;   // a slow frame is split into small steps: the flight never runs in slow motion
    if (!document.hidden) while (dt > 0) { const h = Math.min(0.02, dt); step(h); dt -= h; }
    draw();
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const onResize = () => fit(); window.addEventListener('resize', onResize);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('resize', onResize); },
    get state() { return st; },
    crash() { if (!st.over) { st.shield = false; crash(); } },   // test hook
  };
}
