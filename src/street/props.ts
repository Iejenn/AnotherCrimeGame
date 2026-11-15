// Small models: cars, the card table, crates and shop doors. Chunky low-poly, bright colours.
import * as THREE from 'three';

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function lambert(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
export function boxGeo(w: number, h: number, d: number) {
  const k = `b${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}
function cylGeo(r: number, h: number, seg = 12) {
  const k = `c${r},${h},${seg}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, h, seg);
    geoCache.set(k, g);
  }
  return g;
}

function add(parent: THREE.Object3D, g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(g, lambert(color));
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export const CAR_COLORS = [0xd9473a, 0x3a6ea5, 0xf0b13c, 0x4fa04a, 0xf2efe8, 0xe07b39, 0x5bb6dc];

/** A chunky cartoon car, pointing along +x. About 1 tile long. */
export function buildCar(color: number): THREE.Group {
  const g = new THREE.Group();
  add(g, boxGeo(0.98, 0.24, 0.52), color, 0, 0.2, 0); // body
  add(g, boxGeo(0.56, 0.22, 0.46), color, -0.06, 0.42, 0); // cabin
  add(g, boxGeo(0.57, 0.15, 0.47), 0x9fd0e8, -0.06, 0.43, 0, false); // windows band
  add(g, boxGeo(0.5, 0.04, 0.48), color, -0.06, 0.54, 0); // roof
  add(g, boxGeo(1.0, 0.06, 0.54), 0xcfcfcf, 0, 0.1, 0); // bumper line
  add(g, boxGeo(0.03, 0.06, 0.1), 0xfff2a8, 0.5, 0.24, 0.17, false); // headlights
  add(g, boxGeo(0.03, 0.06, 0.1), 0xfff2a8, 0.5, 0.24, -0.17, false);
  add(g, boxGeo(0.03, 0.06, 0.1), 0xd23a2a, -0.5, 0.24, 0.17, false); // tail lights
  add(g, boxGeo(0.03, 0.06, 0.1), 0xd23a2a, -0.5, 0.24, -0.17, false);
  for (const [x, z] of [[0.3, 0.25], [0.3, -0.25], [-0.3, 0.25], [-0.3, -0.25]]) {
    const w = add(g, cylGeo(0.11, 0.08), 0x26262a, x, 0.11, z);
    w.rotation.x = Math.PI / 2;
  }
  return g;
}

/** The shell game: a little folding table with three cups. */
export function buildCardTable(): THREE.Group {
  const g = new THREE.Group();
  add(g, boxGeo(0.7, 0.05, 0.45), 0x2f7a46, 0, 0.5, 0);
  for (const x of [-0.3, 0.3]) for (const z of [-0.18, 0.18]) add(g, boxGeo(0.04, 0.5, 0.04), 0x6b4a2e, x, 0.25, z);
  for (const x of [-0.18, 0, 0.18]) add(g, cylGeo(0.05, 0.09, 8), 0xd9473a, x, 0.57, 0, false);
  return g;
}

export function buildCrate(): THREE.Group {
  const g = new THREE.Group();
  add(g, boxGeo(0.6, 0.5, 0.6), 0xb8864a, 0, 0.25, 0);
  add(g, boxGeo(0.62, 0.06, 0.62), 0x8a6235, 0, 0.47, 0);
  return g;
}

/**
 * A shop/house door on the building face. `dx, dz` point from the spot's tile towards the building.
 * Coloured frame + glass, and a little mat on the pavement.
 */
export function buildDoor(dx: number, dz: number, frame = 0xd9473a): THREE.Group {
  const g = new THREE.Group();
  const along = dx ? 'z' : 'x';
  const thick = 0.06;
  const doorW = 0.5;
  const fx = dx * 0.47;
  const fz = dz * 0.47;
  const frameMesh = add(g, along === 'x' ? boxGeo(doorW + 0.12, 0.86, thick) : boxGeo(thick, 0.86, doorW + 0.12), frame, fx, 0.43, fz);
  frameMesh.castShadow = false;
  add(g, along === 'x' ? boxGeo(doorW, 0.74, thick + 0.01) : boxGeo(thick + 0.01, 0.74, doorW), 0x9fd0e8, fx, 0.4, fz, false);
  add(g, boxGeo(0.6, 0.02, 0.6), 0x7a5a3a, 0, 0.065, 0, false);
  return g;
}
