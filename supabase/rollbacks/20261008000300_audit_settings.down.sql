drop trigger if exists users_audit on public.users;
drop function if exists public.admin_get_user_email(uuid);
drop function if exists private.setting_int(text, int);
drop table if exists public.platform_settings;
drop function if exists private.write_audit(text, text, text, jsonb);
drop function if exists private.audit_admin_change();
drop table if exists public.audit_logs;
drop function if exists private.audit_logs_immutable();
