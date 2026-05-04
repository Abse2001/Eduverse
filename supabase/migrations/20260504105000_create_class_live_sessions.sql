create table if not exists public.class_live_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  room_name text not null,
  started_by_user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'live',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_live_sessions_status_valid check (status in ('live', 'ended')),
  constraint class_live_sessions_room_name_not_blank check (btrim(room_name) <> ''),
  unique (class_id)
);

create index if not exists idx_class_live_sessions_org_status
  on public.class_live_sessions (organization_id, status, last_seen_at desc);

drop trigger if exists set_class_live_sessions_updated_at on public.class_live_sessions;
create trigger set_class_live_sessions_updated_at
  before update on public.class_live_sessions
  for each row execute procedure public.set_updated_at();

alter table public.class_live_sessions enable row level security;

revoke all on public.class_live_sessions from anon, authenticated;
grant select, insert, update on public.class_live_sessions to authenticated;

drop policy if exists "class members can read live sessions" on public.class_live_sessions;
create policy "class members can read live sessions"
  on public.class_live_sessions
  for select
  using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin'])
    or public.is_class_member(organization_id, class_id)
    or public.can_manage_class(organization_id, class_id)
  );

drop policy if exists "class managers can create live sessions" on public.class_live_sessions;
create policy "class managers can create live sessions"
  on public.class_live_sessions
  for insert
  with check (
    public.can_manage_class(organization_id, class_id)
    and started_by_user_id = auth.uid()
  );

drop policy if exists "class managers can update live sessions" on public.class_live_sessions;
create policy "class managers can update live sessions"
  on public.class_live_sessions
  for update
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

alter table public.class_live_sessions replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.class_live_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
