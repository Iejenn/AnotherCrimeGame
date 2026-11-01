import type { GameState, Report, SkillId } from '../game/types';
import { SKILL_BY_ID } from '../game/data/skills';
import { LOOT_BY_ID, PERKS } from '../game/data/world';
import { choosePerk, fmtDuration, fmtMoney } from '../game/engine';

type Act = (fn: (d: GameState, now: number) => void) => void;

export function PerkModal({ s, act, onClose }: { s: GameState; act: Act; onClose: () => void }) {
  const p = s.pendingPerks[0];
  if (!p) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">★ {SKILL_BY_ID[p.skill].name} level {p.milestone}</div>
        <h2>Choose a perk</h2>
        <p className="dim">Perks are permanent and stack with later picks.</p>
        <div className="perk-options">
          {p.options.map((id) => (
            <button key={id} className="perk-option" onClick={() => act((d) => choosePerk(d, 0, id))}>
              <strong>{PERKS[id].name}</strong>
              <span>
                {PERKS[id].desc} on {SKILL_BY_ID[p.skill].short} jobs
              </span>
            </button>
          ))}
        </div>
        {s.pendingPerks.length > 1 && <p className="dim small">{s.pendingPerks.length - 1} more perk choices waiting.</p>}
      </div>
    </div>
  );
}

export function AwayModal({ report, ms, onClose }: { report: Report; ms: number; onClose: () => void }) {
  const xp = Object.entries(report.xp) as [SkillId, number][];
  const levels = new Map<SkillId, number>();
  for (const l of report.levelUps) levels.set(l.skill, l.level);
  const rare = report.loot.filter((id) => ['rare', 'legendary'].includes(LOOT_BY_ID[id].rarity));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal away" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">While you were away · {fmtDuration(ms / 1000)}</div>
        <h2>Your crew kept working.</h2>
        <div className="away-big">{fmtMoney(report.cash)}</div>
        <div className="away-grid">
          <div><span className="dim">Jobs</span><strong>{report.jobs}</strong></div>
          <div><span className="dim">Big scores</span><strong>{report.bigScores}</strong></div>
          <div><span className="dim">Loot</span><strong>{report.loot.length}</strong></div>
          <div><span className="dim">Cars</span><strong>{report.cars}</strong></div>
          <div><span className="dim">Busts</span><strong className={report.busts ? 'hot' : ''}>{report.busts}</strong></div>
        </div>
        <ul className="away-xp">
          {xp.map(([sk, amount]) => (
            <li key={sk}>
              {SKILL_BY_ID[sk].icon} {SKILL_BY_ID[sk].name}: +{Math.round(amount).toLocaleString()} XP
              {levels.has(sk) && <strong className="lvlup"> → Lv {levels.get(sk)}!</strong>}
            </li>
          ))}
        </ul>
        {rare.length > 0 && <p className="rarity-rare">Rare finds: {rare.map((id) => LOOT_BY_ID[id].name).join(', ')}</p>}
        {report.events.slice(0, 4).map((e, i) => (
          <p key={i} className="small">✦ {e}</p>
        ))}
        <button className="btn primary big" onClick={onClose}>
          Back to work
        </button>
      </div>
    </div>
  );
}
