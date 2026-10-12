-- Fan registration via invite: code and email checks with lockout, linking
-- the new account, in-progress uploads, the final submit, and rate limits.
-- Everything here runs from our server with the service role; browsers can't
-- call these functions (the fan has no account yet at the first steps).

-- ── ID document type ──

create type public.id_document_type as enum ('passport', 'national_id', 'drivers_license');

alter table public.verifications
  add column id_document_type public.id_document_type,
  add constraint verifications_id_type_required
    check (kind = 'profile_photo_change' or id_document_type is not null);

-- ── Uploads in progress (one row per registering fan) ──
-- Paths are in the private id-documents bucket. The profile photo also has a
-- 400×400 copy at the same path with "-400" before ".jpg".

create table public.registration_drafts (
  user_id            uuid primary key references public.users (id) on delete cascade,
  profile_photo_path text,
  id_document_path   text,
  id_document_type   public.id_document_type,
  updated_at         timestamptz not null default now()
);

comment on table public.registration_drafts is
  'Server-only (service role). File paths: never write to application logs.';

create trigger registration_drafts_set_updated_at
  before update on public.registration_drafts
  for each row execute function private.set_updated_at();

alter table public.registration_drafts enable row level security;
revoke all on public.registration_drafts from anon, authenticated;

-- ── Rate limits (sliding window) ──
-- One row per allowed attempt; a key is refused while p_max attempts happened
-- in the last p_window_seconds. (Fixed clock windows would let a burst that
-- straddles a boundary through twice.)

create table private.rate_limit_hits (
  key    text not null,
  hit_at timestamptz not null default now()
);

create index rate_limit_hits_key_idx on private.rate_limit_hits (key, hit_at);

-- Count one attempt for `p_key`; false (and not counted) once p_max attempts
-- happened within the window.
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits int;
begin
  -- Serialize attempts for the same key so parallel requests can't overshoot.
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from private.rate_limit_hits
    where key = p_key and hit_at <= now() - make_interval(secs => p_window_seconds);
  select count(*) into v_hits from private.rate_limit_hits where key = p_key;
  if v_hits >= p_max then
    return false;
  end if;
  insert into private.rate_limit_hits (key) values (p_key);
  return true;
end;
$$;

-- ── Invite checks ──
-- Results: ok | unknown | used | expired | revoked | locked

create function private.invite_state(v public.invites)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when v.id is null then 'unknown'
    when v.status = 'revoked' then 'revoked'
    when v.status in ('pending_review', 'approved', 'rejected') then 'used'
    -- A fan who already started may finish even after the expiry date.
    when v.status = 'expired' or (v.status = 'created' and v.expires_at <= now()) then 'expired'
    when v.locked_until > now() then 'locked'
    else 'ok'
  end;
$$;

create function public.registration_check_code(p_code text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.invites;
begin
  select * into v from public.invites where code = public.normalize_invite_code(p_code);
  return private.invite_state(v);
end;
$$;

-- Check the email typed for an invite. A wrong email counts towards the
-- lockout (5 by default, then 60 minutes; see platform_settings).
-- Results: match | mismatch | plus any non-ok result of registration_check_code.
create function public.registration_check_email(p_code text, p_email text)
returns table (result text, invite_id uuid, fan_name text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.invites;
  v_state text;
begin
  select * into v from public.invites
    where code = public.normalize_invite_code(p_code)
    for update;
  v_state := private.invite_state(v);
  if v_state <> 'ok' then
    return query select v_state, null::uuid, null::text, null::uuid;
    return;
  end if;

  -- Explicit lower(): with an empty search_path citext's own = operator isn't
  -- found and the comparison silently becomes case-sensitive.
  if lower(v.email::text) = lower(btrim(p_email)) then
    update public.invites set failed_email_attempts = 0, locked_until = null where id = v.id;
    return query select 'match'::text, v.id, v.fan_name, v.user_id;
    return;
  end if;

  if v.failed_email_attempts + 1 >= private.setting_int('invite_max_email_attempts', 5) then
    update public.invites
      set failed_email_attempts = 0,
          locked_until = now() + make_interval(mins => private.setting_int('invite_lock_minutes', 60))
      where id = v.id;
    return query select 'locked'::text, null::uuid, null::text, null::uuid;
  else
    update public.invites set failed_email_attempts = failed_email_attempts + 1 where id = v.id;
    return query select 'mismatch'::text, null::uuid, null::text, null::uuid;
  end if;
end;
$$;

-- Attach the newly created account to its invite (first use of the code).
create function public.registration_link_user(p_invite_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites
    set user_id = p_user_id, status = 'registering', used_at = coalesce(used_at, now())
    where id = p_invite_id
      and status in ('created', 'registering')
      and (user_id is null or user_id = p_user_id);
  return found;
end;
$$;

-- Hand the finished registration to the admins: verification row, account
-- and invite to pending_review, draft removed. All in one transaction.
create function public.registration_submit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.registration_drafts;
begin
  select * into d from public.registration_drafts where user_id = p_user_id for update;
  if not found or d.profile_photo_path is null or d.id_document_path is null or d.id_document_type is null then
    raise exception 'registration incomplete' using errcode = '22023';
  end if;

  update public.users set status = 'pending_review'
    where id = p_user_id and role = 'fan' and status = 'registering';
  if not found then
    raise exception 'account is not registering' using errcode = '22023';
  end if;

  insert into public.verifications (user_id, kind, profile_photo_path, id_document_path, id_document_type)
  values (p_user_id, 'registration', d.profile_photo_path, d.id_document_path, d.id_document_type);

  update public.invites set status = 'pending_review' where user_id = p_user_id;
  delete from public.registration_drafts where user_id = p_user_id;
end;
$$;

revoke all on function
  public.hit_rate_limit(text, int, int),
  public.registration_check_code(text),
  public.registration_check_email(text, text),
  public.registration_link_user(uuid, uuid),
  public.registration_submit(uuid),
  private.invite_state(public.invites)
  from public, anon, authenticated;
grant execute on function
  public.hit_rate_limit(text, int, int),
  public.registration_check_code(text),
  public.registration_check_email(text, text),
  public.registration_link_user(uuid, uuid),
  public.registration_submit(uuid)
  to service_role;
