create table if not exists public.organization_extensions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  launch_url text,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.class_extension_settings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  extension_id uuid not null references public.organization_extensions (id) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id, extension_id)
);

create index if not exists idx_org_extensions_org
  on public.organization_extensions (organization_id);

create index if not exists idx_class_extension_settings_org
  on public.class_extension_settings (organization_id);

create index if not exists idx_class_extension_settings_extension
  on public.class_extension_settings (extension_id);

create or replace function public.validate_class_extension_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class_org_id uuid;
  target_extension_org_id uuid;
begin
  select organization_id
  into target_class_org_id
  from public.classes
  where id = new.class_id;

  select organization_id
  into target_extension_org_id
  from public.organization_extensions
  where id = new.extension_id;

  if target_class_org_id is null then
    raise exception 'Class % does not exist', new.class_id;
  end if;

  if target_extension_org_id is null then
    raise exception 'Extension % does not exist', new.extension_id;
  end if;

  if new.organization_id <> target_class_org_id
    or new.organization_id <> target_extension_org_id then
    raise exception 'Class extension setting organization mismatch';
  end if;

  if new.enabled and not exists (
    select 1
    from public.organization_extensions
    where id = new.extension_id
      and enabled = true
  ) then
    raise exception 'Extension % is disabled for this organization', new.extension_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_organization_extensions_updated_at on public.organization_extensions;
create trigger set_organization_extensions_updated_at
  before update on public.organization_extensions
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_class_extension_settings_updated_at on public.class_extension_settings;
create trigger set_class_extension_settings_updated_at
  before update on public.class_extension_settings
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_class_extension_setting on public.class_extension_settings;
create trigger validate_class_extension_setting
  before insert or update on public.class_extension_settings
  for each row execute procedure public.validate_class_extension_setting();

alter table public.organization_extensions enable row level security;
alter table public.class_extension_settings enable row level security;

drop policy if exists "org members can read organization extensions" on public.organization_extensions;
create policy "org members can read organization extensions"
  on public.organization_extensions
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "org admins can manage organization extensions" on public.organization_extensions;
create policy "org admins can manage organization extensions"
  on public.organization_extensions
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']));

drop policy if exists "org members can read class extension settings" on public.class_extension_settings;
create policy "org members can read class extension settings"
  on public.class_extension_settings
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "class managers can manage class extension settings" on public.class_extension_settings;
create policy "class managers can manage class extension settings"
  on public.class_extension_settings
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create or replace function public.seed_class_extension_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.class_extension_settings (
    organization_id,
    class_id,
    extension_id,
    enabled,
    config
  )
  select
    new.organization_id,
    new.id,
    organization_extensions.id,
    true,
    '{}'::jsonb
  from public.organization_extensions
  where organization_extensions.organization_id = new.organization_id
    and organization_extensions.enabled = true
  on conflict (class_id, extension_id) do nothing;

  return new;
end;
$$;

create or replace function public.seed_organization_extension_class_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.class_extension_settings (
    organization_id,
    class_id,
    extension_id,
    enabled,
    config
  )
  select
    new.organization_id,
    classes.id,
    new.id,
    true,
    '{}'::jsonb
  from public.classes
  where classes.organization_id = new.organization_id
    and classes.is_archived = false
    and new.enabled = true
  on conflict (class_id, extension_id) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_class_extension_settings_after_insert on public.classes;
create trigger seed_class_extension_settings_after_insert
  after insert on public.classes
  for each row execute procedure public.seed_class_extension_settings();

drop trigger if exists seed_organization_extension_class_settings_after_insert on public.organization_extensions;
create trigger seed_organization_extension_class_settings_after_insert
  after insert on public.organization_extensions
  for each row execute procedure public.seed_organization_extension_class_settings();

insert into public.class_extension_settings (
  organization_id,
  class_id,
  extension_id,
  enabled,
  config
)
select
  classes.organization_id,
  classes.id,
  organization_extensions.id,
  true,
  '{}'::jsonb
from public.classes
join public.organization_extensions
  on organization_extensions.organization_id = classes.organization_id
where organization_extensions.enabled = true
on conflict (class_id, extension_id) do nothing;
