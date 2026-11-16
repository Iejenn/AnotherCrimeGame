-- Underworld: bring an offline character into your new account (docs/design.md §11).
-- For the first testers: their characters only exist in their browser. Because a browser save can be
-- edited, the server checks every number against sensible limits, and importing is only possible until
-- the cutoff date below. One character per account (same as create_character).

create or replace function public.import_local_character(p_save jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c_cutoff constant timestamptz := '2027-03-01 00:00:00+00';  -- importing closes after this
  c_max_xp constant bigint := 20000;      -- level 30 is 7,533 XP; leaves room for XP earned past the cap
  c_max_cash constant bigint := 250000;   -- a few days of steady play at the best crimes
  c_max_food constant int := 500;         -- per kind of food
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_save ->> 'name', ''));
  v_look jsonb := p_save -> 'look';
  v_skills jsonb := coalesce(p_save -> 'skills', '{}'::jsonb);
  v_stats jsonb := coalesce(p_save -> 'stats', '{}'::jsonb);
  v_inv jsonb := '{}'::jsonb;
  v_item record;
  v_cash bigint;
  v_xp bigint[];
  v_skill text;
  v_val numeric;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;
  if now() >= c_cutoff then
    return jsonb_build_object('ok', false, 'reason', 'import_closed');
  end if;
  if exists (select 1 from public.players where id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_have_character');
  end if;
  if jsonb_typeof(p_save) <> 'object' or (p_save ->> 'version') is distinct from '2' then
    return jsonb_build_object('ok', false, 'reason', 'bad_save');
  end if;
  if v_name !~ '^[A-Za-z0-9_ ]{3,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if exists (select 1 from public.players where lower(name) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  end if;
  if v_look is null or jsonb_typeof(v_look) <> 'object'
     or not (v_look ?& array['skin', 'hair', 'hairColor', 'top', 'bottom'])
     or exists (select 1 from jsonb_each(v_look) e where jsonb_typeof(e.value) <> 'number' or (e.value)::numeric not between 0 and 9 or (e.value)::numeric % 1 <> 0)
     or (select count(*) from jsonb_object_keys(v_look)) <> 5 then
    return jsonb_build_object('ok', false, 'reason', 'bad_look');
  end if;

  -- Skills: whole numbers between 0 and the cap, in the order street, melee, defense, gunfire, health.
  v_xp := array[]::bigint[];
  foreach v_skill in array array['street', 'melee', 'defense', 'gunfire', 'health'] loop
    v_val := case when jsonb_typeof(v_skills -> v_skill -> 'xp') = 'number' then (v_skills -> v_skill ->> 'xp')::numeric else 0 end;
    v_xp := v_xp || least(c_max_xp, greatest(0, floor(v_val)))::bigint;
  end loop;

  v_val := case when jsonb_typeof(p_save -> 'cash') = 'number' then (p_save ->> 'cash')::numeric else 0 end;
  v_cash := least(c_max_cash, greatest(0, floor(v_val)))::bigint;

  -- Only food that exists in the game, capped.
  if jsonb_typeof(p_save -> 'inventory') = 'object' then
    for v_item in select key, value from jsonb_each(p_save -> 'inventory') loop
      if v_item.key in ('candy_bar', 'sandwich') and jsonb_typeof(v_item.value) = 'number' and (v_item.value)::numeric >= 1 then
        v_inv := v_inv || jsonb_build_object(v_item.key, least(c_max_food, floor((v_item.value)::numeric))::int);
      end if;
    end loop;
  end if;

  insert into public.players (id, name, look, cash, hp, street_xp, melee_xp, defense_xp, gunfire_xp, health_xp, inventory, stats)
  values (
    v_uid, v_name, v_look, v_cash,
    10, -- start at full health of a level-1 Health skill; health_xp may raise the max later
    v_xp[1], v_xp[2], v_xp[3], v_xp[4], v_xp[5], v_inv,
    jsonb_build_object(
      'jobs', least(1000000, greatest(0, coalesce(floor((v_stats ->> 'jobs')::numeric), 0)))::bigint,
      'bigScores', least(1000000, greatest(0, coalesce(floor((v_stats ->> 'bigScores')::numeric), 0)))::bigint,
      'earned', least(c_max_cash * 10, greatest(0, coalesce(floor((v_stats ->> 'earned')::numeric), 0)))::bigint,
      'fails', least(1000000, greatest(0, coalesce(floor((v_stats ->> 'fails')::numeric), 0)))::bigint,
      'deaths', least(100000, greatest(0, coalesce(floor((v_stats ->> 'deaths')::numeric), 0)))::bigint,
      'imported', true
    )
  );
  return jsonb_build_object('ok', true, 'server_now', (extract(epoch from now()) * 1000)::bigint);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'reason', 'bad_save');
end;
$$;
revoke execute on function public.import_local_character(jsonb) from public, anon;
grant execute on function public.import_local_character(jsonb) to authenticated;
