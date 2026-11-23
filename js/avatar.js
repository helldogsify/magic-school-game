// Player avatars (Maria 2026-11-23: «Надо добавить загрузку аватарки пользователям. Конечно без 18+ чтоб модерация какая то была»;
// her picks: an on-device neural check + her own approval; shown in the school top, the alliance and the player's profile).
// Firestore avatars/{uid} {img: 'data:image/jpeg;base64,...' (128 px, ~5-10 KB), st: 'wait'|'ok'|'no', t, name}.
// Rules: anyone reads only st == 'ok'; the owner reads his own doc and writes it only with st 'wait' (every new picture goes
// back to moderation); the moderator (Maria's device uid) reads the queue and sets st 'ok'/'no'. So a picture reaches other
// players only after her «Одобрить», even if someone bypasses the on-device check with a hand-made request.
// The on-device check: NSFWJS MobileNetV2 (vendor/nsfw, ~5.4 MB, downloaded only when a player picks a picture).
export const AVATAR_MODS = ['jqBahShw4eSxa1ah9UbJLDniKMa2'];   // Maria's phone («Дорин против Саурона», nick «Чарли»), her choice 2026-11-23
const SIZE = 128, CHECK = 224, EVERY = 5 * 60 * 1000;

export function initAvatar(o) {   // o: {url, token() -> {uid, tok}, uid() -> string, name() -> school name, toast(t), changed(), esc(s)}
  const ok = new Map();   // uid -> data URL of the approved avatar
  let mine = null, queue = [], loadedAt = 0, loading = null, model = null, busy = '', modSeen = -1;
  const isMod = () => AVATAR_MODS.includes(o.uid());
  const val = (f) => (f ? f.stringValue ?? +(f.integerValue ?? 0) : '');
  const doc = (x) => ({ uid: x.name.split('/').pop(), img: val(x.fields.img), st: val(x.fields.st), t: +val(x.fields.t) || 0, name: val(x.fields.name) || '' });
  async function query(st, A) {
    const r = await fetch(o.url + ':runQuery', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(A ? { Authorization: 'Bearer ' + A.tok } : {}) },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'avatars' }], where: { fieldFilter: { field: { fieldPath: 'st' }, op: 'EQUAL', value: { stringValue: st } } }, limit: 500 } }) });
    if (!r.ok) throw new Error('avatars ' + r.status);
    return (await r.json()).filter((x) => x.document).map((x) => doc(x.document));
  }
  async function load(force) {   // approved avatars of everyone, my own doc, and the queue for the moderator
    if (loading) return loading;
    if (!force && Date.now() - loadedAt < EVERY) return;
    loading = (async () => {
      try {
        const list = await query('ok'); ok.clear(); for (const a of list) ok.set(a.uid, a.img);
        loadedAt = Date.now();
        if (o.uid()) {
          const A = await o.token();
          const r = await fetch(`${o.url}/avatars/${A.uid}`, { headers: { Authorization: 'Bearer ' + A.tok } });
          mine = r.ok ? doc(await r.json()) : null;
          if (isMod()) { queue = (await query('wait', A)).sort((a, b) => a.t - b.t); if (queue.length && queue.length !== modSeen) o.toast(`🛡 Аватарок ждут проверки: ${queue.length} — окно 🏆 Топ`); modSeen = queue.length; }
        }
      } catch (e) { /* offline: next time */ }
    })();
    try { await loading; } finally { loading = null; }
  }
  if (isMod()) setInterval(() => { if (!document.hidden) load(true).then(() => o.changed()); }, EVERY);   // the moderator hears about new pictures while playing
  const pic = (src, px) => `<img src="${src}" alt="" style="width:${px}px;height:${px}px;border-radius:50%;object-fit:cover;flex:none;border:2px solid #e2c98a;background:#f3ecff">`;
  function img(id, px = 40) { const src = ok.get(String(id).replace(/_w\d+$/, '')); return src ? pic(src, px) : ''; }

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.appendChild(s); }); }
  async function nsfw() {
    if (model) return model;
    if (!window.nsfwjs) await loadScript('vendor/nsfw/nsfwjs.min.js?v=1');
    model = await window.nsfwjs.load('vendor/nsfw/', { size: CHECK });
    return model;
  }
  function readImage(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = u; }); }
  function square(im, px) {   // the centre square of the picture, px x px
    const s = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement('canvas'); c.width = c.height = px;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, px, px); x.imageSmoothingQuality = 'high';
    x.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, px, px); return c;
  }
  const unsafe = (p) => { const g = (n) => (p.find((x) => x.className === n) || {}).probability || 0; return g('Porn') + g('Hentai') >= 0.3 || g('Sexy') >= 0.5; };   // strict: a children's game
  async function upload(file) {
    if (busy) return;
    if (!o.name()) { o.toast('Сначала впиши название школы'); return; }
    busy = 'Загружаю проверку картинок (5 МБ, один раз)…'; o.changed();
    try {
      const im = await readImage(file);
      const m = await nsfw();
      busy = 'Проверяю картинку…'; o.changed();
      const p = await m.classify(square(im, CHECK));
      if (unsafe(p)) { busy = ''; o.toast('🚫 Эта картинка не подходит для игры. Выбери другую'); o.changed(); return; }
      const c = square(im, SIZE); let data = '';
      for (const q of [0.82, 0.7, 0.55, 0.4]) { data = c.toDataURL('image/jpeg', q); if (data.length <= 38000) break; }   // the rules allow 40 000 characters
      const A = await o.token();
      const body = { fields: { img: { stringValue: data }, st: { stringValue: 'wait' }, t: { integerValue: String(Date.now()) }, name: { stringValue: o.name().slice(0, 24) } } };
      const r = await fetch(`${o.url}/avatars/${A.uid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('save ' + r.status);
      mine = { uid: A.uid, img: data, st: 'wait', t: Date.now(), name: o.name() }; ok.delete(A.uid);
      o.toast('📷 Аватарка отправлена на проверку. Другие увидят её после одобрения');
    } catch (e) { o.toast('Не получилось загрузить аватарку — проверь интернет и попробуй ещё раз'); }
    busy = ''; o.changed();
  }
  function pick() {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.style.display = 'none';
    f.onchange = () => { const x = f.files && f.files[0]; f.remove(); if (x) upload(x); };
    document.body.appendChild(f); f.click();
  }
  async function remove() {
    try { const A = await o.token(); await fetch(`${o.url}/avatars/${A.uid}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + A.tok } }); mine = null; ok.delete(A.uid); o.toast('Аватарка убрана'); } catch (e) { o.toast('Не получилось — проверь интернет'); }
    o.changed();
  }
  async function judge(uid, st) {   // the moderator: 'ok' shows the picture to everyone, 'no' hides it
    try {
      const A = await o.token();
      const r = await fetch(`${o.url}/avatars/${uid}?updateMask.fieldPaths=st`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + A.tok }, body: JSON.stringify({ fields: { st: { stringValue: st } } }) });
      if (!r.ok) throw new Error(r.status);
      const q = queue.find((x) => x.uid === uid); queue = queue.filter((x) => x.uid !== uid); modSeen = queue.length;
      if (st === 'ok' && q) ok.set(uid, q.img); else ok.delete(uid);
      if (mine && mine.uid === uid) mine.st = st;
    } catch (e) { o.toast('Не получилось — проверь интернет'); }
    o.changed();
  }

  function myBox() {
    const st = mine && mine.st, src = mine && mine.img;
    const face = src ? pic(src, 64) : '<span style="width:64px;height:64px;border-radius:50%;background:#f3ecff;border:2px dashed #c9b8ee;display:flex;align-items:center;justify-content:center;font-size:30px;flex:none">🙂</span>';
    const txt = busy ? busy : st === 'ok' ? '✅ Одобрена — её видят все в топе и в альянсе' : st === 'wait' ? '⏳ На проверке у модератора. Пока её видишь только ты' : st === 'no' ? '🚫 Не прошла проверку. Выбери другую картинку' : 'Своё фото или рисунок. Без 18+: каждую аватарку проверяют, прежде чем её увидят другие';
    return `<h3>Аватарка</h3><div class="card up">${face}<div class="grow"><div class="muted">${txt}</div></div></div>
      <button class="btn wide" data-avapick ${busy ? 'disabled' : ''}>📷 ${src ? 'Сменить аватарку' : 'Загрузить аватарку'}</button>${src && !busy ? '<button class="btn ghost wide" data-avadel>Убрать аватарку</button>' : ''}`;
  }
  function modBox() {
    if (!isMod()) return '';
    const rows = queue.map((q) => `<div class="card up">${pic(q.img, 72)}<div class="grow"><b>${o.esc(q.name || '?')}</b><div class="muted">${new Date(q.t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><button class="btn small hot" data-avaok="${q.uid}">Одобрить</button><button class="btn small ghost" data-avano="${q.uid}">Отклонить</button></div>`).join('');
    const shown = [...ok.entries()].map(([uid, src]) => `<button class="btn small ghost" data-avano="${uid}" title="Скрыть" style="padding:2px">${pic(src, 36)}</button>`).join('');
    return `<h3>🛡 Модерация аватарок</h3><p class="muted">Это видишь только ты. Картинку увидят другие игроки, только когда ты нажмёшь «Одобрить».</p>
      ${rows || '<p class="muted">Новых аватарок на проверке нет.</p>'}
      ${shown ? `<div class="muted" style="margin-top:6px">Одобренные (нажми, чтобы скрыть):</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${shown}</div>` : ''}
      <button class="btn ghost wide" data-avaref>🔄 Обновить</button>`;
  }
  function click(d) {   // true when the button was ours
    if (d.avapick !== undefined) { pick(); return true; }
    if (d.avadel !== undefined) { remove(); return true; }
    if (d.avaok !== undefined) { judge(d.avaok, 'ok'); return true; }
    if (d.avano !== undefined) { judge(d.avano, 'no'); return true; }
    if (d.avaref !== undefined) { load(true).then(() => o.changed()); return true; }
    return false;
  }
  return { load, img, myBox, modBox, click, isMod, _unsafe: unsafe };
}
