// Core game rules (docs/design.md). Plain functions on a GameState, so the same logic could
// later run server-side (e.g. a Supabase function) for anti-cheat.
import type { Buff, GameState, Look, LogKind, PlayerState, Report, SkillId } from './types';
import { SKILL_BY_ID, SKILL_IDS, FAIL_LINES, BUST_LINES } from './data/skills';
import { CRIME_BY_ID, STUN_SECONDS, type CrimeDef } from './data/crimes';
import { LOOT, LOOT_BY_ID, MARKS, PLACES, RANKS, RARITY_WEIGHT } from './data/world';
import { levelFromXp, MAX_LEVEL } from './xp';
import { pick, randRange, weightedPick, type Rng } from './rng';
import { emptyReport } from './types';

export const LOG_CAP = 150;
/** Heat cools by this much per minute. */
const HEAT_DECAY_PER_MIN = 2;
/** Loot and random encounters are tuned per minute of work, so short and long crimes feel the same. */
const LOOT_PER_MIN = 0.4;
const ENCOUNTERS_PER_MIN = 0.05;
const BIG_SCORE_CHANCE = 0.05;
/** RuneScape-style bag: gold takes the first slot, each different loot item one more. */
export const INVENTORY_SLOTS = 28;
/** Health regenerates 1 HP per minute. Healing faster will come from items (see docs/design.md §9). */
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

/** Health lost on a failed attempt. */
export const FAIL_DAMAGE = 1;

/** Current heat after it cools down up to time t (does not mutate). */
export function heatAt(s: GameState, t: number) {
  const mins = Math.max(0, t - s.heatAt) / 60000;
  return Math.max(0, s.heat - mins * HEAT_DECAY_PER_MIN);
}

// ---------------- Crime stats ----------------

export interface CrimeStats {
  xp: number;
  chance: number;
  bust: number;
  crit: number;
  /** Seconds per attempt. */
  duration: number;
  cashMult: number;
  /** Heat added by one attempt. */
  heat: number;
  jail: number;
}

export function crimeStats(s: GameState, crime: CrimeDef, t: number): CrimeStats {
  const lvl = skillLevel(s, crime.skill);
  const heat = heatAt(s, t);
  let chance = crime.baseChance + Math.min(0.12, Math.max(0, lvl - crime.level) * 0.02) + buffSum(s, 'success');
  chance -= (heat / 100) * 0.25;
  chance = Math.min(0.97, Math.max(0.05, chance));
  return {
    xp: Math.round(crime.xp * Math.max(0.1, 1 + buffSum(s, 'xp'))),
    chance,
    bust: Math.min(0.9, crime.risk * (1 + (heat / 100) * 1.5)),
    crit: Math.min(0.6, BIG_SCORE_CHANCE + buffSum(s, 'crit')),
    duration: crime.duration,
    cashMult: Math.max(0.1, 1 + buffSum(s, 'cash')),
    heat: (crime.heatPerMin * crime.duration) / 60,
    jail: crime.jail,
  };
}

// ---------------- New game ----------------

export function newGame(name: string, look: Look, now: number): GameState {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, { xp: 0 }])) as unknown as GameState['skills'];
  const s: GameState = {
    version: 2, name: name.trim() || 'Nobody', look, createdAt: now,
    cash: 10, heat: 0, heatAt: now, hp: 10, hpAt: now,
    skills, player: { job: null, jailedUntil: 0, stunnedUntil: 0 },
    inventory: {}, buffs: [],
    stats: { jobs: 0, busts: 0, bigScores: 0, earned: 0, fails: 0 },
    log: [], nextId: 1,
  };
  log(s, now, `${s.name} hits the streets with 10 gold in their pocket.`, 'info');
  return s;
}

// ---------------- Helpers that mutate ----------------

function log(s: GameState, t: number, text: string, kind: LogKind) {
  s.log.unshift({ t, text, kind });
  if (s.log.length > LOG_CAP) s.log.length = LOG_CAP;
}

function fill(text: string, rng: Rng) {
  const out = text.replace(/\{mark\}/g, () => pick(rng, MARKS)).replace(/\{place\}/g, () => pick(rng, PLACES));
  // "{mark} grabbed…" → "A tourist grabbed…": capitalise the start of each sentence.
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
}

function setHeat(s: GameState, t: number, value: number) {
  s.heat = Math.min(100, Math.max(0, value));
  s.heatAt = t;
}

// The currency is gold. All numbers use en-US grouping (1,234) on purpose: with the device
// locale, Dutch phones showed "3.210", which reads like three and a bit.
export function fmtMoney(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B gold`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M gold`;
  if (a >= 1e5) return `${sign}${(a / 1e3).toFixed(1)}K gold`;
  return `${sign}${Math.round(a).toLocaleString('en-US')} gold`;
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

function rollLoot(s: GameState, rng: Rng): string | undefined {
  const lvl = skillLevel(s, 'street');
  return weightedPick(rng, LOOT.filter((l) => l.minLevel <= lvl), (l) => RARITY_WEIGHT[l.rarity])?.id;
}

function giveLoot(s: GameState, id: string, t: number, report: Report) {
  const def = LOOT_BY_ID[id];
  // Items you already carry stack; a new kind of item needs a free slot.
  if (!s.inventory[id] && slotsUsed(s) >= INVENTORY_SLOTS) {
    log(s, t, `You find ${def.name}, but your inventory is full. You leave it behind.`, 'loot');
    return;
  }
  s.inventory[id] = (s.inventory[id] ?? 0) + 1;
  report.loot.push(id);
  log(s, t, `${def.rarity === 'legendary' ? 'LEGENDARY: ' : def.rarity === 'rare' ? 'Rare: ' : ''}You find ${def.name}.`, 'loot');
}

// ---------------- Random encounters ----------------

interface Encounter {
  text: string;
  apply: (s: GameState, t: number, rng: Rng, report: Report) => string;
}

const ENCOUNTERS: Encounter[] = [
  { text: 'An old-timer shares a few tricks.', apply: (s) => { addBuff(s, { label: "Old-timer's tricks", kind: 'xp', value: 0.5, uses: 30 }); return '+50% XP for 30 attempts'; } },
  { text: 'You find a few coins taped under a park bench.', apply: (s, _t, r, rep) => { const c = 3 + Math.floor(r() * 8); earn(s, c, rep); return `+${fmtMoney(c)}`; } },
  { text: 'A dirty cop owes you a favour.', apply: (s, t) => { setHeat(s, t, heatAt(s, t) - 30); return '-30 heat'; } },
  { text: 'Someone drops your name to the cops.', apply: (s, t) => { setHeat(s, t, heatAt(s, t) + 20); return '+20 heat'; } },
  { text: 'A doorman tips you off about easy marks.', apply: (s) => { addBuff(s, { label: "Doorman's tip", kind: 'success', value: 0.1, uses: 30 }); return '+10% success for 30 attempts'; } },
  { text: 'You feel a lucky streak coming on.', apply: (s) => { addBuff(s, { label: 'Lucky streak', kind: 'crit', value: 0.2, uses: 20 }); return '+20% Big Score chance for 20 attempts'; } },
  { text: 'A stranger shoves a bag into your hands and runs.', apply: (s, t, r, rep) => { const id = rollLoot(s, r); if (!id) return 'it was empty'; giveLoot(s, id, t, rep); return LOOT_BY_ID[id].name; } },
];

// ---------------- Resolving one attempt ----------------

function resolveAttempt(s: GameState, t: number, rng: Rng, report: Report) {
  const me = s.player;
  const job = me.job!;
  const crime = CRIME_BY_ID[job.crimeId];
  if (!crime) {
    me.job = null;
    return;
  }
  const st = crimeStats(s, crime, t);
  const heatNow = heatAt(s, t);
  const perMin = st.duration / 60;
  report.jobs++;
  s.stats.jobs++;

  let busted = false;
  if (rng() < st.chance) {
    const big = rng() < st.crit;
    // Whole gold between cashMin and cashMax (both included); a Big Score doubles gold and XP.
    const base = Math.min(crime.cashMax, Math.floor(randRange(rng, crime.cashMin, crime.cashMax + 1)));
    const cash = Math.max(crime.cashMin, Math.round(base * st.cashMult)) * (big ? 2 : 1);
    const xp = st.xp * (big ? 2 : 1);
    earn(s, cash, report);
    addXp(s, crime.skill, xp, t, report);
    if (big) {
      report.bigScores++;
      s.stats.bigScores++;
    }
    log(s, t, `${big ? 'BIG SCORE — ' : ''}${fill(pick(rng, crime.flavor), rng)} +${fmtMoney(cash)}, +${xp} XP`, big ? 'big' : 'success');
    if (rng() < LOOT_PER_MIN * perMin * (big ? 2 : 1)) {
      const id = rollLoot(s, rng);
      if (id) giveLoot(s, id, t, report);
    }
    setHeat(s, t, heatNow + st.heat);
  } else {
    const xp = Math.max(1, Math.round(st.xp * 0.25));
    addXp(s, crime.skill, xp, t, report);
    if (rng() < st.bust) {
      busted = true;
      report.busts++;
      s.stats.busts++;
      me.jailedUntil = t + st.jail * 1000;
      setHeat(s, t, heatNow - 25);
      log(s, t, `BUSTED — ${fill(pick(rng, BUST_LINES), rng)} You're in a cell for ${fmtDuration(st.jail)}.`, 'bust');
    } else {
      s.stats.fails++;
      report.fails++;
      me.stunnedUntil = t + STUN_SECONDS * 1000;
      setHeat(s, t, heatNow + st.heat * 1.5);
      s.hp = Math.max(0, hpAt(s, t) - FAIL_DAMAGE);
      s.hpAt = t;
      report.damage += FAIL_DAMAGE;
      log(s, t, `${fill(pick(rng, FAIL_LINES), rng)} You're stunned. -${FAIL_DAMAGE} HP, +${xp} XP`, 'fail');
    }
  }
  useBuffs(s);

  if (!busted && rng() < ENCOUNTERS_PER_MIN * perMin) {
    const enc = pick(rng, ENCOUNTERS);
    const result = enc.apply(s, t, rng, report);
    log(s, t, `${enc.text} (${result})`, 'event');
    report.events.push(`${enc.text} (${result})`);
  }

  // One tap = one attempt: the job is done. Tap again for the next one.
  me.job = null;
  if (s.hp < MIN_HP_TO_WORK && s.hpAt === t) {
    log(s, t, "You're too hurt to keep going. Health comes back slowly; food will help.", 'bust');
    report.events.push('Too hurt to work');
  }
}

/** Resolve every attempt that finished up to `now`, in order. */
export function tick(prev: GameState, now: number, rng: Rng = Math.random): { state: GameState; report: Report } {
  const report = emptyReport();
  if (!prev.player.job || prev.player.job.endsAt > now) return { state: prev, report };
  const s = structuredClone(prev);
  resolveAttempt(s, s.player.job!.endsAt, rng, report);
  return { state: s, report };
}

// ---------------- Player actions (all mutate a draft) ----------------

/** Why you can't do a crime yet, or null if you can. */
export function canStart(s: GameState, crimeId: string): string | null {
  const crime = CRIME_BY_ID[crimeId];
  if (!crime) return 'Unknown job';
  if (skillLevel(s, crime.skill) < crime.level) return `Needs ${SKILL_BY_ID[crime.skill].name} level ${crime.level}`;
  return null;
}

/** Why you can't start an attempt right now (jail, stun, health), or null if you can. */
export function busyReason(s: GameState, now: number): string | null {
  const me = s.player;
  if (me.jailedUntil > now) return `You're in a cell for another ${fmtDuration((me.jailedUntil - now) / 1000)}.`;
  if (me.stunnedUntil > now) return "You're still stunned.";
  const hp = hpAt(s, now);
  if (hp < MIN_HP_TO_WORK) return `You're too hurt to work (${Math.floor(hp)} HP). You need ${MIN_HP_TO_WORK} HP; it comes back 1 per minute.`;
  return null;
}

/** Start one attempt at a crime (one tap = one attempt). */
export function startJob(s: GameState, crimeId: string, now: number) {
  const me = s.player;
  if (me.job || canStart(s, crimeId) || busyReason(s, now)) return;
  const crime = CRIME_BY_ID[crimeId];
  me.job = { crimeId, startedAt: now, endsAt: now + crime.duration * 1000 };
}

export function stopJob(s: GameState) {
  s.player.job = null;
}

/** What Eddy pays for one. */
export const lootPrice = (id: string) => LOOT_BY_ID[id].value;

/** Sell one of an item to the store. */
export function sellLoot(s: GameState, id: string) {
  const have = s.inventory[id] ?? 0;
  if (have <= 0) return;
  if (have === 1) delete s.inventory[id];
  else s.inventory[id] = have - 1;
  s.cash += lootPrice(id);
  s.stats.earned += lootPrice(id);
}

/** Throw away a stack of loot. */
export function dropLoot(s: GameState, id: string) {
  delete s.inventory[id];
}

/** Bail: 1 gold per 5 seconds left in the cell (at least 2). */
export function bailCost(me: PlayerState, now: number) {
  return Math.max(2, Math.ceil(Math.max(0, me.jailedUntil - now) / 5000));
}

export function bail(s: GameState, now: number) {
  const me = s.player;
  if (me.jailedUntil <= now) return;
  const cost = bailCost(me, now);
  if (s.cash < cost) return;
  s.cash -= cost;
  me.jailedUntil = now;
  log(s, now, `Posted bail (${fmtMoney(cost)}).`, 'info');
}

export { MAX_LEVEL };
