-- 0018: eating during a fight (docs/design.md §12). Eating in a fight takes 3 ticks (1.5 s): you don't swing until
-- it's done. A swing that was due later anyway isn't delayed (so eating right after a slow swing costs nothing).
-- You can eat again once the 1.5 s are over. Outside fights nothing changes (0.5 s, as before).
--
-- What changes: one line in eat_item (swapped in its live definition; stops if the line isn't found).
-- Not destructive: no data is changed, only this function.
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.eat_item(text)'::regprocedure);
  if position($q$p.eating_until := now() + interval '0.5 seconds';$q$ in def) = 0 then raise exception 'eat_item: anchor not found'; end if;
  def := replace(def, $q$p.eating_until := now() + interval '0.5 seconds';$q$,
    $q$p.eating_until := now() + case when p.fight_enemy is not null then interval '1.5 seconds' else interval '0.5 seconds' end;
  if p.fight_enemy is not null then p.fight_next := greatest(p.fight_next, now() + interval '1.5 seconds'); end if;$q$);
  execute def;
end $do$;

-- Check: this should say "ok".
select case when position('p.fight_next := greatest(p.fight_next' in pg_get_functiondef('public.eat_item(text)'::regprocedure)) > 0
  then 'ok' else 'NOT APPLIED' end as eat_in_fight;
