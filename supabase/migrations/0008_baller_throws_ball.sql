-- Underworld: getting caught at the gym bags (docs/design.md §4): a baller yells "Stop that!" and throws the
-- basketball at you. The damage and stun stay the same (-1 HP, 2s); only the message in your log changes.
-- To leave everything else in public.finish_attempt() exactly as it is, this takes the live definition and
-- replaces that one sentence (it appears once).
do $$
declare
  d text := pg_get_functiondef('public.finish_attempt()'::regprocedure);
  old_line constant text := 'One of the players saw you and shoved you into the fence.';
  new_line constant text := 'A baller saw you. "Stop that!" He hurls the basketball at your head.';
begin
  if position(old_line in d) = 0 then
    raise exception 'finish_attempt() no longer has the old gym-bag line; nothing changed';
  end if;
  execute replace(d, old_line, new_line);
end $$;
