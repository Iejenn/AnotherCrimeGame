-- Underworld: accounts and server-side game state, step 1 (docs/design.md §11).
-- Everything the game stores lives here, and ONLY SECURITY DEFINER functions change it:
-- every table has RLS on, and there are no insert/update/delete policies for players.

-- ---------- crimes: the rules data (read-only for everyone; mirrors src/game/data/crimes.ts) ----------
create table public.crimes (
  id text primary key,
  name text not null,
  level int not null,
  ticks int not null,               -- × 0.5s per attempt
  base_chance numeric not null,     -- odds at the required level (1 = always, if unseen)
  xp int not null,
  cash_min int not null,
  cash_max int not null,
  items text[] not null default '{}', -- food you get instead of cash
  fail_damage int not null,
  fail_stun int not null,           -- seconds
  catcher text check (catcher in ('clerk', 'bartender', 'guard')),
  refill int                        -- seconds a spot stays empty after a success
);
alter table public.crimes enable row level security;
create policy crimes_select_all on public.crimes for select to anon, authenticated using (true);

insert into public.crimes (id, name, level, ticks, base_chance, xp, cash_min, cash_max, items, fail_damage, fail_stun, catcher, refill) values
  ('pick_tourist',  'Pickpocket Tourists',     1, 4, 0.65,  3,  1,  3, '{}',                    1, 2, null,        null),
  ('gym_bags',      'Raid Gym Bags',           5, 4, 0.55,  5,  2,  6, '{}',                    1, 2, null,        null),
  ('candy_store',   'Shoplift Candy Store',   10, 4, 0.40, 10,  0,  0, '{candy_bar}',           1, 2, 'clerk',     10),
  ('pick_drunk',    'Pickpocket Drunks',      15, 6, 1.00,  8, 10, 20, '{}',                    2, 3, 'bartender', null),
  ('parking_meter', 'Pry Open Parking Meters',20, 6, 1.00,  7, 15, 30, '{}',                    3, 4, 'guard',     15),
  ('gas_station',   'Shoplift Gas Station',   25, 4, 0.40, 21,  0,  0, '{sandwich,candy_bar}',  2, 2, 'clerk',     10),
  ('steal_car',     'Steal From Cars',        30, 6, 0.35, 56, 30, 60, '{}',                    3, 4, 'guard',     null);

-- ---------- players: one character per account ----------
create table public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  look jsonb not null,
  cash bigint not null default 10 check (cash >= 0),
  hp numeric not null default 10,
  hp_at timestamptz not null default now(),
  street_xp bigint not null default 0,
  melee_xp bigint not null default 0,
  defense_xp bigint not null default 0,
  gunfire_xp bigint not null default 0,
  health_xp bigint not null default 0,
  inventory jsonb not null default '{}'::jsonb,   -- item id → count
  pos_x int,
  pos_y int,
  -- the attempt in progress (one tap = one attempt)
  job_crime text references public.crimes (id),
  job_spot text,
  job_started_at timestamptz,
  job_ends_at timestamptz,
  job_pos_x int,
  job_pos_y int,
  stunned_until timestamptz not null default 'epoch',
  eating_until timestamptz not null default 'epoch',
  caught_crime text references public.crimes (id),  -- an NPC is on his way to hit you
  caught_at timestamptz,
  stats jsonb not null default '{"jobs":0,"bigScores":0,"earned":0,"fails":0,"deaths":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_name_format check (name ~ '^[A-Za-z0-9_ ]{3,16}$')
);
-- Names are unique, ignoring upper/lower case.
create unique index players_name_unique on public.players (lower(name));
alter table public.players enable row level security;
create policy players_select_own on public.players for select to authenticated using ((select auth.uid()) = id);

-- ---------- graves: where you died, with your stuff (one per player) ----------
create table public.graves (
  player_id uuid primary key references public.players (id) on delete cascade,
  x int not null,
  y int not null,
  cash bigint not null default 0,
  items jsonb not null default '{}'::jsonb,
  died_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.graves enable row level security;
create policy graves_select_own on public.graves for select to authenticated using ((select auth.uid()) = player_id);

-- ---------- spot_state: shelves and meters emptied by ANY player (shared world) ----------
create table public.spot_state (
  spot_id text primary key,
  empty_until timestamptz not null
);
alter table public.spot_state enable row level security;
create policy spot_state_select_all on public.spot_state for select to authenticated using (true);

-- ---------- create_character: make your character (once per account) ----------
create or replace function public.create_character(p_name text, p_look jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if exists (select 1 from public.players where id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_have_character');
  end if;
  if v_name !~ '^[A-Za-z0-9_ ]{3,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if exists (select 1 from public.players where lower(name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  end if;
  -- The look is 5 small numbers (indexes into the character creator's lists); anything else is refused.
  if jsonb_typeof(p_look) <> 'object'
     or not (p_look ?& array['skin', 'hair', 'hairColor', 'top', 'bottom'])
     or exists (select 1 from jsonb_each(p_look) e where jsonb_typeof(e.value) <> 'number' or (e.value)::numeric not between 0 and 9 or (e.value)::numeric % 1 <> 0)
     or (select count(*) from jsonb_object_keys(p_look)) <> 5 then
    return jsonb_build_object('ok', false, 'reason', 'bad_look');
  end if;
  insert into public.players (id, name, look) values (v_uid, v_name, p_look);
  return jsonb_build_object('ok', true, 'server_now', (extract(epoch from now()) * 1000)::bigint);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'name_taken');
end;
$$;
revoke execute on function public.create_character(text, jsonb) from public, anon;
grant execute on function public.create_character(text, jsonb) to authenticated;

-- ---------- get_my_player: load your character, your grave, and the server's time ----------
create or replace function public.get_my_player()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_player jsonb;
  v_grave jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  select to_jsonb(p) into v_player from public.players p where p.id = v_uid;
  if v_player is null then
    return jsonb_build_object('ok', false, 'reason', 'no_character', 'server_now', (extract(epoch from now()) * 1000)::bigint);
  end if;
  select to_jsonb(g) into v_grave from public.graves g where g.player_id = v_uid and g.expires_at > now();
  return jsonb_build_object('ok', true, 'player', v_player, 'grave', v_grave, 'server_now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;
revoke execute on function public.get_my_player() from public, anon;
grant execute on function public.get_my_player() to authenticated;
