// Shown on the start-up screen. Add new entries at the TOP; the first entry is the current version.
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.6.0',
    date: '2026-11-15',
    title: "Eddy's General Store",
    items: [
      "Eddy has opened a General Store just north of where you start. NPC names are yellow: tap him to talk.",
      'Sell: tap an item to hear what Eddy pays, tap it again to sell one. He takes car keys too.',
      'Buy: his shelves are empty for now. A delivery is coming.',
      'The currency is now gold, and earnings are much lower: a picked pocket pays 1–3 gold. Older saves had their gold scaled down to match.',
      'New: health. A failed job costs a little HP, and it comes back at 1 per minute. At 0 you stop working until you have rested.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-15',
    title: 'Back to the streets',
    items: [
      'The game is now all about the Street: four tabs, Street, Inventory, Quests and Skills.',
      'Drag to turn the camera, pinch to zoom. No more blue flash when you tap.',
      'New Inventory: 28 slots with your cash, loot and car keys. Selling comes back with a store on the Street.',
      'Skills shows every crime per skill: what level you need, where to find it on the map, and your mastery.',
      'Quests are coming soon.',
      'Removed: the Jobs list, hiring crew, the shop (gear, upgrades, fronts), Intel and contracts, the collection, the log and the guide.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-15',
    title: 'The Street (test version)',
    items: [
      'New Street tab: walk a 3D city. Tap the ground to walk, tap a tourist, car or door to work it.',
      'Your character keeps working a spot until you walk away, and it keeps going while the app is closed.',
      'Every crime has its own spot. Heavier crimes are further from the centre, and locked ones tell you what level you need.',
      'Your crew stand at the spots they are working.',
      'Fixed a few log lines that started with a small letter.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-01',
    title: 'A guide for new players, and short save codes',
    items: [
      'New Guide tab: 10 getting-started steps that tick off as you play, plus a "how it works" page for every system.',
      'A "next step" card under your crew shows new players what to do next. Hide it any time.',
      'Save codes are about 30× shorter (around 1,000 characters instead of 27,000), with a Copy button. Old codes still work.',
      'Importing a save now asks before it replaces your current character.',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-11-01',
    title: 'Fixes',
    items: [
      'Numbers always use a comma for thousands ($3,210). Dutch phones were showing $3.210.',
      'TIP tags no longer overlap other crime families on phones.',
      '"Give them a job" now picks that crew member and jumps to the job list.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-01',
    title: 'New look, new front door',
    items: [
      'Fresh case-file look: ledger rows, newspaper headlines, rubber-stamp ranks.',
      'Start-up screen with your character file, what your crew did while you were gone, and what changed.',
      'The game now lives on GitHub Pages.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-01',
    title: 'Opening night',
    items: [
      '8 crime skills, 56 crimes, levels 1–99.',
      'Queue a shift, close the tab: jobs keep running while you are away.',
      'Crew, perks, mastery, gear, fronts, Street Intel and daily contracts.',
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0].version;

// Which version this browser has already seen, so new entries get a "NEW" stamp.
const SEEN_KEY = 'underworld-idle-seen-version';
export function getSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
export function markVersionSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CURRENT_VERSION);
  } catch {
    /* ignore */
  }
}
