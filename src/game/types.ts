export type SkillId = 'petty' | 'auto' | 'burglary' | 'muscle' | 'fraud' | 'smuggling' | 'robbery' | 'heist';

export type PerkId = 'speed' | 'greed' | 'scholar' | 'ghost' | 'lucky';
export type TraitId = 'quick' | 'lucky' | 'careful' | 'greedy' | 'bright' | 'none';
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

export interface CrewMember {
  id: string;
  name: string;
  trait: TraitId;
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

export interface Contract {
  id: string;
  label: string;
  kind: 'jobs' | 'cash' | 'big';
  skill?: SkillId;
  target: number;
  progress: number;
  /** Reward = this many hours of cash at your best level (computed at claim time, so it scales with you). */
  cashHours: number;
  /** Reward = this fraction of a level in rewardSkill (computed at claim time). */
  xpFrac: number;
  rewardSkill: SkillId;
  claimed: boolean;
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
  inventory: Record<string, number>;
  cars: Car[];
  gear: string[];
  upgrades: Record<string, number>;
  fronts: Record<string, { level: number; collectedAt: number }>;
  buffs: Buff[];
  pendingPerks: PendingPerk[];
  contracts: { day: number; list: Contract[] };
  discovered: string[];
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
