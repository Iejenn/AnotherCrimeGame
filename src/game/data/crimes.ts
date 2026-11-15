// Street Crimes, levels 1–9. Numbers are hand-set so they're easy to tune:
// change a row, everything else (Skills guide, Street labels) follows.
import type { SkillId } from '../types';

export type SpotKind = 'person' | 'car' | 'door' | 'crate' | 'table';

export interface CrimeDef {
  id: string;
  skill: SkillId;
  name: string;
  level: number;
  /** Seconds per attempt. */
  duration: number;
  /** Success chance at exactly the required level (rises a little as you out-level it). */
  baseChance: number;
  /** Chance a failure turns into a bust (jail). */
  risk: number;
  /** Heat added per attempt. */
  heat: number;
  /** Seconds in jail on a bust. */
  jail: number;
  xp: number;
  cashMin: number;
  cashMax: number;
  /** What it looks like on the Street, and what the spot is called. */
  spot: { kind: SpotKind; label: string };
  flavor: string[];
}

type Row = [id: string, name: string, level: number, duration: number, baseChance: number, risk: number, heat: number, jail: number, xp: number, cashMin: number, cashMax: number, kind: SpotKind, label: string, flavor: string[]];

const ROWS: Row[] = [
  ['pick_wallet', 'Lift a Wallet', 1, 6, 0.85, 0.12, 1, 15, 5, 1, 3, 'person', 'Tourist', ['You lifted a wallet off {mark} near {place}.', 'Two fingers, one wallet. {mark} never felt a thing.']],
  ['shoplift', 'Shoplift Snacks', 2, 8, 0.82, 0.15, 1, 20, 8, 2, 5, 'door', 'Corner shop', ['Crisps in the jacket, soda in the sleeve. Out the door.', 'You walked out of the corner shop with a full hoodie.']],
  ['hubcaps', 'Strip Hubcaps', 3, 10, 0.8, 0.15, 2, 25, 12, 4, 8, 'car', 'Parked car', ['Four hubcaps, one quiet street near {place}.', 'You stripped a parked car in under a minute.']],
  ['shell_game', 'Run a Shell Game', 4, 12, 0.8, 0.18, 2, 30, 16, 5, 10, 'table', 'Card table', ['The pea was never under any cup. {mark} lost big.', 'You hustled a crowd at {place}. Three rounds, three suckers.']],
  ['purse_snatch', 'Snatch a Purse', 5, 10, 0.78, 0.2, 3, 35, 18, 6, 12, 'person', 'Shopper', ['A quick grab and you were gone before {mark} turned around.', 'You snatched a designer purse outside {place}.']],
  ['shed', 'Burgle a Garden Shed', 6, 15, 0.78, 0.2, 3, 40, 26, 10, 18, 'door', 'Garden shed', ['Power tools and a bike from a shed off {place}.', 'The padlock was decorative. The tools were not.']],
  ['beater', 'Hotwire a Beater', 7, 20, 0.76, 0.22, 4, 45, 36, 14, 26, 'car', 'Rusty beater', ['Old ignition, two wires, and it coughed to life.', 'Rust and all, it drives. You sold it to a chop shop.']],
  ['corner_store', 'Break into a Corner Store', 8, 25, 0.75, 0.25, 4, 50, 48, 20, 35, 'door', 'Corner store', ['Back door, crowbar, register drawer.', 'Cigarettes, lottery tickets and the float from the till.']],
  ['mug_banker', 'Mug a Banker', 9, 25, 0.72, 0.28, 5, 60, 60, 28, 45, 'person', 'Banker', ['A firm word in a dark alley. The banker handed it all over.', "You relieved {mark}'s banker friend of a fat wallet."]],
];

export const CRIMES: CrimeDef[] = ROWS.map(([id, name, level, duration, baseChance, risk, heat, jail, xp, cashMin, cashMax, kind, label, flavor]) => ({
  id, skill: 'street', name, level, duration, baseChance, risk, heat, jail, xp, cashMin, cashMax, spot: { kind, label }, flavor,
}));
export const CRIME_BY_ID: Record<string, CrimeDef> = Object.fromEntries(CRIMES.map((c) => [c.id, c]));
export const crimesForSkill = (skill: SkillId) => CRIMES.filter((c) => c.skill === skill);
