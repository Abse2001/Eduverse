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
  existing_org_invite public.organization_invites;
  active_student_membership_id uuid;
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

  if target_profile.id is not null then
    select organization_memberships.id
      into active_student_membership_id
    from public.organization_memberships
    join public.organization_membership_roles
      on organization_membership_roles.organization_membership_id = organization_memberships.id
    where organization_memberships.organization_id = target_org_id
      and organization_memberships.user_id = target_profile.id
      and organization_memberships.status = 'active'
      and organization_membership_roles.role = 'student'
      and organization_membership_roles.status = 'active'
    limit 1;
  end if;

  if active_student_membership_id is not null then
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

  if target_profile.id is not null then
    raise exception 'Previous term grades can only be attached to active students';
  end if;

  select *
    into existing_org_invite
  from public.organization_invites
  where organization_id = target_org_id
    and lower(email) = normalized_email
    and status = 'invited'
  limit 1;

  if existing_org_invite.id is not null and existing_org_invite.role <> 'student' then
    raise exception 'Previous term grades can only be attached to pending student invites';
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
    set role = case
          when public.organization_invites.role = 'student' then 'student'::public.app_role
          else public.organization_invites.role
        end,
        invited_by_user_id = case
          when public.organization_invites.role = 'student' then excluded.invited_by_user_id
          else public.organization_invites.invited_by_user_id
        end,
        status = case
          when public.organization_invites.role = 'student' then 'invited'
          else public.organization_invites.status
        end,
        expires_at = case
          when public.organization_invites.role = 'student' then greatest(
            coalesce(public.organization_invites.expires_at, excluded.expires_at),
            excluded.expires_at
          )
          else public.organization_invites.expires_at
        end,
        updated_at = case
          when public.organization_invites.role = 'student' then now()
          else public.organization_invites.updated_at
        end
    where public.organization_invites.role = 'student'
  returning id into org_invite_id;

  if org_invite_id is null then
    raise exception 'Previous term grades can only be attached to pending student invites';
  end if;

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

create or replace function public.register_member_with_invites(
  target_org_id uuid,
  invited_email text,
  invited_role public.app_role,
  target_class_id uuid default null,
  invited_class_role public.class_membership_role default null,
  previous_terms jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  effective_class_role public.class_membership_role;
  existing_org_invite public.organization_invites;
  organization_result jsonb;
  result_data jsonb;
  previous_term record;
begin
  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can register members';
  end if;

  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  if invited_role not in ('org_admin', 'teacher', 'student') then
    raise exception 'Only org_admin, teacher, or student can be invited';
  end if;

  if jsonb_typeof(coalesce(previous_terms, '[]'::jsonb)) <> 'array' then
    raise exception 'Previous terms must be an array';
  end if;

  select *
    into existing_org_invite
  from public.organization_invites
  where organization_id = target_org_id
    and lower(email) = normalized_email
    and status = 'invited'
  limit 1;

  if existing_org_invite.id is not null and existing_org_invite.role <> invited_role then
    raise exception 'A pending invite already exists for this email with a different role';
  end if;

  if target_class_id is not null then
    if invited_role = 'org_admin' then
      raise exception 'Admins can be saved without a class assignment';
    end if;

    effective_class_role := coalesce(
      invited_class_role,
      case
        when invited_role = 'teacher' then 'teacher'::public.class_membership_role
        else 'student'::public.class_membership_role
      end
    );

    if effective_class_role::text <> invited_role::text then
      raise exception 'Class role must match organization invite role';
    end if;
  end if;

  if jsonb_array_length(coalesce(previous_terms, '[]'::jsonb)) > 0
    and invited_role <> 'student' then
    raise exception 'Previous terms can only be attached to students';
  end if;

  organization_result := public.invite_organization_member(
    target_org_id,
    normalized_email,
    invited_role
  );
  result_data := organization_result;

  if target_class_id is not null then
    perform public.create_pending_class_invite(
      target_class_id,
      normalized_email,
      effective_class_role,
      (organization_result ->> 'invite_id')::uuid
    );
  end if;

  for previous_term in
    select *
    from jsonb_to_recordset(coalesce(previous_terms, '[]'::jsonb)) as term_record(
      source_class_id uuid,
      term_label text,
      previous_class_name text,
      grade_value numeric
    )
  loop
    result_data := public.register_previous_term_grade(
      target_org_id,
      normalized_email,
      previous_term.term_label,
      previous_term.previous_class_name,
      previous_term.grade_value,
      previous_term.source_class_id
    );
  end loop;

  return result_data;
end;
$$;

revoke all on function public.register_previous_term_grade(uuid, text, text, text, numeric, uuid)
  from public, anon, authenticated;

revoke all on function public.register_member_with_invites(
  uuid,
  text,
  public.app_role,
  uuid,
  public.class_membership_role,
  jsonb
) from public, anon, authenticated;

grant execute on function public.register_previous_term_grade(uuid, text, text, text, numeric, uuid)
  to authenticated;

grant execute on function public.register_member_with_invites(
  uuid,
  text,
  public.app_role,
  uuid,
  public.class_membership_role,
  jsonb
) to authenticated;
