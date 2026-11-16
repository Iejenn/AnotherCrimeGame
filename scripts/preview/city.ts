// The real city on its own (see city.html): buildCity plus a character at (x, z), with the game's lights and camera.
import * as THREE from 'three';
import { buildCity } from '../../src/street/city';
import { animateCharacter, buildCharacter } from '../../src/street/character';
import { buildBigCar } from '../../src/street/streetLife';
import { buildMeter } from '../../src/street/props';
import { NODES } from '../../src/street/map';
import { thugAt } from '../../src/game/enemies';
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
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.25));
const sun = new THREE.DirectionalLight(0xffa864, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
buildCity(scene);
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
  setGear(g, { weapon: 'knife' });
  g.position.set(t.x, 0.03, t.z);
  g.rotation.y = i * 2.1;
  animateCharacter(g, 'idle', 0);
  scene.add(g);
}
const you = buildCharacter({ skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 });
you.position.set(x, 0.03, z);
animateCharacter(you, 'idle', 0);
scene.add(you);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
const pitch = cam === 'low' ? 0.8 : cam === 'top' ? 1.5 : 1.16;
const r = (cam === 'low' ? 11 : cam === 'far' ? 24 : cam === 'top' ? 62 : 15) * 1.25;
const target = cam === 'top' ? new THREE.Vector3(29, 0, 29) : new THREE.Vector3(x, 0, z);
camera.position.set(target.x + Math.sin(yaw) * r * Math.cos(pitch), r * Math.sin(pitch), target.z + Math.cos(yaw) * r * Math.cos(pitch));
camera.lookAt(target);
sun.position.copy(target).add(new THREE.Vector3(-24, 13, 8));
sun.target.position.copy(target);
if (cam === 'top') Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }), sun.shadow.camera.updateProjectionMatrix();
renderer.render(scene, camera);
(window as unknown as { ready: boolean }).ready = true;
