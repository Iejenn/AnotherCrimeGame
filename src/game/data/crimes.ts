// Street Crimes, levels 1–30: a new crime every 5 levels (docs/design.md §4).
// One tap = one attempt. Each attempt takes a number of game ticks of 0.5s.
// Numbers are hand-set so they're easy to tune: change a row, everything else follows.
// XP: a pickpocket earns 5,400 XP/h if every attempt succeeds (3 XP per 2s), and 150 successes take you
// from level 1 to 10. Every next crime earns about 30% more XP per hour (docs/design.md §4). Failures give no XP.
import type { SkillId } from '../types';

/** One game tick = half a second. Every crime takes a fixed number of ticks per attempt. */
export const TICK_SECONDS = 0.5;
/** After a failed attempt you're stunned for this long and can't start another. */
export const STUN_SECONDS = 2;
/** Eating one food item takes 1 tick. */
export const EAT_SECONDS = TICK_SECONDS;

export type SpotKind = 'person' | 'car' | 'door' | 'crate' | 'table';

export interface CrimeDef {
  id: string;
  skill: SkillId;
  name: string;
  level: number;
  /** Game ticks per attempt (× 0.5s). */
  ticks: number;
  /** Seconds per attempt (ticks × 0.5). */
  duration: number;
  /** Success chance at exactly the required level (65% for every crime). It then rises 0.5% per level above that. */
  baseChance: number;
  xp: number;
  cashMin: number;
  cashMax: number;
  /** What it looks like on the Street, and what the spot is called. */
  spot: { kind: SpotKind; label: string };
  flavor: string[];
}

type Row = [id: string, name: string, level: number, ticks: number, baseChance: number, xp: number, cashMin: number, cashMax: number, kind: SpotKind, label: string, flavor: string[]];

const ROWS: Row[] = [
  ['pick_wallet', 'Lift a Wallet', 1, 4, 0.65, 3, 1, 3, 'person', 'Tourist', ['You lifted a wallet off {mark} near {place}.', 'Two fingers, one wallet. {mark} never felt a thing.', 'Bumped into {mark}. Walked off richer.']],
  ['shoplift', 'Shoplift', 5, 5, 0.65, 5, 2, 5, 'door', 'Corner shop', ['Crisps in the jacket, soda in the sleeve. Out the door.', 'You walked out of the corner shop with a full hoodie.']],
  ['strip_car', 'Strip a Parked Car', 10, 6, 0.65, 8, 4, 9, 'car', 'Parked car', ['Hubcaps, mirrors and a stereo from a car near {place}.', 'You stripped a parked car in under a minute.']],
  ['shell_game', 'Run a Shell Game', 15, 7, 0.65, 12, 6, 14, 'table', 'Card table', ['The pea was never under any cup. {mark} lost big.', 'You hustled a crowd at {place}. Three rounds, three suckers.']],
  ['burgle_house', 'Burgle a House', 20, 8, 0.65, 17, 10, 22, 'door', 'Family house', ['The family was on holiday. Their mail told you so.', 'Spare key under the gnome. Every time.']],
  ['rob_store', 'Rob a Corner Store', 25, 10, 0.65, 28, 18, 36, 'door', 'Corner store', ['Back door, crowbar, register drawer.', 'Cigarettes, lottery tickets and the float from the till.']],
  ['mug_banker', 'Mug a Banker', 30, 12, 0.65, 43, 30, 60, 'person', 'Banker', ['A firm word in a dark alley. The banker handed it all over.', "You relieved {mark}'s banker friend of a fat wallet."]],
];

export const CRIMES: CrimeDef[] = ROWS.map(([id, name, level, ticks, baseChance, xp, cashMin, cashMax, kind, label, flavor]) => ({
  id, skill: 'street', name, level, ticks, duration: ticks * TICK_SECONDS, baseChance, xp, cashMin, cashMax, spot: { kind, label }, flavor,
}));
export const CRIME_BY_ID: Record<string, CrimeDef> = Object.fromEntries(CRIMES.map((c) => [c.id, c]));
export const crimesForSkill = (skill: SkillId) => CRIMES.filter((c) => c.skill === skill);
