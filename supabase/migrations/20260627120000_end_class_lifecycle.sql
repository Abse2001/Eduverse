alter table public.classes
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists archived_edited_at timestamptz,
  add column if not exists archived_edited_by_user_id uuid references auth.users (id) on delete set null;

create index if not exists idx_classes_org_archived_term_stage
  on public.classes (organization_id, is_archived, semester, stage);

create or replace function public.end_class(target_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
  ended_timestamp timestamptz := now();
  ended_session_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id
  for update;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if target_class.is_archived then
    raise exception 'Class has already ended';
  end if;

  if not public.can_manage_class(target_class.organization_id, target_class.id) then
    raise exception 'Only organization admins or the class teacher can end this class';
  end if;

  update public.class_live_sessions
  set status = 'ended',
      ended_at = coalesce(ended_at, ended_timestamp),
      last_seen_at = ended_timestamp
  where class_id = target_class.id
    and ended_at is null
    and status in ('pending', 'live');

  get diagnostics ended_session_count = row_count;

  update public.classes
  set is_archived = true,
      ended_at = coalesce(classes.ended_at, ended_timestamp),
      ended_by_user_id = coalesce(classes.ended_by_user_id, current_user_id),
      updated_at = ended_timestamp
  where id = target_class.id;

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
    'class.ended',
    'class',
    target_class.id,
    jsonb_build_object(
      'code',
      target_class.code,
      'name',
      target_class.name,
      'term',
      target_class.semester,
      'stage',
      target_class.stage,
      'ended_live_sessions',
      ended_session_count
    )
  );

  return jsonb_build_object(
    'result', 'ended',
    'class_id', target_class.id,
    'ended_count', 1,
    'ended_live_sessions', ended_session_count
  );
end;
$$;

create or replace function public.archive_class(target_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.end_class(target_class_id);
end;
$$;

create or replace function public.end_classes(
  target_org_id uuid,
  target_scope text default 'all',
  target_term text default null,
  target_stage text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_scope text := lower(btrim(coalesce(target_scope, 'all')));
  normalized_term text := nullif(btrim(coalesce(target_term, '')), '');
  normalized_stage text := nullif(btrim(coalesce(target_stage, '')), '');
  ended_timestamp timestamptz := now();
  ended_class_ids uuid[];
  ended_class_count integer := 0;
  ended_session_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can end multiple classes';
  end if;

  if normalized_scope not in ('all', 'term', 'stage', 'term_stage') then
    raise exception 'End scope must be all, term, stage, or term_stage';
  end if;

  if normalized_scope in ('term', 'term_stage') and normalized_term is null then
    raise exception 'Term is required';
  end if;

  if normalized_scope in ('stage', 'term_stage') and normalized_stage is null then
    raise exception 'Stage is required';
  end if;

  with matching_classes as (
    select classes.id, classes.created_at
    from public.classes
    where classes.organization_id = target_org_id
      and classes.is_archived = false
      and (
        normalized_scope in ('all', 'stage')
        or classes.semester = normalized_term
      )
      and (
        normalized_scope in ('all', 'term')
        or classes.stage = normalized_stage
      )
    for update
  )
  select coalesce(array_agg(matching_classes.id order by matching_classes.created_at), array[]::uuid[])
    into ended_class_ids
  from matching_classes;

  ended_class_count := coalesce(array_length(ended_class_ids, 1), 0);

  if ended_class_count = 0 then
    raise exception 'No active classes matched this end action';
  end if;

  update public.class_live_sessions
  set status = 'ended',
      ended_at = coalesce(ended_at, ended_timestamp),
      last_seen_at = ended_timestamp
  where class_id = any(ended_class_ids)
    and ended_at is null
    and status in ('pending', 'live');

  get diagnostics ended_session_count = row_count;

  update public.classes
  set is_archived = true,
      ended_at = coalesce(classes.ended_at, ended_timestamp),
      ended_by_user_id = coalesce(classes.ended_by_user_id, current_user_id),
      updated_at = ended_timestamp
  where id = any(ended_class_ids);

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
    'classes.ended',
    'organization',
    target_org_id,
    jsonb_build_object(
      'scope',
      normalized_scope,
      'term',
      normalized_term,
      'stage',
      normalized_stage,
      'class_ids',
      ended_class_ids,
      'ended_count',
      ended_class_count,
      'ended_live_sessions',
      ended_session_count
    )
  );

  return jsonb_build_object(
    'result', 'ended',
    'scope', normalized_scope,
    'class_ids', ended_class_ids,
    'ended_count', ended_class_count,
    'ended_live_sessions', ended_session_count
  );
end;
$$;

create or replace function public.update_class(
  target_class_id uuid,
  class_name text,
  class_code text,
  teacher_email text,
  class_color text default 'indigo',
  class_description text default '',
  class_room text default null,
  class_semester text default null,
  class_stage text default null
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

  if current_user_is_admin then
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
      semester = nullif(btrim(coalesce(class_semester, '')), ''),
      stage = nullif(btrim(coalesce(class_stage, '')), ''),
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

  if current_user_is_admin
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
      'term',
      nullif(btrim(coalesce(class_semester, '')), ''),
      'stage',
      nullif(btrim(coalesce(class_stage, '')), ''),
      'was_archived',
      target_class.is_archived
    )
  );

  return jsonb_build_object('result', 'class', 'class_id', target_class.id);
end;
$$;

revoke all on function public.end_class(uuid)
  from public, anon, authenticated;
revoke all on function public.archive_class(uuid)
  from public, anon, authenticated;
revoke all on function public.end_classes(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.update_class(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.end_class(uuid)
  to authenticated;
grant execute on function public.archive_class(uuid)
  to authenticated;
grant execute on function public.end_classes(uuid, text, text, text)
  to authenticated;
grant execute on function public.update_class(uuid, text, text, text, text, text, text, text, text)
  to authenticated;
