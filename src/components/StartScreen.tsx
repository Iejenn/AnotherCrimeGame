// Start-up screen: who you are, when you were last here, and what's new. Kept short so "What's new" is in view.
// (Your skills and levels are in the Skills tab.)
import { gameNow } from '../game/clock';
import { useMemo } from 'react';
import type { GameState } from '../game/types';
import { rankFor, totalLevel } from '../game/engine';
import { hashString } from '../game/rng';
import { CHANGELOG, getSeenVersion, markVersionSeen } from '../changelog';

/** "3 days ago", "5 hours ago", "12 minutes ago", "just now". */
export function timeAgo(ms: number) {
  const min = Math.floor(ms / 60000);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (min < 1) return 'just now';
  if (min < 60) return plural(min, 'minute');
  const h = Math.floor(min / 60);
  if (h < 24) return plural(h, 'hour');
  return plural(Math.floor(h / 24), 'day');
}

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
  const rank = rankFor(totalLevel(s));
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
            <div className="muted">{s.lastOnline ? `Last online ${timeAgo(now - s.lastOnline)}` : 'First time on the streets'}</div>
          </div>
          <div className="stamp">{rank.name}</div>
        </div>

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

        <button className="btn primary block" onClick={close}>
          Back to work
        </button>
      </div>
    </div>
  );
}
