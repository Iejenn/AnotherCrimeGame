// The 28-slot inventory grid: cash first (the only thing that stacks), then every item in a slot of its own.
// Used by the Inventory tab and by the shops' "Sell" screens.
import type { GameState } from '../game/types';
import { ITEM_BY_ID } from '../game/data/items';
import { INVENTORY_SLOTS, fmtMoney } from '../game/engine';
import { ItemIcon } from './ItemIcon';

/** A slot: cash, or one item (n = which one of its kind, so each slot has its own key). */
export type Slot = { kind: 'cash' } | { kind: 'loot'; id: string; n: number; count: number };

export function bagSlots(s: GameState): Slot[] {
  const items = Object.entries(s.inventory)
    .filter(([id]) => ITEM_BY_ID[id])
    .sort((a, b) => ITEM_BY_ID[b[0]].value - ITEM_BY_ID[a[0]].value)
    .flatMap(([id, count]) => Array.from({ length: count }, (_, n) => ({ kind: 'loot' as const, id, n, count: 1 })));
  return [{ kind: 'cash' }, ...items];
}

export const slotKey = (sl: Slot) => (sl.kind === 'cash' ? 'cash' : `${sl.id}#${sl.n}`);

export function Bag({ s, selected, onSelect, compact = false }: { s: GameState; selected: string | null; onSelect: (key: string) => void; compact?: boolean }) {
  const slots = bagSlots(s);
  return (
    <div className={`bag ${compact ? 'compact' : ''}`} role="grid" aria-label="Inventory">
      {Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
        const sl = slots[i];
        if (!sl) return <div key={i} className="slot empty" />;
        const k = slotKey(sl);
        let name = '';
        let sub = '';
        let cls = '';
        if (sl.kind === 'cash') {
          name = 'Cash';
          sub = fmtMoney(s.cash);
          cls = 'slot-cash';
        } else {
          const def = ITEM_BY_ID[sl.id];
          name = def.name;
          sub = sl.count > 1 ? `×${sl.count}` : '';
          cls = def.heal ? 'slot-food' : '';
        }
        return (
          <button key={k} className={`slot ${cls} ${selected === k ? 'selected' : ''}`} onClick={() => onSelect(k)} title={name} aria-label={`${name}${sub ? ` ${sub}` : ''}`}>
            <ItemIcon id={sl.kind === 'cash' ? 'cash' : sl.id} />
            <span className="slot-name">{name}</span>
            {sub && <span className="slot-sub">{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
