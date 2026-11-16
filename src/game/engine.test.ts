import { describe, expect, it } from 'vitest';
import { CHANCE_PER_LEVEL, busyReason, crimeStats, hpAt, lootPrice, maxHp, newGame, sellLoot, startJob, tick, totalLevel } from './engine';
import { STUN_SECONDS, TICK_SECONDS, CRIME_BY_ID, CRIMES } from './data/crimes';
import { SKILL_IDS } from './data/skills';
import { MAX_LEVEL, levelFromXp, totalXpForLevel } from './xp';
import { mulberry32 } from './rng';
import { DEFAULT_LOOK } from '../street/character';

const T0 = Date.UTC(2026, 0, 1);
const fresh = (name = 'Tester') => structuredClone(newGame(name, DEFAULT_LOOK, T0));

describe('levels (design §3)', () => {
  it('go from 1 to 30 and match the design doc table', () => {
    expect(MAX_LEVEL).toBe(30);
    expect(totalXpForLevel(10)).toBe(30010);
    expect(totalXpForLevel(30)).toBe(8430624);
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelFromXp(totalXpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(totalXpForLevel(l) - 1)).toBe(l - 1);
    }
  });
});

/** Expected seconds per attempt and XP per hour for a crime at a given level (one tap per attempt). */
function pace(c: (typeof CRIMES)[number], level: number) {
  const chance = Math.min(0.97, c.baseChance + Math.max(0, level - c.level) * CHANCE_PER_LEVEL);
  const secondsPerAttempt = c.duration + (1 - chance) * STUN_SECONDS; // a failure adds a 2s stun
  return { chance, xpPerHour: (3600 / secondsPerAttempt) * chance * c.xp }; // failures give no XP
}

describe('street crimes (design §4)', () => {
  it('unlock every 5 levels, 1 to 30', () => {
    expect(CRIMES.map((c) => c.level)).toEqual([1, 5, 10, 15, 20, 25, 30]);
  });

  it('a pickpocket is 4 ticks of 0.5s (2 seconds) and pays 1–3 gold', () => {
    const c = CRIME_BY_ID.pick_wallet;
    expect(TICK_SECONDS).toBe(0.5);
    expect(c.ticks).toBe(4);
    expect(c.duration).toBe(2);
    expect([c.cashMin, c.cashMax]).toEqual([1, 3]);
  });

  it('exactly 150 successful pickpockets take you from level 1 to 10', () => {
    const xp = CRIME_BY_ID.pick_wallet.xp;
    expect(levelFromXp(149 * xp)).toBe(9);
    expect(levelFromXp(150 * xp)).toBe(10);
  });

  it('every crime starts at 65% and gains 0.5% per level above its requirement', () => {
    const s = fresh();
    for (const c of CRIMES) expect(c.baseChance).toBe(0.65);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance).toBeCloseTo(0.65);
    s.skills.street.xp = totalXpForLevel(11);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance).toBeCloseTo(0.7);
    s.skills.street.xp = totalXpForLevel(30);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance).toBeCloseTo(0.795);
  });

  it('each new crime pays more XP per hour than the one before', () => {
    const perHour = CRIMES.map((c) => pace(c, c.level).xpPerHour);
    for (let i = 1; i < perHour.length; i++) expect(perHour[i]).toBeGreaterThan(perHour[i - 1]);
  });

  it('reaching 30 takes roughly 16 hours of active play (always using the best crime)', () => {
    let hours = 0;
    for (let l = 1; l < MAX_LEVEL; l++) {
      const best = Math.max(...CRIMES.filter((c) => c.level <= l).map((c) => pace(c, l).xpPerHour));
      hours += (totalXpForLevel(l + 1) - totalXpForLevel(l)) / best;
    }
    expect(hours).toBeGreaterThan(14);
    expect(hours).toBeLessThan(18);
  });
});

describe('a new character', () => {
  it('has 5 skills at level 1 and 10 health', () => {
    const s = fresh();
    expect(SKILL_IDS).toEqual(['street', 'melee', 'defense', 'gunfire', 'health']);
    expect(totalLevel(s)).toBe(5);
    expect(maxHp(s)).toBe(10);
  });
});

describe('working a crime (one tap = one attempt)', () => {
  it('one attempt takes 2 seconds and then stops', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    expect(tick(s, T0 + 1900).state).toBe(s); // not done yet
    const { state, report } = tick(s, T0 + 2000, mulberry32(1));
    expect(report.jobs).toBe(1);
    expect(state.player.job).toBeNull(); // no auto-repeat
    const again = tick(state, T0 + 10_000);
    expect(again.report.jobs).toBe(0);
  });

  it('a failure costs 1 HP and stuns you for 2 seconds', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    let i = 0;
    const rng = () => [0.99, 0.99][i++] ?? 0.5; // fail, no bust
    const { state, report } = tick(s, T0 + 2000, rng);
    expect(report.fails).toBe(1);
    expect(report.damage).toBe(1);
    expect(state.hp).toBe(9);
    expect(state.player.stunnedUntil).toBe(T0 + 2000 + STUN_SECONDS * 1000);
    expect(busyReason(state, T0 + 3000)).toMatch(/stunned/);
    startJob(state, 'pick_wallet', T0 + 3000);
    expect(state.player.job).toBeNull(); // can't start while stunned
    expect(busyReason(state, T0 + 4000)).toBeNull();
  });

  it('health comes back at 1 per minute', () => {
    const s = fresh();
    s.hp = 9;
    s.hpAt = T0;
    expect(hpAt(s, T0 + 30_000)).toBe(9.5);
    expect(hpAt(s, T0 + 60_000)).toBe(10);
  });

  it('a bust sends you to jail and you cannot work until you are out', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    let i = 0;
    const rng = () => [0.99, 0][i++] ?? 0.5; // fail, then bust
    const { state, report } = tick(s, T0 + 2000, rng);
    expect(report.busts).toBe(1);
    expect(state.player.jailedUntil).toBe(T0 + 2000 + CRIME_BY_ID.pick_wallet.jail * 1000);
    expect(busyReason(state, T0 + 3000)).toMatch(/cell/);
  });

  it('below 3 HP you cannot start', () => {
    const s = fresh();
    s.hp = 2;
    startJob(s, 'pick_wallet', T0);
    expect(s.player.job).toBeNull();
  });

  it('a higher level improves the odds', () => {
    const s = fresh();
    const low = crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance;
    s.skills.street.xp = totalXpForLevel(6);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance).toBeGreaterThan(low);
  });

  it('you cannot start a crime above your level', () => {
    const s = fresh();
    startJob(s, 'shoplift', T0);
    expect(s.player.job).toBeNull();
  });
});

describe('selling', () => {
  it('pays the item value, one at a time', () => {
    const s = fresh();
    s.inventory.sunglasses = 2;
    const before = s.cash;
    sellLoot(s, 'sunglasses');
    expect(s.inventory.sunglasses).toBe(1);
    expect(s.cash).toBe(before + lootPrice('sunglasses'));
  });
});

describe('saves', () => {
  it('codes are short and round-trip, and never carry a running job', async () => {
    const { exportSave, importSave } = await import('./save');
    const s = fresh('Iejen');
    startJob(s, 'pick_wallet', T0);
    const { state } = tick(s, T0 + 2000, mulberry32(3));
    const code = await exportSave(state);
    expect(code.length).toBeLessThan(1500);
    const back = await importSave(code);
    expect(back?.skills.street.xp).toBe(state.skills.street.xp);
    expect(back?.player.job).toBeNull();
  });

  it('saves from before v0.7 are not loaded', async () => {
    const { migrate } = await import('./save');
    expect(migrate({ version: 1, skills: { petty: { xp: 10 } }, crew: [] })).toBeNull();
  });
});
