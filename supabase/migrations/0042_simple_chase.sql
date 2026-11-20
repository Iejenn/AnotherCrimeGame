begin;

create or replace function game.enemy_chase(fx integer, fy integer, tx integer,
    ty integer)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  x int := fx;
  y int := fy;
  y0 int := least(fy, ty);
  rws text[];
  m int;
  dx int;
  dy int;
  sx int;
  sy int;
  k int;
  ok boolean;
  route jsonb := '[]'::jsonb;
begin
  rws := array(select r.masks from game.walk_map r
    where r.y between least(fy, ty) and greatest(fy, ty) order by r.y);
  loop
    m := ('x' || substr(rws[y - y0 + 1], x * 2 + 1, 2))::bit(8)::int;
    if greatest(abs(x - tx), abs(y - ty)) = 1
      and (m & (1 << game.walk_bit(tx - x, ty - y))) <> 0 then
      return jsonb_build_object('route', route, 'reached', true);
    end if;
    dx := sign(tx - x)::int;
    dy := sign(ty - y)::int;
    ok := false;
    for k in 1 .. 3 loop
      if k = 1 then
        continue when dx = 0 or dy = 0;
        sx := dx; sy := dy;
      elsif k = 2 then
        continue when dx = 0;
        sx := dx; sy := 0;
      else
        continue when dy = 0;
        sx := 0; sy := dy;
      end if;
      continue when x + sx = tx and y + sy = ty;
      if (m & (1 << game.walk_bit(sx, sy))) <> 0 then
        ok := true;
        exit;
      end if;
    end loop;
    if not ok then
      return jsonb_build_object('route', route, 'reached', false);
    end if;
    x := x + sx;
    y := y + sy;
    route := route || jsonb_build_array(jsonb_build_array(x, y));
  end loop;
end $$;
revoke execute on function game.enemy_chase(integer, integer, integer, integer)
  from public, anon, authenticated;

do $do$
declare
  def text := pg_get_functiondef('public.attack(text, integer, integer)'::regprocedure);
  a text[] := array[
    $a$  v_last jsonb;$a$,
    $a$      v_route := game.enemy_route(e.from_x, e.from_y, p_x, p_y);$a$,
    $a$    e.next_swing := e.arrive_at + make_interval(secs => k.speed * 0.5);$a$,
    $a$    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));$a$,
    $a$  e.fight_seen := now();$a$];
  b text[] := array[
    $b$  v_last jsonb;
  v_chase jsonb;
  v_fresh boolean := false;
  v_tile record;$b$,
    $b$      v_chase := game.enemy_chase(e.from_x, e.from_y, p_x, p_y);
      v_route := v_chase -> 'route';$b$,
    $b$    e.next_swing := case when ranged and not (v_chase ->> 'reached')::boolean
      then now() + interval '1 hour'
      else e.arrive_at + make_interval(secs => k.speed * 0.5) end;$b$,
    $b$    v_fresh := true;
    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));
    if ranged and not (v_chase ->> 'reached')::boolean then
      logs := logs || to_jsonb(format('The %s cannot get to you.', lower(k.name)));
    end if;$b$,
    $b$  if not v_fresh and e.fighter = p.id and e.next_swing > now() + interval '30 minutes' then
    select * into v_tile from game.enemy_tile(e, now());
    v_chase := game.enemy_chase(v_tile.x, v_tile.y, p_x, p_y);
    e.from_x := v_tile.x;
    e.from_y := v_tile.y;
    e.route := v_chase -> 'route';
    e.fight_x := v_tile.x;
    e.fight_y := v_tile.y;
    if jsonb_array_length(e.route) > 0 then
      v_last := e.route -> -1;
      e.fight_x := (v_last ->> 0)::int;
      e.fight_y := (v_last ->> 1)::int;
    end if;
    e.arrive_at := now() + make_interval(secs => game.route_len(e.from_x, e.from_y, e.route) / 2.5);
    if (v_chase ->> 'reached')::boolean then
      e.next_swing := e.arrive_at + make_interval(secs => k.speed * 0.5);
    end if;
  end if;
  e.fight_seen := now();$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i, 'public.attack(text, integer, integer)';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef('public.fight_step()'::regprocedure);
  a text[] := array[
    $a$      if not ranged and e.arrive_at is not null and t < e.arrive_at then$a$,
    $a$        p.fight_next := e.arrive_at;$a$];
  b text[] := array[
    $b$      if not ranged and ((e.arrive_at is not null and t < e.arrive_at)
        or e.next_swing > now() + interval '30 minutes') then$b$,
    $b$        p.fight_next := case when e.next_swing > now() + interval '30 minutes'
          then now() + interval '1 second' else e.arrive_at end;$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i, 'public.fight_step()';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $$
begin
  if not (game.enemy_chase(76, 59, 76, 64)
    = '{"reached":true,"route":[[76,60],[76,61],[76,62],[76,63]]}'::jsonb
    and game.enemy_chase(77, 59, 82, 62)
    = '{"reached":true,"route":[[78,60],[79,60],[80,60],[81,60],[82,60],[82,61]]}'::jsonb
    and game.enemy_chase(18, 117, 18, 123)
    = '{"reached":false,"route":[[18,118]]}'::jsonb
    and game.enemy_chase(23, 116, 27, 124)
    = '{"reached":false,"route":[[24,117],[25,118],[26,118],[27,118]]}'::jsonb) then
    raise exception '0042: the chase differs from the game';
  end if;
end $$;

select 'ok' as chase;

commit;
