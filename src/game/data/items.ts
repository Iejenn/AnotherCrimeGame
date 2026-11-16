// Items (docs/design.md §6). Skills don't drop random loot: the only items so far are food from
// shoplifting, and food heals. Combat enemies will get loot tables later.

export interface ItemDef {
  id: string;
  name: string;
  /** Health restored when eaten (0 = not food). */
  heal: number;
  /** What Eddy pays for one, in dollars. */
  value: number;
}

export const ITEMS: ItemDef[] = [
  { id: 'candy_bar', name: 'Candy Bar', heal: 1, value: 1 },
  { id: 'sandwich', name: 'Sandwich', heal: 2, value: 2 },
];
export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** What old loot (from before v0.12) was worth: on load it's turned into dollars. */
export const LEGACY_LOOT_VALUE: Record<string, number> = {
  sunglasses: 3, cheap_phone: 8, smartwatch: 25, gold_chain: 60, vintage_watch: 200, diamond_ring: 750,
};
