// Builds the static city for the Street view: low-poly "model town" shapes in a dark, gritty
// dusk palette (docs/design.md §7b), on an island in the ocean:
// asphalt with lane lines and zebra crossings, pavements, brick and concrete buildings with window
// grids, coloured trims, rooftop props and striped awnings, round low-poly trees, lamps,
// traffic lights, and a beach with rocks where the island meets the ocean. Plus the special places
// where crimes happen: the big park with its fountain, the basketball court, Eddy's store.
// Lots of repeated things (trees, lamps, road paint) use InstancedMesh so phones stay smooth.
import * as THREE from 'three';
import { SURFACES, buildFloor } from './floor';
import { DETAIL_GAIN, animateWater, waterTexture } from './textures';
import { COAST_ROCKS, SHALLOWS, coastAt } from './coast';
import {
  BAR, TURF_SITE, BCOLS, BLOCK_SIZE, BROWS, BUILDINGS, CANDY, COURT, ENCLOSURES, FIXTURES, GAS, H, LOTS, NODES, NPCS, PARK, PARKED_CARS, PARK_AREA, PARK_BLOCKS, PARK_BOUNDS, PLAZA, inPark, onParkPath, OLD_ROWS,
  PARKING, PARKING_NE, PARKING_S, PITCH, SPAWN, STATIONS, YARD, YARD_GATES, STREET, STORE, W, WEAPONS, blockRect, buildBlocked, gi, inRect, type Room,
  FLOOR_H, HOSPITAL, LOBBY, STAIRS, WARD, WAKE,
  MANHOLE, SEWER, SEWER_BRIDGES, floorY, THRIFT, THRIFT_GATE, THRIFT_YARD, SUPERSTORE, SUPERSTORE_GATE, SUPERSTORE_LOT, SUPERSTORE_YARD,
  CLUB, CLUB_DOOR, HOTLINE, HOTLINE_GATE, HOTLINE_YARD, JUNKYARD, JUNKYARD_GATE, NEST, NEST_GATE, NEST_TUNNEL,
  BANK, BANK_DOOR, CITY_BX, CITY_COLS, FACTORY, FACTORY_DOOR, FACTORY_LOT, FACTORY_LOT_GATE, FACTORY_SITE, SEWER_CHANNEL, SEWER_DEPTH, SEWER_LADDER,
} from './map';
import * as L from './streetLife';
import { buildContainer, buildDiceCrate, buildLookout, buildRubble, buildRuinWall, buildStringLights, buildStrippedCar } from './props';
import { withModel } from './models';
import { Kit, canvasTex, face, mergeStatic, signTexture, uOf } from './kit';
import { mulberry32 } from '../game/rng';

// Gritty dusk palette: brick, grimy concrete, soot; muted trims; worn paint.
const C = {
  asphalt: 0x34373d,
  paint: 0x9c978a,
  pavement: 0x6d6962,
  grass: 0x45663a,
  sea: 0x15303f,
  shallows: 0x24536a,
  sand: 0x7d705a,
  rock: 0x5a5852,
  quay: 0x5e5951,
  roof: 0x45423e,
  walls: [0x7a4a3a, 0x6b4a3c, 0x5f5d5a, 0x8a7f70, 0x4f4a45, 0x6e5f50, 0x83503e],
  trims: [0x7a2f28, 0x2e5f5b, 0x8a6a2a, 0x2f4562, 0x6a4526],
  trunk: 0x4a3423,
  leaves: [0x355a2c, 0x3f6834, 0x2e4f27],
  lamp: 0xffb24d,
  litWindow: 0xffc46b,
};

/** One building that can fade out when it stands between the camera and you. */
export interface Fadeable {
  walls: THREE.Mesh[];
  mats: THREE.Material[];
  /** Hidden while faded (roof props, signs, the store's roof). */
  props: THREE.Object3D[];
  opacity: number;
  /** Fade regardless of the camera (the store, while you're inside it). */
  force?: boolean;
  /** v0.60: the cut-away. While the building stands on the camera's side of you (low on the screen), it's cut down to
   *  its ground floor: `main` (if any) squashed to `keep` high, `upper` (floors above, their windows, the roof edge and
   *  clutter, a shop's apartments) hidden. */
  cut?: { main?: THREE.Mesh; height: number; keep: number; center: THREE.Vector3; upper: THREE.Object3D[]; on: boolean };
}
/** The lowest point of an object (for picking what's above a building's ground floor). */
export const minY = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).min.y;

/** A soft orange circle for the light pool under each street lamp. */
const lightPoolTex = () =>
  canvasTex(
    128,
    128,
    (g) => {
      const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255, 178, 77, 0.55)');
      grad.addColorStop(1, 'rgba(255, 178, 77, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    },
    false,
  );

// ---------- instancing helper ----------
class Batch {
  private mats: THREE.Matrix4[] = [];
  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private shadow = true,
  ) {}
  add(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0) {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz));
    this.mats.push(m);
  }
  /**
   * One instanced mesh per area of the map (v0.54): a single one over the whole map can't be left out when it's off
   * screen, so every tree and lamp on the island was drawn every frame, and the bigger map doubled that.
   */
  build(scene: THREE.Scene) {
    const areas = new Map<string, THREE.Matrix4[]>();
    const p = new THREE.Vector3();
    for (const m of this.mats) {
      p.setFromMatrixPosition(m);
      const k = `${Math.floor(p.x / BATCH_AREA)},${Math.floor(p.z / BATCH_AREA)}`;
      if (!areas.has(k)) areas.set(k, []);
      areas.get(k)!.push(m);
    }
    const out: THREE.InstancedMesh[] = [];
    for (const list of areas.values()) {
      const im = new THREE.InstancedMesh(this.geo, this.mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      im.castShadow = this.shadow;
      im.receiveShadow = true;
      scene.add(im);
      out.push(im);
    }
    return out;
  }
}
/** How big (tiles) one area of instanced things is: off-screen areas aren't drawn; fewer, bigger areas, fewer draw calls. */
const BATCH_AREA = 40;

export function buildCity(scene: THREE.Scene) {
  const disposables: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => own(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  const geoBox = (w: number, h: number, d: number) => own(new THREE.BoxGeometry(w, h, d));
  const rng = mulberry32(2024);
  let ironMat: THREE.Material | null = null;
  const iron2 = () => (ironMat ??= lam(0x3a3d42));
  // Every piece added here is static: at the end it's merged with its neighbours (kit.ts, mergeStatic) unless it's in
  // `keep` (animated). So build freely, piece by piece; it costs triangles, not draw calls.
  const statics: THREE.Mesh[] = [];
  const keep = new Set<THREE.Object3D>();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    statics.push(m);
    return m;
  };
  const kit = new Kit(add, own);

  // ---------- the island: open ocean all around, shallow water, a sandy beach with rocks ----------
  const plane = (w: number, h: number, color: number, y: number, cx = W / 2, cz = H / 2) => {
    const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), lam(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  plane(W + 600, H + 600, C.sea, -0.32); // open ocean to the horizon (the fog hides the edge)
  // v0.55: the beach and the shallows from the floor kit: a sandy edge whose width wobbles, round corners (coast.ts).
  scene.add(buildFloor({ x0: -SHALLOWS - 1, y0: -SHALLOWS - 1, w: W + 2 * SHALLOWS + 2, h: H + 2 * SHALLOWS + 2, at: coastAt }));
  // A low kerb where the streets meet the sand (just below the asphalt, so it only shows around the edge).
  add(geoBox(W + 0.3, 0.12, H + 0.3), lam(C.quay), W / 2, -0.075, H / 2, false);
  plane(W, H, C.asphalt, 0);
  // Rocks along the waterline: on sand tiles next to the water. (Their own random numbers; the city's shared ones
  // move on as many as the old rocks took, so nothing placed after them moves.)
  for (let i = 0; i < 450; i++) rng();
  // (v0.57: the map's list, COAST_ROCKS: they're solid, so walking and drawing must agree on where they are.)
  const rocks = new Batch(own(new THREE.DodecahedronGeometry(0.35, 0)), lam(C.rock, { flatShading: true }));
  for (const r of COAST_ROCKS) rocks.add(r.x + r.ox, -0.2, r.y + r.oz, r.sc, r.sy, r.sc, r.rot);
  rocks.build(scene);

  // ---------- streets: a road for two cars (dashed centre line), zebra crossings, curbs and sidewalks ----------
  // Every street is 7 tiles: sidewalk 1.5, road 4, sidewalk 1.5. Each block has a sidewalk all around it, with a
  // curb along the road edge.
  const dash = new Batch(geoBox(0.07, 0.01, 0.7), lam(C.paint), false);
  const zebra = new Batch(geoBox(0.32, 0.01, 2.6), lam(0xd8d2c4), false);
  const inCrossing = (v: number) => v % PITCH < STREET;
  /** On the Factory's site (I-003 + I-006 merged, the street between them included): no road paint, lamps or lights. */
  // (v0.54: the park's joins too: they were streets, now they're lawn. v0.58: the bar and the Yard's site too.)
  const onSite = (x: number, z: number) =>
    [FACTORY_SITE, TURF_SITE].some((S) => x >= S.x0 - 0.2 && x <= S.x1 + 1.2 && z >= S.y0 - 0.2 && z <= S.y1 + 1.2) || inPark(Math.floor(x), Math.floor(z));
  /** How many roads meet at crossing (i, j) (the one north-west of block (i, j)): 4 inside the city, 3 along the
   *  island's edge, 2 on a bend; a road that became the park or the Factory's site doesn't count. */
  const roadsAt = (i: number, j: number) => {
    const cx = i * PITCH + STREET / 2, cz = j * PITCH + STREET / 2;
    const road = (x: number, z: number) => x >= 0 && z >= 0 && x < W && z < H && !onSite(x, z);
    return [road(cx, cz - STREET), road(cx, cz + STREET), road(cx - STREET, cz), road(cx + STREET, cz)].filter(Boolean).length;
  };
  /** Blocks in the order the old map rolled their random numbers (column by column), then the new rows (v0.54). */
  const blocksInOrder = (bx0: number, bx1: number) => {
    const out: [number, number][] = [];
    for (const [r0, r1] of [[0, OLD_ROWS], [OLD_ROWS, BROWS]]) for (let bx = bx0; bx < bx1; bx++) for (let by = r0; by < r1; by++) out.push([bx, by]);
    return out;
  };
  for (let k = 0; k <= BCOLS; k++) {
    const x = k * PITCH + STREET / 2; // centre of a north–south street
    for (let z = 0; z < H; z += 1.6) if (!inCrossing(Math.floor(z)) && !inCrossing(Math.floor(z + 0.7)) && !onSite(x, z + 0.35)) dash.add(x, 0.006, z + 0.35);
  }
  for (let k = 0; k <= BROWS; k++) {
    const z = k * PITCH + STREET / 2;
    for (let x = 0; x < W; x += 1.6) if (!inCrossing(Math.floor(x)) && !inCrossing(Math.floor(x + 0.7)) && !onSite(x + 0.35, z)) dash.add(x + 0.35, 0.006, z, 1, 1, 1, Math.PI / 2);
  }
  // Zebra crossings: one per street, on the south and east side of each crossing (just outside it, across the
  // road). Two per street, one at each end, was too many: half the map was zebra.
  for (let i = 0; i <= BCOLS; i++)
    for (let j = 0; j <= BROWS; j++) {
      const ix = i * PITCH + STREET / 2;
      const iz = j * PITCH + STREET / 2;
      for (let st = 0; st < 6; st++) {
        const off = -1.5 + st * 0.6;
        if (j < BROWS && !onSite(ix + off, iz + STREET / 2 + 1.4)) zebra.add(ix + off, 0.007, iz + STREET / 2 + 1.4);
        if (i < BCOLS && !onSite(ix + STREET / 2 + 1.4, iz + off)) zebra.add(ix + STREET / 2 + 1.4, 0.007, iz + off, 1, 1, 1, Math.PI / 2);
      }
    }
  dash.build(scene);
  zebra.build(scene);
  // Sidewalks: one slab around each block (1.5 tiles out from it), with a lighter curb on the road edge and joints.
  const SW = 1.5;
  const sidewalkMat = lam(C.pavement);
  const curbMat = lam(0x8a857c);
  const joints = new Batch(geoBox(0.03, 0.004, SW), lam(0x5c5852), false);
  // v0.55: the sidewalks have rounded corners, like real crossings (CORNER: the curb's radius, in tiles): each block's
  // sidewalk is one slab with round corners and a curb round its edge, and the park has one round the whole cross
  // (round on its outside corners, and filled round in its inside corners). Only the look: you walk the same tiles.
  const CORNER = 1.5;
  for (let bx = 0; bx < BCOLS; bx++)
    for (let by = 0; by < BROWS; by++) {
      const b = blockRect(bx, by);
      if (inPark(b.x0, b.y0)) continue; // (the park's sidewalk is one, below)
      // (v0.58: nor the merged sites': one sidewalk round each, drawn with it; a block's own curb showed through.)
      if ([FACTORY_SITE, TURF_SITE].some((S) => inRect(S, b.x0, b.y0))) continue;
      const cx = b.x0 + BLOCK_SIZE / 2;
      const cz = b.y0 + BLOCK_SIZE / 2;
      const size = BLOCK_SIZE + 2 * SW;
      sidewalk([[b.x0, b.y0], [b.x1 + 1, b.y0], [b.x1 + 1, b.y1 + 1], [b.x0, b.y1 + 1]], 0.07, 0.09);
      // Joints along the straight stretches (not round the corners).
      for (let t = -size / 2 + CORNER + 0.5; t < size / 2 - CORNER; t += 1) {
        joints.add(cx + t, 0.072, b.y0 - SW / 2, 1, 1, 1, 0);
        joints.add(cx + t, 0.072, b.y1 + 1 + SW / 2, 1, 1, 1, 0);
        joints.add(b.x0 - SW / 2, 0.072, cz + t, 1, 1, 1, Math.PI / 2);
        joints.add(b.x1 + 1 + SW / 2, 0.072, cz + t, 1, 1, 1, Math.PI / 2);
      }
    }
  {
    // The park: one sidewalk round the whole cross (its blocks and the joins between them).
    const P = PLAZA, N = PARK_BLOCKS[0], Wb = PARK_BLOCKS[1], E = PARK_BLOCKS[3], S = PARK_BLOCKS[4];
    const px0 = P.x0, px1 = P.x1 + 1, py0 = P.y0, py1 = P.y1 + 1;
    sidewalk(
      [[px0, N.y0], [px1, N.y0], [px1, py0], [E.x1 + 1, py0], [E.x1 + 1, py1], [px1, py1], [px1, S.y1 + 1], [px0, S.y1 + 1], [px0, py1], [Wb.x0, py1], [Wb.x0, py0], [px0, py0]],
      0.07, 0.09,
    );
  }
  /** A sidewalk slab round a shape (a polygon of block edges, corners in order), SW wide, with round corners and a
   *  curb round its edge: the slab's top at `top`, the curb's at `curbTop`. */
  function sidewalk(poly: [number, number][], top: number, curbTop: number) {
    const flat = (pts: THREE.Vector2[], hole: THREE.Vector2[] | null, h: number, y: number, mat: THREE.Material) => {
      const shape = new THREE.Shape(pts);
      if (hole) shape.holes.push(new THREE.Path(hole));
      const g = own(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }));
      g.rotateX(Math.PI / 2);
      g.translate(0, y, 0);
      add(g, mat, 0, 0, 0, false);
    };
    flat(outline(poly, SW, CORNER, CORNER), null, top, top, sidewalkMat);
    flat(outline(poly, SW + 0.06, CORNER + 0.06, CORNER - 0.06), outline(poly, SW - 0.06, CORNER - 0.06, CORNER + 0.06), curbTop, curbTop, curbMat);
  }
  /**
   * A polygon of straight, square edges (corners in order) grown outwards by d, its corners rounded: outside corners
   * with radius `convex`, inside corners with `concave` (both measured on the grown line).
   */
  function outline(poly: [number, number][], d: number, convex: number, concave: number): THREE.Vector2[] {
    const n = poly.length;
    let area = 0;
    for (let i = 0; i < n; i++) area += poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1];
    const sgn = Math.sign(area);
    const dir = (a: [number, number], b: [number, number]) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const normal = (u: number[]) => (sgn > 0 ? [u[1], -u[0]] : [-u[1], u[0]]);
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const prev = poly[(i + n - 1) % n], c = poly[i], next = poly[(i + 1) % n];
      const u = dir(prev, c), v = dir(c, next);
      const nu = normal(u), nv = normal(v);
      const C = [c[0] + (nu[0] + nv[0]) * d, c[1] + (nu[1] + nv[1]) * d];
      const isConvex = Math.sign(u[0] * v[1] - u[1] * v[0]) === sgn;
      const r = Math.max(0.01, isConvex ? convex : concave);
      const A = [C[0] - u[0] * r, C[1] - u[1] * r];
      const B = [C[0] + v[0] * r, C[1] + v[1] * r];
      const O = [A[0] + v[0] * r, A[1] + v[1] * r];
      const a0 = Math.atan2(A[1] - O[1], A[0] - O[0]);
      let da = Math.atan2(B[1] - O[1], B[0] - O[0]) - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const SEG = 5;
      for (let k = 0; k <= SEG; k++) out.push(new THREE.Vector2(O[0] + Math.cos(a0 + (da * k) / SEG) * r, O[1] + Math.sin(a0 + (da * k) / SEG) * r));
    }
    return out;
  }
  joints.build(scene);

  // ---------- pavements, parks, trees ----------
  const trunks = new Batch(own(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6)), lam(C.trunk));
  const crownGeo = own(new THREE.IcosahedronGeometry(0.42, 0));
  const crowns = C.leaves.map((c) => new Batch(crownGeo, lam(c, { flatShading: true })));
  const tree = (x: number, z: number, size = 1) => {
    trunks.add(x, 0.25 * size, z, size, size, size);
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const s = size * (0.75 + rng() * 0.45);
      crowns[Math.floor(rng() * crowns.length)].add(x + (rng() - 0.5) * 0.35 * size, (0.68 + i * 0.2) * size, z + (rng() - 0.5) * 0.35 * size, s, s, s, rng() * 6);
    }
  };
  const pavement = lam(C.pavement);
  const grassMat = lam(C.grass);
  /** Marks lying flat on the ground (stains, cracks, painted lines): pulled towards the camera so they never flicker
   *  against the ground they lie on. */
  const DECAL = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const busy = new Set<string>(); // tiles with spots/NPCs or in front of doors: keep trees and props off them
  for (const n of NODES) busy.add(`${n.x},${n.y}`);
  for (const p of NPCS) busy.add(`${p.x},${p.y}`);
  for (const e of ENCLOSURES) for (const o of e.openings) for (let d = -1; d <= 1; d++) busy.add(`${o.outside[0] + d},${o.outside[1]}`), busy.add(`${o.outside[0] + d},${o.outside[1] + 1}`);
  for (let d = -1; d <= 1; d++) busy.add(`${SPAWN[0] + d},${SPAWN[1]}`);
  // v0.55: nothing in front of the park's entrances (where a path leaves the park): two tiles out, a tile either side.
  for (const r of PARK_AREA)
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) {
        if (!onParkPath(x, y)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (!inPark(x + dx, y + dy))
            for (let k = 1; k <= 2; k++) for (let e = -1; e <= 1; e++) busy.add(`${x + dx * k + dy * e},${y + dy * k + dx * e}`);
      }
  // Nothing in front of the Yard's gates.
  for (const [gx, gy] of YARD_GATES) for (let d = -1; d <= 1; d++) for (let e = 1; e <= 2; e++) busy.add(`${gx + d},${gy + e}`);
  for (const lot of LOTS) {
    const r = lot.rect;
    const cx = r.x0 + 2.5;
    const cz = r.y0 + 2.5;
    if (lot.kind === 'special') continue; // drawn by their own sections below
    add(geoBox(5, 0.075, 5), pavement, cx, 0.037, cz, false);
    if (lot.kind === 'park') {
      add(geoBox(4.8, 0.09, 4.8), grassMat, cx, 0.045, cz, false);
      for (let i = 0; i < 5; i++) {
        const tx = cx - 1.8 + rng() * 3.6;
        const tz = cz - 1.8 + rng() * 3.6;
        const s = 1.1 + rng() * 0.5;
        // Keep the trees off the barbecue and the tiles around it (where you stand to cook).
        if (STATIONS.some((st) => Math.abs(tx - st.x - 0.5) < 1.8 && Math.abs(tz - st.y - 0.5) < 1.8)) continue;
        tree(tx, tz, s);
      }
    }
  }
  // Street trees in pits along the sidewalks, a few per block side (never in front of a door or a spot).
  const pit = new Batch(geoBox(0.8, 0.02, 0.8), lam(0x3a2a1e), false);
  for (const [bx, by] of blocksInOrder(CITY_BX, CITY_BX + CITY_COLS)) { // (no trees in the Industrial zone)
    {
      const b = blockRect(bx, by);
      const spots: [number, number][] = [];
      for (const t of [1.5, 5, 8.5]) {
        spots.push([b.x0 + t, b.y0 - 0.75], [b.x0 + t, b.y1 + 1.75], [b.x0 - 0.75, b.y0 + t], [b.x1 + 1.75, b.y0 + t]);
      }
      for (const [tx, tz] of spots) {
        if (rng() < 0.6 || busy.has(`${Math.floor(tx)},${Math.floor(tz)}`) || onSite(tx, tz)) continue;
        pit.add(tx, 0.075, tz);
        tree(tx, tz, 1.25 + rng() * 0.3);
      }
    }
  }
  pit.build(scene);

  // ---------- street lamps (tall, an arm over the road) and traffic lights at the crossings ----------
  const poleGeo = own(new THREE.CylinderGeometry(0.04, 0.06, 2.3, 6));
  const poles = new Batch(poleGeo, lam(0x2b2b2e));
  const lampHeads = new Batch(geoBox(0.26, 0.08, 0.6), lam(0x2b2b2e));
  const lampGlow = new Batch(geoBox(0.2, 0.03, 0.24), lam(C.lamp, { emissive: C.lamp, emissiveIntensity: 1.8 }), false);
  // (Pulled towards the camera, polygonOffset: the pools lie on grass, pavement and asphalt and must never fight with them
  // for the same depth, which flickers as the camera moves.)
  const poolMat = own(new THREE.MeshBasicMaterial({ map: own(lightPoolTex()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const pools = new Batch(own(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2)), poolMat, false);
  const lightPole = new Batch(own(new THREE.CylinderGeometry(0.035, 0.04, 1.9, 6)), lam(0x5a5f66));
  const lightBox = new Batch(geoBox(0.14, 0.4, 0.14), lam(0x2b2b2e));
  const redDot = new Batch(geoBox(0.07, 0.07, 0.02), lam(0xe0473a, { emissive: 0xe0473a, emissiveIntensity: 0.9 }), false);
  const greenDot = new Batch(geoBox(0.07, 0.07, 0.02), lam(0x5bd06a, { emissive: 0x5bd06a, emissiveIntensity: 0.9 }), false);
  /** A lamp at (x, z) whose arm reaches over the road in direction (dx, dz). */
  const lamp = (x: number, z: number, dx: number, dz: number, own = false) => {
    if (!own && onSite(x, z)) return; // (own: a lamp that belongs where it stands, like the park's)
    poles.add(x, 1.15, z);
    const rot = Math.atan2(dx, dz);
    lampHeads.add(x + dx * 0.4, 2.3, z + dz * 0.4, 1, 1, 1, rot);
    lampGlow.add(x + dx * 0.45, 2.25, z + dz * 0.45, 1, 1, 1, rot);
    pools.add(x + dx * 0.7, 0.085, z + dz * 0.7);
  };
  for (let bx = 0; bx < BCOLS; bx++)
    for (let by = 0; by < BROWS; by++) {
      const b = blockRect(bx, by);
      // Two lamps on each side of the block, near the curb, staggered so they don't face each other. (v0.55: none round
      // the park's blocks: no street lights on the park's edges.)
      for (const t of inPark(b.x0, b.y0) ? [] : [3.2, 7.8]) {
        lamp(b.x0 + t, b.y0 - 1.3, 0, -1);
        lamp(b.x0 + BLOCK_SIZE - t, b.y1 + 2.3, 0, 1);
        lamp(b.x0 - 1.3, b.y0 + BLOCK_SIZE - t, -1, 0);
        lamp(b.x1 + 2.3, b.y0 + t, 1, 0);
      }
      // Traffic lights on the block's corners, facing the crossing (v0.54: only where 3 or 4 roads meet; not on a bend,
      // like the island's corners or the park cross's inner corners).
      // (v0.55: a little further in, on the rounded corner.)
      for (const [cx, cz, i, ix, iz] of [[b.x0 - 0.85, b.y0 - 0.85, 0, bx, by], [b.x1 + 1.85, b.y0 - 0.85, 1, bx + 1, by], [b.x0 - 0.85, b.y1 + 1.85, 1, bx, by + 1], [b.x1 + 1.85, b.y1 + 1.85, 0, bx + 1, by + 1]] as const) {
        if (onSite(cx, cz) || roadsAt(ix, iz) < 3) continue;
        lightPole.add(cx, 0.95, cz);
        lightBox.add(cx, 1.9, cz);
        (i ? redDot : greenDot).add(cx, 2.0, cz + (cz < b.y0 ? -0.08 : 0.08));
      }
    }

  // ---------- grime: dumpsters and trash bags in the alleys between buildings ----------
  const dumpsters = new Batch(geoBox(1.1, 0.7, 0.62), lam(0x2f4a36));
  const dumpLids = new Batch(geoBox(1.12, 0.05, 0.64), lam(0x1f2a22));
  const bags = new Batch(own(new THREE.IcosahedronGeometry(0.17, 0)), lam(0x1c1c1f, { flatShading: true }));
  {
    const blocked = buildBlocked();
    // (The old map's lots first, in their old order, so their dumpsters stay put.)
    for (const lot of [...LOTS.filter((l) => l.by < OLD_ROWS), ...LOTS.filter((l) => l.by >= OLD_ROWS)]) {
      if (lot.kind !== 'buildings') continue;
      // Free tiles inside the lot (alleys and gaps between its buildings): one in three gets a dumpster.
      const free: [number, number][] = [];
      for (let y = lot.rect.y0; y <= lot.rect.y1; y++) for (let x = lot.rect.x0; x <= lot.rect.x1; x++) if (!blocked[gi(x, y)]) free.push([x, y]);
      if (!free.length || rng() < 0.35) continue;
      const [x, y] = free[Math.floor(rng() * free.length)];
      const rot = rng() < 0.5 ? 0 : Math.PI / 2;
      dumpsters.add(x + 0.5, 0.42, y + 0.5, 1, 1, 1, rot);
      dumpLids.add(x + 0.5, 0.79, y + 0.5, 1, 1, 1, rot);
      for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) bags.add(x + 0.2 + rng() * 0.6, 0.15, y + 0.2 + rng() * 0.6, 1, 0.8 + rng() * 0.3, 1, rng() * 3);
    }
  }
  for (const b of [dumpsters, dumpLids, bags]) b.build(scene);

  // ---------- street life: cars parked along the curbs, and things on the sidewalks ----------
  for (const c of PARKED_CARS) {
    const car = c.ambulance ? L.buildAmbulance() : L.buildBigCar(c.color);
    const mid = c.along === 'x' ? [c.x + 1.5, c.y + 0.5] : [c.x + 0.5, c.y + 1.5];
    car.position.set(mid[0], 0.0, mid[1]);
    car.rotation.y = c.along === 'x' ? (c.y % PITCH < STREET / 2 ? Math.PI : 0) : c.x % PITCH < STREET / 2 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(car);
  }
  {
    // Per block side, maybe a hydrant, a bin, a mailbox, newspaper boxes, a bench or a bike rack, on the sidewalk
    // close to the buildings or the curb. Never in front of a door.
    const kinds = [() => L.buildHydrant(), () => L.buildBin(rng() < 0.3), () => L.buildMailbox(), () => L.buildNewsBoxes(), () => L.buildBench(), () => L.buildBikeRack()];
    for (const [bx, by] of blocksInOrder(CITY_BX, CITY_BX + CITY_COLS)) { // (city streets only)
      {
        const b = blockRect(bx, by);
        const sides = [
          { x: (t: number) => b.x0 + t, z: () => b.y0 - 0.45, rot: Math.PI },
          { x: (t: number) => b.x0 + t, z: () => b.y1 + 1.45, rot: 0 },
          { x: () => b.x0 - 0.45, z: (t: number) => b.y0 + t, rot: -Math.PI / 2 },
          { x: () => b.x1 + 1.45, z: (t: number) => b.y0 + t, rot: Math.PI / 2 },
        ];
        for (const side of sides) {
          for (const t of [2.2, 6.7]) {
            if (rng() < 0.55) continue;
            const x = side.x(t);
            const z = side.z(t);
            if (busy.has(`${Math.floor(x)},${Math.floor(z)}`)) continue;
            const g = kinds[Math.floor(rng() * kinds.length)]();
            if (onSite(x, z)) continue; // (none on the park's lawn; after its random pick, so the rest stay put)
            g.position.set(x, 0.07, z);
            g.rotation.y = side.rot;
            scene.add(g);
          }
        }
      }
    }
    // A bus stop on the park's sidewalk, across from the candy store.
    const stop = L.buildBusStop();
    stop.position.set(PARK.x0 + 5, 0.07, PARK.y0 - 0.55); // (v0.55: between the two paths out, not in front of one)
    stop.rotation.y = Math.PI;
    scene.add(stop);
  }

  // ---------- buildings ----------
  const fadeables: Fadeable[] = [];
  /** Bare brick (one floor high, one tile wide per repeat) for boarded-up buildings. */
  const brickTex = own(
    canvasTex(64, 96, (g) => {
      g.fillStyle = '#d8d0c4';
      g.fillRect(0, 0, 64, 96);
      for (let row = 0; row < 12; row++) {
        const off = row % 2 ? 0 : 16;
        for (let col = -1; col < 3; col++) {
          const shade = 200 + ((row * 7 + col * 13) % 5) * 9;
          g.fillStyle = `rgb(${shade},${shade - 12},${shade - 22})`;
          g.fillRect(col * 32 + off + 1, row * 8 + 1, 30, 6);
        }
      }
    }),
  );
  // One floor is a person and a bit (the characters are about 1.2 tall), so a building with 3 rows of windows is
  // 3 floors a person could live in, not a toy tower with 8 floors of half-person-sized windows.
  // v0.60: 1.9 (was 1.45, barely taller than a person: the houses looked like dolls' houses next to people and the
  // bar). About 1.6 people a floor, 2 to 4 floors.
  const FLOOR = 1.9;
  // ---------- the Industrial zone: corrugated-metal sheds and workshops ----------
  /** Corrugated metal: vertical ribs with streaks of rust. */
  const corrugated = own(
    canvasTex(64, 64, (g) => {
      g.fillStyle = '#c8c8c4';
      g.fillRect(0, 0, 64, 64);
      for (let x = 0; x < 64; x += 8) {
        g.fillStyle = '#9a9a96';
        g.fillRect(x, 0, 3, 64);
        g.fillStyle = '#e2e2de';
        g.fillRect(x + 4, 0, 1, 64);
      }
      g.fillStyle = 'rgba(140, 80, 40, 0.35)';
      for (let i = 0; i < 6; i++) g.fillRect((i * 23) % 60, (i * 17) % 40, 3, 24);
    }),
  );
  // v0.47: every building is made from the kit (kit.ts): real windows with frames and sills on every wall that faces
  // open air (a street, an alley, a yard: not one pressed against its neighbour), a door with a step and a lamp, shop
  // windows and awnings, a parapet, roof clutter. Their own random numbers, so they don't shift the rest of the city.
  const brng = mulberry32(4711);
  // How many floors stand on each tile (a wall above a lower neighbour's roof is open air too).
  const floorsOf = (b: (typeof BUILDINGS)[number]) => (b.industrial ? 1 : 2 + (b.height > 1.4 ? 1 : 0) + (b.height > 2.0 ? 1 : 0));
  const solid = new Map<string, number>();
  for (const b of BUILDINGS) for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) solid.set(`${x},${y}`, floorsOf(b));
  /** The tiles along one side of a building, each with how many floors of the neighbour cover it (0: open air). */
  const sideTiles = (b: (typeof BUILDINGS)[number], side: 'n' | 's' | 'e' | 'w') => {
    const out: { x: number; z: number; covered: number }[] = [];
    if (side === 'n' || side === 's')
      for (let x = b.x; x < b.x + b.w; x++) {
        const y = side === 'n' ? b.y - 1 : b.y + b.h;
        out.push({ x: x + 0.5, z: side === 'n' ? b.y : b.y + b.h, covered: solid.get(`${x},${y}`) ?? 0 });
      }
    else
      for (let y = b.y; y < b.y + b.h; y++) {
        const x = side === 'w' ? b.x - 1 : b.x + b.w;
        out.push({ x: side === 'w' ? b.x : b.x + b.w, z: y + 0.5, covered: solid.get(`${x},${y}`) ?? 0 });
      }
    return out;
  };
  const CURTAINS = [0x8a2f28, 0x2f4562, 0x8a6a2a, 0x4a5a3a, 0x6a4a5a];
  const SHED_COLORS = [0x8a8f88, 0x7a6a5a, 0x6a7a80, 0x8a7a5a, 0x5a6268];
  const industrialShed = (b: (typeof BUILDINGS)[number]) => {
    const X0 = b.x;
    const Z0 = b.y;
    const X1 = b.x + b.w;
    const Z1 = b.y + b.h;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const h = 1.7 + (b.height % 1) * 0.9;
    const t = own(corrugated.clone());
    t.repeat.set(Math.max(b.w, b.h) * 2, 1.5);
    t.needsUpdate = true;
    const mWall = lam(SHED_COLORS[(b.x * 7 + b.y) % SHED_COLORS.length], { map: t });
    const walls = [add(geoBox(X1 - X0, h, Z1 - Z0), mWall, cx, h / 2, cz)];
    const r = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const props: THREE.Object3D[] = [kit.roof(r, h, 0x4a4a48, 0.075), ...kit.vent(cx + (X1 - X0) / 4, h + 0.08, cz)];
    // A roll-up door on the street side, a small door next to it with a bulb, a row of small high windows.
    const f = face(r, b.front === 'n' ? 'n' : 's');
    const doorW = Math.min(1.6, (X1 - X0) * 0.45);
    const du = uOf(f, cx - 0.3);
    props.push(...kit.door(f, du, { style: 'shutter', w: doorW, h: 1.2, color: 0x8a6a4a }));
    const ou = uOf(f, cx + doorW / 2 + 0.2);
    props.push(...kit.door(f, ou, { style: 'office', w: 0.5, h: 0.95, color: 0x3a4a5a, light: 'bulb' }));
    if (f.len >= 3) props.push(...kit.windowRow(f, 0.4, f.len - 0.4, h - 0.55, 1.1, { style: 'office', w: 0.5, h: 0.3, sill: false, skip: (u) => Math.abs(u - du) < doorW / 2 + 0.3 || Math.abs(u - ou) < 0.5, litChance: 0.3, rng: brng }));
    fadeables.push({ walls, mats: [mWall], props, opacity: 1 });
  };

  for (const b of BUILDINGS) {
    if (b.custom) continue; // drawn by its own section (the Thrift Store)
    if (b.industrial) {
      industrialShed(b);
      continue;
    }
    const floors = floorsOf(b);
    const height = floors * FLOOR + 0.12;
    const wall = C.walls[Math.floor(brng() * C.walls.length)];
    const trim = C.trims[Math.floor(brng() * C.trims.length)];
    // Each building gets its own materials so it can fade on its own.
    // Boarded-up buildings (the Yard's) are bare brick: their windows are boarded up, and the walls take graffiti.
    const brick = (across: number) => {
      const t = own(brickTex.clone());
      t.repeat.set(across, floors);
      t.needsUpdate = true;
      return t;
    };
    const mX = b.boarded ? lam(wall, { map: brick(b.w) }) : lam(wall);
    const mZ = b.boarded ? lam(wall, { map: brick(b.h) }) : mX;
    const mRoof = lam(C.roof);
    const mTrim = lam(trim);
    const bw = b.w - 0.1;
    const bd = b.h - 0.1;
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    const walls = add(geoBox(bw, height, bd), [mZ, mZ, mRoof, mRoof, mX, mX], cx, height / 2, cz);
    const r = { x0: b.x + 0.05, z0: b.y + 0.05, x1: b.x + b.w - 0.05, z1: b.y + b.h - 0.05 };
    const trimBand = kit.parapet({ x0: r.x0 - 0.03, z0: r.z0 - 0.03, x1: r.x1 + 0.03, z1: r.z1 + 0.03 }, height + 0.02, mTrim);
    const props: THREE.Object3D[] = [];
    // Rooftop clutter: air-con units, sometimes a water tank or an antenna.
    const nAc = 1 + Math.floor(brng() * 3);
    for (let i = 0; i < nAc; i++) props.push(...kit.acUnit(b.x + 0.4 + brng() * (b.w - 0.8), height, b.y + 0.4 + brng() * (b.h - 0.8)));
    if (brng() < 0.3) props.push(...kit.tank(b.x + 0.5, height, b.y + 0.5));
    if (brng() < 0.2) props.push(...kit.antenna(b.x + b.w - 0.4, height, b.y + 0.4));
    // The front faces the street: south for most, north for buildings along a block's north edge.
    const frontSide = b.front === 'n' ? 'n' : 's';
    const front = face(r, frontSide);
    const doorX = b.x + 0.5 + Math.floor(brng() * Math.max(1, b.w - 1));
    // Some ground floors on a street are shops: a shop window at person height and an awning.
    const block = blockRect(Math.floor(b.x / PITCH), Math.floor(b.y / PITCH));
    const onStreet = b.front === 'n' ? b.y === block.y0 : b.y + b.h - 1 === block.y1;
    const shop = !b.boarded && onStreet && b.w >= 2 && brng() < 0.55;
    const gw = Math.max(0.6, bw - 1.1);
    const gx = doorX < cx ? cx + 0.3 : cx - 0.3;
    // Windows on every side, every floor, where the wall faces open air. Upstairs some are lit, some have curtains.
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const f = face(r, side);
      for (const tile of sideTiles(b, side)) {
        const u = uOf(f, side === 'n' || side === 's' ? tile.x : tile.z);
        for (let fl = tile.covered; fl < floors; fl++) {
          const y = fl * FLOOR + 0.55;
          if (b.boarded) {
            if (fl > 0) props.push(...kit.window(f, u, y, { style: 'boarded', w: 0.6, h: 0.9 }));
            continue;
          }
          if (fl === 0 && side === frontSide && (Math.abs(tile.x - doorX) < 0.6 || (shop && Math.abs(tile.x - gx) < gw / 2 + 0.3))) continue;
          const lit = brng() < 0.3;
          props.push(...kit.window(f, u, y, { w: 0.6, h: 0.85, lit, frame: fl === 0 ? trim : 0x3a3430, behind: lit && brng() < 0.35 ? CURTAINS[Math.floor(brng() * CURTAINS.length)] : undefined }));
        }
      }
    }
    // Every building has a front door at person size, with a step and a lamp: so you can tell how big it is, and that
    // people live there.
    // (v0.60: a door you'd fit through, taller than a person.)
    props.push(...kit.door(front, uOf(front, doorX), { w: 0.75, h: 1.5, color: 0x3a2a20, frame: trim, step: true, light: 'lamp' }));
    if (shop) {
      props.push(...kit.window(front, uOf(front, gx), 0.2, { style: 'shop', w: gw, h: 1.1, frame: trim }));
      const stripe = `#${C.trims[Math.floor(brng() * C.trims.length)].toString(16).padStart(6, '0')}`;
      props.push(...kit.awning(front, uOf(front, cx), 1.75, Math.max(0.7, bw - 0.3), { color: stripe, light: '#b8b0a0', depth: 0.5 }));
    }
    const pipe = brng() < 0.5 ? kit.drainpipe(front, brng() < 0.5 ? 0.08 : front.len - 0.08, height) : [];
    props.push(...pipe);
    // (The drainpipe runs from the ground to the roof: it goes with the floors above when the building is cut.)
    const upper = [...trimBand, ...pipe, ...props.filter((p) => minY(p) >= FLOOR - 0.25)];
    fadeables.push({
      walls: [walls, ...trimBand], mats: [mX, mZ, mRoof, mTrim], props, opacity: 1,
      cut: { main: walls, height, keep: FLOOR, center: new THREE.Vector3(cx, 0, cz), upper, on: false },
    });
  }

  // ---------- Central Park (Pickpocket Tourists; v0.54: the big cross, PARK_AREA) ----------
  // Lawn over five blocks and the joins between them (the streets that were there); hedges along the outside with gaps
  // where the paths come in; gravel paths in a # in every lawn block, running on through the joins; the old block's
  // fountain, ponds with lily pads, trees, flowerbeds, benches and old lamps; and in the middle the Plaza: paved, with
  // a big fountain, benches facing it and a tree in a planter in each corner.
  {
    // (The lawn is a little higher than the sidewalks and curbs it covers in the joins.)
    const LAWN = 0.1;
    const gravel = lam(0x8a8070);
    const stone = lam(0x8e877b, { flatShading: true });
    // Darker grass patches so the lawn isn't one flat colour (v0.54 fix: they overlapped, almost at the same height,
    // and flickered as the camera moved). Now each stays inside its own tile (at most one tile across), on every other
    // tile at most, so they never overlap; none on a path; all at one height, a clear step above the lawn (below the
    // paths).
    const patch = new Batch(own(new THREE.CircleGeometry(0.5, 7).rotateX(-Math.PI / 2)), lam(0x3b5a31), false);
    const prng = mulberry32(808);
    // (None on the ponds or fountains, or next to them.)
    const wet = new Set<string>();
    for (const f of FIXTURES) if (f.kind === 'pond' || f.kind === 'fountain') for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) wet.add(`${f.x + dx},${f.y + dy}`);
    for (const r of PARK_AREA) {
      if (r === PLAZA) continue;
      for (let y = r.y0; y <= r.y1; y++)
        for (let x = r.x0; x <= r.x1; x++) {
          if (x % 2 !== 0 || (y + (x % 4 === 0 ? 0 : 1)) % 2 !== 0 || onParkPath(x, y) || wet.has(`${x},${y}`) || prng() < 0.3) continue;
          const s = 0.75 + prng() * 0.25;
          patch.add(x + 0.5 + (prng() - 0.5) * (1 - s), LAWN + 0.006, y + 0.5 + (prng() - 0.5) * (1 - s), s, 1, s * (0.8 + prng() * 0.2), prng() * 6);
        }
    }
    // (v0.55: no lamps in the park any more, nor along its edges: it's lit by the street round it and the fountains.)
    patch.build(scene);
    // v0.55: the park's ground from the floor kit: lawn, gravel paths (round where they meet each other and the Plaza),
    // the Plaza's paving and the ponds (sunk into the lawn, with grassy banks).
    const pondTiles = new Set(FIXTURES.filter((f) => f.kind === 'pond').map((f) => `${f.x},${f.y}`));
    scene.add(
      buildFloor({
        x0: PARK_BOUNDS.x0, y0: PARK_BOUNDS.y0, w: PARK_BOUNDS.x1 - PARK_BOUNDS.x0 + 1, h: PARK_BOUNDS.y1 - PARK_BOUNDS.y0 + 1,
        at: (x, y) => (!inPark(x, y) ? null : inRect(PLAZA, x, y) ? 'paving' : pondTiles.has(`${x},${y}`) ? 'pond' : onParkPath(x, y) ? 'gravel' : 'grass'),
      }),
    );

    // The old block's fountain (008): a gravel ring, a low stone basin with water, a pillar and a top bowl.
    /** Fountain water: its colour and glow, with the drifting ripples (v0.56). */
    const fountainWater = (color: number, glow: number, strength: number, repeat: number) => {
      const map = waterTexture(repeat);
      const m = lam(color, { emissive: glow, emissiveIntensity: strength, map });
      if (map) m.color.multiplyScalar(DETAIL_GAIN);
      return m;
    };
    const fountain = (x: number, z: number, k: number) => {
      add(own(new THREE.CylinderGeometry(1.15 * k, 1.22 * k, 0.3, 12)), stone, x, LAWN + 0.13, z);
      add(own(new THREE.CylinderGeometry(1.03 * k, 1.03 * k, 0.05, 12)), fountainWater(0x2f6f86, 0x1d4a5c, 0.6, 3), x, LAWN + 0.26, z, false);
      add(own(new THREE.CylinderGeometry(0.1 * k, 0.14 * k, 0.62 * k, 8)), stone, x, LAWN + 0.2 + 0.31 * k, z);
      add(own(new THREE.CylinderGeometry(0.34 * k, 0.2 * k, 0.1, 10)), stone, x, LAWN + 0.2 + 0.62 * k, z);
      add(own(new THREE.CylinderGeometry(0.28 * k, 0.28 * k, 0.03, 10)), fountainWater(0x3f86a0, 0x2a6278, 0.7, 1), x, LAWN + 0.26 + 0.62 * k, z, false);
    };
    {
      const cx = PARK.x0 + 5, cz = PARK.y0 + 5;
      const ring = new THREE.Mesh(own(new THREE.CircleGeometry(1.9, 12).rotateX(-Math.PI / 2)), gravel);
      ring.position.set(cx, LAWN + 0.012, cz);
      ring.receiveShadow = true;
      scene.add(ring);
      fountain(cx, cz, 1);
    }

    // The Plaza: big square paving stones with joints, the big fountain (two tiers, 4×4 tiles), planters with trees.
    {
      const X0 = PLAZA.x0, Z0 = PLAZA.y0, X1 = PLAZA.x1 + 1, Z1 = PLAZA.y1 + 1;
      const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
      const seam = new Batch(geoBox(X1 - X0, 0.004, 0.04), lam(0x6e675d), false);
      for (let i = 1; i < X1 - X0; i += 2) {
        seam.add(cx, LAWN + 0.002, Z0 + i, 1, 1, 1, 0);
        seam.add(X0 + i, LAWN + 0.002, cz, 1, 1, 1, Math.PI / 2);
      }
      seam.build(scene);
      // A darker ring of stones round the fountain.
      const ring = new THREE.Mesh(own(new THREE.CircleGeometry(2.9, 12).rotateX(-Math.PI / 2)), lam(0x7a7266, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      ring.position.set(cx, LAWN + 0.005, cz);
      scene.add(ring);
      // The big fountain: a wide basin, then a second bowl higher up, water in both.
      fountain(cx, cz, 1.75);
      add(own(new THREE.CylinderGeometry(0.75, 0.45, 0.14, 10)), stone, cx, LAWN + 1.55, cz);
      add(own(new THREE.CylinderGeometry(0.66, 0.66, 0.03, 10)), fountainWater(0x3f86a0, 0x2a6278, 0.7, 1), cx, LAWN + 1.63, cz, false);
      add(own(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6)), stone, cx, LAWN + 1.8, cz);
      // Planters with a tree in each corner.
      for (const f of FIXTURES.filter((f) => f.kind === 'tree' && inRect(PLAZA, f.x, f.y))) {
        add(geoBox(0.9, 0.35, 0.9), stone, f.x + 0.5, LAWN + 0.17, f.y + 0.5);
        add(geoBox(0.78, 0.04, 0.78), lam(0x3a2a1e), f.x + 0.5, LAWN + 0.36, f.y + 0.5, false);
      }
    }

    // Benches facing the fountains and along the paths: they face away from their back, the side nearest the edge of
    // their block (or, on the Plaza, the fountain's way).
    const wood = lam(0x6b4a2e);
    const iron = lam(0x2b2b2e);
    for (const f of FIXTURES.filter((f) => f.kind === 'bench' && inPark(f.x, f.y))) {
      const b = PARK_BLOCKS.find((r) => inRect(r, f.x, f.y))!;
      const mx = b.x0 + 5, mz = b.y0 + 5;
      const dx = f.x + 0.5 - mx, dz = f.y + 0.5 - mz;
      // The way it faces: towards the middle of its block, along the longer axis.
      const rot = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : dz > 0 ? Math.PI : 0;
      // (Plain meshes, not a group: they're merged with the rest of the city, not drawn one by one.)
      const part = (geo: THREE.BufferGeometry, mat: THREE.Material, lx: number, ly: number, lz: number) => {
        const c = Math.cos(rot), sn = Math.sin(rot);
        add(geo, mat, f.x + 0.5 + lx * c + lz * sn, LAWN + ly, f.y + 0.5 - lx * sn + lz * c, true).rotation.y = rot;
      };
      part(geoBox(0.9, 0.05, 0.3), wood, 0, 0.3, 0);
      part(geoBox(0.9, 0.22, 0.04), wood, 0, 0.48, -0.15);
      for (const lx of [-0.39, 0.39]) part(geoBox(0.04, 0.3, 0.3), iron, lx, 0.15, 0);
    }
    // Hedges: dark green boxes, slightly uneven, along the park's outside edge.
    const hedges = new Batch(geoBox(1, 0.5, 0.7), lam(0x2c4a26, { flatShading: true }));
    for (const f of FIXTURES.filter((f) => f.kind === 'hedge' && inPark(f.x, f.y))) {
      const sideways = !inPark(f.x - 1, f.y) || !inPark(f.x + 1, f.y);
      hedges.add(f.x + 0.5, LAWN + 0.2, f.y + 0.5, 1, 0.85 + rng() * 0.3, 1, sideways ? Math.PI / 2 : 0);
    }
    hedges.build(scene);
    for (const f of FIXTURES.filter((f) => f.kind === 'tree' && inPark(f.x, f.y))) tree(f.x + 0.5, f.y + 0.5, 1.15 + rng() * 0.3);
    // Flowerbeds: a stone edge, dark soil and dots of colour.
    const flowerColors = [0xd9473a, 0xf0b13c, 0xe8e2d0, 0x8a5ab8];
    for (const f of FIXTURES.filter((f) => f.kind === 'flowers' && inPark(f.x, f.y))) {
      add(geoBox(0.9, 0.14, 0.9), stone, f.x + 0.5, LAWN + 0.03, f.y + 0.5);
      add(geoBox(0.78, 0.04, 0.78), lam(0x3a2a1e), f.x + 0.5, LAWN + 0.1, f.y + 0.5, false);
      for (let i = 0; i < 9; i++)
        add(geoBox(0.12, 0.12, 0.12), lam(flowerColors[i % flowerColors.length]), f.x + 0.2 + (i % 3) * 0.3, LAWN + 0.17, f.y + 0.2 + Math.floor(i / 3) * 0.3, false);
    }
    // The ponds (one per lawn block that has one): a stone rim, dark water with a soft glow, lily pads and reeds.
    for (const b of PARK_BLOCKS) {
      const pond = FIXTURES.filter((f) => f.kind === 'pond' && inRect(b, f.x, f.y));
      if (!pond.length) continue;
      const xs = pond.map((f) => f.x), zs = pond.map((f) => f.y);
      const px = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
      const pz = (Math.min(...zs) + Math.max(...zs) + 1) / 2;
      const sx = (Math.max(...xs) - Math.min(...xs) + 1) / 2;
      const sz = (Math.max(...zs) - Math.min(...zs) + 1) / 2;
      // (The water itself is the floor kit's, a little below the lawn: v0.55.)
      const W0 = SURFACES.pond.top;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + rng();
        const r = (0.25 + rng() * 0.45) * Math.min(sx, sz);
        add(own(new THREE.CircleGeometry(0.11, 7).rotateX(-Math.PI / 2)), lam(0x3f7a3a), px + Math.cos(a) * r, W0 + 0.01, pz + Math.sin(a) * r, false);
      }
      for (let i = 0; i < 6; i++) add(geoBox(0.03, 0.35 + rng() * 0.2, 0.03), lam(0x4a6a32), px + sx * 0.6 + rng() * 0.1, W0 + 0.2, pz - 0.4 + i * 0.16, false);
    }
  }

  // ---------- the basketball court (Raid Gym Bags) ----------
  // Painted court with lines, a chain-link fence on three sides, two hoops, a bench on the street
  // side (the gym bags on it are spots, added by the Street view), and a floodlight.
  {
    const X0 = COURT.x0;
    const Z0 = COURT.y0;
    const X1 = COURT.x1 + 1;
    const Z1 = COURT.y1 + 1;
    const cx = (X0 + X1) / 2;
    add(geoBox(5.6, 0.06, 5.6), pavement, cx, 0.03, (Z0 + Z1) / 2, false);
    // The court surface starts one row in (the bench row stays pavement).
    const courtZ0 = Z0 + 1;
    const ccz = (courtZ0 + Z1) / 2;
    add(geoBox(X1 - X0 - 0.1, 0.03, Z1 - courtZ0 - 0.1), lam(0x7a3b2c), cx, 0.075, ccz, false);
    add(geoBox(X1 - X0 - 1.1, 0.031, Z1 - courtZ0 - 1.1), lam(0x2f5a4a), cx, 0.077, ccz, false);
    const line = lam(0xd8d0c0);
    const lw = 0.05;
    const cw = X1 - X0 - 0.5;
    const cd = Z1 - courtZ0 - 0.5;
    add(geoBox(cw, 0.01, lw), line, cx, 0.095, ccz - cd / 2, false);
    add(geoBox(cw, 0.01, lw), line, cx, 0.095, ccz + cd / 2, false);
    add(geoBox(lw, 0.01, cd), line, cx - cw / 2, 0.095, ccz, false);
    add(geoBox(lw, 0.01, cd), line, cx + cw / 2, 0.095, ccz, false);
    add(geoBox(lw, 0.01, cd), line, cx, 0.095, ccz, false); // half-court line
    const centre = new THREE.Mesh(own(new THREE.RingGeometry(0.42, 0.47, 12).rotateX(-Math.PI / 2)), line);
    centre.position.set(cx, 0.096, ccz);
    scene.add(centre);
    // Hoops at the west and east ends: pole, backboard, orange rim.
    for (const side of [-1, 1]) {
      const px = side < 0 ? X0 + 0.15 : X1 - 0.15;
      add(geoBox(0.08, 1.3, 0.08), iron2(), px, 0.65, ccz);
      add(geoBox(0.04, 0.38, 0.6), lam(0xe8e2d0), px - side * 0.12, 1.22, ccz);
      const rim = add(own(new THREE.TorusGeometry(0.14, 0.018, 6, 10)), lam(0xe0782a), px - side * 0.3, 1.1, ccz);
      rim.rotation.x = Math.PI / 2;
      const key = add(geoBox(1.1, 0.01, 0.9), lam(0x7a3b2c), px - side * 0.6, 0.094, ccz, false);
      key.receiveShadow = true;
    }
    // Chain-link fence: posts, a top rail and see-through mesh, on the west, south and east sides.
    const linkTex = own(
      canvasTex(32, 32, (g) => {
        g.clearRect(0, 0, 32, 32);
        g.strokeStyle = 'rgba(190, 196, 204, 0.9)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(32, 32);
        g.moveTo(32, 0);
        g.lineTo(0, 32);
        g.stroke();
      }),
    );
    const FH = 1.05;
    const fence = (x: number, z: number, len: number, alongX: boolean) => {
      const t = linkTex.clone();
      own(t);
      t.repeat.set(len * 4, FH * 4);
      t.needsUpdate = true;
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(len, FH)), own(new THREE.MeshLambertMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
      m.position.set(x, FH / 2, z);
      if (!alongX) m.rotation.y = Math.PI / 2;
      scene.add(m);
      add(alongX ? geoBox(len, 0.04, 0.04) : geoBox(0.04, 0.04, len), iron2(), x, FH, z);
      const n = Math.round(len);
      for (let i = 0; i <= n; i++) {
        const k = -len / 2 + (i * len) / n;
        add(geoBox(0.05, FH, 0.05), iron2(), alongX ? x + k : x, FH / 2, alongX ? z : z + k);
      }
    };
    fence(cx, Z1 - 0.03, X1 - X0, true); // south
    fence(X0 + 0.03, (Z0 + Z1) / 2 + 0.5, Z1 - Z0 - 1, false); // west (the gap at the front is the way in)
    fence(X1 - 0.03, (Z0 + Z1) / 2 + 0.5, Z1 - Z0 - 1, false); // east
    // The bench along the street side, three tiles long.
    const wood = lam(0x6b4a2e);
    const bz = Z0 + 0.5;
    add(geoBox(2.8, 0.05, 0.34), wood, cx, 0.28, bz);
    add(geoBox(2.8, 0.2, 0.04), wood, cx, 0.45, bz - 0.17);
    for (const dx of [-1.3, 0, 1.3]) add(geoBox(0.05, 0.28, 0.32), iron2(), cx + dx, 0.14, bz);
    // A water bottle and a towel on the bench, for life.
    add(own(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8)), lam(0x5aa0c8), cx, 0.39, bz);
    add(geoBox(0.3, 0.03, 0.22), lam(0xe8e2d0), cx + 0.35, 0.32, bz);
    // A tall floodlight in the corner, lighting the court.
    const fx = X1 - 0.25;
    const fz = Z1 - 0.25;
    add(geoBox(0.07, 2.2, 0.07), iron2(), fx, 1.1, fz);
    add(geoBox(0.4, 0.1, 0.18), iron2(), fx - 0.15, 2.2, fz - 0.1);
    add(geoBox(0.34, 0.03, 0.14), lam(0xfff0c8, { emissive: 0xfff0c8, emissiveIntensity: 1.8 }), fx - 0.15, 2.15, fz - 0.1, false);
    const flood = new THREE.PointLight(0xffe2b0, 7, 7, 1.5);
    flood.position.set(cx + 0.6, 2.1, ccz + 0.4);
    scene.add(flood);
  }

  // ---------- rooms you can walk into: the shell ----------
  // Four walls along the edge with a doorway in the middle of the front (south) wall, a roof with a
  // coloured parapet, lit shop windows, a striped awning and a sign. While you're inside, the walls
  // fade and the roof, sign and awning disappear so you look into the room.
  interface ShopStyle {
    wall: number;
    trim: number;
    /** Awning stripes: colour and light colour. */
    stripe: [string, string];
    sign: string;
    signBg: string;
    signFg?: string;
    /** Floor tiles: two colours in a checker. */
    floor: [string, string];
    /** Warm light inside. */
    light: number;
    height?: number;
    /** v0.60: storeys of apartments on top (0: none, like the gas station's kiosk). */
    flats?: number;
    /** How much higher the floor is (v0.58: the bar stands on its site's sidewalk slab, which is higher than a lot's). */
    lift?: number;
  }
  const rooms = new Map<string, Fadeable>();
  /**
   * v0.60: apartments on top of a one-storey building (the shops): `floors` storeys of flats over the rect, from
   * `base` up: brick walls (the pixel texture), a window on every tile of every side on every floor (some lit, some
   * with curtains; `skipFront` leaves the front's first floor clear for a shop sign), a roof and its parapet, air-con
   * units. Returns the meshes (they hide with the roof when the shop fades, and with the cut-away).
   */
  const flatsRng = mulberry32(6060);
  const apartments = (b: { x0: number; z0: number; x1: number; z1: number }, base: number, floors: number, color: number, trim: number, skipFront = 0) => {
    const W = b.x1 - b.x0, D = b.z1 - b.z0, h = floors * FLOOR;
    const before = scene.children.length;
    const tx = own(brickTex.clone());
    tx.repeat.set(Math.max(W, D), floors);
    tx.needsUpdate = true;
    const mWall = lam(color, { map: tx });
    add(geoBox(W - 0.04, h, D - 0.04), [mWall, mWall, lam(C.roof), lam(C.roof), mWall, mWall], (b.x0 + b.x1) / 2, base + h / 2, (b.z0 + b.z1) / 2);
    kit.parapet({ x0: b.x0 - 0.03, z0: b.z0 - 0.03, x1: b.x1 + 0.03, z1: b.z1 + 0.03 }, base + h + 0.02, lam(trim));
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const f = face(b, side);
      for (let fl = 0; fl < floors; fl++)
        for (let u = 0.5; u < f.len; u += 1) {
          if (side === 's' && fl === 0 && Math.abs(u - f.len / 2) < skipFront / 2) continue;
          const lit = flatsRng() < 0.3;
          kit.window(f, u, base + fl * FLOOR + 0.6, { w: 0.6, h: 0.85, lit, frame: 0x3a3430, behind: lit && flatsRng() < 0.4 ? CURTAINS[Math.floor(flatsRng() * CURTAINS.length)] : undefined });
        }
    }
    for (let i = 0; i < 1 + Math.floor(W * D / 20); i++) kit.acUnit(b.x0 + 0.6 + flatsRng() * (W - 1.2), base + h, b.z0 + 0.6 + flatsRng() * (D - 1.2));
    return scene.children.slice(before) as THREE.Mesh[];
  };
  const shopShell = (r: Room, st: ShopStyle) => {
    const X0 = r.x0;
    const Z0 = r.y0;
    const X1 = r.x1 + 1;
    const Z1 = r.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    // One storey a person fits in (with room above their head), with the sign above it.
    const sh = (st.height ?? 1.25) * 1.4;
    const DOOR = 1.2;
    const t = 0.12; // wall thickness
    const [doorX] = r.door;
    add(geoBox(X1 - X0 + 0.6, 0.06, Z1 - Z0 + 0.6), pavement, cx, 0.03, cz, false);
    const mWall = lam(st.wall);
    const mTrim = lam(st.trim);
    // Kit parts (v0.47): walls with the doorway cut out, the roof and its parapet, shop windows either side of the
    // door (lit from inside), the door frame, a striped awning, the sign on its board, air-con units, a drainpipe.
    const box = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const fs = face(box, 's');
    const walls = kit.walls(box, sh, t, mWall, { s: [{ u0: doorX - X0, u1: doorX + 1 - X0, top: DOOR }] });
    const roof = kit.roof(box, sh, C.roof);
    const trimBand = kit.parapet({ x0: X0 - 0.03, z0: Z0 - 0.03, x1: X1 + 0.03, z1: Z1 + 0.03 }, sh + 0.06, mTrim);
    const front = [
      ...kit.window(fs, 1, 0.255, { style: 'shop', w: 1.3, h: 0.85, frame: st.trim }),
      ...kit.window(fs, X1 - X0 - 1, 0.255, { style: 'shop', w: 1.3, h: 0.85, frame: st.trim }),
      ...kit.door(fs, doorX + 0.5 - X0, { style: 'frame', w: 1, h: DOOR, frame: st.trim }),
      ...kit.awning(fs, (X1 - X0) / 2, DOOR + 0.3, X1 - X0 - 0.8, { color: st.stripe[0], light: st.stripe[1] }),
      ...kit.sign(fs, (X1 - X0) / 2, sh + 0.42, { text: st.sign, bg: st.signBg, fg: st.signFg, w: 3.2, h: 0.6, board: st.trim }),
      ...kit.drainpipe(fs, X1 - X0 - 0.08, sh),
      ...(st.flats ? [] : [0, 1].flatMap((i) => kit.acUnit(cx - 1.5 + i * 2.4, sh, Z0 + 1.3))),
    ];
    // v0.60: apartments above the shop (the sign stays clear on the front's first floor).
    const flats = st.flats ? apartments(box, sh + 0.12, st.flats, st.wall, st.trim, 3.6) : [];
    // Floor tiles.
    const checker = own(
      canvasTex(64, 64, (g) => {
        g.fillStyle = st.floor[0];
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = st.floor[1];
        g.fillRect(0, 0, 32, 32);
        g.fillRect(32, 32, 32, 32);
      }),
    );
    checker.repeat.set(X1 - X0, Z1 - Z0);
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.1, Z1 - Z0 - 0.1)), lam(0xffffff, { map: checker }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.065 + (st.lift ?? 0), cz);
    floor.receiveShadow = true;
    scene.add(floor);
    // Doormat inside the door.
    add(geoBox(0.8, 0.02, 0.5), lam(st.trim), doorX + 0.5, 0.075 + (st.lift ?? 0), Z1 - 0.4, false);
    // Warm light inside, so the shop glows when you look in.
    const lamp = new THREE.PointLight(st.light, 6, 6, 1.6);
    lamp.position.set(cx, sh - 0.2, cz);
    scene.add(lamp);
    const fade: Fadeable = {
      walls: [...walls, ...trimBand], mats: [mWall, mTrim], props: [roof, ...front, ...flats], opacity: 1,
      cut: flats.length ? { height: sh + (st.flats ?? 0) * FLOOR, keep: sh, center: new THREE.Vector3(cx, 0, cz), upper: flats, on: false } : undefined,
    };
    fadeables.push(fade);
    rooms.set(r.id, fade);
    return { X0, Z0, X1, Z1, cx, cz, t, doorX, sh };
  };
  /** Something on a shop's front (or in its window) that hides with the roof when the shop fades. */
  const shopExtra = (r: Room, o: THREE.Object3D, x: number, y: number, z: number, rotY = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    scene.add(o);
    rooms.get(r.id)!.props.push(o);
  };
  /** The shop fronts with character (docs/design.md §7c). */
  const shopFronts = () => {
    // Eddy's: fruit and vegetable crates and a chalkboard outside.
    shopExtra(STORE, L.buildCrates(), STORE.x0 + 0.9, 0.07, STORE.y1 + 1.55);
    shopExtra(STORE, L.buildChalkboard('SANDWICH $2'), STORE.x1 + 0.3, 0.07, STORE.y1 + 1.6, -0.3);
    // The candy store: a giant lollipop on the roof, jars of sweets in the windows, a neon OPEN sign.
    const candyH = 1.25 * 1.4;
    shopExtra(CANDY, L.buildLollipop(1.05), CANDY.x1 + 0.4, candyH, CANDY.y1 - 0.2);
    shopExtra(CANDY, L.buildCandyDisplay(1.25), CANDY.x0 + 1, 0.02, CANDY.y1 + 1.33);
    shopExtra(CANDY, L.buildCandyDisplay(1.25), CANDY.x1, 0.02, CANDY.y1 + 1.33);
    shopExtra(CANDY, L.buildOpenSign(), CANDY.x1, 1.0, CANDY.y1 + 1.03);
    // Ray's Arms: the shutter half down over one window, bars on the other, a camera watching the door.
    shopExtra(WEAPONS, L.buildShutter(1.4, 1.15, 0.6), WEAPONS.x0 + 1, 0, WEAPONS.y1 + 1.0);
    shopExtra(WEAPONS, L.buildBars(1.35, 0.9), WEAPONS.x1, 0.23, WEAPONS.y1 + 0.97);
    shopExtra(WEAPONS, L.buildCamera(), WEAPONS.x0 + 3.65, 1.55, WEAPONS.y1 + 1.0, -0.4);
  };
  /** A shop counter (fixture tiles in a row) with a cash register at one end. */
  const counter = (r: Room, top = 0x9a7a52, body = 0x5a3d26) => {
    const tiles = FIXTURES.filter((x) => x.kind === 'counter' && inRect(r, x.x, x.y));
    const x0 = Math.min(...tiles.map((c) => c.x));
    const x1 = Math.max(...tiles.map((c) => c.x)) + 1;
    const ccx = (x0 + x1) / 2;
    const ccz = tiles[0].y + 0.5;
    add(geoBox(x1 - x0 - 0.2, 0.5, 0.55), lam(body), ccx, 0.3, ccz);
    add(geoBox(x1 - x0 - 0.14, 0.05, 0.6), lam(top), ccx, 0.57, ccz);
    add(geoBox(0.3, 0.2, 0.24), lam(0x2b2b2e), ccx + 0.5, 0.7, ccz);
    add(geoBox(0.22, 0.08, 0.02), lam(0x5bd06a, { emissive: 0x5bd06a, emissiveIntensity: 0.9 }), ccx + 0.5, 0.78, ccz + 0.13, false);
    return { ccx, ccz };
  };

  // ---------- Eddy's General Store ----------
  {
    const { X1, Z0, t, doorX } = shopShell(STORE, {
      wall: 0xa89c86, trim: 0x2f6b40, stripe: ['#2f6b40', '#d8d0c0'], sign: 'GENERAL STORE', signBg: '#2f7a46',
      floor: ['#b9b2a4', '#8f877a'], light: 0xffc98a,
      flats: 2,
    });
    // Shelves full of colourful goods, against the walls.
    const productColors = [0xd9473a, 0xf0b13c, 0x3a6ea5, 0x4fa04a, 0xe07b39, 0xf2efe8, 0x8a5ab8];
    const shelfWood = lam(0x6b4a2e);
    for (const f of FIXTURES.filter((x) => x.kind === 'shelf' && inRect(STORE, x.x, x.y))) {
      const againstBack = f.y === STORE.y0;
      const w = againstBack ? 0.92 : 0.45;
      const d = againstBack ? 0.45 : 0.92;
      const fx = againstBack ? f.x + 0.5 : X1 - t - 0.225; // side shelves stand against the east wall
      const fz = againstBack ? f.y + t + d / 2 : f.y + 0.5;
      const sx = againstBack ? w : 0.45;
      const sz = againstBack ? 0.45 : w;
      add(geoBox(sx, 0.95, sz), shelfWood, fx, 0.55, fz);
      for (let level = 0; level < 3; level++) {
        add(geoBox(sx + 0.02, 0.03, sz + 0.02), lam(0x8a6235), fx, 0.2 + level * 0.32, fz, false);
        for (let i = 0; i < 3; i++) {
          const c = productColors[Math.floor(rng() * productColors.length)];
          const along = -0.3 + i * 0.3;
          add(geoBox(0.16, 0.18 + rng() * 0.06, 0.16), lam(c), fx + (againstBack ? along : 0), 0.32 + level * 0.32, fz + (againstBack ? 0 : along), false);
        }
      }
    }
    // A glowing drinks fridge in the gap between the back shelves.
    add(geoBox(0.7, 0.95, 0.3), lam(0xd8dde2), doorX + 0.5, 0.55, Z0 + t + 0.15);
    add(geoBox(0.56, 0.75, 0.02), lam(0x9fd0e8, { emissive: 0x9fd0e8, emissiveIntensity: 0.8 }), doorX + 0.5, 0.58, Z0 + t + 0.31, false);
    counter(STORE);
  }

  // ---------- Ray's Arms, the weapon store (combat) ----------
  // Dark gunmetal walls and a red-on-black sign; racks on the back wall with bats, a machete and brass
  // knuckles on pegs; a glass display case on the counter. Ray (an NPC) sells you the knuckles.
  {
    const { Z0, t } = shopShell(WEAPONS, {
      wall: 0x4e5056, trim: 0x8a2f28, stripe: ['#2b2b2e', '#8a2f28'], sign: "RAY'S ARMS", signBg: '#141210', signFg: '#e2604c',
      floor: ['#6a6660', '#545049'], light: 0xffd8a8,
      flats: 2,
    });
    const steel = lam(0x8a8f96);
    const wood = lam(0x6b4a2e);
    const brass = lam(0xd8b04a, { emissive: 0x3a2a08, emissiveIntensity: 0.4 });
    for (const f of FIXTURES.filter((x) => x.kind === 'rack' && inRect(WEAPONS, x.x, x.y))) {
      const fx = f.x + 0.5;
      const fz = Z0 + t + 0.08;
      add(geoBox(0.9, 0.9, 0.06), lam(0x3a3530), fx, 0.6, fz); // pegboard
      // a baseball bat, leaning
      const bat = add(own(new THREE.CylinderGeometry(0.035, 0.06, 0.7, 6)), wood, fx - 0.25, 0.55, fz + 0.08);
      bat.rotation.z = 0.25;
      // a machete
      add(geoBox(0.05, 0.45, 0.02), steel, fx + 0.05, 0.7, fz + 0.06);
      add(geoBox(0.05, 0.14, 0.04), lam(0x1e1b18), fx + 0.05, 0.4, fz + 0.06);
      // brass knuckles on a peg
      for (let i = 0; i < 4; i++) add(own(new THREE.TorusGeometry(0.03, 0.01, 4, 8)), brass, fx + 0.22 + i * 0.05, 0.88, fz + 0.07, false);
      add(geoBox(0.2, 0.03, 0.02), brass, fx + 0.295, 0.85, fz + 0.07, false);
    }
    // The counter with a glass display case on it.
    const { ccx, ccz } = counter(WEAPONS, 0x3a3530, 0x2b2b2e);
    add(geoBox(0.9, 0.2, 0.4), lam(0xbfd8e8, { transparent: true, opacity: 0.35 }), ccx - 0.3, 0.7, ccz, false);
    for (let i = 0; i < 3; i++) add(own(new THREE.TorusGeometry(0.04, 0.012, 4, 8)), brass, ccx - 0.55 + i * 0.2, 0.64, ccz, false);
  }

    // ---------- the candy store (Shoplift Candy Store) ----------
  // Dusty pink walls and a pink neon sign; pink-and-cream floor. The four candy shelves on the back
  // wall are spots (added by the Street view). Candy jars on the counter, a gumball machine, and a
  // wall of lollipops by the door.
  {
    const { X1, Z0, Z1, t, doorX } = shopShell(CANDY, {
      wall: 0x9a6b74, trim: 0x6a2f4a, stripe: ['#b8336a', '#e8d8d0'], sign: 'CANDY', signBg: '#3a1424', signFg: '#ff7ab8',
      floor: ['#d8c4c8', '#a8848c'], light: 0xffb8d0,
      flats: 2,
    });
    const { ccx, ccz } = counter(CANDY, 0xe8d8d0, 0x6a2f4a);
    // Glass candy jars on the counter.
    const jarColors = [0xff7ab8, 0xf0b13c, 0x7ad0e8, 0x9ae07a];
    jarColors.forEach((c, i) => {
      add(own(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8)), lam(c, { transparent: true, opacity: 0.85 }), ccx - 0.6 + i * 0.2, 0.68, ccz - 0.08, false);
      add(own(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8)), lam(0xe8e2d0), ccx - 0.6 + i * 0.2, 0.77, ccz - 0.08, false);
    });
    // A gumball machine against the east wall.
    const gx = X1 - t - 0.3;
    const gz = Z0 + 2.5;
    add(own(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8)), lam(0xb8282a), gx, 0.3, gz);
    add(geoBox(0.2, 0.14, 0.2), lam(0xb8282a), gx, 0.62, gz);
    add(own(new THREE.SphereGeometry(0.17, 10, 8)), lam(0xdff2ff, { transparent: true, opacity: 0.6 }), gx, 0.85, gz);
    for (let i = 0; i < 8; i++) add(own(new THREE.SphereGeometry(0.045, 6, 5)), lam(jarColors[i % 4]), gx - 0.08 + (i % 3) * 0.08, 0.76 + Math.floor(i / 3) * 0.06, gz - 0.05 + ((i * 7) % 3) * 0.05, false);
    // Lollipops on a board by the door (on the front wall, inside).
    add(geoBox(1.0, 0.6, 0.04), lam(0x6b4a2e), doorX + 1.6, 0.65, Z1 - t - 0.03);
    for (let i = 0; i < 6; i++) {
      const lx = doorX + 1.25 + (i % 3) * 0.35;
      const ly = 0.55 + Math.floor(i / 3) * 0.25;
      add(own(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10)).rotateX(Math.PI / 2), lam(jarColors[i % 4], { emissive: jarColors[i % 4], emissiveIntensity: 0.25 }), lx, ly, Z1 - t - 0.07, false);
    }
    // A pink glow spilling out of the door onto the pavement.
    pools.add(doorX + 0.5, 0.075, Z1 + 0.6);
  }

  // ---------- the bar (Pickpocket Drunks) ----------
  // Dark wood, a red neon BAR sign, a dim amber light. v0.58: twice as deep. Along the west wall a back bar full of
  // glowing bottles and a long mirror; in front of it the bartender's aisle and the long counter (beer taps, a brass
  // foot rail) with the six drunks on stools (spots, added by the Street view); a jukebox in the corner; at the front a
  // pool table, two little tables with candles, a dartboard.
  {
    const { Z0, X0, X1, t } = shopShell(BAR, {
      wall: 0x4a3a30, trim: 0x2a1a14, stripe: ['#5a1a14', '#c8b8a0'], sign: 'BAR', signBg: '#14100c', signFg: '#ff5a3a',
      floor: ['#5a4232', '#46321f'], light: 0xffa060, lift: 0.035,
      flats: 2,
    });
    const dark = lam(0x3a2418);
    const wood = lam(0x5a3a22);
    // (The room is 10 deep: a second warm light over the front half.)
    const front = new THREE.PointLight(0xffa060, 5, 6, 1.6);
    front.position.set((X0 + X1) / 2, 1.5, BAR.y1 - 1);
    scene.add(front);
    // The back bar along the west wall: a low cabinet, a mirror, and two shelves of bottles.
    const back = FIXTURES.filter((f) => f.kind === 'backbar' && inRect(BAR, f.x, f.y));
    const bz0 = Math.min(...back.map((f) => f.y));
    const bz1 = Math.max(...back.map((f) => f.y)) + 1;
    const bcz = (bz0 + bz1) / 2;
    const blen = bz1 - bz0;
    add(geoBox(0.4, 0.55, blen - 0.1), dark, X0 + t + 0.2, 0.3, bcz);
    add(geoBox(0.02, 0.4, blen - 0.4), lam(0x8a9aa8, { emissive: 0x2a3440, emissiveIntensity: 0.8 }), X0 + t + 0.02, 0.85, bcz, false); // mirror
    const bottleColors = [0x3a7a3a, 0x8a5a2a, 0xc8b8a0, 0x2a4a7a, 0x9a2a2a, 0xd8a83a];
    for (const shelfY of [0.68, 1.02]) {
      add(geoBox(0.2, 0.03, blen - 0.2), wood, X0 + t + 0.1, shelfY, bcz, false);
      for (let i = 0; i < 22; i++) {
        const c = bottleColors[(i * 5 + Math.round(shelfY * 10)) % bottleColors.length];
        add(own(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6)), lam(c, { emissive: c, emissiveIntensity: 0.35 }), X0 + t + 0.1, shelfY + 0.11, bz0 + 0.25 + i * ((blen - 0.5) / 21), false);
      }
    }
    // The jukebox, in the north-east corner: a box with a glowing arched front.
    const jb = FIXTURES.find((f) => f.kind === 'jukebox' && inRect(BAR, f.x, f.y))!;
    add(geoBox(0.6, 0.8, 0.4), lam(0x6a2a1a), jb.x + 0.5, 0.4, Z0 + t + 0.22);
    add(own(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12, 1, false, -Math.PI / 2, Math.PI)).rotateX(Math.PI / 2), lam(0xffb04a, { emissive: 0xff8a2a, emissiveIntensity: 1.1 }), jb.x + 0.5, 0.8, Z0 + t + 0.22, false);
    for (let i = 0; i < 3; i++) add(geoBox(0.08, 0.5, 0.02), lam([0xff5a3a, 0x5ac8ff, 0xffd84a][i], { emissive: [0xff5a3a, 0x5ac8ff, 0xffd84a][i], emissiveIntensity: 1 }), jb.x + 0.32 + i * 0.18, 0.42, Z0 + t + 0.43, false);
    // The counter (north–south), with a brass foot rail on the guests' side, beer taps, and a beer in front of each stool.
    const bars = FIXTURES.filter((f) => f.kind === 'bar' && inRect(BAR, f.x, f.y));
    const cz0 = Math.min(...bars.map((f) => f.y));
    const cz1 = Math.max(...bars.map((f) => f.y)) + 1;
    const ccz = (cz0 + cz1) / 2;
    const ccx = bars[0].x + 0.5;
    add(geoBox(0.5, 0.6, cz1 - cz0), dark, ccx, 0.3, ccz);
    add(geoBox(0.62, 0.06, cz1 - cz0 + 0.06), wood, ccx, 0.63, ccz);
    add(geoBox(0.04, 0.04, cz1 - cz0), lam(0xc8a040), ccx + 0.3, 0.12, ccz, false); // foot rail
    for (let i = 0; i < 4; i++) add(own(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6)), lam(0xc8a040), ccx - 0.15, 0.77, cz0 + 1 + i * ((cz1 - cz0 - 2) / 3), false);
    for (const f of bars) {
      add(own(new THREE.CylinderGeometry(0.05, 0.045, 0.14, 8)), lam(0xe0a030, { emissive: 0x8a5010, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }), ccx + 0.18, 0.73, f.y + 0.5, false);
      add(own(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8)), lam(0xf2ece0), ccx + 0.18, 0.815, f.y + 0.5, false);
      // A stool on the tile east of it (the drunk sits on it).
      add(own(new THREE.CylinderGeometry(0.03, 0.04, 0.46, 6)), lam(0x2b2b2e), f.x + 1.45, 0.23, f.y + 0.5);
      add(own(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10)), lam(0x7a2a1a), f.x + 1.45, 0.48, f.y + 0.5);
    }
    // Pendant lamps over the counter.
    for (let i = 0; i < 3; i++) {
      const z = cz0 + 1 + i * ((cz1 - cz0 - 2) / 2);
      add(own(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4)), lam(0x1e1b18), ccx, 1.05, z, false);
      add(own(new THREE.ConeGeometry(0.12, 0.1, 8)), lam(0x2a4a3a), ccx, 0.85, z, false);
      add(own(new THREE.SphereGeometry(0.05, 6, 5)), lam(0xffd8a0, { emissive: 0xffc070, emissiveIntensity: 1.6 }), ccx, 0.8, z, false);
    }
    // Small round tables, each with two chairs and a candle.
    for (const tb of FIXTURES.filter((f) => f.kind === 'table' && inRect(BAR, f.x, f.y))) {
      add(own(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 6)), lam(0x2b2b2e), tb.x + 0.5, 0.23, tb.y + 0.5);
      add(own(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12)), wood, tb.x + 0.5, 0.46, tb.y + 0.5);
      add(own(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 6)), lam(0xffe8c0, { emissive: 0xffc070, emissiveIntensity: 1.5 }), tb.x + 0.5, 0.52, tb.y + 0.5, false);
      for (const dz of [-0.4, 0.4]) {
        add(geoBox(0.26, 0.04, 0.26), wood, tb.x + 0.5, 0.28, tb.y + 0.5 + dz);
        add(geoBox(0.26, 0.28, 0.04), wood, tb.x + 0.5, 0.42, tb.y + 0.5 + dz * 1.32);
      }
    }
    // The pool table (two tiles), balls and a cue on the felt.
    const pool = FIXTURES.filter((f) => f.kind === 'pool' && inRect(BAR, f.x, f.y));
    {
      const px = (Math.min(...pool.map((f) => f.x)) + Math.max(...pool.map((f) => f.x)) + 1) / 2;
      const pz = pool[0].y + 0.5;
      add(geoBox(1.8, 0.5, 0.95), wood, px, 0.3, pz);
      add(geoBox(1.6, 0.04, 0.78), lam(0x1e6a3a), px, 0.57, pz, false);
      for (const [dx, c] of [[-0.3, 0xe8e8e0], [0.2, 0xd83a2a], [0.35, 0xe8c040], [0.27, 0x2a4ad8]] as const)
        add(own(new THREE.SphereGeometry(0.04, 8, 6)), lam(c), px + dx, 0.62, pz + (dx * 0.7) % 0.3, false);
      add(geoBox(1.3, 0.025, 0.025), lam(0xc8a06a), px + 0.1, 0.62, pz + 0.3, false).rotation.y = 0.2;
      // A low lamp over it.
      add(geoBox(0.9, 0.08, 0.3), lam(0x2a4a3a), px, 1.15, pz, false);
      add(geoBox(0.8, 0.02, 0.22), lam(0xffe0a0, { emissive: 0xffd080, emissiveIntensity: 1.4 }), px, 1.1, pz, false);
    }
    // A neon beer sign on the east wall and a dartboard on the west wall.
    add(geoBox(0.02, 0.22, 0.6), lam(0x5ac8ff, { emissive: 0x5ac8ff, emissiveIntensity: 1.3 }), X1 - t - 0.02, 0.95, Z0 + 3.5, false);
    add(own(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10)).rotateZ(Math.PI / 2), lam(0x2a5a2a), X0 + t + 0.03, 0.85, Z0 + 8.5, false);
    add(own(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 10)).rotateZ(Math.PI / 2), lam(0xb8282a), X0 + t + 0.035, 0.85, Z0 + 8.5, false);
  }

  // ---------- the parking lot (Parking Meters, Steal From Cars) ----------
  // Three lots around the gas station in an L: the north-east lot and the long south strip. Dark worn asphalt with
  // white bays and wheel stops, a guard booth with a lit window, tall sodium lamps, and a blue P sign. The meters
  // and cars are spots, added by the Street view.
  {
    for (const r of PARKING) {
      const X0 = r.x0;
      const Z0 = r.y0;
      const X1 = r.x1 + 1;
      const Z1 = r.y1 + 1;
      add(geoBox(X1 - X0, 0.03, Z1 - Z0), lam(0x2c2e33), (X0 + X1) / 2, 0.07, (Z0 + Z1) / 2, false);
      const stains = new Batch(own(new THREE.CircleGeometry(0.22, 7).rotateX(-Math.PI / 2)), lam(0x1f2023, DECAL), false);
      for (let i = 0; i < 8; i++) stains.add(X0 + 0.4 + rng() * (X1 - X0 - 0.8), 0.087, Z0 + 0.4 + rng() * (Z1 - Z0 - 0.8), 0.6 + rng(), 1, 0.4 + rng() * 0.6, rng() * 6);
      stains.build(scene);
    }
    const paint = lam(0xd8d0c0);
    const stop = lam(0x8a8478);
    // Bays: the north-east lot's cars nose up to the meters on its north edge; the south strip's to the meters on its
    // south edge. Each bay is a tile wide and two deep (the cars are big).
    {
      const r = PARKING_NE;
      for (let x = r.x0; x <= r.x1 + 1; x++) add(geoBox(0.05, 0.01, 2), paint, x, 0.09, r.y0 + 2, false);
      for (let x = r.x0; x <= r.x1; x++) add(geoBox(0.6, 0.06, 0.1), stop, x + 0.5, 0.11, r.y0 + 1.15, true);
    }
    {
      const r = PARKING_S;
      for (let x = r.x0; x <= r.x1 + 1; x++) add(geoBox(0.05, 0.01, 2), paint, x, 0.09, r.y1 - 1, false);
      for (let x = r.x0; x <= r.x1; x++) add(geoBox(0.6, 0.06, 0.1), stop, x + 0.5, 0.11, r.y1 - 0.15, true);
      // Dashed driving lane along the strip.
      for (let x = r.x0 + 0.3; x < r.x1 + 0.8; x += 0.7) add(geoBox(0.35, 0.01, 0.05), lam(0xc8a83a), x + 0.17, 0.09, r.y0 + 1.5, false);
    }
    // The guard booth: a small hut with a lit window and a flat roof.
    const booth = FIXTURES.find((f) => f.kind === 'booth')!;
    add(geoBox(0.85, 1.35, 0.85), lam(0x8a8478), booth.x + 0.5, 0.7, booth.y + 0.5);
    add(geoBox(0.95, 0.06, 0.95), lam(0x2f4562), booth.x + 0.5, 1.4, booth.y + 0.5);
    {
      const bb = { x0: booth.x + 0.075, z0: booth.y + 0.075, x1: booth.x + 0.925, z1: booth.y + 0.925 };
      for (const side of ['n', 'e'] as const) kit.window(face(bb, side), 0.425, 0.75, { style: 'office', w: 0.5, h: 0.4, lit: true, sill: false, frame: 0x2f4562 });
      kit.door(face(bb, 'w'), 0.425, { w: 0.45, h: 1.0, color: 0x5a5f66, frame: 0x2f4562 });
    }
    // Tall sodium lamps.
    lamp(PARKING_NE.x1 + 0.8, PARKING_NE.y0 + 2.5, -1, 0);
    lamp(PARKING_S.x0 + 5, PARKING_S.y1 + 0.8, 0, -1);
    const X0 = PARKING_NE.x1 + 1;
    const Z0 = PARKING_NE.y0;
    // The blue P sign on the corner.
    const pSign = own(
      canvasTex(
        64,
        64,
        (g) => {
          g.fillStyle = '#2a5a9a';
          g.fillRect(0, 0, 64, 64);
          g.strokeStyle = '#ffffff';
          g.lineWidth = 4;
          g.strokeRect(4, 4, 56, 56);
          g.fillStyle = '#ffffff';
          g.font = 'bold 44px Arial, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('P', 32, 35);
        },
        false,
      ),
    );
    add(own(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 6)), lam(0x5a5f66), X0 + 0.4, 1.0, Z0 - 0.4);
    const ps = add(own(new THREE.PlaneGeometry(0.6, 0.6)), own(new THREE.MeshBasicMaterial({ map: pSign, side: THREE.DoubleSide })), X0 + 0.4, 1.9, Z0 - 0.4, false);
    ps.rotation.y = Math.PI / 4;
  }

  // ---------- the gas station (Shoplift Gas Station) ----------
  // A pale concrete shop with a blue-and-red trim and a yellow GAS & GO sign; inside, four shelves
  // (spots, added by the Street view), a glowing drinks fridge, and the counter. Out front, two pumps
  // under a lit canopy (which fades like a building when it hides you), a car filling up, and a
  // tall price sign on the corner.
  {
    const { Z0, t, cx } = shopShell(GAS, {
      wall: 0x9a958a, trim: 0x2a4a7a, stripe: ['#b8282a', '#e8e2d0'], sign: 'GAS & GO', signBg: '#1a3a6a', signFg: '#ffd84a',
      floor: ['#c8c4bc', '#a8a49c'], light: 0xfff0d8, height: 1.15,
    });
    counter(GAS, 0xd8d0c0, 0x2a4a7a);
    // A tall drinks fridge, glowing blue-white.
    const fr = FIXTURES.find((f) => f.kind === 'fridge' && inRect(GAS, f.x, f.y))!;
    add(geoBox(0.8, 1.0, 0.4), lam(0xd8dde2), fr.x + 0.5, 0.52, Z0 + t + 0.2);
    add(geoBox(0.66, 0.8, 0.02), lam(0x9fd0e8, { emissive: 0x9fd0e8, emissiveIntensity: 0.9 }), fr.x + 0.5, 0.55, Z0 + t + 0.41, false);
    for (let i = 0; i < 6; i++) add(geoBox(0.08, 0.16, 0.08), lam([0xd9473a, 0x4fa04a, 0xf0b13c][i % 3]), fr.x + 0.25 + (i % 3) * 0.25, 0.35 + Math.floor(i / 3) * 0.35, Z0 + t + 0.35, false);
    // The forecourt: oil-stained concrete, two pumps on islands, a canopy on four posts.
    const fz = GAS.y1 + 1; // the row in front of the shop
    add(geoBox(5, 0.03, 1.0), lam(0x5e5951), cx, 0.07, fz + 0.5, false);
    const pumps = FIXTURES.filter((f) => f.kind === 'pump' && inRect({ x0: GAS.x0, y0: fz, x1: GAS.x1, y1: fz }, f.x, f.y));
    for (const pmp of pumps) {
      add(geoBox(0.7, 0.1, 0.45), lam(0x8a8478), pmp.x + 0.5, 0.1, pmp.y + 0.5);
      add(geoBox(0.32, 0.62, 0.24), lam(0xb8282a), pmp.x + 0.5, 0.45, pmp.y + 0.5);
      add(geoBox(0.22, 0.14, 0.02), lam(0xd8f0ff, { emissive: 0xa8d8ff, emissiveIntensity: 0.8 }), pmp.x + 0.5, 0.6, pmp.y + 0.37, false);
      add(geoBox(0.34, 0.06, 0.26), lam(0xe8e2d0), pmp.x + 0.5, 0.79, pmp.y + 0.5);
      add(geoBox(0.04, 0.3, 0.04), lam(0x1e1b18), pmp.x + 0.69, 0.4, pmp.y + 0.5, false); // the hose
    }
    // Canopy: a flat roof with a blue fascia and lights underneath.
    const cMats = [lam(0xd8d4cc), lam(0x2a4a7a)];
    const canopyZ = fz + 0.95; // over the pumps, a little in front of the shop (so its sign shows)
    const canopy = add(geoBox(4.6, 0.1, 1.5), cMats[0], cx, 1.9, canopyZ);
    // A thin blue band around the edge, with a red stripe, so from above it reads as a canopy.
    const fascia = add(geoBox(4.7, 0.2, 0.06), cMats[1], cx, 1.9, canopyZ + 0.77);
    const fasciaBack = add(geoBox(4.7, 0.2, 0.06), cMats[1], cx, 1.9, canopyZ - 0.77);
    for (const ex of [cx - 2.33, cx + 2.33]) add(geoBox(0.06, 0.2, 1.6), cMats[1], ex, 1.9, canopyZ);
    add(geoBox(4.72, 0.04, 0.07), lam(0xb8282a), cx, 1.85, canopyZ + 0.78, false);
    for (const px of [cx - 1.6, cx + 1.6]) add(geoBox(0.1, 1.85, 0.1), lam(0xe8e2d0), px, 0.93, canopyZ);
    for (let i = 0; i < 3; i++) add(geoBox(0.5, 0.02, 0.2), lam(0xffffff, { emissive: 0xfff4e0, emissiveIntensity: 1.6 }), cx - 1.4 + i * 1.4, 1.84, canopyZ, false);
    const glow = new THREE.PointLight(0xfff0d8, 5, 4, 1.6);
    glow.position.set(cx, 1.6, canopyZ);
    scene.add(glow);
    fadeables.push({ walls: [canopy, fascia, fasciaBack], mats: cMats, props: [], opacity: 1 });
    // The price sign on the corner: a tall post with a lit board.
    const priceTex = own(
      canvasTex(
        64,
        128,
        (g) => {
          g.fillStyle = '#1a3a6a';
          g.fillRect(0, 0, 64, 128);
          g.fillStyle = '#ffd84a';
          g.font = 'bold 18px Arial, sans-serif';
          g.textAlign = 'center';
          g.fillText('GAS', 32, 24);
          g.fillStyle = '#ff5a3a';
          g.font = 'bold 22px monospace';
          g.fillText('3.49', 32, 62);
          g.fillText('3.89', 32, 98);
        },
        false,
      ),
    );
    const sx = GAS.x0 - 0.8;
    const sz = fz + 0.5;
    add(geoBox(0.08, 2.0, 0.08), lam(0x5a5f66), sx, 1.0, sz);
    const board = add(own(new THREE.PlaneGeometry(0.5, 1.0)), own(new THREE.MeshBasicMaterial({ map: priceTex, side: THREE.DoubleSide })), sx, 2.1, sz, false);
    board.rotation.y = -Math.PI / 4;
  }

  shopFronts();

  // Fires that flicker (the Yard's barrel, the barbecue): animate() moves them every frame.
  const flames: THREE.Mesh[] = [];
  const fireLights: THREE.PointLight[] = [];

  /**
   * A burning oil drum (the Yard's, and the sewer's for cooking). v0.54, reworked: a rusty steel drum with a rolled rim
   * and two bulging hoops, rust patches and soot round the top, glowing coals and charred sticks inside, tall layered
   * flames (orange outside, yellow inside) with a few sparks, and a flickering light. About 290 triangles (prop budget: 300).
   */
  const burningBarrel = (x: number, y0: number, z: number) => {
    // (Its own random numbers: the city's shared ones stay as they were, so nothing placed after it moves; the old drum
    // used 10.)
    for (let i = 0; i < 10; i++) rng();
    const rnd = mulberry32(Math.round(x * 97 + z * 13));
    const steel = lam(0x8a5232, { side: THREE.DoubleSide });
    const rim = lam(0x5a3420);
    // The drum, open at the top (you look into the fire), the rolled rim and the two hoops standing out from it.
    add(own(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 10, 1, true)), steel, x, y0 + 0.4, z);
    add(own(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10, 1, true)), rim, x, y0 + 0.79, z, false);
    for (const y of [0.27, 0.53]) add(own(new THREE.CylinderGeometry(0.295, 0.295, 0.035, 10, 1, true)), rim, x, y0 + y, z, false);
    // Soot blackening the top, and rust patches eaten into the side.
    add(own(new THREE.CylinderGeometry(0.283, 0.283, 0.12, 10, 1, true)), lam(0x2a1c14), x, y0 + 0.71, z, false);
    for (const [a, y, w, h] of [[0.6, 0.4, 0.16, 0.13], [2.5, 0.15, 0.14, 0.1], [4.4, 0.62, 0.15, 0.09], [5.6, 0.2, 0.12, 0.1]]) {
      const p = add(own(new THREE.PlaneGeometry(w, h)), lam(0xb8662a), x + Math.sin(a) * 0.284, y0 + y, z + Math.cos(a) * 0.284, false);
      p.rotation.y = a;
    }
    // Glowing coals, a few lumps on them, and charred sticks poking out.
    const coals = add(own(new THREE.CircleGeometry(0.27, 10)), lam(0x2a1a14, { emissive: 0xff5a1a, emissiveIntensity: 1 }), x, y0 + 0.74, z, false);
    coals.rotation.x = -Math.PI / 2;
    const lump = lam(0x3a2418, { emissive: 0xff4a10, emissiveIntensity: 0.5 });
    for (let i = 0; i < 3; i++) add(own(new THREE.IcosahedronGeometry(0.06, 0)), lump, x + Math.sin(i * 2.1) * 0.13, y0 + 0.77, z + Math.cos(i * 2.1) * 0.13, false);
    const stick = lam(0x4a2e1c);
    for (const [a, tilt] of [[0.4, 0.5], [2.4, -0.6], [4.3, 0.45]]) {
      const s = add(geoBox(0.05, 0.42, 0.05), stick, x + Math.sin(a) * 0.12, y0 + 0.88, z + Math.cos(a) * 0.12, false);
      s.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
    }
    // The flames: three tall orange ones round the edge, two yellow ones in the middle; and sparks above them.
    const outer = lam(0xff7a22, { emissive: 0xff5a10, emissiveIntensity: 1.7, transparent: true, opacity: 0.9 });
    const inner = lam(0xffd04a, { emissive: 0xffb020, emissiveIntensity: 1.8, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + rnd() * 0.6;
      flames.push(add(own(new THREE.ConeGeometry(0.11, 0.5 + rnd() * 0.15, 6)), outer, x + Math.sin(a) * 0.1, y0 + 1.0, z + Math.cos(a) * 0.1, false));
    }
    for (let i = 0; i < 2; i++) flames.push(add(own(new THREE.ConeGeometry(0.07, 0.34, 6)), inner, x + (i - 0.5) * 0.08, y0 + 0.92, z + (rnd() - 0.5) * 0.08, false));
    const spark = lam(0xffe08a, { emissive: 0xffc040, emissiveIntensity: 2 });
    for (let i = 0; i < 2; i++) flames.push(add(own(new THREE.OctahedronGeometry(0.02, 0)), spark, x + (rnd() - 0.5) * 0.3, y0 + 1.35 + i * 0.2, z + (rnd() - 0.5) * 0.3, false));
    const light = new THREE.PointLight(0xff8a3a, 5, 6, 1.6);
    light.position.set(x, y0 + 1.2, z);
    scene.add(light);
    fireLights.push(light);
  };

  // ---------- the Yard (v0.58: I-009 and 007 merged, next to the bar): where the thugs hang out ----------
  // Cracked concrete, graffiti on the walls around it, an old couch, a burning barrel, a pile of wrecked cars, tyres, a
  // chain-link fence along the street with three gaps (the gates), and bare bulbs on the buildings at the back.
  {
    const Y = YARD;
    const X0 = Y.x0;
    const Z0 = Y.y0;
    const X1 = Y.x1 + 1;
    const Z1 = Y.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    // The site (the bar, the Yard and the street that ran between them): one sidewalk all round it, like the Factory's.
    {
      const S = TURF_SITE;
      sidewalk([[S.x0, S.y0], [S.x1 + 1, S.y0], [S.x1 + 1, S.y1 + 1], [S.x0, S.y1 + 1]], 0.09, 0.11);
    }
    add(geoBox(X1 - X0, 0.1, Z1 - Z0), lam(0x55524d), cx, 0.05, cz, false);
    // Oil stains and patches of darker, newer concrete; cracks all over.
    const stains = new Batch(own(new THREE.CircleGeometry(0.3, 7).rotateX(-Math.PI / 2)), lam(0x3a3835, DECAL), false);
    for (let i = 0; i < 18; i++) stains.add(X0 + 0.5 + rng() * (X1 - X0 - 1), 0.102, Z0 + 0.5 + rng() * (Z1 - Z0 - 1.5), 0.6 + rng() * 1.4, 1, 0.5 + rng(), rng() * 6);
    stains.build(scene);
    const cracks = new Batch(geoBox(0.03, 0.004, 0.9), lam(0x2e2c29, DECAL), false);
    for (let i = 0; i < 60; i++) cracks.add(X0 + 0.4 + rng() * (X1 - X0 - 0.8), 0.103, Z0 + 0.4 + rng() * (Z1 - Z0 - 1.4), 1, 1, 0.5 + rng(), rng() * 6);
    cracks.build(scene);
    // Graffiti: tags on the side walls (facing in) and the back wall.
    /** Spray-paint graffiti, matte and worn: soft sprayed edges, a dark outline, speckles of overspray, drips, and
     *  small chipped spots where the wall shows through. Lit like the wall it's on (never glowing). */
    const sprayTex = (text: string, c1: string, c2: string) =>
      own(
        canvasTex(
          512,
          192,
          (g) => {
            g.clearRect(0, 0, 512, 192);
            g.save();
            g.translate(256, 92);
            g.rotate(-0.06);
            g.font = '900 104px "Arial Black", Impact, Arial, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            const sc = Math.min(1, 470 / g.measureText(text).width);
            g.scale(sc, 1.05);
            g.lineJoin = 'round';
            // A soft dark outline (sprayed, so blurry at the edge), then the fill in a colour fade.
            g.shadowColor = 'rgba(15, 12, 10, 0.8)';
            g.shadowBlur = 10;
            g.lineWidth = 16;
            g.strokeStyle = 'rgba(20, 16, 14, 0.85)';
            g.strokeText(text, 0, 0);
            g.shadowBlur = 4;
            g.shadowColor = c2;
            const fill = g.createLinearGradient(0, -52, 0, 52);
            fill.addColorStop(0, c1);
            fill.addColorStop(1, c2);
            g.fillStyle = fill;
            g.fillText(text, 0, 0);
            g.restore();
            // Overspray: fine speckles of paint around the letters.
            for (let i = 0; i < 900; i++) {
              const x = 30 + rng() * 452;
              const y = 30 + rng() * 120;
              g.fillStyle = rng() < 0.5 ? c1 : c2;
              g.globalAlpha = 0.25 + rng() * 0.35;
              g.fillRect(x, y, 1 + rng() * 1.5, 1 + rng() * 1.5);
            }
            g.globalAlpha = 1;
            // Drips running down from the letters.
            g.fillStyle = c2;
            for (let i = 0; i < 12; i++) {
              const x = 60 + rng() * 390;
              const y0 = 120 + rng() * 18;
              const len = 8 + rng() * 38;
              g.globalAlpha = 0.85;
              g.fillRect(x, y0, 2.5, len);
              g.beginPath();
              g.arc(x + 1.25, y0 + len, 2.6, 0, Math.PI * 2);
              g.fill();
            }
            g.globalAlpha = 1;
            // Wear: chip small holes out of the paint so the wall shows through.
            g.globalCompositeOperation = 'destination-out';
            for (let i = 0; i < 260; i++) {
              g.globalAlpha = 0.4 + rng() * 0.6;
              g.beginPath();
              g.arc(rng() * 512, rng() * 192, 0.8 + rng() * 2.6, 0, Math.PI * 2);
              g.fill();
            }
            g.globalCompositeOperation = 'source-over';
            g.globalAlpha = 1;
          },
          false,
        ),
      );
    /** Paint on a wall: lit by the scene like the wall (Lambert, not glowing), a little see-through, never flickering. */
    const paintMat = (text: string, c1: string, c2: string) =>
      lam(0xffffff, { map: sprayTex(text, c1, c2), transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const graffiti = (text: string, c1: string, c2: string, w: number, x: number, y: number, z: number, rotY: number) => {
      const mat = paintMat(text, c1, c2);
      const m = add(own(new THREE.PlaneGeometry(w, w * 0.375)), mat, x, y, z, false);
      m.rotation.y = rotY;
      m.receiveShadow = false;
      return m;
    };
    // On the bar's side wall (facing into the Yard; it hides with the bar's roof when you're inside), and the bare side
    // of the east building.
    rooms.get('bar')!.props.push(graffiti('YARD', '#c8382c', '#7a1a14', 2.6, X0 + 0.03, 0.62, cz - 0.3, Math.PI / 2));
    graffiti('KEEP OUT', '#d8a83a', '#9a5a1a', 3.0, X1 - 0.03, 0.62, cz - 0.2, -Math.PI / 2);
    graffiti('NO COPS', '#e8e8e0', '#6a6a70', 1.8, X1 - 0.03, 0.62, Z1 - 1.0, -Math.PI / 2);
    // The buildings at the back have windows: that tag goes on a sheet of plywood leaning against them.
    {
      const px = cx + 4;
      const pz = Z0 + 0.22;
      const ply = add(geoBox(2.2, 1.2, 0.05), lam(0xb8935a, { flatShading: true }), px, 0.62, pz);
      ply.rotation.x = -0.12;
      const m = add(own(new THREE.PlaneGeometry(2.1, 0.79)), paintMat('NO SNITCH', '#4a9a52', '#1e5a2a'), px, 0.64, pz + 0.035, false);
      m.rotation.x = -0.12;
      m.receiveShadow = false;
    }
    // The old couch (two tiles, against the back).
    const couch = FIXTURES.filter((f) => f.kind === 'couch');
    if (couch.length) {
      const ux = (Math.min(...couch.map((f) => f.x)) + Math.max(...couch.map((f) => f.x)) + 1) / 2;
      const uz = couch[0].y + 0.5;
      const fabric = lam(0x6a4a3a, { flatShading: true });
      add(geoBox(1.8, 0.3, 0.7), fabric, ux, 0.25, uz);
      add(geoBox(1.8, 0.45, 0.2), fabric, ux, 0.5, uz - 0.3);
      for (const dx of [-0.85, 0.85]) add(geoBox(0.16, 0.38, 0.7), fabric, ux + dx, 0.32, uz);
      add(geoBox(0.6, 0.05, 0.5), lam(0x4a2a1e), ux - 0.4, 0.42, uz + 0.05).rotation.y = 0.2; // a sagging cushion
    }
    // The burning barrel: a rusty drum with flames and a flickering orange light.
    for (const b of FIXTURES.filter((f) => f.kind === 'barrel')) burningBarrel(b.x + 0.5, 0, b.y + 0.5);
    // v0.58: the gang's hangout: its props are models (props.ts, built to the art rules, §18), placed on their tiles.
    {
      const tilesOf = (kind: string) => FIXTURES.filter((f) => f.kind === kind && inRect(YARD, f.x, f.y));
      const box = (kind: string) => {
        const t = tilesOf(kind);
        const x0 = Math.min(...t.map((f) => f.x)), x1 = Math.max(...t.map((f) => f.x)) + 1;
        const z0 = Math.min(...t.map((f) => f.y)), z1 = Math.max(...t.map((f) => f.y)) + 1;
        return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
      };
      const place = (o: THREE.Object3D, x: number, z: number, rotY = 0) => {
        o.position.set(x, 0.1, z);
        o.rotation.y = rotY;
        scene.add(o);
      };
      // The container, its doors open at the east end, a TV glowing inside and a tag on its side.
      const c = box('container');
      place(buildContainer(c.x1 - c.x0), c.cx, c.cz);
      const tv = new THREE.PointLight(0x6a9aff, 2.2, 3.5, 1.6);
      tv.position.set(c.x1 + 0.4, 0.8, c.cz + 0.3);
      scene.add(tv);
      const tag = add(own(new THREE.PlaneGeometry(2.2, 0.82)), paintMat('CREW', '#e8d84a', '#b08a1a'), c.cx - 0.3, 0.85, c.cz + 0.9, false);
      tag.receiveShadow = false;
      const ruin = box('ruin');
      place(buildRuinWall(ruin.x1 - ruin.x0, 7), ruin.cx, ruin.cz);
      tilesOf('rubble').forEach((f, i) => place(buildRubble(11 + i * 7), f.x + 0.5, f.y + 0.5));
      const car = box('stripped');
      place(buildStrippedCar(), car.cx, car.cz);
      for (const f of tilesOf('dice')) place(buildDiceCrate(), f.x + 0.5, f.y + 0.5);
      for (const f of tilesOf('lookout')) place(buildLookout(), f.x + 0.5, f.y + 0.5);
      // String lights from the container's corner to the buildings at the back, over the couch and the fire.
      const from = new THREE.Vector3(c.x1 - 0.1, 1.6, c.z0 + 0.1), to = new THREE.Vector3(YARD.x0 + 12, 1.75, YARD.y0 + 0.05);
      scene.add(buildStringLights(from, to));
      const glow = new THREE.PointLight(0xffd090, 2, 6, 1.6);
      glow.position.set((from.x + to.x) / 2, 1.3, (from.z + to.z) / 2 + 0.6);
      scene.add(glow);
    }
    // Chain-link fence along the street (kit): a see-through panel and posts on every fence tile.
    for (const f of FIXTURES.filter((x) => x.kind === 'fence')) kit.fence(f.x, f.y + 0.5, f.x + 1, f.y + 0.5, 'chain', { high: 1.1 });
    // Bare bulbs on the buildings at the back.
    for (const bx of [X0 + 3.5, cx + 1.5, X1 - 4.5]) {
      add(geoBox(0.12, 0.12, 0.12), lam(0xffe7c2, { emissive: 0xffd9a0, emissiveIntensity: 1.5 }), bx, 1.6, Z0 + 0.1, false);
      const bulb = new THREE.PointLight(0xffd9a0, 3, 6, 1.6);
      bulb.position.set(bx, 1.5, Z0 + 0.6);
      scene.add(bulb);
    }
  }

  // ---------- the hospital (005-B + 005-D): where you wake up after passing out ----------
  // Two storeys. The front half is a tall lobby behind a glass front with a wide entrance, a reception desk and two
  // staircases up the side walls at the back. The back half is the ward upstairs: beds along both walls, a glass
  // railing where it looks down into the lobby. Brick sides, a dark front with the sign, a red cross on the roof.
  // While you're inside (the lobby or the ward) the walls fade and the roof lifts, like the shops.
  const stairs: THREE.Object3D[] = [];
  {
    const X0 = HOSPITAL.x0;
    const X1 = HOSPITAL.x1 + 1;
    const ZN = HOSPITAL.y0; // the back (north)
    const ZM = LOBBY.y0; // where the ward ends and the lobby starts
    const ZS = HOSPITAL.y1 + 1; // the front (south), facing the park
    const cx = (X0 + X1) / 2;
    const F = FLOOR_H;
    const TOP = 2 * F;
    const t = 0.14;
    add(geoBox(X1 - X0 + 0.6, 0.06, ZS - ZN + 0.6), pavement, cx, 0.03, (ZN + ZS) / 2, false);
    const mBrick = lam(0x7a4a3a);
    const mFacade = lam(0x2f3236);
    const mWhite = lam(0xeeeeea);
    const mRed = lam(0xc8282a);
    const glass = own(new THREE.MeshLambertMaterial({ color: 0xbfe0ee, emissive: 0xffe2b0, emissiveIntensity: 0.25, transparent: true, opacity: 0.28, depthWrite: false }));
    // Outer walls: brick sides and back, full height.
    const walls = [
      add(geoBox(t, TOP, ZS - ZN), mBrick, X0 + t / 2, TOP / 2, (ZN + ZS) / 2),
      add(geoBox(t, TOP, ZS - ZN), mBrick, X1 - t / 2, TOP / 2, (ZN + ZS) / 2),
      add(geoBox(X1 - X0, TOP, t), mBrick, cx, TOP / 2, ZN + t / 2),
      // The front above the glass: dark, with the sign on it.
      add(geoBox(X1 - X0, TOP - F - 0.1, t), mFacade, cx, (TOP + F + 0.1) / 2, ZS - t / 2),
    ];
    // The glass front of the lobby: panes either side of the entrance (3 tiles wide), a glass strip above it, and the
    // frames. The doors stand open.
    const ENT0 = LOBBY.door[0] - 1;
    const ENT1 = LOBBY.door[0] + 2;
    const panes = [
      add(geoBox(ENT0 - X0, F + 0.1, 0.04), glass, (X0 + ENT0) / 2, (F + 0.1) / 2, ZS - 0.05, false),
      add(geoBox(X1 - ENT1, F + 0.1, 0.04), glass, (ENT1 + X1) / 2, (F + 0.1) / 2, ZS - 0.05, false),
      add(geoBox(ENT1 - ENT0, F - 1.25, 0.04), glass, (ENT0 + ENT1) / 2, 1.25 + (F - 1.25) / 2 + 0.05, ZS - 0.05, false),
    ];
    const frames = [X0 + 0.07, ENT0, ENT1, X1 - 0.07].map((x) => add(geoBox(0.08, F + 0.1, 0.1), mFacade, x, (F + 0.1) / 2, ZS - 0.05));
    frames.push(add(geoBox(ENT1 - ENT0, 0.06, 0.1), mFacade, (ENT0 + ENT1) / 2, 1.25, ZS - 0.05));
    // The sliding doors, slid open to the sides.
    for (const x of [ENT0 + 0.3, ENT1 - 0.3]) panes.push(add(geoBox(0.55, 1.2, 0.03), glass, x, 0.62, ZS - 0.14, false));
    // The sign: HOSPITAL in red on white, and a red cross on the corner.
    const signMat = own(new THREE.MeshBasicMaterial({ map: own(signTexture('HOSPITAL', '#f4f4f0', '#c8282a')) }));
    const sign = add(own(new THREE.PlaneGeometry(2.6, 0.48)), signMat, cx - 0.5, F + 0.55, ZS + 0.01, false);
    const crossMat = lam(0xd9302a, { emissive: 0xd9302a, emissiveIntensity: 0.7 });
    const cross = [
      add(geoBox(0.5, 0.16, 0.06), crossMat, X1 - 0.7, F + 0.55, ZS + 0.03, false),
      add(geoBox(0.16, 0.5, 0.06), crossMat, X1 - 0.7, F + 0.55, ZS + 0.03, false),
    ];
    // Windows (kit): a row along the front's upper floor, and windows down the brick sides on both floors, all lit.
    const hr = { x0: X0, z0: ZN, x1: X1, z1: ZS };
    const windows: THREE.Object3D[] = kit.windowRow(face(hr, 's'), 0.6, X1 - X0 - 0.6, TOP - 0.62, 1.0, { style: 'office', w: 0.8, h: 0.35, lit: true, glow: 0xfff0d0, frame: 0x2f3236, sill: false });
    for (const side of ['w', 'e'] as const) {
      const f = face(hr, side);
      for (let z = ZN + 1; z < ZS - 0.5; z += 2)
        for (const y of z < ZM ? [0.6, F + 0.55] : [F + 0.55]) windows.push(...kit.window(f, uOf(f, z + 0.5), y, { style: 'office', w: 0.8, h: 0.6, lit: true, glow: 0xfff0d0, frame: 0xd8d4cc }));
    }
    // The roof, its edge, two air conditioners and a red cross for the helicopters (and the minimap).
    const roof = kit.roof(hr, TOP, C.roof, 0, 0.1);
    const rim = kit.parapet({ x0: X0 - 0.03, z0: ZN - 0.03, x1: X1 + 0.03, z1: ZS + 0.03 }, TOP + 0.08, mWhite);
    const roofProps = [
      ...kit.acUnit(X0 + 1, TOP + 0.1, ZN + 1, true),
      ...kit.acUnit(X0 + 1, TOP + 0.1, ZN + 2, true),
      ...kit.vent(X1 - 1, TOP + 0.1, ZN + 1.5),
      add(geoBox(1.4, 0.02, 0.4), mRed, cx, TOP + 0.11, ZM + 2, false),
      add(geoBox(0.4, 0.02, 1.4), mRed, cx, TOP + 0.11, ZM + 2, false),
    ];

    // --- the lobby ---
    const lobbyTex = own(
      canvasTex(64, 64, (g) => {
        g.fillStyle = '#d8d6cf';
        g.fillRect(0, 0, 64, 64);
        g.strokeStyle = '#b8b4aa';
        g.lineWidth = 2;
        g.strokeRect(1, 1, 62, 62);
      }),
    );
    lobbyTex.repeat.set(X1 - X0, ZS - ZM);
    const lobbyFloor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.2, ZS - ZM - 0.1)), lam(0xffffff, { map: lobbyTex }));
    lobbyFloor.rotation.x = -Math.PI / 2;
    lobbyFloor.position.set(cx, 0.065, (ZM + ZS) / 2);
    lobbyFloor.receiveShadow = true;
    scene.add(lobbyFloor);
    // The back wall under the ward, between the stairs: two "staff only" doors and a big cross.
    add(geoBox(X1 - X0 - 2, F, 0.12), lam(0xdcd8cc), cx, F / 2, ZM - 0.06);
    for (const dx of [-0.75, 0.75]) add(geoBox(0.6, 1.1, 0.03), lam(0x7a8a90), cx + dx, 0.6, ZM + 0.01, false);
    add(geoBox(0.4, 0.12, 0.03), mRed, cx, 1.42, ZM + 0.01, false);
    add(geoBox(0.12, 0.4, 0.03), mRed, cx, 1.42, ZM + 0.01, false);
    // The reception desk (white, a red band), with a computer; the receptionist stands behind it.
    {
      const desk = FIXTURES.filter((f) => f.kind === 'desk');
      const dx0 = Math.min(...desk.map((f) => f.x));
      const dx1 = Math.max(...desk.map((f) => f.x)) + 1;
      const dz = desk[0].y + 0.5;
      const dcx = (dx0 + dx1) / 2;
      add(geoBox(dx1 - dx0 - 0.1, 0.6, 0.5), mWhite, dcx, 0.3, dz);
      add(geoBox(dx1 - dx0 - 0.08, 0.08, 0.52), mRed, dcx, 0.45, dz + 0.005, false);
      add(geoBox(dx1 - dx0, 0.05, 0.6), lam(0x9a8a72), dcx, 0.63, dz);
      add(geoBox(0.34, 0.24, 0.03), lam(0x2b2b2e), dcx + 0.4, 0.82, dz - 0.12);
      add(geoBox(0.3, 0.2, 0.01), lam(0x9fd0e8, { emissive: 0x9fd0e8, emissiveIntensity: 0.8 }), dcx + 0.4, 0.82, dz - 0.105, false);
      add(geoBox(0.2, 0.03, 0.12), lam(0x2b2b2e), dcx + 0.4, 0.67, dz - 0.1, false);
    }
    // Plants in the front corners.
    for (const x of [X0 + 0.35, X1 - 0.35]) {
      add(own(new THREE.CylinderGeometry(0.14, 0.11, 0.28, 8)), lam(0x8a6a4a), x, 0.2, ZS - 0.35);
      add(own(new THREE.IcosahedronGeometry(0.24, 0)), lam(0x3f6834, { flatShading: true }), x, 0.55, ZS - 0.35);
    }
    // One light for the lobby and the ward (every extra light costs phones a little).
    const light = new THREE.PointLight(0xfff2dc, 7, 8, 1.4);
    light.position.set(cx, F + 1.2, ZM + 0.5);
    scene.add(light);

    // --- the stairs: a flight up each side wall, rising to the ward at the back of the lobby ---
    const stepMat = lam(0xc8c4ba);
    const noseMat = lam(0x5a5650);
    const N = 8;
    for (const s of STAIRS) {
      const g = new THREE.Group();
      const west = s.x === HOSPITAL.x0;
      const sx = west ? s.x + t + (1 - t) / 2 : s.x + (1 - t) / 2;
      const zFoot = s.bottom[1] + 1;
      for (let i = 0; i < N; i++) {
        const h = ((i + 1) * F) / N;
        const z = zFoot - (i + 0.5) * (2 / N);
        const step = new THREE.Mesh(geoBox(1 - t, h, 2 / N), stepMat);
        step.position.set(sx, h / 2, z);
        step.castShadow = step.receiveShadow = true;
        g.add(step);
        const nose = new THREE.Mesh(geoBox(1 - t, 0.025, 0.04), noseMat);
        nose.position.set(sx, h - 0.01, z + 1 / N - 0.02);
        g.add(nose);
      }
      // A handrail on the open side, sloping with the steps.
      const railX = west ? s.x + 1 : s.x;
      const len = Math.hypot(2, F);
      const rail = new THREE.Mesh(geoBox(0.05, 0.05, len), lam(0x8a8f96));
      rail.position.set(railX, F / 2 + 0.75, zFoot - 1);
      rail.rotation.x = Math.atan2(F, 2);
      g.add(rail);
      for (const k of [0.15, 0.5, 0.85]) {
        const post = new THREE.Mesh(geoBox(0.03, 0.75, 0.03), lam(0x8a8f96));
        post.position.set(railX, F * k + 0.38, zFoot - 2 * k);
        g.add(post);
      }
      g.traverse((o) => (o.userData.stairsId = s.id));
      scene.add(g);
      stairs.push(g);
    }

    // --- the ward, upstairs ---
    add(geoBox(X1 - X0, 0.14, ZM - ZN), lam(0xdcd8cc), cx, F - 0.06, (ZN + ZM) / 2);
    const wardFloor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.2, ZM - ZN - 0.1)), lam(0xa8c4bc));
    wardFloor.rotation.x = -Math.PI / 2;
    wardFloor.position.set(cx, F + 0.015, (ZN + ZM) / 2);
    wardFloor.receiveShadow = true;
    scene.add(wardFloor);
    // A glass railing along the edge over the lobby, between the stairs.
    add(geoBox(X1 - X0 - 2, 0.5, 0.03), glass, cx, F + 0.27, ZM, false);
    add(geoBox(X1 - X0 - 2, 0.05, 0.07), lam(0x8a8f96), cx, F + 0.53, ZM);
    // The beds: head against the wall, white sheets, a blue blanket; a drip stand by some, a patient in two.
    const steel = lam(0x9aa0a8);
    const sheet = lam(0xf4f4f0);
    const blanket = lam(0x6a9ac0);
    FIXTURES.filter((f) => f.kind === 'bed').forEach((b, i) => {
      const west = b.x === WARD.x0;
      const dir = west ? 1 : -1; // from the head towards the foot
      const head = west ? b.x + t : b.x + 1 - t;
      const bz = b.y + 0.5;
      const mid = head + dir * 0.45;
      add(geoBox(0.86, 0.08, 0.58), steel, mid, F + 0.3, bz);
      for (const [lx, lz] of [[0.05, -0.25], [0.05, 0.25], [0.8, -0.25], [0.8, 0.25]]) add(geoBox(0.04, 0.28, 0.04), steel, head + dir * lx, F + 0.14, bz + lz, false);
      add(geoBox(0.04, 0.42, 0.58), steel, head + dir * 0.03, F + 0.42, bz);
      add(geoBox(0.82, 0.1, 0.54), sheet, mid, F + 0.39, bz);
      add(geoBox(0.2, 0.06, 0.36), sheet, head + dir * 0.15, F + 0.47, bz);
      add(geoBox(0.5, 0.05, 0.56), blanket, head + dir * 0.6, F + 0.46, bz);
      const isWakeBed = b.y === WAKE[1] && Math.abs(b.x - WAKE[0]) === 1;
      if (i % 3 === 1 && !isWakeBed) {
        add(own(new THREE.SphereGeometry(0.12, 10, 8)), lam(0xe0b48f), head + dir * 0.17, F + 0.56, bz);
        add(geoBox(0.55, 0.12, 0.5), blanket, head + dir * 0.55, F + 0.5, bz);
      }
      if (i % 2 === 0) {
        add(geoBox(0.03, 1.1, 0.03), steel, head + dir * 0.12, F + 0.55, bz + 0.38, false);
        add(geoBox(0.1, 0.14, 0.04), lam(0xd8eef2, { transparent: true, opacity: 0.8 }), head + dir * 0.12, F + 1.02, bz + 0.38, false);
      }
    });

    const fade: Fadeable = { walls: [...walls, ...panes, ...frames], mats: [mBrick, mFacade], props: [roof, ...rim, ...roofProps, sign, ...cross, ...windows], opacity: 1 };
    fadeables.push(fade);
    rooms.set(LOBBY.id, fade);
  }

  // ---------- the Thrift Store and its salvage yard (009; Scrapping) ----------
  // A two-storey brick shop with a big weathered "THRIFT STORE" sign over a rusty door, barred windows with boxes behind
  // them, drainpipes and a meter box. East of it, its yard: cracked concrete with weeds, a chain-link fence with barbed
  // wire and one open gate on the street side, pallets, rubbish bags and cans (the dumpsters are spots, see StreetView).
  {
    const X0 = THRIFT.x0;
    const X1 = THRIFT.x1 + 1;
    const Z0 = THRIFT.y0;
    const Z1 = THRIFT.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const HT = 2.7;
    add(geoBox(X1 - X0 + 0.4, 0.06, Z1 - Z0 + 0.4), pavement, cx, 0.03, cz, false);
    const bt = (across: number) => {
      const t = own(brickTex.clone());
      t.repeat.set(across, 2);
      t.needsUpdate = true;
      return t;
    };
    const mBrick = lam(0x8a5040, { map: bt(X1 - X0) });
    const walls = [add(geoBox(X1 - X0, HT, Z1 - Z0), mBrick, cx, HT / 2, cz)];
    const r = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const roofParts = [kit.roof({ x0: X0 + 0.1, z0: Z0 + 0.1, x1: X1 - 0.1, z1: Z1 - 0.1 }, HT, C.roof, 0, 0.06), ...kit.parapet({ x0: X0 - 0.02, z0: Z0 - 0.02, x1: X1 + 0.02, z1: Z1 + 0.02 }, HT + 0.08, 0x5a3a2e), ...kit.acUnit(X0 + 1.2, HT + 0.05, Z1 - 1.2, true)];
    // The front (south, on the street): the sign, the door, two barred windows with boxes stacked behind them,
    // drainpipes down both corners, a meter box. Upstairs windows down the sides.
    const f = face(r, 's');
    const u = (x: number) => uOf(f, x);
    kit.sign(f, u(cx), 2.05, { text: 'THRIFT STORE', bg: '#d8cdb8', fg: '#8a2f28', w: 3.6, h: 0.62, board: 0x3a2a22 });
    kit.door(f, u(cx), { style: 'office', w: 0.8, h: 1.25, color: 0x7a6a5a, frame: 0x4a3a2e, step: true });
    for (const dx of [-1.5, 1.5]) kit.window(f, u(cx + dx), 0.55, { style: 'barred', w: 1.0, h: 0.8, behind: 'boxes' });
    for (const x of [X0 + 0.15, X1 - 0.15]) kit.drainpipe(f, u(x), HT);
    kit.meterBox(f, u(X1 - 0.6), 0.9);
    for (const side of ['w', 'e'] as const) kit.windowRow(face(r, side), 0.6, Z1 - Z0 - 0.6, 1.55, 1.3, { litChance: 0.4, rng });
    // The back door onto the yard (east wall) with a bare bulb over it.
    const fe = face(r, 'e');
    kit.door(fe, uOf(fe, THRIFT_YARD.y0 + 2.5), { w: 0.75, h: 1.2, color: 0x6a5a4a, light: 'bulb' });
    const fade: Fadeable = { walls, mats: [mBrick], props: roofParts, opacity: 1 };
    fadeables.push(fade);

    // The yard.
    const Y0 = THRIFT_YARD.x0;
    const Y1 = THRIFT_YARD.x1 + 1;
    const ycx = (Y0 + Y1) / 2;
    add(geoBox(Y1 - Y0, 0.075, Z1 - Z0), lam(0x5a5852), ycx, 0.037, cz, false);
    const cracks = new Batch(geoBox(0.03, 0.004, 0.8), lam(0x2e2c29, DECAL), false);
    for (let i = 0; i < 10; i++) cracks.add(Y0 + 0.4 + rng() * (Y1 - Y0 - 0.8), 0.077, Z0 + 0.4 + rng() * (Z1 - Z0 - 0.8), 1, 1, 0.5 + rng(), rng() * 6);
    cracks.build(scene);
    const weeds = new Batch(own(new THREE.ConeGeometry(0.06, 0.22, 4)), lam(0x4a6a32), false);
    for (let i = 0; i < 26; i++) {
      const edge = i % 3;
      const x = edge === 0 ? Y1 - 0.12 : Y0 + 0.3 + rng() * (Y1 - Y0 - 0.6);
      const z = edge === 1 ? Z1 - 0.12 : edge === 2 ? Z0 + 0.15 : Z0 + 0.3 + rng() * (Z1 - Z0 - 0.6);
      weeds.add(x + (rng() - 0.5) * 0.1, 0.18, z, 1, 0.7 + rng() * 0.8, 1, rng() * 3);
    }
    weeds.build(scene);
    // Chain-link fence with barbed wire along the north, east and south edges (but the gate), and the gate itself,
    // swung open into the street.
    kit.fence(Y0, Z0 + 0.02, Y1, Z0 + 0.02, 'chainBarbed');
    kit.fence(Y0, Z1 - 0.02, Y1, Z1 - 0.02, 'chainBarbed', { skip: (i) => Y0 + i === THRIFT_GATE[0] });
    kit.fence(Y1 - 0.02, Z0, Y1 - 0.02, Z1, 'chainBarbed');
    kit.chainPanel(THRIFT_GATE[0] + 1.0, Z1 + 0.45, false, 1.15).rotation.y = Math.PI / 2.4;
    // Junk: pallets, rubbish bags, cans, an old tyre.
    const wood = lam(0x8a6a44);
    for (const [px, pz, r] of [[Y0 + 1.2, Z0 + 0.55, 0.2], [Y1 - 0.45, Z0 + 1.2, 1.5]]) {
      for (let i = 0; i < 4; i++) add(geoBox(0.9, 0.04, 0.12), wood, px, 0.1, pz - 0.3 + i * 0.2, false).rotation.y = r;
      add(geoBox(0.9, 0.08, 0.1), wood, px, 0.05, pz, false).rotation.y = r;
    }
    for (const [bx, bz] of [[Y0 + 3.4, Z0 + 0.4], [Y0 + 3.8, Z0 + 0.55], [Y1 - 0.4, Z0 + 3.4]]) add(own(new THREE.IcosahedronGeometry(0.2, 0)), lam(0x1e2022, { flatShading: true }), bx, 0.17, bz).scale.y = 0.8;
    for (let i = 0; i < 12; i++) {
      const can = add(own(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 6)), lam([0xb8bcc2, 0x9aa0a6, 0xc8a06a][i % 3]), Y0 + 0.4 + rng() * (Y1 - Y0 - 0.8), 0.04, Z0 + 0.4 + rng() * (Z1 - Z0 - 0.8), false);
      can.rotation.z = Math.PI / 2;
      can.rotation.y = rng() * 6;
    }
    const tyre = add(own(new THREE.TorusGeometry(0.2, 0.08, 6, 12)), lam(0x1e1e22), Y0 + 1.5, 0.09, Z0 + 3.5);
    tyre.rotation.x = Math.PI / 2;
  }

  // ---------- the Superstore, its yard and its parking spot (F-013; Scrapping: aluminium; v0.56) ----------
  // A big supermarket on two lots, its front on the south street: white render with a blue band, a wall of lit shop
  // windows, glass double doors, the SUPERSTORE sign with a little cloud on it and "STORE #1217" under it, shopping carts.
  // Behind it on B its yard: concrete, a half-high brick wall with the gate on the east, bales of crushed cans, a loading
  // door. On A its little parking spot: asphalt with painted bays and a wheel stop (the car and meter are spots).
  {
    const X0 = SUPERSTORE.x0, X1 = SUPERSTORE.x1 + 1, Z0 = SUPERSTORE.y0, Z1 = SUPERSTORE.y1 + 1;
    const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
    const HT = 2.4;
    add(geoBox(X1 - X0 + 0.4, 0.06, Z1 - Z0 + 0.4), pavement, cx, 0.03, cz, false);
    const mRender = lam(0xe2ded6);
    const mBlue = lam(0x2a5a9a);
    const walls = [add(geoBox(X1 - X0, HT, Z1 - Z0), mRender, cx, HT / 2, cz)];
    const r = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const props: THREE.Object3D[] = [kit.roof(r, HT, 0x4a4d52, 0.05, 0.08), ...kit.parapet({ x0: X0 - 0.02, z0: Z0 - 0.02, x1: X1 + 0.02, z1: Z1 + 0.02 }, HT + 0.08, 0x2a5a9a)];
    props.push(...kit.acUnit(X0 + 2, HT + 0.05, Z0 + 1.5, true), ...kit.acUnit(X1 - 2.5, HT + 0.05, Z0 + 1.2, true), ...kit.vent(cx, HT + 0.12, Z0 + 2, 0.14, 0.4));
    // The front: a blue band along the top, the sign, the windows either side of the doors.
    const f = face(r, 's');
    const u = (x: number) => uOf(f, x);
    props.push(add(geoBox(X1 - X0 + 0.04, 0.42, 0.06), mBlue, cx, HT - 0.32, Z1 + 0.03, false));
    const sign = kit.sign(f, u(cx), 2.05, { text: 'SUPERSTORE', bg: '#ffffff', fg: '#1e4a8a', w: 4.2, h: 0.62, board: 0x1e3a6a, out: 0.12 });
    // The little cloud on the sign, left of the name (puffs of white on a blue disc).
    const cloudAt = (dx: number, dy: number, rr: number) => add(own(new THREE.IcosahedronGeometry(rr, 0)), lam(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 }), cx - 2.5 + dx, 2.05 + dy, Z1 + 0.22, false);
    add(own(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 10)), mBlue, cx - 2.5, 2.05, Z1 + 0.18, false).rotation.x = Math.PI / 2;
    for (const [dx, dy, rr] of [[-0.12, -0.03, 0.12], [0.02, 0.05, 0.15], [0.16, -0.03, 0.11]]) cloudAt(dx, dy, rr);
    const plate = kit.sign(f, u(cx + 3.4), 1.55, { text: 'STORE #1217', bg: '#1e3a6a', fg: '#ffffff', w: 1.3, h: 0.28, board: 0x14284a });
    kit.door(f, u(cx), { style: 'double', w: 1.4, h: 1.3, color: 0x9ab8c8, frame: 0x8a8f96, step: false });
    for (const dx of [-3.6, -2.0, 2.0, 3.6]) kit.window(f, u(cx + dx), 0.2, { style: 'shop', w: 1.4, h: 1.05, frame: 0x8a8f96, lit: true });
    for (const x of [X0 + 0.15, X1 - 0.15]) kit.drainpipe(f, u(x), HT);
    // A loading door at the back, onto the yard, with a bulb.
    const fn = face(r, 'n');
    kit.door(fn, uOf(fn, SUPERSTORE_YARD.x0 + 2.5), { style: 'shutter', w: 1.6, h: 1.4, color: 0xa8adb4, light: 'bulb' });
    // v0.60: two storeys of flats over the store.
    const flats = apartments(r, HT + 0.12, 2, 0xb8b0a4, 0x2a5a9a);
    fadeables.push({
      walls, mats: [mRender], props: [...props, ...sign, ...plate, ...flats], opacity: 1,
      cut: { height: HT + 0.12 + 2 * FLOOR, keep: HT, center: new THREE.Vector3(cx, 0, cz), upper: flats, on: false },
    });

    // Shopping carts: a few in a corral at the parking spot, one left out on the sidewalk.
    const cartMetal = lam(0xb8bcc2);
    const cartRed = lam(0xc83a32);
    const cart = (x: number, z: number, rot: number) => {
      const parts: [number, number, number, number, number, number, THREE.Material][] = [
        [0.5, 0.03, 0.34, 0, 0.32, 0, cartMetal], // the basket's floor
        [0.5, 0.26, 0.02, 0, 0.46, -0.17, cartMetal], [0.5, 0.26, 0.02, 0, 0.46, 0.17, cartMetal], // its sides
        [0.02, 0.26, 0.34, -0.25, 0.46, 0, cartMetal], [0.02, 0.26, 0.34, 0.25, 0.46, 0, cartMetal],
        [0.04, 0.04, 0.4, 0.31, 0.66, 0, cartRed], // the handle
        [0.5, 0.02, 0.02, 0, 0.12, -0.15, cartMetal], [0.5, 0.02, 0.02, 0, 0.12, 0.15, cartMetal], // the base
      ];
      const c = Math.cos(rot), sn = Math.sin(rot);
      for (const [w, h, d, lx, ly, lz, m] of parts) add(geoBox(w, h, d), m, x + lx * c + lz * sn, ly, z - lx * sn + lz * c, false).rotation.y = rot;
      for (const [lx, lz] of [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.14], [0.2, 0.14]]) add(geoBox(0.05, 0.08, 0.05), lam(0x1e1e22), x + lx * c + lz * sn, 0.04, z - lx * sn + lz * c, false);
    };
    const L = SUPERSTORE_LOT;
    for (let i = 0; i < 3; i++) cart(L.x0 + 0.6 + i * 0.12, L.y1 + 0.5, 0);
    cart(X1 - 1.2, Z1 + 0.7, 0.6);

    // The parking spot: asphalt, painted bay lines, a wheel stop at the head of the bay with the meter.
    add(geoBox(L.x1 - L.x0 + 1, 0.08, L.y1 - L.y0 + 1), lam(0x34363c), (L.x0 + L.x1 + 1) / 2, 0.04, (L.y0 + L.y1 + 1) / 2, false);
    const paint = lam(0xd8d2c4);
    // (v0.57: the bay runs from the street on the north to the meter at its head, by the store's wall.)
    for (const dx of [1, 4]) add(geoBox(0.06, 0.01, 3.2), paint, L.x0 + dx + 0.5, 0.085, L.y1 - 0.6, false);
    add(geoBox(1.2, 0.08, 0.16), lam(0x9a9286), L.x0 + 2.5, 0.1, L.y1 + 0.2, false);

    // The yard.
    const Y = SUPERSTORE_YARD;
    const Yx0 = Y.x0, Yx1 = Y.x1 + 1, Yz0 = Y.y0, Yz1 = Y.y1 + 1;
    add(geoBox(Yx1 - Yx0, 0.1, Yz1 - Yz0), lam(0x6a6862), (Yx0 + Yx1) / 2, 0.05, (Yz0 + Yz1) / 2, false);
    const g0 = SUPERSTORE_GATE[0][1], g1 = SUPERSTORE_GATE[SUPERSTORE_GATE.length - 1][1] + 1;
    kit.fence(Yx0, Yz0 + 0.1, Yx1, Yz0 + 0.1, 'halfBrick');
    kit.fence(Yx0 + 0.1, Yz0, Yx0 + 0.1, Yz1, 'halfBrick');
    kit.fence(Yx1 - 0.1, Yz0, Yx1 - 0.1, Yz1, 'halfBrick', { skip: (i) => Yz0 + i >= g0 && Yz0 + i < g1 });
    // Bales of crushed cans (silver blocks with coloured flecks), stacked by the wall.
    const bale = lam(0xc8ced6);
    for (const [bx, bz, h] of [[Yx0 + 3.5, Yz0 + 2.4, 0], [Yx0 + 3.5, Yz0 + 2.4, 1], [Yx0 + 3.5, Yz0 + 3.3, 0]] as const) {
      add(geoBox(0.7, 0.45, 0.6), bale, bx, 0.33 + h * 0.46, bz);
      for (let i = 0; i < 4; i++) add(geoBox(0.12, 0.06, 0.02), lam([0xb84a4a, 0x3a6aa8, 0x4a9a4a, 0xd8b04a][i]), bx - 0.22 + i * 0.15, 0.3 + h * 0.46 + (i % 2) * 0.12, bz + 0.31, false);
    }
    // Loose cans on the ground.
    for (let i = 0; i < 10; i++) {
      const can = add(own(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 6)), lam([0xd8dde2, 0xb84a4a, 0x3a6aa8][i % 3]), Yx0 + 0.6 + rng() * (Yx1 - Yx0 - 1.2), 0.14, Yz0 + 0.6 + rng() * (Yz1 - Yz0 - 1.2), false);
      can.rotation.z = Math.PI / 2;
      can.rotation.y = rng() * 6;
    }
  }

  // ---------- the Factory and its parking lot (Industrial zone, I-003 + I-006; Tinkering) ----------
  // An abandoned factory: brick walls with broken windows, a corrugated sawtooth roof with skylights, a big rusty roll-up
  // door (open) to the parking lot. Inside (the walls fade and the roof lifts while you're in): a concrete floor with oil
  // stains, 3 plate presses along the west wall, 3 workbenches along the east wall, crates at the back, hanging lamps.
  // The parking lot: cracked asphalt with faded lines, weeds, a chain-link fence with one opening for cars (west).
  {
    const X0 = FACTORY.x0;
    const X1 = FACTORY.x1 + 1;
    const Z0 = FACTORY.y0;
    const Z1 = FACTORY.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const HT = 3.4;
    const t = 0.16;
    // The two blocks are merged into one site: one sidewalk all round it (covering the old street between them, its
    // sides included), with a curb along the road, like every block.
    {
      // (v0.55: round corners, like every block.)
      const F = FACTORY_SITE;
      sidewalk([[F.x0, F.y0], [F.x1 + 1, F.y0], [F.x1 + 1, F.y1 + 1], [F.x0, F.y1 + 1]], 0.09, 0.11);
    }
    // Floor.
    const floorTex = own(
      canvasTex(128, 128, (g) => {
        g.fillStyle = '#7a7872';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = '#5a5852';
        g.lineWidth = 2;
        g.strokeRect(1, 1, 126, 126);
        g.fillStyle = 'rgba(30, 28, 26, 0.35)';
        g.beginPath();
        g.ellipse(40, 70, 22, 12, 0.4, 0, Math.PI * 2);
        g.fill();
      }),
    );
    floorTex.repeat.set((X1 - X0) / 2, (Z1 - Z0) / 2);
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.2, Z1 - Z0 - 0.2)), lam(0xffffff, { map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.095, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    // Walls: brick, with a row of broken windows high up; the south wall has the roll-up door (2 tiles, open).
    const bt = own(brickTex.clone());
    bt.repeat.set(X1 - X0, 3);
    bt.needsUpdate = true;
    const mBrick = lam(0x8a5a44, { map: bt });
    const [d0] = FACTORY_DOOR[0];
    const d1 = FACTORY_DOOR[FACTORY_DOOR.length - 1][0] + 1;
    const fr = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const walls = kit.walls(fr, HT, t, mBrick, { s: [{ u0: d0 - X0, u1: d1 - X0, top: 2.0 }] });
    const props: THREE.Object3D[] = [];
    const glassMat = lam(0x3a4650, { emissive: 0x2a2010, emissiveIntensity: 0.5 });
    const broken = lam(0x141618);
    // A row of old factory windows high up on every wall, about one in three smashed (kit). None behind the name
    // over the door: they covered the sign.
    const signU = (d0 + d1) / 2 - X0;
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const f = face(fr, side);
      const ns = side === 'n' || side === 's';
      const step = ns ? 1.6 : 1.8;
      const n = Math.floor((f.len - 1) / step) + 1;
      const start = (f.len - (n - 1) * step) / 2;
      for (let i = 0; i < n; i++) {
        const u = start + i * step;
        if (side === 's' && Math.abs(u - signU) < 2.3) continue;
        props.push(...kit.window(f, u, HT - 1.25, { style: (i * 7 + side.charCodeAt(0)) % 3 === 0 ? 'broken' : 'office', w: ns ? 1.0 : 1.1, h: 0.7, frame: 0x3a3632 }));
      }
    }
    // The roll-up door, rolled up into its box over the opening, in a rusty frame; the painted name over it.
    const fs = face(fr, 's');
    props.push(...kit.door(fs, signU, { style: 'shutterOpen', w: d1 - d0, h: 2.0, frame: 0x5a4a3a }));
    props.push(...kit.sign(fs, signU, 2.75, { text: 'FACTORY', bg: '#3a3632', fg: '#c8b89a', w: 3.4, h: 0.55, out: -0.01 }));
    props.push(...kit.drainpipe(fs, 0.1, HT), ...kit.drainpipe(fs, X1 - X0 - 0.1, HT));
    // The roof: a closed slab on top of the walls, and on it a corrugated sawtooth: three ridges, each rising towards
    // the north with a steep glazed face there, and a skylight lying on each slope (the middle one broken). Closed shapes,
    // so nothing shows through from outside; all of it lifts off while you're inside.
    const roofMat = lam(0x6a6a66, { map: corrugated });
    props.push(add(geoBox(X1 - X0 + 0.2, 0.1, Z1 - Z0 + 0.2), lam(0x4a4a48), cx, HT + 0.05, cz));
    const RISE = 0.75;
    const bay = (Z1 - Z0) / 3;
    const ridge = new THREE.Shape();
    ridge.moveTo(0, 0);
    ridge.lineTo(bay, 0);
    ridge.lineTo(0, RISE);
    ridge.closePath();
    const ridgeGeo = own(new THREE.ExtrudeGeometry(ridge, { depth: X1 - X0 + 0.2, bevelEnabled: false }));
    ridgeGeo.rotateY(-Math.PI / 2); // the triangle stands in the north–south plane, extruded west → east
    const slope = Math.atan2(RISE, bay);
    for (let i = 0; i < 3; i++) {
      const z0 = Z0 + i * bay;
      const m = add(ridgeGeo, roofMat, X1 + 0.1, HT + 0.1, z0);
      props.push(m);
      // The glazed north face of the ridge, and a skylight on the slope.
      props.push(add(geoBox(X1 - X0 - 0.6, RISE * 0.7, 0.03), glassMat, cx, HT + 0.1 + RISE * 0.4, z0 - 0.02, false));
      const sky = add(geoBox(X1 - X0 - 2, 0.03, bay * 0.45), i === 1 ? broken : lam(0x9fb8c8, { emissive: 0x405060, emissiveIntensity: 0.3 }), cx, HT + 0.1 + RISE * 0.5 + 0.02, z0 + bay * 0.5, false);
      sky.rotation.x = slope;
      props.push(sky);
    }
    // Inside: the plate presses (west wall) and workbenches (east wall) are the stations (drawn below), crates at the
    // back, oil drums, and lamps hanging from the roof.
    const wood = lam(0x7a5a3a);
    for (const f of FIXTURES.filter((x) => x.kind === 'crate' && inRect(FACTORY, x.x, x.y))) {
      add(geoBox(0.85, 0.7, 0.85), wood, f.x + 0.5, 0.45, f.y + 0.5).rotation.y = rng() * 0.3;
      if (rng() < 0.6) add(geoBox(0.7, 0.5, 0.7), wood, f.x + 0.5, 1.05, f.y + 0.5).rotation.y = rng() * 0.6;
    }
    for (const [dx, dz] of [[0.4, 11.3], [9.5, 11.3]]) add(own(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10)), lam(0x2e4a5a), X0 + dx, 0.4, Z0 + dz);
    const lampMat = lam(0xfff0c8, { emissive: 0xffe2a8, emissiveIntensity: 1.6 });
    for (const z of [Z0 + 3, Z0 + 9]) {
      add(geoBox(0.02, 1.0, 0.02), lam(0x2b2b2e), cx, HT - 0.5, z, false);
      add(own(new THREE.ConeGeometry(0.25, 0.2, 10, 1, true)), lam(0x3a3d42), cx, HT - 1.05, z, false);
      add(geoBox(0.14, 0.06, 0.14), lampMat, cx, HT - 1.15, z, false);
    }
    // One light for the whole hall (each light costs phones a little).
    const hall = new THREE.PointLight(0xffe8c0, 9, 14, 1.2);
    hall.position.set(cx, HT - 1.2, cz);
    scene.add(hall);
    const fade: Fadeable = { walls, mats: [mBrick], props, opacity: 1 };
    fadeables.push(fade);
    rooms.set(FACTORY.id, fade);

    // The parking lot: cracked asphalt, faded parking lines, weeds, a fence with one opening on the west side.
    const L0 = FACTORY_LOT.x0;
    const L1 = FACTORY_LOT.x1 + 1;
    const LZ0 = FACTORY_LOT.y0;
    const LZ1 = FACTORY_LOT.y1 + 1;
    const lcx = (L0 + L1) / 2;
    const lcz = (LZ0 + LZ1) / 2;
    add(geoBox(L1 - L0, 0.02, LZ1 - LZ0), lam(0x3e4046), lcx, 0.1, lcz, false);
    const lines = new Batch(geoBox(0.06, 0.006, 1.8), lam(0x8a8a82, DECAL), false);
    for (let x = L0 + 2; x < L1 - 0.5; x += 1.5) {
      lines.add(x, 0.113, LZ1 - 1.1);
      lines.add(x, 0.113, LZ0 + 4.2);
    }
    lines.build(scene);
    const cracks = new Batch(geoBox(0.03, 0.004, 1.1), lam(0x26282c, DECAL), false);
    for (let i = 0; i < 24; i++) cracks.add(L0 + 0.5 + rng() * (L1 - L0 - 1), 0.114, LZ0 + 0.5 + rng() * (LZ1 - LZ0 - 1), 1, 1, 0.5 + rng(), rng() * 6);
    cracks.build(scene);
    const weeds = new Batch(own(new THREE.ConeGeometry(0.06, 0.22, 4)), lam(0x4a6a32), false);
    for (let i = 0; i < 40; i++) weeds.add(L0 + 0.3 + rng() * (L1 - L0 - 0.6), 0.2, LZ0 + 0.3 + rng() * (LZ1 - LZ0 - 0.6), 1, 0.6 + rng() * 0.8, 1, rng() * 3);
    weeds.build(scene);
    // Chain-link fence round the lot (not along the factory), with the opening for cars on the west side (kit).
    const gateW = new Set(FACTORY_LOT_GATE.filter(([x]) => x === FACTORY_LOT.x0).map(([, y]) => y));
    const gateE = new Set(FACTORY_LOT_GATE.filter(([x]) => x === FACTORY_LOT.x1).map(([, y]) => y));
    kit.fence(L0, LZ1 - 0.02, L1, LZ1 - 0.02, 'chain');
    kit.fence(L0 + 0.02, LZ0, L0 + 0.02, LZ1, 'chain', { skip: (i) => gateW.has(LZ0 + i) });
    kit.fence(L1 - 0.02, LZ0, L1 - 0.02, LZ1, 'chain', { skip: (i) => gateE.has(LZ0 + i) });
    // A lamp post in the lot, and a few old tyres and pallets.
    add(geoBox(0.08, 2.6, 0.08), lam(0x2b2b2e), L1 - 1.2, 1.3, LZ0 + 1.2);
    add(geoBox(0.3, 0.06, 0.2), lam(0xfff0c8, { emissive: 0xffe2a8, emissiveIntensity: 1.6 }), L1 - 1.4, 2.6, LZ0 + 1.2, false);
    for (const [x, z] of [[L0 + 2, LZ1 - 2.5], [L0 + 2.4, LZ1 - 2.2]]) add(own(new THREE.TorusGeometry(0.2, 0.08, 6, 12)), lam(0x1e1e22), x, 0.18, z).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) add(geoBox(0.9, 0.04, 0.12), lam(0x8a6a44), L1 - 2, 0.13, LZ1 - 3 + i * 0.2, false);
  }

  // ---------- the Bank (Financial district, F-005) ----------
  // A stone bank: pale walls, a row of columns along the front under a pediment with "BANK" on it, steps up to two big
  // open doors. Inside (the walls fade, the roof lifts): a marble floor, a long wooden counter with a glass screen (the
  // bankers stand behind it), a round steel vault door in the back wall, brass lamps.
  {
    const X0 = BANK.x0;
    const X1 = BANK.x1 + 1;
    const Z0 = BANK.y0;
    const Z1 = BANK.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const HT = 3.0;
    const t = 0.2;
    const stone = lam(0xd8d0c0);
    const stoneDark = lam(0xb0a898);
    add(geoBox(X1 - X0 + 0.6, 0.09, Z1 - Z0 + 1.6), stoneDark, cx, 0.045, cz + 0.5, false);
    // Marble floor.
    const marble = own(
      canvasTex(64, 64, (g) => {
        g.fillStyle = '#e8e2d6';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#c8c0b0';
        g.fillRect(0, 0, 32, 32);
        g.fillRect(32, 32, 32, 32);
      }),
    );
    marble.repeat.set((X1 - X0) / 2, (Z1 - Z0) / 2);
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.3, Z1 - Z0 - 0.3)), lam(0xffffff, { map: marble }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.1, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    const [d0] = BANK_DOOR[0];
    const d1 = BANK_DOOR[BANK_DOOR.length - 1][0] + 1;
    const br = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const walls = kit.walls(br, HT, t, stone, { s: [{ u0: d0 - X0, u1: d1 - X0, top: 2.1 }] });
    const props: THREE.Object3D[] = [];
    // Tall windows along the sides and the back (kit), warm light inside.
    for (const side of ['e', 'w', 'n'] as const) {
      const f = face(br, side);
      props.push(...kit.windowRow(f, 0.8, f.len - 0.8, 0.7, 2, { style: 'office', w: 0.7, h: 1.4, lit: true, glow: 0xffe2b0, frame: 0xb0a898 }));
    }
    // Roof, cornice, the pediment over the entrance with BANK on it, columns, steps.
    props.push(add(geoBox(X1 - X0 + 0.3, 0.2, Z1 - Z0 + 0.3), stoneDark, cx, HT + 0.1, cz));
    const ped = new THREE.Shape();
    ped.moveTo(-3, 0);
    ped.lineTo(3, 0);
    ped.lineTo(0, 1.1);
    ped.closePath();
    const pedGeo = own(new THREE.ExtrudeGeometry(ped, { depth: 0.3, bevelEnabled: false }));
    props.push(add(pedGeo, stone, cx, HT + 0.2, Z1 + 0.6));
    props.push(add(geoBox(6.4, 0.25, 1.2), stoneDark, cx, HT + 0.08, Z1 + 0.35));
    const sign = add(own(new THREE.PlaneGeometry(2.2, 0.5)), own(new THREE.MeshBasicMaterial({ map: own(signTexture('BANK', '#d8d0c0', '#2a2620')) })), cx, HT - 0.35, Z1 + 0.92, false);
    props.push(sign);
    for (let i = 0; i < 6; i++) {
      const x = cx - 2.5 + i * 1.0;
      if (x > d0 - 0.2 && x < d1 + 0.2) continue; // not in front of the doors
      props.push(add(own(new THREE.CylinderGeometry(0.14, 0.16, HT - 0.1, 12)), stone, x, (HT - 0.1) / 2 + 0.1, Z1 + 0.85));
    }
    for (let i = 0; i < 3; i++) add(geoBox(6.2 - i * 0.4, 0.06, 0.35), stoneDark, cx, 0.09 + i * 0.06, Z1 + 1.35 - i * 0.3, false);
    // The doors, swung open, and brass handles.
    for (const [x, r] of [[d0 + 0.2, 1.2], [d1 - 0.2, -1.2]] as const) {
      const d = add(geoBox(0.9, 1.9, 0.06), lam(0x5a3a22), x, 1.0, Z1 - 0.3, false);
      d.rotation.y = r;
    }
    // Inside: the counter with a glass screen, the vault door, lamps.
    const wood = lam(0x6a4426);
    const counter = FIXTURES.filter((f) => f.kind === 'bankcounter');
    if (counter.length) {
      const cx0 = Math.min(...counter.map((f) => f.x));
      const cx1 = Math.max(...counter.map((f) => f.x)) + 1;
      const czz = counter[0].y + 0.5;
      add(geoBox(cx1 - cx0, 0.75, 0.6), wood, (cx0 + cx1) / 2, 0.45, czz);
      add(geoBox(cx1 - cx0 + 0.04, 0.05, 0.66), lam(0xd8c8a8), (cx0 + cx1) / 2, 0.84, czz);
      add(geoBox(cx1 - cx0, 0.55, 0.03), lam(0xc8e0e8, { transparent: true, opacity: 0.35 }), (cx0 + cx1) / 2, 1.15, czz - 0.2, false);
      for (let x = cx0; x <= cx1; x += 1) add(geoBox(0.04, 0.6, 0.04), lam(0xc8a04a), x, 1.15, czz - 0.2, false);
    }
    const vault = FIXTURES.filter((f) => f.kind === 'vault');
    if (vault.length) {
      const vx = (Math.min(...vault.map((f) => f.x)) + Math.max(...vault.map((f) => f.x)) + 1) / 2;
      const door = add(own(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 12)), lam(0x8a8f96), vx, 1.1, Z0 + t + 0.08);
      door.rotation.x = Math.PI / 2;
      const wheel = add(own(new THREE.TorusGeometry(0.3, 0.04, 6, 10)), lam(0xc8a04a), vx, 1.1, Z0 + t + 0.2, false);
      wheel.rotation.x = 0;
      for (let i = 0; i < 3; i++) add(geoBox(0.6, 0.04, 0.04), lam(0xc8a04a), vx, 1.1, Z0 + t + 0.2, false).rotation.z = (i * Math.PI) / 3;
    }
    for (const x of [X0 + 2.5, X1 - 2.5]) add(geoBox(0.3, 0.12, 0.3), lam(0xfff0c8, { emissive: 0xffe2a8, emissiveIntensity: 1.4 }), x, HT - 0.4, cz, false);
    const light = new THREE.PointLight(0xfff0d8, 7, 11, 1.3);
    light.position.set(cx, HT - 0.6, cz);
    scene.add(light);
    const fade: Fadeable = { walls, mats: [stone], props, opacity: 1 };
    fadeables.push(fade);
    rooms.set(BANK.id, fade);
  }


  // ---------- v0.43: Hotline Plumbing & Heating, the Junkyard, the Biker Club (the Industrial zone) ----------
  const brickMat = (across: number, color: number) => {
    const t = own(brickTex.clone());
    t.repeat.set(across, 2);
    t.needsUpdate = true;
    return lam(color, { map: t });
  };

  // Hotline: a long two-tone workshop (brick below, cream render above), its front on the WEST side: a big sign, a
  // roll-up door for the vans, an office door, pipes stacked against the wall. Its yard behind it has a half-high brick
  // wall with one opening on the east, stacks of old pipe and copper coils lying around (the dumpsters are spots).
  {
    const X0 = HOTLINE.x0;
    const X1 = HOTLINE.x1 + 1;
    const Z0 = HOTLINE.y0;
    const Z1 = HOTLINE.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const HT = 2.4;
    add(geoBox(X1 - X0 + 0.4, 0.06, Z1 - Z0 + 0.4), pavement, cx, 0.03, cz, false);
    const mBrick = brickMat(Z1 - Z0, 0x7a4a3a);
    const mRender = lam(0xd8ceb4);
    const walls = [add(geoBox(X1 - X0, 1.2, Z1 - Z0), mBrick, cx, 0.6, cz), add(geoBox(X1 - X0, HT - 1.2, Z1 - Z0), mRender, cx, 1.2 + (HT - 1.2) / 2, cz)];
    const hr = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const props: THREE.Object3D[] = [kit.roof(hr, HT, 0x3a3d42, 0.1, 0.12)];
    props.push(add(geoBox(1.2, 0.5, 0.8), lam(0xb8bcc2), cx + 0.5, HT + 0.35, Z0 + 2)); // a boiler flue box on the roof
    props.push(...kit.vent(cx - 1, HT + 0.12, Z1 - 2, 0.12, 1.0, 0x8a8f96));
    // The front faces WEST (kit): the sign on its board, the roll-up door for the vans, an office door with a bulb,
    // windows in the cream upper half down both long sides.
    const fw = face(hr, 'w');
    const fx = X0 - 0.01;
    const sign = kit.sign(fw, uOf(fw, cz), 1.95, { text: 'HOTLINE PLUMBING & HEATING', bg: '#1e4a7a', fg: '#f2e8d0', w: 4.2, h: 0.7, board: 0x1a2a3e });
    kit.door(fw, uOf(fw, cz + 2.2), { style: 'shutter', w: 2.0, h: 1.45, color: 0xa8adb4 });
    kit.door(fw, uOf(fw, cz - 1.0), { style: 'office', w: 0.8, h: 1.25, color: 0x2e5f8a, light: 'bulb' });
    for (const side of ['n', 's'] as const) props.push(...kit.windowRow(face(hr, side), 0.6, X1 - X0 - 0.6, 1.3, 1.5, { style: 'office', w: 0.7, h: 0.5, frame: 0x6a6a62, litChance: 0.5, rng: brng }));
    add(own(new THREE.ConeGeometry(0.16, 0.42, 6)), lam(0xe8641e, { emissive: 0x8a3010, emissiveIntensity: 0.6 }), fx - 0.1, 1.95, cz - 2.4, false);
    // Copper pipes stacked against the front wall, and a bare bulb over the office door.
    const copper = lam(0xc07040);
    for (let i = 0; i < 6; i++) {
      const pipe = add(own(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8)), copper, fx - 0.25 - (i % 3) * 0.1, 0.06 + Math.floor(i / 3) * 0.1, cz - 3.6 + (i % 3) * 0.12, false);
      pipe.rotation.x = Math.PI / 2;
    }
    // v0.60: offices on top (one storey).
    const flats = apartments({ x0: X0, z0: Z0, x1: X1, z1: Z1 }, HT + 0.12, 1, 0x7a4a3a, 0x5a3a2a);
    const fade: Fadeable = {
      walls, mats: [mBrick, mRender], props: [...props, ...sign, ...flats], opacity: 1,
      cut: { height: HT + 0.12 + FLOOR, keep: HT, center: new THREE.Vector3(cx, 0, cz), upper: flats, on: false },
    };
    fadeables.push(fade);

    // The yard: cracked concrete, a half-high brick wall with a coping, one opening on the east.
    const Y0 = HOTLINE_YARD.x0;
    const Y1 = HOTLINE_YARD.x1 + 1;
    const ycx = (Y0 + Y1) / 2;
    add(geoBox(Y1 - Y0, 0.12, Z1 - Z0), lam(0x5f5c56), ycx, 0.06, cz, false);
    // A half-high brick wall with a coping round the yard (kit), one opening on the east.
    const g0 = HOTLINE_GATE[0][1];
    const g1 = HOTLINE_GATE[HOTLINE_GATE.length - 1][1] + 1;
    kit.fence(Y0, Z0 + 0.1, Y1, Z0 + 0.1, 'halfBrick');
    kit.fence(Y0, Z1 - 0.1, Y1, Z1 - 0.1, 'halfBrick');
    kit.fence(Y1 - 0.1, Z0, Y1 - 0.1, Z1, 'halfBrick', { skip: (i) => Z0 + i >= g0 && Z0 + i < g1 });
    // Copper coils and loose bits of pipe on the ground, a back door into the store.
    for (let i = 0; i < 5; i++) {
      const coil = add(own(new THREE.TorusGeometry(0.18, 0.04, 6, 10)), copper, Y0 + 1 + rng() * 3, 0.06, Z0 + 2 + rng() * 6, false);
      coil.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 8; i++) {
      const bit = add(own(new THREE.CylinderGeometry(0.03, 0.03, 0.3 + rng() * 0.4, 6)), copper, Y0 + 0.6 + rng() * 3.8, 0.04, Z0 + 0.6 + rng() * 8.8, false);
      bit.rotation.z = Math.PI / 2;
      bit.rotation.y = rng() * 3;
    }
    const fe = face(hr, 'e');
    kit.door(fe, uOf(fe, cz + 0.5), { w: 0.75, h: 1.2, color: 0x2e5f8a, light: 'bulb' });
  }
  // Stacks of old pipe (fixtures) in the yard.
  for (const f of FIXTURES) {
    if (f.kind !== 'pipes') continue;
    for (let i = 0; i < 9; i++) {
      const pipe = add(own(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8)), lam(i % 3 === 0 ? 0xc07040 : 0x8a8f96), f.x + 0.5, 0.08 + Math.floor(i / 3) * 0.13, f.y + 0.25 + (i % 3) * 0.17, i < 3);
      pipe.rotation.z = Math.PI / 2;
    }
  }

  // The Junkyard: packed dirt with oil stains, a tall corrugated fence with one gate (east), stacks of crushed cars,
  // piles of tyres, an old crane, a dog house with a chain.
  {
    const X0 = JUNKYARD.x0;
    const X1 = JUNKYARD.x1 + 1;
    const Z0 = JUNKYARD.y0;
    const Z1 = JUNKYARD.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    // (A bit higher than the block's pavement, so the two don't flicker through each other.)
    add(geoBox(X1 - X0, 0.12, Z1 - Z0), lam(0x5a4a38), cx, 0.06, cz, false);
    for (let i = 0; i < 9; i++) {
      const oil = add(own(new THREE.CircleGeometry(0.2 + rng() * 0.35, 8)), lam(0x2a2620), X0 + 1 + rng() * 8, 0.125, Z0 + 1 + rng() * 8, false);
      oil.rotation.x = -Math.PI / 2;
    }
    // A tall corrugated fence all round (kit; every fourth sheet rusty), with the gate on the east.
    kit.fence(X0, Z0 + 0.03, X1, Z0 + 0.03, 'corrugated', { rng });
    kit.fence(X0, Z1 - 0.03, X1, Z1 - 0.03, 'corrugated', { rng });
    kit.fence(X0 + 0.03, Z0, X0 + 0.03, Z1, 'corrugated', { rng });
    kit.fence(X1 - 0.03, Z0, X1 - 0.03, Z1, 'corrugated', { rng, skip: (i) => JUNKYARD_GATE.some(([, gz]) => gz === Z0 + i) });
    // The gate: two chain-link leaves swung all the way open, flat against the fence outside, and a "BEWARE OF THE DOG"
    // sign on the fence next to it.
    const g0 = JUNKYARD_GATE[0][1];
    const g1 = JUNKYARD_GATE[JUNKYARD_GATE.length - 1][1] + 1;
    const link = own(
      canvasTex(32, 32, (g) => {
        g.clearRect(0, 0, 32, 32);
        g.strokeStyle = '#b8bcc2';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 16); g.lineTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.closePath();
        g.stroke();
      }),
    );
    link.repeat.set(4, 6);
    const linkM = own(new THREE.MeshBasicMaterial({ map: link, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    for (const z of [g0 - 0.5, g1 + 0.5]) {
      const leaf = add(own(new THREE.PlaneGeometry(1.0, 1.5)), linkM, X1 + 0.12, 0.78, z, false);
      leaf.rotation.y = Math.PI / 2;
      for (const dz of [-0.5, 0.5]) add(geoBox(0.05, 1.55, 0.05), lam(0x6a6e74), X1 + 0.12, 0.78, z + dz, false); // its frame
    }
    for (const z of [g0, g1]) add(geoBox(0.12, 1.9, 0.12), lam(0x4a4e54), X1 - 0.03, 0.95, z); // the gate posts
    const beware = add(own(new THREE.PlaneGeometry(1.0, 0.45)), own(new THREE.MeshBasicMaterial({ map: own(signTexture('BEWARE OF THE DOG', '#e8c040', '#1a1a1a')) })), X1 + 0.04, 1.2, g0 - 1.7, false);
    beware.rotation.y = Math.PI / 2;
  }
  {
    const carColors = [0x8a2f28, 0x2f4562, 0x9a7a2e, 0x35553a, 0x6a6e74, 0x6a4526];
    for (const f of FIXTURES) {
      const x = f.x + 0.5;
      const z = f.y + 0.5;
      if (f.kind === 'lottruck' || f.kind === 'pallets') continue; // (models, below)
      if (f.kind === 'wreck') {
        // Two or three crushed cars stacked up, each a flattened slab in a faded colour.
        const n = 2 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const car = add(geoBox(0.92, 0.3, 0.7), lam(carColors[Math.floor(rng() * carColors.length)], { flatShading: true }), x + (rng() - 0.5) * 0.08, 0.16 + k * 0.31, z, k === n - 1);
          car.rotation.y = (rng() - 0.5) * 0.3;
          add(geoBox(0.5, 0.08, 0.6), lam(0x1e2226), x, 0.33 + k * 0.31, z, false).rotation.y = car.rotation.y; // squashed windows
        }
      } else if (f.kind === 'tyres') {
        for (let k = 0; k < 4; k++) {
          const t = add(own(new THREE.TorusGeometry(0.28, 0.11, 6, 12)), lam(0x1a1a1e), x + (k === 3 ? 0.1 : 0), 0.11 + k * 0.2, z + (k === 3 ? -0.1 : 0), k === 3);
          t.rotation.x = -Math.PI / 2;
        }
      } else if (f.kind === 'doghouse') {
        add(geoBox(0.8, 0.55, 0.7), lam(0x6a4a2e), x, 0.3, z);
        const roof = add(own(new THREE.ConeGeometry(0.62, 0.4, 4)), lam(0x8a2f28, { flatShading: true }), x, 0.77, z);
        roof.rotation.y = Math.PI / 4;
        add(geoBox(0.32, 0.36, 0.02), lam(0x141210), x, 0.2, z + 0.36, false);
        add(own(new THREE.CylinderGeometry(0.15, 0.13, 0.08, 10)), lam(0x8a8f96), x + 0.6, 0.05, z + 0.4, false); // the food bowl
      }
    }
    // v0.45: two old trucks among the wrecks (Kenney's Retro Urban Kit): one rusting on its side by the north fence, one
    // sunk on flat tyres in the middle, each over its two tiles.
    const pairs = (kind: string) => {
      const tiles = FIXTURES.filter((f) => f.kind === kind);
      const out: { x: number; z: number }[] = [];
      for (const f of tiles) if (!tiles.some((g) => g.x === f.x - 1 && g.y === f.y)) out.push({ x: f.x + 1, z: f.y + 0.5 });
      return out;
    };
    pairs('junktruck').forEach((p, i) => {
      const t = withModel(i ? 'urban/truck-green.glb' : 'urban/truck-grey.glb', i ? { scale: 1.25, rot: Math.PI / 2 + 0.15, tiltZ: 0.05, tone: 'grimy' } : { scale: 1.25, rot: Math.PI / 2 - 0.1, tiltX: 0.06, tone: 'grimy' });
      t.position.set(p.x, 0.1, p.z);
      scene.add(t);
    });
    // Pallets, planks, broken barriers and loose bricks lying around (on solid tiles, so nobody walks through them).
    for (const [file, kind, dx, dz, rot] of [
      ['urban/pallet.glb', 'tyres', 0.0, -0.35, 0.3], ['urban/planks.glb', 'wreck', 0.1, -0.45, 1.2], ['urban/detail-barrier-strong-damaged.glb', 'wreck', 0.0, -0.5, 0.2],
    ] as const) {
      const f = FIXTURES.find((x) => x.kind === kind && inRect(JUNKYARD, x.x, x.y) && x.y === JUNKYARD.y1);
      if (!f) continue;
      const m = withModel(file, { scale: 0.8, rot, tone: 'grimy' });
      m.position.set(f.x + 0.5 + dx, 0.1, f.y + 0.5 + dz);
      scene.add(m);
    }
    // The crane: one model on its four tiles (a cab on tracks, a lattice boom up and over, a hook).
    const crane = FIXTURES.filter((f) => f.kind === 'crane');
    if (crane.length) {
      const x = (Math.min(...crane.map((f) => f.x)) + Math.max(...crane.map((f) => f.x)) + 1) / 2;
      const z = (Math.min(...crane.map((f) => f.y)) + Math.max(...crane.map((f) => f.y)) + 1) / 2;
      const yellow = lam(0xd8a02a, { flatShading: true });
      for (const dz of [-0.6, 0.6]) add(geoBox(1.8, 0.35, 0.4), lam(0x2a2a2e), x, 0.18, z + dz);
      add(geoBox(1.3, 0.9, 1.1), yellow, x, 0.8, z);
      add(geoBox(0.5, 0.45, 0.04), lam(0x2a3a46), x + 0.3, 1.0, z + 0.56, false);
      const boom = add(geoBox(0.22, 3.6, 0.22), yellow, x - 0.6, 2.4, z);
      boom.rotation.z = 0.55;
      const tip = new THREE.Vector3(x - 0.6 - Math.sin(0.55) * 1.8, 2.4 + Math.cos(0.55) * 1.8, z);
      add(geoBox(0.02, 1.6, 0.02), lam(0x1a1a1e), tip.x, tip.y - 0.8, z, false);
      add(geoBox(0.2, 0.25, 0.08), lam(0x3a3d42), tip.x, tip.y - 1.7, z, false);
    }
  }

  // The Factory's parking lot (v0.45): a cargo truck parked by the hall, and a stack of pallets in the far corner.
  {
    const lt = FIXTURES.filter((f) => f.kind === 'lottruck');
    if (lt.length) {
      const t = withModel('urban/truck-grey.glb', { scale: 1.3, rot: -Math.PI / 2, tone: 'grimy' });
      t.position.set((Math.min(...lt.map((f) => f.x)) + Math.max(...lt.map((f) => f.x)) + 1) / 2, 0.04, lt[0].y + 0.5);
      scene.add(t);
    }
    FIXTURES.filter((f) => f.kind === 'pallets').forEach((f, i) => {
      for (let k = 0; k < 3 - i; k++) {
        const m = withModel('urban/pallet.glb', { scale: 0.85, y: k * 0.13, rot: k * 0.15, tone: 'grimy' });
        m.position.set(f.x + 0.5, 0.04, f.y + 0.5);
        scene.add(m);
      }
    });
  }

  // Iron Saints MC: a low dark-brick bar facing NORTH, a red-and-blue neon sign, blacked-out windows, motorbikes on the
  // sidewalk. Inside (the walls fade): a dark wooden floor, the bar along the back with lit bottles, a pool table with a
  // green felt, a table, a jukebox glowing in the corner; one red light.
  const bikes: THREE.Object3D[] = [];
  {
    const X0 = CLUB.x0;
    const X1 = CLUB.x1 + 1;
    const Z0 = CLUB.y0;
    const Z1 = CLUB.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const HT = 2.3;
    const t = 0.2;
    const mBrick = brickMat(X1 - X0, 0x3e3430);
    add(geoBox(X1 - X0 + 0.3, 0.06, Z1 - Z0 + 0.3), pavement, cx, 0.03, cz, false);
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.3, Z1 - Z0 - 0.3)), lam(0x3a2a1e));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.08, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    const d0 = CLUB_DOOR[0][0];
    const d1 = CLUB_DOOR[CLUB_DOOR.length - 1][0] + 1;
    const cr = { x0: X0, z0: Z0, x1: X1, z1: Z1 };
    const fn = face(cr, 'n');
    const walls = kit.walls(cr, HT, t, mBrick, { n: [{ u0: X1 - d1, u1: X1 - d0, top: 1.9 }] });
    const props: THREE.Object3D[] = [kit.roof(cr, HT, 0x24262a, 0.1, 0.14)];
    // The front (north): the neon sign over the door, two blacked-out windows with neon beer signs, a red door light.
    const fz = Z0 - 0.02;
    const neonTex = own(
      canvasTex(512, 128, (g) => {
        g.fillStyle = '#0a0a0e';
        g.fillRect(0, 0, 512, 128);
        g.font = 'bold 64px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#ff2a4a';
        g.shadowBlur = 18;
        g.strokeStyle = '#ff5a7a';
        g.lineWidth = 5;
        g.strokeText('IRON SAINTS', 256, 52);
        g.fillStyle = '#ffd0d8';
        g.fillText('IRON SAINTS', 256, 52);
        g.shadowColor = '#3ab0ff';
        g.font = 'bold 34px sans-serif';
        g.fillStyle = '#c8ecff';
        g.fillText('— M C —', 256, 104);
      }, false),
    );
    // The sign sits above the door (it reaches a little over the roof line, in front of the roof's overhang which cut
    // across the letters), clear of the door and its light.
    props.push(...kit.sign(fn, uOf(fn, cx), 2.4, { tex: neonTex, w: 3.6, h: 0.9, board: 0x141418, out: 0.13 }));
    for (const x of [X0 + 1.6, X1 - 1.6]) {
      kit.window(fn, uOf(fn, x), 0.8, { style: 'blacked', w: 1.4, h: 0.8, frame: 0x141418, sill: false });
      const beer = add(own(new THREE.PlaneGeometry(0.6, 0.25)), own(new THREE.MeshBasicMaterial({ map: own(signTexture('BEER', '#101014', '#ffb040')) })), x, 1.25, fz - 0.04, false);
      beer.rotation.y = Math.PI;
    }
    kit.wallLight(fn, uOf(fn, d1 + 0.3), 1.6, 0xff3030); // a red light beside the door
    kit.door(fn, uOf(fn, (d0 + d1) / 2), { style: 'frame', w: d1 - d0, h: 1.9, frame: 0x141418 });
    // The neon spills red onto the sidewalk.
    const glow = new THREE.PointLight(0xff3a5a, 5, 6, 1.5);
    glow.position.set(cx, 1.6, Z0 - 1.2);
    scene.add(glow);
    // Inside: the bar along the back with bottles, the pool table, a table, the jukebox; one red light.
    const wood = lam(0x4a2e1e);
    const bar = FIXTURES.filter((f) => f.kind === 'clubbar');
    if (bar.length) {
      const bx0 = Math.min(...bar.map((f) => f.x));
      const bx1 = Math.max(...bar.map((f) => f.x)) + 1;
      add(geoBox(bx1 - bx0, 0.75, 0.55), wood, (bx0 + bx1) / 2, 0.45, bar[0].y + 0.3);
      add(geoBox(bx1 - bx0 + 0.04, 0.05, 0.6), lam(0x2a1a12), (bx0 + bx1) / 2, 0.84, bar[0].y + 0.3);
      for (let k = 0; k < 14; k++)
        add(geoBox(0.07, 0.25, 0.07), lam([0x2a6a3a, 0x8a5a2a, 0xc8c8b8, 0x6a2a2a][k % 4], { emissive: 0x2a1a0a, emissiveIntensity: 0.6 }), bx0 + 0.2 + k * ((bx1 - bx0 - 0.4) / 13), 1.35, Z1 - t - 0.12, false);
      add(geoBox(bx1 - bx0, 0.04, 0.2), wood, (bx0 + bx1) / 2, 1.2, Z1 - t - 0.1, false);
      // v0.45: bar stools along the counter, bottles and glasses on it, an old TV over the bar.
      for (let x = bx0 + 0.5; x < bx1; x += 1.25) {
        const st = withModel('furniture/stoolBar.glb', { tone: 'dark', scale: 1.5, x: -0.2, z: 0.17 });
        st.position.set(x, 0.08, bar[0].y - 0.3);
        scene.add(st);
      }
      [['food/soda-bottle.glb', 0.6], ['food/wine-white.glb', 1.9], ['food/glass.glb', 2.6], ['food/wine-red.glb', 3.7]].forEach(([file, dx]) => {
        const m = withModel(file as string, { tone: 'dull', scale: 0.4 });
        m.position.set(bx0 + (dx as number), 0.87, bar[0].y + 0.3);
        scene.add(m);
      });
      const tv = withModel('furniture/televisionVintage.glb', { tone: 'dull', scale: 1.4, rot: Math.PI, x: 0.29 });
      tv.position.set((bx0 + bx1) / 2, 1.27, Z1 - t - 0.04);
      props.push(tv);
      scene.add(tv);
    }
    const pool = FIXTURES.filter((f) => f.kind === 'pool' && inRect(CLUB, f.x, f.y)); // (v0.58: the bar has one too)
    if (pool.length) {
      const px = (Math.min(...pool.map((f) => f.x)) + Math.max(...pool.map((f) => f.x)) + 1) / 2;
      const pz = pool[0].y + 0.5;
      add(geoBox(1.8, 0.5, 0.95), wood, px, 0.3, pz);
      add(geoBox(1.6, 0.04, 0.78), lam(0x1e6a3a), px, 0.57, pz, false);
      for (const [dx, c] of [[-0.3, 0xe8e8e0], [0.2, 0xd83a2a], [0.35, 0xe8c040], [0.27, 0x2a4ad8]] as const)
        add(own(new THREE.SphereGeometry(0.04, 8, 6)), lam(c), px + dx, 0.62, pz + (dx * 0.7) % 0.3, false);
      const cue = add(geoBox(1.3, 0.025, 0.025), lam(0xc8a06a), px + 0.1, 0.62, pz + 0.3, false);
      cue.rotation.y = 0.2;
    }
    for (const f of FIXTURES) {
      if (f.kind === 'clubtable') {
        // v0.45: a round table with two bar stools (Kenney's Furniture Kit, darkened), a bottle and a glass on it.
        const tb = withModel('furniture/tableRound.glb', { tone: 'dark', scale: 1.4, x: -0.48, y: 0.38, z: 0.56 });
        tb.position.set(f.x + 0.5, 0.08, f.y + 0.5);
        scene.add(tb);
        for (const [dx, dz] of [[-0.45, 0.35], [0.4, -0.4]]) {
          const st = withModel('furniture/stoolBar.glb', { tone: 'dark', scale: 1.5, x: -0.2, z: 0.17 });
          st.position.set(f.x + 0.5 + dx, 0.08, f.y + 0.5 + dz);
          scene.add(st);
        }
        const bottle = withModel('food/wine-red.glb', { tone: 'dull', scale: 0.4 });
        bottle.position.set(f.x + 0.45, 0.6, f.y + 0.45);
        scene.add(bottle);
      } else if (f.kind === 'clubjuke') {
        add(geoBox(0.7, 1.15, 0.5), lam(0x6a2a4a), f.x + 0.5, 0.58, f.y + 0.6);
        add(own(new THREE.CylinderGeometry(0.33, 0.33, 0.52, 8, 1, false, 0, Math.PI)), lam(0xffb040, { emissive: 0xff7a20, emissiveIntensity: 1.2 }), f.x + 0.5, 1.15, f.y + 0.6, false).rotation.z = Math.PI / 2;
      }
    }
    const red = new THREE.PointLight(0xff4040, 4, 8, 1.4);
    red.position.set(cx, HT - 0.4, cz);
    scene.add(red);
    // v0.60: the club's rooms upstairs (one storey).
    const flats = apartments({ x0: X0, z0: Z0, x1: X1, z1: Z1 }, HT + 0.12, 1, 0x3e3430, 0x1e1a18);
    const fade: Fadeable = {
      walls, mats: [mBrick], props: [...props, ...flats], opacity: 1,
      cut: { height: HT + 0.12 + FLOOR, keep: HT, center: new THREE.Vector3(cx, 0, cz), upper: flats, on: false },
    };
    fadeables.push(fade);
    rooms.set(CLUB.id, fade);
  }
  // Motorbikes parked on the sidewalk in front of the club (chrome, black tanks, high bars).
  for (const f of FIXTURES) {
    if (f.kind !== 'motorbike') continue;
    const g = new THREE.Group();
    const black = lam(0x1a1a1e);
    const chrome = lam(0xc8ccd2);
    for (const dz of [-0.38, 0.38]) {
      const w = new THREE.Mesh(own(new THREE.TorusGeometry(0.2, 0.06, 6, 10)), black);
      w.rotation.y = Math.PI / 2;
      w.position.set(0, 0.24, dz);
      g.add(w);
    }
    const body = new THREE.Mesh(geoBox(0.16, 0.18, 0.62), black);
    body.position.set(0, 0.45, 0);
    g.add(body);
    const tank = new THREE.Mesh(geoBox(0.2, 0.14, 0.26), lam([0x8a1a1a, 0x1a1a1e, 0x2a3a6a, 0x5a5a5a][bikes.length % 4]));
    tank.position.set(0, 0.6, -0.08);
    g.add(tank);
    const seat = new THREE.Mesh(geoBox(0.18, 0.06, 0.3), lam(0x3a2a1e));
    seat.position.set(0, 0.58, 0.2);
    g.add(seat);
    const fork = new THREE.Mesh(geoBox(0.04, 0.5, 0.04), chrome);
    fork.position.set(0, 0.5, -0.38);
    fork.rotation.x = -0.4;
    g.add(fork);
    const bars = new THREE.Mesh(geoBox(0.5, 0.03, 0.03), chrome);
    bars.position.set(0, 0.82, -0.32);
    g.add(bars);
    const pipe = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6)), chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0.12, 0.25, 0.1);
    g.add(pipe);
    g.position.set(f.x + 0.5, 0, f.y + 0.5);
    g.rotation.z = 0.12; // leaning on its stand
    g.rotation.y = (bikes.length % 2 ? 0.25 : -0.25);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    scene.add(g);
    bikes.push(g);
  }

  // ---------- the pothole and the sewer under the city (rats; docs/design.md §12) ----------
  // On the street: an open manhole in the crossing, broken asphalt round it, the cover lying next to it, two cones.
  // Below (SEWER_DEPTH down, where the camera follows you): a cut-away sewer like a model: grimy brick walls with moss,
  // pipes and two lanterns, a walkway each side of a channel of green sewage, two grate bridges, the ladder up to a
  // shaft of street light, the tunnel's dark arch at the east end, crates and rubbish bags.
  const links: THREE.Object3D[] = [];
  let gate: THREE.Group | null = null;
  {
    const hole = new THREE.Group();
    const hx = MANHOLE[0] + 0.5;
    const hz = MANHOLE[1] + 0.5;
    const iron = lam(0x2e3034);
    const black = new THREE.Mesh(own(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12)), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    black.position.set(hx, 0.012, hz);
    hole.add(black);
    const rim = new THREE.Mesh(own(new THREE.TorusGeometry(0.42, 0.05, 6, 12)), iron);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(hx, 0.03, hz);
    hole.add(rim);
    // The ladder's top rungs just showing in the hole.
    for (const dx of [-0.15, 0.15]) {
      const rail = new THREE.Mesh(geoBox(0.04, 0.16, 0.04), iron);
      rail.position.set(hx + dx, 0.0, hz - 0.3);
      hole.add(rail);
    }
    // Chunks of broken asphalt round the edge.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
      const chunk = new THREE.Mesh(geoBox(0.12 + rng() * 0.1, 0.04, 0.1 + rng() * 0.08), lam(0x2a2c30));
      chunk.position.set(hx + Math.cos(a) * 0.55, 0.02, hz + Math.sin(a) * 0.55);
      chunk.rotation.set(rng() * 0.3, rng() * 3, rng() * 0.3);
      hole.add(chunk);
    }
    // The cover, pushed aside and tilted against the kerb of the hole.
    const cover = new THREE.Mesh(own(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 12)), lam(0x45474c));
    cover.position.set(hx + 0.75, 0.08, hz + 0.3);
    cover.rotation.set(0.25, 0, 0.15);
    hole.add(cover);
    // Two traffic cones.
    for (const [dx, dz] of [[-0.6, 0.55], [0.55, -0.6]]) {
      const cone = new THREE.Mesh(own(new THREE.ConeGeometry(0.12, 0.38, 10)), lam(0xe8641e));
      cone.position.set(hx + dx, 0.21, hz + dz);
      cone.castShadow = true;
      hole.add(cone);
      const band = new THREE.Mesh(own(new THREE.CylinderGeometry(0.065, 0.085, 0.07, 10)), lam(0xf2f2ee));
      band.position.set(hx + dx, 0.22, hz + dz);
      hole.add(band);
      const foot = new THREE.Mesh(geoBox(0.28, 0.03, 0.28), lam(0x2a2a2a));
      foot.position.set(hx + dx, 0.015, hz + dz);
      hole.add(foot);
    }
    hole.traverse((o) => (o.userData.linkId = 'sewer_down'));
    scene.add(hole);
    links.push(hole);

    // --- the sewer ---
    const D = -SEWER_DEPTH;
    const X0 = SEWER.x0;
    const X1 = SEWER.x1 + 1;
    const Z0 = SEWER.y0;
    const Z1 = SEWER.y1 + 1;
    const cx = (X0 + X1) / 2;
    const CH0 = Z0 + SEWER_CHANNEL.y0;
    const CH1 = Z0 + SEWER_CHANNEL.y1 + 1;
    const WALL = 3.2;
    // Solid dark rock all round, so the edges look cut out of the ground.
    add(geoBox(X1 - X0 + 40, 0.2, Z1 - Z0 + 40), lam(0x0c0f0d), cx, D - 1.3, (Z0 + Z1) / 2, false);
    // Stone walkways (with joints), their edges a little darker.
    const slabTex = own(
      canvasTex(64, 64, (g) => {
        g.fillStyle = '#7a8078';
        g.fillRect(0, 0, 64, 64);
        g.strokeStyle = '#4a5048';
        g.lineWidth = 3;
        g.strokeRect(1, 1, 62, 62);
        g.fillStyle = 'rgba(60, 80, 50, 0.35)';
        g.fillRect(10, 40, 18, 10);
      }),
    );
    const walkway = (z0: number, z1: number) => {
      const t = own(slabTex.clone());
      t.repeat.set(X1 - X0, z1 - z0);
      t.needsUpdate = true;
      add(geoBox(X1 - X0, 1.2, z1 - z0), lam(0x9a9a90, { map: t }), cx, D - 0.6, (z0 + z1) / 2);
      // The kerb along the channel.
      add(geoBox(X1 - X0, 0.08, 0.16), lam(0x4a5048), cx, D + 0.02, z0 === Z0 ? z1 - 0.08 : z0 + 0.08, false);
    };
    walkway(Z0, CH0);
    walkway(CH1, Z1);
    // The channel: a dark bed, murky green sewage with a sheen, and floating muck.
    add(geoBox(X1 - X0, 0.2, CH1 - CH0), lam(0x1a2018), cx, D - 1.2, (CH0 + CH1) / 2, false);
    const sewage = new THREE.Mesh(
      own(new THREE.PlaneGeometry(X1 - X0, CH1 - CH0)),
      lam(0x3a5a34, { emissive: 0x12301a, emissiveIntensity: 0.7, transparent: true, opacity: 0.92 }),
    );
    sewage.rotation.x = -Math.PI / 2;
    sewage.position.set(cx, D - 0.55, (CH0 + CH1) / 2);
    sewage.receiveShadow = true;
    scene.add(sewage);
    for (let i = 0; i < 16; i++) {
      const muck = new THREE.Mesh(own(new THREE.CircleGeometry(0.12 + rng() * 0.18, 6)), lam(rng() < 0.5 ? 0x4f6a2a : 0x5a5236));
      muck.rotation.x = -Math.PI / 2;
      muck.position.set(X0 + 0.5 + rng() * (X1 - X0 - 1), D - 0.54, CH0 + 0.4 + rng() * (CH1 - CH0 - 0.8));
      scene.add(muck);
    }
    // The grate bridges, with a rail on each side.
    const grateTex = own(
      canvasTex(32, 32, (g) => {
        g.fillStyle = '#1a1c1e';
        g.fillRect(0, 0, 32, 32);
        g.fillStyle = '#6a7074';
        for (let i = 0; i < 4; i++) g.fillRect(i * 8, 0, 4, 32);
      }),
    );
    grateTex.repeat.set(2, 4);
    for (const b of SEWER_BRIDGES) {
      const bx = X0 + b + 1;
      add(geoBox(2, 0.1, CH1 - CH0), lam(0xffffff, { map: grateTex }), bx, D - 0.05, (CH0 + CH1) / 2);
      for (const side of [-1, 1]) {
        add(geoBox(0.05, 0.05, CH1 - CH0), lam(0x6a5a3a), bx + side * 0.97, D + 0.55, (CH0 + CH1) / 2, false);
        for (let k = 0; k <= 4; k++) add(geoBox(0.04, 0.55, 0.04), lam(0x6a5a3a), bx + side * 0.97, D + 0.28, CH0 + k, false);
      }
    }
    // Walls: grimy brick at the back (north) and both ends; the east one has the tunnel's arch over the channel.
    const brick = (across: number) => {
      const t = own(brickTex.clone());
      t.repeat.set(across, 2);
      t.needsUpdate = true;
      return lam(0x6e7466, { map: t });
    };
    add(geoBox(X1 - X0 + 0.6, WALL + 1.2, 0.3), brick(X1 - X0), cx, D + WALL / 2 - 0.6, Z0 - 0.15);
    add(geoBox(0.3, WALL + 1.2, Z1 - Z0), brick(Z1 - Z0), X0 - 0.15, D + WALL / 2 - 0.6, (Z0 + Z1) / 2);
    // (The east wall has a gap where the tunnel to the Rat Nest leaves the north walkway.)
    {
      const t0 = NEST_TUNNEL.y0;
      const t1 = NEST_TUNNEL.y1 + 1;
      add(geoBox(0.3, WALL + 1.2, t0 - Z0), brick(t0 - Z0), X1 + 0.15, D + WALL / 2 - 0.6, (Z0 + t0) / 2);
      add(geoBox(0.3, WALL + 1.2, Z1 - t1), brick(Z1 - t1), X1 + 0.15, D + WALL / 2 - 0.6, (t1 + Z1) / 2);
      add(geoBox(0.3, WALL - 1.9, t1 - t0), brick(1), X1 + 0.15, D + 1.9 + (WALL - 1.9) / 2 - 0.0, (t0 + t1) / 2);
    }
    {
      const ccz = (CH0 + CH1) / 2;
      const ring = new THREE.Mesh(own(new THREE.TorusGeometry(2.05, 0.28, 6, 12, Math.PI)), lam(0x7a7e72, { flatShading: true }));
      ring.rotation.y = -Math.PI / 2;
      ring.position.set(X1 - 0.02, D - 0.55, ccz);
      scene.add(ring);
      const dark = new THREE.Mesh(own(new THREE.CircleGeometry(1.95, 12, 0, Math.PI)), new THREE.MeshBasicMaterial({ color: 0x030403 }));
      dark.rotation.y = -Math.PI / 2;
      dark.position.set(X1 - 0.01, D - 0.55, ccz);
      scene.add(dark);
    }
    // Moss and slime streaks down the walls.
    // Moss and slime: thin streaks running down from the top, in a few dull greens, thicker near the pipes.
    const mossMats = [lam(0x2e4426), lam(0x34502a), lam(0x3a4a2a)];
    for (let i = 0; i < 46; i++) {
      const w = 0.08 + rng() * 0.3;
      const h = 0.3 + rng() * 1.5;
      add(geoBox(w, h, 0.02), mossMats[i % 3], X0 + 0.3 + rng() * (X1 - X0 - 0.6), D + WALL - 0.35 - h / 2, Z0 + 0.01 + (i % 3) * 0.002, false);
    }
    // Pipes: one long along the top of the back wall, a few coming down, two pouring into the channel.
    const rust = lam(0x7a4a2a);
    const pipeAlong = new THREE.Mesh(own(new THREE.CylinderGeometry(0.1, 0.1, X1 - X0, 10)), lam(0x4a5048));
    pipeAlong.rotation.z = Math.PI / 2;
    pipeAlong.position.set(cx, D + WALL - 0.4, Z0 + 0.15);
    scene.add(pipeAlong);
    for (const dx of [9, 14, 22]) add(own(new THREE.CylinderGeometry(0.08, 0.08, WALL - 0.4, 8)), rust, X0 + dx, D + (WALL - 0.4) / 2, Z0 + 0.15);
    for (const dx of [4, 13]) {
      const mouth = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10)), rust);
      mouth.rotation.x = Math.PI / 2;
      mouth.position.set(X0 + dx, D - 0.3, CH0 + 0.1);
      scene.add(mouth);
      add(geoBox(0.12, 0.3, 0.05), lam(0x4f6a2a, { emissive: 0x1a3010, emissiveIntensity: 0.6 }), X0 + dx, D - 0.45, CH0 + 0.28, false);
    }
    // Two lanterns on the back wall: the only warm light down here.
    for (const dx of [7, 18]) {
      add(geoBox(0.22, 0.3, 0.22), lam(0x2a2620), X0 + dx, D + 2.05, Z0 + 0.25);
      add(geoBox(0.16, 0.22, 0.16), lam(0xffd890, { emissive: 0xffc060, emissiveIntensity: 2 }), X0 + dx, D + 2.03, Z0 + 0.25, false);
      add(geoBox(0.04, 0.04, 0.3), lam(0x2a2620), X0 + dx, D + 2.25, Z0 + 0.12, false);
      const lamp = new THREE.PointLight(0xffc070, 8, 14, 1.3);
      lamp.position.set(X0 + dx, D + 2.1, Z0 + 2.2);
      scene.add(lamp);
    }
    // The ladder up to the street, with daylight (streetlight) falling down the shaft.
    {
      const lad = new THREE.Group();
      const lx = SEWER_LADDER[0] + 0.5;
      const lz = Z0 + 0.12;
      for (const dx of [-0.22, 0.22]) {
        const rail = new THREE.Mesh(geoBox(0.05, WALL + 0.4, 0.05), lam(0x8a8f96));
        rail.position.set(lx + dx, D + (WALL + 0.4) / 2, lz + 0.1);
        lad.add(rail);
      }
      for (let y = 0.3; y < WALL + 0.3; y += 0.3) {
        const rung = new THREE.Mesh(geoBox(0.44, 0.03, 0.03), lam(0x8a8f96));
        rung.position.set(lx, D + y, lz + 0.1);
        lad.add(rung);
      }
      // A box round the ladder you can tap easily.
      const tapBox = new THREE.Mesh(geoBox(0.9, WALL, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
      tapBox.position.set(lx, D + WALL / 2, lz + 0.3);
      lad.add(tapBox);
      // The top of the shaft: an iron grate with a little street light coming through.
      const shaft = new THREE.Mesh(geoBox(0.8, 0.06, 0.5), lam(0x6a6e5a, { map: grateTex, emissive: 0x6a6448, emissiveIntensity: 0.5 }));
      shaft.position.set(lx, D + WALL + 0.62, Z0 + 0.1);
      lad.add(shaft);
      lad.traverse((o) => (o.userData.linkId = 'sewer_up'));
      scene.add(lad);
      links.push(lad);
    }
    // Crates and rubbish bags (the walkways' fixtures), and some junk lying about.
    const wood = lam(0x6a4a2e);
    for (const f of FIXTURES) {
      if (f.kind === 'crate') {
        const c = add(geoBox(0.72, 0.6, 0.72), wood, f.x + 0.5, D + 0.3, f.y + 0.5);
        c.rotation.y = rng() * 0.5 - 0.25;
        add(geoBox(0.74, 0.06, 0.74), lam(0x4a3220), f.x + 0.5, D + 0.32, f.y + 0.5, false).rotation.y = c.rotation.y;
      } else if (f.kind === 'trash') {
        for (let i = 0; i < 3; i++) {
          const bag = add(own(new THREE.IcosahedronGeometry(0.22 + rng() * 0.06, 0)), lam(0x1e2022, { flatShading: true }), f.x + 0.3 + rng() * 0.4, D + 0.2, f.y + 0.3 + rng() * 0.4);
          bag.scale.y = 0.8;
        }
      }
    }

    // --- the tunnel and the Rat Nest (v0.43) ---
    // A low brick tunnel east from the north walkway, an iron gate in it (shut unless you unlocked it), then a dark round
    // chamber: puddles, bones, a mound of rubbish the giant rats live on, one sick green light.
    {
      const tx0 = NEST_TUNNEL.x0;
      const tx1 = NEST_TUNNEL.x1 + 1;
      const tz0 = NEST_TUNNEL.y0;
      const tz1 = NEST_TUNNEL.y1 + 1;
      const tcx = (tx0 + tx1) / 2;

      const slab = (x0: number, x1: number, z0: number, z1: number) => {
        const tex = own(slabTex.clone());
        tex.repeat.set(x1 - x0, z1 - z0);
        tex.needsUpdate = true;
        add(geoBox(x1 - x0, 1.2, z1 - z0), lam(0x7a7a70, { map: tex }), (x0 + x1) / 2, D - 0.6, (z0 + z1) / 2);
      };
      slab(tx0, tx1, tz0, tz1);
      const TW = 2.2;
      add(geoBox(tx1 - tx0, TW, 0.3), brick(tx1 - tx0), tcx, D + TW / 2, tz0 - 0.15);
      // (The south side is cut away low, like the sewer's model look, so you can see in from the camera.)
      add(geoBox(tx1 - tx0, 0.5, 0.3), brick(tx1 - tx0), tcx, D + 0.25, tz1 + 0.15);
      const NX0 = NEST.x0;
      const NX1 = NEST.x1 + 1;
      const NZ0 = NEST.y0;
      const NZ1 = NEST.y1 + 1;
      const ncx = (NX0 + NX1) / 2;
      const ncz = (NZ0 + NZ1) / 2;
      slab(NX0, NX1, NZ0, NZ1);
      add(geoBox(NX1 - NX0 + 0.6, WALL + 1.2, 0.3), brick(NX1 - NX0), ncx, D + WALL / 2 - 0.6, NZ0 - 0.15);
      add(geoBox(0.3, WALL + 1.2, NZ1 - NZ0), brick(NZ1 - NZ0), NX1 + 0.15, D + WALL / 2 - 0.6, ncz);
      add(geoBox(0.3, WALL + 1.2, tz0 - NZ0), brick(tz0 - NZ0), NX0 - 0.15, D + WALL / 2 - 0.6, (NZ0 + tz0) / 2);
      add(geoBox(0.3, WALL + 1.2, NZ1 - tz1), brick(NZ1 - tz1), NX0 - 0.15, D + WALL / 2 - 0.6, (tz1 + NZ1) / 2);
      // Puddles, bones and scraps.
      for (let i = 0; i < 6; i++) {
        const pud = add(own(new THREE.CircleGeometry(0.3 + rng() * 0.4, 8)), lam(0x2a3a24, { emissive: 0x0a1a08, emissiveIntensity: 0.5 }), NX0 + 0.8 + rng() * 8.4, D + 0.01, NZ0 + 0.8 + rng() * 6.4, false);
        pud.rotation.x = -Math.PI / 2;
      }
      const boneM = lam(0xd8d0b8);
      for (let i = 0; i < 16; i++) {
        const b = add(own(new THREE.CylinderGeometry(0.025, 0.025, 0.2 + rng() * 0.15, 5)), boneM, NX0 + 0.5 + rng() * 9, D + 0.03, NZ0 + 0.5 + rng() * 7, false);
        b.rotation.z = Math.PI / 2;
        b.rotation.y = rng() * 3;
      }
      for (let i = 0; i < 3; i++) add(own(new THREE.SphereGeometry(0.09, 6, 5)), boneM, NX0 + 1 + rng() * 8, D + 0.07, NZ0 + 1 + rng() * 6, false);
      // The mound: a heap of rubbish bags, rags and broken crates.
      const mound = FIXTURES.filter((f) => f.kind === 'mound');
      if (mound.length) {
        const mx = (Math.min(...mound.map((f) => f.x)) + Math.max(...mound.map((f) => f.x)) + 1) / 2;
        const mz = (Math.min(...mound.map((f) => f.y)) + Math.max(...mound.map((f) => f.y)) + 1) / 2;
        const heap = add(own(new THREE.SphereGeometry(1.0, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)), lam(0x3a3428, { flatShading: true }), mx, D, mz);
        heap.scale.y = 0.55;
        for (let i = 0; i < 9; i++) {
          const a = rng() * Math.PI * 2;
          const r = rng() * 0.8;
          add(own(new THREE.IcosahedronGeometry(0.18 + rng() * 0.1, 0)), lam([0x1e2022, 0x4a3a2a, 0x5a4a3a][i % 3], { flatShading: true }), mx + Math.cos(a) * r, D + 0.25 + (0.8 - r) * 0.3, mz + Math.sin(a) * r);
        }
        const plank = add(geoBox(0.9, 0.05, 0.14), lam(0x6a4a2e), mx + 0.3, D + 0.45, mz - 0.2, false);
        plank.rotation.set(0.3, 0.7, 0.4);
      }
      const sick = new THREE.PointLight(0x7aff6a, 4, 10, 1.4);
      sick.position.set(ncx, D + 2.4, ncz);
      scene.add(sick);
      add(geoBox(0.2, 0.25, 0.2), lam(0x7aff6a, { emissive: 0x4ac83a, emissiveIntensity: 1.6 }), ncx, D + WALL - 0.4, NZ0 + 0.2, false);
    }
    // The gate: iron bars on hinges across the tunnel (tap it to unlock with the key). Swung open for players who have.
    {
      const g = new THREE.Group();
      const iron = lam(0x3a3d42);
      const tz0 = NEST_TUNNEL.y0;
      const w = NEST_TUNNEL.y1 + 1 - tz0;
      for (let k = 0; k <= 5; k++) {
        const bar = new THREE.Mesh(geoBox(0.05, 1.9, 0.05), iron);
        bar.position.set(0, 0.95, (k / 5) * w);
        g.add(bar);
      }
      // Thick rails and a yellow-and-black band, so it reads from above too.
      for (const y of [0.3, 1.0, 1.8]) {
        const rail = new THREE.Mesh(geoBox(0.16, y === 1.0 ? 0.16 : 0.1, w), y === 1.0 ? lam(0xd8b02a) : iron);
        rail.position.set(0, y, w / 2);
        g.add(rail);
      }
      const lock = new THREE.Mesh(geoBox(0.2, 0.26, 0.16), lam(0xc8a04a, { emissive: 0x5a4010, emissiveIntensity: 0.6 }));
      lock.position.set(-0.12, 1.0, w - 0.2);
      g.add(lock);
      const tap = new THREE.Mesh(geoBox(0.6, 2, w), new THREE.MeshBasicMaterial({ visible: false }));
      tap.position.set(0, 1, w / 2);
      g.add(tap);
      // Hinged on its north side.
      g.position.set(NEST_GATE[0] + 0.5, D, tz0);
      g.traverse((o) => (o.userData.gateId = 'rat_nest'));
      scene.add(g);
      gate = g;
    }
    for (let i = 0; i < 14; i++) {
      const onNorth = i % 2 === 0;
      const z = onNorth ? Z0 + 0.3 + rng() * 0.6 : Z1 - 0.3 - rng() * 0.6;
      add(geoBox(0.1 + rng() * 0.2, 0.03, 0.08 + rng() * 0.15), lam([0x8a7a5a, 0x5a5a5a, 0x7a3a2a][i % 3]), X0 + 0.5 + rng() * (X1 - X0 - 1), D + 0.015, z, false).rotation.y = rng() * 3;
    }
  }

  // ---------- cooking stations: the barbecue (docs/design.md §13) ----------
  // A brick barbecue with a grill, glowing coals and a few flames, a warm light, and a gravel patch around it.
  for (const st of STATIONS) {
    const x = st.x + 0.5;
    const z = st.y + 0.5;
    if (st.look === 'barrel') {
      burningBarrel(x, floorY(x, z), z);
      continue;
    }
    if (st.kind === 'press') {
      // A plate press against the west wall: a heavy painted frame, two columns, the ram on top, a flywheel, a tin
      // sheet on the bed, a yellow-and-black warning stripe.
      const paint = lam(0x4a6a5a, { flatShading: true });
      const dark = lam(0x2b2b2e);
      add(geoBox(0.9, 0.45, 0.8), paint, x, 0.32, z);
      for (const dz of [-0.3, 0.3]) add(geoBox(0.14, 1.1, 0.14), paint, x - 0.15, 0.95, z + dz);
      add(geoBox(0.6, 0.35, 0.8), paint, x - 0.1, 1.55, z);
      add(geoBox(0.32, 0.3, 0.32), dark, x - 0.05, 1.22, z);
      const wheel = add(own(new THREE.TorusGeometry(0.28, 0.06, 6, 10)), dark, x - 0.1, 1.5, z + 0.45);
      wheel.rotation.y = Math.PI / 2;
      add(geoBox(0.4, 0.03, 0.4), lam(0xb8bcc2), x + 0.05, 0.56, z, false);
      add(geoBox(0.92, 0.06, 0.03), lam(0xe0b830), x, 0.52, z + 0.41, false);
      continue;
    }
    if (st.kind === 'bench') {
      // A workbench against the east wall: a thick wooden top on steel legs, a vice, a hammer and tin snips, a sheet,
      // and a pegboard with tools on the wall behind.
      const top = lam(0x8a6a44);
      const steel = lam(0x5a5f66);
      add(geoBox(0.6, 0.08, 0.95), top, x, 0.7, z);
      for (const [dx, dz] of [[-0.25, -0.42], [-0.25, 0.42], [0.25, -0.42], [0.25, 0.42]]) add(geoBox(0.05, 0.66, 0.05), steel, x + dx, 0.35, z + dz, false);
      add(geoBox(0.5, 0.04, 0.85), top, x, 0.2, z, false); // the shelf underneath
      add(geoBox(0.12, 0.12, 0.16), steel, x - 0.15, 0.8, z - 0.32); // the vice
      add(geoBox(0.3, 0.02, 0.35), lam(0xb8bcc2), x, 0.75, z + 0.15, false); // a sheet of tin
      add(geoBox(0.04, 0.03, 0.22), lam(0x3a2a1e), x - 0.05, 0.76, z - 0.05, false); // hammer handle
      add(geoBox(0.06, 0.05, 0.08), steel, x - 0.05, 0.77, z - 0.17, false); // hammer head
      add(geoBox(0.04, 0.6, 0.95), lam(0x9a8a6a), x + 0.3, 1.2, z, false); // pegboard
      for (const dz of [-0.3, 0, 0.3]) add(geoBox(0.03, 0.22, 0.04), steel, x + 0.27, 1.25, z + dz, false);
      continue;
    }
    add(own(new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2)), lam(0x8a8070), x, 0.095, z, false);
    const brick = lam(0x8a4434, { flatShading: true });
    add(geoBox(0.9, 0.55, 0.7), brick, x, 0.3, z);
    add(geoBox(0.96, 0.06, 0.76), lam(0x6a3428), x, 0.6, z);
    add(geoBox(0.7, 0.04, 0.5), lam(0x2a1a14, { emissive: 0xff5a1a, emissiveIntensity: 0.9 }), x, 0.63, z, false); // coals
    for (let i = 0; i < 7; i++) add(geoBox(0.02, 0.02, 0.5), lam(0x3a3d42), x - 0.3 + i * 0.1, 0.68, z, false); // grill bars
    for (let i = 0; i < 4; i++) {
      const f = add(own(new THREE.ConeGeometry(0.06 + rng() * 0.03, 0.22, 6)), lam(0xff8a2a, { emissive: 0xff6a1a, emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }), x - 0.22 + i * 0.15, 0.76, z + (rng() - 0.5) * 0.25, false);
      flames.push(f);
    }
    // A chimney stack at the back, and a bag of charcoal.
    add(geoBox(0.3, 0.6, 0.2), brick, x, 0.9, z - 0.26);
    add(geoBox(0.3, 0.35, 0.18), lam(0x4a3a2a), x + 0.7, 0.25, z + 0.3);
    const light = new THREE.PointLight(0xff8a3a, 4, 5, 1.6);
    light.position.set(x, 1.0, z);
    scene.add(light);
    fireLights.push(light);
  }

  // Build all instanced batches that were filled above.
  for (const m of pools.build(scene)) m.receiveShadow = false;
  for (const b of [poles, lampHeads, lampGlow, lightPole, lightBox, redDot, greenDot]) b.build(scene); // (lightPole was missing: the traffic lights floated)
  trunks.build(scene);
  crowns.forEach((b) => b.build(scene));

  // Merge everything static into a few meshes per area and colour (and per building, for the ones that fade).
  flames.forEach((f) => keep.add(f)); // (they flicker)
  mergeStatic(scene, statics, fadeables, keep, own);

  return {
    fadeables,
    /** The hospital's staircases (tap one to go up or down). */
    stairs,
    /** The pothole and the sewer's ladder (tap to climb: userData.linkId). */
    links,
    /** The Rat Nest's gate (tap it: userData.gateId). Swing it open for players who unlocked it. */
    gate: gate as THREE.Group | null,
    setGateOpen(open: boolean) {
      if (gate) gate.rotation.y = open ? -Math.PI / 2 : 0;
    },
    /** Call every frame: the barbecue's flames flicker. */
    animate(t: number) {
      animateWater(t);
      flames.forEach((f, i) => {
        const k = 0.8 + Math.sin(t / 90 + i * 1.7) * 0.2 + Math.sin(t / 37 + i) * 0.1;
        f.scale.set(1, k, 1);
      });
      fireLights.forEach((l, i) => (l.intensity = 3.5 + Math.sin(t / 70 + i) * 0.6 + Math.sin(t / 23) * 0.3));
    },
    /** Room id → its walls/roof, so the Street view can fade a room while you're inside. */
    rooms,
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

const ray = new THREE.Raycaster();
/**
 * Fade buildings that stand between the camera and `target` (your character), so you're never hidden.
 * Call every frame.
 */
/**
 * v0.60: the cut-away (old-school RuneScape style). Buildings on the camera's side of you, within view (lower on the
 * screen than you), show only their ground floor, so the tall city never hides the street you're on. Call every frame
 * after updateFades.
 */
export function updateCuts(fadeables: Fadeable[], camera: THREE.Camera, target: THREE.Vector3) {
  const toCam = new THREE.Vector3(camera.position.x - target.x, 0, camera.position.z - target.z).normalize();
  const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
  for (const f of fadeables) {
    const c = f.cut;
    if (!c) continue;
    const dx = c.center.x - target.x, dz = c.center.z - target.z;
    const ahead = dx * toCam.x + dz * toCam.z; // towards the camera: lower on the screen
    const across = Math.abs(dx * side.x + dz * side.z);
    const on = ahead > 1.5 && ahead < 22 && across < 16;
    if (on !== c.on) {
      c.on = on;
      if (c.main) {
        c.main.scale.y = on ? c.keep / c.height : 1;
        c.main.position.y = (on ? c.keep : c.height) / 2;
      }
    }
    // (Fading shows and hides props too: the floors above stay hidden while it's cut.)
    for (const o of c.upper) o.visible = !on && (f.walls.includes(o as THREE.Mesh) || f.opacity > 0.6);
  }
}

export function updateFades(fadeables: Fadeable[], camera: THREE.Camera, target: THREE.Vector3, dt: number) {
  const hit = new Set<Fadeable>();
  for (const yOff of [0.3, 1.0]) {
    const to = target.clone().setY(target.y + yOff);
    const dir = to.clone().sub(camera.position);
    const dist = dir.length();
    ray.set(camera.position, dir.normalize());
    ray.far = dist - 0.3;
    for (const f of fadeables) {
      if (hit.has(f)) continue;
      if (ray.intersectObjects(f.walls, false).length) hit.add(f);
    }
  }
  for (const f of fadeables) {
    const goal = f.force || hit.has(f) ? 0.12 : 1;
    if (Math.abs(f.opacity - goal) < 0.001) continue;
    f.opacity += (goal - f.opacity) * Math.min(1, dt * 10);
    if (Math.abs(f.opacity - goal) < 0.01) f.opacity = goal;
    const faded = f.opacity < 0.999;
    for (const m of f.mats) {
      if (m.transparent !== faded) m.needsUpdate = true;
      m.transparent = faded;
      m.opacity = f.opacity;
      m.depthWrite = !faded;
    }
    for (const p of f.props) p.visible = f.opacity > 0.6;
  }
}
