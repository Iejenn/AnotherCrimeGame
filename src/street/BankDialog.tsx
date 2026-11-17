// The bank (docs/design.md §15): opened by talking to a banker. At the top your bank: 50 small slots, where things
// stack (a bag full of tin salvage is one slot with "29" on it), in the order you first put them in; your banked cash
// is a slot too. Below it your bag. Tap something in your bag to put it in, a bank slot to take it out; the toggle
// says how many (×1, ×5, ×10 or all). Cash always moves all at once. "Deposit all" empties your bag (cash too) into the
// bank. The server does every move (it checks you're in the bank, the counts and the 50 slots).
import { useCallback, useMemo, useRef, useState } from 'react';
import { useBagHandler } from '../components/bagHandler';
import type { GameState } from '../game/types';
import type { GameApi } from '../game/api';
import { ITEM_BY_ID } from '../game/data/items';
import { fmtMoney } from '../game/engine';
import { BANK_SLOTS } from './map';
import { bagSlots, slotKey } from '../components/Bag';
import { ItemIcon } from '../components/ItemIcon';

const AMOUNTS = [1, 5, 10, Infinity] as const;
/** "29", "1.2K", "3.4M": short enough for a small slot. */
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.floor(n / 1e3)}K` : String(n));

export function BankDialog({ s, api, pos, onClose }: { s: GameState; api: GameApi; pos: [number, number]; onClose: () => void }) {
  const [amount, setAmount] = useState<(typeof AMOUNTS)[number]>(1);
  const n = (have: number) => (amount === Infinity ? have : amount);
  const bank = s.bank ?? [];
  const cash = s.bankCash ?? 0;
  const slots: { id: string; n: number }[] = [...(cash > 0 ? [{ id: 'cash', n: cash }] : []), ...bank.map((b) => ({ id: b.i, n: b.n }))];
  const used = slots.length;

  const deposit = (key: string) => {
    const sl = bagSlots(s).find((x) => slotKey(x) === key);
    if (!sl) return;
    if (sl.kind === 'cash') {
      if (s.cash > 0) api.bankDeposit('cash', s.cash, pos);
      return;
    }
    api.bankDeposit(sl.id, n(s.inventory[sl.id] ?? 0), pos);
  };
  const withdraw = (id: string, have: number) => api.bankWithdraw(id, id === 'cash' ? have : n(have), pos);

  // Putting things in: you tap them in your bag at the bottom of the screen (no second bag in here).
  const depositRef = useRef(deposit);
  depositRef.current = deposit;
  const pick = useCallback((k: string) => depositRef.current(k), []);
  useBagHandler(useMemo(() => ({ line: 'Tap something to put it in the bank.', selected: null, pick }), [pick]));

  return (
    <div className="bank-dialog" role="dialog" aria-label="Your bank" onPointerDown={(e) => e.stopPropagation()}>
      <div className="npc-head">
        <span className="npc-name">Bank</span>
        <span className="muted small mono">
          {used}/{BANK_SLOTS}
        </span>
        <button className="btn tiny npc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="bank-grid" role="grid" aria-label="Your bank">
        {Array.from({ length: BANK_SLOTS }, (_, i) => {
          const sl = slots[i];
          if (!sl) return <div key={`e${i}`} className="bank-slot empty" />;
          const name = sl.id === 'cash' ? 'Cash' : ITEM_BY_ID[sl.id]?.name ?? sl.id;
          return (
            <button key={sl.id} className={`bank-slot ${sl.id === 'cash' ? 'cash' : ''}`} onClick={() => withdraw(sl.id, sl.n)} title={`${name}: ${sl.id === 'cash' ? fmtMoney(sl.n) : sl.n}`} aria-label={`Take out ${name}`}>
              <ItemIcon id={sl.id} />
              <span className="bank-count">{sl.id === 'cash' ? `$${short(sl.n)}` : short(sl.n)}</span>
            </button>
          );
        })}
      </div>
      <div className="bank-bar">
        <div className="bank-amounts" role="group" aria-label="How many">
          {AMOUNTS.map((a) => (
            <button key={String(a)} className={`btn tiny ${amount === a ? 'primary' : ''}`} onClick={() => setAmount(a)}>
              {a === Infinity ? 'All' : `×${a}`}
            </button>
          ))}
        </div>
        <button className="btn tiny" onClick={() => api.bankDepositAll(pos)}>
          Deposit all
        </button>
      </div>
      <p className="muted small bank-hint">Tap your bag (below) to put things in, the bank to take them out.</p>
    </div>
  );
}
