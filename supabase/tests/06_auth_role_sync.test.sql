-- Roles set through Auth's createUser() (app_metadata written after insert).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Mimic createUser(): insert without a role, then set app_metadata.
create function pg_temp.create_like_auth_api(p_id uuid, p_role text) returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
          p_id || '@roles.test', '{"provider":"email"}', '{"display_name":"Role Test"}', now(), now());
  update auth.users
    set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role)
    where id = p_id;
end $$;

select pg_temp.create_like_auth_api('10000000-0000-4000-8000-000000000001', 'admin');
select is(
  (select row(role, status)::text from public.users where id = '10000000-0000-4000-8000-000000000001'),
  row('admin', 'approved')::text, 'an admin created through the Auth API is an approved admin');

select pg_temp.create_like_auth_api('10000000-0000-4000-8000-000000000002', 'celebrity');
select is(
  (select role::text from public.users where id = '10000000-0000-4000-8000-000000000002'),
  'celebrity', 'a celebrity created through the Auth API is a celebrity');

select pg_temp.create_like_auth_api('10000000-0000-4000-8000-000000000003', 'fan');
select is(
  (select row(role, status)::text from public.users where id = '10000000-0000-4000-8000-000000000003'),
  row('fan', 'registering')::text, 'a fan stays mid-registration');

-- Only the first assignment counts: changing app_metadata later does nothing.
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
  where id = '10000000-0000-4000-8000-000000000003';
select is(
  (select role::text from public.users where id = '10000000-0000-4000-8000-000000000003'),
  'fan', 'a later app_metadata change does not promote a fan');

select pg_temp.create_like_auth_api('10000000-0000-4000-8000-000000000004', 'superuser');
select is(
  (select role::text from public.users where id = '10000000-0000-4000-8000-000000000004'),
  'fan', 'an unknown role name leaves the fan default');

select * from finish();
rollback;
