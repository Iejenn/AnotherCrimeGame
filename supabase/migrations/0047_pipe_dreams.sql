begin;

update game.walk_map w set masks = game.patch_row(w.masks, v.p)
from (values
(42, '24:d06800d068'),
(43, '24:d66b00d66b'),
(44, '24:d66b00160b'),
(45, '23:7bde6b'),
(46, '24:d6fbf868'),
(47, '24:d6ffff6b'),
(48, '24:d6ffff6b'),
(49, '24:d67f1f1b08'),
(50, '23:eb160b'),
(51, '24:f9'),
(56, '39:7f1fdf'),
(57, '39:6b0016'),
(58, '39:fb68')
) v(y, p) where w.y = v.y;

delete from game.shot_walls;
insert into game.shot_walls (x0, y0, x1, y1) values
(7,7,11,11),(7,24,11,28),(7,29,11,33),(7,58,9,62),(7,63,11,67),
    (7,75,11,77),(7,92,11,94),(7,97,11,101),(9,12,11,16),(9,80,
    11,84),(12,7,14,11),(12,14,16,16),(12,24,16,26),(12,29,16,
    33),(12,58,16,62),(12,63,16,67),(12,75,16,77),(12,80,16,84),
    (12,92,16,94),(12,99,16,101),(24,14,28,16),(24,24,26,28),
    (24,58,28,60),(24,65,28,67),(24,75,28,79),(24,82,28,84),(24,
    92,28,96),(24,97,28,101),(26,29,28,33),(29,12,33,16),(29,
    24,33,26),(29,29,31,33),(29,58,33,60),(29,63,33,67),(29,75,
    31,79),(29,80,33,84),(29,92,33,94),(29,97,33,101),(41,58,
    45,62),(41,63,45,67),(41,75,45,79),(41,82,45,84),(41,97,45,
    101),(43,92,45,96),(46,41,50,42),(46,58,48,62),(46,65,50,
    67),(46,75,48,79),(46,82,50,84),(46,92,48,96),(46,99,50,101),
    (51,41,54,42),(55,41,60,42),(58,7,60,11),(58,12,62,16),(58,
    24,60,28),(58,31,62,33),(58,80,60,84),(58,92,60,96),(58,99,
    62,101),(60,75,62,79),(61,41,65,42),(63,7,65,11),(63,14,67,
    16),(63,31,67,33),(63,75,67,77),(63,80,67,84),(63,99,67,101),
    (65,92,67,96),(66,41,67,50),(75,7,79,11),(75,12,77,16),(75,
    24,79,28),(75,92,79,96),(75,97,77,101),(80,7,82,11),(80,12,
    84,16),(80,92,84,96),(80,97,84,101),(92,12,96,16),(92,24,
    96,28),(92,29,96,33),(92,41,96,45),(92,46,96,50),(92,75,94,
    79),(92,80,96,84),(92,92,94,96),(92,97,96,101),(94,7,96,11),
    (97,14,101,16),(97,24,101,28),(97,75,101,77),(97,82,101,84),
    (97,99,101,101),(99,29,101,33),(99,41,101,45),(99,92,101,
    96),(109,7,113,11),(109,14,113,16),(109,24,113,28),(109,41,
    113,45),(109,46,113,50),(109,58,113,60),(109,63,111,67),(109,
    80,118,84),(109,92,111,96),(109,97,113,101),(111,29,113,33),
    (114,7,118,11),(114,12,118,16),(114,24,116,28),(114,29,116,
    33),(114,41,118,45),(114,46,118,50),(114,58,118,60),(114,
    92,118,94),(114,97,118,101),(116,63,118,67),(126,7,130,9),
    (126,46,130,50),(126,58,130,60),(126,75,130,79),(126,80,130,
    84),(126,92,130,96),(126,97,130,101),(128,41,130,45),(128,
    63,130,67),(131,7,135,11),(131,41,133,45),(131,48,135,50),
    (131,58,133,62),(131,63,135,67),(131,75,135,77),(131,92,135,
    96),(131,99,135,101),(133,80,135,84),(143,7,145,11),(143,
    12,145,16),(143,24,147,26),(143,41,147,45),(143,48,147,50),
    (143,58,147,62),(143,63,147,67),(143,92,145,96),(143,97,147,
    101),(145,29,147,33),(148,7,152,11),(148,12,150,16),(148,
    41,150,45),(148,46,152,50),(148,58,150,62),(148,65,152,67),
    (148,92,152,96),(148,97,152,101),(150,24,152,28),(150,29,
    152,33);

insert into public.items (id, name, value, quest) values ('pipe_elbow',
     'Pipe Elbow', 0, true)
on conflict (id) do update set name = excluded.name, value =
    excluded.value, quest = excluded.quest;
insert into public.crafts (id, station_kind, skill, level, xp,
     ticks, inputs, amount)
values ('pipe_elbow', 'bench', 'tinkering', 1, 10, 4,
  '{"tin_sheet":1}'::jsonb, 1)
on conflict (id) do update set station_kind = excluded.station_kind,
     skill = excluded.skill,
  level = excluded.level, xp = excluded.xp, ticks = excluded.ticks,
     inputs = excluded.inputs,
  amount = excluded.amount;

create or replace function game.pipe_dreams(p public.players,
     p_npc text, p_choice text,
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
    if not (p_x between 24 and 25 and p_y between 42 and 45)
    then
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
      p.scrapping_xp := p.scrapping_xp + 50;
      p.tinkering_xp := p.tinkering_xp + 50;
      p.cash := p.cash + 50;
      rep := jsonb_set(rep, '{xp}',
        jsonb_build_object('scrapping', 50, 'tinkering', 50));
      rep := game.bump(rep, 'cash', 50);
      if game.level_from_xp(p.scrapping_xp) > lv_s then
        rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps')
    || jsonb_build_object('skill',
          'scrapping', 'level', game.level_from_xp(p.scrapping_xp)));
        logs := logs || to_jsonb(format('Scrapping reached level %s!',
          game.level_from_xp(p.scrapping_xp)));
      end if;
      if game.level_from_xp(p.tinkering_xp) > lv_t then
        rep := jsonb_set(rep, '{levelUps}', (rep -> 'levelUps')
    || jsonb_build_object('skill',
          'tinkering', 'level', game.level_from_xp(p.tinkering_xp)));
        logs := logs || to_jsonb(format('Tinkering reached level %s!',
          game.level_from_xp(p.tinkering_xp)));
      end if;
      step := 6;
      line := 'gu_thanks';
      logs := logs || to_jsonb(('Quest complete: Pipe Dreams! +50 Scrapping XP, '
        || '+50 Tinkering XP and $50.')::text);
    else line := 'gu_done';
    end if;
  elsif p_npc = 'bartender' then
    if not (p_x between 41 and 45 and p_y between 41 and 50)
    then
      return game.respond(p.id, false, 'too_far', null, null);
    end if;
    if step = 0 then return game.respond(p.id, false, 'not_now',
     null, null);
    elsif step = 1 then
      step := 2;
      line := 'bt_leak';
    elsif step = 2 then line := 'bt_main';
    elsif step = 3 then line := 'bt_fix';
    elsif step = 4 then line := 'bt_on';
    else line := 'bt_after';
    end if;
  elsif p_npc = 'water_main' then
    if greatest(abs(p_x - 40), abs(p_y - 57)) > 1 then
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
    if greatest(abs(p_x - 41), abs(p_y - 47)) > 1 then
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
          else jsonb_set(p.inventory, '{pipe_elbow}', to_jsonb(n
    - 1)) end;
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
    scrapping_xp = p.scrapping_xp, tinkering_xp = p.tinkering_xp,
     cash = p.cash,
    updated_at = now()
  where id = p.id;
  return game.respond(p.id, true, line, rep, logs);
end $$;
revoke execute on function game.pipe_dreams(public.players, text,
     text, integer, integer)
  from public, anon, authenticated;

do $do$
declare
  def text := pg_get_functiondef(
    'public.quest_talk(text, text, integer, integer)'::regprocedure);
  a text[] := array[
    $a$  elsif p_npc = 'elliot' then$a$];
  b text[] := array[
    $b$  elsif p_npc in ('gus', 'bartender', 'water_main', 'bar_leak')
    then
    return game.pipe_dreams(p, p_npc, p_choice, p_x, p_y);
  elsif p_npc = 'elliot' then$b$];
  i int;
begin
  for i in 1 .. cardinality(a) loop
    if (length(def) - length(replace(def, a[i], ''))) / length(a[i])
    <> 1 then
      raise exception 'anchor % of % not found once', i,
        'public.quest_talk(text, text, integer, integer)';
    end if;
    def := replace(def, a[i], b[i]);
  end loop;
  execute def;
end $do$;

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> '5ac05b304c3b041e5a7e1d37db5b230e' then
    raise exception '0047: walk map differs from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', x0, y0, x1, y1), ';'
    order by x0, y0, x1, y1))
    from game.shot_walls) <> '9a003bee6dc2df859e3e36dcd826b50e'
    then
    raise exception '0047: walls differ from the game';
  end if;
  if position('pipe_dreams' in pg_get_functiondef(
      'public.quest_talk(text, text, integer, integer)'::regprocedure))
    = 0 then
    raise exception '0047: quest_talk was not patched';
  end if;
end $$;

select 'ok' as pipe_dreams;

commit;
