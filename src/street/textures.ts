// Ground textures (v0.56): a little surface detail on the floor, the streets and the sidewalks, so they aren't flat
// colour. The pictures are Kenney's Retro Urban Kit ground textures (CC0, public/textures/ground/, 64 × 64): we use only
// their light and dark (grey "detail"), multiplied with our own colours, so the dusk palette stays ours. Water gets its
// own drawn ripples, which drift slowly (animateWater).
import * as THREE from 'three';

export type GroundTex = 'asphalt' | 'concrete' | 'dirt' | 'grass' | 'tiles' | 'rock';

/** A detail texture averages DETAIL (not 1: it can't go brighter than white), so colours under it are made brighter by
 *  DETAIL_GAIN to stay the same on average. */
const DETAIL = 0.8;
export const DETAIL_GAIN = 1 / DETAIL;

const cache = new Map<string, THREE.Texture>();
const waters: THREE.Texture[] = [];

/** A blank texture to fill in later (or for when there's no browser, like the tests). */
function blank(size: number) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; // (crisp texels, like the low-poly look; mipmaps when it's far off)
  return { c, t };
}

/**
 * A ground texture as grey detail (`strength`: how much of its contrast to keep, 0–1). It loads in the background: the
 * surface is plain until it has.
 */
export function groundTexture(name: GroundTex, strength = 0.6): THREE.Texture | null {
  const key = `${name}:${strength}`;
  if (cache.has(key)) return cache.get(key)!;
  const b = blank(64);
  if (!b) return null;
  const g = b.c.getContext('2d')!;
  g.fillStyle = `rgb(${Math.round(DETAIL * 255)}, ${Math.round(DETAIL * 255)}, ${Math.round(DETAIL * 255)})`;
  g.fillRect(0, 0, 64, 64);
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64);
    const px = d.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const mean = sum / (px.length / 4) || 1;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / mean;
      const v = Math.max(0, Math.min(255, Math.round(DETAIL * 255 * (1 + (lum - 1) * strength))));
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    b.t.needsUpdate = true;
  };
  img.src = `${import.meta.env.BASE_URL}textures/ground/${name}.png`;
  cache.set(key, b.t);
  return b.t;
}

/** Water: soft ripples (light streaks on darker water), as grey detail; it drifts (animateWater). `repeat`: how many
 *  times it tiles across a mesh whose UVs run 0–1 (1 for ones in world units). */
export function waterTexture(repeat = 1): THREE.Texture | null {
  let base = cache.get('water');
  if (!base) {
    const b = blank(64);
    if (!b) return null;
    const g = b.c.getContext('2d')!;
    g.fillStyle = `rgb(${Math.round(DETAIL * 230)}, ${Math.round(DETAIL * 230)}, ${Math.round(DETAIL * 230)})`;
    g.fillRect(0, 0, 64, 64);
    // Ripples: short curved light streaks scattered (wrapping round the edges, so it tiles), a few darker troughs.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const x = rnd() * 64, y = rnd() * 64, w = 6 + rnd() * 10;
      const light = i % 3 !== 0;
      g.strokeStyle = light ? `rgba(255, 255, 255, ${0.35 + rnd() * 0.3})` : 'rgba(0, 0, 0, 0.18)';
      g.lineWidth = light ? 1.2 : 2;
      for (const [ox, oy] of [[0, 0], [-64, 0], [64, 0], [0, -64], [0, 64]]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + w / 2, y + oy - 2.5, x + ox + w, y + oy);
        g.stroke();
      }
    }
    b.t.magFilter = THREE.LinearFilter;
    b.t.needsUpdate = true;
    base = b.t;
    cache.set('water', base);
  }
  const t = repeat === 1 ? base : base.clone();
  t.repeat.set(repeat, repeat);
  if (t !== base) t.needsUpdate = true;
  waters.push(t);
  return t;
}

/** Call every frame: the water's ripples drift (t in ms). */
export function animateWater(t: number) {
  for (const w of waters) w.offset.set((t / 60000) % 1, (t / 90000) % 1);
}
