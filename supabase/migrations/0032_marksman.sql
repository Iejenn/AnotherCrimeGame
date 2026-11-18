-- 0032_marksman (v0.51): Gunfire becomes Marksman, and its first weapon: throwing knives, thrown from up to 6 tiles away.
--
--   1. The skill is renamed: players.gunfire_xp -> marksman_xp, and every function that names it. Nobody has Gunfire
--      XP yet (checked: 0 of 6 players), so nothing is lost. game.respond still ALSO sends it as 'gunfire' for a while,
--      so a phone running the old game keeps working until it reloads.
--   2. Stacks: items.stack (up to 1,000 in one bag slot); game.bag_used counts them that way, and the functions that
--      check "does it fit" by adding counts now check the bag after the change instead.
--   3. Throwing knives: tin (Marksman 1) and copper (Marksman 11), 5 from a sheet at a workbench (Tinkering 1 / 11;
--      crafts.amount), Ray sells packs of 5 for $150 / $300 (shop_items.amount). They go in their own Marksman slot
--      (the whole stack: equipment.marksman + players.marksman_count), next to your melee weapon; players.fight_style
--      ('melee' / 'marksman', set_fight_style) picks which one you fight with. Each throw uses one; 1 in 3 lands on
--      the ground under the target for you to pick up (one pile per tile). Out of knives: you switch to melee.
--      They sell for nothing (no money printer).
--   4. Ranged fights: attack() lets a ranged weapon hit from range (6) + 1/2 tile if the line is clear: no building,
--      no off-map tile and no wall or fence of an enclosure in the way (game.clear_shot, the same steps as
--      src/street/sight.ts; walls and enclosures from the map: scripts/marksman-sql.ts). The enemy then walks up
--      to you (2.5 tiles/s: enemies.from_x/from_y/arrive_at) and only starts hitting once there; a melee weapon
--      can't hit it before it arrives either (no swapping to a bat mid-approach).
--
-- Anti-cheat: everything is checked here; the game only asks. Range and the line are checked on the server's own
-- positions (can_reach as before), ammo is taken on the server per throw.
--
-- One transaction. To try it first, replace the last line "commit;" with "rollback;": every check should say "ok".
-- Nothing is deleted. The rename can be undone with: alter table public.players rename column marksman_xp to gunfire_xp;
-- (plus re-running the previous function definitions), so take a backup of the functions first if you want one.

begin;

-- ---------- 1. Gunfire -> Marksman ----------
alter table public.players rename column gunfire_xp to marksman_xp;

do $do$
declare
  f record;
  def text;
begin
  -- Every function that names the column, rewritten from its live definition.
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'game') and p.prokind = 'f'
             and case when p.prokind = 'f' then pg_get_functiondef(p.oid) like '%gunfire_xp%' else false end loop
    execute replace(pg_get_functiondef(f.oid), 'gunfire_xp', 'marksman_xp');
  end loop;

  -- game.respond: send the skill as 'marksman', and (for now) also as 'gunfire' for old copies of the game.
  def := pg_get_functiondef('game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure);
  if position($t$'gunfire', jsonb_build_object('xp', p.marksman_xp)$t$ in def) = 0 then raise exception 'respond: anchor not found'; end if;
  execute replace(def, $t$'gunfire', jsonb_build_object('xp', p.marksman_xp)$t$,
    $t$'marksman', jsonb_build_object('xp', p.marksman_xp), 'gunfire', jsonb_build_object('xp', p.marksman_xp)$t$);

  -- get_highscores: 'marksman' (and the old name) both read the column.
  def := pg_get_functiondef('public.get_highscores(text, integer)'::regprocedure);
  if position($t$when 'gunfire' then 'marksman_xp'$t$ in def) = 0 then raise exception 'get_highscores: anchor not found'; end if;
  execute replace(def, $t$when 'gunfire' then 'marksman_xp'$t$, $t$when 'marksman' then 'marksman_xp' when 'gunfire' then 'marksman_xp'$t$);
end $do$;

-- ---------- 2. Stacks, ranged weapons, packs, crafts that make several, enemies walking up ----------
alter table public.items add column if not exists stack boolean not null default false;
alter table public.items add column if not exists range integer;
alter table public.crafts add column if not exists amount integer not null default 1;
alter table public.shop_items add column if not exists amount integer not null default 1;
alter table public.enemies add column if not exists arrive_at timestamptz;
alter table public.enemies add column if not exists from_x integer;
alter table public.enemies add column if not exists from_y integer;
alter table public.players add column if not exists marksman_count integer not null default 0;
alter table public.players add column if not exists fight_style text not null default 'melee';
alter table public.players drop constraint if exists players_fight_style_check;
alter table public.players add constraint players_fight_style_check check (fight_style in ('melee', 'marksman') and marksman_count >= 0);

-- Save, send and show the Marksman slot's count and your fighting style (from their live definitions).
do $do$
declare
  def text;
begin
  def := pg_get_functiondef('game.save(players)'::regprocedure);
  if position('equipment = p.equipment,' in def) = 0 then raise exception 'save: anchor not found'; end if;
  execute replace(def, 'equipment = p.equipment,', 'equipment = p.equipment, marksman_count = p.marksman_count, fight_style = p.fight_style,');

  def := pg_get_functiondef('game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure);
  if position($t$'equipment', p.equipment, 'fight'$t$ in def) = 0 then raise exception 'respond: equipment anchor not found'; end if;
  execute replace(def, $t$'equipment', p.equipment, 'fight'$t$,
    $t$'equipment', p.equipment, 'marksmanCount', p.marksman_count, 'fightStyle', p.fight_style, 'fight'$t$);

  def := pg_get_functiondef('game.world(uuid)'::regprocedure);
  if position($t$'equipment', p.equipment,$t$ in def) = 0 then raise exception 'world: anchor not found'; end if;
  execute replace(def, $t$'equipment', p.equipment,$t$, $t$'equipment', p.equipment, 'style', p.fight_style,$t$);
end $do$;

-- The new Marksman slot is an allowed gear slot (the live check only had weapon, head, body, legs, feet).
alter table public.items drop constraint if exists items_slot_check;
alter table public.items add constraint items_slot_check check (slot = any (array['weapon', 'marksman', 'head', 'body', 'legs', 'feet']));

insert into public.items (id, name, slot, damage, accuracy, defence, speed, needs_skill, needs_level, heal, value, quest, stack, range) values
  ('tin_throwing_knife', 'Tin Throwing Knife', 'marksman', 1, 0, 0, 3, 'marksman', 1, 0, 1, false, true, 6),
  ('copper_throwing_knife', 'Copper Throwing Knife', 'marksman', 2, 0, 0, 3, 'marksman', 11, 0, 2, false, true, 6)
on conflict (id) do update set name = excluded.name, slot = excluded.slot, damage = excluded.damage, accuracy = excluded.accuracy,
  defence = excluded.defence, speed = excluded.speed, needs_skill = excluded.needs_skill, needs_level = excluded.needs_level,
  heal = excluded.heal, value = excluded.value, quest = excluded.quest, stack = excluded.stack, range = excluded.range;

insert into public.crafts (id, station_kind, skill, level, xp, ticks, inputs, amount) values
  ('tin_throwing_knife', 'bench', 'tinkering', 1, 3, 4, '{"tin_sheet": 1}', 5),
  ('copper_throwing_knife', 'bench', 'tinkering', 11, 6, 4, '{"copper_sheet": 1}', 5)
on conflict (id) do update set station_kind = excluded.station_kind, skill = excluded.skill, level = excluded.level, xp = excluded.xp,
  ticks = excluded.ticks, inputs = excluded.inputs, amount = excluded.amount;

insert into public.shop_items (shop, item, price, amount) values
  ('weapons', 'tin_throwing_knife', 150, 5), ('weapons', 'copper_throwing_knife', 300, 5)
on conflict (shop, item) do update set price = excluded.price, amount = excluded.amount;

-- Bag slots in use: a stack takes one slot for every 1,000 (or part of it); everything else one each.
create or replace function game.bag_used(inv jsonb)
returns integer
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(case when coalesce(it.stack, false) then ceil(e.value::int / 1000.0)::int else e.value::int end), 0)::int
  from jsonb_each_text(coalesce(inv, '{}'::jsonb)) e left join public.items it on it.id = e.key
$$;

-- ---------- 3. Line of sight: the map's walls and enclosures (printed by scripts/marksman-sql.ts) ----------
create table if not exists game.shot_walls (x0 int not null, y0 int not null, x1 int not null, y1 int not null);
create table if not exists game.shot_enclosures (ord int primary key, id text not null, x0 int not null, y0 int not null, x1 int not null, y1 int not null);
alter table game.shot_walls enable row level security;
alter table game.shot_enclosures enable row level security;
revoke all on game.shot_walls, game.shot_enclosures from public, anon, authenticated;
truncate game.shot_walls, game.shot_enclosures;
insert into game.shot_walls (x0, y0, x1, y1) values
  (58, 7, 62, 8),
  (58, 9, 62, 11),
  (63, 7, 67, 8),
  (63, 9, 67, 11),
  (58, 12, 59, 16),
  (61, 12, 62, 16),
  (63, 12, 67, 13),
  (63, 14, 67, 16),
  (58, 24, 62, 26),
  (58, 27, 59, 28),
  (61, 27, 62, 28),
  (63, 29, 65, 33),
  (66, 29, 67, 33),
  (58, 41, 62, 42),
  (58, 44, 62, 45),
  (63, 41, 67, 45),
  (75, 7, 76, 11),
  (78, 7, 79, 11),
  (80, 7, 84, 9),
  (80, 10, 81, 11),
  (83, 10, 84, 11),
  (75, 24, 77, 28),
  (78, 24, 79, 28),
  (92, 7, 96, 8),
  (92, 10, 96, 11),
  (92, 12, 96, 13),
  (92, 15, 96, 16),
  (97, 12, 99, 16),
  (100, 12, 101, 16),
  (92, 41, 96, 42),
  (92, 43, 96, 45),
  (97, 41, 101, 43),
  (97, 44, 98, 45),
  (100, 44, 101, 45),
  (7, 7, 8, 11),
  (10, 7, 11, 11),
  (12, 7, 16, 9),
  (12, 10, 13, 11),
  (15, 10, 16, 11),
  (7, 12, 9, 16),
  (10, 12, 11, 16),
  (12, 12, 16, 16),
  (7, 24, 9, 28),
  (10, 24, 11, 28),
  (12, 24, 16, 25),
  (12, 26, 16, 28),
  (7, 29, 8, 33),
  (10, 29, 11, 33),
  (12, 29, 16, 30),
  (12, 32, 16, 33),
  (24, 12, 25, 16),
  (27, 12, 28, 16),
  (29, 12, 30, 16),
  (32, 12, 33, 16),
  (24, 24, 25, 28),
  (27, 24, 28, 28),
  (29, 24, 33, 25),
  (29, 27, 33, 28),
  (24, 29, 28, 33),
  (29, 29, 33, 31),
  (29, 32, 30, 33),
  (32, 32, 33, 33),
  (41, 41, 45, 43),
  (41, 44, 42, 45),
  (44, 44, 45, 45),
  (46, 41, 50, 45),
  (41, 46, 45, 48),
  (41, 49, 42, 50),
  (44, 49, 45, 50),
  (46, 46, 50, 50),
  (109, 7, 113, 8),
  (109, 9, 113, 11),
  (114, 7, 118, 8),
  (114, 9, 118, 11),
  (109, 12, 113, 13),
  (109, 15, 113, 16),
  (114, 12, 115, 16),
  (117, 12, 118, 16),
  (109, 24, 113, 28),
  (114, 24, 118, 26),
  (114, 27, 115, 28),
  (117, 27, 118, 28),
  (109, 29, 113, 33),
  (114, 29, 116, 33),
  (117, 29, 118, 33),
  (109, 41, 113, 42),
  (109, 43, 113, 45),
  (114, 41, 115, 45),
  (117, 41, 118, 45),
  (109, 46, 111, 50),
  (112, 46, 113, 50),
  (114, 46, 118, 47),
  (114, 49, 118, 50),
  (126, 7, 127, 11),
  (129, 7, 130, 11),
  (131, 7, 135, 9),
  (131, 10, 132, 11),
  (134, 10, 135, 11),
  (126, 12, 128, 16),
  (129, 12, 130, 16),
  (131, 12, 135, 14),
  (131, 15, 132, 16),
  (134, 15, 135, 16),
  (126, 41, 130, 42),
  (126, 44, 130, 45),
  (131, 41, 135, 42),
  (131, 44, 135, 45),
  (126, 46, 128, 50),
  (129, 46, 130, 50),
  (131, 46, 132, 50),
  (134, 46, 135, 50),
  (143, 7, 144, 11),
  (146, 7, 147, 11),
  (148, 7, 152, 11),
  (143, 12, 145, 16),
  (146, 12, 147, 16),
  (148, 12, 152, 13),
  (148, 14, 152, 16),
  (143, 24, 147, 25),
  (143, 27, 147, 28),
  (148, 24, 152, 28),
  (143, 29, 144, 33),
  (146, 29, 147, 33),
  (148, 29, 152, 30),
  (148, 32, 152, 33),
  (143, 41, 144, 45),
  (146, 41, 147, 45),
  (148, 41, 152, 42),
  (148, 43, 152, 45),
  (143, 46, 147, 50),
  (148, 46, 152, 47),
  (148, 49, 152, 50),
  (24, 41, 28, 50),
  (92, 46, 96, 50),
  (58, 46, 59, 50),
  (66, 46, 67, 50);
insert into game.shot_enclosures (ord, id, x0, y0, x1, y1) values
  (0, 'store', 75, 12, 79, 16),
  (1, 'candy', 75, 29, 79, 33),
  (2, 'bar', 58, 29, 62, 33),
  (3, 'gas', 92, 24, 96, 27),
  (4, 'weapons', 80, 12, 84, 16),
  (5, 'hospital', 80, 29, 84, 33),
  (6, 'factory', 41, 7, 50, 19),
  (7, 'factory_lot', 41, 20, 50, 33),
  (8, 'bank', 126, 24, 135, 32),
  (9, 'hotline_yard', 29, 41, 33, 50),
  (10, 'junkyard', 7, 41, 16, 50),
  (11, 'club', 24, 7, 33, 11),
  (12, 'thrift_yard', 97, 46, 101, 50),
  (13, 'ward', 80, 24, 84, 28),
  (14, 'court', 63, 24, 67, 28);

-- Which enclosure a tile is in (the first that holds it), or null outside them all.
create or replace function game.enclosure_at(x integer, y integer)
returns text
language sql
stable
set search_path = pg_catalog, game
as $$
  select id from game.shot_enclosures where x between x0 and x1 and y between y0 and y1 order by ord limit 1
$$;

-- Can a throw pass through tile (x, y), thrown from inside enclosure `home` (or null)?
create or replace function game.shot_open(x integer, y integer, home text)
returns boolean
language sql
stable
set search_path = pg_catalog, game
as $$
  select game.on_map(x, y)
     and not exists (select 1 from game.shot_walls w where x between w.x0 and w.x1 and y between w.y0 and w.y1)
     and game.enclosure_at(x, y) is not distinct from home
$$;

-- Can you throw from tile (x0, y0) at tile (x1, y1)? Every tile the straight line touches must be open; where it
-- passes exactly through a corner, both tiles beside the corner too. Whole numbers only: the same steps as
-- shotLine/clearShot in src/street/sight.ts.
create or replace function game.clear_shot(x0 integer, y0 integer, x1 integer, y1 integer)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, game
as $$
declare
  nx int := abs(x1 - x0);
  ny int := abs(y1 - y0);
  sx int := sign(x1 - x0)::int;
  sy int := sign(y1 - y0)::int;
  px int := x0;
  py int := y0;
  ix int := 0;
  iy int := 0;
  d int;
  home text := game.enclosure_at(x0, y0);
begin
  while ix < nx or iy < ny loop
    d := (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if d = 0 then
      if not game.shot_open(px + sx, py, home) or not game.shot_open(px, py + sy, home) then return false; end if;
      px := px + sx; py := py + sy; ix := ix + 1; iy := iy + 1;
    elsif d < 0 then
      px := px + sx; ix := ix + 1;
    else
      py := py + sy; iy := iy + 1;
    end if;
    if not game.shot_open(px, py, home) then return false; end if;
  end loop;
  return true;
end $$;

revoke execute on function game.enclosure_at(integer, integer) from public, anon, authenticated;
revoke execute on function game.shot_open(integer, integer, text) from public, anon, authenticated;
revoke execute on function game.clear_shot(integer, integer, integer, integer) from public, anon, authenticated;

-- ---------- 4. Equipping: the Marksman slot holds a whole stack; your style picks melee or Marksman ----------
create or replace function public.equip_item(p_item text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  it public.items;
  have int;
  old text;
  inv jsonb;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into it from public.items where id = p_item;
  have := coalesce((p.inventory ->> p_item)::int, 0);
  if it.id is null or it.slot is null or have <= 0 then return game.respond(p.id, false, 'cant_equip', null, null); end if;
  if it.needs_skill is not null and game.level_from_xp(case it.needs_skill when 'melee' then p.melee_xp when 'marksman' then p.marksman_xp else p.defense_xp end) < it.needs_level then
    return game.respond(p.id, false, 'level_too_low', null, null);
  end if;
  if it.slot = 'marksman' then
    -- v0.51: throwing knives: the whole stack moves into the Marksman slot (adding to it if it's the same kind; the
    -- other kind goes back to the bag), and you switch to throwing.
    inv := p.inventory - p_item;
    old := p.equipment ->> 'marksman';
    if old = p_item then
      have := have + p.marksman_count;
    elsif old is not null and p.marksman_count > 0 then
      inv := jsonb_set(inv, array[old], to_jsonb(coalesce((inv ->> old)::int, 0) + p.marksman_count));
      if game.bag_used(inv) > game.bag_slots() then return game.respond(p.id, false, 'bag_full', null, null); end if;
    end if;
    update public.players set inventory = inv, equipment = jsonb_set(equipment, '{marksman}', to_jsonb(it.id)),
      marksman_count = have, fight_style = 'marksman', updated_at = now() where id = p.id;
    return game.respond(p.id, true, null, null, jsonb_build_array(format('You ready %s %s.', have, lower(regexp_replace(it.name, 'fe$', 'ves')))));
  end if;
  inv := case when have = 1 then p.inventory - p_item else jsonb_set(p.inventory, array[p_item], to_jsonb(have - 1)) end;
  old := p.equipment ->> it.slot;
  if old is not null then
    inv := jsonb_set(inv, array[old], to_jsonb(coalesce((inv ->> old)::int, 0) + 1));
    if game.bag_used(inv) > game.bag_slots() then return game.respond(p.id, false, 'bag_full', null, null); end if;
  end if;
  -- Wielding a melee weapon switches you to melee.
  update public.players set inventory = inv, equipment = jsonb_set(equipment, array[it.slot], to_jsonb(it.id)),
    fight_style = case when it.slot = 'weapon' then 'melee' else fight_style end, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, jsonb_build_array(format('You equip the %s.', it.name)));
end $function$;

create or replace function public.unequip_item(p_slot text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  item text;
  inv jsonb;
  n int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  item := p.equipment ->> p_slot;
  if item is null then return game.respond(p.id, false, 'nothing_there', null, null); end if;
  -- v0.51: the Marksman slot's whole stack goes back in the bag, and you're back to melee.
  n := case when p_slot = 'marksman' then p.marksman_count else 1 end;
  inv := case when n > 0 then jsonb_set(p.inventory, array[item], to_jsonb(coalesce((p.inventory ->> item)::int, 0) + n)) else p.inventory end;
  if game.bag_used(inv) > game.bag_slots() then return game.respond(p.id, false, 'bag_full', null, null); end if;
  update public.players set inventory = inv, equipment = equipment - p_slot,
    marksman_count = case when p_slot = 'marksman' then 0 else marksman_count end,
    fight_style = case when p_slot = 'marksman' then 'melee' else fight_style end, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $function$;

-- Melee or Marksman: which of your weapons you fight with (the toggle on the screen). Allowed mid-fight.
create or replace function public.set_fight_style(p_style text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  if p_style is null or p_style not in ('melee', 'marksman') then return game.respond(p.id, false, 'bad_style', null, null); end if;
  if p_style = 'marksman' and (p.equipment ->> 'marksman' is null or p.marksman_count <= 0) then return game.respond(p.id, false, 'no_ammo', null, null); end if;
  update public.players set fight_style = p_style, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $function$;
revoke execute on function public.set_fight_style(text) from public, anon;
grant execute on function public.set_fight_style(text) to authenticated;

-- ---------- 5. Buying packs, making several, selling stacks ----------
create or replace function public.buy_item(p_item text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  v_shop text;
  v_price int;
  v_amount int;
  inv jsonb;
  v_name text;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  v_shop := case when p.pos_x between 80 and 84 and p.pos_y between 12 and 16 then 'weapons' end;
  if v_shop is null then return game.respond(p.id, false, 'not_in_shop', null, null); end if;
  select price, amount into v_price, v_amount from public.shop_items where shop = v_shop and item = p_item;
  if v_price is null then return game.respond(p.id, false, 'not_for_sale', null, null); end if;
  if p.cash < v_price then return game.respond(p.id, false, 'not_enough_cash', null, null); end if;
  inv := jsonb_set(p.inventory, array[p_item], to_jsonb(coalesce((p.inventory ->> p_item)::int, 0) + v_amount));
  if game.bag_used(inv) > game.bag_slots() then return game.respond(p.id, false, 'bag_full', null, null); end if;
  update public.players set cash = cash - v_price, inventory = inv, updated_at = now() where id = p.id;
  select name into v_name from public.items where id = p_item;
  return game.respond(p.id, true, null, null, jsonb_build_array(case when v_amount > 1
    then format('You buy %s %s for $%s.', v_amount, regexp_replace(v_name, 'fe$', 'ves'), v_price)
    else format('You buy the %s for $%s.', v_name, v_price) end));
end $function$;

create or replace function public.make_step()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  c public.crafts;
  i record;
  enough boolean;
  lv0 int;
  n int := 0;
  v_name text;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  if p.make_craft is null then perform game.save(p); return game.respond(p.id, false, 'no_making', rep, logs); end if;
  -- Doing something else stops it.
  if p.job_crime is not null or p.fight_enemy is not null or p.caught_crime is not null or p.cook_item is not null then
    p.make_craft := null; p.make_next := null;
    perform game.save(p); return game.respond(p.id, false, 'no_making', rep, logs);
  end if;
  if p.make_next > now() then perform game.save(p); return game.respond(p.id, false, 'not_yet', rep, logs); end if;
  select * into c from public.crafts where id = p.make_craft;
  select name into v_name from public.items where id = c.id;
  lv0 := game.level_from_xp(p.tinkering_xp);
  while p.make_craft is not null and p.make_next <= now() and n < 60 loop
    n := n + 1;
    enough := c.id is not null;
    for i in select key, value::int as k from jsonb_each_text(coalesce(c.inputs, '{}'::jsonb)) loop
      if coalesce((p.inventory ->> i.key)::int, 0) < i.k then enough := false; end if;
    end loop;
    if not enough then
      p.make_craft := null; p.make_next := null;
      exit;
    end if;
    for i in select key, value::int as k from jsonb_each_text(c.inputs) loop
      p.inventory := case when (p.inventory ->> i.key)::int = i.k then p.inventory - i.key
                          else jsonb_set(p.inventory, array[i.key], to_jsonb((p.inventory ->> i.key)::int - i.k)) end;
    end loop;
    -- v0.51: some crafts make several (5 throwing knives from a sheet). They stack, so they never need more room
    -- than the sheet they're made from.
    p.inventory := jsonb_set(p.inventory, array[c.id], to_jsonb(coalesce((p.inventory ->> c.id)::int, 0) + c.amount));
    p.tinkering_xp := p.tinkering_xp + c.xp;
    rep := jsonb_set(rep, '{xp,tinkering}', to_jsonb(coalesce((rep -> 'xp' ->> 'tinkering')::numeric, 0) + c.xp));
    rep := jsonb_set(rep, array['items', c.id], to_jsonb(coalesce((rep -> 'items' ->> c.id)::int, 0) + c.amount));
    logs := logs || to_jsonb(case when c.amount > 1
      then format('You make %s %s. +%s XP', c.amount, lower(regexp_replace(v_name, 'fe$', 'ves')), c.xp)
      else format('You %s a %s. +%s XP', case c.station_kind when 'press' then 'press' else 'make' end, lower(v_name), c.xp) end);
    p.make_next := p.make_next + make_interval(secs => c.ticks * 0.5);
  end loop;
  -- Enough left for the next one?
  if p.make_craft is not null then
    for i in select key, value::int as k from jsonb_each_text(c.inputs) loop
      if coalesce((p.inventory ->> i.key)::int, 0) < i.k then p.make_craft := null; p.make_next := null; end if;
    end loop;
  end if;
  if p.make_craft is null then logs := logs || to_jsonb('You have no materials left.'::text); end if;
  if game.level_from_xp(p.tinkering_xp) > lv0 then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'tinkering', 'level', game.level_from_xp(p.tinkering_xp)));
    logs := logs || to_jsonb(format('Tinkering reached level %s!', game.level_from_xp(p.tinkering_xp)));
  end if;
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs);
end $function$;

create or replace function public.sell_item(p_item text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  -- A quarter of the value, at least $1; but a stack gets no $1 minimum (v0.51: five $1 throwing knives must not sell
  -- for more than the $5 sheet they're made from), so they don't sell at all.
  price int := coalesce((select (case when i.value <= 0 then 0 when i.stack then floor(i.value * 0.25) else greatest(1, floor(i.value * 0.25)) end)::int
                         from public.items i where i.id = p_item), 0);
  is_weapon boolean := exists (select 1 from public.items i where i.id = p_item and i.slot is not null);
  have int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  have := coalesce((p.inventory ->> p_item)::int, 0);
  if price = 0 or have <= 0 then return game.respond(p.id, false, 'nothing_to_sell', null, null); end if;
  if p.pos_x is null or not (p.pos_y between 12 and 16 and case when is_weapon then p.pos_x between 80 and 84 else p.pos_x between 75 and 79 end) then
    return game.respond(p.id, false, 'not_at_store', null, null);
  end if;
  update public.players set
    inventory = case when have = 1 then inventory - p_item else jsonb_set(inventory, array[p_item], to_jsonb(have - 1)) end,
    cash = cash + price,
    stats = jsonb_set(stats, '{earned}', to_jsonb(coalesce((stats ->> 'earned')::bigint, 0) + price)),
    updated_at = now()
  where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $function$;

-- ---------- 6. "Does it fit": check the bag after the change (a stack of 40 knives still takes one slot) ----------
do $do$
declare
  def text;
begin
  def := pg_get_functiondef('public.pick_up(bigint, integer, integer)'::regprocedure);
  if position('if game.bag_used(p.inventory) + g.amount > game.bag_slots() then' in def) = 0 then raise exception 'pick_up: anchor not found'; end if;
  execute replace(def, 'if game.bag_used(p.inventory) + g.amount > game.bag_slots() then',
    'if game.bag_used(jsonb_set(p.inventory, array[g.item], to_jsonb(coalesce((p.inventory ->> g.item)::int, 0) + g.amount))) > game.bag_slots() then');

  def := pg_get_functiondef('public.collect_grave()'::regprocedure);
  if position('if game.bag_used(inv) + (item.value)::int <= game.bag_slots() then' in def) = 0 then raise exception 'collect_grave: anchor not found'; end if;
  execute replace(def, 'if game.bag_used(inv) + (item.value)::int <= game.bag_slots() then',
    'if game.bag_used(jsonb_set(inv, array[item.key], to_jsonb(coalesce((inv ->> item.key)::int, 0) + (item.value)::int))) <= game.bag_slots() then');

  def := pg_get_functiondef('public.bank_withdraw(text, integer, integer, integer)'::regprocedure);
  if position('k := least(p_n::bigint, have, game.bag_slots() - game.bag_used(p.inventory));' in def) = 0 then raise exception 'bank_withdraw: anchor not found'; end if;
  execute replace(def, 'k := least(p_n::bigint, have, game.bag_slots() - game.bag_used(p.inventory));',
    'k := case when exists (select 1 from public.items it where it.id = p_item and it.stack)
           then least(p_n::bigint, have, (game.bag_slots() - game.bag_used(p.inventory))::bigint * 1000
                + (ceil(coalesce((p.inventory ->> p_item)::int, 0) / 1000.0) * 1000)::bigint - coalesce((p.inventory ->> p_item)::int, 0))
           else least(p_n::bigint, have, game.bag_slots() - game.bag_used(p.inventory)) end;');
end $do$;

-- ---------- 7. Fights at a distance ----------
-- Where an enemy in a fight is at time t: walking up to its fighter (from -> fight tile, 2.5 tiles/s), or there.
create or replace function game.enemy_tile(e public.enemies, t timestamptz, out x integer, out y integer)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  frac double precision;
begin
  x := e.fight_x; y := e.fight_y;
  if e.arrive_at is not null and t < e.arrive_at and e.from_x is not null then
    frac := 1 - extract(epoch from (e.arrive_at - t)) / greatest(0.001, sqrt(((e.fight_x - e.from_x) ^ 2 + (e.fight_y - e.from_y) ^ 2)::double precision) / 2.5);
    frac := least(1, greatest(0, frac));
    x := round(e.from_x + (e.fight_x - e.from_x) * frac)::int;
    y := round(e.from_y + (e.fight_y - e.from_y) * frac)::int;
  end if;
end $function$;

-- Put n of an item on the ground (yours for 60 s, then anyone's, gone after 3 min): onto your pile of it on that tile
-- if there is one (thrown knives land one by one), else a new pile.
create or replace function game.drop_on_ground(p_item text, p_n integer, p_x integer, p_y integer, p_owner uuid, p_at timestamptz)
 returns void
 language plpgsql
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  update public.ground_items set amount = amount + p_n, expires_at = greatest(expires_at, p_at + interval '180 seconds')
  where item = p_item and x = p_x and y = p_y and owner is not distinct from p_owner and expires_at > now();
  if not found then
    insert into public.ground_items (item, amount, x, y, owner, dropped_at, public_at, expires_at)
    values (p_item, p_n, p_x, p_y, p_owner, p_at, p_at + interval '60 seconds', p_at + interval '180 seconds');
  end if;
end $function$;
revoke execute on function game.enemy_tile(public.enemies, timestamptz) from public, anon, authenticated;
revoke execute on function game.drop_on_ground(text, integer, integer, integer, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.attack(p_enemy text, p_x integer, p_y integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  e public.enemies;
  k public.enemy_kinds;
  w public.items;
  pos record;
  ex double precision;
  ez double precision;
  dist double precision;
  reach double precision;
  ranged boolean;
  nx int; ny int; d int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  perform game.save(p);
  select * into e from public.enemies where id = p_enemy for update;
  if e.id is null then return game.respond(p.id, false, 'unknown_enemy', rep, logs); end if;
  select * into k from public.enemy_kinds where id = e.kind;
  if e.kind = 'giant_rat' and not coalesce(p.unlocked ? 'rat_nest', false) then return game.respond(p.id, false, 'locked', rep, logs); end if;
  if p.caught_crime is not null then return game.respond(p.id, false, 'caught', rep, logs); end if;
  if p.stunned_until > now() then return game.respond(p.id, false, 'stunned', rep, logs); end if;
  if e.dead_until > now() then return game.respond(p.id, false, 'enemy_dead', rep, logs); end if;
  if e.left_at > now() - interval '10 seconds' then return game.respond(p.id, false, 'enemy_returning', rep, logs); end if;
  if e.fighter is not null and e.fighter <> p.id and e.fight_seen > now() - interval '5 seconds' then
    return game.respond(p.id, false, 'enemy_busy', rep, logs);
  end if;
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  -- v0.51: you throw when your style is Marksman and the Marksman slot has knives left; otherwise it's melee.
  select * into w from public.items where id = p.equipment ->> 'marksman';
  ranged := p.fight_style = 'marksman' and w.range is not null and p.marksman_count > 0;
  if e.fighter = p.id and e.fight_seen > now() - interval '5 seconds' then
    ex := e.fight_x + 0.5; ez := e.fight_y + 0.5;
  else
    select * into pos from game.enemy_at(e.kind, e.idx, game.ms(now()));
    ex := pos.x; ez := pos.z;
  end if;
  dist := sqrt((p_x + 0.5 - ex) ^ 2 + (p_y + 0.5 - ez) ^ 2);
  -- Melee: next to it (2 tiles, as before). Ranged: up to its range + 1/2 tile, and nothing in the way.
  reach := case when ranged then w.range + 0.5 else 2.0 end;
  if dist > reach then return game.respond(p.id, false, 'too_far', rep, logs); end if;
  if ranged and dist > 2.0 and not game.clear_shot(p_x, p_y, floor(ex)::int, floor(ez)::int) then
    return game.respond(p.id, false, 'no_line_of_sight', rep, logs);
  end if;
  if e.fighter is distinct from p.id or e.fight_seen <= now() - interval '5 seconds' then
    if e.dead_until is not null or coalesce(e.last_hit_at, 'epoch') < now() - interval '10 seconds' then e.hp := k.hp; end if;
    e.dead_until := null;
    e.fighter := p.id;
    e.fight_x := floor(ex)::int;
    e.fight_y := floor(ez)::int;
    e.from_x := e.fight_x;
    e.from_y := e.fight_y;
    e.arrive_at := now();
    -- Hit from a distance: it walks up to you (to the first tile from you towards it, on the clear line) at
    -- 2.5 tiles/s, and only swings once it's there.
    if dist > 2.0 then
      nx := abs(e.from_x - p_x); ny := abs(e.from_y - p_y);
      d := ny - nx;
      e.fight_x := p_x + case when d <= 0 then sign(e.from_x - p_x)::int else 0 end;
      e.fight_y := p_y + case when d >= 0 then sign(e.from_y - p_y)::int else 0 end;
      e.arrive_at := now() + make_interval(secs => sqrt(((e.fight_x - e.from_x) ^ 2 + (e.fight_y - e.from_y) ^ 2)::double precision) / 2.5);
    end if;
    e.next_swing := e.arrive_at + make_interval(secs => k.speed * 0.5);
    p.fight_next := now();
    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));
  end if;
  e.fight_seen := now();
  update public.enemies set fighter = null where fighter = p.id and id <> e.id;
  update public.enemies set hp = e.hp, dead_until = e.dead_until, fighter = e.fighter, fight_x = e.fight_x, fight_y = e.fight_y,
    next_swing = e.next_swing, fight_seen = e.fight_seen, arrive_at = e.arrive_at, from_x = e.from_x, from_y = e.from_y where id = e.id;
  p.fight_enemy := e.id;
  p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
  p.pos_x := p_x; p.pos_y := p_y; p.pos_at := now();
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs) || jsonb_build_object('events', '[]'::jsonb);
end $function$;

create or replace function public.fight_step()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
  r record;
  e public.enemies;
  k public.enemy_kinds;
  w public.items;
  wr public.items;
  t timestamptz;
  dmg int;
  at_x int; at_y int;
  max_hit int;
  chance double precision;
  lv_melee int; lv_mark int; lv_def int; lv_hp int;
  lv_att int;
  n int := 0;
  ranged boolean;
  w_damage int; w_accuracy int; w_speed int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  if p.fight_enemy is null then
    perform game.save(p);
    return game.respond(p.id, true, 'no_fight', rep, logs) || jsonb_build_object('events', events);
  end if;
  select * into e from public.enemies where id = p.fight_enemy for update;
  select * into k from public.enemy_kinds where id = e.kind;
  if e.id is null or e.fighter is distinct from p.id or e.dead_until > now() or p.job_crime is not null
     or e.fight_seen < now() - interval '5 seconds' then
    if e.fighter = p.id then update public.enemies set fighter = null where id = e.id; end if;
    p.fight_enemy := null;
    perform game.save(p);
    return game.respond(p.id, true, 'fight_over', rep, logs) || jsonb_build_object('events', events);
  end if;

  -- The melee weapon (or fists) and the Marksman slot's knives; which one each turn uses follows your style.
  select * into w from public.items where id = p.equipment ->> 'weapon';
  select * into wr from public.items where id = p.equipment ->> 'marksman';
  lv_melee := game.level_from_xp(p.melee_xp); lv_mark := game.level_from_xp(p.marksman_xp);
  lv_def := game.level_from_xp(p.defense_xp); lv_hp := game.level_from_xp(p.health_xp);

  loop
    n := n + 1;
    exit when n > 40;
    t := least(p.fight_next, e.next_swing);
    exit when t > now();
    if p.fight_next <= e.next_swing then
      -- This turn: a throw (Marksman style with knives left) or a melee swing (your weapon, or fists). Out of knives
      -- in Marksman style: you switch to melee (your style goes back with it).
      if p.fight_style = 'marksman' and (wr.range is null or p.marksman_count <= 0) then
        p.fight_style := 'melee';
      end if;
      ranged := p.fight_style = 'marksman';
      if ranged then
        w_damage := coalesce(wr.damage, 1); w_accuracy := coalesce(wr.accuracy, 0); w_speed := coalesce(wr.speed, 3);
      else
        w_damage := coalesce(w.damage, 1); w_accuracy := coalesce(w.accuracy, 0); w_speed := coalesce(w.speed, 3);
      end if;
      -- A melee weapon can't reach it while it's still walking up to you (v0.51).
      if not ranged and e.arrive_at is not null and t < e.arrive_at then
        p.fight_next := e.arrive_at;
        continue;
      end if;
      if ranged then
        -- Each throw uses one knife from the Marksman slot; 1 in 3 lands where the target is, for you to pick up.
        p.marksman_count := p.marksman_count - 1;
        select * into at_x, at_y from game.enemy_tile(e, t);
        if random() < 1.0 / 3 then perform game.drop_on_ground(wr.id, 1, at_x, at_y, p.id, t); end if;
        if p.marksman_count <= 0 then
          logs := logs || to_jsonb(format('That was your last %s. You switch to melee.', lower(wr.name)));
          p.equipment := p.equipment - 'marksman';
          p.marksman_count := 0;
          p.fight_style := 'melee';
        end if;
      end if;
      lv_att := case when ranged then game.level_from_xp(p.marksman_xp) else game.level_from_xp(p.melee_xp) end;
      chance := game.hit_chance((lv_att + 8) * (w_accuracy + 64), (k.defense + 8) * (k.defence_bonus + 64));
      if random() < chance then
        max_hit := w_damage + floor((lv_att - 1) / 8);
        dmg := least(e.hp, 1 + floor(random() * max_hit)::int);
        e.hp := e.hp - dmg;
        e.last_hit_at := t;
        if ranged then p.marksman_xp := p.marksman_xp + dmg; else p.melee_xp := p.melee_xp + dmg; end if;
        p.defense_xp := p.defense_xp + dmg * 0.5;
        rep := game.bump(rep, 'damageDealt', dmg);
      else
        dmg := 0;
      end if;
      events := events || jsonb_build_object('at', game.ms(t), 'by', 'you', 'dmg', dmg);
      p.fight_next := t + make_interval(secs => w_speed * 0.5);
      if e.hp <= 0 then
        e.dead_until := t + make_interval(secs => k.respawn);
        e.fighter := null;
        p.fight_enemy := null;
        logs := logs || to_jsonb(format('You killed the %s.', lower(k.name)));
        -- Killed on its way to you: it drops where it fell, part-way along.
        select * into at_x, at_y from game.enemy_tile(e, t);
        perform game.drop_loot(k.id, at_x, at_y, p.id, t);
        events := events || jsonb_build_object('at', game.ms(t), 'by', 'you', 'killed', true);
        exit;
      end if;
    else
      chance := game.hit_chance((k.attack + 8) * 64, (game.level_from_xp(p.defense_xp) + 8) * (game.armour_bonus(p.equipment) + 64));
      if random() < chance then
        dmg := 1 + floor(random() * k.max_hit)::int;
        p.hp := greatest(0, game.hp_now(p, t) - dmg);
        p.hp_at := game.hp_anchor(p, t);
        p.health_xp := p.health_xp + dmg;
        p.defense_xp := p.defense_xp + dmg * 0.5;
        rep := game.bump(rep, 'damage', dmg);
        rep := jsonb_set(rep, '{hit}', 'true'::jsonb);
      else
        dmg := 0;
      end if;
      events := events || jsonb_build_object('at', game.ms(t), 'by', 'enemy', 'dmg', dmg);
      e.next_swing := t + make_interval(secs => k.speed * 0.5);
      if p.hp <= 0 then
        select * into r from game.die(p, t, rep, logs);
        p := r.p; rep := r.rep; logs := r.logs;
        e.fighter := null;
        p.fight_enemy := null;
        exit;
      end if;
    end if;
  end loop;

  if game.level_from_xp(p.melee_xp) > lv_melee then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'melee', 'level', game.level_from_xp(p.melee_xp)));
    logs := logs || to_jsonb(format('Melee reached level %s!', game.level_from_xp(p.melee_xp)));
  end if;
  if game.level_from_xp(p.marksman_xp) > lv_mark then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'marksman', 'level', game.level_from_xp(p.marksman_xp)));
    logs := logs || to_jsonb(format('Marksman reached level %s!', game.level_from_xp(p.marksman_xp)));
  end if;
  if game.level_from_xp(p.defense_xp) > lv_def then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'defense', 'level', game.level_from_xp(p.defense_xp)));
    logs := logs || to_jsonb(format('Defense reached level %s!', game.level_from_xp(p.defense_xp)));
  end if;
  if game.level_from_xp(p.health_xp) > lv_hp then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'health', 'level', game.level_from_xp(p.health_xp)));
    logs := logs || to_jsonb(format('Health reached level %s!', game.level_from_xp(p.health_xp)));
  end if;

  e.fight_seen := now();
  update public.enemies set hp = e.hp, dead_until = e.dead_until, fighter = e.fighter, next_swing = e.next_swing,
    last_hit_at = e.last_hit_at, fight_seen = e.fight_seen where id = e.id;
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs) || jsonb_build_object('events', events);
end $function$;

-- The enemies as the game sees them: plus, while one walks up to its fighter, where from and when it arrives.
do $do$
declare
  def text := pg_get_functiondef('game.enemies_json()'::regprocedure);
  anchor text := $t$    'returning', case$t$;
begin
  if position(anchor in def) = 0 then raise exception 'enemies_json: anchor not found'; end if;
  execute replace(def, anchor, $t$    'approach', case when e.fighter is not null and e.fight_seen > now() - interval '5 seconds' and e.arrive_at > now()
      then jsonb_build_object('from', jsonb_build_array(e.from_x, e.from_y), 'arriveAt', game.ms(e.arrive_at)) end,
$t$ || anchor);
end $do$;

-- ---------- Checks: each should say "ok" ----------
select
  case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname in ('public', 'game') and p.prokind = 'f'
                          and case when p.prokind = 'f' then pg_get_functiondef(p.oid) like '%gunfire_xp%' else false end)
   and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'marksman_xp')
  then 'ok' else 'NOT RENAMED' end as rename,
  case when game.bag_used('{"tin_throwing_knife": 40, "tin_sheet": 2}') = 3 and game.bag_used('{"tin_throwing_knife": 2500}') = 3 then 'ok' else 'BAD BAG' end as stacks,
  case when (select count(*) from game.shot_walls) > 100 and (select count(*) from game.shot_enclosures) = 15 then 'ok' else 'NO MAP' end as map_rows,
  -- In the park (008, x 75-84): clear. Junkyard (I-007, x 7-16) from the street east of it: blocked by the fence.
  case when game.clear_shot(76, 42, 81, 46) and not game.clear_shot(18, 43, 15, 43) and game.clear_shot(12, 43, 15, 43) then 'ok' else 'BAD SIGHT' end as sight,
  case when (select price from public.shop_items where item = 'tin_throwing_knife') = 150
   and (select amount from public.crafts where id = 'copper_throwing_knife') = 5
   and (public.get_highscores('marksman', 5) ->> 'ok')::boolean
  then 'ok' else 'NOT APPLIED' end as knives;

commit;
