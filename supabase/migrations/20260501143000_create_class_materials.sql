do $$
begin
  create type public.class_material_type as enum ('image', 'pdf', 'video', 'slide');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.class_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  uploaded_by_user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  description text not null default '',
  type public.class_material_type not null,
  storage_bucket text not null,
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint class_materials_title_not_blank check (btrim(title) <> ''),
  constraint class_materials_storage_bucket_not_blank check (btrim(storage_bucket) <> ''),
  constraint class_materials_storage_key_not_blank check (btrim(storage_key) <> ''),
  constraint class_materials_original_filename_not_blank check (btrim(original_filename) <> ''),
  constraint class_materials_mime_type_not_blank check (btrim(mime_type) <> ''),
  constraint class_materials_size_bytes_non_negative check (size_bytes >= 0),
  unique (storage_bucket, storage_key)
);

create index if not exists idx_class_materials_class_created
  on public.class_materials (class_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_class_materials_org
  on public.class_materials (organization_id);

create index if not exists idx_class_materials_uploader
  on public.class_materials (uploaded_by_user_id);

create or replace function public.is_class_member(
  target_org_id uuid,
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships
    where class_memberships.organization_id = target_org_id
      and class_memberships.class_id = target_class_id
      and class_memberships.user_id = auth.uid()
  );
$$;

create or replace function public.validate_class_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class_org_id uuid;
  should_validate_uploader boolean := false;
begin
  select organization_id
  into target_class_org_id
  from public.classes
  where id = new.class_id;

  if target_class_org_id is null then
    raise exception 'Class % does not exist', new.class_id;
  end if;

  if new.organization_id <> target_class_org_id then
    raise exception 'Class material organization mismatch';
  end if;

  if tg_op = 'INSERT' then
    should_validate_uploader := true;
  elsif new.organization_id is distinct from old.organization_id
    or new.uploaded_by_user_id is distinct from old.uploaded_by_user_id then
    should_validate_uploader := true;
  end if;

  if should_validate_uploader then
    if not exists (
      select 1
      from public.organization_memberships
      join public.organization_membership_roles
        on organization_membership_roles.organization_membership_id = organization_memberships.id
      where organization_memberships.organization_id = new.organization_id
        and organization_memberships.user_id = new.uploaded_by_user_id
        and organization_memberships.status = 'active'
        and organization_membership_roles.status = 'active'
    ) then
      raise exception 'Uploader must belong to the material organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_class_materials_updated_at on public.class_materials;
create trigger set_class_materials_updated_at
  before update on public.class_materials
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_class_material on public.class_materials;
create trigger validate_class_material
  before insert or update on public.class_materials
  for each row execute procedure public.validate_class_material();

alter table public.class_materials enable row level security;

drop policy if exists "class members can read class materials" on public.class_materials;
create policy "class members can read class materials"
  on public.class_materials
  for select
  using (
    deleted_at is null
    and (
      public.is_class_member(organization_id, class_id)
      or public.can_manage_class(organization_id, class_id)
    )
  );

drop policy if exists "class managers can create class materials" on public.class_materials;
create policy "class managers can create class materials"
  on public.class_materials
  for insert
  with check (
    public.can_manage_class(organization_id, class_id)
    and uploaded_by_user_id = auth.uid()
  );

drop policy if exists "class managers can update class materials" on public.class_materials;
create policy "class managers can update class materials"
  on public.class_materials
  for update
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

drop policy if exists "class managers can delete class materials" on public.class_materials;
create policy "class managers can delete class materials"
  on public.class_materials
  for delete
  using (public.can_manage_class(organization_id, class_id));
