update public.organization_membership_roles admin_role
set status = 'active',
    updated_at = now()
from public.organization_memberships membership
where admin_role.organization_membership_id = membership.id
  and admin_role.role = 'org_admin'
  and membership.role = 'org_admin'
  and membership.status = 'active'
  and not exists (
    select 1
    from public.organization_membership_roles active_admin_role
    where active_admin_role.organization_membership_id = membership.id
      and active_admin_role.role = 'org_admin'
      and active_admin_role.status = 'active'
  );
