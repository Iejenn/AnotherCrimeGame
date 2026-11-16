// RuneScape-style bag: 28 slots. Cash always sits in the first one, then items (food stacks).
import { useState } from 'react';
import type { GameState } from '../game/types';
import { ITEM_BY_ID } from '../game/data/items';
import { INVENTORY_SLOTS, cantEat, fmtMoney, slotsUsed } from '../game/engine';
import { gameNow } from '../game/clock';
import type { GameApi } from '../game/api';
import { Bag, bagSlots, slotKey } from './Bag';
import { ItemIcon } from './ItemIcon';
import { maxHit, myCombatLevel, weaponStats } from '../game/combat';
import { skillLevel } from '../game/engine';

export function InventoryTab({ s, api }: { s: GameState; api: GameApi }) {
  const [sel, setSel] = useState<string>('cash');
  const slots = bagSlots(s);
  const selected = slots.find((sl) => slotKey(sl) === sel) ?? slots[0];
  const now = gameNow();

  return (
    <div className="inventory">
      <div className="section-head">
        <h2 className="headline">Inventory</h2>
        <span className="muted mono small">
          {slotsUsed(s)}/{INVENTORY_SLOTS} slots
        </span>
      </div>
      <Bag s={s} selected={sel} onSelect={setSel} />

      <div className="slot-detail">
        {selected.kind === 'cash' ? (
          <>
            <div className="kicker">Cash</div>
            <div className="money detail-cash">{fmtMoney(s.cash)}</div>
            <p className="muted small">Lifetime earnings: {fmtMoney(s.stats.earned)}</p>
          </>
        ) : (
          (() => {
            const def = ITEM_BY_ID[selected.id];
            const why = cantEat(s, selected.id, now);
            return (
              <>
                <div className="kicker">{def.heal ? `Food · +${def.heal} HP` : def.gear ? 'Weapon' : 'Item'}</div>
                <strong className="detail-name">
                  {def.name} {selected.count > 1 && <span className="muted mono">×{selected.count}</span>}
                </strong>
                {def.value > 0 ? (
                  <p className="muted small">Eddy at the General Store pays {fmtMoney(def.value)} each.</p>
                ) : def.gear ? (
                  <p className="muted small">+{(def.gear.damage ?? 1) - 1} damage over your fists. Same speed. Never wears out.</p>
                ) : null}
                <div className="save-row">
                  {def.gear && (
                    <button className="btn small primary" onClick={() => api.equip(selected.id)}>
                      Wield
                    </button>
                  )}
                  {def.heal > 0 && (
                    <button className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => api.eat(selected.id)}>
                      Eat (+{def.heal} HP)
                    </button>
                  )}
                  <button
                    className="btn small"
                    onClick={() => {
                      if (confirm(`Drop all ${selected.count} ${def.name}? They're gone for good.`)) api.drop(selected.id);
                    }}
                  >
                    Drop
                  </button>
                </div>
                {why && def.heal > 0 && <p className="muted small">{why}</p>}
              </>
            );
          })()
        )}
      </div>
      {slotsUsed(s) >= INVENTORY_SLOTS && <p className="warn small">Your inventory is full.</p>}
      <Equipment s={s} api={api} />
    </div>
  );
}

/** What you're wielding (docs/design.md §12), and what it does for you in a fight. Only a weapon slot for now. */
function Equipment({ s, api }: { s: GameState; api: GameApi }) {
  const weapon = s.equipment?.weapon;
  const w = weaponStats(s);
  const hit = maxHit(w.damage, skillLevel(s, 'melee'));
  return (
    <section className="equipment">
      <div className="section-head">
        <h3 className="rule-head">Equipment</h3>
        <span className="muted mono small">Combat level {myCombatLevel(s)}</span>
      </div>
      <div className="equip-row">
        <div className={`slot ${weapon ? '' : 'empty'}`} title={weapon ? ITEM_BY_ID[weapon]?.name : 'Weapon slot (empty)'}>
          {weapon ? <ItemIcon id={weapon} /> : <span className="muted small">Weapon</span>}
        </div>
        <div className="equip-info small">
          <strong>{weapon ? ITEM_BY_ID[weapon]?.name : 'Bare fists'}</strong>
          <div className="muted">
            Max hit {hit} · a swing every {(w.speed * 0.5).toFixed(1)}s · accuracy +{w.accuracy}
          </div>
          {weapon && (
            <button className="btn tiny" onClick={() => api.unequip('weapon')}>
              Remove
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
