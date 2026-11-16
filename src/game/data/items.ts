// Items (docs/design.md §6). Skills don't drop random loot: the only items so far are food from
// shoplifting, and food heals. Combat enemies will get loot tables later.

export type GearSlot = 'weapon' | 'head' | 'body' | 'legs' | 'feet';

export interface ItemDef {
  id: string;
  name: string;
  /** Health restored when eaten (0 = not food). */
  heal: number;
  /** What Eddy pays for one, in dollars (0 = he doesn't buy it). */
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
  };
}

export const ITEMS: ItemDef[] = [
  { id: 'candy_bar', name: 'Candy Bar', heal: 1, value: 1 },
  { id: 'sandwich', name: 'Sandwich', heal: 2, value: 2 },
  // The first weapon: Ray's weapon store sells them for $50. +1 damage over bare fists, same speed, no defence.
  { id: 'brass_knuckles', name: 'Brass Knuckles', heal: 0, value: 0, gear: { slot: 'weapon', damage: 2, accuracy: 0, speed: 3, needs: { skill: 'melee', level: 1 } } },
];

/** What the shops sell (item id → price in dollars). */
export const SHOPS: Record<string, { item: string; price: number }[]> = {
  weapons: [{ item: 'brass_knuckles', price: 50 }],
};
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** What old loot (from before v0.12) was worth: on load it's turned into dollars. */
export const LEGACY_LOOT_VALUE: Record<string, number> = {
  sunglasses: 3, cheap_phone: 8, smartwatch: 25, gold_chain: 60, vintage_watch: 200, diamond_ring: 750,
};
