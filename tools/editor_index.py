# Room editor palette: writes layouts/sprites.json = every committed sprite under assets/parts, grouped by folder.
# Run in game/ after adding sprites: python tools/editor_index.py   (textures, night glass and wall-texture files are left out)
import json, re, subprocess
NAMES = {'items': 'Предметы классов', 'herbs': 'Травология', 'potions': 'Зельеварение', 'stars': 'Звездочётство', 'charms': 'Чары',
         'flight': 'Полёты', 'elements': 'Стихии', 'final': 'Экзамен', 'library': 'Библиотека', 'library_v1': 'Библиотека (старая)',
         'reception': 'Приёмная', 'dorm': 'Спальня', 'canteen': 'Столовая', 'shop': 'Лавка', 'tower': 'Башня', 'director': 'Директор',
         'outdoor': 'Двор', 'corridor': 'Коридор', 'gate': 'Ворота', 'rugs': 'Ковры', 'annals': 'Летопись', 'throne': 'Тронный зал',
         'cells': 'Кельи', 'cave': 'Пещера', 'corridor_w2': 'Коридор мира 2', 'feast': 'Пир', 'forge': 'Кузня', 'gems': 'Самоцветы',
         'gemshop': 'Самоцветная лавка', 'guards': 'Стража', 'keepers': 'Хранители', 'lake': 'Озеро', 'mine': 'Шахта', 'oath': 'Палата клятв', 'runes': 'Руны'}
ORDER = ['items', 'herbs', 'potions', 'stars', 'charms', 'flight', 'elements', 'final', 'library', 'reception', 'dorm', 'canteen', 'shop',
         'tower', 'director', 'outdoor', 'corridor', 'gate', 'rugs']
SKIP = re.compile(r'(^|_)(wall|floor|water|grass|ground|path|sky)$|_night$|^lk_water$')
files = subprocess.run(['git', 'ls-files', 'assets/parts'], capture_output=True, text=True, check=True).stdout.split()
groups = {}
for f in files:
    m = re.match(r'assets/parts/([^/]+)/([^/]+)\.webp$', f)
    if not m or SKIP.search(m.group(2)): continue
    groups.setdefault(m.group(1), []).append(m.group(2))
keys = [k for k in ORDER if k in groups] + sorted(k for k in groups if k not in ORDER)
out = {'groups': [{'id': k, 'name': NAMES.get(k, k), 'list': sorted(groups[k])} for k in keys]}
open('layouts/sprites.json', 'w', encoding='utf-8', newline='\n').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print(sum(len(g['list']) for g in out['groups']), 'sprites in', len(keys), 'groups')
