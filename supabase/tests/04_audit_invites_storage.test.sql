-- Audit log integrity, invite codes, storage access, realtime topics.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Invite code normalization (CLAUDE.md › Invite code rules)
select is(public.normalize_invite_code('skce-7k4m-q2px'), 'SKCE7K4MQ2PX', 'lower case with dashes');
select is(public.normalize_invite_code(' 7K4M Q2PX '), 'SKCE7K4MQ2PX', 'prefix optional, spaces ignored');
select is(public.normalize_invite_code('SKCE-0K4M-Q2PX'), null, 'ambiguous characters (0 O 1 I L) are invalid');
select is(public.normalize_invite_code('SKCE-7K4'), null, 'too short is invalid');
-- S, K, C and E are valid code characters, so 8 characters that happen to
-- start with SKCE are a prefix-less code, not a short one.
select is(
  (select count(*) from generate_series(1, 500) where private.generate_invite_code() !~ '^SKCE[2-9A-HJKMNP-Z]{8}$'),
  0::bigint, '500 generated codes all match the format');

-- Admin creates an invite: audited, with code and email redacted
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
insert into public.invites (fan_name, email) values ('Noor', 'noor@fans.test');
reset role;
select is(
  (select count(*) from public.audit_logs where action = 'invites.insert' and target_id = (select id::text from public.invites where email = 'noor@fans.test')), 1::bigint,
  'creating an invite writes an audit row');
select is(
  (select metadata -> 'values' ->> 'code' from public.audit_logs where action = 'invites.insert' and target_id = (select id::text from public.invites where email = 'noor@fans.test')),
  '[redacted]', 'invite code is redacted in the audit log');
select is(
  (select metadata -> 'values' ->> 'email' from public.audit_logs where action = 'invites.insert' and target_id = (select id::text from public.invites where email = 'noor@fans.test')),
  '[redacted]', 'invite email is redacted in the audit log');
select throws_ok(
  $$insert into public.invites (fan_name, email, created_by_admin)
    values ('Noor again', 'NOOR@fans.test', 'a0000000-0000-4000-8000-000000000001')$$,
  '23505', null, 'only one open invite per email (case-insensitive)');

-- Audit log is append-only, even for the database owner
select throws_like(
  $$update public.audit_logs set action = 'tampered'$$,
  '%append-only%', 'audit rows cannot be edited');
select throws_like(
  $$delete from public.audit_logs$$,
  '%append-only%', 'audit rows cannot be deleted');

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select is((select count(*) from public.audit_logs), 0::bigint, 'fans cannot read the audit log');
reset role;

-- Storage
select is((select public from storage.buckets where id = 'id-documents'), false, 'id-documents bucket is private');
insert into storage.objects (bucket_id, name, owner_id)
values ('id-documents', 'f0000000-0000-4000-8000-000000000001/id.jpg', 'f0000000-0000-4000-8000-000000000001');

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select is((select count(*) from storage.objects where bucket_id = 'id-documents'), 0::bigint,
  'a fan cannot read ID documents, even their own');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', 'f0000000-0000-4000-8000-000000000001/x.jpg')$$,
  '42501', null, 'browsers cannot write to storage directly');
reset role;

select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select is((select count(*) from storage.objects
            where bucket_id = 'id-documents' and name = 'f0000000-0000-4000-8000-000000000001/id.jpg'), 1::bigint,
  'admins can read ID documents');
reset role;

-- Realtime topic parsing
select is(
  private.topic_conversation_id('conversation:b0000000-0000-4000-8000-000000000001'),
  'b0000000-0000-4000-8000-000000000001'::uuid, 'conversation topic parses');

select * from finish();
rollback;
