create or replace function public.can_manage_class(
  target_org_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(target_org_id, array['org_admin']::public.app_role[])
    or exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = auth.uid()
        and class_memberships.role in ('teacher', 'ta')
    );
$$;

create or replace function public.update_organization_settings(
  target_org_id uuid,
  target_public_features_enabled boolean,
  target_all_teachers_can_create_classes boolean,
  target_all_teachers_can_manage_own_classes boolean,
  target_teacher_class_permissions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can update organization settings';
  end if;

  insert into public.organization_settings (
    organization_id,
    public_features_enabled,
    all_teachers_can_create_classes,
    all_teachers_can_manage_own_classes
  )
  values (
    target_org_id,
    target_public_features_enabled,
    target_all_teachers_can_create_classes,
    target_all_teachers_can_manage_own_classes
  )
  on conflict (organization_id) do update
    set public_features_enabled = excluded.public_features_enabled,
        all_teachers_can_create_classes = excluded.all_teachers_can_create_classes,
        all_teachers_can_manage_own_classes = excluded.all_teachers_can_manage_own_classes,
        updated_at = now();

  delete from public.organization_teacher_class_permissions
  where organization_id = target_org_id;

  insert into public.organization_teacher_class_permissions (
    organization_id,
    teacher_user_id,
    can_create_classes,
    can_manage_own_classes
  )
  select
    target_org_id,
    normalized.teacher_user_id,
    normalized.can_create_classes,
    normalized.can_manage_own_classes
  from (
    select
      raw_permissions.teacher_user_id,
      bool_or(coalesce(raw_permissions.can_create_classes, false)) as can_create_classes,
      bool_or(coalesce(raw_permissions.can_manage_own_classes, false)) as can_manage_own_classes
    from jsonb_to_recordset(coalesce(target_teacher_class_permissions, '[]'::jsonb))
      as raw_permissions(
        teacher_user_id uuid,
        can_create_classes boolean,
        can_manage_own_classes boolean
      )
    where raw_permissions.teacher_user_id is not null
    group by raw_permissions.teacher_user_id
  ) normalized
  where (normalized.can_create_classes or normalized.can_manage_own_classes)
    and public.user_has_org_role(
      target_org_id,
      normalized.teacher_user_id,
      array['teacher']::public.app_role[]
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
    'organization.settings_updated',
    'organization',
    target_org_id,
    jsonb_build_object(
      'public_features_enabled',
      target_public_features_enabled,
      'all_teachers_can_create_classes',
      target_all_teachers_can_create_classes,
      'all_teachers_can_manage_own_classes',
      target_all_teachers_can_manage_own_classes
    )
  );

  return jsonb_build_object(
    'result', 'organization_settings',
    'organization_id', target_org_id
  );
end;
$$;

revoke all on function public.update_organization_settings(
  uuid,
  boolean,
  boolean,
  boolean,
  jsonb
) from public, anon, authenticated;

grant execute on function public.update_organization_settings(
  uuid,
  boolean,
  boolean,
  boolean,
  jsonb
) to authenticated;
