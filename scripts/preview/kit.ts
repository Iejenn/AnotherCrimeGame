// Dev only: the building kit's parts (src/street/kit.ts) on three test walls, in the game's dusk light, each labelled,
// plus the fences. ?cam=close for a nearer look.
import * as THREE from 'three';
import { Kit, face, mergeStatic, type DoorStyle, type FenceStyle, type WindowStyle } from '../../src/street/kit';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2230);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.25));
const sun = new THREE.DirectionalLight(0xffa864, 1.8);
sun.position.set(-6, 10, 8);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(sun);
const statics: THREE.Mesh[] = [];
const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  scene.add(m);
  statics.push(m);
  return m;
};
const kit = new Kit(add, (x) => x);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshLambertMaterial({ color: 0x6d6962 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const labels: [string, THREE.Vector3][] = [];
const label = (t: string, x: number, y: number, z: number) => labels.push([t, new THREE.Vector3(x, y, z)]);

// Wall 1: windows (two floors: lit on top).
const r1 = { x0: -10, z0: -6, x1: 4, z1: -4 };
kit.walls(r1, 3, 0.15, kit.own_mat(0x7a4a3a));
kit.roof(r1, 3, 0x45423e);
kit.parapet(r1, 3.06, 0x7a2f28);
const f1 = face(r1, 's');
const styles: WindowStyle[] = ['plain', 'office', 'barred', 'broken', 'boarded', 'blacked', 'shop'];
styles.forEach((st, i) => {
  const u = 1 + i * 2;
  kit.window(f1, u, 0.45, { style: st, behind: st === 'barred' ? 'boxes' : undefined, w: st === 'shop' ? 1.3 : undefined });
  kit.window(f1, u, 1.9, { style: st === 'shop' ? 'plain' : st, lit: true, behind: st === 'plain' ? 0x8a2f28 : undefined });
  label(st, r1.x0 + u, 0.1, r1.z1 + 0.6);
});
// Wall 2: doors.
const r2 = { x0: -10, z0: 1, x1: 6, z1: 3 };
kit.walls(r2, 2.2, 0.15, kit.own_mat(0x8a7f70));
kit.roof(r2, 2.2, 0x45423e, 0.1);
const f2 = face(r2, 's');
const doors: [DoorStyle, Parameters<Kit['door']>[2]][] = [
  ['plain', { step: true, light: 'lamp', color: 0x3a2a20 }], ['glass', { light: 'bulb' }], ['office', { color: 0x2e5f8a }], ['double', { color: 0x5a3a22 }],
  ['shutter', { color: 0x8a6a4a }], ['shutterOpen', {}], ['open', { light: 0xff3030 }],
];
doors.forEach(([st, o], i) => {
  const u = 1 + i * 2.2;
  kit.door(f2, u, { ...o, style: st });
  label(st, r2.x0 + u, 0.1, r2.z1 + 0.7);
});
// Wall 3 (facing east): a sign, an awning, a drainpipe, lights, a meter box.
const r3 = { x0: 7, z0: -6, x1: 16, z1: -4 };
kit.walls(r3, 2.6, 0.15, kit.textured('brick', 0x8a5040, 9, 2));
kit.roof(r3, 2.6, 0x45423e);
kit.acUnit(8, 2.68, -5);
kit.tank(10, 2.68, -5);
kit.antenna(12.4, 2.68, -5);
kit.vent(14, 2.68, -5);
const f3 = face(r3, 's');
kit.sign(f3, 2, 2.0, { text: 'THRIFT STORE', bg: '#d8cdb8', fg: '#8a2f28', w: 3, h: 0.5, board: 0x3a2a22 });
kit.awning(f3, 2, 1.45, 3, { color: '#2f6b40', light: '#d8d0c0' });
kit.window(f3, 2, 0.4, { style: 'shop', w: 2.4 });
kit.drainpipe(f3, 4.2, 2.6);
kit.wallLight(f3, 5.5, 1.5, 'lamp');
kit.wallLight(f3, 6.2, 1.5, 'bulb');
kit.wallLight(f3, 6.9, 1.5, 0x5ac8ff);
kit.meterBox(f3, 8, 1.0);
label('sign, awning, shop window', 9, 0.1, r3.z1 + 0.6);
label('drainpipe, lights, meter box', 13.5, 0.1, r3.z1 + 0.6);
// Fences.
const fences: FenceStyle[] = ['chain', 'chainBarbed', 'corrugated', 'halfBrick', 'railing', 'planks'];
fences.forEach((st, i) => {
  kit.fence(-10 + i * 3.3, 7, -10 + i * 3.3 + 3, 7, st, { skip: (k) => k === 1 && st === 'chain' });
  label(st, -8.5 + i * 3.3, 0.1, 7.7);
});
mergeStatic(scene, statics, [], new Set(), (x) => x);
let tris = 0;
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
});
const close = q.get('cam') === 'close';
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
const cx = Number(q.get('cx') ?? (close ? -4 : 2));
camera.position.set(cx, close ? 6 : 19, close ? 9 : 24);
camera.lookAt(cx, 1, close ? -2 : 0);
renderer.render(scene, camera);
for (const [t, p] of labels) {
  const s = p.clone().project(camera);
  const d = document.createElement('div');
  d.className = 'l';
  d.style.left = `${((s.x + 1) / 2) * innerWidth}px`;
  d.style.top = `${((1 - s.y) / 2) * innerHeight}px`;
  d.textContent = t;
  document.body.appendChild(d);
}
document.title = `Kit: ${Math.round(tris)} triangles, ${renderer.info.render.calls} draw calls`;
(window as unknown as { ready: boolean }).ready = true;
