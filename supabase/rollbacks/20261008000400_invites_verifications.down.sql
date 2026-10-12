drop function if exists public.my_verification();
drop table if exists public.verifications;
drop table if exists public.invites;
drop function if exists public.normalize_invite_code(text);
drop function if exists private.generate_invite_code();
