// Prints supabase/migrations/0045_melee_reach.sql (v0.62): melee enemies only hit you when they're next to you.
// Run: npx vite-node scripts/reach-sql.ts > supabase/migrations/0045_melee_reach.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
//
// What it does (the SQL has no comments: Supabase's SQL editor mangles them, see 0041):
//  - game.enemy_adjacent(ex, ey, px, py): is the enemy's tile right next to yours (8 directions) with nothing in
//    between (a fence, a wall, a corner)? The walk map's own step: the same as `adjacent` in sight.ts.
//  - public.attack (patched): a melee attack needs you right next to it. It used to allow 2 tiles, measured on a
//    roaming enemy's exact spot, so a thug could stand a tile off (or across a fence) and fight you. Otherwise
//    'too_far' (the game walks you closer).
//  - public.fight_step (patched): an enemy only swings when, at that moment, it stands next to you (it used to swing
//    on its timer wherever it was). Not next to you: it waits a swing and tries again.
//  - public.jump_me (patched): a biker jumping you takes a free tile right next to you (see below).
//  - A guard: the patches landed and the check agrees with the game on a few spots (open ground, two apart, a fence).
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { YARD } from '../src/street/map';
import { adjacent, walkMasks } from '../src/street/sight';

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
      raise exception 'anchor % of % not found once', i,
        '${sig}';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;`;
}

type Sample = { e: [number, number]; p: [number, number]; ok: boolean };

/** Spots the guard checks: next to each other in the Yard (yes), two apart (no), and into the Yard's fence (no). */
export function reachSamples(): Sample[] {
  const m = walkMasks();
  let open: [number, number] | null = null;
  for (let y = YARD.y0; y < YARD.y1 && !open; y++)
    for (let x = YARD.x0; x < YARD.x1 && !open; x++) if (adjacent(m, [x, y], [x + 1, y + 1])) open = [x, y];
  let fence: [number, number] | null = null;
  for (let x = YARD.x0; x <= YARD.x1 && !fence; x++) if (!adjacent(m, [x, YARD.y1 - 1], [x, YARD.y1])) fence = [x, YARD.y1 - 1];
  if (!open || !fence) throw new Error('no reach samples');
  const [x, y] = open;
  return [
    { e: [x, y], p: [x + 1, y + 1], ok: true },
    { e: [x, y], p: [x + 2, y], ok: false },
    { e: fence, p: [fence[0], fence[1] + 1], ok: false },
  ];
}

export function reachSql(): string {
  const samples = reachSamples();
  const adj = `create or replace function game.enemy_adjacent(ex integer, ey integer, px integer,
    py integer)
 returns boolean
 language sql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
  select ex >= 0 and greatest(abs(px - ex), abs(py - ey)) = 1 and coalesce((
    select (('x' || substr(r.masks, ex * 2 + 1, 2))::bit(8)::int
      & (1 << game.walk_bit(px - ex, py - ey))) <> 0
    from game.walk_map r where r.y = ey), false)
$$;
revoke execute on function game.enemy_adjacent(integer, integer, integer, integer)
  from public, anon, authenticated;`;

  const attack = patch('public.attack(text, integer, integer)', [
    [
      "  if dist > reach then return game.respond(p.id, false, 'too_far', rep, logs); end if;",
      `  if dist > reach then return game.respond(p.id, false, 'too_far', rep, logs); end if;
  if not ranged and not game.enemy_adjacent(floor(ex)::int, floor(ez)::int, p_x, p_y) then
    return game.respond(p.id, false, 'too_far', rep, logs);
  end if;`,
    ],
  ]);

  // (The enemy's turn is the loop's else branch: e.next_swing < p.fight_next. Checked at the top of the loop, so the
  // anchor is a short line.)
  const fight = patch('public.fight_step()', [
    [
      '    exit when t > now();',
      `    exit when t > now();
    if e.next_swing < p.fight_next then
      select * into at_x, at_y from game.enemy_tile(e, t);
      if not game.enemy_adjacent(at_x, at_y, p.pos_x, p.pos_y) then
        e.next_swing := t + make_interval(secs => k.speed * 0.5);
        continue;
      end if;
    end if;`,
    ],
  ]);

  // A biker jumping you (the Biker Club): he took the tile next to you towards him, pushed back inside the club's
  // walls, which at the edge could be your own tile or a blocked one (the pool table): with the check above he'd
  // never swing. Now: the free tile next to you nearest his side, from which he can step to you. None: no jump.
  const jump = patch('public.jump_me(integer, integer)', [
    [
      '  e.fight_x := least(greatest(p_x + dx, 24), 33);',
      `  select c.x, c.y into e.fight_x, e.fight_y
  from (select p_x + a as x, p_y + b as y, abs(a - dx) + abs(b - dy) as off
    from generate_series(-1, 1) a, generate_series(-1, 1) b where a <> 0 or b <> 0) c
  where c.x between 24 and 33 and c.y between 7 and 11
    and game.enemy_adjacent(c.x, c.y, p_x, p_y)
  order by c.off, c.y, c.x limit 1;
  if e.fight_x is null then return game.respond(p.id, false, 'no_one', rep, logs); end if;`,
    ],
    ['  e.fight_y := least(greatest(p_y + dy, 7), 11);', ''],
    [
      '    next_swing = e.next_swing, fight_seen = e.fight_seen where id = e.id;',
      `    next_swing = e.next_swing, fight_seen = e.fight_seen, arrive_at = null,
    route = '[]'::jsonb where id = e.id;`,
    ],
  ]);

  const guard = `do $$
begin
  if position('enemy_adjacent' in pg_get_functiondef(
      'public.attack(text, integer, integer)'::regprocedure)) = 0
    or position('enemy_adjacent' in pg_get_functiondef('public.fight_step()'::regprocedure)) = 0
    or position('enemy_adjacent' in pg_get_functiondef(
      'public.jump_me(integer, integer)'::regprocedure)) = 0
    or not (${samples.map((s) => `game.enemy_adjacent(${s.e[0]}, ${s.e[1]}, ${s.p[0]}, ${s.p[1]}) = ${s.ok}`).join('\n      and ')}) then
    raise exception '0045: a patch did not land or the reach differs from the game';
  end if;
end $$;`;

  const sql = `begin;

${adj}

${attack}

${fight}

${jump}

${guard}

select 'ok' as melee_reach;

commit;
`;
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

if (!process.env.VITEST) process.stdout.write(reachSql());
