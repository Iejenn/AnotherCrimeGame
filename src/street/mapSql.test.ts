// The server's copy of the map and the metals is exactly what the generators print from the game's data. The newest
// migration that rebuilds the map tables is checked against today's map (v0.57: 0040). Older ones (0037, 0038) are
// history: they ran, and a later migration rebuilt what changed since.
// If this fails after a change to the map or the metals: print it again only if 0040 isn't live yet; once it is, the
// change needs a new migration.
import { expect, test } from 'vitest';
import { beachSql } from '../../scripts/beach-sql';

test('0040 is the map as it is (the beach, the walk map with its border)', async () => {
  const sql = (await import('../../supabase/migrations/0040_beach.sql?raw')).default as string;
  const live = (await import('../../supabase/migrations/0038_aluminium.sql?raw')).default as string;
  expect(sql === beachSql(live)).toBe(true);
});

// v0.57: enemies keep off the beach, so the enemies' walk map is the live one (0038) with only the rows 0040 updates
// (round the Superstore's parking spot): the game's must match it exactly.
test("the enemies' walk map is the live one plus 0040's rows", async () => {
  const { walkMasks } = await import('./sight');
  const { GH, W, gi } = await import('./map');
  const sql = ((await import('../../supabase/migrations/0038_aluminium.sql?raw')).default as string);
  const upd = ((await import('../../supabase/migrations/0040_beach.sql?raw')).default as string);
  const m = walkMasks();
  for (let y = 0; y < GH; y++) {
    const row = Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join('');
    expect(sql.includes(`  (${y}, '${row}')`) || upd.includes(`set masks = '${row}' where y = ${y};`), `row ${y}`).toBe(true);
  }
});
