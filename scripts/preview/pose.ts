// Four copies of a character with a weapon, at 0%, 30%, 50% and 75% of a swing, seen from the game's camera angle.
import * as THREE from 'three';
import { animateCharacter, buildCharacter } from '../../src/street/character';
import { setGear } from '../../src/street/props';

const weapon = new URLSearchParams(location.search).get('weapon') ?? 'baseball_bat';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2e38);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
const sun = new THREE.DirectionalLight(0xffe0c0, 1.5);
sun.position.set(-3, 6, 4);
scene.add(sun);
[0, 0.3, 0.5, 0.75].forEach((p, i) => {
  // (?hair=0–4, ?hood=1: a thug's hoodie, to check the hair stays under the hood.)
  const q = new URLSearchParams(location.search);
  const g = buildCharacter({ skin: 1, hair: Number(q.get('hair') ?? 1), hairColor: 1, top: 0, bottom: 1 }, q.get('hood') ? { hood: 0x4a4d52 } : undefined);
  setGear(g, { weapon });
  animateCharacter(g, 'swing', 0, 0, p);
  g.position.set(i * 1.6 - 2.4, 0, 0);
  g.rotation.y = -0.5;
  scene.add(g);
});
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4.2, 5.5);
camera.lookAt(0, 0.6, 0);
renderer.render(scene, camera);
(window as unknown as { ready: boolean }).ready = true;
