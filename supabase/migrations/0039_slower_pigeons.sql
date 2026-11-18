-- 0039_slower_pigeons (v0.56): the Pigeons fly 40% slower. A hop to their next spot takes 2.5 s instead of 1.5 s (the
-- same way, the same schedule: a new spot every 8 s). game.pigeon_at is the server's copy of pigeonAt() in
-- src/game/enemies.ts (PIGEON_FLY_MS), so it changes with it: the two numbers in it, from its live definition (each edit
-- checks its line is there exactly once).
--
-- Nothing is deleted: one function edited. One transaction: to try it first, replace "commit;" with "rollback;".
-- The check should say "ok".

begin;

do $do$
declare def text := pg_get_functiondef('game.pigeon_at(integer, bigint)'::regprocedure);
begin
  if (length(def) - length(replace(def, 'into_hop >= 1500 then', ''))) / length('into_hop >= 1500 then') <> 1 then raise exception 'pigeon_at: anchor 1 not found once'; end if;
  if (length(def) - length(replace(def, 'f := into_hop / 1500.0;', ''))) / length('f := into_hop / 1500.0;') <> 1 then raise exception 'pigeon_at: anchor 2 not found once'; end if;
  def := replace(def, 'into_hop >= 1500 then', 'into_hop >= 2500 then');
  def := replace(def, 'f := into_hop / 1500.0;', 'f := into_hop / 2500.0;');
  execute def;
end $do$;

-- Check: 2 s into a hop a Pigeon is still in the air (it wasn't before: it landed at 1.5 s), and at 3 s it has landed.
select case when (select flying from game.pigeon_at(0, 8000::bigint * 220000000 + 2000))
  and not (select flying from game.pigeon_at(0, 8000::bigint * 220000000 + 3000)) then 'ok' else 'NOT CHANGED' end as pigeons;

commit;
