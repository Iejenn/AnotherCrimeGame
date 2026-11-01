import type { GameState } from '../game/types';
import { SKILL_BY_ID } from '../game/data/skills';
import { PERKS } from '../game/data/world';
import { choosePerk } from '../game/engine';

type Act = (fn: (d: GameState, now: number) => void) => void;

export function PerkModal({ s, act, onClose }: { s: GameState; act: Act; onClose: () => void }) {
  const p = s.pendingPerks[0];
  if (!p) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Choose a perk" onClick={(e) => e.stopPropagation()}>
        <div className="kicker">{SKILL_BY_ID[p.skill].name} · level {p.milestone}</div>
        <h2 className="modal-title">Pick one. It's permanent.</h2>
        <div className="perk-options">
          {p.options.map((id) => (
            <button key={id} className="perk-option" onClick={() => act((d) => choosePerk(d, 0, id))}>
              <strong>{PERKS[id].name}</strong>
              <span>
                {PERKS[id].desc} on {SKILL_BY_ID[p.skill].name} jobs
              </span>
            </button>
          ))}
        </div>
        {s.pendingPerks.length > 1 && <p className="muted small">{s.pendingPerks.length - 1} more waiting after this.</p>}
        <button className="btn link" onClick={onClose}>
          Decide later
        </button>
      </div>
    </div>
  );
}
