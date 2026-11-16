import { describe, expect, it } from 'vitest';
import { GRAVE_MINUTES, busyReason, cantEat, collectGrave, crimeStats, eat, emptyFor, giveItem, hpAt, itemPrice, maxHp, newGame, sellItem, spotted, startJob, tick, totalLevel } from './engine';
import { CATCH_SECONDS, TICK_SECONDS, CRIME_BY_ID, CRIMES } from './data/crimes';
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

describe('street crimes v2 (design §4)', () => {
  it('match the design table: level, odds, time, reward, fail damage and stun', () => {
    const row = (id: string) => {
      const c = CRIME_BY_ID[id];
      return [c.level, c.baseChance, c.duration, c.cashMin, c.cashMax, c.items ?? [], c.failDamage, c.failStun, c.catcher ?? null, c.refill ?? 0];
    };
    expect(CRIMES.map((c) => c.id)).toEqual(['pick_tourist', 'gym_bags', 'candy_store', 'pick_drunk', 'parking_meter', 'gas_station', 'steal_car']);
    expect(row('pick_tourist')).toEqual([1, 0.65, 2, 1, 3, [], 1, 2, null, 0]);
    expect(row('gym_bags')).toEqual([5, 0.55, 2, 2, 6, [], 1, 2, null, 0]);
    expect(row('candy_store')).toEqual([10, 0.4, 2, 0, 0, ['candy_bar'], 1, 2, 'clerk', 10]);
    expect(row('pick_drunk')).toEqual([15, 1, 3, 10, 20, [], 2, 3, 'bartender', 0]);
    expect(row('parking_meter')).toEqual([20, 1, 3, 15, 30, [], 3, 4, 'guard', 15]);
    expect(row('gas_station')).toEqual([25, 0.4, 2, 0, 0, ['sandwich', 'candy_bar'], 2, 2, 'clerk', 10]);
    expect(row('steal_car')).toEqual([30, 0.35, 3, 30, 60, [], 3, 4, 'guard', 0]);
    expect(TICK_SECONDS).toBe(0.5);
  });

  it('odds rise 0.5% per level above the requirement; 100% crimes stay at 100%', () => {
    const s = fresh();
    expect(crimeStats(s, CRIME_BY_ID.pick_tourist).chance).toBeCloseTo(0.65);
    s.skills.street.xp = totalXpForLevel(11);
    expect(crimeStats(s, CRIME_BY_ID.pick_tourist).chance).toBeCloseTo(0.7);
    s.skills.street.xp = totalXpForLevel(30);
    expect(crimeStats(s, CRIME_BY_ID.pick_tourist).chance).toBeCloseTo(0.795);
    expect(crimeStats(s, CRIME_BY_ID.pick_drunk).chance).toBe(1);
  });

  it('150 successful pickpockets take you from level 1 to 10', () => {
    const xp = CRIME_BY_ID.pick_tourist.xp;
    expect(levelFromXp(149 * xp)).toBe(9);
    expect(levelFromXp(150 * xp)).toBe(10);
    expect((3600 / CRIME_BY_ID.pick_tourist.duration) * xp).toBe(5400);
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
    startJob(s, 'pick_tourist', T0);
    expect(tick(s, T0 + 1900).state).toBe(s); // not done yet
    const { state, report } = tick(s, T0 + 2000, mulberry32(1));
    expect(report.jobs).toBe(1);
    expect(state.player.job).toBeNull(); // no auto-repeat
    const again = tick(state, T0 + 10_000);
    expect(again.report.jobs).toBe(0);
  });

  it('a failure (no one around) costs 1 HP and stuns you for 2 seconds', () => {
    const s = fresh();
    startJob(s, 'pick_tourist', T0);
    let i = 0;
    const rng = () => [0.99, 0.99][i++] ?? 0.5; // fail, no bust
    const { state, report } = tick(s, T0 + 2000, rng);
    expect(report.fails).toBe(1);
    expect(report.damage).toBe(1);
    expect(state.hp).toBe(9);
    expect(state.player.stunnedUntil).toBe(T0 + 2000 + 2000);
    expect(busyReason(state, T0 + 3000)).toMatch(/stunned/);
    startJob(state, 'pick_tourist', T0 + 3000);
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
    startJob(s, 'pick_tourist', T0);
    expect(s.player.job).toBeNull();
  });

  it('a higher level improves the odds', () => {
    const s = fresh();
    const low = crimeStats(s, CRIME_BY_ID.pick_tourist).chance;
    s.skills.street.xp = totalXpForLevel(6);
    expect(crimeStats(s, CRIME_BY_ID.pick_tourist).chance).toBeGreaterThan(low);
  });

  it('you cannot start a crime above your level', () => {
    const s = fresh();
    startJob(s, 'gym_bags', T0);
    expect(s.player.job).toBeNull();
  });
});

describe('getting caught (design §4)', () => {
  const at = (level: number) => {
    const s = fresh();
    s.skills.street.xp = totalXpForLevel(level);
    s.hp = 20;
    s.skills.health.xp = totalXpForLevel(6); // 20 max HP
    return s;
  };

  it('a failed shoplift: the clerk yells, walks over, and his hit lands a moment later', () => {
    const s = at(10);
    startJob(s, 'candy_store', T0, 'shelf_a');
    const { state, report } = tick(s, T0 + 2000, () => 0.99); // fail
    expect(report.fails).toBe(1);
    expect(report.damage).toBe(0); // not hit yet
    expect(state.player.caught).toEqual({ crimeId: 'candy_store', at: T0 + 2000 });
    expect(busyReason(state, T0 + 2100)).toMatch(/caught/);
    const hit = tick(state, T0 + 2000 + CATCH_SECONDS * 1000);
    expect(hit.report.damage).toBe(1);
    expect(hit.report.hit).toBe(true);
    expect(hit.state.player.caught).toBeNull();
    expect(hit.state.player.stunnedUntil).toBe(T0 + 2000 + CATCH_SECONDS * 1000 + 2000);
  });

  it('a successful shoplift gives food and empties that shelf for 10 seconds', () => {
    const s = at(10);
    startJob(s, 'candy_store', T0, 'shelf_a');
    const { state, report } = tick(s, T0 + 2000, () => 0.1); // success, no big score
    expect(state.inventory).toEqual({ candy_bar: 1 });
    expect(report.items).toEqual({ candy_bar: 1 });
    expect(emptyFor(state, 'shelf_a', T0 + 2000)).toBe(10);
    startJob(state, 'candy_store', T0 + 3000, 'shelf_a');
    expect(state.player.job).toBeNull(); // empty
    startJob(state, 'candy_store', T0 + 3000, 'shelf_b');
    expect(state.player.job?.spotId).toBe('shelf_b');
    expect(emptyFor(state, 'shelf_a', T0 + 12_000)).toBe(0);
  });

  it('the bartender seeing you: the attempt is lost, then -2 HP and a 3s stun', () => {
    const s = at(15);
    startJob(s, 'pick_drunk', T0, 'drunk_0');
    spotted(s, T0 + 1000);
    expect(s.player.job).toBeNull();
    expect(s.stats.fails).toBe(1);
    const { state, report } = tick(s, T0 + 1000 + CATCH_SECONDS * 1000);
    expect(report.damage).toBe(2);
    expect(state.player.stunnedUntil).toBe(T0 + 1000 + CATCH_SECONDS * 1000 + 3000);
  });

  it('unseen, the drunks and the meters always pay', () => {
    const s = at(20);
    let state = s;
    for (let i = 0; i < 30; i++) {
      startJob(state, 'parking_meter', T0 + i * 20_000, `meter_${i % 5}`);
      state = tick(state, T0 + i * 20_000 + 3000, mulberry32(i)).state;
    }
    expect(state.stats.fails).toBe(0);
    expect(state.cash).toBeGreaterThanOrEqual(10 + 30 * 15);
  });
});

describe('dying and your grave', () => {
  const dying = () => {
    const s = fresh();
    s.skills.street.xp = totalXpForLevel(20);
    s.hp = 3;
    s.cash = 40;
    giveItem(s, 'sandwich', 2);
    s.player.pos = [38, 23];
    startJob(s, 'parking_meter', T0, 'meter_0');
    spotted(s, T0 + 1000);
    s.hp = 2; // (health regenerates a little meanwhile; make sure the hit is deadly)
    s.hpAt = T0 + 1000;
    return tick(s, T0 + 1000 + CATCH_SECONDS * 1000); // the guard's hit (-3 HP) lands
  };

  it('at 0 HP you drop everything in a grave where you stood, and wake up at the start with half health', () => {
    const { state, report } = dying();
    expect(report.died).toBe(true);
    expect(state.grave).toMatchObject({ x: 38, y: 23, cash: 40, items: { sandwich: 2 } });
    expect(state.cash).toBe(0);
    expect(state.inventory).toEqual({});
    expect(state.player.pos).toBeNull();
    expect(state.hp).toBe(5);
    expect(state.stats.deaths).toBe(1);
    expect(busyReason(state, T0 + 3000)).toBeNull(); // no stun after respawning
  });

  it('collecting the grave gives it all back', () => {
    const { state } = dying();
    collectGrave(state, T0 + 60_000);
    expect(state.cash).toBe(40);
    expect(state.inventory).toEqual({ sandwich: 2 });
    expect(state.grave).toBeNull();
  });

  it(`the grave crumbles after ${GRAVE_MINUTES} minutes and the stuff is gone`, () => {
    const { state } = dying();
    const later = tick(state, state.grave!.expiresAt);
    expect(later.state.grave).toBeNull();
    collectGrave(later.state, state.grave!.expiresAt + 1);
    expect(later.state.cash).toBe(0);
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
      startJob(state, 'pick_tourist', T0 + i * 10_000);
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
    startJob(s, 'pick_tourist', T0);
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
