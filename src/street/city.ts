// Builds the static city for the Street view: low-poly "model town" shapes in a dark, gritty
// dusk palette (docs/design.md §7b), on an island in the ocean:
// asphalt with lane lines and zebra crossings, pavements, brick and concrete buildings with window
// grids, coloured trims, rooftop props and striped awnings, round low-poly trees, lamps,
// traffic lights, and a beach with rocks where the island meets the ocean. Plus the special places
// where crimes happen: the big park with its fountain, the basketball court, Eddy's store.
// Lots of repeated things (trees, lamps, road paint) use InstancedMesh so phones stay smooth.
import * as THREE from 'three';
import { BEACH, BLOCK, BLOCKS, BUILDINGS, CANDY, COLS, COURT, FIXTURES, H, NODES, NPCS, PARK, ROWS, STORE, W, inRect, type Room } from './map';
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
  add(geoBox(W + 0.3, 0.12, H + 0.3), lam(C.quay), W / 2, -0.05, H / 2, false); // a low kerb where the streets meet the sand
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

  // ---------- road paint: dashed centre lines and zebra crossings ----------
  const dash = new Batch(geoBox(0.07, 0.01, 0.42), lam(C.paint), false);
  const zebra = new Batch(geoBox(0.16, 0.01, 0.62), lam(C.paint), false);
  const inIntersection = (v: number) => v % BLOCK < 2;
  for (let k = 0; k <= COLS; k++) {
    const x = k * BLOCK + 1; // centre of a vertical road
    for (let z = 0; z < H; z++) if (!inIntersection(z) && !inRect(PARK, Math.floor(x), z)) dash.add(x, 0.006, z + 0.5);
  }
  for (let k = 0; k <= ROWS; k++) {
    const z = k * BLOCK + 1;
    for (let x = 0; x < W; x++) if (!inIntersection(x)) dash.add(x + 0.5, 0.006, z, 1, 1, 1, Math.PI / 2);
  }
  // Zebra crossings on the four sides of the inner intersections.
  for (let i = 1; i < COLS; i++)
    for (let j = 1; j < ROWS; j++) {
      const ix = i * BLOCK + 1;
      const iz = j * BLOCK + 1;
      const z = (x: number, zz: number, rot = 0) => !inRect(PARK, Math.floor(x), Math.floor(zz)) && zebra.add(x, 0.007, zz, 1, 1, 1, rot);
      for (let s = 0; s < 6; s++) {
        const off = -0.75 + s * 0.3;
        z(ix + off, iz - 1.45); // north
        z(ix + off, iz + 1.45); // south
        z(ix - 1.45, iz + off, Math.PI / 2); // west
        z(ix + 1.45, iz + off, Math.PI / 2); // east
      }
    }
  dash.build(scene);
  zebra.build(scene);

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
  const busy = new Set<string>(); // tiles with spots/NPCs: keep trees off them
  for (const n of NODES) busy.add(`${n.x},${n.y}`);
  for (const p of NPCS) busy.add(`${p.x},${p.y}`);
  for (let bx = 0; bx < COLS; bx++)
    for (let by = 0; by < ROWS; by++) {
      const kind = BLOCKS.get(`${bx},${by}`)!;
      const cx = bx * BLOCK + 2 + 2.5;
      const cz = by * BLOCK + 2 + 2.5;
      if (kind.type === 'special') continue; // drawn by their own sections below
      add(geoBox(5.6, 0.06, 5.6), pavement, cx, 0.03, cz, false);
      if (kind.type === 'park') {
        add(geoBox(5, 0.08, 5), grassMat, cx, 0.04, cz, false);
        for (let i = 0; i < 6; i++) tree(cx - 2 + rng() * 4, cz - 2 + rng() * 4, 0.9 + rng() * 0.5);
      }
      // A few street trees along the pavement edge (never in front of a spot, and not in Eddy's shop).
      for (let i = 0; i < 5; i++) {
        if (rng() < 0.55) continue;
        const along = 2 + i;
        const tx = bx * BLOCK + along;
        const tz = by * BLOCK + 7;
        if (busy.has(`${tx},${tz}`) || busy.has(`${tx},${tz - 1}`)) continue;
        tree(tx + 0.5, by * BLOCK + 6.85, 0.75);
      }
    }

  // ---------- street lamps and traffic lights ----------
  const poleGeo = own(new THREE.CylinderGeometry(0.03, 0.035, 1.35, 6));
  const poles = new Batch(poleGeo, lam(0x5a5f66));
  const lampHeads = new Batch(geoBox(0.22, 0.05, 0.1), lam(0x5a5f66));
  const lampGlow = new Batch(geoBox(0.16, 0.03, 0.08), lam(C.lamp, { emissive: C.lamp, emissiveIntensity: 1.6 }), false);
  const poolMat = own(new THREE.MeshBasicMaterial({ map: own(lightPoolTex()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pools = new Batch(own(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2)), poolMat, false);
  const lightBox = new Batch(geoBox(0.1, 0.28, 0.1), lam(0x2b2b2e));
  const redDot = new Batch(geoBox(0.05, 0.05, 0.02), lam(0xe0473a, { emissive: 0xe0473a, emissiveIntensity: 0.8 }), false);
  const greenDot = new Batch(geoBox(0.05, 0.05, 0.02), lam(0x5bd06a, { emissive: 0x5bd06a, emissiveIntensity: 0.8 }), false);
  for (let bx = 0; bx < COLS; bx++)
    for (let by = 0; by < ROWS; by++) {
      // two lamps per block, on opposite corners of the pavement
      for (const [lx, lz] of [[bx * BLOCK + 1.85, by * BLOCK + 1.85], [bx * BLOCK + 7.15, by * BLOCK + 7.15]]) {
        poles.add(lx, 0.68, lz);
        lampHeads.add(lx + 0.08, 1.36, lz);
        lampGlow.add(lx + 0.12, 1.33, lz);
        pools.add(lx + 0.12, 0.075, lz);
      }
    }
  for (let i = 1; i < COLS; i++)
    for (let j = 1; j < ROWS; j++) {
      const x = i * BLOCK + 2.15;
      const z = j * BLOCK + 2.15;
      if (inRect(PARK, Math.floor(x), Math.floor(z))) continue;
      poles.add(x, 0.68, z);
      lightBox.add(x, 1.45, z);
      ((i + j) % 2 ? redDot : greenDot).add(x, 1.5, z - 0.06);
    }

  // ---------- grime: dumpsters and trash bags on the pavements ----------
  const dumpsters = new Batch(geoBox(0.55, 0.38, 0.32), lam(0x2f4a36));
  const dumpLids = new Batch(geoBox(0.57, 0.04, 0.34), lam(0x1f2a22));
  const bags = new Batch(own(new THREE.IcosahedronGeometry(0.13, 0)), lam(0x1c1c1f, { flatShading: true }));
  for (let bx = 0; bx < COLS; bx++)
    for (let by = 0; by < ROWS; by++) {
      if (BLOCKS.get(`${bx},${by}`)?.type !== 'buildings' || rng() < 0.5) continue;
      // Along the block's east side (no spots there), facing the road.
      const x = bx * BLOCK + 7 - 0.12;
      const z = by * BLOCK + 3 + rng() * 3;
      dumpsters.add(x, 0.25, z, 1, 1, 1, Math.PI / 2);
      dumpLids.add(x, 0.45, z, 1, 1, 1, Math.PI / 2);
      for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) bags.add(x - 0.05 + rng() * 0.15, 0.12, z + 0.35 + rng() * 0.4, 1, 0.8 + rng() * 0.3, 1, rng() * 3);
    }
  for (const b of [dumpsters, dumpLids, bags]) b.build(scene);

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
  const FLOOR = 0.55;
  for (const b of BUILDINGS) {
    const floors = Math.max(1, Math.round(b.height / FLOOR));
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
    const mX = lam(wall, { map: tex(atlas.map, b.w), emissiveMap: tex(atlas.glow, b.w), emissive: C.litWindow, emissiveIntensity: 1 });
    const mZ = lam(wall, { map: tex(atlas.map, b.h), emissiveMap: tex(atlas.glow, b.h), emissive: C.litWindow, emissiveIntensity: 1 });
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
    // Some ground floors are shops facing the street (south side): glass front + striped awning.
    const facesStreet = (b.y + b.h) % BLOCK === 0;
    if (facesStreet && rng() < 0.55) {
      const glass = add(geoBox(Math.max(0.6, bw - 0.5), 0.42, 0.05), lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 0.7 }), cx, 0.27, b.y + b.h - 0.04, false);
      const stripe = own(stripeTex(`#${C.trims[Math.floor(rng() * C.trims.length)].toString(16).padStart(6, '0')}`, '#b8b0a0'));
      stripe.repeat.set(Math.max(1, Math.round(bw)), 1);
      const awning = add(geoBox(Math.max(0.7, bw - 0.3), 0.04, 0.38), lam(0xffffff, { map: stripe }), cx, 0.6, b.y + b.h + 0.12);
      awning.rotation.x = 0.35;
      props.push(glass, awning);
    }
    fadeables.push({ walls: [walls, ...trimBand], mats: [mX, mZ, mRoof, mTrim], props, opacity: 1 });
  }

  // ---------- the big park (Pickpocket Tourists) ----------
  // Lawn over two blocks and the road between them; hedges with gaps; gravel paths in a cross; a
  // fountain in the middle with benches; trees, flowerbeds and two old lamps.
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
    for (let i = 0; i < 26; i++) patch.add(X0 + 0.6 + rng() * (X1 - X0 - 1.2), 0.082 + i * 0.0002, Z0 + 0.6 + rng() * (Z1 - Z0 - 1.2), 0.6 + rng(), 1, 0.6 + rng(), rng() * 6);
    patch.build(scene);
    // Paths: one across the middle, two down through the gaps in the hedges.
    const gravel = lam(0x8a8070);
    const midZ = P.y0 + 2.5;
    add(geoBox(X1 - X0, 0.02, 0.8), gravel, cx, 0.09, midZ, false);
    for (const gx of [P.x0 + 3.5, P.x1 - 2.5]) add(geoBox(0.8, 0.02, Z1 - Z0), gravel, gx, 0.091, cz, false);
    // A gravel circle around the fountain.
    const ringPath = new THREE.Mesh(own(new THREE.CircleGeometry(1.55, 20).rotateX(-Math.PI / 2)), gravel);
    ringPath.position.set(cx, 0.092, midZ);
    ringPath.receiveShadow = true;
    scene.add(ringPath);
    // The fountain: a low stone basin with water, a pillar and a top bowl. The water glows a little.
    const stone = lam(0x8e877b, { flatShading: true });
    add(own(new THREE.CylinderGeometry(0.95, 1.02, 0.28, 12)), stone, cx, 0.22, midZ);
    add(own(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 12)), lam(0x2f6f86, { emissive: 0x1d4a5c, emissiveIntensity: 0.6 }), cx, 0.34, midZ, false);
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
    // Two old park lamps by the paths.
    for (const [lx, lz] of [[P.x0 + 4.2, midZ - 0.6], [P.x1 - 3.2, midZ + 0.6]]) {
      poles.add(lx, 0.68, lz);
      lampHeads.add(lx + 0.08, 1.36, lz);
      lampGlow.add(lx + 0.12, 1.33, lz);
      pools.add(lx + 0.12, 0.095, lz);
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
    const sh = st.height ?? 1.25;
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
      add(geoBox(1, sh - 0.85, t), mWall, doorX + 0.5, 0.85 + (sh - 0.85) / 2, Z1 - t / 2), // above the door
    ];
    const roof = add(geoBox(X1 - X0, 0.08, Z1 - Z0), mRoof, cx, sh + 0.04, cz);
    const trimBand = parapet(cx, cz, X1 - X0 + 0.06, Z1 - Z0 + 0.06, sh + 0.06, mTrim);
    // Shop windows either side of the door, lit from inside.
    const glassMat = lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 1.1 });
    const winL = add(geoBox(1.3, 0.5, 0.04), glassMat, X0 + 1, 0.55, Z1 + 0.005, false);
    const winR = add(geoBox(1.3, 0.5, 0.04), glassMat, X1 - 1, 0.55, Z1 + 0.005, false);
    const doorFrame = add(geoBox(1.04, 0.06, 0.14), mTrim, doorX + 0.5, 0.86, Z1 - t / 2, false);
    const stripe = own(stripeTex(st.stripe[0], st.stripe[1]));
    stripe.repeat.set(5, 1);
    const awning = add(geoBox(X1 - X0 - 0.8, 0.05, 0.6), lam(0xffffff, { map: stripe }), cx, 0.98, Z1 + 0.22);
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
    lamp.position.set(cx, 1.1, cz);
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

  // Build all instanced batches that were filled above.
  const poolMesh = pools.build(scene);
  if (poolMesh) poolMesh.receiveShadow = false;
  for (const b of [poles, lampHeads, lampGlow, lightBox, redDot, greenDot]) b.build(scene);
  trunks.build(scene);
  crowns.forEach((b) => b.build(scene));

  return {
    fadeables,
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
    const to = target.clone().setY(yOff);
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
