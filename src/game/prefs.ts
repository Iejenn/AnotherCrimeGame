// Settings kept on this device (v0.57): how you like the game to look, not game state (that's on the server).
// Stored in localStorage when it can be; a change is announced (onPrefs) so what's open updates right away.

export interface Prefs {
  /** How far the minimap is zoomed out: 1 = the standard view, up to 3 (300%: three times as much ground across). */
  minimapZoom: number;
}
const KEY = 'underworld-prefs';
const DEFAULTS: Prefs = { minimapZoom: 1 };
let current: Prefs = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { ...DEFAULTS, ...p, minimapZoom: Math.min(3, Math.max(1, Number(p.minimapZoom) || 1)) };
  } catch {
    return { ...DEFAULTS };
  }
})();
const listeners = new Set<(p: Prefs) => void>();

export const getPrefs = () => current;
export function setPrefs(change: Partial<Prefs>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // (No storage, e.g. a private window: it still applies until the page is closed.)
  }
  for (const l of listeners) l(current);
}
/** Call `fn` whenever the settings change; returns the function that stops it. */
export function onPrefs(fn: (p: Prefs) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
