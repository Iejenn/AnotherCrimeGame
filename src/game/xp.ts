// Levels 1–30 (see docs/design.md §3).
// Levels 1–10 are quick (150 successful pickpockets gets you to 10); after that each level
// gets steeper, so level 30 takes about 16 hours of play.

export const MAX_LEVEL = 30;
/** XP to go from level 1 to 2. */
const BASE_XP = 1000;
/** Up to level 10, each level needs 28.5% more XP than the one before. */
const EARLY_GROWTH = 1.285;
/** From level 10 on, each level needs 32.5% more. */
const LATE_GROWTH = 1.325;

/** XP needed to go from `level` to `level + 1` (before rounding). */
function stepXp(level: number) {
  if (level < 10) return BASE_XP * Math.pow(EARLY_GROWTH, level - 1);
  return BASE_XP * Math.pow(EARLY_GROWTH, 8) * Math.pow(LATE_GROWTH, level - 9);
}

/** XP_TABLE[L] = total XP needed to BE level L. */
const XP_TABLE: number[] = [0, 0];
for (let l = 1; l < MAX_LEVEL; l++) XP_TABLE.push(XP_TABLE[l] + Math.round(stepXp(l)));

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
