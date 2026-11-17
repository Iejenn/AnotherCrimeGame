// Dev only: the real size (bounding box) and triangle count of each model in public/models/ (?f=a,b,c), and of the
// code-built ones (character, rat, pigeon, dog, giant rat), to set and check the polygon budgets (docs/design.md §18).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCharacter } from '../../src/street/character';
import { buildCar, buildDog, buildGiantRat, buildPigeon, buildRat } from '../../src/street/props';
import { buildAmbulance, buildBigCar, buildTreePit } from '../../src/street/streetLife';
const files = (new URLSearchParams(location.search).get('f') ?? '').split(',').filter(Boolean);
const loader = new GLTFLoader();
const tris = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
};
const fx = (v: THREE.Vector3) => [v.x, v.y, v.z].map((n) => n.toFixed(2)).join(',');
(async () => {
  const lines: string[] = [];
  for (const [name, o] of [['code/character', buildCharacter({ skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 })], ['code/rat', buildRat()], ['code/pigeon', buildPigeon()], ['code/dog', buildDog()], ['code/giant_rat', buildGiantRat()], ['code/big_car', buildBigCar(0x8a2f28)], ['code/small_car', buildCar(0x8a2f28)], ['code/ambulance', buildAmbulance()], ['code/tree_pit', buildTreePit(() => 0.5)]] as const) {
    const b = new THREE.Box3().setFromObject(o);
    let meshes = 0;
    o.traverse((c) => void ((c as THREE.Mesh).isMesh && meshes++));
    lines.push(`${name}: ${tris(o)} tris, ${meshes} meshes, size ${fx(b.getSize(new THREE.Vector3()))}`);
  }
  for (const f of files) {
    try {
      const g = await loader.loadAsync(`/models/${f}.glb`);
      const b = new THREE.Box3().setFromObject(g.scene);
      lines.push(`${f}: ${tris(g.scene)} tris, size ${fx(b.getSize(new THREE.Vector3()))}`);
    } catch (e) {
      lines.push(`${f}: ERROR ${e}`);
    }
  }
  document.getElementById('out')!.textContent = lines.join('\n');
  (window as unknown as { ready: boolean }).ready = true;
})();
