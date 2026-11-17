// Characters: the look options for the character creator, and the low-poly model with simple walk / work / stunned
// animations. Since v0.45 it's faceted in the old-school RuneScape way (docs/design.md §18): 6-sided limbs, a chunky
// torso wider at the shoulders, a faceted head, big blocky hands and feet; flat-shaded; well under 1,200 triangles.
// Everyone on the Street uses this model: you, tourists, the banker, Eddy.
import * as THREE from 'three';
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
// (Structure over smoothness, §18: limbs in two parts with a joint between them, a body built from chest, waist, belt
// and hips, a neck, a face with a nose and ears, hands with a thumb, shoes with a toe cap; everything 6-sided.)
const geo = {
  thigh: new THREE.CylinderGeometry(0.088, 0.072, 0.2, 6),
  knee: new THREE.OctahedronGeometry(0.07),
  shin: new THREE.CylinderGeometry(0.068, 0.056, 0.19, 6),
  upperArm: new THREE.CylinderGeometry(0.064, 0.055, 0.16, 6),
  elbow: new THREE.OctahedronGeometry(0.056),
  forearm: new THREE.CylinderGeometry(0.052, 0.044, 0.14, 6),
  shoulder: new THREE.IcosahedronGeometry(0.078, 0),
  // The body: a broad chest (wider at the shoulders), a narrower waist, a belt, the hips.
  chest: new THREE.CylinderGeometry(0.205, 0.165, 0.28, 6),
  waist: new THREE.CylinderGeometry(0.16, 0.15, 0.1, 6),
  belt: new THREE.CylinderGeometry(0.163, 0.163, 0.04, 6),
  hips: new THREE.CylinderGeometry(0.162, 0.15, 0.11, 6),
  neck: new THREE.CylinderGeometry(0.06, 0.068, 0.09, 6),
  head: new THREE.IcosahedronGeometry(0.17, 1),
  nose: new THREE.BoxGeometry(0.04, 0.055, 0.045),
  ear: new THREE.BoxGeometry(0.03, 0.06, 0.045),
  hand: new THREE.BoxGeometry(0.08, 0.09, 0.08),
  thumb: new THREE.BoxGeometry(0.03, 0.045, 0.03),
  shoe: new THREE.BoxGeometry(0.13, 0.075, 0.2),
  toe: new THREE.BoxGeometry(0.12, 0.055, 0.05),
  eye: new THREE.BoxGeometry(0.035, 0.035, 0.02),
  hairCap: new THREE.SphereGeometry(0.182, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5),
  hairBack: new THREE.BoxGeometry(0.3, 0.32, 0.1),
  mohawk: new THREE.BoxGeometry(0.06, 0.13, 0.3),
  capTop: new THREE.CylinderGeometry(0.175, 0.18, 0.11, 8),
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
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const pivot = (x: number, y: number) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    body.add(p);
    return p;
  };

  // Legs hang from hip pivots; shoes at the bottom.
  const legL = pivot(-0.085, 0.4);
  const legR = pivot(0.085, 0.4);
  // Legs: a thigh, a knee, a shin; a shoe with a toe cap.
  for (const leg of [legL, legR]) {
    mesh(geo.thigh, bottom, 0, -0.1, 0, leg);
    mesh(geo.knee, bottom, 0, -0.2, 0.008, leg);
    mesh(geo.shin, bottom, 0, -0.29, 0.008, leg);
    mesh(geo.shoe, dark, 0, -0.37, 0.025, leg);
    mesh(geo.toe, dark, 0, -0.38, 0.12, leg);
  }
  // The body (+ optional apron): hips, a belt, the waist, a broad chest (a little flatter front to back).
  mesh(geo.hips, bottom, 0, 0.445, 0).scale.set(1, 1, 0.8);
  mesh(geo.belt, dark, 0, 0.515, 0).scale.set(1, 1, 0.8);
  mesh(geo.waist, top, 0, 0.58, 0).scale.set(1, 1, 0.78);
  mesh(geo.chest, top, 0, 0.77, 0).scale.set(1, 1, 0.78);
  mesh(geo.neck, skin, 0, 0.93, 0);
  if (extra?.apron !== undefined) {
    const apron = mesh(new THREE.BoxGeometry(0.26, 0.34, 0.03), mat(extra.apron), 0, 0.6, 0.13);
    apron.castShadow = false;
  }
  if (coat) {
    // The coat hangs open over the scrubs: the scrubs show in a V at the chest, the coat's skirt reaches the knees,
    // a stethoscope round the neck and a name badge.
    if (scrubs) mesh(new THREE.BoxGeometry(0.1, 0.2, 0.02), scrubs, 0, 0.72, 0.125).castShadow = false;
    mesh(new THREE.BoxGeometry(0.36, 0.26, 0.27), coat, 0, 0.4, 0);
    mesh(new THREE.TorusGeometry(0.1, 0.012, 3, 8, Math.PI), mat(0x3a5a4a), 0, 0.8, 0.07).rotation.set(Math.PI * 0.6, 0, Math.PI);
    mesh(new THREE.BoxGeometry(0.06, 0.04, 0.01), mat(0x3a6ea5), 0.09, 0.73, 0.13).castShadow = false;
  }
  // The head: eyes, a nose, ears.
  mesh(geo.head, skin, 0, 1.0, 0);
  mesh(geo.eye, dark, -0.06, 1.02, 0.152);
  mesh(geo.eye, dark, 0.06, 1.02, 0.152);
  mesh(geo.nose, skin, 0, 0.97, 0.16);
  mesh(geo.ear, skin, -0.165, 0.99, 0);
  mesh(geo.ear, skin, 0.165, 0.99, 0);
  // Arms hang from shoulder pivots: the shoulder, an upper arm, the elbow, a forearm, a hand with a thumb (the hand
  // stays where it was, so weapons still sit in it).
  const armL = pivot(-0.215, 0.8);
  const armR = pivot(0.215, 0.8);
  for (const arm of [armL, armR]) {
    const side = arm === armL ? -1 : 1;
    mesh(geo.shoulder, top, 0, -0.005, 0, arm);
    mesh(geo.upperArm, top, 0, -0.085, 0, arm);
    mesh(geo.elbow, top, 0, -0.165, 0, arm);
    mesh(geo.forearm, top, 0, -0.235, 0.005, arm);
    mesh(geo.hand, skin, 0, -0.31, 0.008, arm);
    mesh(geo.thumb, skin, side * -0.04, -0.295, 0.04, arm);
  }
  // Hair styles.
  switch (look.hair) {
    case 1: // short
      mesh(geo.hairCap, hair, 0, 1.02, -0.01).scale.set(1, 0.85, 1);
      break;
    case 2: // long
      mesh(geo.hairCap, hair, 0, 1.02, -0.01);
      mesh(geo.hairBack, hair, 0, 0.92, -0.11);
      break;
    case 3: // mohawk
      mesh(geo.mohawk, hair, 0, 1.18, -0.01);
      break;
    case 4: // cap
      mesh(geo.capTop, hair, 0, 1.13, 0);
      mesh(geo.capBrim, hair, 0, 1.09, 0.15);
      break;
    default: // bald
      break;
  }
  // A hood pulled up over the head (thugs): a dome over the head and down the back of the neck, in its own colour.
  if (extra?.hood !== undefined) {
    const hood = mat(extra.hood);
    const dome = mesh(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62), hood, 0, 1.0, -0.015);
    dome.scale.set(1.06, 1.12, 1.08);
    mesh(new THREE.BoxGeometry(0.3, 0.16, 0.12), hood, 0, 0.86, -0.1);
    // The opening's rim around the face.
    mesh(new THREE.TorusGeometry(0.15, 0.025, 4, 8, Math.PI * 1.2), hood, 0, 1.0, 0.11).rotation.z = -Math.PI * 0.1;
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
