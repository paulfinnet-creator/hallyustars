-- Chat: invitations (admin-approved), 1:1 conversations, messages, reactions,
-- translations, blocks and reports. Tables reference people by id only.

-- ── Chat invitations ──

create table public.chat_invitations (
  id               uuid primary key default gen_random_uuid(),
  fan_id           uuid not null default auth.uid() references public.users (id) on delete cascade,
  celebrity_id     uuid not null references public.celebrity_profiles (id) on delete cascade,
  message          text not null check (char_length(btrim(message)) between 1 and 500),
  status           public.chat_invitation_status not null default 'pending',
  decided_by_admin uuid references public.users (id),
  decided_at       timestamptz,
  reason           text,
  expires_at       timestamptz not null
                     default now() + make_interval(days => private.setting_int('chat_invitation_expiry_days', 14)),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chat_invitations_decision
    check ((status in ('approved', 'rejected')) = (decided_by_admin is not null and decided_at is not null))
);

-- One pending invitation per fan and celebrity.
create unique index chat_invitations_one_pending
  on public.chat_invitations (fan_id, celebrity_id) where status = 'pending';
create index chat_invitations_queue_idx on public.chat_invitations (status, created_at)
  where status = 'pending';

create trigger chat_invitations_set_updated_at
  before update on public.chat_invitations
  for each row execute function private.set_updated_at();

create trigger chat_invitations_audit
  after insert or update or delete on public.chat_invitations
  for each row execute function private.audit_admin_change('id', 'message');

-- ── Conversations and members ──

create table public.conversations (
  id                 uuid primary key default gen_random_uuid(),
  chat_invitation_id uuid not null unique references public.chat_invitations (id) on delete restrict,
  closed_at          timestamptz,
  created_at         timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

-- ── Messages ──

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.users (id) on delete cascade,
  body            text not null default '' check (char_length(body) <= 4000),
  attachments     jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  flagged         boolean not null default false,
  flag_reason     text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint messages_not_empty
    check (char_length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0)
);

comment on column public.messages.body is 'Never write message bodies to application logs.';

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_flagged_idx on public.messages (conversation_id) where flagged;

create trigger messages_audit
  after update or delete on public.messages
  for each row execute function private.audit_admin_change('id', 'body', 'attachments');

create table public.message_translations (
  message_id uuid not null references public.messages (id) on delete cascade,
  locale     public.site_locale not null,
  body       text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, locale)
);

create table public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ── Blocks and reports ──

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id      uuid references public.messages (id) on delete set null,
  reason          text not null check (char_length(btrim(reason)) between 1 and 1000),
  status          public.report_status not null default 'open',
  handled_by      uuid references public.users (id),
  handled_at      timestamptz,
  resolution      text,
  created_at      timestamptz not null default now()
);

create index reports_queue_idx on public.reports (status, created_at) where status = 'open';
create index reports_conversation_idx on public.reports (conversation_id);

create trigger reports_audit
  after update or delete on public.reports
  for each row execute function private.audit_admin_change('id');

-- ── Helpers (security definer: they read tables the caller can't fully see) ──

create function private.is_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = (select auth.uid())
  );
$$;

create function private.shares_conversation(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members me
    join public.conversation_members them using (conversation_id)
    where me.user_id = (select auth.uid()) and them.user_id = p_other
  );
$$;

create function private.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Can the current user post in this conversation right now?
create function private.can_post(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_approved()
    and exists (
      select 1 from public.conversations c
      where c.id = p_conversation_id and c.closed_at is null
    )
    and private.is_member(p_conversation_id)
    and not exists (
      select 1 from public.conversation_members other
      where other.conversation_id = p_conversation_id
        and other.user_id <> (select auth.uid())
        and private.is_blocked_between((select auth.uid()), other.user_id)
    );
$$;

-- Admins may read a conversation's messages only once it is flagged or reported.
create function private.conversation_under_review(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.messages where conversation_id = p_conversation_id and flagged)
      or exists (select 1 from public.reports where conversation_id = p_conversation_id);
$$;

create function private.message_conversation(p_message_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select conversation_id from public.messages where id = p_message_id;
$$;

-- Can the current (approved fan) user invite this celebrity?
create function private.can_invite(p_celebrity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_role() = 'fan'
    and private.is_approved()
    and exists (
      select 1 from public.celebrity_profiles cp
      where cp.id = p_celebrity_id
        and cp.accepts_invites
        and cp.user_id is not null
        and not private.is_blocked_between((select auth.uid()), cp.user_id)
    );
$$;

revoke all on function
  private.is_member(uuid), private.shares_conversation(uuid), private.is_blocked_between(uuid, uuid),
  private.can_post(uuid), private.conversation_under_review(uuid), private.message_conversation(uuid),
  private.can_invite(uuid)
  from public;
grant execute on function
  private.is_member(uuid), private.shares_conversation(uuid), private.is_blocked_between(uuid, uuid),
  private.can_post(uuid), private.conversation_under_review(uuid), private.message_conversation(uuid),
  private.can_invite(uuid)
  to authenticated, service_role;

-- Conversation partners can see each other's public profile.
create policy "users: conversation partners read"
  on public.users for select to authenticated
  using (private.shares_conversation(id));

-- ── RLS ──

alter table public.chat_invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_translations enable row level security;
alter table public.reactions enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- chat_invitations
create policy "chat_invitations: fan reads own"
  on public.chat_invitations for select to authenticated
  using (fan_id = (select auth.uid()));
create policy "chat_invitations: admins read"
  on public.chat_invitations for select to authenticated
  using ((select private.is_admin()));
create policy "chat_invitations: approved fan sends"
  on public.chat_invitations for insert to authenticated
  with check (fan_id = (select auth.uid()) and status = 'pending' and private.can_invite(celebrity_id));
create policy "chat_invitations: fan withdraws pending"
  on public.chat_invitations for update to authenticated
  using (fan_id = (select auth.uid()) and status = 'pending')
  with check (fan_id = (select auth.uid()) and status = 'withdrawn');

-- conversations
create policy "conversations: members read"
  on public.conversations for select to authenticated
  using (private.is_member(id));
create policy "conversations: admins read"
  on public.conversations for select to authenticated
  using ((select private.is_admin()));

-- conversation_members
create policy "conversation_members: members read"
  on public.conversation_members for select to authenticated
  using (private.is_member(conversation_id));
create policy "conversation_members: admins read"
  on public.conversation_members for select to authenticated
  using ((select private.is_admin()));
create policy "conversation_members: mark own as read"
  on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- messages
create policy "messages: members read"
  on public.messages for select to authenticated
  using (private.is_member(conversation_id));
create policy "messages: admins read flagged or reported conversations"
  on public.messages for select to authenticated
  using ((select private.is_admin()) and private.conversation_under_review(conversation_id));
create policy "messages: members send"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_post(conversation_id));
create policy "messages: admins moderate"
  on public.messages for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- message_translations: readable with the message; written by the server only.
create policy "message_translations: readable with the message"
  on public.message_translations for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

-- reactions
create policy "reactions: members read"
  on public.reactions for select to authenticated
  using (private.is_member(private.message_conversation(message_id)));
create policy "reactions: members react"
  on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_post(private.message_conversation(message_id)));
create policy "reactions: remove own"
  on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- blocks
create policy "blocks: read own"
  on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "blocks: admins read"
  on public.blocks for select to authenticated
  using ((select private.is_admin()));
create policy "blocks: create own"
  on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "blocks: remove own"
  on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- reports
create policy "reports: read own"
  on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy "reports: admins read"
  on public.reports for select to authenticated
  using ((select private.is_admin()));
create policy "reports: members report"
  on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and private.is_member(conversation_id)
    and (message_id is null or private.message_conversation(message_id) = conversation_id)
  );
create policy "reports: admins handle"
  on public.reports for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ── Column privileges ──

revoke all on
  public.chat_invitations, public.conversations, public.conversation_members, public.messages,
  public.message_translations, public.reactions, public.blocks, public.reports
  from anon, authenticated;

grant select on
  public.chat_invitations, public.conversations, public.conversation_members, public.messages,
  public.message_translations, public.reactions, public.blocks, public.reports
  to authenticated;

grant insert (celebrity_id, message) on public.chat_invitations to authenticated;
grant update (status) on public.chat_invitations to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant insert (conversation_id, body, attachments) on public.messages to authenticated;
grant update (flagged, flag_reason, deleted_at) on public.messages to authenticated;
grant insert (message_id, emoji), delete on public.reactions to authenticated;
grant insert (blocked_id), delete on public.blocks to authenticated;
grant insert (conversation_id, message_id, reason) on public.reports to authenticated;
grant update (status, handled_by, handled_at, resolution) on public.reports to authenticated;

-- ── Admin decision on a chat invitation ──
-- Approving creates the 1:1 conversation and both memberships in one
-- transaction; the audit trigger on chat_invitations records the decision.

create function public.admin_decide_chat_invitation(
  p_invitation_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns uuid  -- the new conversation id when approved, else null
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.chat_invitations;
  v_celebrity_user uuid;
  v_conversation uuid;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_inv from public.chat_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'chat invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'chat invitation is %', v_inv.status using errcode = '22023';
  end if;

  if not p_approve then
    update public.chat_invitations
      set status = 'rejected', decided_by_admin = (select auth.uid()), decided_at = now(),
          reason = nullif(btrim(p_reason), '')
      where id = p_invitation_id;
    return null;
  end if;

  select user_id into v_celebrity_user from public.celebrity_profiles where id = v_inv.celebrity_id;
  if v_celebrity_user is null then
    raise exception 'celebrity has no linked login account' using errcode = '22023';
  end if;

  update public.chat_invitations
    set status = 'approved', decided_by_admin = (select auth.uid()), decided_at = now(),
        reason = nullif(btrim(p_reason), '')
    where id = p_invitation_id;

  insert into public.conversations (chat_invitation_id) values (p_invitation_id)
    returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation, v_inv.fan_id), (v_conversation, v_celebrity_user);

  return v_conversation;
end;
$$;

revoke all on function public.admin_decide_chat_invitation(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_chat_invitation(uuid, boolean, text) to authenticated;
