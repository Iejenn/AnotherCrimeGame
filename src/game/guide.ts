// New-player guide: steps tick themselves off from the save, so there's nothing extra to store.
import type { GameState } from './types';
import { skillLevel, totalLevel, unlockedSkills } from './engine';

export type GuideTab = 'jobs' | 'intel' | 'stash' | 'shop' | 'log' | 'profile' | 'guide';

export interface GuideStep {
  id: string;
  title: string;
  how: string;
  tab: GuideTab;
  done: (s: GameState) => boolean;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'first-job',
    title: 'Pull your first job',
    how: 'Open Jobs, find Lift a Wallet under 01 Petty Theft and tap Once. Watch the bar on your crew card: when it fills, the job resolves. Success pays cash and XP, a failure still gives a little XP, and a bust sends you to jail for a short while.',
    tab: 'jobs',
    done: (s) => s.stats.jobs >= 1,
  },
  {
    id: 'full-shift',
    title: 'Queue a full shift and walk away',
    how: 'Tap Full shift to queue as many runs as fit in one shift (2 hours to start). Then close the tab. Jobs keep resolving while you are gone and you get a report when you come back.',
    tab: 'jobs',
    done: (s) => s.stats.jobs >= 25 || s.crew.some((c) => !!c.job && c.job.repsDone + c.job.repsLeft >= 25),
  },
  {
    id: 'petty-5',
    title: 'Reach Petty Theft level 5',
    how: 'Every crime family is its own skill, levelled 1–99. Higher levels raise your odds and unlock better jobs: Shoplift Electronics at 8, Run a Shell Game at 18. Petty Theft 5 also unlocks a new family: Car Theft.',
    tab: 'jobs',
    done: (s) => skillLevel(s, 'petty') >= 5,
  },
  {
    id: 'loot',
    title: 'Find your first loot',
    how: 'Successful jobs sometimes drop loot. Longer jobs and Big Scores drop more often. Sell it in Stash, and every new item fills a slot in your Collection.',
    tab: 'stash',
    done: (s) => s.discovered.length >= 1,
  },
  {
    id: 'perk',
    title: 'Choose your first perk',
    how: 'At levels 10, 25, 40, 60 and 80 of any skill you pick one of two permanent perks: faster jobs, more cash, more XP, fewer busts or more Big Scores. They stack.',
    tab: 'jobs',
    done: (s) => Object.values(s.skills).some((k) => k.perks.length > 0),
  },
  {
    id: 'contract',
    title: 'Claim a daily contract',
    how: 'Intel shows three contracts a day (for example "Complete 20 Petty Theft jobs"). They fill up as you play. Tap Claim for a big cash and XP bonus. Street Intel tips there also boost certain crimes for 3 hours.',
    tab: 'intel',
    done: (s) => (s.stats.contracts ?? 0) >= 1,
  },
  {
    id: 'crew',
    title: 'Hire your first crew member',
    how: 'Shop → Crew. Needs total level 12 and $2,500. Each crew member runs their own job queue at the same time as you, using your skill levels, so you earn twice as fast.',
    tab: 'shop',
    done: (s) => s.crew.length >= 2,
  },
  {
    id: 'upgrade',
    title: 'Invest in your operation',
    how: 'Shop → Operations or Fronts. Planning Board is the best first buy: longer shifts mean checking in less often. Fronts earn cash every hour, even with no jobs running.',
    tab: 'shop',
    done: (s) => Object.keys(s.upgrades).length > 0 || Object.keys(s.fronts).length > 0,
  },
  {
    id: 'families',
    title: 'Open up 4 crime families',
    how: 'Car Theft unlocks at Petty Theft 5, Enforcement at 8, Burglary at 10. Spread your crew over different families to level them side by side.',
    tab: 'jobs',
    done: (s) => unlockedSkills(s).length >= 4,
  },
  {
    id: 'crook',
    title: 'Make Crook (total level 45)',
    how: 'Your rank comes from the levels of all skills added together. From here on it is your call: chase Heists, build fronts, finish the Collection, or max a skill to 99.',
    tab: 'profile',
    done: (s) => totalLevel(s) >= 45,
  },
];

export function guideProgress(s: GameState) {
  const done = GUIDE_STEPS.filter((st) => st.done(s)).length;
  const next = GUIDE_STEPS.find((st) => !st.done(s)) ?? null;
  return { done, total: GUIDE_STEPS.length, next };
}

// Hiding the "next step" card is a per-device preference.
const HIDE_KEY = 'underworld-idle-hide-guide';
export function isGuideHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}
export function setGuideHidden(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDE_KEY, '1');
    else localStorage.removeItem(HIDE_KEY);
  } catch {
    /* ignore */
  }
}
