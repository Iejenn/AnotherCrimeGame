import type { SkillId } from '../types';

export interface SkillDef {
  id: SkillId;
  name: string;
  short: string;
  icon: string;
  blurb: string;
  /** Heavier crime families pay more per hour at the same level. */
  cashMult: number;
  /** Requirements to unlock this skill. `total` = total level across all skills. */
  unlock: { skill?: Partial<Record<SkillId, number>>; total?: number };
  failLines: string[];
  bustLines: string[];
}

export const SKILLS: SkillDef[] = [
  {
    id: 'petty',
    name: 'Petty Theft',
    short: 'Petty',
    icon: '🖐',
    blurb: 'Light fingers, fast feet. Everyone starts somewhere.',
    cashMult: 1,
    unlock: {},
    failLines: [
      '{mark} grabbed their pocket just in time. You melted into the crowd empty-handed.',
      'A security guard at {place} started watching you. You walked away.',
      'Butterfingers. The goods hit the floor and you had to bail.',
    ],
    bustLines: [
      'A plain-clothes cop at {place} had you cuffed before you blinked.',
      '{mark} turned out to be an off-duty detective. Bad luck.',
    ],
  },
  {
    id: 'auto',
    name: 'Car Theft',
    short: 'Auto',
    icon: '🚗',
    blurb: 'Every car is just a door and an ignition. Stolen rides fill your garage and power smuggling runs.',
    cashMult: 1.2,
    unlock: { skill: { petty: 5 } },
    failLines: [
      'The alarm screamed the second you touched the door. You jogged off.',
      'Steering lock. You did not bring the right tools.',
      'The owner came back from {place} early. Abort.',
    ],
    bustLines: [
      'A patrol car rolled up while you were under the dash.',
      'The car had a GPS tracker. The cops were waiting at the chop shop.',
    ],
  },
  {
    id: 'burglary',
    name: 'Burglary',
    short: 'Burglary',
    icon: '🔓',
    blurb: 'Locks, alarms, and the patience to beat them both.',
    cashMult: 1.3,
    unlock: { skill: { petty: 10 } },
    failLines: [
      'A dog. Nobody mentioned the dog.',
      'The lock beat you tonight. You will be back.',
      'Lights came on upstairs. You slipped out the window you came in.',
    ],
    bustLines: [
      'Silent alarm. You walked out the front door into a spotlight.',
      'A neighbour filmed the whole thing and called it in.',
    ],
  },
  {
    id: 'muscle',
    name: 'Enforcement',
    short: 'Muscle',
    icon: '👊',
    blurb: 'Collections, protection, persuasion. Some problems need a heavy hand.',
    cashMult: 1.2,
    unlock: { skill: { petty: 8 } },
    failLines: [
      'They called your bluff and you did not want a scene at {place}.',
      'He had bigger friends than you. Tactical retreat.',
      'Nobody was home. Come back tomorrow.',
    ],
    bustLines: [
      'Someone called the cops halfway through the conversation.',
      'The mark was wearing a wire. Of course he was.',
    ],
  },
  {
    id: 'fraud',
    name: 'Fraud & Cyber',
    short: 'Fraud',
    icon: '💻',
    blurb: 'Why break a window when you can break a password?',
    cashMult: 1.5,
    unlock: { skill: { burglary: 10 } },
    failLines: [
      'The bank flagged the transfers. Funds frozen, trail cold.',
      'Two-factor auth. Your victim is smarter than they look.',
      'The server got patched an hour before you hit it.',
    ],
    bustLines: [
      'You forgot the VPN. The cyber unit traced you in minutes.',
      'Your money mule flipped and gave them your handle.',
    ],
  },
  {
    id: 'smuggling',
    name: 'Smuggling',
    short: 'Smuggle',
    icon: '📦',
    blurb: 'Move product, avoid checkpoints. The better your car, the bigger the haul.',
    cashMult: 1.7,
    unlock: { skill: { auto: 15 } },
    failLines: [
      'Roadblock ahead. You dumped the cargo in a ditch and drove on.',
      'The buyer at {place} never showed. Wasted trip.',
      'Customs got a new sniffer dog. You turned the boat around.',
    ],
    bustLines: [
      'Random checkpoint. They opened the trunk.',
      'Coast guard was waiting at the drop.',
    ],
  },
  {
    id: 'robbery',
    name: 'Armed Robbery',
    short: 'Robbery',
    icon: '🔫',
    blurb: 'Loud, fast, profitable. Needs both nerve and know-how.',
    cashMult: 2,
    unlock: { skill: { muscle: 20, burglary: 20 } },
    failLines: [
      'The clerk hit the panic button. You ran before the doors locked.',
      'The safe was on a time lock. Empty bag.',
      'Your getaway driver panicked and left early. You walked.',
    ],
    bustLines: [
      'SWAT was two blocks away for an unrelated call. Unlucky.',
      'A dye pack exploded in the car. They followed the pink smoke.',
    ],
  },
  {
    id: 'heist',
    name: 'Heists',
    short: 'Heist',
    icon: '💎',
    blurb: 'Months of planning for one perfect night. The endgame.',
    cashMult: 3,
    unlock: { skill: { robbery: 15 }, total: 120 },
    failLines: [
      'The blueprints were outdated. You aborted at the vault door.',
      'An inside man got cold feet. The plan collapsed.',
      'Guard rotation changed. Pull out, regroup.',
    ],
    bustLines: [
      'Someone in the crew talked. The feds were waiting inside.',
      'Laser grid recalibrated mid-job. Everything went red.',
    ],
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
export const SKILL_IDS = SKILLS.map((s) => s.id);
