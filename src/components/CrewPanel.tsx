import type { GameState } from '../game/types';
import { CRIME_BY_ID } from '../game/data/crimes';
import { TRAITS } from '../game/data/world';
import { bail, bailCost, fmtDuration, fmtMoney, stopJob } from '../game/engine';
import { Bar } from './ui';

type Act = (fn: (d: GameState, now: number) => void) => void;

/** The idle "operations board": what each crew member is doing right now. */
export function CrewPanel({ s, now, act, onAssign }: { s: GameState; now: number; act: Act; onAssign: () => void }) {
  return (
    <section className="crew" aria-label="Crew">
      {s.crew.map((c) => {
        const jailed = c.jailedUntil > now;
        const job = c.job;
        const crime = job ? CRIME_BY_ID[job.crimeId] : null;
        const remaining = job ? (job.endsAt - now) / 1000 : 0;
        const p = job ? (now - job.startedAt) / (job.endsAt - job.startedAt) : 0;
        const queueLeft = job ? remaining + (job.repsLeft - 1) * ((job.endsAt - job.startedAt) / 1000) : 0;
        const state = jailed ? 'jailed' : job ? 'busy' : 'idle';
        return (
          <div key={c.id} className={`ticket ${state}`}>
            <div className="ticket-head">
              <strong>{c.isPlayer ? 'You' : c.name}</strong>
              {!c.isPlayer && <span className="muted small" title={TRAITS[c.trait].desc}>{TRAITS[c.trait].name}</span>}
              <span className={`status-tag ${state}`}>{jailed ? 'In jail' : job ? 'Working' : 'Idle'}</span>
            </div>
            {jailed ? (
              <>
                <div className="ticket-line alert">Out in {fmtDuration((c.jailedUntil - now) / 1000)}</div>
                <button className="btn small" disabled={s.cash < bailCost(s, c, now)} onClick={() => act((d, t) => bail(d, c.id, t))}>
                  Post bail · {fmtMoney(bailCost(s, c, now))}
                </button>
                {job && crime && <div className="muted small">Then back to {crime.name} ×{job.repsLeft}</div>}
              </>
            ) : job && crime ? (
              <>
                <div className="ticket-line">{crime.name}</div>
                <Bar pct={p} kind="job" />
                <div className="ticket-meta mono">
                  <span>{fmtDuration(remaining)}</span>
                  <span>
                    {job.repsDone + 1}/{job.repsDone + job.repsLeft}
                  </span>
                  <span className="muted">shift {fmtDuration(queueLeft)}</span>
                  <button className="btn tiny" onClick={() => act((d) => stopJob(d, c.id))}>
                    Stop
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ticket-line muted">Nothing on. Every idle minute is money left on the table.</div>
                <button className="btn small primary" onClick={onAssign}>
                  Give them a job
                </button>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
