delete from public.organization_membership_roles owner_role
using public.organization_membership_roles admin_role
where owner_role.organization_membership_id = admin_role.organization_membership_id
  and owner_role.role = 'org_owner'
  and admin_role.role = 'org_admin';

update public.organization_membership_roles
set role = 'org_admin',
    updated_at = now()
where role = 'org_owner';

update public.organization_memberships
set role = 'org_admin',
    updated_at = now()
where role = 'org_owner';

update public.organization_invites
set role = 'org_admin',
    updated_at = now()
where role = 'org_owner';

update public.notifications
set recipient_role = 'org_admin'
where recipient_role = 'org_owner';

create or replace function public.organization_role_rank(target_role public.app_role)
returns integer
language sql
immutable
as $$
  select case target_role
    when 'org_admin' then 1
    when 'teacher' then 2
    when 'student' then 3
    else 4
  end;
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
    public.has_org_role(target_org_id, array['org_admin']::public.app_role[])
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

  perform public.grant_organization_role(created_org.id, current_user_id, 'org_admin');

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
      normalized_name,
      'preset_key',
      normalized_preset_key
    )
  );

  return created_org;
end;
$$;

drop policy if exists "org admins can manage organization features"
  on public.organization_feature_settings;
create policy "org admins can manage organization features"
  on public.organization_feature_settings
  for all
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

drop policy if exists "org admins can manage organization extensions"
  on public.organization_extensions;
create policy "org admins can manage organization extensions"
  on public.organization_extensions
  for all
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

drop policy if exists "class members can read live sessions"
  on public.class_live_sessions;
create policy "class members can read live sessions"
  on public.class_live_sessions
  for select
  using (
    public.has_org_role(organization_id, array['org_admin']::public.app_role[])
    or public.is_class_member(organization_id, class_id)
    or public.can_manage_class(organization_id, class_id)
  );

drop policy if exists "org admins can read join links"
  on public.organization_join_links;
create policy "org admins can read join links"
  on public.organization_join_links
  for select
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

drop policy if exists "org admins can manage join links"
  on public.organization_join_links;
create policy "org admins can manage join links"
  on public.organization_join_links
  for all
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

drop policy if exists "org admins can read join requests"
  on public.organization_join_requests;
create policy "org admins can read join requests"
  on public.organization_join_requests
  for select
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

drop policy if exists "org admins can manage join requests"
  on public.organization_join_requests;
create policy "org admins can manage join requests"
  on public.organization_join_requests
  for all
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

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
  invite_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can invite members';
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

  if target_profile.id is not null
    and public.user_has_org_role(
      target_org_id,
      target_profile.id,
      array[invited_role]::public.app_role[]
    ) then
    return jsonb_build_object(
      'result', 'membership',
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

revoke all on function public.invite_organization_member(
  uuid,
  text,
  public.app_role
) from public, anon, authenticated;

grant execute on function public.invite_organization_member(
  uuid,
  text,
  public.app_role
) to authenticated;

create or replace function public.revoke_organization_invite(target_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_invite public.organization_invites;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_invite
  from public.organization_invites
  where id = target_invite_id
  limit 1;

  if target_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if target_invite.status <> 'invited' then
    raise exception 'Only pending invites can be revoked';
  end if;

  if not public.has_org_role(target_invite.organization_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can revoke invites';
  end if;

  delete from public.class_invites
  where organization_invite_id = target_invite.id
    and status = 'invited';

  delete from public.organization_invites
  where id = target_invite.id;

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
    'organization.invite_revoked',
    'organization_invite',
    target_invite.id,
    jsonb_build_object('email', target_invite.email, 'role', target_invite.role)
  );

  return jsonb_build_object(
    'result', 'revoked',
    'invite_id', target_invite.id,
    'email', target_invite.email,
    'role', target_invite.role
  );
end;
$$;

revoke all on function public.revoke_organization_invite(uuid)
  from public, anon, authenticated;

grant execute on function public.revoke_organization_invite(uuid)
  to authenticated;

create or replace function public.create_class(
  target_org_id uuid,
  class_name text,
  class_code text,
  teacher_email text,
  class_color text default 'indigo',
  class_description text default '',
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
  created_class_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can create classes';
  end if;

  if btrim(coalesce(class_name, '')) = '' then
    raise exception 'Class name is required';
  end if;

  if normalized_code = '' then
    raise exception 'Class code is required';
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
    raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
  end if;

  if not public.user_has_org_role(
    target_org_id,
    target_teacher.id,
    array['teacher']::public.app_role[]
  ) then
    raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
  end if;

  insert into public.classes (
    organization_id,
    name,
    code,
    teacher_user_id,
    color,
    description,
    room,
    semester
  )
  values (
    target_org_id,
    btrim(class_name),
    normalized_code,
    target_teacher.id,
    coalesce(nullif(btrim(class_color), ''), 'indigo'),
    coalesce(class_description, ''),
    nullif(btrim(coalesce(class_room, '')), ''),
    nullif(btrim(coalesce(class_semester, '')), '')
  )
  returning id into created_class_id;

  insert into public.class_feature_settings (
    organization_id,
    class_id,
    feature_key,
    enabled,
    config
  )
  select
    target_org_id,
    created_class_id,
    organization_feature_settings.feature_key,
    true,
    '{}'::jsonb
  from public.organization_feature_settings
  where organization_feature_settings.organization_id = target_org_id
    and public.is_organization_feature_enabled(
      target_org_id,
      organization_feature_settings.feature_key
    )
  on conflict on constraint class_feature_settings_pkey do nothing;

  perform public.sync_class_teacher(created_class_id, target_teacher.id);

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
    created_class_id,
    jsonb_build_object('code', normalized_code, 'teacher_email', normalized_teacher_email)
  );

  return jsonb_build_object('result', 'class', 'class_id', created_class_id);
end;
$$;

revoke all on function public.create_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_class(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

create or replace function public.upsert_organization_join_link(
  target_org_id uuid,
  target_link_id uuid default null,
  target_purpose text default 'General access',
  target_default_role public.app_role default 'student',
  target_approval_required boolean default true,
  target_enabled boolean default true,
  regenerate_token boolean default false
)
returns public.organization_join_links
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_purpose text := btrim(coalesce(target_purpose, ''));
  join_link public.organization_join_links;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can manage public join links';
  end if;

  if target_default_role not in ('teacher', 'student') then
    raise exception 'Public join links can only grant teacher or student roles';
  end if;

  if normalized_purpose = '' then
    raise exception 'Public join link purpose is required';
  end if;

  if target_link_id is null then
    insert into public.organization_join_links (
      organization_id,
      purpose,
      token,
      default_role,
      enabled,
      approval_required,
      created_by_user_id
    )
    values (
      target_org_id,
      normalized_purpose,
      encode(extensions.gen_random_bytes(24), 'hex'),
      target_default_role,
      target_enabled,
      target_approval_required,
      current_user_id
    )
    returning * into join_link;
  else
    update public.organization_join_links
    set purpose = normalized_purpose,
        token = case
          when regenerate_token then encode(extensions.gen_random_bytes(24), 'hex')
          else token
        end,
        default_role = target_default_role,
        enabled = target_enabled,
        approval_required = target_approval_required,
        updated_at = now()
    where id = target_link_id
      and organization_id = target_org_id
    returning * into join_link;

    if join_link.id is null then
      raise exception 'Public join link not found';
    end if;
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
    target_org_id,
    current_user_id,
    'organization.join_link_updated',
    'organization_join_link',
    join_link.id,
    jsonb_build_object(
      'default_role', join_link.default_role,
      'purpose', join_link.purpose,
      'enabled', join_link.enabled,
      'approval_required', join_link.approval_required,
      'regenerated', regenerate_token
    )
  );

  return join_link;
end;
$$;

revoke all on function public.upsert_organization_join_link(uuid, uuid, text, public.app_role, boolean, boolean, boolean)
  from public, anon, authenticated;

grant execute on function public.upsert_organization_join_link(uuid, uuid, text, public.app_role, boolean, boolean, boolean)
  to authenticated;

create or replace function public.delete_organization_join_link(
  target_org_id uuid,
  target_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_link public.organization_join_links;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can delete public join links';
  end if;

  select *
    into target_link
  from public.organization_join_links
  where id = target_link_id
    and organization_id = target_org_id
  limit 1;

  if target_link.id is null then
    raise exception 'Public join link not found';
  end if;

  delete from public.organization_join_links
  where id = target_link.id;

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
    'organization.join_link_deleted',
    'organization_join_link',
    target_link.id,
    jsonb_build_object(
      'purpose', target_link.purpose,
      'default_role', target_link.default_role,
      'approval_required', target_link.approval_required,
      'enabled', target_link.enabled
    )
  );

  return jsonb_build_object(
    'result', 'deleted',
    'join_link_id', target_link.id,
    'organization_id', target_org_id
  );
end;
$$;

revoke all on function public.delete_organization_join_link(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.delete_organization_join_link(uuid, uuid)
  to authenticated;

create or replace function public.review_organization_join_request(
  target_request_id uuid,
  approved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_request public.organization_join_requests;
  target_profile public.profiles;
  target_join_link public.organization_join_links;
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select organization_id
    into target_request.organization_id
  from public.organization_join_requests
  where id = target_request_id
  limit 1;

  if target_request.organization_id is null then
    raise exception 'Join request not found';
  end if;

  if not public.has_org_role(target_request.organization_id, array['org_admin']::public.app_role[]) then
    raise exception 'Only organization admins can review join requests';
  end if;

  update public.organization_join_requests
  set status = case when approved then 'approved' else 'rejected' end,
      reviewed_by_user_id = current_user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = target_request_id
    and status = 'pending'
  returning * into target_request;

  if target_request.id is null then
    raise exception 'Only pending join requests can be reviewed';
  end if;

  select *
    into target_profile
  from public.profiles
  where id = target_request.user_id;

  if approved then
    if target_request.join_link_id is not null then
      update public.organization_join_links
      set use_count = use_count + 1,
          updated_at = now()
      where id = target_request.join_link_id
        and (max_uses is null or use_count < max_uses)
      returning * into target_join_link;

      if target_join_link.id is null then
        raise exception 'Join link has reached its usage limit';
      end if;
    end if;

    membership_id := public.grant_organization_role(
      target_request.organization_id,
      target_request.user_id,
      target_request.requested_role
    );

    update public.profiles
    set default_organization_id = coalesce(default_organization_id, target_request.organization_id),
        updated_at = now()
    where id = target_request.user_id;
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
    target_request.organization_id,
    current_user_id,
    case when approved then 'organization.join_request_approved' else 'organization.join_request_rejected' end,
    'organization_join_request',
    target_request.id,
    jsonb_build_object(
      'user_id', target_request.user_id,
      'email', target_profile.email,
      'role', target_request.requested_role,
      'membership_id', membership_id
    )
  );

  return jsonb_build_object(
    'result', case when approved then 'approved' else 'rejected' end,
    'request_id', target_request.id,
    'email', target_profile.email,
    'role', target_request.requested_role
  );
end;
$$;

revoke all on function public.review_organization_join_request(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.review_organization_join_request(uuid, boolean)
  to authenticated;

create or replace function public.set_class_organization_visibility(
  target_class_id uuid,
  visible_to_organization boolean
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
    raise exception 'Only organization admins can change class visibility';
  end if;

  update public.classes
  set organization_visible = visible_to_organization,
      updated_at = now()
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
    'class.organization_visibility_updated',
    'class',
    target_class.id,
    jsonb_build_object('organization_visible', visible_to_organization)
  );

  return jsonb_build_object(
    'result', 'class_visibility',
    'class_id', target_class.id,
    'organization_visible', visible_to_organization
  );
end;
$$;

revoke all on function public.set_class_organization_visibility(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.set_class_organization_visibility(uuid, boolean)
  to authenticated;
