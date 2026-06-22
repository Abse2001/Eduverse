create or replace function public.remove_class_teacher(
  target_class_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
  removed_teacher_user_id uuid;
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

  if not public.has_org_role(target_class.organization_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can remove class teachers';
  end if;

  removed_teacher_user_id := target_class.teacher_user_id;

  update public.classes
  set teacher_user_id = null,
      updated_at = now()
  where id = target_class.id;

  if removed_teacher_user_id is not null then
    delete from public.class_memberships
    where organization_id = target_class.organization_id
      and class_id = target_class.id
      and user_id = removed_teacher_user_id
      and role = 'teacher';
  end if;

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
    'class.teacher_removed',
    'class',
    target_class.id,
    jsonb_build_object('teacher_user_id', removed_teacher_user_id)
  );

  return jsonb_build_object(
    'result', 'teacher_removed',
    'class_id', target_class.id,
    'teacher_user_id', removed_teacher_user_id
  );
end;
$$;

revoke all on function public.remove_class_teacher(uuid)
  from public, anon, authenticated;

grant execute on function public.remove_class_teacher(uuid)
  to authenticated;
