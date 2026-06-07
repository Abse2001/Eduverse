alter type public.notification_type add value if not exists 'exam_published';
alter type public.notification_type add value if not exists 'exam_submitted';
alter type public.notification_type add value if not exists 'exam_results_released';

create or replace function public.create_person_notification(
  target_org_id uuid,
  target_class_id uuid,
  target_recipient_user_id uuid,
  target_recipient_role public.app_role,
  notification_actor_user_id uuid,
  notification_type public.notification_type,
  notification_title text,
  notification_body text,
  notification_href text,
  notification_metadata jsonb default '{}'::jsonb,
  notification_event_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_notification_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if notification_actor_user_id is not null
    and notification_actor_user_id <> auth.uid() then
    raise exception 'Notification actor must be the authenticated user';
  end if;

  if target_class_id is not null
    and not exists (
      select 1
      from public.classes
      where classes.id = target_class_id
        and classes.organization_id = target_org_id
    ) then
    raise exception 'Notification class organization mismatch';
  end if;

  if notification_type::text in (
    'assignment_submitted',
    'exam_submitted'
  ) then
    if target_recipient_role <> 'teacher' then
      raise exception 'Submission notifications must target the teacher role';
    end if;

    if target_class_id is null then
      raise exception 'Submission notifications require a class';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = auth.uid()
        and class_memberships.role = 'student'
    ) then
      raise exception 'Only class students can create submission notifications';
    end if;

    if not exists (
      select 1
      from public.classes
      where classes.id = target_class_id
        and classes.organization_id = target_org_id
        and classes.teacher_user_id = target_recipient_user_id
    ) then
      raise exception 'Submission notifications must target the class teacher';
    end if;
  elsif notification_type::text in (
    'assignment_graded',
    'exam_results_released'
  ) then
    if target_recipient_role <> 'student' then
      raise exception 'Result notifications must target the student role';
    end if;

    if target_class_id is null
      or not public.can_manage_class(target_org_id, target_class_id) then
      raise exception 'Only class managers can create result notifications';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = target_recipient_user_id
        and class_memberships.role = 'student'
    ) then
      raise exception 'Result notifications must target a class student';
    end if;
  else
    raise exception 'Unsupported person notification type';
  end if;

  insert into public.notifications (
    organization_id,
    class_id,
    recipient_user_id,
    recipient_role,
    actor_user_id,
    type,
    title,
    body,
    href,
    metadata,
    event_key
  )
  values (
    target_org_id,
    target_class_id,
    target_recipient_user_id,
    target_recipient_role,
    notification_actor_user_id,
    notification_type,
    btrim(notification_title),
    coalesce(notification_body, ''),
    btrim(notification_href),
    coalesce(notification_metadata, '{}'::jsonb),
    nullif(btrim(coalesce(notification_event_key, '')), '')
  )
  on conflict (recipient_user_id, recipient_role, event_key)
    where event_key is not null
  do nothing
  returning id into created_notification_id;

  return created_notification_id;
end;
$$;

create or replace function public.create_class_notification(
  target_org_id uuid,
  target_class_id uuid,
  notification_actor_user_id uuid,
  notification_type public.notification_type,
  notification_title text,
  notification_body text,
  notification_href text,
  notification_metadata jsonb default '{}'::jsonb,
  notification_event_key text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if notification_actor_user_id is not null
    and notification_actor_user_id <> auth.uid() then
    raise exception 'Notification actor must be the authenticated user';
  end if;

  if not exists (
    select 1
    from public.classes
    where classes.id = target_class_id
      and classes.organization_id = target_org_id
  ) then
    raise exception 'Notification class organization mismatch';
  end if;

  if notification_type::text not in (
    'chat_announcement',
    'session_started',
    'material_added',
    'assignment_published',
    'exam_published'
  ) then
    raise exception 'Unsupported class notification type';
  end if;

  if not public.can_manage_class(target_org_id, target_class_id) then
    raise exception 'Only class managers can create class notifications';
  end if;

  if notification_type::text = 'session_started'
    and not exists (
      select 1
      from public.classes
      where classes.id = target_class_id
        and classes.organization_id = target_org_id
        and classes.teacher_user_id = auth.uid()
    ) then
    raise exception 'Only the class teacher can create session start notifications';
  end if;

  with inserted as (
    insert into public.notifications (
      organization_id,
      class_id,
      recipient_user_id,
      recipient_role,
      actor_user_id,
      type,
      title,
      body,
      href,
      metadata,
      event_key
    )
    select
      target_org_id,
      target_class_id,
      class_memberships.user_id,
      'student'::public.app_role,
      notification_actor_user_id,
      notification_type,
      btrim(notification_title),
      coalesce(notification_body, ''),
      btrim(notification_href),
      coalesce(notification_metadata, '{}'::jsonb),
      nullif(btrim(coalesce(notification_event_key, '')), '')
    from public.class_memberships
    where class_memberships.organization_id = target_org_id
      and class_memberships.class_id = target_class_id
      and class_memberships.role = 'student'
    on conflict (recipient_user_id, recipient_role, event_key)
      where event_key is not null
    do nothing
    returning id
  )
  select count(*) into inserted_count
  from inserted;

  return inserted_count;
end;
$$;
