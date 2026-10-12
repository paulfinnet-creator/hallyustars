-- Admin management of celebrity profiles: the original bio's language,
-- and creating + linking a celebrity's login account.

-- The admin writes the bio in Korean or English; the other languages are
-- (machine) translations of it. bio_updated_at lets the admin screen flag
-- hand-edited translations that are older than the current original.
alter table public.celebrity_profiles
  add column bio_source_locale public.site_locale
    check (bio_source_locale is null or bio_source_locale in ('ko', 'en')),
  add column bio_updated_at timestamptz;

-- Supabase Auth creates the account (service role, so no audit trigger knows
-- the admin). Our server then calls this with the admin's session: it links
-- the new account to the profile and records who created it.
create function public.admin_link_new_celebrity_account(p_profile_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  if not exists (select 1 from public.users where id = p_user_id and role = 'celebrity') then
    raise exception 'not a celebrity account' using errcode = '22023';
  end if;
  if exists (select 1 from public.celebrity_profiles where user_id = p_user_id) then
    raise exception 'account already linked' using errcode = '23505';
  end if;

  perform private.write_audit('users.celebrity_account_created', 'users', p_user_id::text,
    jsonb_build_object('profile_id', p_profile_id));

  update public.celebrity_profiles set user_id = p_user_id where id = p_profile_id and user_id is null;
  if not found then
    raise exception 'profile not found or already linked' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.admin_link_new_celebrity_account(uuid, uuid) from public, anon;
grant execute on function public.admin_link_new_celebrity_account(uuid, uuid) to authenticated;
