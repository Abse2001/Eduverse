create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.create_organization(
  org_name text,
  requested_slug text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(org_name, ''));
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

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    created_org.id,
    current_user_id,
    'org_owner',
    'active'
  )
  on conflict (organization_id, user_id) do update
    set role = 'org_owner',
        status = 'active',
        updated_at = now();

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
    jsonb_build_object('slug', created_org.slug, 'name', created_org.name)
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

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']) then
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
    insert into public.organization_memberships (
      organization_id,
      user_id,
      role,
      status
    )
    values (
      target_org_id,
      target_profile.id,
      invited_role,
      'active'
    )
    on conflict (organization_id, user_id) do update
      set role = excluded.role,
          status = excluded.status,
          updated_at = now()
    returning id into membership_id;

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
      'organization.member_upserted',
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
    encode(gen_random_bytes(24), 'hex'),
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
