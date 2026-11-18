// The bag (the bottom panel's backpack): 30 small slots, 10 across. Tap an item: its buttons show in a strip above the grid.
// Your worn gear is in its own popup (EquipmentPopup).
import { useState } from 'react';
import type { GameState } from '../game/types';
import { ITEM_BY_ID, buyerOf } from '../game/data/items';
import { INVENTORY_SLOTS, cantEat, fmtMoney, itemPrice, slotsUsed } from '../game/engine';
import { gameNow } from '../game/clock';
import type { GameApi } from '../game/api';
import { Bag, bagSlots, slotKey } from './Bag';
import { SKILL_BY_ID } from '../game/data/skills';
import { ItemIcon } from './ItemIcon';
import { armourBonus, marksmanSlot, maxHit, myCombatLevel, weaponStats } from '../game/combat';
import { skillLevel } from '../game/engine';
import { COMBOS, findCombo } from '../game/data/combos';
import { useCurrentBagHandler } from './bagHandler';

export function BagPanel({ s, api }: { s: GameState; api: GameApi }) {
  // Nothing selected at first. The cash slot shows your cash itself, so tapping it opens nothing (no extra panel).
  const [sel, setSel] = useState<string | null>(null);
  // "Use": the item you're using; the next item you tap is the one you use it on.
  const [using, setUsing] = useState<string | null>(null);
  const [useMsg, setUseMsg] = useState<string | null>(null);
  // Dropping asks first, in the game itself (not the browser's pop-up): the Drop button turns into "Drop it? Yes / No".
  const [dropAsk, setDropAsk] = useState(false);
  const pick = (k: string) => {
    if (using) {
      const on = bagSlots(s).find((sl) => slotKey(sl) === k);
      const onId = on?.kind === 'loot' ? on.id : null;
      setUsing(null);
      setSel(null);
      if (!onId || onId === using) return;
      if (findCombo(using, onId)) {
        setUseMsg(null);
        api.useItem(using, onId);
      } else setUseMsg('Nothing interesting happens.');
      return;
    }
    setUseMsg(null);
    setDropAsk(false);
    setSel(k === sel ? null : k);
  };
  const slots = bagSlots(s);
  const found = slots.find((sl) => slotKey(sl) === sel);
  const selected = found?.kind === 'loot' ? found : null;
  const now = gameNow();

  const used = slotsUsed(s);
  // A shop's Sell screen or the bank is open: tapping goes there.
  const handler = useCurrentBagHandler();

  return (
    <div className="inventory bag-panel">
      <div className="panel-head">
        <span className="panel-title">Bag</span>
        <span className="muted mono small">
          {used}/{INVENTORY_SLOTS}
          {used >= INVENTORY_SLOTS ? ' · full' : ''}
        </span>
        <span className="money mono small">{fmtMoney(s.cash)}</span>
      </div>
      {/* What you tapped, and what you can do with it (one line, above the grid). */}
      {handler ? (
        <div className="item-strip use-hint small">{handler.line}</div>
      ) : using ? (
        <div className="item-strip">
          <span className="use-hint small">Use the {ITEM_BY_ID[using]?.name} on… (tap an item)</span>
          <button className="btn tiny" onClick={() => setUsing(null)}>
            Cancel
          </button>
        </div>
      ) : selected ? (
        (() => {
          const def = ITEM_BY_ID[selected.id];
          const why = cantEat(s, selected.id, now);
          const info = def.heal
            ? `+${def.heal} HP`
            : def.gear
              ? def.gear.slot === 'weapon'
                ? `max hit +${(def.gear.damage ?? 1) - 1}, ${((def.gear.speed ?? 3) * 0.5).toFixed(1)}s${def.gear.range ? `, ${def.gear.range} tiles` : ''}${def.gear.needs && def.gear.needs.level > 1 ? `, ${SKILL_BY_ID[def.gear.needs.skill].name} ${def.gear.needs.level}` : ''}`
                : `+${def.gear.defence ?? 0} defence${def.gear.needs && def.gear.needs.level > 1 ? `, Defense ${def.gear.needs.level}` : ''}`
              : def.quest
                ? 'quest item (kept when you die)'
                : itemPrice(selected.id) > 0
                  ? `${buyerOf(selected.id) === 'ray' ? 'Ray' : 'Eddy'} pays ${fmtMoney(itemPrice(selected.id))}`
                  : '';
          return (
            <div className="item-strip">
              <span className="item-strip-name">
                <strong>{def.name}</strong> {info && <span className="muted small">{info}</span>}
              </span>
              <span className="item-strip-btns">
                {def.gear && (
                  <button className="btn tiny primary" onClick={() => api.equip(selected.id)}>
                    {def.gear.slot === 'weapon' ? 'Wield' : 'Wear'}
                  </button>
                )}
                {def.heal > 0 && (
                  <button className="btn tiny primary" disabled={!!why} title={why ?? ''} onClick={() => api.eat(selected.id)}>
                    Eat
                  </button>
                )}
                {COMBOS.some((c) => c.a === selected.id || c.b === selected.id) && (
                  <button className="btn tiny primary" onClick={() => setUsing(selected.id)}>
                    Use
                  </button>
                )}
                {!def.quest &&
                  (dropAsk ? (
                    <>
                      <span className="warn small">Gone for good?</span>
                      <button
                        className="btn tiny danger"
                        onClick={() => {
                          setDropAsk(false);
                          api.drop(selected.id);
                        }}
                      >
                        Drop
                      </button>
                      <button className="btn tiny" onClick={() => setDropAsk(false)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button className="btn tiny" onClick={() => setDropAsk(true)}>
                      Drop
                    </button>
                  ))}
              </span>
            </div>
          );
        })()
      ) : (
        <div className="item-strip muted small">{useMsg ?? 'Tap an item to use it.'}</div>
      )}
      <Bag s={s} selected={handler ? handler.selected : selected ? sel : null} onSelect={handler ? handler.pick : pick} mini />
    </div>
  );
}

/** What you're wielding and wearing (docs/design.md §12, §14), and what it does for you in a fight. */
export function Equipment({ s, api }: { s: GameState; api: GameApi }) {
  const w = weaponStats(s);
  const hit = maxHit(w.damage, skillLevel(s, 'melee'));
  const knives = marksmanSlot(s);
  const kGear = knives ? ITEM_BY_ID[knives.id]?.gear : undefined;
  const throwing = s.fightStyle === 'marksman' && !!knives;
  const rows: { slot: 'weapon' | 'marksman' | 'head' | 'body' | 'legs'; label: string; empty: string; info: (id: string) => string }[] = [
    { slot: 'weapon', label: 'Weapon', empty: 'Bare fists', info: () => `Max hit ${hit} · a swing every ${(w.speed * 0.5).toFixed(1)}s${throwing ? '' : ' · fighting with this'}` },
    // v0.51: the throwing knives' own slot (the whole stack); the toggle on the Street picks which one you fight with.
    {
      slot: 'marksman', label: 'Marksman', empty: 'No throwing knives',
      info: () => `×${knives?.left ?? 0} · max hit ${maxHit(kGear?.damage ?? 1, skillLevel(s, 'marksman'))} · ${kGear?.range ?? 0} tiles${throwing ? ' · fighting with this' : ''}`,
    },
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
