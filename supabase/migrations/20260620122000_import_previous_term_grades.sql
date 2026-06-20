alter table public.class_invites
  add column if not exists previous_grade_payload jsonb;

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
  importing_previous_grade boolean := current_setting('app.importing_previous_grade', true) = 'true';
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

  if not current_user_can_manage and not importing_previous_grade then
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
        token = excluded.token,
        status = 'invited',
        expires_at = excluded.expires_at,
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

create or replace function public.accept_organization_invite(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  target_invite public.organization_invites;
  membership_id uuid;
  pending_class_invite public.class_invites;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into current_profile
  from public.profiles
  where id = current_user_id;

  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  select *
    into target_invite
  from public.organization_invites
  where token = invite_token
    and status = 'invited'
  limit 1;

  if target_invite.id is null then
    raise exception 'Invite not found or already used';
  end if;

  if target_invite.expires_at is not null and target_invite.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  if lower(current_profile.email) <> lower(target_invite.email) then
    raise exception 'This invite is for a different email address';
  end if;

  membership_id := public.grant_organization_role(
    target_invite.organization_id,
    current_user_id,
    target_invite.role
  );

  for pending_class_invite in
    select *
    from public.class_invites
    where organization_id = target_invite.organization_id
      and lower(email) = lower(current_profile.email)
      and status = 'invited'
  loop
    perform public.ensure_org_member_for_class(
      pending_class_invite.organization_id,
      current_user_id,
      case
        when pending_class_invite.role = 'teacher' then 'teacher'::public.app_role
        else 'student'::public.app_role
      end
    );

    if pending_class_invite.role = 'teacher' then
      perform public.sync_class_teacher(pending_class_invite.class_id, current_user_id);
    else
      insert into public.class_memberships (
        organization_id,
        class_id,
        user_id,
        role
      )
      values (
        pending_class_invite.organization_id,
        pending_class_invite.class_id,
        current_user_id,
        'student'
      )
      on conflict (class_id, user_id) do update
        set role = 'student',
            updated_at = now();

      if pending_class_invite.previous_grade_payload is not null then
        perform public.apply_previous_term_grade(
          pending_class_invite.class_id,
          current_user_id,
          (pending_class_invite.previous_grade_payload ->> 'grade')::numeric,
          (pending_class_invite.previous_grade_payload ->> 'recorded_by_user_id')::uuid
        );
      end if;
    end if;

    update public.class_invites
    set status = 'active',
        updated_at = now()
    where id = pending_class_invite.id;
  end loop;

  update public.organization_invites
  set status = 'active',
      updated_at = now()
  where id = target_invite.id;

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, target_invite.organization_id),
      updated_at = now()
  where id = current_user_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_invite.organization_id,
    current_user_id,
    'organization.invite_accepted',
    'organization_membership',
    membership_id,
    jsonb_build_object('email', current_profile.email, 'role', target_invite.role)
  );

  return jsonb_build_object(
    'result', 'accepted',
    'organization_id', target_invite.organization_id,
    'membership_id', membership_id,
    'role', target_invite.role
  );
end;
$$;
