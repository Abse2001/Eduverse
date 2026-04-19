create or replace function public.accept_organization_invite(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  target_invite public.organization_invites;
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into current_profile
  from public.profiles
  where id = current_user_id;

  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  select *
    into target_invite
  from public.organization_invites
  where token = invite_token
    and status = 'invited'
  limit 1;

  if target_invite.id is null then
    raise exception 'Invite not found or already used';
  end if;

  if target_invite.expires_at is not null and target_invite.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  if lower(current_profile.email) <> lower(target_invite.email) then
    raise exception 'This invite is for a different email address';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    target_invite.organization_id,
    current_user_id,
    target_invite.role,
    'active'
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        updated_at = now()
  returning id into membership_id;

  update public.organization_invites
  set status = 'active',
      updated_at = now()
  where id = target_invite.id;

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, target_invite.organization_id),
      updated_at = now()
  where id = current_user_id;

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
    'organization.invite_accepted',
    'organization_membership',
    membership_id,
    jsonb_build_object('email', current_profile.email, 'role', target_invite.role)
  );

  return jsonb_build_object(
    'result', 'accepted',
    'organization_id', target_invite.organization_id,
    'membership_id', membership_id,
    'role', target_invite.role
  );
end;
$$;
