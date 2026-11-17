// 3D models from files (v0.45 pilot): Kenney's CC0 packs (kenney.nl): the Retro Urban Kit (trucks, pallets, barriers),
// the Furniture Kit and the Food Kit, in public/models/. Everything else in the game is still built in code.
//
// A model loads in the background: `withModel` gives you an empty group right away (place it, give it userData, add it
// to the scene) and fills it once the file is there. Each file is loaded once and cloned after that.
// `tone` keeps the bright packs in our gritty dusk look: 'dull' (furniture, food) desaturates and darkens their colours;
// the urban kit is textured and grimy already ('none').
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();
// (In dev the previews live in /scripts/preview/, so use the server root there; the built game sits next to models/.)
const BASE = import.meta.env.DEV ? '/models/' : `${import.meta.env.BASE_URL}models/`;

export type Tone = 'none' | 'muted' | 'dull' | 'dark' | 'grimy';
/** 'dark' furniture: its materials by name, in a dim bar's colours (worn red leather, dark wood, dull metal). */
const DARK: Record<string, number> = { carpet: 0x5a2622, carpetDarker: 0x3e1a18, wood: 0x3a281c, woodDark: 0x2a1c14, metal: 0x4a4a4e, metalMedium: 0x3a3c40, metalDark: 0x2e2e32 };

function load(path: string, tone: Tone): Promise<THREE.Object3D> {
  const key = `${path}|${tone}`;
  let p = cache.get(key);
  if (!p) {
    p = loader.loadAsync(BASE + path).then((gltf) => {
      const root = gltf.scene;
      const grey = new THREE.Color(0x6a645c);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
        m.material = mats.map((mat) => {
          const c = mat.clone();
          // Matte, like the rest of the city (no shiny plastic).
          c.metalness = 0;
          c.roughness = 1;
          // 'muted': a touch greyer (fruit and veg keep their colour); 'dull': greyer and darker (bright furniture, food).
          if (tone === 'muted') c.color.lerp(grey, 0.15).multiplyScalar(0.95);
          if (tone === 'dull') c.color.lerp(grey, 0.45).multiplyScalar(0.75);
          if (tone === 'dark') {
            if (DARK[c.name] !== undefined) c.color.setHex(DARK[c.name]);
            else c.color.lerp(grey, 0.5).multiplyScalar(0.45);
          }
          // Textured models (trucks, containers): dimmer and browner, as if they've stood out in the rain for years.
          if (tone === 'grimy') c.color.setHex(0x8a7c6c);
          return c;
        });
        if (m.material.length === 1) m.material = (m.material as THREE.Material[])[0];
      });
      return root;
    });
    cache.set(key, p);
  }
  return p;
}

export interface Place {
  /** Uniform scale. The models stand on the floor at their origin, at real-world sizes: a truck about 1.6 long, a
   *  pallet 1 (a tile), a bar stool 0.43 tall (our people are about 1.5, so furniture needs about 1.5×). */
  scale?: number;
  /** Turn around the vertical (radians), and a tilt (radians, around x then z) for things lying askew. */
  rot?: number;
  tiltX?: number;
  tiltZ?: number;
  /** Offset inside the group. (Furniture's origin is a back corner, not the middle.) */
  x?: number;
  y?: number;
  z?: number;
  tone?: Tone;
}

/** An empty group now; the model appears in it when it has loaded. */
export function withModel(path: string, place: Place = {}, into = new THREE.Group()): THREE.Group {
  const inner = new THREE.Group();
  inner.position.set(place.x ?? 0, place.y ?? 0, place.z ?? 0);
  inner.rotation.set(place.tiltX ?? 0, place.rot ?? 0, place.tiltZ ?? 0, 'YXZ');
  inner.scale.setScalar(place.scale ?? 1);
  into.add(inner);
  load(path, place.tone ?? 'none').then(
    (root) => {
      const c = root.clone(true);
      // Things picked by tapping (ground items) keep their tags on the new parts too.
      c.traverse((o) => Object.assign(o.userData, into.userData));
      inner.add(c);
    },
    () => {
      /* A missing model just isn't shown (the game still works). */
    },
  );
  return into;
}
