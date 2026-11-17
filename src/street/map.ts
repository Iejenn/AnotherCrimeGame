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
/** The Industrial zone is 3 × 3 blocks on the west; the city is 3 × 3 east of it (docs/design.md §14). Block columns
 *  0–2 are the zone, 3–5 the city. */
export const ZONE_COLS = 3;
export const CITY_COLS = 3;
export const BCOLS = ZONE_COLS + CITY_COLS;
export const BROWS = 3;
/** The city's first block column. */
export const CITY_BX = ZONE_COLS;
/** How far east the city moved when the Industrial zone came in on its west side (v0.41): 3 blocks. */
export const CITY_X = ZONE_COLS * PITCH;
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
/** City blocks are 001–009; the Industrial zone's blocks are I-001–I-009 (numbered the same way, within the zone). */
export const blockName = (bx: number, by: number) =>
  bx >= CITY_BX ? String(by * CITY_COLS + (bx - CITY_BX) + 1).padStart(3, '0') : `I-${String(by * ZONE_COLS + bx + 1).padStart(3, '0')}`;
/** West of the city's first block: the Industrial zone. */
export const inZone = (x: number) => x < CITY_X;
export const lotLetter = (lx: number, ly: number): LotLetter => (['A', 'B', 'C', 'D'] as const)[ly * 2 + lx];
export const lotName = (bx: number, by: number, lx: number, ly: number) => `${blockName(bx, by)}-${lotLetter(lx, ly)}`;
/** Block "005" → (bx, by). */
const blockXY = (name: string): [number, number] => {
  const zone = name.startsWith('I-');
  const n = Number(zone ? name.slice(2) : name) - 1;
  if (!(n >= 0 && n < 9)) throw new Error(`no block ${name}`);
  return [(n % 3) + (zone ? 0 : CITY_BX), Math.floor(n / 3)];
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
  /** Run down: the windows are boarded up and the ground floor is bare brick (the Yard's buildings, for graffiti). */
  boarded?: boolean;
  /** Drawn by its own section in city.ts (the Thrift Store), not as an ordinary building. */
  custom?: boolean;
  /** In the Industrial zone: a corrugated-metal shed or workshop instead of an apartment building. */
  industrial?: boolean;
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

// ---------- the hospital (where you wake up after passing out; docs/design.md §5) ----------
// A two-storey building on 005-B and 005-D, facing the park. The front half (D) is a tall lobby (open up to the
// roof) with a wide glass entrance, a reception desk and two staircases along the side walls at the back. The back
// half (B) is the ward, upstairs: beds along both walls, two doctors walking around, a railing where it looks down
// into the lobby. The ward's tiles are the B tiles, drawn one storey up (floorY), so walking up the stairs is just
// walking north (the server sees normal steps). Downstairs you can't walk under the ward: only the stairs go there.
//   ward (B, upstairs)      lobby (D)
//   b . . . b   24          ^ . . . ^   29   ^ = stairs (going up to the north)
//   b . . . b               ^ . R . ^        R = the receptionist, behind her desk
//   b . . . b               . r r . .        r = the reception desk (staff walk round its end)
//   . . . . .               . . . . .
//   ^ . . . ^   28          . E E E .   33   E = the entrance (3 wide)
const HOSPITAL_LOTS = { b: lot('005', 'B'), d: lot('005', 'D') };
/** The whole building. */
export const HOSPITAL: Rect = { x0: HOSPITAL_LOTS.b.x0, y0: HOSPITAL_LOTS.b.y0, x1: HOSPITAL_LOTS.d.x1, y1: HOSPITAL_LOTS.d.y1 };
/** Upstairs: the ward. */
export const WARD: Rect = HOSPITAL_LOTS.b;
/** Downstairs: the lobby (a room you walk into, like the shops). */
export const LOBBY: Room = { ...HOSPITAL_LOTS.d, id: 'hospital', name: 'Hospital', door: [HOSPITAL_LOTS.d.x0 + 2, HOSPITAL_LOTS.d.y1], shop: false };
/** How high the ward's floor is (one storey, world units). */
export const FLOOR_H = 1.75;
/** The two staircases: the columns they're in, and their two tiles (bottom, top) in the lobby's back rows. */
export const STAIRS = [LOBBY.x0, LOBBY.x1].map((x, i) => ({ id: `stairs_${i}`, x, bottom: [x, LOBBY.y0 + 1] as [number, number], top: [x, LOBBY.y0] as [number, number] }));
/** Where you wake up after passing out: in the ward, next to a bed. The server has the same tile (game.die). */
export const WAKE: [number, number] = [WARD.x0 + 1, WARD.y0 + 1];
/** A tile on one of the staircases. */
export const onStairs = (x: number, y: number) => STAIRS.some((s) => s.x === x && (y === s.top[1] || y === s.bottom[1]));
/** You're upstairs. */
export const isUpstairs = (x: number, y: number) => inRect(WARD, x, y);
/**
 * How high the floor is at world point (x, z): the ward's floor, the stairs going up, or the street (0).
 * Everyone who walks (you, other players, the doctors) stands on this.
 */
export function floorY(x: number, z: number) {
  if (z >= H + 2) return -SEWER_DEPTH;
  const tx = Math.floor(x);
  if (tx < HOSPITAL.x0 || tx > HOSPITAL.x1 || z < HOSPITAL.y0 || z >= LOBBY.y0 + 2) return 0;
  if (z < LOBBY.y0) return FLOOR_H;
  // On the stairs: from the bottom of the lower stair tile (0) to the top of the upper one (a full storey).
  if (STAIRS.some((s) => s.x === tx)) return FLOOR_H * Math.min(1, Math.max(0, (LOBBY.y0 + 2 - z) / 2));
  return 0;
}
export const ROOMS: Room[] = [STORE, CANDY, BAR, GAS, WEAPONS, LOBBY];
// (The Factory is a room too; it's added to ROOMS below, where it's defined.)
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
  ['005', 'B'], ['005', 'D'], // the hospital
  ['009', 'C'], ['009', 'D'], // the Thrift Store and its salvage yard
  ['I-003', 'A'], ['I-003', 'B'], ['I-003', 'C'], ['I-003', 'D'], // the Factory
  ['I-006', 'A'], ['I-006', 'B'], ['I-006', 'C'], ['I-006', 'D'], // its parking lot
];

// ---------- the Thrift Store (Scrapping: tin salvage, level 1; docs/design.md §14) ----------
// East of the park: the store on 009-C (a brick shop with a big sign, you don't go in), and behind a chain-link fence on
// 009-D its yard with 5 rusty dumpsters you dig through for tin. Both face the street on the south (the side the camera
// looks at); the yard's one gate is there too.
//   S S S S S | . . D . .      S = the store, G = the gate, D = a dumpster
//   S S S S S | . . . . .
//   S S S S S | D . . . D
//   S S S S S | . . . . .
//   S S S S S | D . G . D
//      (sign, door)
export const THRIFT: Rect = lot('009', 'C');
export const THRIFT_YARD: Rect = lot('009', 'D');
export const THRIFT_GATE: [number, number] = [THRIFT_YARD.x0 + 2, THRIFT_YARD.y1];
// ---------- the Factory (Tinkering; docs/design.md §14) ----------
// In the Industrial zone, on I-003 and I-006 merged (no street between them). An abandoned factory fills I-003 and
// reaches into the old street: brick walls, a corrugated roof with broken skylights, a wide roll-up door on the south
// side. Inside (a room you walk into, the roof lifts): 3 plate presses along the west wall, 3 workbenches along the east
// wall, crates at the back, lots of room in the middle (it's where players meet to work). In front of it, on I-006, an
// empty parking lot: cracked asphalt, faded lines, no cars, a chain-link fence with one opening for cars (west side,
// towards the city).
//   x 92 ………………………… 101
//   . . c c . . c c . .   y 7    c = crates
//   P . . . . . . . . B           P = a plate press, B = a workbench (at y 9, 12, 15)
//   …                             the factory: y 7–19
//   . . . . D D . . . .   y 19   D = the roll-up door (2 wide)
//   ======= parking lot =======   y 20–33, opening on the west side at y 26–27
const FACTORY_N = block('I-003');
const FACTORY_S = block('I-006');
/** The whole site: the factory and its parking lot (the street between the two blocks is part of it). */
export const FACTORY_SITE: Rect = { x0: FACTORY_N.x0, y0: FACTORY_N.y0, x1: FACTORY_N.x1, y1: FACTORY_S.y1 };
export const FACTORY: Room = {
  x0: FACTORY_N.x0, y0: FACTORY_N.y0, x1: FACTORY_N.x1, y1: FACTORY_N.y0 + 12,
  id: 'factory', name: 'The Factory', door: [FACTORY_N.x0 + 4, FACTORY_N.y0 + 12], shop: false,
};
/** The roll-up door: two tiles wide, in the middle of the south wall. */
export const FACTORY_DOOR: [number, number][] = [[FACTORY.x0 + 4, FACTORY.y1], [FACTORY.x0 + 5, FACTORY.y1]];
export const FACTORY_LOT: Rect = { x0: FACTORY_SITE.x0, y0: FACTORY.y1 + 1, x1: FACTORY_SITE.x1, y1: FACTORY_SITE.y1 };
/** The parking lot's opening for cars, on the west side. */
export const FACTORY_LOT_GATE: [number, number][] = [[FACTORY_LOT.x0, FACTORY_LOT.y0 + 6], [FACTORY_LOT.x0, FACTORY_LOT.y0 + 7]];
ROOMS.push(FACTORY);

export const THRIFT_DUMPSTERS: [number, number][] = [[2, 0], [0, 2], [4, 2], [0, 4], [4, 4]].map(([dx, dy]) => [THRIFT_YARD.x0 + dx, THRIFT_YARD.y0 + dy]);

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

// ---------- the sewer (rats, level 3; docs/design.md §12) ----------
// Under the city, reached through a pothole (an open manhole) in the crossing east of the candy shop. Like the hospital's
// ward, it's ordinary tiles: a strip of rows below the island's grid (y ≥ H), drawn SEWER_DEPTH under the ground
// (floorY). You get in and out by climbing (the `climb` server function checks you stand at one end of the link).
// 24×12 tiles: two walkways along a channel of sewage, two grate bridges across it, the ladder up on the north wall,
// the tunnel's arch at the east end. Ten rats, one patch each (5 per walkway).
//   . . L . . c . . . . . c T . . . . . . . c T . .    0   L = the ladder up, c = crates, T = rubbish bags
//   . . . . . . . . . . . . . . . . . . . . . . . .
//   . . . . . . . . . . . . . . . . . . . . . . . .
//   . . . . . . . . . . . . . . . . . . . . . . . .    3
//   ~ ~ ~ ~ ~ ~ = = ~ ~ ~ ~ ~ ~ ~ ~ = = ~ ~ ~ ~ ~ ~    4–7  ~ = sewage, = = a grate bridge
//   . . . . . . . . . . . . . . . . . . . . . . . .    8
//   . . . . . . . . . . . . . . . . . . . . . . . .
//   . . . . . . . . . . . . . . . . . . . . . . . .
//   . . . c . . . . . c T . . . . c . . . . . c . .    11
/** Under the ground: how deep the sewer's floor is (world units). Deep enough that the camera stays underground too. */
export const SEWER_DEPTH = 40;
export const SEWER: Rect = { x0: 18, y0: H + 6, x1: 41, y1: H + 17 };
/** The channel's rows (offsets) and the bridges' columns (offsets). */
export const SEWER_CHANNEL = { y0: 4, y1: 7 };
export const SEWER_BRIDGES = [6, 16];
/** The grid the game walks on: the island, then the sewer below it. */
export const GW = W;
export const GH = SEWER.y1 + 3;
/** The pothole: an open manhole in the middle of the crossing east of the candy shop. */
export const MANHOLE: [number, number] = [CITY_X + 2 * PITCH + 3, 2 * PITCH + 3];
/** The ladder on the sewer's north wall. */
export const SEWER_LADDER: [number, number] = [SEWER.x0 + 2, SEWER.y0];
/** Climbing between the street and the sewer: stand at `at` (on it or next to it), climb, and you're at `to`. The
 *  server has the same links (public.links). */
export interface Link {
  id: string;
  at: [number, number];
  to: [number, number];
  /** What it says when you go. */
  text: string;
}
export const LINKS: Link[] = [
  { id: 'sewer_down', at: MANHOLE, to: [SEWER_LADDER[0], SEWER_LADDER[1] + 1], text: 'You climb down into the sewer' },
  { id: 'sewer_up', at: SEWER_LADDER, to: [MANHOLE[0], MANHOLE[1] - 1], text: 'You climb back up to the street' },
];
export const inSewer = (x: number, y: number) => inRect(SEWER, x, y);
/** A sewage tile (not a bridge). */
export const isSewage = (x: number, y: number) => {
  const dx = x - SEWER.x0;
  const dy = y - SEWER.y0;
  return inSewer(x, y) && dy >= SEWER_CHANNEL.y0 && dy <= SEWER_CHANNEL.y1 && !SEWER_BRIDGES.some((b) => dx === b || dx === b + 1);
};
/** A tile you could be on: the island, or the sewer. */
export const onMap = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H) || inSewer(x, y);

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
  ...ROOMS.filter((r) => r !== LOBBY && r.id !== 'factory').map((r) => ({ id: r.id, rect: r as Rect, openings: [{ inside: r.door, outside: [r.door[0], r.door[1] + 1] as [number, number] }] })),
  // The hospital: a wide entrance (3 tiles), and the stairs are the only way between the lobby and the ward.
  {
    id: 'hospital',
    rect: LOBBY,
    openings: [
      ...[-1, 0, 1].map((d) => ({ inside: [LOBBY.door[0] + d, LOBBY.y1] as [number, number], outside: [LOBBY.door[0] + d, LOBBY.y1 + 1] as [number, number] })),
      ...STAIRS.map((s) => ({ inside: s.top, outside: [s.x, WARD.y1] as [number, number] })),
    ],
  },
  // The Factory: its roll-up door (2 wide) opens onto the parking lot; the lot's fence has one opening (west).
  { id: 'factory', rect: FACTORY, openings: FACTORY_DOOR.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x, y + 1] as [number, number] })) },
  {
    id: 'factory_lot', rect: FACTORY_LOT,
    openings: [
      ...FACTORY_DOOR.map(([x, y]) => ({ inside: [x, y + 1] as [number, number], outside: [x, y] as [number, number] })),
      ...FACTORY_LOT_GATE.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x - 1, y] as [number, number] })),
    ],
  },
  // The Thrift Store's yard: chain-link fence all round, one gate on the street side.
  { id: 'thrift_yard', rect: THRIFT_YARD, openings: [{ inside: THRIFT_GATE, outside: [THRIFT_GATE[0], THRIFT_GATE[1] + 1] }] },
  { id: 'ward', rect: WARD, openings: STAIRS.map((s) => ({ inside: [s.x, WARD.y1] as [number, number], outside: s.top })) },
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
  // The city's blocks first, then the zone's: the city's buildings come out exactly as before the zone was added.
  const cols = [...Array.from({ length: CITY_COLS }, (_, i) => CITY_BX + i), ...Array.from({ length: ZONE_COLS }, (_, i) => i)];
  for (const bx of cols)
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
        industrial: inZone(lot.rect.x0),
      });
    }
  }
  // The Thrift Store fills its lot (drawn in city.ts; it blocks the tiles like any building).
  out.push({ x: THRIFT.x0, y: THRIFT.y0, w: LOT_SIZE, h: LOT_SIZE, height: 2.6, color: WALL_COLORS[3], front: 's', custom: true });
  // The Yard's two side buildings (007-C and 007-D), with the courtyard between them.
  for (const b of YARD_SIDES) out.push({ ...b, height: 1.5, color: WALL_COLORS[2], front: 's', boarded: true });
  return out;
})();

// ---------- cooking stations (docs/design.md §13) ----------
// Where you cook: stand next to one. The server has the same list (public.stations): keep them in step.
export interface Station {
  id: string;
  /** What you do at it: cook (bbq), press sheets (press) or make gear (bench). */
  kind: 'bbq' | 'press' | 'bench';
  x: number;
  y: number;
  /** How it looks: the park's brick barbecue (default), or a burning oil drum (the sewer). */
  look?: 'barrel';
}
/** The pocket park with the barbecue (003-B). */
export const BBQ_PARK: Rect = lot('003', 'B');
export const STATIONS: Station[] = [
  { id: 'bbq_0', kind: 'bbq', x: BBQ_PARK.x0 + 2, y: BBQ_PARK.y0 + 2 },
  // In the sewer: a burning oil drum against the north wall, where a crate stood (so the rats' patches stay the same).
  { id: 'barrel_0', kind: 'bbq', x: SEWER.x0 + 11, y: SEWER.y0, look: 'barrel' },
  // The Factory: 3 plate presses along the west wall, 3 workbenches along the east wall (Tinkering).
  ...[2, 5, 8].map((dy, i) => ({ id: `press_${i}`, kind: 'press' as const, x: FACTORY.x0, y: FACTORY.y0 + dy })),
  ...[2, 5, 8].map((dy, i) => ({ id: `bench_${i}`, kind: 'bench' as const, x: FACTORY.x1, y: FACTORY.y0 + dy })),
];

// ---------- fixtures: solid things you walk around (drawn in city.ts) ----------
export type FixtureKind = 'shelf' | 'counter' | 'hedge' | 'tree' | 'fountain' | 'bench' | 'flowers' | 'pond' | 'backbar' | 'bar' | 'table' | 'jukebox' | 'booth' | 'fridge' | 'pump' | 'rack' | 'bbq' | 'couch' | 'barrel' | 'fence' | 'bed' | 'desk' | 'crate' | 'trash' | 'ladder' | 'manhole' | 'press' | 'bench';
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

  // The hospital: three beds along each wall of the ward, the reception desk in the lobby (the receptionist stands
  // behind it, in the middle).
  for (const x of [WARD.x0, WARD.x1]) for (let dy = 0; dy < 3; dy++) out.push({ x, y: WARD.y0 + dy, kind: 'bed' });
  for (const dx of [1, 2]) out.push({ x: LOBBY.x0 + dx, y: LOBBY.y0 + 2, kind: 'desk' });

  // The sewer: the ladder, crates and rubbish bags against the walls; the pothole in the street.
  const sw = (dx: number, dy: number, kind: FixtureKind) => out.push({ x: SEWER.x0 + dx, y: SEWER.y0 + dy, kind });
  sw(2, 0, 'ladder');
  for (const dx of [5, 20]) sw(dx, 0, 'crate'); // (dx 11 is the fire barrel, a cooking station)
  for (const dx of [12, 21]) sw(dx, 0, 'trash');
  for (const dx of [3, 9, 15, 21]) sw(dx, 11, 'crate');
  sw(10, 11, 'trash');
  out.push({ x: MANHOLE[0], y: MANHOLE[1], kind: 'manhole' });

  // The Factory: crates stacked at the back.
  for (const dx of [2, 3, 6, 7]) out.push({ x: FACTORY.x0 + dx, y: FACTORY.y0, kind: 'crate' });

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
  // Five dumpsters in the Thrift Store's yard (Scrapping: tin salvage).
  THRIFT_DUMPSTERS.forEach(([x, y], i) => node(`dumpster_${i}`, 'tin_salvage', x, y, { facing: x === THRIFT_YARD.x0 ? Math.PI / 2 : x === THRIFT_YARD.x1 ? -Math.PI / 2 : 0 }));
  // Four shelves at the gas station, either side of the fridge.
  [0, 1, 3, 4].forEach((dx, i) => node(`gas_${i}`, 'gas_station', GAS.x0 + dx, GAS.y0, { facing: 0 }));
  return out;
})();

/**
 * Can you step from tile a to tile b? Crossing the edge of a walled or fenced area only works
 * through one of its openings (straight, not diagonally). Everything else is decided by the blocked grid.
 */
export function canStep(ax: number, ay: number, bx: number, by: number) {
  // Stairs only go up and down: no stepping on or off them sideways.
  if (ax !== bx && (onStairs(ax, ay) || onStairs(bx, by))) return false;
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
export type NpcKind = 'shopkeeper' | 'baller' | 'clerk' | 'bartender' | 'guard' | 'receptionist' | 'doctor';
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
  // Ray runs the weapon store: he sells the tin weapons (the starter kit) and buys weapons and armour.
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
  // The hospital: the receptionist behind her desk, and two doctors walking around the ward (between the beds).
  { id: 'receptionist', name: 'Receptionist', role: 'Hospital', kind: 'receptionist', x: LOBBY.x0 + 2, y: LOBBY.y0 + 1, area: { x0: LOBBY.x0 + 2, y0: LOBBY.y0 + 1, x1: LOBBY.x0 + 2, y1: LOBBY.y0 + 1 }, named: true },
  { id: 'doctor_0', name: 'Doctor', role: 'Hospital', kind: 'doctor', x: WARD.x0 + 2, y: WARD.y0 + 1, area: { x0: WARD.x0 + 1, y0: WARD.y0, x1: WARD.x1 - 1, y1: WARD.y1 - 1 }, named: false },
  { id: 'doctor_1', name: 'Doctor', role: 'Hospital', kind: 'doctor', x: WARD.x1 - 1, y: WARD.y0 + 3, area: { x0: WARD.x0 + 1, y0: WARD.y0, x1: WARD.x1 - 1, y1: WARD.y1 - 1 }, named: false },
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
  /** The ambulance parked by the hospital. */
  ambulance?: boolean;
}
export const PARKED_CARS: ParkedCar[] = (() => {
  const out: ParkedCar[] = [];
  const rng = mulberry32(7);
  const colors = [0x8a2f28, 0x2f4562, 0x9a7a2e, 0x35553a, 0xb0aa9c, 0x6a4526, 0x2e5f5b, 0x5a5f66];
  // Each street between two crossings is one block long (10 tiles). About half get a car, in the lane next to one
  // of the two sidewalks (lane tiles 2 or 4 of the 7-wide street), never in front of the spawn.
  for (let k = 0; k <= BROWS; k++)
    for (let bx = CITY_BX; bx < CITY_BX + CITY_COLS; bx++) {
      if (rng() < 0.45) continue;
      const lane = k * PITCH + (rng() < 0.5 ? 2 : 4);
      // Between the zebra crossings at both ends (they take the first and last 3 tiles of the street).
      const x = bx * PITCH + STREET + 3 + Math.floor(rng() * 2);
      if (lane === SPAWN[1] || (SPAWN[0] >= x - 1 && SPAWN[0] <= x + 3 && Math.abs(lane - SPAWN[1]) < 3)) continue;
      out.push({ x, y: lane, along: 'x', color: colors[Math.floor(rng() * colors.length)] });
    }
  for (let k = CITY_BX; k <= CITY_BX + CITY_COLS; k++)
    for (let by = 0; by < BROWS; by++) {
      if (rng() < 0.55) continue;
      const lane = k * PITCH + (rng() < 0.5 ? 2 : 4);
      const y = by * PITCH + STREET + 3 + Math.floor(rng() * 2);
      out.push({ x: lane, y, along: 'y', color: colors[Math.floor(rng() * colors.length)] });
    }
  // The car parked along the hospital's side is an ambulance.
  for (const c of out) if (c.along === 'y' && c.x > HOSPITAL.x1 && c.x <= HOSPITAL.x1 + STREET && c.y >= HOSPITAL.y0 && c.y <= HOSPITAL.y1) c.ambulance = true;
  return out;
})();
export const parkedTiles = (c: ParkedCar): [number, number][] =>
  [0, 1, 2].map((i) => (c.along === 'x' ? [c.x + i, c.y] : [c.x, c.y + i]));

/** Tiles you can't walk through: buildings, fixtures, fixed spots and parked cars. Streets, alleys, parks and shop floors are open. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(GW * GH);
  // Below the island only the sewer's walkways and bridges are open.
  for (let y = H; y < GH; y++) for (let x = 0; x < GW; x++) if (!inSewer(x, y) || isSewage(x, y)) g[y * W + x] = 1;
  for (const c of PARKED_CARS) for (const [x, y] of parkedTiles(c)) g[y * W + x] = 1;
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) g[y * W + x] = 1;
  for (const f of FIXTURES) g[f.y * W + f.x] = 1;
  for (const n of NODES) if (!n.wanders) g[n.y * W + n.x] = 1;
  return g;
}

// ---------- the sewer's map (shown instead of the island's while you're down there) ----------
export const SEWER_AREAS: Area[] = [
  {
    id: 'sewer_ladder', name: 'Ladder up', rect: { x0: SEWER_LADDER[0], y0: SEWER_LADDER[1], x1: SEWER_LADDER[0], y1: SEWER_LADDER[1] }, icon: 'ladder', crimes: [], npcs: [],
    blurb: 'Back up to the street, by the pothole east of the candy shop.',
  },
  {
    id: 'sewer_fire', name: 'Fire barrel', rect: { x0: SEWER.x0 + 11, y0: SEWER.y0, x1: SEWER.x0 + 11, y1: SEWER.y0 }, icon: 'fire', crimes: [], npcs: [],
    blurb: 'A burning oil drum. Cook your rat meat here without going back up (Cooking).',
  },
  {
    id: 'sewer_rats_n', name: 'Rats', rect: { x0: SEWER.x0 + 14, y0: SEWER.y0 + 1, x1: SEWER.x0 + 14, y1: SEWER.y0 + 1 }, icon: 'rat', crimes: [], npcs: [],
    blurb: 'Five rats along the north walkway (level 3, not aggressive). They always drop raw rat meat.',
  },
  {
    id: 'sewer_rats_s', name: 'Rats', rect: { x0: SEWER.x0 + 12, y0: SEWER.y1 - 1, x1: SEWER.x0 + 12, y1: SEWER.y1 - 1 }, icon: 'rat', crimes: [], npcs: [],
    blurb: 'Five rats along the south walkway, across the bridges (level 3, not aggressive).',
  },
];

// ---------- areas (for the world map) ----------
export type AreaIcon = 'park' | 'court' | 'shop' | 'candy' | 'bar' | 'gas' | 'lot' | 'weapons' | 'fire' | 'thugs' | 'hospital' | 'dungeon' | 'ladder' | 'rat' | 'scrap' | 'factory';
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
    id: 'factory', name: 'The Factory', rect: FACTORY_SITE, icon: 'factory', crimes: [], npcs: [],
    blurb: 'An abandoned factory in the Industrial zone. Press salvage into sheets and make weapons and armour at the workbenches (Tinkering).',
  },
  {
    id: 'thrift', name: 'Thrift Store', rect: { x0: THRIFT.x0, y0: THRIFT.y0, x1: THRIFT_YARD.x1, y1: THRIFT_YARD.y1 }, icon: 'scrap', crimes: ['tin_salvage'], npcs: [],
    blurb: 'Behind the store, a fenced yard full of dumpsters. Dig through them for tin salvage (Scrapping).',
  },
  {
    id: 'sewer', name: 'The sewer', rect: { x0: MANHOLE[0], y0: MANHOLE[1], x1: MANHOLE[0], y1: MANHOLE[1] }, icon: 'dungeon', crimes: [], npcs: [],
    blurb: 'A pothole in the crossing leads down into the sewer, where ten rats live (level 3). A good place to train, and they drop meat you can cook.',
  },
  {
    id: 'hospital', name: 'Hospital', rect: HOSPITAL, icon: 'hospital', crimes: [], npcs: ['receptionist'],
    blurb: 'Where you wake up after passing out, in the ward upstairs. Take the stairs down to get back out.',
  },
  {
    id: 'yard', name: 'The Yard', rect: YARD, icon: 'thugs', crimes: [], npcs: [],
    blurb: 'A rough courtyard where three thugs hang around with knives (level 5). Fight them for cash, and now and then a tin knife.',
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
    blurb: 'The weapon store. Ray sells the tin weapons: knuckles $50, a bat $100, a knife $150. He buys weapons and armour.',
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
