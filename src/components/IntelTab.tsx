import type { GameState } from '../game/types';
import { SKILL_BY_ID } from '../game/data/skills';
import { claimContract, contractRewards, fmtDuration, fmtMoney } from '../game/engine';
import { DAY_MS, tipsAt } from '../game/intel';
import { Bar } from './ui';

type Act = (fn: (d: GameState, now: number) => void) => void;

function effectText(e: Record<string, number | undefined>) {
  const names: Record<string, string> = { cash: 'cash', xp: 'XP', success: 'success', bust: 'bust risk', heat: 'heat' };
  return Object.entries(e)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v! > 0 ? '+' : ''}${Math.round(v! * 100)}% ${names[k]}`)
    .join(', ');
}

export function IntelTab({ s, now, act }: { s: GameState; now: number; act: Act }) {
  const tips = tipsAt(now);
  const nextDay = (s.contracts.day + 1) * DAY_MS;
  return (
    <div className="intel">
      <h2>Street Intel</h2>
      <p className="dim">The city changes every few hours. Line up your crew to ride the opportunities.</p>
      <div className="cards">
        {tips.map((t) => (
          <div key={t.id} className="card tip">
            <div className="tip-head">
              <strong>{t.title}</strong>
              <span className="chip">{SKILL_BY_ID[t.skill].icon} {SKILL_BY_ID[t.skill].short}</span>
            </div>
            <p>{t.text}</p>
            <div className="tip-effects">{effectText(t.effects as Record<string, number>)}</div>
            <div className="dim small">ends in {fmtDuration((t.endsAt - now) / 1000)}</div>
          </div>
        ))}
      </div>

      <h2>Daily Contracts</h2>
      <p className="dim">New contracts in {fmtDuration((nextDay - now) / 1000)}.</p>
      <div className="cards">
        {s.contracts.list.map((c) => {
          const done = c.progress >= c.target;
          const reward = contractRewards(s, c);
          return (
            <div key={c.id} className={`card contract ${c.claimed ? 'claimed' : ''}`}>
              <strong>{c.label}</strong>
              <Bar
                pct={c.progress / c.target}
                kind="job"
                label={c.kind === 'cash' ? `${fmtMoney(c.progress)} / ${fmtMoney(c.target)}` : `${c.progress} / ${c.target}`}
              />
              <div className="small">
                Reward: {fmtMoney(reward.cash)} + {reward.xp.toLocaleString()} {SKILL_BY_ID[c.rewardSkill].short} XP
              </div>
              {c.claimed ? (
                <span className="dim">✓ Claimed</span>
              ) : (
                <button className="btn small gold" disabled={!done} onClick={() => act((d, t) => claimContract(d, c.id, t))}>
                  Claim
                </button>
              )}
            </div>
          );
        })}
      </div>

      <h2>Active Boosts</h2>
      {s.buffs.length === 0 ? (
        <p className="dim">None right now. Random encounters on jobs can grant boosts.</p>
      ) : (
        <ul className="buffs">
          {s.buffs.map((b) => (
            <li key={b.id}>
              <strong>{b.label}</strong> — +{Math.round(b.value * 100)}% {b.kind}
              {b.skill ? ` (${SKILL_BY_ID[b.skill].short})` : ''} · {b.uses} jobs left
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
