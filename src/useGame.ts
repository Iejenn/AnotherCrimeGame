// Holds the game state in a ref (so the fast tick never fights React's batching) and
// exposes `act()` for player actions. Only active play counts (docs/design.md §2):
// when the app is hidden, closed, or asleep for more than a few seconds, your job stops
// and the time in between gives nothing.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { GameState, Look, Report } from './game/types';
import { newGame, stopJob, tick } from './game/engine';
import { SKILL_BY_ID } from './game/data/skills';
import { loadGame, saveGame } from './game/save';

export interface Toast {
  id: number;
  text: string;
  kind: 'level' | 'big' | 'bust' | 'event';
}

/** How often the game checks for finished attempts. Actions are 0.5s, so 4× a second feels instant. */
const TICK_MS = 250;
/** A gap longer than this means the phone slept or the tab was in the background: stop, don't catch up. */
const AWAY_MS = 5000;

export function useGame() {
  const ref = useRef<GameState | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  // The start screen shows once per page load for an existing character.
  const [welcome, setWelcome] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);
  const lastSave = useRef(0);
  // Other views (the Street) listen for job results, e.g. to float "+$3" over the character.
  const listeners = useRef(new Set<(r: Report) => void>());

  const pushToasts = useCallback((report: Report) => {
    if (report.jobs || report.events.length) listeners.current.forEach((fn) => fn(report));
    const list: Toast[] = [];
    for (const l of report.levelUps) list.push({ id: toastId.current++, text: `${SKILL_BY_ID[l.skill].name} → Lv ${l.level}`, kind: 'level' });
    for (const e of report.events) list.push({ id: toastId.current++, text: e, kind: 'event' });
    if (!list.length) return;
    setToasts((t) => [...t, ...list].slice(-4));
    const ids = list.map((x) => x.id);
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), 3000);
  }, []);

  const commit = useCallback((s: GameState, force = false) => {
    ref.current = s;
    const now = Date.now();
    if (force || now - lastSave.current > 3000) {
      saveGame(s);
      lastSave.current = now;
    }
    rerender();
  }, []);

  /** Stop the current job without paying out anything (used when you leave the game). */
  const stopForAway = useCallback(() => {
    const s = ref.current;
    if (!s?.player.job) return;
    const d = structuredClone(s);
    stopJob(d);
    commit(d, true);
  }, [commit]);

  // Load. A job saved from last time is cancelled: nothing happens while you're away.
  useEffect(() => {
    const saved = loadGame();
    if (!saved) return rerender();
    if (saved.player.job) saved.player.job = null;
    saved.player.caught = null; // a punch that was on its way when you left doesn't follow you
    commit(saved, true);
    setWelcome(true);
  }, [commit]);

  // The heartbeat: resolve finished attempts and refresh timers.
  useEffect(() => {
    let lastTick = Date.now();
    const id = setInterval(() => {
      const s = ref.current;
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;
      if (!s) return;
      if (gap > AWAY_MS) return stopForAway();
      const { state, report } = tick(s, now);
      if (state !== s) {
        commit(state);
        pushToasts(report);
      } else {
        rerender(); // timers and health regen still move
      }
    }, TICK_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopForAway();
      if (ref.current) saveGame(ref.current);
    };
    const onUnload = () => ref.current && saveGame(ref.current);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [commit, pushToasts, stopForAway]);

  const act = useCallback(
    (fn: (draft: GameState, now: number) => void) => {
      const s = ref.current;
      if (!s) return;
      const now = Date.now();
      const { state, report } = tick(s, now);
      const draft = structuredClone(state);
      fn(draft, now);
      commit(draft, true);
      pushToasts(report);
    },
    [commit, pushToasts],
  );

  const create = useCallback((name: string, look: Look) => commit(newGame(name, look, Date.now()), true), [commit]);
  const replace = useCallback((s: GameState | null) => {
    if (s) {
      s.player.job = null;
      s.player.caught = null;
    }
    ref.current = s;
    if (s) saveGame(s);
    rerender();
  }, []);

  const onReport = useCallback((fn: (r: Report) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return { state: ref.current, act, create, replace, onReport, welcome, dismissWelcome: () => setWelcome(false), toasts };
}
