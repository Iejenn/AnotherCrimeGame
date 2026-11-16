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
  { id: 'street', code: '01', name: 'Street Crimes', blurb: 'Pickpocketing, shoplifting and other small-time theft.', howToTrain: 'Tap people, cars and doors on the Street.' },
  { id: 'melee', code: '02', name: 'Melee', blurb: 'Fists, bats and broken bottles.', howToTrain: 'Coming soon.' },
  { id: 'defense', code: '03', name: 'Defense', blurb: 'Taking a hit and staying on your feet.', howToTrain: 'Coming soon.' },
  { id: 'gunfire', code: '04', name: 'Gunfire', blurb: 'Pistols first. Bigger things later.', howToTrain: 'Coming soon.' },
  { id: 'health', code: '05', name: 'Health', blurb: 'How much punishment you can take. Every level adds 2 max HP.', howToTrain: 'Coming soon.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const SKILL_IDS = SKILLS.map((s) => s.id);

/** Lines for failed attempts, shared by all street crimes. */
export const FAIL_LINES = [
  '{mark} grabbed their pocket just in time. You melted into the crowd empty-handed.',
  'A security guard at {place} started watching you. You walked away.',
  'Butterfingers. The goods hit the floor and you had to bail.',
  'Someone shouted. You ran before anyone got a good look.',
];
