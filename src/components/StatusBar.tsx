// Slim header: who you are, your health, and the gear menu (your account, log out). Cash lives in the Inventory.
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../game/types';
import { hpAt, maxHp, rankFor, totalLevel } from '../game/engine';
import { useInstall } from '../useInstall';

export function StatusBar({ s, now, account }: { s: GameState; now: number; account: { email: string; onSignOut: () => void } }) {
  // Health regenerates in fractions (1 HP a minute), so you can be at 0.6 HP: still alive (you only pass out at 0).
  // Round down, but never show 0 while you're alive.
  const exact = hpAt(s, now);
  const hp = exact > 0 ? Math.max(1, Math.floor(exact)) : 0;
  const max = maxHp(s);
  const [menu, setMenu] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const app = useInstall();
  const ref = useRef<HTMLDivElement>(null);
  // Tapping anywhere else closes the menu.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  return (
    <header className="topbar">
      <span className="topbar-name">{s.name}</span>
      <span className="stamp small">{rankFor(totalLevel(s)).name}</span>
      <span className={`topbar-hp ${hp <= 3 ? 'low' : ''}`} title="Health. Failed crimes cost a little; food heals; it also comes back on its own (1 per minute).">
        <span className="label">HP</span> <span className="mono">{hp}/{max}</span>
      </span>
      <div className="gear" ref={ref}>
        <button className="gear-btn" onClick={() => setMenu((m) => !m)} aria-label="Settings" aria-expanded={menu}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        {menu && (
          <div className="gear-menu" role="menu">
            <p className="muted small">Signed in as {account.email}</p>
            {/* Install the game as an app (home screen icon, full screen). */}
            {app.mode === 'prompt' && (
              <button className="btn small block primary" role="menuitem" onClick={() => void app.install()}>
                Install app
              </button>
            )}
            {app.mode === 'ios' && (
              <>
                <button className="btn small block primary" role="menuitem" onClick={() => setIosHelp((v) => !v)}>
                  Install app
                </button>
                {iosHelp && (
                  <p className="small install-help">
                    In Safari, tap <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>.
                  </p>
                )}
              </>
            )}
            <button className="btn small block" role="menuitem" onClick={account.onSignOut}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
