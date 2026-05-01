do $$
begin
  create type public.feature_kind as enum ('core', 'extension');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.feature_definitions (
  key text primary key,
  label text not null,
  description text not null default '',
  parent_key text references public.feature_definitions (key) on delete cascade,
  kind public.feature_kind not null default 'core',
  route_segment text,
  default_enabled boolean not null default true,
  is_system boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_definitions_no_self_parent check (parent_key is null or parent_key <> key)
);

alter table public.feature_definitions
  add column if not exists description text not null default '',
  add column if not exists parent_key text references public.feature_definitions (key) on delete cascade,
  add column if not exists kind public.feature_kind not null default 'core',
  add column if not exists route_segment text,
  add column if not exists default_enabled boolean not null default true,
  add column if not exists is_system boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.feature_presets (
  key text primary key,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_preset_items (
  preset_key text not null references public.feature_presets (key) on delete cascade,
  feature_key text not null references public.feature_definitions (key) on delete cascade,
  enabled boolean not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (preset_key, feature_key)
);

create table if not exists public.organization_feature_settings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_key text not null references public.feature_definitions (key) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_key)
);

create table if not exists public.class_feature_settings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  feature_key text not null references public.feature_definitions (key) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id, feature_key)
);

create index if not exists idx_feature_definitions_parent
  on public.feature_definitions (parent_key);

create index if not exists idx_feature_definitions_sort
  on public.feature_definitions (sort_order);

create index if not exists idx_feature_preset_items_feature
  on public.feature_preset_items (feature_key);

create index if not exists idx_org_feature_settings_feature
  on public.organization_feature_settings (feature_key);

create index if not exists idx_class_feature_settings_org
  on public.class_feature_settings (organization_id);

create index if not exists idx_class_feature_settings_feature
  on public.class_feature_settings (feature_key);

create or replace function public.validate_organization_feature_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_feature_key text;
begin
  select parent_key
  into parent_feature_key
  from public.feature_definitions
  where key = new.feature_key;

  if new.enabled and parent_feature_key is not null then
    if not public.is_organization_feature_enabled(new.organization_id, parent_feature_key) then
      raise exception 'Parent feature % must be enabled for organization feature %', parent_feature_key, new.feature_key;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_class_feature_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class_org_id uuid;
begin
  select organization_id
  into target_class_org_id
  from public.classes
  where id = new.class_id;

  if target_class_org_id is null then
    raise exception 'Class % does not exist', new.class_id;
  end if;

  if new.organization_id <> target_class_org_id then
    raise exception 'Class % does not belong to organization %', new.class_id, new.organization_id;
  end if;

  if new.enabled and not public.is_organization_feature_enabled(new.organization_id, new.feature_key) then
    raise exception 'Feature % is disabled for organization %', new.feature_key, new.organization_id;
  end if;

  return new;
end;
$$;

create or replace function public.is_organization_feature_enabled(
  target_org_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive feature_tree as (
    select fd.key, fd.parent_key, fd.default_enabled
    from public.feature_definitions fd
    where fd.key = target_feature_key

    union all

    select parent_fd.key, parent_fd.parent_key, parent_fd.default_enabled
    from public.feature_definitions parent_fd
    join feature_tree child_fd on child_fd.parent_key = parent_fd.key
  )
  select coalesce(bool_and(coalesce(ofs.enabled, fd.default_enabled)), false)
  from feature_tree fd
  left join public.organization_feature_settings ofs
    on ofs.organization_id = target_org_id
   and ofs.feature_key = fd.key;
$$;

create or replace function public.is_class_feature_enabled(
  target_class_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive target_class as (
    select id, organization_id
    from public.classes
    where id = target_class_id
      and is_archived = false
  ),
  recursive_feature_tree as (
    select fd.key, fd.parent_key, fd.default_enabled
    from public.feature_definitions fd
    where fd.key = target_feature_key

    union all

    select parent_fd.key, parent_fd.parent_key, parent_fd.default_enabled
    from public.feature_definitions parent_fd
    join recursive_feature_tree child_fd on child_fd.parent_key = parent_fd.key
  )
  select coalesce(
    bool_and(
      coalesce(ofs.enabled, fd.default_enabled)
      and coalesce(cfs.enabled, true)
    ),
    false
  )
  from target_class tc
  cross join recursive_feature_tree fd
  left join public.organization_feature_settings ofs
    on ofs.organization_id = tc.organization_id
   and ofs.feature_key = fd.key
  left join public.class_feature_settings cfs
    on cfs.class_id = tc.id
   and cfs.feature_key = fd.key;
$$;

drop trigger if exists set_feature_definitions_updated_at on public.feature_definitions;
create trigger set_feature_definitions_updated_at
  before update on public.feature_definitions
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_feature_presets_updated_at on public.feature_presets;
create trigger set_feature_presets_updated_at
  before update on public.feature_presets
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_feature_preset_items_updated_at on public.feature_preset_items;
create trigger set_feature_preset_items_updated_at
  before update on public.feature_preset_items
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_organization_feature_settings_updated_at on public.organization_feature_settings;
create trigger set_organization_feature_settings_updated_at
  before update on public.organization_feature_settings
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_class_feature_settings_updated_at on public.class_feature_settings;
create trigger set_class_feature_settings_updated_at
  before update on public.class_feature_settings
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_organization_feature_setting on public.organization_feature_settings;
create trigger validate_organization_feature_setting
  before insert or update on public.organization_feature_settings
  for each row execute procedure public.validate_organization_feature_setting();

drop trigger if exists validate_class_feature_setting on public.class_feature_settings;
create trigger validate_class_feature_setting
  before insert or update on public.class_feature_settings
  for each row execute procedure public.validate_class_feature_setting();

alter table public.feature_definitions enable row level security;
alter table public.feature_presets enable row level security;
alter table public.feature_preset_items enable row level security;
alter table public.organization_feature_settings enable row level security;
alter table public.class_feature_settings enable row level security;

drop policy if exists "authenticated users can read feature definitions" on public.feature_definitions;
create policy "authenticated users can read feature definitions"
  on public.feature_definitions
  for select
  using (auth.uid() is not null);

drop policy if exists "org admins can manage feature definitions" on public.feature_definitions;
create policy "org admins can manage feature definitions"
  on public.feature_definitions
  for all
  using (false)
  with check (false);

drop policy if exists "authenticated users can read feature presets" on public.feature_presets;
create policy "authenticated users can read feature presets"
  on public.feature_presets
  for select
  using (auth.uid() is not null);

drop policy if exists "authenticated users can read feature preset items" on public.feature_preset_items;
create policy "authenticated users can read feature preset items"
  on public.feature_preset_items
  for select
  using (auth.uid() is not null);

drop policy if exists "org members can read organization features" on public.organization_feature_settings;
create policy "org members can read organization features"
  on public.organization_feature_settings
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "org admins can manage organization features" on public.organization_feature_settings;
create policy "org admins can manage organization features"
  on public.organization_feature_settings
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']));

drop policy if exists "org members can read class features" on public.class_feature_settings;
create policy "org members can read class features"
  on public.class_feature_settings
  for select
  using (public.is_org_member(organization_id));

drop policy if exists "class managers can manage class features" on public.class_feature_settings;
create policy "class managers can manage class features"
  on public.class_feature_settings
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

insert into public.feature_definitions (
  key,
  label,
  description,
  parent_key,
  kind,
  route_segment,
  default_enabled,
  sort_order,
  metadata
)
values
  (
    'home',
    'Home',
    'Class overview and default landing page.',
    null,
    'core',
    'home',
    true,
    10,
    '{"locked": true}'::jsonb
  ),
  (
    'chat',
    'Chat',
    'Class discussion, announcements, and file sharing.',
    null,
    'core',
    'chat',
    true,
    20,
    '{}'::jsonb
  ),
  (
    'materials',
    'Materials',
    'Shared class resources and learning materials.',
    null,
    'core',
    'materials',
    true,
    30,
    '{}'::jsonb
  ),
  (
    'assignments',
    'Assignments',
    'Assignments, quizzes, labs, and submissions.',
    null,
    'core',
    'assignments',
    true,
    40,
    '{}'::jsonb
  ),
  (
    'sessions',
    'Sessions',
    'Live class sessions and realtime collaboration.',
    null,
    'core',
    'session',
    true,
    50,
    '{}'::jsonb
  ),
  (
    'exam',
    'Exam',
    'Timed exams, exam attempts, and exam grading.',
    null,
    'core',
    'exam',
    true,
    60,
    '{}'::jsonb
  ),
  (
    'leaderboard',
    'Results',
    'Class leaderboard and performance summaries.',
    null,
    'core',
    'leaderboard',
    true,
    70,
    '{}'::jsonb
  ),
  (
    'extensions',
    'Extensions',
    'Container for built-in and custom class extensions.',
    null,
    'extension',
    null,
    true,
    80,
    '{}'::jsonb
  ),
  (
    'extensions.ide',
    'IDE',
    'Code editor and programming workspace extension.',
    'extensions',
    'extension',
    'ide',
    true,
    90,
    '{"extension_type": "built_in"}'::jsonb
  )
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      parent_key = excluded.parent_key,
      kind = excluded.kind,
      route_segment = excluded.route_segment,
      default_enabled = excluded.default_enabled,
      is_system = true,
      sort_order = excluded.sort_order,
      metadata = excluded.metadata,
      updated_at = now();

insert into public.feature_presets (key, name, description)
values
  ('kindergarten', 'Kindergarten', 'Simple classroom defaults without formal exams or live sessions.'),
  ('primary_school', 'Primary School', 'Core classroom defaults with sessions disabled.'),
  ('university', 'University', 'Full academic defaults with sessions, exams, and extensions enabled.')
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      updated_at = now();

insert into public.feature_preset_items (preset_key, feature_key, enabled)
values
  ('kindergarten', 'home', true),
  ('kindergarten', 'chat', true),
  ('kindergarten', 'materials', true),
  ('kindergarten', 'assignments', true),
  ('kindergarten', 'sessions', false),
  ('kindergarten', 'exam', false),
  ('kindergarten', 'leaderboard', true),
  ('kindergarten', 'extensions', false),
  ('kindergarten', 'extensions.ide', false),
  ('primary_school', 'home', true),
  ('primary_school', 'chat', true),
  ('primary_school', 'materials', true),
  ('primary_school', 'assignments', true),
  ('primary_school', 'sessions', false),
  ('primary_school', 'exam', true),
  ('primary_school', 'leaderboard', true),
  ('primary_school', 'extensions', false),
  ('primary_school', 'extensions.ide', false),
  ('university', 'home', true),
  ('university', 'chat', true),
  ('university', 'materials', true),
  ('university', 'assignments', true),
  ('university', 'sessions', true),
  ('university', 'exam', true),
  ('university', 'leaderboard', true),
  ('university', 'extensions', true),
  ('university', 'extensions.ide', true)
on conflict (preset_key, feature_key) do update
  set enabled = excluded.enabled,
      config = excluded.config,
      updated_at = now();

insert into public.organization_feature_settings (
  organization_id,
  feature_key,
  enabled
)
select
  organizations.id,
  feature_definitions.key,
  feature_definitions.default_enabled
from public.organizations
cross join public.feature_definitions
order by organizations.id, feature_definitions.sort_order
on conflict (organization_id, feature_key) do nothing;

insert into public.class_feature_settings (
  organization_id,
  class_id,
  feature_key,
  enabled
)
select
  classes.organization_id,
  classes.id,
  feature_definitions.key,
  true
from public.classes
cross join public.feature_definitions
order by classes.id, feature_definitions.sort_order
on conflict (class_id, feature_key) do nothing;
