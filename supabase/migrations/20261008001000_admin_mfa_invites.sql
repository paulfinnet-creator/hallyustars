-- Admin rights require MFA, plus the admin invite actions.

-- ── Admin rights only in an MFA-verified session (aal2) ──
-- An admin who has signed in with the email code but not yet with their
-- authenticator app has no admin rights anywhere in the database.

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

-- ── Invite actions ──
-- The audit trigger on invites records each change with the acting admin.

create function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_admin() from public;
grant execute on function private.require_admin() to authenticated;

-- Create an invite for one fan. Returns the new code (normalized, no dashes).
-- A second open invite for the same email fails with 23505.
create function public.admin_create_invite(p_fan_name text, p_email text)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  -- A fresh code collides about once in 10^11 tries; retry rather than fail.
  for attempt in 1..5 loop
    begin
      return query
        insert into public.invites (fan_name, email, created_by_admin)
        values (btrim(p_fan_name), lower(btrim(p_email)), (select auth.uid()))
        returning invites.id, invites.code, invites.expires_at;
      return;
    exception when unique_violation then
      if attempt = 5 or sqlerrm not like '%invites_code_key%' then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- Revoke an invite that hasn't produced an account yet.
create function public.admin_revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.invite_status;
begin
  perform private.require_admin();

  select status into v_status from public.invites where id = p_invite_id for update;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v_status not in ('created', 'registering', 'expired') then
    raise exception 'invite is %', v_status using errcode = '22023';
  end if;

  update public.invites set status = 'revoked' where id = p_invite_id;
end;
$$;

-- Give an unused invite a new code and a fresh expiry; the old code stops
-- working. Returns the new code.
create function public.admin_regenerate_invite_code(p_invite_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.invite_status;
begin
  perform private.require_admin();

  select status into v_status from public.invites where id = p_invite_id for update;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v_status not in ('created', 'registering', 'expired') then
    raise exception 'invite is %', v_status using errcode = '22023';
  end if;

  for attempt in 1..5 loop
    begin
      return query
        update public.invites i
          set code = private.generate_invite_code(),
              status = case when i.status = 'expired' then 'created' else i.status end,
              expires_at = now() + make_interval(days => private.setting_int('invite_expiry_days', 14)),
              failed_email_attempts = 0,
              locked_until = null
          where i.id = p_invite_id
          returning i.code, i.expires_at;
      return;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

revoke all on function
  public.admin_create_invite(text, text),
  public.admin_revoke_invite(uuid),
  public.admin_regenerate_invite_code(uuid)
  from public, anon;
grant execute on function
  public.admin_create_invite(text, text),
  public.admin_revoke_invite(uuid),
  public.admin_regenerate_invite_code(uuid)
  to authenticated;
