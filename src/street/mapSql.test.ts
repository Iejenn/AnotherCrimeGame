// v0.54: the server's copy of the map (0037_bigger_map.sql) is exactly what scripts/map-v054-sql.ts prints from it.
// If this fails after a map change: print it again (npx vite-node scripts/map-v054-sql.ts > supabase/migrations/…)
// only if 0037 isn't live yet; once it is, a map change needs a new migration.
import { expect, test } from 'vitest';
import { bigMapSql } from '../../scripts/map-v054-sql';

test('0037 is the map as it is', async () => {
  const sql = (await import('../../supabase/migrations/0037_bigger_map.sql?raw')).default as string;
  expect(sql === bigMapSql()).toBe(true);
});
