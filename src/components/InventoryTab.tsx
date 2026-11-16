// RuneScape-style bag: 28 slots. Cash always sits in the first one, then items (food stacks).
import { useState } from 'react';
import type { GameState } from '../game/types';
import { ITEM_BY_ID } from '../game/data/items';
import { INVENTORY_SLOTS, cantEat, fmtMoney, slotsUsed } from '../game/engine';
import { gameNow } from '../game/clock';
import type { GameApi } from '../game/api';
import { Bag, bagSlots, slotKey } from './Bag';

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
                <div className="kicker">{def.heal ? `Food · +${def.heal} HP` : 'Item'}</div>
                <strong className="detail-name">
                  {def.name} {selected.count > 1 && <span className="muted mono">×{selected.count}</span>}
                </strong>
                <p className="muted small">Eddy at the General Store pays {fmtMoney(def.value)} each.</p>
                <div className="save-row">
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
    </div>
  );
}
