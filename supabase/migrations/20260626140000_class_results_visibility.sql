alter table public.classes
  add column if not exists results_visible_to_students boolean not null default false,
  add column if not exists teacher_can_toggle_results_visibility boolean not null default false;

create or replace function public.set_class_results_visibility(
  target_class_id uuid,
  visible_to_students boolean,
  teacher_can_toggle boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_is_admin boolean;
  target_class public.classes;
  next_teacher_can_toggle boolean;
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

  current_user_is_admin := public.has_org_role(
    target_class.organization_id,
    array['org_admin']::public.app_role[]
  );

  if not current_user_is_admin then
    if not target_class.teacher_can_toggle_results_visibility then
      raise exception 'Teachers are not allowed to change result visibility for this class';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_class.organization_id
        and class_memberships.class_id = target_class.id
        and class_memberships.user_id = current_user_id
        and class_memberships.role in ('teacher', 'ta')
    ) then
      raise exception 'Only class teachers can change result visibility';
    end if;

    if teacher_can_toggle is not null
      and teacher_can_toggle is distinct from target_class.teacher_can_toggle_results_visibility then
      raise exception 'Only organization admins can allow teachers to control result visibility';
    end if;
  end if;

  next_teacher_can_toggle := case
    when current_user_is_admin then coalesce(teacher_can_toggle, target_class.teacher_can_toggle_results_visibility)
    else target_class.teacher_can_toggle_results_visibility
  end;

  update public.classes
  set results_visible_to_students = visible_to_students,
      teacher_can_toggle_results_visibility = next_teacher_can_toggle,
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
    'class.results_visibility_updated',
    'class',
    target_class.id,
    jsonb_build_object(
      'results_visible_to_students', visible_to_students,
      'teacher_can_toggle_results_visibility', next_teacher_can_toggle
    )
  );

  return jsonb_build_object(
    'result', 'class_results_visibility',
    'class_id', target_class.id,
    'results_visible_to_students', visible_to_students,
    'teacher_can_toggle_results_visibility', next_teacher_can_toggle
  );
end;
$$;

revoke all on function public.set_class_results_visibility(uuid, boolean, boolean)
  from public, anon, authenticated;

grant execute on function public.set_class_results_visibility(uuid, boolean, boolean)
  to authenticated;
