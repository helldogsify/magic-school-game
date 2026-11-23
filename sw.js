// Service worker. Pages and data: network-first (new versions show up at once, the cached copy works offline).
// v4 (2026-11-21): page loads (navigate requests) are fetched by URL — fetch(request, {cache}) throws for them,
// so before this every app start fell back to the OLD cached index.html and the game did not update.
// v5 (2026-11-23, her «Оптимизируй игру, долго при запуске прогружается мир»): pictures, scripts and styles of the game are
// served from the cache at once. Before, every start asked the server again about all ~800 files (network-first with
// no-cache) before the game got a single picture, and wrote all ~70 MB into the cache again. A new build gets new ?v= URLs
// (fetched at once); a file replaced in place is checked in the background (unversioned: every start, versioned: once a day)
// and shows up at the next start.
const CACHE = 'magicschool-v4';   // same cache as v4: what phones already hold is used, nothing is downloaded again
const DAY = 24 * 3600 * 1000;
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
const stamp = (res) => { const d = Date.parse(res.headers.get('date') || ''); return Number.isFinite(d) ? d : 0; };
const same = (a, b) => { const ea = a.headers.get('etag'), eb = b.headers.get('etag'); if (ea || eb) return ea === eb; return a.headers.get('last-modified') === b.headers.get('last-modified') && a.headers.get('content-length') === b.headers.get('content-length'); };
async function refresh(req, old) {   // background check of a cached file: rewrite the cache only when the file really changed
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (!res.ok) return;
    const c = await caches.open(CACHE);
    if (!old || !same(old, res)) await c.put(req, res);
    else if (Date.now() - stamp(old) > DAY) await c.put(req, res);   // unchanged: only renew the date, so the daily check sleeps again
  } catch (e) { /* offline */ }
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('/assets/music/') || req.headers.has('range')) return;   // audio streams by ranges: let the browser fetch it directly
  const u = new URL(req.url);
  const asset = u.origin === self.location.origin && req.mode !== 'navigate' && /\/(assets|js|icons)\/|\/style\.css$/.test(u.pathname);
  if (asset) {
    e.respondWith(caches.match(req).then((hit) => {
      if (hit) {
        if (!u.searchParams.has('v') || Date.now() - stamp(hit) > DAY) e.waitUntil(refresh(req, hit));
        return hit;
      }
      return fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy))); } return res; });
    }));
    return;
  }
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-store' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    fresh.then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req))
  );
});
