alter table public.organization_memberships
  add column if not exists selected_role_id uuid references public.organization_membership_roles (id) on delete set null;

create index if not exists idx_organization_memberships_selected_role
  on public.organization_memberships (selected_role_id);

create or replace function public.validate_selected_organization_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.selected_role_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.organization_membership_roles
    where organization_membership_roles.id = new.selected_role_id
      and organization_membership_roles.organization_membership_id = new.id
      and organization_membership_roles.status = 'active'
  ) then
    raise exception 'Selected role must be an active role for this organization membership';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_selected_organization_role
  on public.organization_memberships;

create trigger validate_selected_organization_role
  before insert or update of selected_role_id
  on public.organization_memberships
  for each row execute procedure public.validate_selected_organization_role();

create or replace function public.clear_inactive_selected_organization_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' then
    update public.organization_memberships
    set selected_role_id = null,
        updated_at = now()
    where id = new.organization_membership_id
      and selected_role_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists clear_inactive_selected_organization_role
  on public.organization_membership_roles;

create trigger clear_inactive_selected_organization_role
  after update of status
  on public.organization_membership_roles
  for each row execute procedure public.clear_inactive_selected_organization_role();

update public.organization_memberships
set selected_role_id = organization_membership_roles.id,
    updated_at = now()
from public.organization_membership_roles
where organization_membership_roles.organization_membership_id = organization_memberships.id
  and organization_membership_roles.role = organization_memberships.role
  and organization_membership_roles.status = 'active'
  and organization_memberships.selected_role_id is null;

create or replace function public.resolve_selected_organization_role(
  target_membership_id uuid
)
returns public.organization_membership_roles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  selected_role public.organization_membership_roles;
begin
  select organization_membership_roles.*
    into selected_role
  from public.organization_memberships
  join public.organization_membership_roles
    on organization_membership_roles.id = organization_memberships.selected_role_id
  where organization_memberships.id = target_membership_id
    and organization_membership_roles.organization_membership_id = organization_memberships.id
    and organization_membership_roles.status = 'active'
  limit 1;

  if selected_role.id is not null then
    return selected_role;
  end if;

  select organization_membership_roles.*
    into selected_role
  from public.organization_membership_roles
  where organization_membership_roles.organization_membership_id = target_membership_id
    and organization_membership_roles.status = 'active'
  order by case organization_membership_roles.role
    when 'org_owner' then 1
    when 'org_admin' then 2
    when 'teacher' then 3
    when 'student' then 4
    else 5
  end
  limit 1;

  return selected_role;
end;
$$;

create or replace function public.set_selected_organization_role(
  target_org_id uuid,
  target_role public.app_role
)
returns public.organization_membership_roles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_membership public.organization_memberships;
  target_membership_role public.organization_membership_roles;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_membership
  from public.organization_memberships
  where organization_id = target_org_id
    and user_id = current_user_id
    and status = 'active'
  limit 1;

  if target_membership.id is null then
    raise exception 'Active organization membership required';
  end if;

  select *
    into target_membership_role
  from public.organization_membership_roles
  where organization_membership_id = target_membership.id
    and role = target_role
    and status = 'active'
  limit 1;

  if target_membership_role.id is null then
    raise exception 'Selected role is not active for this organization';
  end if;

  update public.organization_memberships
  set selected_role_id = target_membership_role.id,
      updated_at = now()
  where id = target_membership.id;

  return target_membership_role;
end;
$$;
