// Static game data for v0.2 (top-down campus). UI text is Russian (product language).

export const OFFLINE_CAP_SEC = 2 * 3600;
export const MAX_DESKS = 6;
export const MAX_ITEM_LEVEL = 40;   // 25 -> 40 in build 299 (her pick: new levels for veterans)
export const MAX_TEACHER_LEVEL = 20;
export const MAX_TIME_LEVEL = 10;

// Classes in the order students take them. Each has 4 furniture items.
// item kind: 'tuition' (+8% tuition per level) or 'success' (+1% exam success per level).
const MAGIC_CLASSES = [
  { id: 'herbs', name: 'Травология', emoji: '🌿', floor: '#e9d9b8', wall: '#9fd4a3', tuition: 10, build: 0, buildTime: 0, lesson: 6,
    teacher: 'Профессор Мох',
    items: [
      { id: 'pots', name: 'Горшки с травами', emoji: '🪴', kind: 'tuition' },
      { id: 'can', name: 'Лейка-облачко', emoji: '🚿', kind: 'success' },
      { id: 'seeds', name: 'Полка с семенами', emoji: '🌰', kind: 'tuition' },
      { id: 'sunlamp', name: 'Солнечная лампа', emoji: '🌞', kind: 'success' },
    ] },
  { id: 'potions', name: 'Зельеварение', emoji: '🧪', floor: '#e3d6c4', wall: '#c4b0ef', tuition: 25, build: 300, buildTime: 20, lesson: 8,
    teacher: 'Мадам Пузырь',
    items: [
      { id: 'cauldron', name: 'Котелки', emoji: '🫕', kind: 'tuition' },
      { id: 'jars', name: 'Банки с травами', emoji: '🫙', kind: 'success' },
      { id: 'candles', name: 'Свечи на стенах', emoji: '🕯️', kind: 'tuition' },
      { id: 'recipes', name: 'Книга рецептов', emoji: '📕', kind: 'success' },
    ] },
  { id: 'stars', name: 'Звездочётство', emoji: '🔭', floor: '#d9dcef', wall: '#8fa6e6', tuition: 60, build: 1500, buildTime: 60, lesson: 12,
    teacher: 'Звездочёт Лун',
    items: [
      { id: 'telescope', name: 'Телескоп', emoji: '🔭', kind: 'tuition' },
      { id: 'globe', name: 'Звёздный глобус', emoji: '🪐', kind: 'success' },
      { id: 'maps', name: 'Карты созвездий', emoji: '🗺️', kind: 'tuition' },
      { id: 'hourglass', name: 'Песочные часы', emoji: '⏳', kind: 'success' },
    ] },
  { id: 'charms', name: 'Чары', emoji: '🪄', floor: '#f0dbe3', wall: '#f2a7c7', tuition: 150, build: 6000, buildTime: 120, lesson: 14,
    teacher: 'Мастер Искра',
    items: [
      { id: 'wands', name: 'Стойка с палочками', emoji: '🪄', kind: 'tuition' },
      { id: 'mirror', name: 'Волшебное зеркало', emoji: '🪞', kind: 'success' },
      { id: 'ribbons', name: 'Ленты-обереги', emoji: '🎀', kind: 'tuition' },
      { id: 'crystal', name: 'Хрустальный шар', emoji: '🔮', kind: 'success' },
    ] },
  { id: 'flight', name: 'Полёты на крыльях', emoji: '🪽', floor: '#dcebf0', wall: '#9dd8e8', tuition: 400, build: 25000, buildTime: 300, lesson: 16,
    teacher: 'Капитан Ветерок',
    items: [
      { id: 'hoops', name: 'Кольца для полётов', emoji: '⭕', kind: 'tuition' },
      { id: 'feathers', name: 'Подушки из перьев', emoji: '🪶', kind: 'success' },
      { id: 'kites', name: 'Воздушные змеи', emoji: '🪁', kind: 'tuition' },
      { id: 'windbell', name: 'Колокольчик ветра', emoji: '🎐', kind: 'success' },
    ] },
  { id: 'elements', name: 'Магия стихий', emoji: '🔥', floor: '#efdcc8', wall: '#f0b483', tuition: 1000, build: 100000, buildTime: 600, lesson: 18,
    teacher: 'Госпожа Буря',
    items: [
      { id: 'brazier', name: 'Огненная чаша', emoji: '🔥', kind: 'tuition' },
      { id: 'fountain', name: 'Фонтанчик', emoji: '⛲', kind: 'success' },
      { id: 'rocks', name: 'Парящие камни', emoji: '🪨', kind: 'tuition' },
      { id: 'tornado', name: 'Ручной вихрь', emoji: '🌪️', kind: 'success' },
    ] },
  // Final exam: always the last step before graduation; open from the start, not built. Fail -> library -> retake.
  { id: 'final', final: true, name: 'Финальный экзамен', emoji: '📜', floor: '#efe6d2', wall: '#d9c08a', tuition: 200, build: 0, buildTime: 0, lesson: 10,
    teacher: 'Экзаменатор Сова',
    items: [
      { id: 'seal', name: 'Магическая печать', emoji: '📜', kind: 'tuition' },
      { id: 'bell', name: 'Колокольчик тишины', emoji: '🔔', kind: 'success' },
      { id: 'hourglass', name: 'Большие песочные часы', emoji: '⏳', kind: 'tuition' },
      { id: 'candles', name: 'Свечи сосредоточенности', emoji: '🕯️', kind: 'success' },
    ] },
];

// ---- worlds ----
// The current world is chosen before the game starts (switching worlds reloads the page).
export const WORLDS = [
  { id: 1, name: 'Школа магии', emoji: '🪄', desc: 'Травы, зелья, звёзды и чары', need: null },
  { id: 2, name: 'Подземное королевство гномов', emoji: '⛏️', desc: 'Руны, кузни, штольни и самоцветы', need: { grads: 10000, coins: 50000000, stars: 8, masters: 1 } },
  { id: 3, name: 'Небесный город', emoji: '☁️', desc: 'Скоро: облака, ветра и драконы', soon: true },
  { id: 4, name: 'Город будущего', emoji: '🤖', desc: 'Скоро: роботы, звездолёты и нейромагия', soon: true },
];
const GNOME_CLASSES = [
  { id: 'runes', name: 'Руны предков', emoji: '🪨', floor: '#d9cdbd', wall: '#a8957d', tuition: 10, build: 0, buildTime: 0, lesson: 6, teacher: 'Мастер Гранит',
    items: [{ id: 'tablets', name: 'Каменные таблички', emoji: '🪨', kind: 'tuition' }, { id: 'chisel', name: 'Резец мастера', emoji: '🔨', kind: 'success' },
      { id: 'torches', name: 'Факелы', emoji: '🔥', kind: 'tuition' }, { id: 'scrolls', name: 'Свитки рун', emoji: '📜', kind: 'success' }] },
  { id: 'forge', name: 'Кузня', emoji: '⚒️', floor: '#d8c4b0', wall: '#c08a5e', tuition: 25, build: 300, buildTime: 20, lesson: 8, teacher: 'Кузнец Молотобой',
    items: [{ id: 'anvil', name: 'Наковальня', emoji: '⚒️', kind: 'tuition' }, { id: 'bellows', name: 'Мехи', emoji: '💨', kind: 'success' },
      { id: 'ore', name: 'Ящик руды', emoji: '🪨', kind: 'tuition' }, { id: 'tongs', name: 'Клещи', emoji: '🔧', kind: 'success' }] },
  { id: 'mine', name: 'Штольня', emoji: '⛏️', floor: '#bcb3a6', wall: '#6f665a', tuition: 60, build: 1500, buildTime: 60, lesson: 12, teacher: 'Штейгер Бурав',
    items: [{ id: 'picks', name: 'Кирки', emoji: '⛏️', kind: 'tuition' }, { id: 'helmets', name: 'Каски с фонарями', emoji: '🪖', kind: 'success' },
      { id: 'carts', name: 'Вагонетки', emoji: '🛒', kind: 'tuition' }, { id: 'props', name: 'Крепь', emoji: '🪵', kind: 'success' }] },
  { id: 'gems', name: 'Гранильня', emoji: '💎', floor: '#dcd2e6', wall: '#9d84c7', tuition: 150, build: 6000, buildTime: 120, lesson: 14, teacher: 'Ювелир Искорка',
    items: [{ id: 'crystals', name: 'Друзы кристаллов', emoji: '💎', kind: 'tuition' }, { id: 'loupe', name: 'Лупа', emoji: '🔍', kind: 'success' },
      { id: 'chest', name: 'Сундук', emoji: '🧰', kind: 'tuition' }, { id: 'scales', name: 'Весы', emoji: '⚖️', kind: 'success' }] },
  { id: 'guards', name: 'Зал стражей', emoji: '🛡️', floor: '#c4c8c0', wall: '#6f7d74', tuition: 400, build: 25000, buildTime: 300, lesson: 16, teacher: 'Воевода Гром',
    items: [{ id: 'shields', name: 'Щиты', emoji: '🛡️', kind: 'tuition' }, { id: 'axes', name: 'Топоры', emoji: '🪓', kind: 'success' },
      { id: 'swords', name: 'Мечи', emoji: '⚔️', kind: 'tuition' }, { id: 'horn', name: 'Рог тревоги', emoji: '📯', kind: 'success' }] },
  { id: 'lake', name: 'Озёрный зал', emoji: '🛶', floor: '#c6d6dc', wall: '#5f8594', tuition: 1000, build: 100000, buildTime: 600, lesson: 18, teacher: 'Лодочница Тиша',
    items: [{ id: 'boats', name: 'Лодки', emoji: '🛶', kind: 'tuition' }, { id: 'nets', name: 'Сети', emoji: '🕸️', kind: 'success' },
      { id: 'fish', name: 'Светящиеся рыбы', emoji: '🐟', kind: 'tuition' }, { id: 'lanterns', name: 'Фонари на воде', emoji: '🏮', kind: 'success' }] },
  { id: 'final', final: true, name: 'Палата клятв', emoji: '🏅', floor: '#efe6d2', wall: '#c9a45c', tuition: 200, build: 0, buildTime: 0, lesson: 10, teacher: 'Старейшина Корень',
    items: [{ id: 'seal', name: 'Печать клана', emoji: '🏅', kind: 'tuition' }, { id: 'bell', name: 'Гонг', emoji: '🔔', kind: 'success' },
      { id: 'hourglass', name: 'Песочные часы', emoji: '⏳', kind: 'tuition' }, { id: 'candles', name: 'Свечи', emoji: '🕯️', kind: 'success' }] },
];
function readMeta() { try { return JSON.parse(localStorage.getItem('magicschool.meta')) || {}; } catch (e) { return {}; } }
export const META = readMeta();
export const WORLD = WORLDS.some((w) => w.id === META.current && !w.soon) ? META.current : 1;
export const CLASSES = WORLD === 2 ? GNOME_CLASSES : MAGIC_CLASSES;

// world 2 (cold mountain kingdom) has its own six cave creatures (her pick 2026-11-22)
export const SPECIES = WORLD === 2 ? ['mossmole', 'owlbat', 'quartzhog', 'batbunny', 'geosnail', 'axolotl'] : ['mothfox', 'petalear', 'fernhorn', 'starwhisker'];

export const NAMES = ['Мира', 'Тоша', 'Луна', 'Плюш', 'Кекс', 'Искра', 'Ромашка', 'Бублик', 'Звёздочка', 'Сеня',
  'Ириска', 'Пикси', 'Мята', 'Тучка', 'Феня', 'Зефир', 'Капля', 'Лимпа', 'Боня', 'Вишенка', 'Шуша', 'Пончик',
  'Рио', 'Лучик', 'Фасолька', 'Ника', 'Тимка', 'Ежевика', 'Пуговка', 'Снежок'];

// Story chain («Задания от Тихона»), one at a time. id = what is saved as done (S.story); v1 = the 13 missions of the first chain,
// in their old order (old saves kept an index S.mission into them). check(g) -> boolean, prog(g) -> [now, target] for the hint,
// go = where «Выполнить» leads: [room id | '#classId' | '@mg' | '@top' | '@ally' | '@insp' | '@album', selector of the button].
// build = class id the mission asks to build (the random missions then skip that class). 2026-11-23: new steps for the features
// added since build 237 (court, director's routine, shop, canteen, tower, top, alliances, mini-game), Maria's «Да, делай всё».
const statOf = (g, k) => g.S.stats[k] || 0;
export const MISSIONS = WORLD === 2 ? [
  { id: 'w_tab', text: 'Улучши «Каменные таблички» до ур. 3', reward: 40, check: (g) => g.item('runes', 'tablets') >= 3, prog: (g) => [g.item('runes', 'tablets'), 3], go: ['#runes', '[data-act="item"][data-k="0"]'] },
  { id: 'w_forge', text: 'Построй Кузню ⚒️', reward: 150, build: 'forge', check: (g) => g.built('forge'), go: ['#forge', '[data-act="build"]'] },
  { id: 'w_g10', text: 'Выпусти 10 учеников 🎓', reward: 200, check: (g) => g.S.stats.graduated >= 10, prog: (g) => [g.S.stats.graduated, 10], go: ['#final', '[data-act="desk"]'] },
  { id: 'w_mg', text: 'Свари 3 зелья в Зельеварке 🧪', reward: 100, check: (g) => (g.mg().pot || 0) >= 3, prog: (g) => [g.mg().pot || 0, 3], go: ['@mg', null] },
  { id: 'w_mine', text: 'Построй Штольню ⛏️', reward: 800, build: 'mine', check: (g) => g.built('mine'), go: ['#mine', '[data-act="build"]'] },
  { id: 'w_ore', text: 'Добудь 30 руды в Штольне ⛏️', reward: 1000, check: (g) => statOf(g, 'ore') >= 30, prog: (g) => [statOf(g, 'ore'), 30], go: ['#mine', '[data-act="desk"]'] },
  { id: 'w_forged', text: 'Выкуй 20 изделий в Кузне ⚒️', reward: 1000, check: (g) => statOf(g, 'forged') >= 20, prog: (g) => [statOf(g, 'forged'), 20], go: ['#forge', '[data-act="desk"]'] },
  { id: 'w_trade', text: 'Построй Торговый двор 🐐', reward: 3000, check: (g) => g.trade(), go: ['TRADE', '[data-act="tradebuild"]'] },
  { id: 'w_car', text: 'Отправь первый караван 🐐', reward: 3000, check: (g) => statOf(g, 'caravans') >= 1 || g.tradeAway(), go: ['TRADE', '[data-act="caravan"]'] },
  { id: 'w_store', text: 'Расширь склад руды до ур. 3 📦', reward: 5000, check: (g) => g.w2().store >= 3, prog: (g) => [g.w2().store, 3], go: ['#mine', '[data-act="store"]'] },
  { id: 'w_name', text: 'Дай школе имя и загляни в топ школ 🏆', reward: 500, check: (g) => g.named(), go: ['@top', null] },
  { id: 'w_gems', text: 'Построй Гранильню 💎', reward: 4000, build: 'gems', check: (g) => g.built('gems'), go: ['#gems', '[data-act="build"]'] },
  { id: 'w_gem', text: 'Огрань первый самоцвет 💎', reward: 10000, check: (g) => statOf(g, 'gemsCut') >= 1 || g.w2().gems > 0, go: ['#gems', '[data-act="desk"]'] },
  { id: 'w_g100', text: 'Выпусти 100 учеников 🎓', reward: 2000, check: (g) => g.S.stats.graduated >= 100, prog: (g) => [g.S.stats.graduated, 100], go: ['#final', '[data-act="desk"]'] },
  { id: 'w_guards', text: 'Построй Зал стражей 🛡️', reward: 15000, build: 'guards', check: (g) => g.built('guards'), go: ['#guards', '[data-act="build"]'] },
  { id: 'w_ally', text: 'Вступи в альянс или создай свой 🤝', reward: 20000, check: (g) => g.ally(), go: ['@ally', null] },
  { id: 'w_car10', text: 'Отправь 10 караванов 🐐', reward: 30000, check: (g) => statOf(g, 'caravans') >= 10, prog: (g) => [statOf(g, 'caravans'), 10], go: ['TRADE', '[data-act="caravan"]'] },
  { id: 'w_lake', text: 'Построй Озёрный зал 🛶', reward: 60000, build: 'lake', check: (g) => g.built('lake'), go: ['#lake', '[data-act="build"]'] },
  { id: 'w_master', text: 'Пусть первый ученик станет Хранителем 🌟', reward: 100000, check: (g) => g.masters() >= 1, go: ['#final', '[data-act="exlvl"]'] },
] : [
  { id: 'pots3', v1: 1, text: 'Улучши «Горшки с травами» до ур. 3', reward: 40, check: (g) => g.item('herbs', 'pots') >= 3 },
  { id: 'herbT3', v1: 1, text: 'Улучши учителя Травологии до ур. 3', reward: 60, check: (g) => g.cls('herbs').teacher >= 3 },
  { id: 'herbD3', v1: 1, text: 'Поставь 3-ю парту в Травологии', reward: 80, check: (g) => g.cls('herbs').desks >= 3, prog: (g) => [g.cls('herbs').desks, 3] },
  { id: 'rec3', v1: 1, text: 'Улучши приёмную до ур. 3', reward: 80, check: (g) => g.S.reception.level >= 3 },
  { id: 'potions', v1: 1, text: 'Построй класс Зельеварения', reward: 150, build: 'potions', check: (g) => g.built('potions') },
  { id: 'g10', v1: 1, text: 'Выпусти 10 учеников', reward: 200, check: (g) => g.S.stats.graduated >= 10, prog: (g) => [g.S.stats.graduated, 10] },
  { id: 'mg3', text: 'Свари 3 зелья в Зельеварке 🧪', reward: 100, check: (g) => (g.mg().pot || 0) >= 3, prog: (g) => [g.mg().pot || 0, 3], go: ['@mg', null] },
  { id: 'item10', v1: 1, text: 'Улучши любой предмет до ур. 10', reward: 300, check: (g) => g.maxItem() >= 10, prog: (g) => [g.maxItem(), 10] },
  { id: 'potD4', v1: 1, text: 'Поставь 4 парты в Зельеварении', reward: 500, check: (g) => g.built('potions') && g.cls('potions').desks >= 4 },
  { id: 'bench2', text: 'Поставь во дворе новую скамейку 🪑', reward: 1200, check: (g) => g.court().bench >= 2, prog: (g) => [g.court().bench, 2], go: ['FOUNT', '[data-act="cbench"]'] },
  { id: 'stars', v1: 1, text: 'Построй Звездочётство', reward: 800, build: 'stars', check: (g) => g.built('stars') },
  { id: 'name', text: 'Дай школе имя и загляни в топ школ 🏆', reward: 500, check: (g) => g.named(), go: ['@top', null] },
  { id: 'g100', v1: 1, text: 'Выпусти 100 учеников', reward: 2000, check: (g) => g.S.stats.graduated >= 100, prog: (g) => [g.S.stats.graduated, 100] },
  { id: 'star2', text: 'Заработай 2 звезды школы на проверках инспектора ⭐', reward: 2000, check: (g) => g.stars() >= 2 || g.dir(), prog: (g) => [g.stars(), 2], go: ['@insp', null] },
  { id: 'dir', text: 'Построй кабинет директора 👑', reward: 10000, check: (g) => g.dir(), go: ['DIR', '[data-act="dirbuild"]'] },
  { id: 'camp', text: 'Проведи рекламную акцию (кабинет директора) 📣', reward: 5000, check: (g) => statOf(g, 'camps') >= 1, go: ['DIR', '[data-act="camp"]'] },
  { id: 'shop', text: 'Открой лавку 🛍️', reward: 30000, check: (g) => g.shop(), go: ['SHOP', '[data-act="shopbuild"]'] },
  { id: 'cant', text: 'Построй столовую 🍽️', reward: 100000, check: (g) => g.cant(), go: ['CANT', '[data-act="cantbuild"]'] },
  { id: 'mail', text: 'Ответь на письмо родителей ✉️', reward: 20000, check: (g) => statOf(g, 'mails') >= 1, go: ['DIR', '[data-act="mail"]'] },
  { id: 'charms', v1: 1, text: 'Построй класс Чар', reward: 4000, build: 'charms', check: (g) => g.built('charms') },
  { id: 'fount3', text: 'Улучши Волшебный фонтан до ур. 3 ⛲', reward: 8000, check: (g) => g.court().fount >= 3, prog: (g) => [g.court().fount, 3], go: ['FOUNT', '[data-act="cfount"]'] },
  { id: 'ally', text: 'Вступи в альянс или создай свой 🤝', reward: 20000, check: (g) => g.ally(), go: ['@ally', null] },
  { id: 'flight', v1: 1, text: 'Построй класс Полётов на крыльях', reward: 15000, build: 'flight', check: (g) => g.built('flight') },
  { id: 'elements', v1: 1, text: 'Построй Магию стихий', reward: 60000, build: 'elements', check: (g) => g.built('elements') },
  { id: 'master', text: 'Вырасти первого Мастера 🌟', reward: 100000, check: (g) => g.masters() >= 1, go: ['#final', '[data-act="exlvl"]'] },
  { id: 'tower', text: 'Построй Башню мастеров 🏰', reward: 5000000, check: (g) => g.tower(), go: ['TOWER', '[data-act="towerbuild"]'] },
  { id: 'mgStar3', text: 'Набери 5 500 очков в Зельеварке (3 звезды) 🧪', reward: 50000, check: (g) => (g.mg().best || 0) >= 5500, prog: (g) => [g.mg().best || 0, 5500], go: ['@mg', null] },
];
