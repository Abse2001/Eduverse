create or replace function public.update_class(
  target_class_id uuid,
  class_name text,
  class_code text,
  teacher_email text,
  class_color text default 'indigo',
  class_description text default '',
  class_room text default null,
  class_semester text default 'Current term',
  class_stage text default 'General'
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
  normalized_teacher_email text := lower(btrim(coalesce(teacher_email, '')));
  normalized_code text := upper(btrim(coalesce(class_code, '')));
  normalized_semester text := btrim(coalesce(class_semester, ''));
  normalized_stage text := btrim(coalesce(class_stage, ''));
  target_teacher_id uuid;
  updated_timestamp timestamptz := now();
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
    if not public.can_teacher_manage_own_classes(
      target_class.organization_id,
      current_user_id
    ) then
      raise exception 'Only organization admins or permitted teachers can edit class settings';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_class.organization_id
        and class_memberships.class_id = target_class.id
        and class_memberships.user_id = current_user_id
        and class_memberships.role in ('teacher', 'ta')
    ) then
      raise exception 'Teachers can only edit their own classes';
    end if;

    if normalized_teacher_email <> ''
      and normalized_teacher_email <> (
        select lower(email)
        from public.profiles
        where id = current_user_id
      ) then
      raise exception 'Teachers cannot reassign class ownership';
    end if;
  end if;

  if btrim(coalesce(class_name, '')) = '' then
    raise exception 'Class name is required';
  end if;

  if normalized_code = '' then
    raise exception 'Class code is required';
  end if;

  if normalized_semester = '' then
    raise exception 'Class term is required';
  end if;

  if normalized_stage = '' then
    raise exception 'Class stage is required';
  end if;

  if current_user_is_admin and normalized_teacher_email <> '' then
    target_teacher_id := public.resolve_class_teacher_id(
      target_class.organization_id,
      normalized_teacher_email
    );
  end if;

  update public.classes
  set name = btrim(class_name),
      code = normalized_code,
      color = coalesce(nullif(btrim(class_color), ''), 'indigo'),
      description = coalesce(class_description, ''),
      room = nullif(btrim(coalesce(class_room, '')), ''),
      semester = normalized_semester,
      stage = normalized_stage,
      archived_edited_at = case
        when target_class.is_archived then updated_timestamp
        else classes.archived_edited_at
      end,
      archived_edited_by_user_id = case
        when target_class.is_archived then current_user_id
        else classes.archived_edited_by_user_id
      end,
      updated_at = updated_timestamp
  where id = target_class.id;

  if current_user_is_admin and normalized_teacher_email = '' then
    update public.classes
    set teacher_user_id = null,
        updated_at = updated_timestamp
    where id = target_class.id;

    delete from public.class_memberships
    where organization_id = target_class.organization_id
      and class_id = target_class.id
      and role = 'teacher';
  elsif current_user_is_admin
    and target_teacher_id is not null
    and target_teacher_id is distinct from target_class.teacher_user_id then
    perform public.sync_class_teacher(target_class.id, target_teacher_id);
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
    case when target_class.is_archived then 'class.archived_updated' else 'class.updated' end,
    'class',
    target_class.id,
    jsonb_build_object(
      'code',
      normalized_code,
      'teacher_email',
      nullif(normalized_teacher_email, ''),
      'teacher_removed',
      current_user_is_admin and normalized_teacher_email = '',
      'term',
      normalized_semester,
      'stage',
      normalized_stage,
      'was_archived',
      target_class.is_archived
    )
  );

  return jsonb_build_object('result', 'class', 'class_id', target_class.id);
end;
$$;

revoke all on function public.update_class(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.update_class(uuid, text, text, text, text, text, text, text, text)
  to authenticated;
