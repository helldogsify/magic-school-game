// Room editor guard (Maria 2026-11-24: «приложение редактор»). Imported FIRST by game.js, so it runs before data.js reads the
// world. Only with ?edit in the URL: the game then runs on an in-memory copy of localStorage (her real save, meta and cloud code
// are never written: the editor lives on the same site as her game) and network calls go only to this site and the editor API.
// Without ?edit it does nothing.
const q = new URLSearchParams(location.search);
if (q.has('edit')) {
  const KEEP = /^magicschool\.editor\./;   // the editor's own keys (draft, key, last class) stay real
  const real = { get: Storage.prototype.getItem, set: Storage.prototype.setItem, rem: Storage.prototype.removeItem };
  const mem = new Map();
  try { for (let k = 0; k < localStorage.length; k++) { const n = localStorage.key(k); mem.set(n, real.get.call(localStorage, n)); } } catch (e) { /* private mode */ }
  { let m = {}; try { m = JSON.parse(mem.get('magicschool.meta') || '{}') || {}; } catch (e) { m = {}; } m.current = 1; mem.set('magicschool.meta', JSON.stringify(m)); }   // the editor works on world 1 rooms
  mem.delete('magicschool.save.v2');   // the game starts from the editor's own state (game.js load())
  Storage.prototype.getItem = function (k) { k = String(k); if (this !== localStorage || KEEP.test(k)) return real.get.call(this, k); return mem.has(k) ? mem.get(k) : null; };
  Storage.prototype.setItem = function (k, v) { k = String(k); if (this !== localStorage || KEEP.test(k)) return real.set.call(this, k, v); mem.set(k, String(v)); };
  Storage.prototype.removeItem = function (k) { k = String(k); if (this !== localStorage || KEEP.test(k)) return real.rem.call(this, k); mem.delete(k); };
  Storage.prototype.clear = function () { if (this === localStorage) mem.clear(); };
  const API = q.get('api') || 'https://lazy.vazuza.love/game/editor';
  const of = window.fetch.bind(window);
  window.fetch = (u, o) => {   // no cloud saves, tops, replies or feedback from the editor
    const s = String(u && u.url ? u.url : u), abs = new URL(s, location.href);
    if (abs.origin === location.origin || s.startsWith(API)) return of(u, o);
    return Promise.reject(new Error('editor: network off'));
  };
  if (navigator.sendBeacon) navigator.sendBeacon = () => true;
  window.__EDIT = { api: API, cls: q.get('c') || 'herbs', size: Math.min(3, Math.max(1, +q.get('size') || 3)), stage: q.has('stage') ? +q.get('stage') : 40 };
}
