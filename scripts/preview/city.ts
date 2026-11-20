// The real city on its own (see city.html): buildCity plus a character at (x, z), with the game's lights and camera.
import * as THREE from 'three';
import { buildCity, updateFades } from '../../src/street/city';
import { animateCharacter, buildCharacter } from '../../src/street/character';
import { buildBigCar, buildGroundItem } from '../../src/street/streetLife';
import { buildDog, buildGiantRat, buildMeter, buildRat } from '../../src/street/props';
import { NODES, NPCS, floorY } from '../../src/street/map';
import { ROAMS, ratAt, roamAt, thugAt } from '../../src/game/enemies';
import { setGear } from '../../src/street/props';

const q = new URLSearchParams(location.search);
const x = Number(q.get('x') ?? 29) + 0.5;
const z = Number(q.get('z') ?? 35) + 0.5;
const cam = q.get('cam') ?? 'game';
const yaw = Number(q.get('yaw') ?? 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = 0x1c2230;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, cam === 'top' ? 200 : 22, cam === 'top' ? 400 : 60);
const sky = new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.25);
scene.add(sky);
const sun = new THREE.DirectionalLight(0xffa864, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const city = buildCity(scene);
// The spots that look like things (meters, cars), as the Street view adds them.
for (const n of NODES) {
  if (n.kind !== 'car' && n.kind !== 'meter') continue;
  const g = n.kind === 'car' ? buildBigCar(0x2f4562) : buildMeter();
  if (n.kind === 'car') g.scale.setScalar(0.72);
  g.position.set(n.x + 0.5, 0, n.y + 0.5);
  if (n.kind === 'car' && n.facing !== undefined) g.position.add(new THREE.Vector3(-Math.cos(n.facing), 0, Math.sin(n.facing)).multiplyScalar(0.45));
  g.rotation.y = n.facing ?? 0;
  scene.add(g);
}
// The Yard's thugs where their schedule puts them right now.
for (let i = 0; i < 3; i++) {
  const t = thugAt(i, Date.now());
  const g = buildCharacter({ skin: 2 + (i % 2), hair: 0, hairColor: 0, top: 3, bottom: i }, { hood: 0x4a4d52 });
  setGear(g, { weapon: 'tin_knife' });
  g.position.set(t.x, 0.03, t.z);
  g.rotation.y = i * 2.1;
  animateCharacter(g, 'idle', 0);
  scene.add(g);
}
// The hospital's staff.
for (const n of NPCS.filter((n) => n.kind === 'doctor' || n.kind === 'receptionist')) {
  const g =
    n.kind === 'doctor'
      ? buildCharacter({ skin: n.id === 'doctor_0' ? 1 : 2, hair: n.id === 'doctor_0' ? 2 : 1, hairColor: 1, top: 4, bottom: 0 }, { scrubs: n.id === 'doctor_0' ? 0x2f6b4a : 0x7ab0d8, coat: true })
      : buildCharacter({ skin: 1, hair: 2, hairColor: 2, top: 1, bottom: 0 });
  g.position.set(n.x + 0.5, floorY(n.x + 0.5, n.y + 0.5) + 0.03, n.y + 0.5);
  g.rotation.y = n.kind === 'doctor' ? 1.2 : 0;
  animateCharacter(g, 'idle', 0);
  scene.add(g);
}
const you = buildCharacter({ skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 });
// ?gear=tin: you in full tin armour with the tin bat.
if (q.get('gear')) setGear(you, { weapon: `${q.get('gear')}_bat`, head: `${q.get('gear')}_helmet`, body: `${q.get('gear')}_vest`, legs: `${q.get('gear')}_legs` });
you.position.set(x, floorY(x, z) + 0.03, z);
animateCharacter(you, 'idle', 0);
scene.add(you);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
const pitch = cam === 'low' || cam === 'close' ? 0.8 : cam === 'top' ? 1.5 : 1.16;
const r = (cam === 'close' ? 5 : cam === 'macro' ? 2.4 : cam === 'low' ? 11 : cam === 'far' ? 24 : cam === 'top' ? 62 : 15) * 1.25;
const target = cam === 'top' ? new THREE.Vector3(29, 0, 29) : new THREE.Vector3(x, floorY(x, z), z);
camera.position.set(target.x + Math.sin(yaw) * r * Math.cos(pitch), target.y + r * Math.sin(pitch), target.z + Math.cos(yaw) * r * Math.cos(pitch));
camera.lookAt(target);
sun.position.copy(target).add(new THREE.Vector3(-24, 13, 8));
sun.target.position.copy(target);
if (cam === 'top') Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }), sun.shadow.camera.updateProjectionMatrix();
// Underground (the sewer): dim sky and sun, near-black around, like the Street view.
if (floorY(x, z) < -1) {
  sky.intensity = 0.8;
  sun.intensity = 0.12;
  scene.background = new THREE.Color(0x050706);
  scene.fog = new THREE.Fog(0x050706, 22, 60);
}
// Rats where their schedule puts them.
for (let i = 0; i < 10; i++) {
  const r = ratAt(i, Date.now());
  const g = buildRat();
  g.position.set(r.x, floorY(r.x, r.z) + 0.03, r.z);
  g.rotation.y = i * 1.3;
  scene.add(g);
}
// v0.43: guard dogs, giant rats, bikers where their schedules put them; Splinter sitting; ?gate=open.
for (const [kind, n] of [['dog', 4], ['giant_rat', 3], ['biker', 3]] as const)
  for (let i = 0; i < n; i++) {
    const p = roamAt(ROAMS[kind], i, Date.now());
    const g =
      kind === 'dog'
        ? buildDog()
        : kind === 'giant_rat'
          ? buildGiantRat()
          : buildCharacter({ skin: i, hair: 3, hairColor: i, top: 3, bottom: 3 }, { apron: 0x2a2220 });
    if (kind === 'biker') setGear(g, { weapon: 'copper_knuckles' });
    g.position.set(p.x, floorY(p.x, p.z) + 0.03, p.z);
    g.rotation.y = i * 1.9;
    if (kind === 'biker') animateCharacter(g, 'idle', 0);
    scene.add(g);
  }
for (const n of NPCS.filter((n) => n.kind === 'splinter')) {
  const g = buildCharacter({ skin: 1, hair: 4, hairColor: 1, top: 3, bottom: 3 }, { apron: 0x4a4a32 });
  g.position.set(n.x + 0.5, floorY(n.x + 0.5, n.y + 0.5) + 0.03 - 0.35, n.y + 0.5);
  animateCharacter(g, 'sit', 0);
  scene.add(g);
}
city.setGateOpen(q.get('gate') === 'open');
// ?loot=1: food lying next to you (the Food Kit models).
if (q.get('loot'))
  ['raw_bird_meat', 'cooked_bird_meat', 'cooked_rat_meat', 'raw_giant_rat_meat', 'cooked_giant_rat_meat', 'candy_bar', 'sandwich'].forEach((it, i) => {
    const g = buildGroundItem(it);
    g.position.set(x - 1.5 + (i % 4) * 1, floorY(x, z) + 0.07, z + 1 + Math.floor(i / 4));
    scene.add(g);
  });
// ?inside=hospital: as if you're inside that room (its walls faded, the roof off).
const inside = q.get('inside');
if (inside) city.rooms.get(inside)!.force = true;
// Buildings between the camera and you fade, like in the game.
for (let i = 0; i < 40; i++) updateFades(city.fadeables, camera, you.position, 0.05);
// ?south=cut|fade (v0.60 trial): the buildings on the camera's side of you, within view: cut down to their ground floor
// (a roof on it, like old-school RuneScape hiding upper floors), or see-through. To compare the two.
const south = q.get('south');
if (south)
  for (const f of city.fadeables) {
    const main = f.walls[0];
    if (!main) continue;
    const box = new THREE.Box3().setFromObject(main);
    if (box.min.z < z + 0.6 || box.min.z > z + 18 || box.max.x < x - 16 || box.min.x > x + 16 || box.max.y <= 2.2) continue;
    if (south === 'fade') {
      for (const m of f.mats) Object.assign(m, { transparent: true, opacity: 0.22, depthWrite: false });
      for (const p of f.props) p.visible = false;
      continue;
    }
    const keep = 1.9;
    for (const w of f.walls.slice(1)) w.visible = new THREE.Box3().setFromObject(w).min.y < keep;
    main.scale.y = keep / (box.max.y - box.min.y);
    main.position.y = keep / 2;
    for (const p of f.props) p.visible = new THREE.Box3().setFromObject(p).min.y < keep - 0.2;
  }
// Models load in the background: keep rendering for a moment, then say we're ready.
const t0 = performance.now();
const tick = () => {
  renderer.render(scene, camera);
  if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
  else (window as unknown as { ready: boolean }).ready = true;
};
tick();
