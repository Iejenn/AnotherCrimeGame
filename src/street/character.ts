// Characters: the look options for the character creator, and the rounded low-poly model
// (capsule body and limbs, round head) with simple walk / work / stunned animations.
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
const geo = {
  leg: new THREE.CapsuleGeometry(0.07, 0.24, 3, 8),
  arm: new THREE.CapsuleGeometry(0.052, 0.22, 3, 8),
  torso: new THREE.CapsuleGeometry(0.16, 0.2, 4, 10),
  head: new THREE.SphereGeometry(0.165, 14, 10),
  hand: new THREE.SphereGeometry(0.052, 8, 6),
  shoe: new THREE.BoxGeometry(0.12, 0.07, 0.19),
  eye: new THREE.SphereGeometry(0.022, 6, 4),
  hairCap: new THREE.SphereGeometry(0.178, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  hairBack: new THREE.BoxGeometry(0.3, 0.32, 0.1),
  mohawk: new THREE.BoxGeometry(0.06, 0.13, 0.3),
  capTop: new THREE.CylinderGeometry(0.175, 0.18, 0.11, 14),
  capBrim: new THREE.BoxGeometry(0.26, 0.025, 0.16),
  shadow: new THREE.CircleGeometry(0.24, 16),
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

/** Limb pivots, so the street view can animate them. */
export interface Rig {
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  body: THREE.Object3D;
}

/** Build a character. The returned group has `userData.rig` for animateCharacter(). */
export function buildCharacter(look: Look, extra?: { apron?: number }): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything above the feet, so it can bob and wobble
  root.add(body);
  const skin = mat(SKIN_TONES[look.skin] ?? SKIN_TONES[1]);
  const top = mat(TOP_COLORS[look.top] ?? TOP_COLORS[0]);
  const bottom = mat(BOTTOM_COLORS[look.bottom] ?? BOTTOM_COLORS[0]);
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
  for (const leg of [legL, legR]) {
    mesh(geo.leg, bottom, 0, -0.19, 0, leg);
    mesh(geo.shoe, dark, 0, -0.37, 0.025, leg);
  }
  // Torso (+ optional apron), head, eyes.
  const torso = mesh(geo.torso, top, 0, 0.66, 0);
  torso.scale.set(1, 1, 0.78);
  if (extra?.apron !== undefined) {
    const apron = mesh(new THREE.BoxGeometry(0.26, 0.34, 0.03), mat(extra.apron), 0, 0.6, 0.13);
    apron.castShadow = false;
  }
  mesh(geo.head, skin, 0, 1.0, 0);
  mesh(geo.eye, dark, -0.06, 1.02, 0.148);
  mesh(geo.eye, dark, 0.06, 1.02, 0.148);
  // Arms hang from shoulder pivots.
  const armL = pivot(-0.215, 0.8);
  const armR = pivot(0.215, 0.8);
  for (const arm of [armL, armR]) {
    mesh(geo.arm, top, 0, -0.14, 0, arm);
    mesh(geo.hand, skin, 0, -0.3, 0, arm);
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
