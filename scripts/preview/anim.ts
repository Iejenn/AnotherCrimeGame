// Dev only: a filmstrip of one move (src/street/character.ts animateCharacter), 8 frames from the side (?view=front
// for the front), with a weapon in hand (?weapon=). Walk frames span one full step cycle at the walking pace.
import * as THREE from 'three';
import { WALK_PACE, animateCharacter, buildCharacter, type Pose } from '../../src/street/character';
import { setGear } from '../../src/street/props';

const q = new URLSearchParams(location.search);
const pose = (q.get('pose') ?? 'walk') as Pose;
const N = 8;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f1c);
scene.add(new THREE.HemisphereLight(0xd8e0f0, 0x3a3028, 1.6));
const sun = new THREE.DirectionalLight(0xffd8a8, 1.6);
sun.position.set(3, 5, 4);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 4), new THREE.MeshLambertMaterial({ color: 0x4a4a48 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const cycleMs = ((2 * Math.PI) / (WALK_PACE * 4.4)) * 1000;
for (let i = 0; i < N; i++) {
  const g = buildCharacter({ skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 });
  if (q.get('weapon')) setGear(g, { weapon: q.get('weapon')! });
  g.position.x = (i - (N - 1) / 2) * 0.95;
  g.rotation.y = q.get('view') === 'front' ? 0 : Math.PI / 2; // facing right
  if (pose === 'walk') animateCharacter(g, pose, (i / N) * cycleMs, 0, WALK_PACE);
  else animateCharacter(g, pose, 0, 0, i / (N - 1));
  scene.add(g);
}
const a = innerWidth / innerHeight;
const H = 1.6;
const camera = new THREE.OrthographicCamera((-H * a) / 2, (H * a) / 2, 1.45, 1.45 - H, 0.1, 50);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
renderer.render(scene, camera);
(window as unknown as { ready: boolean }).ready = true;
