drop function if exists public.claim_auto_reply(text);
drop table if exists public.auto_reply_log;
drop function if exists public.unsubscribe_chat_emails(uuid);

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = (select auth.uid());
$$;

drop function if exists public.chat_email_check(uuid, uuid, uuid, interval);
drop function if exists public.chat_email_enqueue(uuid, uuid, int);
drop table if exists public.chat_email_queue;
