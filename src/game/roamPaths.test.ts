// The server walks the same detours as the game (v0.54): 0037_bigger_map.sql holds exactly the rows roamPaths.ts
// works out (0036 had them first; the sewer's moved down since).
import { expect, test } from 'vitest';
import { enemyAt, THUG_TILES } from './enemies';
import { allDetours, walkPoint } from './roamPaths';

test('the migration has every detour, and only those', async () => {
  const sql = (await import('../../supabase/migrations/0037_bigger_map.sql?raw')).default as string;
  const rows = sql.match(/^\(\d+,\d+,\d+,\d+,'\{[\d,]+\}','\{[\d,]+\}'\)/gm) ?? [];
  const want = [...allDetours()].map(([k, w]) => `(${k},'{${w.map((p) => p[0]).join(',')}}','{${w.map((p) => p[1]).join(',')}}')`);
  expect(rows.length).toBe(want.length);
  expect(new Set(rows)).toEqual(new Set(want));
});

test('a thug walks round the barrel, not through it', () => {
  // The Yard's barrel is at (63, 48), with open tiles either side.
  for (let f = 0; f <= 1; f += 0.05) {
    const p = walkPoint([62, 48], [64, 48], f);
    expect(Math.floor(p.x) === 63 && Math.floor(p.z) === 48).toBe(false);
  }
});

test('no roaming enemy is ever on a solid tile mid-walk', () => {
  const solid = new Set(THUG_TILES.map(([x, y]) => `${x},${y}`));
  const t0 = 1763000000000; // (a real clock time: the schedule only works from the epoch on, far from 0)
  for (let t = t0; t < t0 + 600000; t += 137) for (let i = 0; i < 3; i++) {
    const p = enemyAt('thug', i, t);
    expect(solid.has(`${Math.floor(p.x)},${Math.floor(p.z)}`)).toBe(true);
  }
});
