// Prints supabase/migrations/0043_city_scale.sql (v0.60): the bar's 3 drunks, and the city's buildings at a person's
// scale (no buildings narrower than 3 tiles any more, so the alleys inside blocks change).
//  - drunk_0..2 move to every other stool; drunk_3..5 are deleted (their emptied-spot rows too, and anyone's attempt
//    on them stops), so nobody can pick a pocket the game no longer shows.
//  - The enemies' walk map: only the stretches of each row that changed ("x:masks", game.patch_row writes them in).
//    About 5 KB, though most city rows change (whole rows would be 23 KB).
//  - Line of sight: game.shot_walls rebuilt from the game's buildings.
//  - Anyone (anything on the ground, any grave) inside a building now is moved to the Plaza.
//  - A guard undoes everything if the walk map, the walls or the drunks aren't exactly the game's.
// No comments in the SQL itself (Supabase's SQL editor mangles them, see 0041). Lines under 100 characters.
// Run: npx vite-node scripts/city-sql.ts > supabase/migrations/0043_city_scale.sql
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { GH, H, NODES, SPAWN, W, gi } from '../src/street/map';
import { SHOT_WALLS, walkMasks } from '../src/street/sight';
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

/** The stretches where row `to` differs from row `from`: "x:masks" (two hex digits a tile), comma separated. Two
 *  stretches with one unchanged tile between them are joined (shorter than writing a new x). */
export function rowPatch(from: string, to: string): string {
  const same = (x: number) => from.slice(x * 2, x * 2 + 2) === to.slice(x * 2, x * 2 + 2);
  const out: string[] = [];
  const n = to.length / 2;
  for (let x = 0; x < n; ) {
    if (same(x)) {
      x++;
      continue;
    }
    let e = x;
    while (e < n && (!same(e) || (e + 1 < n && !same(e + 1)))) e++;
    out.push(`${x}:${to.slice(x * 2, e * 2)}`);
    x = e;
  }
  return out.join(',');
}
/** A row with a patch written in (the same as game.patch_row). */
export const applyPatch = (row: string, patch: string) =>
  patch.split(',').reduce((r, p) => {
    const [x, h] = p.split(':');
    return r.slice(0, Number(x) * 2) + h + r.slice(Number(x) * 2 + h.length);
  }, row);

/** The game's walk map rows. */
export const gameRows = () => {
  const m = walkMasks();
  return Array.from({ length: GH }, (_, y) => Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join(''));
};

export function citySql(m0038: string, m0040: string, m0041: string): string {
  const live = liveAfter0041(m0038, m0040, m0041);
  const game = gameRows();
  const changed = game.map((r, y) => [y, r] as [number, string]).filter(([y, r]) => r !== live[y]);
  const drunks = NODES.filter((n) => n.crimeId === 'pick_drunk');
  const ids = ['drunk_3', 'drunk_4', 'drunk_5'].map((g) => `'${g}'`).join(', ');
  const walls = [...SHOT_WALLS].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0 || a.x1 - b.x1 || a.y1 - b.y1);
  const wallKey = walls.map((r) => [r.x0, r.y0, r.x1, r.y1].join(',')).join(';');
  /** A packed row as SQL: pieces of at most 70 characters joined with ||. */
  const packed = (s: string) => (s.match(/.{1,70}/g) as string[]).map((p) => `'${p}'`).join('\n    || ');
  const inside = (t: string, xc: string, yc: string) => `update ${t} t set ${xc} = ${SPAWN[0]}, ${yc} = ${SPAWN[1]}
  from game.walk_map w where w.y = t.${yc} and t.${yc} between 0 and ${H - 1}
  and t.${xc} between 0 and ${W - 1} and substr(w.masks, t.${xc} * 2 + 1, 2) = '00';`;
  const sql = `begin;

create or replace function game.patch_row(m text, spec text)
 returns text
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $$
declare
  part text;
  x int;
  h text;
begin
  foreach part in array string_to_array(spec, ',') loop
    x := split_part(part, ':', 1)::int;
    h := split_part(part, ':', 2);
    m := overlay(m placing h from x * 2 + 1 for length(h));
  end loop;
  return m;
end $$;
revoke execute on function game.patch_row(text, text) from public, anon, authenticated;

${drunks.map((n) => `update public.spots set x = ${n.x}, y = ${n.y} where id = '${n.id}';`).join('\n')}
delete from public.spot_state where spot_id in (${ids});
update public.players set job_crime = null, job_spot = null, job_started_at = null,
    job_ends_at = null where job_spot in (${ids});
delete from public.spots where id in (${ids});

update game.walk_map w set masks = game.patch_row(w.masks, v.p)
from (values
${changed.map(([y, r]) => `(${y}, ${packed(rowPatch(live[y], r))})`).join(',\n')}
) v(y, p) where w.y = v.y;

delete from game.shot_walls;
insert into game.shot_walls (x0, y0, x1, y1) values
${walls.map((r) => `(${r.x0},${r.y0},${r.x1},${r.y1})`).join(',')};

${inside('public.players', 'pos_x', 'pos_y')}
${inside('public.ground_items', 'x', 'y')}
${inside('public.graves', 'x', 'y')}

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> '${md5(game.join(''))}' then
    raise exception '0043: walk map differs from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', x0, y0, x1, y1), ';' order by x0, y0, x1, y1))
    from game.shot_walls) <> '${md5(wallKey)}' then
    raise exception '0043: walls differ from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', id, x, y), ';' order by id)) from public.spots
    where crime_id = 'pick_drunk') <> '${md5(drunks.map((n) => [n.id, n.x, n.y].join(',')).join(';'))}' then
    raise exception '0043: drunks differ from the game';
  end if;
end $$;

select 'ok' as city;

commit;
`
    .split('\n')
    .map(shortLines)
    .join('\n');
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

// (Only when run itself: v0.62's pipe-sql.ts imports its helpers.)
if (!process.env.VITEST && ((process as unknown as { argv: string[] }).argv[1] ?? '').endsWith('city-sql.ts')) {
  const fs = require('node:fs');
  const read = (f: string) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  process.stdout.write(citySql(read('0038_aluminium.sql'), read('0040_beach.sql'), read('0041_bar_and_yard.sql')));
}
