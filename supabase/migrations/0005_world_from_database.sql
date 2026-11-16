-- Underworld: other players' names, looks and routes come from the database (docs/design.md §11).
-- Before, each phone told the others who it was (Realtime Presence), so a player could pretend to be someone
-- else. Now:
--  - your route goes through public.walk(), which knows who you are (auth.uid()) and checks the route;
--  - other phones hear about it through Realtime "postgres changes" on public.walks (the row says whose it is);
--  - who's online, with their name and look, comes from public.game_state() ("world": seen in the last 30s).

-- The old Presence channel is no longer used.
drop policy if exists world_select_authenticated on realtime.messages;
drop policy if exists world_insert_authenticated on realtime.messages;

-- When the server last heard from you (any game call): online = within the last 30 seconds.
alter table public.players add column last_seen timestamptz;
create index players_last_seen on public.players (last_seen desc);

-- Each player's latest walk: where it started, the tiles of the route, and when (server time).
create table public.walks (
  player_id uuid primary key references public.players (id) on delete cascade,
  from_x int not null,
  from_y int not null,
  path jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now()
);
alter table public.walks enable row level security;
-- Everyone signed in may read routes (to draw the other players). Nobody writes directly: only public.walk().
create policy walks_select_authenticated on public.walks for select to authenticated using (true);
alter publication supabase_realtime add table public.walks;

-- Who's on the island right now (heard from in the last 30s), except you: name and look from the database.
create or replace function game.world(uid uuid) returns jsonb
language sql stable set search_path = pg_catalog, public, game as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'look', p.look,
    'from', jsonb_build_array(coalesce(w.from_x, p.pos_x, 18), coalesce(w.from_y, p.pos_y, 22)),
    'path', coalesce(w.path, '[]'::jsonb),
    'at', game.ms(coalesce(w.started_at, p.last_seen))
  )), '[]'::jsonb)
  from public.players p
  left join public.walks w on w.player_id = p.id
  where p.id <> uid and p.last_seen > now() - interval '30 seconds'
$$;

-- Same answer as before (0003), plus: remember that we heard from you.
create or replace function game.respond(uid uuid, ok boolean, reason text, rep jsonb, logs jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, public, game as $$
declare
  p public.players;
  v_grave jsonb;
  v_spots jsonb;
begin
  update public.players set last_seen = now() where id = uid;
  select * into p from public.players where id = uid;
  select jsonb_build_object('x', g.x, 'y', g.y, 'cash', g.cash, 'items', g.items, 'diedAt', game.ms(g.died_at), 'expiresAt', game.ms(g.expires_at))
    into v_grave from public.graves g where g.player_id = uid and g.expires_at > now();
  select coalesce(jsonb_object_agg(spot_id, game.ms(empty_until)), '{}'::jsonb) into v_spots from public.spot_state where empty_until > now();
  return jsonb_build_object(
    'ok', ok, 'reason', reason, 'server_now', game.ms(now()),
    'report', coalesce(rep, game.empty_report()), 'log', coalesce(logs, '[]'::jsonb),
    'grave', v_grave, 'spots', v_spots,
    'player', jsonb_build_object(
      'name', p.name, 'look', p.look, 'createdAt', game.ms(p.created_at),
      'cash', p.cash, 'hp', p.hp, 'hpAt', game.ms(p.hp_at),
      'skills', jsonb_build_object('street', jsonb_build_object('xp', p.street_xp), 'melee', jsonb_build_object('xp', p.melee_xp),
        'defense', jsonb_build_object('xp', p.defense_xp), 'gunfire', jsonb_build_object('xp', p.gunfire_xp), 'health', jsonb_build_object('xp', p.health_xp)),
      'job', case when p.job_crime is null then null else jsonb_build_object('crimeId', p.job_crime, 'spotId', p.job_spot,
        'startedAt', game.ms(p.job_started_at), 'endsAt', game.ms(p.job_ends_at), 'pos', jsonb_build_array(p.job_pos_x, p.job_pos_y)) end,
      'stunnedUntil', game.ms(p.stunned_until), 'eatingUntil', game.ms(p.eating_until),
      'caught', case when p.caught_crime is null then null else jsonb_build_object('crimeId', p.caught_crime, 'at', game.ms(p.caught_at)) end,
      'pos', case when p.pos_x is null then null else jsonb_build_array(p.pos_x, p.pos_y) end,
      'inventory', p.inventory, 'stats', p.stats
    )
  );
end $$;
revoke execute on function game.respond(uuid, boolean, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function game.world(uuid) from public, anon, authenticated;

-- Same as before (0003), plus "world": who else is here (the app calls this every 10 seconds).
create or replace function public.game_state()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character', 'server_now', game.ms(now())); end if;
  select * into r from game.settle(p, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
  delete from public.graves where player_id = p.id and expires_at <= now();
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs) || jsonb_build_object('world', game.world(p.id));
end $$;

-- Share your walking route: from tile (p_from_x, p_from_y) through the tiles in p_path ([[x, y], ...]).
-- Checked: you could have walked to the start by now, at most 80 steps, each step to a neighbouring tile,
-- all on the map. It's only for drawing you on other phones; crimes still check where you stand themselves.
create or replace function public.walk(p_from_x int, p_from_y int, p_path jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
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
    if sx not between 0 and 43 or sy not between 0 and 36 or greatest(abs(sx - px), abs(sy - py)) <> 1 then
      return jsonb_build_object('ok', false, 'reason', 'bad_route');
    end if;
    px := sx;
    py := sy;
  end loop;
  insert into public.walks (player_id, from_x, from_y, path, started_at)
  values (p.id, p_from_x, p_from_y, p_path, now())
  on conflict (player_id) do update set from_x = excluded.from_x, from_y = excluded.from_y, path = excluded.path, started_at = excluded.started_at;
  update public.players set last_seen = now() where id = p.id;
  return jsonb_build_object('ok', true, 'server_now', game.ms(now()));
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok', false, 'reason', 'bad_route');
end $$;
revoke execute on function public.walk(int, int, jsonb) from public, anon;
grant execute on function public.walk(int, int, jsonb) to authenticated;
