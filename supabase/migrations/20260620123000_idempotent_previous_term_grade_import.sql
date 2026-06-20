create or replace function public.apply_previous_term_grade(
  target_class_id uuid,
  target_student_user_id uuid,
  target_grade numeric,
  recorded_by_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class public.classes;
  assignment_id uuid;
  submission_id uuid;
begin
  if target_grade < 0 or target_grade > 100 then
    raise exception 'Previous term grade must be between 0 and 100';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if not found then
    raise exception 'Class not found';
  end if;

  select id
    into assignment_id
  from public.class_assignments
  where organization_id = target_class.organization_id
    and class_id = target_class.id
    and title = 'Imported previous term grade'
    and deleted_at is null
  order by created_at asc
  limit 1;

  if assignment_id is null then
    insert into public.class_assignments (
      organization_id,
      class_id,
      created_by_user_id,
      title,
      description,
      due_at,
      max_score,
      status,
      allow_late_submissions,
      allow_text_submission,
      allow_file_submission
    )
    values (
      target_class.organization_id,
      target_class.id,
      coalesce(recorded_by_user_id, target_student_user_id),
      'Imported previous term grade',
      'Grade imported during student registration.',
      now(),
      100,
      'published',
      true,
      true,
      false
    )
    returning id into assignment_id;
  end if;

  perform set_config('app.importing_previous_grade', 'true', true);

  insert into public.class_assignment_submissions (
    organization_id,
    class_id,
    assignment_id,
    student_user_id,
    text_response,
    submitted_at,
    is_late,
    score,
    feedback,
    graded_at,
    graded_by_user_id
  )
  values (
    target_class.organization_id,
    target_class.id,
    assignment_id,
    target_student_user_id,
    'Imported previous term grade.',
    now(),
    false,
    target_grade,
    'Imported during student registration.',
    now(),
    recorded_by_user_id
  )
  on conflict (assignment_id, student_user_id) do update
    set score = excluded.score,
        feedback = excluded.feedback,
        graded_at = excluded.graded_at,
        graded_by_user_id = excluded.graded_by_user_id,
        updated_at = now()
  returning id into submission_id;

  return submission_id;
end;
$$;

create or replace function public.register_previous_term_grade(
  target_org_id uuid,
  invited_email text,
  term_label text,
  previous_class_name text,
  grade_value numeric,
  source_class_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  normalized_term text := btrim(coalesce(term_label, ''));
  normalized_class_name text := btrim(coalesce(previous_class_name, ''));
  target_profile public.profiles;
  target_class public.classes;
  class_id uuid;
  invite_id uuid;
  org_invite_id uuid;
  submission_id uuid;
  candidate_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can register previous term grades';
  end if;

  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  if normalized_term = '' then
    raise exception 'Previous term is required';
  end if;

  if normalized_class_name = '' then
    raise exception 'Previous class name is required';
  end if;

  if grade_value < 0 or grade_value > 100 then
    raise exception 'Previous term grade must be between 0 and 100';
  end if;

  if source_class_id is not null then
    select *
      into target_class
    from public.classes
    where id = source_class_id
      and organization_id = target_org_id
      and is_archived = true;

    if not found then
      raise exception 'Archived class not found';
    end if;

    class_id := target_class.id;
  else
    loop
      candidate_code := 'TR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

      begin
        insert into public.classes (
          organization_id,
          name,
          code,
          teacher_user_id,
          color,
          description,
          room,
          semester,
          is_archived,
          organization_visible
        )
        values (
          target_org_id,
          normalized_class_name,
          candidate_code,
          current_user_id,
          'sky',
          'Custom previous term class imported during registration.',
          'Transfer',
          normalized_term,
          true,
          false
        )
        returning id into class_id;

        exit;
      exception
        when unique_violation then
          -- Retry with another generated class code.
      end;
    end loop;
  end if;

  select *
    into target_profile
  from public.profiles
  where lower(email) = normalized_email
  limit 1;

  if found then
    perform public.ensure_org_member_for_class(target_org_id, target_profile.id, 'student');

    insert into public.class_memberships (
      organization_id,
      class_id,
      user_id,
      role
    )
    values (
      target_org_id,
      class_id,
      target_profile.id,
      'student'
    )
    on conflict (class_id, user_id) do update
      set role = 'student',
          updated_at = now();

    submission_id := public.apply_previous_term_grade(
      class_id,
      target_profile.id,
      grade_value,
      current_user_id
    );

    return jsonb_build_object(
      'result', 'membership',
      'class_id', class_id,
      'submission_id', submission_id,
      'email', normalized_email,
      'role', 'student'
    );
  end if;

  insert into public.organization_invites (
    organization_id,
    email,
    role,
    invited_by_user_id,
    token,
    status,
    expires_at
  )
  values (
    target_org_id,
    normalized_email,
    'student',
    current_user_id,
    encode(extensions.gen_random_bytes(24), 'hex'),
    'invited',
    now() + interval '14 days'
  )
  on conflict (organization_id, email) do update
    set role = 'student',
        invited_by_user_id = excluded.invited_by_user_id,
        status = 'invited',
        expires_at = greatest(
          coalesce(public.organization_invites.expires_at, excluded.expires_at),
          excluded.expires_at
        ),
        updated_at = now()
  returning id into org_invite_id;

  insert into public.class_invites (
    organization_id,
    class_id,
    email,
    role,
    organization_invite_id,
    invited_by_user_id,
    status,
    previous_grade_payload
  )
  values (
    target_org_id,
    class_id,
    normalized_email,
    'student',
    org_invite_id,
    current_user_id,
    'invited',
    jsonb_build_object('grade', grade_value, 'recorded_by_user_id', current_user_id)
  )
  on conflict (class_id, email) do update
    set role = 'student',
        organization_invite_id = excluded.organization_invite_id,
        invited_by_user_id = excluded.invited_by_user_id,
        status = 'invited',
        previous_grade_payload = excluded.previous_grade_payload,
        updated_at = now()
  returning id into invite_id;

  return jsonb_build_object(
    'result', 'invite',
    'invite_id', org_invite_id,
    'class_invite_id', invite_id,
    'class_id', class_id,
    'email', normalized_email,
    'role', 'student'
  );
end;
$$;

revoke all on function public.apply_previous_term_grade(uuid, uuid, numeric, uuid)
  from public, anon, authenticated;

revoke all on function public.register_previous_term_grade(uuid, text, text, text, numeric, uuid)
  from public, anon, authenticated;

grant execute on function public.register_previous_term_grade(uuid, text, text, text, numeric, uuid)
  to authenticated;

do $$
begin
  perform set_config('app.importing_previous_grade', 'true', true);

  with imported_assignments as (
    select
      class_assignments.*,
      first_value(id) over (
        partition by organization_id, class_id
        order by created_at asc, id asc
      ) as keeper_assignment_id,
      row_number() over (
        partition by organization_id, class_id
        order by created_at asc, id asc
      ) as assignment_rank
    from public.class_assignments
    where title = 'Imported previous term grade'
      and deleted_at is null
  ),
  duplicate_submissions as (
    select distinct on (imported_assignments.keeper_assignment_id, submissions.student_user_id)
      submissions.organization_id,
      submissions.class_id,
      imported_assignments.keeper_assignment_id as assignment_id,
      submissions.student_user_id,
      submissions.text_response,
      submissions.submitted_at,
      submissions.is_late,
      submissions.score,
      submissions.feedback,
      submissions.graded_at,
      submissions.graded_by_user_id
    from imported_assignments
    join public.class_assignment_submissions submissions
      on submissions.assignment_id = imported_assignments.id
    where imported_assignments.assignment_rank > 1
    order by
      imported_assignments.keeper_assignment_id,
      submissions.student_user_id,
      submissions.graded_at desc nulls last,
      submissions.submitted_at desc,
      submissions.updated_at desc
  )
  insert into public.class_assignment_submissions (
    organization_id,
    class_id,
    assignment_id,
    student_user_id,
    text_response,
    submitted_at,
    is_late,
    score,
    feedback,
    graded_at,
    graded_by_user_id
  )
  select
    organization_id,
    class_id,
    assignment_id,
    student_user_id,
    coalesce(nullif(btrim(text_response), ''), 'Imported previous term grade.'),
    submitted_at,
    is_late,
    score,
    feedback,
    graded_at,
    graded_by_user_id
  from duplicate_submissions
  on conflict (assignment_id, student_user_id) do update
    set score = excluded.score,
        feedback = excluded.feedback,
        graded_at = excluded.graded_at,
        graded_by_user_id = excluded.graded_by_user_id,
        updated_at = now();

  with imported_assignments as (
    select
      id,
      row_number() over (
        partition by organization_id, class_id
        order by created_at asc, id asc
      ) as assignment_rank
    from public.class_assignments
    where title = 'Imported previous term grade'
      and deleted_at is null
  )
  update public.class_assignments
  set deleted_at = now(),
      updated_at = now()
  where id in (
    select id
    from imported_assignments
    where assignment_rank > 1
  );
end;
$$;
