-- Chat: members only, admin approval, blocks, moderation access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Reading. Counts are compared with what the table holds (seed plus any
-- local testing), so the checks don't depend on how many messages exist.
select set_config('test.seed_conversation_messages',
  (select count(*) from public.messages where conversation_id = 'b0000000-0000-4000-8000-000000000001')::text, true);
select pg_temp.login('f0000000-0000-4000-8000-000000000001');  -- Ada (member)
select is((select count(*) from public.messages),
  current_setting('test.seed_conversation_messages')::bigint, 'member reads her conversation');
reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000002');  -- Léa
select is((select count(*) from public.messages), 0::bigint, 'other fan reads nothing');
reset role;
select pg_temp.login('c0000000-0000-4000-8000-000000000002');  -- Minjun (not a member)
select is((select count(*) from public.messages), 0::bigint, 'other celebrity reads nothing');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001');  -- admin
select is((select count(*) from public.messages where conversation_id = 'b0000000-0000-4000-8000-000000000001'),
  0::bigint, 'admin cannot read an unflagged conversation');
reset role;

-- Sending
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.send_message('b0000000-0000-4000-8000-000000000001', 'See you soon!')$$,
  'member can send');
select throws_ok(
  $$insert into public.messages (conversation_id, body, flagged)
    values ('b0000000-0000-4000-8000-000000000001', 'x', false)$$,
  '42501', null, 'members cannot set moderation fields');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'spoof')$$,
  '42501', null, 'cannot send as someone else');
reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.send_message('b0000000-0000-4000-8000-000000000001', 'let me in')$$,
  '42501', null, 'non-member cannot send');
reset role;

-- Blocking stops messages both ways
select pg_temp.login('c0000000-0000-4000-8000-000000000001');
insert into public.blocks (blocked_id) values ('f0000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.send_message('b0000000-0000-4000-8000-000000000001', 'hello?')$$,
  '42501', null, 'blocked fan cannot send');
select is((select count(*) from public.blocks), 0::bigint, 'fan cannot see who blocked them');
reset role;

-- Reporting opens the conversation to admins
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.reports (conversation_id, reason)
    values ('b0000000-0000-4000-8000-000000000001', 'test report')$$,
  'member can report their conversation');
reset role;
select set_config('test.seed_conversation_messages',
  (select count(*) from public.messages where conversation_id = 'b0000000-0000-4000-8000-000000000001')::text, true);
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.messages where conversation_id = 'b0000000-0000-4000-8000-000000000001'),
  current_setting('test.seed_conversation_messages')::bigint, 'admin can read a reported conversation');
reset role;

-- Chat invitations: only admins decide
select pg_temp.login('f0000000-0000-4000-8000-000000000002');  -- Léa, not approved
select throws_ok(
  $$insert into public.chat_invitations (celebrity_id, message)
    values ('d0000000-0000-4000-8000-000000000001', 'hi')$$,
  '42501', null, 'unapproved fan cannot send an invitation');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000001');  -- Ada
select throws_ok(
  $$update public.chat_invitations set status = 'approved'
    where fan_id = 'f0000000-0000-4000-8000-000000000001' and status = 'pending'$$,
  '42501', null, 'fan cannot approve her own invitation');
select throws_ok(
  $$select public.admin_decide_chat_invitation(
      (select id from public.chat_invitations where status = 'pending' limit 1), true)$$,
  '42501', null, 'fan cannot call the admin decision RPC');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select isnt(
  public.admin_decide_chat_invitation(
    (select id from public.chat_invitations where status = 'pending'
       and celebrity_id = 'd0000000-0000-4000-8000-000000000002'), true, null),
  null, 'admin approval returns a new conversation');
reset role;
select is(
  (select count(*) from public.conversation_members cm
     join public.conversations c on c.id = cm.conversation_id
     join public.chat_invitations ci on ci.id = c.chat_invitation_id
    where ci.celebrity_id = 'd0000000-0000-4000-8000-000000000002'),
  2::bigint, 'approval adds the fan and the celebrity as members');
select is(
  (select count(*) from public.audit_logs
    where action = 'chat_invitations.update' and admin_id = 'a0000000-0000-4000-8000-000000000001'
      and metadata -> 'values' ->> 'status' = 'approved'),
  1::bigint, 'the approval is in the audit log');
select is(
  (select metadata -> 'values' ->> 'message' from public.audit_logs
    where action = 'chat_invitations.update' limit 1),
  null, 'the fan''s message text is not copied into the audit log');

select * from finish();
rollback;
