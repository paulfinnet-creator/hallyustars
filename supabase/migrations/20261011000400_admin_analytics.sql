-- Numbers for the admin Analytics page. Counts and medians only: no names,
-- emails or message text. Response times cover the last 90 days.

create function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin();

  with
  -- A fan's message that starts their turn (the one before it, if any, was
  -- the celebrity's), and the celebrity's first reply after it.
  turns as (
    select m.conversation_id, m.created_at, u.role,
           lag(u.role) over (partition by m.conversation_id order by m.created_at) as previous_role
    from public.messages m
    join public.users u on u.id = m.sender_id
    where m.created_at > now() - interval '90 days' and m.deleted_at is null
  ),
  replies as (
    select (
      select min(r.created_at)
      from public.messages r
      join public.users ru on ru.id = r.sender_id
      where r.conversation_id = t.conversation_id and ru.role = 'celebrity' and r.created_at > t.created_at
    ) - t.created_at as wait
    from turns t
    where t.role = 'fan' and coalesce(t.previous_role, 'celebrity') = 'celebrity'
  )
  select jsonb_build_object(
    'invites', (
      select jsonb_build_object(
        'created', count(*),
        'created30', count(*) filter (where created_at > now() - interval '30 days'),
        'used', count(*) filter (where used_at is not null),
        'used30', count(*) filter (where used_at > now() - interval '30 days'),
        'open', count(*) filter (where status = 'registering' or (status = 'created' and expires_at > now())),
        'expired', count(*) filter (where status = 'expired' or (status = 'created' and expires_at <= now()))
      ) from public.invites),
    'fans', (
      select jsonb_build_object(
        'approved', count(*) filter (where status = 'approved'),
        'pendingReview', count(*) filter (where status = 'pending_review'),
        'registering', count(*) filter (where status = 'registering'),
        'rejected', count(*) filter (where status = 'rejected'),
        'suspended', count(*) filter (where status = 'suspended'),
        'approved30', (select count(*) from public.verifications
                       where kind = 'registration' and status = 'approved' and decided_at > now() - interval '30 days')
      ) from public.users where role = 'fan'),
    'celebrities', (
      select jsonb_build_object(
        'profiles', count(*),
        'withLogin', count(*) filter (where user_id is not null),
        'open', count(*) filter (where user_id is not null and accepts_invites)
      ) from public.celebrity_profiles),
    'chatInvitations', (
      select jsonb_build_object(
        'sent', count(*),
        'sent30', count(*) filter (where created_at > now() - interval '30 days'),
        'waiting', count(*) filter (where status = 'pending' and expires_at > now()),
        'approved', count(*) filter (where status = 'approved'),
        'rejected', count(*) filter (where status = 'rejected')
      ) from public.chat_invitations),
    'chats', (
      select jsonb_build_object(
        'open', count(*) filter (where c.closed_at is null),
        'active7', count(*) filter (where exists (
          select 1 from public.messages m
          where m.conversation_id = c.id and m.created_at > now() - interval '7 days' and m.deleted_at is null))
      ) from public.conversations c),
    -- Medians in seconds; null when there's nothing to measure yet.
    'responseSeconds', jsonb_build_object(
      'verification', (
        select percentile_cont(0.5) within group (order by greatest(extract(epoch from decided_at - created_at), 0))
        from public.verifications where decided_at > now() - interval '90 days'),
      'chatInvitation', (
        select percentile_cont(0.5) within group (order by greatest(extract(epoch from decided_at - created_at), 0))
        from public.chat_invitations
        where status in ('approved', 'rejected') and decided_at > now() - interval '90 days'),
      'celebrityReply', (
        select percentile_cont(0.5) within group (order by greatest(extract(epoch from wait), 0))
        from replies where wait is not null)
    ),
    -- Approved fans per saved timezone; the page turns zones into countries.
    'fanTimezones', coalesce((
      select jsonb_agg(jsonb_build_object('timezone', timezone, 'count', n) order by n desc, timezone)
      from (select timezone, count(*) as n from public.users
            where role = 'fan' and status = 'approved' group by timezone) z), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_analytics() from public, anon;
grant execute on function public.admin_analytics() to authenticated;
