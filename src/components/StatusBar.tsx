import type { GameState } from '../game/types';
import { bribeCost, bribeCops, collectFronts, fmtMoney, heatAt, rankFor, totalFrontPending, totalLevel } from '../game/engine';

type Act = (fn: (d: GameState, now: number) => void) => void;

/** Heat as 10 segments instead of a gradient bar — reads at a glance. */
function HeatMeter({ heat }: { heat: number }) {
  const lit = Math.round(heat / 10);
  return (
    <div className="heat-meter" aria-label={`Heat ${Math.round(heat)} of 100`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < lit ? (i >= 6 ? 'seg hot' : 'seg on') : 'seg'} />
      ))}
    </div>
  );
}

export function StatusBar({ s, now, act }: { s: GameState; now: number; act: Act }) {
  const total = totalLevel(s);
  const rank = rankFor(total);
  const heat = heatAt(s, now);
  const pending = totalFrontPending(s, now);
  return (
    <header className="masthead">
      <div className="mast-id">
        <div className="mast-name">{s.name}</div>
        <div className="mast-rank">
          <span className="stamp small">{rank.name}</span>
          <span className="muted mono">
            Lv {total}
            {rank.next && ` / ${rank.next[0]} for ${rank.next[1]}`}
          </span>
        </div>
      </div>
      <div className="mast-cash">
        <div className="label">Cash</div>
        <div className="money cash-num">{fmtMoney(s.cash)}</div>
        {pending > 0 && (
          <button className="btn small" onClick={() => act((d, t) => collectFronts(d, t))}>
            Collect {fmtMoney(pending)} from fronts
          </button>
        )}
      </div>
      <div className="mast-heat">
        <div className="label">
          Heat <span className="mono">{Math.round(heat)}</span>
        </div>
        <HeatMeter heat={heat} />
        {heat > 15 && (
          <button className="btn small" disabled={s.cash < bribeCost(s)} onClick={() => act((d, t) => bribeCops(d, t))} title="-40 heat">
            Pay off a detective · {fmtMoney(bribeCost(s))}
          </button>
        )}
      </div>
    </header>
  );
}
