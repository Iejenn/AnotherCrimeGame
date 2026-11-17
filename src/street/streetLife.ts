// Street life (docs/design.md §7c, proposal): the small things that make a street feel lived in and give your eye
// something person-sized to measure the world by: lamps, hydrants, mailboxes, bins, a bus stop, bikes, trees in
// pits, dumpsters in alleys, fire escapes, balconies, stoops. And shop fronts with character (the candy store's
// lollipop sign and window display, Ray's roll-up shutter and barred windows, Eddy's fruit crates).
//
// Sizes are in tiles, at the characters' scale: a person is about 1.2 tall, one floor 1.45, a door 1.1.
// Everything here is a plain THREE.Group placed with its front facing +z (towards the street, when it stands on
// the north side), so callers only position and rotate it.
import { withModel } from './models';
import * as THREE from 'three';
import { boxGeo, buildLoot, lambert } from './props';

const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

function put(parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material | number, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(g, typeof mat === 'number' ? lambert(mat) : mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const glow = (color: number, strength = 1.2) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: strength });

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------- on the pavement ----------------

/** A street lamp: a pole with an arm and a warm head over the road. */
export function buildStreetLamp() {
  const g = new THREE.Group();
  put(g, cyl(0.04, 0.06, 2.3, 8), 0x2b2b2e, 0, 1.15, 0);
  put(g, boxGeo(0.06, 0.06, 0.6), 0x2b2b2e, 0, 2.28, 0.28);
  put(g, boxGeo(0.22, 0.08, 0.26), 0x2b2b2e, 0, 2.24, 0.55);
  put(g, boxGeo(0.18, 0.03, 0.22), glow(0xffd9a0, 2), 0, 2.19, 0.55, false);
  return g;
}

/** A red fire hydrant. */
export function buildHydrant() {
  const g = new THREE.Group();
  put(g, cyl(0.1, 0.12, 0.42), 0xb8282a, 0, 0.21, 0);
  put(g, new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb8282a, 0, 0.42, 0);
  put(g, cyl(0.04, 0.04, 0.3, 8).rotateZ(Math.PI / 2), 0xb8282a, 0, 0.3, 0);
  put(g, cyl(0.13, 0.13, 0.04), 0x8a1e1e, 0, 0.03, 0);
  return g;
}

/** A blue mailbox on legs. */
export function buildMailbox() {
  const g = new THREE.Group();
  put(g, boxGeo(0.42, 0.5, 0.38), 0x2f4f8a, 0, 0.62, 0);
  put(g, cyl(0.21, 0.21, 0.38, 12).rotateX(Math.PI / 2), 0x2f4f8a, 0, 0.87, 0);
  for (const x of [-0.16, 0.16]) put(g, boxGeo(0.05, 0.38, 0.05), 0x22385f, x, 0.19, 0);
  put(g, boxGeo(0.26, 0.04, 0.02), 0x14223a, 0, 0.78, 0.2, false);
  return g;
}

/** A metal trash can, sometimes overflowing. */
export function buildBin(full = false) {
  const g = new THREE.Group();
  put(g, cyl(0.17, 0.15, 0.5, 12), 0x5f6366, 0, 0.25, 0);
  put(g, cyl(0.19, 0.19, 0.05, 12), 0x4a4d50, 0, 0.52, 0);
  if (full) put(g, new THREE.SphereGeometry(0.16, 8, 6), 0x2b2b2e, 0.05, 0.6, 0.02);
  return g;
}

/** A newspaper box (coin-operated), a bright one and a dull one side by side. */
export function buildNewsBoxes() {
  const g = new THREE.Group();
  [0xd9473a, 0x3a6ea5].forEach((c, i) => {
    const x = i * 0.42 - 0.21;
    put(g, boxGeo(0.36, 0.5, 0.32), c, x, 0.5, 0);
    put(g, boxGeo(0.28, 0.18, 0.02), glow(0xe8e2d0, 0.3), x, 0.6, 0.17, false);
    put(g, boxGeo(0.06, 0.25, 0.06), 0x2b2b2e, x, 0.13, 0);
  });
  return g;
}

/** A bench (two people fit). */
export function buildBench(len = 1.3) {
  const g = new THREE.Group();
  put(g, boxGeo(len, 0.06, 0.36), 0x6b4a2e, 0, 0.42, 0);
  put(g, boxGeo(len, 0.3, 0.05), 0x6b4a2e, 0, 0.66, -0.17);
  for (const x of [-len / 2 + 0.08, len / 2 - 0.08]) put(g, boxGeo(0.05, 0.42, 0.36), 0x2b2b2e, x, 0.21, 0);
  return g;
}

/** A bus stop: a glass shelter with a bench, a lit ad panel and the bus sign on a pole. */
export function buildBusStop() {
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc8d8, transparent: true, opacity: 0.35 });
  put(g, boxGeo(2.2, 0.06, 0.9), 0x3a3f45, 0, 1.8, 0); // roof
  put(g, boxGeo(2.2, 1.6, 0.04), glass, 0, 0.95, -0.42, false); // back glass
  put(g, boxGeo(0.04, 1.6, 0.8), glass, -1.08, 0.95, 0, false);
  put(g, boxGeo(0.04, 1.6, 0.8), 0xe8e2d0, 1.08, 0.95, 0); // the ad panel (end wall)
  put(g, boxGeo(0.02, 1.2, 0.6), glow(0xf0b13c, 0.8), 1.11, 0.95, 0, false);
  for (const x of [-1.08, 1.08]) for (const z of [-0.42, 0.42]) put(g, boxGeo(0.06, 1.8, 0.06), 0x3a3f45, x, 0.9, z);
  const bench = buildBench(1.5);
  bench.position.set(-0.1, 0, -0.2);
  g.add(bench);
  // The sign: a pole with a round "BUS" plate.
  put(g, cyl(0.03, 0.03, 2.2, 6), 0x6a6f76, -1.5, 1.1, 0.3);
  const plate = canvas(128, 128, (c) => {
    c.fillStyle = '#2a62c8';
    c.beginPath();
    c.arc(64, 64, 60, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 44px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('BUS', 64, 66);
  });
  put(g, new THREE.CircleGeometry(0.25, 12), new THREE.MeshBasicMaterial({ map: plate }), -1.5, 2.05, 0.32, false);
  return g;
}

/** A bike rack with one bike leaning on it. */
export function buildBikeRack() {
  const g = new THREE.Group();
  for (const x of [-0.4, 0, 0.4]) {
    const hoop = put(g, new THREE.TorusGeometry(0.2, 0.025, 6, 12, Math.PI), 0x8a8f96, x, 0.02, 0);
    hoop.rotation.y = Math.PI / 2;
  }
  // The bike: two wheels and a frame.
  const bike = new THREE.Group();
  for (const z of [-0.36, 0.36]) {
    const w = put(bike, new THREE.TorusGeometry(0.2, 0.025, 6, 10), 0x1e1e22, 0, 0.22, z);
    w.rotation.y = Math.PI / 2;
  }
  put(bike, boxGeo(0.04, 0.04, 0.62), 0xd9473a, 0, 0.42, 0);
  put(bike, boxGeo(0.04, 0.26, 0.04), 0xd9473a, 0, 0.32, -0.12);
  put(bike, boxGeo(0.3, 0.03, 0.03), 0x2b2b2e, 0, 0.56, 0.3);
  bike.position.set(0.2, 0, 0.25);
  bike.rotation.z = 0.12;
  g.add(bike);
  return g;
}

/** A young tree in a square pit with a little iron fence. */
export function buildTreePit(rng = Math.random) {
  const g = new THREE.Group();
  put(g, boxGeo(0.8, 0.03, 0.8), 0x3a2a1e, 0, 0.02, 0, false);
  for (const [x, z, r] of [[0, 0.38, 0], [0, -0.38, 0], [0.38, 0, 1], [-0.38, 0, 1]] as const) {
    const f = put(g, boxGeo(0.78, 0.18, 0.02), 0x2b2b2e, x, 0.09, z);
    f.rotation.y = r ? Math.PI / 2 : 0;
  }
  put(g, cyl(0.05, 0.07, 1.6, 6), 0x4a3423, 0, 0.8, 0);
  const leaves = [0x355a2c, 0x3f6834, 0x2e4f27];
  for (let i = 0; i < 3; i++) {
    const s = 0.45 + rng() * 0.2;
    put(g, new THREE.IcosahedronGeometry(s, 0), new THREE.MeshLambertMaterial({ color: leaves[i], flatShading: true }), (rng() - 0.5) * 0.4, 1.7 + i * 0.25, (rng() - 0.5) * 0.4);
  }
  return g;
}

/** A big green dumpster with a lid half open, and bags next to it. */
export function buildDumpster() {
  const g = new THREE.Group();
  put(g, boxGeo(1.4, 0.8, 0.8), 0x2e5a3a, 0, 0.45, 0);
  const lid = put(g, boxGeo(1.42, 0.05, 0.82), 0x24482e, 0, 0.88, -0.1);
  lid.rotation.x = -0.35;
  for (const x of [-0.55, 0.55]) put(g, cyl(0.06, 0.06, 0.05, 8).rotateX(Math.PI / 2), 0x1e1e22, x, 0.06, 0.38);
  for (let i = 0; i < 3; i++) put(g, new THREE.SphereGeometry(0.2, 8, 6), 0x1e1e22, 0.9 + (i % 2) * 0.25, 0.18, 0.1 + i * 0.22);
  return g;
}

/** An air-con unit sticking out of a wall (for alley walls and windows). */
export function buildAcUnit() {
  const g = new THREE.Group();
  put(g, boxGeo(0.5, 0.36, 0.34), 0xd8d4cc, 0, 0, 0.17);
  put(g, boxGeo(0.4, 0.26, 0.02), 0x8a8f96, 0, 0, 0.35, false);
  return g;
}

// ---------------- on buildings ----------------

/** A flat dark roof with a low rim (parapet) in the trim colour, on top of a w × d box of height h (front at z 0). */
export function roofWithRim(g: THREE.Object3D, w: number, d: number, h: number, trim: number) {
  put(g, boxGeo(w - 0.04, 0.02, d - 0.04), 0x45423e, 0, h + 0.01, -d / 2, false);
  const t = 0.12;
  put(g, boxGeo(w + 0.06, 0.16, t), trim, 0, h + 0.08, 0);
  put(g, boxGeo(w + 0.06, 0.16, t), trim, 0, h + 0.08, -d);
  put(g, boxGeo(t, 0.16, d), trim, -w / 2, h + 0.08, -d / 2);
  put(g, boxGeo(t, 0.16, d), trim, w / 2, h + 0.08, -d / 2);
}

/** A plain building at person scale: floors of windows (some lit), a front door with a step and a lamp. */
export function buildApartment(w: number, d: number, floors: number, wall: number, trim: number, rng = Math.random, door = true) {
  const g = new THREE.Group();
  const FLOOR = 1.45;
  const h = floors * FLOOR + 0.15;
  put(g, boxGeo(w, h, d), wall, 0, h / 2, -d / 2);
  roofWithRim(g, w, d, h, trim);
  const lit = glow(0xffc46b, 0.9);
  const dark = lambert(0x1d2630);
  const doorAt = door ? Math.round((w / 2 - 0.7) * 2) / 2 : 99;
  for (let f = 0; f < floors; f++) {
    for (let x = -w / 2 + 0.75; x <= w / 2 - 0.6; x += 1.15) {
      if (f === 0 && Math.abs(x - doorAt) < 0.6) continue;
      put(g, boxGeo(0.62, 0.86, 0.04), trim, x, f * FLOOR + 0.82, 0.01, false);
      put(g, boxGeo(0.5, 0.74, 0.05), rng() < 0.4 ? lit : dark, x, f * FLOOR + 0.82, 0.02, false);
      put(g, boxGeo(0.66, 0.05, 0.12), 0x9a958c, x, f * FLOOR + 0.42, 0.05, false); // sill
    }
  }
  if (door) {
    put(g, boxGeo(0.7, 1.18, 0.05), trim, doorAt, 0.6, 0.02, false);
    put(g, boxGeo(0.56, 1.08, 0.06), 0x3a2a20, doorAt, 0.56, 0.03, false);
    put(g, boxGeo(0.12, 0.12, 0.08), glow(0xffe7c2, 1.4), doorAt + 0.48, 1.05, 0.06, false);
  }
  g.userData.doorX = doorAt;
  g.userData.height = h;
  return g;
}

/** Steps up to a front door, with railings: a stoop. */
export function buildStoop() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) put(g, boxGeo(0.9, 0.1, 0.32), 0x8a857c, 0, 0.05 + i * 0.1, 0.8 - i * 0.3);
  for (const x of [-0.45, 0.45]) put(g, boxGeo(0.03, 0.04, 0.9), 0x2b2b2e, x, 0.62, 0.5);
  for (const x of [-0.45, 0.45]) for (const z of [0.1, 0.9]) put(g, boxGeo(0.03, 0.6, 0.03), 0x2b2b2e, x, 0.3 + (0.9 - z) * 0.2, z);
  return g;
}

/** A small balcony with railings and a plant pot (hangs on a front wall). */
export function buildBalcony(w = 1.1) {
  const g = new THREE.Group();
  put(g, boxGeo(w, 0.08, 0.5), 0x8a857c, 0, 0, 0.25);
  put(g, boxGeo(w, 0.04, 0.03), 0x2b2b2e, 0, 0.45, 0.5);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) put(g, boxGeo(0.02, 0.45, 0.02), 0x2b2b2e, x, 0.23, 0.5);
  put(g, cyl(0.08, 0.06, 0.14, 8), 0xa0522d, w / 2 - 0.15, 0.11, 0.28);
  put(g, new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshLambertMaterial({ color: 0x3f6834, flatShading: true }), w / 2 - 0.15, 0.26, 0.28);
  return g;
}

/** A zig-zag fire escape down a wall (`floors` landings). */
export function buildFireEscape(floors: number) {
  const g = new THREE.Group();
  const iron = lambert(0x2b2b2e);
  for (let f = 1; f < floors; f++) {
    const y = f * 1.45;
    put(g, boxGeo(1.3, 0.04, 0.5), iron, 0, y, 0.25);
    put(g, boxGeo(1.3, 0.03, 0.02), iron, 0, y + 0.4, 0.5);
    for (const x of [-0.65, 0.65]) put(g, boxGeo(0.02, 0.4, 0.5), iron, x, y + 0.2, 0.25);
    // The stairs down to the landing below, sloping along the wall.
    const stair = put(g, boxGeo(1.75, 0.03, 0.3), iron, 0, y - 0.72, 0.35);
    stair.rotation.z = (f % 2 ? 1 : -1) * 0.84;
  }
  return g;
}

// ---------------- shop fronts with character ----------------

/** A shop sign board (lit), centred on the group. */
export function buildSign(text: string, bg: string, fg: string, w = 3.2, h = 0.6) {
  const g = new THREE.Group();
  const tex = canvas(512, Math.round((512 * h) / w), (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = fg;
    c.lineWidth = 6;
    c.strokeRect(8, 8, 496, c.canvas.height - 16);
    c.fillStyle = fg;
    c.font = `bold ${Math.round(c.canvas.height * 0.55)}px Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, c.canvas.height / 2 + 3);
  });
  put(g, boxGeo(w + 0.1, h + 0.08, 0.06), 0x2b2b2e, 0, 0, -0.04);
  put(g, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0.001, false);
  return g;
}

/** A striped awning (front edge sloping down towards the street). */
export function buildAwning(w: number, color: string, light = '#ffffff', depth = 0.7) {
  const tex = canvas(128, 16, (c) => {
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? light : color;
      c.fillRect(i * 8, 0, 8, 16);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, w / 1.6), 1);
  const g = new THREE.Group();
  const a = put(g, boxGeo(w, 0.05, depth), new THREE.MeshLambertMaterial({ map: tex }), 0, 0, depth / 2);
  a.rotation.x = 0.38;
  // A scalloped valance along the front.
  put(g, boxGeo(w, 0.16, 0.02), new THREE.MeshLambertMaterial({ map: tex }), 0, -0.2, depth - 0.02, false);
  return g;
}

/** A big glass shop window with a frame (lit from inside). */
export function buildShopWindow(w: number, h = 0.95) {
  const g = new THREE.Group();
  put(g, boxGeo(w + 0.1, h + 0.1, 0.05), 0x2b2b2e, 0, h / 2 + 0.35, 0.01, false);
  put(g, boxGeo(w, h, 0.06), glow(0xffc46b, 0.55), 0, h / 2 + 0.35, 0.02, false);
  put(g, boxGeo(w + 0.16, 0.06, 0.18), 0x9a958c, 0, 0.32, 0.08, false); // sill
  return g;
}

/** The candy store's giant lollipop sign: a swirl disc on a striped pole, on the roof corner. */
export function buildLollipop(size = 1) {
  const g = new THREE.Group();
  const swirl = canvas(256, 256, (c) => {
    c.fillStyle = '#ffe6f0';
    c.beginPath();
    c.arc(128, 128, 124, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ff4f9a';
    c.lineWidth = 22;
    c.beginPath();
    for (let a = 0; a < Math.PI * 7; a += 0.05) {
      const r = (a / (Math.PI * 7)) * 112;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      if (a === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  });
  const face = new THREE.MeshLambertMaterial({ map: swirl, emissive: 0xff7ab8, emissiveIntensity: 0.25 });
  // A cylinder's materials: [side, top, bottom]; turned on its side, top and bottom are the two faces.
  const disc = new THREE.Mesh(cyl(0.62 * size, 0.62 * size, 0.12, 28).rotateX(Math.PI / 2), [lambert(0xff7ab8), face, face]);
  disc.position.set(0, 1.5 * size, 0);
  disc.castShadow = true;
  g.add(disc);
  put(g, cyl(0.06 * size, 0.06 * size, 1.0 * size, 8), 0xf2efe8, 0, 0.5 * size, 0);
  return g;
}

/** A candy window display: jars of sweets on two shelves, behind the glass. */
export function buildCandyDisplay(w: number) {
  const g = new THREE.Group();
  const colors = [0xff4f9a, 0xf0b13c, 0x5bd06a, 0x3a9ad9, 0xd9473a, 0x8a5ab8];
  for (const [y, row] of [[0.42, 0], [0.82, 1]] as const) {
    put(g, boxGeo(w, 0.04, 0.3), 0xe8e2d0, 0, y, -0.18, false);
    for (let i = 0, x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.3, i++) {
      put(g, cyl(0.1, 0.1, 0.24, 10), new THREE.MeshLambertMaterial({ color: 0xdff0f8, transparent: true, opacity: 0.5 }), x, y + 0.14, -0.18, false);
      put(g, cyl(0.085, 0.085, 0.16, 10), glow(colors[(i + row * 3) % colors.length], 0.35), x, y + 0.11, -0.18, false);
    }
  }
  return g;
}

/** A metal roll-up shutter, pulled down to `down` (0 = open … 1 = closed), over an opening `w` × `h`. */
export function buildShutter(w: number, h: number, down: number) {
  const g = new THREE.Group();
  const ribs = canvas(32, 64, (c) => {
    c.fillStyle = '#8a8f96';
    c.fillRect(0, 0, 32, 64);
    c.fillStyle = '#6a6f76';
    for (let y = 0; y < 64; y += 8) c.fillRect(0, y, 32, 3);
  });
  ribs.wrapT = THREE.RepeatWrapping;
  ribs.repeat.set(1, (h * down) / 0.5);
  put(g, boxGeo(w + 0.1, 0.22, 0.22), 0x6a6f76, 0, h + 0.05, 0.08); // the box it rolls into
  put(g, boxGeo(w, h * down, 0.04), new THREE.MeshLambertMaterial({ map: ribs }), 0, h - (h * down) / 2, 0.06);
  return g;
}

/** Security bars over a window. */
export function buildBars(w: number, h: number) {
  const g = new THREE.Group();
  for (let x = -w / 2 + 0.08; x <= w / 2 - 0.07; x += 0.12) put(g, boxGeo(0.025, h, 0.025), 0x1e1e22, x, h / 2, 0.06, false);
  for (const y of [0.05, h / 2, h - 0.05]) put(g, boxGeo(w, 0.03, 0.03), 0x1e1e22, 0, y, 0.06, false);
  return g;
}

/** A security camera on a bracket. */
export function buildCamera() {
  const g = new THREE.Group();
  put(g, boxGeo(0.06, 0.06, 0.2), 0x2b2b2e, 0, 0, 0.1);
  const c = put(g, boxGeo(0.12, 0.1, 0.24), 0xe8e8e8, 0, -0.04, 0.26);
  c.rotation.x = 0.4;
  put(g, boxGeo(0.03, 0.03, 0.01), glow(0xd9473a, 2), 0.03, -0.02, 0.38, false);
  return g;
}

/** Eddy's fruit and vegetable crates on a stand outside, with a chalkboard. */
export function buildCrates() {
  const g = new THREE.Group();
  put(g, boxGeo(1.5, 0.08, 0.6), 0x6b4a2e, 0, 0.55, 0);
  for (const x of [-0.7, 0.7]) put(g, boxGeo(0.06, 0.55, 0.6), 0x5a3d26, x, 0.27, 0);
  // Four crates of produce from Kenney's Food Kit (v0.45): apples, oranges, tomatoes, carrots lying in a heap.
  const produce: [string, number, [number, number, number]][] = [
    ['food/apple.glb', 0.7, [0, 0, 0]], ['food/orange.glb', 0.8, [0, 0, 0]], ['food/tomato.glb', 0.85, [0, 0, 0]], ['food/carrot.glb', 0.38, [0, 0, Math.PI / 2]],
  ];
  produce.forEach(([file, scale, [rx, , rz]], i) => {
    const x = -0.55 + i * 0.37;
    put(g, boxGeo(0.33, 0.14, 0.5), 0x9a7a52, x, 0.66, 0);
    for (let j = 0; j < 6; j++) {
      const m = withModel(file, { scale, tone: 'muted', tiltX: rx, tiltZ: rz, rot: j * 1.3 });
      m.position.set(x - 0.08 + (j % 2) * 0.16, rz ? 0.74 + (j % 3) * 0.02 : 0.72, -0.16 + Math.floor(j / 2) * 0.16);
      g.add(m);
    }
  });
  return g;
}

/** A sandwich-board chalkboard ("SANDWICHES $2"). */
export function buildChalkboard(text = 'SALE TODAY') {
  const g = new THREE.Group();
  const tex = canvas(128, 160, (c) => {
    c.fillStyle = '#23302a';
    c.fillRect(0, 0, 128, 160);
    c.fillStyle = '#e8e2d0';
    c.font = 'bold 22px Arial';
    c.textAlign = 'center';
    text.split(' ').forEach((w, i) => c.fillText(w, 64, 46 + i * 34));
  });
  for (const s of [1, -1]) {
    const b = put(g, boxGeo(0.5, 0.66, 0.03), new THREE.MeshLambertMaterial({ map: tex }), 0, 0.33, s * 0.1);
    b.rotation.x = s * -0.22;
  }
  return g;
}

/** A neon "OPEN" sign for a shop window. */
export function buildOpenSign() {
  const g = new THREE.Group();
  const tex = canvas(128, 48, (c) => {
    c.fillStyle = '#140a10';
    c.fillRect(0, 0, 128, 48);
    c.fillStyle = '#ff4f9a';
    c.font = 'bold 34px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('OPEN', 64, 26);
  });
  put(g, new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0, false);
  return g;
}

/** A car at person scale: about three people long (the street's old cars were toy-sized). */
export function buildBigCar(color: number) {
  const g = new THREE.Group();
  put(g, boxGeo(2.7, 0.5, 1.3), color, 0, 0.42, 0); // body
  put(g, boxGeo(1.5, 0.45, 1.18), color, -0.15, 0.88, 0); // cabin
  put(g, boxGeo(1.52, 0.32, 1.2), 0x9fd0e8, -0.15, 0.9, 0, false); // windows
  put(g, boxGeo(1.38, 0.06, 1.2), color, -0.15, 1.12, 0); // roof
  put(g, boxGeo(2.76, 0.12, 1.34), 0xcfcfcf, 0, 0.22, 0); // bumpers
  for (const z of [-0.45, 0.45]) {
    put(g, boxGeo(0.04, 0.12, 0.22), glow(0xfff2a8, 1), 1.36, 0.5, z, false);
    put(g, boxGeo(0.04, 0.12, 0.22), glow(0xd23a2a, 0.8), -1.36, 0.5, z, false);
  }
  for (const [x, z] of [[0.85, 0.62], [0.85, -0.62], [-0.85, 0.62], [-0.85, -0.62]]) put(g, cyl(0.26, 0.26, 0.18, 14).rotateX(Math.PI / 2), 0x1e1e22, x, 0.26, z);
  return g;
}

// ---------------- things lying on the ground (loot) ----------------

/** What an item looks like on the ground: food from the Food Kit, a few bills, metal, gear and quest items. */
/** Food lying on the ground (loot): which Food Kit model, and its scale (the models are about half a tile). */
const FOOD_MODELS: Record<string, [string, number]> = {
  raw_bird_meat: ['meat-raw', 0.65], cooked_bird_meat: ['meat-cooked', 0.65],
  raw_rat_meat: ['meat-raw', 0.6], cooked_rat_meat: ['meat-ribs', 0.6],
  raw_giant_rat_meat: ['meat-raw', 1.0], cooked_giant_rat_meat: ['whole-ham', 0.7],
  candy_bar: ['candy-bar', 1.2], sandwich: ['sandwich', 0.75],
};

export function buildGroundItem(item: string) {
  const g = new THREE.Group();
  if (item === 'cash') {
    for (let i = 0; i < 3; i++) {
      const b = put(g, boxGeo(0.26, 0.015, 0.13), i % 2 ? 0x4f8455 : 0x6a9e68, (i - 1) * 0.04, 0.015 + i * 0.016, (i - 1) * 0.02, false);
      b.rotation.y = i * 0.5;
    }
  } else if (item === 'cooked_rat_antidote') {
    // The cooked rat meat with the green antidote dripped over it.
    withModel('food/meat-ribs.glb', { scale: 0.84, tone: 'dull' }, g);
    for (const [x, z] of [[-0.04, 0.02], [0.05, -0.03], [0.0, 0.06]]) put(g, new THREE.OctahedronGeometry(0.03, 0), 0x5ac04a, x, 0.1, z, false).scale.y = 0.5;
  } else if (FOOD_MODELS[item]) {
    // Food on the ground: a model from Kenney's Food Kit (v0.45), toned down to our colours.
    const [file, size] = FOOD_MODELS[item];
    withModel(`food/${file}.glb`, { scale: size * 1.4, tone: 'dull' }, g);
  } else if (/^(raw|cooked)_(bird|rat)_meat$/.test(item)) {
    const raw = item.startsWith('raw_');
    put(g, new THREE.SphereGeometry(0.11, 8, 6), raw ? 0xe8a0a0 : 0x8a4a22, 0, 0.07, 0).scale.set(1.3, 0.6, 1);
    put(g, cyl(0.025, 0.02, 0.14, 6).rotateZ(Math.PI / 2.4), raw ? 0xf2e2d0 : 0xd8c8a8, 0.12, 0.08, 0); // the bone
  } else {
    // Metal, gear and quest items (props.ts); anything newer than its model is still a small bundle.
    const loot = buildLoot(item);
    if (loot) return loot;
    put(g, boxGeo(0.22, 0.1, 0.16), 0x8a7a5a, 0, 0.05, 0);
  }
  return g;
}

/** An ambulance parked by the hospital: a white box van with a red stripe, red crosses and a light bar (length along x,
 *  front at +x, like buildBigCar). */
export function buildAmbulance() {
  const g = new THREE.Group();
  const white = 0xeeeeea;
  put(g, boxGeo(2.8, 0.42, 1.3), white, 0, 0.42, 0); // chassis
  put(g, boxGeo(1.75, 0.95, 1.32), white, -0.5, 1.05, 0); // the box at the back
  put(g, boxGeo(0.95, 0.5, 1.22), white, 0.82, 0.88, 0); // the cab
  put(g, boxGeo(0.97, 0.3, 1.24), 0x9fd0e8, 0.84, 0.92, 0, false); // cab windows
  put(g, boxGeo(2.84, 0.1, 1.34), 0xc8282a, 0, 0.62, 0, false); // red stripe
  put(g, boxGeo(2.86, 0.12, 1.34), 0xcfcfcf, 0, 0.22, 0); // bumpers
  // Red crosses on both sides of the box, and on the back.
  for (const z of [-0.665, 0.665]) {
    put(g, boxGeo(0.42, 0.12, 0.01), 0xc8282a, -0.5, 1.12, z, false);
    put(g, boxGeo(0.12, 0.42, 0.01), 0xc8282a, -0.5, 1.12, z, false);
  }
  put(g, boxGeo(0.01, 0.12, 0.42), 0xc8282a, -1.38, 1.12, 0, false);
  put(g, boxGeo(0.01, 0.42, 0.12), 0xc8282a, -1.38, 1.12, 0, false);
  // The light bar on the cab: red and blue.
  put(g, boxGeo(0.2, 0.08, 0.36), glow(0xe03a3a, 1.4), 0.75, 1.17, -0.22, false);
  put(g, boxGeo(0.2, 0.08, 0.36), glow(0x3a6ae0, 1.4), 0.75, 1.17, 0.22, false);
  for (const z of [-0.45, 0.45]) {
    put(g, boxGeo(0.04, 0.12, 0.22), glow(0xfff2a8, 1), 1.41, 0.5, z, false);
    put(g, boxGeo(0.04, 0.12, 0.22), glow(0xd23a2a, 0.8), -1.41, 0.5, z, false);
  }
  for (const [x, z] of [[0.85, 0.62], [0.85, -0.62], [-0.85, 0.62], [-0.85, -0.62]]) put(g, cyl(0.26, 0.26, 0.18, 14).rotateX(Math.PI / 2), 0x1e1e22, x, 0.26, z);
  return g;
}
