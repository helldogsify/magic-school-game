// World-2 mini-game «Башня из руды» (Maria 2026-11-25, her pick 2 of the world-2 ideas). A crane swings a block of ore; a tap drops it
// on the tower. What hangs over the edge breaks off, so the next block is narrower; a perfect drop keeps the width, three perfect drops
// in a row widen it back. A block that misses the tower ends the round. Handle like runFlight: stop, state, crash, revive.

const ART_V = 1, imgs = {};
const BLOCKS = ['b_gold', 'b_copper', 'b_silver'];
export function loadTowerArt() { for (const k of ['b_gold', 'b_copper', 'b_silver', 'b_crystal', 'crane', 'base', 'star', 'dust']) if (!imgs[k]) { const im = new Image(); im.src = `assets/tower/${k}.webp?v=${ART_V}`; imgs[k] = im; }
  if (!imgs.bg) { const im = new Image(); im.src = 'assets/cart/bg.webp?v=1'; imgs.bg = im; } }
const okI = (k) => { const im = imgs[k]; return im && im.complete && im.naturalWidth ? im : null; };
export const PTS = { block: 10, perfect: 5, crystal: 20 };
const W0 = 0.56, BH = 0.065, PERFECT = 0.018;   // first block width (share of the screen width), block height (share of the height), perfect tolerance

export function runTower(box, o) {
  loadTowerArt(); box.innerHTML = '';
  const cv = document.createElement('canvas'); cv.className = 'fl-cv'; box.appendChild(cv);
  const cx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function fit() { const r = box.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.max(200, r.width); H = Math.max(300, r.height);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  fit();
  const st = { t: 0, started: false, over: false, ended: false, score: 0, rings: 0, sparks: 0, streak: 0, tower: [{ x: 0.5, w: W0, img: 'base', base: true }], hang: null, fall: null, chips: [], fx: [], texts: [], cam: 0, deadT: 0, shake: 0, grace: 0 };
  function nextBlock() {
    const top = st.tower[st.tower.length - 1], n = st.tower.length, crystal = n % 10 === 0;
    st.hang = { w: top.w, img: crystal ? 'b_crystal' : BLOCKS[n % 3], crystal, ph: Math.random() * 6.3, sp: Math.min(3.6, 1.5 + n * 0.06), amp: Math.min(0.4, 0.26 + n * 0.006) };
  }
  nextBlock();
  const hangX = () => 0.5 + st.hang.amp * Math.sin(st.hang.ph);
  const onDown = (e) => { e.preventDefault(); if (st.over) return; if (!st.started) { st.started = true; o.onStart && o.onStart(); return; } if (st.fall || !st.hang) return;
    st.fall = { x: hangX(), w: st.hang.w, img: st.hang.img, crystal: st.hang.crystal, y: hookY(), vy: 0 }; st.hang = null; o.snd && o.snd('tick'); };
  cv.addEventListener('pointerdown', onDown);
  const topY = () => (st.tower.length) * BH;            // height of the tower top above the ground line, in screen heights
  const hookY = () => topY() + 0.3;                     // the hanging block's bottom
  function land() {
    const f = st.fall, top = st.tower[st.tower.length - 1], l = Math.max(f.x - f.w / 2, top.x - top.w / 2), r = Math.min(f.x + f.w / 2, top.x + top.w / 2);
    st.fall = null;
    if (r - l <= 0.01) { st.chips.push({ x: f.x, w: f.w, y: topY(), vx: (f.x - top.x) * 1.2, vy: 0, rot: 0, img: f.img }); return crash(); }
    let nx = (l + r) / 2, nw = r - l;
    const perfect = Math.abs(f.x - top.x) < PERFECT;
    if (perfect) { nx = top.x; nw = top.w; st.streak++; st.sparks++; if (st.streak % 3 === 0) nw = Math.min(W0, nw + 0.06); }
    else { st.streak = 0; const cutL = f.x - f.w / 2 < top.x - top.w / 2, cw = f.w - nw, cxc = cutL ? l - cw / 2 : r + cw / 2;
      st.chips.push({ x: cxc, w: cw, y: topY(), vx: (cutL ? -1 : 1) * 0.25, vy: 0, rot: 0, img: f.img }); }
    st.tower.push({ x: nx, w: nw, img: f.img });
    const pts = PTS.block + (perfect ? PTS.perfect * st.streak : 0) + (f.crystal ? PTS.crystal : 0);
    st.score += pts; st.rings++;
    st.texts.push({ x: nx, y: topY() + 0.03, s: perfect ? `Идеально! +${pts}` : `+${pts}`, t: 0, col: perfect ? '#ffd76a' : '#ffffff' });
    for (let k = 0; k < (perfect ? 10 : 5); k++) st.fx.push({ x: nx + (Math.random() - 0.5) * nw, y: topY() - BH, vx: (Math.random() - 0.5) * 0.4, vy: Math.random() * 0.3, t: 0, life: 0.6, col: perfect ? '#ffd76a' : '#b9a9c9' });
    o.snd && o.snd(perfect ? 'special' : 'pop', Math.min(9, st.streak)); o.onScore && o.onScore(st.score, st.rings);
    nextBlock();
  }
  function crash() { st.over = true; st.deadT = 0; st.shake = 0.4; o.snd && o.snd('nope'); }
  function step(dt) {
    st.t += dt; st.shake = Math.max(0, st.shake - dt);
    st.fx = st.fx.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 1.2 * dt; return p.t < p.life; });
    st.texts = st.texts.filter((p) => (p.t += dt) < 1.1);
    st.chips = st.chips.filter((c) => { c.x += c.vx * dt; c.vy -= 2.2 * dt; c.y += c.vy * dt; c.rot += c.vx * 6 * dt; return c.y > st.cam - 0.4; });
    const want = Math.max(0, topY() - 0.42); st.cam += (want - st.cam) * Math.min(1, dt * 4);
    if (st.over) { st.deadT += dt; if (st.deadT > 1.2 && !st.ended) { st.ended = true; o.onEnd({ score: st.score, rings: st.rings, sparks: st.sparks }); } return; }
    if (!st.started) return;
    if (st.hang) st.hang.ph += st.hang.sp * dt;
    if (st.fall) { st.fall.vy -= 3.2 * dt; st.fall.y += st.fall.vy * dt; if (st.fall.y <= topY()) { st.fall.y = topY(); land(); } }
  }
  function block(k, x, w, yBottom, rot = 0, a = 1) {   // a block of width w: the full picture (W0 wide) clipped to w, so the texture never stretches
    const Wp = W * dpr, Hp = H * dpr, im = okI(k), py = Hp * (0.92 - (yBottom - st.cam)), h = BH * Hp;
    cx.save(); cx.globalAlpha = a; cx.translate(x * Wp, py - h / 2); cx.rotate(rot);
    if (im) { const fw = W0 * Wp; cx.beginPath(); cx.rect(-w * Wp / 2, -h / 2 - 2, w * Wp, h + 4); cx.clip(); cx.drawImage(im, -fw / 2, -h / 2 - h * 0.08, fw, h * 1.16); }
    else { cx.fillStyle = '#8a7f99'; cx.fillRect(-w * Wp / 2, -h / 2, w * Wp, h); }
    cx.restore();
  }
  function draw() {
    const Wp = W * dpr, Hp = H * dpr, u = Wp;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#2b2236'; cx.fillRect(0, 0, Wp, Hp);
    { const im = okI('bg'); if (im) { const s = Math.max(Wp / im.naturalWidth, Hp / im.naturalHeight) * 1.15, off = (st.cam * Hp * 0.25) % (im.naturalHeight * s); cx.globalAlpha = 0.85; for (const k of [0, -1]) cx.drawImage(im, (Wp - im.naturalWidth * s) / 2, Hp - im.naturalHeight * s + off + k * im.naturalHeight * s, im.naturalWidth * s, im.naturalHeight * s); cx.globalAlpha = 1; } }
    if (st.shake > 0) { const k = st.shake * 16 * dpr; cx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    st.tower.forEach((b, k) => { if (b.base) { const im = okI('base'), py = Hp * (0.92 + st.cam); if (im) { const w = W0 * 1.15 * Wp, h = w * im.naturalHeight / im.naturalWidth; cx.drawImage(im, b.x * Wp - w / 2, py - h * 0.55, w, h); } return; } block(b.img, b.x, b.w, k * BH); });
    for (const c of st.chips) block(c.img, c.x, c.w, c.y, c.rot, 0.9);
    // the crane arm at the top, the hook and the swinging block
    const hy = Hp * (0.92 - (hookY() - st.cam)) - BH * Hp, beamY = Hp * 0.07;   // hy: top edge of the hanging block
    { // the beam: honey wood with planks and bolts, full width
      const bh = Hp * 0.035; cx.fillStyle = '#9c6b3f'; cx.fillRect(0, beamY - bh / 2, Wp, bh); cx.fillStyle = '#b98551'; cx.fillRect(0, beamY - bh / 2, Wp, bh * 0.35);
      cx.strokeStyle = '#4a2f1e'; cx.lineWidth = 2 * dpr; cx.strokeRect(-2, beamY - bh / 2, Wp + 4, bh);
      cx.fillStyle = '#5c5468'; for (let k = 0; k < 6; k++) { cx.beginPath(); cx.arc((k + 0.5) * Wp / 6, beamY, 2.6 * dpr, 0, 7); cx.fill(); } }
    function hoist(x, top, w, loaded) {   // x: centre in screen px, top: the block's top edge, w: block width in px
      const ty = beamY + Hp * 0.018, hookY0 = loaded ? top - Hp * 0.045 : beamY + Hp * 0.09;
      cx.fillStyle = '#5c5468'; cx.strokeStyle = '#2b2236'; cx.lineWidth = 2 * dpr; cx.beginPath(); cx.roundRect(x - 16 * dpr, beamY - 10 * dpr, 32 * dpr, 20 * dpr, 4 * dpr); cx.fill(); cx.stroke();   // trolley
      for (const dx of [-9, 9]) { cx.fillStyle = '#2b2236'; cx.beginPath(); cx.arc(x + dx * dpr, beamY - 10 * dpr, 4 * dpr, 0, 7); cx.fill(); }
      const rope = (x1, y1, x2, y2) => { cx.lineCap = 'round'; cx.strokeStyle = '#5a4128'; cx.lineWidth = 5 * dpr; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); cx.strokeStyle = '#d9b77e'; cx.lineWidth = 3 * dpr; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); };
      rope(x, ty, x, hookY0);
      if (loaded) { rope(x, hookY0 + 6 * dpr, x - w * 0.36, top + 2 * dpr); rope(x, hookY0 + 6 * dpr, x + w * 0.36, top + 2 * dpr); }
      cx.strokeStyle = '#8c8698'; cx.lineWidth = 4 * dpr; cx.beginPath(); cx.arc(x, hookY0 + 6 * dpr, 6 * dpr, Math.PI * 0.15, Math.PI * 1.05); cx.stroke();   // the hook
      cx.fillStyle = '#8c8698'; cx.beginPath(); cx.arc(x, hookY0, 3.5 * dpr, 0, 7); cx.fill();
    }
    if (st.hang) { const x = hangX(); block(st.hang.img, x, st.hang.w, hookY()); hoist(x * Wp, hy, st.hang.w * Wp, true); }
    else hoist((st.fall ? st.fall.x : 0.5) * Wp, hy, 0, false);
    if (st.fall) block(st.fall.img, st.fall.x, st.fall.w, st.fall.y);
    for (const p of st.fx) { cx.globalAlpha = 1 - p.t / p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x * Wp, Hp * (0.92 - (p.y - st.cam)), (2 + 3 * (1 - p.t / p.life)) * dpr, 0, 7); cx.fill(); }
    cx.globalAlpha = 1; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const p of st.texts) { cx.globalAlpha = Math.min(1, (1.1 - p.t) * 3); cx.font = `900 ${Math.round(18 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; const y = Hp * (0.92 - (p.y - st.cam)) - p.t * 40 * dpr; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b2236'; cx.strokeText(p.s, p.x * Wp, y); cx.fillStyle = p.col; cx.fillText(p.s, p.x * Wp, y); }
    cx.globalAlpha = 1;
    cx.font = `900 ${Math.round(16 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; cx.lineWidth = 4 * dpr; cx.strokeStyle = '#2b2236'; cx.fillStyle = '#ffe9a8'; const hs = `Этажей: ${st.tower.length - 1}`; cx.strokeText(hs, Wp / 2, Hp * 0.035); cx.fillText(hs, Wp / 2, Hp * 0.035);
    if (!st.started) { cx.font = `800 ${Math.round(16 * dpr)}px ui-rounded, "Nunito", system-ui, sans-serif`; cx.lineWidth = 5 * dpr;
      for (const [s, y] of [['Кран раскачивает глыбу руды.', 0.42], ['Нажми — и она упадёт на башню.', 0.47], ['Что свисает за край — отвалится!', 0.52], ['Нажми, чтобы начать', 0.6]]) { cx.strokeText(s, Wp / 2, Hp * y); cx.fillText(s, Wp / 2, Hp * y); } }
  }
  let raf = 0, last = performance.now(), alive = true;
  function loop(now) { if (!alive) return; let dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now; if (!document.hidden) while (dt > 0) { const h = Math.min(0.02, dt); step(h); dt -= h; } draw(); raf = requestAnimationFrame(loop); }
  raf = requestAnimationFrame(loop);
  const onResize = () => fit(); window.addEventListener('resize', onResize);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); },
    get state() { return st; },
    drop: () => onDown({ preventDefault() {} }),   // test hook
    crash() { if (!st.over) crash(); },
    revive() { st.over = false; st.ended = false; st.deadT = 0; const top = st.tower[st.tower.length - 1]; top.w = Math.max(top.w, 0.3); st.fall = null; nextBlock(); st.texts.push({ x: 0.5, y: topY() + 0.1, s: 'Строим дальше!', t: 0, col: '#ffd76a' }); },
  };
}
