create or replace function public.organization_role_rank(target_role public.app_role)
returns integer
language sql
immutable
as $$
  select case target_role
    when 'org_owner' then 1
    when 'org_admin' then 2
    when 'teacher' then 3
    when 'student' then 4
    else 5
  end;
$$;

create or replace function public.grant_organization_role(
  target_org_id uuid,
  target_user_id uuid,
  target_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_id uuid;
  role_id uuid;
  current_compat_role public.app_role;
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
    target_role,
    'active'
  )
  on conflict (organization_id, user_id) do update
    set role = case
          when public.organization_role_rank(excluded.role) <
               public.organization_role_rank(public.organization_memberships.role)
            then excluded.role
          else public.organization_memberships.role
        end,
        status = 'active',
        updated_at = now()
  returning id, role into membership_id, current_compat_role;

  insert into public.organization_membership_roles (
    organization_membership_id,
    role,
    status
  )
  values (
    membership_id,
    target_role,
    'active'
  )
  on conflict (organization_membership_id, role) do update
    set status = 'active',
        updated_at = now()
  returning id into role_id;

  update public.organization_memberships
  set selected_role_id = coalesce(
        (
          select selected_role.id
          from public.organization_membership_roles selected_role
          where selected_role.id = public.organization_memberships.selected_role_id
            and selected_role.organization_membership_id = membership_id
            and selected_role.status = 'active'
          limit 1
        ),
        (
          select compat_role.id
          from public.organization_membership_roles compat_role
          where compat_role.organization_membership_id = membership_id
            and compat_role.role = current_compat_role
            and compat_role.status = 'active'
          limit 1
        ),
        role_id
      ),
      updated_at = now()
  where id = membership_id;

  return membership_id;
end;
$$;

revoke all on function public.grant_organization_role(uuid, uuid, public.app_role)
  from public, anon, authenticated;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    join public.organization_membership_roles
      on organization_membership_roles.organization_membership_id = organization_memberships.id
    where organization_memberships.organization_id = target_org_id
      and organization_memberships.user_id = auth.uid()
      and organization_memberships.status = 'active'
      and organization_membership_roles.status = 'active'
  );
$$;

create or replace function public.has_org_role(
  target_org_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships
    join public.organization_membership_roles
      on organization_membership_roles.organization_membership_id = organization_memberships.id
    where organization_memberships.organization_id = target_org_id
      and organization_memberships.user_id = auth.uid()
      and organization_memberships.status = 'active'
      and organization_membership_roles.status = 'active'
      and organization_membership_roles.role = any(allowed_roles)
  );
$$;

create or replace function public.can_manage_class(
  target_org_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[])
    or exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = auth.uid()
        and class_memberships.role in ('teacher', 'ta')
    );
$$;

create or replace function public.create_organization(
  org_name text,
  requested_slug text default null,
  preset_key text default 'primary_school'
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(org_name, ''));
  normalized_preset_key text := coalesce(nullif(btrim(preset_key), ''), 'primary_school');
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 0;
  created_org public.organizations;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name = '' then
    raise exception 'Organization name is required';
  end if;

  if not exists (
    select 1
    from public.feature_presets
    where key = normalized_preset_key
  ) then
    raise exception 'Feature preset % does not exist', normalized_preset_key;
  end if;

  base_slug := public.slugify(coalesce(nullif(btrim(requested_slug), ''), normalized_name));

  if base_slug = '' then
    raise exception 'Organization slug is invalid';
  end if;

  candidate_slug := base_slug;

  loop
    begin
      insert into public.organizations (slug, name)
      values (candidate_slug, normalized_name)
      returning * into created_org;

      exit;
    exception
      when unique_violation then
        if nullif(btrim(requested_slug), '') is not null then
          raise exception 'Organization slug already exists';
        end if;

        slug_suffix := slug_suffix + 1;
        candidate_slug := base_slug || '-' || slug_suffix::text;
    end;
  end loop;

  insert into public.organization_feature_settings (
    organization_id,
    feature_key,
    enabled,
    config
  )
  select
    created_org.id,
    feature_definitions.key,
    coalesce(feature_preset_items.enabled, feature_definitions.default_enabled),
    coalesce(feature_preset_items.config, '{}'::jsonb)
  from public.feature_definitions
  left join public.feature_preset_items
    on feature_preset_items.feature_key = feature_definitions.key
   and feature_preset_items.preset_key = normalized_preset_key
  order by feature_definitions.sort_order
  on conflict (organization_id, feature_key) do update
    set enabled = excluded.enabled,
        config = excluded.config,
        updated_at = now();

  perform public.grant_organization_role(created_org.id, current_user_id, 'org_owner');

  update public.profiles
  set default_organization_id = created_org.id,
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
    created_org.id,
    current_user_id,
    'organization.created',
    'organization',
    created_org.id,
    jsonb_build_object(
      'slug',
      created_org.slug,
      'name',
      created_org.name,
      'preset_key',
      normalized_preset_key
    )
  );

  return created_org;
end;
$$;

create or replace function public.invite_organization_member(
  target_org_id uuid,
  invited_email text,
  invited_role public.app_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(btrim(coalesce(invited_email, '')));
  target_profile public.profiles;
  membership_id uuid;
  invite_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can invite members';
  end if;

  if normalized_email = '' then
    raise exception 'Invite email is required';
  end if;

  if invited_role not in ('org_admin', 'teacher', 'student') then
    raise exception 'Only org_admin, teacher, or student can be invited';
  end if;

  select *
    into target_profile
  from public.profiles
  where lower(email) = normalized_email
  limit 1;

  if target_profile.id is not null then
    membership_id := public.grant_organization_role(
      target_org_id,
      target_profile.id,
      invited_role
    );

    update public.organization_invites
    set status = 'active',
        updated_at = now()
    where organization_id = target_org_id
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
      target_org_id,
      current_user_id,
      'organization.member_role_granted',
      'organization_membership',
      membership_id,
      jsonb_build_object('email', normalized_email, 'role', invited_role)
    );

    return jsonb_build_object(
      'result', 'membership',
      'membership_id', membership_id,
      'email', normalized_email,
      'role', invited_role
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
    target_org_id,
    normalized_email,
    invited_role,
    current_user_id,
    encode(extensions.gen_random_bytes(24), 'hex'),
    'invited',
    now() + interval '14 days'
  )
  on conflict (organization_id, email) do update
    set role = excluded.role,
        invited_by_user_id = excluded.invited_by_user_id,
        token = excluded.token,
        status = 'invited',
        expires_at = excluded.expires_at,
        updated_at = now()
  returning id into invite_id;

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
    'organization.invite_upserted',
    'organization_invite',
    invite_id,
    jsonb_build_object('email', normalized_email, 'role', invited_role)
  );

  return jsonb_build_object(
    'result', 'invite',
    'invite_id', invite_id,
    'email', normalized_email,
    'role', invited_role
  );
end;
$$;

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
  perform public.grant_organization_role(
    target_org_id,
    target_user_id,
    target_org_role
  );
end;
$$;

revoke all on function public.ensure_org_member_for_class(uuid, uuid, public.app_role)
  from public, anon, authenticated;

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

  membership_id := public.grant_organization_role(
    target_invite.organization_id,
    current_user_id,
    target_invite.role
  );

  for pending_class_invite in
    select *
    from public.class_invites
    where organization_id = target_invite.organization_id
      and lower(email) = lower(current_profile.email)
      and status = 'invited'
  loop
    perform public.ensure_org_member_for_class(
      pending_class_invite.organization_id,
      current_user_id,
      case
        when pending_class_invite.role = 'teacher' then 'teacher'::public.app_role
        else 'student'::public.app_role
      end
    );

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
