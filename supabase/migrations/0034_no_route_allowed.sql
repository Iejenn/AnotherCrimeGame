-- 0034_no_route_allowed (v0.52): if an enemy you throw at has no walking route to you at all, the throw is allowed
-- (decided: it was refused). It stays where it is and can't hit back; what it costs you is the knives. Today no such
-- spot exists (every throwable spot has a route, measured in v0.51); this is for future maps.
--
-- Changes only public.attack (two lines, from its live definition). No player data. One transaction: to try it first,
-- replace "commit;" with "rollback;". The check should say "ok".

begin;

do $do$
declare
  def text := pg_get_functiondef('public.attack(text, integer, integer)'::regprocedure);
  a1 text := $t$      if v_route is null then return game.respond(p.id, false, 'no_route', rep, logs); end if;
      if jsonb_array_length(v_route) > 0 then$t$;
  b1 text := $t$      -- No way to reach you at all (0034): you can still throw; it stays put and never gets to swing (its walk
      -- "ends" an hour from now, long after the fight is over).
      if v_route is null then
        e.arrive_at := now() + interval '1 hour';
      elsif jsonb_array_length(v_route) > 0 then$t$;
begin
  if position(a1 in def) = 0 then raise exception 'attack: anchor not found'; end if;
  execute replace(def, a1, b1);
end $do$;

-- Check: this should say "ok".
select case when position('no_route' in pg_get_functiondef('public.attack(text, integer, integer)'::regprocedure)) = 0
  and position($t$interval '1 hour'$t$ in pg_get_functiondef('public.attack(text, integer, integer)'::regprocedure)) > 0
  then 'ok' else 'NOT APPLIED' end as no_route_allowed;

commit;
