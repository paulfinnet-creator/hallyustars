-- Registration functions: code states, email lockout, linking, submit, rate limits.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixtures: one invite per state, with known codes.
insert into public.invites (id, fan_name, email, code, created_by_admin, status, expires_at) values
  ('20000000-0000-4000-8000-000000000001', 'Open',    'open@fans.test',    'SKCE22222222', 'a0000000-0000-4000-8000-000000000001', 'created', now() + interval '1 day'),
  ('20000000-0000-4000-8000-000000000002', 'Old',     'old@fans.test',     'SKCE33333333', 'a0000000-0000-4000-8000-000000000001', 'created', now() - interval '1 minute'),
  ('20000000-0000-4000-8000-000000000003', 'Gone',    'gone@fans.test',    'SKCE44444444', 'a0000000-0000-4000-8000-000000000001', 'revoked', now() + interval '1 day'),
  ('20000000-0000-4000-8000-000000000004', 'Done',    'done@fans.test',    'SKCE55555555', 'a0000000-0000-4000-8000-000000000001', 'approved', now() + interval '1 day');

-- ── Only our server (service role) may call these ──
set local role anon;
select throws_ok($$select public.registration_check_code('SKCE22222222')$$, '42501', null, 'anon cannot check codes directly');
reset role;
set local role authenticated;
select throws_ok($$select public.registration_submit('f0000000-0000-4000-8000-000000000001')$$, '42501', null, 'members cannot submit directly');
select throws_ok($$select public.hit_rate_limit('x', 1, 60)$$, '42501', null, 'members cannot touch rate limits');
reset role;

set local role service_role;

-- ── Code states ──
select is(public.registration_check_code('skce-2222-2222'), 'ok', 'a fresh code is ok (any case, with dashes)');
select is(public.registration_check_code('2222 2222'), 'ok', 'the SKCE prefix is optional');
select is(public.registration_check_code('SKCE-9999-9999'), 'unknown', 'an unknown code');
select is(public.registration_check_code('not a code'), 'unknown', 'garbage is unknown');
select is(public.registration_check_code('SKCE33333333'), 'expired', 'past its expiry');
select is(public.registration_check_code('SKCE44444444'), 'revoked', 'revoked');
select is(public.registration_check_code('SKCE55555555'), 'used', 'already turned into an account');

-- ── Email check and lockout ──
select is((select result from public.registration_check_email('SKCE22222222', ' OPEN@fans.test ')), 'match',
  'the invite email matches case-insensitively, ignoring spaces');
select is((select fan_name from public.registration_check_email('SKCE22222222', 'open@fans.test')), 'Open',
  'a match returns the fan name');
select is((select result from public.registration_check_email('SKCE33333333', 'old@fans.test')), 'expired',
  'an expired invite is refused even with the right email');

select is((select result from public.registration_check_email('SKCE22222222', 'wrong@fans.test')), 'mismatch', 'wrong email 1');
select is((select failed_email_attempts from public.invites where code = 'SKCE22222222'), 1, 'wrong emails are counted');
select is((select result from public.registration_check_email('SKCE22222222', 'open@fans.test')), 'match',
  'the right email still works before the limit');
select is((select failed_email_attempts from public.invites where code = 'SKCE22222222'), 0,
  'a match resets the count');

select public.registration_check_email('SKCE22222222', 'wrong@fans.test') from generate_series(1, 4);
select is((select result from public.registration_check_email('SKCE22222222', 'wrong@fans.test')), 'locked',
  'the fifth wrong email locks the invite');
select ok((select locked_until between now() + interval '59 minutes' and now() + interval '61 minutes'
           from public.invites where code = 'SKCE22222222'), 'for an hour');
select is((select result from public.registration_check_email('SKCE22222222', 'open@fans.test')), 'locked',
  'even the right email is refused while locked');
select is(public.registration_check_code('SKCE22222222'), 'locked', 'the code check reports the lock too');

-- ── Linking the account and submitting ──
update public.invites set locked_until = null where code = 'SKCE22222222';
reset role;
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'open@fans.test', '{"role":"fan"}', '{"display_name":"Open"}', now(), now());
set local role service_role;

select ok(public.registration_link_user('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  'the new account is linked to its invite');
select is((select status::text from public.invites where code = 'SKCE22222222'), 'registering', 'invite is now registering');
select ok(not public.registration_link_user('20000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001'),
  'a linked invite cannot be taken over by another account');

insert into public.registration_drafts (user_id, profile_photo_path) values ('30000000-0000-4000-8000-000000000001', 'p.jpg');
select throws_ok($$select public.registration_submit('30000000-0000-4000-8000-000000000001')$$, '22023', null,
  'submitting without an ID is refused');

update public.registration_drafts set id_document_path = 'id.jpg', id_document_type = 'passport'
  where user_id = '30000000-0000-4000-8000-000000000001';
select public.registration_submit('30000000-0000-4000-8000-000000000001');
select is(
  (select row(u.status, i.status, v.status, v.id_document_type)::text
     from public.users u
     join public.invites i on i.user_id = u.id
     join public.verifications v on v.user_id = u.id
    where u.id = '30000000-0000-4000-8000-000000000001'),
  row('pending_review', 'pending_review', 'pending', 'passport')::text,
  'submit puts account, invite and a new verification into review');

-- ── Rate limit ──
select is(
  (select array_agg(public.hit_rate_limit('test:key', 3, 600)) from generate_series(1, 4)),
  array[true, true, true, false], 'the fourth hit in a window of three is refused');
-- Sliding window: attempts older than the window stop counting.
reset role;  -- the table itself is only reachable through hit_rate_limit()
update private.rate_limit_hits set hit_at = now() - interval '11 minutes' where key = 'test:key';
set local role service_role;
select ok(public.hit_rate_limit('test:key', 3, 600), 'attempts older than the window no longer count');

select * from finish();
rollback;
