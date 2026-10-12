alter table public.message_translations drop column if exists detected_locale;
drop index if exists public.reports_one_open;

drop function if exists public.admin_set_user_suspended(uuid, boolean);
drop function if exists public.admin_close_conversation(uuid);
drop function if exists public.admin_remove_message(uuid, text);
drop function if exists public.admin_handle_report(uuid, public.report_status, text);
drop function if exists public.admin_log_conversation_view(uuid);
drop policy if exists "chat-images: admins read conversations under review" on storage.objects;

create policy "messages: members send"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_post(conversation_id));
grant insert (conversation_id, body) on public.messages to authenticated;

drop function if exists public.send_message(uuid, text);
