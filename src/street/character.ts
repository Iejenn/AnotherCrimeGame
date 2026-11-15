// Your character's look: option lists for the character creator, and one function that
// builds the low-poly model (used by the creator preview and on the Street).
import * as THREE from 'three';
import type { Look } from '../game/types';

export const SKIN_TONES = [0xf1d2b6, 0xd9b99a, 0xb88a64, 0x8d5f3e, 0x5c3b26];
export const HAIR_STYLES = ['Bald', 'Short', 'Long', 'Mohawk', 'Cap'];
export const HAIR_COLORS = [0x1c1612, 0x4a2f1b, 0x9a6a3a, 0xd8b45a, 0x8a2c1e, 0xb8b2a8];
export const TOP_COLORS = [0xc8412f, 0x2f4f6b, 0x3f6b3a, 0x1f1d1b, 0xd9d2c3, 0x6b4a8a, 0xd9a441];
export const BOTTOM_COLORS = [0x23201c, 0x2f3e57, 0x5a4a36, 0x4a4a4a, 0x3a2a1c];

export const DEFAULT_LOOK: Look = { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 };

export function randomLook(): Look {
  const r = (n: number) => Math.floor(Math.random() * n);
  return { skin: r(SKIN_TONES.length), hair: r(HAIR_STYLES.length), hairColor: r(HAIR_COLORS.length), top: r(TOP_COLORS.length), bottom: r(BOTTOM_COLORS.length) };
}

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

type MatFn = (color: number) => THREE.Material;
type BoxFn = (w: number, h: number, d: number) => THREE.BufferGeometry;

/** Build the character model. `mat` and `box` let the caller share and later dispose materials/geometry. */
export function buildCharacter(look: Look, mat: MatFn, box: BoxFn): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[1];
  const top = TOP_COLORS[look.top] ?? TOP_COLORS[0];
  const bottom = BOTTOM_COLORS[look.bottom] ?? BOTTOM_COLORS[0];
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];

  // legs, shoes, body, arms, hands, head
  add(box(0.16, 0.34, 0.2), bottom, -0.1, 0.19);
  add(box(0.16, 0.34, 0.2), bottom, 0.1, 0.19);
  add(box(0.17, 0.06, 0.24), 0x15120f, -0.1, 0.03, 0.02);
  add(box(0.17, 0.06, 0.24), 0x15120f, 0.1, 0.03, 0.02);
  add(box(0.44, 0.44, 0.26), top, 0, 0.58);
  add(box(0.11, 0.38, 0.14), top, -0.28, 0.6);
  add(box(0.11, 0.38, 0.14), top, 0.28, 0.6);
  add(box(0.1, 0.08, 0.12), skin, -0.28, 0.38);
  add(box(0.1, 0.08, 0.12), skin, 0.28, 0.38);
  add(box(0.3, 0.3, 0.3), skin, 0, 0.98);
  // eyes (facing +z)
  add(box(0.05, 0.04, 0.02), 0x15120f, -0.07, 1.0, 0.151);
  add(box(0.05, 0.04, 0.02), 0x15120f, 0.07, 1.0, 0.151);

  switch (look.hair) {
    case 1: // short
      add(box(0.32, 0.08, 0.32), hair, 0, 1.16);
      add(box(0.32, 0.14, 0.06), hair, 0, 1.07, -0.14);
      break;
    case 2: // long
      add(box(0.33, 0.09, 0.33), hair, 0, 1.16);
      add(box(0.33, 0.38, 0.07), hair, 0, 0.96, -0.15);
      add(box(0.06, 0.24, 0.3), hair, -0.16, 1.02);
      add(box(0.06, 0.24, 0.3), hair, 0.16, 1.02);
      break;
    case 3: // mohawk
      add(box(0.08, 0.16, 0.3), hair, 0, 1.2);
      break;
    case 4: // cap
      add(box(0.33, 0.1, 0.33), hair, 0, 1.17);
      add(box(0.3, 0.03, 0.14), hair, 0, 1.13, 0.2);
      break;
    default: // bald
      break;
  }
  return g;
}
