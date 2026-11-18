// The 30-slot inventory grid (5 × 6): cash first, then every item in a slot of its own; stacking items (throwing knives,
// v0.51) all in one slot, with how many.
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
    .flatMap(([id, count]) => (ITEM_BY_ID[id].stack ? [{ kind: 'loot' as const, id, n: 0, count }] : Array.from({ length: count }, (_, n) => ({ kind: 'loot' as const, id, n, count: 1 }))));
  // No cash, no cash slot (after banking it all, say): the items move up. (A slot stays kept for cash: 29 items max.)
  return s.cash > 0 ? [{ kind: 'cash' }, ...items] : items;
}

export const slotKey = (sl: Slot) => (sl.kind === 'cash' ? 'cash' : `${sl.id}#${sl.n}`);

/** "29", "1.2K", "3.4M": short enough for a small slot. */
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.floor(n / 1e3)}K` : String(n));

export function Bag({ s, selected, onSelect, compact = false, mini = false }: { s: GameState; selected: string | null; onSelect: (key: string) => void; compact?: boolean; mini?: boolean }) {
  const slots = bagSlots(s);
  // The small bag (the bottom panel): bank-sized slots, 10 across, just the picture (and cash's amount).
  if (mini)
    return (
      <div className="bank-grid bag-mini" role="grid" aria-label="Inventory">
        {Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
          const sl = slots[i];
          if (!sl) return <div key={i} className="bank-slot empty" />;
          const k = slotKey(sl);
          const id = sl.kind === 'cash' ? 'cash' : sl.id;
          const name = sl.kind === 'cash' ? 'Cash' : ITEM_BY_ID[sl.id]?.name ?? sl.id;
          return (
            <button key={k} className={`bank-slot ${sl.kind === 'cash' ? 'cash' : ''} ${selected === k ? 'selected' : ''}`} onClick={() => onSelect(k)} title={name} aria-label={name}>
              <ItemIcon id={id} />
              {sl.kind === 'cash' && <span className="bank-count">${short(s.cash)}</span>}
              {sl.kind === 'loot' && sl.count > 1 && <span className="bank-count">{short(sl.count)}</span>}
            </button>
          );
        })}
      </div>
    );
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
