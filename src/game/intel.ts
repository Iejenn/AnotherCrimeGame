// The "Intel" board: city-wide tips that rotate every few hours, plus daily contracts.
// Tips are generated from a seed of the time window, so they're the same on every reload
// and jobs that finished while you were offline use the tips that were live at that moment.
import type { Contract, GameState, SkillId } from './types';
import { hashString, mulberry32, pick, type Rng } from './rng';
import { SKILLS, SKILL_BY_ID } from './data/skills';
import { PLACES } from './data/world';
import { cashPerHour } from './xp';

export const TIP_WINDOW_MS = 3 * 3600 * 1000;
export const DAY_MS = 24 * 3600 * 1000;

export interface TipEffects {
  cash?: number;
  xp?: number;
  success?: number;
  bust?: number;
  heat?: number;
}
export interface Tip {
  id: string;
  skill: SkillId;
  title: string;
  text: string;
  effects: TipEffects;
  endsAt: number;
}

type TipTemplate = (skill: string, place: string, rng: Rng) => { title: string; text: string; effects: TipEffects };

const TEMPLATES: TipTemplate[] = [
  (s, p) => ({ title: 'Convention in Town', text: `Out-of-towners are flooding ${p}. ${s} pays more.`, effects: { cash: 0.4 } }),
  (s) => ({ title: 'Shift Change at the Precinct', text: `Patrols are thin. ${s} jobs are easier.`, effects: { success: 0.1 } }),
  (s, p) => ({ title: 'Crackdown', text: `Cops are sweeping ${p}. ${s} is riskier but the payouts are fat.`, effects: { bust: 0.6, cash: 0.75 } }),
  (s) => ({ title: 'Old Pro Holding Court', text: `A retired legend is sharing tricks. ${s} XP boosted.`, effects: { xp: 0.35 } }),
  (s, p) => ({ title: 'Cops on Strike', text: `Half the force walked out near ${p}. ${s} generates less heat.`, effects: { heat: -0.6, bust: -0.3 } }),
  (s) => ({ title: 'Hot Market', text: `Fences are paying top dollar for ${s.toLowerCase()} goods.`, effects: { cash: 0.25, xp: 0.1 } }),
  (s, p) => ({ title: 'Blackout', text: `Power cut across ${p}. Perfect cover for ${s.toLowerCase()}.`, effects: { success: 0.08, cash: 0.15 } }),
  (s) => ({ title: 'Masterclass', text: `Your contacts set up a ${s.toLowerCase()} masterclass.`, effects: { xp: 0.5, cash: -0.2 } }),
];

const tipCache = new Map<number, Tip[]>();

export function tipsAt(t: number): Tip[] {
  const window = Math.floor(t / TIP_WINDOW_MS);
  const cached = tipCache.get(window);
  if (cached) return cached;
  const rng = mulberry32(hashString(`tips:${window}`));
  const skills = [...SKILLS].sort(() => rng() - 0.5).slice(0, 3);
  const tips = skills.map((sk, i) => {
    const tpl = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
    const { title, text, effects } = tpl(sk.name, pick(rng, PLACES), rng);
    return { id: `${window}:${i}`, skill: sk.id, title, text, effects, endsAt: (window + 1) * TIP_WINDOW_MS };
  });
  if (tipCache.size > 50) tipCache.clear();
  tipCache.set(window, tips);
  return tips;
}

export function tipEffectsFor(skill: SkillId, t: number): Required<TipEffects> {
  const out = { cash: 0, xp: 0, success: 0, bust: 0, heat: 0 };
  for (const tip of tipsAt(t)) {
    if (tip.skill !== skill) continue;
    for (const k of Object.keys(tip.effects) as (keyof TipEffects)[]) out[k] += tip.effects[k] ?? 0;
  }
  return out;
}

export function dayIndex(t: number) {
  return Math.floor(t / DAY_MS);
}

/** Build today's 3 contracts, scaled to the player's current levels. */
export function generateContracts(
  day: number,
  name: string,
  unlocked: SkillId[],
  levelOf: (s: SkillId) => number,
): Contract[] {
  const rng = mulberry32(hashString(`contracts:${day}:${name}`));
  const pool = [...unlocked].sort(() => rng() - 0.5);
  const top = Math.max(...unlocked.map(levelOf));
  const list: Contract[] = [];

  const s1 = pool[0];
  const jobs = 8 + Math.floor(rng() * 4) * 4;
  list.push({
    id: `${day}:jobs`, label: `Complete ${jobs} ${SKILL_BY_ID[s1].name} jobs`, kind: 'jobs', skill: s1, target: jobs, progress: 0,
    cashHours: 1.5, xpFrac: 0.75, rewardSkill: s1, claimed: false,
  });

  const s2 = pool[1] ?? s1;
  const cashTarget = Math.round(cashPerHour(top) * (1.5 + rng() * 1.5) / 100) * 100;
  list.push({
    id: `${day}:cash`, label: `Earn $${cashTarget.toLocaleString('en-US')} from jobs`, kind: 'cash', target: cashTarget, progress: 0,
    cashHours: 1, xpFrac: 0.6, rewardSkill: s2, claimed: false,
  });

  const s3 = pool[2] ?? s1;
  const big = 2 + Math.floor(rng() * 3);
  list.push({
    id: `${day}:big`, label: `Land ${big} Big Scores (any crime)`, kind: 'big', target: big, progress: 0,
    cashHours: 2, xpFrac: 0.8, rewardSkill: s3, claimed: false,
  });
  return list;
}

export function ensureContracts(s: GameState, now: number, unlocked: SkillId[], levelOf: (s: SkillId) => number) {
  const day = dayIndex(now);
  if (s.contracts.day !== day) s.contracts = { day, list: generateContracts(day, s.name, unlocked, levelOf) };
}
