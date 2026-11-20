begin;

alter table public.graves add column if not exists seen_at timestamptz not null default now();

create or replace function game.grave_tick(uid uuid)
 returns void
 language sql
 set search_path to 'pg_catalog', 'public'
as $$
  update public.graves
  set expires_at = expires_at
      + greatest(interval '0', now() - seen_at - interval '30 seconds'),
    seen_at = now()
  where player_id = uid
$$;
revoke execute on function game.grave_tick(uuid) from public, anon, authenticated;

do $do$
declare
  def text := pg_get_functiondef(
    'game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure);
  a text[] := array[
    $a$select jsonb_build_object('x', g.x, 'y', g.y,$a$];
  b text[] := array[
    $b$perform game.grave_tick(uid);
  select jsonb_build_object('x', g.x, 'y', g.y,$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'game.respond(uuid, boolean, text, jsonb, jsonb)';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef(
    'public.get_my_player()'::regprocedure);
  a text[] := array[
    $a$select to_jsonb(g) into v_grave$a$];
  b text[] := array[
    $b$perform game.grave_tick(v_uid);
  select to_jsonb(g) into v_grave$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.get_my_player()';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef(
    'public.game_state()'::regprocedure);
  a text[] := array[
    $a$delete from public.graves where player_id = p.id and expires_at$a$];
  b text[] := array[
    $b$perform game.grave_tick(p.id);
  delete from public.graves where player_id = p.id and expires_at$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.game_state()';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef(
    'public.collect_grave()'::regprocedure);
  a text[] := array[
    $a$select * into g from public.graves$a$];
  b text[] := array[
    $b$perform game.grave_tick(p.id);
  select * into g from public.graves$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.collect_grave()';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $do$
declare
  def text := pg_get_functiondef(
    'game.die(players, timestamptz, jsonb, jsonb)'::regprocedure);
  a text[] := array[
    $a$p_at + interval '5 minutes');$a$,
    $a$get it back within 5 minutes.$a$];
  b text[] := array[
    $b$p_at + interval '60 minutes');$b$,
    $b$get it back within an hour of play.$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        'game.die(players, timestamptz, jsonb, jsonb)';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $$
begin
  if position('grave_tick' in pg_get_functiondef(
      'game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure)) = 0
    or position('grave_tick' in pg_get_functiondef('public.get_my_player()'::regprocedure)) = 0
    or position('grave_tick' in pg_get_functiondef('public.game_state()'::regprocedure)) = 0
    or position('grave_tick' in pg_get_functiondef('public.collect_grave()'::regprocedure)) = 0
    or position('60 minutes' in pg_get_functiondef(
      'game.die(players, timestamptz, jsonb, jsonb)'::regprocedure)) = 0 then
    raise exception '0046: a patch did not land';
  end if;
end $$;

select 'ok' as grave_hour;

commit;
