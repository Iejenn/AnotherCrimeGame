// Levels 1–30 (see docs/design.md §3). Each level needs 20% more XP than the one before.

export const MAX_LEVEL = 30;
/** XP to go from level 1 to 2. */
const BASE_XP = 1000;
/** How much more each next level needs. */
const GROWTH = 1.2;

/** XP_TABLE[L] = total XP needed to BE level L. */
const XP_TABLE: number[] = [0, 0];
for (let l = 1; l < MAX_LEVEL; l++) XP_TABLE.push(XP_TABLE[l] + Math.round(BASE_XP * Math.pow(GROWTH, l - 1)));

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
