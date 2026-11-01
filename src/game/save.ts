import type { GameState } from './types';

const KEY = 'underworld-idle-save-v1';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s?.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — game still runs, just won't persist */
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function exportSave(s: GameState) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}

export function importSave(text: string): GameState | null {
  try {
    const s = JSON.parse(decodeURIComponent(escape(atob(text.trim())))) as GameState;
    return s?.version === 1 && s.skills ? s : null;
  } catch {
    return null;
  }
}
