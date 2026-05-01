create table if not exists public.organization_membership_roles (
  id uuid primary key default gen_random_uuid(),
  organization_membership_id uuid not null references public.organization_memberships (id) on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_membership_id, role)
);

create index if not exists idx_org_membership_roles_membership
  on public.organization_membership_roles (organization_membership_id);

create index if not exists idx_org_membership_roles_role
  on public.organization_membership_roles (role);

create index if not exists idx_org_membership_roles_active_role
  on public.organization_membership_roles (organization_membership_id, role)
  where status = 'active';

insert into public.organization_membership_roles (
  organization_membership_id,
  role,
  status,
  created_at,
  updated_at
)
select
  organization_memberships.id,
  organization_memberships.role,
  organization_memberships.status,
  organization_memberships.created_at,
  organization_memberships.updated_at
from public.organization_memberships
where organization_memberships.role is not null
on conflict (organization_membership_id, role) do update
  set status = excluded.status,
      updated_at = greatest(
        public.organization_membership_roles.updated_at,
        excluded.updated_at
      );

drop trigger if exists set_organization_membership_roles_updated_at
  on public.organization_membership_roles;

create trigger set_organization_membership_roles_updated_at
  before update on public.organization_membership_roles
  for each row execute procedure public.set_updated_at();

alter table public.organization_membership_roles enable row level security;

drop policy if exists "org members can read organization membership roles"
  on public.organization_membership_roles;

create policy "org members can read organization membership roles"
  on public.organization_membership_roles
  for select
  using (
    exists (
      select 1
      from public.organization_memberships
      where organization_memberships.id = organization_membership_roles.organization_membership_id
        and public.is_org_member(organization_memberships.organization_id)
    )
  );
