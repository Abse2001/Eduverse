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
      from public.classes
      where classes.organization_id = target_org_id
        and classes.id = target_class_id
        and classes.teacher_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.class_memberships
      where class_memberships.organization_id = target_org_id
        and class_memberships.class_id = target_class_id
        and class_memberships.user_id = auth.uid()
        and class_memberships.role in ('teacher', 'ta')
    );
$$;
