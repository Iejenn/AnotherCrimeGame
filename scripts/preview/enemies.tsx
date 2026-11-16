import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { EnemyGuide } from '../../src/components/EnemyGuide';
import { newGame } from '../../src/game/engine';
import { DEFAULT_LOOK } from '../../src/street/character';

const s = newGame('Tester', DEFAULT_LOOK, Date.now());
createRoot(document.getElementById('root')!).render(<EnemyGuide s={s} skill="melee" />);
setTimeout(() => {
  (document.querySelectorAll('.enemy-row')[1] as HTMLButtonElement)?.click();
  setTimeout(() => ((window as unknown as { ready: boolean }).ready = true), 300);
}, 300);
