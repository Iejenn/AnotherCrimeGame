// The server's copy of the map is exactly what the generators print from the game's data. The newest migration that
// rebuilds map tables is checked against today's map (v0.58: 0041). Older ones (0037, 0038, 0040) are history: they
// ran, and a later migration rebuilt what changed since.
// If this fails after a change to the map: print it again only if 0041 isn't live yet; once it is, the change needs a
// new migration.
import { expect, test } from 'vitest';
import { liveWalkRows, turfSql } from '../../scripts/turf-sql';

const load = async () => ({
  m0038: (await import('../../supabase/migrations/0038_aluminium.sql?raw')).default as string,
  m0040: (await import('../../supabase/migrations/0040_beach.sql?raw')).default as string,
  m0041: (await import('../../supabase/migrations/0041_bar_and_yard.sql?raw')).default as string,
});

test('0041 is the map as it is (the bar and the Yard merged)', async () => {
  const { m0038, m0040, m0041 } = await load();
  expect(m0041 === turfSql(m0038, m0040)).toBe(true);
});

// The enemies' walk map on the server: 0038's rows, then the rows 0040 and 0041 update. The game's must match it exactly.
test("the enemies' walk map is the live one plus 0041's rows", async () => {
  const { walkMasks } = await import('./sight');
  const { GH, W, gi } = await import('./map');
  const { m0038, m0040, m0041 } = await load();
  const live = liveWalkRows(m0038, m0040);
  const m = walkMasks();
  for (let y = 0; y < GH; y++) {
    const row = Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join('');
    expect(live[y] === row || m0041.includes(`set masks = '${row}' where y = ${y};`), `row ${y}`).toBe(true);
  }
});
