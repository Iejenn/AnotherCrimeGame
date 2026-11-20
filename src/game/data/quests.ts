// Quests (docs/design.md §16). A quest is data: its steps (the server keeps your step in players.quests), the line in
// your quest log for each step, and what its people say. The server decides every step (quest_talk) and answers with the
// id of the line to show; the words live here.
import type { GameState, SkillId } from '../types';

export interface Quest {
  id: string;
  name: string;
  /** Who you start it with, and where. */
  start: string;
  /** The quest log for each step (0 = not started). A function when the line depends on what you carry. */
  log: Record<number, string | ((s: GameState) => string)>;
  /** The step at which it's done. */
  done: number;
  reward: string;
  /** Levels we advise before you start (v0.62): shown in the quest log, never required. 'combat' is your combat level. */
  advised?: { skill: SkillId | 'combat'; level: number }[];
}

/** Do you have this item, in your bag or your bank? */
export const hasAnywhere = (s: GameState, id: string) => (s.inventory[id] ?? 0) > 0 || (s.bank ?? []).some((b) => b.i === id);

export const QUESTS: Quest[] = [
  {
    id: 'sewer_problems',
    name: 'Sewer Problems',
    start: 'Talk to Splinter, sitting against the north wall of the sewer.',
    log: {
      1: 'Maybe someone in the hospital can help.',
      2: (s) =>
        hasAnywhere(s, 'cooked_rat_antidote')
          ? 'Bring the Cooked Rat Antidote to Splinter in the sewer.'
          : 'Elliot gave me a Rat Antidote. I should drip it over some cooked rat meat (use the antidote on it).',
      3: 'Splinter gave me a Sewer Key. Where might it fit?',
    },
    done: 3,
    reward: '+50 Cooking XP and the Sewer Key (it opens the gate to the Rat Nest).',
    // You fight a rat for its meat: a brand-new character (combat 3, fists) wins only about 5 in 6; at combat 4 about
    // 49 in 50 (simulated, v0.62).
    advised: [{ skill: 'combat', level: 5 }],
  },
];
export const QUEST_BY_ID: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const questStep = (s: GameState, id: string) => s.quests?.[id] ?? 0;
export function questLog(s: GameState, q: Quest) {
  const line = q.log[questStep(s, q.id)];
  return typeof line === 'function' ? line(s) : line ?? q.start;
}

/** What people say, by the line id the server answers with (quest_talk's reason). */
export const QUEST_LINES: Record<string, { who: string; text: string[] }> = {
  // Splinter
  sp_offer: {
    who: 'Splinter',
    text: [
      "Argh… don't come any closer, there's rats down there the size of dogs. Big ones. One of them bit me.",
      "I can't feel my legs. I've been sitting here for hours. Can you help me?",
    ],
  },
  sp_accepted: { who: 'Splinter', text: ["Thank you. They patched up half this city at the hospital… maybe someone there knows what to do."] },
  sp_declined: { who: 'Splinter', text: ["Fine. I'll just… sit here then."] },
  sp_waiting: { who: 'Splinter', text: ["Did you find someone at the hospital? I still can't feel a thing."] },
  sp_thanks: {
    who: 'Splinter',
    text: [
      "Rat meat… with the antidote on it? Tastes awful. But… wait. I can feel my toes!",
      "Here, take this key. It opens the gate at the end of the tunnel. That's where the big ones live. Be careful.",
    ],
  },
  sp_already: { who: 'Splinter', text: ['I already gave you my key. The gate is at the end of the tunnel, just east of here.'] },
  sp_new_key: { who: 'Splinter', text: ["Lost my key already? Lucky for you I had a spare. Don't lose this one."] },
  sp_done: { who: 'Splinter', text: ["Back on my feet, thanks to you. Watch yourself in the nest."] },
  // The doctors
  jd: { who: 'JD', text: ["I'm so busy, this patient needs to see Turk soon."] },
  el_hello: { who: 'Elliot', text: ["Hi! If you're hurt, lie down on one of the beds. Well, you'll wake up on one anyway."] },
  el_antidote: {
    who: 'Elliot',
    text: [
      'Bitten by a rat in the sewer, and he can\'t feel his legs? That sounds like rat fever. Frick.',
      "Here's a Rat Antidote. Drip it over some cooked rat meat and make him eat it: it works best with food.",
    ],
  },
  el_antidote_again: { who: 'Elliot', text: ["You lost the antidote? Okay, here's another one. Drip it over cooked rat meat."] },
  el_already: { who: 'Elliot', text: ['I already gave it to you. Drip the antidote over some cooked rat meat and bring it to him.'] },
  el_after: { who: 'Elliot', text: ['How is the man in the sewer doing? Good. I told you rat fever was a thing.'] },
};
