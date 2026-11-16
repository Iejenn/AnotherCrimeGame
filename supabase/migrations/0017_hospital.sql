-- 0017: the hospital (docs/design.md §5). When you pass out (0 HP) you wake up in the hospital's ward, upstairs in
-- 005-B, next to a bed (tile 30, 25 = WAKE in src/street/map.ts), instead of at the spawn in the park.
--
-- What changes: one line in game.die (swapped in its live definition; stops if the line isn't found):
--   the position after dying was null (= the spawn); now it's the ward tile. Your walking route is reset to that
--   tile too, so other players see you there straight away.
-- Not destructive: no data is changed, only this function. New players still start in the park.
do $do$
declare def text;
begin
  def := pg_get_functiondef('game.die(public.players, timestamptz, jsonb, jsonb)'::regprocedure);
  if position('p.pos_x := null; p.pos_y := null; p.pos_at := p_at;' in def) = 0 then raise exception 'game.die: anchor not found'; end if;
  def := replace(def, 'p.pos_x := null; p.pos_y := null; p.pos_at := p_at;',
    'p.pos_x := 30; p.pos_y := 25; p.pos_at := p_at;
  update public.walks set from_x = 30, from_y = 25, path = ''[]''::jsonb, started_at = p_at where player_id = p.id;');
  execute def;
end $do$;

-- Check: this should say "ok".
select case when position('p.pos_x := 30; p.pos_y := 25;' in pg_get_functiondef('game.die(public.players, timestamptz, jsonb, jsonb)'::regprocedure)) > 0
  then 'ok' else 'NOT APPLIED' end as hospital_wake;
