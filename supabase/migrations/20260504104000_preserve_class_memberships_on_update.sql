create or replace function public.update_class(
  target_class_id uuid,
  class_name text,
  class_code text,
  class_subject text,
  teacher_email text,
  class_color text default 'indigo',
  class_description text default '',
  class_schedule_text text default null,
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

  if btrim(coalesce(class_subject, '')) = '' then
    raise exception 'Subject is required';
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
      subject = btrim(class_subject),
      color = coalesce(nullif(btrim(class_color), ''), 'indigo'),
      description = coalesce(class_description, ''),
      schedule_text = nullif(btrim(coalesce(class_schedule_text, '')), ''),
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
  text,
  text,
  text
) to authenticated;
