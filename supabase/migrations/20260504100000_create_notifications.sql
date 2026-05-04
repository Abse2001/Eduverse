do $$
begin
  create type public.notification_type as enum (
    'chat_announcement',
    'session_started',
    'material_added',
    'assignment_published',
    'assignment_submitted',
    'assignment_graded'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid references public.classes (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  actor_user_id uuid references public.profiles (id) on delete set null,
  type public.notification_type not null,
  title text not null,
  body text not null default '',
  href text not null,
  metadata jsonb not null default '{}'::jsonb,
  event_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (btrim(title) <> ''),
  constraint notifications_href_not_blank check (btrim(href) <> '')
);

create unique index if not exists idx_notifications_recipient_event_key
  on public.notifications (recipient_user_id, event_key)
  where event_key is not null;

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

revoke insert, update, delete on public.notifications from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;

drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
  on public.notifications
  for select
  using (recipient_user_id = auth.uid());

drop policy if exists "users can mark own notifications read" on public.notifications;
create policy "users can mark own notifications read"
  on public.notifications
  for update
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.create_person_notification(
  target_org_id uuid,
  target_class_id uuid,
  target_recipient_user_id uuid,
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

  if notification_type = 'assignment_submitted' then
    if target_class_id is null then
      raise exception 'Assignment submission notifications require a class';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = auth.uid()
        and class_memberships.role = 'student'
    ) then
      raise exception 'Only class students can create assignment submission notifications';
    end if;

    if not exists (
      select 1
      from public.classes
      where classes.id = target_class_id
        and classes.organization_id = target_org_id
        and classes.teacher_user_id = target_recipient_user_id
    ) then
      raise exception 'Assignment submission notifications must target the class teacher';
    end if;
  elsif notification_type = 'assignment_graded' then
    if target_class_id is null
      or not public.can_manage_class(target_org_id, target_class_id) then
      raise exception 'Only class managers can create assignment grade notifications';
    end if;

    if not exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = target_recipient_user_id
        and class_memberships.role = 'student'
    ) then
      raise exception 'Assignment grade notifications must target a class student';
    end if;
  else
    raise exception 'Unsupported person notification type';
  end if;

  insert into public.notifications (
    organization_id,
    class_id,
    recipient_user_id,
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
    notification_actor_user_id,
    notification_type,
    btrim(notification_title),
    coalesce(notification_body, ''),
    btrim(notification_href),
    coalesce(notification_metadata, '{}'::jsonb),
    nullif(btrim(coalesce(notification_event_key, '')), '')
  )
  on conflict (recipient_user_id, event_key)
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

  if notification_type not in (
    'chat_announcement',
    'session_started',
    'material_added',
    'assignment_published'
  ) then
    raise exception 'Unsupported class notification type';
  end if;

  if not public.can_manage_class(target_org_id, target_class_id) then
    raise exception 'Only class managers can create class notifications';
  end if;

  if notification_type = 'session_started'
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
    on conflict (recipient_user_id, event_key)
      where event_key is not null
    do nothing
    returning id
  )
  select count(*) into inserted_count
  from inserted;

  return inserted_count;
end;
$$;

revoke all on function public.create_person_notification(
  uuid,
  uuid,
  uuid,
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) from public, anon;

revoke all on function public.create_class_notification(
  uuid,
  uuid,
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) from public, anon;

grant execute on function public.create_person_notification(
  uuid,
  uuid,
  uuid,
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) to authenticated;

grant execute on function public.create_class_notification(
  uuid,
  uuid,
  uuid,
  public.notification_type,
  text,
  text,
  text,
  jsonb,
  text
) to authenticated;
