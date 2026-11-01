import { useState } from 'react';
import type { GameState } from '../game/types';
import { SKILLS } from '../game/data/skills';
import { ORIGIN_BY_ID, PERKS } from '../game/data/world';
import { fmtMoney, isUnlocked, totalLevel } from '../game/engine';
import { exportSave } from '../game/save';
import { levelProgress } from '../game/xp';
import { Bar } from './ui';

export function ProfileTab({ s, onImport, onReset }: { s: GameState; onImport: () => void; onReset: () => void }) {
  const [code, setCode] = useState('');
  const days = Math.max(1, Math.ceil((Date.now() - s.createdAt) / 86400000));
  return (
    <div className="profile">
      <h2 className="headline">{s.name}</h2>
      <p className="muted">
        {ORIGIN_BY_ID[s.origin].name} — {ORIGIN_BY_ID[s.origin].desc}
      </p>
      <div className="skills-grid">
        {SKILLS.map((sk) => {
          const lp = levelProgress(s.skills[sk.id].xp);
          return (
            <div key={sk.id} className={`card mini ${isUnlocked(s, sk.id) ? '' : 'locked'}`}>
              <strong>
                <span className="code">{sk.code}</span> {sk.name} <span className="num">{lp.level}</span>
              </strong>
              <Bar pct={lp.pct} label={`${Math.floor(s.skills[sk.id].xp).toLocaleString()} XP`} />
              <span className="muted small">{s.skills[sk.id].perks.map((p) => PERKS[p].name).join(', ') || 'No perks yet'}</span>
            </div>
          );
        })}
      </div>
      <h2>Record</h2>
      <div className="stats-grid">
        <div><span className="muted">Total level</span><strong>{totalLevel(s)}</strong></div>
        <div><span className="muted">Jobs pulled</span><strong>{s.stats.jobs.toLocaleString()}</strong></div>
        <div><span className="muted">Big scores</span><strong>{s.stats.bigScores.toLocaleString()}</strong></div>
        <div><span className="muted">Clean escapes</span><strong>{s.stats.fails.toLocaleString()}</strong></div>
        <div><span className="muted">Times busted</span><strong>{s.stats.busts.toLocaleString()}</strong></div>
        <div><span className="muted">Lifetime earnings</span><strong>{fmtMoney(s.stats.earned)}</strong></div>
        <div><span className="muted">Days in the life</span><strong>{days}</strong></div>
      </div>
      <h2>Save</h2>
      <p className="muted small">Saves automatically in this browser. Copy the code to move to another device.</p>
      <div className="save-row">
        <button className="btn small" onClick={() => setCode(exportSave(s))}>Export save code</button>
        <button className="btn small" onClick={onImport}>Import save</button>
        <button className="btn small danger" onClick={onReset}>Start over</button>
      </div>
      {code && <textarea className="save-code" readOnly value={code} onFocus={(e) => e.target.select()} />}
    </div>
  );
}
