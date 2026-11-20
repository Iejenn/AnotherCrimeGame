// The server's copy of the map is exactly what the generators print from the game's data. The newest migration that
// rebuilds map tables is checked against today's map (v0.58: 0041). Older ones (0037, 0038, 0040) are history: they
// ran, and a later migration rebuilt what changed since.
// If this fails after a change to the map: print it again only if 0041 isn't live yet; once it is, the change needs a
// new migration.
import { expect, test } from 'vitest';

const load = async () => ({
  m0038: (await import('../../supabase/migrations/0038_aluminium.sql?raw')).default as string,
  m0040: (await import('../../supabase/migrations/0040_beach.sql?raw')).default as string,
  m0041: (await import('../../supabase/migrations/0041_bar_and_yard.sql?raw')).default as string,
});

// v0.60: 0041 is live (history now); the newest map migration is 0043 (three drunks).
test('0043 is the map as it is (three drunks)', async () => {
  const { drunksSql } = await import('../../scripts/drunks-sql');
  const { m0038, m0040, m0041 } = await load();
  const m0043 = (await import('../../supabase/migrations/0043_three_drunks.sql?raw')).default as string;
  expect(m0043 === drunksSql(m0038, m0040, m0041)).toBe(true);
});

// The enemies' walk map on the server: 0038's rows, then 0040's, 0041's and 0043's updates. The game's must match it.
test("the enemies' walk map is the live one plus 0043's rows", async () => {
  const { walkMasks } = await import('./sight');
  const { GH, W, gi } = await import('./map');
  const { liveAfter0041 } = await import('../../scripts/drunks-sql');
  const { m0038, m0040, m0041 } = await load();
  const m0043 = (await import('../../supabase/migrations/0043_three_drunks.sql?raw')).default as string;
  const live = liveAfter0041(m0038, m0040, m0041 + '\n' + m0043);
  const m = walkMasks();
  for (let y = 0; y < GH; y++) {
    const row = Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join('');
    expect(live[y], `row ${y}`).toBe(row);
  }
});

// v0.60: the simple chase (0042) is exactly what scripts/chase-sql.ts prints from the game's chase.
test('0042 is the chase as the game does it', async () => {
  const { chaseSql } = await import('../../scripts/chase-sql');
  const sql = (await import('../../supabase/migrations/0042_simple_chase.sql?raw')).default as string;
  expect(sql === chaseSql()).toBe(true);
});
