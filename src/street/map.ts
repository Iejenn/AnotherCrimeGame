// The city grid. Roads are 2 tiles wide every 7 tiles; the 5×5 squares between them are blocks.
// The whole city sits on an island: a river runs all the way around it (drawn in StreetView).
// Street Crimes spots line the three blocks around where you start: levels 1–3 straight ahead,
// 4–6 to the east, 7–9 to the west. Eddy's General Store is just north.
import type { SpotKind } from '../game/data/crimes';
import { CRIMES } from '../game/data/crimes';
import { mulberry32 } from '../game/rng';

export const BLOCK = 7;
export const COLS = 6;
export const ROWS = 5;
export const W = COLS * BLOCK + 2;
export const H = ROWS * BLOCK + 2;
/** How wide the river around the city is, in tiles. */
export const RIVER = 6;

export interface StreetNode {
  id: string;
  crimeId: string;
  kind: SpotKind;
  label: string;
  x: number;
  y: number;
  /** Tourists stroll around; everything else stays put. */
  wanders?: boolean;
}

export type BlockKind = { type: 'crime' } | { type: 'park' } | { type: 'building' } | { type: 'store' };

// Blocks whose south side holds crime spots, in level order (3 crimes each).
const CRIME_BLOCKS: [number, number][] = [[2, 2], [3, 2], [1, 2]];
const PARKS: [number, number][] = [[3, 3], [0, 4], [5, 0], [1, 0]];
/** Eddy's General Store: the block just north of where you start. */
export const STORE_BLOCK: [number, number] = [2, 1];

export const SPAWN: [number, number] = [2 * BLOCK + 4, 3 * BLOCK + 1];

export function isRoad(x: number, y: number) {
  return x % BLOCK < 2 || y % BLOCK < 2;
}

export const BLOCKS: Map<string, BlockKind> = (() => {
  const m = new Map<string, BlockKind>();
  for (let bx = 0; bx < COLS; bx++) for (let by = 0; by < ROWS; by++) m.set(`${bx},${by}`, { type: 'building' });
  for (const [bx, by] of CRIME_BLOCKS) m.set(`${bx},${by}`, { type: 'crime' });
  for (const [bx, by] of PARKS) m.set(`${bx},${by}`, { type: 'park' });
  m.set(STORE_BLOCK.join(','), { type: 'store' });
  return m;
})();

export const NODES: StreetNode[] = (() => {
  const out: StreetNode[] = [];
  CRIMES.forEach((c, i) => {
    const [bx, by] = CRIME_BLOCKS[Math.floor(i / 3)];
    // Spots at the left, middle and right of the block's south side, facing the road.
    const x = bx * BLOCK + 2 + [0, 2, 4][i % 3];
    const y = by * BLOCK + 7;
    out.push({ id: c.id, crimeId: c.id, kind: c.spot.kind, label: c.spot.label, x, y });
  });
  // A few extra tourists wandering around the middle of town.
  const rng = mulberry32(7);
  for (let i = 0; i < 5; i++) {
    let x = 0;
    let y = 0;
    do {
      x = 9 + Math.floor(rng() * 20);
      y = 9 + Math.floor(rng() * 20);
    } while (!isRoad(x, y) || out.some((n) => n.x === x && n.y === y));
    out.push({ id: `tourist_${i}`, crimeId: 'pick_wallet', kind: 'person', label: 'Tourist', x, y, wanders: true });
  }
  return out;
})();

// ---------- NPCs ----------
export interface Npc {
  id: string;
  name: string;
  role: string;
  /** The tile they stand on (you talk to them from a tile next to it). */
  x: number;
  y: number;
}

/** Eddy stands on the pavement in front of his store's door (south side of the store block). */
export const NPCS: Npc[] = [{ id: 'eddy', name: 'Eddy', role: 'General store', x: STORE_BLOCK[0] * BLOCK + 4, y: STORE_BLOCK[1] * BLOCK + 7 }];

/** Tiles you can't walk through: everything that isn't road or park, plus fixed spots. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isRoad(x, y)) continue;
      const kind = BLOCKS.get(`${Math.floor(x / BLOCK)},${Math.floor(y / BLOCK)}`);
      if (kind?.type !== 'park') g[y * W + x] = 1;
    }
  for (const n of NODES) if (!n.wanders) g[n.y * W + n.x] = 1;
  return g;
}
