// Dev only: every item as it lies on the ground (buildGroundItem), in the game's dusk light, from about the game's
// camera angle, with each one's name and triangle count underneath. ?only=copper (ids containing it).
import * as THREE from 'three';
import { buildGroundItem } from '../../src/street/streetLife';
import { ITEMS } from '../../src/game/data/items';

const q = new URLSearchParams(location.search);
const ids = ['cash', ...ITEMS.map((i) => i.id)].filter((id) => id.includes(q.get('only') ?? ''));
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f1c);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.4));
const sun = new THREE.DirectionalLight(0xffc890, 1.8);
sun.position.set(-3, 6, 4);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
sun.shadow.camera.right = sun.shadow.camera.top = 6;
scene.add(sun);
const COLS = 6;
const rows = Math.ceil(ids.length / COLS);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS + 1, rows + 1), new THREE.MeshLambertMaterial({ color: 0x4a4a48 }));
floor.rotation.x = -Math.PI / 2;
floor.position.set((COLS - 1) / 2, 0, (rows - 1) / 2);
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
camera.position.set((COLS - 1) / 2, rows * 1.3 + 2, (rows - 1) / 2 + rows * 0.9 + 2);
camera.lookAt((COLS - 1) / 2, 0, (rows - 1) / 2);
const tris = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
  });
  return Math.round(n);
};
const items = ids.map((id, i) => {
  const g = buildGroundItem(id);
  g.position.set(i % COLS, 0, Math.floor(i / COLS));
  g.rotation.y = 0.4;
  g.traverse((o) => (o.castShadow = true));
  scene.add(g);
  return [id, g] as const;
});
// The Food Kit models load in the background: wait a moment, then label and draw.
setTimeout(() => {
  renderer.render(scene, camera);
  for (const [id, g] of items) {
    const p = g.position.clone().add(new THREE.Vector3(0, 0, 0.25)).project(camera);
    const d = document.createElement('div');
    d.className = 'l';
    d.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    d.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
    d.textContent = `${id} (${tris(g)})`;
    document.body.appendChild(d);
  }
  (window as unknown as { ready: boolean }).ready = true;
}, 1500);
