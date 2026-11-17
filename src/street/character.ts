// Characters: the look options for the character creator, and the low-poly model with simple walk / work / stunned
// animations. Since v0.45 it's built in the old-school RuneScape way (docs/design.md §18): detail and body structure
// (joints, a face, hands, shoes) instead of smooth curves, flat-shaded, about 2,000 triangles at most.
// Everyone on the Street uses this model: you, tourists, the banker, Eddy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Look } from '../game/types';

export const SKIN_TONES = [0xf6d7bd, 0xe0b48f, 0xc08a62, 0x8d5f3e, 0x5c3b26];
export const HAIR_STYLES = ['Bald', 'Short', 'Long', 'Mohawk', 'Cap'];
export const HAIR_COLORS = [0x2a211b, 0x5a3a22, 0x9a6a3a, 0xe2bf5e, 0xa8402a, 0xc8c2b8];
export const TOP_COLORS = [0xd9473a, 0x3a6ea5, 0x4fa04a, 0x2b2b2e, 0xf2efe8, 0x8a5ab8, 0xf0b13c];
export const BOTTOM_COLORS = [0x2f2f35, 0x3b5a85, 0x8a7558, 0x6a6a70, 0x5a3f2a];

export const DEFAULT_LOOK: Look = { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 };

export function randomLook(rng: () => number = Math.random): Look {
  const r = (n: number) => Math.floor(rng() * n);
  return { skin: r(SKIN_TONES.length), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), top: r(TOP_COLORS.length), bottom: r(BOTTOM_COLORS.length) };
}

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// Shared geometry and materials: built once, reused by every character.
// People are the asset you look at most, so they get the most detail (docs/design.md §18: up to about 2,000 triangles),
// spent on STRUCTURE, not smooth curves: a shaped head (jaw, cheeks, brow) with eyes, eyebrows, a nose, a mouth and ears;
// a neck and a shirt collar; a chest broad at the shoulders, a waist, a belt with a buckle, hips and trouser pockets; arms
// in a shoulder, a muscled upper arm, an elbow, a forearm, a cuff and a hand with fingers and a thumb; legs in a thigh, a
// knee cap, a calf and an ankle; shoes with a sole, a heel and a toe cap. Everything 6- or 8-sided and flat-shaded.
// Each character's parts are merged per limb and colour when it's built, so all this detail costs only a few draw calls.

/** A shape made of rings stacked upwards: [height, half width, half depth, forward offset, sideways offset]. Closed at
 *  both ends, flat-shaded (unindexed). */
function stack(rings: [number, number, number, number?, number?][], sides: number): THREE.BufferGeometry {
  const pts = rings.map(([y, w, d, dz = 0, dx = 0]) =>
    Array.from({ length: sides }, (_, i) => {
      const a = ((i + 0.5) / sides) * Math.PI * 2;
      return new THREE.Vector3(dx + Math.sin(a) * w, y, dz + Math.cos(a) * d);
    }),
  );
  const tris: THREE.Vector3[] = [];
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      tris.push(pts[k][i], pts[k][j], pts[k + 1][i], pts[k][j], pts[k + 1][j], pts[k + 1][i]);
    }
  const cap = (k: number, up: boolean) => {
    const [y, , , dz = 0, dx = 0] = rings[k];
    const c = new THREE.Vector3(dx, y, dz);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      if (up) tris.push(c, pts[k][i], pts[k][j]);
      else tris.push(c, pts[k][j], pts[k][i]);
    }
  };
  cap(0, false);
  cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry().setFromPoints(tris);
  g.computeVertexNormals();
  return g;
}

/** Like stack, but lying along z (front to back): for shoes. */
const lying = (rings: [number, number, number, number?, number?][], sides: number) => stack(rings, sides).rotateX(Math.PI / 2);

const geo = {
  // The head (centred on 0; placed at y 1.0): chin, jaw, cheeks, eye line, brow, crown.
  head: stack([[-0.15, 0.04, 0.035, 0.07], [-0.135, 0.07, 0.06, 0.06], [-0.11, 0.1, 0.09, 0.035], [-0.06, 0.128, 0.122, 0.016], [-0.01, 0.138, 0.134, 0.008], [0.04, 0.14, 0.136], [0.09, 0.134, 0.13], [0.135, 0.105, 0.108, -0.01], [0.162, 0.045, 0.05, -0.01]], 10),
  eyeWhite: new THREE.BoxGeometry(0.048, 0.032, 0.012),
  pupil: new THREE.BoxGeometry(0.022, 0.028, 0.012),
  brow: new THREE.BoxGeometry(0.058, 0.014, 0.018),
  nose: stack([[-0.03, 0.022, 0.02, 0.01], [0.0, 0.016, 0.02, 0.012], [0.03, 0.008, 0.012, 0.004]], 4),
  mouth: new THREE.BoxGeometry(0.065, 0.013, 0.012),
  ear: stack([[-0.03, 0.012, 0.018], [0.0, 0.016, 0.028], [0.03, 0.01, 0.02, -0.004]], 6),
  neck: stack([[0.84, 0.056, 0.054], [0.95, 0.05, 0.05]], 8),
  collar: stack([[0.875, 0.085, 0.078, -0.005], [0.91, 0.074, 0.068, -0.01]], 10),
  // The body: hem, waist, ribs, chest, shoulders, sloping in to the neck.
  // (a real waist, the chest rising into sloping shoulders)
  torso: stack([[0.43, 0.145, 0.104], [0.5, 0.138, 0.1], [0.6, 0.152, 0.112], [0.7, 0.176, 0.124], [0.79, 0.19, 0.122], [0.85, 0.182, 0.11], [0.895, 0.12, 0.085], [0.92, 0.07, 0.06]], 10),
  belt: stack([[0.415, 0.152, 0.11], [0.458, 0.15, 0.108]], 10),
  buckle: new THREE.BoxGeometry(0.05, 0.036, 0.012),
  hips: stack([[0.33, 0.138, 0.098], [0.38, 0.148, 0.104], [0.42, 0.15, 0.106]], 10),
  pocket: new THREE.BoxGeometry(0.06, 0.07, 0.01),
  // Legs (from the hip pivot): thigh, knee cap, calf, ankle; a shoe with sole, heel and toe cap.
  thigh: stack([[-0.2, 0.062, 0.066, 0.01], [-0.12, 0.074, 0.078, 0.004], [-0.04, 0.084, 0.086], [0.03, 0.086, 0.088]], 8),
  knee: new THREE.IcosahedronGeometry(0.05, 0),
  calf: stack([[-0.35, 0.042, 0.045, 0.014], [-0.31, 0.05, 0.054, 0.006], [-0.265, 0.062, 0.068, -0.008], [-0.2, 0.06, 0.064, 0.008]], 8),
  // A shoe lying front to back: heel, instep, ball of the foot, a rounded toe.
  shoe: lying([[-0.085, 0.045, 0.035], [-0.04, 0.052, 0.042], [0.04, 0.056, 0.036], [0.1, 0.046, 0.026], [0.125, 0.022, 0.016]], 8),
  sole: lying([[-0.095, 0.05, 0.012], [0.135, 0.05, 0.012]], 8),
  // Arms (from the shoulder pivot): shoulder, upper arm with a bicep, elbow, forearm, cuff; a hand with fingers, thumb.
  shoulder: new THREE.SphereGeometry(0.066, 6, 4),
  upperArm: stack([[-0.165, 0.048, 0.049], [-0.12, 0.055, 0.058, 0.005], [-0.06, 0.06, 0.062, 0.006], [0.0, 0.058, 0.058]], 8),
  elbow: new THREE.IcosahedronGeometry(0.048, 0),
  forearm: stack([[-0.275, 0.038, 0.041, 0.006], [-0.23, 0.047, 0.051, 0.006], [-0.19, 0.053, 0.056, 0.004], [-0.165, 0.049, 0.051]], 8),
  cuff: stack([[-0.285, 0.046, 0.048, 0.006], [-0.262, 0.046, 0.048, 0.006]], 6),
  // The hand: a tapering palm, thin in the side-to-side direction.
  palm: stack([[-0.035, 0.02, 0.032], [0.0, 0.024, 0.04], [0.03, 0.021, 0.035]], 6),
  finger: stack([[-0.025, 0.012, 0.009], [0.025, 0.014, 0.01]], 4),
  placket: new THREE.BoxGeometry(0.03, 0.3, 0.012),
  button: new THREE.BoxGeometry(0.016, 0.016, 0.01),
  chestPocket: new THREE.BoxGeometry(0.07, 0.07, 0.012),
  trouserCuff: stack([[-0.352, 0.052, 0.055, 0.014], [-0.328, 0.052, 0.055, 0.014]], 6),
  lace: new THREE.BoxGeometry(0.07, 0.008, 0.012),
  fringeLock: stack([[0, 0.028, 0.018], [0.045, 0.01, 0.008]], 4),
  sideburn: stack([[-0.03, 0.01, 0.015], [0.03, 0.012, 0.018]], 4),
  thumb: new THREE.BoxGeometry(0.03, 0.05, 0.032),
  hairCap: new THREE.SphereGeometry(0.168, 10, 3, 0, Math.PI * 2, 0, Math.PI * 0.5),
  hairBack: new THREE.BoxGeometry(0.3, 0.32, 0.1),
  mohawk: new THREE.BoxGeometry(0.06, 0.13, 0.3),
  capTop: new THREE.CylinderGeometry(0.16, 0.166, 0.11, 10),
  capBrim: new THREE.BoxGeometry(0.26, 0.025, 0.16),
  shadow: new THREE.CircleGeometry(0.24, 10),
};
const matCache = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

/** Limb pivots, so the street view can animate them. */
export interface Rig {
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  body: THREE.Object3D;
}

/** Build a character. The returned group has `userData.rig` for animateCharacter(). */
export function buildCharacter(look: Look, extra?: { apron?: number; hood?: number; scrubs?: number; coat?: boolean }): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything above the feet, so it can bob and wobble
  root.add(body);
  const skin = mat(SKIN_TONES[look.skin] ?? SKIN_TONES[1]);
  // Doctors wear scrubs (top and trousers in one colour) under a white coat.
  const coat = extra?.coat ? mat(0xf4f4f0) : null;
  const scrubs = extra?.scrubs !== undefined ? mat(extra.scrubs) : null;
  const top = coat ?? scrubs ?? mat(TOP_COLORS[look.top] ?? TOP_COLORS[0]);
  const bottom = scrubs ?? mat(BOTTOM_COLORS[look.bottom] ?? BOTTOM_COLORS[0]);
  const hair = mat(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0]);
  const dark = mat(0x1e1b18);
  const sole = mat(0x3e352c);
  const white = mat(0xe8e2d4);
  const buckleMat = mat(0x9a8a5a);
  const darker = (m: THREE.MeshLambertMaterial) => mat(m.color.clone().multiplyScalar(0.72).getHex());

  // Parts are collected per pivot and material, then merged into one mesh each (see the bottom).
  const parts = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const tmp = new THREE.Object3D();
  const put = (
    g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body,
    rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1],
  ) => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(...rot);
    tmp.scale.set(...scale);
    tmp.updateMatrix();
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(tmp.matrix);
    c.deleteAttribute('uv');
    if (!parts.has(parent)) parts.set(parent, new Map());
    const byMat = parts.get(parent)!;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m)!.push(c);
  };
  const pivot = (x: number, y: number) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    body.add(p);
    return p;
  };

  // ---------- legs (hang from hip pivots) ----------
  const legL = pivot(-0.085, 0.4);
  const legR = pivot(0.085, 0.4);
  for (const leg of [legL, legR]) {
    put(geo.thigh, bottom, 0, 0, 0, leg);
    put(geo.knee, bottom, 0, -0.2, 0.03, leg);
    put(geo.calf, bottom, 0, 0, 0, leg);
    put(geo.shoe, dark, 0, -0.35, 0.02, leg);
    put(geo.sole, sole, 0, -0.388, 0.02, leg);
    put(geo.trouserCuff, darker(bottom as THREE.MeshLambertMaterial), 0, 0, 0, leg);
    for (const k of [0, 1, 2]) put(geo.lace, white, 0, -0.318 - k * 0.006, 0.03 + k * 0.025, leg, [-0.45, 0, 0]);
  }

  // ---------- the body: hips with pockets, a belt and buckle, the torso, a collar, the neck ----------
  put(geo.hips, bottom);
  for (const s of [-1, 1]) put(geo.pocket, darker(bottom as THREE.MeshLambertMaterial), s * 0.09, 0.38, 0.1, body, [0, s * 0.35, 0]);
  put(geo.belt, dark);
  put(geo.buckle, buckleMat, 0, 0.437, 0.119);
  put(geo.torso, top);
  put(geo.collar, darker(top as THREE.MeshLambertMaterial));
  // The shirt's front: a placket with buttons, a chest pocket.
  if (!coat) {
    put(geo.placket, darker(top as THREE.MeshLambertMaterial), 0, 0.72, 0.128, body, [0.08, 0, 0]);
    for (const y of [0.62, 0.71, 0.8]) put(geo.button, white, 0, y, 0.137 - (y - 0.62) * 0.05);
    put(geo.chestPocket, darker(top as THREE.MeshLambertMaterial), -0.095, 0.77, 0.13, body, [0.1, -0.25, 0]);
  }
  put(geo.neck, skin);
  if (extra?.apron !== undefined) put(new THREE.BoxGeometry(0.26, 0.34, 0.03), mat(extra.apron), 0, 0.6, 0.13);
  if (coat) {
    // The coat hangs open over the scrubs: the scrubs show in a V at the chest, the coat's skirt reaches the knees,
    // a stethoscope round the neck and a name badge.
    if (scrubs) put(new THREE.BoxGeometry(0.1, 0.2, 0.02), scrubs, 0, 0.72, 0.14);
    put(new THREE.BoxGeometry(0.36, 0.26, 0.27), coat, 0, 0.4, 0);
    put(new THREE.TorusGeometry(0.1, 0.012, 3, 8, Math.PI), mat(0x3a5a4a), 0, 0.8, 0.08, body, [Math.PI * 0.6, 0, Math.PI]);
    put(new THREE.BoxGeometry(0.06, 0.04, 0.01), mat(0x3a6ea5), 0.09, 0.73, 0.14);
  }

  // ---------- the head: eyes (white and pupil), eyebrows, a nose, a mouth, ears ----------
  put(geo.head, skin, 0, 1.0, 0);
  for (const s of [-1, 1]) {
    put(geo.eyeWhite, white, s * 0.052, 1.025, 0.132);
    put(geo.pupil, dark, s * 0.05, 1.023, 0.137);
    put(geo.brow, hair, s * 0.055, 1.06, 0.13, body, [0, 0, s * -0.12]);
    put(geo.ear, skin, s * 0.138, 1.0, -0.005, body, [0, s * 0.3, 0]);
  }
  put(geo.nose, skin, 0, 0.985, 0.138);

  put(geo.mouth, mat(0x5a2a26), 0, 0.93, 0.127);

  // ---------- arms (hang from shoulder pivots; the hand stays where weapons expect it) ----------
  const armL = pivot(-0.215, 0.8);
  const armR = pivot(0.215, 0.8);
  for (const arm of [armL, armR]) {
    const side = arm === armL ? -1 : 1;
    put(geo.shoulder, top, 0, -0.01, 0, arm);
    put(geo.upperArm, top, 0, 0, 0, arm);
    put(geo.elbow, top, 0, -0.168, 0, arm);
    put(geo.forearm, top, 0, 0, 0, arm);
    put(geo.cuff, darker(top as THREE.MeshLambertMaterial), 0, 0, 0, arm);
    put(geo.palm, skin, 0, -0.315, 0.008, arm);
    for (const [k, dz] of [[0, 0.032], [1, 0.012], [2, -0.008], [3, -0.026]] as const)
      put(geo.finger, skin, side * 0.003, -0.37 + (k === 0 || k === 3 ? 0.006 : 0), dz, arm, [0.12, 0, 0]);
    put(geo.thumb, skin, side * -0.022, -0.305, 0.042, arm, [0.3, 0, side * 0.25], [0.8, 0.9, 0.8]);
  }

  // ---------- hair ----------
  switch (look.hair) {
    case 1: // short: a cap of hair with a choppy fringe of locks and sideburns
      put(geo.hairCap, hair, 0, 1.03, -0.01, body, [0, 0, 0], [1, 0.85, 1]);
      for (let k = 0; k < 5; k++) put(geo.fringeLock, hair, -0.08 + k * 0.04, 1.095, 0.112, body, [Math.PI * 0.72, 0, (k - 2) * 0.12]);
      for (const s of [-1, 1]) put(geo.sideburn, hair, s * 0.13, 1.0, 0.05);
      break;
    case 2: // long: a cap, hair down the back, a fringe
      put(geo.hairCap, hair, 0, 1.03, -0.01);
      put(geo.hairBack, hair, 0, 0.92, -0.11);
      for (let k = 0; k < 5; k++) put(geo.fringeLock, hair, -0.08 + k * 0.04, 1.095, 0.112, body, [Math.PI * 0.72, 0, (k - 2) * 0.1]);
      for (const s of [-1, 1]) put(geo.hairBack, hair, s * 0.15, 0.94, -0.02, body, [0, 0, 0], [0.12, 0.8, 1.2]);
      break;
    case 3: // mohawk
      put(geo.mohawk, hair, 0, 1.18, -0.01);
      break;
    case 4: // cap
      put(geo.capTop, hair, 0, 1.13, 0);
      put(geo.capBrim, hair, 0, 1.09, 0.15);
      break;
    default: // bald
      break;
  }
  // A hood pulled up over the head (thugs): a dome over the head and down the back of the neck, in its own colour.
  if (extra?.hood !== undefined) {
    const hood = mat(extra.hood);
    put(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), hood, 0, 1.0, -0.015, body, [0, 0, 0], [1.06, 1.12, 1.08]);
    put(new THREE.BoxGeometry(0.3, 0.16, 0.12), hood, 0, 0.86, -0.1);
    // The opening's rim around the face.
    put(new THREE.TorusGeometry(0.15, 0.025, 4, 8, Math.PI * 1.2), hood, 0, 1.0, 0.11, body, [0, 0, -Math.PI * 0.1]);
  }

  // Merge each pivot's parts per material into one mesh (a handful of draw calls per person instead of dozens).
  for (const [parent, byMat] of parts)
    for (const [m, list] of byMat) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const o = new THREE.Mesh(merged, m);
      o.castShadow = true;
      parent.add(o);
    }

  // A soft round shadow blob under the feet (cheap, reads well even without real shadows).
  const blob = new THREE.Mesh(geo.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  root.add(blob);

  root.userData.rig = { legL, legR, armL, armR, body } satisfies Rig;
  return root;
}

export type Pose = 'idle' | 'walk' | 'work' | 'stunned' | 'sit' | 'swing';

/**
 * Animate a character built by buildCharacter. `t` is time in ms; `phase` offsets different characters.
 * `p` (0–1) is how far through a one-off move it is: the 'swing' pose (a weapon swung from the side) uses it.
 */
export function animateCharacter(g: THREE.Group, pose: Pose, t: number, phase = 0, p = 0) {
  const rig = g.userData.rig as Rig | undefined;
  if (!rig) return;
  const s = t / 1000 + phase;
  let legSwing = 0;
  let armL = 0;
  let armR = 0;
  let bob = 0;
  let wobble = 0;
  let armRSide = 0;
  let twist = 0;
  if (pose === 'swing') {
    p = Math.min(1, Math.max(0, p));
    // A big two-handed swing: wind back to the side (first 40%), whip through (next 25%), follow through and
    // come back to rest. Arm out (armRSide) and body twist carry it, so it reads from above.
    const ease = (x: number) => x * x * (3 - 2 * x);
    let out;
    let tw;
    let fw;
    if (p < 0.4) {
      const k = ease(p / 0.4);
      out = 1.3 * k;
      tw = 0.7 * k;
      fw = -0.9 * k;
    } else if (p < 0.65) {
      const k = ease((p - 0.4) / 0.25);
      out = 1.3 - 1.6 * k;
      tw = 0.7 - 1.4 * k;
      fw = -0.9 - 0.5 * k;
    } else {
      const k = ease((p - 0.65) / 0.35);
      out = -0.3 * (1 - k);
      tw = -0.7 * (1 - k);
      fw = -1.4 * (1 - k);
    }
    armR = fw;
    armRSide = out;
    armL = fw * 0.5; // the free hand comes along a little, close to the body
    twist = tw;
    bob = 0.01;
  } else if (pose === 'walk') {
    legSwing = Math.sin(s * 11) * 0.65;
    armL = -legSwing * 0.8;
    armR = legSwing * 0.8;
    bob = Math.abs(Math.cos(s * 11)) * 0.035;
  } else if (pose === 'work') {
    // Reach forward with the right hand, little dips.
    armR = -1.1 + Math.sin(s * 9) * 0.35;
    armL = 0.15;
    bob = Math.abs(Math.sin(s * 9)) * 0.02;
  } else if (pose === 'sit') {
    // On a bar stool, legs forward, swaying a little (one too many), raising a glass now and then.
    legSwing = -1.45;
    wobble = Math.sin(s * 1.3) * 0.07;
    armR = Math.sin(s * 0.7) > 0.6 ? -1.6 : -0.5;
    armL = -0.4;
    bob = 0.02;
  } else if (pose === 'stunned') {
    wobble = Math.sin(s * 14) * 0.16;
    armL = -0.3;
    armR = -0.3;
    armRSide = 0.5;
  } else {
    // Idle: slow breathing.
    bob = Math.sin(s * 2.2) * 0.008;
    armL = Math.sin(s * 2.2) * 0.04;
    armR = -armL;
  }
  rig.legL.rotation.x = legSwing;
  rig.legR.rotation.x = pose === 'sit' ? legSwing : -legSwing; // sitting: both legs forward
  rig.armL.rotation.x = armL;
  rig.armR.rotation.x = armR;
  rig.armL.rotation.z = pose === 'swing' ? -0.1 : -armRSide; // a swing only moves the right arm out
  rig.armR.rotation.z = armRSide;
  rig.body.position.y = bob;
  rig.body.rotation.z = wobble;
  rig.body.rotation.y = twist;
}
