-- Sending messages and admin moderation actions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Sending ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');  -- Ada
select is(public.send_message('b0000000-0000-4000-8000-000000000001', 'Have a great show!') -> 'message' ->> 'body',
  'Have a great show!', 'ordinary messages go through');
select is(public.send_message('b0000000-0000-4000-8000-000000000001', 'text me 010-1234-5678') -> 'message' ->> 'body',
  'text me 010-1234-5678', 'messages are not filtered for contact details');
select throws_ok($$insert into public.messages (conversation_id, body) values ('b0000000-0000-4000-8000-000000000001', 'direct')$$,
  '42501', null, 'members cannot insert messages directly');
reset role;

-- ── Admins: a report opens the conversation for review ──
select pg_temp.login('c0000000-0000-4000-8000-000000000001');  -- Haneul reports
insert into public.reports (conversation_id, reason) values ('b0000000-0000-4000-8000-000000000001', 'Asked for my number');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.messages where conversation_id = 'b0000000-0000-4000-8000-000000000001') > 0,
  'admins can read a reported conversation');
select lives_ok($$select public.admin_log_conversation_view('b0000000-0000-4000-8000-000000000001')$$,
  'opening it is logged');
reset role;
select is((select count(*) from public.audit_logs
           where action = 'conversations.viewed' and target_id = 'b0000000-0000-4000-8000-000000000001'
             and admin_id = 'a0000000-0000-4000-8000-000000000001'), 1::bigint, 'with the admin''s id');

-- A conversation with nothing to review stays private.
insert into public.chat_invitations (id, fan_id, celebrity_id, message, status, decided_by_admin, decided_at)
values ('e1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000002', 'Hi', 'approved', 'a0000000-0000-4000-8000-000000000001', now());
insert into public.conversations (id, chat_invitation_id) values
  ('b1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001');
insert into public.conversation_members (conversation_id, user_id) values
  ('b1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_log_conversation_view('b1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'admins cannot open a conversation that is not under review');
reset role;

-- ── Reports ──
select pg_temp.login('c0000000-0000-4000-8000-000000000001');
select throws_ok($$insert into public.reports (conversation_id, reason) values ('b0000000-0000-4000-8000-000000000001', 'Again')$$,
  '23505', null, 'one open report per person and conversation');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_handle_report((select id from public.reports limit 1), 'resolved')$$,
  '42501', null, 'members cannot handle reports');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.admin_handle_report(
    (select id from public.reports where reason = 'Asked for my number'), 'resolved', 'Reminded the fan of the rules')$$,
  'an admin resolves a report');
select throws_ok($$select public.admin_handle_report(
    (select id from public.reports where reason = 'Asked for my number'), 'dismissed')$$,
  '22023', null, 'a handled report cannot be handled again');

-- ── Removing a message ──
select lives_ok($$select public.admin_remove_message(
    (select id from public.messages where body = 'Have a great show!'), 'Test removal')$$,
  'an admin removes a message');
reset role;
select ok((select deleted_at is not null and flagged from public.messages where body = 'Have a great show!'),
  'the message is marked removed');
select is((select count(*) from public.audit_logs
           where action = 'messages.update' and metadata::text like '%Have a great show%'), 0::bigint,
  'the audit log never contains the message text');

-- ── Suspending and closing ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.admin_set_user_suspended('f0000000-0000-4000-8000-000000000001', true)$$,
  'an admin suspends a fan');
select throws_ok($$select public.admin_set_user_suspended('a0000000-0000-4000-8000-000000000001', true)$$,
  '22023', null, 'admins cannot be suspended this way');
reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.send_message('b0000000-0000-4000-8000-000000000001', 'hello?')$$,
  '42501', null, 'a suspended fan cannot send');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.admin_set_user_suspended('f0000000-0000-4000-8000-000000000001', false)$$,
  'and restores them');
select lives_ok($$select public.admin_close_conversation('b0000000-0000-4000-8000-000000000001')$$,
  'an admin closes a conversation');
reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.send_message('b0000000-0000-4000-8000-000000000001', 'hello?')$$,
  '42501', null, 'nobody can send in a closed conversation');
reset role;
select is((select count(*) from public.audit_logs
           where target_id in ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001')
             and action in ('conversations.closed', 'users.update')
             and admin_id = 'a0000000-0000-4000-8000-000000000001'), 3::bigint,
  'suspending, restoring and closing are audited');

select * from finish();
rollback;
