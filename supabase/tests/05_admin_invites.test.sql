-- Admin rights need MFA (aal2); invite create, revoke and regenerate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── Without MFA an admin has no admin rights ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001', 'aal1');
select is((select count(*) from public.invites), 0::bigint, 'admin without MFA sees no invites');
select throws_ok(
  $$select * from public.admin_create_invite('Noor', 'noor@fans.test')$$,
  '42501', null, 'admin without MFA cannot create an invite');
select throws_ok(
  $$select public.admin_get_user_email('f0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'admin without MFA cannot read emails');
reset role;

-- ── Members can't use the invite actions ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.admin_create_invite('Noor', 'noor@fans.test')$$,
  '42501', null, 'fan cannot create an invite');
select throws_ok(
  $$select public.admin_revoke_invite((select id from public.invites limit 1))$$,
  '42501', null, 'fan cannot revoke an invite');
reset role;

-- ── Create ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
create temp table created on commit drop as
  select * from public.admin_create_invite('  Noor  ', ' Noor@Fans.test ');
grant select on created to authenticated;

select matches((select code from created), '^SKCE[2-9A-HJKMNP-Z]{8}$', 'new code has the right format');
select is(
  (select row(fan_name, email::text, status::text, created_by_admin)::text from public.invites where id = (select id from created)),
  row('Noor', 'noor@fans.test', 'created', 'a0000000-0000-4000-8000-000000000001'::uuid)::text,
  'name and email are trimmed, email lower-cased, creator recorded');
select ok(
  (select expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour' from created),
  'expires in 14 days by default');
select throws_ok(
  $$select * from public.admin_create_invite('Noor again', 'NOOR@fans.test')$$,
  '23505', null, 'a second open invite for the same email is refused');

-- ── Regenerate ──
create temp table regenerated on commit drop as
  select * from public.admin_regenerate_invite_code((select id from created));
grant select on regenerated to authenticated;
select isnt((select code from regenerated), (select code from created), 'regenerate gives a new code');
select is(
  (select code from public.invites where id = (select id from created)),
  (select code from regenerated), 'the old code no longer matches the invite');

update public.invites set failed_email_attempts = 5, locked_until = now() + interval '1 hour'
  where id = (select id from created);
select lives_ok(
  $$select * from public.admin_regenerate_invite_code((select id from created))$$, 'regenerate again');
select is(
  (select row(failed_email_attempts, locked_until)::text from public.invites where id = (select id from created)),
  row(0, null::timestamptz)::text, 'regenerate clears the email lockout');

-- ── Revoke ──
select lives_ok($$select public.admin_revoke_invite((select id from created))$$, 'admin can revoke');
select is(
  (select status::text from public.invites where id = (select id from created)), 'revoked', 'status is revoked');
select throws_ok(
  $$select public.admin_revoke_invite((select id from created))$$,
  '22023', null, 'a revoked invite cannot be revoked again');
select throws_ok(
  $$select * from public.admin_regenerate_invite_code((select id from created))$$,
  '22023', null, 'a revoked invite cannot get a new code');
select throws_ok(
  $$select public.admin_revoke_invite((select id from public.invites where status = 'approved' limit 1))$$,
  '22023', null, 'an invite that produced an approved account cannot be revoked');
select lives_ok(
  $$select * from public.admin_create_invite('Noor', 'noor@fans.test')$$,
  'after revoking, the same email can be invited again');
reset role;

-- ── Every action is in the audit log, without codes or emails ──
select is(
  (select count(*) from public.audit_logs
    where target_id = (select id::text from created) and admin_id = 'a0000000-0000-4000-8000-000000000001'),
  5::bigint, 'create, the lockout edit, two regenerations and revoke are each audited');

select * from finish();
rollback;
