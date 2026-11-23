"""Image standard of «Школа магии» (Maria 2026-11-23: «Оптимизируй картинки. Сделай все легче без ощутимой потери качества и
сделай это стандартом проекта»).

Every PNG under assets/ (except the tiny Twemoji in assets/emoji) gets a WebP sibling with the same name: quality 90, lossless
alpha, method 4 — 4-5x lighter, no visible difference (checked by eye on the worst files; colour PSNR >= 30 dB on all).
The code keeps using the .png URLs: the service worker (sw.js) serves the .webp sibling when it exists.

usage:
  python tools/img_opt.py              convert every PNG whose .webp is missing or older; print the saving
  python tools/img_opt.py FILE.png...  convert only these
  python tools/img_opt.py --check      list PNGs without an up-to-date .webp (exit 1 if any)
The pre-commit hook (tools/hooks/pre-commit, copied into .git/hooks/pre-commit) runs `img_opt.py --staged` on staged PNGs and
stages their .webp in the same commit; it never blocks a commit.
"""
import os, sys, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = ('assets/emoji',)
Q = 90

def wanted(rel):
    rel = rel.replace('\\', '/')
    return rel.startswith('assets/') and rel.lower().endswith('.png') and not rel.startswith(SKIP_DIRS)

def all_pngs():
    for root, _, files in os.walk(os.path.join(ROOT, 'assets')):
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), ROOT).replace('\\', '/')
            if wanted(rel): yield rel

def stale(rel):
    src = os.path.join(ROOT, rel); dst = src[:-4] + '.webp'
    return not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src)

def convert(rel):
    src = os.path.join(ROOT, rel); dst = src[:-4] + '.webp'
    im = Image.open(src); im.load()
    im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA', 'PA') or 'transparency' in im.info else im.convert('RGB')
    b = io.BytesIO(); im.save(b, 'WEBP', quality=Q, method=4, alpha_quality=100)
    open(dst, 'wb').write(b.getvalue())
    return os.path.getsize(src), b.tell()

def convert_staged(rel):   # the PNG as it is in the git index (what is being committed) -> WebP next to it, staged too
    import subprocess
    data = subprocess.run(['git', 'show', ':' + rel], cwd=ROOT, capture_output=True, check=True).stdout
    im = Image.open(io.BytesIO(data)); im.load()
    im = im.convert('RGBA') if im.mode in ('P', 'LA', 'RGBA', 'PA') or 'transparency' in im.info else im.convert('RGB')
    dst = rel[:-4] + '.webp'; b = io.BytesIO(); im.save(b, 'WEBP', quality=Q, method=4, alpha_quality=100)
    open(os.path.join(ROOT, dst), 'wb').write(b.getvalue())
    subprocess.run(['git', 'add', '--', dst], cwd=ROOT, check=True)
    return len(data), b.tell()

def main(argv):
    if argv and argv[0] == '--staged':
        a = b = 0; n = 0
        for r in argv[1:]:
            r = r.replace('\\', '/')
            if not wanted(r): continue
            x, y = convert_staged(r); a += x; b += y; n += 1
        if n: print(f'img_opt (pre-commit): {n} PNG -> WebP staged, {a / 1e6:.1f} MB -> {b / 1e6:.1f} MB')
        return 0
    if argv and argv[0] == '--check':
        bad = [r for r in all_pngs() if stale(r)]
        for r in bad: print('no webp:', r)
        return 1 if bad else 0
    todo = [a.replace('\\', '/') for a in argv] if argv else [r for r in all_pngs() if stale(r)]
    todo = [os.path.relpath(os.path.abspath(t), ROOT).replace('\\', '/') if os.path.isabs(t) or os.path.exists(t) else t for t in todo]
    todo = [t for t in todo if wanted(t) and os.path.exists(os.path.join(ROOT, t))]
    a = b = 0
    for r in todo:
        x, y = convert(r); a += x; b += y
    if todo: print(f'img_opt: {len(todo)} PNG -> WebP, {a / 1e6:.1f} MB -> {b / 1e6:.1f} MB ({100 * (1 - b / max(a, 1)):.0f}% lighter)')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
