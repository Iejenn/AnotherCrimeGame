-- 0011: see what other players are doing, and "last online".
--
-- 1. public.player_status: one small row per player with what others need to SEE them do: working a spot (and until
--    when), stunned, fighting an enemy, and their health (for the health bar over their head). A trigger on
--    public.players fills it, so every existing game function keeps working unchanged, and nobody can write it from
--    the app (no insert/update policies). Realtime sends each change to everyone's phone.
--    To keep traffic low, the trigger only writes when something visible changed: health regen (which creeps up a
--    little on every call) does not count, damage and eating do.
-- 2. players.prev_seen: when you were last online BEFORE this session (claim_session overwrites last_seen when you
--    log in), shown on the start-up screen as "Last online 2 hours ago".
-- Additive only: a new table, a new column, a new trigger; two functions get one extra line each (from their live
-- definitions).

-- ---------- 1. player_status ----------
create table if not exists public.player_status (
  player_id uuid primary key references public.players (id) on delete cascade,
  job_spot text,
  job_ends_at timestamptz,
  stunned_until timestamptz,
  fight_enemy text,
  hp numeric not null default 10,
  hp_at timestamptz not null default now(),
  max_hp int not null default 10,
  updated_at timestamptz not null default now()
);
alter table public.player_status enable row level security;
-- Everyone signed in may read everyone's status (it's what you'd see on the street anyway). No write policies.
drop policy if exists player_status_select_all on public.player_status;
create policy player_status_select_all on public.player_status for select to authenticated using (true);
alter publication supabase_realtime add table public.player_status;

create or replace function game.sync_status() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, game as $$
begin
  if tg_op = 'UPDATE'
     and new.job_spot is not distinct from old.job_spot
     and new.job_ends_at is not distinct from old.job_ends_at
     and new.stunned_until is not distinct from old.stunned_until
     and new.fight_enemy is not distinct from old.fight_enemy
     and new.health_xp is not distinct from old.health_xp
     -- health: only a drop (damage) or a jump of half a point or more (eating, waking up after dying); not regen
     and not (new.hp < old.hp - 0.001 or new.hp > old.hp + 0.5) then
    return new;
  end if;
  insert into public.player_status as s (player_id, job_spot, job_ends_at, stunned_until, fight_enemy, hp, hp_at, max_hp, updated_at)
  values (new.id, new.job_spot, new.job_ends_at, new.stunned_until, new.fight_enemy, new.hp, new.hp_at, game.max_hp(new.health_xp::bigint), now())
  on conflict (player_id) do update set job_spot = excluded.job_spot, job_ends_at = excluded.job_ends_at,
    stunned_until = excluded.stunned_until, fight_enemy = excluded.fight_enemy, hp = excluded.hp, hp_at = excluded.hp_at,
    max_hp = excluded.max_hp, updated_at = now();
  return new;
end $$;
revoke execute on function game.sync_status() from public, anon, authenticated;

drop trigger if exists players_sync_status on public.players;
create trigger players_sync_status after insert or update on public.players
  for each row execute function game.sync_status();

-- Fill it for the players who already exist.
insert into public.player_status (player_id, job_spot, job_ends_at, stunned_until, fight_enemy, hp, hp_at, max_hp)
select id, job_spot, job_ends_at, stunned_until, fight_enemy, hp, hp_at, game.max_hp(health_xp::bigint) from public.players
on conflict (player_id) do nothing;

-- ---------- 2. last online ----------
alter table public.players add column if not exists prev_seen timestamptz;

-- claim_session (logging in): remember the old last_seen before overwriting it. Taken from the live definition.
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.claim_session(boolean)'::regprocedure);
  if position('prev_seen' in def) = 0 then
    def := replace(def, 'update public.players set session_id = v_session, session_at = now(), last_seen = now(),',
                        'update public.players set prev_seen = last_seen, session_id = v_session, session_at = now(), last_seen = now(),');
    if position('prev_seen' in def) = 0 then raise exception 'claim_session: anchor not found'; end if;
    execute def;
  end if;
end $do$;

-- game.respond: send it to the app ("lastOnline"). Taken from the live definition.
do $do$
declare def text;
begin
  def := pg_get_functiondef('game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure);
  if position('lastOnline' in def) = 0 then
    def := replace(def, '''name'', p.name, ''look'', p.look, ''createdAt'', game.ms(p.created_at),',
                        '''name'', p.name, ''look'', p.look, ''createdAt'', game.ms(p.created_at), ''lastOnline'', game.ms(p.prev_seen),');
    if position('lastOnline' in def) = 0 then raise exception 'respond: anchor not found'; end if;
    execute def;
  end if;
end $do$;
