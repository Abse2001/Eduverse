create or replace function public.soft_delete_class_assignment(
  target_class_id uuid,
  target_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_assignment public.class_assignments;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_assignment
  from public.class_assignments
  where id = target_assignment_id
    and class_id = target_class_id
    and deleted_at is null;

  if target_assignment.id is null then
    raise exception 'Assignment not found';
  end if;

  if not public.can_manage_class(
    target_assignment.organization_id,
    target_assignment.class_id
  ) then
    raise exception 'Only class teachers and organization admins can delete assignments';
  end if;

  update public.class_assignments
  set deleted_at = now()
  where id = target_assignment.id;
end;
$$;

revoke all on function public.soft_delete_class_assignment(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.soft_delete_class_assignment(uuid, uuid)
  to authenticated;
