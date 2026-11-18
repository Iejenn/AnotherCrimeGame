-- 0035_blocked_hits_xp (v0.52): Health (and Defense) XP for the hits you block. With a high Defense enemies mostly
-- miss you, and Health XP only came from damage taken, so it stalled. Now (decided):
--   an enemy hits you:   1 Health XP per point of damage (as before), 0.5 Defense XP per point (as before)
--   an enemy misses (0): 0.5 Health XP and 0.5 Defense XP
--
-- Health XP becomes a number with one decimal (like Defense XP already is), so the halves add up. Existing XP is kept
-- exactly (a whole number stays the same number). game.max_hp gets a version for the decimal column.
--
-- One transaction: to try it first, replace "commit;" with "rollback;". The check should say "ok".

begin;

-- Halves: health_xp bigint -> numeric(14,1) (the same type as defense_xp). Values are unchanged.
alter table public.players alter column health_xp type numeric(14,1);

-- max_hp for the decimal column (the old bigint one stays for anything that casts to it).
create or replace function game.max_hp(health_xp numeric)
 returns integer
 language sql
 immutable
 set search_path to 'pg_catalog', 'game'
as $$ select game.level_from_xp(health_xp) $$;
revoke execute on function game.max_hp(numeric) from public, anon, authenticated;

-- fight_step: after an enemy's swing, a miss gives 0.5 Health and 0.5 Defense XP (from its live definition).
do $do$
declare
  def text := pg_get_functiondef('public.fight_step()'::regprocedure);
  anchor text := $t$'by', 'enemy', 'dmg', dmg);$t$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then raise exception 'fight_step: anchor not found exactly once'; end if;
  execute replace(def, anchor, anchor || $t$
      -- A blocked hit trains Health and Defense too (0035): 0.5 XP each.
      if dmg = 0 then p.health_xp := p.health_xp + 0.5; p.defense_xp := p.defense_xp + 0.5; end if;$t$);
end $do$;

-- Check: this should say "ok".
select case when (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'health_xp') = 'numeric'
  and position('p.health_xp := p.health_xp + 0.5' in pg_get_functiondef('public.fight_step()'::regprocedure)) > 0
  and game.max_hp(449.5::numeric) = 10 and game.max_hp(449::bigint) = 10
  and (select count(*) from public.players where health_xp < 449) = 0
  then 'ok' else 'NOT APPLIED' end as blocked_hits_xp;

commit;
