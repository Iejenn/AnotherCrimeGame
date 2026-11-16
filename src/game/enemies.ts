// Enemies (docs/design.md §12). For now: the Pigeon, three of them in the park. Not aggressive: they peck back
// when you attack them. No drops yet.
//
// Enemies are shared by everyone, so where they walk is a FIXED SCHEDULE worked out from the game clock (like the
// guard, watchers.ts): every phone and the server agree where each Pigeon is. The server has the same function
// (game.pigeon_at in supabase/migrations/0010_combat.sql) and the same list of tiles (scripts/spots-sql.ts prints it).
import { FIXTURES, PARK, SEWER, SEWER_CHANNEL, YARD } from '../street/map';
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
  /** Where it lives (shown in the Skills tab). */
  where: string;
  /** What it drops, on the ground where it dies: the same rows as public.loot on the server (which rolls them). */
  loot: Drop[];
}

/** One line of a loot table: an item (or 'cash', in dollars), the chance (0–1), and how many. */
export interface Drop {
  item: string;
  chance: number;
  min: number;
  max: number;
}

export const ENEMY_KINDS: Record<string, EnemyKind> = {
  pigeon: {
    id: 'pigeon', name: 'Pigeon', level: 1, hp: 3, attack: 1, defense: 0, defenceBonus: 0, speed: 4, maxHit: 1, respawn: 25, aggressive: false,
    where: 'Central Park (008)', loot: [{ item: 'raw_bird_meat', chance: 1, min: 1, max: 1 }],
  },
  // The sewer's rats: between the Pigeons and the thugs, where new players train. Not aggressive. Always drop raw rat
  // meat (cook it: +1 HP).
  rat: {
    id: 'rat', name: 'Rat', level: 3, hp: 6, attack: 3, defense: 2, defenceBonus: 0, speed: 3, maxHit: 1, respawn: 20, aggressive: false,
    where: 'The sewer (pothole by 005)', loot: [{ item: 'raw_rat_meat', chance: 1, min: 1, max: 1 }],
  },
  // The Yard's thugs (007): hooded, with a knife. Not aggressive (for now). Drop $5–10 (1 in 5) and a knife (1 in 20).
  thug: {
    id: 'thug', name: 'Thug', level: 5, hp: 10, attack: 5, defense: 5, defenceBonus: 0, speed: 2, maxHit: 2, respawn: 30, aggressive: false,
    where: 'The Yard (007)',
    loot: [
      { item: 'cash', chance: 0.2, min: 5, max: 10 },
      { item: 'knife', chance: 0.05, min: 1, max: 1 },
    ],
  },
};

/** Every enemy on the island: its id, kind, and which one of its kind it is (its schedule). */
export const ENEMIES = [
  ...[0, 1, 2].map((i) => ({ id: `pigeon_${i}`, kind: 'pigeon', index: i })),
  ...[0, 1, 2].map((i) => ({ id: `thug_${i}`, kind: 'thug', index: i })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `rat_${i}`, kind: 'rat', index: i })),
];

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

// ---------- the thugs: they stroll around the Yard ----------
/** Open tiles in the Yard a thug may stand on (not the fence row, the couch or the barrel). */
export const THUG_TILES: [number, number][] = (() => {
  const solid = new Set(FIXTURES.map((f) => `${f.x},${f.y}`));
  const out: [number, number][] = [];
  for (let y = YARD.y0; y < YARD.y1; y++) for (let x = YARD.x0; x <= YARD.x1; x++) if (!solid.has(`${x},${y}`)) out.push([x, y]);
  return out;
})();
/** A thug's routine: every 12 s he strolls (3 s) to another spot, then hangs around there. */
export const THUG_MOVE_MS = 12000;
export const THUG_WALK_MS = 3000;

export function thugSpot(index: number, k: number): [number, number] {
  const h = minstd(((k * 3 + index) % M) + 1);
  return THUG_TILES[h % THUG_TILES.length];
}

/** Where thug `index` is at time t, and whether he's walking (the same as game.thug_at on the server). */
export function thugAt(index: number, t: number) {
  const shifted = t + index * 4111;
  const k = Math.floor(shifted / THUG_MOVE_MS);
  const into = shifted - k * THUG_MOVE_MS;
  const [tx, ty] = thugSpot(index, k);
  if (into >= THUG_WALK_MS) return { x: tx + 0.5, z: ty + 0.5, flying: false, moving: false };
  const [fx, fy] = thugSpot(index, k - 1);
  const f = into / THUG_WALK_MS;
  return { x: fx + 0.5 + (tx - fx) * f, z: fy + 0.5 + (ty - fy) * f, flying: false, moving: tx !== fx || ty !== fy };
}

// ---------- the rats: each scurries around its own patch of a walkway in the sewer ----------
/** Rat i's patch: the walkways are cut into five patches each (north: rats 0–4, south: rats 5–9), its open tiles. */
export const RAT_ZONES: [number, number][][] = (() => {
  const solid = new Set(FIXTURES.map((f) => `${f.x},${f.y}`));
  const zones: [number, number][][] = [];
  const cols = [[0, 4], [5, 9], [10, 14], [15, 19], [20, 23]];
  for (const [r0, r1] of [[0, SEWER_CHANNEL.y0 - 1], [SEWER_CHANNEL.y1 + 1, SEWER.y1 - SEWER.y0]])
    for (const [c0, c1] of cols) {
      const z: [number, number][] = [];
      for (let dy = r0; dy <= r1; dy++)
        for (let dx = c0; dx <= c1; dx++) if (!solid.has(`${SEWER.x0 + dx},${SEWER.y0 + dy}`)) z.push([SEWER.x0 + dx, SEWER.y0 + dy]);
      zones.push(z);
    }
  return zones;
})();
/** A rat's routine: every 9 s it scurries (2 s) to another spot in its patch. */
export const RAT_MOVE_MS = 9000;
export const RAT_WALK_MS = 2000;

export function ratSpot(index: number, k: number): [number, number] {
  const zone = RAT_ZONES[index];
  const h = minstd(((k * 3 + index) % M) + 1);
  return zone[h % zone.length];
}

/** Where rat `index` is at time t, and whether it's moving (the same as game.rat_at on the server). */
export function ratAt(index: number, t: number) {
  const shifted = t + index * 3331;
  const k = Math.floor(shifted / RAT_MOVE_MS);
  const into = shifted - k * RAT_MOVE_MS;
  const [tx, ty] = ratSpot(index, k);
  if (into >= RAT_WALK_MS) return { x: tx + 0.5, z: ty + 0.5, flying: false, moving: false };
  const [fx, fy] = ratSpot(index, k - 1);
  const f = into / RAT_WALK_MS;
  return { x: fx + 0.5 + (tx - fx) * f, z: fy + 0.5 + (ty - fy) * f, flying: false, moving: tx !== fx || ty !== fy };
}

/** Where an enemy of this kind is at time t (game.enemy_at on the server). */
export function enemyAt(kind: string, index: number, t: number) {
  if (kind === 'thug') return thugAt(index, t);
  if (kind === 'rat') return ratAt(index, t);
  const p = pigeonAt(index, t);
  return { ...p, moving: p.flying };
}
