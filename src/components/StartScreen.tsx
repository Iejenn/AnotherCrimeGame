// Start-up screen: your character file and what's new. (Nothing happens while you're away, so no "since you left".)
import { gameNow } from '../game/clock';
import { useMemo } from 'react';
import type { GameState } from '../game/types';
import { SKILLS } from '../game/data/skills';
import { fmtDuration, fmtMoney, hpAt, maxHp, rankFor, totalLevel } from '../game/engine';
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

export function StartScreen({ s, onClose }: { s: GameState; onClose: () => void }) {
  const now = gameNow();
  // Read once on open, so the NEW stamps stay visible until the screen closes.
  const seen = useMemo(() => getSeenVersion(), []);
  const total = totalLevel(s);
  const rank = rankFor(total);
  const fileNo = String(hashString(s.name + s.createdAt) % 90000 + 10000);
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
            <div className="muted">On the books {fmtDuration((now - s.createdAt) / 1000)}</div>
          </div>
          <div className="stamp">{rank.name}</div>
        </div>

        <dl className="figures">
          <div><dt>Total level</dt><dd>{total}</dd></div>
          <div><dt>Cash</dt><dd className="money">{fmtMoney(s.cash)}</dd></div>
          <div><dt>Health</dt><dd>{Math.floor(hpAt(s, now))}/{maxHp(s)}</dd></div>
          <div><dt>Jobs pulled</dt><dd>{s.stats.jobs.toLocaleString('en-US')}</dd></div>
        </dl>

        <section>
          <h3 className="rule-head">Skills</h3>
          <ul className="skill-ledger">
            {SKILLS.map((sk) => {
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
