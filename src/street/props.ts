// Small models: cars, gym bags, shop shelves and parking meters. Chunky low-poly, muted dusk colours.
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

/** Show what someone wields: brass knuckles on the right hand (more gear later). */
export function setGear(character: THREE.Group, equipment: Partial<Record<string, string>> | undefined) {
  const rig = character.userData.rig as { armR: THREE.Object3D } | undefined;
  if (!rig) return;
  const want = equipment?.weapon ?? '';
  if (character.userData.gearKey === want) return;
  character.userData.gearKey = want;
  const old = rig.armR.getObjectByName('weapon');
  if (old) rig.armR.remove(old);
  if (want === 'brass_knuckles') {
    const k = new THREE.Group();
    k.name = 'weapon';
    for (let i = 0; i < 4; i++) {
      const ring = add(k, new THREE.TorusGeometry(0.022, 0.009, 4, 8), 0xd8b04a, -0.045 + i * 0.03, 0, 0.045, false);
      ring.rotation.y = Math.PI / 2;
    }
    add(k, boxGeo(0.12, 0.025, 0.025), 0xd8b04a, 0, -0.025, 0.045, false);
    k.position.set(0, -0.31, 0);
    rig.armR.add(k);
  }
}
