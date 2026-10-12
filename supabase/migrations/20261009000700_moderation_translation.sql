-- Chat part 2: admin moderation and message translations.

-- ── Sending text ──
-- The only way members send text. Returns {"message": {...}}.
create function public.send_message(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.messages;
begin
  if not private.can_post(p_conversation_id) then
    raise exception 'cannot post' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 4000 then
    raise exception 'invalid message length' using errcode = '23514';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, (select auth.uid()), v_body)
  returning * into v_message;
  return jsonb_build_object('message', to_jsonb(v_message));
end;
$$;

revoke all on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- Members can no longer insert messages directly (send_message and
-- post_chat_image are the only ways in).
revoke insert (conversation_id, body) on public.messages from authenticated;
drop policy "messages: members send" on public.messages;

-- Admins see images of conversations under review, like the messages.
create policy "chat-images: admins read conversations under review"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and (select private.is_admin())
    and private.conversation_under_review(nullif((storage.foldername(name))[1], '')::uuid)
  );

-- ── Admin moderation actions (each writes audit_logs in the same transaction) ──

-- Opening a conversation under review is logged before anything is shown.
create function public.admin_log_conversation_view(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not private.conversation_under_review(p_conversation_id) then
    raise exception 'conversation is not under review' using errcode = '42501';
  end if;
  perform private.write_audit('conversations.viewed', 'conversations', p_conversation_id::text, '{}'::jsonb);
end;
$$;

create function public.admin_handle_report(p_report_id uuid, p_status public.report_status, p_resolution text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_status = 'open' then
    raise exception 'choose resolved or dismissed' using errcode = '22023';
  end if;
  -- The audit trigger on reports records this change and the admin.
  update public.reports
    set status = p_status, handled_by = (select auth.uid()), handled_at = now(),
        resolution = nullif(btrim(p_resolution), '')
    where id = p_report_id and status = 'open';
  if not found then
    raise exception 'report not found or already handled' using errcode = '22023';
  end if;
end;
$$;

create function public.admin_remove_message(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid;
begin
  perform private.require_admin();
  select conversation_id into v_conversation from public.messages where id = p_message_id;
  if v_conversation is null or not private.conversation_under_review(v_conversation) then
    raise exception 'message not found in a conversation under review' using errcode = '22023';
  end if;
  -- The audit trigger on messages records this (with the body redacted).
  update public.messages
    set deleted_at = now(), flagged = true, flag_reason = nullif(btrim(p_reason), '')
    where id = p_message_id and deleted_at is null;
end;
$$;

create function public.admin_close_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.write_audit('conversations.closed', 'conversations', p_conversation_id::text, '{}'::jsonb);
  update public.conversations set closed_at = now() where id = p_conversation_id and closed_at is null;
  if not found then
    raise exception 'conversation not found or already closed' using errcode = '22023';
  end if;
end;
$$;

-- Suspend (or restore) a fan or celebrity. Admin accounts are managed elsewhere.
create function public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  -- The audit trigger on users records this change and the admin.
  update public.users
    set status = case when p_suspended then 'suspended' else 'approved' end::public.user_status
    where id = p_user_id
      and role in ('fan', 'celebrity')
      and status = case when p_suspended then 'approved' else 'suspended' end::public.user_status;
  if not found then
    raise exception 'user not found or not in that state' using errcode = '22023';
  end if;
end;
$$;

revoke all on function
  public.admin_log_conversation_view(uuid), public.admin_handle_report(uuid, public.report_status, text),
  public.admin_remove_message(uuid, text), public.admin_close_conversation(uuid),
  public.admin_set_user_suspended(uuid, boolean)
  from public, anon;
grant execute on function
  public.admin_log_conversation_view(uuid), public.admin_handle_report(uuid, public.report_status, text),
  public.admin_remove_message(uuid, text), public.admin_close_conversation(uuid),
  public.admin_set_user_suspended(uuid, boolean)
  to authenticated;

-- One open report per person per conversation and message.
create unique index reports_one_open
  on public.reports (reporter_id, conversation_id, coalesce(message_id, '00000000-0000-0000-0000-000000000000'))
  where status = 'open';

-- ── Translations ──
-- Written by the server (service role) only; detected_locale is DeepL's guess
-- of the original language, so a message already in the reader's language
-- shows no "View original".
alter table public.message_translations add column detected_locale text;
