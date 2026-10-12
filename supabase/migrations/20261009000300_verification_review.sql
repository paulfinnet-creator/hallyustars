-- Admin review of fan verifications (profile photo vs ID).
-- Called with the admin's own session, so the audit triggers on
-- verifications, users and invites record every change with the admin's id.

-- Approve or reject a pending verification.
-- Registration: the account and its invite become approved or rejected.
-- Profile-photo change: only the photo changes (on approval).
-- On approval p_avatar_url is the public URL of the photo, which our server
-- copies to the avatars bucket just before calling this.
create function public.admin_decide_verification(
  p_verification_id uuid,
  p_approve boolean,
  p_reason text default null,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.verifications;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_admin();

  select * into v from public.verifications where id = p_verification_id for update;
  if not found then
    raise exception 'verification not found' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'verification is %', v.status using errcode = '22023';
  end if;
  if not p_approve and v_reason is null then
    raise exception 'a reason is required to reject' using errcode = '22023';
  end if;
  if p_approve and nullif(btrim(coalesce(p_avatar_url, '')), '') is null then
    raise exception 'approval needs the published photo' using errcode = '22023';
  end if;

  update public.verifications
    set status = case when p_approve then 'approved' else 'rejected' end::public.verification_status,
        reviewed_by = (select auth.uid()),
        reason = v_reason,
        decided_at = now()
    where id = v.id;

  if v.kind = 'registration' then
    update public.users
      set status = case when p_approve then 'approved' else 'rejected' end::public.user_status,
          avatar_url = case when p_approve then p_avatar_url else avatar_url end
      where id = v.user_id and status = 'pending_review';
    if not found then
      raise exception 'account is not awaiting review' using errcode = '22023';
    end if;
    update public.invites
      set status = case when p_approve then 'approved' else 'rejected' end::public.invite_status
      where user_id = v.user_id;
  elsif p_approve then
    update public.users set avatar_url = p_avatar_url where id = v.user_id;
  end if;
end;
$$;

-- Record that an admin opened an ID document (CLAUDE.md: log each view).
create function public.admin_log_id_view(p_verification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (
    select 1 from public.verifications
    where id = p_verification_id and id_document_path is not null and id_deleted_at is null
  ) then
    raise exception 'no ID document for this verification' using errcode = 'P0002';
  end if;
  perform private.write_audit('verification.id_viewed', 'verifications', p_verification_id::text);
end;
$$;

revoke all on function
  public.admin_decide_verification(uuid, boolean, text, text),
  public.admin_log_id_view(uuid)
  from public, anon;
grant execute on function
  public.admin_decide_verification(uuid, boolean, text, text),
  public.admin_log_id_view(uuid)
  to authenticated;
