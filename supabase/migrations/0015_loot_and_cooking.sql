-- 0015: loot on the ground, raw bird meat, the barbecue and the Cooking skill (docs/design.md §13).
--
-- New tables (RLS on, no policies: only these game functions read or write them; the app gets what it may see
-- through game.respond):
--  - loot: what each kind of enemy drops (item or 'cash', chance, amount). Pigeons: raw bird meat, always.
--  - ground_items: loot lying on the ground. Only the killer sees it for 60 s, then everyone; gone after 3 min.
--  - stations: where you can cook (the barbecue on 003-B; same as STATIONS in src/street/map.ts).
--  - recipes: raw → cooked, the Cooking level, XP, and the level where you stop burning it.
-- New columns on players: cooking_xp, cook_item / cook_next (what you're cooking and when the next one is done).
-- New functions: pick_up, start_cook, cook_step, stop_cook (and helpers game.drop_loot, game.ground_json).
-- Changed (lines swapped in their live definitions): fight_step drops loot on a kill; game.respond sends Cooking,
-- what you're cooking and the ground items; game.save saves them; get_highscores knows Cooking; eat_item takes how
-- much food heals from the items table (so new food just works).
-- Additive: nothing is removed or reset.

-- ---------- players ----------
alter table public.players add column if not exists cooking_xp bigint not null default 0;
alter table public.players add column if not exists cook_item text;
alter table public.players add column if not exists cook_next timestamptz;

-- ---------- items ----------
insert into public.items (id, name, slot, damage, accuracy, defence, speed, needs_skill, needs_level, heal, value) values
  ('raw_bird_meat', 'Raw Bird Meat', null, 0, 0, 0, null, null, 1, 0, 2),
  ('cooked_bird_meat', 'Cooked Bird Meat', null, 0, 0, 0, null, null, 1, 1, 4)
on conflict (id) do update set name = excluded.name, heal = excluded.heal, value = excluded.value;

-- ---------- loot tables ----------
create table if not exists public.loot (
  id bigserial primary key,
  enemy_kind text not null references public.enemy_kinds (id),
  item text not null,                                   -- an item id, or 'cash' (dollars)
  chance numeric not null check (chance > 0 and chance <= 1),
  min_amount int not null default 1 check (min_amount >= 1),
  max_amount int not null default 1,
  check (max_amount >= min_amount)
);
alter table public.loot enable row level security;
insert into public.loot (enemy_kind, item, chance)
select 'pigeon', 'raw_bird_meat', 1 where not exists (select 1 from public.loot where enemy_kind = 'pigeon' and item = 'raw_bird_meat');

-- ---------- items on the ground ----------
create table if not exists public.ground_items (
  id bigserial primary key,
  item text not null,
  amount int not null default 1,
  x int not null,
  y int not null,
  owner uuid references public.players (id) on delete cascade,
  dropped_at timestamptz not null default now(),
  public_at timestamptz not null,
  expires_at timestamptz not null
);
create index if not exists ground_items_expires on public.ground_items (expires_at);
alter table public.ground_items enable row level security;

-- ---------- cooking ----------
create table if not exists public.stations (
  id text primary key,
  kind text not null,
  x int not null,
  y int not null
);
alter table public.stations enable row level security;
insert into public.stations (id, kind, x, y) values ('bbq_0', 'bbq', 48, 9)
on conflict (id) do update set kind = excluded.kind, x = excluded.x, y = excluded.y;

create table if not exists public.recipes (
  item_from text primary key references public.items (id),
  item_to text not null references public.items (id),
  station_kind text not null,
  level int not null default 1,
  xp int not null,
  stop_burn_level int not null
);
alter table public.recipes enable row level security;
insert into public.recipes (item_from, item_to, station_kind, level, xp, stop_burn_level)
values ('raw_bird_meat', 'cooked_bird_meat', 'bbq', 1, 5, 15)
on conflict (item_from) do update set item_to = excluded.item_to, station_kind = excluded.station_kind, level = excluded.level,
  xp = excluded.xp, stop_burn_level = excluded.stop_burn_level;

-- ---------- helpers ----------
-- Roll an enemy's loot table and put what drops on the ground where it died, for its killer (everyone after 60 s).
create or replace function game.drop_loot(p_kind text, p_x int, p_y int, p_owner uuid, p_at timestamptz) returns void
language plpgsql set search_path = pg_catalog, public as $$
declare
  l record;
begin
  delete from public.ground_items where expires_at <= now();
  for l in select * from public.loot where enemy_kind = p_kind loop
    if random() < l.chance then
      insert into public.ground_items (item, amount, x, y, owner, dropped_at, public_at, expires_at)
      values (l.item, l.min_amount + floor(random() * (l.max_amount - l.min_amount + 1))::int, p_x, p_y, p_owner, p_at,
              p_at + interval '60 seconds', p_at + interval '180 seconds');
    end if;
  end loop;
end $$;
revoke execute on function game.drop_loot(text, int, int, uuid, timestamptz) from public, anon, authenticated;

-- What's on the ground that this player can see.
create or replace function game.ground_json(uid uuid) returns jsonb
language sql stable set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'item', g.item, 'amount', g.amount, 'x', g.x, 'y', g.y,
           'mine', g.owner is not distinct from uid) order by g.id), '[]'::jsonb)
  from public.ground_items g
  where g.expires_at > now() and (g.owner is null or g.owner = uid or g.public_at <= now())
$$;
revoke execute on function game.ground_json(uuid) from public, anon, authenticated;

-- ---------- picking things up ----------
create or replace function public.pick_up(p_id bigint, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  g public.ground_items;
  v_name text;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  if not game.can_reach(p, p_x, p_y) then perform game.save(p); return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  select * into g from public.ground_items where id = p_id for update;
  if g.id is null or g.expires_at <= now() or not (g.owner is null or g.owner = p.id or g.public_at <= now()) then
    perform game.save(p);
    return game.respond(p.id, false, 'gone', rep, logs);
  end if;
  -- You stand on it or right next to it.
  if greatest(abs(p_x - g.x), abs(p_y - g.y)) > 1 then perform game.save(p); return game.respond(p.id, false, 'too_far_away', rep, logs); end if;
  if g.item = 'cash' then
    p.cash := p.cash + g.amount;
    logs := logs || to_jsonb(format('You pick up $%s.', g.amount));
  else
    if game.bag_used(p.inventory) + g.amount > 27 then perform game.save(p); return game.respond(p.id, false, 'bag_full', rep, logs); end if;
    p.inventory := jsonb_set(p.inventory, array[g.item], to_jsonb(coalesce((p.inventory ->> g.item)::int, 0) + g.amount));
    select name into v_name from public.items where id = g.item;
    logs := logs || to_jsonb(format('You pick up the %s.', lower(coalesce(v_name, g.item))));
  end if;
  delete from public.ground_items where id = g.id;
  p.pos_x := p_x; p.pos_y := p_y; p.pos_at := now();
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs);
end $$;
grant execute on function public.pick_up(bigint, int, int) to authenticated;
revoke execute on function public.pick_up(bigint, int, int) from public, anon;

-- ---------- cooking: start, catch up (one item a second), stop ----------
create or replace function public.start_cook(p_item text, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  rc public.recipes;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  if p.job_crime is not null or p.caught_crime is not null or p.fight_enemy is not null then
    perform game.save(p); return game.respond(p.id, false, 'busy', rep, logs);
  end if;
  if p.stunned_until > now() then perform game.save(p); return game.respond(p.id, false, 'stunned', rep, logs); end if;
  if not game.can_reach(p, p_x, p_y) then perform game.save(p); return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  select * into rc from public.recipes where item_from = p_item;
  if rc.item_from is null then perform game.save(p); return game.respond(p.id, false, 'cant_cook', rep, logs); end if;
  if not exists (select 1 from public.stations s where s.kind = rc.station_kind and greatest(abs(p_x - s.x), abs(p_y - s.y)) <= 1) then
    perform game.save(p); return game.respond(p.id, false, 'not_near_station', rep, logs);
  end if;
  if coalesce((p.inventory ->> p_item)::int, 0) <= 0 then perform game.save(p); return game.respond(p.id, false, 'nothing_to_cook', rep, logs); end if;
  if game.level_from_xp(p.cooking_xp) < rc.level then perform game.save(p); return game.respond(p.id, false, 'level_too_low', rep, logs); end if;
  p.cook_item := p_item;
  p.cook_next := now() + interval '1 second';   -- 2 ticks per item
  p.pos_x := p_x; p.pos_y := p_y; p.pos_at := now();
  logs := logs || to_jsonb('You start cooking.'::text);
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs);
end $$;
grant execute on function public.start_cook(text, int, int) to authenticated;
revoke execute on function public.start_cook(text, int, int) from public, anon;

create or replace function public.cook_step()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  rc public.recipes;
  have int;
  lv int;
  lv0 int;
  burn numeric;
  n int := 0;
  v_food text;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  if p.cook_item is null then perform game.save(p); return game.respond(p.id, false, 'no_cooking', rep, logs); end if;
  -- Doing something else stops the cooking.
  if p.job_crime is not null or p.fight_enemy is not null or p.caught_crime is not null then
    p.cook_item := null; p.cook_next := null;
    perform game.save(p); return game.respond(p.id, false, 'no_cooking', rep, logs);
  end if;
  if p.cook_next > now() then perform game.save(p); return game.respond(p.id, false, 'not_yet', rep, logs); end if;
  select * into rc from public.recipes where item_from = p.cook_item;
  select lower(replace(i.name, 'Raw ', '')) into v_food from public.items i where i.id = p.cook_item;
  lv0 := game.level_from_xp(p.cooking_xp);
  -- Every item that's done by now (one a second), at most a bag full.
  while p.cook_item is not null and p.cook_next <= now() and n < 28 loop
    n := n + 1;
    have := coalesce((p.inventory ->> p.cook_item)::int, 0);
    if rc.item_from is null or have <= 0 then
      p.cook_item := null; p.cook_next := null;
      exit;
    end if;
    p.inventory := case when have = 1 then p.inventory - rc.item_from else jsonb_set(p.inventory, array[rc.item_from], to_jsonb(have - 1)) end;
    lv := game.level_from_xp(p.cooking_xp);
    -- 50% at the recipe's level, less every level, never from stop_burn_level (same as src/game/data/recipes.ts).
    burn := case when lv >= rc.stop_burn_level then 0
                 else greatest(0, 0.5 * (rc.stop_burn_level - lv)::numeric / greatest(1, rc.stop_burn_level - rc.level)) end;
    if random() < burn then
      logs := logs || to_jsonb(format('You accidentally burn the %s.', v_food));
    else
      p.inventory := jsonb_set(p.inventory, array[rc.item_to], to_jsonb(coalesce((p.inventory ->> rc.item_to)::int, 0) + 1));
      p.cooking_xp := p.cooking_xp + rc.xp;
      rep := jsonb_set(rep, '{xp,cooking}', to_jsonb(coalesce((rep -> 'xp' ->> 'cooking')::numeric, 0) + rc.xp));
      logs := logs || to_jsonb(format('You cook the %s.', v_food));
    end if;
    p.cook_next := p.cook_next + interval '1 second';
  end loop;
  if p.cook_item is not null and coalesce((p.inventory ->> p.cook_item)::int, 0) <= 0 then
    p.cook_item := null; p.cook_next := null;
  end if;
  if p.cook_item is null then logs := logs || to_jsonb('You have nothing left to cook.'::text); end if;
  if game.level_from_xp(p.cooking_xp) > lv0 then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'cooking', 'level', game.level_from_xp(p.cooking_xp)));
    logs := logs || to_jsonb(format('Cooking reached level %s!', game.level_from_xp(p.cooking_xp)));
  end if;
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs);
end $$;
grant execute on function public.cook_step() to authenticated;
revoke execute on function public.cook_step() from public, anon;

create or replace function public.stop_cook()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  update public.players set cook_item = null, cook_next = null, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $$;
grant execute on function public.stop_cook() to authenticated;
revoke execute on function public.stop_cook() from public, anon;

-- ---------- existing functions: only the changed lines (taken from their live definitions) ----------
do $do$
declare def text;
begin
  -- game.save: also save Cooking and what you're cooking.
  def := pg_get_functiondef('game.save(public.players)'::regprocedure);
  if position('fight_enemy = p.fight_enemy, fight_next = p.fight_next, updated_at = now()' in def) = 0 then raise exception 'save: anchor not found'; end if;
  def := replace(def, 'fight_enemy = p.fight_enemy, fight_next = p.fight_next, updated_at = now()',
    'fight_enemy = p.fight_enemy, fight_next = p.fight_next, cooking_xp = p.cooking_xp, cook_item = p.cook_item, cook_next = p.cook_next, updated_at = now()');
  execute def;

  -- game.respond: Cooking in the skills, what you're cooking, and the ground items you can see.
  def := pg_get_functiondef('game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure);
  if position('''health'', jsonb_build_object(''xp'', p.health_xp))' in def) = 0 then raise exception 'respond: skills anchor not found'; end if;
  def := replace(def, '''health'', jsonb_build_object(''xp'', p.health_xp))',
    '''health'', jsonb_build_object(''xp'', p.health_xp), ''cooking'', jsonb_build_object(''xp'', p.cooking_xp))');
  if position('''fight'', case when p.fight_enemy is null then null else jsonb_build_object(''enemy'', p.fight_enemy) end' in def) = 0 then raise exception 'respond: fight anchor not found'; end if;
  def := replace(def, '''fight'', case when p.fight_enemy is null then null else jsonb_build_object(''enemy'', p.fight_enemy) end',
    '''fight'', case when p.fight_enemy is null then null else jsonb_build_object(''enemy'', p.fight_enemy) end,
      ''cook'', case when p.cook_item is null then null else jsonb_build_object(''item'', p.cook_item, ''next'', game.ms(p.cook_next)) end');
  if position('''enemies'', game.enemies_json(),' in def) = 0 then raise exception 'respond: enemies anchor not found'; end if;
  def := replace(def, '''enemies'', game.enemies_json(),', '''enemies'', game.enemies_json(), ''ground'', game.ground_json(uid),');
  execute def;

  -- get_highscores: Cooking too.
  def := pg_get_functiondef('public.get_highscores(text, integer)'::regprocedure);
  if position('when ''health'' then ''health_xp'' end;' in def) = 0 then raise exception 'get_highscores: anchor not found'; end if;
  def := replace(def, 'when ''health'' then ''health_xp'' end;', 'when ''health'' then ''health_xp'' when ''cooking'' then ''cooking_xp'' end;');
  execute def;

  -- eat_item: how much it heals comes from the items table (cooked bird meat: 1).
  def := pg_get_functiondef('public.eat_item(text)'::regprocedure);
  if position('heal int := case p_item when ''candy_bar'' then 1 when ''sandwich'' then 2 else 0 end;' in def) = 0 then raise exception 'eat_item: anchor not found'; end if;
  def := replace(def, 'heal int := case p_item when ''candy_bar'' then 1 when ''sandwich'' then 2 else 0 end;',
    'heal int := coalesce((select i.heal from public.items i where i.id = p_item), 0);');
  execute def;

  -- fight_step: a kill drops the enemy's loot where it died, for you.
  def := pg_get_functiondef('public.fight_step()'::regprocedure);
  if position('logs := logs || to_jsonb(format(''You killed the %s.'', lower(k.name)));' in def) = 0 then raise exception 'fight_step: anchor not found'; end if;
  def := replace(def, 'logs := logs || to_jsonb(format(''You killed the %s.'', lower(k.name)));',
    'logs := logs || to_jsonb(format(''You killed the %s.'', lower(k.name)));
        perform game.drop_loot(k.id, e.fight_x, e.fight_y, p.id, t);');
  execute def;
end $do$;
