begin;

create or replace function game.enemy_adjacent(ex integer, ey integer, px integer,
    py integer)
 returns boolean
 language sql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
  select ex >= 0 and greatest(abs(px - ex), abs(py - ey)) = 1 and coalesce((
    select (('x' || substr(r.masks, ex * 2 + 1, 2))::bit(8)::int
      & (1 << game.walk_bit(px - ex, py - ey))) <> 0
    from game.walk_map r where r.y = ey), false)
$$;
revoke execute on function game.enemy_adjacent(integer, integer, integer, integer)
  from public, anon, authenticated;

do $do$
declare
  def text := pg_get_functiondef('public.attack(text, integer, integer)'::regprocedure);
  a text[] := array[
    $a$  if dist > reach then return game.respond(p.id, false, 'too_far', rep, logs); end if;$a$];
  b text[] := array[
    $b$  if dist > reach then return game.respond(p.id, false, 'too_far', rep, logs); end if;
  if not ranged and not game.enemy_adjacent(floor(ex)::int, floor(ez)::int, p_x, p_y) then
    return game.respond(p.id, false, 'too_far', rep, logs);
  end if;$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.attack(text, integer, integer)';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef('public.fight_step()'::regprocedure);
  a text[] := array[
    $a$    exit when t > now();$a$];
  b text[] := array[
    $b$    exit when t > now();
    if e.next_swing < p.fight_next then
      select * into at_x, at_y from game.enemy_tile(e, t);
      if not game.enemy_adjacent(at_x, at_y, p.pos_x, p.pos_y) then
        e.next_swing := t + make_interval(secs => k.speed * 0.5);
        continue;
      end if;
    end if;$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.fight_step()';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef('public.jump_me(integer, integer)'::regprocedure);
  a text[] := array[
    $a$  e.fight_x := least(greatest(p_x + dx, 24), 33);$a$,
    $a$  e.fight_y := least(greatest(p_y + dy, 7), 11);$a$,
    $a$    next_swing = e.next_swing, fight_seen = e.fight_seen where id = e.id;$a$];
  b text[] := array[
    $b$  select c.x, c.y into e.fight_x, e.fight_y
  from (select p_x + a as x, p_y + b as y, abs(a - dx) + abs(b - dy) as off
    from generate_series(-1, 1) a, generate_series(-1, 1) b where a <> 0 or b <> 0) c
  where c.x between 24 and 33 and c.y between 7 and 11
    and game.enemy_adjacent(c.x, c.y, p_x, p_y)
  order by c.off, c.y, c.x limit 1;
  if e.fight_x is null then return game.respond(p.id, false, 'no_one', rep, logs); end if;$b$,
    $b$$b$,
    $b$    next_swing = e.next_swing, fight_seen = e.fight_seen, arrive_at = null,
    route = '[]'::jsonb where id = e.id;$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.jump_me(integer, integer)';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $$
begin
  if position('enemy_adjacent' in pg_get_functiondef(
      'public.attack(text, integer, integer)'::regprocedure)) = 0
    or position('enemy_adjacent' in pg_get_functiondef('public.fight_step()'::regprocedure)) = 0
    or position('enemy_adjacent' in pg_get_functiondef(
      'public.jump_me(integer, integer)'::regprocedure)) = 0
    or not (game.enemy_adjacent(50, 43, 51, 44) = true
      and game.enemy_adjacent(50, 43, 52, 43) = false
      and game.enemy_adjacent(46, 49, 46, 50) = false) then
    raise exception '0045: a patch did not land or the reach differs from the game';
  end if;
end $$;

select 'ok' as melee_reach;

commit;
