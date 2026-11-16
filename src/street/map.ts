// The city grid (docs/design.md §7). Roads are 2 tiles wide every 7 tiles; the 5×5 squares
// between them are blocks. A block is a park, Eddy's store, or a cluster of buildings in one of
// a few layouts (one big building, two or four smaller ones, sometimes with an alley you can
// walk through). The whole city sits on an island with a river around it (drawn in StreetView).
import type { SpotKind } from '../game/data/crimes';
import { CRIME_BY_ID } from '../game/data/crimes';
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

export type BlockKind = { type: 'park' } | { type: 'buildings' } | { type: 'store' };

export interface Building {
  /** Top-left tile and size in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Height in world units. */
  height: number;
  color: number;
}

const PARKS: [number, number][] = [[3, 3], [0, 4], [5, 0], [1, 0]];
/** Eddy's General Store: the block just north of where you start. */
export const STORE_BLOCK: [number, number] = [2, 1];

export const SPAWN: [number, number] = [2 * BLOCK + 4, 3 * BLOCK + 1];

/**
 * Where each crime's spot is: [block x, block y, 0 = left end / 4 = right end of the block's south side].
 * Level 1 and 5 are right where you start; higher levels are further out.
 */
const SPOTS: Record<string, [number, number, 0 | 4]> = {
  pick_wallet: [2, 2, 0],
  shoplift: [2, 2, 4],
  strip_car: [3, 2, 0],
  shell_game: [3, 2, 4],
  burgle_house: [1, 2, 4],
  rob_store: [4, 2, 4],
  mug_banker: [4, 1, 0],
};

export function isRoad(x: number, y: number) {
  return x % BLOCK < 2 || y % BLOCK < 2;
}

export const BLOCKS: Map<string, BlockKind> = (() => {
  const m = new Map<string, BlockKind>();
  for (let bx = 0; bx < COLS; bx++) for (let by = 0; by < ROWS; by++) m.set(`${bx},${by}`, { type: 'buildings' });
  for (const [bx, by] of PARKS) m.set(`${bx},${by}`, { type: 'park' });
  m.set(STORE_BLOCK.join(','), { type: 'store' });
  return m;
})();

const WALL_COLORS = [0x37322d, 0x3f3a33, 0x332f2b, 0x45392f, 0x3a3936, 0x4a3f36, 0x2f3236];

/** Each building block gets one of these layouts (offsets inside the 5×5 block). */
const LAYOUTS: [number, number, number, number][][] = [
  [[0, 0, 5, 5]], // one big building
  [[0, 0, 2, 5], [3, 0, 2, 5]], // two tall ones, alley in the middle
  [[0, 0, 5, 2], [0, 3, 5, 2]], // two wide ones, alley in the middle
  [[0, 0, 2, 2], [3, 0, 2, 2], [0, 3, 2, 2], [3, 0 + 3, 2, 2]], // four small ones, cross-shaped alley
  [[0, 0, 5, 2], [0, 2, 5, 3]], // a short and a deep building, back to back
  [[0, 0, 3, 5], [3, 0, 2, 5]], // wide + narrow, back to back
  [[0, 0, 5, 3], [0, 3, 2, 2], [3, 3, 2, 2]], // big one at the back, two small at the front with a gap
];

export const BUILDINGS: Building[] = (() => {
  const out: Building[] = [];
  const rng = mulberry32(42);
  for (let bx = 0; bx < COLS; bx++)
    for (let by = 0; by < ROWS; by++) {
      if (BLOCKS.get(`${bx},${by}`)?.type !== 'buildings') continue;
      const layout = LAYOUTS[Math.floor(rng() * LAYOUTS.length)];
      for (const [ox, oy, w, h] of layout) {
        const big = w * h >= 10;
        out.push({
          x: bx * BLOCK + 2 + ox,
          y: by * BLOCK + 2 + oy,
          w,
          h,
          // Kept fairly low so they don't hide you; small buildings can still be tall-ish towers.
          height: big ? 0.9 + rng() * 1.6 : 0.7 + rng() * 1.3,
          color: WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)],
        });
      }
    }
  return out;
})();

export const NODES: StreetNode[] = (() => {
  const out: StreetNode[] = [];
  for (const [crimeId, [bx, by, end]] of Object.entries(SPOTS)) {
    const c = CRIME_BY_ID[crimeId];
    out.push({ id: crimeId, crimeId, kind: c.spot.kind, label: c.spot.label, x: bx * BLOCK + 2 + end, y: by * BLOCK + 7 });
  }
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

// ---------- Eddy's General Store (you can walk inside) ----------
// The store fills its 5×5 block. Its walls run along the block edge, so you can only get in or out
// through the door in the middle of the south wall. Inside: shelves along the walls and a counter.
export const STORE = (() => {
  const x0 = STORE_BLOCK[0] * BLOCK + 2;
  const y0 = STORE_BLOCK[1] * BLOCK + 2;
  return { x0, y0, x1: x0 + 4, y1: y0 + 4, door: [x0 + 2, y0 + 4] as [number, number] };
})();

export function inStore(x: number, y: number) {
  return x >= STORE.x0 && x <= STORE.x1 && y >= STORE.y0 && y <= STORE.y1;
}

/** Solid things inside the store. Layout (S = shelf, C = counter, D = door):
 *   S S . S S
 *   . . . . .
 *   C C . . S
 *   . . . . S
 *   . . D . .   */
export const STORE_FIXTURES: { x: number; y: number; kind: 'shelf' | 'counter' }[] = [
  ...[0, 1, 3, 4].map((dx) => ({ x: STORE.x0 + dx, y: STORE.y0, kind: 'shelf' as const })),
  { x: STORE.x0, y: STORE.y0 + 2, kind: 'counter' },
  { x: STORE.x0 + 1, y: STORE.y0 + 2, kind: 'counter' },
  { x: STORE.x1, y: STORE.y0 + 2, kind: 'shelf' },
  { x: STORE.x1, y: STORE.y0 + 3, kind: 'shelf' },
];

/**
 * Can you step from tile a to tile b? Inside↔outside the store only through the door
 * (straight, not diagonally). Everything else is decided by the blocked grid.
 */
export function canStep(ax: number, ay: number, bx: number, by: number) {
  const ia = inStore(ax, ay);
  const ib = inStore(bx, by);
  if (ia === ib) return true;
  if (ax !== bx && ay !== by) return false;
  const [dx, dy] = STORE.door;
  const inside = ia ? [ax, ay] : [bx, by];
  const outside = ia ? [bx, by] : [ax, ay];
  return inside[0] === dx && inside[1] === dy && outside[0] === dx && outside[1] === dy + 1;
}

// ---------- NPCs ----------
export interface Npc {
  id: string;
  name: string;
  role: string;
  /** The tile they start on (you talk to them from a tile next to where they are). */
  x: number;
  y: number;
  /** Eddy wanders around inside his store. */
  wanders?: 'store';
}

export const NPCS: Npc[] = [{ id: 'eddy', name: 'Eddy', role: 'General store', x: STORE.x0 + 2, y: STORE.y0 + 1, wanders: 'store' }];

/** Tiles you can't walk through: buildings, store shelves/counter, and fixed spots. Roads, alleys, parks and the store floor are open. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(W * H);
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) g[y * W + x] = 1;
  for (const f of STORE_FIXTURES) g[f.y * W + f.x] = 1;
  for (const n of NODES) if (!n.wanders) g[n.y * W + n.x] = 1;
  return g;
}
