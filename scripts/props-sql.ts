// Prints supabase/migrations/0048_street_props.sql (v0.63): the street furniture and alley dumpsters are solid.
// Run: npx vite-node scripts/print-sql.ts 0048 > supabase/migrations/0048_street_props.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
//
// What it does (the SQL has no comments: Supabase's SQL editor mangles them, see 0041). Lines under 100 characters.
//  - The enemies' walk map gets the rows that changed (game.patch_row, from 0043): the tiles of map.ts's STREET_PROPS
//    are solid now (benches, bins, hydrants, mailboxes, newspaper boxes, bike racks, alley dumpsters).
//  - Anyone, anything on the ground and any grave on one of those tiles is moved to the Plaza (the spawn).
//  - A guard undoes everything if the walk map isn't exactly the game's.
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { SPAWN, STREET_PROPS } from '../src/street/map';
import { applyPatch, gameRows, rowPatch } from './city-sql';
import { liveAfter0043 } from './pipe-sql';
import { shortLines } from './sqlkit';

declare const require: (m: string) => any;
const md5 = (t: string): string => require('node:crypto').createHash('md5').update(t).digest('hex');

/** The walk map as it's live after 0047: 0043's, with 0047's patches written in. */
export function liveAfter0047(m0038: string, m0040: string, m0041: string, m0043: string, m0047: string): string[] {
  const rows = liveAfter0043(m0038, m0040, m0041, m0043);
  const block = m0047.slice(m0047.indexOf('from (values'), m0047.indexOf(') v(y, p)')).replace(/'\s*\|\|\s*'/g, '');
  for (const [, y, p] of block.matchAll(/\((\d+), '([^']*)'\)/g)) rows[Number(y)] = applyPatch(rows[Number(y)], p);
  return rows;
}

export function propsSql(m0038: string, m0040: string, m0041: string, m0043: string, m0047: string): string {
  const live = liveAfter0047(m0038, m0040, m0041, m0043, m0047);
  const game = gameRows();
  const changed = game.map((r, y) => [y, r] as [number, string]).filter(([y, r]) => r !== live[y]);
  /** A long patch as pieces of at most 70 characters joined with || (no line over 100). */
  const packed = (t: string) => (t.match(/.{1,70}/g) as string[]).map((q) => `'${q}'`).join('\n    || ');
  const tiles = STREET_PROPS.map((p) => `(${p.x},${p.y})`).join(',');
  const move = (t: string, xc: string, yc: string) => `update ${t} t set ${xc} = ${SPAWN[0]}, ${yc} = ${SPAWN[1]}
from (values ${tiles}) v(x, y) where t.${xc} = v.x and t.${yc} = v.y;`;
  const sql = `begin;

update game.walk_map w set masks = game.patch_row(w.masks, v.p)
from (values
${changed.map(([y, r]) => `(${y}, ${packed(rowPatch(live[y], r))})`).join(',\n')}
) v(y, p) where w.y = v.y;

${move('public.players', 'pos_x', 'pos_y')}
${move('public.ground_items', 'x', 'y')}
${move('public.graves', 'x', 'y')}

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> '${md5(game.join(''))}' then
    raise exception '0048: walk map differs from the game';
  end if;
end $$;

select 'ok' as street_props;

commit;
`
    .split('\n')
    .map(shortLines)
    .join('\n');
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}
