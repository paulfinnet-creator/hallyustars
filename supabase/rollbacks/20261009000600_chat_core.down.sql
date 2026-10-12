drop function if exists public.my_conversations();
alter publication supabase_realtime add table public.reactions;
drop function if exists public.post_chat_image(uuid, text, int, int);
drop function if exists public.mark_conversation_read(uuid);

create policy "conversation_members: mark own as read"
  on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant update (last_read_at) on public.conversation_members to authenticated;
grant insert (attachments) on public.messages to authenticated;
