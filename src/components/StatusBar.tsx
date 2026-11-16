// Slim header: who you are and your health. Cash lives in the Inventory.
import type { GameState } from '../game/types';
import { hpAt, maxHp, rankFor, totalLevel } from '../game/engine';

export function StatusBar({ s, now }: { s: GameState; now: number }) {
  const hp = Math.floor(hpAt(s, now));
  const max = maxHp(s);
  return (
    <header className="topbar">
      <span className="topbar-name">{s.name}</span>
      <span className="stamp small">{rankFor(totalLevel(s)).name}</span>
      <span className={`topbar-hp ${hp <= 3 ? 'low' : ''}`} title="Health. Failed crimes cost a little; food heals; it also comes back on its own (1 per minute).">
        <span className="label">HP</span> <span className="mono">{hp}/{max}</span>
      </span>
    </header>
  );
}
