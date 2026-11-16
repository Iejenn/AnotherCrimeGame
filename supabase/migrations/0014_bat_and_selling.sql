-- 0014: the baseball bat, selling at 25%, and nothing stacks in the bag except cash (docs/design.md §6, §12).
--
--  - public.items: the baseball bat (Ray's, $250, Melee 3, damage 5, a swing every 6 ticks). What things are
--    worth: candy bar $4, sandwich $8 (so they still sell for $1 and $2), brass knuckles $50.
--  - selling (sell_item): a shop pays a quarter of what it's worth, rounded down. Ray buys weapons, in his store;
--    Eddy buys everything else, in his. (The store areas are the map's 002-C and 002-D: keep in step with map.ts.)
--  - the bag: every item takes a slot of its own now (only cash stacks). A new helper, game.bag_used(), counts
--    the slots items use; every place that checked for a free slot counts with it now. Items are still stored as
--    counts ({"candy_bar": 3}), so nothing in anyone's bag changes.
--  - drop_item drops one item, not the whole pile.
-- Additive: one new row in items and shop_items, three values changed, one new helper; the functions get their
-- changed lines swapped in their live definitions (the migration stops if a line isn't found).

create or replace function game.bag_used(inv jsonb) returns int
language sql immutable set search_path = pg_catalog as $$
  select coalesce(sum(value::int), 0)::int from jsonb_each_text(coalesce(inv, '{}'::jsonb))
$$;
revoke execute on function game.bag_used(jsonb) from public, anon, authenticated;

-- ---------- items ----------
update public.items set value = 4 where id = 'candy_bar';
update public.items set value = 8 where id = 'sandwich';
update public.items set value = 50 where id = 'brass_knuckles';
insert into public.items (id, name, slot, damage, accuracy, defence, speed, needs_skill, needs_level, heal, value)
values ('baseball_bat', 'Baseball Bat', 'weapon', 5, 0, 0, 6, 'melee', 3, 0, 250)
on conflict (id) do update set name = excluded.name, slot = excluded.slot, damage = excluded.damage, accuracy = excluded.accuracy,
  defence = excluded.defence, speed = excluded.speed, needs_skill = excluded.needs_skill, needs_level = excluded.needs_level,
  heal = excluded.heal, value = excluded.value;
insert into public.shop_items (shop, item, price)
select 'weapons', 'baseball_bat', 250
where not exists (select 1 from public.shop_items where shop = 'weapons' and item = 'baseball_bat');

-- ---------- every item takes a slot ----------
do $do$
declare
  fn text;
  def text;
begin
  foreach fn in array array['public.buy_item(text)', 'public.equip_item(text)', 'public.unequip_item(text)'] loop
    def := pg_get_functiondef(fn::regprocedure);
    if position('if (select count(*) from jsonb_object_keys(inv)) > 27 then' in def) = 0 then raise exception '%: bag check not found', fn; end if;
    def := replace(def, 'if (select count(*) from jsonb_object_keys(inv)) > 27 then', 'if game.bag_used(inv) > 27 then');
    execute def;
  end loop;
end $do$;
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.collect_grave()'::regprocedure);
  if position('if inv ? item.key or (select count(*) from jsonb_object_keys(inv)) < 27 then' in def) = 0 then raise exception 'collect_grave: bag check not found'; end if;
  def := replace(def, 'if inv ? item.key or (select count(*) from jsonb_object_keys(inv)) < 27 then', 'if game.bag_used(inv) + (item.value)::int <= 27 then');
  execute def;
end $do$;
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.finish_attempt()'::regprocedure);
  if position('if p.inventory ? v_item or (select count(*) from jsonb_object_keys(p.inventory)) < 27 then' in def) = 0 then raise exception 'finish_attempt: bag check not found'; end if;
  def := replace(def, 'if p.inventory ? v_item or (select count(*) from jsonb_object_keys(p.inventory)) < 27 then', 'if game.bag_used(p.inventory) + v_n <= 27 then');
  execute def;
end $do$;

-- ---------- selling: 25% of the value; Ray buys weapons, Eddy the rest ----------
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.sell_item(text)'::regprocedure);
  if position('price int := case p_item when ''candy_bar'' then 1 when ''sandwich'' then 2 else 0 end;' in def) = 0 then raise exception 'sell_item: price not found'; end if;
  def := replace(def, 'price int := case p_item when ''candy_bar'' then 1 when ''sandwich'' then 2 else 0 end;',
    'price int := coalesce((select floor(i.value * 0.25)::int from public.items i where i.id = p_item), 0);
  is_weapon boolean := exists (select 1 from public.items i where i.id = p_item and i.slot is not null);');
  if position('p.pos_x between 24 and 28 and p.pos_y between 12 and 16' in def) = 0 then raise exception 'sell_item: store area not found'; end if;
  def := replace(def, 'p.pos_x between 24 and 28 and p.pos_y between 12 and 16',
    'p.pos_y between 12 and 16 and case when is_weapon then p.pos_x between 29 and 33 else p.pos_x between 24 and 28 end');
  execute def;
end $do$;

-- ---------- dropping: one item at a time ----------
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.drop_item(text)'::regprocedure);
  if position('set inventory = inventory - p_item,' in def) = 0 then raise exception 'drop_item: line not found'; end if;
  def := replace(def, 'set inventory = inventory - p_item,',
    'set inventory = case when coalesce((inventory ->> p_item)::int, 0) <= 1 then inventory - p_item else jsonb_set(inventory, array[p_item], to_jsonb((inventory ->> p_item)::int - 1)) end,');
  execute def;
end $do$;
