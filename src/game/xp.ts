// XP curve + economy curves. Everything that "scales with level" lives here,
// so balancing means tweaking a handful of numbers in one file.

export const MAX_LEVEL = 99;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.6) + 25);
}

// Pre-computed cumulative table: XP_TABLE[L] = total XP required to BE level L.
const XP_TABLE: number[] = [0, 0];
for (let l = 1; l < MAX_LEVEL; l++) XP_TABLE[l + 1] = XP_TABLE[l] + xpToNext(l);

export function totalXpForLevel(level: number): number {
  return XP_TABLE[Math.min(Math.max(level, 1), MAX_LEVEL)];
}

export function levelFromXp(xp: number): number {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (XP_TABLE[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 0..1 progress through the current level (1 at max level). */
export function levelProgress(xp: number): { level: number; into: number; needed: number; pct: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, pct: 1 };
  const into = xp - XP_TABLE[level];
  const needed = xpToNext(level);
  return { level, into, needed, pct: into / needed };
}

/**
 * How many "levels per hour" a crime at this level should give.
 * Level 2 takes ~3 min, level 30 ~45 min, level 90 ~2.5h: the classic idle-RPG feel.
 */
function levelsPerHour(level: number): number {
  return 40 / (1 + level);
}

/** XP for one completion of a crime that requires `level` and takes `durationSec`. */
export function crimeXp(level: number, durationSec: number): number {
  return Math.max(1, Math.round(xpToNext(level) * levelsPerHour(level) * (durationSec / 3600)));
}

/** Expected cash per hour of a crime at this level (before skill multiplier). */
export function cashPerHour(level: number): number {
  return 1500 * Math.pow(1.085, level - 1);
}
