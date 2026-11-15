export type SkillId = 'petty' | 'auto' | 'burglary' | 'muscle' | 'fraud' | 'smuggling' | 'robbery' | 'heist';

export type PerkId = 'speed' | 'greed' | 'scholar' | 'ghost' | 'lucky';
export type OriginId = 'streetkid' | 'greasemonkey' | 'excon' | 'hacker' | 'dockworker';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface SkillState {
  xp: number;
  perks: PerkId[];
}

export interface Job {
  crimeId: string;
  /** When the current repetition started (for progress bars). */
  startedAt: number;
  /** When the current repetition finishes. Locked in at rep start. */
  endsAt: number;
  repsLeft: number;
  repsDone: number;
}

/** The player. Kept as a list (with one entry) so older saves and the job timer code stay simple. */
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
  skill?: SkillId;
  kind: BuffKind;
  value: number;
  uses: number;
}

export interface Car {
  id: string;
  model: string;
  cls: number; // 0..4
  value: number;
}

export type LogKind = 'success' | 'big' | 'fail' | 'bust' | 'level' | 'event' | 'info' | 'loot';

export interface LogEntry {
  t: number;
  text: string;
  kind: LogKind;
}

export interface PendingPerk {
  skill: SkillId;
  milestone: number;
  options: PerkId[];
}

export interface GameState {
  version: 1;
  name: string;
  origin: OriginId;
  createdAt: number;
  cash: number;
  heat: number;
  heatAt: number;
  skills: Record<SkillId, SkillState>;
  mastery: Record<string, number>;
  crew: CrewMember[];
  /** Loot item id → how many. Each different item takes one inventory slot. */
  inventory: Record<string, number>;
  /** Stolen cars: one inventory slot each. */
  cars: Car[];
  buffs: Buff[];
  pendingPerks: PendingPerk[];
  stats: { jobs: number; busts: number; bigScores: number; earned: number; fails: number };
  log: LogEntry[];
  lastSeen: number;
  nextId: number;
}

/** Things that happened during a tick — used for toasts and the "while you were away" report. */
export interface Report {
  jobs: number;
  cash: number;
  xp: Partial<Record<SkillId, number>>;
  levelUps: { skill: SkillId; level: number }[];
  busts: number;
  bigScores: number;
  loot: string[];
  cars: number;
  events: string[];
}

export function emptyReport(): Report {
  return { jobs: 0, cash: 0, xp: {}, levelUps: [], busts: 0, bigScores: 0, loot: [], cars: 0, events: [] };
}
