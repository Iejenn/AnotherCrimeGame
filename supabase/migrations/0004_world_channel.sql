-- Underworld: the shared "world" Realtime channel (docs/design.md §11, src/net/world.ts).
-- The channel is private: only signed-in players may join it, read who's there, and share where they walk.
-- (Realtime Authorization checks these policies on realtime.messages.)
create policy world_select_authenticated on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) = 'world');

create policy world_insert_authenticated on realtime.messages
  for insert to authenticated
  with check ((select realtime.topic()) = 'world');
