-- Daily cleanup: ID images after the retention period, abandoned registrations.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Two registering fans (as Auth creates them): one idle for 40 days, one active.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f1500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'idle@fans.test', '{"role":"fan"}', '{"display_name":"Idle"}', now() - interval '40 days', now(), now() - interval '40 days'),
  ('00000000-0000-0000-0000-000000000000', 'f1500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'busy@fans.test', '{"role":"fan"}', '{"display_name":"Busy"}', now() - interval '40 days', now(), now() - interval '2 days');
update public.users set created_at = now() - interval '40 days'
  where id in ('f1500000-0000-4000-8000-000000000001', 'f1500000-0000-4000-8000-000000000002');
insert into public.invites (fan_name, email, status, created_by_admin, used_at, user_id) values
  ('Idle', 'idle@fans.test', 'registering', 'a0000000-0000-4000-8000-000000000001', now() - interval '40 days', 'f1500000-0000-4000-8000-000000000001'),
  ('Busy', 'busy@fans.test', 'registering', 'a0000000-0000-4000-8000-000000000001', now() - interval '40 days', 'f1500000-0000-4000-8000-000000000002');

-- Decided verifications: one 31 days ago, one 2 days ago, plus a pending one.
insert into public.verifications (id, user_id, kind, profile_photo_path, id_document_path, id_document_type, status, reviewed_by, decided_at)
values
  ('b1500000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'registration', 'x/profile-1.jpg', 'x/id-old.jpg',
   'passport', 'approved', 'a0000000-0000-4000-8000-000000000001', now() - interval '31 days'),
  ('b1500000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'registration', 'x/profile-2.jpg', 'x/id-new.jpg',
   'passport', 'approved', 'a0000000-0000-4000-8000-000000000001', now() - interval '2 days');
insert into public.verifications (id, user_id, kind, profile_photo_path, id_document_path, id_document_type)
values ('b1500000-0000-4000-8000-000000000003', 'f1500000-0000-4000-8000-000000000002', 'registration', 'x/profile-3.jpg', 'x/id-pending.jpg', 'passport');

-- ── Only the service role ──
set local role authenticated;
select throws_ok($$select * from public.cleanup_due_id_documents()$$, '42501', null, 'members cannot run the cleanup');
select throws_ok($$select public.cleanup_abandon_registration('f1500000-0000-4000-8000-000000000001')$$, '42501', null,
  'members cannot remove registrations');
reset role;
set local role service_role;

-- ── ID images ──
select is((select array_agg(id_document_path) from public.cleanup_due_id_documents() where id::text like 'b15%'),
  array['x/id-old.jpg'], 'only IDs decided more than 30 days ago are due');
select lives_ok($$select public.cleanup_mark_id_deleted('b1500000-0000-4000-8000-000000000001')$$, 'marks the ID deleted');
select is((select id_document_path from public.verifications where id = 'b1500000-0000-4000-8000-000000000001'), null,
  'the path is gone');
select isnt((select id_deleted_at from public.verifications where id = 'b1500000-0000-4000-8000-000000000001'), null,
  'the record shows when the ID was deleted');
select is((select status::text from public.verifications where id = 'b1500000-0000-4000-8000-000000000001'), 'approved',
  'the verification record stays');
select is((select count(*) from public.cleanup_due_id_documents() where id::text like 'b15%'), 0::bigint, 'nothing else is due');
reset role;
update public.platform_settings set value = '1' where key = 'id_document_retention_days';
set local role service_role;
select is((select array_agg(id_document_path) from public.cleanup_due_id_documents() where id::text like 'b15%'),
  array['x/id-new.jpg'], 'the retention setting is used');

-- ── Abandoned registrations ──
select is((select array_agg(user_id) from public.cleanup_due_registrations() where user_id::text like 'f15%'),
  array['f1500000-0000-4000-8000-000000000001'::uuid], 'only the idle registration is due');
select is((select public.cleanup_abandon_registration('f1500000-0000-4000-8000-000000000001')), true, 'abandons it');
select is((select status::text || ',' || coalesce(user_id::text, 'none') from public.invites where email = 'idle@fans.test'),
  'expired,none', 'its invite is expired and detached');
select is((select public.cleanup_abandon_registration('f0000000-0000-4000-8000-000000000001')), false,
  'an approved fan is never removed');
reset role;
select is((select status::text from public.invites where email = 'busy@fans.test'), 'registering', 'the active registration is untouched');

select * from finish();
rollback;
