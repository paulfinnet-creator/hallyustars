drop function if exists public.admin_update_setting(text, int);
drop function if exists public.admin_record_mfa_reset(uuid);
drop function if exists public.admin_set_admin_access(uuid, boolean);
drop function if exists public.admin_record_admin_created(uuid);
drop function if exists public.admin_list_admins();
drop function if exists public.my_session_active();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
    and coalesce(
      (select role = 'admin' and status = 'approved'
         from public.users where id = (select auth.uid())),
      false);
$$;

drop function if exists private.session_active();
