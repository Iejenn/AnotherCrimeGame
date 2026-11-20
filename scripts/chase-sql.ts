// Prints supabase/migrations/0042_simple_chase.sql (v0.60): enemies chase the simple way (old-school RuneScape).
// Run: npx vite-node scripts/chase-sql.ts > supabase/migrations/0042_simple_chase.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
//
// What it does (the SQL itself has no comments: Supabase's SQL editor mangled them, see 0041):
//  - game.enemy_chase: every step an enemy heads straight for you (diagonal, else sideways, else up-or-down); if none
//    of those steps works it's stuck there. Returns {route, reached}. The same steps as enemyChase in sight.ts.
//  - public.attack (patched in place): a thrown-at enemy chases with it. Stuck: it walks to where it gets stuck and
//    never swings (its next swing is an hour off), and you get "The thug cannot get to you." Attack it again (a tap)
//    and a stuck one chases again from where it stands, so walking round to it to fight works.
//  - public.fight_step (patched): no melee hits on a stuck enemy (it cannot reach you, you cannot reach it).
//  - A guard at the end: the chase is checked against the game on a few spots; any difference undoes everything.
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { PLAZA, SEWER } from '../src/street/map';
import { enemyChase, walkMasks } from '../src/street/sight';

/** A DO block that edits a function in place: each anchor (one line) must be found exactly once, or nothing runs. */
function patch(sig: string, pairs: [string, string][]): string {
  return `do $do$
declare
  def text := pg_get_functiondef('${sig}'::regprocedure);
  a text[] := array[
${pairs.map(([x]) => `    $a$${x}$a$`).join(',\n')}];
  b text[] := array[
${pairs.map(([, y]) => `    $b$${y}$b$`).join(',\n')}];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i, '${sig}';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;`;
}

/** Spots the guard checks: open ground on the Plaza (reached), across the sewage channel (stuck). */
export function chaseSamples() {
  const m = walkMasks();
  const cases: [[number, number], [number, number]][] = [
    [[PLAZA.x0 + 1, PLAZA.y0 + 1], [PLAZA.x0 + 1, PLAZA.y0 + 6]],
    [[PLAZA.x0 + 2, PLAZA.y0 + 1], [PLAZA.x0 + 7, PLAZA.y0 + 4]],
    [[SEWER.x0, SEWER.y0 + 2], [SEWER.x0, SEWER.y0 + 8]],
    [[SEWER.x0 + 5, SEWER.y0 + 1], [SEWER.x0 + 9, SEWER.y0 + 9]],
  ];
  return cases.map(([f, t]) => ({ f, t, ...enemyChase(m, f, t) }));
}

export function chaseSql(): string {
  const samples = chaseSamples();
  const chase = `create or replace function game.enemy_chase(fx integer, fy integer, tx integer,
    ty integer)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  x int := fx;
  y int := fy;
  y0 int := least(fy, ty);
  rws text[];
  m int;
  dx int;
  dy int;
  sx int;
  sy int;
  k int;
  ok boolean;
  route jsonb := '[]'::jsonb;
begin
  rws := array(select r.masks from game.walk_map r
    where r.y between least(fy, ty) and greatest(fy, ty) order by r.y);
  loop
    m := ('x' || substr(rws[y - y0 + 1], x * 2 + 1, 2))::bit(8)::int;
    if greatest(abs(x - tx), abs(y - ty)) = 1
      and (m & (1 << game.walk_bit(tx - x, ty - y))) <> 0 then
      return jsonb_build_object('route', route, 'reached', true);
    end if;
    dx := sign(tx - x)::int;
    dy := sign(ty - y)::int;
    ok := false;
    for k in 1 .. 3 loop
      if k = 1 then
        continue when dx = 0 or dy = 0;
        sx := dx; sy := dy;
      elsif k = 2 then
        continue when dx = 0;
        sx := dx; sy := 0;
      else
        continue when dy = 0;
        sx := 0; sy := dy;
      end if;
      continue when x + sx = tx and y + sy = ty;
      if (m & (1 << game.walk_bit(sx, sy))) <> 0 then
        ok := true;
        exit;
      end if;
    end loop;
    if not ok then
      return jsonb_build_object('route', route, 'reached', false);
    end if;
    x := x + sx;
    y := y + sy;
    route := route || jsonb_build_array(jsonb_build_array(x, y));
  end loop;
end $$;
revoke execute on function game.enemy_chase(integer, integer, integer, integer)
  from public, anon, authenticated;`;

  const attack = patch('public.attack(text, integer, integer)', [
    ['  v_last jsonb;', `  v_last jsonb;
  v_chase jsonb;
  v_fresh boolean := false;
  v_tile record;`],
    ['      v_route := game.enemy_route(e.from_x, e.from_y, p_x, p_y);', `      v_chase := game.enemy_chase(e.from_x, e.from_y, p_x, p_y);
      v_route := v_chase -> 'route';`],
    ['    e.next_swing := e.arrive_at + make_interval(secs => k.speed * 0.5);', `    e.next_swing := case when ranged and not (v_chase ->> 'reached')::boolean
      then now() + interval '1 hour'
      else e.arrive_at + make_interval(secs => k.speed * 0.5) end;`],
    ["    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));", `    v_fresh := true;
    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));
    if ranged and not (v_chase ->> 'reached')::boolean then
      logs := logs || to_jsonb(format('The %s cannot get to you.', lower(k.name)));
    end if;`],
    ['  e.fight_seen := now();', `  if not v_fresh and e.fighter = p.id and e.next_swing > now() + interval '30 minutes' then
    select * into v_tile from game.enemy_tile(e, now());
    v_chase := game.enemy_chase(v_tile.x, v_tile.y, p_x, p_y);
    e.from_x := v_tile.x;
    e.from_y := v_tile.y;
    e.route := v_chase -> 'route';
    e.fight_x := v_tile.x;
    e.fight_y := v_tile.y;
    if jsonb_array_length(e.route) > 0 then
      v_last := e.route -> -1;
      e.fight_x := (v_last ->> 0)::int;
      e.fight_y := (v_last ->> 1)::int;
    end if;
    e.arrive_at := now() + make_interval(secs => game.route_len(e.from_x, e.from_y, e.route) / 2.5);
    if (v_chase ->> 'reached')::boolean then
      e.next_swing := e.arrive_at + make_interval(secs => k.speed * 0.5);
    end if;
  end if;
  e.fight_seen := now();`],
  ]);

  const fight = patch('public.fight_step()', [
    ['      if not ranged and e.arrive_at is not null and t < e.arrive_at then', `      if not ranged and ((e.arrive_at is not null and t < e.arrive_at)
        or e.next_swing > now() + interval '30 minutes') then`],
    ['        p.fight_next := e.arrive_at;', `        p.fight_next := case when e.next_swing > now() + interval '30 minutes'
          then now() + interval '1 second' else e.arrive_at end;`],
  ]);

  const guard = `do $$
begin
  if not (${samples
    .map((s) => `game.enemy_chase(${s.f[0]}, ${s.f[1]}, ${s.t[0]}, ${s.t[1]})
    = '${JSON.stringify({ reached: s.reached, route: s.route })}'::jsonb`)
    .join('\n    and ')}) then
    raise exception '0042: the chase differs from the game';
  end if;
end $$;`;

  const sql = `begin;

${chase}

${attack}

${fight}

${guard}

select 'ok' as chase;

commit;
`;
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

if (!process.env.VITEST) process.stdout.write(chaseSql());
