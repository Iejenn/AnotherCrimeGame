-- Underworld: online play, run by the server (docs/design.md §11).
-- The same rules as src/game/engine.ts and src/game/watchers.ts, written in SQL, so the server decides every
-- outcome: odds, rewards, who saw you, getting hit, dying, graves, eating, selling. The app only sends
-- what you do (tap this spot, standing here; eat this) and shows what the server answers.
--
-- Helpers live in a private schema `game` that the app can't call. The app calls the public functions at the
-- bottom (SECURITY DEFINER, signed-in players only). Every answer has the same shape:
--   { ok, reason?, player, grave, spots, report, log, server_now }

create schema if not exists game;
revoke all on schema game from public, anon, authenticated;

-- ---------- spots: every place you can do a crime (generated from the map: scripts/spots-sql.ts) ----------
create table public.spots (
  id text primary key,
  crime_id text not null references public.crimes (id),
  x int not null,
  y int not null,
  -- people who stroll around (tourists) can be anywhere in this area
  area_x0 int, area_y0 int, area_x1 int, area_y1 int
);
alter table public.spots enable row level security;
create policy spots_select_all on public.spots for select to anon, authenticated using (true);

insert into public.spots (id, crime_id, x, y, area_x0, area_y0, area_x1, area_y1) values
  ('tourist_0', 'pick_tourist', 18, 25, 16, 23, 27, 34),
  ('tourist_1', 'pick_tourist', 25, 25, 16, 23, 27, 34),
  ('tourist_2', 'pick_tourist', 20, 32, 16, 23, 27, 34),
  ('bag_0', 'gym_bags', 10, 23, null, null, null, null),
  ('bag_1', 'gym_bags', 12, 23, null, null, null, null),
  ('candy_0', 'candy_store', 23, 16, null, null, null, null),
  ('candy_1', 'candy_store', 24, 16, null, null, null, null),
  ('candy_2', 'candy_store', 26, 16, null, null, null, null),
  ('candy_3', 'candy_store', 27, 16, null, null, null, null),
  ('drunk_0', 'pick_drunk', 9, 19, null, null, null, null),
  ('drunk_1', 'pick_drunk', 10, 19, null, null, null, null),
  ('drunk_2', 'pick_drunk', 11, 19, null, null, null, null),
  ('meter_0', 'parking_meter', 37, 23, null, null, null, null),
  ('meter_1', 'parking_meter', 39, 23, null, null, null, null),
  ('meter_2', 'parking_meter', 41, 23, null, null, null, null),
  ('meter_3', 'parking_meter', 38, 27, null, null, null, null),
  ('meter_4', 'parking_meter', 40, 27, null, null, null, null),
  ('car_0', 'steal_car', 38, 24, null, null, null, null),
  ('car_1', 'steal_car', 40, 24, null, null, null, null),
  ('car_2', 'steal_car', 39, 26, null, null, null, null),
  ('car_3', 'steal_car', 41, 26, null, null, null, null),
  ('gas_0', 'gas_station', 37, 16, null, null, null, null),
  ('gas_1', 'gas_station', 38, 16, null, null, null, null),
  ('gas_2', 'gas_station', 40, 16, null, null, null, null),
  ('gas_3', 'gas_station', 41, 16, null, null, null, null);

-- When you were last seen standing somewhere (for the walking-speed check).
alter table public.players add column pos_at timestamptz;

-- Highscores read the XP columns: one index per skill.
create index players_street_xp on public.players (street_xp desc);
create index players_melee_xp on public.players (melee_xp desc);
create index players_defense_xp on public.players (defense_xp desc);
create index players_gunfire_xp on public.players (gunfire_xp desc);
create index players_health_xp on public.players (health_xp desc);

-- ================= small helpers =================

-- Milliseconds since 1970 (like Date.now() in the app).
create or replace function game.ms(t timestamptz) returns bigint
language sql immutable set search_path = pg_catalog as $$ select floor(extract(epoch from t) * 1000)::bigint $$;
create or replace function game.ts(ms bigint) returns timestamptz
language sql immutable set search_path = pg_catalog as $$ select to_timestamp(ms / 1000.0) $$;

-- Total XP to BE level L (src/game/xp.ts), cap 30.
create or replace function game.level_from_xp(xp bigint) returns int
language sql immutable set search_path = pg_catalog as $$
  select coalesce(max(l), 1)
  from unnest(array[0, 0, 29, 62, 99, 141, 188, 242, 303, 372, 449, 537, 636, 748, 874, 1017, 1178, 1360, 1566, 1799,
                    2062, 2359, 2695, 3074, 3503, 3987, 4534, 5152, 5851, 6641, 7533]) with ordinality as t(need, i)
  cross join lateral (select (i - 1)::int as l) x
  where l >= 1 and xp >= need
$$;

-- Max health: 10, +2 per Health level above 1.
create or replace function game.max_hp(health_xp bigint) returns int
language sql immutable set search_path = pg_catalog, game as $$ select 10 + 2 * (game.level_from_xp(health_xp) - 1) $$;

-- Health right now (it comes back 1 HP per minute).
create or replace function game.hp_now(p public.players, p_at timestamptz) returns numeric
language sql stable set search_path = pg_catalog, game as $$
  select least(game.max_hp(p.health_xp)::numeric, p.hp + greatest(0, extract(epoch from (p_at - p.hp_at))) / 60.0)
$$;

-- ================= the watchers' schedules (src/game/watchers.ts) =================

create or replace function game.minstd(x bigint) returns bigint
language sql immutable set search_path = pg_catalog as $$ select (x * 48271) % 2147483647 $$;

-- The bartender: slots of 8.5s; he watches for 3.5–5s at the start of each, and sees the room once he's
-- been turned towards it for 0.6s.
create or replace function game.bartender_sees(t bigint) returns boolean
language plpgsql immutable set search_path = pg_catalog, game as $$
declare
  k bigint := t / 8500;
  h1 bigint := game.minstd((k % 2147483647) + 1);
  watch bigint := 3500 + (h1 * 1500) / 2147483647;
  into_slot bigint := t - k * 8500;
begin
  return into_slot < watch and into_slot >= 600;
end $$;

-- The guard: walks GUARD_ROUTE at 1.2 tiles/s, stops 2.5s at each corner sweeping his flashlight.
-- Returns where he is and which way he faces (yaw, radians, 0 = south).
create or replace function game.guard_at(t bigint, out gx double precision, out gz double precision, out yaw double precision)
language plpgsql immutable set search_path = pg_catalog as $$
declare
  rx int[] := array[36, 42, 42, 36, 36, 42, 42, 36];
  ry int[] := array[21, 21, 25, 25, 28, 28, 25, 25];
  n int := 8;
  walk double precision[] := array[]::double precision[];
  loop_ms double precision := 0;
  u double precision;
  i int;
  j int;
  d double precision;
  f double precision;
  leg_yaw double precision;
begin
  for i in 1..n loop
    j := (i % n) + 1;
    d := sqrt(((rx[j] - rx[i])::double precision) ^ 2 + ((ry[j] - ry[i])::double precision) ^ 2);
    walk := walk || ((d / 1.2) * 1000);
    loop_ms := loop_ms + (d / 1.2) * 1000 + 2500;
  end loop;
  u := t::double precision - floor(t::double precision / loop_ms) * loop_ms;
  for i in 1..n loop
    j := (i % n) + 1;
    leg_yaw := atan2((rx[j] - rx[i])::double precision, (ry[j] - ry[i])::double precision);
    if u < walk[i] then
      f := u / walk[i];
      gx := rx[i] + 0.5 + (rx[j] - rx[i]) * f;
      gz := ry[i] + 0.5 + (ry[j] - ry[i]) * f;
      yaw := leg_yaw;
      return;
    end if;
    u := u - walk[i];
    if u < 2500 then
      gx := rx[j] + 0.5;
      gz := ry[j] + 0.5;
      yaw := leg_yaw + sin((u / 1000) * 2.4) * 1.1;
      return;
    end if;
    u := u - 2500;
  end loop;
  gx := rx[1] + 0.5;
  gz := ry[1] + 0.5;
  yaw := 0;
end $$;

-- Is the middle of tile (x, y) in the guard's flashlight beam (4.5 tiles long, ±0.75 rad) at time t?
create or replace function game.guard_sees(t bigint, x int, y int) returns boolean
language plpgsql immutable set search_path = pg_catalog, game as $$
declare
  g record;
  dx double precision;
  dz double precision;
  a double precision;
begin
  select * into g from game.guard_at(t);
  dx := x + 0.5 - g.gx;
  dz := y + 0.5 - g.gz;
  a := atan2(dx, dz) - g.yaw;
  return sqrt(dx * dx + dz * dz) <= 4.5 and abs(atan2(sin(a), cos(a))) <= 0.75;
end $$;

-- The first moment between t0 and t1 (checked every 100ms) that the watcher sees you on tile (x, y).
create or replace function game.first_seen(watcher text, x int, y int, t0 bigint, t1 bigint) returns bigint
language plpgsql immutable set search_path = pg_catalog, game as $$
declare
  t bigint := t0;
begin
  while t <= t1 loop
    if (watcher = 'bartender' and game.bartender_sees(t)) or (watcher = 'guard' and x is not null and game.guard_sees(t, x, y)) then
      return t;
    end if;
    t := t + 100;
  end loop;
  return null;
end $$;

-- ================= reading and writing a player =================

create or replace function game.empty_report() returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select '{"jobs":0,"cash":0,"xp":{},"levelUps":[],"bigScores":0,"events":[],"damage":0,"fails":0,"hit":false,"items":{},"died":false}'::jsonb
$$;

-- Add n to a number in the report.
create or replace function game.bump(rep jsonb, k text, n numeric) returns jsonb
language sql immutable set search_path = pg_catalog as $$ select jsonb_set(rep, array[k], to_jsonb(coalesce((rep ->> k)::numeric, 0) + n)) $$;

-- Write every changeable column of a player back.
create or replace function game.save(p public.players) returns void
language sql set search_path = pg_catalog, public as $$
  update public.players set
    cash = p.cash, hp = p.hp, hp_at = p.hp_at,
    street_xp = p.street_xp, melee_xp = p.melee_xp, defense_xp = p.defense_xp, gunfire_xp = p.gunfire_xp, health_xp = p.health_xp,
    inventory = p.inventory, pos_x = p.pos_x, pos_y = p.pos_y, pos_at = p.pos_at,
    job_crime = p.job_crime, job_spot = p.job_spot, job_started_at = p.job_started_at, job_ends_at = p.job_ends_at,
    job_pos_x = p.job_pos_x, job_pos_y = p.job_pos_y,
    stunned_until = p.stunned_until, eating_until = p.eating_until, caught_crime = p.caught_crime, caught_at = p.caught_at,
    stats = p.stats, updated_at = now()
  where id = p.id
$$;

-- The answer every public function sends back: your character in the app's own shape (times in ms),
-- your grave, which shelves/meters are empty (for everyone), what happened, and the server's time.
create or replace function game.respond(uid uuid, ok boolean, reason text, rep jsonb, logs jsonb) returns jsonb
language plpgsql set search_path = pg_catalog, public, game as $$
declare
  p public.players;
  v_grave jsonb;
  v_spots jsonb;
begin
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

-- ================= getting hit, dying =================

-- You die at 0 HP: your cash and items go into a grave where you stood (5 minutes), and you wake up at the
-- start with half health (src/game/engine.ts `die`).
create or replace function game.die(inout p public.players, p_at timestamptz, inout rep jsonb, inout logs jsonb)
language plpgsql set search_path = pg_catalog, public, game as $$
declare
  has_stuff boolean := p.cash > 0 or p.inventory <> '{}'::jsonb;
begin
  if exists (select 1 from public.graves where player_id = p.id and expires_at > now()) then
    logs := logs || to_jsonb('Your old grave crumbled. What was in it is gone.'::text);
  end if;
  delete from public.graves where player_id = p.id;
  if has_stuff and p.pos_x is not null then
    insert into public.graves (player_id, x, y, cash, items, died_at, expires_at)
    values (p.id, p.pos_x, p.pos_y, p.cash, p.inventory, p_at, p_at + interval '5 minutes');
    p.cash := 0;
    p.inventory := '{}'::jsonb;
    logs := logs || to_jsonb('You died. Your stuff is in your grave: get it back within 5 minutes.'::text);
  else
    logs := logs || to_jsonb('You died.'::text);
  end if;
  p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
  p.caught_crime := null; p.caught_at := null;
  p.stunned_until := 'epoch';
  p.pos_x := null; p.pos_y := null; p.pos_at := p_at;
  p.hp := greatest(3, ceil(game.max_hp(p.health_xp) * 0.5));
  p.hp_at := p_at;
  p.stats := jsonb_set(p.stats, '{deaths}', to_jsonb(coalesce((p.stats ->> 'deaths')::int, 0) + 1));
  rep := jsonb_set(rep, '{died}', 'true'::jsonb);
  rep := jsonb_set(rep, '{events}', (rep -> 'events') || to_jsonb('You died'::text));
end $$;

-- Lose health and get stunned (a failed attempt, or a catcher's punch landing).
create or replace function game.get_hit(inout p public.players, c public.crimes, p_at timestamptz, why text, inout rep jsonb, inout logs jsonb)
language plpgsql set search_path = pg_catalog, public, game as $$
declare
  r record;
begin
  p.stunned_until := p_at + make_interval(secs => c.fail_stun);
  p.hp := greatest(0, game.hp_now(p, p_at) - c.fail_damage);
  p.hp_at := p_at;
  rep := game.bump(rep, 'damage', c.fail_damage);
  rep := jsonb_set(rep, '{hit}', 'true'::jsonb);
  logs := logs || to_jsonb(format('%s You''re stunned. -%s HP.', why, c.fail_damage));
  if p.hp <= 0 then
    select * into r from game.die(p, p_at, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
  elsif p.hp < 3 then
    logs := logs || to_jsonb('You''re too hurt to keep going. Eat something, or wait: health comes back slowly.'::text);
  end if;
end $$;

-- Bring a player up to date: land a catcher's punch that's due (1.6s after he caught you), and let an old
-- attempt that was never finished lapse (only active play counts).
create or replace function game.settle(inout p public.players, inout rep jsonb, inout logs jsonb)
language plpgsql set search_path = pg_catalog, public, game as $$
declare
  c public.crimes;
  hit_at timestamptz;
  r record;
begin
  if p.caught_crime is not null and now() >= p.caught_at + interval '1.6 seconds' then
    select * into c from public.crimes where id = p.caught_crime;
    hit_at := p.caught_at + interval '1.6 seconds';
    p.caught_crime := null;
    p.caught_at := null;
    select * into r from game.get_hit(p, c, hit_at,
      case c.catcher when 'clerk' then 'The clerk shoves you into a shelf.'
                     when 'bartender' then 'The bartender grabs you by the collar and punches you.'
                     else 'The guard whacks you with his flashlight.' end, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
  end if;
  if p.job_crime is not null and now() > p.job_ends_at + interval '15 seconds' then
    p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
  end if;
end $$;

-- Lock and load the signed-in player (null if none).
create or replace function game.me() returns public.players
language sql set search_path = pg_catalog, public as $$ select * from public.players where id = auth.uid() for update $$;

-- Can you have walked from where the server last saw you to (x, y) by now? Walking is 4 tiles/s; we allow 5
-- plus 3 tiles of slack for lag. You start at the spawn tile (18, 22) after creating a character or dying.
create or replace function game.can_reach(p public.players, x int, y int) returns boolean
language sql stable set search_path = pg_catalog as $$
  select x between 0 and 43 and y between 0 and 36
     and sqrt(((x - coalesce(p.pos_x, 18))::numeric) ^ 2 + ((y - coalesce(p.pos_y, 22))::numeric) ^ 2)
         <= 3 + 5 * greatest(0, extract(epoch from (now() - coalesce(p.pos_at, p.created_at))))
$$;

-- ================= the app's functions =================

-- Load (and bring up to date) your character.
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
  return game.respond(p.id, true, null, rep, logs);
end $$;

-- Remember where you're standing (when you stop walking). Too far too fast = refused.
create or replace function public.save_position(p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  if not game.can_reach(p, p_x, p_y) then
    return game.respond(p.id, false, 'too_fast', null, null);
  end if;
  update public.players set pos_x = p_x, pos_y = p_y, pos_at = now(), updated_at = now() where id = p.id;
  return jsonb_build_object('ok', true, 'server_now', game.ms(now()));
end $$;

-- Start one attempt at a spot, standing on tile (p_x, p_y). One tap = one attempt.
create or replace function public.start_attempt(p_spot text, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  s public.spots;
  c public.crimes;
  empty_until timestamptz;
  r record;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
  perform game.save(p);
  select * into s from public.spots where id = p_spot;
  if s.id is null then return game.respond(p.id, false, 'unknown_spot', rep, logs); end if;
  select * into c from public.crimes where id = s.crime_id;
  if p.caught_crime is not null then return game.respond(p.id, false, 'caught', rep, logs); end if;
  if p.stunned_until > now() then return game.respond(p.id, false, 'stunned', rep, logs); end if;
  if p.eating_until > now() then return game.respond(p.id, false, 'eating', rep, logs); end if;
  if game.hp_now(p, now()) < 3 then return game.respond(p.id, false, 'too_hurt', rep, logs); end if;
  if game.level_from_xp(p.street_xp) < c.level then return game.respond(p.id, false, 'level_too_low', rep, logs); end if;
  select ss.empty_until into empty_until from public.spot_state ss where ss.spot_id = s.id and ss.empty_until > now();
  if empty_until is not null then return game.respond(p.id, false, 'empty', rep, logs); end if;
  -- You have to stand next to it (tourists: anywhere in the park), and be able to have walked there.
  if s.area_x0 is not null then
    if not (p_x between s.area_x0 - 1 and s.area_x1 + 1 and p_y between s.area_y0 - 1 and s.area_y1 + 1) then
      return game.respond(p.id, false, 'too_far', rep, logs);
    end if;
  elsif greatest(abs(p_x - s.x), abs(p_y - s.y)) > 1 then
    return game.respond(p.id, false, 'too_far', rep, logs);
  end if;
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  update public.players set
    job_crime = c.id, job_spot = s.id, job_started_at = now(), job_ends_at = now() + make_interval(secs => c.ticks * 0.5),
    job_pos_x = p_x, job_pos_y = p_y, pos_x = p_x, pos_y = p_y, pos_at = now(), updated_at = now()
  where id = p.id;
  return game.respond(p.id, true, null, rep, logs);
end $$;

-- Walk away from an attempt.
create or replace function public.stop_attempt()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  update public.players set job_crime = null, job_spot = null, job_started_at = null, job_ends_at = null, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $$;

-- Finish your attempt: called when its time is up (or earlier, when the app thinks a watcher saw you).
-- The server checks the watchers' schedules itself and rolls the dice.
create or replace function public.finish_attempt()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  c public.crimes;
  t_now bigint := game.ms(now());
  seen bigint;
  lvl_before int;
  lvl_after int;
  chance numeric;
  big boolean;
  v_cash bigint;
  v_xp int;
  v_item text;
  v_n int;
  ends timestamptz;
  v_spot text;
  r record;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
  if p.job_crime is null then
    perform game.save(p);
    return game.respond(p.id, true, 'no_attempt', rep, logs);
  end if;
  select * into c from public.crimes where id = p.job_crime;
  ends := p.job_ends_at;
  v_spot := p.job_spot;

  -- Did the bartender or the guard see you?
  if c.catcher in ('bartender', 'guard') then
    seen := game.first_seen(c.catcher, p.job_pos_x, p.job_pos_y, game.ms(p.job_started_at), least(t_now, game.ms(ends)));
    if seen is not null then
      p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
      p.caught_crime := c.id;
      p.caught_at := game.ts(seen);
      p.stats := jsonb_set(p.stats, '{fails}', to_jsonb(coalesce((p.stats ->> 'fails')::int, 0) + 1));
      rep := game.bump(rep, 'fails', 1);
      logs := logs || to_jsonb(format('%s "%s"', case c.catcher when 'bartender' then 'The bartender saw you.' else 'The guard spotted you.' end,
                                      case c.catcher when 'bartender' then 'Leave my guests alone!' else 'I saw that!' end));
      select * into r from game.settle(p, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs; -- his punch may already be due
      perform game.save(p);
      return game.respond(p.id, true, null, rep, logs);
    end if;
  end if;

  if now() < ends then
    perform game.save(p);
    return game.respond(p.id, false, 'not_yet', rep, logs);
  end if;

  -- Resolve it (src/game/engine.ts `resolveAttempt`).
  p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
  p.stats := jsonb_set(p.stats, '{jobs}', to_jsonb(coalesce((p.stats ->> 'jobs')::int, 0) + 1));
  rep := game.bump(rep, 'jobs', 1);
  lvl_before := game.level_from_xp(p.street_xp);
  chance := least(case when c.base_chance >= 1 then 1 else 0.97 end, c.base_chance + greatest(0, lvl_before - c.level) * 0.005);

  if random() < chance then
    big := random() < 0.05;
    v_xp := c.xp * (case when big then 2 else 1 end);
    if cardinality(c.items) > 0 then
      v_item := c.items[1 + floor(random() * cardinality(c.items))::int];
      v_n := case when big then 2 else 1 end;
      -- A new kind of item needs a free slot (28 slots, the first is your cash).
      if p.inventory ? v_item or (select count(*) from jsonb_object_keys(p.inventory)) < 27 then
        p.inventory := jsonb_set(p.inventory, array[v_item], to_jsonb(coalesce((p.inventory ->> v_item)::int, 0) + v_n));
        rep := jsonb_set(rep, '{items}', jsonb_build_object(v_item, v_n));
        logs := logs || to_jsonb(format('%sYou got away with it. +%s %s, +%s XP', case when big then 'BIG SCORE — ' else '' end, v_n,
                                        case v_item when 'sandwich' then 'Sandwich' else 'Candy Bar' end, v_xp));
      else
        logs := logs || to_jsonb(format('Your bag is full, so you put it back. +%s XP', v_xp));
      end if;
    else
      v_cash := (c.cash_min + floor(random() * (c.cash_max - c.cash_min + 1)))::bigint * (case when big then 2 else 1 end);
      p.cash := p.cash + v_cash;
      p.stats := jsonb_set(p.stats, '{earned}', to_jsonb(coalesce((p.stats ->> 'earned')::bigint, 0) + v_cash));
      rep := game.bump(rep, 'cash', v_cash);
      logs := logs || to_jsonb(format('%sYou got away with it. +$%s, +%s XP', case when big then 'BIG SCORE — ' else '' end, v_cash, v_xp));
    end if;
    p.street_xp := p.street_xp + v_xp;
    rep := jsonb_set(rep, '{xp}', jsonb_build_object('street', v_xp));
    if big then
      rep := game.bump(rep, 'bigScores', 1);
      p.stats := jsonb_set(p.stats, '{bigScores}', to_jsonb(coalesce((p.stats ->> 'bigScores')::int, 0) + 1));
    end if;
    lvl_after := game.level_from_xp(p.street_xp);
    for v_n in (lvl_before + 1)..lvl_after loop
      rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'street', 'level', v_n));
      logs := logs || to_jsonb(format('Street Crimes reached level %s!', v_n));
    end loop;
    -- Shelves and meters you emptied are empty for everyone until they refill.
    if c.refill is not null then
      insert into public.spot_state (spot_id, empty_until) values (v_spot, ends + make_interval(secs => c.refill))
      on conflict (spot_id) do update set empty_until = excluded.empty_until;
    end if;
  else
    p.stats := jsonb_set(p.stats, '{fails}', to_jsonb(coalesce((p.stats ->> 'fails')::int, 0) + 1));
    rep := game.bump(rep, 'fails', 1);
    if c.catcher is not null then
      -- Someone catches you: he yells now, his punch lands 1.6s later.
      p.caught_crime := c.id;
      p.caught_at := ends;
      logs := logs || to_jsonb(format('%s "%s"', case c.catcher when 'clerk' then 'The clerk saw you.' else 'The car alarm went off.' end,
                                      case c.catcher when 'clerk' then 'Hey!' else 'I saw that!' end));
      select * into r from game.settle(p, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
    else
      select * into r from game.get_hit(p, c, ends,
        case c.id when 'gym_bags' then 'One of the players saw you and shoved you into the fence.' else 'The tourist grabbed your wrist and shoved you away.' end,
        rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
    end if;
  end if;
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs);
end $$;

-- Eat one food item: heals at once, takes half a second.
create or replace function public.eat_item(p_item text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  heal int := case p_item when 'candy_bar' then 1 when 'sandwich' then 2 else 0 end;
  have int;
  r record;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
    p := r.p; rep := r.rep; logs := r.logs;
  have := coalesce((p.inventory ->> p_item)::int, 0);
  if heal = 0 or have <= 0 then perform game.save(p); return game.respond(p.id, false, 'no_such_food', rep, logs); end if;
  if p.eating_until > now() then perform game.save(p); return game.respond(p.id, false, 'eating', rep, logs); end if;
  if game.hp_now(p, now()) >= game.max_hp(p.health_xp) then perform game.save(p); return game.respond(p.id, false, 'full_health', rep, logs); end if;
  p.inventory := case when have = 1 then p.inventory - p_item else jsonb_set(p.inventory, array[p_item], to_jsonb(have - 1)) end;
  p.hp := least(game.max_hp(p.health_xp), game.hp_now(p, now()) + heal);
  p.hp_at := now();
  p.eating_until := now() + interval '0.5 seconds';
  logs := logs || to_jsonb(format('You eat the %s. +%s HP.', replace(p_item, '_', ' '), heal));
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs);
end $$;

-- Sell one item to Eddy (you have to be in his store).
create or replace function public.sell_item(p_item text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  price int := case p_item when 'candy_bar' then 1 when 'sandwich' then 2 else 0 end;
  have int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  have := coalesce((p.inventory ->> p_item)::int, 0);
  if price = 0 or have <= 0 then return game.respond(p.id, false, 'nothing_to_sell', null, null); end if;
  if p.pos_x is null or not (p.pos_x between 16 and 20 and p.pos_y between 9 and 13) then
    return game.respond(p.id, false, 'not_at_store', null, null);
  end if;
  update public.players set
    inventory = case when have = 1 then inventory - p_item else jsonb_set(inventory, array[p_item], to_jsonb(have - 1)) end,
    cash = cash + price,
    stats = jsonb_set(stats, '{earned}', to_jsonb(coalesce((stats ->> 'earned')::bigint, 0) + price)),
    updated_at = now()
  where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $$;

-- Throw away a whole stack.
create or replace function public.drop_item(p_item text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  update public.players set inventory = inventory - p_item, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $$;

-- Take your stuff back from your grave (stand next to it).
create or replace function public.collect_grave()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  g public.graves;
  logs jsonb := '[]'::jsonb;
  item record;
  inv jsonb;
  left_over jsonb := '{}'::jsonb;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into g from public.graves where player_id = p.id and expires_at > now() for update;
  if g.player_id is null then return game.respond(p.id, false, 'no_grave', null, null); end if;
  if p.pos_x is null or greatest(abs(p.pos_x - g.x), abs(p.pos_y - g.y)) > 1 then
    return game.respond(p.id, false, 'too_far', null, null);
  end if;
  inv := p.inventory;
  for item in select key, value from jsonb_each(g.items) loop
    if inv ? item.key or (select count(*) from jsonb_object_keys(inv)) < 27 then
      inv := jsonb_set(inv, array[item.key], to_jsonb(coalesce((inv ->> item.key)::int, 0) + (item.value)::int));
    else
      left_over := left_over || jsonb_build_object(item.key, item.value);
    end if;
  end loop;
  update public.players set cash = cash + g.cash, inventory = inv, updated_at = now() where id = p.id;
  if left_over = '{}'::jsonb then
    delete from public.graves where player_id = p.id;
    logs := logs || to_jsonb('You got your stuff back from your grave.'::text);
  else
    update public.graves set cash = 0, items = left_over where player_id = p.id;
    logs := logs || to_jsonb('You took what fits in your bag. The rest is still in your grave.'::text);
  end if;
  return game.respond(p.id, true, null, null, logs);
end $$;

-- Highscores for one skill: the top players, and your own place.
create or replace function public.get_highscores(p_skill text, p_limit int default 50)
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public, game as $$
declare
  col text := case p_skill when 'street' then 'street_xp' when 'melee' then 'melee_xp' when 'defense' then 'defense_xp'
                           when 'gunfire' then 'gunfire_xp' when 'health' then 'health_xp' end;
  v_rows jsonb;
  v_me jsonb;
begin
  if col is null then return jsonb_build_object('ok', false, 'reason', 'unknown_skill'); end if;
  execute format($q$
    with ranked as (
      select id, name, %1$I as xp, rank() over (order by %1$I desc) as rnk, row_number() over (order by %1$I desc, created_at) as rn
      from public.players
    )
    select
      (select coalesce(jsonb_agg(jsonb_build_object('rank', rnk, 'name', name, 'xp', xp, 'level', game.level_from_xp(xp)) order by rn), '[]'::jsonb)
         from ranked where rn <= $1),
      (select jsonb_build_object('rank', rnk, 'name', name, 'xp', xp, 'level', game.level_from_xp(xp)) from ranked where id = auth.uid())
  $q$, col) into v_rows, v_me using least(greatest(coalesce(p_limit, 50), 1), 100);
  return jsonb_build_object('ok', true, 'rows', v_rows, 'me', v_me);
end $$;

-- Who may call what: only signed-in players, except the highscores (public, like RuneScape's hiscores).
do $$
declare f text;
begin
  foreach f in array array['game_state()', 'save_position(int, int)', 'start_attempt(text, int, int)', 'stop_attempt()',
                           'finish_attempt()', 'eat_item(text)', 'sell_item(text)', 'drop_item(text)', 'collect_grave()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.get_highscores(text, int) from public;
grant execute on function public.get_highscores(text, int) to anon, authenticated;

-- The private helpers: nobody but the functions above (which run as the owner) may call them.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'game' loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
