// RuneScape-style bag: 30 slots (5 × 6). Cash always sits in the first one, then one item per slot.
import { useState } from 'react';
import type { GameState } from '../game/types';
import { ITEM_BY_ID, buyerOf } from '../game/data/items';
import { INVENTORY_SLOTS, cantEat, fmtMoney, itemPrice, slotsUsed } from '../game/engine';
import { gameNow } from '../game/clock';
import type { GameApi } from '../game/api';
import { Bag, bagSlots, slotKey } from './Bag';
import { ItemIcon } from './ItemIcon';
import { armourBonus, maxHit, myCombatLevel, weaponStats } from '../game/combat';
import { skillLevel } from '../game/engine';

export function InventoryTab({ s, api }: { s: GameState; api: GameApi }) {
  // Nothing selected at first. The cash slot shows your cash itself, so tapping it opens nothing (no extra panel).
  const [sel, setSel] = useState<string | null>(null);
  const slots = bagSlots(s);
  const found = slots.find((sl) => slotKey(sl) === sel);
  const selected = found?.kind === 'loot' ? found : null;
  const now = gameNow();

  return (
    <div className="inventory">
      <div className="section-head">
        <h2 className="headline">Inventory</h2>
        <span className="muted mono small">
          {slotsUsed(s)}/{INVENTORY_SLOTS} slots
        </span>
      </div>
      <Bag s={s} selected={selected ? sel : null} onSelect={(k) => setSel(k === sel ? null : k)} />

      {selected && (
        <div className="slot-detail">
          {(() => {
            const def = ITEM_BY_ID[selected.id];
            const why = cantEat(s, selected.id, now);
            return (
              <>
                <div className="kicker">{def.heal ? `Food · +${def.heal} HP` : def.gear ? (def.gear.slot === 'weapon' ? 'Weapon' : 'Armour') : 'Item'}</div>
                <strong className="detail-name">{def.name}</strong>
                {def.gear && def.gear.slot !== 'weapon' && (
                  <p className="muted small">
                    +{def.gear.defence ?? 0} defence{def.gear.needs && def.gear.needs.level > 1 ? `, needs Defense ${def.gear.needs.level}` : ''}. Never wears out.
                  </p>
                )}
                {def.gear && def.gear.slot === 'weapon' && (
                  <p className="muted small">
                    +{(def.gear.damage ?? 1) - 1} damage over your fists, a swing every {((def.gear.speed ?? 3) * 0.5).toFixed(1)}s
                    {def.gear.needs && def.gear.needs.level > 1 ? `, needs Melee ${def.gear.needs.level}` : ''}. Never wears out.
                  </p>
                )}
                {itemPrice(selected.id) > 0 && (
                  <p className="muted small">
                    {buyerOf(selected.id) === 'ray' ? "Ray at Ray's Arms" : 'Eddy at the General Store'} pays {fmtMoney(itemPrice(selected.id))} for it.
                  </p>
                )}
                <div className="save-row">
                  {def.gear && (
                    <button className="btn small primary" onClick={() => api.equip(selected.id)}>
                      {def.gear.slot === 'weapon' ? 'Wield' : 'Wear'}
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
                      if (confirm(`Drop the ${def.name}? It's gone for good.`)) api.drop(selected.id);
                    }}
                  >
                    Drop
                  </button>
                </div>
                {why && def.heal > 0 && <p className="muted small">{why}</p>}
              </>
            );
          })()}
        </div>
      )}
      {slotsUsed(s) >= INVENTORY_SLOTS && <p className="warn small">Your inventory is full.</p>}
      <Equipment s={s} api={api} />
    </div>
  );
}

/** What you're wielding and wearing (docs/design.md §12, §14), and what it does for you in a fight. */
function Equipment({ s, api }: { s: GameState; api: GameApi }) {
  const w = weaponStats(s);
  const hit = maxHit(w.damage, skillLevel(s, 'melee'));
  const rows: { slot: 'weapon' | 'head' | 'body' | 'legs'; label: string; empty: string; info: (id: string) => string }[] = [
    { slot: 'weapon', label: 'Weapon', empty: 'Bare fists', info: () => `Max hit ${hit} · a swing every ${(w.speed * 0.5).toFixed(1)}s` },
    { slot: 'head', label: 'Head', empty: 'Nothing', info: (id) => `+${ITEM_BY_ID[id]?.gear?.defence ?? 0} defence` },
    { slot: 'body', label: 'Body', empty: 'Nothing', info: (id) => `+${ITEM_BY_ID[id]?.gear?.defence ?? 0} defence` },
    { slot: 'legs', label: 'Legs', empty: 'Nothing', info: (id) => `+${ITEM_BY_ID[id]?.gear?.defence ?? 0} defence` },
  ];
  return (
    <section className="equipment">
      <div className="section-head">
        <h3 className="rule-head">Equipment</h3>
        <span className="muted mono small">
          Combat level {myCombatLevel(s)} · defence +{armourBonus(s)}
        </span>
      </div>
      {rows.map((r) => {
        const id = s.equipment?.[r.slot];
        return (
          <div className="equip-row" key={r.slot}>
            <div className={`slot ${id ? '' : 'empty'}`} title={id ? ITEM_BY_ID[id]?.name : `${r.label} (empty)`}>
              {id ? <ItemIcon id={id} /> : <span className="muted small">{r.label}</span>}
            </div>
            <div className="equip-info small">
              <strong>{id ? ITEM_BY_ID[id]?.name : r.empty}</strong>
              {(id || r.slot === 'weapon') && <div className="muted">{r.info(id ?? '')}</div>}
              {id && (
                <button className="btn tiny" onClick={() => api.unequip(r.slot)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
