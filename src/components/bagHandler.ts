// While a shop's "Sell" screen or the bank is open, your bag at the bottom of the screen is where you pick things: a tap
// on a slot goes to the shop (or the bank) instead of selecting the item. The dialog registers itself here while it's
// open (useBagHandler); the bag panel and the game screen read it (useCurrentBagHandler). (v0.44.3: no second bag in
// the dialog any more.)
import { useEffect, useRef, useSyncExternalStore } from 'react';

export interface BagHandler {
  /** What the bag's top line says ("Tap something you want to sell."). */
  line: string;
  /** The slot that's picked (its key), if any. */
  selected: string | null;
  pick: (key: string) => void;
}

let current: BagHandler | null = null;
const listeners = new Set<() => void>();
const set = (h: BagHandler | null) => {
  current = h;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useCurrentBagHandler = () => useSyncExternalStore(subscribe, () => current);

/** Take over the bag while this component is mounted and `h` isn't null. */
export function useBagHandler(h: BagHandler | null) {
  const mine = useRef<BagHandler | null>(null);
  // (`h` must be stable between renders, e.g. from useMemo, or this would run every render.)
  useEffect(() => {
    mine.current = h;
    set(h);
  }, [h]);
  useEffect(
    () => () => {
      if (current === mine.current) set(null);
    },
    [],
  );
}
