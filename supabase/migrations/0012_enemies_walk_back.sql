-- 0012: an enemy you walk away from follows you for 5 s, then walks back to its spot (no more teleporting).
--
-- When a fight ends without the enemy dying (you walked away, attacked something else, or died), a trigger on
-- public.enemies remembers who it was fighting, where, and when (left_by, left_x/left_y, left_at). For the next
-- 10 s it's "returning": every phone animates it following that player for 5 s and walking back in the other 5 s,
-- and attack() refuses it meanwhile ('enemy_returning'), so the server never has to guess where it is.
-- Additive: four new columns, a trigger, one extra field in game.enemies_json and one extra check in attack()
-- (both from their live definitions).

alter table public.enemies add column if not exists left_at timestamptz;
alter table public.enemies add column if not exists left_by uuid;
alter table public.enemies add column if not exists left_x int;
alter table public.enemies add column if not exists left_y int;

create or replace function game.enemy_left() returns trigger
language plpgsql set search_path = pg_catalog, public, game as $$
begin
  if new.fighter is not null then
    new.left_at := null;   -- in a fight again
  elsif old.fighter is not null and (new.dead_until is null or new.dead_until <= now()) then
    new.left_at := now();
    new.left_by := old.fighter;
    new.left_x := old.fight_x;
    new.left_y := old.fight_y;
  end if;
  return new;
end $$;
revoke execute on function game.enemy_left() from public, anon, authenticated;

drop trigger if exists enemies_left on public.enemies;
create trigger enemies_left before update on public.enemies
  for each row execute function game.enemy_left();

-- enemies_json: add "returning" (taken from the live definition).
do $do$
declare def text;
begin
  def := pg_get_functiondef('game.enemies_json()'::regprocedure);
  if position('returning' in def) = 0 then
    def := replace(def, 'jsonb_build_array(e.fight_x, e.fight_y) end',
      'jsonb_build_array(e.fight_x, e.fight_y) end,
    ''returning'', case when e.left_at > now() - interval ''10 seconds'' and (e.dead_until is null or e.dead_until <= now())
      then jsonb_build_object(''by'', e.left_by, ''from'', jsonb_build_array(e.left_x, e.left_y), ''at'', game.ms(e.left_at)) end');
    if position('returning' in def) = 0 then raise exception 'enemies_json: anchor not found'; end if;
    execute def;
  end if;
end $do$;

-- attack: not while it's walking back (taken from the live definition).
do $do$
declare def text;
begin
  def := pg_get_functiondef('public.attack(text, integer, integer)'::regprocedure);
  if position('enemy_returning' in def) = 0 then
    def := replace(def, 'if e.dead_until > now() then return game.respond(p.id, false, ''enemy_dead'', rep, logs); end if;',
      'if e.dead_until > now() then return game.respond(p.id, false, ''enemy_dead'', rep, logs); end if;
  if e.left_at > now() - interval ''10 seconds'' then return game.respond(p.id, false, ''enemy_returning'', rep, logs); end if;');
    if position('enemy_returning' in def) = 0 then raise exception 'attack: anchor not found'; end if;
    execute def;
  end if;
end $do$;
