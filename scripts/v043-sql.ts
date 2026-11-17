// Writes supabase/migrations/0028_copper_enemies_quest.sql (v0.43): copper (Hotline's dumpsters, the items, the recipes),
// the guard dogs, giant rats and bikers (and the bikers jumping you), the Rat Nest and its gate, the first quest ("Sewer
// Problems"), using one item on another, quest items, and giant rat meat. GENERATED from the game's data (map.ts,
// enemies.ts, metals.ts, crimes.ts, items.ts, recipes.ts, combos.ts), so the server can't disagree with the game.
// Run: npx vite-node scripts/v043-sql.ts
import { writeFileSync } from 'node:fs';
import { CLUB, H, NEST, NEST_GATE, NEST_TUNNEL, NODES, SEWER, SPLINTER, W, WARD } from '../src/street/map';
import { ENEMIES, ENEMY_KINDS, RAT_MOVE_MS, RAT_WALK_MS, RAT_ZONES, ROAMS } from '../src/game/enemies';
import { CRAFTS, METAL_ITEMS } from '../src/game/data/metals';
import { CRIME_BY_ID } from '../src/game/data/crimes';
import { ITEMS, ITEM_BY_ID } from '../src/game/data/items';
import { RECIPE_BY_ITEM } from '../src/game/data/recipes';
import { COMBOS } from '../src/game/data/combos';

const q = (s: string) => s.replace(/'/g, "''");
const lit = (s: string) => `E'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const arr = (xs: number[]) => `array[${xs.join(',')}]`;

const copperItems = METAL_ITEMS.filter((i) => i.id.startsWith('copper_'));
const copperCrafts = CRAFTS.filter((c) => c.id.startsWith('copper_'));
const crime = CRIME_BY_ID.copper_salvage;
const cuSpots = NODES.filter((n) => n.crimeId === crime.id);
const newKinds = ['dog', 'giant_rat', 'biker'].map((id) => ENEMY_KINDS[id]);
const newEnemies = ENEMIES.filter((e) => newKinds.some((k) => k.id === e.kind));
const otherItems = ['raw_giant_rat_meat', 'cooked_giant_rat_meat', 'rat_antidote', 'cooked_rat_antidote', 'sewer_key'].map((id) => ITEM_BY_ID[id]);
const questItems = ITEMS.filter((i) => i.quest).map((i) => i.id);
const gr = RECIPE_BY_ITEM.raw_giant_rat_meat;

// The rats' patches (Splinter's spot is solid now): game.rat_at, regenerated.
const ratTiles = RAT_ZONES.flat();
const ratStarts: number[] = [];
let at = 1;
for (const z of RAT_ZONES) ratStarts.push(at), (at += z.length);

const onMapSql = [
  `(x between 0 and ${W - 1} and y between 0 and ${H - 1})`,
  ...[SEWER, NEST_TUNNEL, NEST].map((r) => `(x between ${r.x0} and ${r.x1} and y between ${r.y0} and ${r.y1})`),
].join('\n    or ');
const nestLockedSql = `(x between ${NEST_GATE[0]} and ${NEST_TUNNEL.x1} and y = ${NEST_TUNNEL.y0}) or (x between ${NEST.x0} and ${NEST.x1} and y between ${NEST.y0} and ${NEST.y1})`;
const inClub = (x: string, y: string) => `${x} between ${CLUB.x0} and ${CLUB.x1} and ${y} between ${CLUB.y0} and ${CLUB.y1}`;
const unlocked = (gate: string) => `coalesce(p.unlocked ? '${gate}', false)`;

/** Changed lines in existing functions: [function, the text as it is now, what it becomes]. */
const swaps: [string, string, string][] = [
  // walk: you can't walk behind the Rat Nest's gate unless you unlocked it.
  ['public.walk(integer, integer, jsonb)', 'if not game.on_map(sx, sy) or greatest(abs(sx - px), abs(sy - py)) <> 1 then',
    `if not game.on_map(sx, sy) or greatest(abs(sx - px), abs(sy - py)) <> 1 or (game.nest_locked(sx, sy) and not ${unlocked('rat_nest')}) then`],
  // attack: the giant rats only for players who unlocked the gate.
  ['public.attack(text, integer, integer)', '  select * into k from public.enemy_kinds where id = e.kind;\n  if p.caught_crime is not null',
    `  select * into k from public.enemy_kinds where id = e.kind;\n  if e.kind = 'giant_rat' and not ${unlocked('rat_nest')} then return game.respond(p.id, false, 'locked', rep, logs); end if;\n  if p.caught_crime is not null`],
  // die: quest items stay in your bag (they don't go into the grave).
  ['game.die(public.players, timestamp with time zone, jsonb, jsonb)', "  has_stuff boolean := p.cash > 0 or p.inventory <> '{}'::jsonb;",
    "  kept jsonb := coalesce((select jsonb_object_agg(i.key, i.value) from jsonb_each(p.inventory) i join public.items it on it.id = i.key and it.quest), '{}'::jsonb);\n  lost jsonb := p.inventory - array(select jsonb_object_keys(kept));\n  has_stuff boolean := p.cash > 0 or lost <> '{}'::jsonb;"],
  ['game.die(public.players, timestamp with time zone, jsonb, jsonb)', "values (p.id, p.pos_x, p.pos_y, p.cash, p.inventory, p_at, p_at + interval '5 minutes');",
    "values (p.id, p.pos_x, p.pos_y, p.cash, lost, p_at, p_at + interval '5 minutes');"],
  ['game.die(public.players, timestamp with time zone, jsonb, jsonb)', "    p.inventory := '{}'::jsonb;", '    p.inventory := kept;'],
  // drop_item: quest items can't be dropped.
  ['public.drop_item(text)', "  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;\n  update public.players",
    "  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;\n  if exists (select 1 from public.items i where i.id = p_item and i.quest) then return game.respond(p.id, false, 'quest_item', null, null); end if;\n  update public.players"],
  // respond: your quests and what you unlocked.
  ['game.respond(uuid, boolean, text, jsonb, jsonb)', "'bank', p.bank, 'bankCash', p.bank_cash,",
    "'bank', p.bank, 'bankCash', p.bank_cash, 'quests', p.quests, 'unlocked', p.unlocked,"],
];

const enemyAtSql = `create or replace function game.enemy_at(p_kind text, idx int, t bigint, out x double precision, out z double precision, out flying boolean)
language plpgsql immutable set search_path = pg_catalog, game as $$
begin
  if p_kind = 'thug' then
    select * into x, z, flying from game.thug_at(idx, t);
  elsif p_kind = 'rat' then
    select * into x, z, flying from game.rat_at(idx, t);
${Object.entries(ROAMS)
  .map(
    ([kind, r]) => `  elsif p_kind = '${kind}' then
    select * into x, z, flying from game.roam_at(${arr(r.tiles.map((p) => p[0]))},
      ${arr(r.tiles.map((p) => p[1]))}, idx, t, ${r.moveMs}, ${r.walkMs}, ${r.shift});`,
  )
  .join('\n')}
  else
    select * into x, z, flying from game.pigeon_at(idx, t);
  end if;
end $$;
revoke execute on function game.enemy_at(text, int, bigint) from public, anon, authenticated;`;

const sql = `-- 0028 (v0.43): copper, the guard dogs, giant rats and bikers, the Rat Nest and its gate, and the first quest
-- ("Sewer Problems"). GENERATED by scripts/v043-sql.ts. Docs: design.md §12, §14, §16.
--
--  1. Copper: its ${copperItems.length} items (salvage, sheet, 3 weapons, 3 armour) and ${copperCrafts.length} recipes; the crime ${crime.id} (Scrapping ${crime.level},
--     ${crime.baseChance * 100}%, ${crime.xp} XP, ${crime.refill} s) at Hotline Plumbing & Heating's ${cuSpots.length} dumpsters.
--  2. Enemies: guard dogs (Junkyard), giant rats (Rat Nest), bikers (Iron Saints MC, aggressive): kinds, ${newEnemies.length} enemies,
--     loot; game.roam_at (their schedules) and game.enemy_at; game.rat_at again (Splinter's spot is out of a rat's patch).
--     jump_me(x, y): standing in the biker club with no fight, a free biker starts one with you.
--  3. Underground: game.on_map takes the tunnel and the nest; game.nest_locked(x, y); players.unlocked (["rat_nest"]):
--     walk() won't take you behind the gate and attack() won't fight a giant rat until you unlocked it; unlock_gate().
--  4. Quests: players.quests ({"sewer_problems": step}); quest_talk(npc, choice, x, y) runs Splinter and Elliot;
--     use_item(item, on) with public.combos; items.quest: quest items can't be dropped (or sold: they're worth $0) and
--     stay in your bag when you die.
--  5. Giant rat meat (+${ITEM_BY_ID.cooked_giant_rat_meat.heal} HP) and its recipe (Cooking ${gr.level}).
-- Additive: new columns (with defaults), rows, tables and functions; changed lines swapped in the live definitions of
-- walk, attack, die, drop_item and respond (it stops if a line isn't found). No player data is changed.
-- Run it all at once. To dry-run: change the last line "commit;" to "rollback;".

begin;

-- ---------- columns ----------
alter table public.items add column if not exists quest boolean not null default false;
alter table public.players add column if not exists quests jsonb not null default '{}'::jsonb;
alter table public.players add column if not exists unlocked jsonb not null default '[]'::jsonb;

-- ---------- items ----------
insert into public.items (id, name, slot, damage, accuracy, defence, speed, needs_skill, needs_level, heal, value, quest) values
${[...copperItems, ...otherItems]
  .map((i) => {
    const g = i.gear;
    return `  ('${i.id}', '${q(i.name)}', ${g ? `'${g.slot}'` : 'null'}, ${g?.damage ?? 0}, ${g?.accuracy ?? 0}, ${g?.defence ?? 0}, ${g?.speed ?? 'null'}, ${g?.needs ? `'${g.needs.skill}'` : 'null'}, ${g?.needs?.level ?? 1}, ${i.heal}, ${i.value}, ${!!i.quest})`;
  })
  .join(',\n')}
on conflict (id) do update set name = excluded.name, slot = excluded.slot, damage = excluded.damage, accuracy = excluded.accuracy,
  defence = excluded.defence, speed = excluded.speed, needs_skill = excluded.needs_skill, needs_level = excluded.needs_level,
  heal = excluded.heal, value = excluded.value, quest = excluded.quest;

insert into public.crafts (id, station_kind, skill, level, xp, ticks, inputs) values
${copperCrafts.map((c) => `  ('${c.id}', '${c.station}', '${c.skill}', ${c.level}, ${c.xp}, ${c.ticks}, '${JSON.stringify(c.inputs)}'::jsonb)`).join(',\n')}
on conflict (id) do update set station_kind = excluded.station_kind, skill = excluded.skill, level = excluded.level, xp = excluded.xp,
  ticks = excluded.ticks, inputs = excluded.inputs;

insert into public.recipes (item_from, item_to, station_kind, level, xp, stop_burn_level)
values ('${gr.from}', '${gr.to}', '${gr.station}', ${gr.level}, ${gr.xp}, ${gr.stopBurn})
on conflict (item_from) do update set item_to = excluded.item_to, station_kind = excluded.station_kind, level = excluded.level,
  xp = excluded.xp, stop_burn_level = excluded.stop_burn_level;

-- ---------- copper scrapping ----------
insert into public.crimes (id, name, level, ticks, base_chance, xp, cash_min, cash_max, items, fail_damage, fail_stun, catcher, refill, skill)
values ('${crime.id}', '${q(crime.name)}', ${crime.level}, ${crime.ticks}, ${crime.baseChance}, ${crime.xp}, ${crime.cashMin}, ${crime.cashMax},
  array[${(crime.items ?? []).map((i) => `'${i}'`).join(', ')}]::text[], ${crime.failDamage}, ${crime.failStun}, null, ${crime.refill}, '${crime.skill}')
on conflict (id) do update set name = excluded.name, level = excluded.level, ticks = excluded.ticks, base_chance = excluded.base_chance,
  xp = excluded.xp, items = excluded.items, fail_damage = excluded.fail_damage, fail_stun = excluded.fail_stun, refill = excluded.refill,
  skill = excluded.skill;
insert into public.spots (id, crime_id, x, y) values
${cuSpots.map((n) => `  ('${n.id}', '${crime.id}', ${n.x}, ${n.y})`).join(',\n')}
on conflict (id) do update set crime_id = excluded.crime_id, x = excluded.x, y = excluded.y;

-- ---------- underground: the tunnel, the Rat Nest, its gate ----------
create or replace function game.on_map(x int, y int) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select ${onMapSql}
$$;
revoke execute on function game.on_map(int, int) from public, anon, authenticated;

-- Behind the Rat Nest's gate (the gate's tile included).
create or replace function game.nest_locked(x int, y int) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select ${nestLockedSql}
$$;
revoke execute on function game.nest_locked(int, int) from public, anon, authenticated;

-- Open a gate with its key (the key is used up). Stand next to it.
create or replace function public.unlock_gate(p_gate text, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  logs jsonb := '[]'::jsonb;
  have int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  if p_gate <> 'rat_nest' then return game.respond(p.id, false, 'no_such_gate', null, null); end if;
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', null, null); end if;
  if greatest(abs(p_x - ${NEST_GATE[0]}), abs(p_y - ${NEST_GATE[1]})) > 1 then return game.respond(p.id, false, 'too_far', null, null); end if;
  if ${unlocked('rat_nest')} then return game.respond(p.id, true, 'already_open', null, null); end if;
  have := coalesce((p.inventory ->> 'sewer_key')::int, 0);
  if have <= 0 then return game.respond(p.id, false, 'locked', null, null); end if;
  p.inventory := case when have = 1 then p.inventory - 'sewer_key' else jsonb_set(p.inventory, '{sewer_key}', to_jsonb(have - 1)) end;
  p.unlocked := p.unlocked || '["rat_nest"]'::jsonb;
  logs := logs || to_jsonb('You unlock the gate with the Sewer Key. It swings open (for you).'::text);
  update public.players set inventory = p.inventory, unlocked = p.unlocked, updated_at = now() where id = p.id;
  return game.respond(p.id, true, 'unlocked', null, logs);
end $$;
grant execute on function public.unlock_gate(text, int, int) to authenticated;
revoke execute on function public.unlock_gate(text, int, int) from public, anon;

-- ---------- the enemies ----------
insert into public.enemy_kinds (id, name, level, hp, attack, defense, defence_bonus, speed, max_hit, respawn, aggressive) values
${newKinds.map((k) => `  ('${k.id}', '${q(k.name)}', ${k.level}, ${k.hp}, ${k.attack}, ${k.defense}, ${k.defenceBonus}, ${k.speed}, ${k.maxHit}, ${k.respawn}, ${k.aggressive})`).join(',\n')}
on conflict (id) do update set name = excluded.name, level = excluded.level, hp = excluded.hp, attack = excluded.attack, defense = excluded.defense,
  defence_bonus = excluded.defence_bonus, speed = excluded.speed, max_hit = excluded.max_hit, respawn = excluded.respawn, aggressive = excluded.aggressive;
insert into public.enemies (id, kind, idx, hp) values
${newEnemies.map((e) => `  ('${e.id}', '${e.kind}', ${e.index}, ${ENEMY_KINDS[e.kind].hp})`).join(',\n')}
on conflict (id) do nothing;
delete from public.loot where enemy_kind in (${newKinds.map((k) => `'${k.id}'`).join(', ')});
insert into public.loot (enemy_kind, item, chance, min_amount, max_amount) values
${newKinds.flatMap((k) => k.loot.map((d) => `  ('${k.id}', '${d.item}', ${d.chance}, ${d.min}, ${d.max})`)).join(',\n')};

-- A roaming enemy's schedule: a new spot (one of px/py) every move_ms, walk_ms to get there; the same as roamAt() in
-- src/game/enemies.ts.
create or replace function game.roam_at(px int[], py int[], idx int, t bigint, move_ms int, walk_ms int, shift int,
  out x double precision, out z double precision, out flying boolean)
language plpgsql immutable set search_path = pg_catalog, game as $$
declare
  n int := array_length(px, 1);
  shifted bigint := t + idx * shift;
  k bigint := shifted / move_ms;
  into_move bigint := shifted - k * move_ms;
  a int;
  b int;
  f double precision;
begin
  flying := false;
  a := 1 + (game.minstd(((k * 3 + idx) % 2147483647) + 1) % n)::int;
  if into_move >= walk_ms then
    x := px[a] + 0.5; z := py[a] + 0.5;
    return;
  end if;
  b := 1 + (game.minstd((((k - 1) * 3 + idx) % 2147483647) + 1) % n)::int;
  f := into_move::double precision / walk_ms;
  x := px[b] + 0.5 + (px[a] - px[b]) * f;
  z := py[b] + 0.5 + (py[a] - py[b]) * f;
end $$;
revoke execute on function game.roam_at(int[], int[], int, bigint, int, int, int) from public, anon, authenticated;

-- The rats' patches without Splinter's spot.
create or replace function game.rat_at(idx int, t bigint, out x double precision, out z double precision, out flying boolean)
language plpgsql immutable set search_path = pg_catalog, game as $$
declare
  px int[] := array[${ratTiles.map((p) => p[0]).join(',')}];
  py int[] := array[${ratTiles.map((p) => p[1]).join(',')}];
  zs int[] := array[${ratStarts.join(',')}];
  zn int[] := array[${RAT_ZONES.map((z) => z.length).join(',')}];
  shifted bigint := t + idx * 3331;
  k bigint := shifted / ${RAT_MOVE_MS};
  into_move bigint := shifted - k * ${RAT_MOVE_MS};
  a int;
  b int;
  f double precision;
begin
  flying := false;
  a := zs[idx + 1] + (game.minstd(((k * 3 + idx) % 2147483647) + 1) % zn[idx + 1])::int;
  if into_move >= ${RAT_WALK_MS} then
    x := px[a] + 0.5; z := py[a] + 0.5;
    return;
  end if;
  b := zs[idx + 1] + (game.minstd((((k - 1) * 3 + idx) % 2147483647) + 1) % zn[idx + 1])::int;
  f := into_move / ${RAT_WALK_MS}.0;
  x := px[b] + 0.5 + (px[a] - px[b]) * f;
  z := py[b] + 0.5 + (py[a] - py[b]) * f;
end $$;
revoke execute on function game.rat_at(int, bigint) from public, anon, authenticated;

${enemyAtSql}

-- The bikers jump you: standing in the club with no fight going, a free biker comes at you and the fight starts (you
-- don't have to tap). The game calls this every couple of seconds while you're in there. Walking out ends it.
create or replace function public.jump_me(p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  e public.enemies;
  k public.enemy_kinds;
  pos record;
  dx int;
  dy int;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  perform game.save(p);
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  if not (${inClub('p_x', 'p_y')}) then return game.respond(p.id, false, 'not_in_club', rep, logs); end if;
  if p.fight_enemy is not null and exists (select 1 from public.enemies where id = p.fight_enemy and fighter = p.id and fight_seen > now() - interval '5 seconds') then
    return game.respond(p.id, true, 'fighting', rep, logs);
  end if;
  if p.caught_crime is not null or p.job_crime is not null then return game.respond(p.id, false, 'busy', rep, logs); end if;
  select en.* into e from public.enemies en join public.enemy_kinds ek on ek.id = en.kind
  where ek.aggressive and (en.dead_until is null or en.dead_until <= now())
    and (en.fighter is null or en.fight_seen <= now() - interval '5 seconds')
    and (en.left_at is null or en.left_at <= now() - interval '10 seconds')
  order by random() limit 1 for update of en skip locked;
  if e.id is null then return game.respond(p.id, false, 'no_one', rep, logs); end if;
  select * into k from public.enemy_kinds where id = e.kind;
  -- He comes to the tile next to you, from where he was.
  select * into pos from game.enemy_at(e.kind, e.idx, game.ms(now()));
  dx := sign(floor(pos.x)::int - p_x); dy := sign(floor(pos.z)::int - p_y);
  if dx = 0 and dy = 0 then dx := 1; end if;
  e.fight_x := least(greatest(p_x + dx, ${CLUB.x0}), ${CLUB.x1});
  e.fight_y := least(greatest(p_y + dy, ${CLUB.y0}), ${CLUB.y1});
  if e.dead_until is not null or coalesce(e.last_hit_at, 'epoch') < now() - interval '10 seconds' then e.hp := k.hp; end if;
  e.dead_until := null;
  e.fighter := p.id;
  e.next_swing := now() + make_interval(secs => k.speed * 0.5);
  e.fight_seen := now();
  update public.enemies set fighter = null where fighter = p.id and id <> e.id;
  update public.enemies set hp = e.hp, dead_until = e.dead_until, fighter = e.fighter, fight_x = e.fight_x, fight_y = e.fight_y,
    next_swing = e.next_swing, fight_seen = e.fight_seen where id = e.id;
  p.fight_enemy := e.id;
  p.fight_next := now();
  p.cook_item := null; p.cook_next := null;
  p.pos_x := p_x; p.pos_y := p_y; p.pos_at := now();
  logs := logs || to_jsonb(format('A %s jumps you!', lower(k.name)));
  perform game.save(p);
  return game.respond(p.id, true, 'jumped', rep, logs) || jsonb_build_object('events', '[]'::jsonb);
end $$;
grant execute on function public.jump_me(int, int) to authenticated;
revoke execute on function public.jump_me(int, int) from public, anon;

-- ---------- using one item on another ----------
create table if not exists public.combos (
  a text not null,
  b text not null,
  result text not null,
  text text not null,
  primary key (a, b)
);
alter table public.combos enable row level security;
insert into public.combos (a, b, result, text) values
${COMBOS.map((c) => `  ('${c.a}', '${c.b}', '${c.result}', '${q(c.text)}')`).join(',\n')}
on conflict (a, b) do update set result = excluded.result, text = excluded.text;

create or replace function public.use_item(p_item text, p_on text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  c public.combos;
  logs jsonb := '[]'::jsonb;
  n int;
  v text;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into c from public.combos where (a = p_item and b = p_on) or (a = p_on and b = p_item);
  if c.a is null then return game.respond(p.id, false, 'nothing_happens', null, null); end if;
  if coalesce((p.inventory ->> c.a)::int, 0) < 1 or coalesce((p.inventory ->> c.b)::int, 0) < 1 then
    return game.respond(p.id, false, 'nothing_there', null, null);
  end if;
  foreach v in array array[c.a, c.b] loop
    n := (p.inventory ->> v)::int;
    p.inventory := case when n = 1 then p.inventory - v else jsonb_set(p.inventory, array[v], to_jsonb(n - 1)) end;
  end loop;
  p.inventory := jsonb_set(p.inventory, array[c.result], to_jsonb(coalesce((p.inventory ->> c.result)::int, 0) + 1));
  logs := logs || to_jsonb(c.text);
  update public.players set inventory = p.inventory, updated_at = now() where id = p.id;
  return game.respond(p.id, true, null, null, logs);
end $$;
grant execute on function public.use_item(text, text) to authenticated;
revoke execute on function public.use_item(text, text) from public, anon;

-- ---------- the quest "Sewer Problems" ----------
-- Steps: 0 not started, 1 accepted ("someone in the hospital"), 2 Elliot gave you the antidote, 3 done (Splinter's key).
-- Answers with the id of the line to show (the words are in src/game/data/quests.ts).
create or replace function public.quest_talk(p_npc text, p_choice text, p_x int, p_y int)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, game as $$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  step int;
  line text;
  lv int;
  have_anywhere boolean;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', null, null); end if;
  step := coalesce((p.quests ->> 'sewer_problems')::int, 0);
  if p_npc = 'splinter' then
    if greatest(abs(p_x - ${SPLINTER[0]}), abs(p_y - ${SPLINTER[1]})) > 1 then return game.respond(p.id, false, 'too_far', null, null); end if;
    if step = 0 then
      if p_choice = 'accept' then
        step := 1; line := 'sp_accepted';
        logs := logs || to_jsonb('Quest started: Sewer Problems.'::text);
      elsif p_choice = 'decline' then
        line := 'sp_declined';
      else
        line := 'sp_offer';
      end if;
    elsif step < 3 then
      if coalesce((p.inventory ->> 'cooked_rat_antidote')::int, 0) > 0 then
        -- The antidote's slot becomes the key's: no room needed.
        p.inventory := case when (p.inventory ->> 'cooked_rat_antidote')::int = 1 then p.inventory - 'cooked_rat_antidote'
          else jsonb_set(p.inventory, '{cooked_rat_antidote}', to_jsonb((p.inventory ->> 'cooked_rat_antidote')::int - 1)) end;
        p.inventory := jsonb_set(p.inventory, '{sewer_key}', to_jsonb(coalesce((p.inventory ->> 'sewer_key')::int, 0) + 1));
        lv := game.level_from_xp(p.cooking_xp);
        p.cooking_xp := p.cooking_xp + 50;
        rep := jsonb_set(rep, '{xp}', jsonb_build_object('cooking', 50));
        if game.level_from_xp(p.cooking_xp) > lv then
          rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill', 'cooking', 'level', game.level_from_xp(p.cooking_xp)));
          logs := logs || to_jsonb(format('Cooking reached level %s!', game.level_from_xp(p.cooking_xp)));
        end if;
        step := 3; line := 'sp_thanks';
        logs := logs || to_jsonb('Quest complete: Sewer Problems! +50 Cooking XP. You got the Sewer Key.'::text);
      else
        line := 'sp_waiting';
      end if;
    else
      have_anywhere := p.inventory ? 'sewer_key' or exists (select 1 from jsonb_array_elements(p.bank) b where b ->> 'i' = 'sewer_key');
      if ${unlocked('rat_nest')} then line := 'sp_done';
      elsif have_anywhere then line := 'sp_already';
      elsif game.bag_used(p.inventory) >= game.bag_slots() then return game.respond(p.id, false, 'bag_full', null, null);
      else
        p.inventory := jsonb_set(p.inventory, '{sewer_key}', '1'::jsonb);
        line := 'sp_new_key';
      end if;
    end if;
  elsif p_npc = 'elliot' then
    if not (p_x between ${WARD.x0} and ${WARD.x1} and p_y between ${WARD.y0} and ${WARD.y1}) then return game.respond(p.id, false, 'too_far', null, null); end if;
    if step = 0 then line := 'el_hello';
    elsif step = 3 then line := 'el_after';
    else
      have_anywhere := p.inventory ? 'rat_antidote' or p.inventory ? 'cooked_rat_antidote'
        or exists (select 1 from jsonb_array_elements(p.bank) b where b ->> 'i' in ('rat_antidote', 'cooked_rat_antidote'));
      if have_anywhere then line := 'el_already';
      elsif game.bag_used(p.inventory) >= game.bag_slots() then return game.respond(p.id, false, 'bag_full', null, null);
      else
        p.inventory := jsonb_set(p.inventory, '{rat_antidote}', '1'::jsonb);
        line := case when step = 1 then 'el_antidote' else 'el_antidote_again' end;
        step := 2;
      end if;
    end if;
  else
    return game.respond(p.id, false, 'unknown_npc', null, null);
  end if;
  p.quests := jsonb_set(p.quests, '{sewer_problems}', to_jsonb(step));
  update public.players set quests = p.quests, inventory = p.inventory, cooking_xp = p.cooking_xp, updated_at = now() where id = p.id;
  return game.respond(p.id, true, line, rep, logs);
end $$;
grant execute on function public.quest_talk(text, text, int, int) to authenticated;
revoke execute on function public.quest_talk(text, text, int, int) from public, anon;

-- ---------- changed lines in walk, attack, die, drop_item, respond ----------
do $do$
declare
  r record;
  def text;
begin
  for r in select * from (values
${swaps.map(([fn, a, b]) => `    ('${fn}', ${lit(a)}, ${lit(b)})`).join(',\n')}
  ) as t(fn, old_text, new_text) loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in def) = 0 then raise exception '%: anchor not found: %', r.fn, r.old_text; end if;
    execute replace(def, r.old_text, r.new_text);
  end loop;
end $do$;

-- Check: this should say "ok".
select case when game.on_map(${NEST.x1}, ${NEST.y1}) and game.nest_locked(${NEST_GATE[0]}, ${NEST_GATE[1]}) and not game.nest_locked(${NEST_GATE[0] - 1}, ${NEST_GATE[1]})
  and (select count(*) from public.spots where crime_id = '${crime.id}') = ${cuSpots.length}
  and (select count(*) from public.enemies where kind in (${newKinds.map((k) => `'${k.id}'`).join(', ')})) = ${newEnemies.length}
  and (select count(*) from public.items where quest) = ${questItems.length}
  and position('nest_locked' in pg_get_functiondef('public.walk(integer, integer, jsonb)'::regprocedure)) > 0
  and position('kept' in pg_get_functiondef('game.die(public.players, timestamp with time zone, jsonb, jsonb)'::regprocedure)) > 0
  and position('unlocked' in pg_get_functiondef('game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure)) > 0
  then 'ok' else 'NOT APPLIED' end as v043;

commit;
`;
writeFileSync(new URL('../supabase/migrations/0028_copper_enemies_quest.sql', import.meta.url), sql);
console.log(`wrote 0028_copper_enemies_quest.sql (${sql.length} bytes): ${copperItems.length} copper items, ${newEnemies.length} enemies, ${cuSpots.length} dumpsters`);
for (const [fn, a] of swaps) console.log(fn, '|', a.slice(0, 70).replace(/\n/g, '⏎'));
