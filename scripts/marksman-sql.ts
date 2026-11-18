// Prints the rows for the server's line-of-sight tables (v0.51, Marksman) from the map, so the server checks a throw
// exactly like the game (src/street/sight.ts): the walls (building footprints) and the enclosures (walled or fenced
// areas, in the same order as map.ts's ENCLOSURES: the first that holds a tile wins).
// Run: npx vite-node scripts/marksman-sql.ts
import { ENCLOSURES } from '../src/street/map';
import { SHOT_WALLS } from '../src/street/sight';

console.log(`insert into game.shot_walls (x0, y0, x1, y1) values\n${SHOT_WALLS.map((r) => `  (${r.x0}, ${r.y0}, ${r.x1}, ${r.y1})`).join(',\n')};`);
console.log(
  `insert into game.shot_enclosures (ord, id, x0, y0, x1, y1) values\n${ENCLOSURES.map((e, i) => `  (${i}, '${e.id}', ${e.rect.x0}, ${e.rect.y0}, ${e.rect.x1}, ${e.rect.y1})`).join(',\n')};`,
);
