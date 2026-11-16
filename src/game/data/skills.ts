import type { SkillId } from '../types';

export interface SkillDef {
  id: SkillId;
  name: string;
  /** Number shown in the UI instead of an icon. */
  code: string;
  blurb: string;
  /** How you train it. Shown in the Skills tab. */
  howToTrain: string;
}

// The five starting skills. Only Street Crimes has content so far; the rest get scoped later.
export const SKILLS: SkillDef[] = [
  // Shown in this order (decided): the combat skills first, Street Crimes last.
  { id: 'melee', code: '01', name: 'Melee', blurb: 'Fists, bats and broken bottles. Your accuracy and how hard you hit.', howToTrain: 'Fight with your fists or a melee weapon: 1 XP for every point of damage you deal. Start on the Pigeons in the park.' },
  { id: 'gunfire', code: '02', name: 'Gunfire', blurb: 'Pistols first. Bigger things later.', howToTrain: 'Coming soon: fight with a gun (1 XP per point of damage).' },
  { id: 'defense', code: '03', name: 'Defense', blurb: 'Taking a hit and staying on your feet. Enemies miss you more.', howToTrain: 'Trains in every fight: 0.5 XP for every point of damage you deal, and 0.5 for every point you take.' },
  { id: 'health', code: '04', name: 'Health', blurb: 'How much punishment you can take. Your max HP is your Health level (it starts at 10).', howToTrain: 'Take hits in combat: 1 XP for every point of damage you take.' },
  { id: 'street', code: '05', name: 'Street Crimes', blurb: 'Pickpocketing, shoplifting and other small-time theft.', howToTrain: 'Tap people, cars and doors on the Street.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const SKILL_IDS = SKILLS.map((s) => s.id);

/** Lines for failed attempts, shared by all street crimes. */
