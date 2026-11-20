// Prints supabase/migrations/0047_pipe_dreams.sql (v0.62): the quest "Pipe Dreams", and Hotline's inside.
// Run: npx vite-node scripts/pipe-sql.ts > supabase/migrations/0047_pipe_dreams.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
//
// What it does (the SQL has no comments: Supabase's SQL editor mangles them, see 0041). Lines under 100 characters.
//  - The map: Hotline is a room now (you walk in by its office door, west). The enemies' walk map gets the rows that
//    changed (game.patch_row, from 0043), game.shot_walls is rebuilt from the game's buildings (Hotline isn't a block
//    any more: its walls are the room's).
//  - The Pipe Elbow (a quest item: no dropping, worth $0) and its craft at a workbench: a tin sheet, Tinkering 1,
//    10 XP (src/game/data/metals.ts).
//  - game.pipe_dreams(p, who, choice, x, y): every step of the quest (src/game/data/quests.ts has the words), checked
//    on the server: Gus (behind his counter at Hotline), the bartender, the water main (across the street from the
//    bar), the bar's burst pipe. You must stand at each. The step is players.quests.pipe_dreams (0–6):
//      0 → Gus: accept → 1 → the bartender → 2 → the water main off → 3 → fit a Pipe Elbow on the leak → 4 → the water
//      main on → 5 → Gus: +50 Scrapping XP, +50 Tinkering XP, $50 → 6 (done).
//  - public.quest_talk (patched): hands Gus, the bartender, the water main and the leak to game.pipe_dreams.
//  - A guard undoes everything if the walk map or the walls aren't the game's, or a patch didn't land.
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { BAR, BAR_LEAK, HOTLINE, WATER_MAIN } from '../src/street/map';
import { SHOT_WALLS } from '../src/street/sight';
import { CRAFT_BY_ID } from '../src/game/data/metals';
import { applyPatch, gameRows, liveAfter0041, rowPatch } from './city-sql';
import { shortLines } from './sqlkit';

declare const require: (m: string) => any;
const md5 = (t: string): string => require('node:crypto').createHash('md5').update(t).digest('hex');

/** The walk map as it's live after 0043: 0041's, with 0043's patches written in. */
export function liveAfter0043(m0038: string, m0040: string, m0041: string, m0043: string): string[] {
  const rows = liveAfter0041(m0038, m0040, m0041);
  const block = m0043.slice(m0043.indexOf('from (values'), m0043.indexOf(') v(y, p)')).replace(/'\s*\|\|\s*'/g, '');
  for (const [, y, p] of block.matchAll(/\((\d+), '([^']*)'\)/g)) rows[Number(y)] = applyPatch(rows[Number(y)], p);
  return rows;
}

/** A DO block that edits a function in place: each anchor must be found exactly once, or nothing runs. */
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

/** The quest's reward. */
export const REWARD = { scrapping: 50, tinkering: 50, cash: 50 };

export function pipeSql(m0038: string, m0040: string, m0041: string, m0043: string): string {
  const live = liveAfter0043(m0038, m0040, m0041, m0043);
  const game = gameRows();
  const changed = game.map((r, y) => [y, r] as [number, string]).filter(([y, r]) => r !== live[y]);
  const walls = [...SHOT_WALLS].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0 || a.x1 - b.x1 || a.y1 - b.y1);
  const wallKey = walls.map((r) => [r.x0, r.y0, r.x1, r.y1].join(',')).join(';');
  const elbow = CRAFT_BY_ID.pipe_elbow;
  // Where you must stand: in front of Gus's counter (the tiles left of it), in the bar, at the main, on the leak.
  const gus = { x0: HOTLINE.x0, x1: HOTLINE.x0 + 1, y0: HOTLINE.y0 + 1, y1: HOTLINE.y0 + 4 };
  const sql = `begin;

update game.walk_map w set masks = game.patch_row(w.masks, v.p)
from (values
${changed.map(([y, r]) => `(${y}, '${rowPatch(live[y], r)}')`).join(',\n')}
) v(y, p) where w.y = v.y;

delete from game.shot_walls;
insert into game.shot_walls (x0, y0, x1, y1) values
${walls.map((r) => `(${r.x0},${r.y0},${r.x1},${r.y1})`).join(',')};

insert into public.items (id, name, value, quest) values ('pipe_elbow', 'Pipe Elbow', 0, true)
on conflict (id) do update set name = excluded.name, value = excluded.value, quest = excluded.quest;
insert into public.crafts (id, station_kind, skill, level, xp, ticks, inputs, amount)
values ('pipe_elbow', '${elbow.station}', '${elbow.skill}', ${elbow.level}, ${elbow.xp}, ${elbow.ticks},
  '${JSON.stringify(elbow.inputs)}'::jsonb, 1)
on conflict (id) do update set station_kind = excluded.station_kind, skill = excluded.skill,
  level = excluded.level, xp = excluded.xp, ticks = excluded.ticks, inputs = excluded.inputs,
  amount = excluded.amount;

create or replace function game.pipe_dreams(p public.players, p_npc text, p_choice text,
    p_x integer, p_y integer)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog', 'public', 'game'
as $$
declare
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  step int := coalesce((p.quests ->> 'pipe_dreams')::int, 0);
  line text;
  n int;
  lv_s int := game.level_from_xp(p.scrapping_xp);
  lv_t int := game.level_from_xp(p.tinkering_xp);
begin
  if p_npc = 'gus' then
    if not (p_x between ${gus.x0} and ${gus.x1} and p_y between ${gus.y0} and ${gus.y1}) then
      return game.respond(p.id, false, 'too_far', null, null);
    end if;
    if step = 0 then
      if p_choice = 'accept' then
        step := 1;
        line := 'gu_accepted';
        logs := logs || to_jsonb('Quest started: Pipe Dreams.'::text);
      elsif p_choice = 'decline' then
        line := 'gu_declined';
      else
        line := 'gu_offer';
      end if;
    elsif step = 1 then line := 'gu_bar';
    elsif step = 2 then line := 'gu_main';
    elsif step = 3 then line := 'gu_elbow';
    elsif step = 4 then line := 'gu_water';
    elsif step = 5 then
      p.scrapping_xp := p.scrapping_xp + ${REWARD.scrapping};
      p.tinkering_xp := p.tinkering_xp + ${REWARD.tinkering};
      p.cash := p.cash + ${REWARD.cash};
      rep := jsonb_set(rep, '{xp}',
        jsonb_build_object('scrapping', ${REWARD.scrapping}, 'tinkering', ${REWARD.tinkering}));
      rep := game.bump(rep, 'cash', ${REWARD.cash});
      if game.level_from_xp(p.scrapping_xp) > lv_s then
        rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill',
          'scrapping', 'level', game.level_from_xp(p.scrapping_xp)));
        logs := logs || to_jsonb(format('Scrapping reached level %s!',
          game.level_from_xp(p.scrapping_xp)));
      end if;
      if game.level_from_xp(p.tinkering_xp) > lv_t then
        rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps') || jsonb_build_object('skill',
          'tinkering', 'level', game.level_from_xp(p.tinkering_xp)));
        logs := logs || to_jsonb(format('Tinkering reached level %s!',
          game.level_from_xp(p.tinkering_xp)));
      end if;
      step := 6;
      line := 'gu_thanks';
      logs := logs || to_jsonb(('Quest complete: Pipe Dreams! +${REWARD.scrapping} Scrapping XP, '
        || '+${REWARD.tinkering} Tinkering XP and $${REWARD.cash}.')::text);
    else line := 'gu_done';
    end if;
  elsif p_npc = 'bartender' then
    if not (p_x between ${BAR.x0} and ${BAR.x1} and p_y between ${BAR.y0} and ${BAR.y1}) then
      return game.respond(p.id, false, 'too_far', null, null);
    end if;
    if step = 0 then return game.respond(p.id, false, 'not_now', null, null);
    elsif step = 1 then
      step := 2;
      line := 'bt_leak';
    elsif step = 2 then line := 'bt_main';
    elsif step = 3 then line := 'bt_fix';
    elsif step = 4 then line := 'bt_on';
    else line := 'bt_after';
    end if;
  elsif p_npc = 'water_main' then
    if greatest(abs(p_x - ${WATER_MAIN[0]}), abs(p_y - ${WATER_MAIN[1]})) > 1 then
      return game.respond(p.id, false, 'too_far', null, null);
    end if;
    if step < 2 then line := 'wm_nothing';
    elsif step = 2 then
      step := 3;
      line := 'wm_off';
    elsif step = 3 then line := 'wm_already_off';
    elsif step = 4 then
      step := 5;
      line := 'wm_on';
    else line := 'wm_done';
    end if;
  elsif p_npc = 'bar_leak' then
    if greatest(abs(p_x - ${BAR_LEAK[0]}), abs(p_y - ${BAR_LEAK[1]})) > 1 then
      return game.respond(p.id, false, 'too_far', null, null);
    end if;
    if step < 2 then line := 'lk_nothing';
    elsif step = 2 then line := 'lk_spraying';
    elsif step = 3 then
      n := coalesce((p.inventory ->> 'pipe_elbow')::int, 0);
      if n < 1 then
        line := 'lk_need_elbow';
      else
        p.inventory := case when n = 1 then p.inventory - 'pipe_elbow'
          else jsonb_set(p.inventory, '{pipe_elbow}', to_jsonb(n - 1)) end;
        step := 4;
        line := 'lk_fixed';
      end if;
    else line := 'lk_done';
    end if;
  else
    return game.respond(p.id, false, 'unknown_npc', null, null);
  end if;
  p.quests := jsonb_set(p.quests, '{pipe_dreams}', to_jsonb(step));
  update public.players set quests = p.quests, inventory = p.inventory,
    scrapping_xp = p.scrapping_xp, tinkering_xp = p.tinkering_xp, cash = p.cash,
    updated_at = now()
  where id = p.id;
  return game.respond(p.id, true, line, rep, logs);
end $$;
revoke execute on function game.pipe_dreams(public.players, text, text, integer, integer)
  from public, anon, authenticated;

${patch('public.quest_talk(text, text, integer, integer)', [
  [
    "  elsif p_npc = 'elliot' then",
    `  elsif p_npc in ('gus', 'bartender', 'water_main', 'bar_leak') then
    return game.pipe_dreams(p, p_npc, p_choice, p_x, p_y);
  elsif p_npc = 'elliot' then`,
  ],
])}

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> '${md5(game.join(''))}' then
    raise exception '0047: walk map differs from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', x0, y0, x1, y1), ';' order by x0, y0, x1, y1))
    from game.shot_walls) <> '${md5(wallKey)}' then
    raise exception '0047: walls differ from the game';
  end if;
  if position('pipe_dreams' in pg_get_functiondef(
      'public.quest_talk(text, text, integer, integer)'::regprocedure)) = 0 then
    raise exception '0047: quest_talk was not patched';
  end if;
end $$;

select 'ok' as pipe_dreams;

commit;
`
    .split('\n')
    .map(shortLines)
    .join('\n');
  for (const l of sql.split('\n')) if (l.length > 100) throw new Error(`line over 100 characters: ${l}`);
  if (/--/.test(sql.replace(/'[^']*'/g, ''))) throw new Error('a comment in the migration');
  return sql;
}

if (!process.env.VITEST) {
  const fs = require('node:fs');
  const m = (f: string) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  process.stdout.write(pipeSql(m('0038_aluminium.sql'), m('0040_beach.sql'), m('0041_bar_and_yard.sql'), m('0043_city_scale.sql')));
}
