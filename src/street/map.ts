// The city grid (docs/design.md §7). The city is 3×3 BLOCKS of 10×10 tiles with STREETS 7 tiles wide between
// them (a road for two cars with a sidewalk on each side, drawn in city.ts). Each block is 4 LOTS of 5×5 (2×2);
// a lot is a few buildings in one of several layouts, a pocket park, or a special place where something happens
// (a shop you walk into, the basketball court…). Some places take more than one lot: the gas station's parking
// lot takes three, Central Park a whole block. The city is an island, with a beach around it.
//
// The server keeps a copy of a few of these numbers (map size, spawn, shop areas, the guard's route, the
// pigeon tiles, the crime spots): scripts/spots-sql.ts prints them from this file. Keep them in step.
import type { SpotKind } from '../game/data/crimes';
import { CRIME_BY_ID } from '../game/data/crimes';
import { mulberry32 } from '../game/rng';

export const LOT_SIZE = 5;
/** A block is 2×2 lots. */
export const BLOCK_SIZE = 2 * LOT_SIZE;
/** A street: sidewalk 1.5 + road 4 + sidewalk 1.5. */
export const STREET = 7;
/** From one block to the next. */
export const PITCH = BLOCK_SIZE + STREET;
export const BCOLS = 3;
export const BROWS = 3;
export const W = BCOLS * PITCH + STREET;
export const H = BROWS * PITCH + STREET;
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
/** The 10×10 tiles of block (bx, by). */
export const blockRect = (bx: number, by: number): Rect => {
  const x0 = bx * PITCH + STREET;
  const y0 = by * PITCH + STREET;
  return { x0, y0, x1: x0 + BLOCK_SIZE - 1, y1: y0 + BLOCK_SIZE - 1 };
};
/** The 5×5 tiles of lot (lx, ly) (0 or 1 each) in block (bx, by). */
export const lotRect = (bx: number, by: number, lx: number, ly: number): Rect => {
  const b = blockRect(bx, by);
  const x0 = b.x0 + lx * LOT_SIZE;
  const y0 = b.y0 + ly * LOT_SIZE;
  return { x0, y0, x1: x0 + LOT_SIZE - 1, y1: y0 + LOT_SIZE - 1 };
};

// ---------- names, to talk about the map (docs/map.md, docs/map.png) ----------
// Blocks are numbered row by row from the north-west corner: 001 002 003 / 004 005 006 / 007 008 009.
// Lots in a block: A = north-west, B = north-east, C = south-west, D = south-east.
//   A B
//   C D
export type LotLetter = 'A' | 'B' | 'C' | 'D';
export const blockName = (bx: number, by: number) => String(by * BCOLS + bx + 1).padStart(3, '0');
export const lotLetter = (lx: number, ly: number): LotLetter => (['A', 'B', 'C', 'D'] as const)[ly * 2 + lx];
export const lotName = (bx: number, by: number, lx: number, ly: number) => `${blockName(bx, by)}-${lotLetter(lx, ly)}`;
/** Block "005" → (bx, by). */
const blockXY = (name: string): [number, number] => {
  const n = Number(name) - 1;
  if (!(n >= 0 && n < BCOLS * BROWS)) throw new Error(`no block ${name}`);
  return [n % BCOLS, Math.floor(n / BCOLS)];
};
/** Block "005" and lot "C" → [bx, by, lx, ly]. */
const lotXY = (block: string, letter: LotLetter): [number, number, number, number] => {
  const i = 'ABCD'.indexOf(letter);
  return [...blockXY(block), i % 2, Math.floor(i / 2)];
};
/** The tiles of a lot by its name: lot('002', 'C'). */
export const lot = (block: string, letter: LotLetter): Rect => lotRect(...lotXY(block, letter));
/** The tiles of a block by its number: block('008'). */
export const block = (name: string): Rect => blockRect(...blockXY(name));

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

/** What fills a lot: buildings, a pocket park, or something special (drawn by its own section in city.ts). */
export type LotKind = 'buildings' | 'park' | 'special';
export interface Lot {
  /** Its name on the map, like "002-C" (block 002, lot C). */
  name: string;
  bx: number;
  by: number;
  lx: number;
  ly: number;
  rect: Rect;
  kind: LotKind;
}

export interface Building {
  /** Top-left tile and size in tiles. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Height in world units. */
  height: number;
  color: number;
  /** Which side its front door is on: the side facing a street. */
  front: 'n' | 's';
}

/** Pocket parks (one lot each). */
const PARKS: [string, LotLetter][] = [['003', 'B']];


/** Street tiles (everything that isn't in a block). */
export function isRoad(x: number, y: number) {
  return x % PITCH < STREET || y % PITCH < STREET;
}

// ---------- Central Park (Pickpocket Tourists, level 1) ----------
// A whole block (10×10) of lawn with hedges around the edge, gravel paths in a # shape, a fountain in the middle
// with benches, a pond, trees and flowerbeds. Three tourists stroll around in it, and the Pigeons live here.
export const PARK: Rect = block('008');
/** The gravel paths: these rows and columns (offsets inside the park). */
export const PARK_PATHS = { rows: [2, 7], cols: [2, 7] };

/** Where you start (and wake up after dying): in Central Park, on the path just north of the fountain, the benches
 *  right below you. */
export const SPAWN: [number, number] = [PARK.x0 + 4, PARK.y0 + 2];

// ---------- the basketball court (Raid Gym Bags, level 5) ----------
// A fenced court left of the park. The open (north) side faces the street, with a bench where the
// players left their gym bags. Two players shoot hoops inside.
export const COURT: Rect = lot('004', 'B');

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
/** A room on a lot: walls around it, the door in the middle of its front (south) wall, facing the street. */
const room = (id: string, name: string, r: Rect, shop: boolean, rows = 5): Room => {
  const y1 = r.y0 + rows - 1;
  return { ...r, y1, id, name, door: [r.x0 + 2, y1], shop };
};
/** Eddy's General Store, on the north side of the middle block's street. The server checks you're inside it when
 *  you sell (sell_item). */
export const STORE = room('store', "Eddy's General Store", lot('002', 'C'), true);
/** The candy store (Shoplift Candy Store, level 10), facing the park. */
export const CANDY = room('candy', 'Candy store', lot('005', 'C'), true);
/** The bar (Pickpocket Drunks, level 15), under the basketball court. */
export const BAR = room('bar', 'The bar', lot('004', 'C'), false);
/** The gas station shop (Shoplift Gas Station, level 25): the top-left lot of the east block. The shop is its
 *  top four rows; the pumps stand in the row in front of it, under a canopy. */
export const GAS = room('gas', 'Gas station', lot('006', 'A'), true, 4);
/** Ray's weapon store (combat, docs/design.md §12), next to Eddy's. The server checks you're inside it when you buy
 *  (buy_item). */
export const WEAPONS = room('weapons', "Ray's Arms", lot('002', 'D'), true);
export const ROOMS: Room[] = [STORE, CANDY, BAR, GAS, WEAPONS];
export const roomAt = (x: number, y: number) => ROOMS.find((r) => inRect(r, x, y));

// ---------- the parking lot (Pry Open Parking Meters, level 20; Steal From Cars, level 30) ----------
// The gas station's block: the shop and pumps on one lot, the parking lot on the other three (an L). Meters along the
// edges, cars nose-in next to them, a guard booth in the corner and a guard who patrols with a flashlight.
//   G G P P P     G = gas station lot, P = parking (north-east lot)
//   G G P P P
//   P P P P P     the two south lots: one long strip
//   P P P P P
export const STATION: Rect = block('006');
/** The north-east parking lot and the long south strip. */
export const PARKING_NE: Rect = lot('006', 'B');
export const PARKING_S: Rect = { ...lot('006', 'C'), x1: lot('006', 'D').x1 };
export const PARKING: Rect[] = [PARKING_NE, PARKING_S];
/** Where the guard may walk (to catch you, too): the station block and the sidewalks around it. */
export const PATROL: Rect = { x0: STATION.x0 - 1, y0: STATION.y0 - 1, x1: STATION.x1 + 1, y1: STATION.y1 + 1 };
/** Areas that cover what would be road (no road paint). None since the blocks got their own streets. */
export const NO_ROAD: Rect[] = [];

/** Lots that aren't normal buildings. */
const SPECIAL: [string, LotLetter][] = [
  ['002', 'C'], ['002', 'D'], // Eddy's, Ray's
  ['004', 'B'], ['004', 'C'], // the court, the bar
  ['005', 'C'], // the candy store
  ['006', 'A'], ['006', 'B'], ['006', 'C'], ['006', 'D'], // the gas station and its parking lot
  ['008', 'A'], ['008', 'B'], ['008', 'C'], ['008', 'D'], // Central Park
  ['007', 'C'], ['007', 'D'], // the Yard (thugs)
];

// ---------- the Yard (thugs, level 5; docs/design.md §12) ----------
// The bottom half of block 007: a building down each side, the 007-A/B buildings behind, and a courtyard between them,
// open to the south street through two gaps in a chain-link fence. Three thugs with knives hang around in it.
//   W W . . . . . . E E      W/E = the side buildings, c = an old couch, B = a burning barrel,
//   W W c c . . . . E E      f = the fence, gaps (entrances) at 1 and 2
//   W W . . . B . . E E
//   W W . . . . . . E E
//   W W f 1 f f 2 f E E
const YARD_LOTS = { c: lot('007', 'C'), d: lot('007', 'D') };
export const YARD: Rect = { x0: YARD_LOTS.c.x0 + 2, y0: YARD_LOTS.c.y0, x1: YARD_LOTS.d.x1 - 2, y1: YARD_LOTS.c.y1 };
const YARD_SIDES = [
  { x: YARD_LOTS.c.x0, y: YARD_LOTS.c.y0, w: 2, h: LOT_SIZE },
  { x: YARD.x1 + 1, y: YARD_LOTS.c.y0, w: 2, h: LOT_SIZE },
];
/** The two gaps in the fence (the entrances), on its south row. */
export const YARD_GATES: [number, number][] = [
  [YARD.x0 + 1, YARD.y1],
  [YARD.x1 - 1, YARD.y1],
];

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

export const LOTS: Lot[] = (() => {
  const out: Lot[] = [];
  const special = new Set(SPECIAL.map(([b, l]) => `${b}-${l}`));
  const parks = new Set(PARKS.map(([b, l]) => `${b}-${l}`));
  for (let bx = 0; bx < BCOLS; bx++)
    for (let by = 0; by < BROWS; by++)
      for (let ly = 0; ly < 2; ly++)
        for (let lx = 0; lx < 2; lx++) {
          const name = lotName(bx, by, lx, ly);
          out.push({ name, bx, by, lx, ly, rect: lotRect(bx, by, lx, ly), kind: special.has(name) ? 'special' : parks.has(name) ? 'park' : 'buildings' });
        }
  return out;
})();

const WALL_COLORS = [0x37322d, 0x3f3a33, 0x332f2b, 0x45392f, 0x3a3936, 0x4a3f36, 0x2f3236];

/** Each building lot gets one of these layouts (offsets inside the 5×5 lot). */
const LAYOUTS: [number, number, number, number][][] = [
  [[0, 0, 5, 5]], // one big building
  [[0, 0, 2, 5], [3, 0, 2, 5]], // two tall ones, alley in the middle
  [[0, 0, 5, 2], [0, 3, 5, 2]], // two wide ones, alley in the middle
  [[0, 0, 5, 2], [0, 2, 5, 3]], // a short and a deep building, back to back
  [[0, 0, 3, 5], [3, 0, 2, 5]], // wide + narrow, back to back
  [[0, 0, 5, 3], [0, 3, 2, 2], [3, 3, 2, 2]], // big one at the back, two small at the front with a gap
];

export const BUILDINGS: Building[] = (() => {
  const out: Building[] = [];
  const rng = mulberry32(42);
  for (const lot of LOTS) {
    if (lot.kind !== 'buildings') continue;
    const block = blockRect(lot.bx, lot.by);
    const layout = LAYOUTS[Math.floor(rng() * LAYOUTS.length)];
    for (const [ox, oy, w, h] of layout) {
      const big = w * h >= 10;
      const y = lot.rect.y0 + oy;
      out.push({
        x: lot.rect.x0 + ox,
        y,
        w,
        h,
        height: big ? 0.9 + rng() * 1.6 : 0.7 + rng() * 1.3,
        color: WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)],
        // The door faces the street: north for buildings along the block's north edge, south otherwise.
        front: y === block.y0 && y + h - 1 !== block.y1 ? 'n' : 's',
      });
    }
  }
  // The Yard's two side buildings (007-C and 007-D), with the courtyard between them.
  for (const b of YARD_SIDES) out.push({ ...b, height: 2.2, color: WALL_COLORS[2], front: 's' });
  return out;
})();

// ---------- cooking stations (docs/design.md §13) ----------
// Where you cook: stand next to one. The server has the same list (public.stations): keep them in step.
export interface Station {
  id: string;
  kind: 'bbq';
  x: number;
  y: number;
}
/** The pocket park with the barbecue (003-B). */
export const BBQ_PARK: Rect = lot('003', 'B');
export const STATIONS: Station[] = [{ id: 'bbq_0', kind: 'bbq', x: BBQ_PARK.x0 + 2, y: BBQ_PARK.y0 + 2 }];

// ---------- fixtures: solid things you walk around (drawn in city.ts) ----------
export type FixtureKind = 'shelf' | 'counter' | 'hedge' | 'tree' | 'fountain' | 'bench' | 'flowers' | 'pond' | 'backbar' | 'bar' | 'table' | 'jukebox' | 'booth' | 'fridge' | 'pump' | 'rack' | 'bbq' | 'couch' | 'barrel' | 'fence';
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

  // Central Park (10×10). Offsets from its top-left corner:
  //  - hedges all around, with gaps where the paths come in (at 2 and 7 on every side), a tree in each corner;
  //  - gravel paths in a # shape: rows 2 and 7, columns 2 and 7 (walkable, drawn in city.ts);
  //  - a 2×2 fountain in the middle (4–5, 4–5) with benches above and below it;
  //  - a pond in the east (8, 4–5), and trees and flowerbeds in the lawns.
  const P = PARK;
  const at = (dx: number, dy: number, kind: FixtureKind) => out.push({ x: P.x0 + dx, y: P.y0 + dy, kind });
  const N = BLOCK_SIZE;
  for (let d = 0; d < N; d++) {
    const corner = d === 0 || d === N - 1;
    const gap = PARK_PATHS.rows.includes(d);
    for (const e of [0, N - 1]) {
      if (corner) at(d, e, 'tree');
      else if (!PARK_PATHS.cols.includes(d)) at(d, e, 'hedge'); // north and south edges
      if (!corner && !gap) at(e, d, 'hedge'); // west and east edges
    }
  }
  for (const dx of [4, 5]) for (const dy of [4, 5]) at(dx, dy, 'fountain');
  for (const dx of [4, 5]) at(dx, 3, 'bench'), at(dx, 6, 'bench');
  for (const dy of [4, 5]) at(8, dy, 'pond');
  for (const [dx, dy] of [[1, 4], [4, 8], [8, 1]]) at(dx, dy, 'tree');
  for (const [dx, dy] of [[4, 1], [1, 8], [8, 8]]) at(dx, dy, 'flowers');

  // Ray's weapon store. Layout (R = weapon rack on the wall, C = counter with the register, D = door):
  //   R R . R R
  //   . . . . .
  //   C C . . .
  //   . . . . .
  //   . . D . .
  for (const dx of [0, 1, 3, 4]) out.push({ x: WEAPONS.x0 + dx, y: WEAPONS.y0, kind: 'rack' });
  out.push({ x: WEAPONS.x0, y: WEAPONS.y0 + 2, kind: 'counter' }, { x: WEAPONS.x0 + 1, y: WEAPONS.y0 + 2, kind: 'counter' });

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

  // The guard booth in the parking lot's south-west corner.
  out.push({ x: PARKING_S.x0, y: PARKING_S.y1, kind: 'booth' });

  // The Yard: an old couch against the back, a burning barrel, and the fence along the street (except the gates).
  out.push({ x: YARD.x0 + 1, y: YARD.y0 + 1, kind: 'couch' }, { x: YARD.x0 + 2, y: YARD.y0 + 1, kind: 'couch' });
  out.push({ x: YARD.x0 + 3, y: YARD.y0 + 2, kind: 'barrel' });
  for (let x = YARD.x0; x <= YARD.x1; x++) if (!YARD_GATES.some(([gx]) => gx === x)) out.push({ x, y: YARD.y1, kind: 'fence' });

  // Cooking stations (the barbecue), so you walk around them.
  for (const st of STATIONS) out.push({ x: st.x, y: st.y, kind: st.kind });

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
  // Three tourists strolling around the park.
  node('tourist_0', 'pick_tourist', PARK.x0 + 2, PARK.y0 + 2, { wanders: PARK });
  node('tourist_1', 'pick_tourist', PARK.x0 + 7, PARK.y0 + 2, { wanders: PARK });
  node('tourist_2', 'pick_tourist', PARK.x0 + 2, PARK.y0 + 7, { wanders: PARK });
  // Two gym bags on the bench at the court.
  node('bag_0', 'gym_bags', COURT.x0 + 1, COURT.y0, { facing: 0 });
  node('bag_1', 'gym_bags', COURT.x0 + 3, COURT.y0, { facing: 0 });
  // Four candy shelves along the back wall of the candy store.
  [0, 1, 3, 4].forEach((dx, i) => node(`candy_${i}`, 'candy_store', CANDY.x0 + dx, CANDY.y0, { facing: 0 }));
  // Three drunks on stools at the bar, facing the counter.
  for (let i = 0; i < 3; i++) node(`drunk_${i}`, 'pick_drunk', BAR.x0 + i, BAR.y0 + 3, { facing: Math.PI, seated: true });
  // Five parking meters: three along the north edge of the north-east lot (facing in), two along the south edge.
  [0, 2, 4].forEach((dx, i) => node(`meter_${i}`, 'parking_meter', PARKING_NE.x0 + dx, PARKING_NE.y0, { facing: 0 }));
  [2, 6].forEach((dx, i) => node(`meter_${i + 3}`, 'parking_meter', PARKING_S.x0 + dx, PARKING_S.y1, { facing: Math.PI }));
  // Four parked cars (Steal From Cars): two nose-in at the north bays, two at the south bays.
  [1, 3].forEach((dx, i) => node(`car_${i}`, 'steal_car', PARKING_NE.x0 + dx, PARKING_NE.y0 + 1, { facing: Math.PI / 2 }));
  [3, 7].forEach((dx, i) => node(`car_${i + 2}`, 'steal_car', PARKING_S.x0 + dx, PARKING_S.y1 - 1, { facing: -Math.PI / 2 }));
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
  // Ray runs the weapon store: he sells brass knuckles (and more, later).
  { id: 'ray', name: 'Ray', role: 'Weapon store', kind: 'shopkeeper', x: WEAPONS.x0 + 3, y: WEAPONS.y0 + 1, area: WEAPONS, avoid: [WEAPONS.door], named: true },
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
    id: 'guard', name: 'Guard', role: 'Parking lot', kind: 'guard', x: PARKING_NE.x0, y: PARKING_NE.y0 + 3,
    area: PATROL, named: true, catches: ['parking_meter', 'steal_car'],
  },
  { id: 'baller_0', name: 'Baller', role: 'Shooting hoops', kind: 'baller', x: COURT.x0 + 1, y: COURT.y0 + 2, area: { ...COURT, y0: COURT.y0 + 1 }, named: false },
  { id: 'baller_1', name: 'Baller', role: 'Shooting hoops', kind: 'baller', x: COURT.x1 - 1, y: COURT.y0 + 3, area: { ...COURT, y0: COURT.y0 + 1 }, named: false },
];

// ---------- cars parked along the curbs (3 tiles long, you walk around them) ----------
export interface ParkedCar {
  /** The first of its three tiles, and which way the street runs. */
  x: number;
  y: number;
  along: 'x' | 'y';
  color: number;
}
export const PARKED_CARS: ParkedCar[] = (() => {
  const out: ParkedCar[] = [];
  const rng = mulberry32(7);
  const colors = [0x8a2f28, 0x2f4562, 0x9a7a2e, 0x35553a, 0xb0aa9c, 0x6a4526, 0x2e5f5b, 0x5a5f66];
  // Each street between two crossings is one block long (10 tiles). About half get a car, in the lane next to one
  // of the two sidewalks (lane tiles 2 or 4 of the 7-wide street), never in front of the spawn.
  for (let k = 0; k <= BROWS; k++)
    for (let bx = 0; bx < BCOLS; bx++) {
      if (rng() < 0.45) continue;
      const lane = k * PITCH + (rng() < 0.5 ? 2 : 4);
      // Between the zebra crossings at both ends (they take the first and last 3 tiles of the street).
      const x = bx * PITCH + STREET + 3 + Math.floor(rng() * 2);
      if (lane === SPAWN[1] || (SPAWN[0] >= x - 1 && SPAWN[0] <= x + 3 && Math.abs(lane - SPAWN[1]) < 3)) continue;
      out.push({ x, y: lane, along: 'x', color: colors[Math.floor(rng() * colors.length)] });
    }
  for (let k = 0; k <= BCOLS; k++)
    for (let by = 0; by < BROWS; by++) {
      if (rng() < 0.55) continue;
      const lane = k * PITCH + (rng() < 0.5 ? 2 : 4);
      const y = by * PITCH + STREET + 3 + Math.floor(rng() * 2);
      out.push({ x: lane, y, along: 'y', color: colors[Math.floor(rng() * colors.length)] });
    }
  return out;
})();
export const parkedTiles = (c: ParkedCar): [number, number][] =>
  [0, 1, 2].map((i) => (c.along === 'x' ? [c.x + i, c.y] : [c.x, c.y + i]));

/** Tiles you can't walk through: buildings, fixtures, fixed spots and parked cars. Streets, alleys, parks and shop floors are open. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(W * H);
  for (const c of PARKED_CARS) for (const [x, y] of parkedTiles(c)) g[y * W + x] = 1;
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) g[y * W + x] = 1;
  for (const f of FIXTURES) g[f.y * W + f.x] = 1;
  for (const n of NODES) if (!n.wanders) g[n.y * W + n.x] = 1;
  return g;
}

// ---------- areas (for the world map) ----------
export type AreaIcon = 'park' | 'court' | 'shop' | 'candy' | 'bar' | 'gas' | 'lot' | 'weapons' | 'fire' | 'thugs';
export interface Area {
  id: string;
  name: string;
  rect: Rect;
  icon: AreaIcon;
  blurb: string;
  /** Crimes you can do here. */
  crimes: string[];
  /** NPC ids who live here. */
  npcs: string[];
}

export const AREAS: Area[] = [
  {
    id: 'yard', name: 'The Yard', rect: YARD, icon: 'thugs', crimes: [], npcs: [],
    blurb: 'A rough courtyard where three thugs hang around with knives (level 5). Fight them for cash, and now and then a knife.',
  },
  {
    id: 'bbq', name: 'The barbecue', rect: BBQ_PARK, icon: 'fire', crimes: [], npcs: [],
    blurb: 'A public barbecue in the pocket park. Cook raw food here to make it edible (Cooking).',
  },
  {
    id: 'park', name: 'Central Park', rect: PARK, icon: 'park', crimes: ['pick_tourist'], npcs: [],
    blurb: 'Lawns, hedges, a fountain and a pond. Tourists stroll around with their wallets in their back pockets.',
  },
  {
    id: 'court', name: 'Basketball court', rect: COURT, icon: 'court', crimes: ['gym_bags'], npcs: [],
    blurb: 'Two guys shoot hoops all evening. Their gym bags sit on the bench by the street.',
  },
  {
    id: 'weapons', name: "Ray's Arms", rect: WEAPONS, icon: 'weapons', crimes: [], npcs: ['ray'],
    blurb: 'The weapon store. Ray sells brass knuckles for $50: your first step up from bare fists.',
  },
  {
    id: 'store', name: "Eddy's General Store", rect: STORE, icon: 'shop', crimes: [], npcs: ['eddy'],
    blurb: "Eddy buys what you've got, no questions asked.",
  },
  {
    id: 'candy', name: 'Candy store', rect: CANDY, icon: 'candy', crimes: ['candy_store'], npcs: ['candy_clerk'],
    blurb: 'Shelves full of candy bars. The clerk keeps an eye out from behind the register.',
  },
  {
    id: 'bar', name: 'The bar', rect: BAR, icon: 'bar', crimes: ['pick_drunk'], npcs: ['bartender'],
    blurb: 'Regulars too drunk to notice a hand in their pocket. The bartender notices, when he is looking.',
  },
  {
    id: 'gas', name: 'Gas & Go', rect: { ...GAS, y1: GAS.y1 + 1 }, icon: 'gas', crimes: ['gas_station'], npcs: ['gas_clerk'],
    blurb: 'A gas station with sandwiches and candy on the shelves, and a clerk behind the counter.',
  },
  {
    id: 'lot', name: 'Parking lot', rect: PARKING_S, icon: 'lot', crimes: ['parking_meter', 'steal_car'], npcs: ['guard'],
    blurb: 'Meters full of quarters and cars with unlocked doors. A guard patrols with a flashlight.',
  },
];
