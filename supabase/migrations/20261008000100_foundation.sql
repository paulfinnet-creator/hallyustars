-- Foundation: extensions, the private schema for security-definer helpers, enums.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helpers used by RLS policies live here. This schema is NOT exposed through the
-- API (supabase/config.toml › api.schemas), so its functions can't be called
-- over HTTP; roles only need USAGE so policies can call them.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create type public.user_role as enum ('admin', 'celebrity', 'fan');

create type public.user_status as enum (
  'registering',     -- fan mid-registration (OTP done, uploads pending)
  'pending_review',  -- waiting for an admin to compare photo and ID
  'approved',
  'rejected',
  'suspended'
);

create type public.invite_status as enum (
  'created', 'registering', 'pending_review', 'approved', 'rejected', 'expired', 'revoked'
);

create type public.verification_kind as enum ('registration', 'profile_photo_change');
create type public.verification_status as enum ('pending', 'approved', 'rejected');

create type public.chat_invitation_status as enum (
  'pending', 'approved', 'rejected', 'withdrawn', 'expired'
);

create type public.report_status as enum ('open', 'resolved', 'dismissed');

create type public.email_type as enum (
  'chat_message', 'invitation_approved', 'invitation_rejected'
);

-- The 13 site locales (CLAUDE.md › Internationalization).
create domain public.site_locale as text
  check (value in ('en','ko','es','de','fr','it','th','zh','ja','pl','ru','pt','ar'));

-- Keep updated_at current on every update.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Reject anything that isn't an IANA zone name Postgres knows (never fixed offsets).
create function private.is_valid_timezone(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = tz)
    and tz !~ '^[+-]'
    and tz !~* '^(utc|gmt)[+-]';
$$;
