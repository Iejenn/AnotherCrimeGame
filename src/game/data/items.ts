// Items (docs/design.md §6). Skills don't drop random loot: the only items so far are food from
// shoplifting, and food heals. Combat enemies will get loot tables later.

import { METALS, METAL_ITEMS, PIECES, shopPrice } from './metals';

export type GearSlot = 'weapon' | 'marksman' | 'head' | 'body' | 'legs' | 'feet';

export interface ItemDef {
  id: string;
  name: string;
  /** Health restored when eaten (0 = not food). */
  heal: number;
  /** What it's worth, in dollars. Shops buy it back for SELL_SHARE of that (rounded down, but at least $1). */
  value: number;
  /** Quest items: you can't drop or sell them (or trade them, later), and they stay in your bag when you die. */
  quest?: boolean;
  /** Stacks (v0.51): up to STACK_MAX of them in one bag slot (throwing knives). The server has the same flag
   *  (public.items.stack, used by game.bag_used). */
  stack?: boolean;
  /** Gear you can wield or wear (docs/design.md §12). Weapons don't wear out. */
  gear?: {
    slot: GearSlot;
    /** Weapons: damage (adds to max hit), accuracy bonus, ticks between swings. */
    damage?: number;
    accuracy?: number;
    speed?: number;
    /** Armour: defence bonus. */
    defence?: number;
    /** Ranged weapons (v0.51): how far you can throw or shoot it (tiles). Throwing knives are their own ammo: the
     *  stack goes in the Marksman slot and each throw uses one (RECOVER_CHANCE of them land, to pick back up). */
    range?: number;
    /** The skill level you need to use it. */
    needs?: { skill: 'melee' | 'marksman' | 'defense'; level: number };
    /** How an attack looks: a punch (default), a big swing from the side (bats), a stab (knives), a throw. */
    anim?: 'punch' | 'swing' | 'stab' | 'throw';
  };
}

// Items are data: a new one is a row here and the same row in public.items on the server (same id, numbers).
// Most things take a slot each; cash and stacking items (`stack`: throwing knives) take one slot for any number.
export const ITEMS: ItemDef[] = [
  { id: 'candy_bar', name: 'Candy Bar', heal: 1, value: 4 },
  { id: 'sandwich', name: 'Sandwich', heal: 2, value: 8 },
  // Food you cook (docs/design.md §13): Pigeons always drop raw bird meat; cook it on the barbecue to eat it.
  { id: 'raw_bird_meat', name: 'Raw Bird Meat', heal: 0, value: 2 },
  { id: 'cooked_bird_meat', name: 'Cooked Bird Meat', heal: 1, value: 4 },
  // Rats in the sewer drop raw rat meat: cook it at the barbecue.
  { id: 'raw_rat_meat', name: 'Raw Rat Meat', heal: 0, value: 2 },
  { id: 'cooked_rat_meat', name: 'Cooked Rat Meat', heal: 1, value: 4 },
  // The Rat Nest's giant rats (v0.43) always drop raw giant rat meat: cook it (Cooking 10) for the best food so far.
  { id: 'raw_giant_rat_meat', name: 'Raw Giant Rat Meat', heal: 0, value: 4 },
  { id: 'cooked_giant_rat_meat', name: 'Cooked Giant Rat Meat', heal: 3, value: 8 },
  // The quest "Sewer Problems" (v0.43): Elliot's antidote, the antidote dripped over cooked rat meat, Splinter's key.
  { id: 'rat_antidote', name: 'Rat Antidote', heal: 0, value: 0, quest: true },
  { id: 'cooked_rat_antidote', name: 'Cooked Rat Antidote', heal: 0, value: 0, quest: true },
  { id: 'sewer_key', name: 'Sewer Key', heal: 0, value: 0, quest: true },
  // The metals (docs/design.md §14): every metal's salvage, sheet, three weapons and three pieces of armour, from the
  // formulas in metals.ts. Tin is the first: Ray sells the tin weapons, thugs drop the tin knife, the rest you make.
  // (The old brass knuckles, baseball bat and knife became Tin Knuckles, Tin Bat and Tin Knife in v0.41.)
  ...METAL_ITEMS,
];

/** What the shops sell: the item, the price in dollars, and how many you get for it (1, or a pack). */
export const SHOPS: Record<string, { item: string; price: number; amount: number }[]> = {
  // Ray's Arms (v0.49): every metal's weapons, sorted by kind then metal (tin knuckles, copper knuckles, tin bat, …),
  // at 30 × the metal in them (shopPrice): making them yourself (Scrapping + Tinkering) is far cheaper. Throwing knives
  // (v0.51) come in packs of 10 at one sheet's price: $150 for 10 tin, $300 for 10 copper.
  weapons: PIECES.filter((p) => p.slot === 'weapon' || p.slot === 'marksman').flatMap((p) => METALS.map((m) => ({ item: `${m.id}_${p.key}`, price: shopPrice(m, p), amount: p.pack ?? 1 }))),
};
/** How many of a stacking item fit in one bag slot (the server's game.bag_used). */
export const STACK_MAX = 1000;
/** The chance a thrown knife lands where it hit, for you to pick back up (the server's fight_step); the rest break. */
export const RECOVER_CHANCE = 1 / 3;
/** "Tin Throwing Knife" → "Tin Throwing Knives" (for packs and stacks). */
export const plural = (name: string) => (name.endsWith('fe') ? `${name.slice(0, -2)}ves` : `${name}s`);
/** Shops buy things back for this share of what they're worth (decided: 25%, for every item). */
export const SELL_SHARE = 0.25;
/** Who buys what: Ray buys weapons and armour, Eddy everything else. */
export const buyerOf = (id: string): 'ray' | 'eddy' => (ITEM_BY_ID[id]?.gear ? 'ray' : 'eddy');
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** What old loot (from before v0.12) was worth: on load it's turned into dollars. */
export const LEGACY_LOOT_VALUE: Record<string, number> = {
  sunglasses: 3, cheap_phone: 8, smartwatch: 25, gold_chain: 60, vintage_watch: 200, diamond_ring: 750,
};
