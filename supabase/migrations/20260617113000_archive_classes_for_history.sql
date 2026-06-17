create or replace function public.archive_class(target_class_id uuid)
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

  if not public.can_manage_class(target_class.organization_id, target_class.id) then
    raise exception 'Only organization admins or the class teacher can archive this class';
  end if;

  update public.classes
  set is_archived = true
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
    'class.archived',
    'class',
    target_class.id,
    jsonb_build_object(
      'code',
      target_class.code,
      'name',
      target_class.name,
      'term',
      target_class.semester
    )
  );

  return jsonb_build_object('result', 'archived', 'class_id', target_class.id);
end;
$$;

revoke all on function public.archive_class(uuid)
  from public, anon, authenticated;

grant execute on function public.archive_class(uuid)
  to authenticated;
