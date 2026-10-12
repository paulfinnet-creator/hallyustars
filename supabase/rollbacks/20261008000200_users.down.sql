drop view if exists public.user_public;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_auth_user();
-- The table goes before the helpers: its RLS policies depend on them.
drop table if exists public.users;
drop function if exists private.is_approved();
drop function if exists private.is_admin();
drop function if exists private.my_role();
