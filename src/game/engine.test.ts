import { describe, expect, it } from 'vitest';
import { CHANCE_PER_LEVEL, busyReason, cantEat, crimeStats, eat, giveItem, hpAt, itemPrice, maxHp, newGame, sellItem, startJob, tick, totalLevel } from './engine';
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
    expect(totalXpForLevel(2)).toBe(29);
    expect(totalXpForLevel(10)).toBe(449);
    expect(totalXpForLevel(30)).toBe(7533);
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

  it('a pickpocket is 4 ticks of 0.5s (2 seconds) and pays $1–3', () => {
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
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet).chance).toBeCloseTo(0.65);
    s.skills.street.xp = totalXpForLevel(11);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet).chance).toBeCloseTo(0.7);
    s.skills.street.xp = totalXpForLevel(30);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet).chance).toBeCloseTo(0.795);
  });

  it('a pickpocket earns about 5,000 XP/h if every attempt succeeds', () => {
    const c = CRIME_BY_ID.pick_wallet;
    expect((3600 / c.duration) * c.xp).toBe(5400);
  });

  it('each new crime earns about 30% more XP per hour (if every attempt succeeds)', () => {
    const perfect = CRIMES.map((c) => (3600 / c.duration) * c.xp);
    for (let i = 1; i < perfect.length; i++) {
      const bump = perfect[i] / perfect[i - 1];
      expect(bump).toBeGreaterThan(1.2);
      expect(bump).toBeLessThan(1.4);
    }
  });

  it('levels take a little longer each time, with a dip whenever a new crime unlocks', () => {
    const minutes: number[] = [];
    for (let l = 1; l < MAX_LEVEL; l++) {
      const best = Math.max(...CRIMES.filter((c) => c.level <= l).map((c) => pace(c, l).xpPerHour));
      minutes[l] = ((totalXpForLevel(l + 1) - totalXpForLevel(l)) / best) * 60;
    }
    const unlocks = new Set(CRIMES.map((c) => c.level));
    for (let l = 2; l < MAX_LEVEL; l++) {
      if (unlocks.has(l)) expect(minutes[l]).toBeLessThan(minutes[l - 1]); // new crime: quicker again
      else expect(minutes[l]).toBeGreaterThan(minutes[l - 1]); // otherwise: a bit longer each level
    }
    const total = minutes.slice(1).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(40); // about an hour to the current cap of 30
    expect(total).toBeLessThan(80);
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

  it('below 3 HP you cannot start', () => {
    const s = fresh();
    s.hp = 2;
    startJob(s, 'pick_wallet', T0);
    expect(s.player.job).toBeNull();
  });

  it('a higher level improves the odds', () => {
    const s = fresh();
    const low = crimeStats(s, CRIME_BY_ID.pick_wallet).chance;
    s.skills.street.xp = totalXpForLevel(6);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet).chance).toBeGreaterThan(low);
  });

  it('you cannot start a crime above your level', () => {
    const s = fresh();
    startJob(s, 'shoplift', T0);
    expect(s.player.job).toBeNull();
  });
});

describe('items: food, eating and selling', () => {
  it('food stacks in one slot', () => {
    const s = fresh();
    giveItem(s, 'candy_bar');
    giveItem(s, 'candy_bar');
    expect(s.inventory).toEqual({ candy_bar: 2 });
  });

  it('eating heals, takes 1 tick, and blocks crimes for that tick', () => {
    const s = fresh();
    s.hp = 5;
    s.hpAt = T0;
    giveItem(s, 'sandwich', 2);
    eat(s, 'sandwich', T0);
    expect(s.hp).toBe(7);
    expect(s.inventory.sandwich).toBe(1);
    expect(busyReason(s, T0 + 100)).toMatch(/eating/);
    expect(cantEat(s, 'sandwich', T0 + 100)).toMatch(/eating/);
    expect(busyReason(s, T0 + 500)).toBeNull();
  });

  it("you can't eat at full health", () => {
    const s = fresh();
    giveItem(s, 'candy_bar');
    expect(cantEat(s, 'candy_bar', T0)).toMatch(/full health/);
  });

  it('selling one item pays its value in dollars', () => {
    const s = fresh();
    giveItem(s, 'sandwich', 2);
    const before = s.cash;
    sellItem(s, 'sandwich');
    expect(s.inventory.sandwich).toBe(1);
    expect(s.cash).toBe(before + itemPrice('sandwich'));
  });

  it('a crime pays dollars only: no item drops', () => {
    const s = fresh();
    let state = s;
    for (let i = 0; i < 200; i++) {
      startJob(state, 'pick_wallet', T0 + i * 10_000);
      state = structuredClone(tick(state, T0 + i * 10_000 + 2000, mulberry32(i)).state);
      state.hp = 10;
      state.player.stunnedUntil = 0;
    }
    expect(state.inventory).toEqual({});
    expect(state.cash).toBeGreaterThan(10);
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

  it('old loot in a save is turned into dollars; heat and jail are dropped', async () => {
    const { migrate } = await import('./save');
    const old = { ...structuredClone(newGame("Vet", DEFAULT_LOOK, T0)), heat: 40, heatAt: T0 } as unknown as { inventory: Record<string, number>; player: Record<string, unknown>; cash: number };
    old.inventory = { sunglasses: 2, gold_chain: 1 };
    old.player.jailedUntil = T0 + 5000;
    const s = migrate(old)!;
    expect(s.inventory).toEqual({});
    expect(s.cash).toBe(10 + 2 * 3 + 60);
    expect('heat' in s).toBe(false);
    expect('jailedUntil' in s.player).toBe(false);
  });

  it('saves from before v0.7 are not loaded', async () => {
    const { migrate } = await import('./save');
    expect(migrate({ version: 1, skills: { petty: { xp: 10 } }, crew: [] })).toBeNull();
  });
});
