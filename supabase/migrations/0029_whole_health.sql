-- 0029_whole_health (v0.48): health is always a whole number.
--
-- Why: health came back continuously (1/60 HP every second), so it was stored as e.g. 1.9. The game shows whole
-- numbers (rounded down, never 0 while alive), so at 1.9 HP it showed 1, a hit for 1 left 0.9, and it still showed 1.
-- Now health comes back in whole points: +1 for each full minute. When health changes (a hit, eating), the part of a
-- minute you'd already waited is kept (game.hp_anchor), so no regeneration is lost.
--
-- What it changes:
--   1. PLAYER DATA: the players whose health has a fraction are rounded DOWN to a whole number, never below 1 (2
--      players when this was written; nobody loses a whole point they had).
--   2. game.hp_now: whole minutes only (same signature, replaces it).
--   3. new game.hp_anchor: the regeneration clock moved on by whole minutes only.
--   4. one line each in fight_step, game.get_hit and eat_item (from their live definitions): stamp the clock with
--      game.hp_anchor instead of "now", so the part-minute carries over.
--
-- One transaction: it all applies or nothing does. To try it first without changing anything, replace the last line
-- "commit;" with "rollback;" and run it: the check at the end should say "ok". Then run it again with "commit;".

begin;

-- ---------- 1. round today's fractional health down (never below 1 while alive) ----------
update public.players p
set hp = greatest(1, floor(least(game.max_hp(p.health_xp)::numeric, p.hp + greatest(0, extract(epoch from (now() - p.hp_at))) / 60.0))),
    hp_at = now()
where p.hp > 0 and p.hp <> floor(p.hp);

-- ---------- 2. health now: +1 per FULL minute since the clock ----------
create or replace function game.hp_now(p public.players, p_at timestamptz)
returns numeric
language sql
stable
set search_path = pg_catalog, game
as $$
  select least(game.max_hp(p.health_xp)::numeric, p.hp + floor(greatest(0, extract(epoch from (p_at - p.hp_at))) / 60.0))
$$;

-- ---------- 3. the regeneration clock, moved on by whole minutes only (the part-minute carries over) ----------
create or replace function game.hp_anchor(p public.players, p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = pg_catalog, game
as $$
  select case when p_at <= p.hp_at then p_at
    else p.hp_at + make_interval(mins => floor(extract(epoch from (p_at - p.hp_at)) / 60.0)::int) end
$$;
revoke execute on function game.hp_anchor(public.players, timestamptz) from public, anon, authenticated;

-- ---------- 4. the three places that change health stamp the clock with hp_anchor ----------
do $do$
declare
  r record;
  def text;
begin
  for r in select * from (values
    ('public.fight_step()', E'        p.hp_at := t;', E'        p.hp_at := game.hp_anchor(p, t);'),
    ('game.get_hit(public.players, public.crimes, timestamp with time zone, text, jsonb, jsonb)', E'  p.hp_at := p_at;', E'  p.hp_at := game.hp_anchor(p, p_at);'),
    ('public.eat_item(text)', E'  p.hp_at := now();', E'  p.hp_at := game.hp_anchor(p, now());')
  ) as t(fn, old_text, new_text) loop
    def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old_text in def) = 0 then raise exception '%: anchor not found: %', r.fn, r.old_text; end if;
    -- (exactly once, so nothing else in the function changes)
    if (length(def) - length(replace(def, r.old_text, ''))) / length(r.old_text) <> 1 then raise exception '%: anchor found more than once', r.fn; end if;
    execute replace(def, r.old_text, r.new_text);
  end loop;
end $do$;

-- Check: this should say "ok".
select case when not exists (select 1 from public.players where hp <> floor(hp))
  and position('floor(greatest(0' in pg_get_functiondef('game.hp_now(public.players, timestamp with time zone)'::regprocedure)) > 0
  and position('hp_anchor' in pg_get_functiondef('public.fight_step()'::regprocedure)) > 0
  and position('hp_anchor' in pg_get_functiondef('game.get_hit(public.players, public.crimes, timestamp with time zone, text, jsonb, jsonb)'::regprocedure)) > 0
  and position('hp_anchor' in pg_get_functiondef('public.eat_item(text)'::regprocedure)) > 0
  then 'ok' else 'NOT APPLIED' end as whole_health;

commit;
