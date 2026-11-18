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
/** How big people are drawn in the city (the model at 90%). */
export const PERSON_SCALE = 0.9;
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
  // Hair, built on the head's own rings but a little bigger all round (so the head can never poke through): a top from
  // the hairline up, and a back piece down to the neck.
  hairTop: stack([[0.028, 0.108, 0.104, -0.006], [0.08, 0.105, 0.103, -0.004], [0.116, 0.08, 0.084, -0.01], [0.142, 0.032, 0.038, -0.012]], 10),
  hairBackShort: stack([[-0.075, 0.09, 0.05, -0.058], [-0.02, 0.105, 0.06, -0.05], [0.035, 0.108, 0.062, -0.046]], 10),
  hairBackLong: stack([[-0.17, 0.1, 0.045, -0.07], [-0.06, 0.112, 0.06, -0.055], [0.035, 0.11, 0.064, -0.046]], 10),
  hairBack: new THREE.BoxGeometry(0.2, 0.2, 0.06),
  fringeLock: stack([[0, 0.018, 0.01], [0.03, 0.006, 0.005]], 4),
  mohawk: new THREE.BoxGeometry(0.04, 0.09, 0.2),
  capTop: new THREE.CylinderGeometry(0.112, 0.116, 0.075, 10),
  capBrim: new THREE.BoxGeometry(0.17, 0.016, 0.1),
  neck: stack([[0.99, 0.052, 0.05], [1.1, 0.047, 0.046]], 8),
  // ---- the body: hips, belt, a T-shirt over a strong chest, the shoulders sloping up to the neck ----
  hips: stack([[0.54, 0.128, 0.09], [0.6, 0.142, 0.098], [0.665, 0.146, 0.1]], 10),
  belt: stack([[0.655, 0.15, 0.104], [0.7, 0.148, 0.102]], 10),
  buckle: new THREE.BoxGeometry(0.036, 0.03, 0.01),
  // (8 sides: a flat chest and back, broad flat sides, squared shoulders; drawn with hard edges, see `planes` below)
  torso: stack([[0.69, 0.15, 0.1], [0.76, 0.145, 0.095], [0.85, 0.17, 0.106], [0.92, 0.2, 0.116], [0.975, 0.215, 0.11], [1.0, 0.19, 0.098], [1.03, 0.115, 0.072], [1.045, 0.062, 0.052]], 8),
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
const matCache = new Map<string, THREE.MeshLambertMaterial>();
/** A person's colour, smooth-shaded (soft across rounded parts, hard where the shape turns sharply). */
function mat(color: number) {
  return cached(color, 0.9);
}
/** The same colour with hard edges between its flat planes (the chest and back: planes, not a barrel). */
function planes(color: number) {
  return cached(color, 0.3);
}
/** The one material every person is drawn with: their colours are painted on the parts (vertex colours). */
const PAINTED = new THREE.MeshLambertMaterial({ vertexColors: true });
function cached(color: number, crease: number) {
  const key = `${color}|${crease}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    m.userData.crease = crease;
    matCache.set(key, m);
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

/**
 * What a person wears on top of their look (their job's clothes), all fitted to the base model:
 *  - apron: a shop apron (a bib with a neck strap, a skirt to the thighs, ties at the waist), in this colour;
 *  - suit: a suit jacket (the top colour) over a shirt of this colour, with lapels and a tie; long sleeves;
 *  - uniform: a guard's uniform (the top colour): a badge, straps on the shoulders, long sleeves;
 *  - vest: an open leather vest in this colour, over the shirt;
 *  - hood: a hoodie in this colour: the hood up, long sleeves, a front pocket;
 *  - jacket: an old jacket in this colour, with long sleeves, big pockets and a collar (Splinter's army jacket);
 *  - scrubs + coat: a doctor: scrubs in this colour under a long white coat with long sleeves.
 */
export interface Outfit {
  apron?: number;
  suit?: number;
  uniform?: boolean;
  vest?: number;
  hood?: number;
  jacket?: number;
  scrubs?: number;
  coat?: boolean;
}

/** Build a person. The returned group has `userData.rig` for animateCharacter() and setGear(). */
export function buildCharacter(look: Look, extra?: Outfit): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything, so it can bob, wobble, twist and sit down
  root.add(body);
  const skin = mat(SKIN_TONES[look.skin] ?? SKIN_TONES[1]);
  // Doctors wear scrubs (top and trousers in one colour) under a white coat.
  const coat = extra?.coat ? mat(0xf4f4f0) : null;
  const scrubs = extra?.scrubs !== undefined ? mat(extra.scrubs) : null;
  const top = coat ?? scrubs ?? (extra?.jacket !== undefined ? mat(extra.jacket) : mat(TOP_COLORS[look.top] ?? TOP_COLORS[0]));
  const bottom = scrubs ?? mat(BOTTOM_COLORS[look.bottom] ?? BOTTOM_COLORS[0]);
  const hair = mat(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0]);
  const dark = mat(0x1e1b18);
  const sole = mat(0x3e352c);
  const shade = (m: THREE.MeshLambertMaterial, k: number) => mat(m.color.clone().multiplyScalar(k).getHex());
  // Jackets, coats, hoodies, suits and uniforms have long sleeves (the forearms in the top's colour, a cuff at the wrist).
  const longSleeves = !!(extra?.coat || extra?.hood !== undefined || extra?.suit !== undefined || extra?.uniform || extra?.jacket !== undefined);

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
  put(geo.torso, planes((top as THREE.MeshLambertMaterial).color.getHex()), body);
  put(geo.neck, skin, body);
  const F = 0.112; // how far in front of the body's centre the chest's flat front is (clothes sit just outside it)
  if (extra?.apron !== undefined) {
    // A shop apron: a bib over the chest on a strap round the neck, a skirt down to the thighs, ties at the back.
    const ap = mat(extra.apron);
    put(new THREE.BoxGeometry(0.2, 0.2, 0.012), ap, body, 0, 0.88, F + 0.006);
    put(new THREE.BoxGeometry(0.29, 0.34, 0.012), ap, body, 0, 0.56, 0.11, [-0.08, 0, 0]);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.012, 0.14, 0.012), ap, body, sd * 0.07, 1.0, 0.07, [0.5, 0, sd * -0.35]);
    put(new THREE.BoxGeometry(0.31, 0.02, 0.2), ap, body, 0, 0.71, 0);
    put(new THREE.BoxGeometry(0.1, 0.06, 0.012), shade(ap, 0.85), body, 0, 0.62, 0.135, [-0.08, 0, 0]); // a pocket
  }
  if (extra?.suit !== undefined) {
    // A suit: the shirt shows in a V at the chest, a tie down it, dark lapels either side, buttons.
    put(new THREE.BoxGeometry(0.09, 0.15, 0.01), mat(extra.suit), body, 0, 0.94, F + 0.002);
    put(new THREE.BoxGeometry(0.03, 0.17, 0.01), mat(0x6a1a22), body, 0, 0.9, F + 0.008);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.05, 0.17, 0.012), shade(top as THREE.MeshLambertMaterial, 0.75), body, sd * 0.06, 0.93, F + 0.006, [0, 0, sd * 0.35]);
    for (const y of [0.78, 0.83]) put(new THREE.BoxGeometry(0.016, 0.016, 0.01), mat(0x2a2620), body, 0, y, F - 0.004);
  }
  if (extra?.uniform) {
    // A guard's uniform: a gold badge on the chest, straps on the shoulders, a pocket.
    put(new THREE.BoxGeometry(0.04, 0.045, 0.012), mat(0xd8b04a), body, -0.08, 0.92, F + 0.004);
    put(new THREE.BoxGeometry(0.07, 0.06, 0.01), shade(top as THREE.MeshLambertMaterial, 0.8), body, 0.08, 0.88, F + 0.003);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.07, 0.016, 0.1), shade(top as THREE.MeshLambertMaterial, 0.7), body, sd * 0.17, 1.005, 0, [0, 0, sd * -0.2]);
  }
  if (extra?.vest !== undefined) {
    // An open leather vest: two front panels with the shirt between them, the back, a patch on it.
    const v = mat(extra.vest);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.11, 0.3, 0.014), v, body, sd * 0.098, 0.86, F + 0.006, [0, sd * 0.25, 0]);
    put(new THREE.BoxGeometry(0.36, 0.32, 0.014), v, body, 0, 0.86, -F + 0.002);
    put(new THREE.CircleGeometry(0.06, 8), mat(0x8a2a22), body, 0, 0.9, -F - 0.007, [0, Math.PI, 0]);
  }
  if (extra?.hood !== undefined) {
    // A hoodie's front pocket.
    put(new THREE.BoxGeometry(0.18, 0.08, 0.012), shade(top as THREE.MeshLambertMaterial, 0.85), body, 0, 0.76, F + 0.002);
  }
  if (extra?.jacket !== undefined) {
    // An old jacket: two big front pockets and a collar.
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.08, 0.07, 0.014), shade(top as THREE.MeshLambertMaterial, 0.8), body, sd * 0.08, 0.8, F + 0.004);
    put(stack([[1.0, 0.11, 0.08, -0.01], [1.05, 0.09, 0.07, -0.02]], 8), shade(top as THREE.MeshLambertMaterial, 0.85), body);
  }
  if (coat) {
    // The coat hangs open over the scrubs: the scrubs show in a V at the chest, the coat's skirt reaches the knees,
    // lapels, a stethoscope round the neck and a name badge.
    if (scrubs) put(new THREE.BoxGeometry(0.08, 0.18, 0.01), scrubs, body, 0, 0.92, F + 0.003);
    for (const sd of [-1, 1]) put(new THREE.BoxGeometry(0.045, 0.2, 0.012), shade(coat, 0.9), body, sd * 0.058, 0.91, F + 0.007, [0, 0, sd * 0.3]);
    put(stack([[0.36, 0.17, 0.12], [0.5, 0.16, 0.114], [0.7, 0.152, 0.106]], 10), coat, body);
    put(new THREE.TorusGeometry(0.075, 0.009, 3, 8, Math.PI), mat(0x3a5a4a), body, 0, 0.98, 0.07, [Math.PI * 0.6, 0, Math.PI]);
    put(new THREE.BoxGeometry(0.045, 0.03, 0.008), mat(0x3a6ea5), body, 0.09, 0.88, F + 0.008);
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
  // The hair on top of the head goes on its own part (v0.54), which setGear() hides under a helmet: it poked through
  // it (the fringe, the mohawk, the cap). What hangs below the helmet (the back, long hair's sides) stays.
  const crown = joint(head, 0, 0);
  crown.name = 'crown';
  switch (look.hair) {
    case 1: // short: a cap of hair with a choppy fringe
      // A short crop: the top, the back down to the neck, a quiff at the front.
      put(geo.hairTop, hair, crown);
      put(geo.hairBackShort, hair, head);
      put(geo.fringeLock, hair, crown, 0.0, 0.118, 0.07, [1.2, 0, 0], [2.2, 1.0, 1.6]);
      break;
    case 2: // long: down the back and over the ears
      put(geo.hairTop, hair, crown);
      put(geo.hairBackLong, hair, head);
      for (const sd of [-1, 1]) put(geo.hairBack, hair, head, sd * 0.095, -0.03, -0.01, [0, 0, 0], [0.12, 0.85, 1.3]);
      break;
    case 3: // mohawk
      put(geo.mohawk, hair, crown, 0, 0.12, -0.01);
      break;
    case 4: // cap
      put(geo.capTop, hair, crown, 0, 0.1, -0.004);
      put(geo.capBrim, hair, crown, 0, 0.06, 0.1);
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
    if (longSleeves) {
      put(geo.forearm, top, elbow, 0, 0, 0, [0, 0, 0], [1.12, 1, 1.12]);
      put(stack([[-0.205, 0.04, 0.042, 0.004], [-0.18, 0.04, 0.042, 0.004]], 8), shade(top as THREE.MeshLambertMaterial, 0.8), elbow);
      put(geo.upperArm, top, arm, 0, 0, 0, [0, 0, 0], [1.1, 1, 1.1]);
    } else put(geo.forearm, skin, elbow);
    put(geo.fist, skin, elbow, 0, BODY.fist, 0.006);
    put(geo.thumb, skin, elbow, sd * -0.026, BODY.fist + 0.012, 0.036, [0.2, 0, sd * 0.2]);
    return [arm, elbow] as const;
  });
  const hand = joint(arms[1][1], 0, BODY.fist);

  // Each joint becomes ONE mesh (v0.46: was one per colour, 25 per person, ~50 draw calls with shadows; now 11): every
  // colour's parts are merged and smooth-shaded with hard edges where the shape turns sharply (its own crease), then
  // painted in their colour (vertex colours) and all merged together under one shared material.
  for (const [parent, byMat] of parts) {
    const painted: THREE.BufferGeometry[] = [];
    for (const [m, list] of byMat) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const smooth = toCreasedNormals(merged, (m.userData.crease as number | undefined) ?? 0.9);
      merged.dispose();
      const { r, g, b } = (m as THREE.MeshLambertMaterial).color;
      const n = smooth.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([r, g, b], i * 3);
      smooth.setAttribute('color', new THREE.BufferAttribute(col, 3));
      painted.push(smooth);
    }
    const one = mergeGeometries(painted, false);
    painted.forEach((g) => g.dispose());
    if (!one) continue;
    const o = new THREE.Mesh(one, PAINTED);
    o.castShadow = true;
    parent.add(o);
  }

  // A soft round shadow blob under the feet (cheap, reads well even without real shadows).
  const blob = new THREE.Mesh(geo.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  root.add(blob);

  // Everyone is drawn at 90% of the model's size, so people fit the city's doors, shops and counters (BODY's numbers
  // are the model's own; on screen a person is about 1.19 tall).
  root.scale.setScalar(PERSON_SCALE);

  root.userData.rig = {
    legL: legs[0][0], legR: legs[1][0], kneeL: legs[0][1], kneeR: legs[1][1],
    armL: arms[0][0], armR: arms[1][0], elbowL: arms[0][1], elbowR: arms[1][1],
    head, hand, body,
  } satisfies Rig;
  return root;
}

export type Pose = 'idle' | 'walk' | 'work' | 'stunned' | 'sit' | 'sitFloor' | 'swing' | 'punch' | 'stab' | 'throw';
/** When the knife leaves the hand in the 'throw' pose (how far through it, 0–1). */
export const THROW_RELEASE = 0.55;
/** Walking speed the walk cycle is tuned for (tiles a second): the feet keep pace with the ground at this speed. */
export const WALK_PACE = 2.5;

/**
 * Animate a character built by buildCharacter. `t` is time in ms; `phase` offsets different characters.
 * `p` (0–1) is how far through a one-off move it is (the attacks: 'swing' a bat, 'stab' a knife, 'punch'); for 'walk'
 * it's the walking speed in tiles a second (the steps keep pace with it; 0 = WALK_PACE).
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
  let lean = 0;
  let headTurn = 0;
  let wrist = 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  /** Blend a, b, c... over p's stretches: [until, value] keyframes, eased between them. */
  const keys = (pp: number, ks: [number, number][]) => {
    let prev: [number, number] = [0, ks[ks.length - 1][1]]; // (a move starts from where it ends: the guard)
    for (const k of ks) {
      if (pp <= k[0]) return prev[1] + (k[1] - prev[1]) * ease(k[0] > prev[0] ? (pp - prev[0]) / (k[0] - prev[0]) : 1);
      prev = k;
    }
    return prev[1];
  };
  if (pose === 'punch' || pose === 'stab') {
    // Fists and knives (v0.49): the left hand up as a guard, the right drawn back to the chest, then driven straight
    // forward with the shoulders turning into it and a little lean, then back to the guard. A knife's wrist turns so the
    // blade points where the arm goes: a thrust, not an overhead raise.
    const pp = Math.min(1, Math.max(0, p));
    const stab = pose === 'stab';
    const back = stab ? 0.3 : 0.25;
    const hit = stab ? 0.55 : 0.5;
    armR = keys(pp, [[back, stab ? 0.25 : -0.35], [hit, stab ? -1.4 : -1.5], [1, -0.55]]);
    elbowR = keys(pp, [[back, -1.75], [hit, -0.12], [1, -1.4]]);
    twist = keys(pp, [[back, 0.22], [hit, -0.3], [1, 0]]);
    lean = keys(pp, [[back, 0], [hit, stab ? 0.16 : 0.1], [1, 0.03]]);
    armL = -0.55;
    elbowL = -1.7;
    headTurn = -twist * 0.6;
    if (stab) wrist = keys(pp, [[back, 0.6], [hit, 1.45], [1, 0.8]]);
    // Feet apart, a little bent at the knees: ready.
    legSwing = 0.12;
    kneeL = kneeR = 0.12;
  } else if (pose === 'throw') {
    // An overhand throw (v0.51, throwing knives): the free hand points at the target while the right arm cocks back
    // over the shoulder (first 35%), then whips forward and down, letting go at THROW_RELEASE with the body turning
    // and leaning into it, then settles.
    const pp = Math.min(1, Math.max(0, p));
    const cock = 0.35;
    armR = keys(pp, [[cock, -2.75], [THROW_RELEASE, -1.25], [0.8, -0.85], [1, -0.4]]);
    elbowR = keys(pp, [[cock, -1.7], [THROW_RELEASE, -0.15], [1, -0.5]]);
    twist = keys(pp, [[cock, 0.4], [THROW_RELEASE, -0.35], [1, 0]]);
    lean = keys(pp, [[cock, -0.04], [THROW_RELEASE, 0.16], [1, 0.03]]);
    armL = keys(pp, [[cock, -1.25], [THROW_RELEASE, -0.5], [1, -0.3]]);
    elbowL = -0.35;
    headTurn = -twist * 0.6;
    legSwing = 0.14;
    kneeL = kneeR = 0.14;
  } else if (pose === 'swing') {
    p = Math.min(1, Math.max(0, p));
    // A big two-handed swing: wind back to the side (first 40%), whip through (next 25%), follow through and
    // come back to rest. Arm out (armRSide) and body twist carry it, so it reads from above.
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
    // A human walk (v0.49): the steps keep pace with the ground (a stride of about 0.7 tiles), each leg swings from
    // the hip and bends most at the knee halfway through its swing (lifting the foot clear), straight again as the
    // heel lands. The arms swing opposite the legs with soft elbows; the body is highest as the legs pass each other,
    // shifts its weight over the standing leg, leans a little into the walk, and the shoulders turn against the hips
    // while the head stays looking ahead.
    const pace = (p > 0 ? p : WALK_PACE) * 4.4;
    const ph = s * pace;
    const sw = Math.sin(ph);
    const cw = Math.cos(ph);
    legSwing = sw * 0.48;
    // (Most bend just after the leg passes under the body, swinging forward: a foot lifted clear, not kicked up behind.)
    const bend = (x: number) => 0.06 + 0.7 * Math.pow(Math.max(0, -Math.cos(x - 0.35)), 1.4);
    kneeL = bend(ph);
    kneeR = bend(ph + Math.PI);
    armL = -sw * 0.42;
    armR = sw * 0.42;
    elbowL = -0.28 - Math.max(0, -armL) * 0.7;
    elbowR = -0.28 - Math.max(0, -armR) * 0.7;
    bob = Math.abs(cw) * 0.028;
    wobble = cw * 0.025;
    twist = -sw * 0.07;
    headTurn = -twist * 0.8;
    lean = 0.05;
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
  rig.body.rotation.x = lean;
  rig.head.rotation.y = headTurn;
  rig.hand.rotation.x = wrist;
}
