drop function if exists public.registration_submit(uuid);
drop function if exists public.registration_link_user(uuid, uuid);
drop function if exists public.registration_check_email(text, text);
drop function if exists public.registration_check_code(text);
drop function if exists private.invite_state(public.invites);
drop function if exists public.hit_rate_limit(text, int, int);
drop table if exists private.rate_limit_hits;
drop table if exists public.registration_drafts;
alter table public.verifications
  drop constraint if exists verifications_id_type_required,
  drop column if exists id_document_type;
drop type if exists public.id_document_type;
