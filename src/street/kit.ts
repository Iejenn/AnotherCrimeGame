// The building kit (v0.47, docs/design.md §18): the parts every building is made of, so a building is described, not
// hand-placed box by box. Windows, doors, walls with openings, roof edges, signs, awnings, drainpipes, lamps, roof
// clutter, and fences. Every part follows the art rules (faceted, solid colours, chunky), and the same part looks the
// same on every building.
//
// Parts are placed on a FACE: one side of a rectangle, seen from outside. `u` runs along it from the viewer's left
// (0 … face.len), `y` is the height above the ground, and `out` how far in front of the wall. So "a barred window 1.5
// along the south wall, 0.6 up" is the same call whichever way the building faces.
//
// The kit only places meshes, through the city's `add` (city.ts): at the end of buildCity every static piece is
// merged into a few meshes per area and colour (see `mergeStatic` below), so a window costs triangles, not draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- canvas textures (shared by the city and the kit) ----------
export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export const stripeTex = (color: string, light = '#ffffff') =>
  canvasTex(64, 16, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? light : color;
      g.fillRect(i * 8, 0, 8, 16);
    }
  });

export function signTexture(text: string, bg = '#2f7a46', fg = '#ffffff') {
  return canvasTex(
    512,
    96,
    (g) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 96);
      g.strokeStyle = fg;
      g.lineWidth = 6;
      g.strokeRect(8, 8, 496, 80);
      g.fillStyle = fg;
      g.font = 'bold 52px Arial, sans-serif';
      // Long names get a smaller font so they fit inside the border.
      const w = g.measureText(text).width;
      if (w > 470) g.font = `bold ${Math.floor((52 * 470) / w)}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 52);
    },
    false,
  );
}

/** Chain-link: a diamond mesh, see-through. */
export const chainLinkTex = () =>
  canvasTex(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.strokeStyle = '#b8bcc2';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 16);
    g.lineTo(16, 0);
    g.lineTo(32, 16);
    g.lineTo(16, 32);
    g.closePath();
    g.stroke();
  });

/** Bare brick, white (the material's colour tints it): one floor high, one tile wide per repeat. */
export const brickTexture = () =>
  canvasTex(64, 96, (g) => {
    g.fillStyle = '#d8d0c4';
    g.fillRect(0, 0, 64, 96);
    for (let row = 0; row < 12; row++) {
      const off = row % 2 ? 0 : 16;
      for (let col = -1; col < 3; col++) {
        const shade = 200 + ((row * 7 + col * 13) % 5) * 9;
        g.fillStyle = `rgb(${shade},${shade - 12},${shade - 22})`;
        g.fillRect(col * 32 + off + 1, row * 8 + 1, 30, 6);
      }
    }
  });

/** Corrugated metal: vertical ribs (white: the material's colour tints it). */
export const ribTexture = () =>
  canvasTex(32, 32, (g) => {
    g.fillStyle = '#d0d0d0';
    g.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#a0a0a0';
      g.fillRect(i * 8, 0, 3, 32);
      g.fillStyle = '#f0f0f0';
      g.fillRect(i * 8 + 4, 0, 2, 32);
    }
  });

// ---------- faces ----------
export type Side = 'n' | 's' | 'e' | 'w';
/** A rectangle in world units (tiles): x0..x1 west–east, z0..z1 north–south (the far edges, not the last tile). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
/** One side of a rectangle, from outside: its left end (x, z), its outward normal, and its length. */
export interface Face {
  x: number;
  z: number;
  nx: number;
  nz: number;
  len: number;
}
/** A map Room / rect in tiles (x1, y1 the last tile) → a Rect in world units. */
export const rectOf = (r: { x0: number; y0: number; x1: number; y1: number }): Rect => ({ x0: r.x0, z0: r.y0, x1: r.x1 + 1, z1: r.y1 + 1 });

export function face(r: Rect, side: Side): Face {
  if (side === 's') return { x: r.x0, z: r.z1, nx: 0, nz: 1, len: r.x1 - r.x0 };
  if (side === 'n') return { x: r.x1, z: r.z0, nx: 0, nz: -1, len: r.x1 - r.x0 };
  if (side === 'e') return { x: r.x1, z: r.z1, nx: 1, nz: 0, len: r.z1 - r.z0 };
  return { x: r.x0, z: r.z0, nx: -1, nz: 0, len: r.z1 - r.z0 };
}
/** The direction `u` runs along the face (to the viewer's right, seen from outside). */
const along = (f: Face) => ({ ax: f.nz, az: -f.nx });
/** How far along the face a world x (for north/south faces) or z (east/west) is. */
export function uOf(f: Face, coord: number) {
  const { ax, az } = along(f);
  return ax !== 0 ? (coord - f.x) * ax : (coord - f.z) * az;
}
/** World position of (u, out) on a face. */
export function onFace(f: Face, u: number, out: number) {
  const { ax, az } = along(f);
  return { x: f.x + ax * u + f.nx * out, z: f.z + az * u + f.nz * out };
}
const yawOf = (f: Face) => Math.atan2(f.nx, f.nz);

// ---------- styles ----------
export type WindowStyle = 'plain' | 'shop' | 'broken' | 'boarded' | 'barred' | 'blacked' | 'office';
export interface WindowOpts {
  w?: number;
  h?: number;
  style?: WindowStyle;
  /** Light on inside (warm glass that glows at dusk). */
  lit?: boolean;
  /** The frame's colour (default: a dark grey-brown). */
  frame?: number;
  /** A sill under it (default: yes, except shop windows). */
  sill?: boolean;
  /** Something behind the glass: cardboard boxes, or a curtain (its colour). */
  behind?: 'boxes' | number;
  /** The glow colour of a lit window (default: warm). */
  glow?: number;
}
export type DoorStyle = 'plain' | 'glass' | 'office' | 'shutter' | 'shutterOpen' | 'double' | 'open' | 'frame';
export interface DoorOpts {
  w?: number;
  h?: number;
  style?: DoorStyle;
  color?: number;
  frame?: number;
  /** A step in front of it. */
  step?: boolean;
  /** A lamp beside it ('lamp': a boxed wall light; 'bulb': a bare bulb above; or a colour for a glowing box). */
  light?: 'lamp' | 'bulb' | number;
}
export type FenceStyle = 'chain' | 'chainBarbed' | 'corrugated' | 'halfBrick' | 'railing' | 'planks';

/** The city's add (city.ts): a mesh at (x, y, z), added to the scene (and merged at the end if it's static). */
export type Add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow?: boolean) => THREE.Mesh;

export const WARM = 0xffc46b;

/**
 * The kit. One per city: it shares its materials, geometries and textures (they're merged by colour anyway).
 * Every part returns the meshes it made, so a building can put them in its fade lists (walls fade, props hide).
 */
export class Kit {
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private texs = new Map<string, THREE.Texture>();
  constructor(
    private add: Add,
    private own: <T extends { dispose: () => void }>(x: T) => T,
  ) {}

  /** A shared, faceted, matte material (same colour + glow = same material). */
  mat(color: number, glow?: number, strength = 1) {
    const k = `${color}|${glow ?? ''}|${strength}`;
    let m = this.mats.get(k);
    if (!m) {
      m = this.own(new THREE.MeshLambertMaterial({ color, flatShading: true, ...(glow !== undefined ? { emissive: glow, emissiveIntensity: strength } : {}) }));
      this.mats.set(k, m);
    }
    return m;
  }
  /** A building's own material (walls that fade need their own). */
  own_mat(color: number, extra: THREE.MeshLambertMaterialParameters = {}) {
    return this.own(new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  }
  /** A brick or corrugated material for one wall size (its own texture repeat). */
  textured(kind: 'brick' | 'rib', color: number, across: number, high: number) {
    let base = this.texs.get(kind);
    if (!base) {
      base = this.own(kind === 'brick' ? brickTexture() : ribTexture());
      this.texs.set(kind, base);
    }
    const t = this.own(base.clone());
    t.repeat.set(Math.max(0.5, across), Math.max(0.5, high));
    t.needsUpdate = true;
    return this.own_mat(color, { map: t });
  }
  box(w: number, h: number, d: number) {
    const k = `b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
    let g = this.geos.get(k);
    if (!g) {
      g = this.own(new THREE.BoxGeometry(w, h, d));
      this.geos.set(k, g);
    }
    return g;
  }
  cyl(r: number, h: number, sides = 8) {
    const k = `c${r},${h},${sides}`;
    let g = this.geos.get(k);
    if (!g) {
      g = this.own(new THREE.CylinderGeometry(r, r, h, sides));
      this.geos.set(k, g);
    }
    return g;
  }

  /** A box on a face: centred at (u, y) with its back `out` in front of the wall; w along, h up, d out. */
  slab(f: Face, u: number, y: number, out: number, w: number, h: number, d: number, m: THREE.Material | number, shadow = false) {
    const p = onFace(f, u, out + d / 2);
    const mesh = this.add(this.box(w, h, d), typeof m === 'number' ? this.mat(m) : m, p.x, y, p.z, shadow);
    mesh.rotation.y = yawOf(f);
    return mesh;
  }

  // ---------- windows ----------
  /** One window, its bottom edge at `y`, centred at `u`. */
  window(f: Face, u: number, y: number, o: WindowOpts = {}): THREE.Mesh[] {
    const style = o.style ?? 'plain';
    const w = o.w ?? (style === 'shop' ? 1.3 : 0.5);
    const h = o.h ?? (style === 'shop' ? 0.85 : 0.62);
    const frame = o.frame ?? 0x3a3430;
    const cy = y + h / 2;
    const out: THREE.Mesh[] = [];
    // The frame: a slab a little bigger than the glass, standing just proud of the wall.
    out.push(this.slab(f, u, cy, 0, w + 0.08, h + 0.08, 0.03, frame));
    if (style === 'boarded') {
      // A dark hole with three rough planks nailed across it.
      out.push(this.slab(f, u, cy, 0.03, w, h, 0.01, 0x141210));
      [-0.3, 0.02, 0.32].forEach((k, i) => {
        const p = this.slab(f, u, cy + k * h, 0.04, w + 0.14, 0.11, 0.03, 0x7a5a3a);
        p.rotateZ([0.08, -0.1, 0.05][i]);
        out.push(p);
      });
      return out;
    }
    const glass =
      style === 'broken' ? this.mat(0x141618)
      : style === 'blacked' ? this.mat(0x0e0e12)
      : o.lit || style === 'shop' ? this.mat(0x6a5032, o.glow ?? WARM, style === 'shop' ? 1.1 : 0.9)
      : this.mat(0x1d2630);
    out.push(this.slab(f, u, cy, 0.03, w, h, 0.012, glass));
    if (style === 'broken') {
      // What's left of the pane: two shards in the corners.
      out.push(this.slab(f, u - w * 0.28, cy + h * 0.3, 0.035, w * 0.36, h * 0.3, 0.008, this.mat(0x3a4650, 0x2a2010, 0.5)));
      out.push(this.slab(f, u + w * 0.3, cy - h * 0.32, 0.035, w * 0.3, h * 0.26, 0.008, this.mat(0x3a4650, 0x2a2010, 0.5)));
    }
    if (style === 'shop') {
      // Big panes: a bar every ~0.65 and a transom near the top.
      const n = Math.max(1, Math.round(w / 0.65));
      for (let i = 1; i < n; i++) out.push(this.slab(f, u - w / 2 + (i * w) / n, cy, 0.042, 0.04, h, 0.012, frame));
      out.push(this.slab(f, u, y + h * 0.78, 0.042, w, 0.035, 0.012, frame));
    }
    if (style === 'office' || (style === 'plain' && h > 0.5)) {
      // Glazing bars: a cross on plain windows, a transom on office windows.
      out.push(this.slab(f, u, cy, 0.042, w, 0.03, 0.012, frame));
      if (style === 'plain') out.push(this.slab(f, u, cy, 0.042, 0.03, h, 0.012, frame));
    }
    if (o.behind === 'boxes') {
      out.push(this.slab(f, u - w * 0.2, y + 0.15, 0.03, w * 0.4, 0.3, 0.02, 0x9a7a52));
      out.push(this.slab(f, u + w * 0.15, y + 0.12, 0.031, w * 0.3, 0.22, 0.02, 0x8a6a42));
    } else if (typeof o.behind === 'number') {
      out.push(this.slab(f, u - w * 0.3, cy, 0.04, w * 0.32, h, 0.006, o.behind));
    }
    if (style === 'barred') for (let i = 1; i < Math.round(w / 0.2); i++) out.push(this.slab(f, u - w / 2 + i * (w / Math.round(w / 0.2)), cy, 0.05, 0.025, h + 0.04, 0.03, 0x2a2a2e));
    if (o.sill ?? style !== 'shop') out.push(this.slab(f, u, y - 0.03, 0, w + 0.16, 0.05, 0.09, 0x8a857c));
    return out;
  }

  /** Windows along a face from `from` to `to` (u), one every `step`, skipping where `skip(u)` says (doors, signs). */
  windowRow(f: Face, from: number, to: number, y: number, step: number, o: WindowOpts & { skip?: (u: number) => boolean; litChance?: number; rng?: () => number } = {}) {
    const out: THREE.Mesh[] = [];
    const n = Math.max(1, Math.floor((to - from) / step + 1e-6));
    const start = from + (to - from - (n - 1) * step) / 2;
    for (let i = 0; i < n; i++) {
      const u = start + i * step;
      if (o.skip?.(u)) continue;
      const lit = o.lit ?? (o.litChance !== undefined && (o.rng ?? Math.random)() < o.litChance);
      out.push(...this.window(f, u, y, { ...o, lit }));
    }
    return out;
  }

  // ---------- doors ----------
  /** A door at the foot of a face, centred at `u`. */
  door(f: Face, u: number, o: DoorOpts = {}): THREE.Mesh[] {
    const style = o.style ?? 'plain';
    const w = o.w ?? (style === 'double' ? 1.0 : style.startsWith('shutter') ? 1.6 : 0.55);
    const h = o.h ?? (style.startsWith('shutter') ? 1.4 : 1.05);
    const frame = o.frame ?? 0x3a3430;
    const color = o.color ?? 0x3a2a20;
    const out: THREE.Mesh[] = [];
    // The frame round the opening (top and sides).
    out.push(this.slab(f, u, h + 0.03, 0, w + 0.14, 0.07, 0.06, frame));
    for (const s of [-1, 1]) out.push(this.slab(f, u + s * (w / 2 + 0.035), h / 2, 0, 0.07, h, 0.06, frame));
    if (style === 'frame') {
      // Just the frame round a real opening (you walk through it).
    } else if (style === 'open') {
      out.push(this.slab(f, u, h / 2, 0.005, w, h, 0.01, 0x0c0b0a));
    } else if (style === 'shutter' || style === 'shutterOpen') {
      // A ribbed roll-up door, down; or rolled up into its box over the opening (a dark way in below).
      const down = style === 'shutter';
      if (down) {
        out.push(this.slab(f, u, h / 2, 0.01, w, h, 0.03, color));
        for (let i = 0; i < Math.floor(h / 0.2); i++) out.push(this.slab(f, u, 0.12 + i * 0.2, 0.04, w, 0.02, 0.012, 0x4a4038));
      }
      // (Rolled up: the opening below is real, you walk in.)
      out.push(this.slab(f, u, h + 0.2, 0.0, w + 0.2, 0.3, 0.26, o.frame ?? 0x5a4a3a, true));
    } else {
      const leaves = style === 'double' ? [-w / 4, w / 4] : [0];
      for (const du of leaves) {
        const lw = style === 'double' ? w / 2 - 0.02 : w;
        out.push(this.slab(f, u + du, h / 2, 0.01, lw, h, 0.035, color));
        if (style === 'glass' || style === 'double') out.push(this.slab(f, u + du, h * 0.55, 0.046, lw * 0.6, h * 0.55, 0.01, this.mat(0x6a5032, WARM, 0.7)));
        else if (style === 'office') out.push(this.slab(f, u + du, h * 0.72, 0.046, lw * 0.5, h * 0.22, 0.01, this.mat(0xffe7c2, 0xffd9a0, 0.8)));
        // A handle.
        out.push(this.slab(f, u + du + (du < 0 ? -1 : 1) * lw * 0.32, h * 0.48, 0.046, 0.04, 0.04, 0.03, 0xb8a060));
      }
    }
    if (o.step) out.push(this.slab(f, u, 0.04, 0, w + 0.3, 0.08, 0.3, 0x8a857c, true));
    if (o.light === 'lamp') out.push(this.slab(f, u + w / 2 + 0.22, h - 0.05, 0, 0.12, 0.12, 0.08, this.mat(0xffe7c2, 0xffd9a0, 1.2)));
    else if (o.light === 'bulb') out.push(this.slab(f, u, h + 0.25, 0.02, 0.1, 0.1, 0.1, this.mat(0xffe7c2, 0xffd9a0, 1.5)));
    else if (typeof o.light === 'number') out.push(this.slab(f, u + w / 2 + 0.25, h + 0.1, 0, 0.12, 0.16, 0.12, this.mat(o.light, o.light, 2)));
    return out;
  }

  // ---------- walls ----------
  /**
   * The four walls of a room (thickness t, height h) with openings cut in them: `openings` per side, each from u0 to u1
   * and up to `top` (a door: the wall goes on above it). Returns the wall pieces (for the fade list).
   */
  walls(r: Rect, h: number, t: number, m: THREE.Material, openings: Partial<Record<Side, { u0: number; u1: number; top: number }[]>> = {}) {
    const out: THREE.Mesh[] = [];
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const f = face(r, side);
      // North and south walls run the full width; east and west fit between them.
      const inset = side === 'e' || side === 'w' ? t : 0;
      const cuts = [...(openings[side] ?? [])].sort((a, b) => a.u0 - b.u0);
      let u = inset;
      const piece = (u0: number, u1: number, y0: number, y1: number) => {
        if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
        out.push(this.slab(f, (u0 + u1) / 2, (y0 + y1) / 2, -t, u1 - u0, y1 - y0, t, m, true));
      };
      for (const c of cuts) {
        piece(u, c.u0, 0, h);
        piece(c.u0, c.u1, c.top, h);
        u = c.u1;
      }
      piece(u, f.len - inset, 0, h);
    }
    return out;
  }

  // ---------- roofs ----------
  /** A flat roof slab on top of walls `h` high (with an overhang all round). */
  roof(r: Rect, h: number, color: number, overhang = 0, thick = 0.08) {
    return this.add(this.box(r.x1 - r.x0 + overhang * 2, thick, r.z1 - r.z0 + overhang * 2), this.mat(color), (r.x0 + r.x1) / 2, h + thick / 2, (r.z0 + r.z1) / 2);
  }
  /** A band round the roof edge (a parapet): the roof shows in the middle. `m` may be the building's own material. */
  parapet(r: Rect, top: number, m: THREE.Material | number, high = 0.16, thick = 0.1) {
    const mat = typeof m === 'number' ? this.mat(m) : m;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    return [
      this.add(this.box(w, high, thick), mat, cx, top, r.z0 + thick / 2),
      this.add(this.box(w, high, thick), mat, cx, top, r.z1 - thick / 2),
      this.add(this.box(thick, high, d - 2 * thick), mat, r.x0 + thick / 2, top, cz),
      this.add(this.box(thick, high, d - 2 * thick), mat, r.x1 - thick / 2, top, cz),
    ];
  }
  /** An air-con unit on a roof (or a wall: `onWall`), with its fan grille. */
  acUnit(x: number, y: number, z: number, big = false) {
    const w = big ? 0.6 : 0.3;
    const h = big ? 0.3 : 0.18;
    const d = big ? 0.5 : 0.24;
    return [this.add(this.box(w, h, d), this.mat(0xd8d8d4), x, y + h / 2, z), this.add(this.box(w * 0.6, 0.01, d * 0.6), this.mat(0x5a5f66), x, y + h + 0.005, z, false)];
  }
  /** A round water tank on legs. */
  tank(x: number, y: number, z: number) {
    return [this.add(this.cyl(0.18, 0.32, 8), this.mat(0xb8bcc2), x, y + 0.26, z), this.add(this.box(0.3, 0.1, 0.3), this.mat(0x5a5f66), x, y + 0.05, z)];
  }
  antenna(x: number, y: number, z: number) {
    return [this.add(this.cyl(0.015, 0.7, 4), this.mat(0x6a6f76), x, y + 0.35, z), this.add(this.box(0.3, 0.015, 0.015), this.mat(0x6a6f76), x, y + 0.6, z, false)];
  }
  vent(x: number, y: number, z: number, r = 0.16, h = 0.35, color = 0x9aa0a6) {
    return [this.add(this.cyl(r, h, 8), this.mat(color), x, y + h / 2, z), this.add(this.cyl(r * 1.3, 0.04, 8), this.mat(0x5a5f66), x, y + h + 0.03, z, false)];
  }

  // ---------- signs, awnings, things on the wall ----------
  /** A sign board centred at (u, y): the text on a plane in front of a board of `board` colour. */
  sign(f: Face, u: number, y: number, o: { text?: string; bg?: string; fg?: string; tex?: THREE.Texture; w: number; h: number; board?: number; out?: number }) {
    const out = o.out ?? 0;
    const meshes: THREE.Mesh[] = [];
    if (o.board !== undefined) meshes.push(this.slab(f, u, y, out, o.w + 0.12, o.h + 0.1, 0.06, o.board, true));
    const tex = o.tex ?? this.own(signTexture(o.text ?? '', o.bg, o.fg));
    const p = onFace(f, u, out + 0.065);
    const plane = this.add(this.own(new THREE.PlaneGeometry(o.w, o.h)), this.own(new THREE.MeshBasicMaterial({ map: tex })), p.x, y, p.z, false);
    plane.rotation.y = yawOf(f);
    meshes.push(plane);
    return meshes;
  }
  /** A striped awning over a shop front, its top edge at `y`, sloping out `depth`. */
  awning(f: Face, u: number, y: number, w: number, o: { color: string; light?: string; depth?: number }) {
    const depth = o.depth ?? 0.6;
    const t = this.own(stripeTex(o.color, o.light ?? '#ffffff'));
    t.repeat.set(Math.max(1, Math.round(w)), 1);
    const p = onFace(f, u, depth / 2);
    const m = this.add(this.box(w, 0.05, depth), this.own_mat(0xffffff, { map: t }), p.x, y - depth * 0.2, p.z);
    m.rotation.set(0, yawOf(f), 0);
    m.rotateX(0.4);
    // A valance: the striped flap hanging off the front edge.
    const v = onFace(f, u, depth * 0.95);
    const flap = this.add(this.box(w, 0.12, 0.02), m.material as THREE.Material, v.x, y - depth * 0.4 - 0.06, v.z, false);
    flap.rotation.y = yawOf(f);
    return [m, flap];
  }
  /** A drainpipe down the wall from the roof (`h`) to the ground, with a shoe at the bottom. */
  drainpipe(f: Face, u: number, h: number) {
    const p = onFace(f, u, 0.06);
    const q = onFace(f, u, 0.12);
    return [
      this.add(this.cyl(0.045, h, 6), this.mat(0x5a5f66), p.x, h / 2, p.z),
      this.add(this.box(0.1, 0.06, 0.18), this.mat(0x5a5f66), q.x, 0.06, q.z, false),
      this.slab(f, u, h - 0.05, 0, 0.18, 0.1, 0.12, 0x4a4e54),
    ];
  }
  /** A light on the wall: a lamp box, a bare bulb, or a glowing box of any colour. */
  wallLight(f: Face, u: number, y: number, kind: 'lamp' | 'bulb' | number = 'lamp') {
    if (kind === 'bulb') return [this.slab(f, u, y, 0.02, 0.1, 0.1, 0.1, this.mat(0xffe7c2, 0xffd9a0, 1.5))];
    if (kind === 'lamp') return [this.slab(f, u, y, 0, 0.12, 0.12, 0.08, this.mat(0xffe7c2, 0xffd9a0, 1.2))];
    return [this.slab(f, u, y, 0, 0.12, 0.16, 0.12, this.mat(kind, kind, 2))];
  }
  /** A meter box / fuse box on the wall. */
  meterBox(f: Face, u: number, y: number) {
    return [this.slab(f, u, y, 0, 0.3, 0.4, 0.1, 0x6a6e74, true), this.slab(f, u, y + 0.05, 0.1, 0.12, 0.08, 0.01, 0x2a2a2e)];
  }

  // ---------- fences ----------
  private linkMats = new Map<number, THREE.Material>();
  private linkMat(high: number) {
    let m = this.linkMats.get(high);
    if (!m) {
      const t = this.own(chainLinkTex());
      t.repeat.set(4, Math.round(high * 4));
      m = this.own(new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      this.linkMats.set(high, m);
    }
    return m;
  }
  /** A see-through chain-link panel (1 wide), centred at (x, z), facing along x (or z: `alongZ`). For gates. */
  chainPanel(x: number, z: number, alongZ: boolean, high = 1.2, w = 1) {
    const m = this.add(this.own(new THREE.PlaneGeometry(w, high)), this.linkMat(high), x, high / 2 + 0.05, z, false);
    m.receiveShadow = false;
    if (alongZ) m.rotation.y = Math.PI / 2;
    return m;
  }
  /**
   * A fence from (x0, z0) to (x1, z1) (straight, along x or z), one panel per tile; `skip(i)` leaves panel i out (a
   * gate). Styles: chain-link (optionally with barbed wire), corrugated sheets, a half-high brick wall with a coping,
   * iron railings, wooden planks.
   */
  fence(x0: number, z0: number, x1: number, z1: number, style: FenceStyle, o: { high?: number; skip?: (i: number) => boolean; color?: number; rng?: () => number } = {}) {
    const alongZ = x0 === x1;
    const len = alongZ ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
    const sx = Math.sign(x1 - x0);
    const sz = Math.sign(z1 - z0);
    const n = Math.round(len);
    const rng = o.rng ?? Math.random;
    const out: THREE.Mesh[] = [];
    const high = o.high ?? (style === 'halfBrick' ? 0.75 : style === 'corrugated' ? 1.7 : style === 'railing' ? 1.0 : 1.2);
    const at = (k: number) => ({ x: x0 + (alongZ ? 0 : sx * k), z: z0 + (alongZ ? sz * k : 0) });
    const postAt = (k: number) => {
      const p = at(k);
      if (style === 'chain' || style === 'chainBarbed') out.push(this.add(this.cyl(0.03, high + 0.2, 6), this.mat(0x8a8f96), p.x, (high + 0.2) / 2, p.z));
      else if (style === 'railing') out.push(this.add(this.box(0.06, high + 0.1, 0.06), this.mat(o.color ?? 0x2a2c30), p.x, (high + 0.1) / 2, p.z));
      else if (style === 'halfBrick') out.push(this.add(this.box(0.26, high + 0.2, 0.26), this.brick(), p.x, (high + 0.2) / 2, p.z));
    };
    let lastPost = -1;
    for (let i = 0; i < n; i++) {
      if (o.skip?.(i)) continue;
      const c = at(i + 0.5);
      if (lastPost !== i) postAt(i);
      lastPost = i + 1;
      postAt(i + 1);
      const W = alongZ ? 0.06 : 1;
      const D = alongZ ? 1 : 0.06;
      if (style === 'chain' || style === 'chainBarbed') {
        out.push(this.chainPanel(c.x, c.z, alongZ, high));
        if (style === 'chainBarbed') out.push(this.add(this.box(alongZ ? 0.015 : 1, 0.015, alongZ ? 1 : 0.015), this.mat(0x6a6e74), c.x, high + 0.12, c.z, false));
      } else if (style === 'corrugated') {
        const m = this.add(this.box(W, high, D), i % 4 === 1 ? this.rib(0x7a4a2a, high) : this.rib(o.color ?? 0x9a9a92, high), c.x, high / 2, c.z);
        m.rotation.y = (rng() - 0.5) * 0.04;
        out.push(m);
      } else if (style === 'halfBrick') {
        out.push(this.add(this.box(alongZ ? 0.2 : 1, high, alongZ ? 1 : 0.2), this.brick(), c.x, high / 2, c.z));
        out.push(this.add(this.box(alongZ ? 0.26 : 1.04, 0.06, alongZ ? 1.04 : 0.26), this.mat(0xa8a296), c.x, high + 0.03, c.z, false));
      } else if (style === 'railing') {
        const m = this.mat(o.color ?? 0x2a2c30);
        for (const y of [0.15, high - 0.05]) out.push(this.add(this.box(alongZ ? 0.04 : 1, 0.04, alongZ ? 1 : 0.04), m, c.x, y, c.z, false));
        for (let k = 1; k < 5; k++) {
          const p = at(i + k / 5);
          out.push(this.add(this.box(0.025, high - 0.1, 0.025), m, p.x, high / 2, p.z, false));
        }
      } else {
        for (let k = 0; k < 4; k++) {
          const p = at(i + (k + 0.5) / 4);
          const plank = this.add(this.box(alongZ ? 0.05 : 0.23, high * (0.9 + rng() * 0.15), alongZ ? 0.23 : 0.05), this.mat(o.color ?? 0x6a4a2e), p.x, (high * 0.95) / 2, p.z);
          plank.rotation.y = (rng() - 0.5) * 0.06;
          out.push(plank);
        }
      }
    }
    return out;
  }
  private brickMat?: THREE.Material;
  private brick() {
    return (this.brickMat ??= this.textured('brick', 0x8a5040, 1, 0.5));
  }
  private ribMats = new Map<string, THREE.Material>();
  private rib(color: number, high: number) {
    const k = `${color}|${high}`;
    let m = this.ribMats.get(k);
    if (!m) {
      m = this.textured('rib', color, 1, high);
      this.ribMats.set(k, m);
    }
    return m;
  }
}

// ---------- merging the static city ----------
/** How the city's merge treats one mesh: walls of a building (fade), its props (hide), or fixed (never changes). */
export interface MergeGroup {
  walls: THREE.Mesh[];
  mats: THREE.Material[];
  props: THREE.Object3D[];
  /** v0.60: what's above the ground floor (the cut-away hides it): merged on its own, so it can still be hidden. */
  cut?: { upper: THREE.Object3D[] };
}
const CHUNK = 12;

/**
 * Merge the static meshes in `meshes` (all direct children of `scene`) into a few big ones, so the city costs a few
 * hundred draw calls, not thousands. Plain-coloured faceted pieces are merged regardless of colour (their colour is
 * painted on as vertex colours), textured or see-through ones per material. Fixed things are merged per 12×12-tile
 * area (so off-screen areas are skipped); a building's walls and its props each merge on their own and replace the
 * originals in its fade lists. `keep` are never merged (animated, tapped).
 */
export function mergeStatic(scene: THREE.Scene, meshes: THREE.Mesh[], groups: MergeGroup[], keep: Set<THREE.Object3D>, own: <T extends { dispose: () => void }>(x: T) => T) {
  const wallOf = new Map<THREE.Mesh, MergeGroup>();
  const propOf = new Map<THREE.Object3D, MergeGroup>();
  const upperOf = new Set<THREE.Object3D>();
  const fadeMats = new Set<THREE.Material>();
  for (const g of groups) {
    g.walls.forEach((m) => wallOf.set(m, g));
    g.props.forEach((m) => propOf.set(m, g));
    g.cut?.upper.forEach((m) => upperOf.add(m));
    g.mats.forEach((m) => fadeMats.add(m));
  }
  type Bucket = { meshes: THREE.Mesh[]; mat: THREE.Material; paint: boolean; shadow: boolean; recv: boolean; group?: MergeGroup; role: 'walls' | 'props' | 'fixed'; upper: boolean };
  const buckets = new Map<string, Bucket>();
  const vcMats = new Map<string, THREE.MeshLambertMaterial>();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    if (keep.has(m) || m.parent !== scene || Array.isArray(m.material) || !m.visible || m.children.length) continue;
    const mat = m.material as THREE.Material;
    if (!(mat instanceof THREE.MeshLambertMaterial || mat instanceof THREE.MeshBasicMaterial)) continue;
    const role: Bucket['role'] = wallOf.has(m) ? 'walls' : propOf.has(m) ? 'props' : 'fixed';
    const group = wallOf.get(m) ?? propOf.get(m);
    // Plain colours (no texture, solid, not a fading wall material) can share one material: paint them.
    const lam = mat as THREE.MeshLambertMaterial;
    const paint = mat instanceof THREE.MeshLambertMaterial && !lam.map && !lam.transparent && lam.side === THREE.FrontSide && !lam.polygonOffset && !fadeMats.has(mat) && role !== 'walls';
    m.getWorldPosition(v);
    const area = role === 'fixed' ? `${Math.floor(v.x / CHUNK)},${Math.floor(v.z / CHUNK)}` : '';
    const groupId = group ? groups.indexOf(group) : -1;
    const look = paint ? `paint|${lam.emissive.getHexString()}|${lam.emissiveIntensity}` : `mat|${mat.uuid}`;
    // (Above the ground floor: its own bucket, so the cut-away can hide it.)
    const k = `${role}|${upperOf.has(m) ? 'up' : ''}|${groupId}|${area}|${look}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(k);
    if (!b) {
      let bm: THREE.Material = mat;
      if (paint) {
        const mk = `${lam.emissive.getHexString()}|${lam.emissiveIntensity}`;
        let vm = vcMats.get(mk);
        if (!vm) {
          vm = own(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: lam.emissive.clone(), emissiveIntensity: lam.emissiveIntensity }));
          vcMats.set(mk, vm);
        }
        bm = vm;
      }
      b = { meshes: [], mat: bm, paint, shadow: m.castShadow, recv: m.receiveShadow, group, role, upper: upperOf.has(m) };
      buckets.set(k, b);
    }
    b.meshes.push(m);
  }
  const replaced = new Map<MergeGroup, { walls: THREE.Mesh[]; props: THREE.Mesh[]; upper: THREE.Mesh[]; gone: Set<THREE.Object3D> }>();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue; // nothing to gain
    const hasUv = !b.paint && !!(b.mat as THREE.MeshLambertMaterial).map;
    const geos: THREE.BufferGeometry[] = [];
    for (const m of b.meshes) {
      m.updateMatrixWorld(true);
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(hasUv && name === 'uv')) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (hasUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (b.paint) {
        const c = (m.material as THREE.MeshLambertMaterial).color;
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      g.morphAttributes = {};
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    own(merged);
    const one = new THREE.Mesh(merged, b.mat);
    one.castShadow = b.shadow;
    one.receiveShadow = b.recv;
    one.matrixAutoUpdate = false;
    scene.add(one);
    for (const m of b.meshes) scene.remove(m);
    if (b.group) {
      let r = replaced.get(b.group);
      if (!r) replaced.set(b.group, (r = { walls: [], props: [], upper: [], gone: new Set() }));
      (b.role === 'walls' ? r.walls : r.props).push(one);
      if (b.upper) r.upper.push(one);
      b.meshes.forEach((m) => r.gone.add(m));
    }
  }
  for (const [g, r] of replaced) {
    g.walls = [...g.walls.filter((m) => !r.gone.has(m)), ...r.walls];
    g.props = [...g.props.filter((m) => !r.gone.has(m)), ...r.props];
    if (g.cut) g.cut.upper = [...g.cut.upper.filter((m) => !r.gone.has(m)), ...r.upper];
  }
}
