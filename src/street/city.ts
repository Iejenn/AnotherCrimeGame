// Builds the static city for the Street view: low-poly "model town" shapes in a dark, gritty
// dusk palette (docs/design.md §7b), on an island in the ocean:
// asphalt with lane lines and zebra crossings, pavements, brick and concrete buildings with window
// grids, coloured trims, rooftop props and striped awnings, round low-poly trees, lamps,
// traffic lights, and a beach with rocks where the island meets the ocean. Plus the special places
// where crimes happen: the big park with its fountain, the basketball court, Eddy's store.
// Lots of repeated things (trees, lamps, road paint) use InstancedMesh so phones stay smooth.
import * as THREE from 'three';
import {
  BAR, BCOLS, BEACH, BLOCK_SIZE, BROWS, BUILDINGS, CANDY, COURT, ENCLOSURES, FIXTURES, GAS, H, LOTS, NODES, NPCS, PARK, PARKED_CARS,
  PARKING, PARKING_NE, PARKING_S, PARK_PATHS, PITCH, SPAWN, STATIONS, YARD, YARD_GATES, STREET, STORE, W, WEAPONS, blockRect, buildBlocked, inRect, type Room,
  FLOOR_H, HOSPITAL, LOBBY, STAIRS, WARD, WAKE,
  MANHOLE, SEWER, SEWER_BRIDGES, floorY, THRIFT, THRIFT_GATE, THRIFT_YARD,
  CITY_COLS, FACTORY, FACTORY_DOOR, FACTORY_LOT, FACTORY_LOT_GATE, FACTORY_SITE, SEWER_CHANNEL, SEWER_DEPTH, SEWER_LADDER,
} from './map';
import * as L from './streetLife';
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
}

// ---------- canvas textures ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * A 4×4 block of windows (one per tile): the wall is white (tinted by the wall colour), most panes
 * are dark glass, some are lit. The matching glow map makes only the lit panes shine at dusk.
 */
function windowAtlas(seed: number) {
  const r = mulberry32(seed);
  const lit: boolean[] = Array.from({ length: 16 }, () => r() < 0.3);
  const pane = (g: CanvasRenderingContext2D, i: number, x: number, y: number, glowOnly: boolean) => {
    if (glowOnly) {
      g.fillStyle = lit[i] ? '#ffffff' : '#000000';
      g.fillRect(x + 14, y + 14, 36, 34);
      return;
    }
    g.fillStyle = lit[i] ? '#ffd9a0' : '#1d2630';
    g.fillRect(x + 14, y + 14, 36, 34);
    g.fillStyle = lit[i] ? '#ffe7c2' : '#2c3a46';
    g.fillRect(x + 14, y + 14, 36, 8);
    g.fillStyle = '#9a958c';
    g.fillRect(x + 12, y + 48, 40, 4);
  };
  const draw = (glowOnly: boolean) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = glowOnly ? '#000000' : '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) pane(g, i, (i % 4) * 64, Math.floor(i / 4) * 64, glowOnly);
  };
  return { map: canvasTex(256, 256, draw(false)), glow: canvasTex(256, 256, draw(true)) };
}

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

const stripeTex = (color: string, light = '#ffffff') =>
  canvasTex(64, 16, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? light : color;
      g.fillRect(i * 8, 0, 8, 16);
    }
  });

export function signTexture(text: string, bg = '#2f7a46', fg = '#ffffff') {
  return canvasTex(
    512,
    96,
    (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 96);
      g.strokeStyle = fg;
      g.lineWidth = 6;
      g.strokeRect(8, 8, 496, 80);
      g.fillStyle = fg;
      g.font = 'bold 52px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 52);
    },
    false,
  );
}

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
  build(scene: THREE.Scene) {
    if (!this.mats.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.mats.length);
    this.mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = this.shadow;
    im.receiveShadow = true;
    scene.add(im);
    return im;
  }
}

export function buildCity(scene: THREE.Scene) {
  const disposables: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const lam = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => own(new THREE.MeshLambertMaterial({ color, ...extra }));
  const geoBox = (w: number, h: number, d: number) => own(new THREE.BoxGeometry(w, h, d));
  const rng = mulberry32(2024);
  let ironMat: THREE.Material | null = null;
  const iron2 = () => (ironMat ??= lam(0x3a3d42));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

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
  plane(W + BEACH * 2 + 3, H + BEACH * 2 + 3, C.shallows, -0.3); // lighter shallow water around the beach
  const sand = add(geoBox(W + BEACH * 2, 0.3, H + BEACH * 2), lam(C.sand), W / 2, -0.17, H / 2, false);
  sand.receiveShadow = true;
  // A low kerb where the streets meet the sand (just below the asphalt, so it only shows around the edge).
  add(geoBox(W + 0.3, 0.12, H + 0.3), lam(C.quay), W / 2, -0.075, H / 2, false);
  plane(W, H, C.asphalt, 0);
  // Rocks scattered along the waterline.
  const rocks = new Batch(own(new THREE.DodecahedronGeometry(0.35, 0)), lam(C.rock, { flatShading: true }));
  for (let i = 0; i < 90; i++) {
    const side = i % 4;
    const along = rng();
    const out = BEACH - 0.2 + rng() * 0.9;
    const x = side < 2 ? along * (W + 2 * out) - out : side === 2 ? -out : W + out;
    const z = side >= 2 ? along * (H + 2 * out) - out : side === 0 ? -out : H + out;
    const sc = 0.5 + rng() * 1.1;
    rocks.add(x, -0.12, z, sc, sc * (0.5 + rng() * 0.4), sc, rng() * 6);
  }
  rocks.build(scene);

  // ---------- streets: a road for two cars (dashed centre line), zebra crossings, curbs and sidewalks ----------
  // Every street is 7 tiles: sidewalk 1.5, road 4, sidewalk 1.5. Each block has a sidewalk all around it, with a
  // curb along the road edge.
  const dash = new Batch(geoBox(0.07, 0.01, 0.7), lam(C.paint), false);
  const zebra = new Batch(geoBox(0.32, 0.01, 2.6), lam(0xd8d2c4), false);
  const inCrossing = (v: number) => v % PITCH < STREET;
  /** On the Factory's site (I-003 + I-006 merged, the street between them included): no road paint, lamps or lights. */
  const onSite = (x: number, z: number) => x >= FACTORY_SITE.x0 - 0.2 && x <= FACTORY_SITE.x1 + 1.2 && z >= FACTORY_SITE.y0 - 0.2 && z <= FACTORY_SITE.y1 + 1.2;
  for (let k = 0; k <= BCOLS; k++) {
    const x = k * PITCH + STREET / 2; // centre of a north–south street
    for (let z = 0; z < H; z += 1.6) if (!inCrossing(Math.floor(z)) && !inCrossing(Math.floor(z + 0.7))) dash.add(x, 0.006, z + 0.35);
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
  for (let bx = 0; bx < BCOLS; bx++)
    for (let by = 0; by < BROWS; by++) {
      const b = blockRect(bx, by);
      const cx = b.x0 + BLOCK_SIZE / 2;
      const cz = b.y0 + BLOCK_SIZE / 2;
      const size = BLOCK_SIZE + 2 * SW;
      add(geoBox(size, 0.07, size), sidewalkMat, cx, 0.035, cz, false);
      for (const [w, d, dx, dz] of [[size, 0.12, 0, -size / 2], [size, 0.12, 0, size / 2], [0.12, size, -size / 2, 0], [0.12, size, size / 2, 0]] as const)
        add(geoBox(w, 0.09, d), curbMat, cx + dx, 0.045, cz + dz, false);
      for (let t = -size / 2 + 1; t < size / 2; t += 1) {
        joints.add(cx + t, 0.072, b.y0 - SW / 2, 1, 1, 1, 0);
        joints.add(cx + t, 0.072, b.y1 + 1 + SW / 2, 1, 1, 1, 0);
        joints.add(b.x0 - SW / 2, 0.072, cz + t, 1, 1, 1, Math.PI / 2);
        joints.add(b.x1 + 1 + SW / 2, 0.072, cz + t, 1, 1, 1, Math.PI / 2);
      }
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
  const busy = new Set<string>(); // tiles with spots/NPCs or in front of doors: keep trees and props off them
  for (const n of NODES) busy.add(`${n.x},${n.y}`);
  for (const p of NPCS) busy.add(`${p.x},${p.y}`);
  for (const e of ENCLOSURES) for (const o of e.openings) for (let d = -1; d <= 1; d++) busy.add(`${o.outside[0] + d},${o.outside[1]}`), busy.add(`${o.outside[0] + d},${o.outside[1] + 1}`);
  for (let d = -1; d <= 1; d++) busy.add(`${SPAWN[0] + d},${SPAWN[1]}`);
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
  for (let bx = 0; bx < CITY_COLS; bx++) // (no trees in the Industrial zone)
    for (let by = 0; by < BROWS; by++) {
      const b = blockRect(bx, by);
      const spots: [number, number][] = [];
      for (const t of [1.5, 5, 8.5]) {
        spots.push([b.x0 + t, b.y0 - 0.75], [b.x0 + t, b.y1 + 1.75], [b.x0 - 0.75, b.y0 + t], [b.x1 + 1.75, b.y0 + t]);
      }
      for (const [tx, tz] of spots) {
        if (rng() < 0.6 || busy.has(`${Math.floor(tx)},${Math.floor(tz)}`)) continue;
        pit.add(tx, 0.075, tz);
        tree(tx, tz, 1.25 + rng() * 0.3);
      }
    }
  pit.build(scene);

  // ---------- street lamps (tall, an arm over the road) and traffic lights at the crossings ----------
  const poleGeo = own(new THREE.CylinderGeometry(0.04, 0.06, 2.3, 6));
  const poles = new Batch(poleGeo, lam(0x2b2b2e));
  const lampHeads = new Batch(geoBox(0.26, 0.08, 0.6), lam(0x2b2b2e));
  const lampGlow = new Batch(geoBox(0.2, 0.03, 0.24), lam(C.lamp, { emissive: C.lamp, emissiveIntensity: 1.8 }), false);
  const poolMat = own(new THREE.MeshBasicMaterial({ map: own(lightPoolTex()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pools = new Batch(own(new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2)), poolMat, false);
  const lightPole = new Batch(own(new THREE.CylinderGeometry(0.035, 0.04, 1.9, 6)), lam(0x5a5f66));
  const lightBox = new Batch(geoBox(0.14, 0.4, 0.14), lam(0x2b2b2e));
  const redDot = new Batch(geoBox(0.07, 0.07, 0.02), lam(0xe0473a, { emissive: 0xe0473a, emissiveIntensity: 0.9 }), false);
  const greenDot = new Batch(geoBox(0.07, 0.07, 0.02), lam(0x5bd06a, { emissive: 0x5bd06a, emissiveIntensity: 0.9 }), false);
  /** A lamp at (x, z) whose arm reaches over the road in direction (dx, dz). */
  const lamp = (x: number, z: number, dx: number, dz: number) => {
    if (onSite(x, z)) return;
    poles.add(x, 1.15, z);
    const rot = Math.atan2(dx, dz);
    lampHeads.add(x + dx * 0.4, 2.3, z + dz * 0.4, 1, 1, 1, rot);
    lampGlow.add(x + dx * 0.45, 2.25, z + dz * 0.45, 1, 1, 1, rot);
    pools.add(x + dx * 0.7, 0.08, z + dz * 0.7);
  };
  for (let bx = 0; bx < BCOLS; bx++)
    for (let by = 0; by < BROWS; by++) {
      const b = blockRect(bx, by);
      // Two lamps on each side of the block, near the curb, staggered so they don't face each other.
      for (const t of [3.2, 7.8]) {
        lamp(b.x0 + t, b.y0 - 1.3, 0, -1);
        lamp(b.x0 + BLOCK_SIZE - t, b.y1 + 2.3, 0, 1);
        lamp(b.x0 - 1.3, b.y0 + BLOCK_SIZE - t, -1, 0);
        lamp(b.x1 + 2.3, b.y0 + t, 1, 0);
      }
      // Traffic lights on the block's corners, facing the crossing.
      for (const [cx, cz, i] of [[b.x0 - 1.3, b.y0 - 1.3, 0], [b.x1 + 2.3, b.y0 - 1.3, 1], [b.x0 - 1.3, b.y1 + 2.3, 1], [b.x1 + 2.3, b.y1 + 2.3, 0]] as const) {
        if (onSite(cx, cz)) continue;
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
    for (const lot of LOTS) {
      if (lot.kind !== 'buildings') continue;
      // Free tiles inside the lot (alleys and gaps between its buildings): one in three gets a dumpster.
      const free: [number, number][] = [];
      for (let y = lot.rect.y0; y <= lot.rect.y1; y++) for (let x = lot.rect.x0; x <= lot.rect.x1; x++) if (!blocked[y * W + x]) free.push([x, y]);
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
    for (let bx = 0; bx < CITY_COLS; bx++) // (city streets only)
      for (let by = 0; by < BROWS; by++) {
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
            g.position.set(x, 0.07, z);
            g.rotation.y = side.rot;
            scene.add(g);
          }
        }
      }
    // A bus stop on the park's sidewalk, across from the candy store (where you start).
    const stop = L.buildBusStop();
    stop.position.set(PARK.x0 + 6.5, 0.07, PARK.y0 - 0.55);
    stop.rotation.y = Math.PI;
    scene.add(stop);
  }

  /** A coloured band around the roof edge (a parapet), leaving the grey roof visible in the middle. */
  const parapet = (cx: number, cz: number, w: number, d: number, top: number, m: THREE.Material) => {
    const t = 0.1;
    const h = 0.16;
    return [
      add(geoBox(w, h, t), m, cx, top, cz - d / 2 + t / 2),
      add(geoBox(w, h, t), m, cx, top, cz + d / 2 - t / 2),
      add(geoBox(t, h, d - 2 * t), m, cx - w / 2 + t / 2, top, cz),
      add(geoBox(t, h, d - 2 * t), m, cx + w / 2 - t / 2, top, cz),
    ];
  };

  // ---------- buildings ----------
  const atlases = [1, 2, 3, 4].map((seed) => windowAtlas(seed * 977));
  for (const a of atlases) own(a.map), own(a.glow);
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
  // 3 floors a person could live in, not a toy tower with 8 floors of half-person-sized windows. 2 or 3 floors.
  const FLOOR = 1.45;
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
    const roof = add(geoBox(X1 - X0 + 0.15, 0.08, Z1 - Z0 + 0.15), lam(0x4a4a48), cx, h + 0.04, cz);
    // A roll-up door on the street side, a small door next to it, a vent on the roof.
    const fz = b.front === 'n' ? Z0 - 0.01 : Z1 + 0.01;
    const doorW = Math.min(1.6, (X1 - X0) * 0.45);
    const props: THREE.Object3D[] = [roof];
    props.push(add(geoBox(doorW, 1.2, 0.04), lam(0x8a6a4a), cx - 0.3, 0.6, fz, false));
    for (let i = 0; i < 6; i++) props.push(add(geoBox(doorW, 0.02, 0.05), lam(0x5a4a3a), cx - 0.3, 0.12 + i * 0.2, fz, false));
    props.push(add(geoBox(0.5, 0.95, 0.04), lam(0x3a4a5a), cx + doorW / 2 + 0.2, 0.48, fz, false));
    props.push(add(own(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 10)), lam(0x9aa0a6), cx + (X1 - X0) / 4, h + 0.2, cz));
    fadeables.push({ walls, mats: [mWall], props, opacity: 1 });
  };

  for (const b of BUILDINGS) {
    if (b.custom) continue; // drawn by its own section (the Thrift Store)
    if (b.industrial) {
      industrialShed(b);
      continue;
    }
    const floors = b.height > 1.8 ? 3 : 2;
    const height = floors * FLOOR + 0.12;
    const wall = C.walls[Math.floor(rng() * C.walls.length)];
    const trim = C.trims[Math.floor(rng() * C.trims.length)];
    // Window textures: 4×4 windows per texture, so repeat = size / 4. Each building picks one of a
    // few lit-window patterns, so the city doesn't look copy-pasted.
    const atlas = atlases[Math.floor(rng() * atlases.length)];
    const tex = (src: THREE.Texture, across: number) => {
      const t = own(src.clone());
      t.repeat.set(across / 4, floors / 4);
      t.offset.set(Math.floor(rng() * 4) / 4, 0);
      t.needsUpdate = true;
      return t;
    };
    // Each building gets its own materials so it can fade on its own.
    // Boarded-up buildings (the Yard's) are bare brick: their windows get planks below, and the walls take graffiti.
    const brick = (across: number) => {
      const t = own(brickTex.clone());
      t.repeat.set(across, floors);
      t.needsUpdate = true;
      return t;
    };
    const mX = b.boarded ? lam(wall, { map: brick(b.w) }) : lam(wall, { map: tex(atlas.map, b.w), emissiveMap: tex(atlas.glow, b.w), emissive: C.litWindow, emissiveIntensity: 1 });
    const mZ = b.boarded ? lam(wall, { map: brick(b.h) }) : lam(wall, { map: tex(atlas.map, b.h), emissiveMap: tex(atlas.glow, b.h), emissive: C.litWindow, emissiveIntensity: 1 });
    const mRoof = lam(C.roof);
    const mTrim = lam(trim);
    const bw = b.w - 0.1;
    const bd = b.h - 0.1;
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    const walls = add(geoBox(bw, height, bd), [mZ, mZ, mRoof, mRoof, mX, mX], cx, height / 2, cz);
    const trimBand = parapet(cx, cz, bw + 0.06, bd + 0.06, height + 0.02, mTrim);
    const props: THREE.Object3D[] = [];
    // Rooftop props: air-con units, sometimes a water tank or an antenna.
    const nAc = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nAc; i++) {
      const ac = add(geoBox(0.3, 0.18, 0.24), lam(0xe8e8e8), b.x + 0.4 + rng() * (b.w - 0.8), height + 0.09, b.y + 0.4 + rng() * (b.h - 0.8));
      props.push(ac);
    }
    if (rng() < 0.3) {
      const tank = add(own(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 10)), lam(0xb8bcc2), b.x + 0.5, height + 0.16, b.y + 0.5);
      props.push(tank);
    }
    if (rng() < 0.2) {
      const ant = add(own(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4)), lam(0x6a6f76), b.x + b.w - 0.4, height + 0.35, b.y + 0.4);
      props.push(ant);
    }
    // Every building has a front door at person size (on its street side), with a step and a lamp: so you can
    // tell how big it is, and that people live there.
    if (b.boarded) {
      // Windows on the upper floors, nailed shut: a dark hole with three rough planks across it, on every side.
      const faces = [
        { n: b.w, at: (i: number) => [b.x + 0.5 + i, b.y + 0.02] as const, rot: 0 },
        { n: b.w, at: (i: number) => [b.x + 0.5 + i, b.y + b.h - 0.02] as const, rot: 0 },
        { n: b.h, at: (i: number) => [b.x + 0.02, b.y + 0.5 + i] as const, rot: Math.PI / 2 },
        { n: b.h, at: (i: number) => [b.x + b.w - 0.02, b.y + 0.5 + i] as const, rot: Math.PI / 2 },
      ];
      for (const f of faces)
        for (let i = 0; i < f.n; i++)
          for (let fl = 1; fl < floors; fl++) {
            const [x, z] = f.at(i);
            const y = fl * FLOOR + 0.8;
            const hole = add(geoBox(0.5, 0.7, 0.03), lam(0x141210), x, y, z, false);
            hole.rotation.y = f.rot;
            props.push(hole);
            for (const dy of [-0.22, 0.02, 0.24]) {
              const plank = add(geoBox(0.62, 0.11, 0.04), lam(0x7a5a3a, { flatShading: true }), x, y + dy + (rng() - 0.5) * 0.04, z, false);
              plank.rotation.set(0, f.rot, (rng() - 0.5) * 0.25);
              props.push(plank);
            }
          }
    }
    // The front faces the street: south for most, north for buildings along a block's north edge (s = which way
    // "out" is along z).
    const sgn = b.front === 'n' ? -1 : 1;
    const front = b.front === 'n' ? b.y + 0.05 : b.y + b.h - 0.05;
    const doorX = b.x + 0.5 + Math.floor(rng() * Math.max(1, b.w - 1));
    props.push(
      add(geoBox(0.62, 1.12, 0.06), lam(trim), doorX, 0.56, front + sgn * 0.02, false), // frame
      add(geoBox(0.5, 1.02, 0.07), lam(0x3a2a20), doorX, 0.53, front + sgn * 0.03, false), // door
      add(geoBox(0.8, 0.08, 0.3), lam(0x8a857c), doorX, 0.08, front + sgn * 0.15, false), // step
      add(geoBox(0.12, 0.12, 0.08), lam(0xffe7c2, { emissive: 0xffd9a0, emissiveIntensity: 1.2 }), doorX + 0.42, 1.0, front + sgn * 0.06, false), // lamp
    );
    // Some ground floors on a street are shops: a shop window at person height + an awning.
    const block = blockRect(Math.floor(b.x / PITCH), Math.floor(b.y / PITCH));
    const onStreet = b.front === 'n' ? b.y === block.y0 : b.y + b.h - 1 === block.y1;
    if (onStreet && b.w >= 2 && rng() < 0.55) {
      const gw = Math.max(0.6, bw - 1.1);
      const gx = doorX < cx ? cx + 0.3 : cx - 0.3;
      const glass = add(geoBox(gw, 0.8, 0.05), lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 0.7 }), gx, 0.55, front + sgn * 0.01, false);
      const stripe = own(stripeTex(`#${C.trims[Math.floor(rng() * C.trims.length)].toString(16).padStart(6, '0')}`, '#b8b0a0'));
      stripe.repeat.set(Math.max(1, Math.round(bw)), 1);
      const awning = add(geoBox(Math.max(0.7, bw - 0.3), 0.04, 0.42), lam(0xffffff, { map: stripe }), cx, 1.3, front + sgn * 0.19);
      awning.rotation.x = sgn * 0.35;
      props.push(glass, awning);
    }
    fadeables.push({ walls: [walls, ...trimBand], mats: [mX, mZ, mRoof, mTrim], props, opacity: 1 });
  }

  // ---------- the big park (Pickpocket Tourists) ----------
  // Lawn over four blocks and the roads between them; hedges with gaps; gravel paths in a # shape;
  // a fountain in the middle with benches; a pond with lily pads; trees, flowerbeds and old lamps.
  {
    const P = PARK;
    const X0 = P.x0;
    const Z0 = P.y0;
    const X1 = P.x1 + 1;
    const Z1 = P.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    add(geoBox(X1 - X0 + 0.6, 0.06, Z1 - Z0 + 0.6), pavement, cx, 0.03, cz, false);
    add(geoBox(X1 - X0, 0.08, Z1 - Z0), grassMat, cx, 0.04, cz, false);
    // Darker grass patches so the lawn isn't one flat colour.
    const patch = new Batch(own(new THREE.CircleGeometry(0.5, 7).rotateX(-Math.PI / 2)), lam(0x3b5a31), false);
    for (let i = 0; i < 60; i++) patch.add(X0 + 0.6 + rng() * (X1 - X0 - 1.2), 0.082 + i * 0.0002, Z0 + 0.6 + rng() * (Z1 - Z0 - 1.2), 0.6 + rng(), 1, 0.6 + rng(), rng() * 6);
    patch.build(scene);
    // Paths in a # shape, through the gaps in the hedges (PARK_PATHS), out to the sidewalks.
    const gravel = lam(0x8a8070);
    const midZ = cz; // the fountain is in the middle
    for (const r of PARK_PATHS.rows) add(geoBox(X1 - X0, 0.02, 0.8), gravel, cx, 0.09, P.y0 + r + 0.5, false);
    for (const c of PARK_PATHS.cols) add(geoBox(0.8, 0.02, Z1 - Z0), gravel, P.x0 + c + 0.5, 0.091, cz, false);
    // A gravel square around the fountain, joining the paths.
    const ringPath = new THREE.Mesh(own(new THREE.CircleGeometry(1.9, 24).rotateX(-Math.PI / 2)), gravel);
    ringPath.position.set(cx, 0.092, midZ);
    ringPath.receiveShadow = true;
    scene.add(ringPath);
    // The fountain: a low stone basin with water, a pillar and a top bowl. The water glows a little.
    const stone = lam(0x8e877b, { flatShading: true });
    add(own(new THREE.CylinderGeometry(1.15, 1.22, 0.3, 14)), stone, cx, 0.22, midZ);
    add(own(new THREE.CylinderGeometry(1.03, 1.03, 0.05, 14)), lam(0x2f6f86, { emissive: 0x1d4a5c, emissiveIntensity: 0.6 }), cx, 0.35, midZ, false);
    add(own(new THREE.CylinderGeometry(0.1, 0.14, 0.62, 8)), stone, cx, 0.62, midZ);
    add(own(new THREE.CylinderGeometry(0.34, 0.2, 0.1, 10)), stone, cx, 0.94, midZ);
    add(own(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10)), lam(0x3f86a0, { emissive: 0x2a6278, emissiveIntensity: 0.7 }), cx, 0.99, midZ, false);
    // Benches facing the fountain.
    const wood = lam(0x6b4a2e);
    const iron = lam(0x2b2b2e);
    const bench = (x: number, z: number, faceSouth: boolean, len = 0.9) => {
      const back = faceSouth ? -1 : 1;
      add(geoBox(len, 0.05, 0.3), wood, x, 0.3, z, true);
      add(geoBox(len, 0.22, 0.04), wood, x, 0.48, z + back * 0.15, true);
      for (const dx of [-len / 2 + 0.06, len / 2 - 0.06]) add(geoBox(0.04, 0.3, 0.3), iron, x + dx, 0.15, z, true);
    };
    for (const f of FIXTURES.filter((f) => f.kind === 'bench' && inRect(P, f.x, f.y))) bench(f.x + 0.5, f.y + 0.5, f.y < midZ);
    // Hedges: dark green boxes, slightly uneven.
    const hedges = new Batch(geoBox(1, 0.5, 0.7), lam(0x2c4a26, { flatShading: true }));
    for (const f of FIXTURES.filter((f) => f.kind === 'hedge' && inRect(P, f.x, f.y))) {
      const vertical = f.x === P.x0 || f.x === P.x1;
      hedges.add(f.x + 0.5, 0.25, f.y + 0.5, 1, 0.85 + rng() * 0.3, 1, vertical ? Math.PI / 2 : 0);
    }
    hedges.build(scene);
    for (const f of FIXTURES.filter((f) => f.kind === 'tree' && inRect(P, f.x, f.y))) tree(f.x + 0.5, f.y + 0.5, 1.15 + rng() * 0.3);
    // Flowerbeds: a stone edge, dark soil and dots of colour.
    const flowerColors = [0xd9473a, 0xf0b13c, 0xe8e2d0, 0x8a5ab8];
    for (const f of FIXTURES.filter((f) => f.kind === 'flowers' && inRect(P, f.x, f.y))) {
      add(geoBox(0.9, 0.14, 0.9), stone, f.x + 0.5, 0.11, f.y + 0.5);
      add(geoBox(0.78, 0.04, 0.78), lam(0x3a2a1e), f.x + 0.5, 0.18, f.y + 0.5, false);
      for (let i = 0; i < 9; i++)
        add(geoBox(0.12, 0.12, 0.12), lam(flowerColors[i % flowerColors.length]), f.x + 0.2 + (i % 3) * 0.3, 0.25, f.y + 0.2 + Math.floor(i / 3) * 0.3, false);
    }
    // The pond: a stone rim, dark water with a soft glow, lily pads and a few reeds.
    const pond = FIXTURES.filter((f) => f.kind === 'pond' && inRect(P, f.x, f.y));
    if (pond.length) {
      const px = (Math.min(...pond.map((f) => f.x)) + Math.max(...pond.map((f) => f.x)) + 1) / 2;
      const pz = (Math.min(...pond.map((f) => f.y)) + Math.max(...pond.map((f) => f.y)) + 1) / 2;
      // An oval pond, as wide as its tiles (one column between the path and the hedge).
      const sx = (Math.max(...pond.map((f) => f.x)) - Math.min(...pond.map((f) => f.x)) + 1) / 2;
      const sz = (Math.max(...pond.map((f) => f.y)) - Math.min(...pond.map((f) => f.y)) + 1) / 2;
      add(own(new THREE.CylinderGeometry(0.98, 1.02, 0.14, 16)), stone, px, 0.1, pz).scale.set(sx, 1, sz);
      add(own(new THREE.CylinderGeometry(0.88, 0.88, 0.04, 16)), lam(0x1f4a5a, { emissive: 0x123440, emissiveIntensity: 0.6 }), px, 0.16, pz, false).scale.set(sx, 1, sz);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + rng();
        const r = (0.25 + rng() * 0.45) * Math.min(sx, sz);
        add(own(new THREE.CircleGeometry(0.11, 7).rotateX(-Math.PI / 2)), lam(0x3f7a3a), px + Math.cos(a) * r, 0.185, pz + Math.sin(a) * r, false);
      }
      for (let i = 0; i < 6; i++) add(geoBox(0.03, 0.3 + rng() * 0.2, 0.03), lam(0x4a6a32), px + sx * 0.7 + rng() * 0.1, 0.25, pz - 0.4 + i * 0.16, false);
    }
    // Old park lamps at the inner corners of the paths.
    for (const [lx, lz] of [[P.x0 + 3.2, P.y0 + 1.8], [P.x0 + 6.8, P.y0 + 1.8], [P.x0 + 3.2, P.y0 + 8.2], [P.x0 + 6.8, P.y0 + 8.2]]) lamp(lx, lz, 0, lz < cz ? 1 : -1);
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
    const centre = new THREE.Mesh(own(new THREE.RingGeometry(0.42, 0.47, 20).rotateX(-Math.PI / 2)), line);
    centre.position.set(cx, 0.096, ccz);
    scene.add(centre);
    // Hoops at the west and east ends: pole, backboard, orange rim.
    for (const side of [-1, 1]) {
      const px = side < 0 ? X0 + 0.15 : X1 - 0.15;
      add(geoBox(0.08, 1.3, 0.08), iron2(), px, 0.65, ccz);
      add(geoBox(0.04, 0.38, 0.6), lam(0xe8e2d0), px - side * 0.12, 1.22, ccz);
      const rim = add(own(new THREE.TorusGeometry(0.14, 0.018, 6, 14)), lam(0xe0782a), px - side * 0.3, 1.1, ccz);
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
  }
  const rooms = new Map<string, Fadeable>();
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
    const mRoof = lam(C.roof);
    const walls = [
      add(geoBox(X1 - X0, sh, t), mWall, cx, sh / 2, Z0 + t / 2), // back
      add(geoBox(t, sh, Z1 - Z0), mWall, X0 + t / 2, sh / 2, cz), // west
      add(geoBox(t, sh, Z1 - Z0), mWall, X1 - t / 2, sh / 2, cz), // east
      add(geoBox(doorX - X0, sh, t), mWall, (X0 + doorX) / 2, sh / 2, Z1 - t / 2), // front, left of the door
      add(geoBox(X1 - doorX - 1, sh, t), mWall, (doorX + 1 + X1) / 2, sh / 2, Z1 - t / 2), // front, right of the door
      add(geoBox(1, sh - DOOR, t), mWall, doorX + 0.5, DOOR + (sh - DOOR) / 2, Z1 - t / 2), // above the door
    ];
    const roof = add(geoBox(X1 - X0, 0.08, Z1 - Z0), mRoof, cx, sh + 0.04, cz);
    const trimBand = parapet(cx, cz, X1 - X0 + 0.06, Z1 - Z0 + 0.06, sh + 0.06, mTrim);
    // Shop windows either side of the door, lit from inside.
    const glassMat = lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 1.1 });
    const winL = add(geoBox(1.3, 0.85, 0.04), glassMat, X0 + 1, 0.68, Z1 + 0.005, false);
    const winR = add(geoBox(1.3, 0.85, 0.04), glassMat, X1 - 1, 0.68, Z1 + 0.005, false);
    const doorFrame = add(geoBox(1.04, 0.06, 0.14), mTrim, doorX + 0.5, DOOR + 0.01, Z1 - t / 2, false);
    const stripe = own(stripeTex(st.stripe[0], st.stripe[1]));
    stripe.repeat.set(5, 1);
    const awning = add(geoBox(X1 - X0 - 0.8, 0.05, 0.6), lam(0xffffff, { map: stripe }), cx, DOOR + 0.18, Z1 + 0.22);
    awning.rotation.x = 0.4;
    const signMat = own(new THREE.MeshBasicMaterial({ map: own(signTexture(st.sign, st.signBg, st.signFg)) }));
    const sign = add(own(new THREE.PlaneGeometry(3.2, 0.6)), signMat, cx, sh + 0.42, Z1 + 0.03, false);
    const signBack = add(geoBox(3.3, 0.68, 0.06), mTrim, cx, sh + 0.42, Z1 - 0.02);
    const roofAc = [0, 1].map((i) => add(geoBox(0.3, 0.18, 0.24), lam(0xe8e8e8), cx - 1.5 + i * 2.4, sh + 0.17, Z0 + 1.3));
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
    floor.position.set(cx, 0.065, cz);
    floor.receiveShadow = true;
    scene.add(floor);
    // Doormat inside the door.
    add(geoBox(0.8, 0.02, 0.5), lam(st.trim), doorX + 0.5, 0.075, Z1 - 0.4, false);
    // Warm light inside, so the shop glows when you look in.
    const lamp = new THREE.PointLight(st.light, 6, 6, 1.6);
    lamp.position.set(cx, sh - 0.2, cz);
    scene.add(lamp);
    const fade: Fadeable = {
      walls: [...walls, ...trimBand],
      mats: [mWall, mTrim],
      props: [roof, winL, winR, doorFrame, awning, sign, signBack, ...roofAc],
      opacity: 1,
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
  // Dark wood, a red neon BAR sign, a dim amber light. A back bar full of glowing bottles and a
  // mirror, a jukebox in the corner, the counter with beer taps and a brass foot rail, stools with
  // the drunks on them (spots, added by the Street view), a little table with a candle.
  {
    const { Z0, X1, t } = shopShell(BAR, {
      wall: 0x4a3a30, trim: 0x2a1a14, stripe: ['#5a1a14', '#c8b8a0'], sign: 'BAR', signBg: '#14100c', signFg: '#ff5a3a',
      floor: ['#5a4232', '#46321f'], light: 0xffa060,
    });
    const dark = lam(0x3a2418);
    const wood = lam(0x5a3a22);
    // The back bar: a low cabinet, a mirror, and two shelves of bottles.
    const back = FIXTURES.filter((f) => f.kind === 'backbar' && inRect(BAR, f.x, f.y));
    const bx0 = Math.min(...back.map((f) => f.x));
    const bx1 = Math.max(...back.map((f) => f.x)) + 1;
    const bcx = (bx0 + bx1) / 2;
    const bz = Z0 + t + 0.2;
    add(geoBox(bx1 - bx0 - 0.1, 0.55, 0.4), dark, bcx, 0.3, bz);
    add(geoBox(bx1 - bx0 - 0.4, 0.4, 0.02), lam(0x8a9aa8, { emissive: 0x2a3440, emissiveIntensity: 0.8 }), bcx, 0.85, Z0 + t + 0.02, false); // mirror
    const bottleColors = [0x3a7a3a, 0x8a5a2a, 0xc8b8a0, 0x2a4a7a, 0x9a2a2a, 0xd8a83a];
    for (const shelfY of [0.68, 1.02]) {
      add(geoBox(bx1 - bx0 - 0.2, 0.03, 0.2), wood, bcx, shelfY, Z0 + t + 0.1, false);
      for (let i = 0; i < 14; i++) {
        const c = bottleColors[(i * 5 + Math.round(shelfY * 10)) % bottleColors.length];
        add(own(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6)), lam(c, { emissive: c, emissiveIntensity: 0.35 }), bx0 + 0.25 + i * ((bx1 - bx0 - 0.5) / 13), shelfY + 0.11, Z0 + t + 0.1, false);
      }
    }
    // The jukebox: a box with a glowing arched front.
    const jb = FIXTURES.find((f) => f.kind === 'jukebox' && inRect(BAR, f.x, f.y))!;
    add(geoBox(0.6, 0.8, 0.4), lam(0x6a2a1a), jb.x + 0.5, 0.4, Z0 + t + 0.22);
    add(own(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12, 1, false, -Math.PI / 2, Math.PI)).rotateX(Math.PI / 2), lam(0xffb04a, { emissive: 0xff8a2a, emissiveIntensity: 1.1 }), jb.x + 0.5, 0.8, Z0 + t + 0.22, false);
    for (let i = 0; i < 3; i++) add(geoBox(0.08, 0.5, 0.02), lam([0xff5a3a, 0x5ac8ff, 0xffd84a][i], { emissive: [0xff5a3a, 0x5ac8ff, 0xffd84a][i], emissiveIntensity: 1 }), jb.x + 0.32 + i * 0.18, 0.42, Z0 + t + 0.43, false);
    // The counter, with a brass foot rail, beer taps, and a beer in front of each stool.
    const bars = FIXTURES.filter((f) => f.kind === 'bar' && inRect(BAR, f.x, f.y));
    const cx0 = Math.min(...bars.map((f) => f.x));
    const cx1 = Math.max(...bars.map((f) => f.x)) + 1;
    const ccx = (cx0 + cx1) / 2;
    const cz = bars[0].y + 0.5;
    add(geoBox(cx1 - cx0, 0.6, 0.5), dark, ccx, 0.3, cz);
    add(geoBox(cx1 - cx0 + 0.06, 0.06, 0.62), wood, ccx, 0.63, cz);
    add(geoBox(cx1 - cx0, 0.04, 0.04), lam(0xc8a040), ccx, 0.12, cz + 0.3, false); // foot rail
    for (let i = 0; i < 3; i++) add(own(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6)), lam(0xc8a040), ccx - 0.3 + i * 0.3, 0.77, cz - 0.15, false);
    for (const f of bars) {
      add(own(new THREE.CylinderGeometry(0.05, 0.045, 0.14, 8)), lam(0xe0a030, { emissive: 0x8a5010, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }), f.x + 0.5, 0.73, cz + 0.18, false);
      add(own(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8)), lam(0xf2ece0), f.x + 0.5, 0.815, cz + 0.18, false);
      // A stool on the tile below (the drunk sits on it).
      add(own(new THREE.CylinderGeometry(0.03, 0.04, 0.38, 6)), lam(0x2b2b2e), f.x + 0.5, 0.19, f.y + 1.45);
      add(own(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10)), lam(0x7a2a1a), f.x + 0.5, 0.4, f.y + 1.45);
    }
    // Pendant lamps over the counter.
    for (let i = 0; i < 3; i++) {
      add(own(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 4)), lam(0x1e1b18), cx0 + 0.5 + i, 1.05, cz, false);
      add(own(new THREE.ConeGeometry(0.12, 0.1, 8)), lam(0x2a4a3a), cx0 + 0.5 + i, 0.85, cz, false);
      add(own(new THREE.SphereGeometry(0.05, 6, 5)), lam(0xffd8a0, { emissive: 0xffc070, emissiveIntensity: 1.6 }), cx0 + 0.5 + i, 0.8, cz, false);
    }
    // A small round table with two chairs and a candle.
    const tb = FIXTURES.find((f) => f.kind === 'table' && inRect(BAR, f.x, f.y))!;
    add(own(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 6)), lam(0x2b2b2e), tb.x + 0.5, 0.23, tb.y + 0.5);
    add(own(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12)), wood, tb.x + 0.5, 0.46, tb.y + 0.5);
    add(own(new THREE.CylinderGeometry(0.025, 0.025, 0.07, 6)), lam(0xffe8c0, { emissive: 0xffc070, emissiveIntensity: 1.5 }), tb.x + 0.5, 0.52, tb.y + 0.5, false);
    for (const dz of [-0.4, 0.4]) {
      add(geoBox(0.26, 0.04, 0.26), wood, tb.x + 0.5, 0.28, tb.y + 0.5 + dz);
      add(geoBox(0.26, 0.28, 0.04), wood, tb.x + 0.5, 0.42, tb.y + 0.5 + dz * 1.32);
    }
    // A neon beer sign on the east wall and a dartboard on the west wall.
    add(geoBox(0.02, 0.22, 0.6), lam(0x5ac8ff, { emissive: 0x5ac8ff, emissiveIntensity: 1.3 }), X1 - t - 0.02, 0.95, Z0 + 2.6, false);
    add(own(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 14)).rotateZ(Math.PI / 2), lam(0x2a5a2a), BAR.x0 + t + 0.03, 0.85, Z0 + 3.5, false);
    add(own(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 10)).rotateZ(Math.PI / 2), lam(0xb8282a), BAR.x0 + t + 0.035, 0.85, Z0 + 3.5, false);
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
      const stains = new Batch(own(new THREE.CircleGeometry(0.22, 7).rotateX(-Math.PI / 2)), lam(0x1f2023), false);
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
    add(geoBox(0.5, 0.4, 0.02), lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 1.2 }), booth.x + 0.5, 0.95, booth.y + 0.06, false);
    add(geoBox(0.02, 0.4, 0.4), lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 1.2 }), booth.x + 0.94, 0.95, booth.y + 0.5, false);
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

  /** A burning oil drum (the Yard's, and the sewer's for cooking): a rusty drum with flames and a flickering light. */
  const burningBarrel = (x: number, y0: number, z: number) => {
    add(own(new THREE.CylinderGeometry(0.3, 0.3, 0.75, 12)), lam(0x6a4a32, { flatShading: true }), x, y0 + 0.4, z);
    for (const y of [0.2, 0.6]) add(own(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 12)), lam(0x3a2a1e), x, y0 + y, z, false);
    add(own(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 12)), lam(0x2a1a14, { emissive: 0xff5a1a, emissiveIntensity: 1 }), x, y0 + 0.78, z, false);
    for (let i = 0; i < 5; i++) {
      const f = add(own(new THREE.ConeGeometry(0.07 + rng() * 0.04, 0.32, 6)), lam(0xff8a2a, { emissive: 0xff6a1a, emissiveIntensity: 1.7, transparent: true, opacity: 0.9 }), x + (rng() - 0.5) * 0.3, y0 + 0.95, z + (rng() - 0.5) * 0.3, false);
      flames.push(f);
    }
    const light = new THREE.PointLight(0xff8a3a, 5, 6, 1.6);
    light.position.set(x, y0 + 1.2, z);
    scene.add(light);
    fireLights.push(light);
  };

  // ---------- the Yard (007): where the thugs hang out ----------
  // Cracked concrete, graffiti on the walls around it, an old couch, a burning barrel, a chain-link fence along the
  // street with two gaps (the gates), and a single bulb over the back.
  {
    const Y = YARD;
    const X0 = Y.x0;
    const Z0 = Y.y0;
    const X1 = Y.x1 + 1;
    const Z1 = Y.y1 + 1;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    add(geoBox(X1 - X0, 0.075, Z1 - Z0), lam(0x55524d), cx, 0.037, cz, false);
    const cracks = new Batch(geoBox(0.03, 0.004, 0.9), lam(0x2e2c29), false);
    for (let i = 0; i < 14; i++) cracks.add(X0 + 0.4 + rng() * (X1 - X0 - 0.8), 0.077, Z0 + 0.4 + rng() * (Z1 - Z0 - 1.4), 1, 1, 0.5 + rng(), rng() * 6);
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
    };
    // On the bare ground floors of the two side buildings, facing into the Yard.
    graffiti('YARD', '#c8382c', '#7a1a14', 2.6, X0 + 0.03, 0.62, cz - 0.3, Math.PI / 2);
    graffiti('KEEP OUT', '#d8a83a', '#9a5a1a', 3.0, X1 - 0.03, 0.62, cz - 0.2, -Math.PI / 2);
    // The back wall has windows: that tag goes on a sheet of plywood leaning against it, next to the couch.
    {
      const px = X1 - 1.4;
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
    // Chain-link fence along the street: posts and a see-through mesh panel on every fence tile.
    const post = new Batch(own(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6)), lam(0x8a8f96));
    const linkTex = own(canvasTex(32, 32, (g) => {
      g.clearRect(0, 0, 32, 32);
      g.strokeStyle = '#b8bcc2';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 16); g.lineTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.closePath();
      g.stroke();
    }));
    linkTex.repeat.set(4, 4);
    const linkMat = own(new THREE.MeshBasicMaterial({ map: linkTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    for (const f of FIXTURES.filter((x) => x.kind === 'fence')) {
      add(own(new THREE.PlaneGeometry(1, 1.1)), linkMat, f.x + 0.5, 0.6, f.y + 0.5, false).receiveShadow = false;
      post.add(f.x, 0.6, f.y + 0.5);
      post.add(f.x + 1, 0.6, f.y + 0.5);
    }
    post.build(scene);
    // A bare bulb on the back wall.
    add(geoBox(0.12, 0.12, 0.12), lam(0xffe7c2, { emissive: 0xffd9a0, emissiveIntensity: 1.5 }), cx + 1.5, 1.6, Z0 + 0.1, false);
    const bulb = new THREE.PointLight(0xffd9a0, 3, 5, 1.6);
    bulb.position.set(cx + 1.5, 1.5, Z0 + 0.6);
    scene.add(bulb);
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
    // Windows: a lit strip on the front's upper floor, and windows down the brick sides on both floors.
    const winMat = lam(0x6a5032, { emissive: 0xfff0d0, emissiveIntensity: 0.9 });
    const windows = [add(geoBox(X1 - X0 - 0.6, 0.35, 0.03), winMat, cx, TOP - 0.45, ZS + 0.01, false)];
    for (const side of [X0 - 0.01, X1 + 0.01])
      for (let z = ZN + 1; z < ZS - 0.5; z += 2)
        for (const y of z < ZM ? [0.9, F + 0.85] : [F + 0.85]) windows.push(add(geoBox(0.03, 0.6, 0.8), winMat, side, y, z + 0.5, false));
    // The roof, its edge, two air conditioners and a red cross for the helicopters (and the minimap).
    const roof = add(geoBox(X1 - X0, 0.1, ZS - ZN), lam(C.roof), cx, TOP + 0.05, (ZN + ZS) / 2);
    const rim = parapet(cx, (ZN + ZS) / 2, X1 - X0 + 0.06, ZS - ZN + 0.06, TOP + 0.08, mWhite);
    const roofProps = [
      add(geoBox(0.6, 0.3, 0.5), lam(0xd8d8d8), X0 + 1, TOP + 0.25, ZN + 1),
      add(geoBox(0.6, 0.3, 0.5), lam(0xd8d8d8), X0 + 1, TOP + 0.25, ZN + 2),
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
    const roofParts = [add(geoBox(X1 - X0 - 0.2, 0.06, Z1 - Z0 - 0.2), lam(C.roof), cx, HT + 0.03, cz), ...parapet(cx, cz, X1 - X0 + 0.04, Z1 - Z0 + 0.04, HT + 0.08, lam(0x5a3a2e))];
    roofParts.push(add(geoBox(0.6, 0.35, 0.5), lam(0xd8d8d8), X0 + 1.2, HT + 0.2, Z1 - 1.2));
    // The front (south, on the street): the sign, the door, two barred windows with boxes stacked behind them.
    const fz = Z1 + 0.01;
    add(geoBox(3.75, 0.74, 0.06), lam(0x3a2a22), cx, 2.05, fz + 0.02, false);
    add(own(new THREE.PlaneGeometry(3.6, 0.62)), own(new THREE.MeshBasicMaterial({ map: own(signTexture('THRIFT STORE', '#d8cdb8', '#8a2f28')) })), cx, 2.05, fz + 0.06, false);
    add(geoBox(0.8, 1.25, 0.05), lam(0x7a6a5a), cx, 0.63, fz + 0.02, false); // the door
    add(geoBox(0.3, 0.22, 0.02), lam(0x2b2b2e), cx, 0.95, fz + 0.05, false); // its little window
    add(geoBox(0.92, 0.08, 0.1), lam(0x4a3a2e), cx, 1.28, fz + 0.03, false);
    for (const dx of [-1.5, 1.5]) {
      add(geoBox(1.0, 0.8, 0.04), lam(0x3a4048, { emissive: 0x2a2010, emissiveIntensity: 0.6 }), cx + dx, 0.95, fz + 0.02, false);
      add(geoBox(0.4, 0.3, 0.02), lam(0x9a7a52), cx + dx - 0.2, 0.75, fz + 0.03, false); // boxes behind the glass
      for (let i = -2; i <= 2; i++) add(geoBox(0.025, 0.8, 0.03), lam(0x2a2a2e), cx + dx + i * 0.2, 0.95, fz + 0.05, false); // bars
    }
    // Drainpipes down both front corners, a meter box.
    for (const x of [X0 + 0.15, X1 - 0.15]) add(own(new THREE.CylinderGeometry(0.05, 0.05, HT, 8)), lam(0x5a5f66), x, HT / 2, fz + 0.06);
    add(geoBox(0.3, 0.4, 0.12), lam(0x6a6e74), X1 - 0.6, 1.1, fz + 0.08);
    // The back door onto the yard (east wall) with a bare bulb over it.
    add(geoBox(0.05, 1.2, 0.75), lam(0x6a5a4a), X1 + 0.01, 0.6, THRIFT_YARD.y0 + 2.5, false);
    add(geoBox(0.1, 0.1, 0.1), lam(0xffe7c2, { emissive: 0xffd9a0, emissiveIntensity: 1.5 }), X1 + 0.08, 1.5, THRIFT_YARD.y0 + 2.5, false);
    const fade: Fadeable = { walls, mats: [mBrick], props: roofParts, opacity: 1 };
    fadeables.push(fade);

    // The yard.
    const Y0 = THRIFT_YARD.x0;
    const Y1 = THRIFT_YARD.x1 + 1;
    const ycx = (Y0 + Y1) / 2;
    add(geoBox(Y1 - Y0, 0.075, Z1 - Z0), lam(0x5a5852), ycx, 0.037, cz, false);
    const cracks = new Batch(geoBox(0.03, 0.004, 0.8), lam(0x2e2c29), false);
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
    // Chain-link fence with barbed wire along the north (but the gate), east and south edges.
    const linkTex = own(
      canvasTex(32, 32, (g) => {
        g.clearRect(0, 0, 32, 32);
        g.strokeStyle = '#b8bcc2';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 16); g.lineTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.closePath();
        g.stroke();
      }),
    );
    linkTex.repeat.set(4, 4);
    const linkMat = own(new THREE.MeshBasicMaterial({ map: linkTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const postMat = lam(0x8a8f96);
    const fencePanel = (x: number, z: number, alongX: boolean) => {
      const m = add(own(new THREE.PlaneGeometry(1, 1.2)), linkMat, x, 0.65, z, false);
      m.receiveShadow = false;
      if (!alongX) m.rotation.y = Math.PI / 2;
      add(own(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6)), postMat, alongX ? x - 0.5 : x, 0.7, alongX ? z : z - 0.5);
      // barbed wire on top
      add(geoBox(alongX ? 1 : 0.015, 0.015, alongX ? 0.015 : 1), lam(0x6a6e74), x, 1.32, z, false);
    };
    for (let x = Y0; x < Y1; x++) {
      fencePanel(x + 0.5, Z0 + 0.02, true);
      if (x !== THRIFT_GATE[0]) fencePanel(x + 0.5, Z1 - 0.02, true);
    }
    for (let z = Z0; z < Z1; z++) fencePanel(Y1 - 0.02, z + 0.5, false);
    add(own(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6)), postMat, Y1 - 0.02, 0.7, Z1 - 0.02);
    // The gate, swung open into the street.
    const gate = add(own(new THREE.PlaneGeometry(1, 1.15)), linkMat, THRIFT_GATE[0] + 1.0, 0.62, Z1 + 0.45, false);
    gate.rotation.y = Math.PI / 2.4;
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
    // The whole site's ground first (it covers the old street between the two blocks).
    add(geoBox(FACTORY_SITE.x1 + 1 - FACTORY_SITE.x0 + 0.6, 0.09, FACTORY_SITE.y1 + 1 - FACTORY_SITE.y0 + 0.6), pavement, cx, 0.045, (FACTORY_SITE.y0 + FACTORY_SITE.y1 + 1) / 2, false);
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
    const walls = [
      add(geoBox(X1 - X0, HT, t), mBrick, cx, HT / 2, Z0 + t / 2),
      add(geoBox(t, HT, Z1 - Z0), mBrick, X0 + t / 2, HT / 2, cz),
      add(geoBox(t, HT, Z1 - Z0), mBrick, X1 - t / 2, HT / 2, cz),
      add(geoBox(d0 - X0, HT, t), mBrick, (X0 + d0) / 2, HT / 2, Z1 - t / 2),
      add(geoBox(X1 - d1, HT, t), mBrick, (d1 + X1) / 2, HT / 2, Z1 - t / 2),
      add(geoBox(d1 - d0, HT - 2.0, t), mBrick, (d0 + d1) / 2, 2.0 + (HT - 2.0) / 2, Z1 - t / 2),
    ];
    const props: THREE.Object3D[] = [];
    const glassMat = lam(0x3a4650, { emissive: 0x2a2010, emissiveIntensity: 0.5 });
    const broken = lam(0x141618);
    for (let x = X0 + 1; x < X1 - 0.5; x += 1.6) {
      props.push(add(geoBox(1.0, 0.7, 0.03), (x * 7) % 3 < 1 ? broken : glassMat, x + 0.2, HT - 0.9, Z1 + 0.01, false));
      props.push(add(geoBox(1.0, 0.7, 0.03), (x * 5) % 3 < 1 ? broken : glassMat, x + 0.2, HT - 0.9, Z0 - 0.01, false));
    }
    for (let z = Z0 + 1; z < Z1 - 0.5; z += 1.8) {
      props.push(add(geoBox(0.03, 0.7, 1.1), (z * 3) % 3 < 1 ? broken : glassMat, X0 - 0.01, HT - 0.9, z + 0.3, false));
      props.push(add(geoBox(0.03, 0.7, 1.1), (z * 7) % 3 < 1 ? broken : glassMat, X1 + 0.01, HT - 0.9, z + 0.3, false));
    }
    // The roll-up door, rolled up into its box over the opening, and rusty frame.
    props.push(add(geoBox(d1 - d0 + 0.2, 0.35, 0.3), lam(0x7a4a32), (d0 + d1) / 2, 2.1, Z1 + 0.05));
    for (const x of [d0, d1]) props.push(add(geoBox(0.12, 2.0, 0.2), lam(0x5a4a3a), x, 1.0, Z1 + 0.02));
    // A painted name over the door.
    const sign = add(own(new THREE.PlaneGeometry(3.4, 0.55)), own(new THREE.MeshBasicMaterial({ map: own(signTexture('FACTORY', '#3a3632', '#c8b89a')) })), (d0 + d1) / 2, 2.75, Z1 + 0.02, false);
    props.push(sign);
    // The roof: a corrugated sawtooth, three ridges, with skylights (some broken), on top of the walls.
    const roofMat = lam(0x6a6a66, { map: corrugated });
    for (let i = 0; i < 3; i++) {
      const z0 = Z0 + (i * (Z1 - Z0)) / 3;
      const depth = (Z1 - Z0) / 3;
      const slope = add(geoBox(X1 - X0 + 0.3, 0.08, depth * 1.06), roofMat, cx, HT + 0.45, z0 + depth / 2);
      slope.rotation.x = -0.28;
      props.push(slope);
      props.push(add(geoBox(X1 - X0 - 1, 0.04, 0.8), i === 1 ? broken : lam(0x9fb8c8, { emissive: 0x405060, emissiveIntensity: 0.3 }), cx, HT + 0.62, z0 + depth * 0.35, false));
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
    const lines = new Batch(geoBox(0.06, 0.006, 1.8), lam(0x8a8a82), false);
    for (let x = L0 + 2; x < L1 - 0.5; x += 1.5) {
      lines.add(x, 0.113, LZ1 - 1.1);
      lines.add(x, 0.113, LZ0 + 4.2);
    }
    lines.build(scene);
    const cracks = new Batch(geoBox(0.03, 0.004, 1.1), lam(0x26282c), false);
    for (let i = 0; i < 24; i++) cracks.add(L0 + 0.5 + rng() * (L1 - L0 - 1), 0.114, LZ0 + 0.5 + rng() * (LZ1 - LZ0 - 1), 1, 1, 0.5 + rng(), rng() * 6);
    cracks.build(scene);
    const weeds = new Batch(own(new THREE.ConeGeometry(0.06, 0.22, 4)), lam(0x4a6a32), false);
    for (let i = 0; i < 40; i++) weeds.add(L0 + 0.3 + rng() * (L1 - L0 - 0.6), 0.2, LZ0 + 0.3 + rng() * (LZ1 - LZ0 - 0.6), 1, 0.6 + rng() * 0.8, 1, rng() * 3);
    weeds.build(scene);
    // Chain-link fence round the lot (not along the factory), with the opening for cars on the west side.
    const linkTex = own(
      canvasTex(32, 32, (g) => {
        g.clearRect(0, 0, 32, 32);
        g.strokeStyle = '#b8bcc2';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 16); g.lineTo(16, 0); g.lineTo(32, 16); g.lineTo(16, 32); g.closePath();
        g.stroke();
      }),
    );
    linkTex.repeat.set(4, 4);
    const linkMat = own(new THREE.MeshBasicMaterial({ map: linkTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const post = new Batch(own(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6)), lam(0x8a8f96));
    const panel = (x: number, z: number, alongX: boolean) => {
      const m = add(own(new THREE.PlaneGeometry(1, 1.2)), linkMat, x, 0.7, z, false);
      m.receiveShadow = false;
      if (!alongX) m.rotation.y = Math.PI / 2;
      post.add(alongX ? x - 0.5 : x, 0.7, alongX ? z : z - 0.5);
    };
    const gate = new Set(FACTORY_LOT_GATE.map(([, y]) => y));
    for (let x = L0; x < L1; x++) panel(x + 0.5, LZ1 - 0.02, true);
    for (let z = LZ0; z < LZ1; z++) {
      if (!gate.has(z)) panel(L0 + 0.02, z + 0.5, false);
      panel(L1 - 0.02, z + 0.5, false);
    }
    post.build(scene);
    // A lamp post in the lot, and a few old tyres and pallets.
    add(geoBox(0.08, 2.6, 0.08), lam(0x2b2b2e), L1 - 1.2, 1.3, LZ0 + 1.2);
    add(geoBox(0.3, 0.06, 0.2), lam(0xfff0c8, { emissive: 0xffe2a8, emissiveIntensity: 1.6 }), L1 - 1.4, 2.6, LZ0 + 1.2, false);
    for (const [x, z] of [[L0 + 2, LZ1 - 2.5], [L0 + 2.4, LZ1 - 2.2]]) add(own(new THREE.TorusGeometry(0.2, 0.08, 6, 12)), lam(0x1e1e22), x, 0.18, z).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) add(geoBox(0.9, 0.04, 0.12), lam(0x8a6a44), L1 - 2, 0.13, LZ1 - 3 + i * 0.2, false);
  }

  // ---------- the pothole and the sewer under the city (rats; docs/design.md §12) ----------
  // On the street: an open manhole in the crossing, broken asphalt round it, the cover lying next to it, two cones.
  // Below (SEWER_DEPTH down, where the camera follows you): a cut-away sewer like a model: grimy brick walls with moss,
  // pipes and two lanterns, a walkway each side of a channel of green sewage, two grate bridges, the ladder up to a
  // shaft of street light, the tunnel's dark arch at the east end, crates and rubbish bags.
  const links: THREE.Object3D[] = [];
  {
    const hole = new THREE.Group();
    const hx = MANHOLE[0] + 0.5;
    const hz = MANHOLE[1] + 0.5;
    const iron = lam(0x2e3034);
    const black = new THREE.Mesh(own(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20)), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    black.position.set(hx, 0.012, hz);
    hole.add(black);
    const rim = new THREE.Mesh(own(new THREE.TorusGeometry(0.42, 0.05, 6, 20)), iron);
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
    const cover = new THREE.Mesh(own(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 18)), lam(0x45474c));
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
    add(geoBox(0.3, WALL + 1.2, Z1 - Z0), brick(Z1 - Z0), X1 + 0.15, D + WALL / 2 - 0.6, (Z0 + Z1) / 2);
    {
      const ccz = (CH0 + CH1) / 2;
      const ring = new THREE.Mesh(own(new THREE.TorusGeometry(2.05, 0.28, 8, 24, Math.PI)), lam(0x7a7e72, { flatShading: true }));
      ring.rotation.y = -Math.PI / 2;
      ring.position.set(X1 - 0.02, D - 0.55, ccz);
      scene.add(ring);
      const dark = new THREE.Mesh(own(new THREE.CircleGeometry(1.95, 24, 0, Math.PI)), new THREE.MeshBasicMaterial({ color: 0x030403 }));
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
      const wheel = add(own(new THREE.TorusGeometry(0.28, 0.06, 6, 14)), dark, x - 0.1, 1.5, z + 0.45);
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
    add(own(new THREE.CircleGeometry(1.4, 20).rotateX(-Math.PI / 2)), lam(0x8a8070), x, 0.095, z, false);
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
  const poolMesh = pools.build(scene);
  if (poolMesh) poolMesh.receiveShadow = false;
  for (const b of [poles, lampHeads, lampGlow, lightBox, redDot, greenDot]) b.build(scene);
  trunks.build(scene);
  crowns.forEach((b) => b.build(scene));

  return {
    fadeables,
    /** The hospital's staircases (tap one to go up or down). */
    stairs,
    /** The pothole and the sewer's ladder (tap to climb: userData.linkId). */
    links,
    /** Call every frame: the barbecue's flames flicker. */
    animate(t: number) {
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
