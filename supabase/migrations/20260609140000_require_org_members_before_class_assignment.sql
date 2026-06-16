create or replace function public.user_has_org_role(
  target_org_id uuid,
  target_user_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    join public.organization_membership_roles
      on organization_membership_roles.organization_membership_id = organization_memberships.id
    where organization_memberships.organization_id = target_org_id
      and organization_memberships.user_id = target_user_id
      and organization_memberships.status = 'active'
      and organization_membership_roles.status = 'active'
      and organization_membership_roles.role = any(allowed_roles)
  );
$$;

revoke all on function public.user_has_org_role(uuid, uuid, public.app_role[])
  from public, anon, authenticated;

create or replace function public.invite_organization_member(
  target_org_id uuid,
  invited_email text,
  invited_role public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  target_profile public.profiles;
  invite_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can invite members';
  end if;

  if normalized_email = '' then
    raise exception 'Invite email is required';
  end if;

  if invited_role not in ('org_admin', 'teacher', 'student') then
    raise exception 'Only org_admin, teacher, or student can be invited';
  end if;

  select *
    into target_profile
  from public.profiles
  where lower(email) = normalized_email
  limit 1;

  if target_profile.id is not null
    and public.user_has_org_role(
      target_org_id,
      target_profile.id,
      array[invited_role]::public.app_role[]
    ) then
    return jsonb_build_object(
      'result', 'membership',
      'email', normalized_email,
      'role', invited_role
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
    invited_role,
    current_user_id,
    encode(extensions.gen_random_bytes(24), 'hex'),
    'invited',
    now() + interval '14 days'
  )
  on conflict (organization_id, email) do update
    set role = excluded.role,
        invited_by_user_id = excluded.invited_by_user_id,
        token = excluded.token,
        status = 'invited',
        expires_at = excluded.expires_at,
        updated_at = now()
  returning id into invite_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_org_id,
    current_user_id,
    'organization.invite_upserted',
    'organization_invite',
    invite_id,
    jsonb_build_object('email', normalized_email, 'role', invited_role)
  );

  return jsonb_build_object(
    'result', 'invite',
    'invite_id', invite_id,
    'email', normalized_email,
    'role', invited_role
  );
end;
$$;

revoke all on function public.invite_organization_member(
  uuid,
  text,
  public.app_role
) from public, anon, authenticated;

grant execute on function public.invite_organization_member(
  uuid,
  text,
  public.app_role
) to authenticated;

create or replace function public.sync_class_teacher(
  target_class_id uuid,
  target_teacher_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class public.classes;
  membership_id uuid;
begin
  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if not public.user_has_org_role(
    target_class.organization_id,
    target_teacher_user_id,
    array['teacher']::public.app_role[]
  ) then
    raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
  end if;

  delete from public.class_memberships
  where class_id = target_class_id
    and role = 'teacher'
    and user_id <> target_teacher_user_id;

  insert into public.class_memberships (
    organization_id,
    class_id,
    user_id,
    role
  )
  values (
    target_class.organization_id,
    target_class_id,
    target_teacher_user_id,
    'teacher'
  )
  on conflict (class_id, user_id) do update
    set role = 'teacher',
        updated_at = now()
  returning id into membership_id;

  update public.classes
  set teacher_user_id = target_teacher_user_id,
      updated_at = now()
  where id = target_class_id;

  return membership_id;
end;
$$;

revoke all on function public.sync_class_teacher(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.create_class(
  target_org_id uuid,
  class_name text,
  class_code text,
  teacher_email text,
  class_color text default 'indigo',
  class_description text default '',
  class_room text default null,
  class_semester text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_teacher_email text := lower(btrim(coalesce(teacher_email, '')));
  normalized_code text := upper(btrim(coalesce(class_code, '')));
  target_teacher public.profiles;
  created_class_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can create classes';
  end if;

  if btrim(coalesce(class_name, '')) = '' then
    raise exception 'Class name is required';
  end if;

  if normalized_code = '' then
    raise exception 'Class code is required';
  end if;

  if normalized_teacher_email = '' then
    raise exception 'Teacher email is required';
  end if;

  select *
    into target_teacher
  from public.profiles
  where lower(email) = normalized_teacher_email
  limit 1;

  if target_teacher.id is null then
    raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
  end if;

  if not public.user_has_org_role(
    target_org_id,
    target_teacher.id,
    array['teacher']::public.app_role[]
  ) then
    raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
  end if;

  insert into public.classes (
    organization_id,
    name,
    code,
    teacher_user_id,
    color,
    description,
    room,
    semester
  )
  values (
    target_org_id,
    btrim(class_name),
    normalized_code,
    target_teacher.id,
    coalesce(nullif(btrim(class_color), ''), 'indigo'),
    coalesce(class_description, ''),
    nullif(btrim(coalesce(class_room, '')), ''),
    nullif(btrim(coalesce(class_semester, '')), '')
  )
  returning id into created_class_id;

  insert into public.class_feature_settings (
    organization_id,
    class_id,
    feature_key,
    enabled,
    config
  )
  select
    target_org_id,
    created_class_id,
    organization_feature_settings.feature_key,
    true,
    '{}'::jsonb
  from public.organization_feature_settings
  where organization_feature_settings.organization_id = target_org_id
    and public.is_organization_feature_enabled(
      target_org_id,
      organization_feature_settings.feature_key
    )
  on conflict on constraint class_feature_settings_pkey do nothing;

  perform public.sync_class_teacher(created_class_id, target_teacher.id);

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_org_id,
    current_user_id,
    'class.created',
    'class',
    created_class_id,
    jsonb_build_object('code', normalized_code, 'teacher_email', normalized_teacher_email)
  );

  return jsonb_build_object('result', 'class', 'class_id', created_class_id);
end;
$$;

revoke all on function public.create_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.update_class(
  target_class_id uuid,
  class_name text,
  class_code text,
  teacher_email text,
  class_color text default 'indigo',
  class_description text default '',
  class_room text default null,
  class_semester text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
  normalized_teacher_email text := lower(btrim(coalesce(teacher_email, '')));
  normalized_code text := upper(btrim(coalesce(class_code, '')));
  target_teacher public.profiles;
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
    raise exception 'Only organization admins or the class teacher can edit this class';
  end if;

  if btrim(coalesce(class_name, '')) = '' then
    raise exception 'Class name is required';
  end if;

  if normalized_code = '' then
    raise exception 'Class code is required';
  end if;

  if normalized_teacher_email <> '' then
    select *
      into target_teacher
    from public.profiles
    where lower(email) = normalized_teacher_email
    limit 1;

    if target_teacher.id is null then
      raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
    end if;

    if not public.user_has_org_role(
      target_class.organization_id,
      target_teacher.id,
      array['teacher']::public.app_role[]
    ) then
      raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
    end if;
  end if;

  update public.classes
  set name = btrim(class_name),
      code = normalized_code,
      color = coalesce(nullif(btrim(class_color), ''), 'indigo'),
      description = coalesce(class_description, ''),
      room = nullif(btrim(coalesce(class_room, '')), ''),
      semester = nullif(btrim(coalesce(class_semester, '')), ''),
      updated_at = now()
  where id = target_class.id;

  if target_teacher.id is not null
    and target_teacher.id is distinct from target_class.teacher_user_id then
    perform public.sync_class_teacher(target_class.id, target_teacher.id);
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
    'class.updated',
    'class',
    target_class.id,
    jsonb_build_object(
      'code',
      normalized_code,
      'teacher_email',
      nullif(normalized_teacher_email, '')
    )
  );

  return jsonb_build_object('result', 'class', 'class_id', target_class.id);
end;
$$;

revoke all on function public.update_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.update_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.invite_class_member(
  target_class_id uuid,
  invited_email text,
  invited_class_role public.class_membership_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  target_profile public.profiles;
  membership_id uuid;
  required_org_role public.app_role;
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
    raise exception 'Only organization admins or the class teacher can add class members';
  end if;

  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  if invited_class_role not in ('teacher', 'student') then
    raise exception 'Only teacher or student can be added to a class';
  end if;

  required_org_role := case
    when invited_class_role = 'teacher' then 'teacher'::public.app_role
    else 'student'::public.app_role
  end;

  select *
    into target_profile
  from public.profiles
  where lower(email) = normalized_email
  limit 1;

  if target_profile.id is null then
    raise exception 'User must accept an organization invite before being added to a class';
  end if;

  if not public.user_has_org_role(
    target_class.organization_id,
    target_profile.id,
    array[required_org_role]::public.app_role[]
  ) then
    raise exception 'User must accept the matching organization role before being added to a class';
  end if;

  if invited_class_role = 'teacher' then
    membership_id := public.sync_class_teacher(target_class.id, target_profile.id);
  else
    insert into public.class_memberships (
      organization_id,
      class_id,
      user_id,
      role
    )
    values (
      target_class.organization_id,
      target_class.id,
      target_profile.id,
      'student'
    )
    on conflict (class_id, user_id) do update
      set role = 'student',
          updated_at = now()
    returning id into membership_id;
  end if;

  update public.class_invites
  set status = 'active',
      updated_at = now()
  where class_id = target_class.id
    and email = normalized_email
    and status = 'invited';

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
    'class.member_upserted',
    'class_membership',
    membership_id,
    jsonb_build_object('class_id', target_class.id, 'email', normalized_email, 'role', invited_class_role)
  );

  return jsonb_build_object(
    'result', 'membership',
    'class_id', target_class.id,
    'membership_id', membership_id,
    'email', normalized_email,
    'role', invited_class_role
  );
end;
$$;

revoke all on function public.invite_class_member(
  uuid,
  text,
  public.class_membership_role
) from public, anon, authenticated;

grant execute on function public.invite_class_member(
  uuid,
  text,
  public.class_membership_role
) to authenticated;
