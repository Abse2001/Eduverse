grant delete on public.notifications to authenticated;

drop policy if exists "users can delete own role notifications" on public.notifications;
create policy "users can delete own role notifications"
  on public.notifications
  for delete
  using (
    recipient_user_id = auth.uid()
    and exists (
      select 1
      from public.organization_memberships
      join public.organization_membership_roles selected_role
        on selected_role.id = organization_memberships.selected_role_id
      where organization_memberships.organization_id = notifications.organization_id
        and organization_memberships.user_id = auth.uid()
        and organization_memberships.status = 'active'
        and selected_role.organization_membership_id = organization_memberships.id
        and selected_role.status = 'active'
        and selected_role.role = notifications.recipient_role
    )
  );
