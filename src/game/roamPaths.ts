// The walks of the roaming enemies (v0.54): thugs, rats, guard dogs, giant rats and bikers stroll from spot to spot
// on a fixed schedule (enemies.ts). They used to walk in a straight line, through the couch, the barrel, crates. Now,
// when the straight line isn't clear, they walk round: the shortest path over the open tiles of their own place (the
// same moves you can make: no corner-cutting past something solid, no stepping over a fence), then straightened out
// (each bend only where it's needed), so they walk naturally instead of zig-zagging tile by tile.
//
// The schedule stays the same (which spot, and when): a detour is walked in the same time, a bit faster. The server
// works out the same walks (v0.58: itself, game.roam_bends in 0041, the same steps as here, from its walk map; before,
// a table of them was shipped with every map change), so everyone agrees where an enemy is. If you change how a walk is
// worked out here, change it there too (scripts/roam-parity.ts checks they agree).
import { shotLine, walkBit, walkMasks } from '../street/sight';
import { gi } from '../street/map';

type Tile = [number, number];
const key = (a: Tile, b: Tile) => `${a[0]},${a[1]},${b[0]},${b[1]}`;

let masks: Uint8Array | null = null;
const getMasks = () => (masks ??= walkMasks());

/**
 * Can an enemy walk straight from a to b, staying on `tiles` (its place)? Every tile the line touches is one of its
 * tiles, and every step along it is a legal move.
 */
function straight(a: Tile, b: Tile, tiles: Set<string>) {
  const m = getMasks();
  const { tiles: line, corners } = shotLine(a[0], a[1], b[0], b[1]);
  if (![...line, ...corners].every(([x, y]) => tiles.has(`${x},${y}`))) return false;
  let [px, py] = a;
  for (const [x, y] of line) {
    if (!(m[gi(px, py)] & (1 << walkBit(x - px, y - py)))) return false;
    [px, py] = [x, y];
  }
  return true;
}

/** The shortest walk from a to b over `tiles` (breadth-first, 8 moves), every tile after a; null if there's none. */
function bfs(a: Tile, b: Tile, tiles: Set<string>): Tile[] | null {
  const m = getMasks();
  const dirs: Tile[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const came = new Map<string, string>([[`${a[0]},${a[1]}`, '']]);
  const q: Tile[] = [a];
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    if (cx === b[0] && cy === b[1]) {
      const out: Tile[] = [];
      for (let k = `${cx},${cy}`; k !== `${a[0]},${a[1]}`; k = came.get(k)!) out.unshift(k.split(',').map(Number) as Tile);
      return out;
    }
    dirs.forEach(([dx, dy], i) => {
      const n = `${cx + dx},${cy + dy}`;
      if (!tiles.has(n) || came.has(n) || !(m[gi(cx, cy)] & (1 << i))) return;
      came.set(n, `${cx},${cy}`);
      q.push([cx + dx, cy + dy]);
    });
  }
  return null;
}

/** The bends of a walk from a to b over `tiles`, b included: [b] when the straight line is clear. */
function walk(a: Tile, b: Tile, tiles: Set<string>): Tile[] | null {
  if (straight(a, b, tiles)) return [b];
  const steps = bfs(a, b, tiles);
  if (!steps) return null;
  // Straighten it: from where you are, head for the furthest tile of the walk you can reach in a straight line.
  const pts = [a, ...steps];
  const out: Tile[] = [];
  for (let i = 0; i < pts.length - 1; ) {
    let j = pts.length - 1;
    while (j > i + 1 && !straight(pts[i], pts[j], tiles)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/**
 * The detours of a place whose enemies stroll between `list`'s tiles: for every pair of its tiles (from, to) that
 * can't be walked in a straight line, the bends of the walk round (ending at `to`).
 */
export function roamDetours(list: Tile[]): Map<string, Tile[]> {
  const tiles = new Set(list.map(([x, y]) => `${x},${y}`));
  const out = new Map<string, Tile[]>();
  for (const a of list)
    for (const b of list) {
      if (a === b) continue;
      const w = walk(a, b, tiles);
      if (!w) throw new Error(`no walk from ${a} to ${b}`);
      if (w.length > 1) out.set(key(a, b), w);
    }
  return out;
}

/** The places enemies stroll in (registered by enemies.ts, which knows them). */
const PLACES: Tile[][] = [];
export const addRoamPlace = (list: Tile[]) => void PLACES.push(list);
let detours: Map<string, Tile[]> | null = null;
/** All the detours of every place, worked out the first time they're needed. */
export function allDetours() {
  if (!detours) {
    detours = new Map();
    for (const list of PLACES) for (const [k, w] of roamDetours(list)) detours.set(k, w);
  }
  return detours;
}

/**
 * Where an enemy is (tile units, middle of a tile = +0.5) `f` (0–1) of the way through its walk from tile a to tile b:
 * along the detour if there is one (by distance), else on the straight line.
 */
export function walkPoint(a: Tile, b: Tile, f: number) {
  const bends = allDetours().get(key(a, b));
  if (!bends) return { x: a[0] + 0.5 + (b[0] - a[0]) * f, z: a[1] + 0.5 + (b[1] - a[1]) * f };
  const pts = [a, ...bends];
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = f * seg.reduce((s, d) => s + d, 0);
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, left / seg[i]) : 1;
      return { x: pts[i][0] + 0.5 + (pts[i + 1][0] - pts[i][0]) * k, z: pts[i][1] + 0.5 + (pts[i + 1][1] - pts[i][1]) * k };
    }
    left -= seg[i];
  }
  return { x: b[0] + 0.5, z: b[1] + 0.5 };
}
