drop policy if exists "users can manage their class visibility preferences"
  on public.class_visibility_preferences;

create policy "students can insert org-visible class visibility preferences"
  on public.class_visibility_preferences
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.classes
      where classes.id = class_visibility_preferences.class_id
        and classes.organization_id = class_visibility_preferences.organization_id
        and classes.organization_visible
    )
    and public.has_org_role(
      organization_id,
      array['student']::public.app_role[]
    )
  );

create policy "students can update org-visible class visibility preferences"
  on public.class_visibility_preferences
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.classes
      where classes.id = class_visibility_preferences.class_id
        and classes.organization_id = class_visibility_preferences.organization_id
        and classes.organization_visible
    )
    and public.has_org_role(
      organization_id,
      array['student']::public.app_role[]
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.classes
      where classes.id = class_visibility_preferences.class_id
        and classes.organization_id = class_visibility_preferences.organization_id
        and classes.organization_visible
    )
    and public.has_org_role(
      organization_id,
      array['student']::public.app_role[]
    )
  );

create policy "students can delete org-visible class visibility preferences"
  on public.class_visibility_preferences
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.classes
      where classes.id = class_visibility_preferences.class_id
        and classes.organization_id = class_visibility_preferences.organization_id
        and classes.organization_visible
    )
    and public.has_org_role(
      organization_id,
      array['student']::public.app_role[]
    )
  );
