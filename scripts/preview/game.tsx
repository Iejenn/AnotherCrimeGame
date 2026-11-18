import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { StreetView } from '../../src/street/StreetView';
import { GameScreen } from '../../src/components/GameScreen';
import { newGame } from '../../src/game/engine';
import { totalXpForLevel } from '../../src/game/xp';
import { emptyReport, type GameState, type Report } from '../../src/game/types';
import { gameNow } from '../../src/game/clock';
import type { GameApi } from '../../src/game/api';

const q = new URLSearchParams(location.search);
const listeners = new Set<(r: Report) => void>();
const noop = () => {};
const api: GameApi = {
  startAttempt: noop, stopAttempt: noop, eat: noop, sell: noop, drop: noop, collectGrave: noop, savePos: noop, attack: noop,
  stopFight: noop, equip: noop, unequip: noop, buy: noop, pickUp: noop, cook: noop, stopCook: noop, make: noop, stopMake: noop, bankDeposit: noop, bankWithdraw: noop, bankDepositAll: noop, questTalk: async () => null, useItem: noop, unlockGate: noop, jumpMe: noop, climb: async () => true,
};
const onReport = (fn: (r: Report) => void) => (listeners.add(fn), () => void listeners.delete(fn));
const w = window as unknown as { passOut: () => void; cook: (on: boolean) => void; ready: boolean };

function App() {
  const [s, setS] = useState<GameState>(() => {
    const g = newGame('Tester', { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 }, gameNow());
    g.player.pos = [Number(q.get('x') ?? 31), Number(q.get('y') ?? 36)];
    // ?food=1: a sandwich and two candy bars in the bag; ?hp=2: hurt.
    if (q.get('food')) g.inventory = { sandwich: 1, candy_bar: 2, cooked_bird_meat: 3 };
    if (q.get('hp')) g.hp = Number(q.get('hp'));
    if (q.get('hud')) {
      g.inventory = { sandwich: 1, candy_bar: 2, cooked_rat_meat: 3, tin_salvage: 6, copper_sheet: 4, rat_antidote: 1, tin_bat: 1, tin_throwing_knife: 37 };
      g.equipment = { weapon: 'copper_knuckles', head: 'tin_helmet', body: 'copper_vest', legs: 'tin_legs' };
      g.cash = 1234;
    }
    // ?tin=1: tin salvage and sheets in the bag, and Tinkering level 5.
    if (q.get('tin')) {
      g.inventory = { tin_salvage: 6, tin_sheet: 5 };
      g.skills.tinkering = { xp: totalXpForLevel(5) };
    }
    return g;
  });
  useEffect(() => {
    w.passOut = () => listeners.forEach((fn) => fn({ ...emptyReport(), died: true, events: ['You died'] }));
    w.cook = (on) => setS((g) => ({ ...g, cook: on ? { item: 'raw_bird_meat', next: gameNow() + 1000 } : null }));
    w.ready = true;
  }, []);
  // ?hud=1: the whole game screen (the HUD: icon bar, panels, popups), ?panel=bag|skills, ?popup=worn|quests|settings.
  if (q.get('hud'))
    return (
      <GameScreen
        state={s}
        api={api}
        onReport={onReport}
        welcome={false}
        dismissWelcome={noop}
        toasts={[]}
        account={{ email: 'tester@example.com', onSignOut: noop }}
        world={undefined as never}
        chat={undefined as never}
      />
    );
  return <StreetView s={s} api={api} onReport={onReport} />;
}
createRoot(document.querySelector('.content')!).render(<App />);
