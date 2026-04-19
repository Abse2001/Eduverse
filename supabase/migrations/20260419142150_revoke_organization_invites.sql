create or replace function public.revoke_organization_invite(target_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_invite public.organization_invites;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_invite
  from public.organization_invites
  where id = target_invite_id
  limit 1;

  if target_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if target_invite.status <> 'invited' then
    raise exception 'Only pending invites can be revoked';
  end if;

  if not public.has_org_role(target_invite.organization_id, array['org_owner', 'org_admin']) then
    raise exception 'Only organization owners or admins can revoke invites';
  end if;

  update public.organization_invites
  set status = 'suspended',
      updated_at = now()
  where id = target_invite.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_invite.organization_id,
    current_user_id,
    'organization.invite_revoked',
    'organization_invite',
    target_invite.id,
    jsonb_build_object('email', target_invite.email, 'role', target_invite.role)
  );

  return jsonb_build_object(
    'result', 'revoked',
    'invite_id', target_invite.id,
    'email', target_invite.email,
    'role', target_invite.role
  );
end;
$$;
