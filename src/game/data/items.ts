// Items (docs/design.md §6). Skills don't drop random loot: the only items so far are food from
// shoplifting, and food heals. Combat enemies will get loot tables later.

export type GearSlot = 'weapon' | 'head' | 'body' | 'legs' | 'feet';

export interface ItemDef {
  id: string;
  name: string;
  /** Health restored when eaten (0 = not food). */
  heal: number;
  /** What it's worth, in dollars. Shops buy it back for SELL_SHARE of that (rounded down; 0 = nobody buys it). */
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
    anim?: 'punch' | 'swing';
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
  // The first weapon: Ray's weapon store sells them for $50. +1 damage over bare fists, same speed, no defence.
  { id: 'brass_knuckles', name: 'Brass Knuckles', heal: 0, value: 50, gear: { slot: 'weapon', damage: 2, accuracy: 0, speed: 3, needs: { skill: 'melee', level: 1 } } },
  // Ray's second weapon ($250, Melee 3): hits hard (+4 damage over fists) but slowly (a swing every 3 s).
  { id: 'baseball_bat', name: 'Baseball Bat', heal: 0, value: 250, gear: { slot: 'weapon', damage: 5, accuracy: 0, speed: 6, needs: { skill: 'melee', level: 3 }, anim: 'swing' } },
];

/** What the shops sell (item id → price in dollars). */
export const SHOPS: Record<string, { item: string; price: number }[]> = {
  weapons: [
    { item: 'brass_knuckles', price: 50 },
    { item: 'baseball_bat', price: 250 },
  ],
};
/** Shops buy things back for this share of what they're worth (decided: 25%, for every item). */
export const SELL_SHARE = 0.25;
/** Who buys what: Ray buys weapons, Eddy everything else. */
export const buyerOf = (id: string): 'ray' | 'eddy' => (ITEM_BY_ID[id]?.gear ? 'ray' : 'eddy');
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** What old loot (from before v0.12) was worth: on load it's turned into dollars. */
export const LEGACY_LOOT_VALUE: Record<string, number> = {
  sunglasses: 3, cheap_phone: 8, smartwatch: 25, gold_chain: 60, vintage_watch: 200, diamond_ring: 750,
};
