// Holds the game state in a ref (so the 1-second tick never fights React's batching)
// and exposes `act()` for player actions. Every action first catches up on finished
// jobs, then applies the change on a cloned draft.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { GameState, Report } from './game/types';
import { catchUp, newGame } from './game/engine';
import { loadGame, saveGame } from './game/save';
import type { OriginId } from './game/types';

export interface Toast {
  id: number;
  text: string;
  kind: 'level' | 'big' | 'bust' | 'cash' | 'event' | 'loot';
}

const AWAY_THRESHOLD_MS = 60_000;

export function useGame() {
  const ref = useRef<GameState | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [away, setAway] = useState<{ report: Report; ms: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);
  const lastSave = useRef(0);

  const pushToasts = useCallback((report: Report) => {
    const list: Toast[] = [];
    for (const l of report.levelUps) list.push({ id: toastId.current++, text: `⬆ ${l.skill.toUpperCase()} ${l.level}`, kind: 'level' });
    if (report.bigScores) list.push({ id: toastId.current++, text: `💥 BIG SCORE ×${report.bigScores}`, kind: 'big' });
    if (report.busts) list.push({ id: toastId.current++, text: '🚨 BUSTED', kind: 'bust' });
    if (report.cash >= 1) list.push({ id: toastId.current++, text: `+$${Math.round(report.cash).toLocaleString()}`, kind: 'cash' });
    if (report.loot.length) list.push({ id: toastId.current++, text: `🎒 +${report.loot.length} loot`, kind: 'loot' });
    for (const e of report.events) list.push({ id: toastId.current++, text: `✦ ${e}`, kind: 'event' });
    if (!list.length) return;
    setToasts((t) => [...t, ...list].slice(-6));
    const ids = list.map((x) => x.id);
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), 3500);
  }, []);

  const commit = useCallback((s: GameState, force = false) => {
    ref.current = s;
    const now = Date.now();
    if (force || now - lastSave.current > 5000) {
      saveGame(s);
      lastSave.current = now;
    }
    rerender();
  }, []);

  // Initial load + offline catch-up ("while you were away")
  useEffect(() => {
    const saved = loadGame();
    if (!saved) return rerender();
    const now = Date.now();
    const { state, report } = catchUp(saved, now);
    const ms = now - saved.lastSeen;
    if (report.jobs > 0 && ms > AWAY_THRESHOLD_MS) setAway({ report, ms });
    commit({ ...state, lastSeen: now }, true);
  }, [commit]);

  // 1-second heartbeat: resolve finished jobs, refresh timers.
  useEffect(() => {
    const id = setInterval(() => {
      const s = ref.current;
      if (!s) return;
      const now = Date.now();
      const { state, report } = catchUp(s, now);
      if (state !== s) {
        commit({ ...state, lastSeen: now }, true);
        pushToasts(report);
      } else {
        // Nothing resolved — still re-render so countdowns move, and save lastSeen now and then.
        s.lastSeen = now;
        commit(s);
      }
    }, 1000);
    const onHide = () => ref.current && saveGame(ref.current);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [commit, pushToasts]);

  const act = useCallback(
    (fn: (draft: GameState, now: number) => void) => {
      const s = ref.current;
      if (!s) return;
      const now = Date.now();
      const { state, report } = catchUp(s, now);
      const draft = structuredClone(state);
      fn(draft, now);
      commit(draft, true);
      pushToasts(report);
    },
    [commit, pushToasts],
  );

  const create = useCallback((name: string, origin: OriginId) => commit(newGame(name, origin, Date.now()), true), [commit]);
  const replace = useCallback((s: GameState | null) => {
    ref.current = s;
    if (s) saveGame(s);
    rerender();
  }, []);

  return { state: ref.current, act, create, replace, away, dismissAway: () => setAway(null), toasts };
}
