// The quality-bar models (docs/design.md §18) side by side in the game's evening light, seen from the game's camera
// angle, on a pavement. ?set=street (benches, lamps, bins...), ?set=props (crates, dumpsters, fire, the barbecue).
import * as THREE from 'three';
import * as SL from '../../src/street/streetLife';
import { animateFire, buildBarbecue, buildCrate, buildFire, buildScrapDumpster } from '../../src/street/props';

const set = new URLSearchParams(location.search).get('set') ?? 'street';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2230);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.25));
const sun = new THREE.DirectionalLight(0xffa864, 1.8);
sun.position.set(-4, 8, 5);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshLambertMaterial({ color: 0x66625b }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const items: THREE.Object3D[] =
  set === 'street'
    ? [SL.buildStreetLamp(), SL.buildHydrant(), SL.buildMailbox(), SL.buildBin(), SL.buildBin(true), SL.buildNewsBoxes(), SL.buildBench(), SL.buildTreePit(() => 0.5)]
    : [buildCrate(1.4), SL.buildDumpster(), buildScrapDumpster('tin'), buildBarbecue(), buildFire(1.25)];
let x = -((items.length - 1) * 1.6) / 2;
for (const o of items) {
  o.position.x = x;
  o.traverse((c) => ((c as THREE.Mesh).castShadow = true));
  scene.add(o);
  x += 1.6;
}
for (const o of items) if (o.userData.flames) animateFire(o as THREE.Group, 0.3);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 6.5, 9);
camera.lookAt(0, 0.6, 0);
renderer.render(scene, camera);
(window as unknown as { ready: boolean }).ready = true;
