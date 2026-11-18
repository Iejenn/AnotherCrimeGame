// The island's coast (v0.55): a sandy beach round the city whose width wobbles (1–4 tiles), with round corners, then
// shallow water, then the open sea. Drawn by the floor kit (floor.ts) in the city, and flat on the maps (mapArt.ts).
// Only looks: the island you walk on is still the city's rectangle (the beach was never walkable).
import { H, W } from './map';
import type { Surface } from './floor';

/** How far out from the city the shallow water reaches (tiles); beyond it is the open sea. */
export const SHALLOWS = 9;

/** How wide the beach is at a point on the coast (tiles): a smooth wobble from the angle round the island. */
function beachWidth(x: number, y: number) {
  const a = Math.atan2(y - H / 2, x - W / 2);
  // Measured along the coast (about the island's size), so the wobble is the same size on every side.
  const p = a * ((W + H) / Math.PI);
  return 2.4 + Math.sin(p * 0.21) * 0.9 + Math.sin(p * 0.53 + 1.3) * 0.6 + Math.sin(p * 0.09 + 0.4) * 0.5;
}

/** What's on tile (x, y) outside the city: sand, water, or nothing (the city itself, or the open sea). */
export function coastAt(x: number, y: number): Surface | null {
  if (x >= 0 && y >= 0 && x < W && y < H) return null;
  // How far the tile's middle is from the city (round at the corners).
  const cx = x + 0.5, cy = y + 0.5;
  const dx = cx < 0 ? -cx : cx > W ? cx - W : 0;
  const dy = cy < 0 ? -cy : cy > H ? cy - H : 0;
  const d = Math.hypot(dx, dy);
  if (d <= Math.max(1, beachWidth(cx, cy))) return 'sand';
  // (The shallows end in a straight line, far out in the fog: a circle of tiles there would show as steps.)
  if (Math.max(dx, dy) <= SHALLOWS) return 'water';
  return null;
}
