-- Audit log (append-only), platform settings, and the audited email lookup.

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  admin_id    uuid not null references public.users (id) on delete restrict,
  action      text not null,          -- e.g. 'invites.update', 'user.email_viewed'
  target_type text not null,          -- table or entity name
  target_id   text,                   -- text: some targets have composite keys
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_admin_idx on public.audit_logs (admin_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs: admins read"
  on public.audit_logs for select to authenticated
  using ((select private.is_admin()));

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

-- Append-only, even for the service role.
create function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();

-- ── Generic audit trigger ──
-- Attach to every admin-managed table. When the acting user (auth.uid()) is an
-- admin, it writes one audit_logs row in the same transaction as the change.
-- Admin mutations must therefore run with the admin's own session (or an
-- admin_* RPC), not the service role, so the actor is known.
--
-- TG_ARGV[0]: primary-key column used as target_id (default 'id')
-- TG_ARGV[1..]: columns whose values must never be copied into metadata

create function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pk text := coalesce(tg_argv[0], 'id');
  v_redact text[] := coalesce(tg_argv[1:], '{}');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_values jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.users where id = v_actor and role = 'admin'
  ) then
    return null;  -- not an admin action (system, service role, or member)
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}') into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at');
    if cardinality(v_changed) = 0 then
      return null;  -- no-op update
    end if;
  else
    select coalesce(array_agg(key order by key), '{}') into v_changed
    from jsonb_object_keys(v_row) key;
  end if;

  -- Values of changed, non-sensitive columns only.
  select coalesce(jsonb_object_agg(key, case when key = any (v_redact) then '"[redacted]"'::jsonb else value end), '{}')
  into v_values
  from jsonb_each(coalesce(v_new, v_old))
  where key = any (v_changed) and key not in ('created_at', 'updated_at');

  insert into public.audit_logs (admin_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_row ->> v_pk,
    jsonb_build_object('changed', to_jsonb(v_changed), 'values', v_values)
  );
  return null;
end;
$$;

-- Explicit audit entry for actions that aren't row changes (viewing an email,
-- opening an ID document). Only callable from other security-definer code.
create function private.write_audit(
  p_action text, p_target_type text, p_target_id text, p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.audit_logs (admin_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'));
end;
$$;

revoke all on function private.audit_admin_change(), private.write_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ── Platform settings ──

create table public.platform_settings (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function private.set_updated_at();

create trigger platform_settings_audit
  after insert or update or delete on public.platform_settings
  for each row execute function private.audit_admin_change('key');

insert into public.platform_settings (key, value) values
  ('invite_expiry_days', '14'),
  ('invite_max_email_attempts', '5'),
  ('invite_lock_minutes', '60'),
  ('id_document_retention_days', '30'),
  ('chat_invitation_expiry_days', '14');

alter table public.platform_settings enable row level security;

create policy "platform_settings: admins manage"
  on public.platform_settings for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.platform_settings from anon, authenticated;
grant select, insert, update, delete on public.platform_settings to authenticated;

-- Read a numeric setting (for column defaults and server functions).
create function private.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.platform_settings where key = p_key), p_default);
$$;

revoke all on function private.setting_int(text, int) from public;
grant execute on function private.setting_int(text, int) to authenticated, service_role;

-- ── Audited email lookup (the only way to see a user's email outside Auth) ──

create function public.admin_get_user_email(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    return null;
  end if;

  perform private.write_audit('user.email_viewed', 'users', p_user_id::text);
  return v_email;
end;
$$;

revoke all on function public.admin_get_user_email(uuid) from public, anon;
grant execute on function public.admin_get_user_email(uuid) to authenticated;

-- Audit changes admins make to user accounts (role, status, avatar).
create trigger users_audit
  after insert or update or delete on public.users
  for each row execute function private.audit_admin_change('id');
