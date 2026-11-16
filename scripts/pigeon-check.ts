// Where the Pigeons are at 400 test moments, according to the game; compare with game.pigeon_at on the server.
import { pigeonAt } from '../src/game/enemies';
const t0 = 1794830000000;
const out: string[] = [];
for (let i = 0; i < 400; i++) {
  const t = t0 + i * 1777;
  const p = pigeonAt(i % 3, t);
  out.push(`${p.x.toFixed(3)}/${p.z.toFixed(3)}`);
}
console.log(out.join(','));
