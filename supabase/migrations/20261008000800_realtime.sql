-- Realtime: database changes for chat (RLS applies to every change event) and
-- private broadcast/presence channels for typing indicators and online status.

alter publication supabase_realtime add table
  public.messages, public.reactions, public.conversation_members;

-- Topic format: 'conversation:<uuid>'. Returns null for anything else.
create function private.topic_conversation_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_topic ~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return substr(p_topic, 14)::uuid;
  end if;
  return null;
end;
$$;

grant execute on function private.topic_conversation_id(text) to authenticated;

-- Only the two members of a conversation can join its private channel.
create policy "conversation channel: members receive"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.is_member(private.topic_conversation_id((select realtime.topic())))
  );

create policy "conversation channel: members send"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.can_post(private.topic_conversation_id((select realtime.topic())))
  );
