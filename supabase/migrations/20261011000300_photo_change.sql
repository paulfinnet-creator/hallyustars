-- An approved fan's new profile photo goes back to admin review
-- (CLAUDE.md › Registration, step 9). Their current photo stays visible until
-- an admin approves the new one (admin_decide_verification handles the
-- profile_photo_change kind).

-- Called by our server (service role) once the new photo is stored. A second
-- new photo while one is waiting replaces it: returns the replaced photo's
-- path so the server can delete its files, else null.
create function public.photo_change_submit(p_user_id uuid, p_photo_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.verifications;
begin
  if not exists (select 1 from public.users where id = p_user_id and role = 'fan' and status = 'approved') then
    raise exception 'only approved fans can change their photo' using errcode = '22023';
  end if;
  if p_photo_path !~ ('^' || p_user_id::text || '/profile-[0-9a-f-]{36}\.jpg$') then
    raise exception 'unexpected photo path' using errcode = '22023';
  end if;

  select * into v_pending from public.verifications
    where user_id = p_user_id and kind = 'profile_photo_change' and status = 'pending'
    for update;
  if found then
    update public.verifications
      set profile_photo_path = p_photo_path, created_at = now()
      where id = v_pending.id;
    return v_pending.profile_photo_path;
  end if;

  insert into public.verifications (user_id, kind, profile_photo_path)
  values (p_user_id, 'profile_photo_change', p_photo_path);
  return null;
end;
$$;

revoke all on function public.photo_change_submit(uuid, text) from public, anon, authenticated;
grant execute on function public.photo_change_submit(uuid, text) to service_role;

-- The fan's own latest photo change (for their Settings page), without paths.
create function public.my_photo_change()
returns table (status public.verification_status, reason text, created_at timestamptz, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.status, v.reason, v.created_at, v.decided_at
  from public.verifications v
  where v.user_id = (select auth.uid()) and v.kind = 'profile_photo_change'
  order by v.created_at desc
  limit 1;
$$;

revoke all on function public.my_photo_change() from public, anon;
grant execute on function public.my_photo_change() to authenticated;
