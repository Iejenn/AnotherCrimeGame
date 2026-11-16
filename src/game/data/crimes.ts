// Street Crimes v2, levels 1–30: a new crime every 5 levels (docs/design.md §4, from docs/street-crimes-v1.xlsx).
// One tap = one attempt. Each attempt takes a number of game ticks of 0.5s.
// Numbers are hand-set so they're easy to tune: change a row, everything else follows.
// XP is the designer's proposal (to tune). Failures give no XP.
import type { SkillId } from '../types';

/** One game tick = half a second. Every crime takes a fixed number of ticks per attempt. */
export const TICK_SECONDS = 0.5;
/** Eating one food item takes 1 tick. */
export const EAT_SECONDS = TICK_SECONDS;
/** When an NPC catches you, this long passes between his yell and his punch (he walks over meanwhile). */
export const CATCH_SECONDS = 1.6;

export type SpotKind = 'person' | 'bag' | 'shelf' | 'meter' | 'car';

/**
 * Who reacts to you:
 * - 'clerk': a shop clerk. A failed attempt = the clerk catches you.
 * - 'bartender' / 'guard': they watch. The attempt always works unless they see you mid-attempt;
 *   then they catch you. (Steal From Cars also has its own odds: a failed attempt brings the guard.)
 */
export type Catcher = 'clerk' | 'bartender' | 'guard';

export interface CrimeDef {
  id: string;
  skill: SkillId;
  name: string;
  level: number;
  /** Game ticks per attempt (× 0.5s). */
  ticks: number;
  /** Seconds per attempt (ticks × 0.5). */
  duration: number;
  /** Success chance at exactly the required level. It then rises 0.5% per level above that. 1 = always works. */
  baseChance: number;
  xp: number;
  /** Dollars on success (0–0 for shoplifting, which gives food instead). */
  cashMin: number;
  cashMax: number;
  /** Food on success: one of these item ids, picked at random. */
  items?: string[];
  /** Health lost and seconds stunned on a failed attempt, or when you get caught. */
  failDamage: number;
  failStun: number;
  catcher?: Catcher;
  /** What the catcher yells. */
  yell?: string;
  /** A spot you succeeded at is empty for this many seconds (shelves, meters). */
  refill?: number;
  /** What it looks like on the Street, what one spot is called, and where to find them. */
  spot: { kind: SpotKind; label: string; where: string };
  flavor: string[];
  failLines: string[];
}

export const CRIMES: CrimeDef[] = [
  {
    id: 'pick_tourist', skill: 'street', name: 'Pickpocket Tourists', level: 1, ticks: 4, duration: 0, baseChance: 0.65, xp: 3,
    cashMin: 1, cashMax: 3, failDamage: 1, failStun: 2,
    spot: { kind: 'person', label: 'Tourist', where: 'The park' },
    flavor: ['Two fingers, one wallet. The tourist never felt a thing.', 'You lifted a few dollars off a tourist admiring the fountain.', 'Bumped into a tourist. Walked off richer.'],
    failLines: ['The tourist grabbed your wrist and shoved you away.', 'The tourist spun around and swung a camera at your head.'],
  },
  {
    id: 'gym_bags', skill: 'street', name: 'Raid Gym Bags', level: 5, ticks: 4, duration: 0, baseChance: 0.55, xp: 5,
    cashMin: 2, cashMax: 6, failDamage: 1, failStun: 2,
    spot: { kind: 'bag', label: 'Gym bag', where: 'The basketball court' },
    flavor: ['You fished some cash out of a gym bag while they were busy dunking.', 'Sweaty socks, a towel, and a few dollars. You took the dollars.'],
    failLines: ['A loose ball smacked you in the head. "Hands off the bags!"', 'One of the players saw you and shoved you into the fence.'],
  },
  {
    id: 'candy_store', skill: 'street', name: 'Shoplift Candy Store', level: 10, ticks: 4, duration: 0, baseChance: 0.4, xp: 10,
    cashMin: 0, cashMax: 0, items: ['candy_bar'], failDamage: 1, failStun: 2, catcher: 'clerk', yell: 'Hey!', refill: 10,
    spot: { kind: 'shelf', label: 'Candy shelf', where: 'The candy store' },
    flavor: ['A candy bar slides up your sleeve.', 'You pocketed a candy bar while the clerk counted change.'],
    failLines: ['The clerk saw you reach for the shelf.'],
  },
  {
    id: 'pick_drunk', skill: 'street', name: 'Pickpocket Drunks', level: 15, ticks: 6, duration: 0, baseChance: 1, xp: 8,
    cashMin: 10, cashMax: 20, failDamage: 2, failStun: 3, catcher: 'bartender', yell: 'Leave my guests alone!',
    spot: { kind: 'person', label: 'Drunk', where: 'The bar' },
    flavor: ['The drunk was busy singing. His wallet was not.', 'You lifted a fat tip jar worth of cash off a snoring regular.'],
    failLines: ['The bartender saw you.'],
  },
  {
    id: 'parking_meter', skill: 'street', name: 'Pry Open Parking Meters', level: 20, ticks: 6, duration: 0, baseChance: 1, xp: 7,
    cashMin: 15, cashMax: 30, failDamage: 3, failStun: 4, catcher: 'guard', yell: 'I saw that!', refill: 15,
    spot: { kind: 'meter', label: 'Parking meter', where: 'The parking lot' },
    flavor: ['A screwdriver, a twist, and a pile of quarters.', 'The meter coughed up its coins.'],
    failLines: ['The guard spotted you at the meter.'],
  },
  {
    id: 'gas_station', skill: 'street', name: 'Shoplift Gas Station', level: 25, ticks: 4, duration: 0, baseChance: 0.4, xp: 21,
    cashMin: 0, cashMax: 0, items: ['sandwich', 'candy_bar'], failDamage: 2, failStun: 2, catcher: 'clerk', yell: 'Hey!', refill: 10,
    spot: { kind: 'shelf', label: 'Shelf', where: 'The gas station' },
    flavor: ['Into the jacket it goes.', 'You strolled out past the pumps with lunch.'],
    failLines: ['The clerk saw you in the security mirror.'],
  },
  {
    id: 'steal_car', skill: 'street', name: 'Steal From Cars', level: 30, ticks: 6, duration: 0, baseChance: 0.35, xp: 56,
    cashMin: 30, cashMax: 60, failDamage: 3, failStun: 4, catcher: 'guard', yell: 'I saw that!',
    spot: { kind: 'car', label: 'Parked car', where: 'The parking lot' },
    flavor: ['Glovebox cash and a forgotten wallet.', 'Unlocked. They always leave one unlocked.'],
    failLines: ['The car alarm went off.'],
  },
].map((c) => ({ ...c, skill: c.skill as SkillId, duration: c.ticks * TICK_SECONDS }) as CrimeDef);

export const CRIME_BY_ID: Record<string, CrimeDef> = Object.fromEntries(CRIMES.map((c) => [c.id, c]));
export const crimesForSkill = (skill: SkillId) => CRIMES.filter((c) => c.skill === skill);
