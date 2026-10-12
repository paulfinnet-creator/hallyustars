-- Core chat: image messages, read receipts and the conversation list.

-- Attachments may only point at images our server has cleaned (see
-- post_chat_image), so members can no longer write that column directly.
revoke insert (attachments) on public.messages from authenticated;

-- Read receipts use the server clock, never a time the browser sends.
revoke update (last_read_at) on public.conversation_members from authenticated;
drop policy "conversation_members: mark own as read" on public.conversation_members;

create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = (select auth.uid());
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Post an image the server has already cleaned and stored as
-- chat-images/<conversation_id>/<uuid>.jpg. Raw uploads use other names, so
-- they can never be attached.
create function public.post_chat_image(p_conversation_id uuid, p_path text, p_width int, p_height int)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages;
begin
  if not private.can_post(p_conversation_id) then
    raise exception 'cannot post' using errcode = '42501';
  end if;
  if p_path !~ ('^' || p_conversation_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
     or not exists (select 1 from storage.objects where bucket_id = 'chat-images' and name = p_path)
     or exists (select 1 from public.messages where attachments @> jsonb_build_array(jsonb_build_object('path', p_path)))
  then
    raise exception 'invalid image' using errcode = '22023';
  end if;
  if p_width not between 1 and 4000 or p_height not between 1 and 4000 then
    raise exception 'invalid image size' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, sender_id, attachments)
  values (p_conversation_id, (select auth.uid()),
          jsonb_build_array(jsonb_build_object('type', 'image', 'path', p_path, 'width', p_width, 'height', p_height)))
  returning * into v_message;
  return v_message;
end;
$$;

revoke all on function public.post_chat_image(uuid, text, int, int) from public, anon;
grant execute on function public.post_chat_image(uuid, text, int, int) to authenticated;

-- Realtime sends DELETE events without checking RLS. Reactions are shared
-- over the conversation's private channel instead, so they leave the feed.
alter publication supabase_realtime drop table public.reactions;

-- The signed-in member's conversations: the other person's public profile
-- (never an email), the latest message and the unread count. Runs with the
-- caller's rights, so RLS limits it to their own conversations.
create function public.my_conversations()
returns table (
  conversation_id uuid,
  created_at timestamptz,
  closed_at timestamptz,
  other_id uuid,
  other_name text,
  other_avatar text,
  other_verified boolean,
  other_timezone text,
  last_body text,
  last_has_image boolean,
  last_sender uuid,
  last_at timestamptz,
  unread bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id, c.created_at, c.closed_at,
    other.id, other.display_name, other.avatar_url, other.is_verified, other.timezone,
    case when last.deleted_at is null then last.body end,
    coalesce(jsonb_array_length(last.attachments) > 0, false),
    last.sender_id, last.created_at,
    (select count(*) from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> (select auth.uid())
        and m.created_at > coalesce(me.last_read_at, '-infinity'))
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_members them on them.conversation_id = c.id and them.user_id <> me.user_id
  join public.user_public other on other.id = them.user_id
  left join lateral (
    select m.body, m.attachments, m.sender_id, m.created_at, m.deleted_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last on true
  where me.user_id = (select auth.uid())
  order by coalesce(last.created_at, c.created_at) desc;
$$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;
