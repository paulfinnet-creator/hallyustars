-- Chat email scheduling and decisions, one-click unsubscribe, auto-reply limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Ada (fan f…1) writes to Haneul (star user c…1) in conversation b…1.
-- Timestamps are explicit: now() is fixed for the whole transaction.
update public.conversation_members set last_read_at = now() - interval '10 minutes'
  where conversation_id = 'b0000000-0000-4000-8000-000000000001' and user_id = 'c0000000-0000-4000-8000-000000000001';
update public.notification_preferences set chat_emails_enabled = true
  where user_id = 'c0000000-0000-4000-8000-000000000001';
delete from public.chat_email_queue;
delete from public.email_log where user_id = 'c0000000-0000-4000-8000-000000000001';
insert into public.messages (conversation_id, sender_id, body, created_at) values
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'one', now() - interval '6 minutes'),
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'two', now() - interval '5 minutes');

-- ── Queueing ──
select is((select count(*) from public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 300)),
  1::bigint, 'a new message queues one check, for the other member');
select is((select user_id from public.chat_email_queue), 'c0000000-0000-4000-8000-000000000001'::uuid, 'the recipient is the star');
select is((select count(*) from public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 300)),
  0::bigint, 'a second message while one is waiting queues nothing');
select is((select count(*) from public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 300)),
  0::bigint, 'someone outside the conversation queues nothing');

-- ── Checking ──
select is(public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', gen_random_uuid()) ->> 'action',
  'none', 'a check from an older job does nothing');
select is(public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            (select job_id from public.chat_email_queue)),
  jsonb_build_object('action', 'send', 'count', 2, 'sender_id', 'f0000000-0000-4000-8000-000000000001',
                     'last_at', now() - interval '5 minutes'),
  'still unread after the delay: send, counting both messages');

-- Within the hour of the last email: wait until the hour is up.
insert into public.email_log (user_id, type, conversation_id, status, sent_at)
values ('c0000000-0000-4000-8000-000000000001', 'chat_message', 'b0000000-0000-4000-8000-000000000001', 'sent', now() - interval '20 minutes');
select is(public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            (select job_id from public.chat_email_queue)) ->> 'action',
  'wait', 'one email per conversation per hour');
select is((select due_at from public.chat_email_queue), now() + interval '40 minutes', 'retried when the hour is up');

-- An email already covered every unread message: nothing new to say.
update public.email_log set sent_at = now() - interval '2 minutes' where user_id = 'c0000000-0000-4000-8000-000000000001';
select is(public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            (select job_id from public.chat_email_queue)) ->> 'action',
  'none', 'no second email for messages already emailed about');
select is((select count(*) from public.chat_email_queue), 0::bigint, 'and the check is finished');

-- After an hour, the next email summarises everything unread.
update public.email_log set sent_at = now() - interval '2 hours' where user_id = 'c0000000-0000-4000-8000-000000000001';
select is((select count(*) from public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 300)),
  1::bigint, 'the next message queues a new check');
select is(public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            (select job_id from public.chat_email_queue)) ->> 'count',
  '2', 'later emails give the number of unread messages');

-- ── Reading the chat cancels ──
select pg_temp.login('c0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.mark_conversation_read('b0000000-0000-4000-8000-000000000001')$$, 'the star reads the chat');
reset role;
select is((select count(*) from public.chat_email_queue), 0::bigint, 'reading deletes the pending check');

-- ── Who gets nothing ──
update public.conversation_members set last_read_at = now() - interval '10 minutes'
  where conversation_id = 'b0000000-0000-4000-8000-000000000001' and user_id = 'c0000000-0000-4000-8000-000000000001';
update public.notification_preferences set chat_emails_enabled = false where user_id = 'c0000000-0000-4000-8000-000000000001';
select is((select count(*) from public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 300)),
  1::bigint, 'queued regardless of settings');
select is(public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
            (select job_id from public.chat_email_queue)) ->> 'action',
  'none', 'no email when chat emails are off');
update public.notification_preferences set chat_emails_enabled = true where user_id = 'c0000000-0000-4000-8000-000000000001';

-- A check long past its time (its QStash call was lost) is replaced.
insert into public.chat_email_queue (user_id, conversation_id, due_at)
values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', now() - interval '2 hours');
select is((select count(*) from public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 300)),
  1::bigint, 'a lost check is replaced');

-- ── Members can't touch any of this ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.chat_email_enqueue('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 0)$$,
  '42501', null, 'members cannot queue emails');
select throws_ok($$select public.chat_email_check('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', gen_random_uuid())$$,
  '42501', null, 'members cannot run checks');
select throws_ok($$select * from public.chat_email_queue$$, '42501', null, 'members cannot read the queue');
select throws_ok($$select public.claim_auto_reply(repeat('a', 64))$$, '42501', null, 'members cannot claim auto-replies');
reset role;

-- ── One-click unsubscribe ──
select set_config('test.token', (select unsubscribe_token::text from public.notification_preferences
                                   where user_id = 'f0000000-0000-4000-8000-000000000001'), true);
set local role anon;
select is(public.unsubscribe_chat_emails(current_setting('test.token')::uuid),
  true, 'the token from the email turns chat emails off, without signing in');
select is(public.unsubscribe_chat_emails(gen_random_uuid()), false, 'an unknown token changes nothing');
reset role;
select is((select chat_emails_enabled from public.notification_preferences where user_id = 'f0000000-0000-4000-8000-000000000001'),
  false, 'chat emails are off');

-- ── Auto-replies: once a day per sender ──
select is(public.claim_auto_reply(repeat('b', 64)), true, 'the first reply gets an answer');
select is(public.claim_auto_reply(repeat('b', 64)), false, 'a second reply the same day does not');
update public.auto_reply_log set replied_at = now() - interval '25 hours' where address_hash = repeat('b', 64);
select is(public.claim_auto_reply(repeat('b', 64)), true, 'the next day it does again');

select * from finish();
rollback;
