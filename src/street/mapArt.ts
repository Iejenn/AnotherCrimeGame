// The island drawn flat, from above: used by the round minimap (which shows a moving piece of it)
// and by the world map (which shows all of it). Drawn once into a canvas, then reused.
import { coastAt } from './coast';
import { BCOLS, BLOCK_SIZE, BROWS, BUILDINGS, COURT, FIXTURES, GAS, GH, H, HOSPITAL, LOTS, MANHOLE, THRIFT, FACTORY, FACTORY_LOT, FACTORY_SITE, THRIFT_DUMPSTERS, THRIFT_YARD, PARKING, PARK_AREA, PARK_JOINS, PLAZA, onParkPath, ROOMS, SEWER, W, blockRect, isSewage, inSewer, UNDER, NEST_GATE, HOTLINE, HOTLINE_YARD, HOTLINE_DUMPSTERS, JUNKYARD, type Rect } from './map';

/** Tiles of sea drawn around the island. */
export const MAP_EDGE = 3;

export const ROOM_COLORS: Record<string, string> = { store: '#2f7a46', candy: '#9a4a6a', bar: '#6a4a2a', gas: '#3a5a8a', weapons: '#5a5a62', club: '#3e3430' };

/**
 * Draw the whole map into a new canvas at `px` canvas pixels per tile. Tile (x, y) starts at
 * ((x + MAP_EDGE) * px, (y + MAP_EDGE) * px).
 */
export function drawWorld(px: number, withSewer = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = (W + MAP_EDGE * 2) * px;
  // The minimap also has the sewer (drawn below the island, where its tiles are); the world map only the island.
  c.height = ((withSewer ? GH : H) + MAP_EDGE * 2) * px;
  const g = c.getContext('2d')!;
  const tile = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect((x + MAP_EDGE) * px, (y + MAP_EDGE) * px, w * px, h * px);
  };
  const area = (r: Rect, col: string) => tile(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, col);
  g.fillStyle = '#15303f';
  g.fillRect(0, 0, c.width, c.height);
  // The shallows and the beach (v0.55: the coast's wobbly edge, coast.ts), as far as the map's edge shows.
  for (let y = -MAP_EDGE; y < H + MAP_EDGE; y++)
    for (let x = -MAP_EDGE; x < W + MAP_EDGE; x++) {
      const c = coastAt(x, y);
      if (c) tile(x, y, 1, 1, c === 'sand' ? '#7d705a' : '#24536a');
    }
  tile(0, 0, W, H, '#4a4d53'); // roads
  // Sidewalks around every block, and the pocket parks.
  for (let bx = 0; bx < BCOLS; bx++)
    for (let by = 0; by < BROWS; by++) {
      const b = blockRect(bx, by);
      tile(b.x0 - 1.5, b.y0 - 1.5, BLOCK_SIZE + 3, BLOCK_SIZE + 3, '#66625b');
    }
  // (v0.54: the sidewalk runs on along both sides of the park's joins.)
  PARK_JOINS.forEach((j, i) => {
    if (i < 2) for (const x of [j.x0 - 1.5, j.x1 + 1]) tile(x, j.y0, 1.5, j.y1 - j.y0 + 1, '#66625b');
    else for (const y of [j.y0 - 1.5, j.y1 + 1]) tile(j.x0, y, j.x1 - j.x0 + 1, 1.5, '#66625b');
  });
  for (const lot of LOTS) if (lot.kind === 'park') area(lot.rect, '#45663a');
  // Central Park (v0.54: the cross): lawn, gravel paths, the paved Plaza; then hedges, fountains and ponds.
  for (const r of PARK_AREA) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) tile(x, y, 1, 1, onParkPath(x, y) ? '#8a8070' : '#45663a');
  area(PLAZA, '#9a9286');
  for (const f of FIXTURES) {
    if (f.kind === 'hedge' || f.kind === 'tree') tile(f.x + 0.1, f.y + 0.1, 0.8, 0.8, '#2c4a26');
    if (f.kind === 'fountain' || f.kind === 'pond') tile(f.x, f.y, 1, 1, '#3f86a0');
    if (f.kind === 'flowers') tile(f.x + 0.2, f.y + 0.2, 0.6, 0.6, '#b8336a');
  }
  area(COURT, '#7a3b2c');
  area({ ...COURT, y0: COURT.y0 + 1, x0: COURT.x0 + 0.5, x1: COURT.x1 - 0.5, y1: COURT.y1 - 0.5 }, '#2f5a4a');
  for (const r of PARKING) area(r, '#34363c'); // the parking lot (an L around the gas station)
  tile(GAS.x0, GAS.y1 + 1, GAS.x1 - GAS.x0 + 1, 1, '#34363c'); // the pumps' forecourt
  for (const r of ROOMS) area(r, ROOM_COLORS[r.id] ?? '#6a5f52');
  // The Factory's site: one sidewalk round both blocks (no street between them), the hall and its parking lot.
  tile(FACTORY_SITE.x0 - 1.5, FACTORY_SITE.y0 - 1.5, FACTORY_SITE.x1 - FACTORY_SITE.x0 + 4, FACTORY_SITE.y1 - FACTORY_SITE.y0 + 4, '#66625b');
  area(FACTORY, '#7a5a48');
  tile(FACTORY.x0 + 0.3, FACTORY.y0 + 0.3, FACTORY.x1 - FACTORY.x0 + 0.4, FACTORY.y1 - FACTORY.y0 + 0.4, '#6a6a66');
  area(FACTORY_LOT, '#3e4046');
  // The Thrift Store (brick) and its yard (concrete) with the dumpsters.
  area(THRIFT, '#8a5040');
  area(THRIFT_YARD, '#5a5852');
  for (const [x, y] of THRIFT_DUMPSTERS) tile(x + 0.1, y + 0.15, 0.8, 0.7, '#8a5a3a');
  // v0.43: Hotline (brick and its walled yard, copper dumpsters), the Junkyard (dirt, wrecks, tyres, the crane).
  area(HOTLINE, '#8a5a48');
  area(HOTLINE_YARD, '#5f5c56');
  for (const [x, y] of HOTLINE_DUMPSTERS) tile(x + 0.1, y + 0.15, 0.8, 0.7, '#c07040');
  area(JUNKYARD, '#5a4a38');
  for (const f of FIXTURES) {
    if (f.kind === 'wreck') tile(f.x + 0.1, f.y + 0.15, 0.8, 0.7, '#7a4a3a');
    if (f.kind === 'tyres') tile(f.x + 0.2, f.y + 0.2, 0.6, 0.6, '#1a1a1e');
    if (f.kind === 'crane') tile(f.x, f.y, 1, 1, '#d8a02a');
    if (f.kind === 'motorbike') tile(f.x + 0.3, f.y + 0.1, 0.4, 0.8, '#1a1a1e');
  }
  // The hospital: pale walls, a red cross on the ward's roof.
  area(HOSPITAL, '#c9c4b8');
  tile(HOSPITAL.x0 + 2, HOSPITAL.y0 + 1, 1, 3, '#d9473a');
  tile(HOSPITAL.x0 + 1, HOSPITAL.y0 + 2, 3, 1, '#d9473a');
  for (const b of BUILDINGS) {
    tile(b.x, b.y, b.w, b.h, '#8a7f70');
    tile(b.x + 0.15, b.y + 0.15, b.w - 0.3, b.h - 0.3, '#7a6f62');
  }
  // The pothole down to the sewer.
  g.fillStyle = '#0a0a0a';
  g.beginPath();
  g.arc((MANHOLE[0] + 0.5 + MAP_EDGE) * px, (MANHOLE[1] + 0.5 + MAP_EDGE) * px, px * 0.55, 0, Math.PI * 2);
  g.fill();
  if (withSewer) {
    // The sewer: rock all round, the walkways, the channel and its bridges, the ladder.
    tile(-MAP_EDGE, H + 1, W + MAP_EDGE * 2, GH - H - 1 + MAP_EDGE, '#0c0f0d');
    for (let y = UNDER.y0; y <= UNDER.y1; y++)
      for (let x = UNDER.x0; x <= UNDER.x1; x++) if (inSewer(x, y)) tile(x, y, 1, 1, isSewage(x, y) ? '#2f4a2a' : '#6e7468');
    for (const f of FIXTURES) if (f.kind === 'crate' || f.kind === 'trash') tile(f.x + 0.15, f.y + 0.15, 0.7, 0.7, f.kind === 'crate' ? '#6a4a2e' : '#1e2022');
    for (const f of FIXTURES) if (f.kind === 'ladder') tile(f.x + 0.2, f.y, 0.6, 0.5, '#c8a46a');
  }
  return c;
}

/** Just the sewer (its map while you're down there), from one tile left of and above it, at `px` per tile. */
export function drawSewer(px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const w = UNDER.x1 - UNDER.x0 + 3;
  const h = UNDER.y1 - UNDER.y0 + 3;
  c.width = w * px;
  c.height = h * px;
  const g = c.getContext('2d')!;
  const tile = (x: number, y: number, tw: number, th: number, col: string) => {
    g.fillStyle = col;
    g.fillRect((x - UNDER.x0 + 1) * px, (y - UNDER.y0 + 1) * px, tw * px, th * px);
  };
  g.fillStyle = '#0c0f0d';
  g.fillRect(0, 0, c.width, c.height);
  tile(SEWER.x0 - 1, SEWER.y0 - 1, SEWER.x1 - SEWER.x0 + 3, 1, '#5a4a3e'); // the brick back wall
  for (let y = UNDER.y0; y <= UNDER.y1; y++)
    for (let x = UNDER.x0; x <= UNDER.x1; x++) {
      if (!inSewer(x, y)) continue;
      tile(x, y, 1, 1, isSewage(x, y) ? '#2f4a2a' : x >= NEST_GATE[0] ? '#3e4a3a' : '#6e7468');
      if (!isSewage(x, y)) tile(x + 0.04, y + 0.04, 0.92, 0.92, '#767c70');
    }
  for (const f of FIXTURES) {
    if (f.kind === 'crate') tile(f.x + 0.15, f.y + 0.15, 0.7, 0.7, '#6a4a2e');
    if (f.kind === 'trash') tile(f.x + 0.2, f.y + 0.2, 0.6, 0.6, '#1e2022');
    if (f.kind === 'mound') tile(f.x, f.y, 1, 1, '#3a3428');
  }
  tile(NEST_GATE[0] + 0.35, NEST_GATE[1], 0.3, 1, '#d8b02a'); // the gate
  return c;
}

/** A shopping bag (shops on the minimap and world map), centred on (x, y), `s` = size. */
export function drawBag(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = '#f2d27a';
  g.strokeStyle = '#141210';
  g.lineWidth = 1;
  g.beginPath();
  g.rect(x - s / 2, y - s * 0.3, s, s * 0.8);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(x, y - s * 0.3, s * 0.3, Math.PI, 0);
  g.strokeStyle = '#f2d27a';
  g.lineWidth = 1.5;
  g.stroke();
}

/** A little gravestone (your grave), centred on (x, y). */
export function drawGrave(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = '#d8d4cc';
  g.strokeStyle = '#141210';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - s / 2, y + s / 2);
  g.lineTo(x - s / 2, y - s * 0.1);
  g.arc(x, y - s * 0.1, s / 2, Math.PI, 0);
  g.lineTo(x + s / 2, y + s / 2);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#141210';
  g.fillRect(x - 0.5, y - s * 0.35, 1.2, s * 0.6);
  g.fillRect(x - s * 0.22, y - s * 0.15, s * 0.44, 1.2);
}
