import type { OriginId, PerkId, Rarity, SkillId, TraitId } from '../types';
import { cashPerHour } from '../xp';
import { SKILL_BY_ID } from './skills';

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
  'the airport terminal', 'Velvet Row', 'the riverside promenade', 'Saint Mark\'s Square',
];

// ---------- Perks: picked at skill milestones ----------
export const PERK_MILESTONES = [10, 25, 40, 60, 80];
export const PERKS: Record<PerkId, { name: string; desc: string }> = {
  speed: { name: 'Quick Hands', desc: '-7% job duration' },
  greed: { name: 'Greedy', desc: '+12% cash' },
  scholar: { name: 'Student of the Game', desc: '+10% XP' },
  ghost: { name: 'Ghost', desc: '-20% bust chance' },
  lucky: { name: 'Lucky Break', desc: '+3% Big Score chance' },
};
export const PERK_IDS = Object.keys(PERKS) as PerkId[];

// ---------- Crew traits ----------
export const TRAITS: Record<TraitId, { name: string; desc: string }> = {
  none: { name: '—', desc: 'No special trait' },
  quick: { name: 'Quick', desc: '-10% job duration' },
  lucky: { name: 'Lucky', desc: '+4% Big Score chance' },
  careful: { name: 'Careful', desc: '-30% bust chance' },
  greedy: { name: 'Greedy', desc: '+12% cash' },
  bright: { name: 'Bright', desc: '+12% XP' },
};
export const CREW_FIRST = ['Sal', 'Vinnie', 'Rosa', 'Mickey', 'Nadia', 'Tommy', 'Lena', 'Dex', 'Marco', 'Ivy', 'Bruno', 'Kat', 'Rico', 'Yuki', 'Ozzy', 'Bea'];
export const CREW_NICK = ['"The Rat"', '"Two-Tone"', '"Fingers"', '"Smokes"', '"Quiet"', '"Tank"', '"Lucky"', '"Wheels"', '"Doc"', '"Ghost"', '"Sparks"', '"Ledger"'];
export const CREW_SLOT_COST = [0, 2_500, 40_000, 600_000, 9_000_000];
export const CREW_SLOT_TOTAL_LEVEL = [0, 12, 40, 100, 200];

// ---------- Origins: picked at character creation ----------
export interface OriginDef {
  id: OriginId;
  name: string;
  desc: string;
  xp: Partial<Record<SkillId, number>>;
  cash: Partial<Record<SkillId, number>>;
  jailMult: number;
  startCash: number;
}
export const ORIGINS: OriginDef[] = [
  { id: 'streetkid', name: 'Street Kid', desc: 'Grew up on the corners. +20% Petty Theft XP, +10% Enforcement XP.', xp: { petty: 0.2, muscle: 0.1 }, cash: {}, jailMult: 1, startCash: 50 },
  { id: 'greasemonkey', name: 'Grease Monkey', desc: 'Fixed cars, then took them. +20% Car Theft XP and cash.', xp: { auto: 0.2 }, cash: { auto: 0.2 }, jailMult: 1, startCash: 50 },
  { id: 'excon', name: 'Ex-Con', desc: 'Already did time. -35% jail time, +10% Robbery & Enforcement XP.', xp: { robbery: 0.1, muscle: 0.1 }, cash: {}, jailMult: 0.65, startCash: 25 },
  { id: 'hacker', name: 'Dropout Hacker', desc: 'Left college, kept the laptop. +25% Fraud XP, +10% Burglary XP.', xp: { fraud: 0.25, burglary: 0.1 }, cash: {}, jailMult: 1, startCash: 100 },
  { id: 'dockworker', name: 'Dockworker', desc: 'Knows every crate at the port. +25% Smuggling cash, +10% Smuggling XP.', xp: { smuggling: 0.1 }, cash: { smuggling: 0.25 }, jailMult: 1, startCash: 75 },
];
export const ORIGIN_BY_ID = Object.fromEntries(ORIGINS.map((o) => [o.id, o])) as Record<OriginId, OriginDef>;

// ---------- Ranks by total level ----------
export const RANKS: [number, string][] = [
  [0, 'Nobody'], [12, 'Corner Boy'], [25, 'Hustler'], [45, 'Crook'], [70, 'Associate'], [100, 'Soldier'],
  [140, 'Enforcer'], [190, 'Lieutenant'], [250, 'Capo'], [330, 'Underboss'], [430, 'Boss'], [550, 'Don'],
  [680, 'Godfather'], [780, 'Legend'],
];

// ---------- Loot ----------
export interface LootDef {
  id: string;
  name: string;
  skill: SkillId;
  rarity: Rarity;
  minLevel: number;
  value: number;
}
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, uncommon: 25, rare: 9, legendary: 2 };
const RARITY_HOURS: Record<Rarity, number> = { common: 0.05, uncommon: 0.15, rare: 0.5, legendary: 2.5 };

const LOOT_RAW: Record<SkillId, [string, string, Rarity, number][]> = {
  petty: [['sunglasses', 'Knockoff Sunglasses', 'common', 1], ['smartwatch', 'Smartwatch', 'common', 10], ['gold_chain', 'Gold Chain', 'uncommon', 25], ['vintage_watch', 'Vintage Swiss Watch', 'rare', 45], ['jeweled_egg', 'Jeweled Imperial Egg', 'legendary', 70]],
  auto: [['car_stereo', 'Car Stereo', 'common', 1], ['alloy_rims', 'Alloy Rims', 'common', 10], ['catalytic', 'Catalytic Converter', 'uncommon', 25], ['racing_ecu', 'Racing ECU', 'rare', 45], ['prototype_bp', 'Prototype Engine Blueprints', 'legendary', 70]],
  burglary: [['silverware', 'Silverware Set', 'common', 1], ['laptop', 'Laptop', 'common', 10], ['jewelry_box', 'Jewelry Box', 'uncommon', 25], ['stamp_album', 'Rare Stamp Album', 'rare', 45], ['old_master', 'Lost Old-Master Sketch', 'legendary', 70]],
  muscle: [['brass_knuckles', 'Brass Knuckles', 'common', 1], ['iou_ledger', 'IOU Ledger', 'common', 10], ['fight_belt', 'Championship Belt', 'uncommon', 25], ['black_book', "Rival's Black Book", 'rare', 45], ['commish_secret', "Commissioner's Secret Tapes", 'legendary', 70]],
  fraud: [['card_dump', 'Stolen Card Dump', 'common', 1], ['id_kit', 'Identity Kit', 'common', 10], ['hw_wallet', 'Hardware Wallet', 'uncommon', 25], ['insider', 'Bank Insider Contact', 'rare', 45], ['zero_day', 'Zero-Day Exploit', 'legendary', 70]],
  smuggling: [['smokes', 'Carton of Smokes', 'common', 1], ['rum_case', 'Case of Rum', 'common', 10], ['watch_crate', 'Crate of Watches', 'uncommon', 25], ['antique_gun', 'Antique Revolver', 'rare', 45], ['pharaoh', "Pharaoh's Amulet", 'legendary', 70]],
  robbery: [['guitar', 'Pawned Guitar', 'common', 1], ['diamond_ring', 'Diamond Ring', 'common', 10], ['casino_chips', 'Bag of Casino Chips', 'uncommon', 25], ['bearer_bonds', 'Bearer Bonds', 'rare', 45], ['gold_bullion', 'Gold Bullion Bar', 'legendary', 70]],
  heist: [['statuette', 'Bronze Statuette', 'common', 1], ['gem_pouch', 'Gemstone Pouch', 'common', 10], ['ming_vase', 'Ming Dynasty Vase', 'uncommon', 25], ['blue_diamond', 'The Blue Diamond', 'rare', 45], ['sceptre', 'The Royal Sceptre', 'legendary', 70]],
};

export const LOOT: LootDef[] = (Object.keys(LOOT_RAW) as SkillId[]).flatMap((skill) =>
  LOOT_RAW[skill].map(([id, name, rarity, minLevel]) => ({
    id,
    name,
    skill,
    rarity,
    minLevel,
    value: Math.round(cashPerHour(minLevel + 5) * SKILL_BY_ID[skill].cashMult * RARITY_HOURS[rarity]),
  })),
);
export const LOOT_BY_ID: Record<string, LootDef> = Object.fromEntries(LOOT.map((l) => [l.id, l]));

// ---------- Cars ----------
export const CAR_CLASSES = ['Beater', 'Sedan', 'Sports', 'Luxury', 'Exotic'];
export const CAR_MODELS: string[][] = [
  ['Rusty Hatchback', '\'98 Pickup', 'Faded Minivan', 'Two-Tone Compact'],
  ['Family Sedan', 'Taxi Cruiser', 'Company Estate', 'Mid-Size Coupe'],
  ['Turbo Hatch', 'Muscle Car', 'Roadster', 'Rally Special'],
  ['Executive Saloon', 'Armored Limo', 'Grand Tourer', 'Luxury SUV'],
  ['Hypercar', 'Italian Supercar', 'One-Off Prototype', 'Racing Legend'],
];
export const CAR_BASE_VALUE = [400, 3_000, 20_000, 120_000, 900_000];
/** Smuggling cash bonus from the best car in your garage. */
export const CAR_SMUGGLE_BONUS = [0.05, 0.15, 0.3, 0.6, 1.0];

// ---------- Gear: best owned piece per skill applies ----------
export interface GearDef {
  id: string;
  name: string;
  skill: SkillId;
  level: number;
  success: number;
  cash: number;
  price: number;
}
const GEAR_RAW: Record<SkillId, [string, string, string]> = {
  petty: ['Razor Blade & Tweezers', 'Magnetic Sleeve Kit', 'Tailored Pickpocket Coat'],
  auto: ['Slim Jim', 'OBD Key Programmer', 'Relay Attack Rig'],
  burglary: ['Lockpick Set', 'Electric Pick Gun', 'Thermal Lance'],
  muscle: ['Leather Gloves', 'Intimidating Suit', 'Armored Escalade'],
  fraud: ['Burner Laptop', 'Card Encoder', 'Botnet Rental'],
  smuggling: ['Hidden Compartment', 'Bribed Port Contact', 'Private Airstrip'],
  robbery: ['Ski Mask & Bat', 'Police Scanner', 'Tactical Getaway Plan'],
  heist: ['Blueprints Broker', 'Inside Man Network', 'Master Planner'],
};
const GEAR_TIERS = [
  { level: 10, success: 0.05, cash: 0.1, hours: 3 },
  { level: 35, success: 0.08, cash: 0.2, hours: 6 },
  { level: 65, success: 0.12, cash: 0.35, hours: 10 },
];
export const GEAR: GearDef[] = (Object.keys(GEAR_RAW) as SkillId[]).flatMap((skill) =>
  GEAR_RAW[skill].map((name, i) => {
    const t = GEAR_TIERS[i];
    return {
      id: `${skill}_gear_${i}`,
      name,
      skill,
      level: t.level,
      success: t.success,
      cash: t.cash,
      price: Math.round(cashPerHour(t.level) * SKILL_BY_ID[skill].cashMult * t.hours),
    };
  }),
);
export const GEAR_BY_ID: Record<string, GearDef> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

// ---------- Upgrades (the idle-quality-of-life tree) ----------
export interface UpgradeDef {
  id: string;
  name: string;
  desc: (lvl: number) => string;
  max: number;
  cost: (lvl: number) => number;
}
export const UPGRADES: UpgradeDef[] = [
  { id: 'shift', name: 'Planning Board', desc: (l) => `Queue up to ${shiftHours(l)}h of jobs per crew member`, max: 5, cost: (l) => Math.round(1_000 * Math.pow(6, l)) },
  { id: 'lawyer', name: 'Lawyer on Retainer', desc: (l) => `Jail time -${l * 12}%`, max: 5, cost: (l) => Math.round(2_000 * Math.pow(5, l)) },
  { id: 'safehouse', name: 'Safehouse', desc: (l) => `Heat cools ${Math.round(l * 30)}% faster`, max: 5, cost: (l) => Math.round(1_500 * Math.pow(5, l)) },
  { id: 'garage', name: 'Garage Space', desc: (l) => `Store ${garageCap(l)} cars`, max: 6, cost: (l) => Math.round(3_000 * Math.pow(4, l)) },
  { id: 'fence', name: 'Fence Connections', desc: (l) => `Sell loot & cars for +${l * 10}%`, max: 5, cost: (l) => Math.round(2_500 * Math.pow(5, l)) },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<string, UpgradeDef>;
export function shiftHours(lvl: number) {
  return [2, 4, 6, 8, 12, 24][lvl] ?? 24;
}
export function garageCap(lvl: number) {
  return 4 + lvl * 4;
}

// ---------- Fronts: passive income businesses ----------
export interface FrontDef {
  id: string;
  name: string;
  totalLevel: number;
  baseCost: number;
  incomePerLevel: number; // $ per hour per level
}
export const FRONTS: FrontDef[] = [
  { id: 'newsstand', name: 'Newsstand', totalLevel: 0, baseCost: 500, incomePerLevel: 60 },
  { id: 'laundromat', name: 'Laundromat', totalLevel: 25, baseCost: 6_000, incomePerLevel: 500 },
  { id: 'pizzeria', name: 'Pizzeria', totalLevel: 60, baseCost: 60_000, incomePerLevel: 3_500 },
  { id: 'nightclub', name: 'Nightclub', totalLevel: 120, baseCost: 600_000, incomePerLevel: 25_000 },
  { id: 'casino', name: 'Casino', totalLevel: 220, baseCost: 7_000_000, incomePerLevel: 200_000 },
  { id: 'shipping', name: 'Shipping Company', totalLevel: 350, baseCost: 90_000_000, incomePerLevel: 1_800_000 },
];
export const FRONT_BY_ID = Object.fromEntries(FRONTS.map((f) => [f.id, f])) as Record<string, FrontDef>;
export const FRONT_MAX_LEVEL = 10;
/** Fronts stop accruing after this many hours uncollected — a gentle "come back" nudge. */
export const FRONT_CAP_HOURS = 12;
export function frontCost(f: FrontDef, lvl: number) {
  return Math.round(f.baseCost * Math.pow(1.6, lvl));
}
