alter table public.class_messages
  add column if not exists show_in_announcement_carousel boolean not null default true;

drop policy if exists "class managers can delete announcements" on public.class_messages;

drop policy if exists "class managers can update announcement carousel visibility" on public.class_messages;
create policy "class managers can update announcement carousel visibility"
  on public.class_messages
  for update
  using (
    kind = 'announcement'
    and public.can_manage_class(organization_id, class_id)
  )
  with check (
    kind = 'announcement'
    and public.can_manage_class(organization_id, class_id)
  );
