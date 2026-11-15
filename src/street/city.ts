// Builds the static city for the Street view in the "toy town" style from docs/design.md §7b:
// asphalt with lane lines and zebra crossings, light pavements, cream buildings with window
// grids, coloured trims, rooftop props and striped awnings, round low-poly trees, lamps,
// traffic lights, and a bright river with a stone quay around the island.
// Lots of repeated things (trees, lamps, road paint) use InstancedMesh so phones stay smooth.
import * as THREE from 'three';
import { BLOCK, BLOCKS, BUILDINGS, COLS, H, NODES, NPCS, RIVER, ROWS, STORE_BLOCK, W } from './map';
import { mulberry32 } from '../game/rng';

const C = {
  asphalt: 0x6e727a,
  paint: 0xf4f1e8,
  pavement: 0xd8d4cb,
  grass: 0x7cc457,
  farGrass: 0x8fd062,
  water: 0x56b4dd,
  quay: 0xd8d2c4,
  rail: 0xf2efe8,
  roof: 0xbab6ad,
  walls: [0xf4efe4, 0xefe7d8, 0xf7f3ec, 0xe9e1d2, 0xf1e3d3],
  trims: [0xd9473a, 0x2f9e9a, 0xf0b13c, 0x3a6ea5, 0xe07b39],
  trunk: 0x8a5a36,
  leaves: [0x5fb84a, 0x4ea83f, 0x7cc94f],
};

/** One building that can fade out when it stands between the camera and you. */
export interface Fadeable {
  walls: THREE.Mesh[];
  mats: THREE.Material[];
  props: THREE.Object3D[];
  opacity: number;
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

/** One window per tile: white wall around a blue glass pane. Tinted by the wall colour. */
const windowTex = () =>
  canvasTex(64, 64, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#7fa9c4';
    g.fillRect(14, 14, 36, 34);
    g.fillStyle = '#b9dcef';
    g.fillRect(14, 14, 36, 12);
    g.fillStyle = '#d9d4ca';
    g.fillRect(12, 48, 40, 4);
  });

const stripeTex = (color: string) =>
  canvasTex(64, 16, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : color;
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
      // A few street trees along the pavement edge (never in front of a spot or Eddy).
      for (let i = 0; i < 5; i++) {
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
  const lampGlow = new Batch(geoBox(0.16, 0.02, 0.07), lam(0xfff2a8, { emissive: 0xfff2a8, emissiveIntensity: 0.6 }), false);
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
  for (const b of [poles, lampHeads, lampGlow, lightBox, redDot, greenDot]) b.build(scene);

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
  const baseWindows = own(windowTex());
  const fadeables: Fadeable[] = [];
  const FLOOR = 0.55;
  for (const b of BUILDINGS) {
    const floors = Math.max(1, Math.round(b.height / FLOOR));
    const height = floors * FLOOR + 0.12;
    const wall = C.walls[Math.floor(rng() * C.walls.length)];
    const trim = C.trims[Math.floor(rng() * C.trims.length)];
    const texX = own(baseWindows.clone());
    texX.repeat.set(b.w, floors);
    texX.needsUpdate = true;
    const texZ = own(baseWindows.clone());
    texZ.repeat.set(b.h, floors);
    texZ.needsUpdate = true;
    // Each building gets its own materials so it can fade on its own.
    const mX = lam(wall, { map: texX });
    const mZ = lam(wall, { map: texZ });
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
      const glass = add(geoBox(Math.max(0.6, bw - 0.5), 0.42, 0.05), lam(0x9fd0e8), cx, 0.27, b.y + b.h - 0.04, false);
      const stripe = own(stripeTex(`#${C.trims[Math.floor(rng() * C.trims.length)].toString(16).padStart(6, '0')}`));
      stripe.repeat.set(Math.max(1, Math.round(bw)), 1);
      const awning = add(geoBox(Math.max(0.7, bw - 0.3), 0.04, 0.38), lam(0xffffff, { map: stripe }), cx, 0.6, b.y + b.h + 0.12);
      awning.rotation.x = 0.35;
      props.push(glass, awning);
    }
    fadeables.push({ walls: [walls, ...trimBand], mats: [mX, mZ, mRoof, mTrim], props, opacity: 1 });
  }

  // ---------- Eddy's General Store ----------
  {
    const [sx, sy] = STORE_BLOCK;
    const cx = sx * BLOCK + 2 + 2.5;
    const cz = sy * BLOCK + 2 + 2.5;
    const sh = 1.25;
    const mWall = lam(0xf7f3ec);
    const mTrim = lam(0x2f7a46);
    const mRoof = lam(C.roof);
    const shop = add(geoBox(4.9, sh, 4.9), [mWall, mWall, mRoof, mRoof, mWall, mWall], cx, sh / 2, cz);
    const trimBand = parapet(cx, cz, 4.96, 4.96, sh + 0.04, mTrim);
    const glass = add(geoBox(3.6, 0.55, 0.05), lam(0x9fd0e8), cx, 0.36, cz + 2.45, false);
    const stripe = own(stripeTex('#2f7a46'));
    stripe.repeat.set(5, 1);
    const awning = add(geoBox(4.2, 0.05, 0.6), lam(0xffffff, { map: stripe }), cx, 0.82, cz + 2.65);
    awning.rotation.x = 0.4;
    const signMat = own(new THREE.MeshBasicMaterial({ map: own(signTexture('GENERAL STORE')) }));
    const sign = add(own(new THREE.PlaneGeometry(3.2, 0.6)), signMat, cx, sh + 0.42, cz + 2.47, false);
    const signBack = add(geoBox(3.3, 0.68, 0.06), mTrim, cx, sh + 0.42, cz + 2.42);
    const door = add(geoBox(0.6, 0.75, 0.06), lam(0x2f7a46), cx, 0.38, cz + 2.47, false);
    for (let i = 0; i < 2; i++) add(geoBox(0.3, 0.18, 0.24), lam(0xe8e8e8), cx - 1.5 + i * 2.4, sh + 0.09, cz - 1.2);
    fadeables.push({ walls: [shop, ...trimBand], mats: [mWall, mRoof, mTrim], props: [glass, awning, sign, signBack, door], opacity: 1 });
  }

  // Build all instanced batches that were filled above.
  trunks.build(scene);
  crowns.forEach((b) => b.build(scene));

  return {
    fadeables,
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
    const goal = hit.has(f) ? 0.12 : 1;
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
