// Talking to an NPC (for now: Eddy at the General Store). RuneScape-style: a greeting with
// numbered options, then the Buy panel (his stock, empty for now) or Sell (your bag: tap an
// item to hear his price, tap it again to sell one).
import { useMemo, useState } from 'react';
import type { GameState } from '../game/types';
import type { Npc } from './map';
import { LOOT_BY_ID } from '../game/data/world';
import { fmtMoney, lootPrice, sellCar, sellLoot } from '../game/engine';
import { Bag, bagSlots, slotKey } from '../components/Bag';

type Act = (fn: (d: GameState, now: number) => void) => void;

const GREETINGS = [
  "Welcome to Eddy's General Store! Need something, or got something to sell?",
  "Ah, a customer. Buying or selling? I don't ask where things come from.",
  "Back again? What'll it be, friend?",
];

export function NpcDialog({ npc, s, act, onClose }: { npc: Npc; s: GameState; act: Act; onClose: () => void }) {
  const [mode, setMode] = useState<'greet' | 'buy' | 'sell'>('greet');
  const [sel, setSel] = useState<string | null>(null);
  const greeting = useMemo(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)], []);
  const [line, setLine] = useState('Tap something you want to sell.');

  const offer = (key: string) => {
    const slot = bagSlots(s).find((sl) => slotKey(sl) === key);
    if (!slot) return;
    if (slot.kind === 'cash') {
      setSel(null);
      return setLine("That's your gold, pal. I don't buy gold.");
    }
    if (sel === key) {
      // Second tap on the same item: sell one.
      if (slot.kind === 'loot') {
        const def = LOOT_BY_ID[slot.id];
        act((d) => sellLoot(d, slot.id));
        setLine(`Sold ${def.name} for ${fmtMoney(lootPrice(slot.id))}.${slot.count > 1 ? ' Tap again to sell another.' : ''}`);
        if (slot.count <= 1) setSel(null);
      } else {
        const car = s.cars.find((c) => c.id === slot.id)!;
        act((d) => sellCar(d, slot.id));
        setLine(`Sold the ${car.model} keys for ${fmtMoney(car.value)}.`);
        setSel(null);
      }
      return;
    }
    setSel(key);
    if (slot.kind === 'loot') {
      const def = LOOT_BY_ID[slot.id];
      setLine(`I'll give you ${fmtMoney(def.value)} for the ${def.name}. Tap it again to sell.`);
    } else {
      const car = s.cars.find((c) => c.id === slot.id)!;
      setLine(`Keys to a ${car.model}? ${fmtMoney(car.value)}, no questions asked. Tap again to sell.`);
    }
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
            <li>
              <button onClick={onClose}>Goodbye</button>
            </li>
          </ol>
        </>
      )}

      {mode === 'buy' && (
        <>
          <p className="npc-line">Shelves are bare, I'm afraid. A delivery's on its way. Check back soon.</p>
          <div className="bag compact store-shelf" aria-label="Eddy's stock">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="slot empty" />
            ))}
          </div>
          <div className="npc-footer">
            <button className="btn small" onClick={() => setMode('greet')}>
              Back
            </button>
            <span className="muted small">Your gold: {fmtMoney(s.cash)}</span>
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
            <span className="muted small">Your gold: {fmtMoney(s.cash)}</span>
          </div>
        </>
      )}
    </div>
  );
}
