drop function if exists public.admin_link_new_celebrity_account(uuid, uuid);
alter table public.celebrity_profiles
  drop column if exists bio_updated_at,
  drop column if exists bio_source_locale;
