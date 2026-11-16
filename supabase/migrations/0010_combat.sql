-- Underworld: combat v1 (docs/design.md §12): Pigeons in the park, fists and brass knuckles, Ray's weapon store.
-- The server runs every fight with the formulas in src/game/combat.ts; where enemies are comes from a fixed schedule
-- (src/game/enemies.ts), the same on every phone and here.
--
-- Changes to existing things:
--  - Health starts at level 10 (max HP = Health level, so still 10 HP). Existing players are raised to level 10.
--  - Defense XP can be a half point now (0.5 per damage), so that column holds decimals.
--  - game.save / game.respond / game.world get the new columns (only those lines added to their live definitions).

-- ---------- players: gear, the current fight, Health level 10 ----------
alter table public.players add column equipment jsonb not null default '{}'::jsonb;
alter table public.players add column fight_enemy text;
alter table public.players add column fight_next timestamptz;
alter table public.players alter column defense_xp type numeric(14, 1);
alter table public.players alter column health_xp set default 449;
update public.players set health_xp = greatest(health_xp, 449);
-- Every new character (made, or brought along from offline) starts at Health level 10.
create or replace function game.health_floor() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  new.health_xp := greatest(coalesce(new.health_xp, 0), 449);
  return new;
end $$;
create trigger players_health_floor before insert on public.players for each row execute function game.health_floor();

-- Level from XP for decimal XP (Defense), same table as the whole-number version.
create or replace function game.level_from_xp(xp numeric) returns int
language sql immutable set search_path = pg_catalog, game as $$ select game.level_from_xp(floor(xp)::bigint) $$;

-- Max health = Health level (was 10 + 2 per level above 1).
create or replace function game.max_hp(health_xp bigint) returns int
language sql immutable set search_path = pg_catalog, game as $$ select game.level_from_xp(health_xp) $$;

-- Combat level = (Defense + Health) / 4 + the better of Melee and Gunfire / 2, rounded down.
create or replace function game.combat_level(p public.players) returns int
language sql immutable set search_path = pg_catalog, game as $$
  select floor((game.level_from_xp(p.defense_xp) + game.level_from_xp(p.health_xp)) / 4.0
               + greatest(game.level_from_xp(p.melee_xp), game.level_from_xp(p.gunfire_xp)) / 2.0)::int
$$;

-- ---------- items (mirrors src/game/data/items.ts) and what shops sell ----------
create table public.items (
  id text primary key,
  name text not null,
  slot text check (slot in ('weapon', 'head', 'body', 'legs', 'feet')),
  damage int not null default 0,
  accuracy int not null default 0,
  defence int not null default 0,
  speed int,                    -- weapons: ticks between swings
  needs_skill text,
  needs_level int not null default 1,
  heal int not null default 0,
  value int not null default 0
);
alter table public.items enable row level security;
create policy items_select_all on public.items for select to anon, authenticated using (true);
insert into public.items (id, name, slot, damage, accuracy, defence, speed, needs_skill, needs_level, heal, value) values
  ('candy_bar', 'Candy Bar', null, 0, 0, 0, null, null, 1, 1, 1),
  ('sandwich', 'Sandwich', null, 0, 0, 0, null, null, 1, 2, 2),
  ('brass_knuckles', 'Brass Knuckles', 'weapon', 2, 0, 0, 3, 'melee', 1, 0, 0);

create table public.shop_items (
  shop text not null,
  item text not null references public.items (id),
  price int not null check (price > 0),
  primary key (shop, item)
);
alter table public.shop_items enable row level security;
create policy shop_items_select_all on public.shop_items for select to anon, authenticated using (true);
insert into public.shop_items (shop, item, price) values ('weapons', 'brass_knuckles', 50);

-- ---------- enemies (mirrors src/game/enemies.ts) ----------
create table public.enemy_kinds (
  id text primary key,
  name text not null,
  level int not null,
  hp int not null,
  attack int not null,
  defense int not null,
  defence_bonus int not null default 0,
  speed int not null,           -- ticks between their attacks
  max_hit int not null,
  respawn int not null,         -- seconds
  aggressive boolean not null default false
);
alter table public.enemy_kinds enable row level security;
create policy enemy_kinds_select_all on public.enemy_kinds for select to anon, authenticated using (true);
insert into public.enemy_kinds values ('pigeon', 'Pigeon', 1, 3, 1, 0, 0, 4, 1, 25, false);

-- Every enemy on the island and its state, shared by everyone (Realtime tells the phones when it changes).
create table public.enemies (
  id text primary key,
  kind text not null references public.enemy_kinds (id),
  idx int not null,             -- which one of its kind (its schedule)
  hp int not null,
  dead_until timestamptz,
  fighter uuid references public.players (id) on delete set null,
  fight_x int,
  fight_y int,
  next_swing timestamptz,
  last_hit_at timestamptz,
  fight_seen timestamptz
);
alter table public.enemies enable row level security;
create policy enemies_select_authenticated on public.enemies for select to authenticated using (true);
alter publication supabase_realtime add table public.enemies;
insert into public.enemies (id, kind, idx, hp) values ('pigeon_0', 'pigeon', 0, 3), ('pigeon_1', 'pigeon', 1, 3), ('pigeon_2', 'pigeon', 2, 3);

-- Where Pigeon `idx` is at time t (ms): every 8 s it flies (1.5 s) to another open park tile. Same as pigeonAt().
create or replace function game.pigeon_at(idx int, t bigint, out x double precision, out z double precision, out flying boolean)
language plpgsql immutable set search_path = pg_catalog, game as $$
declare
  px int[] := array[19,24,18,19,21,22,24,25,16,17,18,19,20,21,22,23,24,25,26,27,17,18,19,20,21,22,23,24,25,26,17,18,19,20,23,24,26,18,19,20,23,24,25,26,17,18,19,20,23,24,17,18,19,20,23,24,18,19,20,21,22,23,24,25,26,16,17,18,19,20,21,22,23,24,25,26,27,18,19,21,22,24,25,19,24];
  py int[] := array[23,23,24,24,24,24,24,24,25,25,25,25,25,25,25,25,25,25,25,25,26,26,26,26,26,26,26,26,26,26,27,27,27,27,27,27,27,28,28,28,28,28,28,28,29,29,29,29,29,29,30,30,30,30,30,30,31,31,31,31,31,31,31,31,31,32,32,32,32,32,32,32,32,32,32,32,32,33,33,33,33,33,33,34,34];
  n int := 85;
  shifted bigint := t + idx * 2777;
  k bigint := shifted / 8000;
  into_hop bigint := shifted - k * 8000;
  a int;
  b int;
  f double precision;
begin
  a := (game.minstd(((k * 3 + idx) % 2147483647) + 1) % n)::int + 1;
  if into_hop >= 1500 then
    x := px[a] + 0.5; z := py[a] + 0.5; flying := false;
    return;
  end if;
  b := (game.minstd((((k - 1) * 3 + idx) % 2147483647) + 1) % n)::int + 1;
  f := into_hop / 1500.0;
  x := px[b] + 0.5 + (px[a] - px[b]) * f;
  z := py[b] + 0.5 + (py[a] - py[b]) * f;
  flying := true;
end $$;

-- Everyone's view of the enemies: alive or not, current health, who's fighting it and where.
create or replace function game.enemies_json() returns jsonb
language sql stable set search_path = pg_catalog, public, game as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'kind', e.kind, 'index', e.idx,
    'hp', case when e.dead_until > now() then 0
               when e.dead_until is not null or (e.fighter is null and coalesce(e.last_hit_at, 'epoch') < now() - interval '10 seconds') then k.hp
               else e.hp end,
    'deadUntil', case when e.dead_until > now() then game.ms(e.dead_until) end,
    'fighter', case when e.fighter is not null and e.fight_seen > now() - interval '5 seconds' then e.fighter end,
    'fightPos', case when e.fighter is not null and e.fight_seen > now() - interval '5 seconds' then jsonb_build_array(e.fight_x, e.fight_y) end
  ) order by e.id), '[]'::jsonb)
  from public.enemies e join public.enemy_kinds k on k.id = e.kind
$$;

-- ---------- existing functions: only the lines for the new columns added (taken from their live definitions) ----------
do $$
declare
  d text;
begin
  -- game.save: also write gear and the current fight.
  d := pg_get_functiondef('game.save(public.players)'::regprocedure);
  if position('stats = p.stats, updated_at = now()' in d) = 0 then raise exception 'game.save changed; nothing done'; end if;
  execute replace(d, 'stats = p.stats, updated_at = now()',
    'stats = p.stats, equipment = p.equipment, fight_enemy = p.fight_enemy, fight_next = p.fight_next, updated_at = now()');

  -- game.respond: send your gear, your fight, and the enemies.
  d := pg_get_functiondef('game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure);
  if position($q$'inventory', p.inventory, 'stats', p.stats$q$ in d) = 0 or position($q$'grave', v_grave, 'spots', v_spots,$q$ in d) = 0 then
    raise exception 'game.respond changed; nothing done';
  end if;
  d := replace(d, $q$'inventory', p.inventory, 'stats', p.stats$q$,
    $q$'inventory', p.inventory, 'stats', p.stats, 'equipment', p.equipment, 'fight', case when p.fight_enemy is null then null else jsonb_build_object('enemy', p.fight_enemy) end$q$);
  d := replace(d, $q$'grave', v_grave, 'spots', v_spots,$q$, $q$'grave', v_grave, 'spots', v_spots, 'enemies', game.enemies_json(),$q$);
  execute d;

  -- game.world: other players' gear and combat level (shown next to their name).
  d := pg_get_functiondef('game.world(uuid)'::regprocedure);
  if position($q$'id', p.id, 'name', p.name, 'look', p.look,$q$ in d) = 0 then raise exception 'game.world changed; nothing done'; end if;
  execute replace(d, $q$'id', p.id, 'name', p.name, 'look', p.look,$q$,
    $q$'id', p.id, 'name', p.name, 'look', p.look, 'equipment', p.equipment, 'combat', game.combat_level(p),$q$);
end $$;

-- ---------- fighting ----------

-- Attack an enemy, standing on tile (p_x, p_y) next to it. Starts the fight (or keeps it going).
create or replace function public.attack(p_enemy text, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  e public.enemies;
  k public.enemy_kinds;
  pos record;
  ex double precision;
  ez double precision;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  perform game.save(p);
  select * into e from public.enemies where id = p_enemy for update;
  if e.id is null then return game.respond(p.id, false, 'unknown_enemy', rep, logs); end if;
  select * into k from public.enemy_kinds where id = e.kind;
  if p.caught_crime is not null then return game.respond(p.id, false, 'caught', rep, logs); end if;
  if p.stunned_until > now() then return game.respond(p.id, false, 'stunned', rep, logs); end if;
  if e.dead_until > now() then return game.respond(p.id, false, 'enemy_dead', rep, logs); end if;
  if e.fighter is not null and e.fighter <> p.id and e.fight_seen > now() - interval '5 seconds' then
    return game.respond(p.id, false, 'enemy_busy', rep, logs);
  end if;
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  -- Where is it? (In a fight it stays put; otherwise it follows its schedule.)
  if e.fighter = p.id and e.fight_seen > now() - interval '5 seconds' then
    ex := e.fight_x + 0.5; ez := e.fight_y + 0.5;
  else
    select * into pos from game.pigeon_at(e.idx, game.ms(now()));
    ex := pos.x; ez := pos.z;
  end if;
  if sqrt((p_x + 0.5 - ex) ^ 2 + (p_y + 0.5 - ez) ^ 2) > 2.0 then return game.respond(p.id, false, 'too_far', rep, logs); end if;
  -- A new fight: it stops where it is, comes back to full health if nobody hit it for 10 s (or it respawned),
  -- and pecks back after its own attack speed. You swing at once.
  if e.fighter is distinct from p.id or e.fight_seen <= now() - interval '5 seconds' then
    if e.dead_until is not null or coalesce(e.last_hit_at, 'epoch') < now() - interval '10 seconds' then e.hp := k.hp; end if;
    e.dead_until := null;
    e.fighter := p.id;
    e.fight_x := floor(ex)::int;
    e.fight_y := floor(ez)::int;
    e.next_swing := now() + make_interval(secs => k.speed * 0.5);
    p.fight_next := now();
    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));
  end if;
  e.fight_seen := now();
  -- Let go of any other enemy you were fighting.
  update public.enemies set fighter = null where fighter = p.id and id <> e.id;
  update public.enemies set hp = e.hp, dead_until = e.dead_until, fighter = e.fighter, fight_x = e.fight_x, fight_y = e.fight_y,
    next_swing = e.next_swing, fight_seen = e.fight_seen where id = e.id;
  p.fight_enemy := e.id;
  p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
  p.pos_x := p_x; p.pos_y := p_y; p.pos_at := now();
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs) || jsonb_build_object('events', '[]'::jsonb);
end $$;

-- Catch up your fight to now: every swing that's due, from you and from the enemy, in order. The app calls this
-- about every half second while you fight, and animates the swings it gets back ("events").
create or replace function public.fight_step()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  events jsonb := '[]'::jsonb;
  r record;
  e public.enemies;
  k public.enemy_kinds;
  w public.items;
  t timestamptz;
  dmg int;
  max_hit int;
  chance double precision;
  lv_melee int; lv_def int; lv_hp int;
  n int := 0;
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
  -- The fight is over if it's not yours any more, it died, you started a crime, or the app stopped asking (you left).
  if e.id is null or e.fighter is distinct from p.id or e.dead_until > now() or p.job_crime is not null
     or e.fight_seen < now() - interval '5 seconds' then
    if e.fighter = p.id then update public.enemies set fighter = null where id = e.id; end if;
    p.fight_enemy := null;
    perform game.save(p);
    return game.respond(p.id, true, 'fight_over', rep, logs) || jsonb_build_object('events', events);
  end if;

  select * into w from public.items where id = p.equipment ->> 'weapon';
  w_damage := coalesce(w.damage, 1); w_accuracy := coalesce(w.accuracy, 0); w_speed := coalesce(w.speed, 3);
  lv_melee := game.level_from_xp(p.melee_xp); lv_def := game.level_from_xp(p.defense_xp); lv_hp := game.level_from_xp(p.health_xp);

  loop
    n := n + 1;
    exit when n > 40;
    t := least(p.fight_next, e.next_swing);
    exit when t > now();
    if p.fight_next <= e.next_swing then
      -- Your swing.
      chance := game.hit_chance((game.level_from_xp(p.melee_xp) + 8) * (w_accuracy + 64), (k.defense + 8) * (k.defence_bonus + 64));
      if random() < chance then
        max_hit := w_damage + floor((game.level_from_xp(p.melee_xp) - 1) / 8);
        dmg := least(e.hp, 1 + floor(random() * max_hit)::int);
        e.hp := e.hp - dmg;
        e.last_hit_at := t;
        p.melee_xp := p.melee_xp + dmg;
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
        events := events || jsonb_build_object('at', game.ms(t), 'by', 'you', 'killed', true);
        exit;
      end if;
    else
      -- Its swing.
      chance := game.hit_chance((k.attack + 8) * 64, (game.level_from_xp(p.defense_xp) + 8) * (0 + 64));
      if random() < chance then
        dmg := 1 + floor(random() * k.max_hit)::int;
        p.hp := greatest(0, game.hp_now(p, t) - dmg);
        p.hp_at := t;
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

  -- XP and level-ups.
  if game.level_from_xp(p.melee_xp) > lv_melee then
    rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'melee', 'level', game.level_from_xp(p.melee_xp)));
    logs := logs || to_jsonb(format('Melee reached level %s!', game.level_from_xp(p.melee_xp)));
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
end $$;

-- The OSRS hit formula (src/game/combat.ts hitChance).
create or replace function game.hit_chance(a bigint, d bigint) returns double precision
language sql immutable set search_path = pg_catalog as $$
  select case when a > d then 1 - (d + 2)::double precision / (2 * (a + 1)) else a::double precision / (2 * (d + 1)) end
$$;

-- Walk away from a fight.
create or replace function public.stop_fight()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  update public.enemies set fighter = null where fighter = p.id;
  update public.players set fight_enemy = null where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $$;

-- ---------- gear ----------

-- Wield or wear an item from your bag (what was in that slot goes back to the bag).
create or replace function public.equip_item(p_item text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
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
  if it.needs_skill is not null and game.level_from_xp(case it.needs_skill when 'melee' then p.melee_xp when 'gunfire' then p.gunfire_xp else p.defense_xp end) < it.needs_level then
    return game.respond(p.id, false, 'level_too_low', null, null);
  end if;
  inv := case when have = 1 then p.inventory - p_item else jsonb_set(p.inventory, array[p_item], to_jsonb(have - 1)) end;
  old := p.equipment ->> it.slot;
  if old is not null then
    inv := jsonb_set(inv, array[old], to_jsonb(coalesce((inv ->> old)::int, 0) + 1));
    if (select count(*) from jsonb_object_keys(inv)) > 27 then return game.respond(p.id, false, 'bag_full', null, null); end if;
  end if;
  update public.players set inventory = inv, equipment = jsonb_set(equipment, array[it.slot], to_jsonb(it.id)), updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, jsonb_build_array(format('You equip the %s.', it.name)));
end $$;

-- Take off what's in a slot (back into your bag).
create or replace function public.unequip_item(p_slot text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  item text;
  inv jsonb;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  item := p.equipment ->> p_slot;
  if item is null then return game.respond(p.id, false, 'nothing_there', null, null); end if;
  inv := jsonb_set(p.inventory, array[item], to_jsonb(coalesce((p.inventory ->> item)::int, 0) + 1));
  if (select count(*) from jsonb_object_keys(inv)) > 27 then return game.respond(p.id, false, 'bag_full', null, null); end if;
  update public.players set inventory = inv, equipment = equipment - p_slot, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, null);
end $$;

-- ---------- Ray's weapon store ----------

-- Buy one item from the shop you're standing in (Ray's weapon store: tiles 30–34, 2–6).
create or replace function public.buy_item(p_item text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  v_shop text;
  v_price int;
  inv jsonb;
  v_name text;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  v_shop := case when p.pos_x between 30 and 34 and p.pos_y between 2 and 6 then 'weapons' end;
  if v_shop is null then return game.respond(p.id, false, 'not_in_shop', null, null); end if;
  select price into v_price from public.shop_items where shop = v_shop and item = p_item;
  if v_price is null then return game.respond(p.id, false, 'not_for_sale', null, null); end if;
  if p.cash < v_price then return game.respond(p.id, false, 'not_enough_cash', null, null); end if;
  inv := jsonb_set(p.inventory, array[p_item], to_jsonb(coalesce((p.inventory ->> p_item)::int, 0) + 1));
  if (select count(*) from jsonb_object_keys(inv)) > 27 then return game.respond(p.id, false, 'bag_full', null, null); end if;
  update public.players set cash = cash - v_price, inventory = inv, updated_at = now() where id = p.id;
  select name into v_name from public.items where id = p_item;
  return game.respond(p.id, true, null, null, jsonb_build_array(format('You buy the %s for $%s.', v_name, v_price)));
end $$;

-- ---------- who may call what ----------
do $$
declare f text;
begin
  foreach f in array array['attack(text, int, int)', 'fight_step()', 'stop_fight()', 'equip_item(text)', 'unequip_item(text)', 'buy_item(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'game' loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
