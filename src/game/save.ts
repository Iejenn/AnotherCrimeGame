import type { GameState } from './types';

const KEY = 'underworld-idle-save-v1';
/** Prefix for compressed save codes. v0.7+ codes start with UI2; older codes are refused. */
const CODE_PREFIX = 'UI2.';

/**
 * Accept only saves of the current version. v0.7 replaced all skills (5 new skills, levels 1–10),
 * so older saves can't be converted: those players make a new character.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): GameState | null {
  if (raw?.version !== 2 || !raw.skills || !raw.look) return null;
  // Early v0.7 test saves had a one-person `crew` list and mastery stars; both are gone.
  if (!raw.player) raw.player = { job: null, jailedUntil: raw.crew?.[0]?.jailedUntil ?? 0, stunnedUntil: 0 };
  delete raw.crew;
  delete raw.mastery;
  delete raw.lastSeen;
  raw.player.job = null; // nothing carries over from last time: only active play counts
  raw.player.stunnedUntil ??= 0;
  // Skills that didn't exist in a save start at 0 XP.
  for (const id of ['street', 'melee', 'defense', 'gunfire', 'health']) raw.skills[id] ??= { xp: 0 };
  raw.inventory ??= {};
  raw.buffs ??= [];
  raw.log = Array.isArray(raw.log) ? raw.log : [];
  return raw as GameState;
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** True when this browser holds a save from before v0.7 (shown as a note on the character creator). */
export function hasOldSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    return !!raw && JSON.parse(raw)?.version !== 2;
  } catch {
    return false;
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

// ---------- Save codes (for moving between devices) ----------

function toBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * Short save code: the activity log is left out (it was ~90% of the size and is
 * just history), then the rest is deflate-compressed. Typical code: ~1,000 chars.
 */
export async function exportSave(s: GameState): Promise<string> {
  const json = JSON.stringify({ ...s, log: [] });
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return toBase64Url(bytes); // very old browser: uncompressed
  return CODE_PREFIX + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function importSave(text: string): Promise<GameState | null> {
  try {
    const code = text.replace(/\s+/g, '');
    let json: string;
    if (code.startsWith(CODE_PREFIX)) {
      json = new TextDecoder().decode(await pipe(fromBase64Url(code.slice(CODE_PREFIX.length)), new DecompressionStream('deflate-raw')));
    } else {
      // Older codes: plain base64 JSON.
      json = new TextDecoder().decode(fromBase64Url(code));
    }
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}
