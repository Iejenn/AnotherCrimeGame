// Surfaces (v0.60, docs/design.md §18): the pixel textures for what the city is built of (brick, plaster, wood, roof
// felt, stone, metal). Drawn in code (no picture files), 32×32 texels, sampled crisp, in greys: a material multiplies
// its own colour by it, so one texture serves every brick wall whatever its colour.
//
// They're laid by world position (worldUV, called on the city's static meshes before they're merged): one texture
// covers one tile (1 unit) square on any face, so bricks are the same size on every wall and nothing gets stretched;
// a material's map.repeat can scale that (a brick wall: one texture per floor high).
import * as THREE from 'three';

export type SurfaceKind = 'brick' | 'plaster' | 'wood' | 'roof' | 'stone' | 'metal';

/** The textures average about this grey: colours under them are made brighter by SURFACE_GAIN to stay the same. */
const MEAN = 0.84;
export const SURFACE_GAIN = 1 / MEAN;

type Painter = (px: (v: number, x: number, y: number, w?: number, h?: number) => void, rnd: () => number) => void;
const grey = (v: number) => `rgb(${v},${v},${v})`;
const PAINTERS: Record<SurfaceKind, Painter> = {
  // Four courses of bricks, staggered, each its own shade; mortar between.
  brick: (px, rnd) => {
    px(170, 0, 0, 32, 32);
    for (let row = 0; row < 4; row++)
      for (let b = -1; b < 3; b++) {
        const x = b * 16 + (row % 2) * 8;
        px(205 + Math.floor(rnd() * 40), x + 1, row * 8 + 1, 15, 7);
        if (rnd() < 0.25) px(185, x + 3 + Math.floor(rnd() * 9), row * 8 + 2, 3, 2);
      }
  },
  // Render: speckles, a few hairline cracks, darker streaks running down.
  plaster: (px, rnd) => {
    px(215, 0, 0, 32, 32);
    for (let i = 0; i < 70; i++) px(195 + Math.floor(rnd() * 45), Math.floor(rnd() * 32), Math.floor(rnd() * 32));
    for (let i = 0; i < 2; i++) {
      let x = Math.floor(rnd() * 30), y = Math.floor(rnd() * 20);
      for (let k = 0; k < 7; k++) px(170, x, y, 1, 1), (x += rnd() < 0.5 ? 1 : 0), (y += 1);
    }
    for (let i = 0; i < 3; i++) px(198, Math.floor(rnd() * 31), Math.floor(rnd() * 12), 1, 10 + Math.floor(rnd() * 12));
  },
  // Boards (four a tile), grain streaks, dark gaps, a knot now and then.
  wood: (px, rnd) => {
    for (let row = 0; row < 4; row++) {
      px(195 + Math.floor(rnd() * 35), 0, row * 8, 32, 8);
      for (let i = 0; i < 5; i++) px(175 + Math.floor(rnd() * 20), Math.floor(rnd() * 26), row * 8 + 1 + Math.floor(rnd() * 6), 4 + Math.floor(rnd() * 9), 1);
      if (rnd() < 0.4) px(150, Math.floor(rnd() * 30), row * 8 + 3, 2, 2);
      px(130, 0, row * 8 + 7, 32, 1);
    }
  },
  // Roofing felt: gravelly, with the seams of the rolls.
  roof: (px, rnd) => {
    px(210, 0, 0, 32, 32);
    for (let i = 0; i < 110; i++) px(rnd() < 0.5 ? 180 : 238, Math.floor(rnd() * 32), Math.floor(rnd() * 32));
    px(175, 0, 15, 32, 1);
    px(175, 0, 31, 32, 1);
  },
  // Dressed stone: big blocks (two courses a tile), fine joints, a little texture in each.
  stone: (px, rnd) => {
    px(175, 0, 0, 32, 32);
    for (let row = 0; row < 2; row++)
      for (let b = -1; b < 2; b++) {
        const x = b * 24 + (row % 2) * 12;
        px(210 + Math.floor(rnd() * 25), x + 1, row * 16 + 1, 23, 15);
        for (let i = 0; i < 8; i++) px(200 + Math.floor(rnd() * 30), x + 2 + Math.floor(rnd() * 21), row * 16 + 2 + Math.floor(rnd() * 13));
      }
  },
  // Painted metal: brushed streaks, a few scratches.
  metal: (px, rnd) => {
    px(215, 0, 0, 32, 32);
    for (let x = 0; x < 32; x++) if (rnd() < 0.4) px(200 + Math.floor(rnd() * 30), x, 0, 1, 32);
    for (let i = 0; i < 4; i++) px(240, Math.floor(rnd() * 24), Math.floor(rnd() * 32), 4 + Math.floor(rnd() * 8), 1);
  },
};

const cache = new Map<SurfaceKind, THREE.Texture>();
/** A surface's texture (shared), or null where there's no browser (the tests). */
export function surfaceTexture(kind: SurfaceKind): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  let t = cache.get(kind);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    let seed = [...kind].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 11) % 2147483647 || 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    PAINTERS[kind]((v, x, y, w = 1, h = 1) => ((g.fillStyle = grey(v)), g.fillRect(x, y, w, h)), rnd);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    cache.set(kind, t);
  }
  return t;
}

/**
 * Lay a mesh's texture by world position: on each face the UVs are the world coordinates across it (x and z on a floor
 * or roof, along the wall and up on a wall), one unit = one texture. The geometry is copied first (it may be shared).
 */
export function worldUV(m: THREE.Mesh) {
  m.updateMatrixWorld(true);
  const g = m.geometry.clone();
  const pos = g.attributes.position, nor = g.attributes.normal;
  if (!nor) return;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    const [u, v] = Math.abs(n.y) > 0.6 ? [p.x, p.z] : Math.abs(n.x) > Math.abs(n.z) ? [p.z, p.y] : [p.x, p.y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.geometry = g;
}
/** Does this mesh's material (or one of them) want its texture laid by world position? */
export const wantsWorldUV = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material : [m.material]).some((x) => x.userData.worldUV);

const matCache = new Map<string, THREE.MeshLambertMaterial>();
/**
 * A ready material for small props (benches, crates, bins, dumpsters): the surface's texture once over each face
 * (their boxes' own UVs, no world mapping needed), tinted `color`; plain colour where there's no browser. Shared.
 */
export function surfaceMat(kind: SurfaceKind, color: number, repeat = 1): THREE.MeshLambertMaterial {
  const key = `${kind}|${color}|${repeat}`;
  let m = matCache.get(key);
  if (!m) {
    const base = surfaceTexture(kind);
    const map = base ? base.clone() : undefined;
    if (map) (map.repeat.set(repeat, repeat), (map.needsUpdate = true));
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, map });
    if (map) m.color.multiplyScalar(SURFACE_GAIN);
    matCache.set(key, m);
  }
  return m;
}
