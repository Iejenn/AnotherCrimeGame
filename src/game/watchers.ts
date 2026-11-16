// The NPCs who watch you (docs/design.md §4, "Getting caught"): the bartender and the parking lot guard.
// Their routines are FIXED SCHEDULES worked out from the game clock, not random on each phone. So:
//  - every player sees the same bartender turning his back at the same moment (multiplayer), and
//  - the game rules (and later the server) can check "was he looking during your attempt?" on their own,
//    instead of trusting the 3D view (anti-cheat, docs/design.md §11).
// The Street view only draws what these functions say. Same numbers → same answer, anywhere.

// ---------------- the bartender ----------------
/** His routine repeats in slots of this length: first he watches the room, then he turns his back. */
export const BAR_SLOT_MS = 8500;
/** How long he watches at the start of each slot (seconds, min–max); the rest of the slot his back is turned. */
export const BAR_WATCH: [number, number] = [3.5, 5];
/** Turning around takes this long: only after it does he see the room. */
export const BAR_TURN_MS = 600;
/** Which of the three spots along the back bar he polishes at (0–2). */
export const BAR_SPOTS = 3;

export interface BartenderState {
  watching: boolean;
  /** When the current phase started and ends (game time, ms). */
  since: number;
  until: number;
  /** Where along the back bar he stands while his back is turned (0–2). */
  spot: number;
  /** Fully turned towards the room. */
  sees: boolean;
}

/**
 * A tiny whole-number dice roll ("MINSTD"): the same in the browser and in Postgres (see
 * supabase/migrations/0003_online_play.sql, `uw_minstd`), with no rounding anywhere, so the server
 * and every player agree on the bartender to the millisecond.
 */
const M = 2147483647;
export const minstd = (x: number) => (x * 48271) % M;

export function bartenderAt(t: number): BartenderState {
  const k = Math.floor(t / BAR_SLOT_MS);
  const h1 = minstd((k % M) + 1);
  const h2 = minstd(h1);
  const watchMs = BAR_WATCH[0] * 1000 + Math.floor((h1 * (BAR_WATCH[1] - BAR_WATCH[0]) * 1000) / M);
  const spot = Math.floor((h2 * BAR_SPOTS) / M);
  const start = k * BAR_SLOT_MS;
  if (t - start < watchMs) return { watching: true, since: start, until: start + watchMs, spot, sees: t - start >= BAR_TURN_MS };
  return { watching: false, since: start + watchMs, until: start + BAR_SLOT_MS, spot, sees: false };
}

// ---------------- the parking lot guard ----------------
/** His flashlight: how far it reaches (tiles) and half its width (radians, so 0.75 ≈ 86° wide). */
export const GUARD_RANGE = 4.5;
export const GUARD_HALF = 0.75;
/** Walking speed (tiles/s) and how long he stops at each corner of his route to look around. */
export const GUARD_SPEED = 1.2;
export const GUARD_STOP_MS = 2500;
/**
 * His patrol route (tile coordinates, walked in straight lines, then back to the first one): across the north-east
 * lot below its meters and cars, down its east side, west along the south strip's middle lane past the pumps,
 * and back up. Checked in map.test.ts: every step is walkable and inside the patrol area. The server has the same
 * list (game.guard_at; scripts/spots-sql.ts prints it).
 */
export const GUARD_ROUTE: [number, number][] = [
  [46, 27], [50, 27], [50, 30], [42, 30], [46, 30],
];

interface Leg {
  from: [number, number];
  to: [number, number];
  walkMs: number;
  yaw: number;
}
const LEGS: Leg[] = GUARD_ROUTE.map((from, i) => {
  const to = GUARD_ROUTE[(i + 1) % GUARD_ROUTE.length];
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return { from, to, walkMs: (d / GUARD_SPEED) * 1000, yaw: Math.atan2(to[0] - from[0], to[1] - from[1]) };
});
/** One full round of his route, stops included. */
export const GUARD_LOOP_MS = LEGS.reduce((sum, l) => sum + l.walkMs + GUARD_STOP_MS, 0);

export interface GuardState {
  /** Where he is (tile units; the middle of a tile is +0.5). */
  x: number;
  z: number;
  /** Which way he (and his flashlight) faces, radians around the vertical; 0 = south. */
  yaw: number;
  moving: boolean;
}

export function guardAt(t: number): GuardState {
  let u = ((t % GUARD_LOOP_MS) + GUARD_LOOP_MS) % GUARD_LOOP_MS;
  for (let i = 0; i < LEGS.length; i++) {
    const leg = LEGS[i];
    if (u < leg.walkMs) {
      const f = u / leg.walkMs;
      return { x: leg.from[0] + 0.5 + (leg.to[0] - leg.from[0]) * f, z: leg.from[1] + 0.5 + (leg.to[1] - leg.from[1]) * f, yaw: leg.yaw, moving: true };
    }
    u -= leg.walkMs;
    if (u < GUARD_STOP_MS) {
      // Stopped at the end of this leg: he sweeps his flashlight left and right.
      return { x: leg.to[0] + 0.5, z: leg.to[1] + 0.5, yaw: leg.yaw + Math.sin((u / 1000) * 2.4) * 1.1, moving: false };
    }
    u -= GUARD_STOP_MS;
  }
  const last = LEGS[LEGS.length - 1];
  return { x: last.to[0] + 0.5, z: last.to[1] + 0.5, yaw: last.yaw, moving: false };
}

/** Smallest signed difference between two angles. */
export const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Is the point (px, pz) in the guard's flashlight beam? */
export function inBeam(g: GuardState, px: number, pz: number) {
  const dx = px - g.x;
  const dz = pz - g.z;
  return Math.hypot(dx, dz) <= GUARD_RANGE && Math.abs(angDiff(Math.atan2(dx, dz), g.yaw)) <= GUARD_HALF;
}

// ---------------- did someone see you? ----------------
/** How finely we check an attempt for being seen (ms). */
const STEP_MS = 100;

/**
 * The first moment between t0 and t1 that `watcher` sees you standing on tile `pos`, or null.
 * Used by the game rules on every tick of an attempt at the bar or the parking lot.
 */
export function firstSeen(watcher: 'bartender' | 'guard', pos: [number, number] | null | undefined, t0: number, t1: number): number | null {
  for (let t = t0; t <= t1; t += STEP_MS) {
    if (watcher === 'bartender' ? bartenderAt(t).sees : !!pos && inBeam(guardAt(t), pos[0] + 0.5, pos[1] + 0.5)) return t;
  }
  return null;
}
