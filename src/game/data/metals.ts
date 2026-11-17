// The metal ladder (docs/design.md §14): Scrapping gathers a metal's salvage, Tinkering presses it into sheets and makes
// gear from the sheets at a workbench. Every metal makes the same six items, unlocked one level at a time, with stats,
// values and XP from a few formulas, so a new tier is one row in METALS (plus a place to scrap it).
// Only tin is in the game for now; the rest follow as their scrap places are built.
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
export const METALS: Metal[] = [{ id: 'tin', name: 'Tin', tier: 1, level: 1 }];

/** One sheet of a metal is worth this much (tin $5, doubling every tier). Salvage is worth the same as a sheet. */
export const sheetValue = (m: Metal) => 5 * 2 ** (m.tier - 1);
/** XP for pressing one sheet, and for every sheet that goes into an item (tin 1 and 3, doubling every tier). */
export const pressXp = (m: Metal) => 1 * 2 ** (m.tier - 1);
export const sheetXp = (m: Metal) => 3 * 2 ** (m.tier - 1);

/** The six things every metal makes, in the order they unlock (Tinkering level = metal's level + `at`). */
export interface Piece {
  key: 'knuckles' | 'bat' | 'knife' | 'helmet' | 'legs' | 'vest';
  name: string;
  at: number;
  sheets: number;
  slot: GearSlot;
}
export const PIECES: Piece[] = [
  { key: 'knuckles', name: 'Knuckles', at: 1, sheets: 1, slot: 'weapon' },
  { key: 'bat', name: 'Bat', at: 2, sheets: 2, slot: 'weapon' },
  { key: 'knife', name: 'Knife', at: 3, sheets: 1, slot: 'weapon' },
  // (at 4: bullet casings, later with Gunfire)
  { key: 'helmet', name: 'Helmet', at: 5, sheets: 1, slot: 'head' },
  { key: 'legs', name: 'Leg Guards', at: 6, sheets: 2, slot: 'legs' },
  { key: 'vest', name: 'Plate Vest', at: 7, sheets: 3, slot: 'body' },
];

/** A piece's stats at a metal's tier: weapons' max hit and speed, armour's defence bonus (§14 formulas). */
export function pieceGear(m: Metal, p: Piece): ItemDef['gear'] {
  const B = m.tier + 1;
  const needs = { skill: p.slot === 'weapon' ? ('melee' as const) : ('defense' as const), level: m.level };
  switch (p.key) {
    case 'knuckles':
      return { slot: 'weapon', damage: B, accuracy: 0, speed: 3, needs };
    case 'bat':
      return { slot: 'weapon', damage: 2 * B + 1, accuracy: 0, speed: 6, needs, anim: 'swing' };
    case 'knife':
      return { slot: 'weapon', damage: Math.max(1, Math.round((2 * (B + 1)) / 3 - 1)), accuracy: 0, speed: 2, needs, anim: 'stab' };
    case 'helmet':
      return { slot: 'head', defence: 2 * m.tier, needs };
    case 'legs':
      return { slot: 'legs', defence: 3 * m.tier, needs };
    case 'vest':
      return { slot: 'body', defence: 4 * m.tier, needs };
  }
}

/** Every metal's items: its salvage, its sheet and its six pieces. */
export const METAL_ITEMS: ItemDef[] = METALS.flatMap((m) => [
  { id: `${m.id}_salvage`, name: `${m.name} Salvage`, heal: 0, value: sheetValue(m) },
  { id: `${m.id}_sheet`, name: `${m.name} Sheet`, heal: 0, value: sheetValue(m) },
  ...PIECES.map((p) => ({ id: `${m.id}_${p.key}`, name: `${m.name} ${p.name}`, heal: 0, value: sheetValue(m) * p.sheets, gear: pieceGear(m, p) })),
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
}
/** Pressing a sheet takes 2 ticks, making a piece at the workbench 4. */
export const PRESS_TICKS = 2;
export const BENCH_TICKS = 4;
export const CRAFTS: Craft[] = METALS.flatMap((m) => [
  { id: `${m.id}_sheet`, station: 'press' as const, skill: 'tinkering' as const, level: m.level, xp: pressXp(m), ticks: PRESS_TICKS, inputs: { [`${m.id}_salvage`]: 1 } },
  ...PIECES.map((p) => ({
    id: `${m.id}_${p.key}`, station: 'bench' as const, skill: 'tinkering' as const, level: m.level + p.at, xp: sheetXp(m) * p.sheets,
    ticks: BENCH_TICKS, inputs: { [`${m.id}_sheet`]: p.sheets },
  })),
]);
export const CRAFT_BY_ID: Record<string, Craft> = Object.fromEntries(CRAFTS.map((c) => [c.id, c]));
