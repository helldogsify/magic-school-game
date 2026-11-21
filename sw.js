// Network-first service worker: new versions show up at once, cached copy works offline.
// v4 (2026-11-21): page loads (navigate requests) are fetched by URL — fetch(request, {cache}) throws for them,
// so before this every app start fell back to the OLD cached index.html and the game did not update.
const CACHE = 'magicschool-v4';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/assets/music/') || e.request.headers.has('range')) return;   // audio streams by ranges: let the browser fetch it directly
  const fresh = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-store' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(
    fresh.then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
