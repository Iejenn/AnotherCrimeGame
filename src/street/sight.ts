// Line of sight for ranged attacks (v0.51, Marksman): can a throw get from one tile to another? Walls block it:
// buildings, the island's edge and the sewer's walls (tiles you can't stand on), and the walls and fences of an
// enclosure (a shop, a yard, the Junkyard): you only throw at things on your side of them. Low things (benches,
// cars, the sewage channel) don't block: a knife flies over them.
//
// The server checks every throw with the exact same steps (game.clear_shot, SQL in supabase/migrations/0032_marksman.sql;
// its wall and enclosure rows are printed from this map by scripts/marksman-sql.ts), all whole numbers, so the game
// never sends you to a spot the server then refuses.
import { BUILDINGS, ENCLOSURES, onMap } from './map';

/** The walls a throw can't pass, as rectangles (the buildings' footprints). */
export const SHOT_WALLS = BUILDINGS.map((b) => ({ x0: b.x, y0: b.y, x1: b.x + b.w - 1, y1: b.y + b.h - 1 }));

const isWall = (x: number, y: number) => SHOT_WALLS.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
/** Which enclosure a tile is in (the first that holds it, like map.ts's enclosureAt), or null outside them all. */
const enclosureId = (x: number, y: number) => ENCLOSURES.find((e) => x >= e.rect.x0 && x <= e.rect.x1 && y >= e.rect.y0 && y <= e.rect.y1)?.id ?? null;
/** Can a throw pass through this tile, starting from inside `home` (an enclosure id, or null)? */
const open = (x: number, y: number, home: string | null) => onMap(x, y) && !isWall(x, y) && enclosureId(x, y) === home;

/**
 * The tiles a straight line from (x0, y0) to (x1, y1) passes through, after the first: every tile it touches, in order
 * (a "supercover" line). Where it passes exactly through a corner, the two tiles beside the corner come too (in
 * `corners`): squeezing between them diagonally is blocked if either is.
 */
export function shotLine(x0: number, y0: number, x1: number, y1: number) {
  const nx = Math.abs(x1 - x0);
  const ny = Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  let px = x0;
  let py = y0;
  let ix = 0;
  let iy = 0;
  const tiles: [number, number][] = [];
  const corners: [number, number][] = [];
  while (ix < nx || iy < ny) {
    const d = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (d === 0) {
      corners.push([px + sx, py], [px, py + sy]);
      px += sx;
      py += sy;
      ix++;
      iy++;
    } else if (d < 0) {
      px += sx;
      ix++;
    } else {
      py += sy;
      iy++;
    }
    tiles.push([px, py]);
  }
  return { tiles, corners };
}

/** Can you throw from tile (x0, y0) at tile (x1, y1)? (Range is checked separately.) */
export function clearShot(x0: number, y0: number, x1: number, y1: number) {
  const home = enclosureId(x0, y0);
  const { tiles, corners } = shotLine(x0, y0, x1, y1);
  return [...tiles, ...corners].every(([x, y]) => open(x, y, home));
}

/** The first tile from (x0, y0) towards (x1, y1): where an enemy you threw at stops, next to you, after walking up. */
export function firstStep(x0: number, y0: number, x1: number, y1: number): [number, number] {
  return shotLine(x0, y0, x1, y1).tiles[0] ?? [x0, y0];
}

/** How fast an enemy you threw at walks up to you (tiles a second; the server's attack() uses the same). */
export const APPROACH_SPEED = 2.5;
