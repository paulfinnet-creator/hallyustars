create or replace function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pk text := coalesce(tg_argv[0], 'id');
  v_redact text[] := coalesce(tg_argv[1:], '{}');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_values jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.users where id = v_actor and role = 'admin'
  ) then
    return null;  -- not an admin action (system, service role, or member)
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}') into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key
      and n.key not in ('updated_at');
    if cardinality(v_changed) = 0 then
      return null;  -- no-op update
    end if;
  else
    select coalesce(array_agg(key order by key), '{}') into v_changed
    from jsonb_object_keys(v_row) key;
  end if;

  -- Values of changed, non-sensitive columns only.
  select coalesce(jsonb_object_agg(key, case when key = any (v_redact) then '"[redacted]"'::jsonb else value end), '{}')
  into v_values
  from jsonb_each(coalesce(v_new, v_old))
  where key = any (v_changed) and key not in ('created_at', 'updated_at');

  insert into public.audit_logs (admin_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    v_row ->> v_pk,
    jsonb_build_object('changed', to_jsonb(v_changed), 'values', v_values)
  );
  return null;
end;
$$;
