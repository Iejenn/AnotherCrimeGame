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

// The skills. A new one: a row here, an xp column on public.players, and its name in game.respond / game.save /
// get_highscores on the server.
export const SKILLS: SkillDef[] = [
  // Shown in this order (decided): the combat skills first, Street Crimes last.
  // v0.51: texts checked against the server's rules. The lists under each skill (crimes, enemies, recipes, crafts) come
  // from the data, so these only say how the skill works, not every number.
  { id: 'melee', code: '01', name: 'Melee', blurb: 'Fists, bats, knuckles and knives. How often you hit, and how hard: every 8 levels (9, 17, 25) adds 1 to your max hit.', howToTrain: 'Fight with your fists or a melee weapon: 1 XP for every point of damage you deal. Start on the Pigeons in the park; the enemies below are sorted by level.' },
  { id: 'gunfire', code: '02', name: 'Gunfire', blurb: 'Pistols first. Bigger things later.', howToTrain: 'Coming soon: fight with a gun (1 XP per point of damage).' },
  { id: 'defense', code: '03', name: 'Defense', blurb: 'Taking a hit and staying on your feet. Enemies miss you more, and armour helps too.', howToTrain: 'Trains in every fight: 0.5 XP for every point of damage you deal, and 0.5 for every point you take.' },
  { id: 'health', code: '04', name: 'Health', blurb: 'How much punishment you can take. Your max HP is your Health level (it starts at 10).', howToTrain: 'Take hits in combat: 1 XP for every point of damage you take. Eat cooked food to heal faster.' },
  { id: 'street', code: '05', name: 'Street Crimes', blurb: 'Pickpocketing, shoplifting and other small-time theft.', howToTrain: 'Tap a target (a tourist, a gym bag, a shelf, a parking meter, a car) to try the crime. Each one below unlocks at its level.' },
  { id: 'cooking', code: '06', name: 'Cooking', blurb: 'Turning what you catch into something you can eat. The better you get, the less you burn.', howToTrain: 'Cook raw meat from Pigeons and rats on the barbecue in the pocket park (003-B) or the oil drum in the Sewer. Burnt food is lost and gives no XP.' },
  { id: 'scrapping', code: '07', name: 'Scrapping', blurb: 'Salvaging metal from junk, to make gear from later (Tinkering).', howToTrain: 'Dig through dumpsters for salvage. Not every try finds something; you keep digging until you do.' },
  { id: 'tinkering', code: '08', name: 'Tinkering', blurb: 'Pressing salvage into sheets and making weapons and armour from them.', howToTrain: 'At the Factory in the Industrial zone: press salvage into sheets at a press, then make gear from the sheets at a workbench.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const SKILL_IDS = SKILLS.map((s) => s.id);

/** Lines for failed attempts, shared by all street crimes. */
