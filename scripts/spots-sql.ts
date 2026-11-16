// Prints the SQL rows for the server's `spots` table from the map (so the two never disagree).
// Run: npx vite-node scripts/spots-sql.ts
import { NODES } from '../src/street/map';

const rows = NODES.map((n) => {
  const w = n.wanders;
  return `  ('${n.id}', '${n.crimeId}', ${n.x}, ${n.y}, ${w ? `${w.x0}, ${w.y0}, ${w.x1}, ${w.y1}` : 'null, null, null, null'})`;
});
console.log(`insert into public.spots (id, crime_id, x, y, area_x0, area_y0, area_x1, area_y1) values\n${rows.join(',\n')};`);

// The XP table (total XP to BE level L, index = level), copied exactly into game.xp_table().
import { totalXpForLevel } from '../src/game/xp';
const xp = Array.from({ length: 31 }, (_, l) => (l === 0 ? 0 : totalXpForLevel(l)));
console.log(`-- xp table: array[${xp.join(', ')}]`);

// The park tiles a Pigeon can land on, as two arrays (x and y), copied into game.pigeon_at().
import { PIGEON_TILES } from '../src/game/enemies';
console.log(`-- pigeon tiles (${PIGEON_TILES.length}):`);
console.log(`px int[] := array[${PIGEON_TILES.map((t) => t[0]).join(',')}];`);
console.log(`py int[] := array[${PIGEON_TILES.map((t) => t[1]).join(',')}];`);
