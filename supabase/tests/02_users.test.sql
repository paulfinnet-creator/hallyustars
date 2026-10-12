-- Members can't change their own role or status, and only see who they should.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

select pg_temp.login('f0000000-0000-4000-8000-000000000001');  -- Ada, approved fan

select throws_ok(
  $$update public.users set role = 'admin' where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'fan cannot make themselves admin');
select throws_ok(
  $$update public.users set status = 'approved' where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'fan cannot change their own status');
select throws_ok(
  $$update public.users set avatar_url = 'x' where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'fan cannot bypass photo review by setting avatar_url');

select lives_ok(
  $$update public.users set display_name = 'Ada O.', timezone = 'Europe/London', locale = 'pt'
    where id = 'f0000000-0000-4000-8000-000000000001'$$,
  'fan can update name, timezone and language');
select is(
  (select display_name from public.users where id = 'f0000000-0000-4000-8000-000000000001'),
  'Ada O.', 'name was updated');

select throws_ok(
  $$update public.users set timezone = '+09:00' where id = 'f0000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'fixed UTC offsets are rejected; IANA names only');

update public.users set display_name = 'hacked' where id = 'c0000000-0000-4000-8000-000000000001';
reset role;
select isnt(
  (select display_name from public.users where id = 'c0000000-0000-4000-8000-000000000001'),
  'hacked', 'fan cannot rename another user');

-- Visibility
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.users where role = 'celebrity'
    and id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')), 2::bigint,
  'approved fan sees celebrities');
select is((select count(*) from public.users where id = 'f0000000-0000-4000-8000-000000000002'), 0::bigint,
  'fan cannot see other fans');
select is((select count(*) from public.users where role = 'admin'), 0::bigint,
  'fan cannot see admin accounts');

reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000002');  -- Léa, pending review
select is((select count(*) from public.users), 1::bigint, 'pending fan sees only themselves');
select is((select count(*) from public.celebrity_profiles), 0::bigint, 'pending fan cannot browse celebrities');

reset role;
select pg_temp.login('c0000000-0000-4000-8000-000000000001');  -- Haneul
select is((select count(*) from public.users where id = 'f0000000-0000-4000-8000-000000000001'), 1::bigint,
  'celebrity sees the fan they chat with');

reset role;
select * from finish();
rollback;
