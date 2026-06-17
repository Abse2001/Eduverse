alter table public.classes
  add column if not exists organization_visible boolean not null default false;

create table if not exists public.class_visibility_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  hidden boolean not null default true,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);

create index if not exists idx_class_visibility_preferences_user
  on public.class_visibility_preferences (organization_id, user_id, hidden);

create trigger set_class_visibility_preferences_updated_at
  before update on public.class_visibility_preferences
  for each row execute procedure public.set_updated_at();

alter table public.class_visibility_preferences enable row level security;

create policy "users can read their class visibility preferences"
  on public.class_visibility_preferences
  for select
  using (user_id = auth.uid());

create policy "users can manage their class visibility preferences"
  on public.class_visibility_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.set_class_organization_visibility(
  target_class_id uuid,
  visible_to_organization boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if not public.can_manage_class(target_class.organization_id, target_class.id) then
    raise exception 'Only organization admins or the class teacher can change class visibility';
  end if;

  update public.classes
  set organization_visible = visible_to_organization,
      updated_at = now()
  where id = target_class.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    target_class.organization_id,
    current_user_id,
    'class.organization_visibility_updated',
    'class',
    target_class.id,
    jsonb_build_object('organization_visible', visible_to_organization)
  );

  return jsonb_build_object(
    'result', 'class_visibility',
    'class_id', target_class.id,
    'organization_visible', visible_to_organization
  );
end;
$$;

create or replace function public.set_class_hidden(
  target_class_id uuid,
  hidden_from_user boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_class public.classes;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into target_class
  from public.classes
  where id = target_class_id;

  if target_class.id is null then
    raise exception 'Class not found';
  end if;

  if not public.is_org_member(target_class.organization_id) then
    raise exception 'Only organization members can hide classes';
  end if;

  if hidden_from_user then
    insert into public.class_visibility_preferences (
      organization_id,
      class_id,
      user_id,
      hidden,
      hidden_at
    )
    values (
      target_class.organization_id,
      target_class.id,
      current_user_id,
      true,
      now()
    )
    on conflict (class_id, user_id) do update
      set hidden = true,
          hidden_at = now(),
          updated_at = now();
  else
    delete from public.class_visibility_preferences
    where class_id = target_class.id
      and user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'result', case when hidden_from_user then 'hidden' else 'shown' end,
    'class_id', target_class.id,
    'organization_id', target_class.organization_id
  );
end;
$$;

revoke all on function public.set_class_organization_visibility(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.set_class_hidden(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.set_class_organization_visibility(uuid, boolean)
  to authenticated;
grant execute on function public.set_class_hidden(uuid, boolean)
  to authenticated;
