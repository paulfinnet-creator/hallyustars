-- Celebrity profiles and their translated bios. Readable by approved members,
-- writable by admins only.

create table public.celebrity_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references public.users (id) on delete set null,
  stage_name      text not null check (char_length(btrim(stage_name)) between 1 and 120),
  category        text not null check (category ~ '^[a-z][a-z0-9_]{1,31}$'),  -- e.g. kpop, actor
  group_name      text check (group_name is null or char_length(btrim(group_name)) between 1 and 120),
  languages       public.site_locale[] not null default '{}',
  timezone        text not null default 'Asia/Seoul',
  accepts_invites boolean not null default true,
  photo_url       text,
  search          tsvector generated always as (
                    to_tsvector('simple',
                      coalesce(stage_name, '') || ' ' || coalesce(group_name, '') || ' ' || category)
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint celebrity_profiles_timezone_valid check (private.is_valid_timezone(timezone))
);

create index celebrity_profiles_search_idx on public.celebrity_profiles using gin (search);
create index celebrity_profiles_filter_idx on public.celebrity_profiles (category, accepts_invites);
create index celebrity_profiles_group_idx on public.celebrity_profiles (group_name);

-- A linked login account must be a celebrity account.
create function private.check_celebrity_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.users where id = new.user_id and role = 'celebrity'
  ) then
    raise exception 'celebrity_profiles.user_id must reference a celebrity account';
  end if;
  return new;
end;
$$;

create trigger celebrity_profiles_check_user
  before insert or update of user_id on public.celebrity_profiles
  for each row execute function private.check_celebrity_user();

create trigger celebrity_profiles_set_updated_at
  before update on public.celebrity_profiles
  for each row execute function private.set_updated_at();

create trigger celebrity_profiles_audit
  after insert or update or delete on public.celebrity_profiles
  for each row execute function private.audit_admin_change('id', 'search');

create table public.celebrity_profile_translations (
  profile_id            uuid not null references public.celebrity_profiles (id) on delete cascade,
  locale                public.site_locale not null,
  bio                   text not null check (char_length(bio) <= 4000),
  is_machine_translated boolean not null default true,
  updated_at            timestamptz not null default now(),
  primary key (profile_id, locale)
);

create trigger celebrity_profile_translations_set_updated_at
  before update on public.celebrity_profile_translations
  for each row execute function private.set_updated_at();

create trigger celebrity_profile_translations_audit
  after insert or update or delete on public.celebrity_profile_translations
  for each row execute function private.audit_admin_change('profile_id');

-- ── RLS ──

alter table public.celebrity_profiles enable row level security;
alter table public.celebrity_profile_translations enable row level security;

create policy "celebrity_profiles: approved members read"
  on public.celebrity_profiles for select to authenticated
  using ((select private.is_approved()));

create policy "celebrity_profiles: admins manage"
  on public.celebrity_profiles for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "celebrity_profile_translations: approved members read"
  on public.celebrity_profile_translations for select to authenticated
  using ((select private.is_approved()));

create policy "celebrity_profile_translations: admins manage"
  on public.celebrity_profile_translations for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.celebrity_profiles, public.celebrity_profile_translations from anon, authenticated;
grant select, insert, update, delete on public.celebrity_profiles, public.celebrity_profile_translations
  to authenticated;
