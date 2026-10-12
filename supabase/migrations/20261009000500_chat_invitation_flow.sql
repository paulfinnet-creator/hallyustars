-- Sending and deciding chat invitations.
--
-- Invitations expire lazily: nothing flips them at expires_at. Readers treat a
-- pending row past expires_at as expired; sending a new invitation to the
-- same celebrity marks the stale one, so the one-pending index lets it in.

-- A fan invites a celebrity. Errors (SQLSTATE / message):
--   42501                 not allowed (not an approved fan, or the star isn't open)
--   P0001 already_connected  the fan already has an open chat with this star
--   23505                 an invitation is already waiting for review
create function public.send_chat_invitation(p_celebrity_id uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fan uuid := (select auth.uid());
  v_id uuid;
begin
  if v_fan is null or not private.can_invite(p_celebrity_id) then
    raise exception 'cannot invite' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.chat_invitations ci
    join public.conversations c on c.chat_invitation_id = ci.id
    where ci.fan_id = v_fan and ci.celebrity_id = p_celebrity_id and c.closed_at is null
  ) then
    raise exception 'already_connected';
  end if;

  update public.chat_invitations
    set status = 'expired'
    where fan_id = v_fan and celebrity_id = p_celebrity_id
      and status = 'pending' and expires_at <= now();

  insert into public.chat_invitations (fan_id, celebrity_id, message)
  values (v_fan, p_celebrity_id, btrim(p_message))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.send_chat_invitation(uuid, text) from public, anon;
grant execute on function public.send_chat_invitation(uuid, text) to authenticated;

-- Same as before, plus: an expired invitation can't be decided (22023
-- 'chat invitation is expired'), and MFA is enforced via require_admin.
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
  perform private.require_admin();

  select * into v_inv from public.chat_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'chat invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status = 'pending' and v_inv.expires_at <= now() then
    raise exception 'chat invitation is expired' using errcode = '22023';
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

-- Rejection reasons are shown to the fan; keep them short.
alter table public.chat_invitations
  add constraint chat_invitations_reason_length check (reason is null or char_length(reason) <= 500);
