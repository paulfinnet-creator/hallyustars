-- Chat email notifications (CLAUDE.md › Email notifications), one-click
-- unsubscribe, and the once-a-day limit for auto-replies to replies.

-- ── Pending chat emails ──
-- One row per recipient and conversation while a delayed check is waiting in
-- QStash. job_id ties the row to that one QStash call: reading the chat
-- deletes the row, so a check that arrives later finds nothing and stops.
create table public.chat_email_queue (
  user_id         uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  job_id          uuid not null default gen_random_uuid(),
  due_at          timestamptz not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.chat_email_queue enable row level security;
revoke all on public.chat_email_queue from anon, authenticated;

-- After a new message: queue a check for the other member unless one is
-- already waiting. Returns only newly queued rows, so the caller publishes one
-- QStash call per row. A row long past its due time (its call was lost) is
-- replaced. Server only (service role).
create function public.chat_email_enqueue(p_conversation_id uuid, p_sender_id uuid, p_delay_seconds int)
returns table (user_id uuid, job_id uuid, due_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  insert into public.chat_email_queue as q (user_id, conversation_id, due_at)
  select m.user_id, m.conversation_id, now() + make_interval(secs => p_delay_seconds)
  from public.conversation_members m
  where m.conversation_id = p_conversation_id
    and m.user_id <> p_sender_id
    and exists (select 1 from public.conversation_members s
                where s.conversation_id = p_conversation_id and s.user_id = p_sender_id)
  on conflict (user_id, conversation_id) do update
    set job_id = gen_random_uuid(), due_at = excluded.due_at, created_at = now()
    where q.due_at < now() - interval '1 hour'
  returning q.user_id, q.job_id, q.due_at;
$$;

-- What the delayed check should do. Returns
--   {"action": "none"}                          cancelled, read, or not allowed
--   {"action": "wait", "retry_at": ...}         an email went out within the hour
--   {"action": "send", "count": n, "sender_id": ..., "last_at": ...}
-- Server only (service role).
create function public.chat_email_check(
  p_user_id uuid,
  p_conversation_id uuid,
  p_job_id uuid,
  p_throttle interval default interval '1 hour'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_read timestamptz;
  v_last_sent timestamptz;
  v_sender uuid;
  v_unread int;
  v_last_at timestamptz;
  v_new int;
begin
  if not exists (select 1 from public.chat_email_queue
                 where user_id = p_user_id and conversation_id = p_conversation_id and job_id = p_job_id) then
    return jsonb_build_object('action', 'none');
  end if;

  select m.last_read_at, other.user_id into v_last_read, v_sender
  from public.conversation_members m
  join public.conversation_members other
    on other.conversation_id = m.conversation_id and other.user_id <> m.user_id
  join public.users u on u.id = m.user_id
  join public.notification_preferences p on p.user_id = m.user_id
  join public.conversations c on c.id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and m.user_id = p_user_id
    and u.status = 'approved'
    and p.chat_emails_enabled
    and c.closed_at is null
    and not private.is_blocked_between(m.user_id, other.user_id);
  if not found then
    delete from public.chat_email_queue where user_id = p_user_id and conversation_id = p_conversation_id;
    return jsonb_build_object('action', 'none');
  end if;

  select max(sent_at) into v_last_sent
  from public.email_log
  where user_id = p_user_id and conversation_id = p_conversation_id
    and type = 'chat_message' and status = 'sent';

  select count(*), max(created_at), count(*) filter (where created_at > coalesce(v_last_sent, '-infinity'))
    into v_unread, v_last_at, v_new
  from public.messages
  where conversation_id = p_conversation_id
    and sender_id <> p_user_id
    and deleted_at is null
    and created_at > coalesce(v_last_read, '-infinity');

  -- Nothing new since the last email (or since reading): nothing to say.
  if v_new = 0 then
    delete from public.chat_email_queue where user_id = p_user_id and conversation_id = p_conversation_id;
    return jsonb_build_object('action', 'none');
  end if;

  if v_last_sent > now() - p_throttle then
    update public.chat_email_queue set due_at = v_last_sent + p_throttle
      where user_id = p_user_id and conversation_id = p_conversation_id;
    return jsonb_build_object('action', 'wait', 'retry_at', v_last_sent + p_throttle);
  end if;

  return jsonb_build_object('action', 'send', 'count', v_unread, 'sender_id', v_sender, 'last_at', v_last_at);
end;
$$;

revoke all on function public.chat_email_enqueue(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.chat_email_check(uuid, uuid, uuid, interval) from public, anon, authenticated;
grant execute on function public.chat_email_enqueue(uuid, uuid, int) to service_role;
grant execute on function public.chat_email_check(uuid, uuid, uuid, interval) to service_role;

-- Reading the chat cancels the pending email (rule 4).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = (select auth.uid());
  delete from public.chat_email_queue
    where conversation_id = p_conversation_id and user_id = (select auth.uid());
$$;

-- ── One-click unsubscribe (no login; the token is only ever in emails) ──
create function public.unsubscribe_chat_emails(p_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.notification_preferences
      set chat_emails_enabled = false
      where unsubscribe_token = p_token
      returning 1
  )
  select exists (select 1 from changed);
$$;

revoke all on function public.unsubscribe_chat_emails(uuid) from public;
grant execute on function public.unsubscribe_chat_emails(uuid) to anon, authenticated;

-- ── Auto-replies to replies: at most one a day per sender ──
-- Keyed by a hash of the sender's address; the address itself is never kept.
create table public.auto_reply_log (
  address_hash text primary key check (address_hash ~ '^[0-9a-f]{64}$'),
  replied_at   timestamptz not null default now()
);

alter table public.auto_reply_log enable row level security;
revoke all on public.auto_reply_log from anon, authenticated;

-- True when this sender may get an auto-reply now (and records it).
create function public.claim_auto_reply(p_address_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    insert into public.auto_reply_log as l (address_hash) values (p_address_hash)
    on conflict (address_hash) do update set replied_at = now()
      where l.replied_at < now() - interval '1 day'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_auto_reply(text) from public, anon, authenticated;
grant execute on function public.claim_auto_reply(text) to service_role;
