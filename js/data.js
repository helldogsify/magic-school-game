// Static game data for v0.2 (top-down campus). UI text is Russian (product language).

export const OFFLINE_CAP_SEC = 2 * 3600;
export const MAX_DESKS = 6;
export const MAX_ITEM_LEVEL = 25;
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
  { id: 2, name: 'Подземное королевство гномов', emoji: '⛏️', desc: 'Руны, кузни, тоннели и самоцветы', need: { grads: 10000, coins: 50000000, stars: 8, masters: 1 } },
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
  { id: 'tunnels', name: 'Навигация в тоннелях', emoji: '🧭', floor: '#cfc6b8', wall: '#8e8a7c', tuition: 60, build: 1500, buildTime: 60, lesson: 12, teacher: 'Следопыт Фонарик',
    items: [{ id: 'map', name: 'Карта подземелий', emoji: '🗺️', kind: 'tuition' }, { id: 'lamp', name: 'Шахтёрская лампа', emoji: '🏮', kind: 'success' },
      { id: 'compass', name: 'Компас', emoji: '🧭', kind: 'tuition' }, { id: 'rope', name: 'Верёвки', emoji: '🪢', kind: 'success' }] },
  { id: 'gems', name: 'Самоцветы', emoji: '💎', floor: '#dcd2e6', wall: '#9d84c7', tuition: 150, build: 6000, buildTime: 120, lesson: 14, teacher: 'Ювелир Искорка',
    items: [{ id: 'crystals', name: 'Друзы кристаллов', emoji: '💎', kind: 'tuition' }, { id: 'loupe', name: 'Лупа', emoji: '🔍', kind: 'success' },
      { id: 'chest', name: 'Сундук', emoji: '🧰', kind: 'tuition' }, { id: 'scales', name: 'Весы', emoji: '⚖️', kind: 'success' }] },
  { id: 'mushrooms', name: 'Грибные сады', emoji: '🍄', floor: '#d6e0c8', wall: '#8fae7c', tuition: 400, build: 25000, buildTime: 300, lesson: 16, teacher: 'Садовница Трюфель',
    items: [{ id: 'beds', name: 'Грибные грядки', emoji: '🍄', kind: 'tuition' }, { id: 'moss', name: 'Светящийся мох', emoji: '🌿', kind: 'success' },
      { id: 'barrels', name: 'Бочки с водой', emoji: '🛢️', kind: 'tuition' }, { id: 'spores', name: 'Споры-светлячки', emoji: '✨', kind: 'success' }] },
  { id: 'history', name: 'История гномов', emoji: '📜', floor: '#e6dccb', wall: '#b3946a', tuition: 1000, build: 100000, buildTime: 600, lesson: 18, teacher: 'Летописец Борода',
    items: [{ id: 'chronicle', name: 'Летопись', emoji: '📖', kind: 'tuition' }, { id: 'statue', name: 'Статуя предка', emoji: '🗿', kind: 'success' },
      { id: 'banners', name: 'Знамёна кланов', emoji: '🚩', kind: 'tuition' }, { id: 'horn', name: 'Рог совета', emoji: '📯', kind: 'success' }] },
  { id: 'final', final: true, name: 'Посвящение в мастера', emoji: '🏅', floor: '#efe6d2', wall: '#c9a45c', tuition: 200, build: 0, buildTime: 0, lesson: 10, teacher: 'Старейшина Корень',
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

// Mission chain. check(game) -> boolean; game exposes helpers.
export const MISSIONS = [
  { text: 'Улучши «Горшки с травами» до ур. 3', reward: 40, check: (g) => g.item('herbs', 'pots') >= 3 },
  { text: 'Улучши учителя Травологии до ур. 3', reward: 60, check: (g) => g.cls('herbs').teacher >= 3 },
  { text: 'Поставь 3-ю парту в Травологии', reward: 80, check: (g) => g.cls('herbs').desks >= 3 },
  { text: 'Улучши приёмную до ур. 3', reward: 80, check: (g) => g.S.reception.level >= 3 },
  { text: 'Построй класс Зельеварения', reward: 150, check: (g) => g.built('potions') },
  { text: 'Выпусти 10 учеников', reward: 200, check: (g) => g.S.stats.graduated >= 10 },
  { text: 'Улучши любой предмет до ур. 10', reward: 300, check: (g) => g.maxItem() >= 10 },
  { text: 'Поставь 4 парты в Зельеварении', reward: 500, check: (g) => g.built('potions') && g.cls('potions').desks >= 4 },
  { text: 'Построй Звездочётство', reward: 800, check: (g) => g.built('stars') },
  { text: 'Выпусти 100 учеников', reward: 2000, check: (g) => g.S.stats.graduated >= 100 },
  { text: 'Построй класс Чар', reward: 4000, check: (g) => g.built('charms') },
  { text: 'Построй класс Полётов на крыльях', reward: 15000, check: (g) => g.built('flight') },
  { text: 'Построй Магию стихий', reward: 60000, check: (g) => g.built('elements') },
];
