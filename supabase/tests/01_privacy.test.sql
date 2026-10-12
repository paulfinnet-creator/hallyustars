-- Email addresses and ID documents never reach non-admins.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Schema: no email anywhere a member can read.
select hasnt_column('public', 'users', 'email', 'public.users has no email column');
select hasnt_column('public', 'user_public', 'email', 'user_public has no email column');
select hasnt_column('public', 'user_public', 'status', 'user_public does not expose account status');

-- Anonymous visitors can read nothing.
set local role anon;
select throws_ok('select count(*) from public.users', '42501', null, 'anon cannot read users');
select throws_ok('select count(*) from public.invites', '42501', null, 'anon cannot read invites');
reset role;

-- An approved fan (Ada).
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok('select email from auth.users', '42501', null, 'fan cannot read auth.users');
select is((select count(*) from public.invites), 0::bigint, 'fan sees no invites (and so no invite emails)');
select is((select count(*) from public.verifications), 0::bigint, 'fan cannot read verification rows (file paths)');
select is((select status::text from public.my_verification()), 'approved', 'fan can read own verification result');
select throws_ok(
  $$select public.admin_get_user_email('c0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'fan cannot call admin_get_user_email');
select is(
  (select count(*) from public.user_public where id = 'c0000000-0000-4000-8000-000000000001'),
  1::bigint, 'fan can see a celebrity''s public profile');

-- A celebrity (Haneul) can't read fan emails either.
reset role;
select pg_temp.login('c0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.admin_get_user_email('f0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'celebrity cannot call admin_get_user_email');
select is((select count(*) from public.invites), 0::bigint, 'celebrity sees no invites');

-- An admin can read an email, and doing so is audited.
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select is(
  public.admin_get_user_email('f0000000-0000-4000-8000-000000000001'),
  'ada@fans.test', 'admin can read an email');
select is(
  (select count(*) from public.audit_logs
    where action = 'user.email_viewed' and target_id = 'f0000000-0000-4000-8000-000000000001'
      and admin_id = 'a0000000-0000-4000-8000-000000000001'),
  1::bigint, 'viewing an email writes an audit row');
select is(
  (select count(*) from public.verifications where user_id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')),
  2::bigint, 'admin sees the verification queue');

reset role;
select * from finish();
rollback;
