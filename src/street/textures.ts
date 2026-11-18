// Water's ripples (v0.56): drawn here (no picture files), as grey detail multiplied with the water's own colour, drifting
// slowly (animateWater). (We tried ground textures too, from Kenney's Retro Urban Kit; a tester preferred the plain
// colours, so only the water has texture.)
import * as THREE from 'three';

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
