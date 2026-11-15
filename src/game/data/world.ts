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

// ---------- Ranks by total level (5 skills × 1–30 = 5–150) ----------
export const RANKS: [number, string][] = [
  [0, 'Nobody'], [10, 'Corner Boy'], [15, 'Hustler'], [20, 'Crook'], [26, 'Associate'], [34, 'Soldier'],
  [50, 'Enforcer'], [70, 'Lieutenant'], [95, 'Capo'], [125, 'Boss'], [150, 'Godfather'],
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
  { id: 'cheap_phone', name: 'Cheap Phone', rarity: 'common', minLevel: 5, value: 8 },
  { id: 'smartwatch', name: 'Smartwatch', rarity: 'uncommon', minLevel: 10, value: 25 },
  { id: 'gold_chain', name: 'Gold Chain', rarity: 'uncommon', minLevel: 15, value: 60 },
  { id: 'vintage_watch', name: 'Vintage Watch', rarity: 'rare', minLevel: 20, value: 200 },
  { id: 'diamond_ring', name: 'Diamond Ring', rarity: 'legendary', minLevel: 25, value: 750 },
];
export const LOOT_BY_ID: Record<string, LootDef> = Object.fromEntries(LOOT.map((l) => [l.id, l]));
