// The city grid (docs/design.md §7). Roads are 2 tiles wide every 7 tiles; the 5×5 squares
// between them are blocks. Most blocks are a cluster of buildings in one of a few layouts; some are
// small parks; and some are special places where a crime happens (the big park, the basketball
// court, shops you can walk into…). The whole city is an island in the ocean, with a beach around it.
import type { SpotKind } from '../game/data/crimes';
import { CRIME_BY_ID } from '../game/data/crimes';
import { mulberry32 } from '../game/rng';

export const BLOCK = 7;
export const COLS = 6;
export const ROWS = 5;
export const W = COLS * BLOCK + 2;
export const H = ROWS * BLOCK + 2;
/** How wide the beach around the city is, in tiles (then it's open ocean). */
export const BEACH = 2;

/** A rectangle of tiles, corners included. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
/** The 5×5 tiles inside block (bx, by). */
const blockRect = (bx: number, by: number): Rect => ({ x0: bx * BLOCK + 2, y0: by * BLOCK + 2, x1: bx * BLOCK + 6, y1: by * BLOCK + 6 });

export interface StreetNode {
  id: string;
  crimeId: string;
  kind: SpotKind;
  label: string;
  x: number;
  y: number;
  /** People who stroll around stay inside this area. Everything else stays put. */
  wanders?: Rect;
  /** Which way the thing faces (radians around the vertical, 0 = +z / south). */
  facing?: number;
  /** Sits on a bar stool (drunks). */
  seated?: boolean;
}

export type BlockKind = { type: 'park' } | { type: 'buildings' } | { type: 'special' };

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

/** Small parks (one block each). */
const PARKS: [number, number][] = [[0, 4], [5, 0], [1, 0]];

export const SPAWN: [number, number] = [2 * BLOCK + 4, 3 * BLOCK + 1];

export function isRoad(x: number, y: number) {
  return (x % BLOCK < 2 || y % BLOCK < 2) && !inRect(PARK, x, y);
}

// ---------- the big park (Pickpocket Tourists, level 1) ----------
// Two blocks plus the road between them, right below where you start: lawns, hedges with gaps,
// paths in a cross, a fountain in the middle with benches, trees and flowerbeds.
export const PARK: Rect = { x0: 2 * BLOCK + 2, y0: 3 * BLOCK + 2, x1: 3 * BLOCK + 6, y1: 3 * BLOCK + 6 };

// ---------- the basketball court (Raid Gym Bags, level 5) ----------
// A fenced court left of the park. The open (north) side faces the street, with a bench where the
// players left their gym bags. Two players shoot hoops inside.
export const COURT: Rect = blockRect(1, 3);

// ---------- rooms you can walk into ----------
// Each fills (part of) a block, with walls along the edge and one door in the middle of the front
// (south) wall. While you're inside, the walls fade and the roof lifts so you can see in.
export interface Room extends Rect {
  id: string;
  name: string;
  door: [number, number];
  /** Shops get a shopping-bag icon on the minimap. */
  shop: boolean;
}
const room = (id: string, name: string, bx: number, by: number, shop: boolean, rows = 5): Room => {
  const r = blockRect(bx, by);
  const y1 = r.y0 + rows - 1;
  return { ...r, y1, id, name, door: [r.x0 + 2, y1], shop };
};
/** Eddy's General Store, just north of where you start. */
export const STORE = room('store', "Eddy's General Store", 2, 1, true);
/** The candy store (Shoplift Candy Store, level 10), north of the park. */
export const CANDY = room('candy', 'Candy store', 3, 2, true);
/** The bar (Pickpocket Drunks, level 15), above the basketball court. */
export const BAR = room('bar', 'The bar', 1, 2, false);
/** The gas station shop (Shoplift Gas Station, level 25), below the parking lot. The shop is the top
 *  four rows of the block; the pumps stand under a canopy along the front. */
export const GAS = room('gas', 'Gas station', 5, 3, true, 4);
export const ROOMS: Room[] = [STORE, CANDY, BAR, GAS];
export const roomAt = (x: number, y: number) => ROOMS.find((r) => inRect(r, x, y));

// ---------- the parking lot (Pry Open Parking Meters, level 20; Steal From Cars, level 30) ----------
// An open lot at the east edge of town, next to the beach. Meters along the bays, a guard booth,
// four parked cars, and a guard who patrols with a flashlight. Layout (M = meter, C = car, B = booth):
//   M . M . M
//   . C . C .     cars nose-in at the north bays
//   . . . . .
//   . . C . C     cars nose-in at the south bays
//   B M . M .
export const LOT: Rect = blockRect(5, 2);
/** Where the guard patrols: the lot and the pavement and road around it. */
export const PATROL: Rect = { x0: LOT.x0 - 1, y0: LOT.y0 - 1, x1: LOT.x1 + 1, y1: LOT.y1 + 1 };

/** Blocks that aren't normal buildings: the park, the court, the rooms, the lot… */
const SPECIAL: [number, number][] = [[2, 3], [3, 3], [1, 3], [2, 1], [3, 2], [1, 2], [5, 2], [5, 3]];

/**
 * Areas with walls or a fence around them. You can only cross their edge through an opening:
 * a step from an inside tile to the outside tile right next to it.
 */
export interface Enclosure {
  id: string;
  rect: Rect;
  openings: { inside: [number, number]; outside: [number, number] }[];
}
export const ENCLOSURES: Enclosure[] = [
  ...ROOMS.map((r) => ({ id: r.id, rect: r as Rect, openings: [{ inside: r.door, outside: [r.door[0], r.door[1] + 1] as [number, number] }] })),
  {
    id: 'court',
    rect: COURT,
    openings: [
      { inside: [COURT.x0, COURT.y0], outside: [COURT.x0, COURT.y0 - 1] },
      { inside: [COURT.x1, COURT.y0], outside: [COURT.x1, COURT.y0 - 1] },
    ],
  },
];
export const enclosureAt = (x: number, y: number) => ENCLOSURES.find((e) => inRect(e.rect, x, y));

export const BLOCKS: Map<string, BlockKind> = (() => {
  const m = new Map<string, BlockKind>();
  for (let bx = 0; bx < COLS; bx++) for (let by = 0; by < ROWS; by++) m.set(`${bx},${by}`, { type: 'buildings' });
  for (const [bx, by] of PARKS) m.set(`${bx},${by}`, { type: 'park' });
  for (const [bx, by] of SPECIAL) m.set(`${bx},${by}`, { type: 'special' });
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

// ---------- fixtures: solid things you walk around (drawn in city.ts) ----------
export type FixtureKind = 'shelf' | 'counter' | 'hedge' | 'tree' | 'fountain' | 'bench' | 'flowers' | 'backbar' | 'bar' | 'table' | 'jukebox' | 'booth' | 'fridge' | 'pump';
export interface Fixture {
  x: number;
  y: number;
  kind: FixtureKind;
}

export const FIXTURES: Fixture[] = (() => {
  const out: Fixture[] = [];
  const S = STORE;
  // Eddy's store. Layout (S = shelf, C = counter, D = door):
  //   S S . S S
  //   . . . . .
  //   C C . . S
  //   . . . . S
  //   . . D . .
  for (const dx of [0, 1, 3, 4]) out.push({ x: S.x0 + dx, y: S.y0, kind: 'shelf' });
  out.push({ x: S.x0, y: S.y0 + 2, kind: 'counter' }, { x: S.x0 + 1, y: S.y0 + 2, kind: 'counter' });
  out.push({ x: S.x1, y: S.y0 + 2, kind: 'shelf' }, { x: S.x1, y: S.y0 + 3, kind: 'shelf' });

  // The park: hedges around the edge with gaps where the paths come in, trees in the corners,
  // a fountain in the middle with benches either side, two more trees and two flowerbeds.
  const P = PARK;
  const midY = P.y0 + 2;
  const gapsX = [P.x0 + 3, P.x1 - 3];
  for (let x = P.x0; x <= P.x1; x++)
    for (const y of [P.y0, P.y1]) {
      const corner = x === P.x0 || x === P.x1;
      if (corner) out.push({ x, y, kind: 'tree' });
      else if (!gapsX.includes(x)) out.push({ x, y, kind: 'hedge' });
    }
  for (let y = P.y0 + 1; y < P.y1; y++) for (const x of [P.x0, P.x1]) if (y !== midY) out.push({ x, y, kind: 'hedge' });
  const cx = (P.x0 + P.x1 + 1) / 2; // the old road's middle: the fountain sits on it
  out.push({ x: cx - 1, y: midY, kind: 'fountain' }, { x: cx, y: midY, kind: 'fountain' });
  for (const x of [cx - 1, cx]) out.push({ x, y: midY - 1, kind: 'bench' }, { x, y: midY + 1, kind: 'bench' });
  out.push({ x: P.x0 + 2, y: P.y0 + 1, kind: 'tree' }, { x: P.x1 - 2, y: P.y1 - 1, kind: 'tree' });
  out.push({ x: P.x1 - 2, y: P.y0 + 1, kind: 'flowers' }, { x: P.x0 + 2, y: P.y1 - 1, kind: 'flowers' });

  // The candy store. Layout (S = shelf you can steal from, see NODES; C = counter with the register):
  //   S S . S S
  //   . . . . .
  //   C C . . .
  //   . . . . .
  //   . . D . .
  out.push({ x: CANDY.x0, y: CANDY.y0 + 2, kind: 'counter' }, { x: CANDY.x0 + 1, y: CANDY.y0 + 2, kind: 'counter' });

  // The bar. Layout (B = back bar with bottles, J = jukebox, c = bar counter, d = drunk on a stool
  // (a spot, see NODES), T = table):
  //   B B B B J
  //   . . . . .     <- the bartender works back here
  //   c c c . .
  //   d d d . T
  //   . . D . .
  for (let dx = 0; dx < 4; dx++) out.push({ x: BAR.x0 + dx, y: BAR.y0, kind: 'backbar' });
  out.push({ x: BAR.x1, y: BAR.y0, kind: 'jukebox' });
  for (let dx = 0; dx < 3; dx++) out.push({ x: BAR.x0 + dx, y: BAR.y0 + 2, kind: 'bar' });
  out.push({ x: BAR.x1, y: BAR.y0 + 3, kind: 'table' });

  // The gas station shop. Layout (S = shelf you can steal from, F = drinks fridge, K = counter,
  // D = door; P = pump outside under the canopy):
  //   S S F S S
  //   . . . . .
  //   . . . K K
  //   . . D . .     <- the clerk stands behind the counter
  //   . P . P .
  out.push({ x: GAS.x0 + 2, y: GAS.y0, kind: 'fridge' });
  out.push({ x: GAS.x0 + 3, y: GAS.y0 + 2, kind: 'counter' }, { x: GAS.x0 + 4, y: GAS.y0 + 2, kind: 'counter' });
  out.push({ x: GAS.x0 + 1, y: GAS.y1 + 1, kind: 'pump' }, { x: GAS.x0 + 3, y: GAS.y1 + 1, kind: 'pump' });

  // The guard booth in the parking lot's corner.
  out.push({ x: LOT.x0, y: LOT.y1, kind: 'booth' });

  // The court's bench (the gym bags on it are spots, see NODES).
  out.push({ x: COURT.x0 + 2, y: COURT.y0, kind: 'bench' });
  return out;
})();

export const NODES: StreetNode[] = (() => {
  const out: StreetNode[] = [];
  const node = (id: string, crimeId: string, x: number, y: number, extra: Partial<StreetNode> = {}) => {
    const c = CRIME_BY_ID[crimeId];
    out.push({ id, crimeId, kind: c.spot.kind, label: c.spot.label, x, y, ...extra });
  };
  // Two tourists strolling around the park.
  node('tourist_0', 'pick_tourist', PARK.x0 + 1, PARK.y0 + 2, { wanders: PARK });
  node('tourist_1', 'pick_tourist', PARK.x1 - 1, PARK.y0 + 2, { wanders: PARK });
  // Two gym bags on the bench at the court.
  node('bag_0', 'gym_bags', COURT.x0 + 1, COURT.y0, { facing: 0 });
  node('bag_1', 'gym_bags', COURT.x0 + 3, COURT.y0, { facing: 0 });
  // Four candy shelves along the back wall of the candy store.
  [0, 1, 3, 4].forEach((dx, i) => node(`candy_${i}`, 'candy_store', CANDY.x0 + dx, CANDY.y0, { facing: 0 }));
  // Three drunks on stools at the bar, facing the counter.
  for (let i = 0; i < 3; i++) node(`drunk_${i}`, 'pick_drunk', BAR.x0 + i, BAR.y0 + 3, { facing: Math.PI, seated: true });
  // Five parking meters: three along the north edge of the lot (facing in), two along the south edge.
  [0, 2, 4].forEach((dx, i) => node(`meter_${i}`, 'parking_meter', LOT.x0 + dx, LOT.y0, { facing: 0 }));
  [1, 3].forEach((dx, i) => node(`meter_${i + 3}`, 'parking_meter', LOT.x0 + dx, LOT.y1, { facing: Math.PI }));
  // Four parked cars (Steal From Cars): two nose-in at the north bays, two at the south bays.
  [1, 3].forEach((dx, i) => node(`car_${i}`, 'steal_car', LOT.x0 + dx, LOT.y0 + 1, { facing: Math.PI / 2 }));
  [2, 4].forEach((dx, i) => node(`car_${i + 2}`, 'steal_car', LOT.x0 + dx, LOT.y1 - 1, { facing: -Math.PI / 2 }));
  // Four shelves at the gas station, either side of the fridge.
  [0, 1, 3, 4].forEach((dx, i) => node(`gas_${i}`, 'gas_station', GAS.x0 + dx, GAS.y0, { facing: 0 }));
  return out;
})();

/**
 * Can you step from tile a to tile b? Crossing the edge of a walled or fenced area only works
 * through one of its openings (straight, not diagonally). Everything else is decided by the blocked grid.
 */
export function canStep(ax: number, ay: number, bx: number, by: number) {
  const ea = enclosureAt(ax, ay);
  const eb = enclosureAt(bx, by);
  if (ea === eb) return true;
  if (ax !== bx && ay !== by) return false;
  for (const e of [ea, eb]) {
    if (!e) continue;
    const inside = e === ea ? [ax, ay] : [bx, by];
    const outside = e === ea ? [bx, by] : [ax, ay];
    const ok = e.openings.some((o) => o.inside[0] === inside[0] && o.inside[1] === inside[1] && o.outside[0] === outside[0] && o.outside[1] === outside[1]);
    if (!ok) return false;
  }
  return true;
}

// ---------- NPCs ----------
export type NpcKind = 'shopkeeper' | 'baller' | 'clerk' | 'bartender' | 'guard';
export interface Npc {
  id: string;
  name: string;
  role: string;
  kind: NpcKind;
  /** The tile they start on. */
  x: number;
  y: number;
  /** They wander around inside this area. */
  area: Rect;
  /** Tiles in the area they never stand on (e.g. the shop door). */
  avoid?: [number, number][];
  /** Name shown in yellow (people you can talk to, or who can catch you). */
  named: boolean;
  /** Crimes this NPC catches you at (he comes over and hits you). */
  catches?: string[];
}

export const NPCS: Npc[] = [
  { id: 'eddy', name: 'Eddy', role: 'General store', kind: 'shopkeeper', x: STORE.x0 + 2, y: STORE.y0 + 1, area: STORE, avoid: [STORE.door], named: true },
  // The candy store clerk hangs around the register (behind and next to the counter).
  {
    id: 'candy_clerk', name: 'Clerk', role: 'Candy store', kind: 'clerk', x: CANDY.x0 + 1, y: CANDY.y0 + 3,
    area: { x0: CANDY.x0, y0: CANDY.y0 + 1, x1: CANDY.x0 + 2, y1: CANDY.y0 + 3 }, named: true, catches: ['candy_store'],
  },
  // The bartender works behind the counter. Every few seconds he turns his back to the room.
  {
    id: 'bartender', name: 'Bartender', role: 'The bar', kind: 'bartender', x: BAR.x0 + 1, y: BAR.y0 + 1,
    area: { x0: BAR.x0, y0: BAR.y0 + 1, x1: BAR.x0 + 2, y1: BAR.y0 + 1 }, named: true, catches: ['pick_drunk'],
  },
  // The gas station clerk stands behind the counter (and steps out to catch you).
  {
    id: 'gas_clerk', name: 'Clerk', role: 'Gas station', kind: 'clerk', x: GAS.x0 + 3, y: GAS.y1,
    area: { x0: GAS.x0 + 3, y0: GAS.y1, x1: GAS.x0 + 4, y1: GAS.y1 }, named: true, catches: ['gas_station'],
  },
  // The parking lot guard patrols the lot with a flashlight.
  {
    id: 'guard', name: 'Guard', role: 'Parking lot', kind: 'guard', x: LOT.x0 + 2, y: LOT.y0 + 2,
    area: PATROL, named: true, catches: ['parking_meter', 'steal_car'],
  },
  { id: 'baller_0', name: 'Baller', role: 'Shooting hoops', kind: 'baller', x: COURT.x0 + 1, y: COURT.y0 + 2, area: { ...COURT, y0: COURT.y0 + 1 }, named: false },
  { id: 'baller_1', name: 'Baller', role: 'Shooting hoops', kind: 'baller', x: COURT.x1 - 1, y: COURT.y0 + 3, area: { ...COURT, y0: COURT.y0 + 1 }, named: false },
];

/** Tiles you can't walk through: buildings, fixtures, and fixed spots. Roads, alleys, parks and shop floors are open. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(W * H);
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) g[y * W + x] = 1;
  for (const f of FIXTURES) g[f.y * W + f.x] = 1;
  for (const n of NODES) if (!n.wanders) g[n.y * W + n.x] = 1;
  return g;
}
