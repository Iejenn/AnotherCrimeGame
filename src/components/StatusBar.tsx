// Slim header: who you are and how hot you are. Cash lives in the Inventory now.
import type { GameState } from '../game/types';
import { heatAt, rankFor, totalLevel } from '../game/engine';

export function StatusBar({ s, now }: { s: GameState; now: number }) {
  const heat = heatAt(s, now);
  const lit = Math.round(heat / 10);
  return (
    <header className="topbar">
      <span className="topbar-name">{s.name}</span>
      <span className="stamp small">{rankFor(totalLevel(s)).name}</span>
      <span className="topbar-heat" aria-label={`Heat ${Math.round(heat)} of 100`} title="Heat: high heat means lower odds and more busts. It cools down over time.">
        <span className="label">Heat</span>
        <span className="heat-meter">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={i < lit ? (i >= 6 ? 'seg hot' : 'seg on') : 'seg'} />
          ))}
        </span>
      </span>
    </header>
  );
}
