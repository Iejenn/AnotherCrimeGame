// The island drawn flat, from above: used by the round minimap (which shows a moving piece of it)
// and by the world map (which shows all of it). Drawn once into a canvas, then reused.
import { BLOCK, BLOCKS, BUILDINGS, COURT, FIXTURES, GAS, H, LOT, PARK, ROOMS, W, type Rect } from './map';

/** Tiles of sea drawn around the island. */
export const MAP_EDGE = 3;

export const ROOM_COLORS: Record<string, string> = { store: '#2f7a46', candy: '#9a4a6a', bar: '#6a4a2a', gas: '#3a5a8a' };

/**
 * Draw the whole map into a new canvas at `px` canvas pixels per tile. Tile (x, y) starts at
 * ((x + MAP_EDGE) * px, (y + MAP_EDGE) * px).
 */
export function drawWorld(px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = (W + MAP_EDGE * 2) * px;
  c.height = (H + MAP_EDGE * 2) * px;
  const g = c.getContext('2d')!;
  const tile = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect((x + MAP_EDGE) * px, (y + MAP_EDGE) * px, w * px, h * px);
  };
  const area = (r: Rect, col: string) => tile(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1, col);
  g.fillStyle = '#15303f';
  g.fillRect(0, 0, c.width, c.height);
  tile(-2, -2, W + 4, H + 4, '#24536a'); // shallows
  tile(-1, -1, W + 2, H + 2, '#7d705a'); // beach
  tile(0, 0, W, H, '#4a4d53'); // roads
  // Pavements around every block.
  for (let bx = 0; bx * BLOCK < W - 2; bx++) for (let by = 0; by * BLOCK < H - 2; by++) tile(bx * BLOCK + 1.7, by * BLOCK + 1.7, 5.6, 5.6, '#66625b');
  for (const [key, kind] of BLOCKS) {
    const [bx, by] = key.split(',').map(Number);
    if (kind.type === 'park') tile(bx * BLOCK + 2, by * BLOCK + 2, 5, 5, '#45663a');
  }
  // The big park: lawn, gravel paths in a # shape, hedges, fountain and pond.
  area(PARK, '#45663a');
  for (const dy of [2, 9]) tile(PARK.x0, PARK.y0 + dy, PARK.x1 - PARK.x0 + 1, 1, '#8a8070');
  for (const dx of [3, 8]) tile(PARK.x0 + dx, PARK.y0, 1, PARK.y1 - PARK.y0 + 1, '#8a8070');
  for (const f of FIXTURES) {
    if (f.kind === 'hedge' || f.kind === 'tree') tile(f.x + 0.1, f.y + 0.1, 0.8, 0.8, '#2c4a26');
    if (f.kind === 'fountain' || f.kind === 'pond') tile(f.x, f.y, 1, 1, '#3f86a0');
    if (f.kind === 'flowers') tile(f.x + 0.2, f.y + 0.2, 0.6, 0.6, '#b8336a');
  }
  area(COURT, '#7a3b2c');
  area({ ...COURT, y0: COURT.y0 + 1, x0: COURT.x0 + 0.5, x1: COURT.x1 - 0.5, y1: COURT.y1 - 0.5 }, '#2f5a4a');
  area({ ...LOT, y0: GAS.y1 + 1 }, '#34363c'); // forecourt, driveway and lot in one
  for (const r of ROOMS) area(r, ROOM_COLORS[r.id] ?? '#6a5f52');
  for (const b of BUILDINGS) {
    tile(b.x, b.y, b.w, b.h, '#8a7f70');
    tile(b.x + 0.15, b.y + 0.15, b.w - 0.3, b.h - 0.3, '#7a6f62');
  }
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
