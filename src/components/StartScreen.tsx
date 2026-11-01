// Start-up screen: character file + "since you left" + what's new.
import { useMemo } from 'react';
import type { GameState, Report, SkillId } from '../game/types';
import { SKILLS, SKILL_BY_ID } from '../game/data/skills';
import { LOOT_BY_ID, ORIGIN_BY_ID } from '../game/data/world';
import { CRIME_BY_ID } from '../game/data/crimes';
import { fmtDuration, fmtMoney, heatAt, isUnlocked, rankFor, totalLevel } from '../game/engine';
import { levelProgress } from '../game/xp';
import { hashString } from '../game/rng';
import { CHANGELOG, getSeenVersion, markVersionSeen } from '../changelog';
import { Bar } from './ui';

function isNewer(a: string, b: string | null) {
  if (!b) return true;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

export function StartScreen({ s, report, ms, onClose }: { s: GameState; report: Report; ms: number; onClose: () => void }) {
  const now = Date.now();
  // Read once on open, so the NEW stamps stay visible until the screen closes.
  const seen = useMemo(() => getSeenVersion(), []);
  const total = totalLevel(s);
  const rank = rankFor(total);
  const fileNo = String(hashString(s.name + s.createdAt) % 90000 + 10000);
  const levels = new Map<SkillId, number>();
  for (const l of report.levelUps) levels.set(l.skill, l.level);
  const rare = report.loot.filter((id) => ['rare', 'legendary'].includes(LOOT_BY_ID[id].rarity));
  const close = () => {
    markVersionSeen();
    onClose();
  };

  return (
    <div className="modal-bg">
      <div className="modal dossier" role="dialog" aria-label="Case file">
        <div className="dossier-head">
          <div>
            <div className="kicker">Case file Nº {fileNo}</div>
            <h1 className="dossier-name">{s.name}</h1>
            <div className="muted">{ORIGIN_BY_ID[s.origin].name} · on the books {fmtDuration((now - s.createdAt) / 1000)}</div>
          </div>
          <div className="stamp">{rank.name}</div>
        </div>

        <dl className="figures">
          <div><dt>Total level</dt><dd>{total}</dd></div>
          <div><dt>Cash</dt><dd className="money">{fmtMoney(s.cash)}</dd></div>
          <div><dt>Heat</dt><dd>{Math.round(heatAt(s, now))}</dd></div>
          <div><dt>Jobs pulled</dt><dd>{s.stats.jobs.toLocaleString('en-US')}</dd></div>
        </dl>

        <section>
          <h3 className="rule-head">Skills</h3>
          <ul className="skill-ledger">
            {SKILLS.filter((sk) => isUnlocked(s, sk.id)).map((sk) => {
              const lp = levelProgress(s.skills[sk.id].xp);
              return (
                <li key={sk.id}>
                  <span className="code">{sk.code}</span>
                  <span>{sk.name}</span>
                  <Bar pct={lp.pct} />
                  <span className="num">{lp.level}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="rule-head">Crew</h3>
          <ul className="plain">
            {s.crew.map((c) => {
              const jailed = c.jailedUntil > now;
              const crime = c.job ? CRIME_BY_ID[c.job.crimeId] : null;
              return (
                <li key={c.id}>
                  <strong>{c.isPlayer ? 'You' : c.name}</strong> —{' '}
                  {jailed ? (
                    <span className="alert">in jail, {fmtDuration((c.jailedUntil - now) / 1000)} left</span>
                  ) : crime && c.job ? (
                    <span>{crime.name}, {c.job.repsLeft} to go</span>
                  ) : (
                    <span className="warn">idle</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="rule-head">Since you left · {fmtDuration(ms / 1000)}</h3>
          {report.jobs === 0 ? (
            <p className="muted">Quiet. Nobody was on a job.</p>
          ) : (
            <>
              <p className="since">
                <span className="money big-num">+{fmtMoney(report.cash)}</span> from {report.jobs} jobs
                {report.bigScores > 0 && <>, {report.bigScores} big scores</>}
                {report.loot.length > 0 && <>, {report.loot.length} loot</>}
                {report.cars > 0 && <>, {report.cars} cars</>}
                {report.busts > 0 && <>, <span className="alert">{report.busts} busts</span></>}.
              </p>
              <ul className="plain">
                {(Object.entries(report.xp) as [SkillId, number][]).map(([sk, xp]) => (
                  <li key={sk}>
                    {SKILL_BY_ID[sk].name} +{Math.round(xp).toLocaleString('en-US')} XP
                    {levels.has(sk) && <strong className="lvl-up"> → level {levels.get(sk)}</strong>}
                  </li>
                ))}
              </ul>
              {rare.length > 0 && <p>Rare finds: {rare.map((id) => LOOT_BY_ID[id].name).join(', ')}</p>}
            </>
          )}
          {s.pendingPerks.length > 0 && <p className="warn">{s.pendingPerks.length} perk choice waiting.</p>}
        </section>

        <section>
          <h3 className="rule-head">What's new</h3>
          {CHANGELOG.slice(0, 3).map((e) => (
            <article key={e.version} className="change">
              <div className="change-head">
                <strong>{e.title}</strong>
                <span className="muted mono">v{e.version}</span>
                {isNewer(e.version, seen) && <span className="tag-new">New</span>}
              </div>
              <ul className="plain">
                {e.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            </article>
          ))}
        </section>

        <button className="btn primary block" onClick={close} autoFocus>
          Back to work
        </button>
      </div>
    </div>
  );
}
