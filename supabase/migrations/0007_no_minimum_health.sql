-- Underworld: you can do crimes on any health (docs/design.md §5). Low health is a risk, not a block:
-- the next hit can kill you (and your stuff goes into your grave). Only two functions change, copied exactly
-- from 0003_online_play.sql with these edits:
--  - public.start_attempt: no more "too_hurt" refusal below 3 HP;
--  - game.get_hit: the low-health message warns instead of telling you to stop.

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
    logs := logs || to_jsonb('You''re badly hurt. Eat something: the next hit could kill you.'::text);
  end if;
end $$;

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
