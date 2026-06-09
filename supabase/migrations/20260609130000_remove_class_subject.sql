drop function if exists public.create_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

drop function if exists public.update_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
);

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

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']) then
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
    raise exception 'Teacher must sign up before being assigned to a class';
  end if;

  perform public.ensure_org_member_for_class(target_org_id, target_teacher.id, 'teacher');

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
      raise exception 'Teacher must sign up before being assigned to a class';
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

alter table public.classes
  drop column if exists subject;
