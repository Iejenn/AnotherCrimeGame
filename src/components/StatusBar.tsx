// Slim header: who you are, your health and how hot you are. Gold lives in the Inventory.
import type { GameState } from '../game/types';
import { heatAt, hpAt, maxHp, rankFor, totalLevel } from '../game/engine';

export function StatusBar({ s, now }: { s: GameState; now: number }) {
  const heat = heatAt(s, now);
  const lit = Math.round(heat / 10);
  const hp = Math.floor(hpAt(s, now));
  const max = maxHp(s);
  return (
    <header className="topbar">
      <span className="topbar-name">{s.name}</span>
      <span className="stamp small">{rankFor(totalLevel(s)).name}</span>
      <span className={`topbar-hp ${hp <= 3 ? 'low' : ''}`} title="Health. Failed jobs cost a little; it comes back on its own (1 per minute).">
        <span className="label">HP</span> <span className="mono">{hp}/{max}</span>
      </span>
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
