-- Local development data only. Never run against staging or production.
-- All people are fictional; emails use the reserved .test domain.
-- Sign in with email OTP; codes arrive in Mailpit at http://127.0.0.1:54324.

-- Fixed ids so tests and docs can refer to them.
-- admin     a0000000-0000-4000-8000-000000000001
-- celebrity c0000000-0000-4000-8000-000000000001 / ...0002
-- fan       f0000000-0000-4000-8000-000000000001 (approved) / ...0002 (pending review)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
  now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
  jsonb_build_object('display_name', u.name, 'timezone', u.tz, 'locale', u.locale),
  now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@hallyustars.test', 'admin',     'Admin Kim',      'Asia/Seoul',   'ko'),
  ('c0000000-0000-4000-8000-000000000001'::uuid, 'haneul@hallyustars.test', 'celebrity', 'Haneul (Demo)', 'Asia/Seoul',   'ko'),
  ('c0000000-0000-4000-8000-000000000002'::uuid, 'minjun@hallyustars.test', 'celebrity', 'Minjun (Demo)', 'Asia/Seoul',   'ko'),
  ('f0000000-0000-4000-8000-000000000001'::uuid, 'ada@fans.test',           'fan',       'Ada',           'Africa/Lagos', 'en'),
  ('f0000000-0000-4000-8000-000000000002'::uuid, 'lea@fans.test',           'fan',       'Léa',           'Europe/Paris', 'fr')
) as u(id, email, role, name, tz, locale);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%.test';

-- The signup trigger created public.users rows; set fan review states.
update public.users set status = 'approved'       where id = 'f0000000-0000-4000-8000-000000000001';
update public.users set status = 'pending_review' where id = 'f0000000-0000-4000-8000-000000000002';

-- Invites that those fans used.
insert into public.invites (fan_name, email, status, created_by_admin, used_at, user_id) values
  ('Ada', 'ada@fans.test', 'approved',       'a0000000-0000-4000-8000-000000000001', now() - interval '3 days', 'f0000000-0000-4000-8000-000000000001'),
  ('Léa', 'lea@fans.test', 'pending_review', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 hour', 'f0000000-0000-4000-8000-000000000002');
-- One unused invite for trying registration.
insert into public.invites (fan_name, email, created_by_admin) values
  ('Sami', 'sami@fans.test', 'a0000000-0000-4000-8000-000000000001');

insert into public.verifications (user_id, kind, profile_photo_path, id_document_path, id_document_type, status, reviewed_by, decided_at) values
  ('f0000000-0000-4000-8000-000000000001', 'registration', 'f0000000-0000-4000-8000-000000000001/profile.jpg',
   'f0000000-0000-4000-8000-000000000001/id.jpg', 'passport', 'approved', 'a0000000-0000-4000-8000-000000000001', now() - interval '2 days');
insert into public.verifications (user_id, kind, profile_photo_path, id_document_path, id_document_type) values
  ('f0000000-0000-4000-8000-000000000002', 'registration', 'f0000000-0000-4000-8000-000000000002/profile.jpg',
   'f0000000-0000-4000-8000-000000000002/id.jpg', 'national_id');

-- Celebrity profiles linked to their login accounts.
insert into public.celebrity_profiles (id, user_id, stage_name, category, group_name, languages, timezone, accepts_invites) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Haneul', 'kpop', 'Demo Group', '{ko,en}', 'Asia/Seoul', true),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'Minjun', 'actor', null,        '{ko,ja}', 'Asia/Seoul', true);

insert into public.celebrity_profile_translations (profile_id, locale, bio, is_machine_translated) values
  ('d0000000-0000-4000-8000-000000000001', 'en', 'Demo profile: lead vocalist of a fictional K-pop group.', false),
  ('d0000000-0000-4000-8000-000000000001', 'ko', '데모 프로필: 가상의 K-pop 그룹 메인 보컬.', false),
  ('d0000000-0000-4000-8000-000000000002', 'en', 'Demo profile: a fictional actor known for historical dramas.', false),
  ('d0000000-0000-4000-8000-000000000002', 'ko', '데모 프로필: 사극으로 알려진 가상의 배우.', false);

-- Ada's approved chat with Haneul, and a pending invitation to Minjun.
insert into public.chat_invitations (id, fan_id, celebrity_id, message, status, decided_by_admin, decided_at) values
  ('e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Hello from Lagos! Your music got me through exams.', 'approved', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day');
insert into public.chat_invitations (fan_id, celebrity_id, message) values
  ('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002',
   'I loved your last drama. Could we chat?');

insert into public.conversations (id, chat_invitation_id) values
  ('b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001');
insert into public.conversation_members (conversation_id, user_id, last_read_at) values
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', now()),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', now() - interval '2 hours');

insert into public.messages (conversation_id, sender_id, body, created_at) values
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Hi Haneul! Thank you for accepting.', now() - interval '3 hours'),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '안녕하세요 Ada! Nice to meet you.', now() - interval '2 hours');
