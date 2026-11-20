// The floor kit (v0.55): the ground drawn from a grid of surfaces, like the building kit (kit.ts) draws buildings from
// a few rules. Paint every tile with a surface (asphalt, sidewalk, grass, gravel, paving, dirt, concrete, sand, water);
// the kit draws it:
//  - each surface at its own height (a sidewalk stands above the road, a lawn above the sidewalk), with a side where it
//    stands above its neighbour (a curb, a lawn's edge, the beach's drop to the water);
//  - outside corners cut round (or straight across), so a patch of grass, a sidewalk at a crossing or the shoreline
//    isn't a staircase of squares; the piece cut away is filled with the neighbour's surface;
//  - a tiny colour difference per tile, so a big area isn't one flat colour;
//  - merged into one mesh per surface per area of the map (few draw calls, and areas off screen aren't drawn).
// Walking stays on the tile grid (the server checks tiles): the shapes are only how it looks, close to the tiles.
import * as THREE from 'three';
import { DETAIL_GAIN, waterTexture } from './textures';
import { SURFACE_GAIN, surfaceTexture } from './surfaces';

export type Surface = 'water' | 'pond' | 'sand' | 'asphalt' | 'concrete' | 'dirt' | 'sidewalk' | 'grass' | 'gravel' | 'paving';

export interface SurfaceLook {
  color: number;
  /** Its top (world units; the road is 0). */
  top: number;
  /** The colour of its side where it stands above its neighbour (default: a bit darker than its top). */
  side?: number;
  /** How its outside corners are cut: round (radius 0.5 tile), straight across, or left square. */
  corner: 'round' | 'cut' | 'square';
  /** How much each tile's colour may differ (0–1, default 0.04). */
  vary?: number;
}

/** The surfaces, in our dusk palette (docs/design.md §18). */
export const SURFACES: Record<Surface, SurfaceLook> = {
  water: { color: 0x24536a, top: -0.3, corner: 'round', vary: 0.02 },
  /** A pond in a park: water just above street level, so it sits in the lawn with a low grassy bank round it. */
  pond: { color: 0x1f4a5a, top: 0.075, corner: 'round', vary: 0.02 },
  sand: { color: 0x7d705a, top: -0.08, side: 0x6a5e4a, corner: 'round' },
  asphalt: { color: 0x2f3036, top: 0, corner: 'square', vary: 0.03 },
  concrete: { color: 0x55524c, top: 0.02, side: 0x45423d, corner: 'square' },
  dirt: { color: 0x5a4a38, top: 0.03, corner: 'round', vary: 0.07 },
  sidewalk: { color: 0x66625b, top: 0.07, side: 0x8a857c, corner: 'round' },
  grass: { color: 0x3f6235, top: 0.1, side: 0x3a2a1e, corner: 'round', vary: 0.06 },
  gravel: { color: 0x8a8070, top: 0.11, side: 0x6e665a, corner: 'round', vary: 0.05 },
  paving: { color: 0x9a9286, top: 0.1, side: 0x7a7266, corner: 'square', vary: 0.04 },
};

/** The water's drifting ripples (v0.56, textures.ts) and the grass (v0.60, surfaces.ts): how big (tiles per picture).
 *  The rest of the ground is plain colour (a tester preferred it to the ground textures we tried). */
export const SURFACE_TEX: Partial<Record<Surface, { tex: 'water' | 'grass'; scale: number }>> = {
  water: { tex: 'water', scale: 3 },
  pond: { tex: 'water', scale: 2 },
  // v0.60: the owner asked for texture on the lawns (plain green looked flat): the pixel grass (surfaces.ts), one a tile.
  grass: { tex: 'grass', scale: 1 },
};
const materials = new Map<Surface, THREE.MeshLambertMaterial>();
/** One material per surface (shared by every floor): its detail texture, brightened so the colour stays the same. */
function surfaceMaterial(s: Surface) {
  let m = materials.get(s);
  if (m) return m;
  const t = SURFACE_TEX[s];
  const map = t?.tex === 'water' ? waterTexture() : t?.tex === 'grass' ? surfaceTexture('grass') : null;
  // (Both sides: flat shading lights a face by its slope on screen, whichever way it was wound.)
  m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, map });
  if (map) m.color.setScalar(t?.tex === 'grass' ? SURFACE_GAIN : DETAIL_GAIN);
  materials.set(s, m);
  return m;
}

/** A grid of surfaces: tile (x, y) for x0 ≤ x < x0 + w, y0 ≤ y < y0 + h; null = nothing drawn there. */
export interface FloorGrid {
  x0: number;
  y0: number;
  w: number;
  h: number;
  at: (x: number, y: number) => Surface | null;
}

/** How big (tiles) one merged area is. */
const AREA = 40;
/** Points on a round corner (more is smoother; 3 is low-poly). */
const ARC = 3;
/** The round corners' radius (tiles). */
const R = 0.5;

/** The 4 corners of a tile, as offsets: NW, NE, SE, SW (clockwise seen from above, +x east, +y south). */
const CORNERS = [
  { cx: 0, cy: 0, nx: -1, ny: -1 },
  { cx: 1, cy: 0, nx: 1, ny: -1 },
  { cx: 1, cy: 1, nx: 1, ny: 1 },
  { cx: 0, cy: 1, nx: -1, ny: 1 },
] as const;

/** A small, stable random number for a tile (0–1). */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Builds the floor for a grid. Returns a group with one mesh per surface per area. */
export function buildFloor(grid: FloorGrid): THREE.Group {
  const group = new THREE.Group();
  group.name = 'floor';
  const at = (x: number, y: number) => (x >= grid.x0 && y >= grid.y0 && x < grid.x0 + grid.w && y < grid.y0 + grid.h ? grid.at(x, y) : null);
  // Per area and surface: positions and colours (flat shaded, so each triangle has its own vertices).
  const parts = new Map<string, { pos: number[]; col: number[]; s: Surface }>();
  const part = (x: number, y: number, s: Surface) => {
    const k = `${Math.floor(x / AREA)},${Math.floor(y / AREA)},${s}`;
    let p = parts.get(k);
    if (!p) parts.set(k, (p = { pos: [], col: [], s }));
    return p;
  };
  const shade = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k);
  const tri = (p: { pos: number[]; col: number[] }, a: number[], b: number[], c: number[], color: THREE.Color) => {
    // (Wound so the top faces point up.)
    p.pos.push(...a, ...c, ...b);
    for (let i = 0; i < 3; i++) p.col.push(color.r, color.g, color.b);
  };
  const quadSide = (p: { pos: number[]; col: number[] }, a: [number, number], b: [number, number], top: number, bottom: number, color: THREE.Color) => {
    // A vertical side from a to b (seen from outside the tile it belongs to: a → b runs clockwise round it).
    const A = [a[0], top, a[1]], B = [b[0], top, b[1]], C = [b[0], bottom, b[1]], D = [a[0], bottom, a[1]];
    p.pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    for (let i = 0; i < 6; i++) p.col.push(color.r, color.g, color.b);
  };

  for (let y = grid.y0; y < grid.y0 + grid.h; y++)
    for (let x = grid.x0; x < grid.x0 + grid.w; x++) {
      const s = at(x, y);
      if (!s) continue;
      const look = SURFACES[s];
      const v = (hash(x, y) - 0.5) * 2 * (look.vary ?? 0.04);
      const top = shade(look.color, 1 + v);
      const sideCol = shade(look.side ?? look.color, look.side ? 1 : 0.75);
      const p = part(x, y, s);
      // The tile's outline, corner by corner: a square corner is one point; a cut corner (both its side neighbours are
      // something else) is a few points on an arc (or a straight cut), and the piece cut away is filled with the lower
      // of the two neighbours' surfaces.
      const outline: [number, number][] = [];
      CORNERS.forEach((c, i) => {
        const ox = x + c.cx, oy = y + c.cy;
        const sideA = at(x + c.nx, y), sideB = at(x, y + c.ny), diag = at(x + c.nx, y + c.ny);
        // A corner is curved when both side neighbours are the same other surface T: the outside corner of whichever
        // stands higher. If that's this tile (a lawn's corner on the road), its corner is cut round and the piece is T;
        // if it's T (this tile sits in T's inside corner), T grows round into this tile's corner. The higher one has
        // the curved side; its corner style decides (round, straight across, or square: left alone).
        const T = sideA;
        if (!T || T !== sideB || T === s) return void outline.push([ox, oy]);
        const mineHigher = look.top >= SURFACES[T].top;
        const high = mineHigher ? look : SURFACES[T];
        const real = mineHigher ? diag !== s : diag === T; // (otherwise two pieces only touch diagonally: leave it)
        if (high.corner === 'square' || !real) return void outline.push([ox, oy]);
        // From the corner's previous edge to its next edge (clockwise).
        const prev = CORNERS[(i + 3) % 4], next = CORNERS[(i + 1) % 4];
        const fromDir = [Math.sign(prev.cx - c.cx), Math.sign(prev.cy - c.cy)];
        const toDir = [Math.sign(next.cx - c.cx), Math.sign(next.cy - c.cy)];
        const pts: [number, number][] = [];
        if (high.corner === 'cut') pts.push([ox + fromDir[0] * R, oy + fromDir[1] * R], [ox + toDir[0] * R, oy + toDir[1] * R]);
        else {
          // The arc's centre is R in from the corner along both edges: it bulges towards the corner when this tile is
          // the higher one (its corner rounded off), and away from it when T is (T's inside corner rounded).
          const ccx = ox + (fromDir[0] + toDir[0]) * R, ccy = oy + (fromDir[1] + toDir[1]) * R;
          const a0 = Math.atan2(oy + fromDir[1] * R - ccy, ox + fromDir[0] * R - ccx);
          const a1 = Math.atan2(oy + toDir[1] * R - ccy, ox + toDir[0] * R - ccx);
          let d = a1 - a0;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          if (!mineHigher) {
            // Bulging into this tile: centred on the corner itself instead.
            for (let k = 0; k <= ARC; k++) {
              const b0 = Math.atan2(fromDir[1], fromDir[0]), b1 = Math.atan2(toDir[1], toDir[0]);
              let e = b1 - b0;
              if (e > Math.PI) e -= 2 * Math.PI;
              if (e < -Math.PI) e += 2 * Math.PI;
              const t = b0 + (e * k) / ARC;
              pts.push([ox + Math.cos(t) * R, oy + Math.sin(t) * R]);
            }
          } else for (let k = 0; k <= ARC; k++) {
            const t = a0 + (d * k) / ARC;
            pts.push([ccx + Math.cos(t) * R, ccy + Math.sin(t) * R]);
          }
        }
        outline.push(...pts);
        // The piece between the corner and the curve is T, at T's height.
        const tl = SURFACES[T];
        const fc = shade(tl.color, 1 + (hash(x + c.nx, y + c.ny) - 0.5) * 2 * (tl.vary ?? 0.04));
        const fp = part(x, y, T);
        for (let k = 0; k + 1 < pts.length; k++) tri(fp, [ox, tl.top, oy], [pts[k][0], tl.top, pts[k][1]], [pts[k + 1][0], tl.top, pts[k + 1][1]], fc);
        // The curved side, from the higher surface down to the lower.
        const lowTop = Math.min(look.top, tl.top);
        if (high.top > lowTop) {
          const sc = shade(high.side ?? high.color, high.side ? 1 : 0.75);
          for (let k = 0; k + 1 < pts.length; k++) quadSide(mineHigher ? p : fp, pts[k], pts[k + 1], high.top, lowTop, sc);
        }
      });
      // The top: a fan from the tile's middle (it's convex).
      const mid = [x + 0.5, look.top, y + 0.5];
      for (let k = 0; k < outline.length; k++) {
        const a = outline[k], b = outline[(k + 1) % outline.length];
        tri(p, mid, [a[0], look.top, a[1]], [b[0], look.top, b[1]], top);
      }
      // Its sides along the tile's straight edges, where the neighbour is lower: N, E, S, W (clockwise).
      const edges = [
        { n: at(x, y - 1), a: [x, y], b: [x + 1, y] },
        { n: at(x + 1, y), a: [x + 1, y], b: [x + 1, y + 1] },
        { n: at(x, y + 1), a: [x + 1, y + 1], b: [x, y + 1] },
        { n: at(x - 1, y), a: [x, y + 1], b: [x, y] },
      ] as const;
      for (const e of edges) {
        const below = e.n ? SURFACES[e.n].top : look.top - 0.1;
        if (below >= look.top) continue;
        // The stretch of the edge between the corners (a cut corner already has its own side).
        const inside = (pt: readonly number[]) => outline.some((o) => Math.abs(o[0] - pt[0]) < 1e-6 && Math.abs(o[1] - pt[1]) < 1e-6);
        let a = [...e.a] as [number, number], b = [...e.b] as [number, number];
        const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
        if (!inside(a)) a = [a[0] + dx * R, a[1] + dy * R];
        if (!inside(b)) b = [b[0] - dx * R, b[1] - dy * R];
        quadSide(p, a, b, look.top, below, sideCol);
      }
    }

  for (const { pos, col, s } of parts.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // Texture coordinates from the ground's own x and z (v0.56): one picture every `scale` tiles, seamless from tile to
    // tile and from area to area.
    const scale = SURFACE_TEX[s]?.scale ?? 1;
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) {
      uv[i * 2] = pos[i * 3] / scale;
      uv[i * 2 + 1] = pos[i * 3 + 2] / scale;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, surfaceMaterial(s));
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
