-- Invites and identity verifications. Admin-only data: fans never read these
-- tables directly; registration goes through server code (later step).

-- ── Invite codes: SKCE + 8 chars from 23456789ABCDEFGHJKMNPQRSTUVWXYZ ──
-- Stored normalized without dashes, e.g. SKCE7K4MQ2PX. Displayed as SKCE-7K4M-Q2PX.

create function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  -- 31 characters
  result text := 'SKCE';
  b int;
begin
  while char_length(result) < 12 loop
    -- Rejection sampling from a CSPRNG so every character is equally likely.
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 248 then  -- 248 = 8 × 31
      result := result || substr(alphabet, (b % 31) + 1, 1);
    end if;
  end loop;
  return result;
end;
$$;

-- Normalize user input: case-insensitive, ignore spaces and dashes, prefix optional.
create function public.normalize_invite_code(p_input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v ~ '^SKCE[2-9A-HJKMNP-Z]{8}$' then v
    when v ~ '^[2-9A-HJKMNP-Z]{8}$' then 'SKCE' || v
    else null
  end
  from (select upper(regexp_replace(coalesce(p_input, ''), '[\s-]', '', 'g')) as v) s;
$$;

grant execute on function public.normalize_invite_code(text) to anon, authenticated;

create table public.invites (
  id                    uuid primary key default gen_random_uuid(),
  fan_name              text not null check (char_length(btrim(fan_name)) between 1 and 120),
  email                 extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  code                  text not null unique default private.generate_invite_code()
                          check (code ~ '^SKCE[2-9A-HJKMNP-Z]{8}$'),
  status                public.invite_status not null default 'created',
  created_by_admin      uuid not null default auth.uid() references public.users (id),
  expires_at            timestamptz not null
                          default now() + make_interval(days => private.setting_int('invite_expiry_days', 14)),
  used_at               timestamptz,
  user_id               uuid unique references public.users (id) on delete set null,
  failed_email_attempts int not null default 0 check (failed_email_attempts >= 0),
  locked_until          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.invites.code is
  'Normalized, no dashes. Never write this value to application logs.';

-- One open invite per email at a time.
create unique index invites_one_open_per_email
  on public.invites (email)
  where status in ('created', 'registering', 'pending_review');

create index invites_status_idx on public.invites (status, created_at desc);

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function private.set_updated_at();

create trigger invites_audit
  after insert or update or delete on public.invites
  for each row execute function private.audit_admin_change('id', 'code', 'email');

alter table public.invites enable row level security;

create policy "invites: admins manage"
  on public.invites for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.invites from anon, authenticated;
grant select, insert, update, delete on public.invites to authenticated;

-- ── Verifications: profile photo vs ID, reviewed by an admin ──

create table public.verifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  kind               public.verification_kind not null default 'registration',
  profile_photo_path text not null,
  id_document_path   text,           -- null for profile-photo-change reviews
  status             public.verification_status not null default 'pending',
  reviewed_by        uuid references public.users (id),
  reason             text,
  decided_at         timestamptz,
  id_deleted_at      timestamptz,    -- set when the ID image is purged (30 days after decision)
  created_at         timestamptz not null default now(),
  constraint verifications_id_required
    check (kind = 'profile_photo_change' or id_document_path is not null or id_deleted_at is not null),
  constraint verifications_reject_reason
    check (status <> 'rejected' or char_length(btrim(coalesce(reason, ''))) > 0),
  constraint verifications_decision_complete
    check ((status = 'pending') = (decided_at is null))
);

comment on column public.verifications.id_document_path is
  'Path in the private id-documents bucket. Never write to application logs.';

create index verifications_queue_idx on public.verifications (status, created_at)
  where status = 'pending';
create index verifications_user_idx on public.verifications (user_id, created_at desc);
-- For the retention job: decided, ID still stored.
create index verifications_id_retention_idx on public.verifications (decided_at)
  where id_document_path is not null and id_deleted_at is null and decided_at is not null;

create trigger verifications_audit
  after insert or update or delete on public.verifications
  for each row execute function private.audit_admin_change('id', 'id_document_path', 'profile_photo_path');

alter table public.verifications enable row level security;

create policy "verifications: admins manage"
  on public.verifications for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.verifications from anon, authenticated;
grant select, update on public.verifications to authenticated;

-- A member's own latest review result, without file paths.
create function public.my_verification()
returns table (kind public.verification_kind, status public.verification_status, reason text, decided_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.kind, v.status, v.reason, v.decided_at
  from public.verifications v
  where v.user_id = (select auth.uid())
  order by v.created_at desc
  limit 1;
$$;

revoke all on function public.my_verification() from public, anon;
grant execute on function public.my_verification() to authenticated;
