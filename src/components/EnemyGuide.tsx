// The enemies you can fight, shown under Melee and Gunfire in the Skills tab (like the crimes under Street Crimes).
// Tap one for its card: its stats and what it drops.
// Everything comes from ENEMY_KINDS (src/game/enemies.ts), so a new enemy shows up here on its own.
import { useState } from 'react';
import { ENEMY_KINDS, type Drop, type EnemyKind } from '../game/enemies';
import { ITEM_BY_ID } from '../game/data/items';
import { fmtMoney } from '../game/engine';
import { ItemIcon } from './ItemIcon';

/** "Always", "1 in 5", "1 in 20". */
const odds = (chance: number) => (chance >= 1 ? 'Always' : `1 in ${Math.round(1 / chance)}`);
const dropName = (d: Drop) =>
  d.item === 'cash' ? (d.min === d.max ? fmtMoney(d.min) : `${fmtMoney(d.min)}–${fmtMoney(d.max)}`) : `${ITEM_BY_ID[d.item]?.name ?? d.item}${d.max > 1 ? ` ×${d.min}–${d.max}` : ''}`;

export function EnemyGuide({ skill }: { skill: 'melee' | 'gunfire' }) {
  const [open, setOpen] = useState<string | null>(null);
  const kinds = Object.values(ENEMY_KINDS).sort((a, b) => a.level - b.level);
  return (
    <section className="enemy-guide">
      <h3 className="rule-head">Enemies</h3>
      {skill === 'gunfire' && <p className="muted small">No guns yet: for now you fight these with your fists or a melee weapon.</p>}
      <ol className="ledger">
        {kinds.map((k) => (
          <li key={k.id} className="entry">
            <button className={`enemy-row ${open === k.id ? 'active' : ''}`} onClick={() => setOpen(open === k.id ? null : k.id)} aria-expanded={open === k.id}>
              <span className="mono small lvl-col">{k.level}</span>
              <span className="entry-name">{k.name}</span>
              <span className="muted small">
                {k.hp} HP · {k.where}
              </span>
            </button>
            {open === k.id && <EnemyCard k={k} />}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EnemyCard({ k }: { k: EnemyKind }) {
  return (
    <div className="enemy-card">
      <dl className="entry-stats">
        <div><dt>Level</dt><dd>{k.level}</dd></div>
        <div><dt>Health</dt><dd>{k.hp} HP</dd></div>
        <div><dt>Attack</dt><dd>{k.attack}</dd></div>
        <div><dt>Defence</dt><dd>{k.defense}{k.defenceBonus ? ` (+${k.defenceBonus})` : ''}</dd></div>
        <div><dt>Max hit</dt><dd>{k.maxHit}</dd></div>
        <div><dt>Speed</dt><dd>{k.speed * 0.5}s</dd></div>
        <div><dt>Respawn</dt><dd>{k.respawn}s</dd></div>
        <div><dt>Aggressive</dt><dd>{k.aggressive ? 'Yes' : 'No'}</dd></div>
        <div><dt>Where</dt><dd>{k.where}</dd></div>
      </dl>
      <h4 className="kicker">Drops</h4>
      {k.loot.length ? (
        <ul className="drops">
          {k.loot.map((d) => (
            <li key={d.item}>
              <span className="drop-icon">
                <ItemIcon id={d.item} className="item-icon inline" />
              </span>
              <span>{dropName(d)}</span>
              <span className="muted mono small">{odds(d.chance)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nothing.</p>
      )}
    </div>
  );
}
