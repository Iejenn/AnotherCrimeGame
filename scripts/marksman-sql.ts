// Prints the rows for the server's line-of-sight tables (v0.51, Marksman) from the map, so the server checks a throw
// exactly like the game (src/street/sight.ts): the walls (building footprints) and the enclosures (walled or fenced
// areas, in the same order as map.ts's ENCLOSURES: the first that holds a tile wins).
// Run: npx vite-node scripts/marksman-sql.ts (0032: walls and enclosures), or with --walk (0033: the walk map).
import { ENCLOSURES } from '../src/street/map';
import { SHOT_WALLS } from '../src/street/sight';

if (!process.argv.includes("--walk")) console.log(`insert into game.shot_walls (x0, y0, x1, y1) values\n${SHOT_WALLS.map((r) => `  (${r.x0}, ${r.y0}, ${r.x1}, ${r.y1})`).join(',\n')};`);
if (!process.argv.includes('--walk')) console.log(
  `insert into game.shot_enclosures (ord, id, x0, y0, x1, y1) values\n${ENCLOSURES.map((e, i) => `  (${i}, '${e.id}', ${e.rect.x0}, ${e.rect.y0}, ${e.rect.x1}, ${e.rect.y1})`).join(',\n')};`,
);

// v0.51 (0033): the walk map: for each row of tiles, every tile's 8-move mask as 2 hex digits (src/street/sight.ts
// walkMasks), for game.enemy_route.
import { GH, W } from '../src/street/map';
import { walkMasks } from '../src/street/sight';
if (process.argv.includes('--walk')) {
  const m = walkMasks();
  const rows = Array.from({ length: GH }, (_, y) => `  (${y}, '${Array.from(m.slice(y * W, (y + 1) * W), (v) => v.toString(16).padStart(2, '0')).join('')}')`);
  console.log(`-- walk map: ${W} x ${GH}`);
  console.log(`insert into game.walk_map (y, masks) values\n${rows.join(',\n')};`);
}
