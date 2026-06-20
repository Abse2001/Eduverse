create or replace function public.create_pending_class_invite(
  target_class_id uuid,
  invited_email text,
  invited_class_role public.class_membership_role,
  target_org_invite_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
  target_org_invite public.organization_invites;
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  invite_id uuid;
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
    raise exception 'Only organization admins or the class teacher can invite class members';
  end if;

  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  if invited_class_role not in ('teacher', 'student') then
    raise exception 'Only teacher or student can be invited to a class';
  end if;

  if target_org_invite_id is not null then
    select *
      into target_org_invite
    from public.organization_invites
    where id = target_org_invite_id
      and organization_id = target_class.organization_id
      and lower(email) = normalized_email
      and status = 'invited';

    if target_org_invite.id is null then
      raise exception 'Matching organization invite not found';
    end if;
  end if;

  insert into public.class_invites (
    organization_id,
    class_id,
    email,
    role,
    organization_invite_id,
    invited_by_user_id,
    status
  )
  values (
    target_class.organization_id,
    target_class.id,
    normalized_email,
    invited_class_role,
    target_org_invite_id,
    current_user_id,
    'invited'
  )
  on conflict (class_id, email) do update
    set role = excluded.role,
        organization_invite_id = coalesce(excluded.organization_invite_id, public.class_invites.organization_invite_id),
        invited_by_user_id = excluded.invited_by_user_id,
        status = 'invited',
        updated_at = now()
  returning id into invite_id;

  return jsonb_build_object(
    'result', 'invite',
    'class_invite_id', invite_id,
    'class_id', target_class.id,
    'email', normalized_email,
    'role', invited_class_role
  );
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
  existing_org_invite public.organization_invites;
  active_membership_id uuid;
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
    select id
      into active_membership_id
    from public.organization_memberships
    where organization_id = target_org_id
      and user_id = target_profile.id
      and status = 'active'
    limit 1;
  end if;

  if active_membership_id is not null then
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

revoke all on function public.create_pending_class_invite(
  uuid,
  text,
  public.class_membership_role,
  uuid
) from public, anon, authenticated;

revoke all on function public.register_previous_term_grade(uuid, text, text, text, numeric, uuid)
  from public, anon, authenticated;

grant execute on function public.create_pending_class_invite(
  uuid,
  text,
  public.class_membership_role,
  uuid
) to authenticated;

grant execute on function public.register_previous_term_grade(uuid, text, text, text, numeric, uuid)
  to authenticated;
