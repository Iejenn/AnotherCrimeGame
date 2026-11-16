// Talking to a shopkeeper: Eddy at the General Store, or Ray at Ray's Arms. RuneScape-style: a greeting with
// numbered options, then the Buy panel (their stock: tap to hear the price, tap again to buy) or, at Eddy's,
// Sell (your bag: tap an item to hear his price, tap it again to sell one). The server checks every sale.
import { useMemo, useState } from 'react';
import type { GameState } from '../game/types';
import type { Npc } from './map';
import { ITEM_BY_ID, SHOPS } from '../game/data/items';
import { ItemIcon } from '../components/ItemIcon';
import { fmtMoney, itemPrice } from '../game/engine';
import type { GameApi } from '../game/api';
import { Bag, bagSlots, slotKey } from '../components/Bag';

const GREETINGS: Record<string, string[]> = {
  eddy: [
    "Welcome to Eddy's General Store! Need something, or got something to sell?",
    "Ah, a customer. Buying or selling? I don't ask where things come from.",
    "Back again? What'll it be, friend?",
  ],
  ray: [
    "Ray's Arms. Looking for something to protect yourself with?",
    "Pigeons giving you trouble? I've got just the thing.",
    "Cash up front. No refunds, no questions.",
  ],
};
/** Which shop each shopkeeper runs (SHOPS in data/items.ts), and whether they buy your stuff. */
const SHOP_OF: Record<string, { shop?: string; buysStuff: boolean }> = {
  eddy: { buysStuff: true },
  ray: { shop: 'weapons', buysStuff: false },
};

export function NpcDialog({ npc, s, api, onClose }: { npc: Npc; s: GameState; api: GameApi; onClose: () => void }) {
  const [mode, setMode] = useState<'greet' | 'buy' | 'sell'>('greet');
  const [sel, setSel] = useState<string | null>(null);
  const lines = GREETINGS[npc.id] ?? GREETINGS.eddy;
  const greeting = useMemo(() => lines[Math.floor(Math.random() * lines.length)], [lines]);
  const [line, setLine] = useState('Tap something you want to sell.');
  const shopInfo = SHOP_OF[npc.id] ?? { buysStuff: true };
  const stock = shopInfo.shop ? SHOPS[shopInfo.shop] ?? [] : [];
  const [buySel, setBuySel] = useState<string | null>(null);
  const [buyLine, setBuyLine] = useState('Tap something to hear the price.');

  // Buying: first tap tells you the price, a second tap buys one.
  const pick = (itemId: string, price: number) => {
    const def = ITEM_BY_ID[itemId];
    if (buySel !== itemId) {
      setBuySel(itemId);
      const g = def.gear;
      const stats = g ? ` +${(g.damage ?? 1) - 1} damage over your fists, same speed.` : '';
      return setBuyLine(`${def.name}: ${fmtMoney(price)}.${stats} Tap it again to buy.`);
    }
    if (s.cash < price) return setBuyLine(`That's ${fmtMoney(price)}. Come back when you've got the cash.`);
    api.buy(itemId);
    setBuyLine(`Pleasure doing business. Wield it from your Inventory.`);
  };

  const offer = (key: string) => {
    const slot = bagSlots(s).find((sl) => slotKey(sl) === key);
    if (!slot) return;
    if (slot.kind === 'cash') {
      setSel(null);
      return setLine("That's your cash, pal. I don't buy cash.");
    }
    const def = ITEM_BY_ID[slot.id];
    if (!def.value) {
      setSel(null);
      return setLine(`A ${def.name}? Not my kind of thing. Try Ray's Arms.`);
    }
    if (sel === key) {
      // Second tap on the same item: sell one.
      api.sell(slot.id);
      setLine(`Sold ${def.name} for ${fmtMoney(itemPrice(slot.id))}.${slot.count > 1 ? ' Tap again to sell another.' : ''}`);
      if (slot.count <= 1) setSel(null);
      return;
    }
    setSel(key);
    setLine(`I'll give you ${fmtMoney(def.value)} for the ${def.name}. Tap it again to sell.`);
  };

  return (
    <div className="npc-dialog" role="dialog" aria-label={`Talking to ${npc.name}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="npc-head">
        <span className="npc-name">{npc.name}</span>
        <span className="muted small">{npc.role}</span>
        <button className="btn tiny npc-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {mode === 'greet' && (
        <>
          <p className="npc-line">{greeting}</p>
          <ol className="npc-options">
            <li>
              <button onClick={() => setMode('buy')}>Buy</button>
            </li>
            {shopInfo.buysStuff && (
              <li>
                <button
                  onClick={() => {
                    setMode('sell');
                    setSel(null);
                    setLine('Tap something you want to sell.');
                  }}
                >
                  Sell
                </button>
              </li>
            )}
            <li>
              <button onClick={onClose}>Goodbye</button>
            </li>
          </ol>
        </>
      )}

      {mode === 'buy' && (
        <>
          <p className="npc-line">{stock.length ? buyLine : "Shelves are bare, I'm afraid. A delivery's on its way. Check back soon."}</p>
          <div className="bag compact store-shelf" aria-label={`${npc.name}'s stock`}>
            {Array.from({ length: 8 }, (_, i) => {
              const st = stock[i];
              if (!st) return <div key={i} className="slot empty" />;
              return (
                <button
                  key={i}
                  className={`slot ${buySel === st.item ? 'selected' : ''}`}
                  onClick={() => pick(st.item, st.price)}
                  title={`${ITEM_BY_ID[st.item].name} · ${fmtMoney(st.price)}`}
                >
                  <ItemIcon id={st.item} />
                  <span className="slot-name">{ITEM_BY_ID[st.item].name}</span>
                  <span className="slot-sub">{fmtMoney(st.price)}</span>
                </button>
              );
            })}
          </div>
          <div className="npc-footer">
            <button className="btn small" onClick={() => setMode('greet')}>
              Back
            </button>
            <span className="muted small">Your cash: {fmtMoney(s.cash)}</span>
          </div>
        </>
      )}

      {mode === 'sell' && (
        <>
          <p className="npc-line">{line}</p>
          <Bag s={s} selected={sel} onSelect={offer} compact />
          <div className="npc-footer">
            <button className="btn small" onClick={() => setMode('greet')}>
              Back
            </button>
            <span className="muted small">Your cash: {fmtMoney(s.cash)}</span>
          </div>
        </>
      )}
    </div>
  );
}
