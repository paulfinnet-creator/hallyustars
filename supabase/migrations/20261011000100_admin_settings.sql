-- Admin Settings module: the list of admins, adding and removing admins,
-- resetting another admin's authenticator app, and the platform settings.

-- ── Admin rights end with the session ──
-- Removing an admin's authenticator app (or signing them out) deletes their
-- sessions, but an access token stays valid for up to an hour. Admin rights
-- also need the token's session to still exist. Tokens issued by Auth always
-- carry session_id; only hand-made test tokens don't.

create function private.session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.jwt()) ->> 'session_id' is null
    or exists (select 1 from auth.sessions where id = ((select auth.jwt()) ->> 'session_id')::uuid);
$$;

revoke all on function private.session_active() from public;
grant execute on function private.session_active() to anon, authenticated, service_role;

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
      false)
    and private.session_active();
$$;

-- For the site: is the caller's session still active? (Admin pages ask.)
create function public.my_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.session_active();
$$;

revoke all on function public.my_session_active() from public, anon;
grant execute on function public.my_session_active() to authenticated;

-- ── Admins ──

-- Everyone with the admin role, and whether they have set up their
-- authenticator app. No emails: the creating admin already knows them, and
-- admin_get_user_email() (audited) is there if needed.
create function public.admin_list_admins()
returns table (
  id uuid,
  display_name text,
  status public.user_status,
  created_at timestamptz,
  has_authenticator boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select u.id, u.display_name, u.status, u.created_at,
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
    from public.users u
    where u.role = 'admin'
    order by u.status = 'approved' desc, u.display_name;
end;
$$;

-- Auth creates the account (service role, so no audit trigger knows the
-- admin). Our server then calls this with the admin's session to record who
-- added the new admin.
create function public.admin_record_admin_created(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.users where id = p_user_id and role = 'admin') then
    raise exception 'not an admin account' using errcode = '22023';
  end if;
  perform private.write_audit('users.admin_created', 'users', p_user_id::text);
end;
$$;

-- Turn another admin's access off (suspended) or back on. Accounts are never
-- deleted: the audit log keeps pointing at them. Nobody can change their own
-- access, so there is always at least one active admin.
create function public.admin_set_admin_access(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot change your own access' using errcode = '22023';
  end if;
  -- The users audit trigger records the change with the acting admin.
  update public.users
    set status = case when p_active then 'approved' else 'suspended' end::public.user_status
    where id = p_user_id and role = 'admin';
  if not found then
    raise exception 'admin not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Before our server removes the other admin's authenticator app through
-- Auth: records the reset and signs them out everywhere (their refresh tokens
-- go with the sessions; admin rights need a live session). They set up a new
-- app at their next sign-in. Not for yourself: you'd lock yourself out.
create function public.admin_record_mfa_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'cannot reset your own authenticator' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_user_id and role = 'admin') then
    raise exception 'admin not found' using errcode = 'P0002';
  end if;
  perform private.write_audit('users.mfa_reset', 'users', p_user_id::text);
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

-- ── Platform settings ──

-- Change one numeric setting, within sensible limits. The platform_settings
-- audit trigger records the change with the acting admin.
create function public.admin_update_setting(p_key text, p_value int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min int;
  v_max int;
begin
  perform private.require_admin();
  select lim.min_value, lim.max_value into v_min, v_max
  from (values
    ('invite_expiry_days', 1, 90),
    ('invite_max_email_attempts', 3, 20),
    ('invite_lock_minutes', 5, 1440),
    ('id_document_retention_days', 1, 90),
    ('chat_invitation_expiry_days', 1, 90)
  ) as lim (key, min_value, max_value)
  where lim.key = p_key;
  if v_min is null then
    raise exception 'unknown setting' using errcode = '22023';
  end if;
  if p_value is null or p_value < v_min or p_value > v_max then
    raise exception 'setting out of range' using errcode = '22023';
  end if;

  update public.platform_settings set value = to_jsonb(p_value) where key = p_key;
  if not found then
    insert into public.platform_settings (key, value) values (p_key, to_jsonb(p_value));
  end if;
end;
$$;

revoke all on function
  public.admin_list_admins(),
  public.admin_record_admin_created(uuid),
  public.admin_set_admin_access(uuid, boolean),
  public.admin_record_mfa_reset(uuid),
  public.admin_update_setting(text, int)
  from public, anon;
grant execute on function
  public.admin_list_admins(),
  public.admin_record_admin_created(uuid),
  public.admin_set_admin_access(uuid, boolean),
  public.admin_record_mfa_reset(uuid),
  public.admin_update_setting(text, int)
  to authenticated;
