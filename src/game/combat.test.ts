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

  it('max hit: fists 1 at level 1, 2 at 9, 4 at 30; brass knuckles +1', () => {
    expect([maxHit(1, 1), maxHit(1, 8), maxHit(1, 9), maxHit(1, 17), maxHit(1, 30)]).toEqual([1, 1, 2, 3, 4]);
    const k = ITEM_BY_ID.brass_knuckles.gear!;
    expect(maxHit(k.damage!, 1)).toBe(2);
    expect(k.speed).toBe(UNARMED.speed);
    expect(k.defence ?? 0).toBe(0);
    expect(SHOPS.weapons).toEqual([{ item: 'brass_knuckles', price: 50 }, { item: 'baseball_bat', price: 250 }]);
    // The bat: +4 damage (max hit 5 at Melee 3), a swing every 3 s, needs Melee 3. Selling gives a quarter back.
    const bat = ITEM_BY_ID.baseball_bat.gear!;
    expect([bat.damage, bat.speed, bat.needs?.level]).toEqual([5, 6, 3]);
    expect(maxHit(bat.damage!, 3)).toBe(5);
    expect(itemPrice('baseball_bat')).toBe(62);
    expect(itemPrice('candy_bar')).toBe(1);
    expect(itemPrice('sandwich')).toBe(2);
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
    const k = ITEM_BY_ID.knife.gear!;
    expect([k.damage, k.speed, k.needs?.level, k.anim]).toEqual([2, 2, 5, 'stab']);
    expect(itemPrice('knife')).toBe(62);
  });

  it("the game's copy of the loot tables (shown in the Skills tab) matches the server's public.loot", () => {
    // public.loot on the server (checked there on 2026-11-16): pigeon raw_bird_meat 1; thug cash 0.2 ($5–10), knife 0.05;
    // rat raw_rat_meat 1 (0019_sewer).
    const rows = Object.values(ENEMY_KINDS).flatMap((k) => k.loot.map((d) => `${k.id}:${d.item}@${d.chance}:${d.min}-${d.max}`));
    expect(rows.sort()).toEqual(['pigeon:raw_bird_meat@1:1-1', 'rat:raw_rat_meat@1:1-1', 'thug:cash@0.2:5-10', 'thug:knife@0.05:1-1']);
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
    expect(combatLevel({ melee: 1, gunfire: 1, defense: 1, health: 10 })).toBe(3);
    expect(combatLevel({ melee: 30, gunfire: 1, defense: 30, health: 30 })).toBe(30);
  });

  it('a new character has 10 HP (Health level 10) and fights with fists', () => {
    const s = newGame('T', DEFAULT_LOOK, 0);
    expect(maxHp(s)).toBe(10);
    expect(weaponStats(s)).toEqual(UNARMED);
    s.equipment = { weapon: 'brass_knuckles' };
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
