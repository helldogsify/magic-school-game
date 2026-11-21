// Static game data for v0.2 (top-down campus). UI text is Russian (product language).

export const OFFLINE_CAP_SEC = 2 * 3600;
export const MAX_DESKS = 6;
export const MAX_ITEM_LEVEL = 25;
export const MAX_TEACHER_LEVEL = 20;
export const MAX_TIME_LEVEL = 10;

// Classes in the order students take them. Each has 4 furniture items.
// item kind: 'tuition' (+8% tuition per level) or 'success' (+1% exam success per level).
export const CLASSES = [
  { id: 'herbs', name: 'Травология', emoji: '🌿', floor: '#e9d9b8', wall: '#9fd4a3', tuition: 10, build: 0, buildTime: 0, lesson: 8,
    teacher: 'Профессор Мох',
    items: [
      { id: 'pots', name: 'Горшки с травами', emoji: '🪴', kind: 'tuition' },
      { id: 'can', name: 'Лейка-облачко', emoji: '🚿', kind: 'success' },
      { id: 'seeds', name: 'Полка с семенами', emoji: '🌰', kind: 'tuition' },
      { id: 'sunlamp', name: 'Солнечная лампа', emoji: '🌞', kind: 'success' },
    ] },
  { id: 'potions', name: 'Зельеварение', emoji: '🧪', floor: '#e3d6c4', wall: '#c4b0ef', tuition: 25, build: 300, buildTime: 20, lesson: 10,
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
];

export const SPECIES = ['mothfox', 'petalear', 'fernhorn', 'starwhisker'];

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
