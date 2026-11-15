import type { Rarity } from '../types';

// ---------- Flavor pools (mixed into crime text so every result reads differently) ----------
export const MARKS = [
  'a tourist with a fanny pack', 'a drunk stockbroker', 'a guy yelling into his phone', 'a distracted influencer',
  'a half-asleep commuter', 'a bachelorette party', 'a lost exchange student', 'a pompous city councillor',
  'a nervous first-dater', 'a street magician', 'a retired judge', 'a crypto bro', 'a wedding guest',
  'a lottery winner', 'a mall cop on break', 'a celebrity lookalike',
];
export const PLACES = [
  'Central Station', 'Pier 9', 'the night market', 'Little Lisbon', 'the casino strip', 'the financial district',
  'Old Harbor', 'the university quarter', 'Ash Street', 'the stadium lot', 'Chinatown Gate', 'Kingsbridge Mall',
  'the river walk', 'Velvet Row', 'the old bridge', "Saint Mark's Square",
];

// ---------- Ranks by total level (5 skills × 1–10 = 5–50) ----------
export const RANKS: [number, string][] = [
  [0, 'Nobody'], [8, 'Corner Boy'], [12, 'Hustler'], [16, 'Crook'], [22, 'Associate'], [28, 'Soldier'],
  [34, 'Enforcer'], [40, 'Lieutenant'], [46, 'Capo'], [50, 'Boss'],
];

// ---------- Loot (from Street Crimes) ----------
export interface LootDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Street Crimes level needed before it can drop. */
  minLevel: number;
  /** What Eddy pays for one. */
  value: number;
}
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 9, legendary: 2 };
export const LOOT: LootDef[] = [
  { id: 'sunglasses', name: 'Knockoff Sunglasses', rarity: 'common', minLevel: 1, value: 3 },
  { id: 'cheap_phone', name: 'Cheap Phone', rarity: 'common', minLevel: 2, value: 6 },
  { id: 'smartwatch', name: 'Smartwatch', rarity: 'uncommon', minLevel: 4, value: 15 },
  { id: 'gold_chain', name: 'Gold Chain', rarity: 'uncommon', minLevel: 6, value: 30 },
  { id: 'vintage_watch', name: 'Vintage Watch', rarity: 'rare', minLevel: 8, value: 80 },
  { id: 'diamond_ring', name: 'Diamond Ring', rarity: 'legendary', minLevel: 9, value: 200 },
];
export const LOOT_BY_ID: Record<string, LootDef> = Object.fromEntries(LOOT.map((l) => [l.id, l]));
