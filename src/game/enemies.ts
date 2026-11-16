// Enemies (docs/design.md §12). For now: the Pigeon, three of them in the park. Not aggressive: they peck back
// when you attack them. No drops yet.
//
// Enemies are shared by everyone, so where they walk is a FIXED SCHEDULE worked out from the game clock (like the
// guard, watchers.ts): every phone and the server agree where each Pigeon is. The server has the same function
// (game.pigeon_at in supabase/migrations/0010_combat.sql) and the same list of tiles (scripts/spots-sql.ts prints it).
import { FIXTURES, PARK } from '../street/map';
import { minstd } from './watchers';

export interface EnemyKind {
  id: string;
  name: string;
  level: number;
  hp: number;
  /** Their attack level (accuracy) and Defense level, and defence bonus. */
  attack: number;
  defense: number;
  defenceBonus: number;
  /** Ticks between their attacks (× 0.5 s). */
  speed: number;
  maxHit: number;
  /** Seconds until a killed one comes back. */
  respawn: number;
  aggressive: boolean;
}

export const ENEMY_KINDS: Record<string, EnemyKind> = {
  pigeon: { id: 'pigeon', name: 'Pigeon', level: 1, hp: 3, attack: 1, defense: 0, defenceBonus: 0, speed: 4, maxHit: 1, respawn: 25, aggressive: false },
};

/** Every enemy on the island: its id and kind. */
export const ENEMIES = [0, 1, 2].map((i) => ({ id: `pigeon_${i}`, kind: 'pigeon', index: i }));

/** Open park tiles a Pigeon may land on (the park minus hedges, trees, the fountain, benches, the pond, flowers). */
export const PIGEON_TILES: [number, number][] = (() => {
  const solid = new Set(FIXTURES.map((f) => `${f.x},${f.y}`));
  const out: [number, number][] = [];
  for (let y = PARK.y0; y <= PARK.y1; y++) for (let x = PARK.x0; x <= PARK.x1; x++) if (!solid.has(`${x},${y}`)) out.push([x, y]);
  return out;
})();

/** A Pigeon's routine: every 8 s it flutters to another spot (1.5 s), then pecks around there. */
export const PIGEON_HOP_MS = 8000;
export const PIGEON_FLY_MS = 1500;
const M = 2147483647;

/** The tile Pigeon `index` lands on in its k-th hop. */
export function pigeonSpot(index: number, k: number): [number, number] {
  const h = minstd(((k * 3 + index) % M) + 1);
  return PIGEON_TILES[h % PIGEON_TILES.length];
}

/** Where Pigeon `index` is at time t (tile units, middle of a tile = +0.5), and whether it's flying. */
export function pigeonAt(index: number, t: number) {
  const shifted = t + index * 2777;
  const k = Math.floor(shifted / PIGEON_HOP_MS);
  const into = shifted - k * PIGEON_HOP_MS;
  const [tx, ty] = pigeonSpot(index, k);
  if (into >= PIGEON_FLY_MS) return { x: tx + 0.5, z: ty + 0.5, flying: false };
  const [fx, fy] = pigeonSpot(index, k - 1);
  const f = into / PIGEON_FLY_MS;
  return { x: fx + 0.5 + (tx - fx) * f, z: fy + 0.5 + (ty - fy) * f, flying: true };
}
