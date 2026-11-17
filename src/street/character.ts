// Characters: the look options for the character creator, and the low-poly model with simple walk / work / stunned
// animations. Since v0.45 it's built in the old-school RuneScape way (docs/design.md §18): detail and body structure
// (joints, a face, hands, shoes) instead of smooth curves, flat-shaded, about 2,000 triangles at most.
// Everyone on the Street uses this model: you, tourists, the banker, Eddy.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

// ---------- the body (v0.45: the human base model; docs/design.md §18) ----------
// Learned from old-school RuneScape, not copied: adult proportions (the head about 1/6 of the height, legs half of it,
// broad shoulders tapering to the waist, long arms with the fists at mid-thigh), detail spent on SHAPE (a strong chest
// and shoulders, forearms, baggy trousers, fists, a simple strong face) rather than trinkets, and smooth shading with
// hard edges only where the shape turns sharply (fists, shoes, the jaw). Real joints: hips, knees, shoulders, elbows,
// the head, and a point in the right hand where weapons go. All sizes below are in tiles (1 = a tile).
export const BODY = {
  /** Height of the hips (the legs' pivot), the knees under them, the shoulders (the arms' pivot), the head's centre. */
  hip: 0.62,
  knee: -0.29,
  shoulder: 1.0,
  shoulderX: 0.205,
  elbow: -0.245,
  fist: -0.245,
  head: 1.19,
  /** Top of the head (for labels and tap areas). */
  height: 1.32,
};

/** A shape made of rings stacked upwards: [height, half width, half depth, forward offset, sideways offset]. Closed at
 *  both ends (unindexed; the normals are set when a person's parts are merged). */
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

// Shared geometry: built once, reused by every person.
const geo = {
  // ---- the head (around its centre): chin, jaw, cheeks, eye line, brow, crown; a simple strong face ----
  head: stack([[-0.125, 0.03, 0.028, 0.05], [-0.108, 0.064, 0.058, 0.032], [-0.07, 0.088, 0.083, 0.016], [-0.02, 0.097, 0.094, 0.01], [0.035, 0.1, 0.097], [0.08, 0.095, 0.094], [0.112, 0.068, 0.072, -0.008], [0.127, 0.025, 0.03, -0.01]], 10),
  eye: new THREE.BoxGeometry(0.03, 0.009, 0.01),
  brow: new THREE.BoxGeometry(0.038, 0.012, 0.014),
  nose: stack([[-0.025, 0.016, 0.016, 0.01], [0.0, 0.012, 0.016, 0.012], [0.022, 0.006, 0.008, 0.004]], 4),
  mouth: new THREE.BoxGeometry(0.036, 0.006, 0.008),
  ear: stack([[-0.022, 0.009, 0.013], [0.0, 0.012, 0.02], [0.022, 0.008, 0.014, -0.003]], 6),
  // Hair: a cap over the top and back of the head, down to the ears, with a hairline in front.
  hairCap: new THREE.SphereGeometry(0.128, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.58),
  hairBack: new THREE.BoxGeometry(0.2, 0.2, 0.06),
  fringeLock: stack([[0, 0.018, 0.01], [0.03, 0.006, 0.005]], 4),
  mohawk: new THREE.BoxGeometry(0.04, 0.09, 0.2),
  capTop: new THREE.CylinderGeometry(0.105, 0.11, 0.07, 10),
  capBrim: new THREE.BoxGeometry(0.17, 0.016, 0.1),
  neck: stack([[0.99, 0.052, 0.05], [1.1, 0.047, 0.046]], 8),
  // ---- the body: hips, belt, a T-shirt over a strong chest, the shoulders sloping up to the neck ----
  hips: stack([[0.54, 0.128, 0.09], [0.6, 0.142, 0.098], [0.665, 0.146, 0.1]], 10),
  belt: stack([[0.655, 0.15, 0.104], [0.7, 0.148, 0.102]], 10),
  buckle: new THREE.BoxGeometry(0.036, 0.03, 0.01),
  torso: stack([[0.69, 0.142, 0.1], [0.76, 0.136, 0.096], [0.84, 0.156, 0.108], [0.91, 0.184, 0.122], [0.965, 0.198, 0.118], [1.0, 0.17, 0.104], [1.03, 0.11, 0.08], [1.045, 0.06, 0.055]], 12),
  // ---- an arm (from the shoulder pivot): deltoid, short sleeve, bicep; forearm and fist (from the elbow pivot) ----
  deltoid: new THREE.SphereGeometry(0.058, 8, 6),
  sleeve: stack([[-0.14, 0.06, 0.062, 0.004], [-0.07, 0.062, 0.064], [-0.01, 0.06, 0.062], [0.03, 0.035, 0.045, -0.005]], 8),
  upperArm: stack([[-0.25, 0.04, 0.043, 0.004], [-0.19, 0.048, 0.052, 0.006], [-0.12, 0.05, 0.053]], 8),
  forearm: stack([[-0.205, 0.03, 0.033, 0.004], [-0.15, 0.037, 0.04, 0.006], [-0.05, 0.046, 0.048, 0.008], [0.01, 0.042, 0.044]], 8),
  fist: new THREE.BoxGeometry(0.06, 0.07, 0.072),
  thumb: new THREE.BoxGeometry(0.024, 0.04, 0.026),
  // ---- a leg (from the hip pivot): thigh; shin (from the knee pivot), a little baggy; a shoe ----
  thigh: stack([[-0.3, 0.068, 0.072, 0.01], [-0.18, 0.078, 0.082, 0.005], [-0.05, 0.088, 0.09], [0.04, 0.09, 0.09]], 8),
  shin: stack([[-0.27, 0.07, 0.074, 0.006], [-0.15, 0.066, 0.07, 0.004], [-0.02, 0.068, 0.072, 0.008], [0.02, 0.066, 0.07, 0.008]], 8),
  shoe: lying([[-0.065, 0.04, 0.03], [-0.03, 0.046, 0.035], [0.05, 0.05, 0.03], [0.1, 0.042, 0.022], [0.12, 0.02, 0.014]], 8),
  sole: lying([[-0.072, 0.044, 0.01], [0.128, 0.044, 0.01]], 8),
  shadow: new THREE.CircleGeometry(0.22, 12),
};
const matCache = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

/** The joints, so the street view can animate them and gear can be attached. */
export interface Rig {
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  head: THREE.Object3D;
  /** In the right fist: where a weapon goes. */
  hand: THREE.Object3D;
  body: THREE.Object3D;
}

/** Build a person. The returned group has `userData.rig` for animateCharacter() and setGear(). */
export function buildCharacter(look: Look, extra?: { apron?: number; hood?: number; scrubs?: number; coat?: boolean }): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything, so it can bob, wobble, twist and sit down
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
  const shade = (m: THREE.MeshLambertMaterial, k: number) => mat(m.color.clone().multiplyScalar(k).getHex());

  // Parts are collected per joint and colour, then merged into one mesh each (a handful of draw calls per person).
  const parts = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const tmp = new THREE.Object3D();
  const put = (g: THREE.BufferGeometry, m: THREE.Material, at: THREE.Object3D, x = 0, y = 0, z = 0, rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(...rot);
    tmp.scale.set(...scale);
    tmp.updateMatrix();
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(tmp.matrix);
    c.deleteAttribute('uv');
    c.deleteAttribute('normal');
    if (!parts.has(at)) parts.set(at, new Map());
    const byMat = parts.get(at)!;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m)!.push(c);
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };

  // ---------- legs: hip → thigh → knee → shin → shoe ----------
  const legs = [-1, 1].map((sd) => {
    const leg = joint(body, sd * 0.078, BODY.hip);
    const knee = joint(leg, 0, BODY.knee);
    put(geo.thigh, bottom, leg);
    put(geo.shin, bottom, knee);
    put(geo.shoe, dark, knee, 0, -(BODY.hip + BODY.knee) + 0.04, 0.025);
    put(geo.sole, sole, knee, 0, -(BODY.hip + BODY.knee) + 0.01, 0.025);
    return [leg, knee] as const;
  });

  // ---------- the body ----------
  put(geo.hips, bottom, body);
  put(geo.belt, mat(0x4a2a1e), body);
  put(geo.buckle, mat(0x9a8a5a), body, 0, 0.678, 0.104);
  put(geo.torso, top, body);
  put(geo.neck, skin, body);
  if (extra?.apron !== undefined) put(new THREE.BoxGeometry(0.24, 0.3, 0.025), mat(extra.apron), body, 0, 0.83, 0.115, [0.08, 0, 0]);
  if (coat) {
    // The coat hangs open over the scrubs: the scrubs show in a V at the chest, the coat's skirt reaches the knees,
    // a stethoscope round the neck and a name badge.
    if (scrubs) put(new THREE.BoxGeometry(0.08, 0.18, 0.02), scrubs, body, 0, 0.92, 0.118, [0.15, 0, 0]);
    put(stack([[0.36, 0.17, 0.12], [0.7, 0.15, 0.108]], 10), coat, body);
    put(new THREE.TorusGeometry(0.075, 0.009, 3, 8, Math.PI), mat(0x3a5a4a), body, 0, 0.98, 0.07, [Math.PI * 0.6, 0, Math.PI]);
    put(new THREE.BoxGeometry(0.045, 0.03, 0.008), mat(0x3a6ea5), body, 0.08, 0.9, 0.125);
  }

  // ---------- the head: a simple strong face ----------
  const head = joint(body, 0, BODY.head);
  put(geo.head, skin, head);
  for (const sd of [-1, 1]) {
    put(geo.eye, dark, head, sd * 0.036, 0.018, 0.093);
    put(geo.brow, shade(hair, 0.9), head, sd * 0.037, 0.038, 0.092, [0, 0, sd * -0.15]);
    put(geo.ear, skin, head, sd * 0.098, 0.0, -0.005, [0, sd * 0.3, 0]);
  }
  put(geo.nose, skin, head, 0, -0.012, 0.094);
  put(geo.mouth, shade(skin as THREE.MeshLambertMaterial, 0.6), head, 0, -0.06, 0.084);
  switch (look.hair) {
    case 1: // short: a cap of hair with a choppy fringe
      // A short crop: the cap tipped back (the hairline across the forehead, the back down to the neck), a quiff on top.
      put(geo.hairCap, hair, head, 0, 0.012, -0.012, [-0.22, 0, 0], [0.97, 1.0, 1.0]);
      put(geo.fringeLock, hair, head, 0.0, 0.11, 0.06, [1.2, 0, 0], [2.2, 1.0, 1.6]);
      break;
    case 2: // long: down the back and over the ears
      put(geo.hairCap, hair, head, 0, 0.012, -0.012, [-0.22, 0, 0], [0.99, 1.0, 1.02]);
      put(geo.hairBack, hair, head, 0, -0.06, -0.07);
      for (const sd of [-1, 1]) put(geo.hairBack, hair, head, sd * 0.095, -0.03, -0.01, [0, 0, 0], [0.12, 0.85, 1.3]);
      break;
    case 3: // mohawk
      put(geo.mohawk, hair, head, 0, 0.12, -0.01);
      break;
    case 4: // cap
      put(geo.capTop, hair, head, 0, 0.085, 0);
      put(geo.capBrim, hair, head, 0, 0.06, 0.1);
      break;
    default: // bald
      break;
  }
  // A hood pulled up over the head (thugs): a dome over the head and down the back of the neck, in its own colour.
  if (extra?.hood !== undefined) {
    const hood = mat(extra.hood);
    put(new THREE.SphereGeometry(0.122, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), hood, head, 0, 0, -0.01, [0, 0, 0], [1.05, 1.12, 1.08]);
    put(new THREE.BoxGeometry(0.2, 0.12, 0.08), hood, body, 0, 1.06, -0.07);
    put(new THREE.TorusGeometry(0.1, 0.016, 4, 10, Math.PI * 1.2), hood, head, 0, 0, 0.075, [0, 0, -Math.PI * 0.1]);
  }

  // ---------- arms: shoulder → deltoid, sleeve, bicep → elbow → forearm → fist ----------
  const arms = [-1, 1].map((sd) => {
    const arm = joint(body, sd * BODY.shoulderX, BODY.shoulder);
    const elbow = joint(arm, 0, BODY.elbow);
    put(geo.deltoid, top, arm, sd * -0.012, -0.02, 0, [0, 0, 0], [0.95, 1.0, 1]);
    put(geo.sleeve, top, arm);
    put(geo.upperArm, skin, arm);
    put(geo.forearm, skin, elbow);
    put(geo.fist, skin, elbow, 0, BODY.fist, 0.006);
    put(geo.thumb, skin, elbow, sd * -0.026, BODY.fist + 0.012, 0.036, [0.2, 0, sd * 0.2]);
    return [arm, elbow] as const;
  });
  const hand = joint(arms[1][1], 0, BODY.fist);

  // Merge each joint's parts per colour into one mesh, smooth-shaded with hard edges where the shape turns sharply.
  for (const [parent, byMat] of parts)
    for (const [m, list] of byMat) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const smooth = toCreasedNormals(merged, 0.9);
      merged.dispose();
      const o = new THREE.Mesh(smooth, m);
      o.castShadow = true;
      parent.add(o);
    }

  // A soft round shadow blob under the feet (cheap, reads well even without real shadows).
  const blob = new THREE.Mesh(geo.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  root.add(blob);

  root.userData.rig = {
    legL: legs[0][0], legR: legs[1][0], kneeL: legs[0][1], kneeR: legs[1][1],
    armL: arms[0][0], armR: arms[1][0], elbowL: arms[0][1], elbowR: arms[1][1],
    head, hand, body,
  } satisfies Rig;
  return root;
}

export type Pose = 'idle' | 'walk' | 'work' | 'stunned' | 'sit' | 'sitFloor' | 'swing';

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
  // The joints in the middle: knees (positive = the shin swings back) and elbows (negative = the forearm comes forward).
  let kneeL = 0;
  let kneeR = 0;
  let elbowL = -0.12;
  let elbowR = -0.12;
  let sink = 0;
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
    elbowR = -0.25;
    elbowL = -0.6;
  } else if (pose === 'walk') {
    legSwing = Math.sin(s * 11) * 0.55;
    armL = -legSwing * 0.8;
    armR = legSwing * 0.8;
    bob = Math.abs(Math.cos(s * 11)) * 0.03;
    // The leg swinging back bends at the knee; the arms bend a little more as they swing forward.
    kneeL = Math.max(0, Math.sin(s * 11 + 1.2)) * 0.75;
    kneeR = Math.max(0, -Math.sin(s * 11 - 1.9)) * 0.75;
    elbowL = -0.2 - Math.max(0, -armL) * 0.5;
    elbowR = -0.2 - Math.max(0, -armR) * 0.5;
  } else if (pose === 'work') {
    // Reach forward with the right hand, little dips.
    armR = -0.8 + Math.sin(s * 9) * 0.3;
    armL = 0.15;
    elbowR = -0.7 + Math.sin(s * 9) * 0.25;
    bob = Math.abs(Math.sin(s * 9)) * 0.02;
  } else if (pose === 'sit') {
    // On a bar stool, legs forward, swaying a little (one too many), raising a glass now and then.
    // Thighs forward, shins hanging down from the knees.
    legSwing = -1.45;
    kneeL = kneeR = 1.4;
    wobble = Math.sin(s * 1.3) * 0.07;
    armR = Math.sin(s * 0.7) > 0.6 ? -1.0 : -0.4;
    elbowR = Math.sin(s * 0.7) > 0.6 ? -1.3 : -0.9;
    armL = -0.3;
    elbowL = -0.9;
    bob = 0.02;
  } else if (pose === 'sitFloor') {
    // Sitting on the floor, back to the wall, legs out in front, hands in the lap (Splinter).
    legSwing = -1.5;
    kneeL = kneeR = 0.25;
    armL = armR = -0.35;
    elbowL = elbowR = -0.9;
    sink = -(BODY.hip - 0.08);
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
  const seated = pose === 'sit' || pose === 'sitFloor';
  rig.legL.rotation.x = legSwing;
  rig.legR.rotation.x = seated ? legSwing : -legSwing; // sitting: both legs forward
  rig.kneeL.rotation.x = kneeL;
  rig.kneeR.rotation.x = kneeR;
  rig.elbowL.rotation.x = elbowL;
  rig.elbowR.rotation.x = elbowR;
  rig.armL.rotation.x = armL;
  rig.armR.rotation.x = armR;
  rig.armL.rotation.z = pose === 'swing' ? -0.1 : -armRSide; // a swing only moves the right arm out
  rig.armR.rotation.z = armRSide;
  rig.body.position.y = bob + sink;
  rig.body.rotation.z = wobble;
  rig.body.rotation.y = twist;
}
