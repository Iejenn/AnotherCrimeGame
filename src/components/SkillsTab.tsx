// Skills: the five skills (levels 1–10 for now). Tap one for its guide: how to train it and,
// for Street Crimes, every crime with its level and where to find it.
import { useState } from 'react';
import type { GameState, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { crimesForSkill } from '../game/data/crimes';
import { crimeStats, fmtDuration, fmtMoney, maxHp, rankFor, skillLevel, totalLevel } from '../game/engine';
import { exportSave } from '../game/save';
import { MAX_LEVEL, levelProgress } from '../game/xp';
import { Bar, pct } from './ui';

export function SkillsTab({ s, onImport, onReset }: { s: GameState; onImport: () => void; onReset: () => void }) {
  const [open, setOpen] = useState<SkillId>('street');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const total = totalLevel(s);
  const rank = rankFor(total);
  const def = SKILL_BY_ID[open];
  const lvl = skillLevel(s, open);
  const lp = levelProgress(s.skills[open].xp);
  const crimes = crimesForSkill(open);

  const makeCode = async () => {
    setCopied(false);
    setCode(await exportSave(s));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard blocked: the text box is selectable as a fallback */
    }
  };

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
                      <div><dt>Where</dt><dd>{crime.spot.label}</dd></div>
                      <div><dt>Time</dt><dd>{fmtDuration(st.duration)}</dd></div>
                      {can && (
                        <>
                          <div><dt>Odds</dt><dd>{pct(st.chance)}</dd></div>
                          <div><dt>XP</dt><dd>{st.xp}</dd></div>
                          <div><dt>Take</dt><dd className="money">${crime.cashMin}–{crime.cashMax}</dd></div>
                        </>
                      )}
                    </dl>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {s.buffs.length > 0 && (
        <section>
          <h3 className="rule-head">Active boosts</h3>
          <ul className="plain small">
            {s.buffs.map((b) => (
              <li key={b.id}>
                {b.label}: +{Math.round(b.value * 100)}% {b.kind}, {b.uses} more jobs
              </li>
            ))}
          </ul>
        </section>
      )}

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
        <h3 className="rule-head">Save</h3>
        <p className="muted small">Saves automatically in this browser. Use a save code to move to another device.</p>
        <div className="save-row">
          <button className="btn small" onClick={makeCode}>Export save code</button>
          <button className="btn small" onClick={onImport}>Import save</button>
          <button className="btn small danger" onClick={onReset}>Start over</button>
        </div>
        {code && (
          <div className="save-out">
            <textarea className="save-code" readOnly value={code} onFocus={(e) => e.target.select()} />
            <div className="save-row">
              <button className="btn small primary" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
              <span className="muted small">{code.length.toLocaleString('en-US')} characters</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
