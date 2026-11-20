// Prints supabase/migrations/0044_running.sql (v0.60): running, stamina and the Dexterity skill.
// Run: npx vite-node scripts/running-sql.ts > supabase/migrations/0044_running.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
//
// What it does (the SQL has no comments: Supabase's SQL editor mangles them, see 0041):
//  - players.dexterity_xp, players.stamina (0-100, as of pos_at); walks.run (others see you run).
//  - game.move_check(p, x, y): could you get from your saved position to (x, y) since then? Walking (2.5 tiles/s,
//    with room for the network) is always fine; anything faster must have been run, which costs stamina (src/game/
//    stamina.ts: a full bar runs 60 tiles at Dexterity 1, +1% a level), and stamina comes back while walking (full in
//    6 minutes) or twice as fast standing still. Faster than running: not possible (a teleport, or a cheat).
//  - game.can_reach (every action's speed check) uses it: no stamina, no running. (It used to allow 5 tiles/s, twice
//    walking speed, for anyone.)
//  - A trigger on players does the sums whenever your position (or its time) changes, whichever action moved you:
//    your stamina, and Dexterity XP (1 for every 75 tiles). Teleports (climbing, waking up) count nothing.
//  - public.walk_to: walk() with whether you run the route (the others animate it at that pace); game.world sends it.
//  - Dexterity in game.respond (with your stamina), the highscores and the total.
//  - A guard undoes everything if a patch didn't land or the sums aren't the game's.
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { REGEN_STAND_S, REGEN_WALK_S, RUN_MULT, RUN_TILES, TILES_PER_XP } from '../src/game/stamina';
import { WALK_PACE } from '../src/street/character';

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

export function runningSql(): string {
  const vw = WALK_PACE * 1.2;
  const vr = WALK_PACE * RUN_MULT * 1.1;
  const sql = `begin;

alter table public.players add column if not exists dexterity_xp numeric not null default 0;
alter table public.players add column if not exists stamina real not null default 100;
alter table public.walks add column if not exists run boolean not null default false;

create or replace function game.move_check(p public.players, x integer, y integer,
    out ok boolean, out tiles double precision, out stamina double precision)
 returns record
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game', 'public'
as $$
declare
  e double precision := greatest(0, extract(epoch from (now() - coalesce(p.pos_at, p.created_at))));
  d double precision := sqrt(((x - coalesce(p.pos_x, 79))::double precision) ^ 2
    + ((y - coalesce(p.pos_y, 60))::double precision) ^ 2);
  dd double precision := greatest(0, d - 3);
  vw constant double precision := ${vw};
  vr constant double precision := ${vr};
  lvl int := game.level_from_xp(coalesce(p.dexterity_xp, 0)::numeric);
  drain double precision := 100.0 / (${RUN_TILES} * (1 + (lvl - 1) / 99.0));
  s double precision := coalesce(p.stamina, 100);
  r double precision;
  walkt double precision;
  stand double precision;
begin
  tiles := d;
  r := greatest(0, (dd - vw * e) / (1 - vw / vr));
  if r > dd + 1e-9 then
    ok := false;
    stamina := s;
    return;
  end if;
  walkt := (dd - r) / vw;
  stand := greatest(0, e - walkt - r / vr);
  s := least(100, s + walkt * 100 / ${REGEN_WALK_S} + stand * 100 / ${REGEN_STAND_S}) - r * drain;
  ok := s >= -5;
  stamina := greatest(0, s);
end $$;
revoke execute on function game.move_check(public.players, integer, integer)
  from public, anon, authenticated;

create or replace function game.can_reach(p players, x integer, y integer)
 returns boolean
 language sql
 stable
 set search_path to 'pg_catalog'
as $$
  select game.on_map(x, y) and (game.move_check(p, x, y)).ok
$$;

create or replace function game.players_move()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog', 'game', 'public'
as $$
declare
  m record;
begin
  if new.pos_x is null or new.pos_y is null then
    return new;
  end if;
  if new.pos_x is not distinct from old.pos_x and new.pos_y is not distinct from old.pos_y
    and new.pos_at is not distinct from old.pos_at then
    return new;
  end if;
  select * into m from game.move_check(old, new.pos_x, new.pos_y);
  if m.ok then
    new.stamina := m.stamina;
    new.dexterity_xp := coalesce(old.dexterity_xp, 0) + m.tiles / ${TILES_PER_XP}.0;
  end if;
  return new;
end $$;
revoke execute on function game.players_move() from public, anon, authenticated;
drop trigger if exists players_move on public.players;
create trigger players_move before update of pos_x, pos_y, pos_at on public.players
  for each row execute function game.players_move();

create or replace function public.walk_to(p_from_x integer, p_from_y integer, p_path jsonb,
    p_run boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $$
declare
  p public.players := game.me();
  px int := p_from_x;
  py int := p_from_y;
  step jsonb;
  sx int;
  sy int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  if jsonb_typeof(p_path) <> 'array' or jsonb_array_length(p_path) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad_route');
  end if;
  if not game.can_reach(p, p_from_x, p_from_y) then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  for step in select value from jsonb_array_elements(p_path) loop
    if jsonb_typeof(step) <> 'array' or jsonb_array_length(step) <> 2 then
      return jsonb_build_object('ok', false, 'reason', 'bad_route');
    end if;
    sx := (step ->> 0)::int;
    sy := (step ->> 1)::int;
    if not game.on_map(sx, sy) or greatest(abs(sx - px), abs(sy - py)) <> 1
      or (game.nest_locked(sx, sy) and not coalesce(p.unlocked ? 'rat_nest', false)) then
      return jsonb_build_object('ok', false, 'reason', 'bad_route');
    end if;
    px := sx;
    py := sy;
  end loop;
  insert into public.walks (player_id, from_x, from_y, path, started_at, run)
  values (p.id, p_from_x, p_from_y, p_path, now(), coalesce(p_run, false))
  on conflict (player_id) do update set from_x = excluded.from_x, from_y = excluded.from_y,
    path = excluded.path, started_at = excluded.started_at, run = excluded.run;
  update public.players set last_seen = now() where id = p.id;
  return jsonb_build_object('ok', true, 'server_now', game.ms(now()));
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'reason', 'bad_route');
end $$;
revoke execute on function public.walk_to(integer, integer, jsonb, boolean) from public, anon;
grant execute on function public.walk_to(integer, integer, jsonb, boolean) to authenticated;

${patch('game.world(uuid)', [
  ["    'at', game.ms(coalesce(w.started_at, p.last_seen))", `    'at', game.ms(coalesce(w.started_at, p.last_seen)), 'run', coalesce(w.run, false)`],
])}

${patch('game.respond(uuid, boolean, text, jsonb, jsonb)', [
  ["'tinkering', jsonb_build_object('xp', p.tinkering_xp)),", `'tinkering', jsonb_build_object('xp', p.tinkering_xp),
        'dexterity', jsonb_build_object('xp', p.dexterity_xp, 'stamina', p.stamina,
        'staminaAt', game.ms(coalesce(p.pos_at, now())))),`],
])}

${patch('public.get_highscores(text, integer)', [
  ["when 'tinkering' then 'tinkering_xp' end;", `when 'tinkering' then 'tinkering_xp'
    when 'dexterity' then 'dexterity_xp' end;`],
])}

${patch('game.highscores_total(integer)', [
  ['+ game.level_from_xp(tinkering_xp) as lvl,', `+ game.level_from_xp(tinkering_xp)
    + game.level_from_xp(dexterity_xp) as lvl,`],
  ['+ scrapping_xp + tinkering_xp) as xp', `+ scrapping_xp + tinkering_xp
    + dexterity_xp) as xp`],
])}

do $$
begin
  if position('dexterity' in pg_get_functiondef(
      'game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure)) = 0
    or position('w.run' in pg_get_functiondef('game.world(uuid)'::regprocedure)) = 0
    or position('dexterity_xp' in pg_get_functiondef(
      'game.highscores_total(integer)'::regprocedure)) = 0
    or position('move_check' in pg_get_functiondef(
      'game.can_reach(players, integer, integer)'::regprocedure)) = 0 then
    raise exception '0044: a patch did not land';
  end if;
end $$;

select 'ok' as running;

commit;
`;
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

if (!process.env.VITEST) process.stdout.write(runningSql());
