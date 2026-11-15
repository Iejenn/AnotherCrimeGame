// RuneScape-style bag: 28 slots. Gold always sits in the first one, then loot stacks and car keys.
import { useState } from 'react';
import type { GameState } from '../game/types';
import { CAR_CLASSES, CAR_SMUGGLE_BONUS, LOOT_BY_ID } from '../game/data/world';
import { SKILL_BY_ID } from '../game/data/skills';
import { INVENTORY_SLOTS, bestCarClass, dropCar, dropLoot, fmtMoney, slotsUsed } from '../game/engine';
import { Bag, bagSlots, slotKey } from './Bag';

type Act = (fn: (d: GameState, now: number) => void) => void;

export function InventoryTab({ s, act }: { s: GameState; act: Act }) {
  const [sel, setSel] = useState<string>('cash');
  const slots = bagSlots(s);
  const selected = slots.find((sl) => slotKey(sl) === sel) ?? slots[0];
  const best = bestCarClass(s);

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
        {selected.kind === 'cash' && (
          <>
            <div className="kicker">Gold</div>
            <div className="money detail-cash">{fmtMoney(s.cash)}</div>
            <p className="muted small">Lifetime earnings: {fmtMoney(s.stats.earned)}</p>
          </>
        )}
        {selected.kind === 'loot' &&
          (() => {
            const def = LOOT_BY_ID[selected.id];
            return (
              <>
                <div className="kicker">
                  {def.rarity} · {SKILL_BY_ID[def.skill].name}
                </div>
                <strong className={`detail-name rarity-${def.rarity}`}>
                  {def.name} {selected.count > 1 && <span className="muted mono">×{selected.count}</span>}
                </strong>
                <p className="muted small">Eddy at the General Store pays {fmtMoney(def.value)} each.</p>
                <button
                  className="btn small"
                  onClick={() => {
                    if (confirm(`Drop all ${selected.count} ${def.name}? They're gone for good.`)) act((d) => dropLoot(d, selected.id));
                  }}
                >
                  Drop
                </button>
              </>
            );
          })()}
        {selected.kind === 'car' &&
          (() => {
            const car = s.cars.find((c) => c.id === selected.id)!;
            return (
              <>
                <div className="kicker">Car keys · {CAR_CLASSES[car.cls]}</div>
                <strong className={`detail-name car-cls-${car.cls}`}>{car.model}</strong>
                <p className="muted small">
                  Eddy pays {fmtMoney(car.value)} for the keys.
                  {car.cls === best && ` Your best car: Smuggling pays +${Math.round(CAR_SMUGGLE_BONUS[car.cls] * 100)}% while you have it.`}
                </p>
                <button
                  className="btn small"
                  onClick={() => {
                    if (confirm(`Ditch the ${car.model}? It's gone for good.`)) act((d) => dropCar(d, car.id));
                  }}
                >
                  Ditch
                </button>
              </>
            );
          })()}
      </div>
      {slotsUsed(s) >= INVENTORY_SLOTS && <p className="warn small">Your inventory is full. New kinds of loot will be left behind.</p>}
    </div>
  );
}
