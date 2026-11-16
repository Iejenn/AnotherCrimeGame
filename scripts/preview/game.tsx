import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { StreetView } from '../../src/street/StreetView';
import { newGame } from '../../src/game/engine';
import { emptyReport, type GameState, type Report } from '../../src/game/types';
import { gameNow } from '../../src/game/clock';
import type { GameApi } from '../../src/game/api';

const q = new URLSearchParams(location.search);
const listeners = new Set<(r: Report) => void>();
const noop = () => {};
const api: GameApi = {
  startAttempt: noop, stopAttempt: noop, eat: noop, sell: noop, drop: noop, collectGrave: noop, savePos: noop, attack: noop,
  stopFight: noop, equip: noop, unequip: noop, buy: noop, pickUp: noop, cook: noop, stopCook: noop,
};
const onReport = (fn: (r: Report) => void) => (listeners.add(fn), () => void listeners.delete(fn));
const w = window as unknown as { passOut: () => void; cook: (on: boolean) => void; ready: boolean };

function App() {
  const [s, setS] = useState<GameState>(() => {
    const g = newGame('Tester', { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 }, gameNow());
    g.player.pos = [Number(q.get('x') ?? 31), Number(q.get('y') ?? 36)];
    return g;
  });
  useEffect(() => {
    w.passOut = () => listeners.forEach((fn) => fn({ ...emptyReport(), died: true, events: ['You died'] }));
    w.cook = (on) => setS((g) => ({ ...g, cook: on ? { item: 'raw_bird_meat', next: gameNow() + 1000 } : null }));
    w.ready = true;
  }, []);
  return <StreetView s={s} api={api} onReport={onReport} />;
}
createRoot(document.querySelector('.content')!).render(<App />);
