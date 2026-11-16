// The 28-slot inventory grid (cash first, then items; food stacks). Used by the Inventory tab and by Eddy's "Sell" screen.
import type { GameState } from '../game/types';
import { ITEM_BY_ID } from '../game/data/items';
import { INVENTORY_SLOTS, fmtMoney } from '../game/engine';

export type Slot = { kind: 'cash' } | { kind: 'loot'; id: string; count: number };

export function bagSlots(s: GameState): Slot[] {
  return [
    { kind: 'cash' },
    ...Object.entries(s.inventory)
      .filter(([id]) => ITEM_BY_ID[id])
      .sort((a, b) => ITEM_BY_ID[b[0]].value - ITEM_BY_ID[a[0]].value)
      .map(([id, count]) => ({ kind: 'loot' as const, id, count })),
  ];
}

export const slotKey = (sl: Slot) => (sl.kind === 'cash' ? 'cash' : sl.id);

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
          <button key={k} className={`slot ${cls} ${selected === k ? 'selected' : ''}`} onClick={() => onSelect(k)}>
            <span className="slot-name">{name}</span>
            {sub && <span className="slot-sub">{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
