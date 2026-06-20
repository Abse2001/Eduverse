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

  if not public.can_manage_class(target_class.organization_id, target_class.id) then
    raise exception 'Only organization admins or the class teacher can invite class members';
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

create or replace function public.grant_existing_organization_member_role(
  target_org_id uuid,
  target_member_user_id uuid,
  target_role public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_membership public.organization_memberships;
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can grant roles';
  end if;

  if target_role not in ('org_admin', 'teacher', 'student') then
    raise exception 'Only org_admin, teacher, or student can be granted';
  end if;

  select *
    into target_membership
  from public.organization_memberships
  where organization_id = target_org_id
    and user_id = target_member_user_id
    and status = 'active'
  limit 1;

  if target_membership.id is null then
    raise exception 'User must be an active organization member before roles can be added';
  end if;

  membership_id := public.grant_organization_role(
    target_org_id,
    target_member_user_id,
    target_role
  );

  return jsonb_build_object(
    'result', 'membership',
    'membership_id', membership_id,
    'role', target_role
  );
end;
$$;

create or replace function public.register_member_with_invites(
  target_org_id uuid,
  invited_email text,
  invited_role public.app_role,
  target_class_id uuid default null,
  invited_class_role public.class_membership_role default null,
  previous_terms jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  effective_class_role public.class_membership_role;
  organization_result jsonb;
  result_data jsonb;
  previous_term record;
begin
  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can register members';
  end if;

  if normalized_email = '' then
    raise exception 'Email is required';
  end if;

  if invited_role not in ('org_admin', 'teacher', 'student') then
    raise exception 'Only org_admin, teacher, or student can be invited';
  end if;

  if jsonb_typeof(coalesce(previous_terms, '[]'::jsonb)) <> 'array' then
    raise exception 'Previous terms must be an array';
  end if;

  if target_class_id is not null then
    if invited_role = 'org_admin' then
      raise exception 'Admins can be saved without a class assignment';
    end if;

    effective_class_role := coalesce(
      invited_class_role,
      case
        when invited_role = 'teacher' then 'teacher'::public.class_membership_role
        else 'student'::public.class_membership_role
      end
    );

    if effective_class_role::text <> invited_role::text then
      raise exception 'Class role must match organization invite role';
    end if;
  end if;

  if jsonb_array_length(coalesce(previous_terms, '[]'::jsonb)) > 0
    and invited_role <> 'student' then
    raise exception 'Previous terms can only be attached to students';
  end if;

  organization_result := public.invite_organization_member(
    target_org_id,
    normalized_email,
    invited_role
  );
  result_data := organization_result;

  if target_class_id is not null then
    perform public.create_pending_class_invite(
      target_class_id,
      normalized_email,
      effective_class_role,
      (organization_result ->> 'invite_id')::uuid
    );
  end if;

  for previous_term in
    select *
    from jsonb_to_recordset(coalesce(previous_terms, '[]'::jsonb)) as term_record(
      source_class_id uuid,
      term_label text,
      previous_class_name text,
      grade_value numeric
    )
  loop
    result_data := public.register_previous_term_grade(
      target_org_id,
      normalized_email,
      previous_term.term_label,
      previous_term.previous_class_name,
      previous_term.grade_value,
      previous_term.source_class_id
    );
  end loop;

  return result_data;
end;
$$;

revoke all on function public.create_pending_class_invite(
  uuid,
  text,
  public.class_membership_role,
  uuid
) from public, anon, authenticated;

revoke all on function public.grant_existing_organization_member_role(
  uuid,
  uuid,
  public.app_role
) from public, anon, authenticated;

revoke all on function public.register_member_with_invites(
  uuid,
  text,
  public.app_role,
  uuid,
  public.class_membership_role,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_pending_class_invite(
  uuid,
  text,
  public.class_membership_role,
  uuid
) to authenticated;

grant execute on function public.grant_existing_organization_member_role(
  uuid,
  uuid,
  public.app_role
) to authenticated;

grant execute on function public.register_member_with_invites(
  uuid,
  text,
  public.app_role,
  uuid,
  public.class_membership_role,
  jsonb
) to authenticated;
