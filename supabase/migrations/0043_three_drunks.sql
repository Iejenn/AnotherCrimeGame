begin;

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
update game.walk_map set masks = 
  'd6ffffffffff6b10daf8f8fe6b00005208d6ffffffffff6b0000000000d0f8fa780ad6ffffffffff'
  || '6b004200104800000000000000000000000000000000000000000000d6ffffffffff6b00d0fa6800'
  || 'd0f86a0000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6'
  || 'ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'
    where y = 42;
update game.walk_map set masks = 
  'd6ffffffffff6b00d66b00d6fffffffb68d6ffffffffff6b0000000000d6fffffb68d6ffffffffff'
  || '6b004200104a00000000d6fb6800d6fffffffffbf8fefffbf8680000d6ffffffffff6b0016df6b00'
  || '00d67f0b00d6ffff7f1fdf6b00000000000000400000d6ffffffffff6b00000000000000420000d6'
  || 'ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'
    where y = 44;
update game.walk_map set masks = 
  'd6ffffffffff6bd6ffffff7f1f1fdfff7bdeffffffffff6b0000000000d6ffffff7bdeffffffffff'
  || '6b004200d06a00d6ffffff7f1fdfff6b00000000d66b0000d66b0000d6ffffffffff6b00d0fe6b00'
  || '00d66b0000d6ffff6b00d66b0000000000d06800d068d6ffffffffff6b00000000000000000000d6'
  || 'ffffffffff6b00000000000000400000d6ffffffffff6b00000000000000000000d6ffffffffff6b'
    where y = 46;
update game.walk_map set masks = 
  'd6ffffffffff6bd6ffffff6b0000d6ff6bd6ffffffffff6b0000000000d6ffff7f0bd6ffffffffff'
  || '6b105a181e0bd0fe7f1fdf6b00d6fffbf8f8f8f8fefbf8f87e0b0000d6ffffffffff6b00d6ff6b00'
  || '00d6fb6800d6ffff6b00d66b000000000016dbf87e0bd6ffffffffff6b00000000000000000000d6'
  || 'ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b'
    where y = 47;

do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map)
    <> 'e7b3c2fff3d35b757b1468c45d4bfbf3' then
    raise exception '0043: walk map differs from the game';
  end if;
  if (select md5(string_agg(concat_ws(',', id, x, y), ';' order
    by id)) from public.spots
    where crime_id = 'pick_drunk') <> '538f5a16ef7f65f874344ab374158d94'
    then
    raise exception '0043: drunks differ from the game';
  end if;
end $$;

select 'ok' as drunks;

commit;
