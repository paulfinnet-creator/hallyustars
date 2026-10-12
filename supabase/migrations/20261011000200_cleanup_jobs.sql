-- Daily cleanup (run by /api/cron/cleanup with the service role):
-- 1. ID images are deleted once id_document_retention_days have passed since
--    the review decision; the verification record stays (CLAUDE.md › uploads).
-- 2. Registrations nobody has touched for abandoned_registration_days are
--    removed: files, account, and the invite becomes expired (an admin can
--    give it a new code).

insert into public.platform_settings (key, value)
values ('abandoned_registration_days', '30')
on conflict (key) do nothing;

-- ── ID images ──

-- Decided verifications whose ID image is due for deletion.
create function public.cleanup_due_id_documents(p_limit int default 100)
returns table (id uuid, id_document_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.id_document_path
  from public.verifications v
  where v.id_document_path is not null
    and v.id_deleted_at is null
    and v.decided_at < now() - make_interval(days => private.setting_int('id_document_retention_days', 30))
  order by v.decided_at
  limit p_limit;
$$;

-- After the file is deleted from storage: keep the record, drop the path.
create function public.cleanup_mark_id_deleted(p_verification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.verifications
    set id_document_path = null, id_deleted_at = now()
    where id = p_verification_id and id_deleted_at is null;
$$;

-- ── Abandoned registrations ──

-- Fans still registering whose last sign-in, upload or account creation is
-- older than the setting.
create function public.cleanup_due_registrations(p_limit int default 100)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.users u
  join auth.users a on a.id = u.id
  left join public.registration_drafts d on d.user_id = u.id
  where u.role = 'fan'
    and u.status = 'registering'
    and greatest(u.created_at, d.updated_at, a.last_sign_in_at)
        < now() - make_interval(days => private.setting_int('abandoned_registration_days', 30))
  order by u.created_at
  limit p_limit;
$$;

-- Just before the account is deleted: the invite becomes expired and is
-- detached from the account. False if the fan has moved on meanwhile.
create function public.cleanup_abandon_registration(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.users where id = p_user_id and role = 'fan' and status = 'registering' for update;
  if not found then
    return false;
  end if;
  update public.invites
    set status = 'expired', user_id = null
    where user_id = p_user_id and status = 'registering';
  return true;
end;
$$;

revoke all on function
  public.cleanup_due_id_documents(int),
  public.cleanup_mark_id_deleted(uuid),
  public.cleanup_due_registrations(int),
  public.cleanup_abandon_registration(uuid)
  from public, anon, authenticated;
grant execute on function
  public.cleanup_due_id_documents(int),
  public.cleanup_mark_id_deleted(uuid),
  public.cleanup_due_registrations(int),
  public.cleanup_abandon_registration(uuid)
  to service_role;

-- The new setting is changed on the Settings page like the others.
create or replace function public.admin_update_setting(p_key text, p_value int)
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
    ('chat_invitation_expiry_days', 1, 90),
    ('abandoned_registration_days', 7, 180)
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
