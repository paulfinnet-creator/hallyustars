-- Admin analytics: admins only; counts and medians, never personal data.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_analytics()$$, '42501', null, 'fans cannot see analytics');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok($$select public.admin_analytics()$$, '42501', null, 'admins need MFA');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
create temp table before as select public.admin_analytics() as a;
reset role;
insert into public.invites (fan_name, email, created_by_admin)
values ('Counted', 'counted@fans.test', 'a0000000-0000-4000-8000-000000000001');

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select is(((select public.admin_analytics()) -> 'invites' ->> 'created')::int,
  ((select a from before) -> 'invites' ->> 'created')::int + 1, 'a new invite is counted');
select ok((select public.admin_analytics()) ?& array['invites', 'fans', 'celebrities', 'chatInvitations', 'chats', 'responseSeconds', 'fanTimezones'],
  'every section is there');
select ok(jsonb_typeof((select public.admin_analytics()) -> 'fanTimezones') = 'array', 'fan timezones are a list');
select ok(not ((select public.admin_analytics())::text ~ '@'), 'no email addresses anywhere');
select ok(((select public.admin_analytics()) -> 'responseSeconds' ->> 'chatInvitation')::numeric >= 0, 'times are never negative');
reset role;

select * from finish();
rollback;
