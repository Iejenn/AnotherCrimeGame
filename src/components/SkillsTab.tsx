// Skills: the five skills (levels 1–30 for now). Tap one for its guide: how to train it and,
// for Street Crimes, every crime with its level and where to find it.
import { useState } from 'react';
import type { GameState, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { crimesForSkill } from '../game/data/crimes';
import { crimeStats, fmtDuration, fmtMoney, maxHp, rankFor, skillLevel, totalLevel } from '../game/engine';
import { MAX_LEVEL, levelProgress } from '../game/xp';
import { Bar, pct } from './ui';
import { ITEM_BY_ID } from '../game/data/items';
import type { CrimeDef } from '../game/data/crimes';
import { NODES } from '../street/map';

/** Crimes that already have a place on the Street (v2 is built step by step). */
const PLACED = new Set(NODES.map((n) => n.crimeId));

/** "$1–3", or the food you get: "Candy Bar", "Sandwich or Candy Bar". */
function take(c: CrimeDef) {
  if (c.items?.length) return c.items.map((id) => ITEM_BY_ID[id]?.name ?? id).join(' or ');
  return `$${c.cashMin}–${c.cashMax}`;
}

/** What happens when it goes wrong. */
function risk(c: CrimeDef) {
  const hurt = `−${c.failDamage} HP, stunned ${c.failStun}s`;
  if (c.catcher === 'bartender') return `If the bartender sees you: ${hurt}`;
  if (c.catcher === 'guard') return c.baseChance >= 1 ? `If the guard sees you: ${hurt}` : `On a fail, or if the guard sees you: ${hurt}`;
  if (c.catcher === 'clerk') return `On a fail the clerk hits you: ${hurt}`;
  return `On a fail: ${hurt}`;
}

export function SkillsTab({ s, account }: { s: GameState; account: { email: string; onSignOut: () => void } }) {
  const [open, setOpen] = useState<SkillId>('street');
  const total = totalLevel(s);
  const rank = rankFor(total);
  const def = SKILL_BY_ID[open];
  const lvl = skillLevel(s, open);
  const lp = levelProgress(s.skills[open].xp);
  const crimes = crimesForSkill(open);

  return (
    <div className="skills">
      <div className="skills-head">
        <h2 className="headline">{s.name}</h2>
        <div className="skills-total">
          <span className="stamp small">{rank.name}</span>
          <span className="mono">Total level {total}</span>
          {rank.next && (
            <span className="muted small">
              {rank.next[1]} at {rank.next[0]}
            </span>
          )}
        </div>
      </div>

      <div className="skill-grid">
        {SKILLS.map((sk) => {
          const p = levelProgress(s.skills[sk.id].xp);
          return (
            <button key={sk.id} className={`skill-cell ${open === sk.id ? 'active' : ''}`} onClick={() => setOpen(sk.id)}>
              <span className="code">{sk.code}</span>
              <span className="skill-cell-name">{sk.name}</span>
              <span className="num">
                {p.level}
                <span className="muted">/{MAX_LEVEL}</span>
              </span>
              <Bar pct={p.pct} />
            </button>
          );
        })}
      </div>

      <section className="skill-guide">
        <div className="kicker">Skill {def.code}</div>
        <h2 className="headline">
          {def.name} <span className="num">Lv {lvl}</span>
        </h2>
        <p className="deck">{def.blurb}</p>
        <Bar pct={lp.pct} label={lp.needed ? `${Math.floor(lp.into).toLocaleString('en-US')} / ${lp.needed.toLocaleString('en-US')} XP` : 'Max level (for now)'} />
        <p className="small">
          <span className="label">How to train</span> {def.howToTrain}
        </p>
        {open === 'health' && <p className="small">Max health right now: {maxHp(s)} HP. Health also comes back on its own, 1 HP per minute.</p>}
        {crimes.length > 0 && (
          <ol className="ledger">
            {crimes.map((crime) => {
              const can = lvl >= crime.level;
              const st = crimeStats(s, crime);
              return (
                <li key={crime.id} className={`entry ${can ? '' : 'locked'}`}>
                  <div className="entry-main">
                    <div className="entry-title">
                      <span className="mono small lvl-col">{crime.level}</span>
                      <span className="entry-name">{crime.name}</span>
                    </div>
                    <dl className="entry-stats">
                      <div><dt>Where</dt><dd>{crime.spot.where}{PLACED.has(crime.id) ? '' : ' (coming soon)'}</dd></div>
                      <div><dt>Time</dt><dd>{fmtDuration(st.duration)}</dd></div>
                      {can && (
                        <>
                          <div><dt>Odds</dt><dd>{crime.baseChance >= 1 ? '100% if unseen' : pct(st.chance)}</dd></div>
                          <div><dt>XP</dt><dd>{st.xp}</dd></div>
                          <div><dt>Take</dt><dd className="money">{take(crime)}</dd></div>
                        </>
                      )}
                    </dl>
                    {can && <p className="muted small entry-risk">{risk(crime)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section>
        <h3 className="rule-head">Record</h3>
        <div className="stats-grid">
          <div><span className="muted">Jobs pulled</span><strong>{s.stats.jobs.toLocaleString('en-US')}</strong></div>
          <div><span className="muted">Big scores</span><strong>{s.stats.bigScores.toLocaleString('en-US')}</strong></div>
          <div><span className="muted">Failed attempts</span><strong>{s.stats.fails.toLocaleString('en-US')}</strong></div>
          <div><span className="muted">Lifetime earnings</span><strong>{fmtMoney(s.stats.earned)}</strong></div>
        </div>
      </section>

      <section>
        <h3 className="rule-head">Account</h3>
        <p className="muted small">Your character is saved on the server, on every device you sign in on. Signed in as {account.email}.</p>
        <div className="save-row">
          <button className="btn small" onClick={account.onSignOut}>Sign out</button>
        </div>
      </section>
    </div>
  );
}
