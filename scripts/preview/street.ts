// Mock-up of one street with the proposed changes (docs/design.md §7c): a wider road with sidewalks, buildings at
// person scale, shop fronts with character and street life. Not part of the game: for screenshots to decide on.
import * as THREE from 'three';
import { animateCharacter, buildCharacter } from '../../src/street/character';
import { boxGeo, lambert } from '../../src/street/props';
import * as L from '../../src/street/streetLife';

const params = new URLSearchParams(location.search);
const cam = params.get('cam') ?? 'game';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = 0x1c2230;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 22, 60);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.25));
const sun = new THREE.DirectionalLight(0xffa864, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const rng = (() => {
  let a = 12345;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const at = (o: THREE.Object3D, x: number, z: number, rotY = 0, y = 0) => {
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  scene.add(o);
  return o;
};
const box = (w: number, h: number, d: number, color: number | THREE.Material, x: number, y: number, z: number, shadow = true) => {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'number' ? lambert(color) : color);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
  return m;
};
const glow = (c: number, s = 1) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: s });

// ---------- the street: a road for two cars, curbs and sidewalks both sides ----------
// North side buildings start at z = -3.6, the south side at z = 3.6. Road z -2..2 (4 tiles), sidewalks 1.6 wide.
box(80, 0.04, 80, 0x34373d, 0, 0, 0, false);
for (const s of [-1, 1]) {
  box(80, 0.12, 1.6, 0x6d6962, 0, 0.06, s * 2.8, false); // sidewalk
  box(80, 0.13, 0.12, 0x8a857c, 0, 0.065, s * 2.06, false); // curb
  // Sidewalk slabs: thin joints every tile.
  for (let x = -40; x < 40; x += 1) box(0.03, 0.005, 1.6, 0x5c5852, x, 0.122, s * 2.8, false);
}
for (let x = -40; x < 40; x += 1.6) box(0.7, 0.01, 0.1, 0x9c978a, x, 0.03, 0, false); // centre line
for (let i = 0; i < 6; i++) box(0.36, 0.01, 3.4, 0xd8d2c4, 13 + i * 0.6, 0.03, 0, false); // crosswalk
box(80, 0.13, 6, 0x6d6962, 0, 0.06, -6.6, false); // ground behind the north sidewalk (under buildings)
box(80, 0.13, 6, 0x6d6962, 0, 0.06, 6.6, false);

// ---------- north side (facing the camera) ----------
const FLOOR = 1.45;
const shopShell = (x0: number, x1: number, wall: number, trim: number, h = 1.75) => {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  box(w, h, 5.5, wall, cx, h / 2, -3.6 - 2.75);
  const top = new THREE.Group();
  top.position.set(cx, 0, -3.6);
  L.roofWithRim(top, w, 5.5, h, trim);
  scene.add(top);
  // Rooftop clutter: an AC unit or two.
  box(0.5, 0.3, 0.4, 0xe8e8e8, cx - w / 4, h + 0.15, -7);
  return { cx, w, h };
};
const door = (x: number, color = 0x3a2a20, trim = 0x2b2b2e) => {
  box(0.82, 1.24, 0.05, trim, x, 0.62 + 0.12, -3.58, false);
  box(0.7, 1.14, 0.06, color, x, 0.57 + 0.12, -3.57, false);
};
const light = (x: number, y: number, z: number, color = 0xffc98a, power = 5, dist = 6) => {
  const l = new THREE.PointLight(color, power, dist, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
};

// Apartments at the far ends.
at(L.buildApartment(4.4, 6, 3, 0x6b4a3c, 0x7a2f28, rng), -14.2, -3.6);
at(L.buildApartment(4.4, 6, 2, 0x5f5d5a, 0x2e5f5b, rng), 13.8, -3.6);

// Eddy's General Store: green, fruit crates and a chalkboard outside.
{
  const { cx } = shopShell(-12, -7, 0xa89c86, 0x2f6b40);
  at(L.buildShopWindow(1.6), -11.1, -3.58);
  at(L.buildShopWindow(1.6), -7.9, -3.58);
  door(-9.5, 0x2f6b40);
  at(L.buildAwning(4.8, '#2f6b40', '#d8d0c0'), cx, -3.58, 0, 1.5);
  at(L.buildSign('GENERAL STORE', '#2f7a46', '#ffffff', 3.4, 0.55), cx, -3.55, 0, 2.15);
  at(L.buildCrates(), -11.1, -2.9);
  at(L.buildChalkboard('SANDWICH $2'), -8.2, -2.7, -0.3, 0.12);
  light(cx, 1.4, -5);
}
// The alley between Eddy's and the apartments: a dumpster, bags, AC units, a lamp over a side door.
at(L.buildDumpster(), -6.3, -5.4, Math.PI / 2, 0.12);
at(L.buildAcUnit(), -7, -6.2, Math.PI / 2, 1.2);
at(L.buildBin(true), -6.6, -4.2, 0, 0.12);
// A plain apartment building: 3 floors, a stoop, balconies, a fire escape.
{
  const apt = at(L.buildApartment(6, 6, 3, 0x7a4a3a, 0x8a6a2a, rng), -2.5, -3.6);
  const dx = apt.userData.doorX as number;
  at(L.buildStoop(), -2.5 + dx, -3.6, 0, 0.12);
  for (const f of [1, 2]) at(L.buildBalcony(1.1), -2.5 + dx, -3.6, 0, f * FLOOR + 0.02);
  at(L.buildFireEscape(3), -4.6, -3.6, 0, 0);
  at(L.buildAcUnit(), -0.2, -3.6, 0, FLOOR + 0.6);
}
// The candy store: pink, a giant lollipop on the roof, jars of sweets in the window, a neon OPEN sign.
{
  const { cx } = shopShell(0.5, 5.5, 0xe8c6d2, 0x9a4a6a);
  at(L.buildShopWindow(1.7), 1.55, -3.58);
  at(L.buildShopWindow(1.7), 4.45, -3.58);
  at(L.buildCandyDisplay(1.6), 1.55, -3.2, 0, 0.1);
  at(L.buildCandyDisplay(1.6), 4.45, -3.2, 0, 0.1);
  door(3, 0xff7ab8, 0x9a4a6a);
  at(L.buildOpenSign(), 4.45, -3.5, 0, 1.0);
  at(L.buildAwning(4.8, '#ff4f9a', '#ffe6f0'), cx, -3.58, 0, 1.5);
  at(L.buildSign('CANDY', '#ff4f9a', '#ffffff', 2.4, 0.55), cx - 0.6, -3.55, 0, 2.15);
  at(L.buildLollipop(1.1), 5.0, -4.2, 0, 1.75);
  light(cx, 1.4, -5, 0xffb0d8);
}
// A narrow gap: AC units and a bin.
at(L.buildBin(), 6, -4.1, 0, 0.12);
// Ray's Arms: gunmetal, the shutter half down, bars on the window, a camera over the door.
{
  const { cx } = shopShell(6.5, 11.5, 0x4a4d52, 0x2b2b2e);
  at(L.buildShopWindow(1.6), 7.6, -3.58);
  at(L.buildShutter(1.7, 1.35, 0.55), 7.6, -3.55, 0, 0);
  at(L.buildShopWindow(1.6), 10.4, -3.58);
  at(L.buildBars(1.6, 0.95), 10.4, -3.55, 0, 0.35);
  door(9, 0x2b2b2e, 0x6a6f76);
  at(L.buildBars(0.7, 1.12), 9, -3.52, 0, 0.14);
  at(L.buildCamera(), 9.6, -3.58, -0.5, 1.6);
  at(L.buildSign("RAY'S ARMS", '#1e1e22', '#d8b04a', 3.2, 0.55), cx, -3.55, 0, 2.15);
  light(cx, 1.4, -5, 0xfff0d8, 3);
}
// North sidewalk: lamps, a tree, a hydrant, a bin, a bike rack.
for (const x of [-10, -2, 7]) at(L.buildStreetLamp(), x, -2.25, 0, 0.12);
for (const x of [-10, -2, 7]) light(x, 2.1, -1.7, 0xffb24d, 6, 7);
at(L.buildTreePit(rng), -5, -2.8, 0, 0.12);
at(L.buildTreePit(rng), 12, -2.8, 0, 0.12);
at(L.buildHydrant(), 0.2, -2.35, 0, 0.12);
at(L.buildBin(), 6.1, -2.4, 0, 0.12);
at(L.buildBikeRack(), -0.9, -2.5, 0, 0.12);

// ---------- south side (its backs face the camera): a small square in the middle, buildings at the ends ----------
at(L.buildApartment(6, 6, 2, 0x6e5f50, 0x2f4562, rng, false), -11, 9.6, 0);
at(L.buildApartment(6, 6, 2, 0x5f5d5a, 0x6a4526, rng, false), 11, 9.6, 0);
box(10, 0.14, 5.4, 0x45663a, 0, 0.07, 6.5, false); // a little green square
at(L.buildTreePit(rng), -3, 6, 0, 0.12);
at(L.buildTreePit(rng), 3.4, 7, 0, 0.12);
at(L.buildBench(), 0, 5.2, Math.PI, 0.12);
// South sidewalk: the bus stop, a mailbox, newspaper boxes, lamps, a hydrant.
at(L.buildBusStop(), -3.5, 3.05, Math.PI, 0.12);
at(L.buildMailbox(), 1.2, 2.45, Math.PI, 0.12);
at(L.buildNewsBoxes(), 2.4, 2.45, Math.PI, 0.12);
at(L.buildHydrant(), 8, 2.35, 0, 0.12);
for (const x of [-12, 4, 12]) at(L.buildStreetLamp(), x, 2.25, Math.PI, 0.12);
for (const x of [-12, 4, 12]) light(x, 2.1, 1.7, 0xffb24d, 6, 7);

// ---------- cars at person scale, parked along the curbs ----------
at(L.buildBigCar(0x8a2f28), 3.5, -1.3, Math.PI);
at(L.buildBigCar(0x2f4562), -9.5, 1.3, 0);
at(L.buildBigCar(0xb0aa9c), 10.5, 1.3, 0);

// ---------- people, for scale ----------
const you = at(buildCharacter({ skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 }), 2.2, -2.75, Math.PI, 0.12) as THREE.Group;
const waiting = at(buildCharacter({ skin: 0, hair: 2, hairColor: 3, top: 5, bottom: 2 }), -3.4, 3.15, Math.PI, 0.12) as THREE.Group;
const shopper = at(buildCharacter({ skin: 2, hair: 1, hairColor: 2, top: 6, bottom: 3 }), -10.5, -2.6, Math.PI * 0.9, 0.12) as THREE.Group;
animateCharacter(you, 'idle', 0);
animateCharacter(waiting, 'idle', 0);
animateCharacter(shopper, 'idle', 0);

// ---------- camera: the game's angle, or tilted down ----------
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 220);
const pitch = cam === 'low' ? 0.78 : 1.16;
const r = (cam === 'low' ? 10 : cam === 'far' ? 22 : 15) * 1.25;
const target = new THREE.Vector3(1.5, 0, -1.5);
camera.position.set(target.x, r * Math.sin(pitch), target.z + r * Math.cos(pitch));
camera.lookAt(target);
sun.position.copy(target).add(new THREE.Vector3(-24, 13, 8));
sun.target.position.copy(target);
renderer.render(scene, camera);
(window as unknown as { ready: boolean }).ready = true;
