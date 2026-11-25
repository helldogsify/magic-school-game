// World-1 mini-game «Рыбалка» (Maria 2026-11-25, her pick 1 of the new ideas, placed in world 1 as its third game).
// A tap casts the bobber; when it dips under («Клюёт!») a quick tap hooks the fish (too early scares it, too late it is gone).
// Then the fish is pulled in: holding the finger reels and raises the line tension, releasing lets it fall; keep the tension in
// the green zone — too high snaps the line, too low lets the fish go. Fish: blue 10, carp 20, magic 40, golden 80; sometimes a boot (2).
// The round lasts 60 s. Handle like runFlight: stop, state, crash, revive (+15 s).

const ART_V = 1, imgs = {};
export function loadFishArt() { for (const k of ['bg', 'f_blue', 'f_carp', 'f_magic', 'f_gold', 'bobber', 'boot', 'lily', 'reeds', 'pier']) if (!imgs[k]) { const im = new Image(); im.src = `assets/fish/${k}.webp?v=${ART_V}`; imgs[k] = im; } }
const okI = (k) => { const im = imgs[k]; return im && im.complete && im.naturalWidth ? im : null; };
const FISH = [
  { k: 'f_blue', name: 'Голубая рыбка', pts: 10, w: 50, pull: 0.55, size: 0.16 },
  { k: 'f_carp', name: 'Карп', pts: 20, w: 25, pull: 0.8, size: 0.22 },
  { k: 'f_magic', name: 'Волшебная рыба', pts: 40, w: 12, pull: 1.0, size: 0.2 },
  { k: 'f_gold', name: 'Золотая рыбка', pts: 80, w: 4, pull: 1.2, size: 0.17 },
  { k: 'boot', name: 'Старый ботинок', pts: 2, w: 9, pull: 0.3, size: 0.14 },
];
const ROUND = 60, SURF = 0.36;   // round length, water surface (share of the height)

export function runFish(box, o) {
  loadFishArt(); box.innerHTML = '';
  const cv = document.createElement('canvas'); cv.className = 'fl-cv'; box.appendChild(cv);
  const cx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function fit() { const r = box.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1); W = Math.max(200, r.width); H = Math.max(300, r.height);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  fit();
  const st = { t: 0, left: ROUND, started: false, over: false, ended: false, score: 0, rings: 0, sparks: 0, phase: 'idle', bx: 0.5, wait: 0, bite: 0, fakeT: 0, fish: null, tension: 0.4, prog: 0, low: 0, hold: false, shown: null, texts: [], fx: [], deadT: 0, shake: 0, swim: [] };
  for (let k = 0; k < 5; k++) st.swim.push({ f: FISH[k % 4], x: Math.random(), y: SURF + 0.15 + Math.random() * 0.45, v: (Math.random() < 0.5 ? -1 : 1) * (0.04 + Math.random() * 0.05) });
  const say = (s, col = '#fff', y = 0.25) => st.texts.push({ x: 0.5, y, s, t: 0, col });
  function pick() { const sum = FISH.reduce((a, f) => a + f.w, 0); let r = Math.random() * sum; for (const f of FISH) { r -= f.w; if (r <= 0) return f; } return FISH[0]; }
  function cast() { st.phase = 'wait'; st.bx = 0.25 + Math.random() * 0.5; st.wait = 1.2 + Math.random() * 2.8; st.fakeT = 0.5 + Math.random(); o.snd && o.snd('tick'); }
  const onDown = (e) => {
    e.preventDefault(); if (st.over) return;
    if (!st.started) { st.started = true; o.onStart && o.onStart(); cast(); return; }
    if (st.phase === 'idle') return cast();
    if (st.phase === 'wait') { say('Рано! Рыба испугалась', '#ffb0b0'); st.phase = 'idle'; st.shown = null; return; }
    if (st.phase === 'bite') { st.fish = st.fish || pick(); st.phase = 'reel'; st.tension = 0.5; st.vel = 0; st.zc = 0.5; st.zg = 0.5; st.zt = 0.8; st.top = 0; st.prog = 0.25; st.low = 0; st.hold = true; say('Подсекла! Тяни!', '#ffe08a'); o.snd && o.snd('pop', 3); return; }
    if (st.phase === 'reel') st.hold = true;
  };
  const onUp = () => { st.hold = false; };
  cv.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  function catchIt() {
    const f = st.fish; st.score += f.pts; if (f.k !== 'boot') st.rings++; if (f.k === 'f_magic' || f.k === 'f_gold') st.sparks++;
    st.shown = { f, t: 0 }; say(`${f.name}! +${f.pts}`, f.k === 'f_gold' ? '#ffd76a' : f.k === 'boot' ? '#d0c0a0' : '#ffffff', 0.2);
    for (let k = 0; k < 12; k++) st.fx.push({ x: st.bx, y: SURF, vx: (Math.random() - 0.5) * 0.6, vy: -Math.random() * 0.6, t: 0, life: 0.6, col: f.k === 'f_gold' ? '#ffd76a' : '#bff3ff' });
    o.snd && o.snd(f.pts >= 40 ? 'special' : 'pop', 5); o.onScore && o.onScore(st.score, st.rings);
    st.phase = 'idle'; st.fish = null;
  }
  function lose(msg) { say(msg, '#ffb0b0'); st.phase = 'idle'; st.fish = null; o.snd && o.snd('nope'); }
  function step(dt) {
    st.t += dt; st.shake = Math.max(0, st.shake - dt);
    st.texts = st.texts.filter((p) => (p.t += dt) < 1.3); st.fx = st.fx.filter((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1.4 * dt; return p.t < p.life; });
    for (const s of st.swim) { s.x += s.v * dt; if (s.x < -0.2 || s.x > 1.2) s.v = -s.v; }
    if (st.shown) { st.shown.t += dt; if (st.shown.t > 1.4) st.shown = null; }
    if (st.over) { st.deadT += dt; if (st.deadT > 1 && !st.ended) { st.ended = true; o.onEnd({ score: st.score, rings: st.rings, sparks: st.sparks }); } return; }
    if (!st.started) return;
    st.left -= dt; if (st.left <= 0) { st.left = 0; st.over = true; st.deadT = 0; say('Время вышло!', '#ffe08a'); o.snd && o.snd('end'); return; }
    if (st.phase === 'wait') { st.fakeT -= dt; if (st.fakeT <= 0) { st.fakeT = 0.6 + Math.random() * 1.2; st.twitch = 0.25; } st.twitch = Math.max(0, (st.twitch || 0) - dt);
      st.wait -= dt; if (st.wait <= 0) { st.phase = 'bite'; st.fish = pick(); st.bite = st.fish.pts >= 40 ? 0.45 : st.fish.pts >= 20 ? 0.58 : 0.7; o.snd && o.snd('tick'); } }
    else if (st.phase === 'bite') { st.bite -= dt; if (st.bite <= 0) lose('Сорвалась… Нажимай, когда поплавок нырнёт!'); }
    else if (st.phase === 'reel') {
      const f = st.fish, zh = Math.max(0.16, 0.42 - f.pull * 0.2);   // the green zone: narrower for stronger fish
      st.zt -= dt; if (st.zt <= 0) { st.zt = 0.5 + Math.random() * (1.4 - f.pull * 0.6); st.zg = zh / 2 + Math.random() * (1 - zh); }   // the fish darts: a new place for the zone
      st.zc += (st.zg - st.zc) * Math.min(1, dt * (1.2 + f.pull * 2.4));
      st.vel += (st.hold ? 1.9 : -1.6) * dt; st.vel *= Math.pow(0.35, dt); st.tension += st.vel * dt;   // the marker has inertia
      if (st.tension < 0) { st.tension = 0; st.vel = Math.max(0, st.vel); }
      if (st.tension >= 1) { st.tension = 1; st.vel = Math.min(0, st.vel); st.top += dt; if (st.top > 0.5) { st.shake = 0.3; return lose('Леска лопнула! Не тяни так сильно'); } } else st.top = 0;
      st.inZ = Math.abs(st.tension - st.zc) < zh / 2; st.zh = zh;
      st.prog += (st.inZ ? 0.3 - f.pull * 0.08 : -0.22) * dt;
      if (st.prog <= 0) return lose('Рыба ушла… держи метку в зелёной зоне');
      if (st.prog >= 1) catchIt();
    }
  }
  function img(k, x, y, w, flip = false, a = 1, rot = 0) { const im = okI(k); if (!im) return false; const h = w * im.naturalHeight / im.naturalWidth; cx.save(); cx.globalAlpha = a; cx.translate(x, y); cx.rotate(rot); if (flip) cx.scale(-1, 1); cx.drawImage(im, -w / 2, -h / 2, w, h); cx.restore(); return true; }
  function draw() {
    const Wp = W * dpr, Hp = H * dpr, u = Wp;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#5aa7b0'; cx.fillRect(0, 0, Wp, Hp);
    { const im = okI('bg'); if (im) { const ih = Hp * 1.26, s = ih / im.naturalHeight, w = im.naturalWidth * s; cx.drawImage(im, (Wp - w) / 2, SURF * Hp - 0.49 * ih, w, ih); } }   // the picture's water line (49%) on SURF, the lake bottom reaches the screen bottom
    if (st.shake > 0) { const k = st.shake * 14 * dpr; cx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    for (const s of st.swim) img(s.f.k, s.x * Wp, s.y * Hp, u * s.f.size * 0.7, s.v < 0, 0.45);   // fish swimming under the surface
    img('reeds', u * 0.08, Hp * (SURF - 0.04), u * 0.2); img('lily', u * 0.88, Hp * (SURF + 0.005), u * 0.22); img('pier', u * 0.12, Hp * (SURF + 0.015), u * 0.36);
    // the line from the top right (the rod off screen) to the bobber, and down to the hook under water
    const bx = st.bx * Wp, dip = st.phase === 'bite' ? 0.025 : st.phase === 'reel' ? 0.02 + 0.01 * Math.sin(st.t * 20) : (st.twitch ? 0.017 * Math.sin(st.t * 40) : 0) + 0.004 * Math.sin(st.t * 3), by = (SURF + dip) * Hp;
    if (st.phase !== 'idle') {
      cx.strokeStyle = 'rgba(255,255,255,0.85)'; cx.lineWidth = 1.6 * dpr; cx.beginPath(); cx.moveTo(Wp * 1.02, Hp * 0.02); cx.quadraticCurveTo(Wp * 0.8, Hp * (SURF - 0.12) + (st.phase === 'reel' ? -st.tension * Hp * 0.05 : 0), bx, by - u * 0.04); cx.stroke();
      const fxp = bx + Math.sin(st.t * 8) * u * 0.03, fyp = by + Hp * (0.14 + (1 - st.prog) * 0.2), reel = st.phase === 'reel' && st.fish;   // the line goes down to the hooked fish's mouth
      cx.strokeStyle = 'rgba(255,255,255,0.6)'; cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(reel ? fxp : bx, reel ? fyp : by + Hp * 0.12); cx.stroke();
      if (reel) img(st.fish.k, fxp, fyp + u * st.fish.size * 0.12, u * st.fish.size, Math.sin(st.t * 3) < 0, 1, Math.sin(st.t * 10) * 0.2);
      img('bobber', bx, by - u * 0.02, u * 0.06);
      if (st.phase === 'bite') { cx.font = `900 ${Math.round(26 * dpr)}px ui-rounded, "Nunito", sans-serif`; cx.textAlign = 'center'; cx.lineWidth = 6 * dpr; cx.strokeStyle = '#2b4a5a'; cx.fillStyle = '#ffe08a'; cx.strokeText('Клюёт!', bx, by - u * 0.1); cx.fillText('Клюёт!', bx, by - u * 0.1); }
    }
    if (st.shown) { const k = Math.min(1, st.shown.t * 3); img(st.shown.f.k, Wp / 2, Hp * (SURF - 0.12 - 0.05 * k), u * st.shown.f.size * 1.6 * k, false, Math.min(1, (1.4 - st.shown.t) * 3)); }
    // tension gauge while reeling
    if (st.phase === 'reel') { const gx = Wp * 0.9, gy = Hp * 0.45, gh = Hp * 0.4, gw = 18 * dpr;
      cx.fillStyle = 'rgba(20,40,50,0.55)'; cx.fillRect(gx - gw / 2, gy, gw, gh); cx.fillStyle = 'rgba(120,220,140,0.75)'; cx.fillRect(gx - gw / 2, gy + gh * (1 - st.zc - (st.zh || 0.4) / 2), gw, gh * (st.zh || 0.4));
      cx.fillStyle = st.inZ ? '#ffffff' : '#ff6b6b'; cx.fillRect(gx - gw * 0.8, gy + gh * (1 - st.tension) - 3 * dpr, gw * 1.6, 6 * dpr);
      cx.fillStyle = 'rgba(20,40,50,0.55)'; cx.fillRect(Wp * 0.15, Hp * 0.93, Wp * 0.62, 12 * dpr); cx.fillStyle = '#ffd76a'; cx.fillRect(Wp * 0.15, Hp * 0.93, Wp * 0.62 * Math.min(1, st.prog), 12 * dpr);
      cx.font = `800 ${Math.round(13 * dpr)}px ui-rounded, "Nunito", sans-serif`; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.fillText('Держи метку в зелёной зоне', Wp * 0.46, Hp * 0.91); }
    for (const p of st.fx) { cx.globalAlpha = 1 - p.t / p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x * Wp, p.y * Hp, (2 + 3 * (1 - p.t / p.life)) * dpr, 0, 7); cx.fill(); }
    cx.globalAlpha = 1; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `900 ${Math.round(17 * dpr)}px ui-rounded, "Nunito", sans-serif`; cx.lineWidth = 4 * dpr; cx.strokeStyle = '#2b4a5a'; cx.fillStyle = st.left <= 10 ? '#ff9a9a' : '#ffffff';
    const tt = `⏱ ${Math.ceil(st.left)}`; cx.strokeText(tt, Wp * 0.12, Hp * 0.04); cx.fillText(tt, Wp * 0.12, Hp * 0.04);
    for (const p of st.texts) { cx.globalAlpha = Math.min(1, (1.3 - p.t) * 3); cx.font = `900 ${Math.round(17 * dpr)}px ui-rounded, "Nunito", sans-serif`; const y = (p.y - p.t * 0.03) * Hp; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b4a5a'; cx.strokeText(p.s, p.x * Wp, y); cx.fillStyle = p.col; cx.fillText(p.s, p.x * Wp, y); }
    cx.globalAlpha = 1;
    if (!st.started || st.phase === 'idle') { cx.font = `800 ${Math.round(16 * dpr)}px ui-rounded, "Nunito", sans-serif`; cx.lineWidth = 5 * dpr; cx.strokeStyle = '#2b4a5a'; cx.fillStyle = '#ffe9a8';
      const lines = st.started ? [['Нажми — закинуть удочку', 0.62]] : [['Нажми — закинешь удочку.', 0.55], ['Поплавок нырнул — сразу нажми!', 0.6], ['Потом держи палец и тяни,', 0.65], ['но не порви леску.', 0.7]];
      for (const [s, y] of lines) { cx.strokeText(s, Wp / 2, Hp * y); cx.fillText(s, Wp / 2, Hp * y); } }
  }
  let raf = 0, last = performance.now(), alive = true;
  function loop(now) { if (!alive) return; let dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now; if (!document.hidden) while (dt > 0) { const h = Math.min(0.02, dt); step(h); dt -= h; } draw(); raf = requestAnimationFrame(loop); }
  raf = requestAnimationFrame(loop);
  const onResize = () => fit(); window.addEventListener('resize', onResize);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('resize', onResize); },
    get state() { return st; },
    crash() { if (!st.over) { st.over = true; st.deadT = 0; } },
    revive() { st.over = false; st.ended = false; st.deadT = 0; st.left = 15; st.phase = 'idle'; say('Ещё 15 секунд!', '#ffe08a'); },
  };
}
