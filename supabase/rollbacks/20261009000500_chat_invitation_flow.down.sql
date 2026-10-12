alter table public.chat_invitations drop constraint if exists chat_invitations_reason_length;
drop function if exists public.send_chat_invitation(uuid, text);

-- The original decision function (20261008000600_chat.sql).
create or replace function public.admin_decide_chat_invitation(
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
