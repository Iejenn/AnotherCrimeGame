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

/** What you're working right now. It repeats until you walk away (active play only). */
export interface Job {
  crimeId: string;
  /** When the current attempt started (for progress bars). */
  startedAt: number;
  /** When the current attempt finishes. */
  endsAt: number;
  /** Attempts finished so far on this job. */
  attempts: number;
}

export interface PlayerState {
  job: Job | null;
  jailedUntil: number;
}

export type BuffKind = 'cash' | 'xp' | 'success' | 'crit';

export interface Buff {
  id: string;
  label: string;
  kind: BuffKind;
  value: number;
  uses: number;
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
  cash: number;
  heat: number;
  heatAt: number;
  /** Health. Failed jobs hurt a little; it regenerates over time (see hpAt). */
  hp: number;
  hpAt: number;
  skills: Record<SkillId, SkillState>;
  player: PlayerState;
  /** Loot item id → how many. Each different item takes one inventory slot. */
  inventory: Record<string, number>;
  buffs: Buff[];
  stats: { jobs: number; busts: number; bigScores: number; earned: number; fails: number };
  log: LogEntry[];
  nextId: number;
}

/** Things that happened during a tick — used for the floating text over your character. */
export interface Report {
  jobs: number;
  cash: number;
  xp: Partial<Record<SkillId, number>>;
  levelUps: { skill: SkillId; level: number }[];
  busts: number;
  bigScores: number;
  loot: string[];
  events: string[];
  /** Health lost to failed jobs. */
  damage: number;
}

export function emptyReport(): Report {
  return { jobs: 0, cash: 0, xp: {}, levelUps: [], busts: 0, bigScores: 0, loot: [], events: [], damage: 0 };
}
