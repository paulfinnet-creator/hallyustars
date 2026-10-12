drop function if exists private.is_valid_timezone(text);
drop function if exists private.set_updated_at();
drop domain if exists public.site_locale;
drop type if exists public.email_type;
drop type if exists public.report_status;
drop type if exists public.chat_invitation_status;
drop type if exists public.verification_status;
drop type if exists public.verification_kind;
drop type if exists public.invite_status;
drop type if exists public.user_status;
drop type if exists public.user_role;
drop schema if exists private;
-- citext and pgcrypto are left installed: other Supabase features may use them.
