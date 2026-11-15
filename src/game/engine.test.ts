import { describe, expect, it } from 'vitest';
import { crimeStats, hpAt, lootPrice, maxHp, newGame, sellLoot, skillLevel, startJob, stopJob, tick, totalLevel } from './engine';
import { ACTION_SECONDS, CRIME_BY_ID, CRIMES } from './data/crimes';
import { SKILL_IDS } from './data/skills';
import { MAX_LEVEL, levelFromXp, totalXpForLevel } from './xp';
import { mulberry32 } from './rng';
import { DEFAULT_LOOK } from '../street/character';

const T0 = Date.UTC(2026, 0, 1);
const fresh = (name = 'Tester') => structuredClone(newGame(name, DEFAULT_LOOK, T0));

describe('levels (design §3)', () => {
  it('go from 1 to 30 and match the design doc table', () => {
    expect(MAX_LEVEL).toBe(30);
    expect(totalXpForLevel(5)).toBe(5368);
    expect(totalXpForLevel(30)).toBe(984067);
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelFromXp(totalXpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(totalXpForLevel(l) - 1)).toBe(l - 1);
    }
  });
});

describe('street crimes (design §4)', () => {
  it('unlock every 5 levels, 1 to 30', () => {
    expect(CRIMES.map((c) => c.level)).toEqual([1, 5, 10, 15, 20, 25, 30]);
  });

  it('a pickpocket is 2 actions of 0.5s and pays 1–3 gold', () => {
    const c = CRIME_BY_ID.pick_wallet;
    expect(ACTION_SECONDS).toBe(0.5);
    expect(c.actions).toBe(2);
    expect(c.duration).toBe(1);
    expect([c.cashMin, c.cashMax]).toEqual([1, 3]);
  });

  it('each new crime pays more XP per hour than the one before', () => {
    const perHour = CRIMES.map((c) => (3600 / c.duration) * c.baseChance * c.xp);
    for (let i = 1; i < perHour.length; i++) expect(perHour[i]).toBeGreaterThan(perHour[i - 1]);
  });

  it('reaching 30 takes roughly 16 hours of active play', () => {
    let hours = 0;
    for (let i = 0; i < CRIMES.length - 1; i++) {
      const c = CRIMES[i];
      const xpPerHour = (3600 / c.duration) * (c.baseChance * c.xp + (1 - c.baseChance) * c.xp * 0.25);
      hours += (totalXpForLevel(CRIMES[i + 1].level) - totalXpForLevel(c.level)) / xpPerHour;
    }
    expect(hours).toBeGreaterThan(12);
    expect(hours).toBeLessThan(20);
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

describe('working a crime', () => {
  it('repeats an attempt every second until you stop', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    const { state, report } = tick(s, T0 + 10_000, mulberry32(1));
    expect(report.jobs).toBeGreaterThanOrEqual(9);
    expect(state.player.job).not.toBeNull();
    stopJob(state);
    expect(state.player.job).toBeNull();
    expect(skillLevel(state, 'street')).toBe(1);
  });

  it('does nothing when no attempt has finished', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    expect(tick(s, T0 + 500).state).toBe(s);
  });

  it('a bust pauses the job until you are out of jail', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    let i = 0;
    const rng = () => [0.99, 0][i++] ?? 0.5; // fail, then bust
    const { state, report } = tick(s, T0 + 1000, rng);
    expect(report.busts).toBe(1);
    expect(state.player.jailedUntil).toBe(T0 + 1000 + CRIME_BY_ID.pick_wallet.jail * 1000);
    expect(state.player.job?.startedAt).toBe(state.player.jailedUntil);
  });

  it('a failure costs 1 HP, and health comes back at 1 per 6 seconds', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    let i = 0;
    const rng = () => [0.99, 0.99][i++] ?? 0.5; // fail, no bust
    const { state, report } = tick(s, T0 + 1000, rng);
    expect(report.damage).toBe(1);
    expect(state.hp).toBe(9);
    expect(hpAt(state, T0 + 1000 + 6000)).toBe(10);
  });

  it('stops when you run out of health', () => {
    const s = fresh();
    startJob(s, 'pick_wallet', T0);
    s.hp = 1;
    let i = 0;
    const rng = () => [0.99, 0.99][i++] ?? 0.5;
    const { state } = tick(s, T0 + 1000, rng);
    expect(state.player.job).toBeNull();
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
    const { state } = tick(s, T0 + 60_000, mulberry32(3));
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
