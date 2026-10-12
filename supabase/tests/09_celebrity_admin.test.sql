-- Celebrity profile management: who can edit, audited changes, linking accounts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- A new celebrity account (as Auth would create it) and an unlinked profile.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'sora@hallyustars.test', '{"role":"celebrity"}', '{"display_name":"Sora"}', now(), now());
insert into public.celebrity_profiles (id, stage_name, category)
values ('70000000-0000-4000-8000-000000000001', 'Sora', 'kpop');

-- ── Members can read but not change profiles ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.celebrity_profiles) >= 3, 'an approved fan can browse profiles');
update public.celebrity_profiles set stage_name = 'hacked' where id = '70000000-0000-4000-8000-000000000001';
select throws_ok($$insert into public.celebrity_profile_translations (profile_id, locale, bio)
                  values ('70000000-0000-4000-8000-000000000001', 'en', 'x')$$,
  '42501', null, 'a fan cannot write bios');
select throws_ok($$select public.admin_link_new_celebrity_account('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a fan cannot link accounts');
reset role;
select is((select stage_name from public.celebrity_profiles where id = '70000000-0000-4000-8000-000000000001'), 'Sora',
  'a fan''s update changes nothing');

-- ── Admin edits are audited ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
update public.celebrity_profiles
  set bio_source_locale = 'ko', bio_updated_at = now(), group_name = 'Demo Group'
  where id = '70000000-0000-4000-8000-000000000001';
insert into public.celebrity_profile_translations (profile_id, locale, bio, is_machine_translated)
values ('70000000-0000-4000-8000-000000000001', 'ko', '데모 소개', false);
select throws_ok($$update public.celebrity_profiles set bio_source_locale = 'fr' where id = '70000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the original bio must be Korean or English');
reset role;
select is((select count(*) from public.audit_logs
           where target_id = '70000000-0000-4000-8000-000000000001'
             and action in ('celebrity_profiles.update', 'celebrity_profile_translations.insert')),
  2::bigint, 'profile and bio changes are audited');

-- ── Linking a new login account ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok($$select public.admin_link_new_celebrity_account('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'an admin without MFA cannot link accounts');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_link_new_celebrity_account('70000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'a fan account cannot be linked to a celebrity profile');
select lives_ok($$select public.admin_link_new_celebrity_account('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001')$$,
  'admin links the new account');
select is((select user_id from public.celebrity_profiles where id = '70000000-0000-4000-8000-000000000001'),
  '60000000-0000-4000-8000-000000000001'::uuid, 'the profile is linked');
select throws_ok($$select public.admin_link_new_celebrity_account('d0000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'one account cannot be linked to two profiles');
reset role;
select is((select count(*) from public.audit_logs
           where action = 'users.celebrity_account_created' and target_id = '60000000-0000-4000-8000-000000000001'),
  1::bigint, 'creating the account is audited');
select is((select count(*) from public.audit_logs
           where action = 'celebrity_profiles.update' and target_id = '70000000-0000-4000-8000-000000000001'
             and metadata -> 'changed' ? 'user_id'),
  1::bigint, 'linking it is audited');

select * from finish();
rollback;
