// Skills: RuneScape-style skill grid. Tap a skill for its guide: what you can do, at what level, and where.
import { useState } from 'react';
import type { GameState, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { crimesForSkill } from '../game/data/crimes';
import { ORIGIN_BY_ID, PERKS } from '../game/data/world';
import { crimeStats, fmtDuration, fmtMoney, isUnlocked, masteryLevel, rankFor, skillLevel, totalLevel } from '../game/engine';
import { NODES } from '../street/map';
import { exportSave } from '../game/save';
import { levelProgress } from '../game/xp';
import { Bar, Stars, pct } from './ui';

const spotOf = (crimeId: string) => NODES.find((n) => n.crimeId === crimeId && !n.wanders)?.label ?? '—';

function unlockText(id: SkillId) {
  const u = SKILL_BY_ID[id].unlock;
  const parts = Object.entries(u.skill ?? {}).map(([k, v]) => `${SKILL_BY_ID[k as SkillId].name} ${v}`);
  if (u.total) parts.push(`total level ${u.total}`);
  return parts.join(' and ');
}

export function SkillsTab({ s, onImport, onReset }: { s: GameState; onImport: () => void; onReset: () => void }) {
  const [open, setOpen] = useState<SkillId>('petty');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const total = totalLevel(s);
  const rank = rankFor(total);
  const now = Date.now();
  const def = SKILL_BY_ID[open];
  const unlocked = isUnlocked(s, open);
  const lvl = skillLevel(s, open);

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
        <div>
          <h2 className="headline">{s.name}</h2>
          <div className="muted small">{ORIGIN_BY_ID[s.origin].name}</div>
        </div>
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
          const lp = levelProgress(s.skills[sk.id].xp);
          const ok = isUnlocked(s, sk.id);
          return (
            <button key={sk.id} className={`skill-cell ${open === sk.id ? 'active' : ''} ${ok ? '' : 'locked'}`} onClick={() => setOpen(sk.id)}>
              <span className="code">{sk.code}</span>
              <span className="skill-cell-name">{sk.name}</span>
              <span className="num">{ok ? lp.level : '—'}</span>
              {ok && <Bar pct={lp.pct} />}
            </button>
          );
        })}
      </div>

      <section className="skill-guide">
        <div className="kicker">File {def.code}</div>
        <h2 className="headline">
          {def.name} {unlocked && <span className="num">Lv {lvl}</span>}
        </h2>
        <p className="deck">{def.blurb}</p>
        {unlocked ? (
          (() => {
            const lp = levelProgress(s.skills[open].xp);
            return <Bar pct={lp.pct} label={lp.needed ? `${Math.floor(lp.into).toLocaleString('en-US')} / ${lp.needed.toLocaleString('en-US')} XP` : 'Max level'} />;
          })()
        ) : (
          <p className="locked-note">Locked. Requires {unlockText(open)}.</p>
        )}
        {s.skills[open].perks.length > 0 && (
          <p className="small">
            <span className="label">Perks</span> {s.skills[open].perks.map((p) => PERKS[p].name).join(' · ')}
          </p>
        )}
        <ol className="ledger">
          {crimesForSkill(open).map((crime) => {
            const can = unlocked && lvl >= crime.level;
            const st = crimeStats(s, crime, now);
            const count = s.mastery[crime.id] ?? 0;
            return (
              <li key={crime.id} className={`entry ${can ? '' : 'locked'}`}>
                <div className="entry-main">
                  <div className="entry-title">
                    <span className="mono small lvl-col">{crime.level}</span>
                    <span className="entry-name">{crime.name}</span>
                  </div>
                  <dl className="entry-stats">
                    <div><dt>Where</dt><dd>{spotOf(crime.id)}</dd></div>
                    <div><dt>Time</dt><dd>{fmtDuration(st.duration)}</dd></div>
                    {can && (
                      <>
                        <div><dt>Odds</dt><dd>{pct(st.chance)}</dd></div>
                        <div><dt>XP</dt><dd>{st.xp.toLocaleString('en-US')}</dd></div>
                        <div><dt>Take</dt><dd className="money">{crime.carClasses ? 'a car' : `${fmtMoney(crime.cashMin * st.cashMult)}–${fmtMoney(crime.cashMax * st.cashMult)}`}</dd></div>
                        <div><dt>Mastery</dt><dd><Stars n={masteryLevel(count)} /></dd></div>
                      </>
                    )}
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {s.buffs.length > 0 && (
        <section>
          <h3 className="rule-head">Active boosts</h3>
          <ul className="plain small">
            {s.buffs.map((b) => (
              <li key={b.id}>
                {b.label}: +{Math.round(b.value * 100)}% {b.kind}
                {b.skill ? ` (${SKILL_BY_ID[b.skill].name})` : ''}, {b.uses} more jobs
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
          <div><span className="muted">Times busted</span><strong>{s.stats.busts.toLocaleString('en-US')}</strong></div>
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
