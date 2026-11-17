import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Kit, face, mergeStatic, onFace, uOf } from './kit';

// The building kit (docs/design.md §18): faces, walls with openings, and the static merge keeping fading working.
function setup() {
  const scene = new THREE.Scene();
  const statics: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    scene.add(m);
    statics.push(m);
    return m;
  };
  return { scene, statics, kit: new Kit(add, (x) => x) };
}

describe('faces', () => {
  const r = { x0: 2, z0: 3, x1: 6, z1: 5 };
  it('runs u from the left as seen from outside, and back', () => {
    const s = face(r, 's');
    expect(onFace(s, 1, 0)).toEqual({ x: 3, z: 5 });
    expect(uOf(s, 3)).toBe(1);
    const n = face(r, 'n');
    expect(onFace(n, 1, 0.5)).toEqual({ x: 5, z: 2.5 });
    expect(uOf(n, 5)).toBe(1);
    const e = face(r, 'e');
    expect(onFace(e, 0.5, 0)).toEqual({ x: 6, z: 4.5 });
    const w = face(r, 'w');
    expect(onFace(w, 0.5, 0)).toEqual({ x: 2, z: 3.5 });
  });
});

describe('walls and merging', () => {
  it('cuts a doorway, merges the walls, and the merged walls still block the camera ray', () => {
    const { scene, statics, kit } = setup();
    const wallMat = kit.own_mat(0x7a4a3a);
    const r = { x0: 0, z0: 0, x1: 4, z1: 4 };
    const walls = kit.walls(r, 2, 0.1, wallMat, { s: [{ u0: 1.5, u1: 2.5, top: 1.2 }] });
    // South wall: left of the door, above it, right of it; the other three whole.
    expect(walls.length).toBe(6);
    const props = kit.window(face(r, 'n'), 2, 0.5, { lit: true });
    const fade = { walls: [...walls], mats: [wallMat], props: [...props] };
    mergeStatic(scene, statics, [fade], new Set(), (x) => x);
    // The walls became one mesh (one material), still in the fade list; the window's pieces merged by look.
    expect(fade.walls.length).toBe(1);
    expect(fade.walls[0].material).toBe(wallMat);
    expect(fade.props.length).toBeLessThan(props.length);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 1.5, 10), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObjects(fade.walls, false).length).toBeGreaterThan(0); // through the wall above the door
    const low = new THREE.Raycaster(new THREE.Vector3(2, 0.5, 10), new THREE.Vector3(0, 0, -1), 0, 9); // (stops inside the room, before the back wall)
    expect(low.intersectObjects(fade.walls, false).length).toBe(0); // through the doorway: nothing in the way
  });
});
