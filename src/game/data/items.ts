// Items (docs/design.md §6). Skills don't drop random loot: the only items so far are food from
// shoplifting, and food heals. Combat enemies will get loot tables later.

import { METAL_ITEMS } from './metals';

export type GearSlot = 'weapon' | 'head' | 'body' | 'legs' | 'feet';

export interface ItemDef {
  id: string;
  name: string;
  /** Health restored when eaten (0 = not food). */
  heal: number;
  /** What it's worth, in dollars. Shops buy it back for SELL_SHARE of that (rounded down, but at least $1). */
  value: number;
  /** Gear you can wield or wear (docs/design.md §12). Weapons don't wear out. */
  gear?: {
    slot: GearSlot;
    /** Weapons: damage (adds to max hit), accuracy bonus, ticks between swings. */
    damage?: number;
    accuracy?: number;
    speed?: number;
    /** Armour: defence bonus. */
    defence?: number;
    /** The skill level you need to use it. */
    needs?: { skill: 'melee' | 'gunfire' | 'defense'; level: number };
    /** How a swing looks: a punch (default), a big swing from the side (bats), later a stab (knives). */
    anim?: 'punch' | 'swing' | 'stab';
  };
}

// Items are data: a new one is a row here and the same row in public.items on the server (same id, numbers).
// Nothing stacks in your bag except cash: every item takes a slot of its own.
export const ITEMS: ItemDef[] = [
  { id: 'candy_bar', name: 'Candy Bar', heal: 1, value: 4 },
  { id: 'sandwich', name: 'Sandwich', heal: 2, value: 8 },
  // Food you cook (docs/design.md §13): Pigeons always drop raw bird meat; cook it on the barbecue to eat it.
  { id: 'raw_bird_meat', name: 'Raw Bird Meat', heal: 0, value: 2 },
  { id: 'cooked_bird_meat', name: 'Cooked Bird Meat', heal: 1, value: 4 },
  // Rats in the sewer drop raw rat meat: cook it at the barbecue.
  { id: 'raw_rat_meat', name: 'Raw Rat Meat', heal: 0, value: 2 },
  { id: 'cooked_rat_meat', name: 'Cooked Rat Meat', heal: 1, value: 4 },
  // The metals (docs/design.md §14): every metal's salvage, sheet, three weapons and three pieces of armour, from the
  // formulas in metals.ts. Tin is the first: Ray sells the tin weapons, thugs drop the tin knife, the rest you make.
  // (The old brass knuckles, baseball bat and knife became Tin Knuckles, Tin Bat and Tin Knife in v0.41.)
  ...METAL_ITEMS,
];

/** What the shops sell (item id → price in dollars). */
export const SHOPS: Record<string, { item: string; price: number }[]> = {
  weapons: [
    // Ray's tin starter kit costs more than it's worth: making it yourself (Tinkering) is the cheap way.
    { item: 'tin_knuckles', price: 50 },
    { item: 'tin_bat', price: 100 },
    { item: 'tin_knife', price: 150 },
  ],
};
/** Shops buy things back for this share of what they're worth (decided: 25%, for every item). */
export const SELL_SHARE = 0.25;
/** Who buys what: Ray buys weapons and armour, Eddy everything else. */
export const buyerOf = (id: string): 'ray' | 'eddy' => (ITEM_BY_ID[id]?.gear ? 'ray' : 'eddy');
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** What old loot (from before v0.12) was worth: on load it's turned into dollars. */
export const LEGACY_LOOT_VALUE: Record<string, number> = {
  sunglasses: 3, cheap_phone: 8, smartwatch: 25, gold_chain: 60, vintage_watch: 200, diamond_ring: 750,
};
