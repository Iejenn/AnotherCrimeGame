// Core game rules. Everything here is plain functions on a GameState so the same
// logic could later run server-side (e.g. inside a Supabase RPC) for anti-cheat.
import type { Buff, CrewMember, GameState, LogKind, PerkId, Report, SkillId, OriginId } from './types';
import { emptyReport } from './types';
import { SKILLS, SKILL_BY_ID, SKILL_IDS } from './data/skills';
import { CRIME_BY_ID, type CrimeDef } from './data/crimes';
import {
  CAR_CLASSES, CAR_MODELS, CAR_SMUGGLE_BONUS, LOOT, LOOT_BY_ID, MARKS, ORIGIN_BY_ID,
  PERK_IDS, PERK_MILESTONES, PLACES, RANKS, RARITY_WEIGHT,
} from './data/world';
import { levelFromXp, cashPerHour, crimeXp, xpToNext, MAX_LEVEL } from './xp';
import { hashString, mulberry32, pick, randRange, weightedPick, type Rng } from './rng';

export const LOG_CAP = 150;
const HEAT_DECAY_PER_MIN = 1;
// Loot and encounter odds scale with job length, so short and long jobs feel equally "lucky" per hour.
const encounterChance = (dur: number) => 0.03 * Math.min(3, Math.max(0.1, dur / 300));
const lootChance = (dur: number) => 0.1 * Math.min(3, Math.max(0.15, dur / 120));
export const MASTERY_THRESHOLDS = [0, 10, 25, 50, 100, 200, 400, 800, 1600];
/** How long you keep working a spot before your character stops on their own. */
export const SHIFT_HOURS = 8;
/** RuneScape-style bag: gold takes the first slot, each different loot item and each car one more. */
export const INVENTORY_SLOTS = 28;
/** Health regenerates this much per minute. */
const HP_REGEN_PER_MIN = 1;
/** You need at least this much health to start a job. */
export const MIN_HP_TO_WORK = 3;

// ---------------- Basic lookups ----------------

export const skillLevel = (s: GameState, id: SkillId) => levelFromXp(s.skills[id].xp);
export const totalLevel = (s: GameState) => SKILL_IDS.reduce((sum, id) => sum + skillLevel(s, id), 0);
export const avgLevel = (s: GameState) => totalLevel(s) / SKILL_IDS.length;

export function rankFor(total: number) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (total >= RANKS[i][0]) idx = i;
  return { name: RANKS[idx][1], next: RANKS[idx + 1] ?? null, current: RANKS[idx] };
}

export function isUnlocked(s: GameState, id: SkillId) {
  const u = SKILL_BY_ID[id].unlock;
  if (u.total && totalLevel(s) < u.total) return false;
  for (const [k, v] of Object.entries(u.skill ?? {})) if (skillLevel(s, k as SkillId) < (v as number)) return false;
  return true;
}
export const unlockedSkills = (s: GameState) => SKILL_IDS.filter((id) => isUnlocked(s, id));

export function masteryLevel(count: number) {
  let m = 0;
  for (let i = 0; i < MASTERY_THRESHOLDS.length; i++) if (count >= MASTERY_THRESHOLDS[i]) m = i;
  return m;
}

const perkCount = (s: GameState, skill: SkillId, perk: PerkId) => s.skills[skill].perks.filter((p) => p === perk).length;

export function bestCarClass(s: GameState) {
  return s.cars.reduce((m, c) => Math.max(m, c.cls), -1);
}

function buffSum(s: GameState, skill: SkillId, kind: Buff['kind']) {
  return s.buffs.filter((b) => b.kind === kind && (!b.skill || b.skill === skill)).reduce((sum, b) => sum + b.value, 0);
}

export function slotsUsed(s: GameState) {
  return 1 + Object.keys(s.inventory).length + s.cars.length;
}

/** Max health grows a little as your total level goes up: 10 at the start. */
export const maxHp = (s: GameState) => 10 + Math.floor((totalLevel(s) - 8) / 4);

/** Current health after regeneration up to time t (does not mutate). */
export function hpAt(s: GameState, t: number) {
  const mins = Math.max(0, t - s.hpAt) / 60000;
  return Math.min(maxHp(s), s.hp + mins * HP_REGEN_PER_MIN);
}

/** Health lost on a failed job: 1 for low-level crimes, up to 4 for the heaviest. */
export const failDamage = (crimeLevel: number) => 1 + Math.floor(crimeLevel / 25);

/** Current heat after decay up to time t (does not mutate). */
export function heatAt(s: GameState, t: number) {
  const mins = Math.max(0, t - s.heatAt) / 60000;
  const rate = HEAT_DECAY_PER_MIN;
  return Math.max(0, s.heat - mins * rate);
}

// ---------------- Crime stats (the RPG math) ----------------

/**
 * XP per success. It grows with your level for up to 5 levels past the crime's requirement,
 * then stalls — so you're nudged to move up to heavier jobs, but never stuck on a dead tier.
 */
export function baseCrimeXp(s: GameState, crime: CrimeDef) {
  const eff = Math.min(skillLevel(s, crime.skill), crime.level + 5);
  return crimeXp(Math.max(crime.level, eff), crime.duration);
}

export interface CrimeStats {
  xp: number;
  chance: number;
  bust: number;
  crit: number;
  duration: number;
  xpMult: number;
  cashMult: number;
  heat: number;
  jail: number;
  mastery: number;
}

export function crimeStats(s: GameState, crime: CrimeDef, t: number): CrimeStats {
  const lvl = skillLevel(s, crime.skill);
  const origin = ORIGIN_BY_ID[s.origin];
  const m = masteryLevel(s.mastery[crime.id] ?? 0);
  const heat = heatAt(s, t);

  let chance = crime.baseChance + Math.min(0.15, Math.max(0, lvl - crime.level) * 0.01);
  chance += m * 0.01 + buffSum(s, crime.skill, 'success');
  chance -= (heat / 100) * 0.25;
  chance = Math.min(0.97, Math.max(0.05, chance));

  let bust = crime.risk * Math.max(0.2, 1 - 0.2 * perkCount(s, crime.skill, 'ghost'));
  bust *= 1 + (heat / 100) * 1.5;
  bust = Math.min(0.9, Math.max(0, bust));

  let crit = 0.05 + 0.03 * perkCount(s, crime.skill, 'lucky') + m * 0.005 + buffSum(s, crime.skill, 'crit');
  crit = Math.min(0.6, crit);

  let dur = crime.duration * Math.max(0.5, 1 - 0.07 * perkCount(s, crime.skill, 'speed')) * (1 - m * 0.02);
  dur = Math.max(3, Math.round(dur));

  const xpMult = 1 + (origin.xp[crime.skill] ?? 0) + 0.1 * perkCount(s, crime.skill, 'scholar') + buffSum(s, crime.skill, 'xp');
  let cashMult = 1 + (origin.cash[crime.skill] ?? 0) + 0.12 * perkCount(s, crime.skill, 'greed') + buffSum(s, crime.skill, 'cash');
  if (crime.skill === 'smuggling') {
    const best = bestCarClass(s);
    if (best >= 0) cashMult += CAR_SMUGGLE_BONUS[best];
  }

  const jail = Math.round(crime.jail * origin.jailMult);
  return {
    xp: Math.round(baseCrimeXp(s, crime) * Math.max(0.1, xpMult)),
    chance, bust, crit, duration: dur, xpMult: Math.max(0.1, xpMult), cashMult: Math.max(0.1, cashMult),
    // Heat scales with job length so spamming 10-second jobs doesn't max it out.
    heat: crime.heat * Math.min(4, Math.max(0.25, crime.duration / 60)) * 0.5, jail, mastery: m,
  };
}

// ---------------- New game ----------------

export function newGame(name: string, origin: OriginId, now: number): GameState {
  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, { xp: 0, perks: [] }])) as unknown as GameState['skills'];
  const s: GameState = {
    version: 1, name: name.trim() || 'Nobody', origin, createdAt: now,
    cash: ORIGIN_BY_ID[origin].startCash, heat: 0, heatAt: now, hp: 10, hpAt: now,
    skills, mastery: {},
    crew: [{ id: 'you', name: name.trim() || 'You', isPlayer: true, job: null, jailedUntil: 0 }],
    inventory: {}, cars: [], buffs: [], pendingPerks: [],
    stats: { jobs: 0, busts: 0, bigScores: 0, earned: 0, fails: 0 },
    log: [], lastSeen: now, nextId: 1,
  };
  log(s, now, `${s.name} hits the streets. Everyone starts with petty stuff.`, 'info');
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

export function addXp(s: GameState, skill: SkillId, amount: number, t: number, report: Report) {
  const before = skillLevel(s, skill);
  s.skills[skill].xp += amount;
  report.xp[skill] = (report.xp[skill] ?? 0) + amount;
  const after = skillLevel(s, skill);
  if (after <= before) return;
  const wasUnlocked = SKILL_IDS.filter((id) => isUnlocked({ ...s, skills: { ...s.skills, [skill]: { ...s.skills[skill], xp: s.skills[skill].xp - amount } } }, id));
  for (let l = before + 1; l <= after; l++) {
    report.levelUps.push({ skill, level: l });
    log(s, t, `${SKILL_BY_ID[skill].name} reached level ${l}!`, 'level');
    if (PERK_MILESTONES.includes(l)) {
      // Each milestone offers two different perks — chosen deterministically so a reload can't reroll them.
      const rng = mulberry32(hashString(`${s.name}:${skill}:${l}`));
      const a = pick(rng, PERK_IDS);
      let b = pick(rng, PERK_IDS);
      while (b === a) b = pick(rng, PERK_IDS);
      s.pendingPerks.push({ skill, milestone: l, options: [a, b] });
      log(s, t, `${SKILL_BY_ID[skill].name} ${l}: choose a new perk!`, 'level');
    }
  }
  for (const id of SKILL_IDS) {
    if (!wasUnlocked.includes(id) && isUnlocked(s, id)) {
      log(s, t, `New crime family unlocked: ${SKILL_BY_ID[id].name}!`, 'level');
      report.events.push(`Unlocked ${SKILL_BY_ID[id].name}`);
    }
  }
}

function useBuffs(s: GameState, skill: SkillId) {
  for (const b of s.buffs) if (!b.skill || b.skill === skill) b.uses -= 1;
  s.buffs = s.buffs.filter((b) => b.uses > 0);
}

function earn(s: GameState, amount: number, report: Report) {
  s.cash += amount;
  s.stats.earned += amount;
  report.cash += amount;
}

// ---------------- Random encounters: the "something new every time" layer ----------------

interface Encounter {
  text: string;
  apply: (s: GameState, skill: SkillId, t: number, rng: Rng, report: Report) => string;
}

const ENCOUNTERS: Encounter[] = [
  { text: 'An old-timer at the bar takes a liking to you and shares some tricks.', apply: (s, sk) => { addBuff(s, { label: 'Old-timer\'s tricks', skill: sk, kind: 'xp', value: 0.5, uses: 6 }); return `+50% ${SKILL_BY_ID[sk].short} XP for 6 jobs`; } },
  { text: 'You find a stash taped under a park bench.', apply: (s, sk, _t, _r, rep) => { const c = Math.round(cashPerHour(skillLevel(s, sk)) * 0.25); earn(s, c, rep); return `+${fmtMoney(c)}`; } },
  { text: 'A dirty cop owes you a favour and loses some paperwork.', apply: (s, _sk, t) => { setHeat(s, t, heatAt(s, t) - 30); return '-30 heat'; } },
  { text: 'A rival crew drops your name to the cops.', apply: (s, _sk, t) => { setHeat(s, t, heatAt(s, t) + 20); return '+20 heat'; } },
  { text: 'A doorman slips you a hot tip about tomorrow\'s marks.', apply: (s, sk) => { addBuff(s, { label: 'Doorman\'s tip', skill: sk, kind: 'success', value: 0.12, uses: 4 }); return `+12% ${SKILL_BY_ID[sk].short} success for 4 jobs`; } },
  { text: 'You feel a lucky streak coming on.', apply: (s) => { addBuff(s, { label: 'Lucky streak', kind: 'crit', value: 0.2, uses: 5 }); return '+20% Big Score chance for 5 jobs'; } },
  { text: 'A stranger drops a bag in your hands and runs.', apply: (s, sk, t, r, rep) => { const id = rollLoot(s, sk, r); if (!id) return 'it was empty'; giveLoot(s, id, t, rep); return LOOT_BY_ID[id].name; } },
  { text: 'You overhear two bankers bragging about their bonuses.', apply: (s, sk) => { addBuff(s, { label: 'Banker gossip', skill: sk, kind: 'cash', value: 0.5, uses: 5 }); return `+50% ${SKILL_BY_ID[sk].short} cash for 5 jobs`; } },
  { text: 'Your name is getting around. Word on the street spreads.', apply: (s, sk, t, _r, rep) => { const x = Math.round(xpToNext(skillLevel(s, sk)) * 0.2); addXp(s, sk, x, t, rep); return `+${x.toLocaleString('en-US')} ${SKILL_BY_ID[sk].short} XP`; } },
  { text: 'A retired safecracker sells you his notebook for a song.', apply: (s) => { addBuff(s, { label: 'Safecracker notes', skill: 'burglary', kind: 'success', value: 0.15, uses: 8 }); return '+15% Burglary success for 8 jobs'; } },
  { text: 'A mechanic friend tips you off about an unlocked lot.', apply: (s) => { addBuff(s, { label: 'Unlocked lot', skill: 'auto', kind: 'cash', value: 0.6, uses: 4 }); return '+60% Car Theft value for 4 jobs'; } },
  { text: 'Your old gang throws you a party. Morale is high.', apply: (s) => { addBuff(s, { label: 'High morale', kind: 'xp', value: 0.2, uses: 10 }); return '+20% XP for 10 jobs'; } },
];

function addBuff(s: GameState, b: Omit<Buff, 'id'>) {
  s.buffs.push({ ...b, id: `b${s.nextId++}` });
  if (s.buffs.length > 12) s.buffs.shift();
}

function rollLoot(s: GameState, skill: SkillId, rng: Rng): string | undefined {
  const lvl = skillLevel(s, skill);
  const pool = LOOT.filter((l) => l.skill === skill && l.minLevel <= lvl);
  return weightedPick(rng, pool, (l) => RARITY_WEIGHT[l.rarity])?.id;
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
  const tag = def.rarity === 'legendary' ? 'LEGENDARY: ' : def.rarity === 'rare' ? 'Rare: ' : '';
  log(s, t, `${tag}You find ${def.name}.`, 'loot');
}

// ---------------- Resolving one job repetition ----------------

function resolveRep(s: GameState, crew: CrewMember, t: number, rng: Rng, report: Report) {
  const job = crew.job!;
  const crime = CRIME_BY_ID[job.crimeId];
  const st = crimeStats(s, crime, t);
  const heatNow = heatAt(s, t);
  const who = crew.isPlayer ? 'You' : crew.name;
  const prefix = crew.isPlayer ? '' : `[${crew.name}] `;
  report.jobs++;
  s.stats.jobs++;

  let busted = false;
  if (rng() < st.chance) {
    const big = rng() < st.crit;
    let cash = randRange(rng, crime.cashMin, crime.cashMax) * st.cashMult * (big ? 3 : 1);
    const xp = st.xp * (big ? 2 : 1);
    let line = fill(pick(rng, crime.flavor), rng);
    if (crime.carClasses) {
      // Car theft pays out in cars: the better the class, the more it's worth.
      const [lo, hi] = crime.carClasses;
      const cls = lo + Math.floor(rng() * (hi - lo + 1));
      const value = Math.round(cash * (1 + (cls - lo) * 0.5));
      const model = pick(rng, CAR_MODELS[cls]);
      if (slotsUsed(s) < INVENTORY_SLOTS) {
        s.cars.push({ id: `c${s.nextId++}`, model, cls, value });
        line += ` — You pocket the keys to a ${CAR_CLASSES[cls]}: ${model}.`;
        cash = 0;
        report.cars++;
      } else {
        cash = value * 0.75;
        line += ` — No room for the keys, so the ${model} gets chopped for parts.`;
      }
    }
    if (cash > 0) earn(s, Math.round(cash), report);
    addXp(s, crime.skill, xp, t, report);
    s.mastery[crime.id] = (s.mastery[crime.id] ?? 0) + 1;
    const newM = masteryLevel(s.mastery[crime.id]);
    if (newM > st.mastery) log(s, t, `${crime.name} mastery ${newM}! (faster, safer, luckier)`, 'level');
    if (big) {
      report.bigScores++;
      s.stats.bigScores++;
    }
    const cashTxt = cash > 0 ? ` +${fmtMoney(cash)}` : '';
    log(s, t, `${prefix}${big ? 'BIG SCORE — ' : ''}${line}${cashTxt} +${xp} XP`, big ? 'big' : 'success');
    if (rng() < lootChance(crime.duration) * (big ? 2 : 1)) {
      const id = rollLoot(s, crime.skill, rng);
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
      crew.jailedUntil = t + st.jail * 1000;
      setHeat(s, t, heatNow - 25);
      log(s, t, `${prefix}BUSTED — ${fill(pick(rng, SKILL_BY_ID[crime.skill].bustLines), rng)} ${who} ${crew.isPlayer ? 'are' : 'is'} in jail for ${fmtDuration(st.jail)}.`, 'bust');
    } else {
      s.stats.fails++;
      setHeat(s, t, heatNow + st.heat * 1.5);
      const dmg = failDamage(crime.level);
      s.hp = Math.max(0, hpAt(s, t) - dmg);
      s.hpAt = t;
      report.damage += dmg;
      log(s, t, `${prefix}${fill(pick(rng, SKILL_BY_ID[crime.skill].failLines), rng)} -${dmg} HP, +${xp} XP`, 'fail');
    }
  }
  useBuffs(s, crime.skill);

  if (!busted && rng() < encounterChance(crime.duration)) {
    const enc = pick(rng, ENCOUNTERS);
    const result = enc.apply(s, crime.skill, t, rng, report);
    log(s, t, `${enc.text} (${result})`, 'event');
    report.events.push(`${enc.text} (${result})`);
  }

  job.repsLeft--;
  job.repsDone++;
  if (s.hp < 1 && s.hpAt === t) {
    // Out of health (under 1 HP shows as 0): stop here instead of grinding on while hurt.
    crew.job = null;
    log(s, t, `You're too hurt to keep going. Rest up: health comes back over time.`, 'bust');
    report.events.push('Too hurt to keep working');
  } else if (job.repsLeft > 0) {
    // Jail pauses the queue rather than wiping it — idle players shouldn't lose a whole night to one bust.
    const start = Math.max(t, crew.jailedUntil);
    job.startedAt = start;
    job.endsAt = start + crimeStats(s, crime, start).duration * 1000;
  } else {
    crew.job = null;
  }
}

/**
 * Resolve every job repetition that has finished up to `now`, in chronological order
 * across all crew members. Works the same for 1 second or 3 days of offline time.
 */
export function catchUp(prev: GameState, now: number, rng: Rng = Math.random): { state: GameState; report: Report } {
  const report = emptyReport();
  const due = prev.crew.some((c) => c.job && c.job.endsAt <= now);
  if (!due) return { state: prev, report };
  const s = structuredClone(prev);
  for (let guard = 0; guard < 50_000; guard++) {
    let next: CrewMember | null = null;
    for (const c of s.crew) if (c.job && c.job.endsAt <= now && (!next || c.job.endsAt < next.job!.endsAt)) next = c;
    if (!next) break;
    resolveRep(s, next, next.job!.endsAt, rng, report);
  }
  s.lastSeen = now;
  return { state: s, report };
}

// ---------------- Player actions (all mutate a draft) ----------------

export function maxReps(s: GameState, crime: CrimeDef, now: number) {
  const dur = crimeStats(s, crime, now).duration;
  return Math.max(1, Math.floor((SHIFT_HOURS * 3600) / dur));
}

export function canStart(s: GameState, crimeId: string): string | null {
  const crime = CRIME_BY_ID[crimeId];
  if (!crime) return 'Unknown job';
  if (!isUnlocked(s, crime.skill)) return 'Crime family locked';
  if (skillLevel(s, crime.skill) < crime.level) return `Needs ${SKILL_BY_ID[crime.skill].short} level ${crime.level}`;
  return null;
}

export function startJob(s: GameState, crewId: string, crimeId: string, reps: number, now: number) {
  const crew = s.crew.find((c) => c.id === crewId);
  if (!crew || crew.job || canStart(s, crimeId) || hpAt(s, now) < MIN_HP_TO_WORK) return;
  const crime = CRIME_BY_ID[crimeId];
  const n = Math.max(1, Math.min(reps, maxReps(s, crime, now)));
  const start = Math.max(now, crew.jailedUntil);
  crew.job = { crimeId, startedAt: start, endsAt: start + crimeStats(s, crime, start).duration * 1000, repsLeft: n, repsDone: 0 };
}

export function stopJob(s: GameState, crewId: string) {
  const crew = s.crew.find((c) => c.id === crewId);
  if (crew) crew.job = null;
}

export function choosePerk(s: GameState, index: number, perk: PerkId) {
  const p = s.pendingPerks[index];
  if (!p || !p.options.includes(perk)) return;
  s.skills[p.skill].perks.push(perk);
  s.pendingPerks.splice(index, 1);
}

/** What Eddy pays: the item's value. */
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

export function sellCar(s: GameState, carId: string) {
  const car = s.cars.find((c) => c.id === carId);
  if (!car) return;
  s.cars = s.cars.filter((c) => c.id !== carId);
  s.cash += car.value;
  s.stats.earned += car.value;
}

/** Throw away a stack of loot. */
export function dropLoot(s: GameState, id: string) {
  if (!s.inventory[id]) return;
  delete s.inventory[id];
}

export function dropCar(s: GameState, carId: string) {
  s.cars = s.cars.filter((c) => c.id !== carId);
}

export function bailCost(s: GameState, crew: CrewMember, now: number) {
  const secs = Math.max(0, (crew.jailedUntil - now) / 1000);
  return Math.max(10, Math.round((secs * cashPerHour(avgLevel(s))) / 3600));
}

export function bail(s: GameState, crewId: string, now: number) {
  const crew = s.crew.find((c) => c.id === crewId);
  if (!crew || crew.jailedUntil <= now) return;
  const cost = bailCost(s, crew, now);
  if (s.cash < cost) return;
  s.cash -= cost;
  crew.jailedUntil = now;
  if (crew.job && crew.job.startedAt > now) {
    const dur = crew.job.endsAt - crew.job.startedAt;
    crew.job.startedAt = now;
    crew.job.endsAt = now + dur;
  }
  log(s, now, `Posted bail for ${crew.isPlayer ? 'yourself' : crew.name} (${fmtMoney(cost)}).`, 'info');
}

export function fmtDuration(sec: number) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60 ? ` ${sec % 60}s` : ''}`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h < 24) return `${h}h${m ? ` ${m}m` : ''}`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export { MAX_LEVEL, SKILLS };
