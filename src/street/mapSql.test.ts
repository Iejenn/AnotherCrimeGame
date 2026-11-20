// The server's copy of the map is exactly what the generators print from the game's data. The newest migration that
// rebuilds map tables is checked against today's map (v0.63: 0048). Older ones (0037–0047) are history: they ran,
// and a later migration rebuilt what changed since.
// If this fails after a change to the map: print it again only if 0048 isn't live yet; once it is, the change needs a
// new migration.
import { expect, test } from 'vitest';

const load = async () => ({
  m0038: (await import('../../supabase/migrations/0038_aluminium.sql?raw')).default as string,
  m0040: (await import('../../supabase/migrations/0040_beach.sql?raw')).default as string,
  m0041: (await import('../../supabase/migrations/0041_bar_and_yard.sql?raw')).default as string,
});

// v0.60: 0041 is live (history now). v0.62: so are 0043 and 0047; v0.63: the newest map migration is 0048 (the
// street furniture and alley dumpsters are solid).
const m0043 = async () => (await import('../../supabase/migrations/0043_city_scale.sql?raw')).default as string;
const m0047 = async () => (await import('../../supabase/migrations/0047_pipe_dreams.sql?raw')).default as string;
test('0048 is the map as it is (solid street furniture)', async () => {
  const { propsSql } = await import('../../scripts/props-sql');
  const { m0038, m0040, m0041 } = await load();
  const m0048 = (await import('../../supabase/migrations/0048_street_props.sql?raw')).default as string;
  expect(m0048 === propsSql(m0038, m0040, m0041, await m0043(), await m0047())).toBe(true);
});

// The enemies' walk map on the server: 0038's rows, 0040's and 0041's updates, 0043's and 0047's patches, then 0048's.
// The game's must match it exactly (the patches are written in the same way game.patch_row does).
test("the enemies' walk map is the live one with 0048's patches", async () => {
  const { applyPatch, gameRows, rowPatch } = await import('../../scripts/city-sql');
  const { liveAfter0047 } = await import('../../scripts/props-sql');
  const { m0038, m0040, m0041 } = await load();
  const live = liveAfter0047(m0038, m0040, m0041, await m0043(), await m0047());
  const game = gameRows();
  game.forEach((row, y) => expect(live[y] === row ? row : applyPatch(live[y], rowPatch(live[y], row)), `row ${y}`).toBe(row));
});

// v0.60: the simple chase (0042) is exactly what scripts/chase-sql.ts prints from the game's chase.
test('0042 is the chase as the game does it', async () => {
  const { chaseSql } = await import('../../scripts/chase-sql');
  const sql = (await import('../../supabase/migrations/0042_simple_chase.sql?raw')).default as string;
  expect(sql === chaseSql()).toBe(true);
});

// v0.60: running (0044) is exactly what scripts/running-sql.ts prints from the game's stamina numbers.
test('0044 is running as the game does it', async () => {
  const { runningSql } = await import('../../scripts/running-sql');
  const sql = (await import('../../supabase/migrations/0044_running.sql?raw')).default as string;
  expect(sql === runningSql()).toBe(true);
});

// v0.62: melee reach (0045) is exactly what scripts/reach-sql.ts prints from the game's walk map.
test('0045 is melee reach as the game does it', async () => {
  const { reachSql } = await import('../../scripts/reach-sql');
  const sql = (await import('../../supabase/migrations/0045_melee_reach.sql?raw')).default as string;
  expect(sql === reachSql()).toBe(true);
});

// v0.62: the grave's hour of online time (0046) is exactly what scripts/grave-sql.ts prints.
test('0046 is the grave hour as the game has it', async () => {
  const { graveSql } = await import('../../scripts/grave-sql');
  const sql = (await import('../../supabase/migrations/0046_grave_hour.sql?raw')).default as string;
  expect(sql === graveSql()).toBe(true);
});
