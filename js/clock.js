// Trusted clock (build audit 2026-11-24). The game measures offline time, builds, daily chests and daily quests with Date.now().
// A phone clock moved forward gave the whole offline income at once (again and again), finished builds and expeditions and a new
// day of chests, quests and moonstones; moved back, it stretched boosts and campaigns. Here, before any other module runs:
// - Date.now() is corrected by the server's time (the Date header of a tiny HEAD request to the game's own site; the service
//   worker does not touch HEAD requests); a difference under 1 minute is ignored;
// - without network the last correction is reused, and a clock that went back behind the latest time seen is held there
//   (game time stands still until the real clock catches up), so rolling the clock back gives nothing;
// - window.__clockSync() syncs again (the game calls it when it comes back from the background, before the catch-up).
const RD = Date, realNow = RD.now.bind(RD), KEY = 'magicschool.clock';
let st = {}; try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
let skew = Number.isFinite(st.skew) ? st.skew : 0;
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full storage */ } };
function guardBack() {   // no server answer: never go behind the latest time seen
  const n = realNow() + skew;
  if (st.max && n < st.max - 60000) skew += st.max - n;
}
async function sync() {
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 1500), t0 = realNow();
    const r = await fetch(location.pathname + '?clock=' + t0, { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
    clearTimeout(to);
    const d = RD.parse(r.headers.get('date') || ''), t1 = realNow();
    if (!Number.isFinite(d) || t1 - t0 > 5000) { guardBack(); return false; }
    const diff = d + 500 + (t1 - t0) / 2 - t1;   // the header is whole seconds
    skew = Math.abs(diff) > 60000 ? Math.round(diff) : 0;
    st.skew = skew; st.max = t1 + skew; st.at = t1 + skew; keep();
    return true;
  } catch (e) { guardBack(); return false; }
}
RD.now = () => realNow() + skew;
await sync();
window.__clockSync = sync;
window.__clock = () => ({ skew, max: st.max, at: st.at });   // test hook
setInterval(() => { const n = RD.now(); if (!st.max || n > st.max) { st.max = n; keep(); } }, 10000);
window.addEventListener('pagehide', () => { const n = RD.now(); if (!st.max || n > st.max) { st.max = n; st.skew = skew; keep(); } });
