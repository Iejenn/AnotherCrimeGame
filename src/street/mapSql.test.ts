// The server's copy of the map and the metals is exactly what the generators print from the game's data. The newest
// migration that rebuilds the map tables is checked against today's map (v0.57: 0040). Older ones (0037, 0038) are
// history: they ran, and a later migration rebuilt what changed since.
// If this fails after a change to the map or the metals: print it again only if 0040 isn't live yet; once it is, the
// change needs a new migration.
import { expect, test } from 'vitest';
import { beachSql } from '../../scripts/beach-sql';

test('0040 is the map as it is (the beach, the walk map with its border)', async () => {
  const sql = (await import('../../supabase/migrations/0040_beach.sql?raw')).default as string;
  expect(sql === beachSql()).toBe(true);
});
