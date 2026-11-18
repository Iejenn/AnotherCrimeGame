// The floor kit's preview (v0.55): a demo patch of ground painted with every surface, to judge the shapes.
//   - a crossing: roads, sidewalks with round corners;
//   - a park: lawn, a winding gravel path, a pond, a paved square;
//   - a coastline with a cove and a little pier of concrete; a dirt lot.
import * as THREE from 'three';
import { buildFloor, type Surface } from '../../src/street/floor';

const q = new URLSearchParams(location.search);
const W = 44, H = 34;
const g: (Surface | null)[][] = Array.from({ length: H }, () => Array(W).fill('asphalt'));
const set = (x: number, y: number, s: Surface) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = s; };
const rect = (x0: number, y0: number, x1: number, y1: number, s: Surface) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, s); };
// Water along the south, a wobbly beach, a cove, a concrete pier.
for (let x = 0; x < W; x++) {
  const shore = 26 + Math.round(Math.sin(x * 0.45) * 1.2 + Math.sin(x * 0.17) * 1.5);
  for (let y = shore; y < H; y++) set(x, y, 'water');
  for (let y = shore - 2; y < shore; y++) set(x, y, 'sand');
}
rect(30, 22, 33, 29, 'water'); // the cove
rect(30, 22, 30, 22, 'sand');
rect(36, 24, 37, 31, 'concrete'); // the pier
// Two city blocks with sidewalks round them; the road between them is the crossing.
const block = (x0: number, y0: number, x1: number, y1: number, inner: Surface) => { rect(x0 - 1, y0 - 1, x1 + 1, y1 + 1, 'sidewalk'); rect(x0, y0, x1, y1, inner); };
block(2, 2, 11, 11, 'concrete');
block(18, 2, 27, 11, 'grass');
block(2, 15, 11, 21, 'dirt');
// The park (18–27, 2–11): a winding gravel path, a pond, a little paved square.
for (let x = 18; x <= 27; x++) { const y = 6 + Math.round(Math.sin((x - 18) * 0.7) * 2); set(x, y, 'gravel'); set(x, y + 1, 'gravel'); }
rect(21, 9, 23, 10, 'water');
rect(25, 2, 27, 4, 'paving');
// A plaza block with paving and grass beds.
block(33, 2, 40, 11, 'paving');
rect(34, 3, 35, 4, 'grass'); rect(38, 3, 39, 4, 'grass'); rect(34, 9, 35, 10, 'grass'); rect(38, 9, 39, 10, 'grass');
rect(36, 6, 37, 7, 'water');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2230);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.6));
const sun = new THREE.DirectionalLight(0xffc890, 1.6);
sun.position.set(-20, 30, 15);
scene.add(sun);
const floor = buildFloor({ x0: 0, y0: 0, w: W, h: H, at: (x, y) => g[y][x] });
scene.add(floor);
let tris = 0;
floor.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += m.geometry.attributes.position.count / 3; });
const top = q.get('cam') === 'top';
const camera = new THREE.PerspectiveCamera(top ? 45 : 35, innerWidth / innerHeight, 0.1, 300);
const cx = Number(q.get('x') ?? W / 2), cz = Number(q.get('z') ?? H / 2);
if (top) camera.position.set(cx, 48, cz + 0.01);
else camera.position.set(cx, Number(q.get('h') ?? 16), cz + Number(q.get('d') ?? 18));
camera.lookAt(cx, 0, cz);
renderer.render(scene, camera);
(window as unknown as { stats: object }).stats = { meshes: floor.children.length, tris };
(window as unknown as { ready: boolean }).ready = true;
