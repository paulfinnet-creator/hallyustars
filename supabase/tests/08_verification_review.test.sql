-- Admin approve/reject of verifications, and audited ID views.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- Léa (seed) is pending review with an invite. Add a second pending fan to reject.
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'rex@fans.test', '{"role":"fan"}', '{"display_name":"Rex"}', now(), now());
update public.users set status = 'pending_review' where id = '40000000-0000-4000-8000-000000000001';
insert into public.invites (fan_name, email, created_by_admin, status, user_id)
values ('Rex', 'rex@fans.test', 'a0000000-0000-4000-8000-000000000001', 'pending_review', '40000000-0000-4000-8000-000000000001');
insert into public.verifications (id, user_id, profile_photo_path, id_document_path, id_document_type)
values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'r/p.jpg', 'r/id.jpg', 'passport');

create temp view lea_v as
  select id from public.verifications where user_id = 'f0000000-0000-4000-8000-000000000002';
grant select on lea_v to authenticated;

-- ── Who may decide ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_decide_verification((select id from lea_v), true, null, 'https://x/a.jpg')$$,
  '42501', null, 'a fan cannot approve');
select throws_ok($$select public.admin_log_id_view((select id from lea_v))$$, '42501', null, 'a fan cannot log ID views');
reset role;
select pg_temp.login('a0000000-0000-4000-8000-000000000001', 'aal1');
select throws_ok($$select public.admin_decide_verification((select id from lea_v), true, null, 'https://x/a.jpg')$$,
  '42501', null, 'an admin without MFA cannot approve');
reset role;

-- ── Approve ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_decide_verification((select id from lea_v), true, null, null)$$,
  '22023', null, 'approval needs the published photo');
select lives_ok($$select public.admin_decide_verification((select id from lea_v), true, null, 'https://example.test/avatars/lea.jpg')$$,
  'admin approves');
select is(
  (select row(v.status, v.reviewed_by, u.status, u.avatar_url, i.status)::text
     from public.verifications v join public.users u on u.id = v.user_id join public.invites i on i.user_id = u.id
    where v.id = (select id from lea_v)),
  row('approved', 'a0000000-0000-4000-8000-000000000001'::uuid, 'approved', 'https://example.test/avatars/lea.jpg', 'approved')::text,
  'verification, account and invite are approved; the photo is published');
select ok((select decided_at is not null from public.verifications where id = (select id from lea_v)), 'decision time recorded');
select throws_ok($$select public.admin_decide_verification((select id from lea_v), false, 'again', null)$$,
  '22023', null, 'a decided verification cannot be decided again');

-- ── Reject ──
select throws_ok($$select public.admin_decide_verification('50000000-0000-4000-8000-000000000001', false, '   ', null)$$,
  '22023', null, 'rejecting needs a reason');
select lives_ok($$select public.admin_decide_verification('50000000-0000-4000-8000-000000000001', false, ' Photo does not match the ID ', null)$$,
  'admin rejects with a reason');
select is(
  (select row(v.status, v.reason, u.status, u.avatar_url, i.status)::text
     from public.verifications v join public.users u on u.id = v.user_id join public.invites i on i.user_id = u.id
    where v.id = '50000000-0000-4000-8000-000000000001'),
  row('rejected', 'Photo does not match the ID', 'rejected', null::text, 'rejected')::text,
  'verification, account and invite are rejected; no photo published');

-- ── ID views are audited ──
select lives_ok($$select public.admin_log_id_view('50000000-0000-4000-8000-000000000001')$$, 'admin logs an ID view');
reset role;
select is(
  (select count(*) from public.audit_logs
    where action = 'verification.id_viewed' and target_id = '50000000-0000-4000-8000-000000000001'
      and admin_id = 'a0000000-0000-4000-8000-000000000001'),
  1::bigint, 'the ID view is in the audit log');

-- ── Decisions are audited, without file paths ──
select is(
  (select count(*) from public.audit_logs where action = 'verifications.update' and target_id = '50000000-0000-4000-8000-000000000001'),
  1::bigint, 'the rejection is in the audit log');
select is(
  (select count(*) from public.audit_logs where action = 'users.update' and target_id = '40000000-0000-4000-8000-000000000001'),
  1::bigint, 'the account change is in the audit log');
select is(
  (select count(*) from public.audit_logs where action = 'invites.update'
     and target_id = (select id::text from public.invites where user_id = '40000000-0000-4000-8000-000000000001')),
  1::bigint, 'the invite change is in the audit log');

update public.verifications set id_deleted_at = now(), id_document_path = null where id = '50000000-0000-4000-8000-000000000001';
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.admin_log_id_view('50000000-0000-4000-8000-000000000001')$$,
  'P0002', null, 'a deleted ID cannot be viewed');

select * from finish();
rollback;
