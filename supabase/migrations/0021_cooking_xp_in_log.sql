-- 0021: cooking says how much XP you got ("You cook the bird meat. +5 XP"), like Street Crimes do.
-- One line in cook_step (swapped in its live definition; stops if the line isn't found). Not destructive.
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.cook_step()'::regprocedure);
  if position($q$format('You cook the %s.', v_food)$q$ in def) = 0 then raise exception 'cook_step: anchor not found'; end if;
  def := replace(def, $q$format('You cook the %s.', v_food)$q$, $q$format('You cook the %s. +%s XP', v_food, rc.xp)$q$);
  execute def;
end $do$;

-- Check: this should say "ok".
select case when position('+%s XP' in pg_get_functiondef('public.cook_step()'::regprocedure)) > 0 then 'ok' else 'NOT APPLIED' end as cooking_xp_in_log;
