// The quick-eat button (docs/design.md §12): bottom-right of the Street, over the chat, under your right thumb.
// Tap: eat the food that fits best (pickFood: the biggest heal that doesn't go over your max, else the smallest).
// Hold: a row of your foods pops up to pick one. While you're eating a ring sweeps round it (the Street view drives
// it through `ringRef`); in a fight that's 3 ticks without swinging. It pulses red at 30% health or less.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { GameApi } from '../game/api';
import type { GameState } from '../game/types';
import { ITEM_BY_ID } from '../game/data/items';
import { cantEat, foodsIn, hpAt, maxHp, pickFood } from '../game/engine';
import { gameNow } from '../game/clock';
import { ItemIcon } from '../components/ItemIcon';

const HOLD_MS = 450;

export function QuickEat({ s, api, say, ringRef }: { s: GameState; api: GameApi; say: (t: string) => void; ringRef: RefObject<HTMLButtonElement> }) {
  const [menu, setMenu] = useState(false);
  const hold = useRef<{ timer: number; long: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Tapping anywhere else closes the food row.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const foods = foodsIn(s);
  if (!foods.length) return null;
  const now = gameNow();
  const best = pickFood(s, now)!;
  const full = hpAt(s, now) >= maxHp(s);
  const low = hpAt(s, now) / maxHp(s) <= 0.3;
  const total = foods.reduce((n, [, c]) => n + c, 0);
  const eat = (id: string) => {
    const why = cantEat(s, id, gameNow());
    if (why) return say(why);
    api.eat(id);
  };

  return (
    <div className="quick-eat" ref={wrap}>
      {menu && (
        <div className="quick-eat-menu" role="menu">
          {foods.map(([id, n]) => (
            <button key={id} role="menuitem" className="quick-eat-food" onClick={() => (setMenu(false), eat(id))} title={ITEM_BY_ID[id].name}>
              <ItemIcon id={id} />
              <span className="qe-heal">+{ITEM_BY_ID[id].heal}</span>
              <span className="qe-count">{n}</span>
            </button>
          ))}
        </div>
      )}
      <button
        ref={ringRef}
        className={`quick-eat-btn ${full ? 'full' : ''} ${low ? 'low' : ''}`}
        aria-label={`Eat ${ITEM_BY_ID[best].name} (hold to choose)`}
        onPointerDown={() => {
          hold.current = { timer: window.setTimeout(() => hold.current && ((hold.current.long = true), setMenu(true)), HOLD_MS), long: false };
        }}
        onPointerUp={() => {
          const h = hold.current;
          hold.current = null;
          if (!h) return;
          clearTimeout(h.timer);
          if (!h.long) eat(best);
        }}
        onPointerLeave={() => hold.current && clearTimeout(hold.current.timer)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <ItemIcon id={best} />
        <span className="qe-count">{total}</span>
      </button>
    </div>
  );
}
