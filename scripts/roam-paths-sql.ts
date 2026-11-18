// Prints the rows of game.roam_paths (v0.54): every detour a roaming enemy walks (src/game/roamPaths.ts), so the
// server walks them exactly like the game. One row per (from, to) pair whose straight line isn't clear: the bends, the
// last one being `to`.
// Run: npx vite-node scripts/roam-paths-sql.ts > rows.sql
import '../src/game/enemies'; // (registers the places)
import { allDetours } from '../src/game/roamPaths';

const rows = [...allDetours()].map(([k, w]) => `(${k},'{${w.map((p) => p[0]).join(',')}}','{${w.map((p) => p[1]).join(',')}}')`);
console.log(`-- ${rows.length} detours`);
for (let i = 0; i < rows.length; i += 500)
  console.log(`insert into game.roam_paths (fx, fy, tx, ty, xs, ys) values\n${rows.slice(i, i + 500).join(',\n')};`);
