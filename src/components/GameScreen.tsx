// The game itself: status bar (with the gear menu), tabs (Street, Inventory, Skills, Quests, Highscores), toasts.
// Every rule runs on the server (useOnlineGame); this screen only shows the game and passes on what you do.
import { useState } from 'react';
import type { GameState, Report, Toast } from '../game/types';
import type { GameApi } from '../game/api';
import { gameNow } from '../game/clock';
import { INVENTORY_SLOTS, slotsUsed } from '../game/engine';
import { StatusBar } from './StatusBar';
import { InventoryTab } from './InventoryTab';
import { QuestsTab } from './QuestsTab';
import { SkillsTab } from './SkillsTab';
import { StartScreen } from './StartScreen';
import { StreetView, type WorldLink } from '../street/StreetView';
import type { ChatLink } from '../net/chat';
import { HighscoresTab } from './HighscoresTab';

type Tab = 'street' | 'inventory' | 'highscores' | 'quests' | 'skills';
const TABS: { id: Tab; label: string }[] = [
  { id: 'street', label: 'Street' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'skills', label: 'Skills' },
  { id: 'quests', label: 'Quests' },
  { id: 'highscores', label: 'Highscores' },
];

export interface GameScreenProps {
  state: GameState;
  api: GameApi;
  onReport: (fn: (r: Report) => void) => () => void;
  welcome: boolean;
  dismissWelcome: () => void;
  toasts: Toast[];
  /** Your account, and the shared world (other players). */
  account: { email: string; onSignOut: () => void };
  world: WorldLink;
  chat: ChatLink;
}

export function GameScreen(p: GameScreenProps) {
  const [tab, setTab] = useState<Tab>('street');
  const { state } = p;
  const bagFull = slotsUsed(state) >= INVENTORY_SLOTS;
  return (
    <div className="app">
      <StatusBar s={state} now={gameNow()} account={p.account} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'inventory' && bagFull && <span className="badge">Full</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'street' && <StreetView s={state} api={p.api} onReport={p.onReport} world={p.world} chat={p.chat} />}
        {tab === 'inventory' && <InventoryTab s={state} api={p.api} />}
        {tab === 'highscores' && (
          <HighscoresTab myName={state.name} />
        )}
        {tab === 'quests' && <QuestsTab s={state} />}
        {tab === 'skills' && <SkillsTab s={state} account={p.account} />}
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
