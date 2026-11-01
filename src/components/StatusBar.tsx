import type { GameState } from '../game/types';
import { bribeCost, bribeCops, collectFronts, fmtMoney, heatAt, rankFor, totalFrontPending, totalLevel } from '../game/engine';
import { Bar } from './ui';

type Act = (fn: (d: GameState, now: number) => void) => void;

export function StatusBar({ s, now, act }: { s: GameState; now: number; act: Act }) {
  const total = totalLevel(s);
  const rank = rankFor(total);
  const heat = heatAt(s, now);
  const pending = totalFrontPending(s, now);
  const rankPct = rank.next ? (total - rank.current[0]) / (rank.next[0] - rank.current[0]) : 1;
  return (
    <header className="status">
      <div className="status-id">
        <div className="who">{s.name}</div>
        <div className="rank">
          {rank.name} <span className="dim">· Total Lv {total}</span>
        </div>
        <Bar pct={rankPct} kind="xp" label={rank.next ? `next: ${rank.next[1]} @ ${rank.next[0]}` : 'MAX RANK'} />
      </div>
      <div className="status-cash">
        <div className="cash">{fmtMoney(s.cash)}</div>
        {pending > 0 && (
          <button className="btn small gold" onClick={() => act((d, t) => collectFronts(d, t))}>
            Collect {fmtMoney(pending)}
          </button>
        )}
      </div>
      <div className="status-heat">
        <div className="heat-row">
          <span>Heat</span>
          <span className={heat > 60 ? 'hot' : heat > 30 ? 'warm' : 'cool'}>{Math.round(heat)}/100</span>
        </div>
        <Bar pct={heat / 100} kind="heat" />
        {heat > 15 && (
          <button className="btn small" disabled={s.cash < bribeCost(s)} onClick={() => act((d, t) => bribeCops(d, t))} title="-40 heat">
            Pay off cops ({fmtMoney(bribeCost(s))})
          </button>
        )}
      </div>
    </header>
  );
}
