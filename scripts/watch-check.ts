// Lists the test moments (out of 400) when the bartender / the guard sees you, according to the browser's code.
// Compare with the same query on the server (see the SQL printed below): both lists must be identical.
import { bartenderAt, guardAt, inBeam } from '../src/game/watchers';
const t0 = 1794830000000;
const bar: number[] = [];
const guard: number[] = [];
for (let i = 0; i < 400; i++) {
  const t = t0 + i * 1777;
  const x = 36 + (i % 8);
  const y = 20 + (i % 9);
  if (bartenderAt(t).sees) bar.push(i);
  if (inBeam(guardAt(t), x + 0.5, y + 0.5)) guard.push(i);
}
console.log('bar:', bar.join(','));
console.log('guard:', guard.join(','));
