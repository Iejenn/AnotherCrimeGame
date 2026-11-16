export type SkillId = 'melee' | 'defense' | 'gunfire' | 'health' | 'street';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface SkillState {
  xp: number;
}

/** What your character looks like. Each value is an index into the option lists in street/character.ts. */
export interface Look {
  skin: number;
  hair: number;
  hairColor: number;
  top: number;
  bottom: number;
}

/** The attempt you're doing right now. One tap = one attempt; it does not repeat. */
export interface Job {
  crimeId: string;
  /** When the attempt started (for the progress bar). */
  startedAt: number;
  /** When it finishes. */
  endsAt: number;
  /** Which spot on the Street (a shelf, a meter…), so an emptied one can't be used again right away. */
  spotId?: string;
  /** The tile you stand on while doing it (the guard checks whether his flashlight reaches you there). */
  pos?: [number, number] | null;
}

export interface PlayerState {
  job: Job | null;
  /** After a failed attempt you're stunned until this time and can't start another. */
  stunnedUntil: number;
  /** Eating takes 1 tick: you can't start a crime or eat again until this time. */
  eatingUntil: number;
  /** An NPC caught you and is on his way to hit you (the hit lands CATCH_SECONDS after `at`). */
  caught?: { crimeId: string; at: number } | null;
  /** Spot id → time it's full again (shelves you emptied, meters you pried open). */
  emptySpots?: Record<string, number>;
  /** The Street tile you're standing on (kept when you switch tabs or reload). null = at the start. */
  pos?: [number, number] | null;
}

/** Where you died: your cash and items wait there until you collect them, or until it crumbles. */
export interface Grave {
  x: number;
  y: number;
  cash: number;
  items: Record<string, number>;
  diedAt: number;
  expiresAt: number;
}

/** A short message that pops up (level-ups, events). */
export interface Toast {
  id: number;
  text: string;
  kind: 'level' | 'big' | 'bust' | 'event';
}

export type LogKind = 'success' | 'big' | 'fail' | 'bust' | 'level' | 'event' | 'info' | 'loot';

export interface LogEntry {
  t: number;
  text: string;
  kind: LogKind;
}

export interface GameState {
  /** 2 = the 5-skill RPG (v0.7). Saves from version 1 can't be converted and start over. */
  version: 2;
  name: string;
  look: Look;
  createdAt: number;
  /** Money, in dollars. */
  cash: number;
  /** Health. Failed jobs hurt a little; it regenerates over time (see hpAt). */
  hp: number;
  hpAt: number;
  skills: Record<SkillId, SkillState>;
  player: PlayerState;
  /** Item id → how many (food stacks). Each different item takes one inventory slot. */
  inventory: Record<string, number>;
  /** Your grave, if you died and haven't collected your stuff yet. */
  grave?: Grave | null;
  stats: { jobs: number; bigScores: number; earned: number; fails: number; deaths?: number };
  log: LogEntry[];
  nextId: number;
}

/** Things that happened during a tick — used for the floating text over your character. */
export interface Report {
  jobs: number;
  cash: number;
  xp: Partial<Record<SkillId, number>>;
  levelUps: { skill: SkillId; level: number }[];
  bigScores: number;
  events: string[];
  /** Health lost to failed jobs. */
  damage: number;
  /** Failed attempts (including getting seen). */
  fails: number;
  /** You got hit (a failure, or an NPC's punch landing): drives the screen shake and "Stunned!". */
  hit: boolean;
  /** Items you got (food from shoplifting). */
  items: Record<string, number>;
  /** You died this tick (the Street moves you back to the start). */
  died: boolean;
}

export function emptyReport(): Report {
  return { jobs: 0, cash: 0, xp: {}, levelUps: [], bigScores: 0, events: [], damage: 0, fails: 0, hit: false, items: {}, died: false };
}
