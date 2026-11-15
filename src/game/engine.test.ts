import { describe, expect, it } from 'vitest';
import { catchUp, crimeStats, lootPrice, maxHp, newGame, sellLoot, skillLevel, startJob, totalLevel } from './engine';
import { CRIME_BY_ID, CRIMES } from './data/crimes';
import { SKILL_IDS } from './data/skills';
import { MAX_LEVEL, levelFromXp, totalXpForLevel } from './xp';
import { mulberry32 } from './rng';
import { DEFAULT_LOOK } from '../street/character';

const T0 = Date.UTC(2026, 0, 1);
const fresh = (name = 'Tester') => structuredClone(newGame(name, DEFAULT_LOOK, T0));

describe('levels', () => {
  it('go from 1 to 10 and round-trip', () => {
    expect(MAX_LEVEL).toBe(10);
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelFromXp(totalXpForLevel(l))).toBe(l);
      if (l > 1) expect(levelFromXp(totalXpForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelFromXp(1e9)).toBe(10);
  });
});

describe('crimes', () => {
  it('have sane numbers and fit inside the level cap', () => {
    for (const c of CRIMES) {
      expect(c.xp).toBeGreaterThan(0);
      expect(c.cashMax).toBeGreaterThanOrEqual(c.cashMin);
      expect(c.level).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it('a level 1 pickpocket pays 1–3 gold', () => {
    expect(CRIME_BY_ID.pick_wallet.cashMin).toBe(1);
    expect(CRIME_BY_ID.pick_wallet.cashMax).toBe(3);
  });
});

describe('new character', () => {
  it('has 5 skills, all at level 1, and 10 health', () => {
    const s = fresh();
    expect(SKILL_IDS).toEqual(['street', 'melee', 'defense', 'gunfire', 'health']);
    expect(totalLevel(s)).toBe(5);
    expect(maxHp(s)).toBe(10);
    expect(s.look).toEqual(DEFAULT_LOOK);
  });
});

describe('jobs', () => {
  it('resolve while offline, in order', () => {
    const s = fresh();
    startJob(s, 'you', 'pick_wallet', 30, T0);
    const { state, report } = catchUp(s, T0 + 3600_000, mulberry32(1));
    expect(report.jobs).toBeGreaterThan(0);
    expect(skillLevel(state, 'street')).toBeGreaterThan(1);
  });

  it('do nothing when nothing is due', () => {
    const s = fresh();
    expect(catchUp(s, T0 + 1000).state).toBe(s);
  });

  it('a bust pauses the job instead of cancelling it', () => {
    const s = fresh();
    startJob(s, 'you', 'pick_wallet', 200, T0);
    let i = 0;
    const rng = () => [0.99, 0][i++] ?? 0.5; // fail, then bust
    const { state, report } = catchUp(s, T0 + 6_500, rng);
    const me = state.crew[0];
    expect(report.busts).toBe(1);
    expect(me.jailedUntil).toBeGreaterThan(T0 + 6_000);
    expect(me.job?.repsLeft).toBe(199);
    expect(me.job?.startedAt).toBe(me.jailedUntil);
  });

  it('a failed job costs a little health', () => {
    const s = fresh();
    startJob(s, 'you', 'pick_wallet', 10, T0);
    let i = 0;
    const rng = () => [0.99, 0.99][i++] ?? 0.5; // fail, no bust
    const { state, report } = catchUp(s, T0 + 6_500, rng);
    expect(report.damage).toBe(1);
    expect(state.hp).toBe(9);
  });

  it('at 0 health you stop working', () => {
    const s = fresh();
    startJob(s, 'you', 'pick_wallet', 10, T0);
    s.hp = 1;
    let i = 0;
    const rng = () => [0.99, 0.99][i++] ?? 0.5;
    const { state } = catchUp(s, T0 + 6_500, rng);
    expect(state.hp).toBeLessThan(1);
    expect(state.crew[0].job).toBeNull();
  });

  it('higher level improves odds', () => {
    const s = fresh();
    const low = crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance;
    s.skills.street.xp = totalXpForLevel(6);
    expect(crimeStats(s, CRIME_BY_ID.pick_wallet, T0).chance).toBeGreaterThan(low);
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
    sellLoot(s, 'sunglasses');
    expect('sunglasses' in s.inventory).toBe(false);
  });
});

describe('saves', () => {
  it('codes are short and round-trip', async () => {
    const { exportSave, importSave } = await import('./save');
    const s = fresh('Iejen');
    startJob(s, 'you', 'pick_wallet', 100, T0);
    const { state } = catchUp(s, T0 + 3600_000, mulberry32(3));
    const code = await exportSave(state);
    expect(code.length).toBeLessThan(1500);
    const back = await importSave(code);
    expect(back?.skills.street.xp).toBe(state.skills.street.xp);
    expect(back?.look).toEqual(DEFAULT_LOOK);
  });

  it('saves from before v0.7 are not loaded (new skill set)', async () => {
    const { migrate } = await import('./save');
    expect(migrate({ version: 1, skills: { petty: { xp: 10 } }, crew: [] })).toBeNull();
  });
});
