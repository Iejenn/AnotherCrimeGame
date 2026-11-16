// The game itself: status bar, tabs (Street, Inventory, Highscores, Quests, Skills), toasts.
// The same screen runs offline (rules in this browser, useGame) and online (rules on the server, useOnlineGame).
import { Suspense, lazy, useState } from 'react';
import type { GameState, Report } from '../game/types';
import type { GameApi } from '../game/api';
import type { Toast } from '../useGame';
import { gameNow } from '../game/clock';
import { INVENTORY_SLOTS, slotsUsed } from '../game/engine';
import { StatusBar } from './StatusBar';
import { InventoryTab } from './InventoryTab';
import { QuestsTab } from './QuestsTab';
import { SkillsTab } from './SkillsTab';
import { StartScreen } from './StartScreen';
import { StreetView, type WorldLink } from '../street/StreetView';
// The highscores come from the server, so the Supabase library only downloads when you open the tab.
const HighscoresTab = lazy(() => import('./HighscoresTab').then((m) => ({ default: m.HighscoresTab })));

type Tab = 'street' | 'inventory' | 'highscores' | 'quests' | 'skills';
const TABS: { id: Tab; label: string }[] = [
  { id: 'street', label: 'Street' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'highscores', label: 'Highscores' },
  { id: 'quests', label: 'Quests' },
  { id: 'skills', label: 'Skills' },
];

export interface GameScreenProps {
  state: GameState;
  api: GameApi;
  onReport: (fn: (r: Report) => void) => () => void;
  welcome: boolean;
  dismissWelcome: () => void;
  toasts: Toast[];
  /** Offline only: save codes. */
  onImport?: () => void;
  onReset?: () => void;
  /** Online only: your account, and the shared world (other players). */
  account?: { email: string; onSignOut: () => void };
  world?: WorldLink;
}

export function GameScreen(p: GameScreenProps) {
  const [tab, setTab] = useState<Tab>('street');
  const { state } = p;
  const bagFull = slotsUsed(state) >= INVENTORY_SLOTS;
  return (
    <div className="app">
      <StatusBar s={state} now={gameNow()} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'inventory' && bagFull && <span className="badge">Full</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'street' && <StreetView s={state} api={p.api} onReport={p.onReport} world={p.world} />}
        {tab === 'inventory' && <InventoryTab s={state} api={p.api} />}
        {tab === 'highscores' && (
          <Suspense fallback={<p className="muted">Loading the highscores…</p>}>
            <HighscoresTab online={!!p.account} myName={state.name} />
          </Suspense>
        )}
        {tab === 'quests' && <QuestsTab />}
        {tab === 'skills' && <SkillsTab s={state} onImport={p.onImport} onReset={p.onReset} account={p.account} />}
      </main>

      {p.welcome && <StartScreen s={state} onClose={p.dismissWelcome} />}

      <div className="toasts">
        {p.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
