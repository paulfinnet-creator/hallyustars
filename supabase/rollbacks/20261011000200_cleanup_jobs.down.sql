drop function if exists public.cleanup_abandon_registration(uuid);
drop function if exists public.cleanup_due_registrations(int);
drop function if exists public.cleanup_mark_id_deleted(uuid);
drop function if exists public.cleanup_due_id_documents(int);
delete from public.platform_settings where key = 'abandoned_registration_days';

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
