import type { GameState } from '../game/types';
import { CRIME_BY_ID } from '../game/data/crimes';
import { SKILL_BY_ID } from '../game/data/skills';
import { TRAITS } from '../game/data/world';
import { bail, bailCost, fmtDuration, fmtMoney, stopJob } from '../game/engine';
import { Bar } from './ui';

type Act = (fn: (d: GameState, now: number) => void) => void;

/** The idle "operations board": what each crew member is doing right now. */
export function CrewPanel({ s, now, act, onAssign }: { s: GameState; now: number; act: Act; onAssign: () => void }) {
  return (
    <section className="crew">
      {s.crew.map((c) => {
        const jailed = c.jailedUntil > now;
        const job = c.job;
        const crime = job ? CRIME_BY_ID[job.crimeId] : null;
        const remaining = job ? (job.endsAt - now) / 1000 : 0;
        const p = job ? (now - job.startedAt) / (job.endsAt - job.startedAt) : 0;
        const queueLeft = job && crime ? remaining + (job.repsLeft - 1) * ((job.endsAt - job.startedAt) / 1000) : 0;
        return (
          <div key={c.id} className={`crew-card ${jailed ? 'jailed' : job ? 'busy' : 'idle'}`}>
            <div className="crew-head">
              <strong>{c.isPlayer ? `${c.name} (you)` : c.name}</strong>
              {!c.isPlayer && <span className="trait" title={TRAITS[c.trait].desc}>{TRAITS[c.trait].name}</span>}
            </div>
            {jailed ? (
              <>
                <div className="crew-status bust">🔒 In jail · {fmtDuration((c.jailedUntil - now) / 1000)}</div>
                <Bar pct={0} kind="jail" />
                <button className="btn small" disabled={s.cash < bailCost(s, c, now)} onClick={() => act((d, t) => bail(d, c.id, t))}>
                  Bail out ({fmtMoney(bailCost(s, c, now))})
                </button>
                {job && crime && <div className="dim small">Queued: {crime.name} ×{job.repsLeft}</div>}
              </>
            ) : job && crime ? (
              <>
                <div className="crew-status">
                  {SKILL_BY_ID[crime.skill].icon} {crime.name}
                </div>
                <Bar pct={p} kind="job" label={fmtDuration(remaining)} />
                <div className="crew-meta">
                  <span>
                    #{job.repsDone + 1} of {job.repsDone + job.repsLeft}
                  </span>
                  <span className="dim">shift ends in {fmtDuration(queueLeft)}</span>
                  <button className="btn tiny" onClick={() => act((d) => stopJob(d, c.id))}>
                    Stop
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="crew-status idle-text">💤 Idle — wasting time</div>
                <button className="btn small primary" onClick={onAssign}>
                  Assign a job
                </button>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
