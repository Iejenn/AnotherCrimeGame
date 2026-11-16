-- Underworld: one device at a time per account (docs/design.md §11).
-- Each time the game opens it makes up a random session id and sends it with every request (the header
-- "x-game-session", src/net/supabase.ts). The account remembers which session is playing it:
--  - public.claim_session(force): "I want to play here". If another device is actively playing (heard from in the
--    last 30 seconds) it answers "active_elsewhere" and the game asks you; "Play here" calls it again with force.
--  - game.me(), which every game function uses to load your character, now refuses any other session with the
--    error "session_replaced". The other device gets that on its next call (within ~10 seconds) and logs out.
--  - send_chat() does the same check.
-- Accounts that never claimed a session (session_id null) keep working, so nothing breaks mid-update.

alter table public.players add column session_id uuid;
alter table public.players add column session_at timestamptz;

-- The session id this request came with (null if none or not a valid id).
create or replace function game.session_header() returns uuid
language plpgsql stable set search_path = pg_catalog as $$
begin
  return (nullif(current_setting('request.headers', true), '')::json ->> 'x-game-session')::uuid;
exception when others then
  return null;
end $$;

-- Load and lock the signed-in player (as before: a row of nulls if they have no character), but refuse a device
-- that another device has taken over from.
create or replace function game.me() returns public.players
language plpgsql set search_path = pg_catalog, public, game as $$
declare
  p public.players;
begin
  select * into p from public.players where id = auth.uid() for update;
  if p.id is not null and p.session_id is not null and p.session_id is distinct from game.session_header() then
    raise exception 'session_replaced' using hint = 'This account is being played on another device.';
  end if;
  return p;
end $$;

-- "I want to play on this device." Without force, it refuses if another device is actively playing.
create or replace function public.claim_session(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid := game.session_header();
  p public.players;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if v_session is null then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;
  select * into p from public.players where id = v_uid for update;
  if p.id is null then return jsonb_build_object('ok', true, 'reason', 'no_character'); end if;
  if p.session_id is not null and p.session_id <> v_session and p.last_seen > now() - interval '30 seconds' and not coalesce(p_force, false) then
    return jsonb_build_object('ok', false, 'reason', 'active_elsewhere');
  end if;
  update public.players set session_id = v_session, session_at = now(), last_seen = now(),
    -- An attempt that was running on the other device stops.
    job_crime = null, job_spot = null, job_started_at = null, job_ends_at = null
  where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.claim_session(boolean) from public, anon;
grant execute on function public.claim_session(boolean) to authenticated;
revoke execute on function game.session_header() from public, anon, authenticated;
revoke execute on function game.me() from public, anon, authenticated;

-- send_chat: the same check (only that line added to its live definition).
do $$
declare
  d text := pg_get_functiondef('public.send_chat(text)'::regprocedure);
  old_line constant text := E'begin\n  select name into v_name from public.players where id = v_uid;';
  new_line constant text := E'begin\n  perform game.me(); -- refuses a device that another device took over from\n  select name into v_name from public.players where id = v_uid;';
begin
  if position(old_line in d) = 0 then
    raise exception 'send_chat() no longer starts as expected; nothing changed';
  end if;
  execute replace(d, old_line, new_line);
end $$;
