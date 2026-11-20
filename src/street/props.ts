// Small models: cars, gym bags, shop shelves and parking meters. Chunky low-poly, muted dusk colours.
import * as THREE from 'three';
import { surfaceMat } from './surfaces';
import { limb, loft, spikes } from './loft';

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function lambert(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true }); // faceted, like everything (§18)
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
 * A shop shelf you steal from (v0.60: stocked with what the shop sells, built to the art rules, under 300 triangles):
 * a wooden shelf unit with three boards. The candy store's: wrapped candy bars in bright wrappers, a jar of gumballs
 * and lollipops on top. The gas station's: soda bottles, bags of chips and wrapped sandwiches. The goods hide when the
 * shelf has been emptied (userData.goods, see setSpotEmpty).
 */
export function buildShelf(kind: 'candy' | 'gas', seed: number): THREE.Group {
  const g = new THREE.Group();
  const wood = texMat('wood', WOOD, 1, 1, 0x6b4a2e);
  addTex(g, boxGeo(0.9, 1.0, 0.1), wood, 0, 0.5, -0.4);
  for (let level = 0; level < 3; level++) addTex(g, boxGeo(0.92, 0.03, 0.44), wood, 0, 0.18 + level * 0.32, -0.22, false);
  const goods = new THREE.Group();
  const pick = (list: number[], i: number) => list[(seed * 7 + i * 5) % list.length];
  if (kind === 'candy') {
    const wrappers = [0xd9473a, 0xf0b13c, 0x3a6ea5, 0x8a5ab8, 0xe86aa0, 0x4fa04a];
    for (let level = 0; level < 3; level++)
      for (let i = 0; i < 3; i++) {
        const c = pick(wrappers, level * 3 + i);
        const bar = addTex(goods, boxGeo(0.22, 0.05, 0.1), texMat(`wrap${c}`, wrapper(c), 1, 1, c), -0.27 + i * 0.27, 0.22 + level * 0.32, -0.15 + (i % 2) * 0.06, false);
        bar.rotation.y = ((seed + i) % 3) * 0.15 - 0.15;
      }
    // A glass jar of gumballs, and three lollipops stuck in a jar, on top.
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8, 1, true), new THREE.MeshLambertMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.45, flatShading: true, side: THREE.DoubleSide }));
    jar.position.set(-0.22, 1.1, -0.25);
    goods.add(jar);
    add(goods, new THREE.IcosahedronGeometry(0.07, 0), 0xe86aa0, -0.22, 1.06, -0.25, false);
    for (let i = 0; i < 3; i++) {
      add(goods, cylGeo(0.008, 0.2, 3), 0xf2efe8, 0.17 + i * 0.03, 1.13, -0.25 + (i - 1) * 0.02, false);
      const pop = add(goods, cylGeo(0.06, 0.02, 6), pick(wrappers, i + 2), 0.17 + i * 0.03, 1.25, -0.25 + (i - 1) * 0.02, false);
      pop.rotation.x = Math.PI / 2;
    }
  } else {
    const bottles = [0x2a6a3a, 0x8a2a24, 0x3a5a8a, 0xc8a83a];
    // Top board: soda bottles. Middle: bags of chips. Bottom: sandwiches in their wedges.
    for (let i = 0; i < 4; i++) {
      const c = pick(bottles, i);
      // (One tapered cylinder: the bottle and its neck.)
      add(goods, new THREE.CylinderGeometry(0.02, 0.045, 0.24, 6), c, -0.3 + i * 0.2, 0.84 + 0.12, -0.15, false);
    }
    const bags = [0xe0b23a, 0xd9473a, 0x3a6ea5];
    for (let i = 0; i < 3; i++) {
      const c = pick(bags, i);
      const bag = addTex(goods, boxGeo(0.2, 0.22, 0.08), texMat(`wrap${c}`, wrapper(c), 1, 1, c), -0.26 + i * 0.26, 0.52 + 0.11, -0.16, false);
      bag.rotation.x = -0.15;
    }
    const wedge = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 3);
    for (let i = 0; i < 3; i++) {
      const s = add(goods, wedge, 0xe8dcc0, -0.26 + i * 0.26, 0.2 + 0.06, -0.15, false);
      s.rotation.set(Math.PI / 2, 0, Math.PI / 2);
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
 * A salvage dumpster (Scrapping; v0.56 reworked): a real commercial dumpster, its front slanting in at the bottom, a
 * rim, a rib down each side, fork pockets, four wheels, two black plastic lids. Its paint and what's in
 * it depend on the metal: tin (a rusty one, cans and a pot), copper (green, pipe offcuts and a coil), aluminium (blue,
 * the Superstore's: crushed soda cans and foil). Full: both lids thrown open and the junk heaped up; empty (someone just
 * found the salvage): the lids shut. Opens towards +z. Uses the shelf convention (userData.goods hides when empty,
 * userData.emptyMark shows), so setSpotEmpty works on it. About 300 triangles (prop budget).
 */
export function buildScrapDumpster(metal: 'tin' | 'copper' | 'aluminium' = 'tin'): THREE.Group {
  const g = new THREE.Group();
  const paint = { tin: 0x8a5a3a, copper: 0x3a5a3e, aluminium: 0x2f5a8a }[metal];
  const trim = { tin: 0x5a3a28, copper: 0x24382a, aluminium: 0x1e3a5a }[metal];
  // The body: a side profile (back straight up, the front slanting in at the bottom) pushed out across its width.
  const profile = new THREE.Shape([
    new THREE.Vector2(-0.34, 0.1), new THREE.Vector2(0.2, 0.1), new THREE.Vector2(0.36, 0.7), new THREE.Vector2(-0.34, 0.7),
  ]);
  const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: 0.94, bevelEnabled: false, curveSegments: 1 });
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate(0.47, 0, 0);
  // (v0.60: brushed paint over steel; the shape's sides are in world units, so the texture's 1 a tile.)
  const body = new THREE.Mesh(bodyGeo, surfaceMat('metal', paint));
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  // The rim round the top, a rib down each side, fork pockets, wheels.
  add(g, boxGeo(0.98, 0.05, 0.74), trim, 0, 0.71, 0.01, false);
  for (const x of [-0.47, 0.47]) {
    add(g, boxGeo(0.03, 0.5, 0.05), trim, x * 1.01, 0.42, -0.02, false);
    add(g, boxGeo(0.06, 0.08, 0.5), 0x2b2b2e, x * 1.03, 0.3, -0.04, false);
  }
  for (const [x, z] of [[-0.38, -0.26], [0.38, -0.26], [-0.38, 0.14], [0.38, 0.14]]) add(g, boxGeo(0.06, 0.1, 0.1), 0x1e1e22, x, 0.05, z, false);
  // A stencilled number on the front.
  add(g, boxGeo(0.22, 0.1, 0.01), 0xd8d2c4, 0.22, 0.48, 0.305, false).rotation.x = -0.26;
  // Full: both lids thrown back over the rear, the junk heaped up.
  const goods = new THREE.Group();
  for (const x of [-0.24, 0.24]) {
    const lid = add(goods, boxGeo(0.46, 0.04, 0.7), 0x1e1e22, x, 0.6, -0.42, false);
    lid.rotation.x = -1.7;
  }
  const junk = {
    tin: [0xb8bcc2, 0x9aa0a6, 0x7a7e84, 0xc8a06a],
    copper: [0xc07040, 0xd88a50, 0x9a5a30, 0xe0a070],
    aluminium: [0xd8dde2, 0xb84a4a, 0x3a6aa8, 0xe8ecf0],
  }[metal];
  for (let i = 0; i < 5; i++) {
    const x = -0.3 + (i % 3) * 0.28, z = -0.16 + Math.floor(i / 3) * 0.3, y = 0.74 + (i % 3) * 0.04;
    const piece =
      metal === 'copper' && i % 2 === 0
        ? add(goods, cylGeo(0.03, 0.36, 5), junk[i % junk.length], x, y, z, false) // pipe offcuts
        : metal === 'aluminium' && i % 3 === 2
          ? add(goods, boxGeo(0.22, 0.03, 0.18), junk[3], x, y, z, false) // crumpled foil
          : add(goods, cylGeo(0.05, metal === 'aluminium' ? 0.08 : 0.12, 5), junk[i % junk.length], x, y, z, false); // cans
    piece.rotation.set(i * 0.9 + 0.4, i, i * 0.5);
  }
  if (metal === 'copper') add(goods, new THREE.TorusGeometry(0.12, 0.025, 4, 8), junk[0], 0.1, 0.8, 0.05, false).rotation.x = 1.2;
  else if (metal === 'tin') add(goods, boxGeo(0.3, 0.1, 0.22), 0x3a3d42, 0.05, 0.76, 0.05, false).rotation.y = 0.4;
  else add(goods, boxGeo(0.34, 0.12, 0.26), 0x8a7a5a, 0.05, 0.78, 0.02, false).rotation.y = -0.3; // a split carton
  g.add(goods);
  // Empty: both lids shut.
  const shut = new THREE.Group();
  for (const x of [-0.24, 0.24]) add(shut, boxGeo(0.46, 0.05, 0.74), 0x1e1e22, x, 0.75, 0.01, true).rotation.x = -0.04;
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
    new THREE.CircleGeometry(0.6, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.y = 0.09;
  g.add(glow);
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

// The rats' eyes: a dark, beady red (like the old-school RuneScape rat), with only a faint glow.
const ratEye = new THREE.MeshLambertMaterial({ color: 0x7a1414, emissive: 0x3a0606, flatShading: true });

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
 * The sewer rat, built from rings (docs/design.md §18; v0.45), after the old-school RuneScape rat:
 * crouched (haunches high, head low), a jagged ridge of fur along the back, a long head with pointed ears and an open
 * mouth full of teeth, splayed legs with claws, a long thick tail arching up. Grey fur, lighter underneath. Under 400
 * triangles. The same parts as before (body, head, legs, tail), so animateRat moves it. The giant rat is the same rat, bigger and darker.
 */
export function buildRat(look: { fur?: number; belly?: number; scale?: number } = {}): THREE.Group {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const FUR = look.fur ?? 0x7e7a72;
  const BELLY = look.belly ?? 0xa29c92;
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
    // Small slanted eyes, dark red.
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), ratEye);
    eye.scale.set(1.25, 0.75, 0.9);
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
  body.scale.setScalar(look.scale ?? 1);
  g.userData.parts = { body, head, legs, tail };
  return g;
}

/**
 * The city pigeon, built from rings (docs/design.md §18; v0.45), in the old-school RuneScape style of
 * its seagull: a fat teardrop body with a puffed chest, a small head on a short neck with the green-purple sheen, a dark
 * beak with a white tip at its base, folded wings with two black bars, a fanned tail with a dark band, pink-red legs.
 * The same parts as before (body, head, wings), so animatePigeon moves it. Under 400 triangles.
 */
export function buildPigeon(): THREE.Group {
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

/** A giant rat (the Rat Nest): the sewer rat at more than twice the size, with dark, mangy fur. Animated like a rat. */
export function buildGiantRat(): THREE.Group {
  return buildRat({ fur: 0x4a4440, belly: 0x6a625a, scale: 2.2 });
}

/**
 * A guard dog (the Junkyard), built from rings in the old-school RuneScape style (docs/design.md §18, v0.45): lean and
 * muscular, a deep chest and a tucked-in waist, a long snout with a black nose and bared teeth, pointed ears, a spiked
 * collar, thick legs with paws, a tail curling up. Brown on the back, tan underneath. The same parts as the rat (body,
 * head, legs, tail), so it's animated like one.
 */
export function buildDog(): THREE.Group {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const FUR = 0x6e4e32;
  const TAN = 0xb08a5e;
  const DARK = 0x2a221c;
  // The body: narrow rump, tucked waist, a deep chest, the neck rising forward.
  body.add(
    loft(
      [
        { z: -0.38, w: 0.08, h: 0.08, y: 0.58 },
        { z: -0.3, w: 0.13, h: 0.13, y: 0.56 },
        { z: -0.1, w: 0.11, h: 0.11, y: 0.56 }, // the waist
        { z: 0.1, w: 0.15, h: 0.18, y: 0.53 }, // deep chest
        { z: 0.24, w: 0.12, h: 0.14, y: 0.6 },
        { z: 0.32, w: 0.08, h: 0.09, y: 0.72 }, // neck
      ],
      6, FUR, TAN,
    ),
  );
  // The spiked collar round the neck.
  body.add(loft([{ z: 0.27, w: 0.115, h: 0.125, y: 0.68 }, { z: 0.32, w: 0.105, h: 0.115, y: 0.7 }], 6, 0x26262a));
  body.add(
    spikes(
      [0, 1, 2, 3, 4].map((i) => {
        const a = -Math.PI / 2 + (i / 4) * Math.PI;
        const base = V(Math.sin(a) * 0.11, 0.69 + Math.cos(a) * 0.12, 0.3);
        const tip = V(Math.sin(a) * 0.18, 0.69 + Math.cos(a) * 0.19, 0.3);
        return [base, tip, 0.014] as [THREE.Vector3, THREE.Vector3, number];
      }),
      0xc8ccd2,
    ),
  );
  // The head (pivot at the top of the neck): a broad skull, a long snout, the black nose, a lower jaw, teeth.
  const head = new THREE.Group();
  head.position.set(0, 0.76, 0.34);
  body.add(head);
  head.add(
    loft(
      [
        { z: -0.06, w: 0.09, h: 0.09, y: 0.03 },
        { z: 0.04, w: 0.1, h: 0.085, y: 0.03 },
        { z: 0.12, w: 0.06, h: 0.05, y: 0.0 },
        { z: 0.22, w: 0.045, h: 0.04, y: -0.01 },
      ],
      6, FUR, TAN,
    ),
  );
  head.add(loft([{ z: 0.17, w: 0.046, h: 0.041, y: -0.01 }, { z: 0.235, w: 0.035, h: 0.03, y: -0.005 }], 6, DARK)); // the dark muzzle
  const nose = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), new THREE.MeshLambertMaterial({ color: 0x141210, flatShading: true }));
  nose.position.set(0, 0.0, 0.24);
  head.add(nose);
  head.add(loft([{ z: 0.06, w: 0.05, h: 0.018, y: -0.07 }, { z: 0.2, w: 0.03, h: 0.012, y: -0.06 }], 4, DARK)); // lower jaw
  head.add(
    spikes(
      [-1, 1].flatMap((s) => [
        [V(s * 0.03, -0.035, 0.2), V(s * 0.03, -0.07, 0.205), 0.008],
        [V(s * 0.03, -0.06, 0.17), V(s * 0.03, -0.03, 0.17), 0.007],
      ] as [THREE.Vector3, THREE.Vector3, number][]),
      0xe8e0c8,
    ),
  );
  for (const s of [-1, 1]) {
    head.add(spikes([[V(s * 0.06, 0.08, -0.02), V(s * 0.1, 0.2, -0.05), 0.04]], DARK)); // pointed ears
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), dogEye);
    eye.scale.set(1.2, 0.8, 0.9);
    eye.position.set(s * 0.065, 0.05, 0.1);
    head.add(eye);
  }
  // Legs: thick at the top, a bend, paws; the back legs angled like a dog's.
  const legs = ([[-0.08, 0.14, 1], [0.08, 0.14, 1], [-0.09, -0.3, 0], [0.09, -0.3, 0]] as const).map(([x, z, front]) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.5, z);
    body.add(leg);
    const knee = front ? V(0, -0.24, 0.01) : V(0, -0.2, -0.08);
    const paw = front ? V(0, -0.47, 0.03) : V(0, -0.47, -0.02);
    leg.add(limb(V(0, 0.04, 0), knee, front ? 0.07 : 0.09, 0.045, FUR));
    leg.add(limb(knee, paw, 0.045, 0.035, front ? TAN : FUR));
    add(leg, boxGeo(0.08, 0.04, 0.11), DARK, paw.x, paw.y - 0.005, paw.z + 0.03, false);
    return leg;
  });
  // The tail, curling up over the back.
  const tail = new THREE.Group();
  tail.position.set(0, 0.6, -0.38);
  body.add(tail);
  tail.add(
    loft(
      [
        { z: 0, w: 0.035, h: 0.035, y: 0 },
        { z: -0.08, w: 0.03, h: 0.03, y: 0.1 },
        { z: -0.1, w: 0.024, h: 0.024, y: 0.2 },
        { z: -0.06, w: 0.016, h: 0.016, y: 0.28 },
      ],
      4, FUR,
    ),
  );
  g.userData.parts = { body, head, legs, tail };
  return g;
}
const dogEye = new THREE.MeshLambertMaterial({ color: 0xffb030, emissive: 0x8a5010, emissiveIntensity: 0.8 });

/** Each metal's colour (its gear is drawn in it). */
export const METAL_COLORS: Record<string, number> = {
  tin: 0xb8bcc2, copper: 0xc07040, aluminium: 0xd8dde2, brass: 0xd8b04a, bronze: 0xb0703a, iron: 0x6a6e74, steel: 0x9aa4ae,
  hardened: 0x5a6878, titanium: 0xc8ccd8, tungsten: 0x4a4e58,
};
/** "tin_knuckles" → ["tin", "knuckles"], "tin_throwing_knife" → ["tin", "throwing_knife"] (metal ids have no "_"). */
const metalPiece = (id: string): [string, string] => {
  const i = id.indexOf('_');
  return i < 0 ? ['', id] : [id.slice(0, i), id.slice(i + 1)];
};

/**
 * Show what someone wields and wears (docs/design.md §14): knuckles on the right hand, a bat or a knife held in it,
 * and a helmet, a plate vest and leg guards, all in the metal's colour.
 */
export function setGear(character: THREE.Group, equipment: Partial<Record<string, string>> | undefined) {
  // (The human base model's joints, v0.45: weapons go in the right fist, the helmet on the head, the vest on the body,
  // leg guards on the thighs and knees.)
  const rig = character.userData.rig as
    | { hand: THREE.Object3D; head: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D; kneeL: THREE.Object3D; kneeR: THREE.Object3D; body: THREE.Object3D }
    | undefined;
  if (!rig) return;
  const key = ['weapon', 'head', 'body', 'legs'].map((k) => equipment?.[k] ?? '').join('|');
  if (character.userData.gearKey === key) return;
  character.userData.gearKey = key;
  for (const holder of [rig.hand, rig.head, rig.body, rig.legL, rig.legR, rig.kneeL, rig.kneeR]) for (const name of ['weapon', 'armour']) {
    let o: THREE.Object3D | undefined;
    while ((o = holder.getObjectByName(name))) o.parent!.remove(o);
  }
  const [wMetal, wPiece] = metalPiece(equipment?.weapon ?? '');
  const metal = METAL_COLORS[wMetal] ?? 0xb8bcc2;
  if (wPiece === 'knuckles') {
    const k = new THREE.Group();
    k.name = 'weapon';
    for (let i = 0; i < 4; i++) {
      const ring = add(k, new THREE.TorusGeometry(0.018, 0.008, 4, 8), metal, 0.02, 0.026 - i * 0.018, 0.04, false);
      ring.rotation.y = Math.PI / 2;
    }
    add(k, boxGeo(0.02, 0.075, 0.02), metal, 0.034, 0, 0.04, false);
    rig.hand.add(k);
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
    knife.position.set(0, 0, 0.02);
    knife.rotation.x = 1.4;
    rig.hand.add(knife);
  } else if (wPiece === 'throwing_knife') {
    // A throwing knife held by its handle (v0.51): smaller and slimmer than a fighting knife, no guard, a bare blade.
    const k = buildThrowingKnife(metal);
    k.name = 'weapon';
    k.position.set(0, 0, 0.02);
    k.rotation.x = 1.4;
    rig.hand.add(k);
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
    bat.position.set(0, 0, 0.03);
    bat.rotation.x = 1.2; // forward, a little up from the hanging arm
    rig.hand.add(bat);
  }
  // Armour, in its metal's colour, with darker rivets/straps.
  const armour = (holder: THREE.Object3D) => {
    const g = new THREE.Group();
    g.name = 'armour';
    holder.add(g);
    return g;
  };
  const head = equipment?.head;
  // The hair on top of the head hides under a helmet (v0.54), so it can't poke through.
  const crown = rig.head.getObjectByName('crown');
  if (crown) crown.visible = !head;
  if (head) {
    const col = METAL_COLORS[metalPiece(head)[0]] ?? 0xb8bcc2;
    const g = armour(rig.head);
    const dome = add(g, new THREE.SphereGeometry(0.122, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), col, 0, 0.03, -0.006);
    dome.scale.set(1.05, 1.0, 1.08);
    add(g, boxGeo(0.25, 0.022, 0.04), col, 0, 0.03, 0.11, false); // the brim over the eyes
    add(g, boxGeo(0.02, 0.05, 0.02), 0x4a4e54, 0, 0.13, 0.03, false); // a ridge rivet
  }
  const body = equipment?.body;
  if (body) {
    const col = METAL_COLORS[metalPiece(body)[0]] ?? 0xb8bcc2;
    const g = armour(rig.body);
    add(g, boxGeo(0.33, 0.3, 0.05), col, 0, 0.86, 0.118).rotation.x = -0.05; // chest plate
    add(g, boxGeo(0.33, 0.3, 0.05), col, 0, 0.86, -0.118); // back plate
    for (const x of [-0.14, 0.14]) add(g, boxGeo(0.035, 0.04, 0.26), 0x4a3a2e, x, 1.01, 0, false); // shoulder straps
    for (const y of [0.78, 0.92]) add(g, boxGeo(0.34, 0.016, 0.06), 0x6a6e74, 0, y, 0.124, false);
  }
  const legs = equipment?.legs;
  if (legs) {
    const col = METAL_COLORS[metalPiece(legs)[0]] ?? 0xb8bcc2;
    for (const [leg, knee] of [[rig.legL, rig.kneeL], [rig.legR, rig.kneeR]]) {
      add(armour(leg), boxGeo(0.15, 0.2, 0.04), col, 0, -0.13, 0.085); // thigh plate
      add(armour(knee), boxGeo(0.13, 0.09, 0.035), col, 0, -0.01, 0.075); // knee guard
      add(armour(knee), boxGeo(0.12, 0.14, 0.03), col, 0, -0.14, 0.073); // shin plate
    }
  }
}

/** A throwing knife along +y (handle at the origin, point up): a wrapped grip and a slim blade of the metal. Used in
 *  the hand and for the knife in flight (StreetView). */
export function buildThrowingKnife(metal: number): THREE.Group {
  const g = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.03), lambert(0x2b2b2e));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.15, 0.036), new THREE.MeshLambertMaterial({ color: metal, emissive: 0x30343a }));
  blade.position.y = 0.115;
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), new THREE.MeshLambertMaterial({ color: metal, emissive: 0x30343a }));
  point.position.y = 0.215;
  point.scale.set(0.7, 1, 1);
  for (const m of [grip, blade, point]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// ---------- loot lying on the ground (v0.46): metal, gear and quest items ----------
// Each one is a few chunky pieces, faceted, well under the item budget (200 triangles, docs/design.md §18), and about
// a third of a tile across so it reads from the game's camera. The gear lies flat, the same shapes you wear and wield.
// (Food uses Kenney's Food Kit, cash its bills: see buildGroundItem in streetLife.ts.)
export function buildLoot(item: string): THREE.Group | null {
  const g = new THREE.Group();
  const [m, piece] = metalPiece(item);
  const col = METAL_COLORS[m];
  const dim = (c: number, f: number) => new THREE.Color(c).multiplyScalar(f).getHex();
  if (col !== undefined) {
    const dark = dim(col, 0.7);
    if (piece === 'salvage') {
      // A small heap of scrap: a bent pipe, a twisted strip, a coil, a crumpled lump.
      const pipe = add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), col, -0.03, 0.04, 0.02);
      pipe.rotation.set(0.15, 0.4, Math.PI / 2);
      const elbow = add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), dark, 0.13, 0.08, 0.06);
      elbow.rotation.set(0, 0.4, 0.6);
      add(g, boxGeo(0.2, 0.012, 0.07), dark, 0.0, 0.03, -0.09).rotation.set(0.3, -0.5, 0.2);
      add(g, new THREE.TorusGeometry(0.06, 0.014, 4, 8), col, -0.12, 0.03, -0.04).rotation.x = Math.PI / 2 - 0.3;
      add(g, new THREE.DodecahedronGeometry(0.055, 0), dark, 0.07, 0.04, -0.03);
      return g;
    }
    if (piece === 'sheet') {
      // Two sheets, one a little askew on the other, with a rolled edge.
      add(g, boxGeo(0.34, 0.014, 0.24), dark, 0, 0.008, 0);
      const top = add(g, boxGeo(0.34, 0.014, 0.24), col, 0.02, 0.022, 0.01);
      top.rotation.y = 0.18;
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5), col, 0.19, 0.028, 0.04).rotation.set(Math.PI / 2, 0, 0.18);
      return g;
    }
    if (piece === 'knuckles') {
      for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.03, 0.012, 3, 6), col, (i - 1.5) * 0.06, 0.012, 0).rotation.x = Math.PI / 2;
      add(g, boxGeo(0.25, 0.024, 0.04), col, 0, 0.014, 0.05);
      return g;
    }
    if (piece === 'throwing_knife') {
      // Three slim knives, fanned out.
      for (let i = 0; i < 3; i++) {
        const k = new THREE.Group();
        add(k, boxGeo(0.08, 0.026, 0.03), 0x2b2b2e, -0.09, 0.013, 0);
        add(k, boxGeo(0.16, 0.012, 0.036), col, 0.03, 0.01, 0);
        add(k, new THREE.ConeGeometry(0.018, 0.05, 4), col, 0.135, 0.01, 0).rotation.set(Math.PI / 4, 0, -Math.PI / 2);
        k.rotation.y = (i - 1) * 0.35;
        k.position.set(0, i * 0.004, (i - 1) * 0.02);
        g.add(k);
      }
      return g;
    }
    if (piece === 'knife') {
      add(g, boxGeo(0.13, 0.04, 0.045), 0x3a2a1e, -0.12, 0.02, 0); // handle
      add(g, boxGeo(0.02, 0.05, 0.085), 0x8a8f96, -0.05, 0.025, 0); // guard
      add(g, boxGeo(0.24, 0.016, 0.05), col, 0.08, 0.01, 0); // blade
      add(g, new THREE.ConeGeometry(0.025, 0.06, 4), col, 0.23, 0.01, 0).rotation.set(Math.PI / 4, 0, -Math.PI / 2); // the point
      return g;
    }
    if (piece === 'bat') {
      const grip = add(g, new THREE.CylinderGeometry(0.024, 0.024, 0.18, 6), 0x2b2b2e, -0.27, 0.025, 0);
      grip.rotation.z = Math.PI / 2;
      const barrel = add(g, new THREE.CylinderGeometry(0.05, 0.028, 0.46, 8), col, 0.05, 0.05, 0);
      barrel.rotation.z = Math.PI / 2 + 0.05;
      add(g, new THREE.CylinderGeometry(0.034, 0.034, 0.03, 6), col, -0.37, 0.034, 0).rotation.z = Math.PI / 2;
      return g;
    }
    if (piece === 'helmet') {
      const dome = add(g, new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), col, 0, 0.0, 0);
      dome.scale.set(1.05, 0.95, 1.08);
      add(g, boxGeo(0.26, 0.022, 0.05), col, 0, 0.01, 0.12);
      add(g, boxGeo(0.02, 0.05, 0.02), 0x4a4e54, 0, 0.125, 0.03, false);
      dome.rotation.z = 0.12;
      return g;
    }
    if (piece === 'vest') {
      // The two plates lying on each other with the straps flopped over.
      add(g, boxGeo(0.33, 0.04, 0.3), dark, 0, 0.02, 0);
      add(g, boxGeo(0.33, 0.04, 0.3), col, 0.02, 0.06, 0.01).rotation.y = 0.1;
      for (const x of [-0.12, 0.14]) add(g, boxGeo(0.04, 0.02, 0.36), 0x4a3a2e, x, 0.085, 0.02, false);
      for (const z of [-0.06, 0.07]) add(g, boxGeo(0.34, 0.012, 0.03), 0x6a6e74, 0.02, 0.083, z, false);
      return g;
    }
    if (piece === 'legs') {
      // A pair: thigh plate, knee guard, shin plate, side by side.
      for (const x of [-0.09, 0.09]) {
        add(g, boxGeo(0.15, 0.03, 0.18), col, x, 0.015, -0.12);
        add(g, boxGeo(0.13, 0.04, 0.08), dark, x, 0.02, 0.0);
        add(g, boxGeo(0.12, 0.03, 0.15), col, x, 0.015, 0.12);
      }
      return g;
    }
  }
  if (item === 'rat_antidote') {
    // A little glass vial of green antidote, corked, lying on its side.
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0xcfe8e0, transparent: true, opacity: 0.45, flatShading: true }));
    glass.position.set(0, 0.045, 0);
    glass.rotation.z = Math.PI / 2;
    g.add(glass);
    add(g, new THREE.CylinderGeometry(0.036, 0.036, 0.13, 8), 0x5ac04a, -0.01, 0.042, 0, false).rotation.z = Math.PI / 2;
    add(g, new THREE.CylinderGeometry(0.03, 0.034, 0.05, 6), 0x8a6a4a, 0.1, 0.045, 0).rotation.z = Math.PI / 2; // the cork
    return g;
  }
  if (item === 'sewer_key') {
    // A big old iron key: the bow (a ring), the shaft and the bit.
    const iron = 0x6a6258;
    add(g, new THREE.TorusGeometry(0.06, 0.016, 4, 8), iron, -0.15, 0.016, 0).rotation.x = Math.PI / 2;
    add(g, new THREE.CylinderGeometry(0.016, 0.016, 0.26, 6), iron, 0.02, 0.016, 0).rotation.z = Math.PI / 2;
    add(g, boxGeo(0.07, 0.03, 0.07), iron, 0.12, 0.016, 0.04);
    add(g, boxGeo(0.025, 0.03, 0.04), iron, 0.08, 0.016, 0.03);
    return g;
  }
  return null;
}

// ---------- pixel textures for props (v0.59, docs/design.md §18) ----------
// Small textures drawn in code (no picture files), 32×32 texels, sampled crisp (nearest): brick, wood, corrugated
// steel, worn car paint. One texture covers one tile (1 unit) of surface; texMat repeats it to the face's size. Where
// there's no browser (the tests) a prop falls back to its plain colour.
type Painter = (g: CanvasRenderingContext2D, rnd: () => number) => void;
const texCache = new Map<string, THREE.Texture>();
const texMatCache = new Map<string, THREE.Material>();
function pixelTex(key: string, paint: Painter): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    let seed = [...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 2147483647 || 1;
    paint(c.getContext('2d')!, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    texCache.set(key, t);
  }
  return t;
}
/** A flat-shaded material with a pixel texture repeated u × v times over each face (plain `fallback` without a browser). */
function texMat(key: string, paint: Painter, u: number, v: number, fallback: number): THREE.Material {
  const base = pixelTex(key, paint);
  if (!base) return lambert(fallback);
  const k = `${key}:${u.toFixed(2)}:${v.toFixed(2)}`;
  let m = texMatCache.get(k);
  if (!m) {
    const t = base.clone();
    t.repeat.set(u, v);
    t.needsUpdate = true;
    m = new THREE.MeshLambertMaterial({ map: t, flatShading: true });
    texMatCache.set(k, m);
  }
  return m;
}
const px = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1) => ((g.fillStyle = col), g.fillRect(x, y, w, h));
const shade = (hex: number, f: number) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f)), gg = Math.min(255, Math.round(((hex >> 8) & 255) * f)), b = Math.min(255, Math.round((hex & 255) * f));
  return `rgb(${r},${gg},${b})`;
};
/** Bricks: four courses a tile, staggered, each brick its own shade, grey mortar, a few chipped and sooty ones. */
const BRICK: Painter = (g, rnd) => {
  px(g, '#6e665c', 0, 0, 32, 32);
  for (let row = 0; row < 4; row++)
    for (let b = -1; b < 3; b++) {
      const x = b * 16 + (row % 2) * 8;
      px(g, shade(0x8a5040, 0.8 + rnd() * 0.35), x + 1, row * 8 + 1, 15, 7);
      if (rnd() < 0.3) px(g, shade(0x8a5040, 0.6), x + 2 + Math.floor(rnd() * 10), row * 8 + 2, 3, 2);
      if (rnd() < 0.15) px(g, '#3a2c26', x + 1, row * 8 + 1, 15, 3);
    }
};
/** Wood planks: four boards a tile, grain streaks, dark gaps, nail heads at the ends. */
const WOOD: Painter = (g, rnd) => {
  for (let row = 0; row < 4; row++) {
    px(g, shade(0x7a5a3a, 0.85 + rnd() * 0.3), 0, row * 8, 32, 8);
    for (let i = 0; i < 4; i++) px(g, shade(0x5a4028, 0.9 + rnd() * 0.2), Math.floor(rnd() * 28), row * 8 + 1 + Math.floor(rnd() * 6), 3 + Math.floor(rnd() * 8), 1);
    px(g, '#2e2216', 0, row * 8 + 7, 32, 1);
    for (const x of [2, 29]) px(g, '#1e1a16', x, row * 8 + 3, 1, 1);
  }
};
/** Corrugated steel (the container's blue): ridges every 4 texels, rust bleeding from a few spots, dirt at the bottom. */
const STEEL: Painter = (g, rnd) => {
  for (let x = 0; x < 32; x++) px(g, shade(0x2f5a78, [1.05, 1.15, 0.95, 0.8][x % 4]), x, 0, 1, 32);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rnd() * 30), y = Math.floor(rnd() * 24);
    px(g, '#8a4a2a', x, y, 2, 2);
    px(g, '#6a3a22', x, y + 2, 1, 3 + Math.floor(rnd() * 5));
  }
  for (let x = 0; x < 32; x++) if (rnd() < 0.6) px(g, '#22303a', x, 29 + Math.floor(rnd() * 3), 1, 3);
};
/** Old car paint: faded grey, rust spots, scratches. */
const PAINT: Painter = (g, rnd) => {
  px(g, shade(0x6a6e74, 1), 0, 0, 32, 32);
  for (let i = 0; i < 40; i++) px(g, shade(0x6a6e74, 0.9 + rnd() * 0.2), Math.floor(rnd() * 32), Math.floor(rnd() * 32), 2, 2);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd() * 29), y = Math.floor(rnd() * 29);
    px(g, '#7a3e22', x, y, 3, 2), px(g, '#9a5a2a', x + 1, y + 1, 2, 2);
  }
  for (let i = 0; i < 3; i++) px(g, '#9a9ea4', Math.floor(rnd() * 20), Math.floor(rnd() * 32), 6 + Math.floor(rnd() * 6), 1);
};
/** Concrete chunks: grey with darker pits. */
const CONCRETE: Painter = (g, rnd) => {
  px(g, '#7a766e', 0, 0, 32, 32);
  for (let i = 0; i < 60; i++) px(g, rnd() < 0.5 ? '#5a5650' : '#8a867e', Math.floor(rnd() * 32), Math.floor(rnd() * 32));
};
/** A wrapper in colour `c`: a lighter band across the middle with a dark logo blob, crinkled ends. */
const wrapper = (c: number): Painter => (g) => {
  px(g, shade(c, 1), 0, 0, 32, 32);
  px(g, shade(c, 1.35), 0, 11, 32, 10);
  px(g, shade(c, 0.45), 11, 13, 10, 6);
  for (const x of [0, 30]) for (let y = 0; y < 32; y += 4) px(g, shade(c, 0.75), x, y, 2, 2);
};
/** A mesh with a textured material. */
function addTex(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- the Yard's hangout (v0.58): its props, built to the art rules (docs/design.md §18) ----------
// Each stands on the floor at its origin, flat-shaded, within the prop budget (300 triangles; the car is a vehicle,
// 800). props.test.ts counts them.

/** A box with its bottom at y (props stand on their origin). */
const boxAt = (p: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, shadow = true) =>
  add(p, boxGeo(w, h, d), color, x, y + h / 2, z, shadow);

/**
 * A shipping container (the gang's clubhouse), its length along x (`len` tiles long, 2 wide): faded blue, ribbed
 * sides, corner posts, the doors at its +x end swung wide open on their hinges, a dark inside with a TV glowing, a tarp
 * over half the roof. About 290 triangles.
 */
export function buildContainer(len = 4): THREE.Group {
  const g = new THREE.Group();
  const L = len - 0.2, D = 1.7, H = 1.35;
  const blue = 0x2f5a78, dark = 0x24465e;
  addTex(g, boxGeo(L, H, D), texMat('steel', STEEL, L, H, blue), 0, 0.08 + H / 2, 0);
  // Corner posts and the frame round the open end.
  for (const x of [-L / 2, L / 2]) for (const z of [-D / 2, D / 2]) boxAt(g, 0.1, H + 0.04, 0.1, dark, x, 0.06, z);
  // Ribs down both long sides.
  const ribs = Math.max(4, Math.round(L * 1.2));
  for (let i = 1; i < ribs; i++) {
    const x = -L / 2 + (i * L) / ribs;
    for (const z of [-D / 2 - 0.02, D / 2 + 0.02]) boxAt(g, 0.06, H - 0.1, 0.04, dark, x, 0.13, z, false);
  }
  // The open end: the inside dark, a TV on a crate glowing blue.
  const inside = new THREE.Mesh(boxGeo(0.02, H - 0.12, D - 0.12), new THREE.MeshLambertMaterial({ color: 0x0e1014, emissive: 0x10203a, emissiveIntensity: 0.6, flatShading: true }));
  inside.position.set(L / 2 + 0.01, 0.08 + H / 2, 0);
  g.add(inside);
  const tv = new THREE.Mesh(boxGeo(0.02, 0.22, 0.32), new THREE.MeshLambertMaterial({ color: 0x5a8ad8, emissive: 0x4a7ad8, emissiveIntensity: 1.4, flatShading: true }));
  tv.position.set(L / 2 + 0.02, 0.5, 0.3);
  g.add(tv);
  // The doors: each hangs on its hinge at a corner of the open end and is swung right round (about 110°), so it lies
  // against the outside, a little away from the side wall.
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(L / 2 + 0.05, 0.08, side * D / 2);
    hinge.rotation.y = side * -1.92;
    addTex(hinge, boxGeo(0.05, H - 0.02, D / 2), texMat('steel', STEEL, D / 2, H, blue), 0, 0.01 + (H - 0.02) / 2, -side * D / 4);
    for (const t of [0.3, 0.75]) boxAt(hinge, 0.07, 0.04, D / 2 - 0.05, dark, 0, t * H, -side * D / 4, false); // the bars
    g.add(hinge);
  }
  // Rust streaks on the side facing +z, and a tarp over the -x half of the roof.
  for (const [x, w] of [[-L / 3, 0.8], [L / 6, 1.1]]) boxAt(g, w, 0.3, 0.02, 0x8a4a2a, x, 0.45, D / 2 + 0.045, false);
  boxAt(g, L / 2, 0.04, D + 0.2, 0x3a5a3a, -L / 4, H + 0.08, 0, false).rotation.z = 0.04;
  return g;
}

/**
 * A half-demolished brick wall along x, `len` tiles long: its top broken off in steps (one shape, pushed out to the
 * wall's thickness), loose bricks at its foot. About 120 triangles.
 */
export function buildRuinWall(len = 3, seed = 1): THREE.Group {
  const g = new THREE.Group();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // The outline: along the bottom, then back over a jagged top (a step every half tile).
  const pts = [new THREE.Vector2(-len / 2, 0), new THREE.Vector2(len / 2, 0)];
  for (let i = len * 2; i >= 0; i--) pts.push(new THREE.Vector2(-len / 2 + i / 2, 0.45 + rnd() * 0.85));
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.3, bevelEnabled: false });
  geo.translate(0, 0, -0.15);
  // (The shape's faces are in world units, so the brick texture repeats once a tile.)
  addTex(g, geo, texMat('brick', BRICK, 1, 1, 0x8a5040), 0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const b = boxAt(g, 0.22, 0.09, 0.11, 0x7a4636, -len / 2 + rnd() * len, 0, (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.2), false);
    b.rotation.y = rnd() * 3;
  }
  return g;
}

/** A heap of rubble on one tile: broken brick and concrete (icosahedrons, no subdivision). About 160 triangles. */
export function buildRubble(seed = 1): THREE.Group {
  const g = new THREE.Group();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const colors = [0x8a5040, 0x7a766e, 0x5a5650];
  for (let i = 0; i < 8; i++) {
    const r = 0.1 + rnd() * 0.16;
    const mat = i % 3 === 0 ? texMat('brick', BRICK, 0.5, 0.5, colors[0]) : texMat('concrete', CONCRETE, 0.5, 0.5, colors[i % 3]);
    const m = addTex(g, new THREE.IcosahedronGeometry(r, 0), mat, (rnd() - 0.5) * 0.6, r * 0.6 + (i < 3 ? 0.12 : 0), (rnd() - 0.5) * 0.6, i < 4);
    m.rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  return g;
}

/**
 * A stripped car on cinder blocks, along x (2 tiles): no wheels, no doors, the hood up, one wheel left lying beside it.
 * About 200 triangles (vehicle budget 800).
 */
export function buildStrippedCar(color = 0x6a6e74): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) boxAt(g, 0.22, 0.3, 0.18, 0x8a8680, x, 0, z);
  addTex(g, boxGeo(1.7, 0.36, 0.8), texMat('paint', PAINT, 1.7, 0.36, color), 0, 0.48, 0);
  addTex(g, boxGeo(0.9, 0.3, 0.74), texMat('paint', PAINT, 0.9, 0.3, color), 0.1, 0.81, 0);
  boxAt(g, 0.92, 0.22, 0.76, 0x14161a, 0.1, 0.7, 0, false); // the empty windows
  for (const z of [-0.41, 0.41]) boxAt(g, 0.6, 0.28, 0.02, 0x14161a, 0.1, 0.34, z, false); // where the doors were
  // The hood, propped up on its hinge at the windscreen.
  const hinge = new THREE.Group();
  hinge.position.set(-0.35, 0.66, 0);
  hinge.rotation.z = -1.0;
  addTex(hinge, boxGeo(0.5, 0.03, 0.78), texMat('paint', PAINT, 0.5, 0.78, color), -0.25, 0.015, 0, false);
  g.add(hinge);
  const wheel = add(g, new THREE.TorusGeometry(0.2, 0.09, 6, 8), 0x1a1a1e, 1.2, 0.09, 0.45, false);
  wheel.rotation.x = -Math.PI / 2;
  return g;
}

/** The dice game: a crate for a table, two dice and some bills on it, a bottle. About 100 triangles. */
export function buildDiceCrate(): THREE.Group {
  const g = new THREE.Group();
  addTex(g, boxGeo(0.6, 0.5, 0.6), texMat('wood', WOOD, 0.6, 0.5, 0x7a5a3a), 0, 0.3, 0).rotation.y = 0.2;
  addTex(g, boxGeo(0.62, 0.02, 0.62), texMat('wood', WOOD, 0.62, 0.62, 0x6a4a2e), 0, 0.56, 0, false).rotation.y = 0.2;
  for (const [x, z] of [[-0.08, 0.05], [0.07, -0.06]]) boxAt(g, 0.07, 0.07, 0.07, 0xf2efe8, x, 0.57, z, false).rotation.y = x * 9;
  for (let i = 0; i < 3; i++) boxAt(g, 0.16, 0.01, 0.08, 0x5a8a4a, -0.2 + i * 0.12, 0.57, -0.18 + i * 0.05, false).rotation.y = i * 0.7;
  add(g, cylGeo(0.04, 0.22, 6), 0x3a6a3a, 0.22, 0.68, 0.18, false);
  return g;
}

/** The lookout's perch: two pallets stacked, a white plastic chair on top facing -z. About 100 triangles. */
export function buildLookout(): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 2; k++) addTex(g, boxGeo(0.8, 0.14, 0.8), texMat('wood', WOOD, 0.8, 0.8, 0x9a7a4e), 0, k * 0.15 + 0.07, 0).rotation.y = k * 0.15;
  boxAt(g, 0.42, 0.04, 0.4, 0xe8e6de, 0, 0.6, 0);
  boxAt(g, 0.42, 0.4, 0.04, 0xe8e6de, 0, 0.64, 0.19);
  for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) boxAt(g, 0.03, 0.3, 0.03, 0xe8e6de, x, 0.3, z, false);
  return g;
}

/**
 * String lights from a to b (world points; the group sits at a): a sagging wire with bulbs on it (octahedrons, so 8
 * triangles each), glowing. About 130 triangles for 14 bulbs.
 */
export function buildStringLights(a: THREE.Vector3, b: THREE.Vector3, bulbs = 14, sag = 0.35): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(a);
  const pts = Array.from({ length: bulbs + 1 }, (_, i) => {
    const t = i / bulbs;
    return new THREE.Vector3((b.x - a.x) * t, (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, (b.z - a.z) * t);
  });
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1e1b18 }));
  g.add(wire);
  const glow = new THREE.MeshLambertMaterial({ color: 0xffe0a0, emissive: 0xffc870, emissiveIntensity: 1.6, flatShading: true });
  const bulbGeo = new THREE.OctahedronGeometry(0.045, 0);
  for (const p of pts.slice(1, -1)) {
    const m = new THREE.Mesh(bulbGeo, glow);
    m.position.set(p.x, p.y - 0.05, p.z);
    g.add(m);
  }
  return g;
}

// ---------- Hotline Plumbing & Heating and the quest "Pipe Dreams" (v0.62) ----------
// Built to the art rules (docs/design.md §18): low-poly, flat-shaded, 6–12-sided round things, pixel textures on the
// materials, each within the prop budget (300 triangles). props.test.ts counts them. Each stands on its origin.

/** Galvanised pipe metal: brushed grey, a few darker joints. */
const PIPE_METAL: Painter = (g, rnd) => {
  px(g, '#9aa0a6', 0, 0, 32, 32);
  for (let x = 0; x < 32; x++) if (rnd() < 0.4) px(g, shade(0x9aa0a6, 0.88 + rnd() * 0.2), x, 0, 1, 32);
  for (let i = 0; i < 3; i++) px(g, '#6e737a', 0, Math.floor(rnd() * 30), 32, 2);
};
/** Old iron pipe: rust in streaks and blotches over dark brown, a pale tide line of scale. */
const RUST_PIPE: Painter = (g, rnd) => {
  px(g, '#6a3a22', 0, 0, 32, 32);
  for (let i = 0; i < 40; i++) px(g, rnd() < 0.5 ? '#8a4a2a' : '#4a2a1a', Math.floor(rnd() * 30), Math.floor(rnd() * 30), 2 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2));
  for (let x = 0; x < 32; x++) if (rnd() < 0.5) px(g, '#a8784a', x, 20, 1, 1);
};
/** Enamel (a water heater's white, a toolbox's red): a sheen streak, a few chips and scuffs. */
const ENAMEL = (c: number): Painter => (g, rnd) => {
  px(g, shade(c, 1), 0, 0, 32, 32);
  px(g, shade(c, 1.12), 4, 0, 3, 32);
  for (let i = 0; i < 8; i++) px(g, shade(c, 0.78), Math.floor(rnd() * 31), Math.floor(rnd() * 31), 2, 1);
};

/**
 * The water main (the bar's): a red handwheel on a cast-iron riser coming up out of a concrete pad, a flange, a blue
 * "W" plate, a lid in the pad. `userData.wheel` turns (StreetView: shut while you have the water off). About 200 tris.
 */
export function buildWaterMain(): THREE.Group {
  const g = new THREE.Group();
  addTex(g, boxGeo(0.62, 0.08, 0.62), texMat('concrete', CONCRETE, 1, 1, 0x7a766e), 0, 0.04, 0);
  boxAt(g, 0.26, 0.015, 0.26, 0x3a3d42, 0.12, 0.08, 0.12, false); // the lid of the meter box
  const iron = texMat('pipemetal', PIPE_METAL, 1, 1, 0x5a5e64);
  addTex(g, cylGeo(0.06, 0.42, 8), iron, -0.08, 0.08 + 0.21, -0.08);
  add(g, cylGeo(0.1, 0.05, 8), 0x4a4e54, -0.08, 0.14, -0.08); // the flange at the bottom
  add(g, cylGeo(0.085, 0.06, 8), 0x4a4e54, -0.08, 0.44, -0.08); // the valve body
  const wheel = new THREE.Group();
  wheel.position.set(-0.08, 0.53, -0.08);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 4, 10), lambert(0xc8322a));
  rim.rotation.x = Math.PI / 2;
  wheel.add(rim);
  for (const r of [0, Math.PI / 2]) {
    const spoke = new THREE.Mesh(boxGeo(0.26, 0.02, 0.025), lambert(0xa82a24));
    spoke.rotation.y = r;
    wheel.add(spoke);
  }
  add(wheel, cylGeo(0.03, 0.04, 6), 0x8a2620, 0, 0, 0, false);
  g.add(wheel);
  g.userData.wheel = wheel;
  // A small blue plate on the riser: W for water.
  const plate = boxAt(g, 0.1, 0.1, 0.01, 0x2e5f8a, -0.08, 0.24, -0.015, false);
  boxAt(plate, 0.06, 0.012, 0.012, 0xe8e2d4, 0, -0.006, 0.006, false);
  return g;
}

/**
 * The bar's burst pipe, old-school RuneScape style (the wall is at -x): a rusty pipe along the wall up high with a tee
 * coming into the room, broken off; a stream of water arcing out of it to the floor (a faceted ribbon, a paler core),
 * white bits splashing where it lands (animateBurstPipe), an irregular puddle with two smaller ones. `userData`:
 * `spray` (the stream and the splash: water on, still broken), `puddle`, `cracked` (the broken end), `fixed` (a new
 * shiny elbow and cap). StreetView shows them by your step in the quest. About 280 tris.
 */
export function buildBurstPipe(): THREE.Group {
  const g = new THREE.Group();
  const rust = texMat('rustpipe', RUST_PIPE, 1, 1, 0x8a4a2a);
  const run = addTex(g, cylGeo(0.06, 1.9, 6), rust, -0.42, 1.55, 0); // along the wall
  run.rotation.x = Math.PI / 2;
  const tee = addTex(g, cylGeo(0.06, 0.2, 6), rust, -0.32, 1.55, 0); // the tee into the room
  tee.rotation.z = Math.PI / 2;
  const cracked = new THREE.Group();
  const jag = add(cracked, cylGeo(0.07, 0.07, 6), 0x5a3020, -0.2, 1.55, 0); // the broken-off end
  jag.rotation.z = Math.PI / 2 + 0.25;
  g.add(cracked);
  const fixed = new THREE.Group();
  const elbow = add(fixed, cylGeo(0.075, 0.16, 6), 0xd0d4d8, -0.18, 1.55, 0); // the new Pipe Elbow, shiny tin
  elbow.rotation.z = Math.PI / 2;
  add(fixed, cylGeo(0.08, 0.04, 6), 0xb0b4b8, -0.1, 1.55, 0, false).rotation.z = Math.PI / 2; // its cap
  fixed.visible = false;
  g.add(fixed);
  // The stream: a tube along an arc from the break to the floor, flat-shaded so its facets catch the light like the
  // reference; a thinner, whiter core inside it.
  const spray = new THREE.Group();
  const land = new THREE.Vector3(0.75, 0.14, 0.12);
  const arc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 1.55, 0),
    new THREE.Vector3(0.2, 1.6, 0.03),
    new THREE.Vector3(0.55, 1.05, 0.08),
    land.clone(),
  ]);
  const blue = new THREE.MeshLambertMaterial({ color: 0x9cc8ec, emissive: 0x2a5a8a, emissiveIntensity: 0.55, transparent: true, opacity: 0.85, flatShading: true });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f8ff, emissive: 0x8ab0d0, emissiveIntensity: 0.6, flatShading: true });
  const stream = new THREE.Mesh(new THREE.TubeGeometry(arc, 8, 0.075, 5), blue);
  stream.scale.set(1, 1, 1.4); // a ribbon, wider than it is deep
  spray.add(stream);
  spray.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 5, 0.035, 3), white));
  // The splash: white bits (tetrahedra) flying up and out where it lands.
  const splash = new THREE.Group();
  splash.position.copy(land);
  const bit = new THREE.TetrahedronGeometry(0.035, 0);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(bit, white);
    m.userData = { a: (i / 12) * Math.PI * 2 + (i % 3) * 0.4, r: 0.2 + (i % 4) * 0.08, h: 0.18 + (i % 3) * 0.08, p: (i * 0.37) % 1 };
    splash.add(m);
  }
  spray.add(splash);
  spray.userData.splash = splash;
  g.add(spray);
  // The puddle: an irregular flat shape (a jagged ring of points), two little ones beside it. Paler where it's shallow.
  const puddle = new THREE.Group();
  const pool = (cx: number, cz: number, r: number, n: number, seed: number) => {
    const s = new THREE.Shape();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = r * (0.75 + 0.35 * Math.abs(Math.sin(seed * 7.3 + i * 2.1)));
      i === 0 ? s.moveTo(Math.cos(a) * k, Math.sin(a) * k) : s.lineTo(Math.cos(a) * k, Math.sin(a) * k);
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshLambertMaterial({ color: 0x6aa8e8, emissive: 0x2a6aa8, emissiveIntensity: 0.6, transparent: true, opacity: 0.95, flatShading: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.135, cz);
    puddle.add(m);
  };
  pool(land.x, land.z, 0.5, 10, 1);
  pool(land.x + 0.55, land.z + 0.4, 0.17, 6, 2);
  pool(land.x + 0.2, land.z - 0.55, 0.13, 6, 3);
  g.add(puddle);
  g.userData = { spray, puddle, cracked, fixed };
  return g;
}
/** The burst pipe's splash: each bit flies up and out from where the water lands, and falls back (`t`: seconds). */
export function animateBurstPipe(g: THREE.Group, t: number) {
  const splash = (g.userData.spray as THREE.Object3D | undefined)?.userData.splash as THREE.Group | undefined;
  if (!splash || !(g.userData.spray as THREE.Object3D).visible) return;
  for (const m of splash.children) {
    const { a, r, h, p } = m.userData as { a: number; r: number; h: number; p: number };
    const k = (t * 1.6 + p) % 1;
    m.position.set(Math.cos(a) * r * k, h * 4 * k * (1 - k), Math.sin(a) * r * k);
    m.rotation.set(k * 6, k * 4, 0);
  }
}

/** A shelf of plumbing fittings against a wall (the wall at -z): bins of elbows and tees, a coil of copper. ~260 tris. */
export function buildFittingsShelf(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const steel = surfaceMat('metal', 0x6a7078);
  addTex(g, boxGeo(0.95, 1.5, 0.08), steel, 0, 0.75, -0.38);
  for (let level = 0; level < 3; level++) addTex(g, boxGeo(0.95, 0.03, 0.4), steel, 0, 0.3 + level * 0.45, -0.2, false);
  const bins = [0xc8322a, 0x2e5f8a, 0xe0b23a];
  for (let level = 0; level < 3; level++)
    for (let i = 0; i < 3; i++) {
      boxAt(g, 0.26, 0.14, 0.3, bins[(seed + level + i) % 3], -0.3 + i * 0.3, 0.315 + level * 0.45, -0.2, false);
      if (i === (seed + level) % 3) add(g, cylGeo(0.025, 0.08, 6), 0xb0b4b8, -0.3 + i * 0.3, 0.48 + level * 0.45, -0.2, false); // a fitting peeking out
    }
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 3, 8), lambert(0xc07040));
  coil.position.set(0.25, 1.57, -0.2);
  coil.rotation.x = Math.PI / 2;
  g.add(coil);
  return g;
}

/** A water heater (white enamel, a dial, pipes on top). `tall`: the big hot-water tank in the workshop. ~150 tris. */
export function buildWaterHeater(tall = false): THREE.Group {
  const g = new THREE.Group();
  const h = tall ? 1.55 : 1.15, r = tall ? 0.3 : 0.24;
  addTex(g, cylGeo(r, h, 10), texMat('enamel_white', ENAMEL(0xe8e4dc), 1, 1, 0xe8e4dc), 0, 0.05 + h / 2, 0);
  add(g, cylGeo(r + 0.02, 0.05, 10), 0x8a8f96, 0, 0.025, 0); // the base ring
  add(g, cylGeo(r * 0.85, 0.06, 10), 0xd0ccc4, 0, 0.05 + h + 0.03, 0, false); // the domed top
  for (const dx of [-0.08, 0.08]) add(g, cylGeo(0.03, 0.22, 6), dx < 0 ? 0xc8322a : 0x2e5f8a, dx, 0.05 + h + 0.14, 0, false); // hot and cold
  add(g, cylGeo(0.05, 0.02, 8), 0x3a3d42, 0, 0.05 + h * 0.35, r + 0.005, false).rotation.x = Math.PI / 2; // the dial
  if (!tall) boxAt(g, 0.14, 0.08, 0.01, 0xf2d27a, 0, 0.05 + h * 0.65, r + 0.004, false); // a price tag
  return g;
}

/** A shop counter, `len` long along x: a wood top over a steel front, a till and a bell. ~120 tris. */
export function buildShopCounter(len = 1, till = false): THREE.Group {
  const g = new THREE.Group();
  addTex(g, boxGeo(len, 0.85, 0.6), surfaceMat('metal', 0x2e5f8a), 0, 0.425, 0);
  addTex(g, boxGeo(len + 0.04, 0.05, 0.66), texMat('wood', WOOD, len, 1, 0x7a5a3a), 0, 0.875, 0, false);
  if (till) {
    boxAt(g, 0.3, 0.14, 0.24, 0x3a3d42, -0.15, 0.9, 0.05, false);
    boxAt(g, 0.22, 0.1, 0.02, 0x7ac88a, -0.15, 1.04, -0.05, false).rotation.x = -0.4;
    add(g, new THREE.ConeGeometry(0.05, 0.05, 8), 0xd0b040, 0.25, 0.925, 0.1, false); // the bell
  }
  return g;
}

/** A plumber's workbench (along z, 2 tiles): a wood top, a vice, a pipe in it, tools on a pegboard. ~220 tris. */
export function buildPlumbBench(): THREE.Group {
  const g = new THREE.Group();
  const wood = texMat('wood', WOOD, 1, 2, 0x7a5a3a);
  addTex(g, boxGeo(0.7, 0.06, 1.9), wood, 0, 0.82, 0);
  for (const dz of [-0.85, 0.85]) for (const dx of [-0.28, 0.28]) boxAt(g, 0.06, 0.8, 0.06, 0x3a3d42, dx, 0, dz);
  addTex(g, boxGeo(0.62, 0.04, 1.8), wood, 0, 0.3, 0, false); // the shelf below
  boxAt(g, 0.18, 0.14, 0.12, 0x2e5f8a, -0.1, 0.85, -0.5); // the vice
  add(g, cylGeo(0.035, 0.8, 8), 0xb0b4b8, -0.1, 0.95, -0.5, false).rotation.x = Math.PI / 2;
  boxAt(g, 0.04, 0.9, 1.6, 0x8a6a4a, 0.33, 0.88, 0, false); // the pegboard
  for (const [dz, c] of [[-0.5, 0xc8322a], [0, 0x3a3d42], [0.45, 0xe0b23a]] as const) boxAt(g, 0.03, 0.3, 0.08, c, 0.3, 1.25, dz, false);
  return g;
}

/** A rack of pipes along x: two frames, lengths of pipe lying across them in two rows. ~240 tris. */
export function buildPipeRack(len = 2): THREE.Group {
  const g = new THREE.Group();
  for (const dx of [-len / 2 + 0.2, len / 2 - 0.2]) {
    boxAt(g, 0.06, 0.9, 0.06, 0x3a3d42, dx, 0, -0.2);
    boxAt(g, 0.06, 0.9, 0.06, 0x3a3d42, dx, 0, 0.2);
    for (const y of [0.35, 0.75]) boxAt(g, 0.06, 0.04, 0.46, 0x3a3d42, dx, y, 0, false);
  }
  const iron = texMat('pipemetal', PIPE_METAL, len, 1, 0x9aa0a6);
  for (const y of [0.42, 0.82])
    for (let i = 0; i < 3; i++) {
      const copper = (i + (y > 0.5 ? 1 : 0)) % 3 === 0;
      const p = copper ? add(g, cylGeo(0.04, len - 0.1, 6), 0xc07040, 0, y, -0.14 + i * 0.14, false) : addTex(g, cylGeo(0.04, len - 0.1, 6), iron, 0, y, -0.14 + i * 0.14, false);
      p.rotation.z = Math.PI / 2;
    }
  return g;
}

/** A red toolbox on a crate, its lid open, a wrench on top. ~90 tris. */
export function buildToolbox(): THREE.Group {
  const g = new THREE.Group();
  addTex(g, boxGeo(0.6, 0.4, 0.5), texMat('wood', WOOD, 1, 1, 0x7a5a3a), 0, 0.2, 0);
  addTex(g, boxGeo(0.45, 0.2, 0.22), texMat('enamel_red', ENAMEL(0xc8322a), 1, 1, 0xc8322a), 0, 0.5, 0);
  const lid = boxAt(g, 0.45, 0.02, 0.22, 0xa82a24, 0, 0.6, -0.12, false);
  lid.rotation.x = -1.1;
  const wrench = boxAt(g, 0.32, 0.02, 0.05, 0x9aa0a6, 0.02, 0.61, 0.04, false);
  wrench.rotation.y = 0.3;
  return g;
}

/** The Pipe Elbow (the quest's part, a tin sheet bent into an L): for the bag and the ground. ~70 tris. */
export function buildPipeElbow(): THREE.Group {
  const g = new THREE.Group();
  const tin = texMat('pipemetal', PIPE_METAL, 1, 1, 0xc8ccd0);
  addTex(g, cylGeo(0.07, 0.24, 8), tin, 0, 0.12 + 0.07, 0).rotation.z = Math.PI / 2;
  addTex(g, cylGeo(0.07, 0.2, 8), tin, 0.12, 0.17 + 0.1, 0);
  add(g, cylGeo(0.085, 0.04, 8), 0xa8acb0, -0.12, 0.19, 0, false).rotation.z = Math.PI / 2;
  add(g, cylGeo(0.085, 0.04, 8), 0xa8acb0, 0.12, 0.37, 0, false);
  return g;
}

// ---------- fire (v0.62, the quality bar: docs/design.md §18) ----------
/**
 * A fire (the burning barrels, the barbecue): teardrop flame tongues in three tones (deep orange outside, orange, a
 * yellow core), each bent like a real flame and flickering on its own (animateFire), embers rising out of it, a wisp of
 * dark smoke. `size` 1 is a barrel's fire (about 0.6 tall). Stands at its origin (the base of the flames). ~270 tris.
 */
export function buildFire(size = 1): THREE.Group {
  const g = new THREE.Group();
  const tongue = (r: number, h: number, bend: number) => {
    // A teardrop profile (fat low down, a long tip), turned round (5 sides), then bent sideways towards the tip.
    const pts = [[0.55, 0], [1, 0.22], [0.5, 0.62], [0, 1]].map(([a, b]) => new THREE.Vector2(a * r, b * h));
    const geo = new THREE.LatheGeometry(pts, 5);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + bend * (pos.getY(i) / h) ** 2);
    geo.computeVertexNormals();
    return geo;
  };
  const mat = (c: number, e: number, o: number) => new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: 1.6, transparent: true, opacity: o, flatShading: true, depthWrite: false });
  const layers: [number, number, number, number, number, number][] = [
    // [count, radius, height, colour, emissive, opacity]
    [3, 0.12, 0.55, 0xe8501a, 0xd8380a, 0.85],
    [2, 0.09, 0.45, 0xff8a22, 0xff6a10, 0.9],
    [1, 0.06, 0.32, 0xffe070, 0xffc030, 0.95],
  ];
  const flames: THREE.Mesh[] = [];
  layers.forEach(([n, r, h, c, e, o], li) => {
    const m = mat(c, e, o);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + li;
      const f = new THREE.Mesh(tongue(r * size, h * size * (0.85 + ((i * 37) % 10) / 30), 0.08 * size * (i % 2 ? 1 : -1)), m);
      f.position.set(Math.cos(a) * 0.07 * size * (li === 2 ? 0 : 1), 0, Math.sin(a) * 0.07 * size * (li === 2 ? 0 : 1));
      f.rotation.y = a;
      f.userData.phase = li * 1.3 + i * 2.1;
      f.renderOrder = 2 + li;
      flames.push(f);
      g.add(f);
    }
  });
  // Embers: little sparks drifting up and out, and smoke: dark puffs rising slowly above the flames.
  const ember = new THREE.MeshLambertMaterial({ color: 0xffd080, emissive: 0xffa030, emissiveIntensity: 2, flatShading: true });
  const embers: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.018 * size, 0), ember);
    m.userData = { a: i * 1.9, p: i / 6 };
    embers.push(m);
    g.add(m);
  }
  const smoke = new THREE.MeshLambertMaterial({ color: 0x3a3634, transparent: true, opacity: 0.35, flatShading: true, depthWrite: false });
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 * size, 0), smoke.clone());
    m.userData = { p: i / 3 };
    puffs.push(m);
    g.add(m);
  }
  g.userData = { flames, embers, puffs, size };
  animateFire(g, 0);
  return g;
}
/** A fire's flicker: each tongue stretches and sways on its own beat, embers rise and drift, smoke puffs climb, grow
 *  and fade (`t`: seconds). */
export function animateFire(g: THREE.Group, t: number) {
  const { flames, embers, puffs, size } = g.userData as { flames: THREE.Mesh[]; embers: THREE.Mesh[]; puffs: THREE.Mesh[]; size: number };
  for (const f of flames) {
    const p = f.userData.phase as number;
    const k = 0.82 + Math.sin(t * 9 + p) * 0.12 + Math.sin(t * 23 + p * 2) * 0.06;
    f.scale.set(1 + (1 - k) * 0.6, k, 1 + (1 - k) * 0.6);
    f.rotation.z = Math.sin(t * 5 + p) * 0.12;
  }
  embers.forEach((m) => {
    const k = (t * 0.7 + (m.userData.p as number)) % 1;
    const a = (m.userData.a as number) + k * 2;
    m.position.set(Math.cos(a) * 0.12 * size * k, (0.25 + k * 0.75) * size, Math.sin(a) * 0.12 * size * k);
    m.visible = k < 0.9;
  });
  puffs.forEach((m) => {
    const k = (t * 0.25 + (m.userData.p as number)) % 1;
    m.position.set(Math.sin(k * 3) * 0.06 * size, (0.55 + k * 0.9) * size, Math.cos(k * 2) * 0.05 * size);
    m.scale.setScalar(0.6 + k * 1.4);
    (m.material as THREE.MeshLambertMaterial).opacity = 0.35 * (1 - k);
  });
}

/**
 * The park's brick barbecue (v0.62, the quality bar): a brick base with an arched firebox in its front (+z) glowing with
 * coals, stone ledges either side, a grill on top with three sausages on it, a chimney with a cap at the back, a bag of
 * charcoal leaning on it. The fire itself is buildFire, placed on the grill by city.ts. About 260 tris.
 */
export function buildBarbecue(): THREE.Group {
  const g = new THREE.Group();
  const brick = texMat('brick', BRICK, 1, 1, 0x8a5040);
  addTex(g, boxGeo(0.95, 0.6, 0.7), brick, 0, 0.3, 0);
  // The firebox: an arch cut into the front (a dark opening with glowing coals at its bottom).
  const arch = new THREE.Shape();
  arch.moveTo(-0.22, 0);
  arch.lineTo(0.22, 0);
  arch.lineTo(0.22, 0.2);
  arch.quadraticCurveTo(0, 0.36, -0.22, 0.2);
  arch.closePath();
  const hole = new THREE.Mesh(new THREE.ShapeGeometry(arch, 3), lambert(0x1a1210));
  hole.position.set(0, 0.06, 0.352);
  g.add(hole);
  const coals = new THREE.MeshLambertMaterial({ color: 0x3a1a10, emissive: 0xff5a1a, emissiveIntensity: 1.4, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), coals);
    c.position.set(-0.11 + i * 0.11, 0.09, 0.32);
    g.add(c);
  }
  // Stone ledges either side of the grill, and the grill: a dark frame, bars across, glowing coals under them.
  const stone = texMat('concrete', CONCRETE, 1, 1, 0x7a766e);
  for (const x of [-0.39, 0.39]) addTex(g, boxGeo(0.2, 0.06, 0.76), stone, x, 0.63, 0);
  boxAt(g, 0.58, 0.02, 0.6, 0x2a1a14, 0, 0.6, 0, false);
  const glow = new THREE.Mesh(boxGeo(0.54, 0.01, 0.56), coals);
  glow.position.set(0, 0.625, 0);
  g.add(glow);
  for (let i = 0; i < 4; i++) boxAt(g, 0.02, 0.025, 0.58, 0x3a3d42, -0.21 + i * 0.14, 0.66, 0, false);
  // Three sausages browning on the grill.
  for (let i = 0; i < 3; i++) {
    const s = add(g, cylGeo(0.03, 0.2, 6), [0x8a3a22, 0x9a4a2a, 0x7a3220][i], -0.15 + i * 0.13, 0.7, 0.12, false);
    s.rotation.z = Math.PI / 2;
    s.rotation.y = 0.15 * (i - 1);
  }
  // The chimney at the back, with a cap; the charcoal bag.
  addTex(g, boxGeo(0.3, 0.65, 0.22), brick, 0, 0.6 + 0.325, -0.26);
  addTex(g, boxGeo(0.38, 0.05, 0.3), stone, 0, 1.28, -0.26);
  const bag = boxAt(g, 0.26, 0.36, 0.14, 0x4a3a2a, 0.62, 0, 0.22);
  bag.rotation.y = -0.3;
  boxAt(bag, 0.18, 0.08, 0.01, 0xe0b23a, 0, 0.06, 0.075, false); // its label
  return g;
}

// ---------- water (v0.62, the quality bar) ----------
/**
 * A stream of water (or sludge) pouring along +x: out of its origin, up by `rise`, then down `drop` to land `reach`
 * away, with splash bits (animatePour) and a ring of foam where it lands. `pipe`: a rusty pipe stub it comes out of.
 * `core`: a paler core inside the stream. Used for the fountains' and the sewer's pours. About 70–130 tris.
 */
export function buildPour(o: { reach: number; drop: number; rise?: number; r?: number; color?: number; glow?: number; pipe?: boolean; core?: boolean; bits?: number; wide?: number }): THREE.Group {
  const { reach, drop, rise = 0.05, r = 0.05, color = 0x9cc8ec, glow = 0x2a5a8a, pipe = false, core = true, bits = 6, wide = 1.4 } = o;
  const g = new THREE.Group();
  if (pipe) addTex(g, cylGeo(r * 1.5, 0.3, 6), texMat('rustpipe', RUST_PIPE, 1, 1, 0x6a3a22), -0.12, 0, 0).rotation.z = Math.PI / 2;
  const land = new THREE.Vector3(reach, -drop, 0);
  const arc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(reach * 0.35, rise, 0), new THREE.Vector3(reach * 0.75, -drop * 0.45, 0), land.clone()]);
  const water = new THREE.MeshLambertMaterial({ color, emissive: glow, emissiveIntensity: 0.55, transparent: true, opacity: 0.85, flatShading: true });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f8ff, emissive: 0x8ab0d0, emissiveIntensity: 0.6, flatShading: true });
  const spray = new THREE.Group();
  // (`wide`: how much wider the stream is than deep: a fountain's overflow is a sheet of water.)
  const stream = new THREE.Mesh(new THREE.TubeGeometry(arc, 6, r, 4), water);
  stream.scale.set(1, 1, wide);
  spray.add(stream);
  if (core) {
    const c = new THREE.Mesh(new THREE.TubeGeometry(arc, 5, r * 0.45, 3), white);
    c.scale.set(1, 1, Math.max(1, wide * 0.7));
    spray.add(c);
  }
  const splash = new THREE.Group();
  splash.position.copy(land);
  const bit = new THREE.TetrahedronGeometry(r * 0.6, 0);
  for (let i = 0; i < bits; i++) {
    const m = new THREE.Mesh(bit, color === 0x9cc8ec ? white : water);
    m.userData = { a: (i / bits) * Math.PI * 2 + (i % 3) * 0.4, r: r * 3 + (i % 3) * r, h: r * 3 + (i % 2) * r * 2, p: (i * 0.37) % 1 };
    splash.add(m);
  }
  const foam = new THREE.Mesh(new THREE.RingGeometry(r * 1.2, r * (2 + wide), 7), new THREE.MeshLambertMaterial({ color: color === 0x9cc8ec ? 0xe8f2fa : color, emissive: glow, emissiveIntensity: 0.3, transparent: true, opacity: 0.7, flatShading: true, side: THREE.DoubleSide }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = 0.005;
  splash.add(foam);
  spray.add(splash);
  spray.userData.splash = splash;
  g.add(spray);
  g.userData.spray = spray;
  return g;
}
/** A pour's splash (the same as the burst pipe's). */
export const animatePour = (g: THREE.Group, t: number) => animateBurstPipe(g, t);

/** A pond's lily pad: a disc with its notch, two greens, sometimes a pink flower on it. About 20–60 tris. */
export function buildLilyPad(r = 0.13, flower = false): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 8, 0.35, Math.PI * 2 - 0.5), lambert(0x3f7a3a));
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 6, 0.35, Math.PI * 2 - 0.5), lambert(0x5a9a4a));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.004;
  g.add(inner);
  if (flower) {
    for (let i = 0; i < 5; i++) {
      const p = add(g, new THREE.ConeGeometry(0.03, 0.07, 4), i % 2 ? 0xf2a8c8 : 0xe878a8, Math.cos(i * 1.26) * 0.025, 0.035, Math.sin(i * 1.26) * 0.025, false);
      p.rotation.set(Math.sin(i * 1.26) * 0.6, 0, -Math.cos(i * 1.26) * 0.6);
    }
    add(g, new THREE.IcosahedronGeometry(0.018, 0), 0xf2d27a, 0, 0.05, 0, false);
  }
  return g;
}

/** A clump of reeds at the water's edge: tapered blades leaning out, three with brown cattail heads. About 110 tris. */
export function buildReeds(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const blade = (h: number) => new THREE.ConeGeometry(0.025, h, 3);
  for (let i = 0; i < 7; i++) {
    const h = 0.4 + ((seed * 13 + i * 7) % 10) / 30;
    const a = i * 0.9 + seed;
    const m = add(g, blade(h), i % 2 ? 0x4a6a32 : 0x5a7a3a, Math.cos(a) * 0.06, h / 2, Math.sin(a) * 0.06, false);
    m.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    if (i < 3) add(g, cylGeo(0.025, 0.1, 5), 0x6a4a2a, Math.cos(a) * 0.06 - Math.cos(a) * h * 0.24, h * 0.95, Math.sin(a) * 0.06 + Math.sin(a) * h * 0.24, false);
  }
  return g;
}

/** Sewage: thick green sludge with lighter scum streaks and dark clots, as a pixel texture that drifts along the
 *  channel (animateSludge). `len` × `wide` tiles. */
const SLUDGE: Painter = (g, rnd) => {
  // Olive-brown, in long streaks along the flow (x), scum patches floating, dark eddies: never speckled like grass.
  px(g, '#3e4a2c', 0, 0, 32, 32);
  for (let i = 0; i < 14; i++) px(g, rnd() < 0.5 ? '#4a5632' : '#343e26', Math.floor(rnd() * 24), Math.floor(rnd() * 32), 8 + Math.floor(rnd() * 12), 1);
  for (let i = 0; i < 5; i++) px(g, '#6a6a3e', Math.floor(rnd() * 28), Math.floor(rnd() * 30), 3 + Math.floor(rnd() * 3), 2); // scum
  for (let i = 0; i < 3; i++) px(g, '#5a4a2e', Math.floor(rnd() * 29), Math.floor(rnd() * 30), 3, 2); // brown clots
  for (let i = 0; i < 4; i++) px(g, '#242c1a', Math.floor(rnd() * 26), Math.floor(rnd() * 32), 5 + Math.floor(rnd() * 5), 1); // eddies
};
const sludgeMats: THREE.MeshLambertMaterial[] = [];
export function sludgeMaterial(len: number, wide: number): THREE.MeshLambertMaterial {
  const base = pixelTex('sludge', SLUDGE);
  const map = base ? base.clone() : null;
  if (map) (map.repeat.set(len, wide), (map.needsUpdate = true));
  // (Dimmed: murky, not lawn-green.)
  const m = new THREE.MeshLambertMaterial({ color: map ? 0xa8a890 : 0x3e4a2c, map, emissive: 0x141a0a, emissiveIntensity: 0.5, flatShading: true });
  sludgeMats.push(m);
  return m;
}
/** The sewage flows (east), slowly. */
export function animateSludge(t: number) {
  for (const m of sludgeMats) if (m.map) m.map.offset.x = -t * 0.06;
}

/** A clot of floating muck: an irregular flat blob (a jagged outline), sometimes with junk in it (a can, a bottle). */
export function buildMuck(seed: number): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.18 * (0.6 + 0.5 * Math.abs(Math.sin(seed * 5.1 + i * 2.3)));
    i === 0 ? s.moveTo(Math.cos(a) * k, Math.sin(a) * k) : s.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  const blob = new THREE.Mesh(new THREE.ShapeGeometry(s), lambert(seed % 2 ? 0x5a6a2a : 0x5a5236));
  blob.rotation.x = -Math.PI / 2;
  g.add(blob);
  if (seed % 3 === 0) add(g, cylGeo(0.035, 0.1, 6), 0xb84a4a, 0.03, 0.02, 0, false).rotation.z = Math.PI / 2; // a can
  if (seed % 3 === 1) add(g, new THREE.CylinderGeometry(0.012, 0.03, 0.14, 6), 0x2a6a3a, -0.02, 0.025, 0.02, false).rotation.x = Math.PI / 2; // a bottle
  return g;
}

/**
 * A flowerbed (v0.62, the quality bar): a stone edge round dark soil with lumps, ten flowers on stems (five-petal heads
 * with a yellow middle, in the bed's colours), tufts of leaves between them. One tile. About 260 tris.
 */
export function buildFlowerbed(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const stone = texMat('concrete', CONCRETE, 1, 1, 0x8e877b);
  for (const [x, z, w, d] of [[0, -0.42, 0.92, 0.08], [0, 0.42, 0.92, 0.08], [-0.42, 0, 0.08, 0.76], [0.42, 0, 0.08, 0.76]]) addTex(g, boxGeo(w, 0.14, d), stone, x, 0.07, z);
  boxAt(g, 0.76, 0.06, 0.76, 0x3a2a1e, 0, 0.03, 0, false);
  const colours = [[0xd9473a, 0xf06a5a], [0xf0b13c, 0xf8d070], [0xe8e2d0, 0xffffff], [0x8a5ab8, 0xb88ae0]];
  const [c0, c1] = colours[seed % colours.length];
  const [d0] = colours[(seed + 1) % colours.length];
  for (let i = 0; i < 10; i++) {
    const x = -0.28 + (i % 4) * 0.19 + ((i * 37) % 7) / 100, z = -0.28 + Math.floor(i / 4) * 0.27 + ((i * 53) % 7) / 100;
    const h = 0.16 + ((i * 29) % 10) / 100;
    add(g, new THREE.ConeGeometry(0.012, h, 3), 0x3a6a2a, x, 0.06 + h / 2, z, false); // the stem
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.055, 5), lambert(i % 3 === 2 ? d0 : i % 2 ? c1 : c0));
    head.material.side = THREE.DoubleSide;
    head.rotation.set(-Math.PI / 2 + 0.3, 0, i);
    head.position.set(x, 0.06 + h, z);
    g.add(head);
    add(g, new THREE.TetrahedronGeometry(0.018, 0), 0xf2d27a, x, 0.07 + h, z, false); // the middle
  }
  for (let i = 0; i < 6; i++) {
    const t = add(g, new THREE.ConeGeometry(0.05, 0.12, 3), 0x4a7a3a, -0.25 + (i % 3) * 0.25, 0.12, -0.15 + Math.floor(i / 3) * 0.3, false);
    t.rotation.y = i;
  }
  return g;
}

/**
 * A tree crown's clump (v0.62): an icosahedron with its corners pushed in and out (`seed` picks the shape; a corner
 * shared by faces moves with them, so it stays closed), a bit flattened, with vertex colours darker underneath and
 * lighter on top (for a material with vertexColors and the leaves texture). Radius about 0.42. 20 tris.
 */
export function crownClump(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.42, 0);
  const pos = g.attributes.position;
  const col: number[] = [];
  const v = new THREE.Vector3();
  const bump = (p: THREE.Vector3) => 0.85 + 0.3 * Math.abs(Math.sin(seed * 3.1 + p.x * 9.7 + p.y * 5.3 + p.z * 7.1));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(bump(v));
    v.y *= 0.85;
    pos.setXYZ(i, v.x, v.y, v.z);
    const k = 0.6 + 0.8 * ((v.y / 0.36 + 1) / 2) ** 1.3;
    col.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A wooden crate (v0.62): planked sides in the wood texture, darker edge boards framing each face, a diagonal brace
 *  on the front and back, nail heads. `s`: its size (1 = 0.6 across). About 150 tris. */
export function buildCrate(s = 1): THREE.Group {
  const g = new THREE.Group();
  const w = 0.6 * s;
  addTex(g, boxGeo(w, w, w), texMat('wood', WOOD, 1, 1, 0x7a5a3a), 0, w / 2, 0);
  const edge = 0x4a3220;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) boxAt(g, 0.06 * s, w + 0.02, 0.06 * s, edge, (x * w) / 2, -0.01, (z * w) / 2, false);
  for (const y of [0, w - 0.05 * s]) for (const z of [-1, 1]) boxAt(g, w, 0.05 * s, 0.03 * s, edge, 0, y, (z * w) / 2, false);
  for (const z of [-1, 1]) {
    const brace = boxAt(g, w * 1.25, 0.05 * s, 0.025 * s, edge, 0, w / 2 - 0.025 * s, (z * (w + 0.03 * s)) / 2, false);
    brace.rotation.z = Math.PI / 4;
  }
  return g;
}
