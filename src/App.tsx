import { useState } from 'react';
import { useGame } from './useGame';
import { CreateCharacter } from './components/CreateCharacter';
import { StatusBar } from './components/StatusBar';
import { InventoryTab } from './components/InventoryTab';
import { QuestsTab } from './components/QuestsTab';
import { SkillsTab } from './components/SkillsTab';
import { StartScreen } from './components/StartScreen';
import { StreetView } from './street/StreetView';
import { clearGame, importSave } from './game/save';
import { INVENTORY_SLOTS, slotsUsed } from './game/engine';

type Tab = 'street' | 'inventory' | 'quests' | 'skills';
const TABS: { id: Tab; label: string }[] = [
  { id: 'street', label: 'Street' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'quests', label: 'Quests' },
  { id: 'skills', label: 'Skills' },
];

export default function App() {
  const { state, act, create, replace, onReport, welcome, dismissWelcome, toasts } = useGame();
  const [tab, setTab] = useState<Tab>('street');
  const now = Date.now();

  const doImport = async () => {
    const text = prompt('Paste your save code:');
    if (!text) return;
    const s = await importSave(text);
    if (!s) return alert('That save code is not valid.');
    // Importing overwrites the character on this device, so check first.
    if (state && !confirm(`Replace ${state.name} on this device with ${s.name}?`)) return;
    replace(s);
  };
  const doReset = () => {
    if (!confirm('Wipe this character and start over? This cannot be undone.')) return;
    clearGame();
    replace(null);
  };

  if (!state) return <CreateCharacter onCreate={create} onImport={doImport} />;

  const bagFull = slotsUsed(state) >= INVENTORY_SLOTS;

  return (
    <div className="app">
      <StatusBar s={state} now={now} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'inventory' && bagFull && <span className="badge">Full</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'street' && <StreetView s={state} act={act} onReport={onReport} />}
        {tab === 'inventory' && <InventoryTab s={state} act={act} />}
        {tab === 'quests' && <QuestsTab />}
        {tab === 'skills' && <SkillsTab s={state} onImport={doImport} onReset={doReset} />}
      </main>

      {welcome && <StartScreen s={state} onClose={dismissWelcome} />}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
