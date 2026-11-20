// Checks the server chases exactly like the game (v0.60, 0042): from every tile of every enemy's place to tiles
// around it (up to 7 away), game.enemy_chase must give the same route as enemyChase. Needs a Postgres with the
// migrations (the local test database). Run: npx vite-node scripts/chase-parity.ts
import { PIGEON_TILES, RAT_ZONES, ROAMS, THUG_TILES } from '../src/game/enemies';
import { gi } from '../src/street/map';
import { enemyChase, walkMasks } from '../src/street/sight';
declare const require: (m: string) => { execSync(c: string, o: object): { toString(): string } };
const { execSync } = require('node:child_process');
const m = walkMasks();
const starts = [...THUG_TILES, ...RAT_ZONES.flat(), ...Object.values(ROAMS).flatMap((r) => r.tiles), ...PIGEON_TILES.filter((_, i) => i % 7 === 0)];
const cases: [number, number, number, number][] = [];
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const [x, y] of starts)
  for (let k = 0; k < 4; k++) {
    const tx = x + Math.round((rnd() - 0.5) * 14), ty = y + Math.round((rnd() - 0.5) * 14);
    if ((tx !== x || ty !== y) && tx >= 0 && ty >= 0 && tx < 160 && ty < 129 && m[gi(tx, ty)]) cases.push([x, y, tx, ty]);
  }
const sql = `select c.a, c.b, c.c, c.d, game.enemy_chase(c.a, c.b, c.c, c.d)::text from (values ${cases.map((c) => `(${c.join(',')})`).join(',')}) c(a, b, c, d);`;
const out = execSync(`psql -h /tmp/pgtest -p 5499 -U postgres t -At -F'|'`, { input: sql, maxBuffer: 1e9 }).toString().trim().split('\n');
let bad = 0, stuck = 0;
out.forEach((line, i) => {
  const [a, b, c, d] = cases[i];
  const got = JSON.parse(line.split('|')[4]);
  const want = enemyChase(m, [a, b], [c, d]);
  if (!want.reached) stuck++;
  if (JSON.stringify(got.route) !== JSON.stringify(want.route) || got.reached !== want.reached) if (bad++ < 5) console.log('differs', cases[i], got, want);
});
console.log('cases', cases.length, 'stuck', stuck, 'bad', bad);
