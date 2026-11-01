import { useState } from 'react';
import type { GameState, LogKind } from '../game/types';

const FILTERS: { id: string; label: string; kinds: LogKind[] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'big', label: 'Highlights', kinds: ['big', 'level', 'event', 'loot', 'bust'] },
  { id: 'busts', label: 'Busts', kinds: ['bust'] },
];

function ago(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function LogTab({ s }: { s: GameState }) {
  const [f, setF] = useState('all');
  const kinds = FILTERS.find((x) => x.id === f)!.kinds;
  const rows = kinds ? s.log.filter((l) => kinds.includes(l.kind)) : s.log;
  return (
    <div className="log">
      <div className="log-filters">
        {FILTERS.map((x) => (
          <button key={x.id} className={`btn tiny ${f === x.id ? 'primary' : ''}`} onClick={() => setF(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <ul>
        {rows.map((l, i) => (
          <li key={i} className={`log-${l.kind}`}>
            <span className="log-t">{ago(l.t)}</span> {l.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
