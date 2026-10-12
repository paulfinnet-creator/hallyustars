-- Core chat: conversation list, read receipts and image messages.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Seed: Ada (fan f…1) and Haneul (celebrity c…1) share conversation b…1.

-- ── Conversation list ──
select pg_temp.login('c0000000-0000-4000-8000-000000000001');
select public.send_message('b0000000-0000-4000-8000-000000000001', 'New from Haneul');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.my_conversations()), 1::bigint, 'Ada sees her one conversation');
select is((select other_name from public.my_conversations()), 'Haneul (Demo)', 'with Haneul''s public name');
select is((select other_verified from public.my_conversations()), true, 'celebrities are marked verified');
select is((select last_body from public.my_conversations()), 'New from Haneul', 'the latest message is shown');
select is((select unread from public.my_conversations()), 1::bigint, 'and counted as unread');

-- ── Read receipts ──
select public.mark_conversation_read('b0000000-0000-4000-8000-000000000001');
select is((select unread from public.my_conversations()), 0::bigint, 'reading clears the unread count');
select throws_ok($$update public.conversation_members set last_read_at = now() + interval '1 day'
                  where user_id = 'f0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'members cannot set their own read time');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000002');  -- Léa, not a member
select is((select count(*) from public.my_conversations()), 0::bigint, 'others see no conversations');
reset role;

-- ── Image messages ──
insert into storage.objects (bucket_id, name) values
  ('chat-images', 'b0000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg'),
  ('chat-images', 'b0000000-0000-4000-8000-000000000001/raw-22222222-2222-4222-8222-222222222222.heic');

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$insert into public.messages (conversation_id, attachments)
                  values ('b0000000-0000-4000-8000-000000000001', '[{"type":"image","path":"x.jpg"}]')$$,
  '42501', null, 'members cannot write attachments directly');
select lives_ok($$select public.post_chat_image('b0000000-0000-4000-8000-000000000001',
                  'b0000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg', 800, 600)$$,
  'a cleaned image can be posted');
select throws_ok($$select public.post_chat_image('b0000000-0000-4000-8000-000000000001',
                  'b0000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg', 800, 600)$$,
  '22023', null, 'the same image cannot be posted twice');
select throws_ok($$select public.post_chat_image('b0000000-0000-4000-8000-000000000001',
                  'b0000000-0000-4000-8000-000000000001/raw-22222222-2222-4222-8222-222222222222.heic', 800, 600)$$,
  '22023', null, 'a raw upload cannot be attached');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok($$select public.post_chat_image('b0000000-0000-4000-8000-000000000001',
                  'b0000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg', 800, 600)$$,
  '42501', null, 'non-members cannot post images');
reset role;

select ok(not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and tablename = 'reactions'),
  'reactions are not in the realtime feed');

select * from finish();
rollback;
