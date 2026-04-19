create table if not exists public.class_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  email text not null,
  role public.class_membership_role not null,
  organization_invite_id uuid references public.organization_invites (id) on delete set null,
  invited_by_user_id uuid references auth.users (id) on delete set null,
  status public.membership_status not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, email)
);

create unique index if not exists idx_class_memberships_one_teacher
  on public.class_memberships (class_id)
  where role = 'teacher';

create index if not exists idx_class_invites_org
  on public.class_invites (organization_id);

create index if not exists idx_class_invites_class
  on public.class_invites (class_id);

create trigger set_class_invites_updated_at
  before update on public.class_invites
  for each row execute procedure public.set_updated_at();

alter table public.class_invites enable row level security;

create policy "class managers can manage class invites"
  on public.class_invites
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create or replace function public.ensure_org_member_for_class(
  target_org_id uuid,
  target_user_id uuid,
  target_org_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    target_org_id,
    target_user_id,
    target_org_role,
    'active'
  )
  on conflict (organization_id, user_id) do update
    set role = case
          when public.organization_memberships.role in ('org_owner', 'org_admin') then public.organization_memberships.role
          when excluded.role = 'teacher' then 'teacher'
          else public.organization_memberships.role
        end,
        status = 'active',
        updated_at = now();
end;
$$;

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

  perform public.ensure_org_member_for_class(
    target_class.organization_id,
    target_teacher_user_id,
    'teacher'
  );

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

revoke all on function public.ensure_org_member_for_class(uuid, uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.sync_class_teacher(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_class(
  target_org_id uuid,
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
  normalized_teacher_email text := lower(btrim(coalesce(teacher_email, '')));
  normalized_code text := upper(btrim(coalesce(class_code, '')));
  target_teacher public.profiles;
  class_id uuid;
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

  if btrim(coalesce(class_subject, '')) = '' then
    raise exception 'Subject is required';
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
    subject,
    teacher_user_id,
    color,
    description,
    schedule_text,
    room,
    semester
  )
  values (
    target_org_id,
    btrim(class_name),
    normalized_code,
    btrim(class_subject),
    target_teacher.id,
    coalesce(nullif(btrim(class_color), ''), 'indigo'),
    coalesce(class_description, ''),
    nullif(btrim(coalesce(class_schedule_text, '')), ''),
    nullif(btrim(coalesce(class_room, '')), ''),
    nullif(btrim(coalesce(class_semester, '')), '')
  )
  returning id into class_id;

  perform public.sync_class_teacher(class_id, target_teacher.id);

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
    class_id,
    jsonb_build_object('code', normalized_code, 'teacher_email', normalized_teacher_email)
  );

  return jsonb_build_object('result', 'class', 'class_id', class_id);
end;
$$;

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

  perform public.sync_class_teacher(target_class.id, target_teacher.id);

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
    jsonb_build_object('code', normalized_code, 'teacher_email', normalized_teacher_email)
  );

  return jsonb_build_object('result', 'class', 'class_id', target_class.id);
end;
$$;

create or replace function public.delete_class(target_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
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
    raise exception 'Only organization admins or the class teacher can delete this class';
  end if;

  delete from public.classes
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
    'class.deleted',
    'class',
    target_class.id,
    jsonb_build_object('code', target_class.code, 'name', target_class.name)
  );

  return jsonb_build_object('result', 'deleted', 'class_id', target_class.id);
end;
$$;

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
  org_invite_id uuid;
  class_invite_id uuid;
  org_role public.app_role;
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
    raise exception 'Invite email is required';
  end if;

  if invited_class_role not in ('teacher', 'student') then
    raise exception 'Only teacher or student can be invited to a class';
  end if;

  org_role := case when invited_class_role = 'teacher' then 'teacher'::public.app_role else 'student'::public.app_role end;

  select *
    into target_profile
  from public.profiles
  where lower(email) = normalized_email
  limit 1;

  if target_profile.id is not null then
    perform public.ensure_org_member_for_class(target_class.organization_id, target_profile.id, org_role);

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
    target_class.organization_id,
    normalized_email,
    org_role,
    current_user_id,
    encode(extensions.gen_random_bytes(24), 'hex'),
    'invited',
    now() + interval '14 days'
  )
  on conflict (organization_id, email) do update
    set role = case
          when excluded.role = 'teacher' then 'teacher'::public.app_role
          else public.organization_invites.role
        end,
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
    status
  )
  values (
    target_class.organization_id,
    target_class.id,
    normalized_email,
    invited_class_role,
    org_invite_id,
    current_user_id,
    'invited'
  )
  on conflict (class_id, email) do update
    set role = excluded.role,
        organization_invite_id = excluded.organization_invite_id,
        invited_by_user_id = excluded.invited_by_user_id,
        status = 'invited',
        updated_at = now()
  returning id into class_invite_id;

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
    'class.invite_upserted',
    'class_invite',
    class_invite_id,
    jsonb_build_object('class_id', target_class.id, 'email', normalized_email, 'role', invited_class_role, 'organization_invite_id', org_invite_id)
  );

  return jsonb_build_object(
    'result', 'invite',
    'class_id', target_class.id,
    'class_invite_id', class_invite_id,
    'invite_id', org_invite_id,
    'email', normalized_email,
    'role', invited_class_role
  );
end;
$$;

create or replace function public.remove_class_student(
  target_class_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
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
    raise exception 'Only organization admins or the class teacher can remove class students';
  end if;

  delete from public.class_memberships
  where class_id = target_class.id
    and user_id = target_user_id
    and role = 'student';

  return jsonb_build_object('result', 'removed', 'class_id', target_class.id, 'user_id', target_user_id);
end;
$$;

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

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    target_invite.organization_id,
    current_user_id,
    target_invite.role,
    'active'
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        status = 'active',
        updated_at = now()
  returning id into membership_id;

  for pending_class_invite in
    select *
    from public.class_invites
    where organization_id = target_invite.organization_id
      and lower(email) = lower(current_profile.email)
      and status = 'invited'
  loop
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
