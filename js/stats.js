// Anonymous play statistics (Maria 2026-11-26: the game goes to market; adaptive pacing needs data on where players get stuck or leave;
// her «Да, всё хорошо. Делай.» to «start with analytics»). No names, no school names, no account ids: a random player id made on the
// phone (localStorage magicschool.pid), the build, the world and small numbers of progress. Events queue on the phone
// (magicschool.statq, at most MAXQ) and go in batches to the family server (lazy /game/stats, files data/game_stats/DAY.jsonl);
// report: tools/stats_report.mjs. Off on localhost, in the room editor, in automated browsers and on phones with magicschool.nostats.
const URL_ = (() => { try { return localStorage.getItem('magicschool.statsUrl') || ''; } catch (e) { return ''; } })() || 'https://lazy.vazuza.love/game/stats';   // statsUrl: local tests only
const QKEY = 'magicschool.statq', PKEY = 'magicschool.pid', MAXQ = 300, SNAP_SEC = 300, FLUSH_SEC = 60, NEW_SESSION_SEC = 1800;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* full */ } } };
const rid = (n) => { let s = ''; const a = 'abcdefghijklmnopqrstuvwxyz0123456789'; const r = new Uint8Array(n); (crypto.getRandomValues ? crypto.getRandomValues(r) : r.forEach((_, i) => { r[i] = Math.random() * 256; })); for (const x of r) s += a[x % 36]; return s; };

export function initStats(A) {   // A: { build, world, snap: () => object, off: bool }
  const force = ls.get('magicschool.stats') === 'force';   // local tests only
  const off = !!A.off || ls.get('magicschool.nostats') === '1' || (!force && (/^(localhost|127\.|192\.168\.|\[::1\])/.test(location.hostname) || navigator.webdriver));
  let pid = ls.get(PKEY); if (!pid || !/^[a-z0-9]{12}$/.test(pid)) { pid = rid(12); ls.set(PKEY, pid); ls.set(PKEY + '0', String(Date.now())); }
  const born = +ls.get(PKEY + '0') || Date.now();
  let sid = rid(8), q = []; try { q = JSON.parse(ls.get(QKEY)) || []; } catch (e) { q = []; }
  let visT = 0, snapT = 0, flushT = 0, lastTick = performance.now(), hiddenAt = 0, sending = false;
  let buys = {}, spent = 0;
  const keep = () => { if (q.length > MAXQ) q.splice(0, q.length - MAXQ); ls.set(QKEY, JSON.stringify(q)); };
  const ev = (name, props) => { if (off) return; q.push([Date.now(), sid, name, props || 0]); keep(); };
  const snap = () => { let s = {}; try { s = A.snap() || {}; } catch (e) { s = { err: String(e && e.message).slice(0, 60) }; } s.buys = buys; s.spent = Math.round(spent); s.play = Math.round(visT); buys = {}; spent = 0; return s; };
  const body = (n) => JSON.stringify({ pid, b: A.build, w: A.world, ev: q.slice(0, n) });
  function flush(beacon) {
    if (off || !q.length || sending) return;
    const n = Math.min(q.length, 100), data = body(n);
    if (beacon && navigator.sendBeacon) { if (navigator.sendBeacon(URL_, new Blob([data], { type: 'text/plain' }))) { q.splice(0, n); keep(); } return; }
    sending = true;
    fetch(URL_, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' }, keepalive: data.length < 60000 })
      .then((r) => { if (r.ok || r.status === 400) { q.splice(0, n); keep(); } })   // 400: a broken batch is dropped, never resent forever
      .catch(() => { /* offline: the queue waits */ }).finally(() => { sending = false; });
  }
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const os = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'other';
  function start(away) { ev('start', { away: Math.round(away || 0), day: Math.floor((Date.now() - born) / 86400000), pwa: standalone ? 1 : 0, os, sw: screen.width, lang: (navigator.language || '').slice(0, 5) }); }
  start(A.away || 0);
  setInterval(() => {   // counts only the time the game is on screen
    const now = performance.now(), dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
    if (document.hidden) return;
    visT += dt; snapT += dt; flushT += dt;
    if (snapT >= SNAP_SEC) { snapT = 0; ev('snap', snap()); }
    if (flushT >= FLUSH_SEC) { flushT = 0; flush(false); }
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); ev('end', snap()); visT = 0; snapT = 0; flush(true); return; }
    const away = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0; hiddenAt = 0;
    if (away >= NEW_SESSION_SEC) { sid = rid(8); start(away); } else ev('resume', { away: Math.round(away) });
    lastTick = performance.now();
  });
  let errs = 0;   // script errors (at most 5 per page load): the market build must know what breaks on players' phones
  window.addEventListener('error', (e) => { if (errs++ < 5) ev('err', { m: String(e.message || '').slice(0, 120), f: String(e.filename || '').split('/').pop().slice(0, 30), l: e.lineno || 0 }); });
  window.addEventListener('unhandledrejection', (e) => { if (errs++ < 5) ev('err', { m: String((e.reason && e.reason.message) || e.reason || '').slice(0, 120), f: 'promise' }); });
  setTimeout(() => flush(false), 15000);
  return {
    ev,
    buy(act, cost) { if (off) return; const k = String(act || '?').slice(0, 16); buys[k] = (buys[k] || 0) + 1; spent += +cost || 0; },
    pid: () => pid, off: () => off, queue: () => q.slice(), flush: () => flush(false),
  };
}
