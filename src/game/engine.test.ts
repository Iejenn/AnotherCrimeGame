import { describe, expect, it } from 'vitest';
import { catchUp, crimeStats, isUnlocked, newGame, skillLevel, startJob, totalLevel } from './engine';
import { CRIME_BY_ID, CRIMES } from './data/crimes';
import { levelFromXp, totalXpForLevel, xpToNext } from './xp';
import { mulberry32 } from './rng';

const T0 = Date.UTC(2026, 0, 1);

describe('xp curve', () => {
  it('level boundaries round-trip', () => {
    for (const l of [1, 2, 10, 50, 99]) {
      expect(levelFromXp(totalXpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(totalXpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(xpToNext(1)).toBeGreaterThan(0);
  });
});

describe('crimes data', () => {
  it('every crime has sane numbers', () => {
    for (const c of CRIMES) {
      expect(c.xp).toBeGreaterThan(0);
      expect(c.cashMax).toBeGreaterThan(c.cashMin);
      expect(c.flavor.length).toBeGreaterThan(0);
    }
  });
});

describe('engine', () => {
  it('starts with only Petty Theft unlocked', () => {
    const s = newGame('Tester', 'streetkid', T0);
    expect(isUnlocked(s, 'petty')).toBe(true);
    expect(isUnlocked(s, 'auto')).toBe(false);
    expect(totalLevel(s)).toBe(8);
  });

  it('resolves queued jobs while offline, in order', () => {
    let s = newGame('Tester', 'streetkid', T0);
    s = structuredClone(s);
    startJob(s, 'you', 'pick_wallet', 50, T0);
    expect(s.crew[0].job?.repsLeft).toBe(50);
    const { state, report } = catchUp(s, T0 + 3 * 3600_000, mulberry32(1));
    expect(report.jobs).toBe(50);
    expect(state.crew[0].job).toBeNull();
    expect(skillLevel(state, 'petty')).toBeGreaterThan(1);
    expect(state.stats.jobs).toBe(50);
  });

  it('does nothing when no job is due', () => {
    const s = newGame('Tester', 'streetkid', T0);
    const { state } = catchUp(s, T0 + 1000);
    expect(state).toBe(s);
  });

  it('a bust pauses the queue instead of wiping it', () => {
    const s = structuredClone(newGame('Tester', 'streetkid', T0));
    startJob(s, 'you', 'pick_wallet', 200, T0);
    // 1st roll fails the job (0.99), 2nd roll triggers the bust (0), the rest are neutral.
    let i = 0;
    const rng = () => [0.99, 0][i++] ?? 0.5;
    const { state, report } = catchUp(s, T0 + 10_500, rng);
    const me = state.crew[0];
    expect(report.busts).toBe(1);
    expect(me.jailedUntil).toBeGreaterThan(T0 + 10_000);
    expect(me.job?.repsLeft).toBe(199);
    expect(me.job?.startedAt).toBe(me.jailedUntil);
  });

  it('higher level improves odds', () => {
    const s = newGame('Tester', 'streetkid', T0);
    const crime = CRIME_BY_ID.pick_wallet;
    const low = crimeStats(s, crime, s.crew[0], T0).chance;
    s.skills.petty.xp = totalXpForLevel(20);
    const high = crimeStats(s, crime, s.crew[0], T0).chance;
    expect(high).toBeGreaterThan(low);
  });
});
