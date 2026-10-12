drop function if exists public.admin_regenerate_invite_code(uuid);
drop function if exists public.admin_revoke_invite(uuid);
drop function if exists public.admin_create_invite(text, text);
drop function if exists private.require_admin();

-- Restore is_admin() without the MFA requirement (as in migration 0200).
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'admin' and status = 'approved'
       from public.users where id = (select auth.uid())),
    false);
$$;
