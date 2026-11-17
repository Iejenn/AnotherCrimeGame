import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { BankDialog } from '../../src/street/BankDialog';
import { newGame } from '../../src/game/engine';
import { gameNow } from '../../src/game/clock';
import type { GameApi } from '../../src/game/api';

const s = newGame('Sepp', { skin: 1, hair: 1, hairColor: 1, top: 0, bottom: 1 }, gameNow());
s.cash = 139;
s.inventory = { tin_salvage: 6, cooked_rat_meat: 2, tin_bat: 1 };
s.bank = [{ i: 'tin_salvage', n: 29 }, { i: 'tin_sheet', n: 12 }, { i: 'cooked_bird_meat', n: 14 }, { i: 'tin_knuckles', n: 3 }, { i: 'candy_bar', n: 41 }, { i: 'tin_helmet', n: 1 }];
s.bankCash = 2450;
const api = new Proxy({}, { get: () => () => {} }) as GameApi;
createRoot(document.querySelector('.street')!).render(<BankDialog s={s} api={api} pos={[130, 27]} onClose={() => {}} />);
setTimeout(() => ((window as unknown as { ready: boolean }).ready = true), 400);
