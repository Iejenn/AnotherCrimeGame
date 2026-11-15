// Levels 1–10 for now. Start small, grow later: to raise the cap, add numbers to XP_TABLE.

/** Total XP needed to BE each level. XP_TABLE[1] = 0 (level 1), XP_TABLE[10] = 2500 (level 10). */
const XP_TABLE = [0, 0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2500];
export const MAX_LEVEL = XP_TABLE.length - 1;

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
