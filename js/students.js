// Student path, stage 1 «На пороге» + stage 2 parts (Ruslan 2026-11-26: «С предложениями согласен», «да»; tools/_patch/students_s8a.py).
// - Two-part names: a first name (data.js NAMES) + a per-species surname/epithet (NAME_PARTS below, PLACEHOLDERS: texts by Maria).
//   New students get one at the gate; existing students get one lazily, chosen by their id (stable, no save change needed).
// - Student card: a tap on a student (or a newcomer waiting at the gate) opens a small card: name, species, rank, favourite class,
//   mood, what they are doing now, their next exam chance, «⭐ В любимчики» (up to FAV_MAX, S.favs = ids; a heart over them on the map).
// - Favourite class of the species (lore/canon.md): +FAV_EXAM lesson-exam chance and +FAV_MOOD mood per lesson there.
// - Favourites' path: their passed / failed lessons, new rank, graduation, leaving come as short named toasts (in the 🔔 list).
// - Gifted newcomers («одарённый новичок»): rolled when a newcomer joins the gate crowd, more often with a better rating; sparkles,
//   +GIFT_RANK on every rank exam; wait at the gate ×GIFT_WAIT longer.
// - Stage 3 (Ruslan «да»): rank rules unchanged for everyone; only a ⭐ favourite who just FAILED a rank exam gets the offer
//   «🔁 Пересдать за 🪙X» (toast -> card): paid, he goes back to the SAME class at his next way to a class (at once when he is walking
//   to a door or standing in a door line), takes the lesson again under the normal queue rules, then the same rank exam at the same
//   chance; once per class per student (a.rtd); cancelled with the money back if the class closes or his rank changed meanwhile.
//   The card says whether he can still grow (a class ahead holds the exam one step above his rank).
// - Visible demand at the gate: up to GATE_PEND (game.js) newcomers stand outside the gate; each waits CROWD_WAIT s of play time, then
//   leaves quietly (no review, no refund, no penalty), counted as «ушли, не дождавшись» with the fee they would have paid. A small
//   counter over the gate; the plate «🚪 У ворот ждут …» only after PLATE_T s of sustained jam (Ruslan's fear, registry §5b).
// Everything the module needs from game.js comes through `api` (getters, so the order of declarations there does not matter).
// s8c (tools/_patch/students_s8c.py): students screen with 3 tabs, album lines, life log + biographies, mini-stories, master of the
// week, alumni book; see the section «s8c» below.

// ---- tuning constants (starting values; final numbers in the economy check, registry §5b) ----
const FAV_MAX = 5;            // favourites at most
const FAV_EXAM = 0.05;        // + lesson-exam chance in the species' favourite class (absolute)
const FAV_MOOD = 3;           // + mood after every lesson in the favourite class (passed or not)
const FAV_TOAST_GAP = 60;     // s: a favourite's passed/failed toast at most once per this time (rank, graduation, leaving: always)
const GIFT_P0 = 0.01, GIFT_P1 = 0.03;   // chance of a gifted newcomer: GIFT_P0 at rating <= 3★, growing linearly to GIFT_P1 at 5★
const GIFT_GAP = 180;         // s of play time between two gifted newcomers at least (a big school gets hundreds of arrivals a minute)
const GIFT_RANK = 0.10;       // + chance on every rank exam (absolute)
const GIFT_WAIT = 2;          // a gifted newcomer waits this many times longer at the gate
const CROWD_WAIT = 180;       // s of play time a newcomer waits at the gate before leaving quietly
const PLATE_T = 60;           // s of sustained jam before the plate replaces the small counter
const PLATE_OFF = 10;         // s without a jam that end the episode (the timer restarts)
const LEFT_WIN = 600;         // s: «ушли, не дождавшись» on the plate counts the last 10 min of play time
const RT_LESSONS = 4;         // stage 3: a favourite's rank-exam retake costs this many lessons of that class (then the pace floor, paced(…, 1))

// ---- favourite class per species (lore/canon.md, registry C6.1-C6.4); world-2 species have no canon page yet ----
const FAV_CLASS = { mothfox: 'charms', petalear: 'herbs', fernhorn: 'elements', starwhisker: 'flight' };

// ---- PLACEHOLDER TEXTS: texts by Maria (surname / epithet parts per species, gender-neutral on purpose; >= 15 each) ----
const NAME_PARTS = {
  mothfox: ['Пыльцекрыл', 'Искрохвост', 'Светокрыл', 'Ярколап', 'Звонкокрыл', 'Медоус', 'Цветохвост', 'Лучекрыл', 'Златопыл', 'Огнекрыл', 'Сверкохвост', 'Пёстрокрыл', 'Луговей', 'Ветроус', 'Радугокрыл', 'Росохвост'],
  petalear: ['Тихоух', 'Листоух', 'Мохолап', 'Росоух', 'Травоух', 'Шелестоух', 'Лепестоух', 'Чуткоух', 'Мятоух', 'Клеверолап', 'Тишелап', 'Цветоух', 'Ландышеух', 'Папоротнолап', 'Зеленоух', 'Тёплолап'],
  fernhorn: ['Громохвост', 'Крепкорог', 'Камнелоб', 'Огнерог', 'Дуборог', 'Пламелоб', 'Скалолап', 'Корнерог', 'Твердолап', 'Жаролоб', 'Буреног', 'Кремнерог', 'Лесорог', 'Сосноног', 'Искророг', 'Вулканчик'],
  starwhisker: ['Ветроух', 'Облакокрыл', 'Звездоус', 'Небокрыл', 'Лёгкокрыл', 'Весноух', 'Порхокрыл', 'Тучкокрыл', 'Высокрыл', 'Ветрохвост', 'Зарекрыл', 'Пухокрыл', 'Лунокрыл', 'Вьюнокрыл', 'Синекрыл', 'Радужоус'],
  mossmole: ['Мохокоп', 'Тихокоп', 'Фонареус', 'Глубокоп', 'Корнекоп', 'Землерой', 'Мшистолап', 'Темнокоп', 'Светоус', 'Норокоп', 'Грибоус', 'Камнекоп', 'Влажнолап', 'Сумракоп', 'Тоннелец', 'Рыхлолап'],
  owlbat: ['Сумракрыл', 'Ночеглаз', 'Тенекрыл', 'Лунноглаз', 'Мракоух', 'Тихолёт', 'Совокрыл', 'Звездоглаз', 'Полуночник', 'Эхоух', 'Сонокрыл', 'Темнопер', 'Ухокрыл', 'Сводолёт', 'Пещеролёт', 'Мглокрыл'],
  quartzhog: ['Кварцеспин', 'Иглоблеск', 'Друзоспин', 'Гранелап', 'Искроиг', 'Хрустальник', 'Блескоспин', 'Камнеиг', 'Сверкоиг', 'Светоспин', 'Кремнеспин', 'Гранитик', 'Аметистик', 'Колкоспин', 'Лучеиг', 'Самоцветик'],
  batbunny: ['Медноух', 'Звоноух', 'Прыгоух', 'Латуноух', 'Блестоух', 'Бронзолап', 'Колокоух', 'Скокоух', 'Чеканоух', 'Рыжеух', 'Искроух', 'Монетоух', 'Звяколап', 'Пружиноух', 'Жестяноух', 'Котелкоух'],
  geosnail: ['Медленец', 'Неспешник', 'Ракушник', 'Друзовик', 'Самоцветник', 'Тихоползь', 'Блескораковин', 'Каменноспин', 'Сводоползь', 'Жеодовик', 'Камнедом', 'Светораковин', 'Гладкоспин', 'Мерцаползь', 'Кварцедом', 'Ползунец'],
  axolotl: ['Озерник', 'Жаброус', 'Плескохвост', 'Глубинник', 'Розожабр', 'Водохвост', 'Струйник', 'Подземник', 'Ключевик', 'Омутник', 'Пузырёк', 'Тинохвост', 'Светожабр', 'Родничок', 'Волнохвост', 'Каплехвост'],
};

// ===================== s8c: the rest of rework step 8 «ученики» (tools/_patch/students_s8c.py) =====================
// Ruslan 2026-11-26 (design/mechanics_rework.md step 8; session #9d26d692): one students screen with 3 tabs, album XP-only with
// species lines, alumni book in the graduates' garden (reviews + «Аллея славы»), master of the week, mini-stories from real events,
// life log + biographies in Tikhon's voice, names everywhere. Every number below is a STARTING constant (economy check §5b);
// every text is a PLACEHOLDER for Maria.
const S8C = {
  STORY_FIRST: 300,     // s of play before the first mini-story of a page load
  STORY_GAP: 600,       // s of play between two mini-stories (never spam: one at a time through the 6d window queue)
  STORY_CD: 1800,       // s before the same template may come again
  STORY_FRESH: 240,     // s a detected event stays a candidate
  STORY_WAIT: 600,      // s a queued story may wait for its window (one window a minute); then it is dropped
  FRIEND_T: 30,         // s two students must study side by side (summed) to become friends
  FRIEND_D: 1.3,        // tiles: «side by side» in class
  FRIEND_MOOD: 3,       // + mood after a lesson when the friend studies in the same class
  HOME_T: 60,           // s asleep in the dorm waiting for a class -> «скучает по дому»
  QUARREL_MOOD: 35,     // both below this mood while side by side -> «поссорились»
  FEAR_CHEER_MOOD: 25, FEAR_CHEER_LUCK: 0.05,   // «Подбодрить»: mood + next exam chance (a.luck, one lesson)
  HOME_LETTER: 30, HOME_WALK: 20,               // mood
  BDAY_CLASS: 10, BDAY_GIFT: 30, BDAY_LUCK: 0.05,
  PRIDE_MOOD: 15, LIB_SLEEP: 15, MAKEUP: 15, CALM: 5,
  LOG_MAX: 24,          // life-log entries kept per student
  BOOK_MAX: 300,        // lines in «Истории школы»
  LAST_MAX: 40,         // last graduates in the alumni book
  FAME_MAX: 100,        // farewelled heroes kept in «Аллея славы»
  RB_WIN: 1.5,          // s: all four W1 races graduate within this -> «Радуга дружбы» (D7.10 hook)
  RB_CD: 86400000,      // ms of real time between two rainbows
  NOW_LIST: 20,         // rows of «все ученики» on the first tab
};
// ---- PLACEHOLDER TEXTS (Maria): one line about the species opens with every album level of any of its cards (in order) ----
const SP_LINES = {
  mothfox: ['Тихон записал: «Опять улетела за бабочкой». Это про лисичку-мотылька, и это уже девятая запись за неделю.', 'Лисичка-мотылёк не умеет хранить секреты: однажды она шёпотом рассказала всей столовой, что шёпотом ничего не скажет.', 'Если лисичка-мотылёк чихнёт на уроке Чар, класс полчаса светится розовым.', 'В ночь Праздника Пыльцы лисички кружат над школьным двором, и Тихон делает вид, что не видит их из окна.', 'Самое страшное слово у лисичек — «бескрылый». Его даже в шутку не говорят.', 'Мастер Искра поставила лисичкам отдельный стол: их заклинания слишком громкие для остальных.', 'Лисичка-мотылёк не может долго злиться: обиделась — и через минуту уже несёт обидчику конфету.', 'Говорят, пыльца с крыльев лисичек светится в темноте ещё три дня. Ушастики собирают её в баночки.', 'Тихон уверен: если лисичка однажды долетит до звёзд, она вернётся с полными карманами пыльцы.'],
  petalear: ['Ушастик слышит, как растёт трава. Профессор Мох проверял: правда слышит.', 'На Зельеварении ушастики садятся на задние ряды — котёл Мадам Пузырь слишком громкий.', 'Вместо «до свидания» ушастики касаются друг друга кончиками ушей. Тихон тоже попробовал, но у него не вышло.', 'Каждый ушастик носит засушенный листок из родной долины. Однажды один ушастик потерял свой, и вся школа искала его до ночи.', 'Ушастики смеются беззвучно: только уши трясутся.', 'Профессор Мох говорит, что ушастики — единственные, кто дослушивает его истории до конца.', 'Если ушастик приложит ухо к земле, он услышит, где спрятан клад. Но никому не скажет.', 'Ушастик может молчать целый урок, а потом сказать одно слово — и оно окажется ответом на экзамен.', 'В теплице есть цветок, который распускается, только когда рядом ушастик.'],
  fernhorn: ['Рогатик сажает дерево в честь каждого важного дня. Двор школы понемногу становится лесом.', 'Ссора у рогатиков — это когда двое молча стоят рог к рогу, пока кто-то не уступит. Иногда до ужина.', 'Рогатик скорее десять раз провалит экзамен, чем пойдёт в библиотеку. Но на одиннадцатый раз всё-таки идёт.', 'Весной на рогах у рогатиков распускаются маленькие цветы. Они очень этого стесняются.', 'Госпожа Буря говорит, что у рогатиков «характер как у вулкана», и это у неё высшая похвала.', 'Первый рогатик пришёл в школу, потому что Тихон пообещал посадить дерево у ворот. Дерево растёт до сих пор.', 'Рогатик медленно заводит друзей. Но если ты друг рогатика — это навсегда.', 'Рогатики не умеют просить о помощи, поэтому помогают сами — всем подряд.', 'Тихон записал: «Рогатик опять сдал Стихии с первого раза и сделал вид, что это пустяки».'],
  starwhisker: ['Крылоушка опаздывает на первый урок. Каждый день. С разными объяснениями.', 'Узор на крыльях у каждой крылоушки свой. Капитан Ветерок узнаёт учеников по узору, а не по именам.', 'Спроси крылоушку, где она зимует, — каждый раз услышишь новую историю.', 'Капитан Ветерок говорит, что крылоушки не летают, а «танцуют в воздухе».', 'Весной крылоушки устраивают Танец бабочек на рассвете. Тихон встаёт пораньше, чтобы посмотреть.', 'Крылоушка не может сидеть на месте больше минуты. На экзамене ей разрешают сдавать стоя.', 'Говорят, крылоушки видели, куда исчез прежний директор. Но рассказывают каждый раз по-разному.', 'Когда крылоушка влюбляется, узор на крыльях чуть-чуть меняется. Все сразу всё понимают.', 'Крылоушки обожают истории, где правду не отличить от выдумки. Тихон подозревает, что половина школьных легенд — их работа.'],
};
const SP_LINES_W2 = ['Тихон пока не записал ничего об этом народе. (строчку напишет Маша)', 'Вторая заметка о виде. (строчку напишет Маша)', 'Третья заметка о виде. (строчку напишет Маша)'];
// ---- PLACEHOLDER TEXTS (Maria): mini-story templates. {n} {m} names, {c} class. Each choice: button, chronicle line, short bio phrase ----
const STORIES = {
  fear: { e: '😰', t: '{n} боится экзамена', x: '{n} второй раз не сдаёт «{c}». Сидит в коридоре и смотрит в пол. Ещё одна попытка — и страшно до дрожи в ушах.',
    ch: [{ b: '🫂 Подбодрить', l: '🫂 {n}: страх перед «{c}» прошёл — директор подбодрил.', bio: 'Перед «{c}» было страшно — директор подбодрил.' },
      { b: '📚 В библиотеку', l: '📚 {n}: перед «{c}» — вечер в библиотеке с книгой Тихона.', bio: 'Перед «{c}» — вечер в библиотеке, Тихон помнит.' }] },
  friends: { e: '💞', t: '{n} и {m} подружились', x: '{n} и {m} уже который урок сидят рядом. Делятся перьями, шепчутся на Чарах и вместе ходят в столовую.',
    ch: [{ b: '💞 Пусть дружат', l: '💞 {n} и {m} подружились — теперь их не разлучить.', bio: 'Лучший друг — {m}.' }] },
  home: { e: '🏠', t: '{n} скучает по дому', x: '{n} давно ждёт места в классе и сидит в спальне у окна. Говорит, что дома сейчас пекут пироги.',
    ch: [{ b: '✉️ Письмо домой', l: '✉️ {n}: письмо домой ушло с совой, к вечеру пришёл ответ.', bio: 'Скучал по дому — помогло письмо от родных.' },
      { b: '🌳 Прогулка во дворе', l: '🌳 {n}: прогулка во дворе — и тоска прошла.', bio: 'Однажды загрустил по дому — спасла прогулка во дворе.' }] },
  bday: { e: '🎂', t: '{n}: сегодня день рождения!', x: '{n} сегодня празднует день рождения. Класс «{c}» уже шепчется и прячет что-то под партами.',
    ch: [{ b: '🎂 Праздник в классе', l: '🎂 {n}: день рождения — праздник всем классом «{c}».', bio: 'Один день рождения отметили всем классом «{c}».' },
      { b: '🎁 Подарок от директора', l: '🎁 {n}: день рождения — подарок от директора.', bio: 'На день рождения получил подарок от самого директора.' }] },
  pride: { e: '🌟', t: '{n} — гордость школы', x: '{n} сдаёт уже третий экзамен подряд с первого раза. Учителя переглядываются: растёт кто-то особенный.',
    ch: [{ b: '🌟 Похвалить', l: '🌟 {n}: три экзамена подряд с первого раза.', bio: 'Три экзамена подряд — с первого раза.' }] },
  lib: { e: '🕯️', t: '{n} не спит: читает', x: 'Уже ночь, а {n} всё сидит в библиотеке со свечкой. Закладкин зевает и смотрит на директора.',
    ch: [{ b: '🕯️ Пусть читает', l: '🕯️ {n}: ночь в библиотеке — к экзамену всё выучено.', bio: 'Однажды просидел в библиотеке до рассвета.' },
      { b: '🛏️ Отправить спать', l: '🛏️ {n}: директор отправил спать — утро вечера мудренее.', bio: 'Директор однажды отправил спать прямо из библиотеки.' }] },
  quarrel: { e: '💢', t: '{n} и {m} поссорились', x: '{n} и {m} сидят рядом и дуются друг на друга. Кто-то кого-то толкнул локтем, а кто — уже не разобрать.',
    ch: [{ b: '🤝 Помирить', l: '🤝 {n} и {m}: ссора позади — мир и дружба.', bio: 'Поссорился с {m} — директор помирил, и они подружились.' },
      { b: '⏳ Само пройдёт', l: '⏳ {n} и {m}: поссорились и сами помирились к ужину.', bio: 'Поссорился с {m}, но к ужину помирились.' }] },
};

export function initStudents(api) {
  const S = () => api.S();
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const hash = (n) => { let x = (n | 0) * 2654435761; x ^= x >>> 15; return Math.abs(x | 0); };
  const partOf = (sp, id) => { const L = NAME_PARTS[sp]; return L ? L[hash(id) % L.length] : ''; };
  const spName = (sp) => (api.spNames()[sp] || '');
  let clock = 0;                   // play seconds seen by step() (sim and live; not the offline catch-up)

  // ---------------- names ----------------
  function full(a) {   // «Пуговка Ромашкина»: first name + the species' part; records without a species (parents, old helpers) stay as they are
    if (!a) return '';
    if (!a.fn && a.sp && NAME_PARTS[a.sp] && a.id !== undefined && a.id !== null && a.id >= 0) a.fn = partOf(a.sp, a.id);
    return a.fn && a.name ? `${a.name} ${a.fn}` : (a.name || '');
  }
  function anyName(i = -1) {   // a real student of class i (or of the school) for letters; a made-up full name when the school is empty
    const L = api.inSchool().filter((a) => api.isStudent(a)), C = i >= 0 ? L.filter((a) => a.c === i || (a.goal && a.goal.i === i)) : [];
    const a = rnd(C.length ? C : L);
    if (a) return full(a);
    const sp = rnd(api.species()); return `${rnd(api.names())} ${rnd(NAME_PARTS[sp] || [''])}`.trim();
  }

  // ---------------- favourites ----------------
  const favs = () => { const s = S(); if (!s) return []; if (!Array.isArray(s.favs)) s.favs = []; return s.favs; };
  const isFav = (id) => id !== undefined && favs().includes(id);
  function toggleFav(id) {
    const F = favs(), k = F.indexOf(id);
    if (k >= 0) { F.splice(k, 1); api.save(); return true; }
    if (F.length >= FAV_MAX) { api.toast(`⭐ Любимчиков уже ${FAV_MAX}: сначала убери кого-нибудь`); return false; }
    F.push(id); api.save(); api.stats('fav', { n: F.length }); return true;
  }
  const dropFav = (id) => { const F = favs(), k = F.indexOf(id); if (k >= 0) F.splice(k, 1); };
  let pruneT = 0, missing = {};
  function pruneFavs() {   // a favourite who is no longer in the school (graduated, left, moved to the tower) drops off the list
    const F = favs(); if (!F.length) return; const ids = new Set(api.agents().map((a) => a.id));
    for (const id of [...F]) { if (ids.has(id)) { delete missing[id]; continue; } missing[id] = (missing[id] || 0) + 1; if (missing[id] >= 2) { dropFav(id); delete missing[id]; } }
  }
  const favCls = (a) => { const id = FAV_CLASS[a && a.sp]; return id ? api.classes().findIndex((c) => c.id === id) : -1; };

  // ---------------- exam hooks ----------------
  const examB = (a, i) => (api.world() === 1 && i >= 0 && favCls(a) === i ? FAV_EXAM : 0);
  const rankB = (a) => (a && a.gift ? GIFT_RANK : 0);
  function ev(a, k, i = -1) {   // moments of a student: favourite class mood, favourites' toasts, gifted stats
    if (!a) return;
    if (k === 'grad' && isFav(a.id)) a._wasFav = 1;   // s8c: the alumni book and the graduation moment still know he was a favourite
    logEv(a, k, i);   // s8c: life log, story triggers
    if ((k === 'pass' || k === 'fail') && i >= 0 && favCls(a) === i && api.world() === 1) a.mood = Math.min(100, (a.mood ?? 80) + FAV_MOOD);
    if (k === 'rankfail' && isFav(a.id) && api.world() <= 2 && !(a.rtd || []).includes(i)) a.rto = i;   // stage 3: the retake offer
    if (k === 'rank' && a.gift) api.stats('gifted', { k: 'rank', r: a.rk || 0 });
    if (k === 'grad' && a.gift) api.stats('gifted', { k: 'grad', r: a.rk || 0 });
    if (!isFav(a.id)) return;
    const n = full(a), cn = i >= 0 && api.classes()[i] ? api.classes()[i].name : '', quiet = api.ffwd();
    if (k === 'grad' || k === 'left') dropFav(a.id);
    if (quiet) return;
    if (k === 'pass' || k === 'fail') {
      if (clock - (a._ft ?? -1e9) < FAV_TOAST_GAP) return; a._ft = clock;
      api.glog('toast', k === 'pass' ? `💗 ${n}: «${cn}» — сдано 🎉` : `💗 ${n}: «${cn}» — не сдано, будет ещё попытка`);   // audit F8: only in the 🔔 list
    } else if (k === 'rank') api.toastBig(`💗 ${n}: новое звание — ${api.rankName(a)} 🌟`);
    else if (k === 'rankfail') { const t = `💗 ${n}: экзамен на звание «${api.rankNameAt(i)}» не сдан${rtOk(a) ? ' — можно пересдать (нажми)' : ''}`; api.toast(t); tapToast(t, a); }
    else if (k === 'grad') api.toastBig(`💗 ${n}: выпуск! 🎓`);
    else if (k === 'left') api.toast(`💔 ${n}: не хватило места, пришлось уйти из школы`);
  }

  // ---------------- stage 3: a favourite's rank-exam retake ----------------
  const rtPrice = (i) => api.rtPrice(i, RT_LESSONS);
  function rtOk(a) {   // the offer stands: a favourite, failed here, not used here yet, class open, still one step below, still a student here
    const i = a ? a.rto : -1; if (!(i >= 0) || !isFav(a.id) || (a.rtd || []).includes(i) || a.rt >= 0) return false;
    if (!api.isOpen(i) || (a.rk || 0) !== api.rankAt(i) - 1 || a.retake) return false;
    const g = a.goal || {}; return g.t !== 'g' && g.t !== 'x' && a.state !== 'fly' && a.state !== 'vanish' && api.agents().includes(a);
  }
  function buyRt(a) {
    if (!rtOk(a)) { api.toast('Пересдача сейчас недоступна'); return false; }
    const i = a.rto, pr = rtPrice(i);
    if (!api.spend(pr)) return false;   // spend() says «Не хватает монет»
    a.rt = i; a.rtp = pr; (a.rtd ||= []).push(i); a.rto = -1;
    api.stats('retake', { i, r: a.rk || 0 });
    const now = api.retakeNow(a);   // walking to a door or standing in a door line: turns back at once; otherwise at his next way to a class
    api.toast(`🔁 ${full(a)} ${now ? 'идёт' : 'пойдёт'} пересдавать в «${api.classes()[i].name}»`); api.save(); return true;
  }
  function rtGo(a, i) {   // game.js goClass(): a paid retake turns the student to its class (cancelled with the money back when it cannot be taken)
    if (!a || !(a.rt >= 0)) return i;
    const t = a.rt;
    if (api.isOpen(t) && (a.rk || 0) === api.rankAt(t) - 1 && !a.retake) return t;
    a.rt = -1; if (a.rtp) { api.addCoins(a.rtp); if (!api.ffwd()) api.toast(`🔁 Пересдача ${full(a)} отменена, 🪙${api.fmt(a.rtp)} вернулись`); } a.rtp = 0;
    return i;
  }
  function rankAfter(a, i) {   // game.js finishLesson, right after rankTry(): a rank exam that was tried and not passed; a retake lesson is over
    if (a._rkT === i) { a._rkT = -1; ev(a, 'rankfail', i); }
    if (a.rt === i) { a.rt = -1; a.rtp = 0; }
  }
  function canGrow(a) {   // a class at or after his current one holds the rank exam one step above his rank
    const r = a.rk || 0; if (r >= 5) return false; if (a.rt >= 0 || rtOk(a)) return true;
    const C = api.classes(), g = a.goal || {}, from = g.i >= 0 ? g.i : a.c >= 0 ? a.c : 0;   // the class he studies in or goes to next
    for (let k = from; k < C.length; k++) if (api.rankAt(k) === r + 1) return true;
    return false;
  }
  function tapToast(t, a) {   // the toast opens the card (that is where the retake button is)
    try { const d = [...document.querySelectorAll('#fx .toast')].find((x) => x.dataset.t === t); if (d) { d.style.pointerEvents = 'auto'; d.style.cursor = 'pointer'; d.onclick = () => open(a); } } catch (e) { /* only a convenience */ }
  }

  // ---------------- the gate crowd ----------------
  const gate = () => api.gate();
  function newcomer() {   // who stands at the gate: species, two-part name, gifted or not
    const sp = rnd(api.species()), o = { sp, name: rnd(api.names()), fn: rnd(NAME_PARTS[sp] || ['']), w: 0, ph: Math.random() * 6 };
    return o;
  }
  function crowd() {   // S.gate.crowd mirrors S.gate.pend (old saves: the counted newcomers get faces)
    const g = gate(); if (!Array.isArray(g.crowd)) g.crowd = [];
    const C = g.crowd; while (C.length < (g.pend || 0)) C.push(newcomer()); if (C.length > (g.pend || 0)) C.length = Math.max(0, g.pend || 0);
    return C;
  }
  const giftP = () => { const r = api.rating() || 0; return Math.max(GIFT_P0, Math.min(GIFT_P1, GIFT_P0 + (GIFT_P1 - GIFT_P0) * (r - 3) / 2)); };
  let giftAt = -1e9;
  function join() {   // a newcomer has just joined the crowd (game.js gateArrive, after pend++)
    const C = gate().crowd || (gate().crowd = []), o = newcomer();
    const force = window.__s8aGift ? (window.__s8aGift--, true) : false;   // test hook: the next N newcomers are gifted
    if (force || (clock - giftAt >= GIFT_GAP && Math.random() < giftP())) {
      o.gift = 1; giftAt = clock; M.gifted++;
      api.stats('gifted', { k: 'arr', r: Math.round((api.rating() || 0) * 10) });
      if (!api.ffwd() && !api.edit()) { const s0 = api.stats0(), t = `✨ У ворот одарённый новичок: ${o.name} ${o.fn} (${spName(o.sp).toLowerCase()})!`;   // audit F8: big toast only for the first 3
        s0.giftTb = (s0.giftTb || 0) + 1; if (s0.giftTb <= 3) api.toastBig(t); else api.glog('toast', t); }
    }
    C.push(o); crowd();
  }
  let admitted = null;
  function admit() { const C = gate().crowd || []; admitted = C.shift() || null; crowd(); }   // game.js gateLet, after pend-- (the first in line walks in; no sync before the shift, it would cut the last one)
  function dress(a) {   // spawn(): the newcomer who walks in is the one who waited at the gate
    const o = admitted; admitted = null;
    if (o) { a.sp = api.species().includes(o.sp) ? o.sp : a.sp; a.name = o.name || a.name; a.fn = o.fn; if (o.gift) { a.gift = 1; api.stats('gifted', { k: 'in', w: Math.round(o.w || 0) }); } }
    if (!a.fn) a.fn = rnd(NAME_PARTS[a.sp] || ['']) || undefined;
    arrive(a);   // s8c: the life log starts at the gate
  }
  // quiet leavers: no review, no refund, no penalty; only counted (lifetime in S.stats, the last LEFT_WIN s for the plate)
  const gone = [];   // { t: clock, f: fee }
  const departing = [];   // for the eye: leavers walk off and fade
  const leftWin = () => { while (gone.length && clock - gone[0].t > LEFT_WIN) gone.shift(); return { n: gone.length, f: gone.reduce((s, o) => s + o.f, 0) }; };
  // sustained jam -> plate; measurement of Ruslan's fear (share of play time with the plate shown)
  let jamT = 0, offT = 0, plateOn = false, plateEp = 0, plateEpLeft = 0;
  const M = { t: 0, plate: 0, crowdT: 0, crowdMax: 0, left: 0, gifted: 0, episodes: 0, sumT: 0, sumPlate: 0, sumLeft: 0 };   // since the page load (test hook window.__s8a.m)
  const jamNow = () => api.gatePend() && (api.overfull() || !api.recRoom());
  function step(dt, live) {
    if (api.ffwd() || !(dt > 0)) {   // the offline catch-up: newcomers still leave, but nothing is shown or measured
      tickCrowd(dt, false); return;
    }
    clock += dt;
    tickCrowd(dt, true);
    step8c(dt);   // s8c: stories, life scan, tower departures, master of the week
    if ((pruneT += dt) >= 5) { pruneT = 0; pruneFavs(); }
    // plate rule
    if (jamNow()) { jamT += dt; offT = 0; } else if ((offT += dt) >= PLATE_OFF) jamT = 0;
    // the plate means a real loss: a sustained jam AND somebody left without getting in during the last LEFT_WIN s (measured: Maria's
    // save has 12 waiting ~100 % of the time but nobody leaves - everyone gets in within the wait; then the small counter is enough)
    const on = jamT >= (window.__s8aPlateT ?? PLATE_T) && (leftWin().n > 0 || !!window.__s8aPlateT);
    if (on && !plateOn) { plateOn = true; plateEp = clock; plateEpLeft = M.left; M.episodes++; }
    else if (!on && plateOn) { plateOn = false; api.stats('gate', { k: 'plate', d: Math.round(clock - plateEp), n: M.left - plateEpLeft }); }
    const vis = !live || !document.hidden;
    if (vis) { M.t += dt; M.sumT += dt; const n = crowd().length; if (n) M.crowdT += dt; M.crowdMax = Math.max(M.crowdMax, n); if (plateOn) { M.plate += dt; M.sumPlate += dt; } }
    if (M.sumT >= 300) { api.stats('gate', { k: 'sum', t: Math.round(M.sumT), pl: Math.round(M.sumPlate), n: M.sumLeft }); M.sumT = 0; M.sumPlate = 0; M.sumLeft = 0; }
  }
  function tickCrowd(dt, shown) {
    const C = crowd(); if (!C.length) return;
    for (let k = C.length - 1; k >= 0; k--) {
      const o = C[k]; o.w = (o.w || 0) + dt;
      if (o.w < CROWD_WAIT * (o.gift ? GIFT_WAIT : 1)) continue;
      C.splice(k, 1); gate().pend = Math.max(0, (gate().pend || 0) - 1);
      const f = api.entryFee(), st = api.stats0(); st.gateLeft = (st.gateLeft || 0) + 1; st.gateLost = (st.gateLost || 0) + f;
      if (shown) { gone.push({ t: clock, f }); M.left++; M.sumLeft++; if (departing.length < 20) departing.push({ sp: o.sp, k, t: performance.now(), gift: o.gift }); }
      if (o.gift) { api.stats('gifted', { k: 'left', w: Math.round(o.w) }); if (shown && !api.edit()) api.toast(`💨 Одарённый новичок ${o.name} ${o.fn} не дождался места и ушёл`); }
    }
  }

  // ---------------- drawing ----------------
  // crowd places outside the gate: rows of 4 behind the gate tile (bigger y = further out), small stable jitter
  function crowdSpot(k) {
    const G = api.gateTile(), row = Math.floor(k / 4), col = k % 4, j = (hash(k + 7) % 100) / 100 - 0.5;
    return { x: G.x - 1.05 + col * 0.7 + (row % 2 ? 0.35 : 0) + j * 0.12, y: G.y + 0.55 + row * 0.62 + j * 0.1 };
  }
  function drawCrowd(add) {
    if (api.edit()) return;
    const C = crowd(), T = performance.now() / 1000;
    C.forEach((o, k) => { const p = crowdSpot(k); add(p.x, p.y, () => api.drawCreature({ sp: o.sp, back: true, flip: (k % 2) === 1, path: [], ph: (o.ph || 0) + T, gift: o.gift, _crowd: 1 }, p.x, p.y, 30)); });
    const now = performance.now();
    for (let k = departing.length - 1; k >= 0; k--) {
      const d = departing[k], u = (now - d.t) / 2200; if (u >= 1) { departing.splice(k, 1); continue; }
      const p = crowdSpot(d.k), x = p.x + u * 0.4, y = p.y + u * 1.6;
      add(x, y, () => { const c = api.ctx(); c.save(); c.globalAlpha = 1 - u; api.drawCreature({ sp: d.sp, back: false, flip: false, path: [1], ph: T * 3, gift: d.gift, _crowd: 1 }, x, y, 30); c.restore(); });
    }
  }
  function over(a, x, y, h) {   // drawCreature hook: a heart over a favourite, sparkles round a gifted student
    const fav = a.id !== undefined && !a._crowd && isFav(a.id);
    if (!fav && !a.gift) return;
    const c = api.ctx(), T = performance.now() / 1000 + (a.ph || 0);
    if (a.gift) {
      for (let k = 0; k < 3; k++) {
        const an = T * 1.1 + k * 2.09, px = x + Math.cos(an) * h * 0.42, py = y - h * 0.6 + Math.sin(an) * h * 0.3, tw = 0.5 + 0.5 * Math.sin(T * 4 + k * 1.9);
        api.star4(px, py, 1.6 + 2 * tw, '#ffe27a', 0.45 + 0.55 * tw);
      }
    }
    // s8c: the favourite's heart is now a name plate in the overlay layer (drawFavs), visible over walls
  }
  // the gate: a small counter while newcomers wait, the plate after a sustained jam (tap = what to fix)
  let plateRect = null;
  function drawGate() {
    plateRect = null; if (api.edit()) return;
    const C = crowd(); if (!C.length && !plateOn) return;
    const G = api.gateTile(), g = api.P(Math.floor(G.x) + 1, G.y - 1), k = api.signK(), c = api.ctx();
    if (!api.onScreen(g.x, g.y - 80, 300, 300)) return;
    const top = g.y - (api.gateH() || 70) * 0.9 - 4 * k + Math.sin(performance.now() / 450) * 1.5 * k;
    if (!plateOn) {   // the small counter
      const fs = 8.5 * k, t = `у ворот ждут ${C.length}`; c.save(); c.font = `800 ${fs}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`;
      const ew = fs * 1.3, pad = 5 * k, bw = c.measureText(t).width + ew + pad * 2, bh = fs * 1.8, x = g.x - bw / 2, y = top - bh;
      c.fillStyle = 'rgba(255,252,240,0.92)'; c.strokeStyle = '#b89a6a'; c.lineWidth = 1.1 * k; c.beginPath(); c.roundRect(x, y, bw, bh, 7 * k); c.fill(); c.stroke();
      c.fillStyle = '#5a4630'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(t, x + pad + ew, y + bh / 2 + 0.5 * k); c.restore();
      api.emoji('🚶', x + pad + ew * 0.42, y + bh / 2, fs * 1.05);
      if (C.some((o) => o.gift)) api.emoji('✨', x + bw - pad * 0.3, y + 1.5 * k, fs * 1.15);   // audit F8: a gifted one waits
      plateRect = { x0: x, y0: y, x1: x + bw, y1: y + bh, t: performance.now(), plate: false };
      return;
    }
    const L = plateLines(), fs = 9.5 * k, lh = fs * 1.55; c.save(); c.font = `800 ${fs}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`;
    const ew = fs * 1.35, pad = 6 * k, wOf = (s) => c.measureText(s.replace('🪙', '')).width + (s.includes('🪙') ? fs * 1.15 : 0);
    const bw = Math.max(...L.map(wOf)) + ew + pad * 2.2, bh = lh * L.length + pad * 0.9, x = g.x - bw / 2, y = top - bh;
    c.fillStyle = '#fff3ea'; c.strokeStyle = '#d9534f'; c.lineWidth = 1.6 * k; c.beginPath(); c.roundRect(x, y, bw, bh, 8 * k); c.fill(); c.stroke();
    c.textBaseline = 'middle';
    L.forEach((s, n) => {   // a line may hold one 🪙 drawn as the game's emoji picture
      let cx = x + pad + ew; const cy = y + pad * 0.45 + lh * (n + 0.5); c.fillStyle = n ? '#7a3b3b' : '#9b2c2c'; c.textAlign = 'left';
      const [a0, b0] = s.split('🪙'); c.fillText(a0, cx, cy + 0.5 * k); if (b0 !== undefined) { cx += c.measureText(a0).width; api.emoji('🪙', cx + fs * 0.55, cy, fs * 0.95); cx += fs * 1.15; c.fillText(b0, cx, cy + 0.5 * k); }
    });
    c.restore(); api.emoji('🚪', x + pad + ew * 0.42, y + pad * 0.45 + lh * 0.5, fs * 1.1);
    plateRect = { x0: x, y0: y, x1: x + bw, y1: y + bh, t: performance.now(), plate: true };
  }
  function culprit() { if (!api.recRoom() && !api.overfull()) return { t: 'тормозит приёмная', go: ['REC', null] }; const b = api.fullClass(); return b >= 0 ? { t: `тормозят «${api.classes()[b].name}»`, go: api.fullGo(b) } : { t: 'классы не успевают', go: null }; }
  function plateLines() {
    const n = crowd().length, lw = leftWin(), cu = culprit();
    const L = [`У ворот ждут ${n} · ${cu.t}`];
    if (lw.n) L.push(`ушли, не дождавшись: ${lw.n} (−🪙${api.fmt(lw.f)})`);
    return L;
  }

  // ---------------- taps ----------------
  function crowdAt(wx, wy) {
    const C = crowd(); let best = -1, bd = 1e9;
    C.forEach((o, k) => { const p = crowdSpot(k), m = api.P(p.x, p.y), d = Math.hypot(wx - m.x, (wy - (m.y - 15)) * 0.8); if (d < 14 && d < bd) { bd = d; best = k; } });
    return best;
  }
  function tapTop(wx, wy) {   // before everything else: the plate/counter over the gate and the crowd outside it (nothing else stands there)
    const r = plateRect;
    if (r && performance.now() - r.t < 600 && wx >= r.x0 - 4 && wx <= r.x1 + 4 && wy >= r.y0 - 4 && wy <= r.y1 + 4) { api.openPanel(gatePanel); return true; }
    const k = crowdAt(wx, wy); if (k >= 0) { openCrowd(crowd()[k]); return true; }
    return false;
  }
  function tapStudent(wx, wy) {   // before the room: a tap right on a student (a seated student in class: only a favourite or a gifted one)
    let best = null, bd = 1e9;
    for (const a of api.agents()) {
      if (a.state === 'fly' || a.state === 'vanish' || a.mcls || !api.isStudent(a)) continue;
      if (a.state === 'study' && !(a.gift || isFav(a.id))) continue;
      const p = api.P(a.x, a.y), d = Math.hypot(wx - p.x, (wy - (p.y - 15 - (a.z || 0))) * 0.8);
      if (d < 11 && d < bd) { bd = d; best = a; }
    }
    if (!best) return false; open(best); return true;
  }

  // ---------------- panels ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const pct = (x) => Math.round(x * 100) + ' %';
  const mmss = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let cardId = null; const cards = {};
  function cardFn(id) { return (cards[id] ||= () => studentCard(id)); }
  function open(a) { cardId = a.id; full(a); api.openPanel(cardFn(a.id)); api.glog('tap', `карточка ученика ${full(a)}`); }
  function favBtn(a) {
    const on = isFav(a.id), n = favs().length;
    return on ? `<button class="btn wide ghost" data-stufav="${a.id}">💗 В любимчиках — убрать (${n}/${FAV_MAX})</button>`
      : `<button class="btn wide" data-stufav="${a.id}">⭐ В любимчики (${n}/${FAV_MAX})</button>`;
  }
  function studentCard(id) {
    const a = api.agents().find((x) => x.id === id);
    const head = (img, h2, sub) => `<div class="sh-head">${img ? `<img src="${img}" alt="" style="height:58px;width:auto;margin-right:6px">` : '<span class="remoji big">🎓</span>'}<div><h2>${esc(h2)}</h2><div class="muted">${sub}</div></div><button class="x" data-close>✕</button></div>`;
    if (!a || a.goal && (a.goal.t === 'g' || a.goal.t === 'x') || a.state === 'fly' || a.state === 'vanish') {
      const gr = a && a.goal && a.goal.t === 'g';
      return head('', a ? full(a) : 'Ученик', '') + `<p class="muted">${gr ? '🎓 Выпускник: идёт в сад выпускников.' : a && a.goal && a.goal.t === 'x' ? '💔 Уходит из школы: не хватило места.' : 'Этого ученика уже нет в школе.'}</p>`;
    }
    const C = api.classes(), fc = favCls(a), i = a.c >= 0 ? a.c : a.goal && a.goal.i >= 0 && C[a.goal.i] ? a.goal.i : -1;
    const row = (emo, b, sub = '') => `<div class="card up"><span class="remoji">${emo}</span><div class="grow"><b>${b}</b>${sub ? `<div class="muted">${sub}</div>` : ''}</div></div>`;
    let h = head(api.formImg(a), full(a), `${esc(spName(a.sp))} · ${esc(api.rankName(a))}`);
    if (a.gift) h += row('✨', 'Одарённый ученик', `+${Math.round(GIFT_RANK * 100)} % к каждому экзамену на звание`);
    if (api.world() === 1 && fc >= 0) h += row('💛', `Любимый класс: ${esc(C[fc].name)} · сдаёт лучше`, `там шанс экзамена +${Math.round(FAV_EXAM * 100)} % и после урока настроение лучше`);
    const m = Math.round(a.mood ?? 80); h += row(api.moodFace(m), `Настроение: ${m} %`);
    h += row('📍', 'Сейчас', esc(api.status(a)));
    if (i >= 0 && C[i]) {
      const ch = api.examChance(a, i), rk = api.rankNext(a, i);
      h += row('🎯', `Следующий экзамен: «${esc(C[i].name)}» — шанс ${pct(ch)}${fc === i ? ' 💛' : ''}`, rk ? `после него экзамен на звание «${esc(rk.name)}»: ${pct(rk.p + rankB(a))}${a.gift ? ' ✨' : ''}` : '');
    }
    const grow = canGrow(a); h += row(grow ? '✨' : '🌿', grow ? 'Может вырасти' : 'Дальше не вырастет', grow ? (a.rt >= 0 || rtOk(a) ? `можно пересдать экзамен на звание «${esc(api.rankNameRk((a.rk || 0) + 1))}»` : `впереди экзамен на звание «${esc(api.rankNameRk((a.rk || 0) + 1))}»`) : (a.rk || 0) >= 5 ? 'у него высшее звание' : 'экзаменов на следующее звание на его пути больше нет');
    if (a.rt >= 0 && C[a.rt]) h += row('🔁', `Пересдача: «${esc(C[a.rt].name)}»`, `снова пройдёт урок и попробует экзамен на звание «${esc(api.rankNameAt(a.rt))}»`);
    else if (rtOk(a)) h += `<button class="btn wide" data-sturt="${a.id}">🔁 Пересдать «${esc(C[a.rto].name)}» за 🪙${api.fmt(rtPrice(a.rto))}</button><p class="muted" style="margin:2px 4px 8px">Вернётся в этот класс, снова пройдёт урок и попробует экзамен на звание «${esc(api.rankNameAt(a.rto))}» с тем же шансом. Один раз на класс.</p>`;
    if (isFav(a.id)) h += `<button class="btn wide" data-stushow="${a.id}">📍 Показать на карте</button>`;   // s8c
    h += favBtn(a);
    h += `<p class="muted" style="margin-top:8px">Любимчики отмечены 💗 на карте, а о их успехах приходят короткие сообщения.</p>`;
    return h;
  }
  let crowdSel = null;
  function openCrowd(o) { crowdSel = o; api.openPanel(crowdCard); }
  function crowdCard() {
    const o = crowdSel, C = crowd(); if (!o || !C.includes(o)) return `<div class="sh-head"><span class="remoji big">🚶</span><div><h2>Новичок у ворот</h2></div><button class="x" data-close>✕</button></div><p class="muted">Этот новичок уже вошёл в школу или ушёл.</p>`;
    const max = CROWD_WAIT * (o.gift ? GIFT_WAIT : 1), cu = culprit(), jam = jamNow();
    let h = `<div class="sh-head"><img src="assets/creatures/${o.sp}.png" alt="" style="height:58px;width:auto;margin-right:6px"><div><h2>${esc(o.name)} ${esc(o.fn)}</h2><div class="muted">${esc(spName(o.sp))} · новичок у ворот</div></div><button class="x" data-close>✕</button></div>`;
    if (o.gift) h += `<div class="card up"><span class="remoji">✨</span><div class="grow"><b>Одарённый новичок</b><div class="muted">+${Math.round(GIFT_RANK * 100)} % к каждому экзамену на звание. Ждёт дольше обычного, но и он уйдёт, если места так и не будет.</div></div></div>`;
    const fc = FAV_CLASS[o.sp] ? api.classes().findIndex((c) => c.id === FAV_CLASS[o.sp]) : -1;
    if (api.world() === 1 && fc >= 0) h += `<div class="card up"><span class="remoji">💛</span><div class="grow"><b>Любимый класс: ${esc(api.classes()[fc].name)}</b></div></div>`;
    h += `<div class="card up"><span class="remoji">⏳</span><div class="grow"><b>Ждёт у ворот ${mmss(o.w)}</b><div class="muted">${jam ? `уйдёт через ${mmss(max - o.w)}, если не освободится место (${esc(cu.t)})` : 'скоро войдёт'}</div></div></div>`;
    if (jam && cu.go) h += `<button class="btn wide" data-stugo="1">Разобраться ➜</button>`;
    return h;
  }
  function gatePanel() {   // tap on the counter / plate over the gate
    const C = crowd(), lw = leftWin(), cu = culprit(), jam = jamNow(), st = api.stats0();
    let h = `<div class="sh-head"><span class="remoji big">🚪</span><div><h2>У ворот школы</h2><div class="muted">новички, которые хотят учиться</div></div><button class="x" data-close>✕</button></div>`;
    h += `<div class="card up"><span class="remoji">🚶</span><div class="grow"><b>Ждут у ворот: ${C.length}</b>${C.some((o) => o.gift) ? ' <span class="muted">· среди них одарённый ✨</span>' : ''}<div class="muted">${jam ? `Войти не могут: ${esc(cu.t)}. Каждый ждёт до ${Math.round(CROWD_WAIT / 60)} мин, потом уходит.` : 'Скоро войдут.'}</div></div></div>`;
    h += `<div class="card up"><span class="remoji">💨</span><div class="grow"><b>Ушли, не дождавшись: ${lw.n} за 10 мин</b><div class="muted">${lw.n ? `не заплатили за поступление примерно 🪙${api.fmt(lw.f)}` : 'никто'} · всего ${api.fmt(st.gateLeft || 0)}</div></div></div>`;
    if (jam && cu.go) h += `<button class="btn wide" data-stugo="1">Разобраться ➜</button>`;
    return h;
  }
  function recCard() {   // reception panel: the gate line and the favourites
    const C = crowd(), lw = leftWin(), F = favs().map((id) => api.agents().find((a) => a.id === id)).filter(Boolean);
    let h = '';
    if (C.length || lw.n) h += `<div class="card up"><span class="remoji">🚶</span><div class="grow"><b>У ворот ждут: ${C.length}</b><div class="muted">ушли, не дождавшись, за 10 мин: ${lw.n}${lw.n ? ` (−🪙${api.fmt(lw.f)})` : ''}</div></div></div>`;
    if (F.length) h += `<h3>💗 Любимчики</h3>` + F.map((a) => `<div class="card up"><span class="remoji">${a.gift ? '✨' : '💗'}</span><div class="grow"><b>${esc(full(a))}</b><div class="muted">${esc(api.rankName(a))} · ${esc(api.status(a))}</div></div><button class="btn small" data-stucard="${a.id}">Карточка</button></div>`).join('');
    return h;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-stufav],[data-stucard],[data-stugo],[data-sturt]'); if (!b) return;
    if (b.dataset.sturt !== undefined) { const a = api.agents().find((x) => x.id === +b.dataset.sturt); if (a) buyRt(a); api.refresh(); return; }
    if (b.dataset.stufav !== undefined) { toggleFav(+b.dataset.stufav); api.refresh(); return; }
    if (b.dataset.stucard !== undefined) { const a = api.agents().find((x) => x.id === +b.dataset.stucard); if (a) open(a); return; }
    if (b.dataset.stugo !== undefined) { const cu = culprit(); if (cu.go) api.goTarget(cu.go); }
  });

  // ===================== s8c (tools/_patch/students_s8c.py) =====================
  const DAY = 864e5, dayNow = () => Math.floor(Date.now() / DAY);
  const dTxt = (d) => (d >= 0 ? new Date(d * DAY + DAY / 2).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');
  const cName = (i) => (api.classes()[i] ? api.classes()[i].name : '');
  const agentById = (id) => api.agents().find((x) => x.id === id);
  const alive = (a) => !!a && api.agents().includes(a) && a.state !== 'fly' && a.state !== 'vanish' && !(a.goal && (a.goal.t === 'x' || a.goal.t === 'g' || a.goal.t === 'tw'));
  const fill = (s, o) => String(s).replace(/\{(\w)\}/g, (m, k) => (o[k] !== undefined ? o[k] : m));
  // ---------------- life log: every student's main events (saved on the agent as a.lg; carried into helper / tower records) ----------------
  function lg(a) { if (!a) return null; if (!a.lg || typeof a.lg !== 'object') a.lg = { d: -1, e: [], f: {} }; a.lg.e ||= []; a.lg.f ||= {}; return a.lg; }
  function lgPush(a, e) { const L = lg(a); if (!L) return; L.e.push(e); if (L.e.length > S8C.LOG_MAX) L.e.splice(1, L.e.length - S8C.LOG_MAX); }   // the first entry (oldest) stays
  function logEv(a, k, i) {   // called from ev() for every student (not only favourites)
    if (!a || !a.sp) return; const L = lg(a), d = dayNow();
    if (k === 'pass') { const f = L.f[i] || 0; delete L.f[i]; lgPush(a, ['p', d, i, f]); friendLesson(a, i);
      if (!f && !api.ffwd()) { const P = L.e.filter((x) => x[0] === 'p'); if (P.length === 3 && P.every((x) => !x[3])) cand('pride', { id: a.id, i }); } }
    else if (k === 'fail') { L.f[i] = (L.f[i] || 0) + 1; friendLesson(a, i); if (L.f[i] === 2 && !api.ffwd()) cand('fear', { id: a.id, i }); }
    else if (k === 'rank') lgPush(a, ['r', d, a.rk || 0, a.el || 0]);
    else if (k === 'grad') lgPush(a, ['g', d, a.rk || 0]);
  }
  function arrive(a) { const L = lg(a); if (L.d < 0) L.d = dayNow(); if (a.gift) L.gi = 1; }   // dress(): a newcomer walks in
  // game.js: a graduate becomes a helper (kind 'h', class i) or a tower resident / waits at its door ('t'); r = the new record
  function carry(a, r, kind, i = -1) {
    if (!a || !r) return; const L = lg(a), d = dayNow();
    lgPush(a, kind === 'h' ? ['h', d, i] : ['t', d]); r.lg = L; if (a.gift) r.gift = 1;
    const G = alumni().last[0]; if (G && G.id === a.id) G.w = kind;
    if (kind === 'h' && !api.ffwd()) bookLine(`🪄 ${full(a)} (${api.rankNameRk(a.rk || 3)}) ${'остаётся помогать'} в классе «${cName(i)}».`);
  }
  function promo(r, rk, el) { if (r && rk === 5 && (r.rk || 0) !== 5) { const L = lg(r); lgPush(r, ['r', dayNow(), 5, el || 0]); if (!api.ffwd()) bookLine(`🌟 ${r.name} — ${api.TW().masterTitle}${api.elemName(el || 0)}!`); } }
  // ---------------- biography in Tikhon's voice (hero card through window.STU_BIO, alumni book, farewell) ----------------
  function favTeacher(r) {   // the species' favourite class if passed there, else the class of the first rank-up, else the last passed
    const L = r.lg, C = api.classes(); if (!L) return '';
    const P = L.e.filter((x) => x[0] === 'p'), fc = favCls(r);
    let i = fc >= 0 && P.some((x) => x[2] === fc) ? fc : -1;
    if (i < 0) { const R = L.e.find((x) => x[0] === 'r'), Rp = R ? P.filter((x) => x[1] <= R[1]).pop() : null; i = Rp ? Rp[2] : P.length ? P[P.length - 1][2] : -1; }
    return i >= 0 && C[i] ? C[i].teacher || '' : '';
  }
  function bioLines(r) {
    const L = r && r.lg; if (!L || !L.e) return null;
    const out = [], E = L.e, P = E.filter((x) => x[0] === 'p');
    out.push(L.d >= 0 ? `${dTxt(L.d)} — первый день в школе.` : 'Первого дня в школе Тихон не застал: тогда он ещё не вёл этих записей.');
    if (L.gi || r.gift) out.push('Уже у ворот было видно: одарённый.');
    const first = P.filter((x) => !x[3]).map((x) => `«${cName(x[2])}»`), hard = P.filter((x) => x[3] > 0).slice(-2);
    if (first.length) out.push(`С первого раза сданы: ${[...new Set(first)].join(', ')}.`);
    hard.forEach((x) => out.push(`Экзамен «${cName(x[2])}» сдан только с ${x[3] + 1}-й попытки — но сдан.`));
    E.filter((x) => x[0] === 's' && x[2] !== 'friends').slice(-2).forEach((x) => { const T = STORIES[x[2]], c = T && T.ch[x[3] || 0]; if (c) out.push(fill(c.bio, { m: x[4] || '', c: x[5] >= 0 ? cName(x[5]) : '' })); });
    const fr = E.filter((x) => x[0] === 'fr').pop(); if (fr) out.push(`Лучший друг — ${fr[2]}.`);
    const te = favTeacher(r); if (te) out.push(`Любимый учитель — ${te}.`);
    const R = E.filter((x) => x[0] === 'r' && x[2] < 5); if (R.length) out.push('Звания: ' + R.map((x) => `${api.rankNameRk(x[2])} — ${dTxt(x[1])}`).join(', ') + '.');
    const M = E.filter((x) => x[0] === 'r' && x[2] === 5).pop(); if (M) out.push(`${api.TW().masterTitle}${api.elemName(M[3] || 0)} — с ${dTxt(M[1])}.`);
    E.filter((x) => x[0] === 'h').forEach((x) => out.push(`Помощник в классе «${cName(x[2])}» с ${dTxt(x[1])}.`));
    E.filter((x) => x[0] === 'w').slice(-1).forEach((x) => out.push(`Мастер недели — с ${dTxt(x[1])}.`));
    const T = E.filter((x) => x[0] === 't').pop(); if (T) out.push(`С ${dTxt(T[1])} живёт ${api.TW().inN}.`);
    return out;
  }
  function bio(r) { const B = bioLines(r); return B ? B.map(esc).join('<br>') + '<br><i>— летописец Тихон</i>' : ''; }
  window.STU_BIO = (r) => bio(r);   // heroes.js bio(): Tikhon's biography from the life log (old residents without a log keep the hero's own line)
  // ---------------- chronicle «Истории школы» (lore.js page, game.js facts().life) ----------------
  const life = () => { const s = S(); s.life ||= { L: [] }; s.life.L ||= []; return s.life; };
  function bookLine(x) { const L = life().L; L.push({ t: Date.now(), x }); if (L.length > S8C.BOOK_MAX) L.splice(0, L.length - S8C.BOOK_MAX); }
  const book = () => (S() && S().life && S().life.L) || [];
  // ---------------- alumni book (graduates' garden) ----------------
  const alumni = () => { const s = S(); s.alumni ||= { last: [], fame: [], rb: 0, rbAt: 0 }; s.alumni.last ||= []; s.alumni.fame ||= []; return s.alumni; };
  const rbT = {};
  function grad(a, rv) {   // game.js right after reviewGraduate(a): rv = the review just written (rating().last[0])
    if (!a) return; const A = alumni(), fav = isFav(a.id) || !!a._wasFav;
    const rec = { id: a.id, n: full(a), sp: a.sp, rk: a.rk || 0, el: a.el || 0, s: rv ? rv.s : 0, tx: rv ? rv.t : '', t: Date.now(), fav: fav ? 1 : 0, gi: a.gift ? 1 : 0, w: '' }; A.last.unshift(rec);
    if (A.last.length > S8C.LAST_MAX) A.last.length = S8C.LAST_MAX;
    if (api.world() === 1 && FAV_CLASS[a.sp]) {   // D7.10 «Радуга дружбы» hook: all four races graduate at once
      const now = performance.now() / 1000; rbT[a.sp] = now;
      if (Object.keys(FAV_CLASS).every((sp) => now - (rbT[sp] ?? -1e9) <= S8C.RB_WIN) && Date.now() - (A.rbAt || 0) >= S8C.RB_CD && !api.ffwd()) {
        A.rb = (A.rb || 0) + 1; A.rbAt = Date.now(); api.stats('rainbow', { n: A.rb });
        bookLine('🌈 Радуга дружбы: лисичка, ушастик, рогатик и крылоушка выпустились в один миг — над садом встала радуга.');   // PLACEHOLDER (Maria; secret page D7.10)
        api.toastBig('🌈 Радуга дружбы! Четыре народа выпустились в один миг');
      }
    }
    if (fav && !api.ffwd()) favGradMoment(a, rec);
  }
  function favGradMoment(a, G) {   // G: his alumni record (kept by reference: the window may come a minute later)   // a favourite's graduation: a personal named moment (celebration window) + a chronicle line
    const n = full(a), rk = a.rk || 0, rn = api.rankName(a), te = favTeacher(a) || (api.classes().find((c) => c.final) || {}).teacher || 'Тихон';
    bookLine(`💗 ${n}: выпуск, звание «${rn}». На прощание — «Спасибо, ${te}!»`);
    const id = a.id, pic = api.formImg(a);
    api.iq('cel', 'favgrad' + id, () => {
      const where = G.w === 'h' ? 'Остаётся в школе — помогать учителю.' : G.w === 't' ? `Переезжает ${api.TW().inN}.` : 'Уходит в большой мир.';
      return `<div class="sh-head"><img src="${pic}" alt="" style="height:58px;width:auto;margin-right:6px"><div><h2>💗 ${esc(n)}: выпуск!</h2><div class="muted">${esc(spName(a.sp))} · ${esc(rn)}</div></div><button class="x" data-close>✕</button></div>
        <p>${esc(n)} выходит в сад выпускников со званием «${esc(rn)}». ${esc(where)}</p><p class="muted">На прощание — объятия и тихое «Спасибо, ${esc(te)}!»</p>${G.s ? `<div class="card up"><span class="remoji">🏅</span><div class="grow"><b>${'★'.repeat(Math.round(G.s))}${'☆'.repeat(5 - Math.round(G.s))}</b><div class="muted">«${esc(G.tx)}»</div></div></div>` : ''}
        <p class="muted">Запись — в книге выпускников (сад) и в летописи «Истории школы».</p><button class="btn wide" data-close>💗</button>`;
    }, { imp: `💗 Выпуск любимчика: ${n} (${rn})` });
  }
  // tower residents who leave (farewell «за морем» or the old release): their biography stays in «Аллея славы»
  let twPrev = null, twT = 0, fwN0 = -1;
  function scanTower(dt) {
    if ((twT += dt) < 2) return; twT = 0;
    if (!api.towerOpen()) { twPrev = null; return; }
    const T = api.tower(), cur = new Map(); [...(T.res || []), ...(T.wait || [])].forEach((r) => { if (r.id) cur.set(r.id, r); });
    const fwN = (S().heroFw && S().heroFw.n) || 0;
    if (twPrev) for (const [id, r] of twPrev) if (!cur.has(id)) {
      const sea = fwN > fwN0, A = alumni();
      A.fame.unshift({ n: r.name, sp: r.sp, rk: r.rk || 0, el: r.el || 0, t: Date.now(), k: sea ? 'sea' : 'out', bio: bio(r), hr: r.h ? r.h.r : -1 });
      if (A.fame.length > S8C.FAME_MAX) A.fame.length = S8C.FAME_MAX;
      if (!sea) bookLine(`🧳 ${r.name} (${api.resTitle(r)}) отправляется в большое путешествие.`);
      api.stats('alumni', { k: sea ? 1 : 2 });
      if (!api.ffwd()) api.toast(`📖 Биография: ${r.name} — в книге выпускников (сад выпускников)`);
    }
    twPrev = cur; fwN0 = fwN;
  }
  // ---------------- master of the week: the player picks which tower Мастер leads every master-class until Monday ----------------
  const weekNo = () => Math.floor((Date.now() / DAY + 3) / 7);   // weeks start on Monday (1 Jan 1970 was a Thursday)
  function mw() { const s = S(); const M = (s.mweek ||= { w: 0, id: 0, asked: 0 }); const w = weekNo(); if (M.w !== w) { M.w = w; M.id = 0; M.asked = 0; } return M; }
  const masters = () => { try { return api.mcMasters().map(([ci, r]) => ({ ci, r })).filter((x) => x.r && x.r.id); } catch (e) { return []; } };
  function mcWeek(pool) {   // game.js stepMasterClass: the week's master goes whenever he is free (else the automatic turn of elements)
    const M = mw(); if (!M.id) return null; const p = pool.find(([, r]) => r.id === M.id); return p || null;
  }
  function pickWeek(id) {
    const M = mw(); M.id = +id || 0; M.asked = 1;
    const m = masters().find((x) => x.r.id === M.id);
    if (m) { lgPush(m.r, ['w', dayNow()]); api.toast(`✨ Мастер недели: ${m.r.name} — ведёт мастер-классы до понедельника`); bookLine(`✨ Мастер недели — ${m.r.name} (${api.resTitle(m.r)}).`); api.stats('mweek', { e: m.r.el || 0, n: masters().length }); }
    else api.toast('✨ Мастер-классы снова ведут все Мастера по очереди');
    api.save();
  }
  function mwHtml(withHead) {
    const L = masters(), M = mw(); if (!L.length) return '';
    const head = withHead ? `<div class="sh-head"><span class="remoji big">✨</span><div><h2>Мастер недели</h2><div class="muted">кто ведёт мастер-классы до понедельника</div></div><button class="x" data-close>✕</button></div>` : '<h3>✨ Мастер недели</h3>';
    return head + `<p class="muted">Выбранный Мастер ведёт все мастер-классы в «${esc(cName(api.mcClass()))}» до понедельника: ученики там сдают лучше, а его карточка в альбоме и он сам как герой растут быстрее. Не выберешь — Мастера ходят по очереди стихий.</p>`
      + L.map(({ r }) => `<div class="card up${M.id === r.id ? ' hx-sel' : ''}">${pic(r)}<div class="grow"><b>${esc(r.name)}</b> ${r.h ? api.heroBadge(r) : ''}<div class="muted">${esc(api.resTitle(r))}${M.id === r.id ? ' · ✨ мастер этой недели' : ''}</div></div>${M.id === r.id ? '<span class="done">✓</span>' : `<button class="btn small" data-stumw="${r.id}">Выбрать</button>`}</div>`).join('')
      + `<button class="btn wide${M.id ? ' ghost' : ''}" data-stumw="0">🔄 По очереди${M.id ? '' : ' ✓'}</button>`;
  }
  const pic = (r) => `<div class="fpic${(r.rk || 0) === 5 ? ' master' : ''}"><img src="${api.formPic(r.sp, r.rk || 0, r.el || 0)}"></div>`;
  // ---------------- mini-stories: detectors -> candidates -> one story at a time through the 6d window queue ----------------
  const cands = {}; const cdT = {}; let storyAt = null, cur = null;
  function cand(k, o) { cands[k] = { ...o, at: clock }; }
  const pair = {}; let pairN = 0, scanT = 0, swT = 0;
  function friendLesson(a, i) {   // + mood when the friend studies in the same class right now
    if (!a.fr) return; const b = agentById(a.fr); if (b && b.c === i && b.state === 'study') a.mood = Math.min(100, (a.mood ?? 80) + S8C.FRIEND_MOOD);
  }
  function scanLife(dt) {   // live play only, every second: state clocks (for «почему грустит»), home-sick, library, side-by-side pairs
    if ((swT += dt) < 1) return; const st = swT; swT = 0;
    const A = api.agents();
    for (const a of A) { if (!a.sp || a.mcls || a.retake) continue; if (a._sk !== a.state) { a._sk = a.state; a._sa = clock; } }
    if ((scanT += st) < 5) return; const W = scanT; scanT = 0;
    for (const a of A) {
      if (!api.isStudent(a)) continue;
      if (a.state === 'sleep' && clock - (a._sa ?? clock) >= S8C.HOME_T) cand('home', { id: a.id });
      else if (a.state === 'read') cand('lib', { id: a.id });
    }
    const C = api.classes();
    for (let i = 0; i < C.length; i++) {
      const L = A.filter((a) => a.c === i && a.state === 'study' && api.isStudent(a)); if (L.length < 2) continue;
      for (let p = 0; p < L.length; p++) for (let q = p + 1; q < L.length; q++) {
        const a = L[p], b = L[q]; if (Math.hypot(a.x - b.x, a.y - b.y) > S8C.FRIEND_D) continue;
        if ((a.mood ?? 80) < S8C.QUARREL_MOOD && (b.mood ?? 80) < S8C.QUARREL_MOOD && a.fr !== b.id) { cand('quarrel', { id: a.id, id2: b.id, i }); continue; }
        if (a.fr === b.id || a.fr || b.fr) continue;
        const key = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id; if (!(key in pair)) pairN++;
        pair[key] = (pair[key] || 0) + W; if (pair[key] >= S8C.FRIEND_T) { cand('friends', { id: a.id, id2: b.id, i }); delete pair[key]; pairN--; }
      }
    }
    if (pairN > 3000) { for (const k in pair) delete pair[k]; pairN = 0; }
  }
  function storyOf(k, o) {   // the people of a candidate, if they are still here
    const a = agentById(o.id); if (!alive(a)) return null;
    const b = o.id2 ? agentById(o.id2) : null; if (o.id2 && !alive(b)) return null;
    if (k === 'home' && a.state !== 'sleep') return null;
    if (k === 'lib' && a.state !== 'read') return null;
    return { k, a, b, i: o.i ?? (a.c >= 0 ? a.c : -1) };
  }
  function bdayCand() {   // a birthday can happen to anyone sitting in class
    const L = api.agents().filter((a) => a.state === 'study' && api.isStudent(a)); if (!L.length) return null;
    const a = rnd(L); return { k: 'bday', a, b: null, i: a.c };
  }
  function pickStory(force) {
    const out = [];
    for (const [k, o] of Object.entries(cands)) { if (!force && (clock - o.at > S8C.STORY_FRESH || clock - (cdT[k] ?? -1e9) < S8C.STORY_CD)) continue; const s = storyOf(k, o); if (s) out.push(s); else delete cands[k]; }
    if (!force && clock - (cdT.bday ?? -1e9) >= S8C.STORY_CD) { const b = bdayCand(); if (b) out.push(b); }
    if (!out.length) return null;
    const fav = out.filter((s) => isFav(s.a.id) || (s.b && isFav(s.b.id)));
    return rnd(fav.length ? fav : out);
  }
  function stepStories() {
    if (api.edit() || api.world() > 2) return;
    storyAt ??= clock + S8C.STORY_FIRST;
    if (cur && (clock - cur.at > S8C.STORY_WAIT || !alive(cur.a) || (cur.b && !alive(cur.b)))) { cur = null; storyAt = Math.min(storyAt, clock + 30); }   // a story nobody saw (the student left meanwhile) is dropped
    if (clock < storyAt || cur) return;
    const s = pickStory(false); if (!s) { storyAt = clock + 30; return; }
    showStory(s);
  }
  function showStory(s) {
    s.at = clock; cur = s; storyAt = clock + S8C.STORY_GAP; cdT[s.k] = clock; delete cands[s.k];
    const T = STORIES[s.k], o = names(s);
    api.iq('news', 'story', storyPanel, { cond: () => !!cur && cur === s && alive(s.a) && (!s.b || alive(s.b)), imp: `${T.e} ${fill(T.t, o)}` });
    api.stats('story', { k: Object.keys(STORIES).indexOf(s.k), c: -1 });
  }
  const names = (s) => ({ n: full(s.a), m: s.b ? full(s.b) : '', c: s.i >= 0 ? cName(s.i) : '' });
  function storyPanel() {
    const s = cur; if (!s) return `<div class="sh-head"><span class="remoji big">📜</span><div><h2>История</h2></div><button class="x" data-close>✕</button></div><p class="muted">Эта история уже закончилась.</p>`;
    const T = STORIES[s.k], o = names(s);
    return `<div class="sh-head"><img src="${api.formImg(s.a)}" alt="" style="height:58px;width:auto;margin-right:6px">${s.b ? `<img src="${api.formImg(s.b)}" alt="" style="height:58px;width:auto;margin-right:6px">` : ''}<div><h2>${T.e} ${esc(fill(T.t, o))}</h2><div class="muted">история из жизни школы</div></div><button class="x" data-close>✕</button></div>
      <p>${esc(fill(T.x, o))}</p>` + T.ch.map((c, k) => `<button class="btn wide${k ? ' ghost' : ''}" data-stust="${k}">${c.b}</button>`).join('') + `<p class="muted">Чем кончится — запишет Тихон в «Истории школы».</p>`;
  }
  function answer(k) {
    const s = cur; if (!s) return; cur = null;
    const a = s.a, b = s.b, T = STORIES[s.k], c = T.ch[k] || T.ch[0], o = names(s), up = (x, d) => { if (x) x.mood = Math.max(0, Math.min(100, (x.mood ?? 80) + d)); };
    if (s.k === 'fear') { if (k === 0) { up(a, S8C.FEAR_CHEER_MOOD); a.luck = (a.luck || 0) + S8C.FEAR_CHEER_LUCK; } else { a.prepared = true; up(a, S8C.CALM); } }
    else if (s.k === 'friends') { a.fr = b.id; b.fr = a.id; up(a, S8C.CALM); up(b, S8C.CALM); }
    else if (s.k === 'home') up(a, k === 0 ? S8C.HOME_LETTER : S8C.HOME_WALK);
    else if (s.k === 'bday') { if (k === 0) api.agents().forEach((x) => { if (x.c === s.i && x.state === 'study') up(x, S8C.BDAY_CLASS); }); else { up(a, S8C.BDAY_GIFT); a.luck = (a.luck || 0) + S8C.BDAY_LUCK; } }
    else if (s.k === 'pride') up(a, S8C.PRIDE_MOOD);
    else if (s.k === 'lib') { if (k === 0) a.prepared = true; else up(a, S8C.LIB_SLEEP); }
    else if (s.k === 'quarrel') { if (k === 0) { a.fr = b.id; b.fr = a.id; up(a, S8C.MAKEUP); up(b, S8C.MAKEUP); } else { up(a, S8C.CALM); up(b, S8C.CALM); } }
    const d = dayNow();
    lgPush(a, ['s', d, s.k, k, b ? full(b) : '', s.i]); if (b) lgPush(b, ['s', d, s.k, k, full(a), s.i]);
    if ((s.k === 'friends' || (s.k === 'quarrel' && k === 0)) && b) { lgPush(a, ['fr', d, `${spName(b.sp).toLowerCase()} ${full(b)}`]); lgPush(b, ['fr', d, `${spName(a.sp).toLowerCase()} ${full(a)}`]); }
    const line = fill(c.l, o); bookLine(line); api.toast(line);
    api.stats('story', { k: Object.keys(STORIES).indexOf(s.k), c: k });
    api.closePanel(); api.save();
  }
  // ---------------- «почему грустит» ----------------
  function sadWhy(a) {
    const g = a.goal || {}, m = Math.round(a.mood ?? 80), dur = a._sa !== undefined ? clock - a._sa : 0, t = dur >= 60 ? ` уже ${Math.floor(dur / 60)} мин` : '';
    if (a.state === 'study' && api.incOf(a.c)) return `на уроке «${cName(a.c)}» происшествие`;
    if (a.state === 'study' && api.dark(a.c) > 0) return `в зале «${cName(a.c)}» темно`;
    if (a.state === 'wait' || a.state === 'walkwait') return `ждёт свободную парту в «${cName(a.c)}»${t}`;
    if (a.state === 'cbench') return `ждёт на скамейке у «${cName(g.i)}»${t}`;
    if (a.state === 'sleep') return `ждёт места в «${cName(g.i)}», сидит в спальне${t}`;
    if (a.state === 'dline' || a.state === 'checkin') return 'стоит в очереди к консьержке';
    const F = a.lg && a.lg.f ? Object.entries(a.lg.f).filter(([, n]) => n > 0) : []; if (F.length) return `не сдаёт «${cName(+F[0][0])}»`;
    return m < 40 ? 'долго ждал(а) своей очереди' : '';
  }
  // ---------------- the students screen «👥 Ученики»: 3 tabs (one entry point; the album button and the old list open it) ----------------
  let tab = 'now', bkTab = 'last';
  const setTab = (t) => { tab = t; };
  const row = (a, why) => `<div class="card up" data-stucard="${a.id}" style="cursor:pointer"><span class="remoji">${isFav(a.id) ? '💗' : a.gift ? '✨' : api.moodFace(Math.round(a.mood ?? 80))}</span><div class="grow"><b>${esc(full(a))}</b> <span class="muted">${esc(spName(a.sp))} · ${esc(api.rankName(a))}</span><div class="muted">${api.moodFace(Math.round(a.mood ?? 80))} ${Math.round(a.mood ?? 80)} % · ${esc(why || api.status(a))}</div></div></div>`;
  const favRow = (a) => `<div class="card up"><span class="remoji">💗</span><div class="grow"><b>${esc(full(a))}</b> <span class="muted">${esc(spName(a.sp))} · ${esc(api.rankName(a))}</span><div class="muted">${api.moodFace(Math.round(a.mood ?? 80))} ${Math.round(a.mood ?? 80)} % · ${esc((a.mood ?? 80) < 40 ? sadWhy(a) : api.status(a))}</div></div><button class="btn small" data-stushow="${a.id}">📍</button><button class="btn small ghost" data-stucard="${a.id}">Карточка</button></div>`;
  function tabNow() {
    const L = api.inSchool().filter((a) => api.isStudent(a)), F = L.filter((a) => isFav(a.id)), seen = new Set(F.map((a) => a.id));
    const sad = L.filter((a) => !seen.has(a.id) && (a.mood ?? 80) < 40).sort((x, y) => (x.mood ?? 80) - (y.mood ?? 80)).slice(0, 8); sad.forEach((a) => seen.add(a.id));
    const gi = L.filter((a) => !seen.has(a.id) && a.gift).slice(0, 5); gi.forEach((a) => seen.add(a.id));
    const rest = L.filter((a) => !seen.has(a.id)), R = rest.slice(-S8C.NOW_LIST).reverse();   // the newest first
    let h = `<div class="stu-counts">${api.peopleRows().filter(([, , v]) => v).map(([e, t, v]) => `<span class="stu-chip">${e} <b>${v}</b> ${t}</span>`).join('')}</div>`;
    h += F.length ? `<h3>💗 Любимчики</h3>` + F.map((a) => favRow(a)).join('') : `<p class="muted">Нажми на ученика на карте и отметь ⭐ — любимчики будут здесь первыми.</p>`;
    if (sad.length) h += `<h3>😟 Грустят — почему</h3>` + sad.map((a) => row(a, sadWhy(a))).join('');
    if (gi.length) h += `<h3>✨ Одарённые</h3>` + gi.map((a) => row(a)).join('');
    if (R.length) h += `<h3>Все ученики</h3>` + R.map((a) => row(a)).join('') + (rest.length > R.length ? `<p class="muted">…и ещё ${api.fmt(rest.length - R.length)}. Нажми на любого на карте — откроется его карточка.</p>` : '');
    return h;
  }
  function tabOld() {
    const TW = api.TW(), C = api.classes(), H = api.helpers();
    let h = mwHtml(false);
    const hl = Object.entries(H).filter(([, l]) => l && l.length);
    h += `<h3>🪄 ${esc(TW.helpers)}</h3>` + (hl.length ? hl.map(([i, l]) => l.map((x) => `<div class="card up">${pic(x)}<div class="grow"><b>${esc(x.name)}</b> <span class="muted">${esc(api.rankNameRk(x.rk || 3))}${x.rk === 5 ? '' : ''}</span><div class="muted">${C[i] ? C[i].emoji + ' ' + esc(C[i].name) : ''} · ${esc(spName(x.sp))}${x.away ? ` · 📜 пересдаёт на ${esc(TW.masterA)}` : x.mc ? ' · ✨ ведёт мастер-класс' : ''}</div></div>${x.lg ? `<button class="btn small ghost" data-stubio="h:${x.id}">📖</button>` : ''}</div>`).join('')).join('')
      : `<p class="muted">Выпускник со званием «${esc(TW.mage)}» остаётся помогать учителю, если в классе нет помощника его вида.</p>`);
    if (api.towerOpen()) {
      const T = api.tower(), away = [...(T.res || []), ...hl.flatMap(([, l]) => l)].filter((r) => r.away);
      h += `<h3>${TW.emo} ${esc(TW.name)}: ${T.res.length} из ${api.towerCap()}</h3>`;
      h += `<p class="muted">📜 ${away.length ? `Сейчас пересдаёт на ${esc(TW.masterA)}: ${away.map((r) => esc(r.name)).join(', ')}.` : (T.res || []).some((r) => r.rk === 4) ? `Следующий ${esc(TW.elder)} пойдёт на пересдачу через ${mmss(api.retakeIn())}.` : `Пересдают ${esc(TW.elders)}, когда они живут здесь.`}</p>`;
      h += (T.res || []).map((r) => `<div class="card up"${r.h ? ` data-stuhero="${r.id}" style="cursor:pointer"` : ''}>${pic(r)}<div class="grow"><b>${esc(r.name)}</b> ${r.h ? api.heroBadge(r) : ''} <span class="muted">${esc(api.resTitle(r))}</span><div class="muted">${r.away ? `📜 пересдаёт на ${esc(TW.masterA)}` : r.mc ? '✨ ведёт мастер-класс' : mw().id === r.id ? '✨ мастер недели' : 'живёт ' + esc(TW.inS)}</div></div>${r.h ? '<span class="muted">›</span>' : ''}</div>`).join('');
      if ((T.wait || []).length) h += `<p class="muted">Ждут у двери: ${T.wait.map((r) => esc(r.name)).join(', ')}.</p>`;
      h += `<button class="btn wide ghost" data-stutower="1">${TW.emo} Открыть: ${esc(TW.name)}</button>`;
    }
    h += `<button class="btn wide ghost" data-stubook="1">📖 Книга выпускников</button>`;
    return h;
  }
  function screen() {   // game.js peoplePanel()
    const L = api.inSchool(), M = masters(), offer = M.length >= 1 && !mw().id && !mw().asked;
    const tabs = [['now', '👥 Сейчас в школе'], ['old', `🎓 Старшие и Мастера${offer ? ' ❗' : ''}`], ['album', '📖 Альбом']];
    const head = `<div class="sh-head"><span class="remoji big">👥</span><div><h2>Ученики</h2><div class="muted">в школе ${api.fmt(L.length)} · настроение ${api.moodFace(Math.round(api.avgMood()))} ${Math.round(api.avgMood())} % · выпустилось 🎓 ${api.fmt(api.stats0().graduated || 0)}</div></div><button class="x" data-close>✕</button></div>`;
    const bar = `<div class="hx-tabs">${tabs.map(([k, t]) => `<button class="btn small${tab === k ? '' : ' ghost'}" data-stutab="${k}">${t}</button>`).join('')}</div>`;
    return head + bar + (tab === 'old' ? tabOld() : tab === 'album' ? api.albumHtml() : tabNow());
  }
  // ---------------- alumni book: the graduates' garden ----------------
  function gardenPanel() {
    const A = alumni(), st = api.stats0(), TW = api.TW(), C = api.classes();
    const head = `<div class="sh-head"><span class="remoji big">📖</span><div><h2>Книга выпускников</h2><div class="muted">выпустилось ${api.fmt(st.graduated || 0)} · ${esc(TW.mastersG)}: ${api.fmt((st.ranks || [])[5] || 0)}</div></div><button class="x" data-close>✕</button></div>`;
    const bar = `<div class="hx-tabs">${[['last', '🎓 Последние выпускники'], ['fame', '🌟 Аллея славы']].map(([k, t]) => `<button class="btn small${bkTab === k ? '' : ' ghost'}" data-stubk="${k}">${t}</button>`).join('')}</div>`;
    const stars = (s) => `<span style="color:#d4a017">${'★'.repeat(Math.round(s))}${'☆'.repeat(5 - Math.round(s))}</span>`;
    let h = head + bar;
    if (bkTab === 'last') {
      const L = A.last;
      if (!L.length) { const R = (S().rating && S().rating.last) || []; h += `<p class="muted">Имена выпускников книга помнит с этой версии игры. Последние отзывы школы:</p>` + R.map((x) => `<div class="card up"><span class="remoji">🏅</span><div class="grow"><b>${esc(x.n || 'Ученик')}</b> ${stars(x.s)}<div class="muted">«${esc(x.t)}»</div></div></div>`).join(''); }
      h += L.map((x) => `<div class="card up">${pic(x)}<div class="grow"><b>${x.fav ? '💗 ' : ''}${esc(x.n)}</b> <span class="muted">${esc(spName(x.sp))} · ${esc(x.rk === 5 ? TW.masterTitle + api.elemName(x.el) : api.rankNameRk(x.rk))}${x.gi ? ' · ✨' : ''}</span><div>${stars(x.s)} <span class="muted">«${esc(x.tx)}»</span></div><div class="muted">${dTxt(Math.floor(x.t / DAY))}${x.w === 'h' ? ' · 🪄 остался помогать' : x.w === 't' ? ` · ${TW.emo} ${esc(TW.inS)}` : ''}</div></div></div>`).join('');
      h += `<p class="muted">Каждый выпускник оставляет отзыв о школе — из них складывается рейтинг 🏅.</p>`;
    } else {
      const T = api.towerOpen() ? api.tower().res || [] : [], M = T.filter((r) => r.rk === 5), E = T.filter((r) => r.rk !== 5), H = Object.entries(api.helpers()).flatMap(([i, l]) => (l || []).map((x) => [i, x]));
      h += `<div class="stats3"><div><span>🎓</span><b>${api.fmt(st.graduated || 0)}</b><i>выпускников</i></div><div><span>${TW.emo}</span><b>${T.length}</b><i>${esc(TW.inS)}</i></div><div><span>🌍</span><b>${A.fame.length}</b><i>ушли из башни</i></div></div>`;
      if (A.rb) h += `<div class="card up"><span class="remoji">🌈</span><div class="grow"><b>Радуга дружбы: ${A.rb}</b><div class="muted">четыре народа выпустились в один миг</div></div></div>`;
      const fameRow = (r, act, sub) => `<div class="card up"${act ? ` data-stubio="${act}" style="cursor:pointer"` : ''}>${pic(r)}<div class="grow"><b>${esc(r.name || r.n)}</b> ${r.h ? api.heroBadge(r) : ''}<div class="muted">${sub}</div></div>${act ? '<span class="muted">📖</span>' : ''}</div>`;
      if (M.length) h += `<h3>🌟 ${esc(TW.masters)}</h3>` + M.map((r) => fameRow(r, 't:' + r.id, esc(api.resTitle(r)))).join('');
      if (E.length) h += `<h3>${TW.emo} Герои ${esc(TW.inS)}</h3>` + E.map((r) => fameRow(r, 't:' + r.id, esc(api.resTitle(r)))).join('');
      if (H.length) h += `<h3>🪄 ${esc(TW.helpers)}</h3>` + H.map(([i, x]) => fameRow(x, x.lg ? 'h:' + x.id : '', `${esc(api.rankNameRk(x.rk || 3))} · ${C[i] ? esc(C[i].name) : ''}`)).join('');
      if (A.fame.length) h += `<h3>🌍 Ушли из башни</h3>` + A.fame.map((x, k) => fameRow({ ...x, name: x.n }, 'f:' + k, `${esc(x.rk === 5 ? TW.masterTitle + api.elemName(x.el) : api.rankNameRk(x.rk))} · ${x.k === 'sea' ? 'открыл(а) школу за морем' : 'отправился(ась) в путешествие'} · ${dTxt(Math.floor(x.t / DAY))}`)).join('');
      if (!M.length && !E.length && !H.length && !A.fame.length) h += `<p class="muted">Здесь будут знаменитые выпускники: помощники учителей, жители башни, Мастера и те, кто ушёл из башни открывать свои школы.</p>`;
    }
    return h;
  }
  let bioSel = '';
  function bioPanel() {
    const [k, v] = bioSel.split(':'), TW = api.TW(); let r = null;
    if (k === 't') r = (api.tower().res || []).concat(api.tower().wait || []).find((x) => x.id === +v);
    else if (k === 'h') r = Object.values(api.helpers()).flat().find((x) => x.id === +v);
    else if (k === 'f') { const f = alumni().fame[+v]; if (f) return `<div class="sh-head">${pic(f)}<div><h2>${esc(f.n)}</h2><div class="muted">${esc(spName(f.sp))} · ${esc(f.rk === 5 ? TW.masterTitle + api.elemName(f.el) : api.rankNameRk(f.rk))}</div></div><button class="x" data-close>✕</button></div><p>${f.bio || 'Тихон не успел записать эту биографию.'}</p><button class="btn wide ghost" data-stubook="1">⬅ К книге</button>`; }
    if (!r) return `<div class="sh-head"><span class="remoji big">📖</span><div><h2>Биография</h2></div><button class="x" data-close>✕</button></div><p class="muted">Его здесь уже нет.</p><button class="btn wide ghost" data-stubook="1">⬅ К книге</button>`;
    return `<div class="sh-head">${pic(r)}<div><h2>${esc(r.name)}</h2><div class="muted">${esc(spName(r.sp))} · ${esc(api.resTitle(r))}</div></div><button class="x" data-close>✕</button></div><p>${bio(r) || 'Тихон начал вести записи, когда этот ученик уже вырос: биография соберётся из того, что будет дальше.'}</p>${r.h ? `<button class="btn wide" data-stuhero="${r.id}">🦸 Карточка героя</button>` : ''}<button class="btn wide ghost" data-stubook="1">⬅ К книге</button>`;
  }
  function openBook() { api.openPanel(gardenPanel); api.stats('alumni', { k: 0 }); }
  // ---------------- album: species lines (one per card level-up, in order) ----------------
  function spLines(sp) { return SP_LINES[sp] || SP_LINES_W2; }
  function linesOpen(sp) { const F = S().forms || {}; let n = 0; for (const [k, f] of Object.entries(F)) if (k.split(':')[0] === sp && f && f.lvl > 1) n += f.lvl - 1; return Math.min(n, spLines(sp).length); }
  function albumLines(sp) {
    const L = spLines(sp), n = linesOpen(sp);
    return `<h3>📜 О виде: ${n} из ${L.length}</h3>` + (n ? L.slice(0, n).map((x, k) => `<p class="muted" style="margin:3px 4px">${k + 1}. ${esc(x)}</p>`).join('') : '') + (n < L.length ? `<p class="muted" style="margin:3px 4px">Каждый новый уровень любой карточки этого вида открывает новую строчку.</p>` : '');
  }
  function albumLvl(sp, lvl) {   // game.js formlvl: the new line (if any) for the toast
    const n = linesOpen(sp), L = spLines(sp); api.stats('album', { l: lvl, n });
    return n > 0 && n <= L.length ? L[n - 1] : '';
  }
  // ---------------- favourites easy to find (Ruslan 2026-11-26 «любимчика плохо видно! не найти») ----------------
  // a name plate over every favourite, drawn in the overlay layer (over walls and rooms, like the gate counter); «📍 Показать»
  // flies the camera to him and pulses the plate; a small HUD chip «💗 N» opens the favourites list
  let pulse = { id: -1, until: 0 };
  function drawFavs() {
    if (api.edit()) return; const F = favs(); if (!F.length) return;
    const c = api.ctx(), k = api.signK(), now = performance.now();
    for (const id of F) {
      const a = agentById(id); if (!a || a.state === 'fly' || a.state === 'vanish') continue;
      const p = api.P(a.x, a.y); if (!api.onScreen(p.x, p.y - 40, 200, 200)) continue;
      const fs = 9 * k, t = a.name || full(a), bob = Math.sin(now / 400 + id) * 1.2 * k;
      c.save(); c.font = `800 ${fs}px ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",sans-serif`;
      const ew = fs * 1.25, pad = 4 * k, bw = c.measureText(t).width + ew + pad * 2, bh = fs * 1.75, x = p.x - bw / 2, y = p.y - (a.z || 0) - 34 - 6 * k - bh + bob;
      if (pulse.id === id && now < pulse.until) { const u = ((now - pulse.until + 3000) % 750) / 750; c.globalAlpha = 1 - u; c.strokeStyle = '#ff3d7f'; c.lineWidth = 3 * k; c.beginPath(); c.ellipse(p.x, p.y - 14, 14 + 34 * u, 8 + 20 * u, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
      c.fillStyle = '#e8336f'; c.strokeStyle = '#fff'; c.lineWidth = 1.4 * k; c.beginPath(); c.roundRect(x, y, bw, bh, bh / 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(p.x - 3.5 * k, y + bh - 0.5); c.lineTo(p.x + 3.5 * k, y + bh - 0.5); c.lineTo(p.x, y + bh + 4.5 * k); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(t, x + pad + ew, y + bh / 2 + 0.5 * k); c.restore();
      api.emoji('💗', x + pad + ew * 0.42, y + bh / 2, fs * 1.05);
    }
  }
  function showFav(id) {
    const a = agentById(id); if (!a) { api.toast('Этого ученика уже нет в школе'); return; }
    api.closePanel(); pulse = { id, until: performance.now() + 3000 }; api.focus(a.x, a.y); api.stats('fav', { k: 1 });
  }
  function favHud() {   // the chip «💗 N» on the screen (only with favourites; hidden while a panel is open)
    let b = document.getElementById('fav-hud'); const n = favs().length, st = document.getElementById('stage');
    if (!st) return; if (!b) { b = document.createElement('button'); b.id = 'fav-hud'; b.className = 'ipill'; b.setAttribute('data-stufavs', ''); st.appendChild(b); }
    const h = n ? `💗 ${n}` : ''; if (b._h !== h) { b._h = h; b.innerHTML = api.emojiHtml ? api.emojiHtml(h) : h; }
    b.style.display = n && !api.edit() ? '' : 'none';
  }
  { const st = document.createElement('style'); st.id = 's8c-fav-css'; st.textContent = '#fav-hud{position:absolute;left:10px;bottom:calc(var(--safe-b, 0px) + 140px);z-index:6;font-weight:800;padding:5px 10px;border-radius:16px;background:#e8336f;color:#fff;border:2px solid #fff;box-shadow:0 3px 8px #0003}#fav-hud img.em{height:1.1em;width:1.1em}'; document.head.appendChild(st); }
  // ---------------- clicks ----------------
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-stutab],[data-stust],[data-stumw],[data-stubk],[data-stubio],[data-stuhero],[data-stutower],[data-stubook],[data-stushow],[data-stufavs]'); if (!b) return;
    const d = b.dataset;
    if (d.stutab !== undefined) { tab = d.stutab; api.refresh(); return; }
    if (d.stust !== undefined) { answer(+d.stust); return; }
    if (d.stumw !== undefined) { pickWeek(+d.stumw); api.refresh(); return; }
    if (d.stubk !== undefined) { bkTab = d.stubk; api.refresh(); return; }
    if (d.stubio !== undefined) { bioSel = d.stubio; api.openPanel(bioPanel); return; }
    if (d.stuhero !== undefined) { api.heroCard(+d.stuhero); return; }
    if (d.stutower !== undefined) { api.openTower(); return; }
    if (d.stubook !== undefined) { openBook(); return; }
    if (d.stushow !== undefined) { showFav(+d.stushow); return; }
    if (d.stufavs !== undefined) { tab = 'now'; api.openPeople(); return; }
  });
  function step8c(dt) {   // live play only (from step())
    favHud();
    scanLife(dt); scanTower(dt); stepStories();
    const M = mw(); if (!M.asked && !M.id && masters().length >= 2 && !api.edit()) { M.asked = 1; api.iq('news', 'mweek', () => mwHtml(true), { imp: '✨ Новая неделя: выбери Мастера недели' }); }
  }
  // test hook
  window.__s8c = { S8C, cands, story: (k, ids) => { const o = ids || {}; if (k === 'bday') { const b = bdayCand(); if (b) { cur = null; showStory(b); } return !!b; } cands[k] = { ...o, at: clock }; const s = storyOf(k, cands[k]); if (!s) return false; cur = null; showStory(s); return true; },
    cur: () => cur && { k: cur.k, a: cur.a.id, b: cur.b && cur.b.id }, answer: (k) => answer(k), storyPanel: () => api.openPanel(storyPanel), bio: (r) => bio(r), bioLines: (r) => bioLines(r), lg: (a) => lg(a), book: () => book(), alumni: () => alumni(),
    showFav: (id) => showFav(id), mw: () => mw(), pickWeek: (id) => pickWeek(id), masters: () => masters().map((x) => x.r.id), garden: () => openBook(), tab: (t) => { tab = t; }, bkTab: (t) => { bkTab = t; }, linesOpen: (sp) => linesOpen(sp), sadWhy: (a) => sadWhy(a), clock: () => clock, scanTower: () => { twT = 9; scanTower(0); } };
  { const st = document.createElement('style'); st.id = 's8c-css'; st.textContent = '.stu-counts{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}.stu-counts .stu-chip{background:#fff;border:1px solid #e3d6f5;border-radius:12px;font-size:12px;padding:3px 8px;color:#5a4a72}'; document.head.appendChild(st); }
  const STU = { full, anyName, dress, join, admit, step, drawCrowd, drawGate, over, examB, rankB, ev, tapTop, tapStudent, open, recCard, isFav, favs, rtGo, rankAfter,
    carry, promo, grad, bio, book, screen, setTab, book8c: () => openBook(), mcWeek, albumLines, albumLvl, sadWhy, drawFavs };   // s8c
  window.__s8a = {   // test hook
    get m() { return { ...M, clock, plateOn, jamT, crowd: crowd().length, left10: leftWin() }; }, reset() { Object.assign(M, { t: 0, plate: 0, crowdT: 0, crowdMax: 0, left: 0, gifted: 0, episodes: 0, sumT: 0, sumPlate: 0, sumLeft: 0 }); },
    crowd: () => crowd().map((o) => ({ sp: o.sp, n: o.name + ' ' + o.fn, g: o.gift || 0, w: Math.round(o.w) })), spot: (k) => crowdSpot(k), giftP, full: (a) => full(a), fav: (id) => toggleFav(id), favs: () => [...favs()],
    rtOk: (a) => rtOk(a), buyRt: (a) => buyRt(a), canGrow: (a) => canGrow(a), rtPrice: (i) => rtPrice(i),
    plateLines: () => plateLines(), plateRect: () => plateRect, open: (id) => { const a = api.agents().find((x) => x.id === id); if (a) open(a); return !!a; }, openCrowd: (k) => openCrowd(crowd()[k]), gatePanel: () => api.openPanel(gatePanel),
    K: { RT_LESSONS, FAV_MAX, FAV_EXAM, FAV_MOOD, GIFT_P0, GIFT_P1, GIFT_GAP, GIFT_RANK, GIFT_WAIT, CROWD_WAIT, PLATE_T, LEFT_WIN },
  };
  return STU;
}
