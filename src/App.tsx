import { Suspense, lazy } from 'react';
// Online mode (and the Supabase library) only downloads for people who switch it on.
import { onlineMode } from './net/mode';
const OnlineGate = lazy(() => import('./net/OnlineGate').then((m) => ({ default: m.OnlineGate })));
import { useGame } from './useGame';
import { CreateCharacter } from './components/CreateCharacter';
import { GameScreen } from './components/GameScreen';
import { clearGame, importSave } from './game/save';

/** ?online switches this browser to the online test version (docs/design.md §11); everyone else plays offline. */
const ONLINE = onlineMode();

export default function App() {
  return ONLINE ? (
    <Suspense fallback={<div className="create"><p className="muted">Connecting…</p></div>}>
      <OnlineGate />
    </Suspense>
  ) : (
    <OfflineApp />
  );
}

function OfflineApp() {
  const { state, api, create, replace, onReport, welcome, dismissWelcome, toasts } = useGame();

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
  return (
    <GameScreen
      state={state}
      api={api}
      onReport={onReport}
      welcome={welcome}
      dismissWelcome={dismissWelcome}
      toasts={toasts}
      onImport={doImport}
      onReset={doReset}
    />
  );
}
