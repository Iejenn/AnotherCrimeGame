// Prints supabase/migrations/0046_grave_hour.sql (v0.62): a grave lasts an hour of time online (it used to be 5
// minutes of real time).
// Run: npx vite-node scripts/grave-sql.ts > supabase/migrations/0046_grave_hour.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
//
// What it does (the SQL has no comments: Supabase's SQL editor mangles them, see 0041):
//  - graves.seen_at: when the server last heard from the grave's owner.
//  - game.grave_tick(uid): pushes the grave's expires_at back by the time the owner was away: a gap of more than
//    GAP_S seconds since seen_at (the game, open, even in a background tab, talks to the server about every 10 s; a fight
//    or cooking more often) counts as offline. So expires_at stays "when it crumbles", in online time, and every
//    check that reads it (expires_at > now()) stays as it was.
//  - Ticked wherever the grave is read: game.respond (every action and heartbeat answers with it), get_my_player
//    (logging in), game_state (before it clears a crumbled grave) and collect_grave.
//  - game.die: a new grave gets an hour (GRAVE_MINUTES in src/game/engine.ts), and says so.
//  - A guard undoes everything if a patch didn't land.
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { GRAVE_MINUTES } from '../src/game/engine';

/** Longer than this without hearing from you (seconds) and you were offline. */
export const GAP_S = 30;

/** A DO block that edits a function in place: each anchor (one line) must be found exactly once, or nothing runs. */
function patch(sig: string, pairs: [string, string][]): string {
  return `do $do$
declare
  def text := pg_get_functiondef(
    '${sig}'::regprocedure);
  a text[] := array[
${pairs.map(([x]) => `    $a$${x}$a$`).join(',\n')}];
  b text[] := array[
${pairs.map(([, y]) => `    $b$${y}$b$`).join(',\n')}];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'anchor % of % not found once', i,
        '${sig}';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;`;
}

/** Put a statement in front of the one starting with `anchor` (on its own line, indented like a body line). */
const before = (anchor: string, line: string): [string, string] => [anchor, `${line}\n  ${anchor}`];

export function graveSql(): string {
  const tick = `create or replace function game.grave_tick(uid uuid)
 returns void
 language sql
 set search_path to 'pg_catalog', 'public'
as $$
  update public.graves
  set expires_at = expires_at
      + greatest(interval '0', now() - seen_at - interval '${GAP_S} seconds'),
    seen_at = now()
  where player_id = uid
$$;
revoke execute on function game.grave_tick(uuid) from public, anon, authenticated;`;

  // (Anchors are short unique pieces of a line, so no line in the file is over 100 characters.)
  const respond = patch('game.respond(uuid, boolean, text, jsonb, jsonb)', [
    before('select jsonb_build_object(\'x\', g.x, \'y\', g.y,', 'perform game.grave_tick(uid);'),
  ]);
  const login = patch('public.get_my_player()', [before('select to_jsonb(g) into v_grave', 'perform game.grave_tick(v_uid);')]);
  const state = patch('public.game_state()', [
    before('delete from public.graves where player_id = p.id and expires_at', 'perform game.grave_tick(p.id);'),
  ]);
  const collect = patch('public.collect_grave()', [before('select * into g from public.graves', 'perform game.grave_tick(p.id);')]);
  const minutes = GRAVE_MINUTES === 60 ? 'an hour' : `${GRAVE_MINUTES} minutes`;
  const die = patch('game.die(players, timestamptz, jsonb, jsonb)', [
    ["p_at + interval '5 minutes');", `p_at + interval '${GRAVE_MINUTES} minutes');`],
    ['get it back within 5 minutes.', `get it back within ${minutes} of play.`],
  ]);

  const guard = `do $$
begin
  if position('grave_tick' in pg_get_functiondef(
      'game.respond(uuid, boolean, text, jsonb, jsonb)'::regprocedure)) = 0
    or position('grave_tick' in pg_get_functiondef('public.get_my_player()'::regprocedure)) = 0
    or position('grave_tick' in pg_get_functiondef('public.game_state()'::regprocedure)) = 0
    or position('grave_tick' in pg_get_functiondef('public.collect_grave()'::regprocedure)) = 0
    or position('${GRAVE_MINUTES} minutes' in pg_get_functiondef(
      'game.die(players, timestamptz, jsonb, jsonb)'::regprocedure)) = 0 then
    raise exception '0046: a patch did not land';
  end if;
end $$;`;

  const sql = `begin;

alter table public.graves add column if not exists seen_at timestamptz not null default now();

${tick}

${respond}

${login}

${state}

${collect}

${die}

${guard}

select 'ok' as grave_hour;

commit;
`;
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

if (!process.env.VITEST) process.stdout.write(graveSql());
