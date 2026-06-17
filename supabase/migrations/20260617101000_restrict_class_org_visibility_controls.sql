create or replace function public.set_class_organization_visibility(
  target_class_id uuid,
  visible_to_organization boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if not public.has_org_role(target_class.organization_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can change class visibility';
  end if;

  update public.classes
  set organization_visible = visible_to_organization,
      updated_at = now()
  where id = target_class.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_class.organization_id,
    current_user_id,
    'class.organization_visibility_updated',
    'class',
    target_class.id,
    jsonb_build_object('organization_visible', visible_to_organization)
  );

  return jsonb_build_object(
    'result', 'class_visibility',
    'class_id', target_class.id,
    'organization_visible', visible_to_organization
  );
end;
$$;

create or replace function public.set_class_hidden(
  target_class_id uuid,
  hidden_from_user boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if not target_class.organization_visible then
    raise exception 'Only organization-visible classes can be hidden';
  end if;

  if not public.has_org_role(target_class.organization_id, array['student']::public.app_role[]) then
    raise exception 'Only students can hide organization-visible classes';
  end if;

  if hidden_from_user then
    insert into public.class_visibility_preferences (
      organization_id,
      class_id,
      user_id,
      hidden,
      hidden_at
    )
    values (
      target_class.organization_id,
      target_class.id,
      current_user_id,
      true,
      now()
    )
    on conflict (class_id, user_id) do update
      set hidden = true,
          hidden_at = now(),
          updated_at = now();
  else
    delete from public.class_visibility_preferences
    where class_id = target_class.id
      and user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'result', case when hidden_from_user then 'hidden' else 'shown' end,
    'class_id', target_class.id,
    'organization_id', target_class.organization_id
  );
end;
$$;

revoke all on function public.set_class_organization_visibility(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.set_class_hidden(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.set_class_organization_visibility(uuid, boolean)
  to authenticated;
grant execute on function public.set_class_hidden(uuid, boolean)
  to authenticated;
