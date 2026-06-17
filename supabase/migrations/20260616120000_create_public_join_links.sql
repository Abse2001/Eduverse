create table if not exists public.organization_join_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token text not null unique,
  default_role public.app_role not null default 'student',
  enabled boolean not null default false,
  approval_required boolean not null default true,
  max_uses integer,
  use_count integer not null default 0,
  expires_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_join_links_one_per_org unique (organization_id),
  constraint organization_join_links_default_role_check
    check (default_role in ('teacher', 'student')),
  constraint organization_join_links_max_uses_check
    check (max_uses is null or max_uses > 0),
  constraint organization_join_links_use_count_check
    check (use_count >= 0)
);

create index if not exists idx_organization_join_links_token
  on public.organization_join_links (token)
  where enabled;

create trigger set_organization_join_links_updated_at
  before update on public.organization_join_links
  for each row execute procedure public.set_updated_at();

alter table public.organization_join_links enable row level security;

create policy "org admins can read join links"
  on public.organization_join_links
  for select
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']::public.app_role[]));

create policy "org admins can manage join links"
  on public.organization_join_links
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']::public.app_role[]));

create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  join_link_id uuid references public.organization_join_links (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_role public.app_role not null default 'student',
  status text not null default 'pending',
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_join_requests_role_check
    check (requested_role in ('teacher', 'student')),
  constraint organization_join_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create unique index if not exists idx_organization_join_requests_pending_user
  on public.organization_join_requests (organization_id, user_id)
  where status = 'pending';

create index if not exists idx_organization_join_requests_org
  on public.organization_join_requests (organization_id, status, created_at);

create trigger set_organization_join_requests_updated_at
  before update on public.organization_join_requests
  for each row execute procedure public.set_updated_at();

alter table public.organization_join_requests enable row level security;

create policy "org admins can read join requests"
  on public.organization_join_requests
  for select
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']::public.app_role[]));

create policy "users can read their join requests"
  on public.organization_join_requests
  for select
  using (user_id = auth.uid());

create policy "org admins can manage join requests"
  on public.organization_join_requests
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']::public.app_role[]));

create or replace function public.upsert_organization_join_link(
  target_org_id uuid,
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
  join_link public.organization_join_links;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can manage public join links';
  end if;

  if target_default_role not in ('teacher', 'student') then
    raise exception 'Public join links can only grant teacher or student roles';
  end if;

  insert into public.organization_join_links (
    organization_id,
    token,
    default_role,
    enabled,
    approval_required,
    created_by_user_id
  )
  values (
    target_org_id,
    encode(extensions.gen_random_bytes(24), 'hex'),
    target_default_role,
    target_enabled,
    target_approval_required,
    current_user_id
  )
  on conflict (organization_id) do update
    set token = case
          when regenerate_token then encode(extensions.gen_random_bytes(24), 'hex')
          else public.organization_join_links.token
        end,
        default_role = excluded.default_role,
        enabled = excluded.enabled,
        approval_required = excluded.approval_required,
        updated_at = now()
  returning * into join_link;

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

  if join_link.id is null then
    raise exception 'Join link not found or disabled';
  end if;

  if join_link.expires_at is not null and join_link.expires_at < now() then
    raise exception 'Join link has expired';
  end if;

  if join_link.max_uses is not null and join_link.use_count >= join_link.max_uses then
    raise exception 'Join link has reached its usage limit';
  end if;

  if public.is_org_member(join_link.organization_id) then
    return jsonb_build_object(
      'result', 'already_member',
      'organization_id', join_link.organization_id,
      'role', join_link.default_role
    );
  end if;

  if join_link.approval_required then
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

  membership_id := public.grant_organization_role(
    join_link.organization_id,
    current_user_id,
    join_link.default_role
  );

  update public.organization_join_links
  set use_count = use_count + 1,
      updated_at = now()
  where id = join_link.id;

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
  membership_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_request
  from public.organization_join_requests
  where id = target_request_id
  limit 1;

  if target_request.id is null then
    raise exception 'Join request not found';
  end if;

  if target_request.status <> 'pending' then
    raise exception 'Only pending join requests can be reviewed';
  end if;

  if not public.has_org_role(target_request.organization_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can review join requests';
  end if;

  select *
    into target_profile
  from public.profiles
  where id = target_request.user_id;

  if approved then
    membership_id := public.grant_organization_role(
      target_request.organization_id,
      target_request.user_id,
      target_request.requested_role
    );

    update public.organization_join_links
    set use_count = use_count + 1,
        updated_at = now()
    where id = target_request.join_link_id;

    update public.profiles
    set default_organization_id = coalesce(default_organization_id, target_request.organization_id),
        updated_at = now()
    where id = target_request.user_id;
  end if;

  update public.organization_join_requests
  set status = case when approved then 'approved' else 'rejected' end,
      reviewed_by_user_id = current_user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = target_request.id;

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
      'email', target_profile.email,
      'role', target_request.requested_role
    )
  );

  return jsonb_build_object(
    'result', case when approved then 'approved' else 'rejected' end,
    'organization_id', target_request.organization_id,
    'request_id', target_request.id,
    'membership_id', membership_id,
    'role', target_request.requested_role
  );
end;
$$;

revoke all on function public.upsert_organization_join_link(uuid, public.app_role, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.accept_organization_join_link(text)
  from public, anon, authenticated;
revoke all on function public.review_organization_join_request(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.upsert_organization_join_link(uuid, public.app_role, boolean, boolean, boolean)
  to authenticated;
grant execute on function public.accept_organization_join_link(text)
  to authenticated;
grant execute on function public.review_organization_join_request(uuid, boolean)
  to authenticated;
