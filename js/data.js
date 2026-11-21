// Static game data: rooms, decor, names, quests. UI text is Russian (product language).

export const MAX_ROOM_LEVEL = 10;
export const MAX_COURSE = 8;          // passing the exam of the last course = graduation
export const OFFLINE_CAP_SEC = 2 * 3600;

// kind: 'class' rooms seat students and earn coins; 'support' rooms give global effects.
export const ROOM_TYPES = {
  dorm:     { kind: 'support', name: 'Спальня',       emoji: '🛏️', color: '#ffe0ec', unlock: 0,   build: 0,     upBase: 40,
              desc: 'Кровати для учеников. Больше уровень — больше учеников.' },
  herbs:    { kind: 'class',   name: 'Травология',    emoji: '🌿', color: '#d3f3d6', unlock: 0,   build: 0,     upBase: 25,   rate: 1,
              desc: 'Первый класс школы: учимся выращивать волшебные растения.' },
  canteen:  { kind: 'support', name: 'Столовая',      emoji: '🍰', color: '#fff0c4', unlock: 3,   build: 100,   upBase: 80,
              desc: 'Сытые ученики учатся быстрее.' },
  potions:  { kind: 'class',   name: 'Зельеварение',  emoji: '🧪', color: '#e6d9ff', unlock: 6,   build: 200,   upBase: 120,  rate: 1.7,
              desc: 'Варим зелья. Приносит больше монет, чем Травология.' },
  library:  { kind: 'support', name: 'Библиотека',    emoji: '📚', color: '#ffe4cc', unlock: 12,  build: 500,   upBase: 300,
              desc: 'Ученики готовятся к экзаменам: шанс сдать выше.' },
  stars:    { kind: 'class',   name: 'Звездочётство', emoji: '🔭', color: '#d6e4ff', unlock: 25,  build: 1200,  upBase: 600,  rate: 2.8,
              desc: 'Читаем судьбу по звёздам.' },
  charms:   { kind: 'class',   name: 'Чары',          emoji: '🪄', color: '#ffd6e8', unlock: 60,  build: 5000,  upBase: 2500, rate: 4.6,
              desc: 'Настоящие заклинания с волшебной палочкой.' },
  elements: { kind: 'class',   name: 'Магия стихий',  emoji: '🔥', color: '#ffdcc0', unlock: 140, build: 20000, upBase: 10000, rate: 7.5,
              desc: 'Огонь, вода, ветер и земля. Самый доходный класс.' },
};

export const BUILD_ORDER = ['dorm', 'herbs', 'canteen', 'potions', 'library', 'stars', 'charms', 'elements'];

export const DECOR = [
  { id: 'plant',   emoji: '🪴', name: 'Цветок в горшке',  cost: 30,   comfort: 1 },
  { id: 'candle',  emoji: '🕯️', name: 'Волшебная свеча',  cost: 90,   comfort: 1 },
  { id: 'frame',   emoji: '🖼️', name: 'Картина',          cost: 250,  comfort: 2 },
  { id: 'clock',   emoji: '🕰️', name: 'Старинные часы',   cost: 700,  comfort: 2 },
  { id: 'crystal', emoji: '🔮', name: 'Хрустальный шар',  cost: 2000, comfort: 3 },
  { id: 'rainbow', emoji: '🌈', name: 'Радуга',           cost: 6000, comfort: 4 },
];

export const NAMES = ['Мира', 'Тоша', 'Луна', 'Плюш', 'Кекс', 'Искра', 'Ромашка', 'Бублик', 'Звёздочка', 'Сеня',
  'Ириска', 'Пикси', 'Мята', 'Тучка', 'Феня', 'Зефир', 'Капля', 'Лимпа', 'Боня', 'Вишенка', 'Шуша', 'Пончик',
  'Рио', 'Лучик', 'Фасолька', 'Ника', 'Тимка', 'Ежевика', 'Пуговка', 'Снежок'];

export const BODY_COLORS = ['#ffb3c7', '#b8e1ff', '#c9f2c0', '#ffe39a', '#d9c2ff', '#ffc9a3', '#a8efe4', '#f7b8f0'];
export const HAT_COLORS = ['#6c4fd1', '#3d7be0', '#d14f8f', '#2f9e7a', '#e07a3d', '#8a3dd1'];

// Onboarding chain. check(state, ctx) -> boolean.
export const QUESTS = [
  { text: 'Нажми на монетки над классом Травологии', reward: 15, check: (s) => s.stats.collected >= 1 },
  { text: 'Прими нового ученика (вкладка «Ученики»)', reward: 25, check: (s) => s.stats.recruited >= 1 },
  { text: 'Улучши Травологию до 2 уровня (нажми на класс)', reward: 30, check: (s, c) => c.level('herbs') >= 2 },
  { text: 'Сдай первый экзамен (жди свиток 📜 над учеником)', reward: 40, check: (s) => s.stats.passed >= 1 },
  { text: 'Построй Столовую (нужно ⭐3)', reward: 60, check: (s, c) => c.level('canteen') >= 1 },
  { text: 'Поставь украшение в любую комнату', reward: 50, check: (s) => s.stats.decor >= 1 },
  { text: 'Улучши Спальню до 2 уровня', reward: 80, check: (s, c) => c.level('dorm') >= 2 },
  { text: 'Построй класс Зельеварения', reward: 150, check: (s, c) => c.level('potions') >= 1 },
  { text: 'Построй Библиотеку', reward: 300, check: (s, c) => c.level('library') >= 1 },
  { text: 'Выпусти первого ученика (сдай все 8 курсов)', reward: 1000, check: (s) => s.stats.graduated >= 1 },
];
