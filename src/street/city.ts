// Builds the static city for the Street view: low-poly "model town" shapes in a dark, gritty
// dusk palette (docs/design.md §7b):
// asphalt with lane lines and zebra crossings, light pavements, cream buildings with window
// grids, coloured trims, rooftop props and striped awnings, round low-poly trees, lamps,
// traffic lights, and a bright river with a stone quay around the island.
// Lots of repeated things (trees, lamps, road paint) use InstancedMesh so phones stay smooth.
import * as THREE from 'three';
import { BLOCK, BLOCKS, BUILDINGS, COLS, H, NODES, NPCS, RIVER, ROWS, STORE, STORE_FIXTURES, W } from './map';
import { mulberry32 } from '../game/rng';

// Gritty dusk palette: brick, grimy concrete, soot; muted trims; worn paint.
const C = {
  asphalt: 0x34373d,
  paint: 0x9c978a,
  pavement: 0x6d6962,
  grass: 0x45663a,
  farGrass: 0x2f4426,
  water: 0x1f4558,
  quay: 0x5e5951,
  rail: 0x2e2e30,
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
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // ---------- island, river, quay ----------
  const plane = (w: number, h: number, color: number, y: number, cx = W / 2, cz = H / 2) => {
    const m = new THREE.Mesh(own(new THREE.PlaneGeometry(w, h)), lam(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, y, cz);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  plane(W + 160, H + 160, C.farGrass, -0.35);
  plane(W + RIVER * 2, H + RIVER * 2, C.water, -0.25);
  plane(W, H, C.asphalt, 0);
  for (const [x, z, w, d] of [
    [W / 2, -0.12, W + 0.5, 0.24], [W / 2, H + 0.12, W + 0.5, 0.24], [-0.12, H / 2, 0.24, H + 0.5], [W + 0.12, H / 2, 0.24, H + 0.5],
  ] as const) {
    add(geoBox(w, 0.42, d), lam(C.quay), x, -0.13, z, false);
    add(geoBox(w, 0.04, d * 0.35), lam(C.rail), x, 0.3, z, false);
  }

  // ---------- road paint: dashed centre lines and zebra crossings ----------
  const dash = new Batch(geoBox(0.07, 0.01, 0.42), lam(C.paint), false);
  const zebra = new Batch(geoBox(0.16, 0.01, 0.62), lam(C.paint), false);
  const inIntersection = (v: number) => v % BLOCK < 2;
  for (let k = 0; k <= COLS; k++) {
    const x = k * BLOCK + 1; // centre of a vertical road
    for (let z = 0; z < H; z++) if (!inIntersection(z)) dash.add(x, 0.006, z + 0.5);
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
      for (let s = 0; s < 6; s++) {
        const off = -0.75 + s * 0.3;
        zebra.add(ix + off, 0.007, iz - 1.45, 1, 1, 1); // north
        zebra.add(ix + off, 0.007, iz + 1.45, 1, 1, 1); // south
        zebra.add(ix - 1.45, 0.007, iz + off, 1, 1, 1, Math.PI / 2); // west
        zebra.add(ix + 1.45, 0.007, iz + off, 1, 1, 1, Math.PI / 2); // east
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
      add(geoBox(5.6, 0.06, 5.6), pavement, cx, 0.03, cz, false);
      if (kind.type === 'park') {
        add(geoBox(5, 0.08, 5), grassMat, cx, 0.04, cz, false);
        for (let i = 0; i < 6; i++) tree(cx - 2 + rng() * 4, cz - 2 + rng() * 4, 0.9 + rng() * 0.5);
      }
      // A few street trees along the pavement edge (never in front of a spot, and not in Eddy's shop).
      for (let i = 0; i < 5 && kind.type !== 'store'; i++) {
        if (rng() < 0.55) continue;
        const along = 2 + i;
        const tx = bx * BLOCK + along;
        const tz = by * BLOCK + 7;
        if (busy.has(`${tx},${tz}`) || busy.has(`${tx},${tz - 1}`)) continue;
        tree(tx + 0.5, by * BLOCK + 6.85, 0.75);
      }
    }
  // Far bank: a ring of trees across the river.
  for (let i = 0; i < 170; i++) {
    const side = i % 4;
    const along = rng();
    const out = RIVER + 0.8 + rng() * 9;
    const x = side < 2 ? along * (W + 2 * out) - out : side === 2 ? -out : W + out;
    const z = side >= 2 ? along * (H + 2 * out) - out : side === 0 ? -out : H + out;
    tree(x, z, 1 + rng() * 0.8);
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
      poles.add(x, 0.68, z);
      lightBox.add(x, 1.45, z);
      ((i + j) % 2 ? redDot : greenDot).add(x, 1.5, z - 0.06);
    }
  const poolMesh = pools.build(scene);
  if (poolMesh) poolMesh.receiveShadow = false;
  for (const b of [poles, lampHeads, lampGlow, lightBox, redDot, greenDot]) b.build(scene);

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

  // ---------- Eddy's General Store: you can walk in ----------
  // Four walls along the block edge with a doorway in the south wall. While you're inside, the walls
  // fade and the roof, sign and awning disappear so you look into the shop.
  let store: Fadeable;
  {
    const X0 = STORE.x0;
    const Z0 = STORE.y0;
    const X1 = STORE.x1 + 1;
    const Z1 = STORE.y1 + 1;
    const cx = (X0 + X1) / 2;
    const sh = 1.25;
    const t = 0.12; // wall thickness
    const [doorX] = STORE.door;
    const mWall = lam(0xa89c86);
    const mTrim = lam(0x2f6b40);
    const mRoof = lam(C.roof);
    const walls = [
      add(geoBox(X1 - X0, sh, t), mWall, cx, sh / 2, Z0 + t / 2), // back
      add(geoBox(t, sh, Z1 - Z0), mWall, X0 + t / 2, sh / 2, (Z0 + Z1) / 2), // west
      add(geoBox(t, sh, Z1 - Z0), mWall, X1 - t / 2, sh / 2, (Z0 + Z1) / 2), // east
      add(geoBox(doorX - X0, sh, t), mWall, (X0 + doorX) / 2, sh / 2, Z1 - t / 2), // front, left of the door
      add(geoBox(X1 - doorX - 1, sh, t), mWall, (doorX + 1 + X1) / 2, sh / 2, Z1 - t / 2), // front, right of the door
      add(geoBox(1, sh - 0.85, t), mWall, doorX + 0.5, 0.85 + (sh - 0.85) / 2, Z1 - t / 2), // above the door
    ];
    const roof = add(geoBox(X1 - X0, 0.08, Z1 - Z0), mRoof, cx, sh + 0.04, (Z0 + Z1) / 2);
    const trimBand = parapet(cx, (Z0 + Z1) / 2, X1 - X0 + 0.06, Z1 - Z0 + 0.06, sh + 0.06, mTrim);
    // Shop windows either side of the door, lit from inside.
    const glassMat = lam(0x6a5032, { emissive: C.litWindow, emissiveIntensity: 1.1 });
    const winL = add(geoBox(1.3, 0.5, 0.04), glassMat, X0 + 1, 0.55, Z1 + 0.005, false);
    const winR = add(geoBox(1.3, 0.5, 0.04), glassMat, X1 - 1, 0.55, Z1 + 0.005, false);
    const doorFrame = add(geoBox(1.04, 0.06, 0.14), mTrim, doorX + 0.5, 0.86, Z1 - t / 2, false);
    const stripe = own(stripeTex('#2f6b40', '#d8d0c0'));
    stripe.repeat.set(5, 1);
    const awning = add(geoBox(4.2, 0.05, 0.6), lam(0xffffff, { map: stripe }), cx, 0.98, Z1 + 0.22);
    awning.rotation.x = 0.4;
    const signMat = own(new THREE.MeshBasicMaterial({ map: own(signTexture('GENERAL STORE')) }));
    const sign = add(own(new THREE.PlaneGeometry(3.2, 0.6)), signMat, cx, sh + 0.42, Z1 + 0.03, false);
    const signBack = add(geoBox(3.3, 0.68, 0.06), mTrim, cx, sh + 0.42, Z1 - 0.02);
    const roofAc = [0, 1].map((i) => add(geoBox(0.3, 0.18, 0.24), lam(0xe8e8e8), cx - 1.5 + i * 2.4, sh + 0.17, Z0 + 1.3));

    // ---- interior ----
    const checker = own(
      canvasTex(64, 64, (g) => {
        g.fillStyle = '#b9b2a4';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#8f877a';
        g.fillRect(0, 0, 32, 32);
        g.fillRect(32, 32, 32, 32);
      }),
    );
    checker.repeat.set(5, 5);
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(X1 - X0 - 0.1, Z1 - Z0 - 0.1)), lam(0xffffff, { map: checker }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.065, (Z0 + Z1) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    // Shelves full of colourful goods, against the walls.
    const productColors = [0xd9473a, 0xf0b13c, 0x3a6ea5, 0x4fa04a, 0xe07b39, 0xf2efe8, 0x8a5ab8];
    const shelfWood = lam(0x6b4a2e);
    for (const f of STORE_FIXTURES.filter((x) => x.kind === 'shelf')) {
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
    // The counter (two tiles wide) with a cash register.
    const counters = STORE_FIXTURES.filter((x) => x.kind === 'counter');
    const ccx = (Math.min(...counters.map((c) => c.x)) + Math.max(...counters.map((c) => c.x)) + 1) / 2;
    const ccz = counters[0].y + 0.5;
    add(geoBox(1.8, 0.5, 0.55), lam(0x5a3d26), ccx, 0.3, ccz);
    add(geoBox(1.86, 0.05, 0.6), lam(0x9a7a52), ccx, 0.57, ccz);
    add(geoBox(0.3, 0.2, 0.24), lam(0x2b2b2e), ccx + 0.5, 0.7, ccz);
    add(geoBox(0.22, 0.08, 0.02), lam(0x5bd06a, { emissive: 0x5bd06a, emissiveIntensity: 0.9 }), ccx + 0.5, 0.78, ccz + 0.13, false);
    // Doormat inside the door.
    add(geoBox(0.8, 0.02, 0.5), lam(0x7a2f28), doorX + 0.5, 0.075, Z1 - 0.4, false);
    // Warm light inside, so the shop glows when you look in.
    const lamp = new THREE.PointLight(0xffc98a, 6, 6, 1.6);
    lamp.position.set(cx, 1.1, (Z0 + Z1) / 2);
    scene.add(lamp);

    store = {
      walls: [...walls, ...trimBand],
      mats: [mWall, mTrim],
      props: [roof, winL, winR, doorFrame, awning, sign, signBack, ...roofAc],
      opacity: 1,
    };
    fadeables.push(store);
  }

  // Build all instanced batches that were filled above.
  trunks.build(scene);
  crowns.forEach((b) => b.build(scene));

  return {
    fadeables,
    store,
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
