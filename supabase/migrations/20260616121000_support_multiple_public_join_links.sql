alter table public.organization_join_links
  add column if not exists purpose text not null default 'General access';

alter table public.organization_join_links
  drop constraint if exists organization_join_links_one_per_org;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_join_links_purpose_check'
      and conrelid = 'public.organization_join_links'::regclass
  ) then
    alter table public.organization_join_links
      add constraint organization_join_links_purpose_check
      check (btrim(purpose) <> '');
  end if;
end;
$$;

create unique index if not exists idx_organization_join_links_unique_options
  on public.organization_join_links (organization_id, default_role, approval_required);

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

  if not public.has_org_role(target_org_id, array['org_owner', 'org_admin']::public.app_role[]) then
    raise exception 'Only organization owners or admins can manage public join links';
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
  existing_link_id uuid;
begin
  select id
    into existing_link_id
  from public.organization_join_links
  where organization_id = target_org_id
    and default_role = target_default_role
    and approval_required = target_approval_required
  limit 1;

  return public.upsert_organization_join_link(
    target_org_id,
    existing_link_id,
    'General access',
    target_default_role,
    target_approval_required,
    target_enabled,
    regenerate_token
  );
end;
$$;
