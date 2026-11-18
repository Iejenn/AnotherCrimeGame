// The server walks the same detours as the game (v0.54): 0037_bigger_map.sql holds exactly the rows roamPaths.ts
// works out (0036 had them first; the sewer's moved down since), except the thugs': 0041 (v0.58, the bigger Yard)
// deleted those and put in the new ones.
import { expect, test } from 'vitest';
import { enemyAt, THUG_TILES } from './enemies';
import { allDetours, walkPoint } from './roamPaths';

test('the migration has every detour, and only those', async () => {
  const old = (await import('../../supabase/migrations/0037_bigger_map.sql?raw')).default as string;
  const turf = (await import('../../supabase/migrations/0041_bar_and_yard.sql?raw')).default as string;
  const { YARD, inRect } = await import('../street/map');
  const match = (sql: string) => sql.match(/^\(\d+,\d+,\d+,\d+,'\{[\d,]+\}','\{[\d,]+\}'\)/gm) ?? [];
  const inYard = (r: string) => inRect(YARD, ...(r.slice(1).split(',').slice(0, 2).map(Number) as [number, number]));
  const rows = [...match(old).filter((r) => !inYard(r)), ...match(turf)];
  const want = [...allDetours()].map(([k, w]) => `(${k},'{${w.map((p) => p[0]).join(',')}}','{${w.map((p) => p[1]).join(',')}}')`);
  expect(rows.length).toBe(want.length);
  expect(new Set(rows)).toEqual(new Set(want));
});

test('a thug walks round the barrel, not through it', async () => {
  // The Yard's barrel (v0.58: in its second quarter), with open tiles either side.
  const { STATIONS } = await import('../street/map');
  const b = STATIONS.find((s) => s.id === 'barrel_1')!;
  for (let f = 0; f <= 1; f += 0.05) {
    const p = walkPoint([b.x - 1, b.y], [b.x + 1, b.y], f);
    expect(Math.floor(p.x) === b.x && Math.floor(p.z) === b.y).toBe(false);
  }
});

test('no roaming enemy is ever on a solid tile mid-walk', () => {
  const solid = new Set(THUG_TILES.map(([x, y]) => `${x},${y}`));
  const t0 = 1763000000000; // (a real clock time: the schedule only works from the epoch on, far from 0)
  for (let t = t0; t < t0 + 600000; t += 137) for (let i = 0; i < 8; i++) {
    const p = enemyAt('thug', i, t);
    expect(solid.has(`${Math.floor(p.x)},${Math.floor(p.z)}`)).toBe(true);
  }
});
