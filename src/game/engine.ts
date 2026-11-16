// Core game rules (docs/design.md). Plain functions on a GameState, so the same logic could
// later run server-side (e.g. a Supabase function) for anti-cheat.
import type { GameState, Look, LogKind, Report, SkillId } from './types';
import { SKILL_BY_ID, SKILL_IDS } from './data/skills';
import { CATCH_SECONDS, CRIME_BY_ID, EAT_SECONDS, type CrimeDef } from './data/crimes';
import { ITEM_BY_ID } from './data/items';
import { RANKS } from './data/world';
import { levelFromXp, MAX_LEVEL } from './xp';
import { pick, randRange, type Rng } from './rng';
import { firstSeen } from './watchers';
import { emptyReport } from './types';

export const LOG_CAP = 150;
const BIG_SCORE_CHANCE = 0.05;
/** Success chance goes up this much for every level you are above a crime's requirement. */
export const CHANCE_PER_LEVEL = 0.005;
/** RuneScape-style bag: cash takes the first slot, each different item one more (food stacks). */
export const INVENTORY_SLOTS = 28;
/** Health regenerates 1 HP per minute. Healing faster comes from food. */
const HP_REGEN_PER_MIN = 1;
/** Below this much health you're "badly hurt": you get a warning (you can still work: the risk is dying). */
export const LOW_HP = 3;
/** When you die, your stuff waits in a grave this long (real minutes). */
export const GRAVE_MINUTES = 5;
/** You come back with this share of your max health (not full: dying shouldn't be a free heal). */
export const RESPAWN_HP = 0.5;

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
  const chance = Math.min(cap, Math.max(0.05, crime.baseChance + Math.max(0, lvl - crime.level) * CHANCE_PER_LEVEL));
  return {
    xp: crime.xp,
    chance,
    crit: BIG_SCORE_CHANCE,
    duration: crime.duration,
    cashMult: 1,
  };
}

// ---------------- New game ----------------

export function newGame(name: string, look: Look, now: number): GameState {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, { xp: 0 }])) as unknown as GameState['skills'];
  const s: GameState = {
    version: 2, name: name.trim() || 'Nobody', look, createdAt: now,
    cash: 10, hp: 10, hpAt: now,
    skills, player: { job: null, stunnedUntil: 0, eatingUntil: 0 },
    inventory: {},
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

function earn(s: GameState, amount: number, report: Report) {
  s.cash += amount;
  s.stats.earned += amount;
  report.cash += amount;
}

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
  if (s.hp <= 0) return die(s, t, report);
  if (s.hp < LOW_HP) {
    log(s, t, "You're badly hurt. Eat something: the next hit could kill you.", 'fail');
    report.events.push('Badly hurt');
  }
}

/**
 * You died: your cash and items drop into a grave where you stood (an older grave crumbles), and you
 * wake up at the start with half health. Walk back and tap the grave within GRAVE_MINUTES to get it all back.
 */
function die(s: GameState, t: number, report: Report) {
  const me = s.player;
  const hasStuff = s.cash > 0 || Object.keys(s.inventory).length > 0;
  if (s.grave) log(s, t, 'Your old grave crumbled. What was in it is gone.', 'fail');
  s.grave = null;
  if (hasStuff && me.pos) {
    s.grave = { x: me.pos[0], y: me.pos[1], cash: s.cash, items: { ...s.inventory }, diedAt: t, expiresAt: t + GRAVE_MINUTES * 60_000 };
    s.cash = 0;
    s.inventory = {};
  }
  me.job = null;
  me.caught = null;
  me.stunnedUntil = 0;
  me.pos = null;
  s.hp = Math.max(LOW_HP, Math.ceil(maxHp(s) * RESPAWN_HP));
  s.hpAt = t;
  s.stats.deaths = (s.stats.deaths ?? 0) + 1;
  report.died = true;
  report.events.push('You died');
  log(s, t, s.grave ? `You died. Your stuff is in your grave: get it back within ${GRAVE_MINUTES} minutes.` : 'You died.', 'fail');
}

/** Collect everything from your grave (stand next to it). Items that don't fit stay in it. */
export function collectGrave(s: GameState, now: number) {
  const g = s.grave;
  if (!g || g.expiresAt <= now) return;
  s.cash += g.cash;
  g.cash = 0;
  for (const [id, n] of Object.entries(g.items)) {
    if (giveItem(s, id, n)) delete g.items[id];
  }
  const left = Object.keys(g.items).length;
  log(s, now, left ? 'You took what fits in your bag. The rest is still in your grave.' : 'You got your stuff back from your grave.', 'info');
  if (!left) s.grave = null;
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
}

/** Resolve the current attempt if it has finished by `now`, and land a pending punch. */
export function tick(prev: GameState, now: number, rng: Rng = Math.random): { state: GameState; report: Report } {
  const report = emptyReport();
  // The bartender or the guard may have seen you mid-attempt (their schedules are fixed: watchers.ts).
  const pj = prev.player.job;
  const watcher = pj ? CRIME_BY_ID[pj.crimeId]?.catcher : undefined;
  const seenAt = pj && (watcher === 'bartender' || watcher === 'guard') ? firstSeen(watcher, pj.pos, pj.startedAt, Math.min(now, pj.endsAt)) : null;
  if (seenAt !== null) {
    const s = structuredClone(prev);
    spotted(s, seenAt);
    return tick(s, now, rng); // and let the rest of the tick (e.g. the hit landing) happen as usual
  }
  const jobDue = !!prev.player.job && prev.player.job.endsAt <= now;
  const c = prev.player.caught;
  const hitDue = !!c && c.at + CATCH_SECONDS * 1000 <= now;
  const graveDue = !!prev.grave && prev.grave.expiresAt <= now;
  if (!jobDue && !hitDue && !graveDue) return { state: prev, report };
  const s = structuredClone(prev);
  if (jobDue) resolveAttempt(s, s.player.job!.endsAt, rng, report);
  const caught = s.player.caught;
  if (caught && caught.at + CATCH_SECONDS * 1000 <= now) {
    s.player.caught = null;
    const crime = CRIME_BY_ID[caught.crimeId];
    if (crime) getHit(s, crime, caught.at + CATCH_SECONDS * 1000, report, HIT_LINES[crime.catcher ?? ''] ?? 'You get hit.');
  }
  if (s.grave && s.grave.expiresAt <= now) {
    s.grave = null;
    log(s, now, 'Your grave crumbled. What was in it is gone.', 'fail');
    report.events.push('Your grave crumbled');
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

/** Why you can't start an attempt right now (caught, stunned, eating), or null if you can.
 *  Low health doesn't stop you (docs/design.md §5): it's a risk, the next hit can kill you. */
export function busyReason(s: GameState, now: number): string | null {
  const me = s.player;
  if (me.caught) return "You've been caught!";
  if (me.stunnedUntil > now) return "You're still stunned.";
  if (me.eatingUntil > now) return "You're still eating.";
  return null;
}

/** Seconds until an emptied spot (a shelf, a meter) is full again; 0 if it's full now. */
export function emptyFor(s: GameState, spotId: string, now: number) {
  const until = s.player.emptySpots?.[spotId] ?? 0;
  return until > now ? (until - now) / 1000 : 0;
}

/** Start one attempt at a crime (one tap = one attempt), optionally at a given spot, standing on tile `pos`. */
export function startJob(s: GameState, crimeId: string, now: number, spotId?: string, pos?: [number, number] | null) {
  const me = s.player;
  if (me.job || canStart(s, crimeId) || busyReason(s, now)) return;
  if (spotId && emptyFor(s, spotId, now)) return;
  // Forget spots that have filled up again.
  if (me.emptySpots) for (const [k, t] of Object.entries(me.emptySpots)) if (t <= now) delete me.emptySpots[k];
  const crime = CRIME_BY_ID[crimeId];
  me.job = { crimeId, startedAt: now, endsAt: now + crime.duration * 1000, spotId, pos: pos ?? me.pos ?? null };
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
