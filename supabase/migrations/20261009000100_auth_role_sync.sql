-- Supabase Auth's admin createUser() inserts the auth user first and writes
-- app_metadata (where our role lives) in a second statement, so the insert
-- trigger from migration 0200 sees no role and makes everyone a fan. Apply the
-- role when it is first assigned. Later role changes go through admin actions
-- (audited), never app_metadata; only the service role can write app_metadata.

create function private.apply_initial_auth_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  begin
    v_role := (new.raw_app_meta_data ->> 'role')::public.user_role;
  exception when invalid_text_representation then
    return new;  -- unknown role name: leave the fan default
  end;

  update public.users
    set role = v_role,
        -- Staff accounts are created ready to use; fans keep their status.
        status = case when v_role = 'fan' then status else 'approved' end
    where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_role_assigned
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data ->> 'role' is null and new.raw_app_meta_data ->> 'role' is not null)
  execute function private.apply_initial_auth_role();
