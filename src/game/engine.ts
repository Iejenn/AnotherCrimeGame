// Core game rules (docs/design.md). Plain functions on a GameState, so the same logic could
// later run server-side (e.g. a Supabase function) for anti-cheat.
import type { Buff, GameState, Look, LogKind, Report, SkillId } from './types';
import { SKILL_BY_ID, SKILL_IDS } from './data/skills';
import { CATCH_SECONDS, CRIME_BY_ID, EAT_SECONDS, type CrimeDef } from './data/crimes';
import { ITEM_BY_ID } from './data/items';
import { RANKS } from './data/world';
import { levelFromXp, MAX_LEVEL } from './xp';
import { pick, randRange, type Rng } from './rng';
import { emptyReport } from './types';

export const LOG_CAP = 150;
/** Random encounters are tuned per minute of work, so short and long crimes feel the same. */
const ENCOUNTERS_PER_MIN = 0.05;
const BIG_SCORE_CHANCE = 0.05;
/** Success chance goes up this much for every level you are above a crime's requirement. */
export const CHANCE_PER_LEVEL = 0.005;
/** RuneScape-style bag: cash takes the first slot, each different item one more (food stacks). */
export const INVENTORY_SLOTS = 28;
/** Health regenerates 1 HP per minute. Healing faster comes from food. */
const HP_REGEN_PER_MIN = 1;
/** You need at least this much health to start a job. */
export const MIN_HP_TO_WORK = 3;

// ---------------- Lookups ----------------

export const skillLevel = (s: GameState, id: SkillId) => levelFromXp(s.skills[id].xp);
export const totalLevel = (s: GameState) => SKILL_IDS.reduce((sum, id) => sum + skillLevel(s, id), 0);

export function rankFor(total: number) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (total >= RANKS[i][0]) idx = i;
  return { name: RANKS[idx][1], next: RANKS[idx + 1] ?? null, current: RANKS[idx] };
}

export function slotsUsed(s: GameState) {
  return 1 + Object.keys(s.inventory).length;
}

function buffSum(s: GameState, kind: Buff['kind']) {
  return s.buffs.filter((b) => b.kind === kind).reduce((sum, b) => sum + b.value, 0);
}

/** Max health: 10, plus 2 per Health level above 1. */
export const maxHp = (s: GameState) => 10 + 2 * (skillLevel(s, 'health') - 1);

/** Current health after regeneration up to time t (does not mutate). */
export function hpAt(s: GameState, t: number) {
  const mins = Math.max(0, t - s.hpAt) / 60000;
  return Math.min(maxHp(s), s.hp + mins * HP_REGEN_PER_MIN);
}

// ---------------- Crime stats ----------------

export interface CrimeStats {
  xp: number;
  chance: number;
  crit: number;
  /** Seconds per attempt. */
  duration: number;
  cashMult: number;
}

export function crimeStats(s: GameState, crime: CrimeDef): CrimeStats {
  const lvl = skillLevel(s, crime.skill);
  // The crime's odds at the level you unlock it, +0.5% for every level above that. Crimes at 100%
  // (the bar, the parking meters) always work: the risk there is being seen.
  const cap = crime.baseChance >= 1 ? 1 : 0.97;
  const chance = Math.min(cap, Math.max(0.05, crime.baseChance + Math.max(0, lvl - crime.level) * CHANCE_PER_LEVEL + buffSum(s, 'success')));
  return {
    xp: Math.round(crime.xp * Math.max(0.1, 1 + buffSum(s, 'xp'))),
    chance,
    crit: Math.min(0.6, BIG_SCORE_CHANCE + buffSum(s, 'crit')),
    duration: crime.duration,
    cashMult: Math.max(0.1, 1 + buffSum(s, 'cash')),
  };
}

// ---------------- New game ----------------

export function newGame(name: string, look: Look, now: number): GameState {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, { xp: 0 }])) as unknown as GameState['skills'];
  const s: GameState = {
    version: 2, name: name.trim() || 'Nobody', look, createdAt: now,
    cash: 10, hp: 10, hpAt: now,
    skills, player: { job: null, stunnedUntil: 0, eatingUntil: 0 },
    inventory: {}, buffs: [],
    stats: { jobs: 0, bigScores: 0, earned: 0, fails: 0 },
    log: [], nextId: 1,
  };
  log(s, now, `${s.name} hits the streets with $10 in their pocket.`, 'info');
  return s;
}

// ---------------- Helpers that mutate ----------------

function log(s: GameState, t: number, text: string, kind: LogKind) {
  s.log.unshift({ t, text, kind });
  if (s.log.length > LOG_CAP) s.log.length = LOG_CAP;
}

// Money is always dollars (docs/design.md §6). All numbers use en-US grouping (1,234) on purpose:
// with the device locale, Dutch phones showed "3.210", which reads like three and a bit.
export function fmtMoney(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e5) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
}

export function fmtDuration(sec: number) {
  if (sec < 10 && sec % 1) return `${sec.toFixed(1)}s`;
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ''}`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h${m ? ` ${m}m` : ''}`;
}

export function addXp(s: GameState, skill: SkillId, amount: number, t: number, report: Report) {
  const before = skillLevel(s, skill);
  s.skills[skill].xp += amount;
  report.xp[skill] = (report.xp[skill] ?? 0) + amount;
  const after = skillLevel(s, skill);
  for (let l = before + 1; l <= after; l++) {
    report.levelUps.push({ skill, level: l });
    log(s, t, `${SKILL_BY_ID[skill].name} reached level ${l}!${l === MAX_LEVEL ? ' That is the max for now.' : ''}`, 'level');
  }
}

function useBuffs(s: GameState) {
  for (const b of s.buffs) b.uses -= 1;
  s.buffs = s.buffs.filter((b) => b.uses > 0);
}

function earn(s: GameState, amount: number, report: Report) {
  s.cash += amount;
  s.stats.earned += amount;
  report.cash += amount;
}

function addBuff(s: GameState, b: Omit<Buff, 'id'>) {
  s.buffs.push({ ...b, id: `b${s.nextId++}` });
  if (s.buffs.length > 6) s.buffs.shift();
}

// ---------------- Random encounters ----------------

interface Encounter {
  text: string;
  apply: (s: GameState, t: number, rng: Rng, report: Report) => string;
}

const ENCOUNTERS: Encounter[] = [
  { text: 'An old-timer shares a few tricks.', apply: (s) => { addBuff(s, { label: "Old-timer's tricks", kind: 'xp', value: 0.5, uses: 30 }); return '+50% XP for 30 attempts'; } },
  { text: 'You find a few dollars taped under a park bench.', apply: (s, _t, r, rep) => { const c = 3 + Math.floor(r() * 8); earn(s, c, rep); return `+${fmtMoney(c)}`; } },
  { text: 'A doorman tips you off about easy marks.', apply: (s) => { addBuff(s, { label: "Doorman's tip", kind: 'success', value: 0.1, uses: 30 }); return '+10% success for 30 attempts'; } },
  { text: 'You feel a lucky streak coming on.', apply: (s) => { addBuff(s, { label: 'Lucky streak', kind: 'crit', value: 0.2, uses: 20 }); return '+20% Big Score chance for 20 attempts'; } },
];

// ---------------- Resolving one attempt ----------------

/** How each catcher hits you when he reaches you. */
const HIT_LINES: Record<string, string> = {
  clerk: 'The clerk shoves you into a shelf.',
  bartender: 'The bartender grabs you by the collar and punches you.',
  guard: 'The guard whacks you with his flashlight.',
};

/** Get hit: lose health and get stunned (a failed attempt, or an NPC's punch landing). */
function getHit(s: GameState, crime: CrimeDef, t: number, report: Report, why: string) {
  s.player.stunnedUntil = t + crime.failStun * 1000;
  s.hp = Math.max(0, hpAt(s, t) - crime.failDamage);
  s.hpAt = t;
  report.damage += crime.failDamage;
  report.hit = true;
  log(s, t, `${why} You're stunned. -${crime.failDamage} HP.`, 'fail');
  if (s.hp < MIN_HP_TO_WORK) {
    log(s, t, "You're too hurt to keep going. Eat something, or wait: health comes back slowly.", 'fail');
    report.events.push('Too hurt to work');
  }
}

/** An NPC caught you: he yells now and his hit lands a moment later (he walks over first). */
function getCaught(s: GameState, crime: CrimeDef, t: number, rng: Rng) {
  s.player.caught = { crimeId: crime.id, at: t };
  log(s, t, `${pick(rng, crime.failLines)} "${crime.yell}"`, 'fail');
}

function resolveAttempt(s: GameState, t: number, rng: Rng, report: Report) {
  const me = s.player;
  const job = me.job!;
  const crime = CRIME_BY_ID[job.crimeId];
  me.job = null; // one tap = one attempt: the job is done. Tap again for the next one.
  if (!crime) return;
  const st = crimeStats(s, crime);
  report.jobs++;
  s.stats.jobs++;

  if (rng() < st.chance) {
    // Success: dollars or food (and XP). A Big Score doubles both.
    const big = rng() < st.crit;
    const xp = st.xp * (big ? 2 : 1);
    let what = '';
    if (crime.items?.length) {
      const id = pick(rng, crime.items);
      const n = big ? 2 : 1;
      const got = giveItem(s, id, n);
      if (got) report.items[id] = (report.items[id] ?? 0) + got;
      what = got ? `+${got} ${ITEM_BY_ID[id].name}` : 'Your bag is full, so you put it back';
    } else {
      const base = Math.min(crime.cashMax, Math.floor(randRange(rng, crime.cashMin, crime.cashMax + 1)));
      const cash = Math.max(crime.cashMin, Math.round(base * st.cashMult)) * (big ? 2 : 1);
      earn(s, cash, report);
      what = `+${fmtMoney(cash)}`;
    }
    addXp(s, crime.skill, xp, t, report);
    if (big) {
      report.bigScores++;
      s.stats.bigScores++;
    }
    if (crime.refill && job.spotId) (me.emptySpots ??= {})[job.spotId] = t + crime.refill * 1000;
    log(s, t, `${big ? 'BIG SCORE — ' : ''}${pick(rng, crime.flavor)} ${what}, +${xp} XP`, big ? 'big' : 'success');
  } else {
    // Failure: no XP. Where a clerk or guard is around, he catches you; otherwise you get hurt right away.
    s.stats.fails++;
    report.fails++;
    if (crime.catcher) getCaught(s, crime, t, rng);
    else {
      getHit(s, crime, t, report, pick(rng, crime.failLines));
    }
  }
  useBuffs(s);

  if (rng() < (ENCOUNTERS_PER_MIN * st.duration) / 60) {
    const enc = pick(rng, ENCOUNTERS);
    const result = enc.apply(s, t, rng, report);
    log(s, t, `${enc.text} (${result})`, 'event');
    report.events.push(`${enc.text} (${result})`);
  }
}

/** Resolve the current attempt if it has finished by `now`, and land a pending punch. */
export function tick(prev: GameState, now: number, rng: Rng = Math.random): { state: GameState; report: Report } {
  const report = emptyReport();
  const jobDue = !!prev.player.job && prev.player.job.endsAt <= now;
  const c = prev.player.caught;
  const hitDue = !!c && c.at + CATCH_SECONDS * 1000 <= now;
  if (!jobDue && !hitDue) return { state: prev, report };
  const s = structuredClone(prev);
  if (jobDue) resolveAttempt(s, s.player.job!.endsAt, rng, report);
  const caught = s.player.caught;
  if (caught && caught.at + CATCH_SECONDS * 1000 <= now) {
    s.player.caught = null;
    const crime = CRIME_BY_ID[caught.crimeId];
    if (crime) getHit(s, crime, caught.at + CATCH_SECONDS * 1000, report, HIT_LINES[crime.catcher ?? ''] ?? 'You get hit.');
  }
  return { state: s, report };
}

/**
 * The bartender or the guard saw you mid-attempt: the attempt is lost and he's coming for you.
 * Called by the Street view, which knows where everyone is looking.
 */
export function spotted(s: GameState, now: number, rng: Rng = Math.random) {
  const job = s.player.job;
  if (!job) return;
  const crime = CRIME_BY_ID[job.crimeId];
  if (!crime?.catcher || crime.catcher === 'clerk') return;
  s.player.job = null;
  s.stats.fails++;
  getCaught(s, crime, now, rng);
}

// ---------------- Player actions (all mutate a draft) ----------------

/** Why you can't do a crime yet, or null if you can. */
export function canStart(s: GameState, crimeId: string): string | null {
  const crime = CRIME_BY_ID[crimeId];
  if (!crime) return 'Unknown job';
  if (skillLevel(s, crime.skill) < crime.level) return `Needs ${SKILL_BY_ID[crime.skill].name} level ${crime.level}`;
  return null;
}

/** Why you can't start an attempt right now (stun, eating, health), or null if you can. */
export function busyReason(s: GameState, now: number): string | null {
  const me = s.player;
  if (me.caught) return "You've been caught!";
  if (me.stunnedUntil > now) return "You're still stunned.";
  if (me.eatingUntil > now) return "You're still eating.";
  const hp = hpAt(s, now);
  if (hp < MIN_HP_TO_WORK) return `You're too hurt to work (${Math.floor(hp)} HP). You need ${MIN_HP_TO_WORK} HP: eat something, or wait.`;
  return null;
}

/** Seconds until an emptied spot (a shelf, a meter) is full again; 0 if it's full now. */
export function emptyFor(s: GameState, spotId: string, now: number) {
  const until = s.player.emptySpots?.[spotId] ?? 0;
  return until > now ? (until - now) / 1000 : 0;
}

/** Start one attempt at a crime (one tap = one attempt), optionally at a given spot. */
export function startJob(s: GameState, crimeId: string, now: number, spotId?: string) {
  const me = s.player;
  if (me.job || canStart(s, crimeId) || busyReason(s, now)) return;
  if (spotId && emptyFor(s, spotId, now)) return;
  // Forget spots that have filled up again.
  if (me.emptySpots) for (const [k, t] of Object.entries(me.emptySpots)) if (t <= now) delete me.emptySpots[k];
  const crime = CRIME_BY_ID[crimeId];
  me.job = { crimeId, startedAt: now, endsAt: now + crime.duration * 1000, spotId };
}

export function stopJob(s: GameState) {
  s.player.job = null;
}

/** Add items to your bag. A new kind of item needs a free slot; returns how many fitted. */
export function giveItem(s: GameState, id: string, count = 1): number {
  if (!ITEM_BY_ID[id] || count <= 0) return 0;
  if (!s.inventory[id] && slotsUsed(s) >= INVENTORY_SLOTS) return 0;
  s.inventory[id] = (s.inventory[id] ?? 0) + count;
  return count;
}

/** Why you can't eat this right now, or null if you can. */
export function cantEat(s: GameState, id: string, now: number): string | null {
  const item = ITEM_BY_ID[id];
  if (!item || !item.heal) return "You can't eat that.";
  if (!s.inventory[id]) return "You don't have any.";
  if (s.player.eatingUntil > now) return "You're still eating.";
  if (hpAt(s, now) >= maxHp(s)) return "You're already at full health.";
  return null;
}

/** Eat one food item: heals right away and takes 1 tick (you can't start a crime meanwhile). */
export function eat(s: GameState, id: string, now: number) {
  if (cantEat(s, id, now)) return;
  const item = ITEM_BY_ID[id];
  s.inventory[id] -= 1;
  if (s.inventory[id] <= 0) delete s.inventory[id];
  s.hp = Math.min(maxHp(s), hpAt(s, now) + item.heal);
  s.hpAt = now;
  s.player.eatingUntil = now + EAT_SECONDS * 1000;
  log(s, now, `You eat the ${item.name.toLowerCase()}. +${item.heal} HP.`, 'info');
}

/** What Eddy pays for one. */
export const itemPrice = (id: string) => ITEM_BY_ID[id]?.value ?? 0;

/** Sell one of an item to the store. */
export function sellItem(s: GameState, id: string) {
  const have = s.inventory[id] ?? 0;
  if (have <= 0) return;
  if (have === 1) delete s.inventory[id];
  else s.inventory[id] = have - 1;
  s.cash += itemPrice(id);
  s.stats.earned += itemPrice(id);
}

/** Throw away a stack. */
export function dropItem(s: GameState, id: string) {
  delete s.inventory[id];
}

export { MAX_LEVEL };
