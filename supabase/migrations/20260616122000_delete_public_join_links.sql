create or replace function public.delete_organization_join_link(
  target_org_id uuid,
  target_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_link public.organization_join_links;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can delete public join links';
  end if;

  select *
    into target_link
  from public.organization_join_links
  where id = target_link_id
    and organization_id = target_org_id
  limit 1;

  if target_link.id is null then
    raise exception 'Public join link not found';
  end if;

  delete from public.organization_join_links
  where id = target_link.id;

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
    'organization.join_link_deleted',
    'organization_join_link',
    target_link.id,
    jsonb_build_object(
      'purpose', target_link.purpose,
      'default_role', target_link.default_role,
      'approval_required', target_link.approval_required,
      'enabled', target_link.enabled
    )
  );

  return jsonb_build_object(
    'result', 'deleted',
    'join_link_id', target_link.id,
    'organization_id', target_org_id
  );
end;
$$;

revoke all on function public.delete_organization_join_link(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.delete_organization_join_link(uuid, uuid)
  to authenticated;
