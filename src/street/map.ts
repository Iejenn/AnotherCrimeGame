// The city grid. Roads are 2 tiles wide every 7 tiles; the 5×5 squares between them are blocks.
// Each crime family owns one block, with its 7 crimes as tappable spots around it.
// Low-level families sit near the spawn point; heavier ones are further out.
import type { SkillId } from '../game/types';
import { crimesForSkill } from '../game/data/crimes';
import { mulberry32 } from '../game/rng';

export const BLOCK = 7;
export const COLS = 6;
export const ROWS = 5;
export const W = COLS * BLOCK + 2;
export const H = ROWS * BLOCK + 2;

export type NodeKind = 'person' | 'car' | 'door' | 'crate' | 'table';

export interface StreetNode {
  id: string;
  crimeId: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  /** Tourists stroll around; everything else stays put. */
  wanders?: boolean;
}

export type BlockKind = { type: 'skill'; skill: SkillId } | { type: 'park' } | { type: 'building' };

// Which block belongs to which crime family. Petty Theft is in the middle, where you spawn.
const SKILL_BLOCKS: Record<SkillId, [number, number]> = {
  petty: [2, 2],
  auto: [3, 2],
  muscle: [2, 3],
  burglary: [1, 2],
  fraud: [1, 1],
  smuggling: [4, 3],
  robbery: [3, 1],
  heist: [4, 1],
};
const PARKS: [number, number][] = [[2, 1], [3, 3], [0, 4], [5, 0]];

// What each crime looks like in the street and what its spot is called.
const LOOK: Record<string, [NodeKind, string]> = {
  pick_wallet: ['person', 'Tourist'], shoplift: ['door', 'Electronics store'], shell_game: ['table', 'Card table'],
  fake_charity: ['table', 'Charity stand'], ticket_scalp: ['door', 'Stadium gate'], boutique: ['door', 'Boutique'], gala: ['door', 'Gala hall'],
  hubcaps: ['car', 'Parked hatchback'], beater: ['car', 'Rusty beater'], mall_sedan: ['car', 'Sedan'], relay_suv: ['car', 'Keyless SUV'],
  valet: ['table', 'Valet stand'], to_order: ['car', 'Sports coupe'], showroom: ['door', 'Car showroom'],
  shed: ['door', 'Garden shed'], corner_store: ['door', 'Corner store'], suburb_house: ['door', 'Family house'], loft: ['door', 'Loft apartments'],
  pharmacy: ['door', 'Pharmacy'], penthouse: ['door', 'Penthouse tower'], private_vault: ['door', "Collector's mansion"],
  late_payer: ['person', 'Late payer'], street_tax: ['person', 'Corner dealer'], bar_racket: ['door', 'Bar'], fight_night: ['door', 'Fight club'],
  witness: ['person', 'Witness'], convoy: ['car', 'Convoy truck'], turf_war: ['person', 'Rival boss'],
  phishing: ['door', 'Internet café'], skimmer: ['table', 'Gas pump'], fake_store: ['door', 'Parcel depot'], insurance: ['door', 'Insurance office'],
  romance: ['door', 'Call center'], rug_pull: ['door', 'Crypto office'], wire_fraud: ['door', 'Bank back office'],
  cigs: ['car', 'Delivery van'], bootleg: ['crate', 'Liquor crates'], knockoffs: ['crate', 'Shipping crates'], fuel: ['car', 'Fuel tanker'],
  art_customs: ['crate', 'Art crate'], container: ['crate', 'Container'], gold_run: ['door', 'Private hangar'],
  gas_station: ['door', 'Gas station'], liquor_store: ['door', 'Liquor store'], pawn_shop: ['door', 'Pawn shop'], jewelry: ['door', 'Jewelry store'],
  casino_cage: ['door', 'Casino'], armored: ['car', 'Armored truck'], bank_branch: ['door', 'Bank'],
  gallery_swap: ['door', 'Art gallery'], train_car: ['crate', 'Rail yard'], museum: ['door', 'Museum'], diamond_exchange: ['door', 'Diamond exchange'],
  fed_depot: ['door', 'Federal depot'], casino_vault: ['door', 'Casino vault'], the_mint: ['door', 'The Mint'],
};

export const SPAWN: [number, number] = [2 * BLOCK + 4, 3 * BLOCK + 1];

export function isRoad(x: number, y: number) {
  return x % BLOCK < 2 || y % BLOCK < 2;
}

export function blockAt(x: number, y: number): [number, number] {
  return [Math.floor(x / BLOCK), Math.floor(y / BLOCK)];
}

export const BLOCKS: Map<string, BlockKind> = (() => {
  const m = new Map<string, BlockKind>();
  for (let bx = 0; bx < COLS; bx++) for (let by = 0; by < ROWS; by++) m.set(`${bx},${by}`, { type: 'building' });
  for (const [skill, [bx, by]] of Object.entries(SKILL_BLOCKS)) m.set(`${bx},${by}`, { type: 'skill', skill: skill as SkillId });
  for (const [bx, by] of PARKS) m.set(`${bx},${by}`, { type: 'park' });
  return m;
})();

/** Spots around a block that face the road: 5 along the south side, then 2 on the east side. */
function slots(bx: number, by: number): [number, number][] {
  const x0 = bx * BLOCK + 2;
  const y0 = by * BLOCK + 2;
  return [
    [x0, y0 + 5], [x0 + 1, y0 + 5], [x0 + 2, y0 + 5], [x0 + 3, y0 + 5], [x0 + 4, y0 + 5],
    [x0 + 5, y0 + 1], [x0 + 5, y0 + 3],
  ];
}

export const NODES: StreetNode[] = (() => {
  const out: StreetNode[] = [];
  for (const [skill, [bx, by]] of Object.entries(SKILL_BLOCKS)) {
    const s = slots(bx, by);
    crimesForSkill(skill as SkillId).forEach((c, i) => {
      const [kind, label] = LOOK[c.id] ?? ['door', c.name];
      out.push({ id: c.id, crimeId: c.id, kind, label, x: s[i][0], y: s[i][1] });
    });
  }
  // A few extra tourists wandering around the middle of town.
  const rng = mulberry32(7);
  for (let i = 0; i < 5; i++) {
    let x = 0;
    let y = 0;
    do {
      x = 9 + Math.floor(rng() * 20);
      y = 9 + Math.floor(rng() * 20);
    } while (!isRoad(x, y) || out.some((n) => n.x === x && n.y === y));
    out.push({ id: `tourist_${i}`, crimeId: 'pick_wallet', kind: 'person', label: 'Tourist', x, y, wanders: true });
  }
  return out;
})();

/** Tiles you can't walk through: everything that isn't road or park, plus fixed spots. */
export function buildBlocked(): Uint8Array {
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isRoad(x, y)) continue;
      const kind = BLOCKS.get(blockAt(x, y).join(','));
      if (kind?.type !== 'park') g[y * W + x] = 1;
    }
  for (const n of NODES) if (!n.wanders) g[n.y * W + n.x] = 1;
  return g;
}
