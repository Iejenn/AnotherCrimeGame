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
/** The Financial district: 3 × 3 blocks east of the city (the bank; v0.42). */
export const FIN_COLS = 3;
export const BCOLS = ZONE_COLS + CITY_COLS + FIN_COLS;
/** v0.54: the map grew a row of districts to the south (3 more block rows: blocks 010–018, I-010–I-018, F-010–F-018).
 *  The first OLD_ROWS rows are the map as it was: things that roll random numbers per block or lot roll those first,
 *  in the old order, so the old map comes out exactly the same. */
export const OLD_ROWS = 3;
export const BROWS = 6;
/** The city's first block column. */
export const CITY_BX = ZONE_COLS;
/** How far east the city moved when the Industrial zone came in on its west side (v0.41): 3 blocks. */
export const CITY_X = ZONE_COLS * PITCH;
/** The Financial district's first block column (east of the city). */
export const FIN_BX = ZONE_COLS + CITY_COLS;
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
// Blocks are numbered row by row from the north-west corner: 001 002 003 / 004 005 006 / 007 008 009, and on south
// through 010–018 (v0.54).
// Lots in a block: A = north-west, B = north-east, C = south-west, D = south-east.
//   A B
//   C D
export type LotLetter = 'A' | 'B' | 'C' | 'D';
/** City blocks are 001–009; the Industrial zone's are I-001–I-009 and the Financial district's F-001–F-009 (numbered the
 *  same way, within the district). */
export const blockName = (bx: number, by: number) =>
  bx >= FIN_BX
    ? `F-${String(by * FIN_COLS + (bx - FIN_BX) + 1).padStart(3, '0')}`
    : bx >= CITY_BX
      ? String(by * CITY_COLS + (bx - CITY_BX) + 1).padStart(3, '0')
      : `I-${String(by * ZONE_COLS + bx + 1).padStart(3, '0')}`;
/** West of the city's first block: the Industrial zone. */
export const inZone = (x: number) => x < CITY_X;
export const lotLetter = (lx: number, ly: number): LotLetter => (['A', 'B', 'C', 'D'] as const)[ly * 2 + lx];
export const lotName = (bx: number, by: number, lx: number, ly: number) => `${blockName(bx, by)}-${lotLetter(lx, ly)}`;
/** Block "005" → (bx, by). */
const blockXY = (name: string): [number, number] => {
  const district = name.startsWith('I-') ? 0 : name.startsWith('F-') ? FIN_BX : CITY_BX;
  const n = Number(/^[IF]-/.test(name) ? name.slice(2) : name) - 1;
  if (!(n >= 0 && n < 3 * BROWS)) throw new Error(`no block ${name}`);
  return [(n % 3) + district, Math.floor(n / 3)];
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

// ---------- Central Park (Pickpocket Tourists, level 1; the Pigeons) ----------
// v0.54: a big park in the shape of a cross, the middle of the levels 1–10 district: the old park (008) at the top,
// 010, 011 and 012 across, 014 at the bottom, and the streets between them turned into park too. In the middle
// (011) the Plaza: a wide paved square with a big fountain, where new players start and everyone meets. Around it
// lawns with hedges along the outside, gravel paths in a # in every lawn block (they run on through the joins), ponds,
// trees, flowerbeds and benches. Six tourists stroll around, and eight Pigeons live here.
//                008
//           010  011  012        (the joins between them are park, not street)
//                014
/** The old park block (the cross's top arm). */
export const PARK: Rect = block('008');
/** The Plaza: the cross's middle block. */
export const PLAZA: Rect = block('011');
/** The park's five blocks (the Plaza is the same object as PLAZA). */
export const PARK_BLOCKS: Rect[] = ['008', '010', '011', '012', '014'].map((b) => (b === '011' ? PLAZA : block(b)));
/** The four pieces of street between them that are park now (each one block wide, a street deep). */
export const PARK_JOINS: Rect[] = [
  { x0: PLAZA.x0, y0: PLAZA.y0 - STREET, x1: PLAZA.x1, y1: PLAZA.y0 - 1 }, // north (to 008)
  { x0: PLAZA.x0, y0: PLAZA.y1 + 1, x1: PLAZA.x1, y1: PLAZA.y1 + STREET }, // south (to 014)
  { x0: PLAZA.x0 - STREET, y0: PLAZA.y0, x1: PLAZA.x0 - 1, y1: PLAZA.y1 }, // west (to 010)
  { x0: PLAZA.x1 + 1, y0: PLAZA.y0, x1: PLAZA.x1 + STREET, y1: PLAZA.y1 }, // east (to 012)
];
/** Every tile of the park: its blocks and the joins. */
export const PARK_AREA: Rect[] = [...PARK_BLOCKS, ...PARK_JOINS];
export const inPark = (x: number, y: number) => PARK_AREA.some((r) => inRect(r, x, y));
/** The whole cross's bounding box. */
export const PARK_BOUNDS: Rect = { x0: PARK_JOINS[2].x0 - BLOCK_SIZE, y0: PARK.y0, x1: PARK_JOINS[3].x1 + BLOCK_SIZE, y1: PARK_JOINS[1].y1 + BLOCK_SIZE };
/** The gravel paths: these rows and columns (offsets inside a lawn block), out through the gaps in the hedges. */
export const PARK_PATHS = { rows: [2, 7], cols: [2, 7] };
/** Is this park tile on a gravel path? (In a lawn block or a join; the Plaza is paved all over.) */
export function onParkPath(x: number, y: number) {
  if (!inPark(x, y) || inRect(PLAZA, x, y)) return false;
  // Paths line up with the blocks' columns and rows: a vertical join carries the column paths, a horizontal one the rows.
  const cx = (((x - STREET) % PITCH) + PITCH) % PITCH;
  const cy = (((y - STREET) % PITCH) + PITCH) % PITCH;
  const join = PARK_JOINS.findIndex((r) => inRect(r, x, y));
  if (join === 0 || join === 1) return PARK_PATHS.cols.includes(cx);
  if (join === 2 || join === 3) return PARK_PATHS.rows.includes(cy);
  return PARK_PATHS.cols.includes(cx) || PARK_PATHS.rows.includes(cy);
}
/** The Plaza's fountain: 4×4 tiles in its middle. */
export const PLAZA_FOUNTAIN: Rect = { x0: PLAZA.x0 + 3, y0: PLAZA.y0 + 3, x1: PLAZA.x0 + 6, y1: PLAZA.y0 + 6 };

/** Where you start (v0.54: on the Plaza, just north of the fountain, the benches behind you). The server has the same
 *  tile (game.can_reach, game.world). */
export const SPAWN: [number, number] = [PLAZA.x0 + 4, PLAZA.y0 + 2];

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
/** Eddy's General Store (v0.54: moved to the Financial district, F-002). The server checks you're inside it when you
 *  sell (sell_item). */
export const STORE = room('store', "Eddy's General Store", lot('F-002', 'C'), true);
/** The candy store (Shoplift Candy Store, level 10), facing the park. */
export const CANDY = room('candy', 'Candy store', lot('005', 'C'), true);
/** The bar (Pickpocket Drunks, level 15; v0.54: moved to the Industrial zone, I-009-C, with the levels 10–20 places).
 *  v0.58: twice as big, the whole west half of I-009 (5 wide, 10 deep), next to the Yard (see TURF_SITE). */
const BAR_BLOCK = block('I-009');
export const BAR = room('bar', 'The bar', { x0: BAR_BLOCK.x0, y0: BAR_BLOCK.y0, x1: BAR_BLOCK.x0 + LOT_SIZE - 1, y1: BAR_BLOCK.y1 }, false, BLOCK_SIZE);
/** Where the bartender stands to polish the bottles, spot 0–2 (watchers.ts): along his aisle behind the counter. */
export const barSpot = (spot: number): [number, number] => [BAR.x0 + 1, BAR.y0 + spot * 2];
/** Which way he faces: the room (east) while he watches, the back bar (west) while he polishes. */
export const BAR_FACING = { watch: Math.PI / 2, polish: -Math.PI / 2 };
/** The gas station shop (Shoplift Gas Station, level 25; v0.54: moved to F-015, the levels 21–30 district): the
 *  top-left lot of its block. The shop is its top four rows; the pumps stand in the row in front of it, under a canopy. */
export const GAS = room('gas', 'Gas station', lot('F-015', 'A'), true, 4);
/** Ray's weapon store (combat, docs/design.md §12), next to Eddy's (v0.54: F-002). The server checks you're inside it
 *  when you buy (buy_item). */
export const WEAPONS = room('weapons', "Ray's Arms", lot('F-002', 'D'), true);

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
  // On the beach (v0.57): the sand, a little below the streets.
  if (onBeach(Math.floor(x), Math.floor(z))) return -0.08;
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
export const STATION: Rect = block('F-015'); // (v0.54: was 006)
/** The north-east parking lot and the long south strip. */
export const PARKING_NE: Rect = lot('F-015', 'B');
export const PARKING_S: Rect = { ...lot('F-015', 'C'), x1: lot('F-015', 'D').x1 };
export const PARKING: Rect[] = [PARKING_NE, PARKING_S];
/** Where the guard may walk (to catch you, too): the station block and the sidewalks around it. */
export const PATROL: Rect = { x0: STATION.x0 - 1, y0: STATION.y0 - 1, x1: STATION.x1 + 1, y1: STATION.y1 + 1 };
/** Areas that cover what would be road (no road paint). None since the blocks got their own streets. */
export const NO_ROAD: Rect[] = [];

/** Lots that became special places in v0.43 (the Junkyard, Hotline Plumbing & Heating, the Biker Club). Their old
 *  sheds are still "rolled" (not built) so every other lot's random buildings come out exactly as before. */
const NEW_SPECIAL: [string, LotLetter][] = [
  ['I-007', 'A'], ['I-007', 'B'], ['I-007', 'C'], ['I-007', 'D'], // the Junkyard
  ['I-008', 'A'], ['I-008', 'B'], ['I-008', 'C'], ['I-008', 'D'], // Hotline Plumbing & Heating and its yard
  ['I-002', 'A'], ['I-002', 'B'], // the Biker Club
  // v0.54: Eddy's and Ray's (F-002), the bar (I-009-C).
  ['F-002', 'C'], ['F-002', 'D'], ['I-009', 'C'],
  // v0.58: the bar and the Yard merged into one site (I-009 and 007, the street between them included).
  ['I-009', 'A'], ['I-009', 'B'], ['I-009', 'D'], ['007', 'A'], ['007', 'B'],
  // v0.56: the Superstore, its yard and its parking spot (F-013).
  ['F-013', 'A'], ['F-013', 'B'], ['F-013', 'C'], ['F-013', 'D'],
];
/** Lots that were special places and are ordinary buildings since v0.54 (Eddy's, Ray's, the bar, the gas station and
 *  its parking lot moved out). They, and the new rows' lots, roll their buildings after all the others, from their own
 *  random numbers, so no old building changes. */
const VACATED: [string, LotLetter][] = [['002', 'C'], ['002', 'D'], ['004', 'C'], ['006', 'A'], ['006', 'B'], ['006', 'C'], ['006', 'D']];
/** Their tiles (the server moves anyone standing there to the Plaza when the map grows). */
export const VACATED_RECTS: Rect[] = VACATED.map(([b, l]) => lot(b, l));
/** Lots that aren't normal buildings. */
const SPECIAL: [string, LotLetter][] = [
  ['004', 'B'], // the court
  ['005', 'C'], // the candy store
  ['F-015', 'A'], ['F-015', 'B'], ['F-015', 'C'], ['F-015', 'D'], // the gas station and its parking lot (v0.54)
  ...['008', '010', '011', '012', '014'].flatMap((b) => (['A', 'B', 'C', 'D'] as const).map((l) => [b, l] as [string, LotLetter])), // Central Park
  ['007', 'C'], ['007', 'D'], // the Yard (thugs)
  ['005', 'B'], ['005', 'D'], // the hospital
  ['009', 'C'], ['009', 'D'], // the Thrift Store and its salvage yard
  ['I-003', 'A'], ['I-003', 'B'], ['I-003', 'C'], ['I-003', 'D'], // the Factory
  ['I-006', 'A'], ['I-006', 'B'], ['I-006', 'C'], ['I-006', 'D'], // its parking lot
  ['F-005', 'A'], ['F-005', 'B'], ['F-005', 'C'], ['F-005', 'D'], // the Bank
  ...NEW_SPECIAL,
];
// (NEW_SPECIAL, the v0.43 places, is defined just above.)

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
// empty parking lot: cracked asphalt, faded lines, no cars, a chain-link fence with an opening for cars on the west and
// on the east side.
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
/** The parking lot's openings for cars: one on the west side and one on the east side, opposite each other. */
export const FACTORY_LOT_GATE: [number, number][] = [FACTORY_LOT.x0, FACTORY_LOT.x1].flatMap((x) => [
  [x, FACTORY_LOT.y0 + 6] as [number, number],
  [x, FACTORY_LOT.y0 + 7] as [number, number],
]);
ROOMS.push(FACTORY);

// ---------- Hotline Plumbing & Heating (Scrapping: copper salvage, level 11; v0.43) ----------
// The whole of I-008. A long brick-and-render workshop on the west half (A + C), its front facing WEST onto the street
// across from the Junkyard (a sign, a roll-up door for the vans, pipes against the wall; you don't go in). Behind it, on
// the east half, its yard: a half-high brick wall all round with one opening on the east side, 5 dumpsters full of
// copper offcuts, stacks of old pipe.
//   S S S S S | p D . D .     S = the store (front = west), D = a dumpster, p = stacked pipes
//   S S S S S | . . . . .
//   S S S S S | . . . . D
//   S S S S S | . . . . .
//   S S S S S | . . . . O     O = the opening in the wall (2 wide)
//   S S S S S | . . . . O
//   S S S S S | . . . . .
//   S S S S S | . . . . D
//   S S S S S | . . . . .
//   S S S S S | p . D . .
const HOTLINE_BLOCK = block('I-008');
export const HOTLINE: Rect = { x0: HOTLINE_BLOCK.x0, y0: HOTLINE_BLOCK.y0, x1: HOTLINE_BLOCK.x0 + LOT_SIZE - 1, y1: HOTLINE_BLOCK.y1 };
export const HOTLINE_YARD: Rect = { x0: HOTLINE_BLOCK.x0 + LOT_SIZE, y0: HOTLINE_BLOCK.y0, x1: HOTLINE_BLOCK.x1, y1: HOTLINE_BLOCK.y1 };
export const HOTLINE_GATE: [number, number][] = [[HOTLINE_YARD.x1, HOTLINE_YARD.y0 + 4], [HOTLINE_YARD.x1, HOTLINE_YARD.y0 + 5]];
export const HOTLINE_DUMPSTERS: [number, number][] = [[1, 0], [3, 0], [4, 2], [4, 7], [2, 9]].map(([dx, dy]) => [HOTLINE_YARD.x0 + dx, HOTLINE_YARD.y0 + dy]);

// ---------- the Junkyard (guard dogs, level 8; v0.43) ----------
// The whole of I-007, across the street from Hotline: a tall corrugated fence all round with one gate (2 wide) on the
// east side. Inside: stacks of crushed cars, piles of tyres, an old crane, a dog house. Four guard dogs roam it.
//   t . w w . . c c . t      w = crushed cars, t = tyres, c = the crane, h = the dog house, G = the gate
//   . . . . . . c c . .
//   w . . . . . . . . t
//   w . . h . . . . . .
//   . . . . . . . . . G
//   . . . . . . . . . G
//   . . . . . w w . . .
//   . . . . . . . . . .
//   w . . . . . . . . .
//   w w . . t . . w w .
export const JUNKYARD: Rect = block('I-007');
export const JUNKYARD_GATE: [number, number][] = [[JUNKYARD.x1, JUNKYARD.y0 + 4], [JUNKYARD.x1, JUNKYARD.y0 + 5]];
const JUNK: [number, number, FixtureKind][] = [
  ...([[0, 2], [0, 3], [0, 8], [0, 9], [1, 9], [7, 9], [8, 9]] as const).map(([x, y]) => [x, y, 'wreck'] as [number, number, FixtureKind]),
  // (v0.45: two old trucks, each over two tiles, where crushed cars stood.)
  ...([[2, 0], [3, 0], [5, 6], [6, 6]] as const).map(([x, y]) => [x, y, 'junktruck'] as [number, number, FixtureKind]),
  ...([[0, 0], [9, 0], [9, 2], [4, 9]] as const).map(([x, y]) => [x, y, 'tyres'] as [number, number, FixtureKind]),
  ...([[6, 0], [7, 0], [6, 1], [7, 1]] as const).map(([x, y]) => [x, y, 'crane'] as [number, number, FixtureKind]),
  [3, 3, 'doghouse'],
];

// ---------- the Biker Club (bikers, level 15, aggressive; v0.43) ----------
// The north half of I-002 (A + B), facing NORTH onto the street: dark brick, a neon sign, motorbikes parked on the
// sidewalk in front. Inside (a room: the roof lifts): a bar counter along the back wall, a pool table, a table, a
// jukebox. Three bikers hang around in it, and they jump anyone who walks in (one at a time).
//   . . . . D D . . . .   y 7   D = the door (2 wide, north)
//   . . . . . . . . . .
//   . P P . . . . . T .         P = the pool table, T = a table
//   . . . . . . . . . .
//   K K K K K . . J . T   y 11  K = the bar counter, J = the jukebox
const CLUB_LOTS = { a: lot('I-002', 'A'), b: lot('I-002', 'B') };
export const CLUB: Room = {
  x0: CLUB_LOTS.a.x0, y0: CLUB_LOTS.a.y0, x1: CLUB_LOTS.b.x1, y1: CLUB_LOTS.a.y1,
  id: 'club', name: 'Iron Saints MC', door: [CLUB_LOTS.a.x0 + 4, CLUB_LOTS.a.y0], shop: false,
};
export const CLUB_DOOR: [number, number][] = [[CLUB.x0 + 4, CLUB.y0], [CLUB.x0 + 5, CLUB.y0]];
/** The motorbikes parked on the sidewalk in front (solid). */
export const CLUB_BIKES: [number, number][] = [1, 2, 7, 8].map((dx) => [CLUB.x0 + dx, CLUB.y0 - 1]);
ROOMS.push(CLUB);

// ---------- the Bank (Financial district, F-005; v0.42) ----------
// A large stone bank filling the middle block of the Financial district, facing south (steps up to two big doors, columns,
// "BANK" over the entrance). Inside (a room: the roof lifts): a long counter with three bankers behind it (talk to one to
// open your bank), the vault door in the back wall, a guard by the door.
//   x 126 ……………………… 135
//   . . . V V . . . . .   y 24   V = the vault door
//   . b . . b . . b . .          b = a banker (behind the counter)
//   . K K K K K K K K .          K = the counter
//   . . . . . . . . . .          you stand here to talk to a banker
//   …
//   . g . . D D . . . .   y 32   D = the doors (2 wide), g = the guard
//   (steps, y 33)
const BANK_BLOCK = block('F-005');
export const BANK: Room = {
  x0: BANK_BLOCK.x0, y0: BANK_BLOCK.y0, x1: BANK_BLOCK.x1, y1: BANK_BLOCK.y0 + 8,
  id: 'bank', name: 'The Bank', door: [BANK_BLOCK.x0 + 4, BANK_BLOCK.y0 + 8], shop: false,
};
export const BANK_DOOR: [number, number][] = [[BANK.x0 + 4, BANK.y1], [BANK.x0 + 5, BANK.y1]];
/** The counter's row; you talk to a banker from the row in front of it. */
export const BANK_COUNTER_Y = BANK.y0 + 2;
/** How many different things fit in your bank (cash counts as one). The server has the same number (game.bank_slots). */
export const BANK_SLOTS = 50;
ROOMS.push(BANK);

// ---------- the Superstore (Scrapping: aluminium salvage, level 21; v0.56) ----------
// F-013, in the levels 21–30 district. A big supermarket on the two south lots (C + D), its front on the south street
// (a wide glass front, the sign, shopping carts; you don't go in). Behind it, on B, its walled yard: five dumpsters
// full of crushed cans and foil, the gate on the east street. On A, a little parking spot of its own: one car and one
// meter (no guard: one of each makes it slow, so it's fine). (The store's number on the sign is #1217.)
//   . . . . . | D . D . .     the parking spot (open to the street on the north and west): c = the car (nose-in),
//   . . . . . | . . . . .     m = the meter at the head of its bay; D = a dumpster, G = the gate (2 wide)
//   . . c . . | D . . . G
//   . . c . . | . . . . G
//   . . m . . | D . D . .
//   S S S S S   S S S S S     S = the Superstore (front = south)
const SUPERSTORE_BLOCK = block('F-013');
export const SUPERSTORE: Rect = { ...lot('F-013', 'C'), x1: lot('F-013', 'D').x1 };
export const SUPERSTORE_YARD: Rect = lot('F-013', 'B');
export const SUPERSTORE_LOT: Rect = lot('F-013', 'A');
export const SUPERSTORE_GATE: [number, number][] = [[SUPERSTORE_YARD.x1, SUPERSTORE_YARD.y0 + 2], [SUPERSTORE_YARD.x1, SUPERSTORE_YARD.y0 + 3]];
export const SUPERSTORE_DUMPSTERS: [number, number][] = [[0, 0], [2, 0], [0, 2], [0, 4], [2, 4]].map(([dx, dy]) => [SUPERSTORE_YARD.x0 + dx, SUPERSTORE_YARD.y0 + dy]);
void SUPERSTORE_BLOCK;

export const THRIFT_DUMPSTERS: [number, number][] = [[2, 0], [0, 2], [4, 2], [0, 4], [4, 4]].map(([dx, dy]) => [THRIFT_YARD.x0 + dx, THRIFT_YARD.y0 + dy]);

// ---------- the Yard (thugs, level 5; docs/design.md §12) ----------
// v0.58: the bar's block (I-009) and the Yard's (007) are one site, the street between them included (like the
// Factory). The bar fills the west half of I-009; everything east of it is the Yard: a vacant lot where a building was
// torn down, now a gang's hangout. Boarded-up buildings along its north and east sides, a chain-link fence along the
// south street with three gaps (the gates). A shipping container they use as a clubhouse, the couch and the fire
// barrel, a half-demolished wall with rubble, a stripped car on blocks, a dice game on a crate, a lookout's chair by the
// middle gate. Eight thugs hang around in it, each pair in its own quarter (THUG_QUARTERS).
//   x 41    45 46                                   65 66 67
//     bar     | N N N N N N N N N N N N N N N N N N N N E E   y 41–42  N/E = boarded-up buildings
//             | K K K K . . c c . . . . . . r . . . w w E E   y 43     K = the container, c = couch, w = wrecked cars
//             | K K K K . . . B . . . . . . . . . . . . E E            B = the fire barrel (a cooking spot)
//             | . . . . . . . . . . . . . . . . . . . . E E
//             | t . . . . . . . . . R R R r . . S S . . E E            R = the half wall, r = rubble, S = stripped car
//             | . . . . . . d . . . . . . . . . . . . . E E            d = the dice game, t = tyres
//             | . . . r . . . . . . . . . . . . . . t E E
//             | . . . . . . . . L . . . . . . . . . . . E E   y 49     L = the lookout
//      D      | f f f G f f f f f G f f f f f G f f f f E E   y 50     f = fence, G = a gate, D = the bar's door
/** The whole site: the bar and the Yard, with the street between I-009 and 007. */
export const TURF_SITE: Rect = { x0: BAR_BLOCK.x0, y0: BAR_BLOCK.y0, x1: block('007').x1, y1: BAR_BLOCK.y1 };
/** The Yard's open ground (its south row is the fence). */
export const YARD: Rect = { x0: BAR.x1 + 1, y0: TURF_SITE.y0 + 2, x1: TURF_SITE.x1 - 2, y1: TURF_SITE.y1 };
/** The boarded-up buildings round it: a row along the north side (four of them), one along the east side. */
const YARD_SIDES = [
  ...[[0, 5], [5, 4], [9, 6], [15, 5]].map(([dx, w]) => ({ x: YARD.x0 + dx, y: TURF_SITE.y0, w, h: 2 })),
  { x: YARD.x1 + 1, y: TURF_SITE.y0, w: 2, h: BLOCK_SIZE },
];
/** The three gaps in the fence (the entrances), on its south row. */
export const YARD_GATES: [number, number][] = [3, 9, 15].map((dx) => [YARD.x0 + dx, YARD.y1]);
/** Each pair of thugs keeps to its own quarter of the Yard (5 tiles wide), so they stroll about as far as they used to. */
export const THUG_QUARTERS: Rect[] = [0, 1, 2, 3].map((i) => ({ x0: YARD.x0 + i * 5, y0: YARD.y0, x1: YARD.x0 + i * 5 + 4, y1: YARD.y1 - 1 }));

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
/** The grid the game walks on: the island, then the sewer below it (GRID adds a border round it, for the beach). */
export const GW = W;
export const GH = SEWER.y1 + 3;
// ---------- the tile grid everything walks on (v0.57: with a border round it for the beach) ----------
/** Tiles of border round the city in the grid (the beach is at most 5 wide). */
export const GRID_MARGIN = 6;
/** The grid: from (GRID.x0, GRID.y0), GRID.w × GRID.h tiles: the city with its beach, and the sewer below it. */
export const GRID = { x0: -GRID_MARGIN, y0: -GRID_MARGIN, w: W + 2 * GRID_MARGIN, h: GH + GRID_MARGIN };
/** A tile's index in the grid's arrays. */
export const gi = (x: number, y: number) => (y - GRID.y0) * GRID.w + (x - GRID.x0);
/** Is the tile in the grid? */
export const inGrid = (x: number, y: number) => x >= GRID.x0 && y >= GRID.y0 && x < GRID.x0 + GRID.w && y < GRID.y0 + GRID.h;

// ---------- the Rat Nest (giant rats, level 12; v0.43) ----------
// East of the sewer: from the end of the north walkway a narrow tunnel runs east to a dark chamber where three giant rats
// live on a mound of junk. A locked iron gate in the tunnel: Splinter's Sewer Key (the quest "Sewer Problems") opens it,
// for you only (players.unlocked); for everyone else it stays locked. The server checks it (walk, attack).
//   sewer … . S | . . G . | N N N N N N N N N N     S = Splinter (sits against the north wall), G = the gate
//                tunnel (y 65)    the nest (x 46–55, y 63–70)
export const NEST_TUNNEL: Rect = { x0: SEWER.x1 + 1, y0: SEWER.y0 + 1, x1: SEWER.x1 + 4, y1: SEWER.y0 + 1 };
export const NEST: Rect = { x0: NEST_TUNNEL.x1 + 1, y0: SEWER.y0 - 1, x1: NEST_TUNNEL.x1 + 10, y1: SEWER.y0 + 6 };
export const NEST_GATE: [number, number] = [NEST_TUNNEL.x0 + 2, NEST_TUNNEL.y0];
/** Behind the gate (the gate's tile included): only for players who unlocked it. The server has the same rectangle. */
export const NEST_LOCKED: Rect = { x0: NEST_GATE[0], y0: NEST.y0, x1: NEST.x1, y1: NEST.y1 };
export const inNestLocked = (x: number, y: number) => inRect(NEST_LOCKED, x, y) && (inRect(NEST, x, y) || inRect(NEST_TUNNEL, x, y));
/** Where Splinter sits: against the sewer's north wall, by the tunnel. */
export const SPLINTER: [number, number] = [SEWER.x0 + 22, SEWER.y0];
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
/** The box around everything underground (the sewer's own map shows this). */
export const UNDER: Rect = { x0: SEWER.x0, y0: NEST.y0, x1: NEST.x1, y1: SEWER.y1 };
/** Underground: the sewer, the tunnel to the Rat Nest, and the nest. */
export const inSewer = (x: number, y: number) => inRect(SEWER, x, y) || inRect(NEST_TUNNEL, x, y) || inRect(NEST, x, y);
/** A sewage tile (not a bridge). */
export const isSewage = (x: number, y: number) => {
  const dx = x - SEWER.x0;
  const dy = y - SEWER.y0;
  return inRect(SEWER, x, y) && dy >= SEWER_CHANNEL.y0 && dy <= SEWER_CHANNEL.y1 && !SEWER_BRIDGES.some((b) => dx === b || dx === b + 1);
};
// ---------- the coast (v0.55; v0.57: you can walk on the beach) ----------
// A sandy beach round the city whose width wobbles (1–4 tiles), round at the corners, then shallow water, then the open
// sea. Drawn by the floor kit (city.ts), flat on the maps (mapArt.ts). The sand is walkable; rocks along the waterline
// are solid. The server knows the sand tiles (game.beach).
/** How far out from the city the shallow water reaches (tiles); beyond it is the open sea. */
export const SHALLOWS = 9;
/** How wide the beach is at a point on the coast (tiles): a smooth wobble from the angle round the island. */
function beachWidth(x: number, y: number) {
  const a = Math.atan2(y - H / 2, x - W / 2);
  // Measured along the coast (about the island's size), so the wobble is the same size on every side.
  const p = a * ((W + H) / Math.PI);
  return 2.4 + Math.sin(p * 0.21) * 0.9 + Math.sin(p * 0.53 + 1.3) * 0.6 + Math.sin(p * 0.09 + 0.4) * 0.5;
}
/** What's on tile (x, y) outside the city: sand, water, or nothing (the city itself, or the open sea). */
export function coastAt(x: number, y: number): 'sand' | 'water' | null {
  if (x >= 0 && y >= 0 && x < W && y < H) return null;
  // How far the tile's middle is from the city (round at the corners).
  const cx = x + 0.5, cy = y + 0.5;
  const dx = cx < 0 ? -cx : cx > W ? cx - W : 0;
  const dy = cy < 0 ? -cy : cy > H ? cy - H : 0;
  const d = Math.hypot(dx, dy);
  if (d <= Math.max(1, beachWidth(cx, cy))) return 'sand';
  // (The shallows end in a straight line, far out in the fog: a circle of tiles there would show as steps.)
  if (Math.max(dx, dy) <= SHALLOWS) return 'water';
  return null;
}
export const onBeach = (x: number, y: number) => coastAt(x, y) === 'sand';
/** Rocks along the waterline (v0.57: solid): on sand next to the water, about one in four; and how each looks. */
export const COAST_ROCKS: { x: number; y: number; ox: number; oz: number; sc: number; sy: number; rot: number }[] = (() => {
  const out: { x: number; y: number; ox: number; oz: number; sc: number; sy: number; rot: number }[] = [];
  const rng = mulberry32(99);
  for (let y = -SHALLOWS; y < H + SHALLOWS; y++)
    for (let x = -SHALLOWS; x < W + SHALLOWS; x++) {
      if (coastAt(x, y) !== 'sand' || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => coastAt(x + dx, y + dy) === 'water')) continue;
      if (rng() < 0.75) continue;
      const sc = 0.5 + rng() * 1.1;
      out.push({ x, y, ox: 0.2 + rng() * 0.6, oz: 0.2 + rng() * 0.6, sc, sy: sc * (0.5 + rng() * 0.4), rot: rng() * 6 });
    }
  return out;
})();

/** A tile you could be on: the island, the beach (v0.57), or the sewer. */
export const onMap = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H) || inSewer(x, y) || onBeach(x, y);


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
  ...ROOMS.filter((r) => r !== LOBBY && r.id !== 'factory' && r.id !== 'bank' && r.id !== 'club').map((r) => ({ id: r.id, rect: r as Rect, openings: [{ inside: r.door, outside: [r.door[0], r.door[1] + 1] as [number, number] }] })),
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
      ...FACTORY_LOT_GATE.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x === FACTORY_LOT.x0 ? x - 1 : x + 1, y] as [number, number] })),
    ],
  },
  // The Bank: its two big doors.
  { id: 'bank', rect: BANK, openings: BANK_DOOR.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x, y + 1] as [number, number] })) },
  // Hotline's yard (a half-high wall, one opening east), the Junkyard (a fence, one gate east), the Biker Club (its door).
  { id: 'hotline_yard', rect: HOTLINE_YARD, openings: HOTLINE_GATE.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x + 1, y] as [number, number] })) },
  { id: 'junkyard', rect: JUNKYARD, openings: JUNKYARD_GATE.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x + 1, y] as [number, number] })) },
  { id: 'club', rect: CLUB, openings: CLUB_DOOR.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x, y - 1] as [number, number] })) },
  // The Superstore's yard (v0.56): a wall all round, the gate (2 wide) on the east side.
  { id: 'superstore_yard', rect: SUPERSTORE_YARD, openings: SUPERSTORE_GATE.map(([x, y]) => ({ inside: [x, y] as [number, number], outside: [x + 1, y] as [number, number] })) },
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
  // (Then the Financial district's, so neither the city's nor the zone's change.)
  const cols = [
    ...Array.from({ length: CITY_COLS }, (_, i) => CITY_BX + i),
    ...Array.from({ length: ZONE_COLS }, (_, i) => i),
    ...Array.from({ length: FIN_COLS }, (_, i) => FIN_BX + i),
  ];
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
  const rerolled = new Set(NEW_SPECIAL.map(([b, l]) => `${b}-${l}`));
  const late = new Set(VACATED.map(([b, l]) => `${b}-${l}`));
  const isLate = (lot: Lot) => lot.by >= OLD_ROWS || late.has(lot.name);
  // The old map's lots first, in their old order with their old random numbers; then the late ones (v0.54).
  for (const lot of LOTS) if (!isLate(lot)) roll(lot, rng);
  const lateRng = mulberry32(2054);
  for (const lot of LOTS) if (isLate(lot)) roll(lot, lateRng);
  function roll(lot: Lot, rng: () => number) {
    // A lot that became a special place still takes its random numbers (and builds nothing), so the rest don't change.
    const gone = rerolled.has(lot.name);
    if (lot.kind !== 'buildings' && !gone) return;
    const block = blockRect(lot.bx, lot.by);
    const layout = LAYOUTS[Math.floor(rng() * LAYOUTS.length)];
    for (const [ox, oy, w, h] of layout) {
      const big = w * h >= 10;
      const y = lot.rect.y0 + oy;
      const b: Building = {
        x: lot.rect.x0 + ox,
        y,
        w,
        h,
        height: big ? 0.9 + rng() * 1.6 : 0.7 + rng() * 1.3,
        color: WALL_COLORS[Math.floor(rng() * WALL_COLORS.length)],
        // The door faces the street: north for buildings along the block's north edge, south otherwise.
        front: y === block.y0 && y + h - 1 !== block.y1 ? 'n' : 's',
        industrial: inZone(lot.rect.x0),
      };
      if (!gone) out.push(b);
    }
  }
  // Hotline Plumbing & Heating fills the west half of I-008 (drawn in city.ts).
  out.push({ x: HOTLINE.x0, y: HOTLINE.y0, w: LOT_SIZE, h: BLOCK_SIZE, height: 2.4, color: WALL_COLORS[0], front: 's', custom: true });
  // The Superstore fills its two lots (drawn in city.ts; it blocks the tiles like any building).
  out.push({ x: SUPERSTORE.x0, y: SUPERSTORE.y0, w: 2 * LOT_SIZE, h: LOT_SIZE, height: 2.4, color: WALL_COLORS[6], front: 's', custom: true });
  // The Thrift Store fills its lot (drawn in city.ts; it blocks the tiles like any building).
  out.push({ x: THRIFT.x0, y: THRIFT.y0, w: LOT_SIZE, h: LOT_SIZE, height: 2.6, color: WALL_COLORS[3], front: 's', custom: true });
  // The Yard's boarded-up buildings (v0.58: along its north and east sides).
  YARD_SIDES.forEach((b, i) => out.push({ ...b, height: [1.6, 2.1, 1.4, 1.9, 1.7][i], color: WALL_COLORS[[2, 5, 0, 3, 2][i]], front: 's', boarded: true }));
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
  // v0.57: the Yard's burning barrel is a cooking spot too. (v0.58: in front of the couch, in the bigger Yard.)
  { id: 'barrel_1', kind: 'bbq', x: YARD.x0 + 7, y: YARD.y0 + 1, look: 'barrel' },
  // The Factory: 3 plate presses along the west wall, 3 workbenches along the east wall (Tinkering).
  ...[2, 5, 8].map((dy, i) => ({ id: `press_${i}`, kind: 'press' as const, x: FACTORY.x0, y: FACTORY.y0 + dy })),
  ...[2, 5, 8].map((dy, i) => ({ id: `bench_${i}`, kind: 'bench' as const, x: FACTORY.x1, y: FACTORY.y0 + dy })),
];

// ---------- fixtures: solid things you walk around (drawn in city.ts) ----------
export type FixtureKind = 'shelf' | 'counter' | 'hedge' | 'tree' | 'fountain' | 'bench' | 'flowers' | 'pond' | 'backbar' | 'bar' | 'table' | 'jukebox' | 'booth' | 'fridge' | 'pump' | 'rack' | 'bbq' | 'couch' | 'barrel' | 'fence' | 'bed' | 'desk' | 'crate' | 'trash' | 'ladder' | 'manhole' | 'press' | 'bench' | 'bankcounter' | 'vault' | 'pillar'
  | 'container' | 'ruin' | 'rubble' | 'stripped' | 'dice' | 'lookout'
  | 'pipes' | 'wreck' | 'junktruck' | 'lottruck' | 'pallets' | 'tyres' | 'crane' | 'doghouse' | 'clubbar' | 'pool' | 'clubtable' | 'clubjuke' | 'motorbike' | 'mound' | 'splinter';
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

  // Central Park (v0.54: the cross, PARK_AREA):
  //  - hedges along its outside edge, with gaps where the paths come in; a tree on every outside corner;
  //  - gravel paths in a # in every lawn block (rows and columns 2 and 7), running on through the joins;
  //  - the old block (008) as it was: a 2×2 fountain with benches above and below it, a pond, trees and flowerbeds;
  //  - the other lawn blocks: a pond, trees, flowerbeds and benches, each laid out a little differently;
  //  - the Plaza (011): paved, the big fountain (4×4) in the middle, benches facing it, a tree in each corner.
  {
    const parkTile = (x: number, y: number) => inPark(x, y);
    for (const r of PARK_AREA)
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          const outside = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !parkTile(x + dx, y + dy)).length;
          if (!outside || onParkPath(x, y)) continue;
          out.push({ x, y, kind: outside >= 2 ? 'tree' : 'hedge' });
        }
    const at = (b: Rect, dx: number, dy: number, kind: FixtureKind) => out.push({ x: b.x0 + dx, y: b.y0 + dy, kind });
    const P = PARK;
    for (const dx of [4, 5]) for (const dy of [4, 5]) at(P, dx, dy, 'fountain');
    for (const dx of [4, 5]) at(P, dx, 3, 'bench'), at(P, dx, 6, 'bench');
    for (const dy of [4, 5]) at(P, 8, dy, 'pond');
    for (const [dx, dy] of [[1, 4], [4, 8], [8, 1]]) at(P, dx, dy, 'tree');
    for (const [dx, dy] of [[4, 1], [1, 8], [8, 8]]) at(P, dx, dy, 'flowers');
    // The west block (010): a pond in the middle with benches round it.
    const Wb = block('010');
    for (const dx of [4, 5]) for (const dy of [4, 5]) at(Wb, dx, dy, 'pond');
    for (const dx of [4, 5]) at(Wb, dx, 3, 'bench'), at(Wb, dx, 6, 'bench');
    for (const [dx, dy] of [[1, 1], [8, 4], [4, 8], [1, 5]]) at(Wb, dx, dy, 'tree');
    for (const [dx, dy] of [[8, 1], [1, 8], [8, 8]]) at(Wb, dx, dy, 'flowers');
    // The east block (012): a grove of trees, flowerbeds, benches along the paths.
    const E = block('012');
    for (const [dx, dy] of [[4, 4], [5, 5], [4, 5], [1, 1], [8, 8], [1, 8]]) at(E, dx, dy, 'tree');
    for (const [dx, dy] of [[5, 4], [8, 1], [4, 1]]) at(E, dx, dy, 'flowers');
    for (const dx of [4, 5]) at(E, dx, 6, 'bench');
    // The south block (014): a long pond on the west side, trees and flowers.
    const S = block('014');
    for (const dy of [4, 5]) for (const dx of [0, 1]) at(S, dx, dy, 'pond');
    for (const [dx, dy] of [[4, 4], [5, 5], [8, 1], [4, 8]]) at(S, dx, dy, 'tree');
    for (const [dx, dy] of [[1, 1], [8, 4], [8, 8]]) at(S, dx, dy, 'flowers');
    for (const dx of [4, 5]) at(S, dx, 3, 'bench');
    // The Plaza: the big fountain, a bench on each side facing it, a tree in a planter in each corner.
    for (let y = PLAZA_FOUNTAIN.y0; y <= PLAZA_FOUNTAIN.y1; y++) for (let x = PLAZA_FOUNTAIN.x0; x <= PLAZA_FOUNTAIN.x1; x++) out.push({ x, y, kind: 'fountain' });
    for (const d of [4, 5]) at(PLAZA, d, 0, 'bench'), at(PLAZA, d, 9, 'bench'), at(PLAZA, 0, d, 'bench'), at(PLAZA, 9, d, 'bench');
    for (const [dx, dy] of [[0, 0], [9, 0], [0, 9], [9, 9]]) at(PLAZA, dx, dy, 'tree');
  }

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

  // The bar (v0.58: 5 wide, 10 deep). Layout (B = back bar with bottles, a = the bartender's aisle, c = the counter,
  // d = a drunk on a stool (a spot, see NODES), J = jukebox, P = pool table, T = table, D = door):
  //   B a c d J
  //   B a c d .
  //   B a c d .
  //   B a c d .
  //   B a c d .
  //   B a c d .     (the aisle opens at its south end: the bartender comes out that way to catch you)
  //   . . . . .
  //   T . P P T
  //   . . . . .
  //   . . D . .
  for (let dy = 0; dy < 6; dy++) out.push({ x: BAR.x0, y: BAR.y0 + dy, kind: 'backbar' }, { x: BAR.x0 + 2, y: BAR.y0 + dy, kind: 'bar' });
  out.push({ x: BAR.x1, y: BAR.y0, kind: 'jukebox' });
  out.push({ x: BAR.x1, y: BAR.y0 + 7, kind: 'table' }, { x: BAR.x0, y: BAR.y0 + 7, kind: 'table' });
  for (const dx of [2, 3]) out.push({ x: BAR.x0 + dx, y: BAR.y0 + 7, kind: 'pool' });

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

  // The Yard (v0.58: a gang's hangout; see the drawing above): the container, the couch with the fire barrel in front of
  // it, the half wall and rubble, the stripped car, the dice game, the lookout, wrecks and tyres; the fence along the
  // street (except the gates). (The barrel is a cooking station since v0.57: STATIONS, barrel_1.)
  const yd = (dx: number, dy: number, kind: FixtureKind) => out.push({ x: YARD.x0 + dx, y: YARD.y0 + dy, kind });
  for (let dx = 0; dx < 4; dx++) for (const dy of [0, 1]) yd(dx, dy, 'container');
  yd(6, 0, 'couch'), yd(7, 0, 'couch');
  for (const dx of [10, 11, 12]) yd(dx, 3, 'ruin');
  yd(13, 3, 'rubble'), yd(14, 0, 'rubble'), yd(3, 5, 'rubble');
  yd(16, 3, 'stripped'), yd(17, 3, 'stripped');
  yd(6, 4, 'dice');
  yd(8, 6, 'lookout');
  yd(18, 0, 'wreck'), yd(19, 0, 'wreck');
  yd(0, 3, 'tyres'), yd(19, 5, 'tyres');
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

  // The Bank: the counter, and the vault door in the back wall.
  for (let x = BANK.x0 + 1; x < BANK.x1; x++) out.push({ x, y: BANK_COUNTER_Y, kind: 'bankcounter' });
  for (const dx of [3, 4]) out.push({ x: BANK.x0 + dx, y: BANK.y0, kind: 'vault' });
  // The columns along the front stand on the step row, either side of the doors.
  for (const dx of [2, 3, 6, 7]) out.push({ x: BANK.x0 + dx, y: BANK.y1 + 1, kind: 'pillar' });

  // Hotline's yard: stacks of old pipe in the corners by the store's back wall.
  for (const dy of [0, 9]) out.push({ x: HOTLINE_YARD.x0, y: HOTLINE_YARD.y0 + dy, kind: 'pipes' });
  // The Junkyard.
  for (const [dx, dy, kind] of JUNK) out.push({ x: JUNKYARD.x0 + dx, y: JUNKYARD.y0 + dy, kind });
  // The Biker Club: the bar counter, the pool table, a table, the jukebox; the motorbikes out front.
  for (let dx = 0; dx < 5; dx++) out.push({ x: CLUB.x0 + dx, y: CLUB.y1, kind: 'clubbar' });
  for (const dx of [1, 2]) out.push({ x: CLUB.x0 + dx, y: CLUB.y0 + 2, kind: 'pool' });
  out.push({ x: CLUB.x0 + 8, y: CLUB.y0 + 2, kind: 'clubtable' }, { x: CLUB.x1, y: CLUB.y1, kind: 'clubtable' }, { x: CLUB.x0 + 7, y: CLUB.y1, kind: 'clubjuke' });
  for (const [x, y] of CLUB_BIKES) out.push({ x, y, kind: 'motorbike' });
  // The Rat Nest: the giant rats' mound of junk in the middle, crates and rubbish bags along the walls; Splinter.
  for (const dx of [4, 5]) for (const dy of [3, 4]) out.push({ x: NEST.x0 + dx, y: NEST.y0 + dy, kind: 'mound' });
  out.push({ x: NEST.x0, y: NEST.y0, kind: 'crate' }, { x: NEST.x1, y: NEST.y1, kind: 'crate' }, { x: NEST.x1, y: NEST.y0, kind: 'trash' }, { x: NEST.x0 + 2, y: NEST.y1, kind: 'trash' });
  out.push({ x: SPLINTER[0], y: SPLINTER[1], kind: 'splinter' });

  // The Factory's parking lot (v0.45): a cargo truck parked by the hall, stacked pallets in the far corner.
  for (const dx of [7, 8]) out.push({ x: FACTORY_LOT.x0 + dx, y: FACTORY_LOT.y0 + 2, kind: 'lottruck' });
  for (const dx of [0, 1]) out.push({ x: FACTORY_LOT.x0 + dx, y: FACTORY_LOT.y1, kind: 'pallets' });
  // The Factory: crates stacked at the back.
  for (const dx of [2, 3, 6, 7]) out.push({ x: FACTORY.x0 + dx, y: FACTORY.y0, kind: 'crate' });

  // Cooking stations (the barbecue), so you walk around them.
  for (const st of STATIONS) out.push({ x: st.x, y: st.y, kind: st.kind });

  // The court's bench (the gym bags on it are spots, see NODES).
  out.push({ x: COURT.x0 + 2, y: COURT.y0, kind: 'bench' });
  return out;
})();

/** Where each tourist strolls (v0.54): the old park, the west, east and south blocks, and the Plaza twice. */
export const TOURIST_AREAS: Rect[] = ['008', '010', '012', '014', '011', '011'].map(block);

export const NODES: StreetNode[] = (() => {
  const out: StreetNode[] = [];
  const node = (id: string, crimeId: string, x: number, y: number, extra: Partial<StreetNode> = {}) => {
    const c = CRIME_BY_ID[crimeId];
    out.push({ id, crimeId, kind: c.spot.kind, label: c.spot.label, x, y, ...extra });
  };
  // Six tourists strolling around the park (v0.54: one in each lawn block, two on the Plaza), each in its own block.
  TOURIST_AREAS.forEach((r, i) => node(`tourist_${i}`, 'pick_tourist', r.x0 + 2, r.y0 + (i === 5 ? 7 : 2), { wanders: r }));
  // Two gym bags on the bench at the court.
  node('bag_0', 'gym_bags', COURT.x0 + 1, COURT.y0, { facing: 0 });
  node('bag_1', 'gym_bags', COURT.x0 + 3, COURT.y0, { facing: 0 });
  // Four candy shelves along the back wall of the candy store.
  [0, 1, 3, 4].forEach((dx, i) => node(`candy_${i}`, 'candy_store', CANDY.x0 + dx, CANDY.y0, { facing: 0 }));
  // Six drunks on stools along the bar, facing the counter (west). (v0.58: was three.)
  for (let i = 0; i < 6; i++) node(`drunk_${i}`, 'pick_drunk', BAR.x0 + 3, BAR.y0 + i, { facing: -Math.PI / 2, seated: true });
  // Five parking meters: three along the north edge of the north-east lot (facing in), two along the south edge.
  [0, 2, 4].forEach((dx, i) => node(`meter_${i}`, 'parking_meter', PARKING_NE.x0 + dx, PARKING_NE.y0, { facing: 0 }));
  [2, 6].forEach((dx, i) => node(`meter_${i + 3}`, 'parking_meter', PARKING_S.x0 + dx, PARKING_S.y1, { facing: Math.PI }));
  // Four parked cars (Steal From Cars): two nose-in at the north bays, two at the south bays.
  [1, 3].forEach((dx, i) => node(`car_${i}`, 'steal_car', PARKING_NE.x0 + dx, PARKING_NE.y0 + 1, { facing: Math.PI / 2 }));
  [3, 7].forEach((dx, i) => node(`car_${i + 2}`, 'steal_car', PARKING_S.x0 + dx, PARKING_S.y1 - 1, { facing: -Math.PI / 2 }));
  // Five dumpsters in the Thrift Store's yard (Scrapping: tin salvage).
  THRIFT_DUMPSTERS.forEach(([x, y], i) => node(`dumpster_${i}`, 'tin_salvage', x, y, { facing: x === THRIFT_YARD.x0 ? Math.PI / 2 : x === THRIFT_YARD.x1 ? -Math.PI / 2 : 0 }));
  // Five dumpsters in Hotline's yard (Scrapping: copper salvage), facing into the yard.
  HOTLINE_DUMPSTERS.forEach(([x, y], i) =>
    node(`cu_dumpster_${i}`, 'copper_salvage', x, y, { facing: y === HOTLINE_YARD.y0 ? 0 : y === HOTLINE_YARD.y1 ? Math.PI : -Math.PI / 2 }));
  // v0.56: five dumpsters in the Superstore's yard (Scrapping: aluminium salvage), facing into the yard; and its little
  // parking spot: one meter, one car nose-in under it.
  SUPERSTORE_DUMPSTERS.forEach(([x, y], i) =>
    node(`al_dumpster_${i}`, 'aluminium_salvage', x, y, { facing: y === SUPERSTORE_YARD.y0 ? 0 : y === SUPERSTORE_YARD.y1 ? Math.PI : Math.PI / 2 }));
  // (v0.57: the meter at the head of the bay, by the store's back wall; the car came in from the street on the north,
  // nose-in to it, like the parking lot's south bays.)
  node('meter_5', 'parking_meter', SUPERSTORE_LOT.x0 + 2, SUPERSTORE_LOT.y1, { facing: Math.PI });
  node('car_4', 'steal_car', SUPERSTORE_LOT.x0 + 2, SUPERSTORE_LOT.y1 - 1, { facing: -Math.PI / 2 });
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
export type NpcKind = 'shopkeeper' | 'baller' | 'clerk' | 'bartender' | 'guard' | 'receptionist' | 'doctor' | 'banker' | 'doorman' | 'splinter';
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
    id: 'bartender', name: 'Bartender', role: 'The bar', kind: 'bartender', x: BAR.x0 + 1, y: BAR.y0 + 2,
    area: { x0: BAR.x0 + 1, y0: BAR.y0, x1: BAR.x0 + 1, y1: BAR.y0 + 4 }, named: true, catches: ['pick_drunk'],
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
  // (v0.43: the doctors have names: Elliot (long hair, green scrubs) and JD (short hair, light blue); Elliot helps with "Sewer Problems".)
  { id: 'doctor_0', name: 'Elliot', role: 'Doctor', kind: 'doctor', x: WARD.x0 + 2, y: WARD.y0 + 1, area: { x0: WARD.x0 + 1, y0: WARD.y0, x1: WARD.x1 - 1, y1: WARD.y1 - 1 }, named: true },
  { id: 'doctor_1', name: 'JD', role: 'Doctor', kind: 'doctor', x: WARD.x1 - 1, y: WARD.y0 + 3, area: { x0: WARD.x0 + 1, y0: WARD.y0, x1: WARD.x1 - 1, y1: WARD.y1 - 1 }, named: true },
  // Splinter, sitting against the sewer's north wall by the tunnel (he gives the quest "Sewer Problems").
  { id: 'splinter', name: 'Splinter', role: 'The sewer', kind: 'splinter', x: SPLINTER[0], y: SPLINTER[1], area: { x0: SPLINTER[0], y0: SPLINTER[1], x1: SPLINTER[0], y1: SPLINTER[1] }, named: true },
  // The Bank: three bankers behind the counter (talk to one to open your bank) and a guard by the door.
  ...[1, 4, 7].map((dx, i) => ({
    id: `banker_${i}`, name: 'Banker', role: 'The Bank', kind: 'banker' as const, x: BANK.x0 + dx, y: BANK.y0 + 1,
    area: { x0: BANK.x0 + dx, y0: BANK.y0 + 1, x1: BANK.x0 + dx, y1: BANK.y0 + 1 }, named: true,
  })),
  { id: 'bank_guard', name: 'Guard', role: 'The Bank', kind: 'doorman' as const, x: BANK.x0 + 1, y: BANK.y1 - 1, area: { x0: BANK.x0 + 1, y0: BANK.y1 - 1, x1: BANK.x0 + 1, y1: BANK.y1 - 1 }, named: false },
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
  // of the two sidewalks (lane tiles 2 or 4 of the 7-wide street). (v0.54: the old map's streets first, with their
  // old random numbers, then the new rows' from their own; none in the park's joins, which aren't street any more.)
  const across = (k: number, rng: () => number) => {
    for (let bx = CITY_BX; bx < CITY_BX + CITY_COLS; bx++) {
      if (rng() < 0.45) continue;
      const lane = k * PITCH + (rng() < 0.5 ? 2 : 4);
      // Between the zebra crossings at both ends (they take the first and last 3 tiles of the street).
      const x = bx * PITCH + STREET + 3 + Math.floor(rng() * 2);
      const color = colors[Math.floor(rng() * colors.length)];
      if (!inPark(x, lane) && !inPark(x + 2, lane)) out.push({ x, y: lane, along: 'x', color });
    }
  };
  const down = (k: number, by: number, rng: () => number) => {
    if (rng() < 0.55) return;
    const lane = k * PITCH + (rng() < 0.5 ? 2 : 4);
    const y = by * PITCH + STREET + 3 + Math.floor(rng() * 2);
    const color = colors[Math.floor(rng() * colors.length)];
    if (!inPark(lane, y) && !inPark(lane, y + 2)) out.push({ x: lane, y, along: 'y', color });
  };
  for (let k = 0; k <= OLD_ROWS; k++) across(k, rng);
  for (let k = CITY_BX; k <= CITY_BX + CITY_COLS; k++) for (let by = 0; by < OLD_ROWS; by++) down(k, by, rng);
  const more = mulberry32(2055);
  for (let k = OLD_ROWS + 1; k <= BROWS; k++) across(k, more);
  for (let k = CITY_BX; k <= CITY_BX + CITY_COLS; k++) for (let by = OLD_ROWS; by < BROWS; by++) down(k, by, more);
  // The car parked along the hospital's side is an ambulance.
  for (const c of out) if (c.along === 'y' && c.x > HOSPITAL.x1 && c.x <= HOSPITAL.x1 + STREET && c.y >= HOSPITAL.y0 && c.y <= HOSPITAL.y1) c.ambulance = true;
  return out;
})();
export const parkedTiles = (c: ParkedCar): [number, number][] =>
  [0, 1, 2].map((i) => (c.along === 'x' ? [c.x + i, c.y] : [c.x, c.y + i]));

/** Tiles you can't walk through: buildings, fixtures, fixed spots and parked cars. Streets, alleys, parks and shop floors are open. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(GRID.w * GRID.h);
  // Outside the island only the beach (v0.57), the sewer's walkways and its bridges are open; rocks on the beach are solid.
  for (let y = GRID.y0; y < GRID.y0 + GRID.h; y++)
    for (let x = GRID.x0; x < GRID.x0 + GRID.w; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) continue;
      if (onBeach(x, y) ? false : !inSewer(x, y) || isSewage(x, y)) g[gi(x, y)] = 1;
    }
  for (const r of COAST_ROCKS) g[gi(r.x, r.y)] = 1;
  // The Rat Nest's gate is shut (StreetView opens it for players who unlocked it).
  g[gi(...NEST_GATE)] = 1;
  for (const c of PARKED_CARS) for (const [x, y] of parkedTiles(c)) g[gi(x, y)] = 1;
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) g[gi(x, y)] = 1;
  for (const f of FIXTURES) g[gi(f.x, f.y)] = 1;
  for (const n of NODES) if (!n.wanders) g[gi(n.x, n.y)] = 1;
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
    id: 'splinter', name: 'Splinter', rect: { x0: SPLINTER[0], y0: SPLINTER[1], x1: SPLINTER[0], y1: SPLINTER[1] }, icon: 'quest', crimes: [], npcs: ['splinter'],
    blurb: 'A man sitting against the wall by the tunnel. He looks like he needs help (quest: Sewer Problems).',
  },
  {
    id: 'nest', name: 'The Rat Nest', rect: NEST, icon: 'rat', crimes: [], npcs: [],
    blurb: 'Behind a locked gate at the end of the tunnel: three giant rats (level 12) on a mound of junk. They drop giant rat meat.',
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
export type AreaIcon = 'park' | 'court' | 'shop' | 'candy' | 'bar' | 'gas' | 'lot' | 'weapons' | 'fire' | 'thugs' | 'hospital' | 'dungeon' | 'ladder' | 'rat' | 'scrap' | 'factory' | 'bank' | 'dog' | 'biker' | 'quest';
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
    id: 'hotline', name: 'Hotline Plumbing & Heating', rect: { x0: HOTLINE.x0, y0: HOTLINE.y0, x1: HOTLINE_YARD.x1, y1: HOTLINE_YARD.y1 }, icon: 'scrap', crimes: ['copper_salvage'], npcs: [],
    blurb: 'A plumbing and heating company in the Industrial zone. The dumpsters in its walled yard are full of copper offcuts (Scrapping 11).',
  },
  {
    id: 'junkyard', name: 'The Junkyard', rect: JUNKYARD, icon: 'dog', crimes: [], npcs: [],
    blurb: 'Crushed cars and tyres behind a tall fence, guarded by four dogs (level 8). The gate is on the east side.',
  },
  {
    id: 'club', name: 'Iron Saints MC', rect: CLUB, icon: 'biker', crimes: [], npcs: [],
    blurb: 'A biker bar with a neon sign. Three bikers (level 15) drink inside, and they jump anyone who walks in.',
  },
  {
    id: 'bank', name: 'The Bank', rect: BANK, icon: 'bank', crimes: [], npcs: ['banker_0'],
    blurb: 'In the Financial district. Talk to a banker to open your bank: 50 slots where things stack, and your cash is safe there.',
  },
  {
    id: 'factory', name: 'The Factory', rect: FACTORY_SITE, icon: 'factory', crimes: [], npcs: [],
    blurb: 'An abandoned factory in the Industrial zone. Press salvage into sheets and make weapons and armour at the workbenches (Tinkering).',
  },
  {
    id: 'superstore', name: 'Superstore', rect: { x0: SUPERSTORE.x0, y0: SUPERSTORE_YARD.y0, x1: SUPERSTORE_YARD.x1, y1: SUPERSTORE.y1 }, icon: 'scrap', crimes: ['aluminium_salvage'], npcs: [],
    blurb: "Store #1217. Aisles of soda, canned food and foil trays; behind it, a walled yard where the dumpsters fill up with crushed cans (Scrapping 21).",
  },
  {
    id: 'superstore_lot', name: 'Superstore parking', rect: SUPERSTORE_LOT, icon: 'lot', crimes: ['parking_meter', 'steal_car'], npcs: [],
    blurb: 'A few parking spaces next to the Superstore: one meter, one car. Nobody guards it.',
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
    blurb: 'A big rough lot behind a chain-link fence, next to the bar, where eight thugs hang around with knives (level 5). Fight them for cash, and now and then a tin knife.',
  },
  {
    id: 'bbq', name: 'The barbecue', rect: BBQ_PARK, icon: 'fire', crimes: [], npcs: [],
    blurb: 'A public barbecue in the pocket park. Cook raw food here to make it edible (Cooking).',
  },
  {
    id: 'park', name: 'Central Park', rect: PARK_BOUNDS, icon: 'park', crimes: ['pick_tourist'], npcs: [],
    blurb: 'A big park with the Plaza in the middle, where everyone meets. Lawns, ponds and fountains; tourists stroll around with their wallets in their back pockets, and pigeons peck at the paths.',
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
