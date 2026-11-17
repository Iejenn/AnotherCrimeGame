-- 0031_total_highscores (v0.50): a "Total" highscore: everyone ranked by their total level (all skills' levels added
-- up), ties broken by total XP (like RuneScape's overall). get_highscores('total') answers it; every other skill works
-- as before.
--
-- Additive: one new helper (game.highscores_total) and one line in get_highscores (from its live definition). No player
-- data changes. One transaction; to try it first, replace "commit;" with "rollback;": the check should say "ok".

begin;

create or replace function game.highscores_total(p_limit integer)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, game
as $$
  with t as (
    select id, name, created_at,
      game.level_from_xp(street_xp) + game.level_from_xp(melee_xp) + game.level_from_xp(defense_xp) + game.level_from_xp(gunfire_xp)
        + game.level_from_xp(health_xp) + game.level_from_xp(cooking_xp) + game.level_from_xp(scrapping_xp) + game.level_from_xp(tinkering_xp) as lvl,
      floor(street_xp + melee_xp + defense_xp + gunfire_xp + health_xp + cooking_xp + scrapping_xp + tinkering_xp) as xp
    from public.players
  ),
  ranked as (
    select *, rank() over (order by lvl desc, xp desc) as rnk, row_number() over (order by lvl desc, xp desc, created_at) as rn from t
  )
  select jsonb_build_object('ok', true,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('rank', rnk, 'name', name, 'xp', xp, 'level', lvl) order by rn), '[]'::jsonb)
             from ranked where rn <= least(greatest(coalesce(p_limit, 50), 1), 100)),
    'me', (select jsonb_build_object('rank', rnk, 'name', name, 'xp', xp, 'level', lvl) from ranked where id = auth.uid()))
$$;
revoke execute on function game.highscores_total(integer) from public, anon, authenticated;

do $do$
declare
  def text := pg_get_functiondef('public.get_highscores(text, integer)'::regprocedure);
  old_text text := E'  if col is null then return jsonb_build_object(\'ok\', false, \'reason\', \'unknown_skill\'); end if;';
begin
  if position(old_text in def) = 0 then raise exception 'get_highscores: anchor not found'; end if;
  execute replace(def, old_text, E'  if p_skill = \'total\' then return game.highscores_total(p_limit); end if;\n' || old_text);
end $do$;

-- Check: this should say "ok".
select case when (public.get_highscores('total', 5) ->> 'ok')::boolean
  and jsonb_array_length(public.get_highscores('total', 5) -> 'rows') > 0
  and (public.get_highscores('street', 5) ->> 'ok')::boolean
  then 'ok' else 'NOT APPLIED' end as total_highscores;

commit;
