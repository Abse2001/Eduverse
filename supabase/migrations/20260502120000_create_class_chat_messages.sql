do $$
begin
  create type public.class_message_kind as enum ('text', 'announcement', 'media');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.class_material_source as enum ('manual', 'chat');
exception
  when duplicate_object then null;
end $$;

alter table public.class_materials
  add column if not exists source public.class_material_source not null default 'manual',
  add column if not exists chat_message_id uuid;

create table if not exists public.class_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  sender_user_id uuid not null references public.profiles (id) on delete restrict,
  content text not null default '',
  kind public.class_message_kind not null,
  material_id uuid references public.class_materials (id) on delete set null,
  media_title text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  material_type public.class_material_type,
  created_at timestamptz not null default now(),
  constraint class_messages_content_for_text check (
    kind = 'media' or btrim(content) <> ''
  ),
  constraint class_messages_media_snapshot check (
    kind <> 'media'
    or (
      btrim(coalesce(media_title, '')) <> ''
      and btrim(coalesce(original_filename, '')) <> ''
      and btrim(coalesce(mime_type, '')) <> ''
      and size_bytes is not null
      and size_bytes >= 0
      and material_type is not null
    )
  )
);

alter table public.class_materials
  drop constraint if exists class_materials_chat_message_id_fkey;

alter table public.class_materials
  add constraint class_materials_chat_message_id_fkey
  foreign key (chat_message_id) references public.class_messages (id) on delete set null
  deferrable initially deferred;

create index if not exists idx_class_messages_class_created
  on public.class_messages (class_id, created_at asc);

create index if not exists idx_class_messages_sender
  on public.class_messages (sender_user_id);

create index if not exists idx_class_messages_material
  on public.class_messages (material_id);

create index if not exists idx_class_materials_source
  on public.class_materials (source, created_at desc)
  where deleted_at is null;

create or replace function public.validate_class_message()
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
    raise exception 'Class message organization mismatch';
  end if;

  if not (
    public.is_class_member(new.organization_id, new.class_id)
    or public.can_manage_class(new.organization_id, new.class_id)
  ) then
    raise exception 'Sender must belong to the class';
  end if;

  if new.sender_user_id <> auth.uid() then
    raise exception 'Sender must be the authenticated user';
  end if;

  if new.kind = 'announcement'
    and not public.can_manage_class(new.organization_id, new.class_id) then
    raise exception 'Only class managers can post announcements';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_class_message on public.class_messages;
create trigger validate_class_message
  before insert or update on public.class_messages
  for each row execute procedure public.validate_class_message();

alter table public.class_messages enable row level security;

drop policy if exists "class members can read class messages" on public.class_messages;
create policy "class members can read class messages"
  on public.class_messages
  for select
  using (
    public.is_class_member(organization_id, class_id)
    or public.can_manage_class(organization_id, class_id)
  );

drop policy if exists "class members can create class messages" on public.class_messages;
create policy "class members can create class messages"
  on public.class_messages
  for insert
  with check (
    sender_user_id = auth.uid()
    and (
      public.is_class_member(organization_id, class_id)
      or public.can_manage_class(organization_id, class_id)
    )
    and (
      kind <> 'announcement'
      or public.can_manage_class(organization_id, class_id)
    )
  );

drop policy if exists "class members can create chat materials" on public.class_materials;
create policy "class members can create chat materials"
  on public.class_materials
  for insert
  with check (
    source = 'chat'
    and uploaded_by_user_id = auth.uid()
    and (
      public.is_class_member(organization_id, class_id)
      or public.can_manage_class(organization_id, class_id)
    )
  );
