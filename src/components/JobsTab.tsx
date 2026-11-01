import { useState } from 'react';
import type { GameState, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { crimesForSkill } from '../game/data/crimes';
import { canStart, crimeStats, fmtDuration, fmtMoney, isUnlocked, masteryLevel, maxReps, MASTERY_THRESHOLDS, skillLevel, startJob } from '../game/engine';
import { tipsAt } from '../game/intel';
import { PERKS } from '../game/data/world';
import { levelProgress } from '../game/xp';
import { Bar, Stars, pct } from './ui';

type Act = (fn: (d: GameState, now: number) => void) => void;

function unlockText(id: SkillId) {
  const u = SKILL_BY_ID[id].unlock;
  const parts = Object.entries(u.skill ?? {}).map(([k, v]) => `${SKILL_BY_ID[k as SkillId].short} ${v}`);
  if (u.total) parts.push(`Total Lv ${u.total}`);
  return parts.join(' + ');
}

export function JobsTab({ s, now, act }: { s: GameState; now: number; act: Act }) {
  const [skill, setSkill] = useState<SkillId>('petty');
  const idle = s.crew.filter((c) => !c.job);
  const [crewId, setCrewId] = useState<string>('');
  const selectedCrew = idle.find((c) => c.id === crewId) ?? idle[0];
  const tips = tipsAt(now);
  const unlocked = isUnlocked(s, skill);

  return (
    <div className="jobs">
      <nav className="skill-list">
        {SKILLS.map((sk) => {
          const open = isUnlocked(s, sk.id);
          const lp = levelProgress(s.skills[sk.id].xp);
          const hot = tips.some((t) => t.skill === sk.id);
          return (
            <button key={sk.id} className={`skill-btn ${skill === sk.id ? 'active' : ''} ${open ? '' : 'locked'}`} onClick={() => setSkill(sk.id)}>
              <span className="skill-icon">{open ? sk.icon : '🔒'}</span>
              <span className="skill-name">
                {sk.short}
                {hot && open && <span className="hot-dot" title="Active Intel tip">●</span>}
              </span>
              <span className="skill-lvl">{lp.level}</span>
              <Bar pct={lp.pct} />
            </button>
          );
        })}
      </nav>

      <div className="crime-pane">
        <SkillHeader s={s} skill={skill} />
        {!unlocked && <div className="notice">🔒 Unlock at: {unlockText(skill)}</div>}
        {unlocked && (
          <div className="assign-bar">
            {idle.length === 0 ? (
              <span className="dim">Everyone is busy. Stop a job or hire more crew to run jobs in parallel.</span>
            ) : (
              <>
                <span>Send:</span>
                <select value={selectedCrew?.id} onChange={(e) => setCrewId(e.target.value)}>
                  {idle.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isPlayer ? 'You' : c.name}
                      {c.jailedUntil > now ? ' (in jail — will start after)' : ''}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}
        <div className="crime-list">
          {crimesForSkill(skill).map((crime) => {
            const lvl = skillLevel(s, skill);
            const locked = !unlocked || lvl < crime.level;
            const st = crimeStats(s, crime, selectedCrew, now);
            const count = s.mastery[crime.id] ?? 0;
            const m = masteryLevel(count);
            const nextM = MASTERY_THRESHOLDS[m + 1];
            const max = selectedCrew ? maxReps(s, crime, selectedCrew, now) : 1;
            const cashTxt = crime.carClasses ? '🚗 car' : `${fmtMoney(crime.cashMin * st.cashMult)}–${fmtMoney(crime.cashMax * st.cashMult)}`;
            const can = !!selectedCrew && !canStart(s, crime.id);
            const start = (n: number) => act((d, t) => startJob(d, selectedCrew!.id, crime.id, n, t));
            return (
              <div key={crime.id} className={`crime ${locked ? 'locked' : ''}`}>
                <div className="crime-top">
                  <div>
                    <div className="crime-name">{crime.name}</div>
                    <div className="crime-req">
                      Lv {crime.level} · {fmtDuration(st.duration)}
                      {!locked && (
                        <>
                          {' '}· <Stars n={m} /> <span className="dim small">{nextM ? `${count}/${nextM}` : count}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {locked ? (
                    <div className="lock">🔒 Lv {crime.level}</div>
                  ) : (
                    <div className="crime-actions">
                      <button className="btn small primary" disabled={!can} onClick={() => start(1)}>
                        Go
                      </button>
                      <button className="btn small" disabled={!can || max < 10} onClick={() => start(10)}>
                        ×10
                      </button>
                      <button className="btn small gold" disabled={!can} onClick={() => start(max)} title="Queue as many as fit in one shift">
                        Shift{selectedCrew ? ` ×${max}` : ''}
                      </button>
                    </div>
                  )}
                </div>
                {!locked && (
                  <div className="crime-stats">
                    <span title="Success chance">🎯 {pct(st.chance)}</span>
                    <span title="Chance a failure becomes a bust">🚨 {pct(st.bust)}</span>
                    <span title="Big Score chance (×3 cash, ×2 XP)">💥 {pct(st.crit)}</span>
                    <span title="Cash per success">💵 {cashTxt}</span>
                    <span title="XP per success">✚ {st.xp.toLocaleString()} XP</span>
                    <span className="dim" title="Jail time on bust">⛓ {fmtDuration(st.jail)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
      <div className="skill-title">
        <span className="skill-icon big">{def.icon}</span>
        <div>
          <h2>
            {def.name} <span className="lvl">Lv {lp.level}</span>
          </h2>
          <p className="dim">{def.blurb}</p>
        </div>
      </div>
      <Bar pct={lp.pct} label={lp.needed ? `${Math.floor(lp.into).toLocaleString()} / ${lp.needed.toLocaleString()} XP` : 'MAX'} />
      {perks.length > 0 && <div className="perk-chips">{perks.map((p, i) => <span key={i} className="chip" title={PERKS[p].desc}>{PERKS[p].name}</span>)}</div>}
    </div>
  );
}
