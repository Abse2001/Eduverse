create or replace function public.validate_class_assignment_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_assignment public.class_assignments;
  current_user_id uuid := auth.uid();
  current_user_can_manage boolean := false;
  effective_submitted_at timestamptz := now();
begin
  select *
  into target_assignment
  from public.class_assignments
  where id = new.assignment_id;

  if target_assignment.id is null then
    raise exception 'Assignment % does not exist', new.assignment_id;
  end if;

  if new.organization_id <> target_assignment.organization_id
    or new.class_id <> target_assignment.class_id then
    raise exception 'Assignment submission class mismatch';
  end if;

  current_user_can_manage := public.can_manage_class(
    target_assignment.organization_id,
    target_assignment.class_id
  );

  if not current_user_can_manage then
    if current_user_id is null or new.student_user_id <> current_user_id then
      raise exception 'Students can only update their own submissions';
    end if;

    if target_assignment.status <> 'published' then
      raise exception 'Assignment is not published';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_assignment.organization_id
        and class_memberships.class_id = target_assignment.class_id
        and class_memberships.user_id = current_user_id
        and class_memberships.role = 'student'
    ) then
      raise exception 'Student must belong to the assignment class';
    end if;

    if new.text_response is not null
      and btrim(new.text_response) <> ''
      and not target_assignment.allow_text_submission then
      raise exception 'Assignment does not accept text submissions';
    end if;

    if new.file_storage_key is not null
      and not target_assignment.allow_file_submission then
      raise exception 'Assignment does not accept file submissions';
    end if;

    if coalesce(btrim(new.text_response), '') = ''
      and new.file_storage_key is null then
      raise exception 'Submission must include text or a file';
    end if;

    if effective_submitted_at > target_assignment.due_at
      and not target_assignment.allow_late_submissions then
      raise exception 'Assignment no longer accepts submissions';
    end if;

    new.submitted_at := effective_submitted_at;
    new.is_late := effective_submitted_at > target_assignment.due_at;
    new.score := null;
    new.feedback := '';
    new.graded_at := null;
    new.graded_by_user_id := null;
  end if;

  if new.score is not null and new.score > target_assignment.max_score then
    raise exception 'Score cannot exceed assignment max score';
  end if;

  return new;
end;
$$;
