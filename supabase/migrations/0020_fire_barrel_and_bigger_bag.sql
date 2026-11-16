-- 0020: a fire barrel to cook on in the sewer, and a bigger bag (docs/design.md §13 and §8).
--
--  - stations: barrel_0, a burning oil drum on the sewer's north wall (tile 29, 64), the same kind as the barbecue
--    (kind 'bbq': the same recipes). Same as STATIONS in src/street/map.ts.
--  - The bag: 30 slots (cash + 29 items, 5 × 6) instead of 28 (cash + 27). game.bag_slots() holds the number now;
--    the six functions that checked "27" use it (swapped in their live definitions; stops if a line isn't found).
-- Not destructive: no player data is changed. Nobody loses anything; everyone gets two more slots.

insert into public.stations (id, kind, x, y) values ('barrel_0', 'bbq', 29, 64)
on conflict (id) do update set kind = excluded.kind, x = excluded.x, y = excluded.y;

-- How many items fit in the bag (cash doesn't take one of these).
create or replace function game.bag_slots() returns int
language sql immutable set search_path = pg_catalog as $$ select 29 $$;
revoke execute on function game.bag_slots() from public, anon, authenticated;

do $do$
declare
  r record;
  def text;
begin
  for r in select * from (values
    ('public.buy_item(text)', 'if game.bag_used(inv) > 27 then', 'if game.bag_used(inv) > game.bag_slots() then'),
    ('public.equip_item(text)', 'if game.bag_used(inv) > 27 then', 'if game.bag_used(inv) > game.bag_slots() then'),
    ('public.unequip_item(text)', 'if game.bag_used(inv) > 27 then', 'if game.bag_used(inv) > game.bag_slots() then'),
    ('public.collect_grave()', 'game.bag_used(inv) + (item.value)::int <= 27', 'game.bag_used(inv) + (item.value)::int <= game.bag_slots()'),
    ('public.finish_attempt()', 'game.bag_used(p.inventory) + v_n <= 27', 'game.bag_used(p.inventory) + v_n <= game.bag_slots()'),
    ('public.pick_up(bigint, integer, integer)', 'game.bag_used(p.inventory) + g.amount > 27', 'game.bag_used(p.inventory) + g.amount > game.bag_slots()')
  ) as t(fn, old_line, new_line) loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_line in def) = 0 then raise exception '%: anchor not found: %', r.fn, r.old_line; end if;
    execute replace(def, r.old_line, r.new_line);
  end loop;
end $do$;

-- Check: this should say "ok".
select case when exists (select 1 from public.stations where id = 'barrel_0')
  and position('game.bag_slots()' in pg_get_functiondef('public.pick_up(bigint, integer, integer)'::regprocedure)) > 0
  and position('game.bag_slots()' in pg_get_functiondef('public.finish_attempt()'::regprocedure)) > 0
  then 'ok' else 'NOT APPLIED' end as fire_barrel_and_bag;
