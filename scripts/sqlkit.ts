// Helpers shared by the generated-migration scripts (they print nothing themselves, so importing them is safe).
import { GH } from '../src/street/map';

/** The enemies' walk map as it's live: 0038's rows, with the rows 0040 updated. */
export function liveWalkRows(m0038: string, m0040: string): string[] {
  const out: string[] = [];
  for (let y = 0; y < GH; y++) {
    const upd = new RegExp(`set masks = '([0-9a-f]+)' where y = ${y};`).exec(m0040);
    const base = new RegExp(`\\n  \\(${y}, '([0-9a-f]+)'\\)`).exec(m0038);
    out.push(upd ? upd[1] : base![1]);
  }
  return out;
}

/** v0.58: no line over 100 characters (a long line got wrapped on its way into the SQL editor, which broke it): long
 *  hex strings become pieces joined with ||, and long lines break after a comma or a space outside quotes. */
export function shortLines(line: string): string {
  line = line.replace(/'([0-9a-f]{80,})'/g, (_, hex: string) => (hex.match(/.{1,80}/g) as string[]).map((h) => `'${h}'`).join('\n  || ').replace(/^/, '\n  '));
  return line
    .split('\n')
    .flatMap((l) => {
      const out: string[] = [];
      let cur = '';
      let quoted = false;
      for (const ch of l) {
        cur += ch;
        if (ch === "'") quoted = !quoted;
        if (!quoted && (ch === ',' || ch === ' ') && cur.length > 60) out.push(cur.trimEnd()), (cur = '    ');
      }
      out.push(cur);
      return out.filter((x, i) => i === 0 || x.trim());
    })
    .join('\n');
}
