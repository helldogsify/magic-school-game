// Calibrates the star thresholds of the match-3 mini-game: bots play 90 s rounds with the real board logic of js/minigame.js.
// Move time = think time + animations (swap 0.14 s, each resolve step ~0.2 s clear + ~0.3 s fall).
import { makeBoard, resolveStep, allMoves, points, newTile, ING } from '../js/minigame.js';
const N = 7, T = ING.length;
function play(skill, think) {
  const g = makeBoard(); let time = 90, score = 0, brewed = 0, moves = 0;
  const newRec = (n) => { const ts = []; while (ts.length < 3) { const t = Math.floor(Math.random() * T); if (!ts.includes(t)) ts.push(t); } const base = 8 + Math.min(8, n * 2); return ts.map((t, k) => ({ t, n: base - k * 2, got: 0 })); };
  let rec = newRec(0);
  while (time > 0) {
    const ms = allMoves(g); if (!ms.length) { const f = makeBoard(); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g[r][c] = f[r][c]; continue; }
    let mv;
    if (Math.random() < skill) {   // greedy: try each move on a copy, keep the one that clears most in the first step
      let best = -1;
      for (const m of ms) { const cp = g.map((row) => row.map((x) => ({ ...x }))); const [a, b] = m; const t = cp[a[0]][a[1]]; cp[a[0]][a[1]] = cp[b[0]][b[1]]; cp[b[0]][b[1]] = t; const res = resolveStep(cp, m); const v = res ? res.clear.length + res.make.length * 3 : 0; if (v > best) { best = v; mv = m; } }
    } else mv = ms[Math.floor(Math.random() * ms.length)];
    const [a, b] = mv; const t = g[a[0]][a[1]]; g[a[0]][a[1]] = g[b[0]][b[1]]; g[b[0]][b[1]] = t;
    let chain = 0, steps = 0;
    for (;;) {
      const res = resolveStep(g, chain === 0 ? mv : null); if (!res) break;
      score += points(res.value, chain, res.make.length, res.fired, res.ess);
      for (const [r, c] of res.clear) { const x = g[r][c]; if (x.t >= 0) for (const q of rec) if (q.t === x.t) q.got += [0, 1, 2, 3][x.lv || 1]; }
      if (rec.every((q) => q.got >= q.n)) { score += 300 + 150 * brewed; brewed++; rec = newRec(brewed); }
      for (const [r, c] of res.clear) g[r][c] = null;
      for (const m of res.make) { g[m.r][m.c] = newTile(m.t, m.sp); if (m.lv) g[m.r][m.c].lv = m.lv; }
      for (let c = 0; c < N; c++) { let w = N - 1; for (let r = N - 1; r >= 0; r--) if (g[r][c]) { const x = g[r][c]; g[r][c] = null; g[w][c] = x; w--; } for (let r = w; r >= 0; r--) g[r][c] = newTile(Math.floor(Math.random() * T)); }
      chain++; steps++;
    }
    moves++; time -= think + 0.14 + steps * 0.5;
  }
  return { score, brewed, moves };
}
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
for (const [name, skill, think] of [['casual (random, 2.5 s)', 0, 2.5], ['average (50% greedy, 1.8 s)', 0.5, 1.8], ['good (greedy, 1.2 s)', 1, 1.2], ['fast (greedy, 0.8 s)', 1, 0.8]]) {
  const runs = Array.from({ length: 300 }, () => play(skill, think));
  const sc = runs.map((r) => r.score);
  console.log(name.padEnd(30), 'p25', pct(sc, 0.25), 'p50', pct(sc, 0.5), 'p75', pct(sc, 0.75), 'p95', pct(sc, 0.95), 'moves', pct(runs.map((r) => r.moves), 0.5), 'potions', pct(runs.map((r) => r.brewed), 0.5));
}
