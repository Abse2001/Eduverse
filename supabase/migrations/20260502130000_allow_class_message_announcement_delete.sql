drop policy if exists "class managers can delete announcements" on public.class_messages;
create policy "class managers can delete announcements"
  on public.class_messages
  for delete
  using (
    kind = 'announcement'
    and public.can_manage_class(organization_id, class_id)
  );
