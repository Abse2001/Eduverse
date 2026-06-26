create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  public_features_enabled boolean not null default false,
  all_teachers_can_create_classes boolean not null default false,
  all_teachers_can_manage_own_classes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_teacher_class_permissions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  teacher_user_id uuid not null references public.profiles (id) on delete cascade,
  can_create_classes boolean not null default false,
  can_manage_own_classes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, teacher_user_id)
);

create trigger set_organization_settings_updated_at
  before update on public.organization_settings
  for each row execute procedure public.set_updated_at();

create trigger set_organization_teacher_class_permissions_updated_at
  before update on public.organization_teacher_class_permissions
  for each row execute procedure public.set_updated_at();

insert into public.organization_settings (
  organization_id,
  public_features_enabled
)
select
  organizations.id,
  exists (
    select 1
    from public.organization_join_links
    where organization_join_links.organization_id = organizations.id
      and organization_join_links.enabled
  )
  or exists (
    select 1
    from public.classes
    where classes.organization_id = organizations.id
      and classes.organization_visible
  )
from public.organizations
on conflict (organization_id) do nothing;

alter table public.organization_settings enable row level security;
alter table public.organization_teacher_class_permissions enable row level security;

drop policy if exists "org members can read organization settings"
  on public.organization_settings;
create policy "org members can read organization settings"
  on public.organization_settings
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "org admins can manage organization settings"
  on public.organization_settings;
create policy "org admins can manage organization settings"
  on public.organization_settings
  for all
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

drop policy if exists "org members can read teacher class permissions"
  on public.organization_teacher_class_permissions;
create policy "org members can read teacher class permissions"
  on public.organization_teacher_class_permissions
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "org admins can manage teacher class permissions"
  on public.organization_teacher_class_permissions;
create policy "org admins can manage teacher class permissions"
  on public.organization_teacher_class_permissions
  for all
  using (public.has_org_role(organization_id, array['org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_admin']::public.app_role[]));

create or replace function public.is_public_org_features_enabled(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select organization_settings.public_features_enabled
      from public.organization_settings
      where organization_settings.organization_id = target_org_id
    ),
    false
  );
$$;

create or replace function public.can_teacher_create_class(
  target_org_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(target_org_id, array['org_admin']::public.app_role[])
    or (
      public.user_has_org_role(
        target_org_id,
        target_user_id,
        array['teacher']::public.app_role[]
      )
      and (
        coalesce(
          (
            select organization_settings.all_teachers_can_create_classes
            from public.organization_settings
            where organization_settings.organization_id = target_org_id
          ),
          false
        )
        or exists (
          select 1
          from public.organization_teacher_class_permissions
          where organization_teacher_class_permissions.organization_id = target_org_id
            and organization_teacher_class_permissions.teacher_user_id = target_user_id
            and organization_teacher_class_permissions.can_create_classes
        )
      )
    );
$$;

create or replace function public.can_teacher_manage_own_classes(
  target_org_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(target_org_id, array['org_admin']::public.app_role[])
    or (
      public.user_has_org_role(
        target_org_id,
        target_user_id,
        array['teacher']::public.app_role[]
      )
      and (
        coalesce(
          (
            select organization_settings.all_teachers_can_manage_own_classes
            from public.organization_settings
            where organization_settings.organization_id = target_org_id
          ),
          false
        )
        or exists (
          select 1
          from public.organization_teacher_class_permissions
          where organization_teacher_class_permissions.organization_id = target_org_id
            and organization_teacher_class_permissions.teacher_user_id = target_user_id
            and organization_teacher_class_permissions.can_manage_own_classes
        )
      )
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
    public.has_org_role(target_org_id, array['org_admin']::public.app_role[])
    or (
      public.can_teacher_manage_own_classes(target_org_id)
      and exists (
        select 1
        from public.class_memberships
        where class_memberships.organization_id = target_org_id
          and class_memberships.class_id = target_class_id
          and class_memberships.user_id = auth.uid()
          and class_memberships.role in ('teacher', 'ta')
      )
    );
$$;

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
  current_profile public.profiles;
  current_user_is_admin boolean;
  normalized_teacher_email text := lower(btrim(coalesce(teacher_email, '')));
  normalized_code text := upper(btrim(coalesce(class_code, '')));
  target_teacher public.profiles;
  created_class_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  current_user_is_admin := public.has_org_role(
    target_org_id,
    array['org_admin']::public.app_role[]
  );

  if not current_user_is_admin
    and not public.can_teacher_create_class(target_org_id, current_user_id) then
    raise exception 'Only organization admins or permitted teachers can create classes';
  end if;

  if btrim(coalesce(class_name, '')) = '' then
    raise exception 'Class name is required';
  end if;

  if normalized_code = '' then
    raise exception 'Class code is required';
  end if;

  select *
    into current_profile
  from public.profiles
  where id = current_user_id;

  if current_profile.id is null then
    raise exception 'Profile not found';
  end if;

  if current_user_is_admin then
    if normalized_teacher_email <> '' then
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
    end if;
  else
    if normalized_teacher_email <> ''
      and normalized_teacher_email <> lower(current_profile.email) then
      raise exception 'Teachers can only assign themselves to classes they create';
    end if;

    target_teacher := current_profile;
    normalized_teacher_email := lower(current_profile.email);
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

  if target_teacher.id is not null then
    perform public.sync_class_teacher(created_class_id, target_teacher.id);
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
    'class.created',
    'class',
    created_class_id,
    jsonb_build_object(
      'code',
      normalized_code,
      'teacher_email',
      nullif(normalized_teacher_email, '')
    )
  );

  return jsonb_build_object('result', 'class', 'class_id', created_class_id);
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
  class_semester text default null
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

  if current_user_is_admin and normalized_teacher_email <> '' then
    select *
      into target_teacher
    from public.profiles
    where lower(email) = normalized_teacher_email
    limit 1;

    if target_teacher.id is null then
      raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
    end if;

    if not public.user_has_org_role(
      target_class.organization_id,
      target_teacher.id,
      array['teacher']::public.app_role[]
    ) then
      raise exception 'Teacher must accept a teacher organization invite before being assigned to a class';
    end if;
  end if;

  update public.classes
  set name = btrim(class_name),
      code = normalized_code,
      color = coalesce(nullif(btrim(class_color), ''), 'indigo'),
      description = coalesce(class_description, ''),
      room = nullif(btrim(coalesce(class_room, '')), ''),
      semester = nullif(btrim(coalesce(class_semester, '')), ''),
      updated_at = now()
  where id = target_class.id;

  if current_user_is_admin
    and target_teacher.id is not null
    and target_teacher.id is distinct from target_class.teacher_user_id then
    perform public.sync_class_teacher(target_class.id, target_teacher.id);
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
    'class.updated',
    'class',
    target_class.id,
    jsonb_build_object(
      'code',
      normalized_code,
      'teacher_email',
      nullif(normalized_teacher_email, '')
    )
  );

  return jsonb_build_object('result', 'class', 'class_id', target_class.id);
end;
$$;

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

  if visible_to_organization
    and not public.is_public_org_features_enabled(target_class.organization_id) then
    raise exception 'Public organization features must be enabled before classes can be organization-visible';
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

  if target_enabled and not public.is_public_org_features_enabled(target_org_id) then
    raise exception 'Public organization features must be enabled before public join links can be enabled';
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

create or replace function public.accept_organization_join_link(join_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  join_link public.organization_join_links;
  membership_id uuid;
  request_id uuid;
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
    into join_link
  from public.organization_join_links
  where token = join_token
    and enabled
  limit 1;

  if join_link.id is null
    or not public.is_public_org_features_enabled(join_link.organization_id) then
    raise exception 'Join link not found or disabled';
  end if;

  if join_link.expires_at is not null and join_link.expires_at < now() then
    raise exception 'Join link has expired';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(join_link.organization_id::text || ':' || current_user_id::text, 0)
  );

  if public.is_org_member(join_link.organization_id) then
    return jsonb_build_object(
      'result', 'already_member',
      'organization_id', join_link.organization_id,
      'role', join_link.default_role
    );
  end if;

  if join_link.approval_required then
    select *
      into join_link
    from public.organization_join_links
    where id = join_link.id;

    if join_link.max_uses is not null and join_link.use_count >= join_link.max_uses then
      raise exception 'Join link has reached its usage limit';
    end if;

    insert into public.organization_join_requests (
      organization_id,
      join_link_id,
      user_id,
      requested_role,
      status
    )
    values (
      join_link.organization_id,
      join_link.id,
      current_user_id,
      join_link.default_role,
      'pending'
    )
    on conflict (organization_id, user_id) where status = 'pending' do update
      set requested_role = excluded.requested_role,
          join_link_id = excluded.join_link_id,
          updated_at = now()
    returning id into request_id;

    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      payload
    )
    values (
      join_link.organization_id,
      current_user_id,
      'organization.join_requested',
      'organization_join_request',
      request_id,
      jsonb_build_object('email', current_profile.email, 'role', join_link.default_role)
    );

    return jsonb_build_object(
      'result', 'request_pending',
      'organization_id', join_link.organization_id,
      'request_id', request_id,
      'role', join_link.default_role
    );
  end if;

  update public.organization_join_links
  set use_count = use_count + 1,
      updated_at = now()
  where id = join_link.id
    and (max_uses is null or use_count < max_uses)
  returning * into join_link;

  if join_link.id is null then
    raise exception 'Join link has reached its usage limit';
  end if;

  membership_id := public.grant_organization_role(
    join_link.organization_id,
    current_user_id,
    join_link.default_role
  );

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, join_link.organization_id),
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
    join_link.organization_id,
    current_user_id,
    'organization.join_link_accepted',
    'organization_membership',
    membership_id,
    jsonb_build_object('email', current_profile.email, 'role', join_link.default_role)
  );

  return jsonb_build_object(
    'result', 'joined',
    'organization_id', join_link.organization_id,
    'membership_id', membership_id,
    'role', join_link.default_role
  );
end;
$$;

revoke all on function public.is_public_org_features_enabled(uuid)
  from public, anon, authenticated;
revoke all on function public.can_teacher_create_class(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.can_teacher_manage_own_classes(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.is_public_org_features_enabled(uuid)
  to authenticated;
grant execute on function public.can_teacher_create_class(uuid, uuid)
  to authenticated;
grant execute on function public.can_teacher_manage_own_classes(uuid, uuid)
  to authenticated;
