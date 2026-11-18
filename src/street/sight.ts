// Line of sight for ranged attacks (v0.51, Marksman): can a throw get from one tile to another? Walls block it:
// buildings, the island's edge and the sewer's walls (tiles you can't stand on), and the walls and fences of an
// enclosure (a shop, a yard, the Junkyard): you only throw at things on your side of them, however close. Low things
// (benches, cars, the sewage channel) don't block: a knife flies over them.
//
// And the walk an enemy you threw at takes to reach you (enemyRoute): only over floors and roads, round water, walls,
// fences and objects, through doors and gates (the same moves you can make). The server works out the same route
// (game.enemy_route) from the walk map printed here (walkMasks), and the game animates that route.
//
// The server checks every throw with the exact same steps (game.clear_shot, SQL in supabase/migrations/0032_marksman.sql;
// its wall and enclosure rows are printed from this map by scripts/marksman-sql.ts), all whole numbers, so the game
// never sends you to a spot the server then refuses.
import { BUILDINGS, ENCLOSURES, GH, NEST_GATE, W, buildBlocked, canStep, onMap } from './map';

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

/** How fast an enemy you threw at walks up to you (tiles a second; the server's attack() uses the same). */
export const APPROACH_SPEED = 2.5;

/** The 8 moves, in the order of the bits in a walk mask. */
export const WALK_DIRS: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** The bit for a move (dx, dy) in a walk mask (its index in WALK_DIRS). */
export const walkBit = (dx: number, dy: number) => {
  const i = (dy + 1) * 3 + (dx + 1);
  return i > 4 ? i - 1 : i;
};

/**
 * For every tile (y * W + x), which of the 8 moves an enemy can make from it (bit i = WALK_DIRS[i]): onto an open
 * tile, not cutting a corner past a blocked one, and only through an enclosure's openings (canStep, like you). The
 * Rat Nest's gate counts as open: only players who unlocked it fight on either side of it.
 */
export function walkMasks(): Uint8Array {
  const blocked = buildBlocked();
  blocked[NEST_GATE[1] * W + NEST_GATE[0]] = 0;
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < GH && !blocked[y * W + x];
  const m = new Uint8Array(W * GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < W; x++) {
      if (!open(x, y)) continue;
      WALK_DIRS.forEach(([dx, dy], i) => {
        const nx = x + dx;
        const ny = y + dy;
        if (!open(nx, ny)) return;
        if (dx && dy && (!open(nx, y) || !open(x, ny))) return;
        if (!canStep(x, y, nx, ny)) return;
        m[y * W + x] |= 1 << i;
      });
    }
  return m;
}

/**
 * The route an enemy at `from` walks to reach you at `to`: the fewest steps (breadth-first, moves tried in WALK_DIRS
 * order: the same route the server finds) to a tile next to you. The tiles after `from`, ending next to you; [] if
 * it's already there; null if it can't get to you at all.
 */
export function enemyRoute(masks: Uint8Array, from: [number, number], to: [number, number]): [number, number][] | null {
  // "Next to you": one step away AND a step it could take onto your tile (not across a fence or a wall corner).
  const next = (x: number, y: number) => Math.max(Math.abs(x - to[0]), Math.abs(y - to[1])) === 1 && !!(masks[y * W + x] & (1 << walkBit(to[0] - x, to[1] - y)));
  if (next(...from)) return [];
  const start = from[1] * W + from[0];
  const came = new Int32Array(W * GH).fill(-1);
  came[start] = start;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    const cx = c % W;
    const cy = (c / W) | 0;
    for (let i = 0; i < 8; i++) {
      if (!(masks[c] & (1 << i))) continue;
      const n = (cy + WALK_DIRS[i][1]) * W + cx + WALK_DIRS[i][0];
      if (came[n] >= 0) continue;
      came[n] = c;
      const nx = n % W;
      const ny = (n / W) | 0;
      if (next(nx, ny)) {
        const route: [number, number][] = [];
        for (let k = n; k !== start; k = came[k]) route.unshift([k % W, (k / W) | 0]);
        return route;
      }
      q.push(n);
    }
  }
  return null;
}

/** Where an enemy is (tile centre) after walking `frac` (0–1) of its route from `from`, by distance. */
export function routePoint(from: [number, number], route: [number, number][], frac: number) {
  const pts = [from, ...route];
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = Math.max(0, Math.min(1, frac)) * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) {
      const k = seg[i] ? left / seg[i] : 1;
      return { x: pts[i][0] + 0.5 + (pts[i + 1][0] - pts[i][0]) * k, z: pts[i][1] + 0.5 + (pts[i + 1][1] - pts[i][1]) * k };
    }
    left -= seg[i];
  }
  const last = pts[pts.length - 1];
  return { x: last[0] + 0.5, z: last[1] + 0.5 };
}

/** How long a route takes to walk (ms): diagonal steps are longer. */
export function routeMs(from: [number, number], route: [number, number][]) {
  let len = 0;
  let [px, py] = from;
  for (const [x, y] of route) {
    len += x !== px && y !== py ? Math.SQRT2 : 1;
    [px, py] = [x, y];
  }
  return (len / APPROACH_SPEED) * 1000;
}
