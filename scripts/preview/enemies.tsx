import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { EnemyGuide } from '../../src/components/EnemyGuide';
createRoot(document.getElementById('root')!).render(<EnemyGuide skill="melee" />);
setTimeout(() => {
  (document.querySelectorAll('.enemy-row')[1] as HTMLButtonElement)?.click();
  setTimeout(() => ((window as unknown as { ready: boolean }).ready = true), 300);
}, 300);
