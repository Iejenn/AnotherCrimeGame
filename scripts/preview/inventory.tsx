import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { InventoryTab } from '../../src/components/InventoryTab';
import { newGame } from '../../src/game/engine';
import { gameNow } from '../../src/game/clock';
import type { GameApi } from '../../src/game/api';

const s = newGame('Sepp', { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 }, gameNow());
s.cash = 139;
s.inventory = { candy_bar: 4, cooked_bird_meat: 6, raw_rat_meat: 3, cooked_rat_meat: 2, baseball_bat: 1, knife: 1 };
const api = new Proxy({}, { get: () => () => {} }) as GameApi;
createRoot(document.querySelector('.content')!).render(<InventoryTab s={s} api={api} />);
setTimeout(() => ((window as unknown as { ready: boolean }).ready = true), 400);
