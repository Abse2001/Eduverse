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
    raise exception 'User is not part of this organization';
  end if;

  if not public.user_has_org_role(
    target_class.organization_id,
    target_profile.id,
    array[required_org_role]::public.app_role[]
  ) then
    raise exception 'User is not part of this organization with the selected role';
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
