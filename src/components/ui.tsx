// Small shared UI bits.
import type { ReactNode } from 'react';

export function Bar({ pct, kind = 'xp', label }: { pct: number; kind?: 'xp' | 'job' | 'heat' | 'jail'; label?: ReactNode }) {
  return (
    <div className={`bar bar-${kind}`}>
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
      {label !== undefined && <span className="bar-label">{label}</span>}
    </div>
  );
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
