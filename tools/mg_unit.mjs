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
console.log(ok + ' ok, ' + bad + ' failed');
