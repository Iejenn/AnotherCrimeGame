// The metal ladder (docs/design.md §14): Scrapping gathers a metal's salvage, Tinkering presses it into sheets and makes
// gear from the sheets at a workbench. Every metal makes the same six items, unlocked one level at a time, with stats,
// values and XP from a few formulas, so a new tier is one row in METALS (plus a place to scrap it).
// Tin and copper are in the game; the rest follow as their scrap places are built.
import type { GearSlot, ItemDef } from './items';

export interface Metal {
  id: string;
  name: string;
  /** Its place on the ladder: 1 = tin, 2 = copper, … 10 = tungsten. */
  tier: number;
  /** The level it starts at (Scrapping, Tinkering, Melee and Defense): 1, 11, 21, 31… */
  level: number;
}

/** The metals in the game (tier 1 = tin, then copper, aluminium, brass, bronze, iron, steel, hardened steel, titanium,
 *  tungsten: added here as they come). */
export const METALS: Metal[] = [
  { id: 'tin', name: 'Tin', tier: 1, level: 1 },
  // v0.43: copper, scrapped behind Hotline Plumbing & Heating (I-008).
  { id: 'copper', name: 'Copper', tier: 2, level: 11 },
];

/** One sheet of a metal is worth this much (tin $5, doubling every tier). Salvage is worth the same as a sheet. */
export const sheetValue = (m: Metal) => 5 * 2 ** (m.tier - 1);
/** Ray's price for a weapon (v0.49): 30 × the metal in it (a sheet's value × the sheets it takes). One rule for every
 *  tier: buying costs minutes of crime, making it yourself under a minute of salvaging (docs/design.md §14). */
export const SHOP_MARKUP = 30;
export const shopPrice = (m: Metal, p: Piece) => sheetValue(m) * p.sheets * SHOP_MARKUP;
/** XP for pressing one sheet, and for every sheet that goes into an item (tin 1 and 3, doubling every tier). */
export const pressXp = (m: Metal) => 1 * 2 ** (m.tier - 1);
export const sheetXp = (m: Metal) => 3 * 2 ** (m.tier - 1);

/** The things every metal makes, unlocked at Tinkering level = metal's level + `at` (Ray's shelf follows this order). */
export interface Piece {
  key: 'knuckles' | 'bat' | 'knife' | 'throwing_knife' | 'helmet' | 'legs' | 'vest';
  name: string;
  at: number;
  sheets: number;
  slot: GearSlot;
  /** How many one craft makes (default 1). More than 1: they stack in your bag. */
  makes?: number;
}
export const PIECES: Piece[] = [
  { key: 'knuckles', name: 'Knuckles', at: 1, sheets: 1, slot: 'weapon' },
  { key: 'bat', name: 'Bat', at: 2, sheets: 2, slot: 'weapon' },
  { key: 'knife', name: 'Knife', at: 3, sheets: 1, slot: 'weapon' },
  // v0.51 (Marksman): throwing knives, 5 from a sheet, from the metal's first level (tin: Tinkering 1). Each throw uses
  // one up, so Marksman keeps eating salvage. (Later, at 4: bullet casings for guns.)
  { key: 'throwing_knife', name: 'Throwing Knife', at: 0, sheets: 1, slot: 'marksman', makes: 5 },
  { key: 'helmet', name: 'Helmet', at: 5, sheets: 1, slot: 'head' },
  { key: 'legs', name: 'Leg Guards', at: 6, sheets: 2, slot: 'legs' },
  { key: 'vest', name: 'Plate Vest', at: 7, sheets: 3, slot: 'body' },
];
/** How far a throwing knife flies (tiles). Later weapons get their own (a pistol further). */
export const THROW_RANGE = 6;

/** A piece's stats at a metal's tier: weapons' max hit and speed, armour's defence bonus (§14 formulas). */
export function pieceGear(m: Metal, p: Piece): ItemDef['gear'] {
  const B = m.tier + 1;
  const needs = { skill: p.key === 'throwing_knife' ? ('marksman' as const) : p.slot === 'weapon' ? ('melee' as const) : ('defense' as const), level: m.level };
  switch (p.key) {
    case 'knuckles':
      return { slot: 'weapon', damage: B, accuracy: 0, speed: 3, needs };
    case 'bat':
      return { slot: 'weapon', damage: 2 * B + 1, accuracy: 0, speed: 6, needs, anim: 'swing' };
    case 'knife':
      return { slot: 'weapon', damage: Math.max(1, Math.round((2 * (B + 1)) / 3 - 1)), accuracy: 0, speed: 2, needs, anim: 'stab' };
    case 'throwing_knife':
      // The knife's damage, a throw every 1.5 s (like a punch: 40 knives a minute is plenty to keep stocked).
      return { slot: 'marksman', damage: Math.max(1, Math.round((2 * (B + 1)) / 3 - 1)), accuracy: 0, speed: 3, range: THROW_RANGE, needs, anim: 'throw' };
    case 'helmet':
      return { slot: 'head', defence: 2 * m.tier, needs };
    case 'legs':
      return { slot: 'legs', defence: 3 * m.tier, needs };
    case 'vest':
      return { slot: 'body', defence: 4 * m.tier, needs };
  }
}

/** Every metal's items: its salvage, its sheet and its pieces. A piece made several at a time is worth its share of the
 *  metal (a tin throwing knife $1) and stacks. */
export const METAL_ITEMS: ItemDef[] = METALS.flatMap((m) => [
  { id: `${m.id}_salvage`, name: `${m.name} Salvage`, heal: 0, value: sheetValue(m) },
  { id: `${m.id}_sheet`, name: `${m.name} Sheet`, heal: 0, value: sheetValue(m) },
  ...PIECES.map((p) => ({
    id: `${m.id}_${p.key}`, name: `${m.name} ${p.name}`, heal: 0, value: (sheetValue(m) * p.sheets) / (p.makes ?? 1), gear: pieceGear(m, p),
    ...(p.makes ? { stack: true } : {}),
  })),
]);

/** Something you make at a station: what it costs, the Tinkering level, the XP and how long one takes. The server has
 *  the same rows (public.crafts). */
export interface Craft {
  /** The item it makes (also the craft's id). */
  id: string;
  station: 'press' | 'bench';
  skill: 'tinkering';
  level: number;
  xp: number;
  /** Ticks (½ s) for one. */
  ticks: number;
  inputs: Record<string, number>;
  /** How many it makes (v0.51: 5 throwing knives from a sheet; default 1). The server's public.crafts.amount. */
  amount?: number;
}
/** Pressing a sheet takes 2 ticks, making a piece at the workbench 4. */
export const PRESS_TICKS = 2;
export const BENCH_TICKS = 4;
export const CRAFTS: Craft[] = METALS.flatMap((m) => [
  { id: `${m.id}_sheet`, station: 'press' as const, skill: 'tinkering' as const, level: m.level, xp: pressXp(m), ticks: PRESS_TICKS, inputs: { [`${m.id}_salvage`]: 1 } },
  ...PIECES.map((p) => ({
    id: `${m.id}_${p.key}`, station: 'bench' as const, skill: 'tinkering' as const, level: m.level + p.at, xp: sheetXp(m) * p.sheets,
    ticks: BENCH_TICKS, inputs: { [`${m.id}_sheet`]: p.sheets }, ...(p.makes ? { amount: p.makes } : {}),
  })),
]);
export const CRAFT_BY_ID: Record<string, Craft> = Object.fromEntries(CRAFTS.map((c) => [c.id, c]));
