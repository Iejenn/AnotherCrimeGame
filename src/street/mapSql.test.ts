// The server's copy of the map and the metals is exactly what the generators print from the game's data. The newest
// migration that rebuilds the map tables is checked against today's map (v0.56: 0038). Older ones (0037, the bigger
// map) are history: they ran, and a later migration rebuilt what changed since.
// If this fails after a change to the map or the metals: print it again only if 0038 isn't live yet; once it is, the
// change needs a new migration.
import { expect, test } from 'vitest';
import { aluminiumSql } from '../../scripts/aluminium-sql';

test('0038 is the map and the aluminium tier as they are', async () => {
  const sql = (await import('../../supabase/migrations/0038_aluminium.sql?raw')).default as string;
  expect(sql === aluminiumSql()).toBe(true);
});
