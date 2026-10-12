-- Sending, withdrawing, expiring and deciding chat invitations.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A star with a login who accepts invitations, and one who doesn't.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '61000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'bora@hallyustars.test', '{"role":"celebrity"}', '{"display_name":"Bora"}', now(), now());
insert into public.celebrity_profiles (id, user_id, stage_name, category, accepts_invites) values
  ('71000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'Bora', 'singer', true),
  ('71000000-0000-4000-8000-000000000002', null, 'Closed Star', 'actor', true);

-- ── Sending ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');  -- Ada, approved
select isnt((select public.send_chat_invitation('71000000-0000-4000-8000-000000000001', '  Hello Bora!  ')), null,
  'an approved fan sends an invitation');
select is((select message from public.chat_invitations
           where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending'),
  'Hello Bora!', 'the message is trimmed');
select throws_ok($$select public.send_chat_invitation('71000000-0000-4000-8000-000000000001', 'Again')$$,
  '23505', null, 'only one invitation can wait for review per star');
select throws_ok($$select public.send_chat_invitation('71000000-0000-4000-8000-000000000002', 'Hi')$$,
  '42501', null, 'a star without a login cannot be invited');
select throws_ok($$select public.send_chat_invitation('d0000000-0000-4000-8000-000000000001', 'Hi again')$$,
  'P0001', 'already_connected', 'no second invitation while a chat is open');
select throws_ok($$select public.send_chat_invitation('71000000-0000-4000-8000-000000000001', '   ')$$,
  '23514', null, 'an empty message is refused');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000002');  -- Léa, pending review
select throws_ok($$select public.send_chat_invitation('71000000-0000-4000-8000-000000000001', 'Hi')$$,
  '42501', null, 'a fan in review cannot invite');
reset role;

-- ── Expiry ──
update public.chat_invitations set expires_at = now() - interval '1 minute'
  where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending';

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_decide_chat_invitation(
    (select id from public.chat_invitations where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending'),
    true)$$,
  '22023', 'chat invitation is expired', 'an expired invitation cannot be approved');
reset role;

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.send_chat_invitation('71000000-0000-4000-8000-000000000001', 'Trying again')$$,
  'after expiry the fan can invite again');
reset role;
select is((select array_agg(status::text order by created_at) from public.chat_invitations
           where celebrity_id = '71000000-0000-4000-8000-000000000001'),
  array['expired', 'pending'], 'the stale invitation is marked expired');

-- ── Withdrawing ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
update public.chat_invitations set status = 'withdrawn'
  where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending';
reset role;
select is((select count(*) from public.chat_invitations
           where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'withdrawn'),
  1::bigint, 'a fan withdraws their pending invitation');

-- ── Deciding ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select public.send_chat_invitation('71000000-0000-4000-8000-000000000001', 'Third time');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok($$select public.admin_decide_chat_invitation(
    (select id from public.chat_invitations where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending'),
    false, 'No')$$,
  '42501', null, 'an admin without MFA cannot decide');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_decide_chat_invitation(
    (select id from public.chat_invitations where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending'),
    false, repeat('x', 501))$$,
  '23514', null, 'rejection reasons are limited to 500 characters');
select public.admin_decide_chat_invitation(
  (select id from public.chat_invitations where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'pending'),
  false, 'Bora is on tour this month.');
reset role;
select is((select reason from public.chat_invitations
           where celebrity_id = '71000000-0000-4000-8000-000000000001' and status = 'rejected'),
  'Bora is on tour this month.', 'the rejection reason is saved for the fan');

select * from finish();
rollback;
