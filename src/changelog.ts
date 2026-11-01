// Shown on the start-up screen. Add new entries at the TOP; the first entry is the current version.
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
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
