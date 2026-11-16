// The way into the game (it's online only): sign in, make (or bring along) your character on the server,
// then play: the normal game screen, with every rule run by the server and the other players on the Street
// (docs/design.md §11).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CreateCharacter } from '../components/CreateCharacter';
import { syncClock } from '../game/clock';
import { fmtMoney } from '../game/engine';
import { GameScreen } from '../components/GameScreen';
import { useOnlineGame, type ServerAnswer } from './useOnlineGame';
import { useWorld } from './world';
import { useChat } from './chat';
import { AuthScreen } from './AuthScreen';
import { REASONS, logOut, supabase } from './supabase';
import { loadGame } from '../game/save';
import { levelFromXp as lvl } from '../game/xp';


export function OnlineGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [player, setPlayer] = useState<ServerAnswer | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The name to use when bringing an offline character along (it may need changing: online names are unique). */
  const [importName, setImportName] = useState<string | null>(null);
  /** This account is being played on another device right now: ask before taking over. */
  const [elsewhere, setElsewhere] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Followed a "reset your password" link: ask for the new password first.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /**
   * Claim the account for this device (one device at a time; `takeOver` logs the other device out), then load your
   * character and line the game clock up with the server's.
   */
  const load = useCallback(async (takeOver = false) => {
    const claim = await supabase.rpc('claim_session', { p_force: takeOver });
    if (claim.error) return setError(claim.error.message);
    if (claim.data?.reason === 'active_elsewhere') return setElsewhere(true);
    setElsewhere(false);
    const sentAt = Date.now();
    const { data, error: e } = await supabase.rpc('game_state');
    if (e) return setError(e.message);
    if (data?.server_now) syncClock(data.server_now, sentAt, Date.now());
    if (data?.ok) setPlayer(data as ServerAnswer);
    else if (data?.reason === 'no_character') setPlayer(null);
    else setError(REASONS[data?.reason] ?? 'Something went wrong.');
  }, []);

  useEffect(() => {
    if (session && !recovering) void load();
    if (!session) setPlayer(undefined);
  }, [session, recovering, load]);

  if (session === undefined) return <div className="create"><p className="muted">Connecting…</p></div>;
  if (!session || recovering) return <AuthScreen recovering={recovering} onDone={() => setRecovering(false)} />;
  if (elsewhere)
    return (
      <div className="create">
        <h1 className="title">Underworld</h1>
        <h2 className="headline">You're already playing on another device</h2>
        <p className="deck">This account is in the game somewhere else right now. One device at a time: if you play here, the other device is logged out.</p>
        <div className="save-row">
          <button className="btn primary" onClick={() => void load(true)}>
            Play here
          </button>
          <button className="btn" onClick={() => void logOut()}>
            Log out
          </button>
        </div>
      </div>
    );
  if (player === undefined) return <div className="create"><p className="muted">{error || 'Loading your character…'}</p></div>;

  if (player === null) {
    // Played offline before? Offer to bring that character into this account (until the server's cutoff date).
    const local = loadGame();
    const create = (
      <CreateCharacter
        busy={busy}
        error={error}
        onCreate={async (name, look) => {
          setBusy(true);
          setError('');
          const { data, error: e } = await supabase.rpc('create_character', { p_name: name, p_look: look });
          setBusy(false);
          if (e) return setError(e.message);
          if (!data?.ok) return setError(REASONS[data?.reason] ?? 'Something went wrong.');
          void load(true);
        }}
      />
    );
    if (!local) return create;
    return (
      <>
        <div className="create import-offer">
          <div className="kicker">You played offline on this device</div>
          <h2 className="headline">Bring {local.name} along?</h2>
          <p className="small">
            Street Crimes level {lvl(local.skills.street.xp)}, {fmtMoney(local.cash)} in cash. Your character moves into this account so you can
            play it online. (Your offline copy on this device stays as it is.)
          </p>
          <label className="field">
            <span className="label">Name online</span>
            <input value={importName ?? local.name} maxLength={16} onChange={(e) => setImportName(e.target.value)} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button
            className="btn primary block"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              const { name, look, cash, skills, inventory, stats, version } = local;
              const { data, error: e } = await supabase.rpc('import_local_character', { p_save: { name: importName ?? name, look, cash, skills, inventory, stats, version } });
              setBusy(false);
              if (e) return setError(e.message);
              if (!data?.ok) return setError(REASONS[data?.reason] ?? 'Something went wrong.');
              void load(true);
            }}
          >
            Bring {local.name} along
          </button>
          <p className="muted small">Or make a brand new character below.</p>
        </div>
        {create}
      </>
    );
  }

  return <OnlinePlay first={player} userId={session.user.id} email={session.user.email ?? ''} />;
}

/** Log out after this long without touching the game (taps, swipes, scrolls, keys). */
const IDLE_MS = 5 * 60_000;

/** Playing online: the normal game screen, run by the server, with the other players around you. */
function OnlinePlay({ first, userId, email }: { first: ServerAnswer; userId: string; email: string }) {
  // Another device took over this account: log out here, and say why on the sign-in screen.
  const g = useOnlineGame(first, () => void logOut('replaced'));
  const apiRef = useRef(g.api);
  apiRef.current = g.api;

  // Idle for 5 minutes: stop what you were doing and log out.
  useEffect(() => {
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const id = setInterval(() => {
      if (Date.now() - last < IDLE_MS) return;
      clearInterval(id);
      apiRef.current.stopAttempt();
      void logOut('idle');
    }, 10_000);
    return () => {
      clearInterval(id);
      for (const e of events) window.removeEventListener(e, touch);
    };
  }, []);

  const world = useWorld(userId, g.roster, g.refresh);
  const chat = useChat(userId);
  return (
    <GameScreen
      state={g.state}
      api={g.api}
      onReport={g.onReport}
      welcome={g.welcome}
      dismissWelcome={g.dismissWelcome}
      toasts={g.toasts}
      account={{ email, onSignOut: () => void logOut() }}
      world={world}
      chat={chat}
    />
  );
}
