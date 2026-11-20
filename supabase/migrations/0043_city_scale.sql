begin;

create or replace function game.patch_row(m text, spec text)
 returns text
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $$
declare
  part text;
  x int;
  h text;
begin
  foreach part in array string_to_array(spec, ',') loop
    x := split_part(part, ':', 1)::int;
    h := split_part(part, ':', 2);
    m := overlay(m placing h from x * 2 + 1 for length(h));
  end loop;
  return m;
end $$;
revoke execute on function game.patch_row(text, text) from public,
     anon, authenticated;

update public.spots set x = 44, y = 41 where id = 'drunk_0';
update public.spots set x = 44, y = 43 where id = 'drunk_1';
update public.spots set x = 44, y = 45 where id = 'drunk_2';
delete from public.spot_state where spot_id in ('drunk_3', 'drunk_4',
     'drunk_5');
update public.players set job_crime = null, job_spot = null,
    job_started_at = null,
    job_ends_at = null where job_spot in ('drunk_3', 'drunk_4',
     'drunk_5');
delete from public.spots where id in ('drunk_3', 'drunk_4', 'drunk_5');

update game.walk_map w set masks = game.patch_row(w.masks, v.p)
from (values
(6, '9:1f,15:dfffff,61:df7f,66:dfffff,77:1f,83:dfffff,91:ffff7f,128:1f,145:'
    || '1fdf7f'),
(7, '9:00,15:d6ffff,61:d66b,66:d6ffff,77:00,83:d6ffff,91:ffff6b,128:00,145:'
    || '00d66b'),
(8, '9:00,15:d6ffff,61:d66b,66:d6ffff,77:00,83:d6ffff,91:ffff6b,128:00,145:'
    || '00d66b'),
(9, '9:00,15:d6ffff,61:d66b,66:d6ffff,77:00,83:d6ffff,91:ffff6b000000d6,128'
    || ':00,145:00d66b'),
(10, '9:00,14:00d6ffff,61:d66b,66:d6ffff,77:00,82:00d6ffff,91:ffff6b,125:fbf'
    || '8f8f8f868,133:00,145:00d66b'),
(11, '9:00,14:00d6ffff,61:160b,66:d6ffff,77:00,82:00161fdf,91:7f1f0b,97:d6ff'
    || 'ffffffff,125:7f1f1f1f1f0b,133:00,145:00d66b'),
(12, '6:fbf868,12:d0f8f8feffff,23:fbf8f8f8f868,31:00,60:00,63:d0f8f8feffff,7'
    || '8:d068,82:00,97:d6ffffffffff,108:fbf8f8f8f868,116:00,146:d66b,151:d0f8'
    || 'fe'),
(13, '6:ffff6b,12:161f1f1f1fdf,23:7f1f1f1f1f0b,31:00,60:00,63:161f1f1f1fdf,7'
    || '8:d66b,82:00,97:161f1f1f1fdf,108:7f1f1f1f1f0b,116:00,146:d66b,151:d6ff'
    || 'ff'),
(14, '6:ffff6b,26:00,31:00,60:00,74:6b000000d66b,82:00,91:6b0000000000,108:6'
    || 'b0000000000,116:00,146:d66b,151:d6ffff'),
(15, '6:ffff6b,26:00,31:00,60:00,78:d66b,82:00,116:00,146:d66b,151:d6ffff'),
(16, '6:ffff6b,26:00,31:00,60:00,78:d66b,82:00,116:00,146:d66b,151:d6ffff'),
(17, '6:fffffb,26:f8,31:f8,60:f8,78:fefb,82:f8,116:f8,146:fefb,151:feffff'),
(23, '26:1fdf7f,61:df7f7f,94:1f,117:dfffff,148:df7f'),
(24, '26:00d66b,61:d66f,94:00,117:d6ffff,148:d66b'),
(25, '26:00d66b,61:d66b,94:00,117:d6ffff,148:d66b'),
(26, '26:00d66b0000000000d6,61:d66b,94:00,97:0000000000d6,117:d6ffff,142:6b0'
    || '000000000d66b'),
(27, '12:d0f8f8f8f8fe,26:00d6fbf8f8f8f8f8fe,60:00d66b,94:00,116:00d6ffff,142'
    || ':fbf8f8f8f8f8fe6b'),
(28, '12:161f1f1f1fdf,26:00161f1f1f1fdfffff,60:00d6eb,68:f6,94:00,116:00d6ff'
    || 'ff,142:ffff7f1f1f1fdf6b'),
(29, '9:00,23:fbf868,32:d6ffff,57:fbf8f8f8fefbf9f8f8f8fcfe,97:d068,108:fbf86'
    || '8,117:d6ffff,142:ffff6b00,148:d66b'),
(30, '9:00,23:ffff6b,32:d6ffff,57:7f1f1f1f1f1f1f1f1f1f1fdf,97:d66b,108:ffff6'
    || 'b,117:d6ffff,142:ffff6b00,148:d66b'),
(31, '9:00,12:0000000000d6,23:ffff6b,32:d6ffff,57:6b0000000000,97:d66b,108:f'
    || 'fff6b,117:d6ffff,142:ffff6b00,148:d66b000000d6'),
(32, '9:00,23:ffff6b,31:00d6ffff,97:d66b,108:ffff6b,117:d6ffff,142:ffff6b00,'
    || '148:d66b'),
(33, '9:00,23:ffff6b,31:00d6ffff,97:d66b,108:ffff6b,117:d6ffff,142:ffff6b00,'
    || '148:d66b'),
(34, '9:f8,23:fffffb,31:f8feffff,97:fefb,108:fffffb,117:feffff,142:fffffbf8,'
    || '148:fefb'),
(40, '97:df7f,116:1f,125:ffff7f,134:dfffff,145:1f,151:dfffff'),
(41, '97:d66b,116:00,125:ffff6b,134:d6ffff,145:00,151:d6ffff'),
(42, '44:1048,97:d66b,116:00,125:ffff6b,134:d6ffff,145:00,151:d6ffff'),
(43, '97:d66b,116:00,125:ffff6b000000000000d6ffff,145:00,151:d6ffff'),
(44, '44:104a,97:d66b00,116:00,125:ffff6b,134:d6ffff,145:00,151:d6ffff'),
(45, '97:160b00,116:00,125:7f1f0b,134:d6ffff,145:00,151:161fdf'),
(46, '44:d06a,131:d0f8f8feffff,142:fbf8f8f8f868'),
(47, '44:1e0b,131:161f1f1f1fdf,142:7f1f1f1f1f0b'),
(48, '114:0000000000d6,133:00,148:0000000000d6'),
(49, '133:00'),
(50, '133:00'),
(51, '133:f8'),
(57, '10:df7f,31:1f,49:dfffff,111:1f,134:dfffff,151:dfffff'),
(58, '10:d66b,31:00,49:d6ffff,111:00,134:d6ffff,151:d6ffff'),
(59, '10:d66b,31:00,49:d6ffff,111:00,134:d6ffff,151:d6ffff'),
(60, '10:d66b0000000000d6,31:00,49:d6ffff,111:00,134:d6ffff,142:6b0000000000'
    || ',151:d6ffff'),
(61, '10:d66b,23:fbf8f8f8f8f8f8f8f8f8f8fe,49:d6ffff,108:fbf8f8f8f8f8f8f8f8f8'
    || 'f8fe,125:fbf8f8f8f868,134:d6ffff,150:00d6ffff'),
(62, '10:160b,23:ffffffffff7f1f1f1f1f1fdf,49:d6ffff,108:7f1f1f1fdfffff7f1f1f'
    || '1fdf,125:ffff7f1f1f0b,134:161fdf,150:00d6ffff'),
(63, '9:00,14:00,23:ffffffffff6b,46:d0f8f8feffff,111:00d6ffff6b00,125:ffff6b'
    || ',148:d0f8f8feffff'),
(64, '9:00,14:00,23:7f1f1f1f1f0b,46:161f1f1f1fdf,111:00d6ffff6b00,125:ffff6b'
    || ',148:161f1f1f1fdf'),
(65, '9:00,14:00,29:0000000000d6,40:6b0000000000,111:00d6ffff6b00,125:ffff6b'
    || ',131:0000000000d6,142:6b0000000000'),
(66, '9:00,14:00,111:00d6ffff6b00,125:ffff6b'),
(67, '9:00,14:00,111:00d6ffff6b00,125:ffff6b'),
(68, '9:f8,14:f8,111:f8fefffffbf8,125:fffffb'),
(74, '32:dfffff,49:dfffff,57:ffff7f,95:df7f'),
(75, '32:d6ffff,49:d6ffff,57:ffff6b,95:d66b'),
(76, '32:d6ffff,49:d6ffff,57:ffff6b,95:d66b'),
(77, '29:000000d6ffff,49:d6ffff,57:ffff6b,63:0000000000d6,91:6b000000d66b000'
    || '0000000d6'),
(78, '6:fbf8f8f8f8f8f8f8f8f8f8fe,32:d6ffff,48:00d6ffff,57:ffff6b,63:d0f8f8f8'
    || 'f8fe,95:d6fbf8f8f8f8f8fe,131:d0f8f8f8f8fe'),
(79, '6:ffff7f1f1f1f1f1f1f1f1fdf,32:161fdf,48:00d6ffff,57:7f1f0b,63:161f1f1f'
    || '1fdf,95:161fdfffffffffff,131:d67f1f1f1fdf'),
(80, '6:ffff6b,23:fbf8f8f8f868,40:fbf8f8f8f8f8f8f8f8feffff,61:d068,65:00,94:'
    || '00,97:d6ffffffffff,131:d66b'),
(81, '6:ffff6b,23:7f1f1f1f1f0b,40:7f1f1f1f1f1f1f1f1f1f1fdf,61:d66b,65:00,94:'
    || '00,97:161f1f1f1fdf,131:d66b'),
(82, '6:ffff6b000000,23:6b00000000000000000000d6,61:d66b,65:00,94:00,125:6b0'
    || '000000000d66b000000d6'),
(83, '6:ffff6b,61:d66b,65:00,94:00,131:d66b'),
(84, '6:ffff6b,61:d66b,65:00,94:00,131:d66b'),
(85, '6:fffffb,61:fefb,65:f8,94:f8,131:fefb'),
(91, '40:ffff7f,48:1fdfffff,60:1fdfffff7f,95:dfffff7f1f,111:1fdf7f,128:1f,14'
    || '6:df7f'),
(92, '40:ffff6b,48:00d6ffff,60:00d6ffff6b,95:d6ffff6b00,111:00d66b,128:00,14'
    || '6:d66b'),
(93, '40:ffff6b,48:00d6ffff,60:00d6ffff6b,95:d6ffff6b00,111:00d66b,128:00,14'
    || '6:d66b'),
(94, '6:6b0000000000,40:ffff6b,48:00d6ffff,60:00d6ffff6b,74:6b0000000000,95:'
    || 'd6ffff6b00,111:00d66b,128:00,142:6b000000d66b'),
(95, '6:fbf8f8f8f8f8f8f8f8f8f8fe,29:d0f8f8f8f8fe,40:ffff6b,48:00d6ffff,60:00'
    || 'd6ffff6b,82:00,95:d6ffff6b00,111:00d6fbf8f8f8f8f8fe,128:00,146:d66b'),
(96, '6:7f1f1f1f1f1fdfffffffffff,29:161f1f1f1fdf,40:7f1f0b,48:00d6ffff,60:00'
    || 'd6ffff6b,82:00,95:161fdf6b00,111:00161f1f1f1f1f1fdf,128:00,146:160b'),
(97, '9:00,12:d6ffffffffff,26:00,46:d0f8f8feffff,57:fbf8f8f8fefffffbf8f8f8fe'
    || ',78:d068,97:d6fbf8f8f8fe,131:d0f8f8f8f8fe'),
(98, '9:00,12:161f1f1f1fdf,26:00,46:161f1f1f1fdf,57:7f1f1f1f1f1f1f1f1f1f1fdf'
    || ',78:d66b,97:161f1f1f1fdf,131:161f1f1f1fdf'),
(99, '9:00,26:00,29:0000000000d6,40:6b0000000000,57:6b0000000000,65:00,74:6b'
    || '000000d66b,108:6b0000000000'),
(100, '9:00,26:00,65:00,78:d66b,150:00'),
(101, '9:00,26:00,65:00,78:d66b,150:00'),
(102, '9:f8,26:f8,65:f8,78:fefb,150:f8')
) v(y, p) where w.y = v.y;

delete from game.shot_walls;
insert into game.shot_walls (x0, y0, x1, y1) values
(7,7,11,11),(7,24,11,28),(7,29,11,33),(7,58,9,62),(7,63,11,67),
    (7,75,11,77),(7,92,11,94),(7,97,11,101),(9,12,11,16),(9,80,
    11,84),(12,7,14,11),(12,14,16,16),(12,24,16,26),(12,29,16,
    33),(12,58,16,62),(12,63,16,67),(12,75,16,77),(12,80,16,84),
    (12,92,16,94),(12,99,16,101),(24,14,28,16),(24,24,26,28),
    (24,41,28,50),(24,58,28,60),(24,65,28,67),(24,75,28,79),(24,
    82,28,84),(24,92,28,96),(24,97,28,101),(26,29,28,33),(29,
    12,33,16),(29,24,33,26),(29,29,31,33),(29,58,33,60),(29,63,
    33,67),(29,75,31,79),(29,80,33,84),(29,92,33,94),(29,97,33,
    101),(41,58,45,62),(41,63,45,67),(41,75,45,79),(41,82,45,
    84),(41,97,45,101),(43,92,45,96),(46,41,50,42),(46,58,48,
    62),(46,65,50,67),(46,75,48,79),(46,82,50,84),(46,92,48,96),
    (46,99,50,101),(51,41,54,42),(55,41,60,42),(58,7,60,11),(58,
    12,62,16),(58,24,60,28),(58,31,62,33),(58,80,60,84),(58,92,
    60,96),(58,99,62,101),(60,75,62,79),(61,41,65,42),(63,7,65,
    11),(63,14,67,16),(63,31,67,33),(63,75,67,77),(63,80,67,84),
    (63,99,67,101),(65,92,67,96),(66,41,67,50),(75,7,79,11),(75,
    12,77,16),(75,24,79,28),(75,92,79,96),(75,97,77,101),(80,
    7,82,11),(80,12,84,16),(80,92,84,96),(80,97,84,101),(92,12,
    96,16),(92,24,96,28),(92,29,96,33),(92,41,96,45),(92,46,96,
    50),(92,75,94,79),(92,80,96,84),(92,92,94,96),(92,97,96,101),
    (94,7,96,11),(97,14,101,16),(97,24,101,28),(97,75,101,77),
    (97,82,101,84),(97,99,101,101),(99,29,101,33),(99,41,101,
    45),(99,92,101,96),(109,7,113,11),(109,14,113,16),(109,24,
    113,28),(109,41,113,45),(109,46,113,50),(109,58,113,60),(109,
    63,111,67),(109,80,118,84),(109,92,111,96),(109,97,113,101),
    (111,29,113,33),(114,7,118,11),(114,12,118,16),(114,24,116,
    28),(114,29,116,33),(114,41,118,45),(114,46,118,50),(114,
    58,118,60),(114,92,118,94),(114,97,118,101),(116,63,118,67),
    (126,7,130,9),(126,46,130,50),(126,58,130,60),(126,75,130,
    79),(126,80,130,84),(126,92,130,96),(126,97,130,101),(128,
    41,130,45),(128,63,130,67),(131,7,135,11),(131,41,133,45),
    (131,48,135,50),(131,58,133,62),(131,63,135,67),(131,75,135,
    77),(131,92,135,96),(131,99,135,101),(133,80,135,84),(143,
    7,145,11),(143,12,145,16),(143,24,147,26),(143,41,147,45),
    (143,48,147,50),(143,58,147,62),(143,63,147,67),(143,92,145,
    96),(143,97,147,101),(145,29,147,33),(148,7,152,11),(148,
    12,150,16),(148,41,150,45),(148,46,152,50),(148,58,150,62),
    (148,65,152,67),(148,92,152,96),(148,97,152,101),(150,24,
    152,28),(150,29,152,33);

update public.players t set pos_x = 79, pos_y = 60
  from game.walk_map w where w.y = t.pos_y and t.pos_y between
    0 and 108
  and t.pos_x between 0 and 159 and substr(w.masks, t.pos_x *
    2 + 1, 2) = '00';
update public.ground_items t set x = 79, y = 60
  from game.walk_map w where w.y = t.y and t.y between 0 and
    108
  and t.x between 0 and 159 and substr(w.masks, t.x * 2 + 1,
    2) = '00';
update public.graves t set x = 79, y = 60
  from game.walk_map w where w.y = t.y and t.y between 0 and
    108
  and t.x between 0 and 159 and substr(w.masks, t.x * 2 + 1,
    2) = '00';

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> '05b6079d5526d55edb67ec8c5c208c93' then
    raise exception '0043: walk map differs from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', x0, y0, x1, y1), ';'
    order by x0, y0, x1, y1))
    from game.shot_walls) <> '58b25a911f8e70b65c87d004e6a75723'
    then
    raise exception '0043: walls differ from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', id, x, y), ';' order
    by id)) from public.spots
    where crime_id = 'pick_drunk') <> '538f5a16ef7f65f874344ab374158d94'
    then
    raise exception '0043: drunks differ from the game';
  end if;
end $$;

select 'ok' as city;

commit;
