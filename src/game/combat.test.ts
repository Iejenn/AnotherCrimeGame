import { describe, expect, it } from 'vitest';
import { attackRoll, combatLevel, defenceRoll, hitChance, maxHit, UNARMED, weaponStats } from './combat';
import { ENEMIES, ENEMY_KINDS, PIGEON_FLY_MS, PIGEON_HOP_MS, PIGEON_TILES, pigeonAt } from './enemies';
import { ITEM_BY_ID, SHOPS } from './data/items';
import { itemPrice, maxHp, newGame } from './engine';
import { DEFAULT_LOOK } from '../street/character';
import { FIXTURES, PARK, inRect } from '../street/map';

describe('combat maths (design §12)', () => {
  it('level 1 fists vs a Pigeon hit about 55% of the time; the Pigeon hits you about 50%', () => {
    const p = ENEMY_KINDS.pigeon;
    expect(hitChance(attackRoll(1, 0), defenceRoll(p.defense, p.defenceBonus))).toBeCloseTo(0.555, 2);
    expect(hitChance(attackRoll(p.attack, 0), defenceRoll(1, 0))).toBeCloseTo(0.499, 2);
  });

  it('more levels hit more often', () => {
    const d = defenceRoll(1, 0);
    expect(hitChance(attackRoll(11, 0), d)).toBeGreaterThan(0.7);
    expect(hitChance(attackRoll(30, 0), d)).toBeGreaterThan(hitChance(attackRoll(11, 0), d));
  });

  it('max hit: fists 1 at level 1, 2 at 9, 4 at 30; the tin weapons (§14)', () => {
    expect([maxHit(1, 1), maxHit(1, 8), maxHit(1, 9), maxHit(1, 17), maxHit(1, 30)]).toEqual([1, 1, 2, 3, 4]);
    const k = ITEM_BY_ID.tin_knuckles.gear!;
    expect([k.damage, k.speed, k.needs?.level]).toEqual([2, 3, 1]);
    expect(k.speed).toBe(UNARMED.speed);
    expect(k.defence ?? 0).toBe(0);
    // Sorted by kind, then metal; 30 × the metal in them.
    expect(SHOPS.weapons).toEqual([
      { item: 'tin_knuckles', price: 150, amount: 1 }, { item: 'copper_knuckles', price: 300, amount: 1 },
      { item: 'tin_bat', price: 300, amount: 1 }, { item: 'copper_bat', price: 600, amount: 1 },
      { item: 'tin_knife', price: 150, amount: 1 }, { item: 'copper_knife', price: 300, amount: 1 },
      // v0.51: throwing knives in packs of 10 at one sheet's price.
      { item: 'tin_throwing_knife', price: 150, amount: 10 }, { item: 'copper_throwing_knife', price: 300, amount: 10 },
    ]);
    // The bat: max hit 5, a swing every 3 s; the knife: max hit 1, every 1 s. All tin at level 1.
    const bat = ITEM_BY_ID.tin_bat.gear!;
    expect([bat.damage, bat.speed, bat.needs?.level, bat.anim]).toEqual([5, 6, 1, 'swing']);
    const knife = ITEM_BY_ID.tin_knife.gear!;
    expect([knife.damage, knife.speed, knife.needs?.level, knife.anim]).toEqual([1, 2, 1, 'stab']);
    // Values follow the sheets ($5 a tin sheet); selling pays a quarter, rounded down, at least $1.
    expect([ITEM_BY_ID.tin_knuckles.value, ITEM_BY_ID.tin_bat.value, ITEM_BY_ID.tin_vest.value]).toEqual([5, 10, 15]);
    expect([itemPrice('tin_salvage'), itemPrice('tin_bat'), itemPrice('tin_vest')]).toEqual([1, 2, 3]);
    expect([itemPrice('candy_bar'), itemPrice('sandwich'), itemPrice('raw_bird_meat')]).toEqual([1, 2, 1]);
  });

  it('throwing knives (v0.51): Marksman, 6 tiles, stack in one slot, 5 from a sheet at the metal\'s first level, not worth selling', async () => {
    const { CRAFT_BY_ID } = await import('./data/metals');
    const { slotsUsed } = await import('./engine');
    const t = ITEM_BY_ID.tin_throwing_knife;
    expect([t.gear!.slot, t.gear!.damage, t.gear!.speed, t.gear!.range, t.gear!.needs, t.gear!.anim, t.stack, t.value]).toEqual(['marksman', 1, 3, 6, { skill: 'marksman', level: 1 }, 'throw', true, 1]);
    expect(ITEM_BY_ID.copper_throwing_knife.gear!.damage).toBe(2);
    expect(ITEM_BY_ID.copper_throwing_knife.gear!.needs).toEqual({ skill: 'marksman', level: 11 });
    expect(CRAFT_BY_ID.tin_throwing_knife).toMatchObject({ level: 1, xp: 3, amount: 5, inputs: { tin_sheet: 1 } });
    expect(CRAFT_BY_ID.copper_throwing_knife).toMatchObject({ level: 11, amount: 5 });
    const s = newGame('T', DEFAULT_LOOK, 0);
    s.inventory = { tin_throwing_knife: 40, tin_sheet: 2 };
    expect(slotsUsed(s)).toBe(1 + 1 + 2);
    // Up to 1,000 a slot.
    s.inventory = { tin_throwing_knife: 2500 };
    expect(slotsUsed(s)).toBe(1 + 3);
    // Marksman style throws only with knives in the Marksman slot.
    const { rangedWeapon } = await import('./combat');
    s.equipment = { weapon: 'tin_bat', marksman: 'tin_throwing_knife' };
    s.marksmanCount = 12;
    s.fightStyle = 'melee';
    expect(rangedWeapon(s)).toBeNull();
    s.fightStyle = 'marksman';
    expect(rangedWeapon(s)).toEqual({ id: 'tin_throwing_knife', range: 6, left: 12 });
    s.marksmanCount = 0;
    expect(rangedWeapon(s)).toBeNull();
    // Selling a sheet's worth of knives must not beat selling the sheet: a knife sells for nothing.
    expect(itemPrice('tin_throwing_knife')).toBe(0);
  });

  it('tin armour: +2 helmet, +3 leg guards, +4 vest, Defense 1; it adds up in your defence roll', async () => {
    const { armourBonus } = await import('./combat');
    expect(['tin_helmet', 'tin_legs', 'tin_vest'].map((id) => [ITEM_BY_ID[id].gear!.slot, ITEM_BY_ID[id].gear!.defence, ITEM_BY_ID[id].gear!.needs?.skill])).toEqual([
      ['head', 2, 'defense'], ['legs', 3, 'defense'], ['body', 4, 'defense'],
    ]);
    const s = newGame('T', DEFAULT_LOOK, 0);
    expect(armourBonus(s)).toBe(0);
    s.equipment = { head: 'tin_helmet', body: 'tin_vest', legs: 'tin_legs', weapon: 'tin_bat' };
    expect(armourBonus(s)).toBe(9);
    // A thug hits a Defense-1 player in full tin less often than without it.
    const t = ENEMY_KINDS.thug;
    expect(hitChance(attackRoll(t.attack, 0), defenceRoll(1, 9))).toBeLessThan(hitChance(attackRoll(t.attack, 0), defenceRoll(1, 0)));
  });

  it('tinkering recipes unlock one per level: sheet 1, knuckles 2, bat 3, knife 4, helmet 6, legs 7, vest 8', async () => {
    const { CRAFTS } = await import('./data/metals');
    expect(CRAFTS.map((c) => [c.id, c.level, Object.values(c.inputs)[0], c.xp, c.station])).toEqual([
      ['tin_sheet', 1, 1, 1, 'press'], ['tin_knuckles', 2, 1, 3, 'bench'], ['tin_bat', 3, 2, 6, 'bench'], ['tin_knife', 4, 1, 3, 'bench'],
      ['tin_throwing_knife', 1, 1, 3, 'bench'], // v0.51: 5 from a sheet, from Tinkering 1
      ['tin_helmet', 6, 1, 3, 'bench'], ['tin_legs', 7, 2, 6, 'bench'], ['tin_vest', 8, 3, 9, 'bench'],
      // Copper (v0.43): the same ladder from level 11, twice the XP.
      ['copper_sheet', 11, 1, 2, 'press'], ['copper_knuckles', 12, 1, 6, 'bench'], ['copper_bat', 13, 2, 12, 'bench'], ['copper_knife', 14, 1, 6, 'bench'],
      ['copper_throwing_knife', 11, 1, 6, 'bench'],
      ['copper_helmet', 16, 1, 6, 'bench'], ['copper_legs', 17, 2, 12, 'bench'], ['copper_vest', 18, 3, 18, 'bench'],
    ]);
  });

  it('thugs: level 5, 10 HP, a stab every 1 s; they stroll around the Yard; the knife: Melee 5, +1 damage, fast', async () => {
    const { thugAt, THUG_TILES } = await import('./enemies');
    const { YARD } = await import('../street/map');
    const t = ENEMY_KINDS.thug;
    expect([t.level, t.hp, t.attack, t.defense, t.maxHit, t.speed, t.respawn, t.aggressive]).toEqual([5, 10, 5, 5, 2, 2, 30, false]);
    for (let i = 0; i < 3; i++)
      for (let ms = 0; ms < 60000; ms += 777) {
        const p = thugAt(i, 1.8e12 + ms); // real clock times (the schedule counts from 1970)
        expect(inRect(YARD, Math.floor(p.x), Math.floor(p.z))).toBe(true);
      }
    expect(THUG_TILES.length).toBe(21);
    expect(ENEMY_KINDS.thug.loot.find((d) => d.item === 'tin_knife')?.chance).toBe(0.05);
  });

  it("the game's copy of the loot tables (shown in the Skills tab) matches the server's public.loot", () => {
    // public.loot on the server (checked there on 2026-11-16): pigeon raw_bird_meat 1; thug cash 0.2 ($5–10), knife 0.05;
    // rat raw_rat_meat 1 (0019_sewer); the knife became the tin knife (0023).
    const rows = Object.values(ENEMY_KINDS).flatMap((k) => k.loot.map((d) => `${k.id}:${d.item}@${d.chance}:${d.min}-${d.max}`));
    // v0.43 (0028): the guard dogs, giant rats and bikers.
    expect(rows.sort()).toEqual([
      'biker:cash@0.33:20-50', 'biker:copper_knife@0.025:1-1', 'biker:copper_knuckles@0.04:1-1',
      'dog:cash@0.2:5-15', 'dog:copper_salvage@0.25:1-1',
      'giant_rat:copper_salvage@0.125:2-3', 'giant_rat:raw_giant_rat_meat@1:1-1',
      'pigeon:raw_bird_meat@1:1-1', 'rat:raw_rat_meat@1:1-1', 'thug:cash@0.2:5-10', 'thug:tin_knife@0.05:1-1',
    ]);
  });

  it('cooking: raw bird meat burns half the time at level 1, never from 15; cooked meat heals 1', async () => {
    const { RECIPE_BY_ITEM, burnChance } = await import('./data/recipes');
    const r = RECIPE_BY_ITEM.raw_bird_meat;
    expect([r.to, r.level, r.xp]).toEqual(['cooked_bird_meat', 1, 5]);
    expect(burnChance(r, 1)).toBe(0.5);
    expect(burnChance(r, 8)).toBe(0.25);
    expect(burnChance(r, 15)).toBe(0);
    expect(ITEM_BY_ID.cooked_bird_meat.heal).toBe(1);
  });

  it('combat level: a new character is 3; everything at 30 is 30', () => {
    expect(combatLevel({ melee: 1, marksman: 1, defense: 1, health: 10 })).toBe(3);
    expect(combatLevel({ melee: 30, marksman: 1, defense: 30, health: 30 })).toBe(30);
  });

  it('a new character has 10 HP (Health level 10) and fights with fists', () => {
    const s = newGame('T', DEFAULT_LOOK, 0);
    expect(maxHp(s)).toBe(10);
    expect(weaponStats(s)).toEqual(UNARMED);
    s.equipment = { weapon: 'tin_knuckles' };
    expect(weaponStats(s).damage).toBe(2);
  });
});

describe('Pigeons (shared, on a fixed schedule)', () => {
  it('there are three, and they only land on open park tiles', () => {
    expect(ENEMIES.filter((e) => e.kind === 'pigeon')).toHaveLength(3);
    const solid = new Set(FIXTURES.map((f) => `${f.x},${f.y}`));
    for (const [x, y] of PIGEON_TILES) {
      expect(inRect(PARK, x, y)).toBe(true);
      expect(solid.has(`${x},${y}`)).toBe(false);
    }
  });

  it('a Pigeon flies for 1.5 s, then stays put until its next hop', () => {
    const t0 = 1794830000000;
    for (let i = 0; i < 3; i++) {
      const start = Math.ceil((t0 + i * 2777) / PIGEON_HOP_MS) * PIGEON_HOP_MS - i * 2777;
      expect(pigeonAt(i, start + 10).flying).toBe(true);
      const a = pigeonAt(i, start + PIGEON_FLY_MS + 10);
      const b = pigeonAt(i, start + PIGEON_HOP_MS - 10);
      expect(a.flying).toBe(false);
      expect([a.x, a.z]).toEqual([b.x, b.z]);
    }
  });
});
