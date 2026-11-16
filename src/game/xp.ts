// One XP curve for every skill (docs/design.md §3). It's built for levels 1–100; the cap is 30 for now.
// Each level needs 13% more XP than the one before. How fast you level then depends on the method:
// better methods earn more XP per hour, but the levels keep getting a little longer.

/** Current level cap. The curve itself goes to CURVE_LEVELS. */
export const MAX_LEVEL = 30;
const CURVE_LEVELS = 100;
/** XP to go from level 1 to 2 (tuned so 150 successful pickpockets × 3 XP reach level 10). */
const BASE_XP = 29.13;
/** Each next level needs 13% more XP. */
const GROWTH = 1.13;

/** XP_TABLE[L] = total XP needed to BE level L. */
const XP_TABLE: number[] = [0, 0];
for (let l = 1; l < CURVE_LEVELS; l++) XP_TABLE.push(XP_TABLE[l] + Math.round(BASE_XP * Math.pow(GROWTH, l - 1)));

export function totalXpForLevel(level: number): number {
  return XP_TABLE[Math.min(Math.max(level, 1), MAX_LEVEL)];
}

export function levelFromXp(xp: number): number {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) if (xp >= XP_TABLE[l]) level = l;
  return level;
}

/** XP needed to go from `level` to the next one (0 at max level). */
export function xpToNext(level: number): number {
  return level >= MAX_LEVEL ? 0 : XP_TABLE[level + 1] - XP_TABLE[level];
}

/** Progress through the current level (pct = 1 at max level). */
export function levelProgress(xp: number): { level: number; into: number; needed: number; pct: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, pct: 1 };
  const into = xp - XP_TABLE[level];
  const needed = xpToNext(level);
  return { level, into, needed, pct: into / needed };
}
