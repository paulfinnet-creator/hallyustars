-- Admin Settings: listing, adding and removing admins, authenticator resets,
-- platform settings. Only MFA-verified admins; every change audited.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A second admin, as Auth would create it.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a1400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
        'second-admin@hallyustars.test', '{"role":"admin"}', '{"display_name":"Admin Park"}', now(), now());

-- ── Only MFA-verified admins ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select * from public.admin_list_admins()$$, '42501', null, 'a fan cannot list admins');
select throws_ok($$select public.admin_update_setting('invite_expiry_days', 30)$$, '42501', null, 'a fan cannot change settings');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok($$select public.admin_set_admin_access('a1400000-0000-4000-8000-000000000002', false)$$,
  '42501', null, 'an admin without MFA cannot remove admins');
reset role;

-- ── Listing and recording a new admin ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.admin_list_admins() where id = 'a1400000-0000-4000-8000-000000000002') = 1,
  'the new admin is listed');
select is((select has_authenticator from public.admin_list_admins() where id = 'a1400000-0000-4000-8000-000000000002'),
  false, 'without an authenticator app yet');
select throws_ok($$select public.admin_record_admin_created('f0000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'a fan account is not recorded as a new admin');
select lives_ok($$select public.admin_record_admin_created('a1400000-0000-4000-8000-000000000002')$$, 'records the new admin');

-- ── Access on and off ──
select throws_ok($$select public.admin_set_admin_access('a0000000-0000-4000-8000-000000000001', false)$$,
  '22023', null, 'an admin cannot remove their own access');
select throws_ok($$select public.admin_set_admin_access('f0000000-0000-4000-8000-000000000001', false)$$,
  'P0002', null, 'only admins can be changed here');
select lives_ok($$select public.admin_set_admin_access('a1400000-0000-4000-8000-000000000002', false)$$, 'removes another admin''s access');
select is((select status::text from public.users where id = 'a1400000-0000-4000-8000-000000000002'), 'suspended',
  'the removed admin is suspended');
reset role;
select pg_temp.login('a1400000-0000-4000-8000-000000000002');
select is((select private.is_admin()), false, 'a removed admin has no admin rights, even with MFA');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.admin_set_admin_access('a1400000-0000-4000-8000-000000000002', true)$$, 'restores access');

-- ── Authenticator reset ──
select throws_ok($$select public.admin_record_mfa_reset('a0000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'an admin cannot reset their own authenticator');
reset role;
insert into auth.sessions (id, user_id, aal, created_at, updated_at)
values ('5e550000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000002', 'aal2', now(), now());
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.admin_record_mfa_reset('a1400000-0000-4000-8000-000000000002')$$, 'records a reset');
reset role;
select is((select count(*) from auth.sessions where user_id = 'a1400000-0000-4000-8000-000000000002'), 0::bigint,
  'a reset signs the admin out everywhere');
select pg_temp.login('a0000000-0000-4000-8000-000000000001');

-- ── Platform settings ──
select lives_ok($$select public.admin_update_setting('invite_expiry_days', 30)$$, 'changes a setting');
select throws_ok($$select public.admin_update_setting('invite_expiry_days', 0)$$, '22023', null, 'values outside the limits are refused');
select throws_ok($$select public.admin_update_setting('made_up', 3)$$, '22023', null, 'unknown settings are refused');
reset role;
select is((select private.setting_int('invite_expiry_days', 14)), 30, 'the new value is used');

-- ── An admin's own profile edits aren't admin actions ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
update public.users set timezone = 'Europe/Paris' where id = 'a0000000-0000-4000-8000-000000000001';
reset role;
select is((select count(*) from public.audit_logs
           where target_id = 'a0000000-0000-4000-8000-000000000001' and action = 'users.update' and created_at = now()),
  0::bigint, 'an admin''s own timezone update is not in the audit log');

-- ── Admin rights end with the session ──
insert into auth.sessions (id, user_id, aal, created_at, updated_at)
values ('5e550000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'aal2', now(), now());
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', '5e550000-0000-4000-8000-000000000001')::text, true);
select is((select private.is_admin()), true, 'an admin with a live session has admin rights');
delete from auth.sessions where id = '5e550000-0000-4000-8000-000000000001';
select is((select private.is_admin()), false, 'once the session is gone (signed out, authenticator reset), so are admin rights');

select is(
  (select array_agg(action order by id) from public.audit_logs
   where admin_id = 'a0000000-0000-4000-8000-000000000001'
     and (target_id = 'a1400000-0000-4000-8000-000000000002' or target_id = 'invite_expiry_days')),
  array['users.admin_created', 'users.update', 'users.update', 'users.mfa_reset', 'platform_settings.update'],
  'every change is in the audit log with the acting admin');

select * from finish();
rollback;
