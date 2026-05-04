drop policy if exists "class managers can update live sessions" on public.class_live_sessions;
create policy "class managers and starters can update live sessions"
  on public.class_live_sessions
  for update
  using (
    public.can_manage_class(organization_id, class_id)
    or started_by_user_id = auth.uid()
  )
  with check (
    public.can_manage_class(organization_id, class_id)
    or started_by_user_id = auth.uid()
  );
