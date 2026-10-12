-- Email notification preferences and the send log.
-- Invitation status emails (approved/rejected) are always sent, so only chat
-- emails have a toggle (CLAUDE.md › Email notifications).

create table public.notification_preferences (
  user_id             uuid primary key references public.users (id) on delete cascade,
  chat_emails_enabled boolean not null default true,
  -- Opaque token for the one-click unsubscribe link (no login needed).
  unsubscribe_token   uuid not null unique default gen_random_uuid(),
  updated_at          timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();

-- Every account gets a preferences row.
create function private.create_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger users_create_notification_preferences
  after insert on public.users
  for each row execute function private.create_notification_preferences();

alter table public.notification_preferences enable row level security;

create policy "notification_preferences: read own"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notification_preferences: update own"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notification_preferences from anon, authenticated;
-- unsubscribe_token is not readable by clients; the server puts it in emails.
grant select (user_id, chat_emails_enabled, updated_at) on public.notification_preferences to authenticated;
grant update (chat_emails_enabled) on public.notification_preferences to authenticated;

-- ── Email log: written by the server (service role) only ──

create table public.email_log (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.users (id) on delete cascade,
  type            public.email_type not null,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_count   int not null default 1 check (message_count >= 1),
  status          text not null check (status in ('queued', 'sent', 'skipped', 'failed')),
  provider_id     text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- "At most one email per conversation per hour" looks up the latest send here.
create index email_log_throttle_idx
  on public.email_log (user_id, conversation_id, sent_at desc)
  where status = 'sent';

alter table public.email_log enable row level security;

create policy "email_log: admins read"
  on public.email_log for select to authenticated
  using ((select private.is_admin()));

revoke all on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;
