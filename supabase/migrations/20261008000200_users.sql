-- Users. Email is deliberately NOT stored here: it lives only in auth.users,
-- which the API never exposes. Admins read it through admin_get_user_email(),
-- which writes an audit row (migration 0300).

create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role   not null default 'fan',
  status       public.user_status not null default 'registering',
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url   text,
  locale       public.site_locale not null default 'en',
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint users_timezone_valid check (private.is_valid_timezone(timezone))
);

comment on table public.users is
  'App profile for every account. No email column: see auth.users and admin_get_user_email().';

create trigger users_set_updated_at
  before update on public.users
  for each row execute function private.set_updated_at();

-- ── Role helpers (security definer so policies don't recurse into users RLS) ──

create function private.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid());
$$;

-- An approved admin. Suspended or pending admins have no admin rights.
create function private.is_admin()
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

-- Any approved account (fan, celebrity or admin).
create function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select status = 'approved' from public.users where id = (select auth.uid())),
    false);
$$;

revoke all on function private.my_role(), private.is_admin(), private.is_approved() from public;
grant execute on function private.my_role(), private.is_admin(), private.is_approved()
  to anon, authenticated, service_role;

-- ── Create the profile row when Supabase Auth creates a user ──
-- Accounts are created only by our server (public sign-up is off in config.toml).
-- role comes from app_metadata, which only the service role can set.

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role :=
    coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'fan')::public.user_role;
  v_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    'Member');
  v_tz text := coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC');
  v_locale text := coalesce(new.raw_user_meta_data ->> 'locale', 'en');
begin
  if not private.is_valid_timezone(v_tz) then
    v_tz := 'UTC';
  end if;
  if v_locale not in ('en','ko','es','de','fr','it','th','zh','ja','pl','ru','pt','ar') then
    v_locale := 'en';
  end if;

  insert into public.users (id, role, status, display_name, locale, timezone)
  values (
    new.id,
    v_role,
    -- Fans start mid-registration; staff accounts are created ready to use.
    (case when v_role = 'fan' then 'registering' else 'approved' end)::public.user_status,
    left(v_name, 80),
    v_locale,
    v_tz
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ── Row Level Security ──

alter table public.users enable row level security;

create policy "users: read own row"
  on public.users for select to authenticated
  using (id = (select auth.uid()));

create policy "users: admins read all"
  on public.users for select to authenticated
  using ((select private.is_admin()));

-- Approved members can see celebrity accounts (needed for profiles and chat).
-- Conversation partners become visible in migration 0600.
create policy "users: approved members read celebrities"
  on public.users for select to authenticated
  using (role = 'celebrity' and (select private.is_approved()));

create policy "users: update own profile"
  on public.users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column privileges: members may only change their name, language and timezone.
-- role, status and avatar_url change through admin RPCs or server code.
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (display_name, locale, timezone) on public.users to authenticated;

-- ── Public profile view: what other people may see about someone ──
-- security_invoker: the caller's RLS on public.users decides which rows appear.

create view public.user_public
with (security_invoker = true)
as
  select
    id,
    display_name,
    avatar_url,
    role,
    (role = 'celebrity') as is_verified,
    timezone
  from public.users;

comment on view public.user_public is
  'Safe public fields for chat and profiles. Never add email or status here.';

revoke all on public.user_public from anon, authenticated;
grant select on public.user_public to authenticated;
