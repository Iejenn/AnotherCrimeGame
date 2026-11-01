import type { GameState } from '../game/types';
import { GUIDE_STEPS, guideProgress, type GuideTab } from '../game/guide';

const TAB_NAMES: Record<GuideTab, string> = { jobs: 'Jobs', intel: 'Intel', stash: 'Stash', shop: 'Shop', log: 'Log', profile: 'Profile', guide: 'Guide' };

/** Small card under the crew panel: the one thing a new player should do next. */
export function NextStep({ s, onGo, onHide }: { s: GameState; onGo: (tab: GuideTab) => void; onHide: () => void }) {
  const { done, total, next } = guideProgress(s);
  if (!next) return null;
  return (
    <aside className="next-step" aria-label="Next step">
      <div className="next-head">
        <span className="kicker">
          Step {done + 1} of {total}
        </span>
        <button className="btn link small" onClick={onHide}>
          Hide guide
        </button>
      </div>
      <strong className="next-title">{next.title}</strong>
      <p className="next-how">{next.how}</p>
      <div className="save-row">
        <button className="btn small primary" onClick={() => onGo(next.tab)}>
          Go to {TAB_NAMES[next.tab]}
        </button>
        <button className="btn small" onClick={() => onGo('guide')}>
          Full guide
        </button>
      </div>
    </aside>
  );
}

const REFERENCE: { title: string; body: string[] }[] = [
  {
    title: 'Skills and levels',
    body: [
      'There are 8 crime families, and each one is its own skill from level 1 to 99: Petty Theft, Car Theft, Burglary, Enforcement, Fraud & Cyber, Smuggling, Armed Robbery and Heists.',
      'Heavier families unlock as you level lighter ones. The locked text on each family tells you what it needs.',
      'A job keeps giving more XP for up to 5 levels past its requirement, then levels off. That is your cue to move up to the next job.',
    ],
  },
  {
    title: 'Reading a job',
    body: [
      'Odds: chance the job succeeds. Rises with your level, gear, mastery and tips. Falls as heat rises.',
      'Risk: if the job fails, the chance it turns into a bust (jail).',
      'Big: chance of a Big Score, which pays triple cash and double XP.',
      'Take: cash per success. Car Theft pays out in cars instead.',
      'Jail: how long you sit out if busted. Your queue waits for you, it is not wiped.',
      'Mastery: stars earned by repeating the same job. Each star makes it a bit faster, safer and luckier.',
    ],
  },
  {
    title: 'Shifts and playing idle',
    body: [
      'Once runs one job. ×10 queues ten. Full shift queues as many as fit in your shift length (2h at start, up to 24h with the Planning Board).',
      'You do not need the tab open. When you come back, everything that finished is worked out and summed up on the start screen.',
    ],
  },
  {
    title: 'Heat',
    body: [
      'Every job adds heat, and failures add more. High heat lowers your odds and raises bust risk.',
      'Heat cools down over time on its own. A Safehouse makes it cool faster, and "Pay off a detective" knocks off 40 at once.',
      'A bust also cools things down, but you lose time in jail. Post bail to get out early.',
    ],
  },
  {
    title: 'Crew',
    body: [
      'Hire up to 4 extra crew in Shop. Each one runs their own queue in parallel, using your skill levels.',
      'Every crew member has a trait: Quick (faster jobs), Lucky (more Big Scores), Careful (fewer busts), Greedy (more cash) or Bright (more XP).',
    ],
  },
  {
    title: 'Perks',
    body: ['At levels 10, 25, 40, 60 and 80 of each skill, pick one of two permanent perks for that skill. Picking the same perk twice stacks.'],
  },
  {
    title: 'Loot, cars and the Collection',
    body: [
      'Loot comes in four rarities: common, uncommon, rare and legendary. Sell it in Stash, or Fence everything at once.',
      'Stolen cars park in your garage. Your best car boosts Smuggling cash, so keep a good one. When the garage is full, new cars are chopped for parts.',
      'Every item you find is logged in the Collection.',
    ],
  },
  {
    title: 'Intel and contracts',
    body: [
      'Street Intel changes every 3 hours. Each tip boosts (or sometimes risks) one crime family. A small TIP tag in the Jobs list shows which ones.',
      'Three daily contracts reset at midnight UTC. Rewards scale with your level.',
      'Random encounters can happen on any job and give boosts, cash, loot, or extra heat.',
    ],
  },
  {
    title: 'Shop',
    body: [
      'Operations: Planning Board (longer shifts), Lawyer (shorter jail), Safehouse (faster cooling), Garage (more car space), Fence (better sell prices).',
      'Fronts: businesses that earn every hour and hold up to 12 hours of income. Collect from the top bar.',
      'Gear: one piece per family applies (your best one). It adds odds and cash.',
    ],
  },
  {
    title: 'Saving',
    body: [
      'The game saves automatically in this browser.',
      'To play on another device, go to Profile → Export save code, copy it, and use Import on the other device.',
    ],
  },
];

export function GuideTab({ s, onGo, hidden, onShow }: { s: GameState; onGo: (tab: GuideTab) => void; hidden: boolean; onShow: () => void }) {
  const { done, total } = guideProgress(s);
  return (
    <div className="guide">
      <h2>Getting started</h2>
      <p className="muted">
        {done} of {total} done. Steps tick themselves off as you play.
        {hidden && done < total && (
          <>
            {' '}
            <button className="btn link small" onClick={onShow}>
              Show the next-step card again
            </button>
          </>
        )}
      </p>
      <ol className="steps">
        {GUIDE_STEPS.map((st, i) => {
          const ok = st.done(s);
          return (
            <li key={st.id} className={ok ? 'done' : ''}>
              <span className="step-no">{ok ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{st.title}</strong>
                {!ok && <p className="muted">{st.how}</p>}
                {!ok && st.tab !== 'guide' && (
                  <button className="btn tiny" onClick={() => onGo(st.tab)}>
                    Go to {TAB_NAMES[st.tab]}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <h2>How it works</h2>
      {REFERENCE.map((r) => (
        <details key={r.title} className="ref">
          <summary>{r.title}</summary>
          {r.body.map((b, i) => (
            <p key={i}>{b}</p>
          ))}
        </details>
      ))}
    </div>
  );
}
