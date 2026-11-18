// Checks the server works out the roaming enemies' walks exactly like the game (v0.58, 0041): every pair of tiles in
// every enemy's place, and positions over time. Needs a Postgres with the migrations (the local test database).
// Run: npx vite-node scripts/roam-parity.ts
import { RAT_ZONES, ROAMS, THUG_PATCHES, ENEMIES, enemyAt } from '../src/game/enemies';
import { allDetours } from '../src/game/roamPaths';
declare const require: any;
const { execSync } = require('node:child_process');
const psql = (q: string) => execSync(`psql -h /tmp/pgtest -p 5499 -U postgres t -At -F'|'`, { input: q, maxBuffer: 1e9 }).toString().trim();
const det = allDetours();
const places = [...THUG_PATCHES, ...RAT_ZONES, ...Object.values(ROAMS).map((r) => r.tiles)];
let bad = 0, pairs = 0;
for (const pl of places) {
  const px = `array[${pl.map((p) => p[0])}]`, py = `array[${pl.map((p) => p[1])}]`;
  const out = psql(`select a.i, b.i, r.xs, r.ys from generate_series(1, ${pl.length}) a(i), generate_series(1, ${pl.length}) b(i),
    lateral game.roam_bends(${px}, ${py}, 1, ${pl.length}, (${px})[a.i], (${py})[a.i], (${px})[b.i], (${py})[b.i]) r where a.i <> b.i and r.xs is not null;`);
  const got = new Map<string, string>();
  for (const l of out ? out.split('\n') : []) { const [i, j, xs, ys] = l.split('|'); got.set(`${i},${j}`, `${xs}|${ys}`); }
  pl.forEach((a, i) => pl.forEach((b, j) => {
    if (i === j) return; pairs++;
    const w = det.get(`${a[0]},${a[1]},${b[0]},${b[1]}`);
    const want = w ? `{${w.map((p) => p[0])}}|{${w.map((p) => p[1])}}` : undefined;
    if (got.get(`${i + 1},${j + 1}`) !== want) { if (bad++ < 5) console.log('pair', a, b, 'want', want, 'got', got.get(`${i + 1},${j + 1}`)); }
  }));
}
console.log('pairs', pairs, 'detours', det.size, 'bad', bad);
// positions
const qs: string[] = []; const exp: string[] = [];
for (const e of ENEMIES) if (e.kind !== 'pigeon') for (let i = 0; i < 150; i++) {
  const t = 1763000000000 + i * 337 + e.index * 17;
  const p = enemyAt(e.kind, e.index, t);
  qs.push(`select '${e.id}', ${t}, round(w.x::numeric, 4), round(w.z::numeric, 4) from game.enemy_at('${e.kind}', ${e.index}, ${t}) w`);
  exp.push(`${e.id}|${t}|${p.x.toFixed(4)}|${p.z.toFixed(4)}`);
}
const got = new Set(psql(qs.join(' union all ') + ';').split('\n').map((l: string) => l.split('|').map((v, i) => (i < 2 ? v : Number(v).toFixed(4))).join('|')));
let pb = 0; for (const e of exp) if (!got.has(e)) { if (pb++ < 5) console.log('pos', e); }
console.log('positions', exp.length, 'bad', pb);
