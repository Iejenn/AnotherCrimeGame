// Prints supabase/migrations/0043_three_drunks.sql (v0.60): the bar has 3 drunks again (an empty stool between each
// two). drunk_0..2 move to their stools; drunk_3..5 are deleted (with their emptied-spot rows, and anyone's attempt on
// them stops), so nobody can pick a pocket the game no longer shows. The enemies' walk map rows round the stools
// change (the empty stools are open floor now). A guard undoes everything if the result isn't the game's.
// No comments in the SQL itself (Supabase's SQL editor mangles them, see 0041). Lines under 100 characters.
// Run: npx vite-node scripts/drunks-sql.ts > supabase/migrations/0043_three_drunks.sql
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { GH, NODES, W, gi } from '../src/street/map';
import { walkMasks } from '../src/street/sight';
import { liveWalkRows, shortLines } from './sqlkit';

declare const require: (m: string) => any;
const md5 = (t: string): string => require('node:crypto').createHash('md5').update(t).digest('hex');

/** The walk map as it's live after 0041: 0038's rows, 0040's and 0041's updates on top. */
export function liveAfter0041(m0038: string, m0040: string, m0041: string): string[] {
  const rows = liveWalkRows(m0038, m0040);
  const flat = m0041.replace(/'\n {2}\|\| '/g, '').replace(/masks = \n {2}'/g, "masks = '").replace(/'\n +where y/g, "' where y");
  for (const [, r, y] of flat.matchAll(/set masks = '([0-9a-f]+)' where y = (\d+);/g)) rows[Number(y)] = r;
  return rows;
}

export function drunksSql(m0038: string, m0040: string, m0041: string): string {
  const live = liveAfter0041(m0038, m0040, m0041);
  const m = walkMasks();
  const game = Array.from({ length: GH }, (_, y) => Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join(''));
  const changed = game.map((r, y) => [y, r] as [number, string]).filter(([y, r]) => r !== live[y]);
  const drunks = NODES.filter((n) => n.crimeId === 'pick_drunk');
  const gone = ['drunk_3', 'drunk_4', 'drunk_5'];
  const ids = gone.map((g) => `'${g}'`).join(', ');
  const sql = `begin;

${drunks.map((n) => `update public.spots set x = ${n.x}, y = ${n.y} where id = '${n.id}';`).join('\n')}
delete from public.spot_state where spot_id in (${ids});
update public.players set job_crime = null, job_spot = null, job_started_at = null,
    job_ends_at = null where job_spot in (${ids});
delete from public.spots where id in (${ids});
${changed.map(([y, r]) => `update game.walk_map set masks = '${r}' where y = ${y};`).join('\n')}

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> '${md5(game.join(''))}' then
    raise exception '0043: walk map differs from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', id, x, y), ';' order by id)) from public.spots
    where crime_id = 'pick_drunk') <> '${md5(drunks.map((n) => [n.id, n.x, n.y].join(',')).join(';'))}' then
    raise exception '0043: drunks differ from the game';
  end if;
end $$;

select 'ok' as drunks;

commit;
`
    .split('\n')
    .map(shortLines)
    .join('\n');
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

if (!process.env.VITEST) {
  const fs = require('node:fs');
  const read = (f: string) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  process.stdout.write(drunksSql(read('0038_aluminium.sql'), read('0040_beach.sql'), read('0041_bar_and_yard.sql')));
}
