drop table if exists public.email_log;
drop trigger if exists users_create_notification_preferences on public.users;
drop function if exists private.create_notification_preferences();
drop table if exists public.notification_preferences;
