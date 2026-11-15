import type { GameState } from './types';

const KEY = 'underworld-idle-save-v1';
/** Prefix for compressed save codes, so old (uncompressed) codes still import. */
const CODE_PREFIX = 'UI1.';

/**
 * Bring any older save up to the current shape. v0.5 removed hired crew, gear, upgrades,
 * fronts, contracts and the collection: those fields are dropped, everything else is kept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): GameState | null {
  if (raw?.version !== 1 || !raw.skills || !Array.isArray(raw.crew)) return null;
  const me = raw.crew.find((c: { isPlayer?: boolean }) => c.isPlayer) ?? raw.crew[0];
  raw.crew = [{ id: 'you', name: me?.name ?? raw.name, isPlayer: true, job: me?.job ?? null, jailedUntil: me?.jailedUntil ?? 0 }];
  for (const k of ['gear', 'upgrades', 'fronts', 'contracts', 'discovered']) delete raw[k];
  if (raw.stats) delete raw.stats.contracts;
  raw.inventory ??= {};
  raw.cars ??= [];
  raw.buffs ??= [];
  raw.pendingPerks ??= [];
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
