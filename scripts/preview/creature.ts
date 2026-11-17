// Dev only: a model before (left, scripts/preview/old/: the v0.44 code) and after (right), in the sewer-ish light, with the
// new one's triangle count in the page title. ?who=rat|pigeon|dog|giant|human, ?yaw=, ?view=game (the game's camera).
import * as THREE from 'three';
import * as NEW from '../../src/street/props';
import * as OLD from './old/props';
import { animateCharacter, buildCharacter } from '../../src/street/character';
import { animateCharacter as animateOld, buildCharacter as buildOldCharacter } from './old/character';

const q = new URLSearchParams(location.search);
const who = q.get('who') ?? 'rat';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f1c);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.3));
const sun = new THREE.DirectionalLight(0xffc890, 1.8);
sun.position.set(-2, 4, 3);
sun.castShadow = true;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshLambertMaterial({ color: 0x6e7468 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const LOOK = { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 };
const build: Record<string, [() => THREE.Group, () => THREE.Group, number, number]> = {
  // [old, new, spacing, camera distance]
  rat: [() => OLD.buildRat(), () => NEW.buildRat(), 0.55, 2.6],
  pigeon: [() => OLD.buildPigeon(), () => NEW.buildPigeon(), 0.35, 1.7],
  dog: [() => OLD.buildDog(), () => NEW.buildDog(), 0.6, 3.4],
  giant: [() => OLD.buildGiantRat(), () => NEW.buildGiantRat(), 1.1, 5.5],
  human: [() => buildOldCharacter(LOOK), () => buildCharacter(LOOK), 0.45, 3.2],
};
const [mkOld, mkNew, gap, dist] = build[who];
const old = mkOld();
const fresh = mkNew();
old.position.x = -gap;
fresh.position.x = gap;
if (who === 'human' && q.get('gear')) {
  NEW.setGear(fresh, { weapon: 'copper_knuckles', head: 'tin_helmet', body: 'copper_vest', legs: 'tin_legs' });
  OLD.setGear(old, { weapon: 'copper_knuckles', head: 'tin_helmet', body: 'copper_vest', legs: 'tin_legs' });
  animateOld(old, 'idle', 0);
  animateCharacter(fresh, 'idle', 0);
} else if (who === 'human') {
  // ?pose=walk|sit|sitFloor|work|swing (?t= ms into it, ?p= how far into a swing), ?weapon=tin_bat
  const pose = (q.get('pose') ?? 'idle') as Parameters<typeof animateCharacter>[1];
  const t = Number(q.get('t') ?? 0);
  if (q.get('weapon')) NEW.setGear(fresh, { weapon: q.get('weapon')! });
  animateOld(old, pose === 'sitFloor' ? 'sit' : pose, t, 0, Number(q.get('p') ?? 0));
  animateCharacter(fresh, pose, t, 0, Number(q.get('p') ?? 0));
} else if (who === 'pigeon') {
  OLD.animatePigeon(old, 'peck', 0);
  NEW.animatePigeon(fresh, 'peck', 0);
} else {
  OLD.animateRat(old, 'peck', 0);
  NEW.animateRat(fresh, 'peck', 0);
}
for (const g of [old, fresh]) g.traverse((o) => ((o as THREE.Mesh).castShadow = true)), scene.add(g);
let tris = 0;
fresh.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
});
document.title = `${who}: ${Math.round(tris)} tris`;
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 80);
const yaw = Number(q.get('yaw') ?? 0.7);
const far = q.get('view') === 'game';
const d = far ? dist * 3 : dist;
const lookY = who === 'human' ? 0.6 : who === 'giant' ? 0.4 : who === 'dog' ? 0.45 : 0.18;
cam.position.set(Math.sin(yaw) * d, lookY + (far ? d * 1.4 : dist * 0.5), Math.cos(yaw) * d);
cam.lookAt(0, lookY, 0);
renderer.render(scene, cam);
(window as unknown as { ready: boolean }).ready = true;
