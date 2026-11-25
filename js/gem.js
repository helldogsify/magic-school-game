// World-2 mini-game «Огранка самоцветов» (Maria 2026-11-25: her picks 1, 2 and 4 of the world-2 ideas, «все очень понравились»).
// Raw stones fly up out of the mine; a swipe of the finger cuts them in two and a cut gem pops out. A stone that falls back uncut
// costs a life (3 lives); a cursed black stone must not be cut (cutting it ends the round). Several stones in one swipe = a combo.
// A golden geode is worth more. The stones come faster and more often. Handle like runFlight: stop, state, crash, revive.

const ART_V = 1, imgs = {};
const STONES = [['r_am', 'g_am'], ['r_ru', 'g_ru'], ['r_em', 'g_em'], ['r_sa', 'g_am']];   // raw stone -> the gem it gives (sapphire shows the violet cut)
export function loadGemArt() { for (const k of ['r_am', 'r_ru', 'r_em', 'r_sa', 'geode', 'curse', 'g_am', 'g_ru', 'g_em']) if (!imgs[k]) { const im = new Image(); im.src = `assets/gem/${k}.webp?v=${ART_V}`; imgs[k] = im; }
  if (!imgs.bg) { const im = new Image(); im.src = 'assets/cart/bg.webp?v=1'; imgs.bg = im; } }
const okI = (k) => { const im = imgs[k]; return im && im.complete && im.naturalWidth ? im : null; };
export const PTS = { stone: 10, geode: 30, combo: 5 };
const G = 1.35;   // gravity in screen heights per s^2

export function runGem(box, o) {
  loadGemArt(); box.innerHTML = '';
  const cv = document.createElement('canvas'); cv.className = 'fl-cv'; box.appendChild(cv);
  const cx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function fit() { const r = box.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.max(200, r.width); H = Math.max(300, r.height);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  fit();
  const st = { t: 0, started: false, over: false, ended: false, score: 0, rings: 0, sparks: 0, lives: 3, combo: 0, best: 0, items: [], bits: [], fx: [], texts: [], trail: [], spawnT: 0.6, grace: 0, deadT: 0, shake: 0 };
  const R = () => 0.085;   // stone radius, share of the width
  function spawn() {
    const lvl = Math.min(1, st.t / 70), n = Math.random() < 0.15 + lvl * 0.4 ? 2 + (Math.random() < lvl * 0.5 ? 1 : 0) : 1;
    for (let k = 0; k < n; k++) {
      const r = Math.random(), kind = st.t > 6 && r < 0.1 + lvl * 0.08 ? 'curse' : r > 0.94 ? 'geode' : 'stone';
      const x = 0.18 + Math.random() * 0.64, vx = (0.5 - x) * (0.25 + Math.random() * 0.35), vy = -(1.25 + Math.random() * 0.3);   // up to ~60% of the height
      st.items.push({ kind, s: STONES[Math.floor(Math.random() * STONES.length)], x, y: 1.08, vx, vy, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, cut: false });
    }
    st.spawnT = Math.max(0.55, 1.5 - st.t * 0.012) * (0.8 + Math.random() * 0.4);
  }
  // ---- input: a swipe ----
  let down = false, last = null, swipeHits = 0;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / W, y: (e.clientY - r.top) / H }; };
  const onDown = (e) => { e.preventDefault(); if (st.over) return; if (!st.started) { st.started = true; st.spawnT = 0.3; o.onStart && o.onStart(); } down = true; last = pos(e); swipeHits = 0; st.trail = [{ ...last, t: st.t }]; };
  const onMove = (e) => { if (!down || st.over) return; const p = pos(e); cutLine(last, p); last = p; st.trail.push({ ...p, t: st.t }); };
  const onUp = () => { if (down && swipeHits >= 3) { const b = PTS.combo * swipeHits; st.score += b; st.texts.push({ x: last.x, y: last.y - 0.05, s: `Серия ×${swipeHits}! +${b}`, t: 0, col: '#ffd76a' }); o.onScore && o.onScore(st.score, st.rings); }
    st.best = Math.max(st.best, swipeHits); down = false; swipeHits = 0; };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  function segHit(a, b, it) {   // the swipe segment passes through the stone (in width units on both axes)
    const ax = a.x, ay = a.y * H / W, bx = b.x, by = b.y * H / W, px = it.x, py = it.y * H / W, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)), qx = ax + dx * u - px, qy = ay + dy * u - py;
    return qx * qx + qy * qy < (R() * 0.9) ** 2 ? Math.atan2(dy, dx) : null;
  }
  function cutLine(a, b) {
    for (const it of st.items) {
      if (it.cut) continue; const ang = segHit(a, b, it); if (ang == null) continue;
      it.cut = true;
      if (it.kind === 'curse') { if (st.grace > 0) { it.gone = true; continue; } return crash(it); }
      swipeHits++;
      const pts = it.kind === 'geode' ? PTS.geode : PTS.stone; st.score += pts; st.rings++; if (it.kind === 'geode') st.sparks++;
      for (const side of [-1, 1]) st.bits.push({ img: it.kind === 'geode' ? 'geode' : it.s[0], x: it.x, y: it.y, vx: it.vx + side * Math.cos(ang + Math.PI / 2) * 0.25, vy: it.vy * 0.3 + side * Math.sin(ang + Math.PI / 2) * 0.25 - 0.2, rot: it.rot, vr: side * 4, ang, side, t: 0 });
      st.fx.push({ img: it.kind === 'geode' ? 'g_ru' : it.s[1], x: it.x, y: it.y, vy: -0.35, t: 0, life: 0.9, gem: true });
      for (let k = 0; k < 8; k++) st.fx.push({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 0.7, vy: (Math.random() - 0.6) * 0.6, t: 0, life: 0.5, col: it.kind === 'geode' ? '#ffd76a' : ['#c9a7ff', '#ff9eb5', '#9be7a8', '#9fc8ff'][STONES.indexOf(it.s)] });
      st.texts.push({ x: it.x, y: it.y - 0.04, s: `+${pts}`, t: 0, col: it.kind === 'geode' ? '#ffd76a' : '#ffffff' });
      o.snd && o.snd(it.kind === 'geode' ? 'special' : 'pop', Math.min(9, swipeHits)); o.onScore && o.onScore(st.score, st.rings);
    }
  }
  function crash(it) {
    st.over = true; st.deadT = 0; st.shake = 0.5; o.snd && o.snd('nope');
    for (let k = 0; k < 22; k++) st.fx.push({ x: it ? it.x : 0.5, y: it ? it.y : 0.5, vx: (Math.random() - 0.5) * 1.1, vy: (Math.random() - 0.5) * 1.1, t: 0, life: 0.9, col: ['#7a3cc8', '#2a2233', '#c9a7ff'][k % 3] });
  }
  function step(dt) {
    st.t += dt; st.shake = Math.max(0, st.shake - dt); st.grace = Math.max(0, st.grace - dt);
    st.fx = st.fx.filter((p) => { p.t += dt; if (p.gem) p.y += p.vy * dt; else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1.4 * dt; } return p.t < p.life; });
    st.texts = st.texts.filter((p) => (p.t += dt) < 1.0); st.trail = st.trail.filter((p) => st.t - p.t < 0.16);
    st.bits = st.bits.filter((b) => { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += G * dt; b.rot += b.vr * dt; return b.y < 1.3; });
    if (st.over) { st.deadT += dt; if (st.deadT > 1.2 && !st.ended) { st.ended = true; o.onEnd({ score: st.score, rings: st.rings, sparks: st.sparks }); } return; }
    if (!st.started) return;
    st.spawnT -= dt; if (st.spawnT <= 0) spawn();
    for (const it of st.items) { it.x += it.vx * dt; it.y += it.vy * dt; it.vy += G * dt; it.rot += it.vr * dt;
      if (it.x < 0.05 || it.x > 0.95) it.vx = -it.vx;
      if (!it.cut && !it.gone && it.vy > 0 && it.y > 1.12) { it.gone = true; if (it.kind !== 'curse') { st.lives--; st.shake = 0.25; st.texts.push({ x: it.x, y: 0.9, s: 'Упал!', t: 0, col: '#ff8a8a' }); o.snd && o.snd('nope'); if (st.lives <= 0) { crash(null); return; } } } }
    st.items = st.items.filter((it) => !it.cut && !it.gone);
  }
  function img(k, x, y, size, rot = 0, a = 1) { const im = okI(k); if (!im) return false; const w = size, h = size * im.naturalHeight / im.naturalWidth; cx.save(); cx.globalAlpha = a; cx.translate(x, y); cx.rotate(rot); cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore(); return true; }
  function draw() {
    const Wp = W * dpr, Hp = H * dpr, u = Wp;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#2b2236'; cx.fillRect(0, 0, Wp, Hp);
    { const im = okI('bg'); if (im) { const s = Math.max(Wp / im.naturalWidth, Hp / im.naturalHeight); cx.globalAlpha = 0.85; cx.drawImage(im, (Wp - im.naturalWidth * s) / 2, (Hp - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s); cx.globalAlpha = 1; } }
    if (st.shake > 0) { const k = st.shake * 16 * dpr; cx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    const size = R() * 2.3 * u;
    for (const it of st.items) { const x = it.x * Wp, y = it.y * Hp;
      if (it.kind === 'curse') { const g = cx.createRadialGradient(x, y, 2, x, y, size * 0.7); g.addColorStop(0, 'rgba(150,60,220,0.45)'); g.addColorStop(1, 'rgba(150,60,220,0)'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, size * 0.7, 0, 7); cx.fill(); }
      if (!img(it.kind === 'stone' ? it.s[0] : it.kind, x, y, it.kind === 'curse' ? size * 0.7 : size, it.rot * 0.25)) { cx.fillStyle = it.kind === 'curse' ? '#222' : '#998'; cx.beginPath(); cx.arc(x, y, size * 0.4, 0, 7); cx.fill(); } }
    for (const b of st.bits) {   // the two halves of a cut stone: the picture clipped along the cut
      const im = okI(b.img), x = b.x * Wp, y = b.y * Hp; if (!im) continue; const w = size, h = size * im.naturalHeight / im.naturalWidth;
      cx.save(); cx.globalAlpha = Math.max(0, 1 - b.t * 1.2); cx.translate(x, y); cx.rotate(b.ang); cx.beginPath(); cx.rect(-w, b.side < 0 ? -h : 0, w * 2, h); cx.clip(); cx.rotate(-b.ang + b.rot * 0.25); cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore(); }
    for (const p of st.fx) { if (p.gem) { img(p.img, p.x * Wp, p.y * Hp, size * 0.75 * (1 + p.t * 0.4), 0, Math.min(1, (p.life - p.t) * 3)); continue; }
      cx.globalAlpha = 1 - p.t / p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x * Wp, p.y * Hp, (2 + 3 * (1 - p.t / p.life)) * dpr, 0, 7); cx.fill(); }
    cx.globalAlpha = 1;
    if (st.trail.length > 1) { cx.lineCap = 'round'; cx.lineJoin = 'round'; for (const [wd, col] of [[10, 'rgba(201,167,255,0.35)'], [4, '#ffffff']]) { cx.lineWidth = wd * dpr; cx.strokeStyle = col; cx.beginPath(); st.trail.forEach((p, k) => (k ? cx.lineTo(p.x * Wp, p.y * Hp) : cx.moveTo(p.x * Wp, p.y * Hp))); cx.stroke(); } }
    // lives: three little gems top left
    for (let k = 0; k < 3; k++) img(k < st.lives ? 'g_ru' : 'g_am', (0.07 + k * 0.08) * Wp, 0.05 * Hp, u * 0.06, 0, k < st.lives ? 1 : 0.25);
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const p of st.texts) { cx.globalAlpha = Math.min(1, (1 - p.t) * 3); cx.font = `900 ${Math.round(18 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; const y = (p.y - p.t * 0.06) * Hp; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b2236'; cx.strokeText(p.s, p.x * Wp, y); cx.fillStyle = p.col; cx.fillText(p.s, p.x * Wp, y); }
    cx.globalAlpha = 1;
    if (!st.started) { cx.font = `800 ${Math.round(16 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b2236'; cx.fillStyle = '#ffe9a8';
      for (const [s, y] of [['Проводи пальцем по камням —', 0.36], ['разрезай их на самоцветы!', 0.41], ['Не режь чёрные проклятые камни.', 0.47], ['Нажми, чтобы начать', 0.55]]) { cx.strokeText(s, Wp / 2, Hp * y); cx.fillText(s, Wp / 2, Hp * y); } }
  }
  let raf = 0, lastT = performance.now(), alive = true;
  function loop(now) { if (!alive) return; let dt = Math.min(0.25, Math.max(0, (now - lastT) / 1000)); lastT = now; if (!document.hidden) while (dt > 0) { const h = Math.min(0.02, dt); step(h); dt -= h; } draw(); raf = requestAnimationFrame(loop); }
  raf = requestAnimationFrame(loop);
  const onResize = () => fit(); window.addEventListener('resize', onResize);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('resize', onResize); },
    get state() { return st; },
    crash() { if (!st.over) crash(null); },
    revive() { st.over = false; st.ended = false; st.deadT = 0; st.lives = Math.max(st.lives, 1); st.grace = 2; st.items = st.items.filter((it) => it.kind !== 'curse'); st.texts.push({ x: 0.5, y: 0.3, s: 'Режем дальше!', t: 0, col: '#ffd76a' }); },
  };
}
