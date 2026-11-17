// Dev only: render one ground item (?id=) the way it lies in the street (buildGroundItem: the Food Kit models with the
// same tone), framed to fill the picture, on a transparent background. scripts/render-icons.cjs saves these as the bag
// icons in public/icons/items/, so the bag and the ground always show the same thing.
import * as THREE from 'three';
import { buildGroundItem } from '../../src/street/streetLife';

const id = new URLSearchParams(location.search).get('id') ?? 'sandwich';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe8ecf4, 0x4a4038, 1.9));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
sun.position.set(-2, 4, 3);
scene.add(sun);
const item = buildGroundItem(id);
scene.add(item);
const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.01, 50);
// Wait for the model file, then frame it: a three-quarter view from above, the item turned a little.
setTimeout(() => {
  item.rotation.y = 0.5;
  item.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(item);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  const d = (r / Math.sin(THREE.MathUtils.degToRad(12))) * 0.78;
  const dir = new THREE.Vector3(0.35, 0.75, 1).normalize();
  camera.position.copy(c).addScaledVector(dir, d);
  camera.lookAt(c);
  renderer.render(scene, camera);
  (window as unknown as { ready: boolean }).ready = true;
}, 1200);
