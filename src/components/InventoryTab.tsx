// RuneScape-style bag: 28 slots. Cash always sits in the first one, then loot stacks and car keys.
import { useState } from 'react';
import type { GameState } from '../game/types';
import { CAR_CLASSES, CAR_SMUGGLE_BONUS, LOOT_BY_ID } from '../game/data/world';
import { SKILL_BY_ID } from '../game/data/skills';
import { INVENTORY_SLOTS, bestCarClass, dropCar, dropLoot, fmtMoney, slotsUsed } from '../game/engine';

type Act = (fn: (d: GameState, now: number) => void) => void;
type Slot = { kind: 'cash' } | { kind: 'loot'; id: string; count: number } | { kind: 'car'; id: string };

export function InventoryTab({ s, act }: { s: GameState; act: Act }) {
  const [sel, setSel] = useState<string>('cash');
  const slots: Slot[] = [
    { kind: 'cash' },
    ...Object.entries(s.inventory)
      .sort((a, b) => LOOT_BY_ID[b[0]].value - LOOT_BY_ID[a[0]].value)
      .map(([id, count]) => ({ kind: 'loot' as const, id, count })),
    ...s.cars.map((c) => ({ kind: 'car' as const, id: c.id })),
  ];
  const keyOf = (sl: Slot) => (sl.kind === 'cash' ? 'cash' : sl.id);
  const selected = slots.find((sl) => keyOf(sl) === sel) ?? slots[0];
  const best = bestCarClass(s);

  return (
    <div className="inventory">
      <div className="section-head">
        <h2 className="headline">Inventory</h2>
        <span className="muted mono small">
          {slotsUsed(s)}/{INVENTORY_SLOTS} slots
        </span>
      </div>
      <div className="bag" role="grid" aria-label="Inventory">
        {Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
          const sl = slots[i];
          if (!sl) return <div key={i} className="slot empty" />;
          const k = keyOf(sl);
          let name = '';
          let sub = '';
          let cls = '';
          if (sl.kind === 'cash') {
            name = 'Cash';
            sub = fmtMoney(s.cash);
            cls = 'slot-cash';
          } else if (sl.kind === 'loot') {
            const def = LOOT_BY_ID[sl.id];
            name = def.name;
            sub = sl.count > 1 ? `×${sl.count}` : '';
            cls = `rarity-${def.rarity}`;
          } else {
            const car = s.cars.find((c) => c.id === sl.id)!;
            name = `${car.model} keys`;
            sub = CAR_CLASSES[car.cls];
            cls = `car-cls-${car.cls}`;
          }
          return (
            <button key={k} className={`slot ${cls} ${sel === k ? 'selected' : ''}`} onClick={() => setSel(k)}>
              <span className="slot-name">{name}</span>
              {sub && <span className="slot-sub">{sub}</span>}
            </button>
          );
        })}
      </div>

      <div className="slot-detail">
        {selected.kind === 'cash' && (
          <>
            <div className="kicker">Cash</div>
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
                <p className="muted small">
                  Worth about {fmtMoney(def.value)} each to the right buyer. A general store is coming to the Street, where you'll be able to sell.
                </p>
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
                  Worth about {fmtMoney(car.value)}.
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
