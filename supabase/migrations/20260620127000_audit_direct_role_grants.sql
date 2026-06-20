create or replace function public.grant_existing_organization_member_role(
  target_org_id uuid,
  target_member_user_id uuid,
  target_role public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_membership public.organization_memberships;
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can grant roles';
  end if;

  if target_role not in ('org_admin', 'teacher', 'student') then
    raise exception 'Only org_admin, teacher, or student can be granted';
  end if;

  select *
    into target_membership
  from public.organization_memberships
  where organization_id = target_org_id
    and user_id = target_member_user_id
    and status = 'active'
  limit 1;

  if target_membership.id is null then
    raise exception 'User must be an active organization member before roles can be added';
  end if;

  membership_id := public.grant_organization_role(
    target_org_id,
    target_member_user_id,
    target_role
  );

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_org_id,
    current_user_id,
    'organization.role_granted',
    'organization_membership',
    membership_id,
    jsonb_build_object(
      'target_user_id', target_member_user_id,
      'role', target_role
    )
  );

  return jsonb_build_object(
    'result', 'membership',
    'membership_id', membership_id,
    'role', target_role
  );
end;
$$;

revoke all on function public.grant_existing_organization_member_role(
  uuid,
  uuid,
  public.app_role
) from public, anon, authenticated;

grant execute on function public.grant_existing_organization_member_role(
  uuid,
  uuid,
  public.app_role
) to authenticated;
