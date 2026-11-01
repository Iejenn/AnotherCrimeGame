import { useEffect, useRef, useState } from 'react';
import type { GameState, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { crimesForSkill } from '../game/data/crimes';
import { PERKS } from '../game/data/world';
import { canStart, crimeStats, fmtDuration, fmtMoney, isUnlocked, masteryLevel, maxReps, MASTERY_THRESHOLDS, skillLevel, startJob } from '../game/engine';
import { tipsAt } from '../game/intel';
import { levelProgress } from '../game/xp';
import { Bar, Stars, pct } from './ui';

type Act = (fn: (d: GameState, now: number) => void) => void;

function unlockText(id: SkillId) {
  const u = SKILL_BY_ID[id].unlock;
  const parts = Object.entries(u.skill ?? {}).map(([k, v]) => `${SKILL_BY_ID[k as SkillId].name} ${v}`);
  if (u.total) parts.push(`total level ${u.total}`);
  return parts.join(' and ');
}

export function JobsTab({ s, now, act, assignRequest }: { s: GameState; now: number; act: Act; assignRequest: { crewId: string; n: number } | null }) {
  const [skill, setSkill] = useState<SkillId>('petty');
  const idle = s.crew.filter((c) => !c.job);
  const [crewId, setCrewId] = useState<string>('');
  const [flash, setFlash] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // "Give them a job" on a crew card: pick that crew member, make sure we're on an unlocked
  // crime family, then scroll the job list into view and briefly highlight the "Send" picker.
  useEffect(() => {
    if (!assignRequest) return;
    setCrewId(assignRequest.crewId);
    if (!isUnlocked(s, skill)) setSkill('petty');
    setFlash(true);
    const raf = requestAnimationFrame(() => {
      assignRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      selectRef.current?.focus({ preventScroll: true });
    });
    const t = setTimeout(() => setFlash(false), 1600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
    // Only react to new clicks, not to every state tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignRequest?.n]);
  const selectedCrew = idle.find((c) => c.id === crewId) ?? idle[0];
  const tips = tipsAt(now);
  const unlocked = isUnlocked(s, skill);

  return (
    <div className="jobs">
      <nav className="skill-index" aria-label="Crime families">
        {SKILLS.map((sk) => {
          const open = isUnlocked(s, sk.id);
          const lp = levelProgress(s.skills[sk.id].xp);
          const hot = open && tips.some((t) => t.skill === sk.id);
          return (
            <button
              key={sk.id}
              className={`index-row ${skill === sk.id ? 'active' : ''} ${open ? '' : 'locked'}`}
              onClick={() => setSkill(sk.id)}
              aria-pressed={skill === sk.id}
            >
              <span className="code">{sk.code}</span>
              <span className="index-name">
                {sk.name}
                {hot && <span className="tip-mark" title="Street Intel tip active">tip</span>}
              </span>
              <span className="num">{open ? lp.level : '—'}</span>
              {open && <Bar pct={lp.pct} />}
            </button>
          );
        })}
      </nav>

      <div className="crime-pane">
        <SkillHeader s={s} skill={skill} />
        {!unlocked ? (
          <p className="locked-note">Locked. Requires {unlockText(skill)}.</p>
        ) : (
          <div className={`assign ${flash ? 'flash' : ''}`} ref={assignRef}>
            {idle.length === 0 ? (
              <span className="muted">Everyone's busy. Stop a job or hire crew to run more at once.</span>
            ) : (
              <label>
                <span className="label">Send</span>
                <select ref={selectRef} value={selectedCrew?.id} onChange={(e) => setCrewId(e.target.value)}>
                  {idle.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isPlayer ? 'Yourself' : c.name}
                      {c.jailedUntil > now ? ' (starts after jail)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <ol className="ledger">
          {crimesForSkill(skill).map((crime) => {
            const lvl = skillLevel(s, skill);
            const locked = !unlocked || lvl < crime.level;
            const st = crimeStats(s, crime, selectedCrew, now);
            const count = s.mastery[crime.id] ?? 0;
            const m = masteryLevel(count);
            const nextM = MASTERY_THRESHOLDS[m + 1];
            const max = selectedCrew ? maxReps(s, crime, selectedCrew, now) : 1;
            const take = crime.carClasses ? 'a car' : `${fmtMoney(crime.cashMin * st.cashMult)}–${fmtMoney(crime.cashMax * st.cashMult)}`;
            const can = !!selectedCrew && !canStart(s, crime.id);
            const start = (n: number) => act((d, t) => startJob(d, selectedCrew!.id, crime.id, n, t));
            return (
              <li key={crime.id} className={`entry ${locked ? 'locked' : ''}`}>
                <div className="entry-main">
                  <div className="entry-title">
                    <span className="entry-name">{crime.name}</span>
                    <span className="muted mono small">
                      Lv {crime.level} · {fmtDuration(st.duration)}
                    </span>
                  </div>
                  {locked ? (
                    <div className="muted small caps">Locked · level {crime.level}</div>
                  ) : (
                    <dl className="entry-stats">
                      <div title="Success chance"><dt>Odds</dt><dd>{pct(st.chance)}</dd></div>
                      <div title="Chance a failure becomes a bust"><dt>Risk</dt><dd>{pct(st.bust)}</dd></div>
                      <div title="Big Score chance: triple cash, double XP"><dt>Big</dt><dd>{pct(st.crit)}</dd></div>
                      <div title="Payout per success"><dt>Take</dt><dd className="money">{take}</dd></div>
                      <div title="XP per success"><dt>XP</dt><dd>{st.xp.toLocaleString()}</dd></div>
                      <div title="Jail time if busted"><dt>Jail</dt><dd>{fmtDuration(st.jail)}</dd></div>
                      <div title={`Mastery ${m}/8 — repeat this job to get faster, safer and luckier`}>
                        <dt>Mastery</dt>
                        <dd>
                          <Stars n={m} /> <span className="muted">{nextM ? `${count}/${nextM}` : count}</span>
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
                {!locked && (
                  <div className="entry-actions">
                    <button className="btn small" disabled={!can} onClick={() => start(1)}>
                      Once
                    </button>
                    <button className="btn small" disabled={!can || max < 10} onClick={() => start(10)}>
                      ×10
                    </button>
                    <button className="btn small primary" disabled={!can} onClick={() => start(max)} title="Queue as many as fit in one shift">
                      Full shift{selectedCrew ? ` ×${max}` : ''}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function SkillHeader({ s, skill }: { s: GameState; skill: SkillId }) {
  const def = SKILL_BY_ID[skill];
  const lp = levelProgress(s.skills[skill].xp);
  const perks = s.skills[skill].perks;
  return (
    <div className="skill-header">
      <div className="kicker">File {def.code}</div>
      <h2 className="headline">
        {def.name} <span className="num">Lv {lp.level}</span>
      </h2>
      <p className="muted deck">{def.blurb}</p>
      <Bar pct={lp.pct} label={lp.needed ? `${Math.floor(lp.into).toLocaleString()} / ${lp.needed.toLocaleString()} XP` : 'Max level'} />
      {perks.length > 0 && (
        <p className="small">
          <span className="label">Perks</span> {perks.map((p) => PERKS[p].name).join(' · ')}
        </p>
      )}
    </div>
  );
}
