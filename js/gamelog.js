// Event journal of the game (Maria 2026-11-24: «Нужно добавить логи, чтобы можно было отслеживать что происходит, где какое напоминание,
// событие пришло»). Kept on the phone (localStorage magicschool.log, the last MAX entries [time, world, kind, text]); the newest part goes
// with every feedback report, the whole journal is shown in the game (Отзыв > Журнал событий) and can be copied.
const KEY = 'magicschool.log', MAX = 400;
export const KINDS = { app: '📱', toast: '💬', hint: '💡', open: '📂', tap: '👆', event: '⚡', error: '❗' };
let L = []; try { L = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { L = []; }
let dirty = false, lastTap = '';
function flush() { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { /* storage full: the journal stays in memory */ } }
export function log(kind, text, world = 0) {
  const x = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 160);
  if (kind === 'tap') { if (x === lastTap) return; lastTap = x; } else lastTap = '';   // the same button tapped again and again is one line
  L.push([Date.now(), world, kind, x]);
  if (L.length > MAX) L.splice(0, L.length - MAX);
  if (!dirty) { dirty = true; setTimeout(flush, 2000); }
}
const hhmmss = (t) => { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':'); };
const dayOf = (t) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
export function lineOf(e) { return `${hhmmss(e[0])}${e[1] ? ' м' + e[1] : ''} ${KINDS[e[2]] || e[2]} ${e[3]}`; }
export function tail(n) { return L.slice(-n).map(lineOf).join('\n'); }
export function entries() { return L; }
export function dump() { let day = ''; return L.map((e) => { const d = dayOf(e[0]), head = d !== day ? `— ${(day = d)} —\n` : ''; return head + lineOf(e); }).join('\n'); }
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { log('app', document.hidden ? 'игра свёрнута' : 'игра снова открыта'); if (document.hidden) flush(); });
addEventListener('error', (e) => log('error', `${e.message || 'ошибка'} @ ${String(e.filename || '').split('/').pop()}:${e.lineno || 0}`));
addEventListener('unhandledrejection', (e) => log('error', 'promise: ' + String((e.reason && (e.reason.message || e.reason)) || '?')));
