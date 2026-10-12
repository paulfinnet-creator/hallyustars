drop policy if exists "conversation channel: members send" on realtime.messages;
drop policy if exists "conversation channel: members receive" on realtime.messages;
drop function if exists private.topic_conversation_id(text);
alter publication supabase_realtime drop table
  public.messages, public.reactions, public.conversation_members;
