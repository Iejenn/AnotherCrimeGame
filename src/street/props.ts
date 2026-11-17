// Small models: cars, gym bags, shop shelves and parking meters. Chunky low-poly, muted dusk colours.
import * as THREE from 'three';
import { limb, loft, spikes } from './loft';

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

export const CAR_COLORS = [0x8a2f28, 0x2f4562, 0x9a7a2e, 0x35553a, 0xb0aa9c, 0x6a4526, 0x2e5f5b];

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

export const BAG_COLORS = [0x2f4562, 0x8a2f28, 0x35553a, 0x2b2b2e];

/** A gym bag lying on the court bench (the bench seat is at y≈0.3). */
export function buildGymBag(color: number): THREE.Group {
  const g = new THREE.Group();
  const bag = add(g, cylGeo(0.12, 0.42, 10), color, 0, 0.42, 0);
  bag.rotation.z = Math.PI / 2;
  add(g, boxGeo(0.44, 0.02, 0.05), 0xd8d0c0, 0, 0.42, 0.115, false); // stripe
  const handle = add(g, new THREE.TorusGeometry(0.08, 0.015, 5, 10, Math.PI), 0x1e1b18, 0, 0.53, 0, false);
  handle.rotation.y = Math.PI / 2;
  return g;
}

/**
 * A shop shelf full of goods, against a wall behind it. `userData.goods` holds the goods, which are
 * hidden while the shelf is empty (you stole from it; it refills after a while).
 */
export function buildShelf(colors: number[], seed: number): THREE.Group {
  const g = new THREE.Group();
  add(g, boxGeo(0.9, 1.0, 0.42), 0x6b4a2e, 0, 0.5, -0.24);
  const goods = new THREE.Group();
  for (let level = 0; level < 3; level++) {
    add(g, boxGeo(0.92, 0.03, 0.44), 0x8a6235, 0, 0.18 + level * 0.32, -0.22, false);
    for (let i = 0; i < 4; i++) {
      const c = colors[(seed + level * 3 + i * 7) % colors.length];
      add(goods, boxGeo(0.15, 0.17, 0.14), c, -0.3 + i * 0.2, 0.29 + level * 0.32, -0.12, false);
    }
  }
  g.add(goods);
  g.userData.goods = goods;
  return g;
}

/** A parking meter on a post. The little window is green when it has coins, red when emptied. */
export function buildMeter(): THREE.Group {
  const g = new THREE.Group();
  add(g, cylGeo(0.035, 0.7, 6), 0x5a5f66, 0, 0.35, 0);
  add(g, boxGeo(0.2, 0.26, 0.14), 0x6f7680, 0, 0.82, 0);
  add(g, boxGeo(0.22, 0.05, 0.16), 0x4a4f56, 0, 0.97, 0);
  const full = add(g, boxGeo(0.1, 0.06, 0.02), 0x5bd06a, 0, 0.86, 0.075, false);
  (full.material as THREE.MeshLambertMaterial) = new THREE.MeshLambertMaterial({ color: 0x5bd06a, emissive: 0x5bd06a, emissiveIntensity: 0.9 });
  const empty = add(g, boxGeo(0.1, 0.06, 0.02), 0xe0473a, 0, 0.86, 0.075, false);
  (empty.material as THREE.MeshLambertMaterial) = new THREE.MeshLambertMaterial({ color: 0xe0473a, emissive: 0xe0473a, emissiveIntensity: 0.9 });
  empty.visible = false;
  g.userData.goods = full;
  g.userData.emptyMark = empty;
  return g;
}

/** Show a spot as full or emptied (shelves lose their goods, meters turn red). */
export function setSpotEmpty(g: THREE.Object3D, empty: boolean) {
  const goods = g.userData.goods as THREE.Object3D | undefined;
  if (goods) goods.visible = !empty;
  const mark = g.userData.emptyMark as THREE.Object3D | undefined;
  if (mark) mark.visible = empty;
}

/**
 * A rusty dumpster in the Thrift Store's yard (Scrapping). Full: the lid is flipped open and junk (cans, a pot, scrap)
 * sticks out. Empty (someone just found the salvage): the lid is shut. Opens towards +z. Uses the shelf convention
 * (userData.goods hides when empty, userData.emptyMark shows), so setSpotEmpty works on it.
 */
export function buildScrapDumpster(): THREE.Group {
  const g = new THREE.Group();
  const rust = new THREE.MeshLambertMaterial({ color: 0x8a5a3a, flatShading: true });
  const dark = lambert(0x4a3a2e);
  const body = new THREE.Mesh(boxGeo(0.92, 0.62, 0.7), rust);
  body.position.set(0, 0.36, 0);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // Ribs on the sides, a darker rim, little wheels, a sliding side door.
  for (const x of [-0.3, 0, 0.3]) add(g, boxGeo(0.05, 0.6, 0.72), 0x6a4430, x, 0.36, 0, false);
  add(g, boxGeo(0.96, 0.05, 0.74), 0x5a3a28, 0, 0.67, 0, false);
  for (const [x, z] of [[-0.38, -0.26], [0.38, -0.26], [-0.38, 0.26], [0.38, 0.26]]) add(g, cylGeo(0.05, 0.05, 6), 0x1e1e22, x, 0.05, z, false);
  add(g, boxGeo(0.3, 0.22, 0.02), 0x6a4430, 0.2, 0.36, 0.36, false);
  // Full: junk on top and the lid flipped open, hanging down the back.
  const goods = new THREE.Group();
  const junk = [0xb8bcc2, 0x9aa0a6, 0x7a7e84, 0xc8a06a, 0x5a5f66];
  for (let i = 0; i < 7; i++) {
    const can = add(goods, cylGeo(0.05, 0.12, 8), junk[i % junk.length], -0.3 + (i % 4) * 0.2, 0.7 + (i % 2) * 0.04, -0.18 + Math.floor(i / 4) * 0.3, false);
    can.rotation.set(i * 0.9, i, i * 0.5);
  }
  add(goods, boxGeo(0.3, 0.1, 0.22), 0x3a3d42, 0.05, 0.7, 0.05, false).rotation.y = 0.4;
  const openLid = new THREE.Mesh(boxGeo(0.94, 0.04, 0.72), dark);
  openLid.position.set(0, 0.5, -0.38);
  openLid.rotation.x = -1.35;
  goods.add(openLid);
  g.add(goods);
  // Empty: the lid shut.
  const shut = new THREE.Mesh(boxGeo(0.94, 0.05, 0.72), dark);
  shut.position.set(0, 0.7, 0);
  shut.rotation.x = -0.05;
  shut.castShadow = true;
  shut.visible = false;
  g.add(shut);
  g.userData.goods = goods;
  g.userData.emptyMark = shut;
  return g;
}

/** Your grave: a rounded headstone with a cross, on a little mound of dirt, and a faint glow so you spot it. */
export function buildGrave(): THREE.Group {
  const g = new THREE.Group();
  const mound = add(g, new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x4a3a2a, 0, 0.02, 0.12);
  mound.scale.set(1, 0.28, 1.3);
  add(g, boxGeo(0.46, 0.5, 0.12), 0x8e877b, 0, 0.28, -0.22);
  const top = add(g, cylGeo(0.23, 0.12, 12), 0x8e877b, 0, 0.53, -0.22);
  top.rotation.x = Math.PI / 2;
  add(g, boxGeo(0.05, 0.26, 0.02), 0x2b2b2e, 0, 0.36, -0.15, false);
  add(g, boxGeo(0.18, 0.05, 0.02), 0x2b2b2e, 0, 0.42, -0.15, false);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.y = 0.09;
  g.add(glow);
  return g;
}

/** A low-poly city pigeon: grey body, a green-purple sheen on the neck, orange beak, pink feet, two wings.
 *  `userData.parts` has the bits animatePigeon moves. */
export function buildPigeon(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const b = add(body, new THREE.SphereGeometry(0.16, 8, 6), 0x7d828c, 0, 0.2, 0);
  b.scale.set(0.85, 0.75, 1.25);
  const tail = add(body, boxGeo(0.12, 0.03, 0.16), 0x5a5f68, 0, 0.22, -0.2);
  tail.rotation.x = -0.4;
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.14);
  body.add(head);
  add(head, new THREE.SphereGeometry(0.085, 8, 6), 0x6a707a, 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.07, 6, 5), 0x4f8a7a, 0, -0.07, -0.02); // the neck's sheen
  add(head, boxGeo(0.04, 0.03, 0.08), 0xe0a040, 0, -0.01, 0.1, false); // beak
  add(head, boxGeo(0.02, 0.02, 0.02), 0xe0473a, 0.045, 0.02, 0.05, false); // eyes
  add(head, boxGeo(0.02, 0.02, 0.02), 0xe0473a, -0.045, 0.02, 0.05, false);
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Group();
    w.position.set(side * 0.12, 0.24, 0);
    body.add(w);
    const m = add(w, boxGeo(0.04, 0.1, 0.28), 0x6a707a, side * 0.02, 0, -0.02);
    m.castShadow = true;
    return w;
  });
  for (const x of [-0.05, 0.05]) add(body, boxGeo(0.02, 0.1, 0.02), 0xd88a8a, x, 0.05, 0.02, false);
  g.userData.parts = { body, head, wings };
  return g;
}

/** Animate a pigeon: 'peck' (pecking at the ground), 'fly' (flapping), 'attack' (pecking at you), 'dead' (tipped over). */
export function animatePigeon(g: THREE.Group, mode: 'peck' | 'fly' | 'attack' | 'dead' | 'walk', t: number, phase = 0) {
  const p = g.userData.parts as { body: THREE.Group; head: THREE.Group; wings: THREE.Group[] };
  const s = t / 1000 + phase;
  p.body.rotation.z = mode === 'dead' ? Math.PI / 2 : 0;
  p.wings.forEach((w, i) => (w.rotation.z = mode === 'fly' ? (i ? -1 : 1) * (0.3 + Math.sin(s * 30) * 0.9) : 0));
  if (mode === 'attack') p.head.rotation.x = 0.6 + Math.sin(s * 25) * 0.5;
  // Walking: the quick forward-and-back head bob pigeons do with every step.
  else if (mode === 'walk') p.head.rotation.x = Math.sin(s * 16) * 0.35;
  else if (mode === 'peck') p.head.rotation.x = Math.max(0, Math.sin(s * 3.1)) > 0.85 ? 0.9 : Math.sin(s * 1.7) * 0.1;
  else p.head.rotation.x = 0;
}

/** A sewer rat (level 3): a big, hunched, spiky-furred rat with glowing red eyes and a long pink tail. Faces +z. */
const ratFur = new THREE.MeshLambertMaterial({ color: 0x4f4943, flatShading: true });
const ratEye = new THREE.MeshLambertMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.6 });
export function buildRat(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), ratFur);
  torso.position.set(0, 0.2, -0.04);
  torso.scale.set(0.95, 0.85, 1.6);
  torso.castShadow = true;
  body.add(torso);
  // Spiky fur along the back.
  for (let i = 0; i < 6; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), ratFur);
    spike.position.set((i % 2 ? 1 : -1) * 0.04, 0.34 - Math.abs(i - 2.5) * 0.015, -0.2 + i * 0.07);
    spike.rotation.x = -0.6;
    body.add(spike);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.24, 0.22);
  body.add(head);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), ratFur);
  skull.scale.set(0.95, 0.85, 1.1);
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 6), ratFur);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.02, 0.12);
  head.add(snout);
  add(head, new THREE.SphereGeometry(0.022, 6, 4), 0xd88a96, 0, -0.02, 0.21, false); // nose
  add(head, boxGeo(0.018, 0.03, 0.01), 0xf2ead8, 0.012, -0.065, 0.17, false); // teeth
  add(head, boxGeo(0.018, 0.03, 0.01), 0xf2ead8, -0.012, -0.065, 0.17, false);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), ratEye);
    eye.position.set(side * 0.055, 0.025, 0.07);
    head.add(eye);
    const ear = add(head, new THREE.CylinderGeometry(0.05, 0.05, 0.015, 8), 0xc48a8a, side * 0.07, 0.08, -0.03, false);
    ear.rotation.set(Math.PI / 2 - 0.3, 0, side * 0.5);
  }
  // Four little legs with pink feet.
  const legs = [-1, 1].flatMap((side) =>
    [0.12, -0.16].map((z) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.1, 0.12, z);
      body.add(leg);
      add(leg, boxGeo(0.05, 0.12, 0.05), 0x4a4440, 0, -0.05, 0, false);
      add(leg, boxGeo(0.06, 0.02, 0.08), 0xd8a0a0, 0, -0.11, 0.02, false);
      return leg;
    }),
  );
  // The tail: a long thin pink curve trailing behind.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.18, -0.3),
    new THREE.Vector3(0.06, 0.1, -0.45),
    new THREE.Vector3(-0.05, 0.04, -0.6),
    new THREE.Vector3(0.08, 0.03, -0.78),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.014, 5), lambert(0xd8a0a0));
  body.add(tail);
  // Big for a rat (a level-3 monster): knee-high to a person.
  body.scale.setScalar(1.3);
  g.userData.parts = { body, head, legs, tail };
  return g;
}

/** Animate a rat: sniffing around ('peck'), scurrying ('walk'), lunging at you ('attack'), or on its back ('dead'). */
export function animateRat(g: THREE.Group, mode: 'peck' | 'fly' | 'attack' | 'dead' | 'walk', t: number, phase = 0) {
  const p = g.userData.parts as { body: THREE.Group; head: THREE.Group; legs: THREE.Group[]; tail: THREE.Mesh };
  const s = t / 1000 + phase;
  p.body.rotation.z = mode === 'dead' ? Math.PI * 0.9 : 0;
  p.body.position.y = mode === 'dead' ? 0.4 : mode === 'walk' ? Math.abs(Math.sin(s * 18)) * 0.03 : 0;
  p.legs.forEach((l, i) => (l.rotation.x = mode === 'walk' ? Math.sin(s * 18 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 : 0));
  p.tail.rotation.y = Math.sin(s * (mode === 'walk' ? 10 : 2.5)) * 0.25;
  if (mode === 'attack') {
    const k = Math.max(0, Math.sin(s * 9));
    p.body.position.z = k * 0.12;
    p.head.rotation.x = -0.3 * k;
  } else {
    p.body.position.z = 0;
    // Sniffing: little quick nods now and then.
    p.head.rotation.x = mode === 'peck' ? (Math.sin(s * 1.3) > 0.6 ? Math.sin(s * 22) * 0.12 : 0) : 0;
  }
}

/**
 * The sewer rat, built from rings (docs/design.md §18; a preview for now, v0.45), after the old-school RuneScape rat:
 * crouched (haunches high, head low), a jagged ridge of fur along the back, a long head with pointed ears and an open
 * mouth full of teeth, splayed legs with claws, a long thick tail arching up. Grey fur, lighter underneath. Under 400
 * triangles. The same parts as buildRat (body, head, legs, tail), so animateRat moves it.
 */
export function buildRatRings(): THREE.Group {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const FUR = 0x7e7a72;
  const BELLY = 0xa29c92;
  const DARK = 0x3a3634;
  const TAIL = 0x5e4a4e;
  const CLAW = 0x2a2624;
  // The body: low at the chest, rising to big haunches, then a short rump.
  body.add(
    loft(
      [
        { z: -0.36, w: 0.06, h: 0.06, y: 0.25 }, // rump
        { z: -0.26, w: 0.17, h: 0.15, y: 0.27 }, // haunches: wide and high
        { z: -0.08, w: 0.16, h: 0.15, y: 0.25 }, // arched back
        { z: 0.08, w: 0.13, h: 0.12, y: 0.2 }, // chest, lower
        { z: 0.18, w: 0.08, h: 0.08, y: 0.17 }, // neck, lower still
      ],
      6, FUR, BELLY,
    ),
  );
  // A jagged ridge of fur along the back, and tufts on the haunches (they make the silhouette).
  body.add(
    spikes(
      [
        [V(0, 0.4, 0.06), V(0, 0.47, -0.02), 0.035],
        [V(0, 0.42, -0.03), V(0, 0.5, -0.11), 0.04],
        [V(0, 0.42, -0.12), V(0, 0.5, -0.2), 0.04],
        [V(0, 0.41, -0.2), V(0, 0.48, -0.29), 0.035],
        [V(0, 0.37, -0.28), V(0, 0.42, -0.36), 0.03],
        ...[-1, 1].map((s) => [V(s * 0.15, 0.3, -0.22), V(s * 0.21, 0.36, -0.3), 0.03] as [THREE.Vector3, THREE.Vector3, number]),
      ],
      FUR,
    ),
  );
  // The head, low and forward (pivot at the neck): a long skull, a pointed snout, an open lower jaw.
  const head = new THREE.Group();
  head.position.set(0, 0.17, 0.18);
  body.add(head);
  head.add(
    loft(
      [
        { z: -0.02, w: 0.075, h: 0.075, y: 0.02 },
        { z: 0.08, w: 0.085, h: 0.065, y: 0 },
        { z: 0.18, w: 0.045, h: 0.04, y: -0.02 },
        { z: 0.25, w: 0.012, h: 0.014, y: -0.025 },
      ],
      6, FUR, BELLY,
    ),
  );
  // The lower jaw hanging open (a dark wedge, red inside), with teeth top and bottom.
  head.add(
    loft(
      [
        { z: 0.04, w: 0.05, h: 0.02, y: -0.07 },
        { z: 0.19, w: 0.025, h: 0.012, y: -0.085 },
      ],
      4, DARK, DARK,
    ),
  );
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a2a2a, side: THREE.DoubleSide }));
  mouth.rotation.x = -Math.PI / 2 + 0.25;
  mouth.position.set(0, -0.055, 0.12);
  head.add(mouth);
  head.add(
    spikes(
      [
        ...[-1, 1].map((s) => [V(s * 0.012, -0.035, 0.21), V(s * 0.012, -0.075, 0.215), 0.007] as [THREE.Vector3, THREE.Vector3, number]),
        ...[-1, 1].map((s) => [V(s * 0.02, -0.075, 0.17), V(s * 0.02, -0.045, 0.17), 0.006] as [THREE.Vector3, THREE.Vector3, number]),
      ],
      0xe8dcb0,
    ),
  );
  for (const s of [-1, 1]) {
    // Pointed ears, swept back: a pink triangle with a fur back.
    const ear = spikes([[V(s * 0.05, 0.06, -0.01), V(s * 0.11, 0.15, -0.07), 0.035]], 0xb88488);
    head.add(ear);
    // Small slanted red eyes that glow.
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), ratEye);
    eye.scale.set(1.3, 0.7, 1);
    eye.rotation.z = s * 0.4;
    eye.position.set(s * 0.06, 0.03, 0.1);
    head.add(eye);
  }
  // Legs, splayed out, each with three dark claws: front legs reach forward, back legs fold under the haunches.
  const legs = ([[-0.09, 0.1, 1], [0.09, 0.1, 1], [-0.13, -0.22, 0], [0.13, -0.22, 0]] as const).map(([x, z, front]) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.18, z);
    body.add(leg);
    const s = Math.sign(x);
    const knee = front ? V(s * 0.03, -0.09, 0.05) : V(s * 0.05, -0.04, -0.09);
    const foot = front ? V(s * 0.04, -0.17, 0.09) : V(s * 0.06, -0.17, -0.02);
    leg.add(limb(V(0, 0, 0), knee, front ? 0.055 : 0.09, 0.045, FUR));
    leg.add(limb(knee, foot, 0.042, 0.03, FUR));
    leg.add(
      spikes(
        [-1, 0, 1].map((k) => [foot.clone().add(V(k * 0.02, 0, 0)), foot.clone().add(V(k * 0.035 + s * 0.01, -0.012, 0.07)), 0.009] as [THREE.Vector3, THREE.Vector3, number]),
        CLAW,
      ),
    );
    return leg;
  });
  // The tail: thick at the root, arching up and back, then curling down to a thin end.
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.35);
  body.add(tail);
  tail.add(
    loft(
      [
        { z: 0, w: 0.045, h: 0.045, y: 0 },
        { z: -0.15, w: 0.036, h: 0.036, y: 0.1 },
        { z: -0.32, w: 0.026, h: 0.026, y: 0.2, x: 0.03 },
        { z: -0.5, w: 0.016, h: 0.016, y: 0.24, x: 0.05 },
        { z: -0.68, w: 0.008, h: 0.008, y: 0.2, x: 0.03 },
        { z: -0.8, w: 0.002, h: 0.002, y: 0.13, x: 0.01 },
      ],
      4, TAIL,
    ),
  );
  g.userData.parts = { body, head, legs, tail };
  return g;
}

/**
 * The city pigeon, built from rings (docs/design.md §18; a preview for now, v0.45), in the old-school RuneScape style of
 * its seagull: a fat teardrop body with a puffed chest, a small head on a short neck with the green-purple sheen, a dark
 * beak with a white tip at its base, folded wings with two black bars, a fanned tail with a dark band, pink-red legs.
 * The same parts as buildPigeon (body, head, wings), so animatePigeon moves it. Under 400 triangles.
 */
export function buildPigeonRings(): THREE.Group {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const GREY = 0x8a909a;
  const PALE = 0xa8adb4;
  const DARK = 0x4a4e56;
  const SHEEN = 0x4f8a7a;
  const LEG = 0xc0605a;
  // A fat teardrop: narrow at the tail, widest at the belly, a puffed-out chest.
  body.add(
    loft(
      [
        { z: -0.2, w: 0.04, h: 0.03, y: 0.22 },
        { z: -0.11, w: 0.1, h: 0.09, y: 0.21 },
        { z: 0.0, w: 0.135, h: 0.12, y: 0.2 },
        { z: 0.09, w: 0.13, h: 0.125, y: 0.23 },
        { z: 0.16, w: 0.065, h: 0.075, y: 0.28 },
      ],
      6, GREY, PALE,
    ),
  );
  // The tail: a flat fan sticking out back, with a dark band at the end.
  body.add(loft([{ z: -0.17, w: 0.04, h: 0.012, y: 0.23 }, { z: -0.27, w: 0.075, h: 0.01, y: 0.25 }], 4, GREY));
  body.add(loft([{ z: -0.27, w: 0.075, h: 0.01, y: 0.25 }, { z: -0.31, w: 0.08, h: 0.008, y: 0.255 }], 4, DARK));
  // Folded wings along the sides (pivot at the shoulder, so they flap), each with two black bars and a dark tip.
  const wings = [-1, 1].map((sd) => {
    const w = new THREE.Group();
    w.position.set(sd * 0.115, 0.25, 0.06);
    body.add(w);
    const slab = loft(
      [
        { z: 0.02, w: 0.015, h: 0.05, y: 0, x: 0 },
        { z: -0.1, w: 0.015, h: 0.055, y: -0.005, x: sd * 0.015 },
        { z: -0.22, w: 0.01, h: 0.025, y: 0.005, x: sd * 0.005 },
      ],
      4, GREY,
    );
    w.add(slab);
    for (const z of [-0.06, -0.11]) add(w, boxGeo(0.034, 0.075, 0.018), 0x2a2c30, sd * 0.012, -0.01, z, false);
    add(w, boxGeo(0.026, 0.035, 0.05), DARK, sd * 0.004, 0.0, -0.2, false);
    return w;
  });
  // The head (pivot at the base of the neck): the shiny green neck, a small round grey head, the beak, orange eyes.
  const head = new THREE.Group();
  head.position.set(0, 0.29, 0.13);
  body.add(head);
  head.add(loft([{ z: -0.04, w: 0.06, h: 0.06, y: -0.03 }, { z: 0.02, w: 0.05, h: 0.05, y: 0.02 }], 6, SHEEN));
  head.add(
    loft(
      [
        { z: -0.02, w: 0.045, h: 0.045, y: 0.05 },
        { z: 0.04, w: 0.058, h: 0.056, y: 0.07 },
        { z: 0.09, w: 0.04, h: 0.04, y: 0.065 },
        { z: 0.12, w: 0.016, h: 0.018, y: 0.055 },
      ],
      6, GREY, PALE,
    ),
  );
  head.add(spikes([[V(0, 0.055, 0.11), V(0, 0.04, 0.18), 0.013]], 0x3a3634));
  add(head, boxGeo(0.03, 0.014, 0.02), 0xe8e4dc, 0, 0.07, 0.115, false); // the white cere
  for (const sd of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.012), new THREE.MeshLambertMaterial({ color: 0xe8801a, emissive: 0x5a2a00 }));
    eye.position.set(sd * 0.045, 0.075, 0.07);
    head.add(eye);
  }
  // Pink-red legs and three toes each.
  for (const sd of [-1, 1]) {
    const hip = V(sd * 0.04, 0.12, 0.03);
    const foot = V(sd * 0.045, 0.01, 0.045);
    body.add(limb(hip, foot, 0.016, 0.012, LEG));
    body.add(spikes([-1, 0, 1].map((k) => [foot, foot.clone().add(V(k * 0.035, -0.008, 0.05)), 0.008] as [THREE.Vector3, THREE.Vector3, number]), LEG));
  }
  g.userData.parts = { body, head, wings };
  return g;
}

/** A giant rat (the Rat Nest, v0.43): a rat twice the size, with darker, mangier fur. Animated like a rat. */
export function buildGiantRat(): THREE.Group {
  const g = buildRat();
  const p = g.userData.parts as { body: THREE.Group };
  p.body.scale.setScalar(2.5);
  p.body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === ratFur) m.material = giantFur;
  });
  return g;
}
const giantFur = new THREE.MeshLambertMaterial({ color: 0x2e2a26, flatShading: true });

/** A guard dog (the Junkyard, v0.43): a big brown mutt with a black muzzle, pointed ears and a spiked collar. It has the
 *  same parts as a rat (body, head, legs, tail), so it's animated like one. */
export function buildDog(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const fur = 0x7a5a3a;
  const dark = 0x2a221c;
  add(body, boxGeo(0.34, 0.3, 0.72), fur, 0, 0.5, -0.02);
  add(body, boxGeo(0.3, 0.12, 0.5), 0xa88a62, 0, 0.36, 0, false); // lighter belly
  const head = new THREE.Group();
  head.position.set(0, 0.7, 0.42);
  body.add(head);
  add(head, boxGeo(0.28, 0.24, 0.26), fur, 0, 0, 0);
  add(head, boxGeo(0.16, 0.13, 0.2), dark, 0, -0.05, 0.2); // muzzle
  add(head, boxGeo(0.06, 0.05, 0.04), 0x141210, 0, -0.01, 0.31, false); // nose
  add(head, boxGeo(0.12, 0.03, 0.12), 0xd85a6a, 0, -0.13, 0.22, false); // tongue
  for (const side of [-1, 1]) {
    const ear = add(head, new THREE.ConeGeometry(0.06, 0.16, 4), dark, side * 0.09, 0.18, -0.04);
    ear.rotation.z = side * -0.2;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), dogEye);
    eye.position.set(side * 0.07, 0.04, 0.13);
    head.add(eye);
  }
  // The spiked collar.
  const collar = add(body, new THREE.TorusGeometry(0.16, 0.035, 6, 12), 0x2a2a2e, 0, 0.62, 0.3, false);
  collar.rotation.x = Math.PI / 2 - 0.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = add(body, new THREE.ConeGeometry(0.02, 0.06, 4), 0xc8ccd2, Math.cos(a) * 0.19, 0.62 + Math.sin(a) * 0.09, 0.3 + Math.sin(a) * 0.05, false);
    spike.rotation.z = a - Math.PI / 2;
  }
  const legs = [-1, 1].flatMap((side) =>
    [0.26, -0.28].map((z) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0.4, z);
      body.add(leg);
      add(leg, boxGeo(0.09, 0.36, 0.1), fur, 0, -0.18, 0, false);
      add(leg, boxGeo(0.1, 0.05, 0.13), dark, 0, -0.37, 0.02, false);
      return leg;
    }),
  );
  const tail = add(body, boxGeo(0.06, 0.06, 0.3), fur, 0, 0.62, -0.48, false);
  tail.rotation.x = 0.7;
  g.userData.parts = { body, head, legs, tail };
  return g;
}
const dogEye = new THREE.MeshLambertMaterial({ color: 0xffb030, emissive: 0x8a5010, emissiveIntensity: 0.8 });

/** Each metal's colour (its gear is drawn in it). */
const METAL_COLORS: Record<string, number> = {
  tin: 0xb8bcc2, copper: 0xc07040, aluminium: 0xd8dde2, brass: 0xd8b04a, bronze: 0xb0703a, iron: 0x6a6e74, steel: 0x9aa4ae,
  hardened: 0x5a6878, titanium: 0xc8ccd8, tungsten: 0x4a4e58,
};
/** "tin_knuckles" → ["tin", "knuckles"]. */
const metalPiece = (id: string): [string, string] => {
  const i = id.lastIndexOf('_');
  return i < 0 ? ['', id] : [id.slice(0, i), id.slice(i + 1)];
};

/**
 * Show what someone wields and wears (docs/design.md §14): knuckles on the right hand, a bat or a knife held in it,
 * and a helmet, a plate vest and leg guards, all in the metal's colour.
 */
export function setGear(character: THREE.Group, equipment: Partial<Record<string, string>> | undefined) {
  const rig = character.userData.rig as { armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D; body: THREE.Object3D } | undefined;
  if (!rig) return;
  const key = ['weapon', 'head', 'body', 'legs'].map((k) => equipment?.[k] ?? '').join('|');
  if (character.userData.gearKey === key) return;
  character.userData.gearKey = key;
  for (const holder of [rig.armR, rig.body, rig.legL, rig.legR]) for (const name of ['weapon', 'armour']) {
    let o: THREE.Object3D | undefined;
    while ((o = holder.getObjectByName(name))) o.parent!.remove(o);
  }
  const [wMetal, wPiece] = metalPiece(equipment?.weapon ?? '');
  const metal = METAL_COLORS[wMetal] ?? 0xb8bcc2;
  if (wPiece === 'knuckles') {
    const k = new THREE.Group();
    k.name = 'weapon';
    for (let i = 0; i < 4; i++) {
      const ring = add(k, new THREE.TorusGeometry(0.022, 0.009, 4, 8), metal, -0.045 + i * 0.03, 0, 0.045, false);
      ring.rotation.y = Math.PI / 2;
    }
    add(k, boxGeo(0.12, 0.025, 0.025), metal, 0, -0.025, 0.045, false);
    k.position.set(0, -0.31, 0);
    rig.armR.add(k);
  } else if (wPiece === 'knife') {
    // A knife held point-forward: a dark handle with a guard, and a blade of the metal.
    const knife = new THREE.Group();
    knife.name = 'weapon';
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.04), lambert(0x3a2a1e));
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.045), lambert(0x8a8f96));
    guard.position.y = 0.065;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.045), new THREE.MeshLambertMaterial({ color: metal, emissive: 0x30343a }));
    blade.position.y = 0.17;
    for (const m of [handle, guard, blade]) {
      m.castShadow = true;
      knife.add(m);
    }
    knife.position.set(0, -0.33, 0.03);
    knife.rotation.x = 1.4;
    rig.armR.add(knife);
  } else if (wPiece === 'bat') {
    // A bat gripped in the right hand, pointing forward and up: grip tape, then the barrel (of the metal) thickening.
    const bat = new THREE.Group();
    bat.name = 'weapon';
    const barrelMat = lambert(metal);
    const tape = lambert(0x2b2b2e);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), tape);
    grip.position.y = 0.06;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.026, 0.5, 10), barrelMat);
    barrel.position.y = 0.39;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 8), barrelMat);
    knob.position.y = -0.03;
    for (const m of [grip, barrel, knob]) {
      m.castShadow = true;
      bat.add(m);
    }
    bat.position.set(0, -0.33, 0.04);
    bat.rotation.x = 1.2; // forward, a little up from the hanging arm
    rig.armR.add(bat);
  }
  // Armour, in its metal's colour, with darker rivets/straps.
  const armour = (holder: THREE.Object3D) => {
    const g = new THREE.Group();
    g.name = 'armour';
    holder.add(g);
    return g;
  };
  const head = equipment?.head;
  if (head) {
    const col = METAL_COLORS[metalPiece(head)[0]] ?? 0xb8bcc2;
    const g = armour(rig.body);
    const dome = add(g, new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), col, 0, 1.03, -0.01);
    dome.scale.set(1.05, 1.0, 1.08);
    add(g, boxGeo(0.4, 0.035, 0.06), col, 0, 1.03, 0.17, false); // the brim over the eyes
    add(g, boxGeo(0.03, 0.08, 0.03), 0x4a4e54, 0, 1.19, 0.05, false); // a ridge rivet
  }
  const body = equipment?.body;
  if (body) {
    const col = METAL_COLORS[metalPiece(body)[0]] ?? 0xb8bcc2;
    const g = armour(rig.body);
    add(g, boxGeo(0.36, 0.34, 0.06), col, 0, 0.68, 0.13); // chest plate
    add(g, boxGeo(0.36, 0.34, 0.06), col, 0, 0.68, -0.13); // back plate
    for (const x of [-0.17, 0.17]) add(g, boxGeo(0.04, 0.05, 0.3), 0x4a3a2e, x, 0.84, 0, false); // shoulder straps
    for (const y of [0.6, 0.76]) add(g, boxGeo(0.37, 0.02, 0.07), 0x6a6e74, 0, y, 0.135, false);
  }
  const legs = equipment?.legs;
  if (legs) {
    const col = METAL_COLORS[metalPiece(legs)[0]] ?? 0xb8bcc2;
    for (const leg of [rig.legL, rig.legR]) {
      const g = armour(leg);
      add(g, boxGeo(0.17, 0.2, 0.05), col, 0, -0.12, 0.07); // thigh plate
      add(g, boxGeo(0.15, 0.1, 0.04), col, 0, -0.27, 0.08); // knee guard
    }
  }
}
