// Magic school idle tycoon — prototype v0.1. Plain ES module, no build step.
import {
  MAX_ROOM_LEVEL, MAX_COURSE, OFFLINE_CAP_SEC, ROOM_TYPES, BUILD_ORDER, DECOR,
  NAMES, BODY_COLORS, HAT_COLORS, QUESTS,
} from './data.js';

const SAVE_KEY = 'magicschool.save.v1';
const VERSION = '0.1';
const $ = (sel, root = document) => root.querySelector(sel);

// ---------- state ----------
let S = null;

function newStudent() {
  const id = S.nextId++;
  return {
    id,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    body: BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)],
    hat: HAT_COLORS[Math.floor(Math.random() * HAT_COLORS.length)],
    course: 1, xp: 0, room: null,
  };
}

function freshState() {
  S = {
    v: 1, coins: 20, stars: 0, nextId: 1, last: Date.now(), quest: 0,
    rooms: [
      { type: 'dorm', level: 1, store: 0, decor: [null, null, null] },
      { type: 'herbs', level: 1, store: 0, decor: [null, null, null] },
    ],
    students: [],
    stats: { collected: 0, recruited: 0, passed: 0, failed: 0, graduated: 0, decor: 0 },
  };
  S.students.push(newStudent(), newStudent());
  autoAssign();
  return S;
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { S = JSON.parse(raw); return; }
  } catch (e) { /* corrupted save -> fresh */ }
  freshState();
}
function save() { S.last = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }

// ---------- formulas ----------
const room = (type) => S.rooms.find((r) => r.type === type);
const level = (type) => (room(type) ? room(type).level : 0);
const comfort = (r) => r.decor.reduce((a, d) => a + (d ? DECOR.find((x) => x.id === d).comfort : 0), 0);
const beds = () => 1 + 2 * level('dorm');
const seats = (r) => 2 + r.level;
const seated = (r) => S.students.filter((s) => s.room === r.type);
const xpNeed = (course) => Math.round(25 * Math.pow(1.55, course - 1));
const studySpeed = () => 1 + 0.15 * level('canteen') + (room('canteen') ? 0.03 * comfort(room('canteen')) : 0);
const upCost = (r) => Math.round(ROOM_TYPES[r.type].upBase * Math.pow(1.75, r.level - 1));
const recruitCost = () => Math.round(15 * Math.pow(1.55, Math.max(0, S.students.length - 1)));

function studentRate(s) {
  if (!s.room) return 0;
  const r = room(s.room);
  return ROOM_TYPES[r.type].rate * (1 + 0.3 * (r.level - 1)) * (1 + 0.6 * (s.course - 1));
}
const roomRate = (r) => seated(r).reduce((a, s) => a + studentRate(s), 0);
const storeCap = (r) => Math.max(30, roomRate(r) * OFFLINE_CAP_SEC);

function supportComfort() {
  return S.rooms.filter((r) => ROOM_TYPES[r.type].kind === 'support').reduce((a, r) => a + comfort(r), 0);
}
function examParts(s) {
  const r = room(s.room);
  const parts = [
    ['Базовый шанс', 0.6],
    ['Уровень класса', 0.04 * (r.level - 1)],
    ['Библиотека', 0.05 * level('library')],
    ['Уют класса', 0.025 * comfort(r)],
    ['Уют школы', 0.01 * supportComfort()],
    ['Сложность курса', -0.05 * (s.course - 1)],
  ];
  const total = Math.min(0.97, Math.max(0.1, parts.reduce((a, p) => a + p[1], 0)));
  return { parts, total };
}
const examReady = (s) => s.room && s.xp >= xpNeed(s.course);

// ---------- simulation ----------
function step(dt) {
  const speed = studySpeed();
  for (const r of S.rooms) {
    if (ROOM_TYPES[r.type].kind !== 'class') continue;
    r.store = Math.min(storeCap(r), r.store + roomRate(r) * dt);
  }
  for (const s of S.students) {
    if (!s.room) continue;
    s.xp = Math.min(xpNeed(s.course), s.xp + speed * dt);
  }
}

function autoAssign() {
  const classes = S.rooms.filter((r) => ROOM_TYPES[r.type].kind === 'class')
    .sort((a, b) => ROOM_TYPES[b.type].rate - ROOM_TYPES[a.type].rate);
  for (const s of S.students) {
    if (s.room) continue;
    const free = classes.find((r) => seated(r).length < seats(r));
    if (free) s.room = free.type;
  }
}

// ---------- actions ----------
function spend(cost) { if (S.coins < cost) { toast('Не хватает монет 🪙'); return false; } S.coins -= cost; return true; }

function collect(type, el) {
  const r = room(type);
  const amount = Math.floor(r.store);
  if (amount < 1) return;
  r.store -= amount; S.coins += amount; S.stats.collected++;
  flyCoins(el, amount);
  refresh();
}
function upgrade(type) {
  const r = room(type);
  if (r.level >= MAX_ROOM_LEVEL) return;
  if (!spend(upCost(r))) return;
  r.level++;
  autoAssign(); sparkle(`${ROOM_TYPES[type].name}: уровень ${r.level}!`); refresh(true);
}
function build(type) {
  const def = ROOM_TYPES[type];
  if (room(type) || S.stars < def.unlock) return;
  if (!spend(def.build)) return;
  S.rooms.push({ type, level: 1, store: 0, decor: [null, null, null] });
  autoAssign(); sparkle(`Построено: ${def.name}!`); refresh(true);
}
function recruit() {
  if (S.students.length >= beds()) { toast('Нет свободных кроватей — улучши Спальню 🛏️'); return; }
  if (!spend(recruitCost())) return;
  const s = newStudent();
  S.students.push(s); S.stats.recruited++;
  autoAssign();
  sparkle(`${s.name} поступает в школу!`); refresh(true);
}
function buyDecor(type, slot, id) {
  const r = room(type), d = DECOR.find((x) => x.id === id);
  if (r.decor[slot] === id) return;
  if (!spend(d.cost)) return;
  r.decor[slot] = id; S.stats.decor++;
  sparkle(`${d.emoji} Уютнее!`); refresh(true);
}
function moveStudent(id, type) {
  const s = S.students.find((x) => x.id === id), r = room(type);
  if (seated(r).length >= seats(r)) { toast('В классе нет мест'); return; }
  s.room = type; refresh(true);
}
function takeExam(id) {
  const s = S.students.find((x) => x.id === id);
  if (!examReady(s)) return null;
  const chance = examParts(s).total;
  const pass = Math.random() < chance;
  if (!pass) { s.xp = xpNeed(s.course) * 0.5; S.stats.failed++; return { pass, grad: false }; }
  S.stats.passed++;
  S.stars += s.course;
  if (s.course >= MAX_COURSE) {
    S.stars += 20; S.stats.graduated++;
    S.students = S.students.filter((x) => x !== s);
    autoAssign();
    return { pass, grad: true, stars: s.course + 20 };
  }
  s.course++; s.xp = 0;
  return { pass, grad: false, stars: s.course - 1 };
}

// ---------- rendering helpers ----------
function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [u, v] of units) if (n >= v) return (n / v).toFixed(n / v < 10 ? 1 : 0).replace('.', ',') + u;
  return String(n);
}
function studentSVG(s, size = 44) {
  return `<svg class="blob" width="${size}" height="${size * 1.07}" viewBox="0 0 60 64" aria-hidden="true">
    <ellipse cx="30" cy="62" rx="15" ry="2.5" fill="#000" opacity=".12"/>
    <ellipse cx="30" cy="44" rx="20" ry="18" fill="${s.body}"/>
    <ellipse cx="24" cy="38" rx="6" ry="4" fill="#fff" opacity=".35"/>
    <circle cx="23" cy="43" r="3.2" fill="#3a2f4a"/><circle cx="37" cy="43" r="3.2" fill="#3a2f4a"/>
    <circle cx="24" cy="42" r="1.1" fill="#fff"/><circle cx="38" cy="42" r="1.1" fill="#fff"/>
    <ellipse cx="17.5" cy="49" rx="3.5" ry="2" fill="#ff7fa3" opacity=".55"/><ellipse cx="42.5" cy="49" rx="3.5" ry="2" fill="#ff7fa3" opacity=".55"/>
    <path d="M27 49 q3 3.2 6 0" stroke="#3a2f4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M30 3 L17 28 L43 28 Z" fill="${s.hat}"/>
    <ellipse cx="30" cy="28" rx="17" ry="4" fill="${s.hat}"/>
    <path d="M30 11 l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#ffe066"/>
  </svg>`;
}
function costBtn(label, cost, action, extra = '') {
  return `<button class="btn" data-cost="${cost}" data-act="${action}" ${extra}>${label} <span class="cost">🪙${fmt(cost)}</span></button>`;
}

// ---------- screens ----------
let tab = 'school';
let structKey = '';

function structureKey() {
  return tab + '|' + S.stars + '|' + S.rooms.map((r) => `${r.type}${r.level}${r.decor.join(',')}`).join(';') + '|' +
    S.students.map((s) => `${s.id}${s.room}${s.course}${examReady(s) ? 'R' : ''}`).join(';');
}

function renderSchool() {
  const rooms = [...S.rooms].reverse();
  let h = `<div class="tower"><div class="roof"><div class="flag">✦</div></div>`;
  for (const r of rooms) {
    const def = ROOM_TYPES[r.type];
    const decor = r.decor.map((d) => `<span class="dec">${d ? DECOR.find((x) => x.id === d).emoji : ''}</span>`).join('');
    let body = '';
    if (def.kind === 'class') {
      const st = seated(r);
      body = st.map((s) => `<div class="seat" data-stud="${s.id}">
          ${examReady(s) ? '<div class="scroll">📜</div>' : ''}
          ${studentSVG(s, 40)}<div class="xp"><i data-xp="${s.id}"></i></div><div class="crs">${s.course}</div></div>`).join('');
      for (let i = st.length; i < seats(r); i++) body += `<div class="seat empty"><div class="chair"></div></div>`;
      body = `<div class="seats">${body}</div>`;
    } else if (r.type === 'dorm') {
      const idle = S.students.filter((s) => !s.room);
      body = `<div class="dorm-info">🛏️ Кроватей: <b>${S.students.length}/${beds()}</b>${idle.length ? ` · без места в классе: ${idle.length}` : ''}</div>
        <div class="seats">${idle.map((s) => `<div class="seat sleepy">${studentSVG(s, 36)}<div class="zz">z</div></div>`).join('')}</div>`;
    } else if (r.type === 'canteen') {
      body = `<div class="dorm-info">Учёба быстрее: <b>×${studySpeed().toFixed(2).replace('.', ',')}</b></div>`;
    } else if (r.type === 'library') {
      body = `<div class="dorm-info">Шанс сдать экзамен: <b>+${Math.round(level('library') * 5)}%</b></div>`;
    }
    h += `<section class="room" style="--c:${def.color}" data-room="${r.type}">
        <div class="room-head"><span class="remoji">${def.emoji}</span><span class="rname">${def.name}</span>
          <span class="lvl">ур. ${r.level}</span><span class="decs">${decor}</span></div>
        ${body}
        ${def.kind === 'class' ? `<button class="coin-bubble hidden" data-collect="${r.type}">🪙 <b data-store="${r.type}">0</b></button>` : ''}
      </section>`;
  }
  h += `<div class="ground"><div class="door"></div></div></div>`;
  const next = BUILD_ORDER.find((t) => !room(t));
  h += next ? `<button class="room add" data-goto="build">＋ Построить новую комнату</button>` : '';
  return h;
}

function renderStudents() {
  const full = S.students.length >= beds();
  let h = `<div class="card recruit">
      <div class="blob-big">${studentSVG({ body: '#fff', hat: '#c9b8ff' }, 54)}</div>
      <div><b>Новый ученик</b><div class="muted">Кроватей: ${S.students.length}/${beds()}</div></div>
      ${full ? `<button class="btn" data-goto-room="dorm">Улучшить Спальню</button>` : costBtn('Принять', recruitCost(), 'recruit')}
    </div>`;
  const list = [...S.students].sort((a, b) => b.course - a.course);
  for (const s of list) {
    const r = s.room ? room(s.room) : null;
    const chance = r ? Math.round(examParts(s).total * 100) : null;
    h += `<div class="card stud">
        <div class="seat">${examReady(s) ? '<div class="scroll">📜</div>' : ''}${studentSVG(s, 46)}</div>
        <div class="grow"><b>${s.name}</b> · курс ${s.course}/${MAX_COURSE}
          <div class="muted">${r ? `${ROOM_TYPES[r.type].emoji} ${ROOM_TYPES[r.type].name} · шанс экзамена ${chance}%` : 'Нет места в классе — построй или улучши класс'}</div>
          <div class="xp wide"><i data-xp="${s.id}"></i></div></div>
        <div class="col">
          ${examReady(s) ? `<button class="btn hot" data-exam="${s.id}">Экзамен</button>` : ''}
          ${r || S.rooms.some((x) => ROOM_TYPES[x.type].kind === 'class' && seated(x).length < seats(x)) ? `<button class="btn ghost" data-move="${s.id}">Перевести</button>` : ''}
        </div></div>`;
  }
  return h;
}

function renderBuild() {
  let h = '<div class="muted pad">Звёзды ⭐ дают ученики, которые сдают экзамены. Они открывают новые комнаты.</div>';
  for (const t of BUILD_ORDER) {
    const def = ROOM_TYPES[t];
    const built = room(t);
    const locked = S.stars < def.unlock;
    h += `<div class="card build ${locked ? 'locked' : ''}" style="--c:${def.color}">
        <div class="remoji big">${def.emoji}</div>
        <div class="grow"><b>${def.name}</b>${def.kind === 'class' ? ` <span class="tag">класс ×${String(def.rate).replace('.', ',')}</span>` : ''}
          <div class="muted">${def.desc}</div></div>
        <div class="col">${built ? `<span class="done">✓ есть</span>` : locked ? `<span class="lock">🔒 ⭐${def.unlock}</span>` : costBtn('Построить', def.build, 'build', `data-type="${t}"`)}</div>
      </div>`;
  }
  return h;
}

function renderScreen() {
  const sc = $('#screen');
  const top = sc.scrollTop;
  sc.innerHTML = tab === 'school' ? renderSchool() : tab === 'students' ? renderStudents() : renderBuild();
  sc.scrollTop = top;
}

// ---------- quest banner ----------
const ctx = { level };
function renderQuest() {
  const q = QUESTS[S.quest];
  const el = $('#quest');
  if (!q) { el.innerHTML = '<div class="q done-all">🌟 Все задания пройдены! Расти свою школу дальше.</div>'; return; }
  const ok = q.check(S, ctx);
  el.innerHTML = `<div class="q ${ok ? 'ok' : ''}"><span class="qi">${ok ? '🎁' : '📋'}</span><span class="qt">${q.text}</span>
    ${ok ? `<button class="btn hot small" data-quest>Забрать 🪙${q.reward}</button>` : `<span class="qr">🪙${q.reward}</span>`}</div>`;
}

// ---------- sheets (bottom panels) ----------
let sheet = null; // function that returns html, re-run on refresh
function openSheet(fn) { sheet = fn; $('#sheet').innerHTML = fn(); $('#sheet-wrap').classList.remove('hidden'); updateDynamic(); }
function closeSheet() { sheet = null; $('#sheet-wrap').classList.add('hidden'); }

function roomSheet(type) {
  return () => {
    const r = room(type); const def = ROOM_TYPES[type];
    let eff = '';
    if (def.kind === 'class') eff = `Мест: <b>${seats(r)}</b> · доход <b>${fmt(roomRate(r) * 60)}</b> 🪙/мин · уют <b>${comfort(r)}</b> (шанс экзамена +${(comfort(r) * 2.5).toFixed(1).replace('.', ',')}%)`;
    if (type === 'dorm') eff = `Кроватей: <b>${beds()}</b> (на след. уровне ${beds() + 2})`;
    if (type === 'canteen') eff = `Учёба быстрее ×${studySpeed().toFixed(2).replace('.', ',')}`;
    if (type === 'library') eff = `Шанс экзамена +${level('library') * 5}% (на след. уровне +${(level('library') + 1) * 5}%)`;
    const max = r.level >= MAX_ROOM_LEVEL;
    let h = `<div class="sh-head" style="--c:${def.color}"><span class="remoji big">${def.emoji}</span><div><h2>${def.name}</h2><div class="muted">Уровень ${r.level}/${MAX_ROOM_LEVEL}</div></div><button class="x" data-close>✕</button></div>
      <p class="muted">${def.desc}</p><p>${eff}</p>
      ${max ? '<div class="done">Максимальный уровень ✨</div>' : costBtn(`Улучшить до ${r.level + 1} ур.`, upCost(r), 'upgrade', `data-type="${type}"`)}
      <h3>Украшения <span class="muted">(уют помогает сдавать экзамены)</span></h3><div class="slots">`;
    r.decor.forEach((d, i) => { h += `<button class="slot" data-slot="${i}" data-type="${type}">${d ? DECOR.find((x) => x.id === d).emoji : '＋'}</button>`; });
    return h + '</div>';
  };
}
function decorSheet(type, slot) {
  return () => {
    const r = room(type);
    let h = `<div class="sh-head"><h2>Украшение</h2><button class="x" data-back="${type}">←</button></div><div class="list">`;
    for (const d of DECOR) {
      h += `<div class="card"><span class="remoji big">${d.emoji}</span><div class="grow"><b>${d.name}</b><div class="muted">Уют +${d.comfort}</div></div>
        ${r.decor[slot] === d.id ? '<span class="done">✓</span>' : costBtn('Купить', d.cost, 'decor', `data-type="${type}" data-slot="${slot}" data-id="${d.id}"`)}</div>`;
    }
    return h + '</div>';
  };
}
function moveSheet(id) {
  return () => {
    const s = S.students.find((x) => x.id === id);
    let h = `<div class="sh-head"><h2>Перевести: ${s.name}</h2><button class="x" data-close>✕</button></div><div class="list">`;
    for (const r of S.rooms.filter((x) => ROOM_TYPES[x.type].kind === 'class')) {
      const def = ROOM_TYPES[r.type]; const cur = s.room === r.type; const free = seated(r).length < seats(r);
      h += `<div class="card"><span class="remoji big">${def.emoji}</span><div class="grow"><b>${def.name}</b><div class="muted">Мест ${seated(r).length}/${seats(r)} · ×${String(def.rate).replace('.', ',')} монет</div></div>
        ${cur ? '<span class="done">сейчас тут</span>' : free ? `<button class="btn" data-moveto="${r.type}" data-id="${id}">Сюда</button>` : '<span class="muted">мест нет</span>'}</div>`;
    }
    return h + '</div>';
  };
}
function examSheet(id, phase = 'ask', result = null) {
  return () => {
    const s = S.students.find((x) => x.id === id) || result?.student;
    if (phase === 'ask') {
      const { parts, total } = examParts(s);
      const rows = parts.filter((p) => p[1] !== 0).map((p) => `<div class="row"><span>${p[0]}</span><b class="${p[1] < 0 ? 'neg' : ''}">${p[1] > 0 ? '+' : ''}${Math.round(p[1] * 100)}%</b></div>`).join('');
      return `<div class="sh-head"><h2>Экзамен · курс ${s.course}</h2><button class="x" data-close>✕</button></div>
        <div class="exam-stage">${studentSVG(s, 96)}</div>
        <div class="center"><b>${s.name}</b> сдаёт «${ROOM_TYPES[s.room].name}»</div>
        <div class="chance"><div class="cbar"><i style="width:${Math.round(total * 100)}%"></i></div><b>${Math.round(total * 100)}%</b></div>
        <div class="rows">${rows}</div>
        <button class="btn hot wide" data-doexam="${id}">✨ Сдавать!</button>`;
    }
    if (phase === 'spin') return `<div class="exam-stage spin">${studentSVG(s, 96)}<div class="magic-ring"></div></div><div class="center big-txt">Колдуем…</div>`;
    const r = result;
    if (r.grad) return `<div class="exam-stage win">${studentSVG(s, 96)}</div><div class="center big-txt">🎓 Выпускник!</div>
      <p class="center">${s.name} окончил(а) школу магии! ⭐+${r.stars}<br>Освободилось место для нового ученика.</p><button class="btn wide" data-close>Ура!</button>`;
    if (r.pass) return `<div class="exam-stage win">${studentSVG(s, 96)}</div><div class="center big-txt">Сдано! 🎉</div>
      <p class="center">Теперь ${s.name} на ${s.course} курсе: монет больше. ⭐+${r.stars}</p><button class="btn wide" data-close>Отлично</button>`;
    return `<div class="exam-stage lose">${studentSVG(s, 96)}</div><div class="center big-txt">Не получилось 😿</div>
      <p class="center muted">Половина знаний осталась. Чтобы шанс был выше: улучши класс, построй Библиотеку, добавь украшения.</p><button class="btn wide" data-close>Попробуем ещё</button>`;
  };
}
function settingsSheet() {
  return `<div class="sh-head"><h2>Настройки</h2><button class="x" data-close>✕</button></div>
    <p class="muted">Прототип v${VERSION}. Картинки временные.</p>
    <p>Сдано экзаменов: ${S.stats.passed} · не сдано: ${S.stats.failed} · выпускников: ${S.stats.graduated}</p>
    <button class="btn ghost wide" data-reset>Начать игру заново</button>`;
}

// ---------- effects ----------
function toast(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
  $('#fx').appendChild(t); setTimeout(() => t.remove(), 1800);
}
function sparkle(text) { toast('✨ ' + text); }
function flyCoins(el, amount) {
  const a = el.getBoundingClientRect(), b = $('#res-coins').getBoundingClientRect();
  const f = document.createElement('div'); f.className = 'fly'; f.textContent = `+${fmt(amount)} 🪙`;
  f.style.left = a.left + a.width / 2 + 'px'; f.style.top = a.top + 'px';
  $('#fx').appendChild(f);
  requestAnimationFrame(() => { f.style.transform = `translate(${b.left - a.left - a.width / 2}px, ${b.top - a.top}px) scale(.7)`; f.style.opacity = '0.2'; });
  setTimeout(() => f.remove(), 800);
  $('#res-coins').classList.add('pulse'); setTimeout(() => $('#res-coins').classList.remove('pulse'), 400);
}

// ---------- refresh loop ----------
function updateDynamic() {
  $('#coins').textContent = fmt(S.coins);
  $('#stars').textContent = fmt(S.stars);
  $('#studcount').textContent = `${S.students.length}/${beds()}`;
  document.querySelectorAll('[data-store]').forEach((el) => {
    const r = room(el.dataset.store); const v = Math.floor(r.store);
    el.textContent = fmt(v);
    el.parentElement.classList.toggle('hidden', v < 1);
    el.parentElement.classList.toggle('full', r.store >= storeCap(r) - 0.5);
  });
  document.querySelectorAll('[data-xp]').forEach((el) => {
    const s = S.students.find((x) => x.id === +el.dataset.xp);
    if (s) el.style.width = Math.min(100, (s.xp / xpNeed(s.course)) * 100) + '%';
  });
  document.querySelectorAll('[data-cost]').forEach((el) => el.classList.toggle('poor', S.coins < +el.dataset.cost));
}
function refresh(force = false) {
  const k = structureKey();
  if (force || k !== structKey) { structKey = k; renderScreen(); }
  if (sheet && force) $('#sheet').innerHTML = sheet();
  renderQuest();
  updateDynamic();
}

let lastTick = performance.now();
let saveTimer = 0;
function loop() {
  const now = performance.now();
  const dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
  step(dt);
  S.last = Date.now();
  refresh();
  saveTimer += dt; if (saveTimer > 5) { saveTimer = 0; save(); }
}

function applyOffline() {
  const away = Math.min(OFFLINE_CAP_SEC, (Date.now() - (S.last || Date.now())) / 1000);
  if (away < 60) return;
  const before = S.rooms.reduce((a, r) => a + r.store, 0);
  step(away);
  const gained = Math.floor(S.rooms.reduce((a, r) => a + r.store, 0) - before);
  const mins = Math.round(away / 60);
  if (gained > 0) {
    openSheet(() => `<div class="sh-head"><h2>С возвращением!</h2><button class="x" data-close>✕</button></div>
      <p class="center">Пока тебя не было ${mins >= 60 ? Math.floor(mins / 60) + ' ч ' : ''}${mins % 60} мин, ученики учились.</p>
      <div class="center big-txt">🪙 ${fmt(gained)}</div><p class="center muted">Монетки ждут в классах — нажми на них.</p>
      <button class="btn wide" data-close>Забрать</button>`);
  }
}

// ---------- input ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-room], [data-stud]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) {
    tab = d.tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === t));
    refresh(true); $('#screen').scrollTop = 0; return;
  }
  if (d.collect) { collect(d.collect, t); return; }
  if (d.quest !== undefined) {
    const q = QUESTS[S.quest]; if (q && q.check(S, ctx)) { S.coins += q.reward; S.quest++; sparkle(`Награда 🪙${q.reward}`); refresh(true); }
    return;
  }
  if (d.act === 'upgrade') { upgrade(d.type); return; }
  if (d.act === 'build') { build(d.type); return; }
  if (d.act === 'recruit') { recruit(); return; }
  if (d.act === 'decor') { buyDecor(d.type, +d.slot, d.id); openSheet(roomSheet(d.type)); return; }
  if (d.slot !== undefined && d.type) { openSheet(decorSheet(d.type, +d.slot)); return; }
  if (d.back) { openSheet(roomSheet(d.back)); return; }
  if (d.move) { openSheet(moveSheet(+d.move)); return; }
  if (d.moveto) { moveStudent(+d.id, d.moveto); closeSheet(); return; }
  if (d.exam) { openSheet(examSheet(+d.exam)); return; }
  if (d.doexam) {
    const id = +d.doexam; const student = { ...S.students.find((x) => x.id === id) };
    openSheet(examSheet(id, 'spin', { student }));
    setTimeout(() => {
      const res = takeExam(id); if (!res) { closeSheet(); return; }
      res.student = S.students.find((x) => x.id === id) || student;
      openSheet(examSheet(id, 'result', res)); refresh(true);
    }, 1300);
    return;
  }
  if (d.close !== undefined) { closeSheet(); refresh(true); return; }
  if (d.goto) { $(`#tabs [data-tab="${d.goto}"]`).click(); return; }
  if (d.gotoRoom) { openSheet(roomSheet(d.gotoRoom)); return; }
  if (d.reset !== undefined) {
    if (confirm('Точно начать заново? Весь прогресс пропадёт.')) { localStorage.removeItem(SAVE_KEY); freshState(); save(); closeSheet(); refresh(true); }
    return;
  }
  if (t.id === 'btn-settings') { openSheet(settingsSheet); return; }
  if (d.stud) {
    const s = S.students.find((x) => x.id === +d.stud);
    if (s && examReady(s)) openSheet(examSheet(s.id)); else if (s) toast(`${s.name}, курс ${s.course}: учится…`);
    return;
  }
  if (d.room) { openSheet(roomSheet(d.room)); }
});
$('#sheet-bg').addEventListener('click', () => { closeSheet(); refresh(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
  else { applyOffline(); lastTick = performance.now(); refresh(true); }
});
window.addEventListener('pagehide', save);

// ---------- boot ----------
load();
applyOffline();
refresh(true);
setInterval(loop, 250);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
