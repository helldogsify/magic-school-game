// Unit checks of the match-3 logic: line, bomb, rainbow specials and special combos.
import { resolveStep, findGroups, newTile } from '../js/minigame.js';
const N = 7;
// board from strings: digits = types, '*' = rainbow (-1); suffix via map {r,c:sp}
function B(rows, sp = {}) { return rows.map((row, r) => [...row].map((ch, c) => { const t = newTile(ch === '*' ? -1 : +ch, sp[r + ',' + c] || null); return t; })); }
const base = ['0123450', '1234501', '2345012', '3450123', '4501234', '5012345', '0123450'];
let ok = 0, bad = 0; const chk = (name, cond) => { (cond ? ok++ : bad++); console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name); };
// 4 in a row -> line special
{ const g = B(['0000123', ...base.slice(1)]); const res = resolveStep(g, [[0, 3], [1, 3]]); chk('4 in row makes line h', res.make.length === 1 && res.make[0].sp === 'h' && res.clear.length === 4); }
// 5 in a row -> rainbow
{ const g = B(['0000023', ...base.slice(1)]); const res = resolveStep(g, null); chk('5 in row makes rainbow', res.make.length === 1 && res.make[0].t === -1); }
// L shape -> bomb
{ const rows = ['0001234', '0123450', '0234501', ...base.slice(3)]; const g = B(rows); const gr = findGroups(g); chk('L makes bomb', gr.some((x) => x.make === 'b')); }
// line special fires its row
{ const g = B(['1112345', ...base.slice(1)], { '0,0': 'h' }); const res = resolveStep(g, null); chk('line h clears whole row (>=7)', res.clear.length >= 7 && res.fired >= 1); }
// rainbow swapped with type 2 clears all 2s
{ const g = B(base); g[3][3] = newTile(-1); const n2 = g.flat().filter((t) => t.t === 2).length; const res = resolveStep(g, [[3, 3], [3, 4]]); chk('rainbow clears all of swapped type', res.clear.length === n2 + 1); }
// two specials swapped fire both
{ const g = B(base, { '2,2': 'h', '2,3': 'v' }); const res = resolveStep(g, [[2, 2], [2, 3]]); chk('special+special fires both (row+col = 13+)', res.clear.length >= 13); }
// rainbow + rainbow clears board
{ const g = B(base); g[0][0] = newTile(-1); g[0][1] = newTile(-1); const res = resolveStep(g, [[0, 0], [0, 1]]); chk('rainbow+rainbow clears all 49', res.clear.length === 49); }
// build 354 combos
{ const g = B(base, { '2,2': 'h', '2,3': 'v' }); const res = resolveStep(g, [[2, 2], [2, 3]]); chk('line+line = cross (13), combo x', res.combo === 'x' && res.clear.length >= 13); }
{ const g = B(base, { '3,2': 'b', '3,3': 'h' }); const res = resolveStep(g, [[3, 2], [3, 3]]); chk('bomb+line = 3-wide cross (>=33), combo x3', res.combo === 'x3' && res.clear.length >= 33); }
{ const g = B(base, { '3,2': 'b', '3,3': 'b' }); const res = resolveStep(g, [[3, 2], [3, 3]]); chk('bomb+bomb = 5x5 (25), combo b5', res.combo === 'b5' && res.clear.length >= 25); }
{ const g = B(['1112345', ...base.slice(1)], { '0,0': 'h' }); const res = resolveStep(g, null); chk('fired line gives an fx beam', res.fx.some((f) => f.k === 'h' && f.r === 0)); }
// tiers (tester wish): a swap-made plain 3 leaves the next tier on the swap cell; a 3 with tier 3 = essence
{ const g = B(['0002345', '1213451', ...base.slice(2)]); const res = resolveStep(g, [[1, 2], [0, 2]]); chk('swap 3 makes tier 2 on the swap cell', res.make.length === 1 && res.make[0].lv === 2 && res.make[0].r === 0 && res.make[0].c === 2); }
{ const g = B(['0002345', '1213451', ...base.slice(2)]); g[0][0].lv = 2; const res = resolveStep(g, [[1, 2], [0, 2]]); chk('tier 2 in the 3 makes tier 3', res.make[0] && res.make[0].lv === 3); }
{ const g = B(['0002345', '1213451', ...base.slice(2)]); g[0][1].lv = 3; const res = resolveStep(g, [[1, 2], [0, 2]]); chk('tier 3 in the 3 = essence, no tile', res.ess === 1 && res.make.length === 0); }
{ const g = B(['0002345', '1213451', ...base.slice(2)]); const res = resolveStep(g, null); chk('cascade 3 makes no tier', res.make.length === 0); }
console.log(ok + ' ok, ' + bad + ' failed');
