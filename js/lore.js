// «Летопись» — the lore book of world 1 (Maria's wish 2026-11-23 «лорную кнопочку»; every fact co-created with her, canon in
// ../lore/canon.md, mechanics in ../lore/book_design.md). Stage 1: chapters, pages opening in layers as the school grows, locked
// layers show «Откроется, когда…», a badge on the ✨ menu tile for new text. Quiz, night pages, riddle lines and secrets come later.
// Own module like chests.js: game.js passes a small API and calls initLore(). Per world save: S.lore = { seen: { pageId: layers } }.

let A = null, root = null, chap = 'world', page = null;
const S = () => A.state();

// ---- texts (Russian: game content). Each page: id, chapter, title, img, layers [{ t: section title, x: text, need: () => bool, hint }]
const P = (o) => o;
const PAGES = [
  P({ id: 'hills', ch: 'world', title: 'Мотыльковые холмы', icon: '🏰', layers: [
    { img: 'assets/lore/hills.webp', wide: 1, t: 'Земля', x: 'Школа магии стоит на Мотыльковых холмах — среди древнего леса, где по ночам светятся крылья лисичек-мотыльков. Холмы назвали в их честь: лисички жили здесь задолго до того, как появилась первая парта.' },
    { img: 'assets/lore/star.webp', wide: 1, t: 'Первая звезда', x: 'Когда-то давно на холмы упала звезда. Её свет осыпался пыльцой на траву и на крылья спящих лисичек — с тех пор в этих местах магия сильнее, чем где-либо ещё.', need: (f) => f.grads >= 10, hint: 'когда школа выпустит 10 учеников' },
    { img: 'assets/lore/found.webp', wide: 1, t: 'Школа', x: 'Школу основал Тихон — очень древняя черепаха. Он нашёл упавшую звезду в лесу и первым начал учить тех, кто приходил к нему за знаниями. Так на холмах выросла Школа магии.', need: (f) => f.grads >= 50, hint: 'когда школа выпустит 50 учеников' },
  ] }),
  P({ id: 'tikhon', ch: 'world', title: 'Летописец Тихон', img: 'assets/staff/tikhon_read.png', layers: [
    { img: 'assets/staff/tikhon_lantern.png', t: 'Кто он', x: 'Тихон — основатель школы и её летописец. Он записывает каждый шаг школы: каждого ученика, каждый урок, каждый выпуск.' },
    { img: 'assets/staff/tikhon_staff.png', t: 'Обещание', x: 'Тихон мог бы стать директором — но не стал. Когда-то он нашёл в лесу упавшую звезду, и звезда подарила ему долгую жизнь. Взамен он пообещал ей только записывать историю — и никогда не вершить её. Это обещание он хранит до сих пор.', need: (f) => f.grads >= 200, hint: 'когда школа выпустит 200 учеников' },
  ] }),
  P({ id: 'director', ch: 'world', title: 'Исчезнувший директор', icon: '🌙', layers: [
    { img: 'assets/lore/note.webp', wide: 1, t: 'Та ночь', x: 'Прежний директор школы исчез в одну звёздную ночь. Он не попрощался и ничего не взял с собой — оставил только записку на столе. Записка оказалась загадкой.', need: (f) => f.masters >= 1, hint: 'когда в школе появится первый Мастер' },
    { img: 'assets/lore/lion.webp', wide: 1, t: 'Новый директор', x: 'На место директора пришли кандидаты из разных краёв. Победил Лев — когда-то он сам учился в этой школе. Тихон записал этот день очень подробно. Пожалуй, даже слишком подробно.', need: (f) => f.masters >= 1 && f.has('dir'), hint: 'когда в школе появится первый Мастер и будет построен Кабинет директора' },
    { riddle: 1, t: 'Загадка записки', x: 'Записка директора — загадка из пяти строк. Тихон спрятал их по разным страницам летописи, и каждая проступает только за особое событие в твоей школе. Собери все пять — и узнаешь, куда исчез директор.', need: (f) => f.masters >= 1, hint: 'когда в школе появится первый Мастер' },   // her «Мы будем разгадывать загадку? Тогда надо как то это указать»: the riddle is named plainly; lines come in the next stage
  ] }),
  // races (approved texts)
  P({ id: 'mothfox', ch: 'races', title: 'Лисички-мотыльки', sub: '«Хранители пыльцы»', img: 'assets/creatures/mothfox.png', sp: 'mothfox', layers: [
    { img: 'assets/creatures/mothfox.png', t: 'Откуда', need: (f) => f.rank('mothfox', 0), hint: 'когда в школу придёт первый лисичка-мотылёк', x: 'Коренные жители Мотыльковых холмов, жили здесь задолго до школы. Когда первая звезда упала в лес, её свет осыпался на холмы пыльцой. Лисички спали в ту ночь в траве — и пыльца осела на их крылья. С тех пор крылья светятся, а сами они чувствуют магию, как другие чувствуют погоду.' },
    { img: 'assets/creatures/mothfox_k_birds.png', t: 'Обычаи', x: 'Живут большими семьями-«стайками» в норах под корнями. Раз в год, в ночь падения звезды, вся стайка поднимается в воздух и кружит над холмами — Праздник Пыльцы. Малыши впервые летают именно в эту ночь.', need: (f) => f.rank('mothfox', 2), hint: 'когда лисичка-мотылёк станет Младшим магом' },
    { img: 'assets/creatures/mothfox_k_sit.png', t: 'Характер', x: 'Любопытные, болтливые, бесконечно добрые. Не умеют долго злиться — и не умеют хранить секреты: проболтаются, даже если очень стараются.\n\nСлабость: рассеянны. Увидели блестящее — забыли, куда шли. На уроках Тихон часто записывает: «опять улетела за бабочкой».', need: (f) => f.rank('mothfox', 3), hint: 'когда лисичка-мотылёк поднимется ещё на ранг выше' },
    { img: 'assets/creatures/mothfox_t2.png', t: 'В школе', x: 'Лучше всех в Чарах: магия у них в крыльях. Но заклинания выходят слишком яркими и шумными.', need: (f) => f.rank('mothfox', 4), hint: 'когда лисичка-мотылёк дойдёт до предпоследнего ранга' },
    { img: 'assets/creatures/mothfox_t4.png', t: 'Легенда', x: 'Говорят, если лисичка-мотылёк потеряет свою пыльцу, то станет обычной лисой и забудет, что умела летать. Поэтому самое страшное оскорбление у них — «бескрылый».', need: (f) => f.master('mothfox'), hint: 'когда лисичка-мотылёк станет Мастером' },
  ] }),
  P({ id: 'petalear', ch: 'races', title: 'Ушастики', sub: '«Народ тишины»', img: 'assets/creatures/petalear.png', sp: 'petalear', layers: [
    { img: 'assets/creatures/petalear.png', t: 'Откуда', need: (f) => f.rank('petalear', 0), hint: 'когда в школу придёт первый ушастик', x: 'Пришли из Тихих долин за холмами, где ветер не дует и всё растёт медленно. Их уши такие большие, потому что в долинах слушали, как растут корни и как спят семена.' },
    { img: 'assets/creatures/petalear_k_birds.png', t: 'Обычаи', x: 'Говорят мало и тихо, громкий смех считается невежливым. Вместо прощания касаются друг друга кончиками ушей. Каждый ушастик носит засушенный листок из родной долины.', need: (f) => f.rank('petalear', 2), hint: 'когда ушастик станет Младшим магом' },
    { img: 'assets/creatures/petalear_k_sit.png', t: 'Характер', x: 'Спокойные, наблюдательные, очень терпеливые. Лучшие друзья: выслушают и запомнят каждое слово.\n\nСлабость: боятся громких звуков. Взрыв котла у Мадам Пузырь для них — настоящее испытание, поэтому на Зельеварении они сидят в задних рядах.', need: (f) => f.rank('petalear', 3), hint: 'когда ушастик поднимется ещё на ранг выше' },
    { img: 'assets/creatures/petalear_t2.png', t: 'В школе', x: 'Короли Травологии: растения им «рассказывают», чего хотят. Профессор Мох их обожает.', need: (f) => f.rank('petalear', 4), hint: 'когда ушастик дойдёт до предпоследнего ранга' },
    { img: 'assets/creatures/petalear_t4.png', t: 'Легенда', x: 'Если ушастик приложит ухо к земле, он услышит, где спрятан клад. Только они никогда никому не говорят где: считают, что земля доверила тайну им одним.', need: (f) => f.master('petalear'), hint: 'когда ушастик станет Мастером' },
  ] }),
  P({ id: 'fernhorn', ch: 'races', title: 'Рогатики', sub: '«Лесные стражи»', img: 'assets/creatures/fernhorn.png', sp: 'fernhorn', layers: [
    { img: 'assets/creatures/fernhorn.png', t: 'Откуда', need: (f) => f.rank('fernhorn', 0), hint: 'когда в школу придёт первый рогатик', x: 'Живут в самой глубине леса, в древних рощах, куда другие боятся ходить. Их предки охраняли ту самую упавшую звезду, пока Тихон не нашёл её. На рогах у них растёт мох, а весной распускаются маленькие цветы.' },
    { img: 'assets/creatures/fernhorn_k_birds.png', t: 'Обычаи', x: 'Взрослый рогатик сажает дерево в честь каждого важного события в жизни. По тому, какие деревья растут у норы, можно прочитать всю его историю. Ссориться у них — значит молча стоять рог к рогу, пока кто-то не уступит.', need: (f) => f.rank('fernhorn', 2), hint: 'когда рогатик станет Младшим магом' },
    { img: 'assets/creatures/fernhorn_k_sit.png', t: 'Характер', x: 'Смелые, упрямые, верные до конца. Медленно заводят друзей — но если ты друг рогатика, это навсегда.\n\nСлабость: гордость. Не умеют просить о помощи и сначала десять раз провалят экзамен, чем пойдут в Библиотеку.', need: (f) => f.rank('fernhorn', 3), hint: 'когда рогатик поднимется ещё на ранг выше' },
    { img: 'assets/creatures/fernhorn_t2.png', t: 'В школе', x: 'Сильны в Магии стихий, особенно с землёй и огнём. Госпожа Буря говорит, что у них «характер как у вулкана».', need: (f) => f.rank('fernhorn', 4), hint: 'когда рогатик дойдёт до предпоследнего ранга' },
    { img: 'assets/creatures/fernhorn_t4.png', t: 'Легенда', x: 'Долго не доверяли школе: думали, что маги заберут звезду. Первый рогатик пришёл учиться только потому, что Тихон пообещал ему посадить дерево у ворот. То дерево растёт до сих пор.', need: (f) => f.master('fernhorn'), hint: 'когда рогатик станет Мастером' },
  ] }),
  P({ id: 'starwhisker', ch: 'races', title: 'Крылоушки', sub: '«Весенние порхуньи»', img: 'assets/creatures/starwhisker.png', sp: 'starwhisker', layers: [
    { img: 'assets/creatures/starwhisker.png', t: 'Откуда', need: (f) => f.rank('starwhisker', 0), hint: 'когда в школу придёт первый крылоушка', x: 'Персиковые пушистые кролики с крыльями бабочки. Каждую весну прилетают на Мотыльковые холмы вместе с первыми цветами. Где они проводят зиму, не знает никто — а сами крылоушки каждый раз отвечают по-разному.' },
    { img: 'assets/creatures/starwhisker_k_birds.png', t: 'Обычаи', x: 'Узор на крыльях у каждого свой, как отпечаток. Когда крылоушка влюбляется, узор чуть-чуть меняется. Весной устраивают Танец бабочек на рассвете.', need: (f) => f.rank('starwhisker', 2), hint: 'когда крылоушка станет Младшим магом' },
    { img: 'assets/creatures/starwhisker_k_sit.png', t: 'Характер', x: 'Весёлые, мечтательные, обожают истории, где правду не отличить от выдумки.\n\nСлабость: непоседы. На месте не сидят ни минуты и вечно опаздывают на первый урок.', need: (f) => f.rank('starwhisker', 3), hint: 'когда крылоушка поднимется ещё на ранг выше' },
    { img: 'assets/creatures/starwhisker_t2.png', t: 'В школе', x: 'Лучшие в Полётах: Капитан Ветерок говорит, что они не летают, а «танцуют в воздухе».', need: (f) => f.rank('starwhisker', 4), hint: 'когда крылоушка дойдёт до предпоследнего ранга' },
    { img: 'assets/creatures/starwhisker_t4.png', t: 'Легенда', x: 'Шепчутся, что крылоушки видели, куда исчез прежний директор: они летали над холмами той звёздной ночью. Но каждый раз рассказывают по-другому.', need: (f) => f.master('starwhisker'), hint: 'когда крылоушка станет Мастером' },
  ] }),
];
// teachers: story when the class is built, habits + weakness at teacher level 3, the favourite phrase at level 8
const CLS_NAME = { herbs: 'Травология', potions: 'Зельеварение', stars: 'Звездочётство', charms: 'Чары', flight: 'Полёты на крыльях', elements: 'Магия стихий', final: 'Финальный экзамен' };
const T = (id, cls, title, img, look, story, habits, weak, quote, ps = []) => P({ id, ch: 'teachers', title, img, cls, layers: [
  { img, t: 'Как выглядит', x: look, need: (f) => f.cls(cls).built, hint: `когда будет построен класс «${CLS_NAME[cls]}»` },
  { img: ps[0], t: 'История', x: story, need: (f) => f.cls(cls).built, hint: `когда будет построен класс «${CLS_NAME[cls]}»` },
  { img: ps[1], t: 'Привычки', x: habits + '\n\nСлабость: ' + weak, need: (f) => f.cls(cls).built && f.cls(cls).lvl >= 3, hint: 'когда учитель достигнет 3 уровня' },
  { img: ps[2], t: 'Любимая фраза', x: quote, need: (f) => f.cls(cls).built && f.cls(cls).lvl >= 8, hint: 'когда учитель достигнет 8 уровня' },
] });
PAGES.push(
  T('moss', 'herbs', 'Профессор Мох', 'assets/staff/moss.png', 'Седой лесной старец с огромными ушами, зелёной бородой до пояса, венком из листьев и лейкой.',
    'Самый старый учитель после Тихона. Говорят, когда-то он сам был деревом и очнулся от того, что ушастик шепнул ему на ухо «проснись». С тех пор ходит медленно и разговаривает с растениями чаще, чем со взрослыми.',
    'Поливает всё подряд: цветы, учеников, иногда Тихона. Борода у него растёт, если он счастлив, — и весной её приходится подстригать.', 'терпеть не может спешку. Если торопить его урок, он нарочно начинает говорить ещё медленнее.', '«Корни глубже, чем кажутся. У всех».', ['assets/staff/moss_water.png', 'assets/staff/moss_sniff.png', 'assets/staff/moss_proud.png']),
  T('bubble', 'potions', 'Мадам Пузырь', 'assets/staff/bubble.png', 'Кругленькая, с огромной рыжей шевелюрой, в толстых очках, фартуке и с колбой в лапе. На плече сидит лягушка.',
    'Её котлы взрываются чаще, чем у всех вместе взятых, но ни один ученик ни разу не пострадал: каждый взрыв она превращает в фейерверк. Волосы стали такими кудрявыми после самого первого взрыва и так и не распрямились.',
    'Нюхает всё, прежде чем попробовать. Лягушку зовут Кваклин — когда-то он был зельем, которое пошло не так.', 'не умеет следовать рецептам и всегда добавляет «щепоточку чего-нибудь интересного».', '«Если не бахнуло — значит, не старались!»', ['assets/staff/bubble_stir.png', 'assets/staff/bubble_sniff.png', 'assets/staff/bubble_proud.png']),
  T('lun', 'stars', 'Звездочёт Лун', 'assets/staff/lun.png', 'Тёмно-синий кот со звёздной шерстью, в остроконечной шляпе, монокле и звёздном плаще.',
    'Единственный, кто видел первую звезду ещё на небе, до её падения. Он знает о той ночи больше, чем говорит, и единственный, кто разговаривает с Тихоном о звезде как о старой знакомой.',
    'Днём спит в шляпе, ночью не спит совсем. Ведёт свою «книгу неба», где записывает каждую новую звезду.', 'рассеянный: может прийти на урок в пижаме — но точно со звёздной картой.', '«Смотри вверх. Там всё уже написано».', ['assets/staff/lun_spyglass.png', 'assets/staff/lun_book.png', 'assets/staff/lun_map.png']),
  T('spark', 'charms', 'Мастер Искра', 'assets/staff/spark.png', 'Изящная кремовая лисичка в тиаре и фиолетовом звёздном платье, с волшебной палочкой и крыльями бабочки.',
    'Бывшая придворная волшебница далёкого королевства. Однажды для забавы оживила королевский портрет — а он влюбился в неё: вздыхал, подмигивал и посылал воздушные поцелуи на всех приёмах, прямо при королеве. Скандал был огромный, и Искра сбежала в школу. Ни разу не пожалела.',
    'Каждое утро колдует себе новую причёску. Учит, что чары должны быть не только сильными, но и красивыми.', 'немного тщеславна: если похвалить её платье, можно получить на экзамене лишнюю минуту.', '«Магия без красоты — просто фокус».', ['assets/staff/spark_star.png', 'assets/staff/spark_polish.png', 'assets/staff/spark_curtsy.png']),
  T('breeze', 'flight', 'Капитан Ветерок', 'assets/staff/breeze.png', 'Усатый сурок-авиатор в шлеме с очками, кожаной куртке с медалями и красном шарфе. На плече — маленькая сова.',
    'Облетел все небеса над холмами и дальше. Медали — за спасения: однажды поймал в воздухе целый класс, который сдуло ветром. Совёнок Пух был его штурманом во всех полётах.',
    'Рассказывает истории о полётах так громко, что ушастики прячутся. Шарф всегда развевается, даже если ветра нет.', 'боится высоты, если стоит на земле. В воздухе — ничего не боится.', '«Эх, вот в наше время крылья были крепче!»', ['assets/staff/breeze_fly1.png', 'assets/staff/breeze_owl.png', 'assets/staff/breeze_proud.png']),
  T('storm', 'elements', 'Госпожа Буря', 'assets/staff/storm.png', 'Белая горностаиха с длинными волосами четырёх цветов — огонь, вода, земля, воздух, — с посохом из стихийных кристаллов, в бирюзовом платье.',
    'Родилась в грозу, в которой все четыре стихии бушевали разом, и с тех пор её волосы меняют цвет от настроения. Строгая, но справедливая — самая требовательная учительница школы.',
    'Когда злится, над её головой собирается маленькая тучка. Когда довольна — вокруг пахнет дождём и цветами.', 'тайно обожает рогатиков за упрямство, но никогда в этом не признается.', '«Стихии не слушаются. С ними договариваются».', ['assets/staff/storm_fire.png', 'assets/staff/storm_leaves.png', 'assets/staff/storm_proud.png']),
  T('owl', 'final', 'Экзаменатор Сова', 'assets/staff/owl.png', 'Седой сова в академической шапочке, с длинной белой бородой, в тёмной мантии с золотой цепью, со свитком и песочными часами.',
    'Принимал экзамены у самого Льва, когда тот был учеником, и до сих пор называет его «тот вежливый мальчик». Помнит каждого выпускника по имени.',
    'Переворачивает песочные часы перед каждым вопросом, хотя никогда на них не смотрит. Ставит оценки длинным пером, которое скрипит.', 'растрогается от любого хорошего ответа — и тогда борода у него дрожит.', '«Экзамен — это урок, который пришёл проверить сам себя».', ['assets/staff/owl_hourglass.png', 'assets/staff/owl_write.png', 'assets/staff/owl_proud.png']),
);
// school staff: the page opens with their building; habits at 100 graduates, the phrase at 500
const W = (id, has, title, img, look, story, habits, weak, quote, ps = []) => P({ id, ch: 'school', title, img, layers: [
  { img, t: 'Как выглядит', x: look, need: (f) => f.has(has), hint: 'когда будет построено это место' },
  { img: ps[0], t: 'История', x: story, need: (f) => f.has(has), hint: 'когда будет построено это место' },
  { img: ps[1], t: 'Привычки', x: habits + '\n\nСлабость: ' + weak, need: (f) => f.has(has) && f.grads >= 100, hint: 'когда школа выпустит 100 учеников' },
  { img: ps[2], t: 'Любимая фраза', x: quote, need: (f) => f.has(has) && f.grads >= 500, hint: 'когда школа выпустит 500 учеников' },
] });
PAGES.push(
  W('paper', 'rec', 'Бумажкина', 'assets/staff/secretary.png', 'Барсучиха в жёлтой вязаной кофте и очках, с карандашом за ухом и стопкой бумаг; рядом летит бумажный самолётик. Секретарь Приёмной.',
    'Записывает каждого новичка с первого дня. Знает имя и день рождения каждого ученика — и никто не понимает, как она всё помнит.',
    'Отправляет записки бумажными самолётиками по всей школе. Самолётики иногда попадают в Тихона.', 'не может выбросить ни одной бумажки: в её шкафах лежат записки за сто лет.', '«Так… имя… угу-м… раса… ага… Добро пожаловать!»', ['assets/staff/sec_write.png', 'assets/staff/sec_carry.png', 'assets/staff/sec_stamp.png']),
  W('bayu', 'dorm', 'Баю-Бая', 'assets/staff/concierge.png', 'Пушистая овечка в розовом ночном колпаке и халате, в тапочках-зайчиках, со связкой ключей и свечой. На колпаке дремлет крошечная сова. Консьержка Спальни.',
    'Охраняет сон всей школы. Колыбельные поёт так, что засыпает даже Звездочёт Лун — хотя он ночами вообще не спит.',
    'Ходит по спальне со свечой и поправляет одеяла. Знает, какой ученик храпит, а какой разговаривает во сне.', 'сама вечно зевает и может уснуть стоя посреди разговора.', '«Тише-тише… ТИШЕ, ГОВОРЮ!»', ['assets/staff/con_key.png', 'assets/staff/con_walk.png', 'assets/staff/con_yawn.png']),
  W('zakl', 'lib', 'Закладкин', 'assets/staff/lib_read.png', 'Ёжик в очках, длинном полосатом шарфе и вязаном свитере, всегда с горой книг в лапах. Библиотекарь.',
    'Прочитал каждую книгу в библиотеке, некоторые по три раза. Единственный, кому Тихон даёт читать старые страницы летописи.',
    'На иголках носит закладки. Если книгу долго не возвращают, он лично приходит и смотрит. Молча. Очень долго.', 'стесняется громко говорить и шепчет, даже когда кричит «пожар!».', '«А? Простите… я увлёкся… Что вы сказали?»', ['assets/staff/lib_shelve.png', 'assets/staff/lib_carry.png', 'assets/staff/lib_shh.png']),
  W('ugolek', 'cant', 'Уголёк', 'assets/staff/cook_stir.png', 'Маленький мятный дракончик в поварском колпаке и фартуке, с поварёшкой и кастрюлей. Повар Столовой.',
    'Вылупился из яйца, найденного в лесу, прямо на кухне школы — и с тех пор оттуда не уходил. Огнём подогревает суп и никогда не пользуется печью.',
    'Пробует всё, что готовит, поэтому иногда к обеду готовит заново. Знает любимое блюдо каждого ученика.', 'когда чихает, суп превращается в жаркое.', '«Сытый маг — счастливый маг!»', ['assets/staff/cook_fire.png', 'assets/staff/cook_taste.png', 'assets/staff/cook_give.png']),
  W('hitrovan', 'shop', 'Господин Хитрован', 'assets/staff/fox_give.png', 'Рыжий лис в котелке и жилетке с цепочкой часов, всегда с конфетой в лапе. Хозяин Лавки.',
    'Странствующий торговец: пришёл в школу с тележкой сладостей и остался, потому что ученики скупили всё за один день.',
    'Полирует прилавок до блеска и знает, кто какие сладости любит. Иногда даёт конфету в долг — но всё записывает.', 'хитрый, но добрый: не может отказать грустному ученику и отдаёт сладость бесплатно.', '«Сладкое — лучшее заклинание от грусти!»', ['assets/staff/fox_carry.png', 'assets/staff/fox_polish.png', 'assets/staff/fox_coins.png']),
);
const CHAPTERS = [['world', '🏰', 'Мир'], ['races', '🌸', 'Расы'], ['teachers', '🧙', 'Учителя'], ['school', '📖', 'Школа']];

// ---- progress
function facts() {
  const f = A.facts();
  return { ...f, rank: (sp, rk) => Object.keys(f.forms).some((k) => k.startsWith(sp + ':') && +k.split(':')[1] >= rk && f.forms[k].seen),
    master: (sp) => Object.keys(f.forms).some((k) => k.startsWith(sp + ':5') && f.forms[k].seen) };
}
const openN = (p, f) => p.layers.filter((l) => !l.need || l.need(f)).length;
const LS = () => { const s = S(); return (s.lore ||= { seen: {} }); };
const unread = (f = facts()) => PAGES.reduce((n, p) => n + (openN(p, f) > (LS().seen[p.id] || 0) ? 1 : 0), 0);
export const badge = () => (S() && A.on() ? unread() : 0);

// ---- view
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const para = (t) => esc(t).split('\n\n').map((x) => `<p>${x}</p>`).join('');
function pic(p, locked) { return p.img ? `<img class="lo-pic${locked ? ' lock' : ''}" src="${p.img}" alt="">` : `<span class="lo-ico">${p.icon || '📜'}</span>`; }
function listHtml(f) {
  const tabs = CHAPTERS.map(([k, ic, nm]) => { const n = PAGES.filter((p) => p.ch === k && openN(p, f) > (LS().seen[p.id] || 0)).length;
    return `<button class="lo-tab${k === chap ? ' on' : ''}" data-lochap="${k}">${ic} ${nm}${n ? `<span class="lo-dot">${n}</span>` : ''}</button>`; }).join('');
  const cards = PAGES.filter((p) => p.ch === chap).map((p) => { const n = openN(p, f), all = p.layers.length, fresh = n > (LS().seen[p.id] || 0);
    if (!n) return `<div class="lo-card locked">${pic(p, true)}<div class="lo-ct"><b>???</b><small>🔒 Откроется, ${esc(p.layers[0].hint || '')}</small></div></div>`;
    return `<button class="lo-card" data-lopage="${p.id}">${pic(p)}<div class="lo-ct"><b>${esc(p.title)}</b>${p.sub ? `<i>${esc(p.sub)}</i>` : ''}<small>Открыто ${n} из ${all}</small></div>${fresh ? '<span class="lo-new">новое</span>' : ''}</button>`; }).join('');
  return `<div class="lo-tabs">${tabs}</div><div class="lo-list">${cards}</div>`;
}
function pageHtml(p, f) {
  const n = openN(p, f), secs = p.layers.map((l, k) => (k < n || !l.need || l.need(f))
    ? l.riddle ? `<div class="lo-sec riddle"><h4>🔎 ${esc(l.t)}</h4>${para(l.x)}<div class="lo-lines">${[1, 2, 3, 4, 5].map((n) => `<div class="lo-line">${n}. <span>· · · строка ещё не найдена · · ·</span></div>`).join('')}</div><div class="lo-cnt">Найдено строк: 0 из 5</div></div>`
    : `<div class="lo-sec${l.wide ? ' wide' : ''}">${l.img && l.wide ? `<img class="lo-ill" src="${l.img}" alt="" onerror="this.remove()">` : ''}<h4>${esc(l.t)}</h4>${l.img && !l.wide ? `<img class="lo-pose ${k % 2 ? 'l' : 'r'}" src="${l.img}" alt="" onerror="this.remove()">` : ''}${para(l.x)}<div class="lo-clr"></div></div>${k < p.layers.length - 1 ? '<div class="lo-orn">✦ ❧ ✦</div>' : ''}`
    : `<div class="lo-sec locked"><h4>🔒 ${esc(l.t)}</h4><p>Откроется, ${esc(l.hint || '')}.</p></div>`).join('');
  return `<button class="lo-back" data-loback>‹ Назад</button><div class="lo-head">${pic(p)}<div><h3>${esc(p.title)}</h3>${p.sub ? `<i>${esc(p.sub)}</i>` : ''}</div></div>${secs}`;
}
function html() {
  const f = facts(), body = page ? pageHtml(PAGES.find((p) => p.id === page), f) : listHtml(f);
  return `<div id="lore"><div class="lo-top"><h2>📜 Летопись Мотыльковых холмов</h2><button class="lo-x" data-loclose>✕</button></div>
    <div class="lo-sub">${page ? '' : 'Записи летописца Тихона. Новые страницы открываются, пока растёт твоя школа.'}</div><div class="lo-body">${body}</div></div>`;
}
const el = (h) => { const d = document.createElement('div'); d.innerHTML = A.emojiHtml(h); return d.firstElementChild; };
function redraw() { if (!root) return; const st = root.querySelector('.lo-body')?.scrollTop || 0, n = el(html()); root.replaceWith(n); root = n; root.addEventListener('click', onClick); if (!page) root.querySelector('.lo-body').scrollTop = st; }
function css() {
  if (document.getElementById('lore-css')) return;
  const s = document.createElement('style'); s.id = 'lore-css';
  s.textContent = `
#lore { position: fixed; inset: 0; z-index: 18; display: flex; flex-direction: column; align-items: center; background: linear-gradient(#f6ecd6, #efe0c4); color: #3d2f22;
  padding: calc(var(--safe-t, 0px) + 8px) 12px calc(var(--safe-b, 0px) + 10px); font-family: ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif; }
#lore .lo-top, #lore .lo-sub, #lore .lo-body { width: 100%; max-width: 480px; }
#lore .lo-top { display: flex; align-items: center; gap: 8px; }
#lore .lo-top h2 { margin: 0; flex: 1; font-size: 19px; font-family: Georgia, "Times New Roman", serif; color: #5a3b1c; }
#lore .lo-x { width: 40px; height: 40px; border-radius: 14px; background: #fff8eaee; box-shadow: 0 3px 0 #d8c29a; font: 800 18px inherit; color: #7a5528; border: 0; }
#lore .lo-sub { font-size: 13px; color: #8a6f4c; margin: 4px 0 6px; }
#lore .lo-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 12px; }
#lore .lo-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; padding-top: 9px; }   /* her phone shot: the tab badges were cut at the top of the scroll area */
#lore .lo-tab { position: relative; border: 0; border-radius: 12px; padding: 7px 10px; background: #fff7e6; color: #6b4a22; font: 800 13.5px inherit; box-shadow: 0 2px 0 #dcc49a; }
#lore .lo-tab.on { background: #7a5528; color: #fff7e6; box-shadow: 0 2px 0 #4f3417; }
#lore .lo-dot { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; border-radius: 9px; background: #e0245e; color: #fff; font-size: 11px; line-height: 18px; }
#lore .lo-list { display: flex; flex-direction: column; gap: 8px; }
#lore .lo-card { position: relative; display: flex; align-items: center; gap: 10px; text-align: left; border: 0; border-radius: 16px; padding: 8px 10px; background: #fffaf0; box-shadow: 0 2px 0 #e2cfa9; color: inherit; font: inherit; }
#lore .lo-card.locked { opacity: .75; background: #f3e8d2; }
#lore .lo-card b { display: block; font-size: 15.5px; font-family: Georgia, serif; }
#lore .lo-card i { display: block; font-size: 12.5px; color: #8a6f4c; }
#lore .lo-card small { display: block; font-size: 12px; color: #9a7f5c; margin-top: 2px; }
#lore .lo-new { position: absolute; right: 10px; top: 8px; background: #e0245e; color: #fff; border-radius: 8px; font-size: 11px; font-weight: 800; padding: 1px 6px; }
#lore .lo-pic { width: 58px; height: 58px; object-fit: contain; flex: none; }
#lore .lo-pic.lock { filter: brightness(0) opacity(.35); }
#lore .lo-ico { width: 58px; height: 58px; flex: none; display: flex; align-items: center; justify-content: center; font-size: 34px; }
#lore .lo-ico img { width: 38px; height: 38px; }
#lore .lo-back { border: 0; background: none; color: #7a5528; font: 800 15px inherit; padding: 4px 0 8px; }
#lore .lo-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
#lore .lo-head .lo-pic { width: 96px; height: 96px; }
#lore .lo-head h3 { margin: 0; font-size: 21px; font-family: Georgia, serif; color: #5a3b1c; }
#lore .lo-head i { color: #8a6f4c; }
#lore .lo-sec { background: #fffaf0; border-radius: 14px; padding: 8px 12px; margin: 8px 0; box-shadow: 0 2px 0 #e9d8b6; }
#lore .lo-sec h4 { margin: 2px 0 4px; font-size: 14px; color: #7a5528; text-transform: uppercase; letter-spacing: .04em; }
#lore .lo-sec p { margin: 4px 0; font-size: 15px; line-height: 1.5; font-family: Georgia, "Times New Roman", serif; }
#lore .lo-sec.locked { background: #f1e5cc; color: #9a7f5c; }
#lore .lo-ill { display: block; width: calc(100% + 24px); margin: -8px -12px 8px; border-radius: 14px 14px 6px 6px; height: auto; max-height: 62vh; object-fit: cover; }
#lore .lo-pose { width: 38%; max-height: 170px; object-fit: contain; margin: 2px 0 4px; }
#lore .lo-pose.r { float: right; margin-left: 8px; } #lore .lo-pose.l { float: left; margin-right: 8px; }
#lore .lo-clr { clear: both; }
#lore .lo-sec:not(.locked) > p:first-of-type::first-letter { float: left; font-size: 2.6em; line-height: .9; margin: 4px 6px 0 0; color: #8a3f1c; font-family: Georgia, serif; font-weight: 700; }
#lore .lo-sec.riddle { background: #fff3dc; border: 2px dashed #c9a46a; }
#lore .lo-line { font-family: Georgia, serif; font-size: 14.5px; color: #8a6f4c; padding: 5px 0; border-bottom: 1px dotted #d9c19a; }
#lore .lo-line span { color: #b9a17c; font-style: italic; }
#lore .lo-cnt { margin-top: 6px; font-weight: 800; color: #7a5528; font-size: 13.5px; }
#lore .lo-orn { text-align: center; color: #b8925a; letter-spacing: .4em; font-size: 13px; margin: 2px 0; }
#lore .lo-sec.locked p { font-family: inherit; font-size: 13.5px; }
body.lore-open #fx .toast { display: none; }
`;
  document.head.appendChild(s);
}
// ---- the book's own melody (her «Хочу новую мелодию когда открываешь книгу лора. Напиши сама бесплатно»): a page rustle, then a
// gentle music-box waltz in D major (~7 s) over a soft low drone; Web Audio synth, no files. Level measured offline (tools/_wk).
export const LORE_DB = -3;
export function loreTune(c, out, t0) {
  const nz = c.createBuffer(1, Math.round(c.sampleRate * 0.5), c.sampleRate), d = nz.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const ns = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain(); ns.buffer = nz; bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8; ng.gain.value = 0.18;
  ns.connect(bp); bp.connect(ng); ng.connect(out); ns.start(t0);   // the page turns
  const bell = (f, t, dur, v) => { for (const [m, a] of [[1, 1], [2.01, 0.32], [3.98, 0.12]]) { const o = c.createOscillator(), g = c.createGain(); o.type = m === 1 ? 'triangle' : 'sine'; o.frequency.value = f * m;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * a, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (m === 1 ? 1 : 0.5)); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); } };
  const N = (n) => 440 * Math.pow(2, (n - 69) / 12), b = 0.36;   // midi -> Hz, beat 0.36 s (gentle waltz)
  const mel = [[69, 0, 1], [74, 1, 1], [78, 2, 1], [81, 3, 2], [79, 5, 1], [78, 6, 1], [76, 7, 1], [74, 8, 2], [76, 10, 1], [78, 11, 1], [79, 12, 1], [83, 13, 2], [81, 15, 1], [78, 16, 1.5], [86, 17.5, 3]];
  for (const [n, at, len] of mel) bell(N(n), t0 + 0.35 + at * b, Math.max(0.8, len * b * 2.2), 0.11);
  for (const [n, at] of [[50, 0], [57, 3], [55, 6], [57, 9], [55, 12], [57, 15], [62, 17.5]]) bell(N(n), t0 + 0.35 + at * b, 1.6, 0.05);   // soft bass notes on the bars
  const pad = c.createOscillator(), pg = c.createGain(), lp = c.createBiquadFilter(); pad.type = 'sine'; pad.frequency.value = N(38); lp.type = 'lowpass'; lp.frequency.value = 300;
  pg.gain.setValueAtTime(0.0001, t0); pg.gain.linearRampToValueAtTime(0.05, t0 + 1.2); pg.gain.linearRampToValueAtTime(0.0001, t0 + 7.6); pad.connect(lp); lp.connect(pg); pg.connect(out); pad.start(t0); pad.stop(t0 + 7.8);
}
function tune() { const a = A.audioOut && A.audioOut(); if (!a) return; try { const g = a.c.createGain(); g.gain.value = Math.pow(10, LORE_DB / 20); g.connect(a.out); loreTune(a.c, g, a.c.currentTime + 0.02); } catch (e) { /* never break the game for a sound */ } }
export function open() { if (root || !S() || !A.on()) return; css(); page = null; root = el(html()); document.body.appendChild(root); root.addEventListener('click', onClick); document.body.classList.add('lore-open'); tune(); }
export function close() { if (!root) return; root.remove(); root = null; document.body.classList.remove('lore-open'); A.save(); A.onClose && A.onClose(); }
function onClick(e) {
  const t = e.target.closest('[data-lochap],[data-lopage],[data-loback],[data-loclose]'); if (!t) return;
  const d = t.dataset;
  if (d.loclose !== undefined) close();
  else if (d.loback !== undefined) { page = null; redraw(); }
  else if (d.lochap) { chap = d.lochap; page = null; redraw(); }
  else if (d.lopage) { page = d.lopage; const p = PAGES.find((q) => q.id === page); LS().seen[page] = Math.max(LS().seen[page] || 0, openN(p, facts())); A.save(); redraw(); root.querySelector('.lo-body').scrollTop = 0; }
}
export function initLore(api) {
  A = api;
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-lore]')) open(); });
  const reg = () => {
    if (!window.schoolMenu) { setTimeout(reg, 50); return; }
    if (!A.on()) return;
    window.schoolMenu.add({ attr: 'data-lore', icon: '📜', label: 'Летопись', sub: () => { if (!S()) return ''; const n = unread(); return n ? `новых: ${n}` : ''; }, badge: () => badge() });
  };
  setTimeout(reg, 0);
  window.__lore = { open, close, PAGES, facts, unread, loreTune, LORE_DB };
  return { open, close, badge, isOpen: () => !!root };
}
