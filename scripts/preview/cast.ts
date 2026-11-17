import * as THREE from 'three';
import { animateCharacter, buildCharacter } from '../../src/street/character';
import { setGear } from '../../src/street/props';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f1c);
scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x2a2420, 1.3));
const sun = new THREE.DirectionalLight(0xffc890, 1.8);
sun.position.set(-2, 5, 4);
sun.castShadow = true;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshLambertMaterial({ color: 0x6e7468 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
type Extra = Parameters<typeof buildCharacter>[1];
// The same looks as the game's (StreetView: THUG_LOOKS, BIKER_LOOKS, NPC_LOOKS).
const cast: [string, Parameters<typeof buildCharacter>[0], Extra, Record<string, string>?, string?][] = [
  ['you', { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 }, undefined],
  ['thug', { skin: 2, hair: 0, hairColor: 0, top: 3, bottom: 0 }, { hood: 0x4a4d52 }, { weapon: 'tin_knife' }],
  ['biker', { skin: 1, hair: 3, hairColor: 0, top: 4, bottom: 0 }, { vest: 0x1e1b18 }, { weapon: 'copper_knuckles' }],
  ['Elliot', { skin: 1, hair: 2, hairColor: 1, top: 4, bottom: 0 }, { scrubs: 0x2f6b4a, coat: true }],
  ['JD', { skin: 2, hair: 1, hairColor: 0, top: 4, bottom: 0 }, { scrubs: 0x7ab0d8, coat: true }],
  ['Eddy', { skin: 1, hair: 4, hairColor: 1, top: 2, bottom: 2 }, { apron: 0xe8e2d4 }],
  ['bartender', { skin: 1, hair: 0, hairColor: 0, top: 4, bottom: 0 }, { apron: 0x1e1b18 }],
  ['banker', { skin: 3, hair: 2, hairColor: 0, top: 3, bottom: 0 }, { suit: 0xf2efe8 }],
  ['guard', { skin: 3, hair: 4, hairColor: 0, top: 1, bottom: 0 }, { uniform: true }],
  ['Splinter', { skin: 1, hair: 4, hairColor: 1, top: 2, bottom: 3 }, { jacket: 0x4e5236 }, undefined, 'sitFloor'],
];
cast.forEach(([, look, extra, gear, pose], i) => {
  const g = buildCharacter(look, extra);
  if (gear) setGear(g, gear);
  g.position.set((i - (cast.length - 1) / 2) * 0.75, 0, 0);
  animateCharacter(g, (pose ?? 'idle') as never, 0);
  scene.add(g);
});
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 80);
const yaw = Number(q.get('yaw') ?? 0.25);
cam.position.set(Math.sin(yaw) * 6.2, 2.0, Math.cos(yaw) * 6.2);
cam.lookAt(0, 0.65, 0);
renderer.render(scene, cam);
(window as unknown as { ready: boolean }).ready = true;
