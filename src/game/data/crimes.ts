import type { SkillId } from '../types';
import { cashPerHour, crimeXp } from '../xp';
import { SKILL_BY_ID } from './skills';

export interface CrimeDef {
  id: string;
  skill: SkillId;
  name: string;
  level: number;
  /** Seconds per attempt. */
  duration: number;
  /** Success chance at exactly the required level (rises as you out-level it). */
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
  /** Car theft only: range of car classes this job can yield. */
  carClasses?: [number, number];
  flavor: string[];
}

type Raw = [
  id: string,
  name: string,
  level: number,
  duration: number,
  baseChance: number,
  risk: number,
  heat: number,
  flavor: string[],
  carClasses?: [number, number],
];

const M = 60;
const H = 3600;

// Each skill has 7 crimes at these level gates.
const RAW: Record<SkillId, Raw[]> = {
  petty: [
    ['pick_wallet', 'Lift a Wallet', 1, 10, 0.85, 0.15, 1, ['You lifted a wallet off {mark} near {place}.', 'Two fingers, one wallet. {mark} never felt a thing.', 'Bumped into {mark} at {place}. Walked off richer.']],
    ['shoplift', 'Shoplift Electronics', 8, 30, 0.82, 0.2, 1, ['Earbuds in the sleeve, charger in the sock. Out the door at {place}.', 'You walked out of a store at {place} with a tablet under your jacket.']],
    ['shell_game', 'Run a Shell Game', 18, 2 * M, 0.8, 0.2, 2, ['The pea was never under any cup. {mark} lost big at {place}.', 'You hustled a crowd at {place}. Three rounds, three suckers.']],
    ['fake_charity', 'Fake Charity Drive', 30, 5 * M, 0.8, 0.22, 2, ['Clipboard, lanyard, sad story. {place} was generous today.', '{mark} donated twice. "For the orphans."']],
    ['ticket_scalp', 'Counterfeit Ticket Hustle', 45, 15 * M, 0.78, 0.25, 3, ['Sold a stack of fake stadium tickets outside {place}.', 'The concert was sold out. Your printer was not.']],
    ['boutique', 'Boost a Luxury Boutique', 62, 30 * M, 0.76, 0.28, 4, ['Foil-lined bag, two handbags, zero alarms at {place}.', 'You and a decoy cleared a designer rack at {place}.']],
    ['gala', 'Work a Charity Gala', 80, H, 0.75, 0.3, 5, ['Black tie, light fingers. You worked the room at the gala like a pro.', 'Diamond earrings, a money clip and a VIP keycard. Good night.']],
  ],
  auto: [
    ['hubcaps', 'Strip Hubcaps & Mirrors', 1, 45, 0.85, 0.15, 1, ['Four hubcaps, two mirrors, one quiet street near {place}.', 'You stripped a parked car at {place} in under a minute.']],
    ['beater', 'Hotwire a Beater', 8, 2 * M, 0.82, 0.2, 2, ['Old ignition, two wires, and it coughed to life.', 'Rust and all, it drives. You rolled it out of {place}.'], [0, 0]],
    ['mall_sedan', 'Snatch a Sedan at the Mall', 18, 5 * M, 0.8, 0.22, 2, ['Parking level 3 at {place}, no cameras. Easy.', 'You followed {mark} to their car, then let them shop.'], [0, 1]],
    ['relay_suv', 'Relay-Attack a Keyless SUV', 30, 10 * M, 0.8, 0.22, 3, ['Signal boosted from the hallway. The SUV unlocked itself.', 'Two laptops and a coat-hanger antenna. Gone in sixty seconds.'], [1, 2]],
    ['valet', 'Lift a Sports Car from Valet', 45, 30 * M, 0.77, 0.25, 4, ['Red jacket, borrowed nametag, keys handed right over at {place}.', 'You parked it. Just not where they expected.'], [2, 3]],
    ['to_order', 'Steal to Order', 62, H, 0.75, 0.28, 5, ['The client wanted a specific spec. You delivered, plates swapped.', 'Tracked the target car for a week. Took it in four minutes.'], [3, 3]],
    ['showroom', 'Exotic Showroom Job', 80, 2 * H, 0.73, 0.3, 6, ['You drove a hypercar straight through the showroom glass at {place}.', 'Dealer keys, dealer plates, dealer\'s nightmare.'], [3, 4]],
  ],
  burglary: [
    ['shed', 'Rob a Garden Shed', 1, M, 0.85, 0.15, 1, ['Power tools and a bike from a shed off {place}.', 'The padlock was decorative. The tools were not.']],
    ['corner_store', 'Break into a Corner Store', 8, 3 * M, 0.82, 0.2, 2, ['Back door, crowbar, register drawer.', 'Cigarettes, lottery tickets and the float from a store near {place}.']],
    ['suburb_house', 'Hit a Suburban House', 18, 8 * M, 0.8, 0.22, 2, ['The family was on holiday. Their mail told you so.', 'Spare key under the gnome. Every time.']],
    ['loft', 'Loft Apartment Job', 30, 20 * M, 0.78, 0.25, 3, ['Fire escape, open window, a loft full of art near {place}.', 'You posed as a mover. The doorman helped carry.']],
    ['pharmacy', 'Pharmacy After Hours', 45, 45 * M, 0.77, 0.27, 4, ['Through the roof vent and straight to the safe.', 'In and out in twelve minutes. A record.']],
    ['penthouse', 'Penthouse Climb', 62, 1.5 * H, 0.75, 0.28, 5, ['Forty floors up, rope and nerve. The penthouse safe opened on the third try.', 'Window washer rig, a glass cutter, and a very rich view.']],
    ['private_vault', 'Crack a Private Vault', 80, 3 * H, 0.73, 0.3, 6, ['A collector\'s private vault, three locks deep. You beat all three.', 'Stethoscope, patience, click. The vault swung open.']],
  ],
  muscle: [
    ['late_payer', 'Lean on a Late Payer', 1, 30, 0.85, 0.15, 1, ['A firm word with {mark}. They found the money fast.', 'You cracked your knuckles. That was enough.']],
    ['street_tax', 'Collect Street Tax', 8, 90, 0.82, 0.18, 1, ['Every corner pays. Every corner paid.', 'You walked the block at {place} collecting envelopes.']],
    ['bar_racket', 'Bar Protection Racket', 18, 5 * M, 0.8, 0.2, 2, ['"Nice bar. Shame if something happened to it." The owner paid.', 'Three bars, three envelopes. Nobody argued.']],
    ['fight_night', 'Bare-Knuckle Fight Night', 30, 12 * M, 0.78, 0.22, 2, ['You took the dive in round three. The bookies paid out.', 'Knocked out the local champion behind {place}. The house loved it.']],
    ['witness', 'Persuade a Witness', 45, 30 * M, 0.76, 0.25, 4, ['The witness developed sudden amnesia.', 'One visit, one conversation, case dismissed.']],
    ['convoy', 'Escort a Convoy', 62, H, 0.75, 0.25, 4, ['Three trucks, zero problems. The client paid in full.', 'A rival crew tried to hit the convoy. They regret it.']],
    ['turf_war', 'Settle a Turf War', 80, 2 * H, 0.73, 0.3, 6, ['Two crews, one sit-down, your terms.', 'By sunrise the whole district at {place} answered to you.']],
  ],
  fraud: [
    ['phishing', 'Phishing Blast', 1, 2 * M, 0.85, 0.12, 1, ['10,000 emails, 14 clicks, 3 card numbers.', '"Your package could not be delivered." Works every time.']],
    ['skimmer', 'Card Skimmer at a Gas Station', 8, 5 * M, 0.82, 0.18, 2, ['Your skimmer harvested a full day of cards near {place}.', 'A pinhole camera and a fake keypad. Card heaven.']],
    ['fake_store', 'Fake Online Store', 18, 15 * M, 0.8, 0.18, 2, ['Sneakers that do not exist, sold to people who will not get them.', 'Your fake store hit the front page of a deals site.']],
    ['insurance', 'Insurance Fraud', 30, 30 * M, 0.78, 0.22, 3, ['A "stolen" boat, a tearful claim, a fat payout.', 'Staged crash, cooperative witnesses, generous insurer.']],
    ['romance', 'Romance Scam Ring', 45, H, 0.77, 0.2, 3, ['"Darling, I just need a little help with customs fees."', 'Five call-center workers, fifty broken hearts, one fat account.']],
    ['rug_pull', 'Crypto Rug Pull', 62, 2 * H, 0.75, 0.25, 4, ['$MOON went up 4,000%. Then you pulled the liquidity.', 'Influencers shilled it. You cashed out at the top.']],
    ['wire_fraud', 'Wire Fraud on a Bank', 80, 4 * H, 0.72, 0.3, 6, ['SWIFT messages, forged approvals, offshore landing.', 'You moved millions through six shell companies before lunch.']],
  ],
  smuggling: [
    ['cigs', 'Run Cigarettes Across County', 1, 5 * M, 0.85, 0.15, 1, ['A trunk full of untaxed smokes, delivered to {place}.', 'County line, no checkpoints, full payment.']],
    ['bootleg', 'Bootleg Liquor Run', 8, 10 * M, 0.82, 0.18, 2, ['Moonshine in milk crates. The speakeasy at {place} is stocked.', 'You out-ran a state trooper with a car full of rum.']],
    ['knockoffs', 'Knockoff Designer Shipment', 18, 30 * M, 0.8, 0.2, 2, ['Two thousand "designer" bags cleared the port.', 'Labels sewn in a warehouse near {place}. Sold as genuine.']],
    ['fuel', 'Untaxed Fuel Tanker', 30, H, 0.78, 0.22, 3, ['A tanker of red diesel, magically turned white.', 'The tanker crossed the border at 3am. Nobody checked.']],
    ['art_customs', 'Stolen Art Through Customs', 45, 2 * H, 0.76, 0.25, 4, ['A masterpiece rolled up inside a cheap poster tube.', 'Declared as "reproduction". It was not.']],
    ['container', 'Container Ship Switch', 62, 4 * H, 0.74, 0.27, 5, ['Container numbers swapped at the port. Your cargo sailed free.', 'You bribed a crane operator. One box went missing.']],
    ['gold_run', 'Cross-Border Gold Run', 80, 6 * H, 0.72, 0.3, 6, ['Gold bars hidden in engine blocks. Clean border crossing.', 'A private jet, a dirt strip, and very heavy luggage.']],
  ],
  robbery: [
    ['gas_station', 'Stick Up a Gas Station', 1, 3 * M, 0.82, 0.25, 3, ['In, out, and the register is empty.', 'Ski mask, steady voice, fast exit from {place}.']],
    ['liquor_store', 'Rob a Liquor Store', 8, 10 * M, 0.8, 0.27, 3, ['The clerk emptied the safe without being asked twice.', 'You even grabbed a bottle of the good stuff.']],
    ['pawn_shop', 'Hold Up a Pawn Shop', 18, 20 * M, 0.78, 0.28, 4, ['A pawn shop has everything. Now you do.', 'Gold, watches, and the owner\'s "special" drawer.']],
    ['jewelry', 'Jewelry Store Smash', 30, 45 * M, 0.76, 0.3, 5, ['Sledgehammers, display cases, ninety seconds.', 'You smashed and grabbed at {place} before the shutters dropped.']],
    ['casino_cage', 'Casino Cage Robbery', 45, 1.5 * H, 0.75, 0.3, 5, ['You walked out of the casino cage with chips and cash.', 'Fake fire alarm, real robbery.']],
    ['armored', 'Armored Truck Ambush', 62, 3 * H, 0.73, 0.32, 6, ['Spike strip, two cars, one very full armored truck.', 'The guards decided the money was not worth it.']],
    ['bank_branch', 'Bank Branch Takeover', 80, 6 * H, 0.7, 0.35, 8, ['Everyone on the floor. Vault open in four minutes.', 'Classic bank job. Clean exit through the sewer.']],
  ],
  heist: [
    ['gallery_swap', 'The Gallery Swap', 1, 15 * M, 0.78, 0.3, 4, ['You swapped a painting for a forgery during the gala. Nobody noticed.', 'The forgery is hanging in the gallery right now.']],
    ['train_car', 'Train Car Hit', 8, 30 * M, 0.77, 0.3, 4, ['Decoupled the cargo car on a mountain pass.', 'You rode the train in, the cargo rode out with you.']],
    ['museum', 'Museum Night Job', 18, H, 0.76, 0.3, 5, ['Through the skylight, past the lasers, out with the artifact.', 'The museum security guard was on your payroll.']],
    ['diamond_exchange', 'Diamond Exchange', 30, 2 * H, 0.75, 0.32, 5, ['A tunnel under the diamond exchange, months in the making.', 'You walked out with a velvet bag worth a fortune.']],
    ['fed_depot', 'Federal Reserve Depot', 45, 4 * H, 0.73, 0.33, 6, ['Crates of old notes scheduled for shredding. You shredded nothing.', 'Uniforms, forged transfer orders, and a very big truck.']],
    ['casino_vault', 'Casino Vault', 62, 6 * H, 0.72, 0.35, 7, ['Eleven specialists, one vault, zero mistakes.', 'The house always wins. Not tonight.']],
    ['the_mint', 'The Mint', 80, 8 * H, 0.7, 0.38, 8, ['You did not rob the mint. You printed your own money inside it.', 'The heist of the century. They will make a show about this.']],
  ],
};

function build(skill: SkillId, r: Raw): CrimeDef {
  const [id, name, level, duration, baseChance, risk, heat, flavor, carClasses] = r;
  // Expected cash per success so that cash/hour roughly follows cashPerHour(level).
  const avg = (cashPerHour(level) * SKILL_BY_ID[skill].cashMult * duration) / 3600 / baseChance;
  // Jail time scales with how heavy the crime is (min 30s, max 2h).
  const jail = Math.round(Math.min(2 * H, Math.max(30, duration * 1.5 + level * 15)));
  return {
    id,
    skill,
    name,
    level,
    duration,
    baseChance,
    risk,
    heat,
    jail,
    xp: crimeXp(level, duration),
    cashMin: Math.max(1, Math.round(avg * 0.6)),
    cashMax: Math.max(2, Math.round(avg * 1.4)),
    carClasses,
    flavor,
  };
}

export const CRIMES: CrimeDef[] = (Object.keys(RAW) as SkillId[]).flatMap((skill) => RAW[skill].map((r) => build(skill, r)));
export const CRIME_BY_ID: Record<string, CrimeDef> = Object.fromEntries(CRIMES.map((c) => [c.id, c]));
export const crimesForSkill = (skill: SkillId) => CRIMES.filter((c) => c.skill === skill);
