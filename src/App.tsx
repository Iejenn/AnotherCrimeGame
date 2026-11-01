import { useEffect, useState } from 'react';
import { useGame } from './useGame';
import { CreateCharacter } from './components/CreateCharacter';
import { StatusBar } from './components/StatusBar';
import { CrewPanel } from './components/CrewPanel';
import { JobsTab } from './components/JobsTab';
import { IntelTab } from './components/IntelTab';
import { StashTab } from './components/StashTab';
import { ShopTab } from './components/ShopTab';
import { ProfileTab } from './components/ProfileTab';
import { LogTab } from './components/LogTab';
import { PerkModal } from './components/Modals';
import { StartScreen } from './components/StartScreen';
import { clearGame, importSave } from './game/save';

type Tab = 'jobs' | 'intel' | 'stash' | 'shop' | 'profile' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'intel', label: 'Intel' },
  { id: 'stash', label: 'Stash' },
  { id: 'shop', label: 'Shop' },
  { id: 'log', label: 'Log' },
  { id: 'profile', label: 'Profile' },
];

export default function App() {
  const { state, act, create, replace, welcome, dismissWelcome, toasts } = useGame();
  const [tab, setTab] = useState<Tab>('jobs');
  const [perkOpen, setPerkOpen] = useState(true);
  const now = Date.now();
  const pendingCount = state?.pendingPerks.length ?? 0;
  // Re-open the perk picker whenever a new milestone is hit.
  useEffect(() => {
    if (pendingCount > 0) setPerkOpen(true);
  }, [pendingCount]);

  const doImport = () => {
    const text = prompt('Paste your save code:');
    if (!text) return;
    const s = importSave(text);
    if (s) replace(s);
    else alert('That save code is not valid.');
  };
  const doReset = () => {
    if (!confirm('Wipe this character and start over? This cannot be undone.')) return;
    clearGame();
    replace(null);
  };

  if (!state) return <CreateCharacter onCreate={create} onImport={doImport} />;

  const newLoot = Object.keys(state.inventory).length;
  const claimable = state.contracts.list.filter((c) => !c.claimed && c.progress >= c.target).length;

  return (
    <div className="app">
      <StatusBar s={state} now={now} act={act} />
      {state.pendingPerks.length > 0 && (
        <button className="perk-banner" onClick={() => setPerkOpen(true)}>
          {state.pendingPerks.length} perk choice{state.pendingPerks.length > 1 ? 's' : ''} waiting — choose now
        </button>
      )}
      <CrewPanel s={state} now={now} act={act} onAssign={() => setTab('jobs')} />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'intel' && claimable > 0 && <span className="badge">{claimable}</span>}
            {t.id === 'stash' && newLoot > 0 && <span className="badge quiet">{newLoot}</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'jobs' && <JobsTab s={state} now={now} act={act} />}
        {tab === 'intel' && <IntelTab s={state} now={now} act={act} />}
        {tab === 'stash' && <StashTab s={state} act={act} />}
        {tab === 'shop' && <ShopTab s={state} act={act} />}
        {tab === 'log' && <LogTab s={state} />}
        {tab === 'profile' && <ProfileTab s={state} onImport={doImport} onReset={doReset} />}
      </main>

      {welcome && <StartScreen s={state} report={welcome.report} ms={welcome.ms} onClose={dismissWelcome} />}
      {!welcome && perkOpen && state.pendingPerks.length > 0 && <PerkModal s={state} act={act} onClose={() => setPerkOpen(false)} />}

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
