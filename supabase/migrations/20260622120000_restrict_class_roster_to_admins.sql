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

  if not public.has_org_role(target_class.organization_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can add class members';
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

  if not public.has_org_role(target_class.organization_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can remove class students';
  end if;

  delete from public.class_memberships
  where class_id = target_class.id
    and user_id = target_user_id
    and role = 'student';

  return jsonb_build_object('result', 'removed', 'class_id', target_class.id, 'user_id', target_user_id);
end;
$$;

revoke all on function public.remove_class_student(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.remove_class_student(uuid, uuid)
  to authenticated;

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

  if not public.has_org_role(target_class.organization_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can invite class members';
  end if;

  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  if invited_class_role not in ('teacher', 'student') then
    raise exception 'Only teacher or student can be invited to a class';
  end if;

  if target_org_invite_id is null then
    raise exception 'Organization invite is required for pending class invites';
  end if;

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

  if target_org_invite.role::text <> invited_class_role::text then
    raise exception 'Class role must match organization invite role';
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
    target_org_invite.id,
    current_user_id,
    'invited'
  )
  on conflict (class_id, email) do update
    set role = excluded.role,
        organization_invite_id = excluded.organization_invite_id,
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

revoke all on function public.create_pending_class_invite(
  uuid,
  text,
  public.class_membership_role,
  uuid
) from public, anon, authenticated;

grant execute on function public.create_pending_class_invite(
  uuid,
  text,
  public.class_membership_role,
  uuid
) to authenticated;
