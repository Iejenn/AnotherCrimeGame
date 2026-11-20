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

// v0.60: 0041 is live (history now); the newest map migration is 0043 (three drunks, the city at a person's scale).
test('0043 is the map as it is (three drunks, the city at scale)', async () => {
  const { citySql } = await import('../../scripts/city-sql');
  const { m0038, m0040, m0041 } = await load();
  const m0043 = (await import('../../supabase/migrations/0043_city_scale.sql?raw')).default as string;
  expect(m0043 === citySql(m0038, m0040, m0041)).toBe(true);
});

// The enemies' walk map on the server: 0038's rows, 0040's and 0041's updates, then 0043's patches. The game's must
// match it exactly (the patches are written in the same way game.patch_row does).
test("the enemies' walk map is the live one with 0043's patches", async () => {
  const { applyPatch, gameRows, liveAfter0041, rowPatch } = await import('../../scripts/city-sql');
  const { m0038, m0040, m0041 } = await load();
  const live = liveAfter0041(m0038, m0040, m0041);
  const game = gameRows();
  game.forEach((row, y) => expect(live[y] === row ? row : applyPatch(live[y], rowPatch(live[y], row)), `row ${y}`).toBe(row));
});

// v0.60: the simple chase (0042) is exactly what scripts/chase-sql.ts prints from the game's chase.
test('0042 is the chase as the game does it', async () => {
  const { chaseSql } = await import('../../scripts/chase-sql');
  const sql = (await import('../../supabase/migrations/0042_simple_chase.sql?raw')).default as string;
  expect(sql === chaseSql()).toBe(true);
});
