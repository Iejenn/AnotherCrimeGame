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

export function Stars({ n, max = 8 }: { n: number; max?: number }) {
  return (
    <span className="stars" title={`Mastery ${n}/${max}`}>
      {'★'.repeat(n)}
      <span className="dim">{'☆'.repeat(max - n)}</span>
    </span>
  );
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
