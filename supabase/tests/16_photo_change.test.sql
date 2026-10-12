-- A fan's new profile photo goes back to review; the current one stays until approved.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

update public.users set avatar_url = 'https://example.test/old.jpg' where id = 'f0000000-0000-4000-8000-000000000001';

-- ── Only our server submits ──
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.photo_change_submit('f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001/profile-00000000-0000-4000-8000-00000000000a.jpg')$$,
  '42501', null, 'a fan cannot call the submit function directly');
reset role;
set local role service_role;

select throws_ok($$select public.photo_change_submit('f0000000-0000-4000-8000-000000000001', 'someone-else/profile-x.jpg')$$,
  '22023', null, 'only the fan''s own photo path is accepted');
select throws_ok($$select public.photo_change_submit('a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001/profile-00000000-0000-4000-8000-00000000000a.jpg')$$,
  '22023', null, 'only approved fans change their photo this way');

select is((select public.photo_change_submit('f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001/profile-00000000-0000-4000-8000-00000000000a.jpg')), null,
  'the first new photo is queued');
select is((select public.photo_change_submit('f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001/profile-00000000-0000-4000-8000-00000000000b.jpg')),
  'f0000000-0000-4000-8000-000000000001/profile-00000000-0000-4000-8000-00000000000a.jpg',
  'a second one replaces it and returns the replaced path');
select is((select count(*) from public.verifications
           where user_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'profile_photo_change' and status = 'pending'),
  1::bigint, 'only one photo change waits at a time');
reset role;

select is((select status::text from public.users where id = 'f0000000-0000-4000-8000-000000000001'), 'approved',
  'the fan stays approved while the photo is reviewed');
select is((select avatar_url from public.users where id = 'f0000000-0000-4000-8000-000000000001'),
  'https://example.test/old.jpg', 'the current photo stays until approval');

select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select is((select status::text from public.my_photo_change()), 'pending', 'the fan sees their photo is waiting');
reset role;

-- ── Admin decision ──
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
select lives_ok($$select public.admin_decide_verification(
  (select id from public.verifications where user_id = 'f0000000-0000-4000-8000-000000000001'
     and kind = 'profile_photo_change' and status = 'pending'),
  false, 'Please use a photo of your face.')$$, 'an admin rejects it with a reason');
reset role;
select pg_temp.login('f0000000-0000-4000-8000-000000000001');
select is((select reason from public.my_photo_change()), 'Please use a photo of your face.', 'the fan sees the reason');
reset role;
select is((select status::text || ',' || avatar_url from public.users where id = 'f0000000-0000-4000-8000-000000000001'),
  'approved,https://example.test/old.jpg', 'a rejected photo changes nothing else');

set local role service_role;
select is((select public.photo_change_submit('f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000001/profile-00000000-0000-4000-8000-00000000000c.jpg')), null,
  'after a decision, a new photo starts a new review');
reset role;

select * from finish();
rollback;
