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
  {
    // v0.62: no fighting. Gus at Hotline → the bartender → the water main off → tin salvage (Thrift Store yard) → a sheet
    // (Factory press) → a Pipe Elbow (Factory workbench) → fit it on the leak → the water main on → back to Gus.
    id: 'pipe_dreams',
    name: 'Pipe Dreams',
    start: 'Talk to Gus at Hotline Plumbing & Heating, in the Industrial zone.',
    log: {
      1: 'Gus sent me to the bar down the road. The bartender will show me the leak.',
      2: 'Turn off the water at the main: a valve on the sidewalk, across the street from the bar.',
      3: (s) =>
        hasAnywhere(s, 'pipe_elbow')
          ? "I've got a Pipe Elbow. Fit it on the burst pipe in the bar (the west wall, past the end of the bar)."
          : 'The pipe needs a new Pipe Elbow: tin salvage from the Thrift Store\'s yard, pressed into a sheet at the Factory, bent into an elbow at a workbench there.',
      4: 'The pipe is fixed. Turn the water back on at the main, across the street from the bar.',
      5: 'The water is back on. Tell Gus the good news.',
    },
    done: 6,
    reward: '+50 Scrapping XP, +50 Tinkering XP and $50.',
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

  // ---------- Pipe Dreams (v0.62) ----------
  // Gus, at Hotline Plumbing & Heating
  gu_offer: {
    who: 'Gus',
    text: [
      'Hotline Plumbing & Heating, Gus speaking. Oh. You\'re not the phone.',
      "The bar down the road's got a burst pipe, and I can't go. My back went out. Went right out. Like a pipe.",
      "Fix it for me? I'll pay you for the hassle. Plumbing's a flush business.",
    ],
  },
  gu_accepted: { who: 'Gus', text: ["Great! The bartender will show you the leak. And don't drink the water. Or the beer, frankly."] },
  gu_declined: { who: 'Gus', text: ["Fine. I'll just wait for the bar to float over here."] },
  gu_bar: { who: 'Gus', text: ['Seen the bartender yet? The bar, down the road. Big room, wet floor. You can\'t miss it.'] },
  gu_main: {
    who: 'Gus',
    text: [
      "First rule of plumbing: turn the water off. Second rule: don't tell anyone how long you forgot the first rule.",
      "The bar's main is on the sidewalk across the street. Red wheel. Righty tighty.",
    ],
  },
  gu_elbow: {
    who: 'Gus',
    text: [
      'A cracked elbow? Classic. You need a new one.',
      "Dig some tin salvage out of the Thrift Store's yard, press it into a sheet at the Factory, then bend it into a Pipe Elbow at a workbench. Easy. Well, easier than my back.",
    ],
  },
  gu_water: { who: 'Gus', text: ['Fixed it? Then turn the water back on at the main. A bar without water is just a room with chairs.'] },
  gu_thanks: {
    who: 'Gus',
    text: [
      'The bartender called! Dry floors, running taps, happy drinkers. You did it.',
      "Here's fifty bucks for the hassle. You've got a future in pipes, kid. A drain-gerous one.",
    ],
  },
  gu_done: { who: 'Gus', text: ['Back\'s still out. Business keeps dripping in, though.'] },
  // The bartender (only while you're on the quest)
  bt_leak: {
    who: 'Bartender',
    text: [
      'Gus sent you? Thank god. Look at this floor.',
      'The pipe on the back wall burst. The beer\'s watered down. More than usual.',
      "Turn the water off at the main first: it's across the street, on the sidewalk. Then see what that pipe needs.",
    ],
  },
  bt_main: { who: 'Bartender', text: ["The main's across the street. A red wheel on the sidewalk. Turn it off before you touch that pipe."] },
  bt_fix: { who: 'Bartender', text: ["Water's off? Good. Now fix that pipe before the regulars notice there's nothing left to dilute the drinks with."] },
  bt_on: { who: 'Bartender', text: ['Looks great! Now turn the water back on. The regulars are drinking straight from the floor, out of habit.'] },
  bt_after: { who: 'Bartender', text: ['Dry floor, running water, same old regulars. Tell Gus thanks.'] },
  // The water main and the burst pipe (these show in your log, not a dialog)
  wm_nothing: { who: '', text: ["A valve for the bar's water. Messing with the city's water for fun? Not today."] },
  wm_off: { who: '', text: ['You crank the wheel shut. Somewhere across the street, a bartender stops being rained on.'] },
  wm_already_off: { who: '', text: ["The water's already off. The wheel won't go any shutter."] },
  wm_on: { who: '', text: ['You open the valve. The pipes gurgle happily. Time to tell Gus.'] },
  wm_done: { who: '', text: ["The water's on and the pipes are happy. Best leave it."] },
  lk_nothing: { who: '', text: ['A burst pipe sprays water across the floor. Not your problem. Yet.'] },
  lk_spraying: { who: '', text: ['Water sprays everywhere. Turn it off at the main first, unless you fancy a shower.'] },
  lk_need_elbow: { who: '', text: ["The elbow joint is cracked clean through. You'll need a new Pipe Elbow: a tin sheet, bent at a Factory workbench."] },
  lk_fixed: { who: '', text: ['You fit the new Pipe Elbow and tighten it up. Snug as a bug in a plug. Now turn the water back on at the main.'] },
  lk_done: { who: '', text: ['A fine bit of plumbing, if you say so yourself.'] },
};
