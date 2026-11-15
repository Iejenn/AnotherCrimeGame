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

export interface Job {
  crimeId: string;
  /** When the current attempt started (for progress bars). */
  startedAt: number;
  /** When the current attempt finishes. Locked in at the start of the attempt. */
  endsAt: number;
  repsLeft: number;
  repsDone: number;
}

/** The player. Kept as a list (with one entry) so the job timer code stays simple. */
export interface CrewMember {
  id: string;
  name: string;
  isPlayer: boolean;
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
  /** Crime id → successful attempts (for mastery stars). */
  mastery: Record<string, number>;
  crew: CrewMember[];
  /** Loot item id → how many. Each different item takes one inventory slot. */
  inventory: Record<string, number>;
  buffs: Buff[];
  stats: { jobs: number; busts: number; bigScores: number; earned: number; fails: number };
  log: LogEntry[];
  lastSeen: number;
  nextId: number;
}

/** Things that happened during a tick — used for floating text and the "since you left" report. */
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
