-- Underworld: one global chat for everyone (docs/design.md §11).
-- Messages go in only through public.send_chat(), which stamps your name from the database (so nobody can
-- chat as someone else), cleans the text, and limits how fast you can post. Everyone signed in can read
-- them; new ones arrive live through Realtime. Messages older than 7 days are cleared out.

create table public.chat_messages (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  name text not null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index chat_messages_created_at on public.chat_messages (created_at desc);
create index chat_messages_player_created on public.chat_messages (player_id, created_at desc);
alter table public.chat_messages enable row level security;
create policy chat_messages_select_authenticated on public.chat_messages for select to authenticated using (true);
alter publication supabase_realtime add table public.chat_messages;

-- Say something in the global chat. At most 1 message per second and 5 per 10 seconds.
create or replace function public.send_chat(p_body text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]', ' ', 'g'));
begin
  select name into v_name from public.players where id = v_uid;
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  if v_body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > 200 then return jsonb_build_object('ok', false, 'reason', 'too_long'); end if;
  if exists (select 1 from public.chat_messages where player_id = v_uid and created_at > now() - interval '1 second')
     or (select count(*) from public.chat_messages where player_id = v_uid and created_at > now() - interval '10 seconds') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'chat_too_fast');
  end if;
  insert into public.chat_messages (player_id, name, body) values (v_uid, v_name, v_body);
  delete from public.chat_messages where created_at < now() - interval '7 days';
  update public.players set last_seen = now() where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.send_chat(text) from public, anon;
grant execute on function public.send_chat(text) to authenticated;
