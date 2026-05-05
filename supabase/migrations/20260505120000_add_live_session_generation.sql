alter table public.class_live_sessions
  add column if not exists live_session_id uuid not null default gen_random_uuid();

create index if not exists idx_class_live_sessions_live_session_id
  on public.class_live_sessions (live_session_id);
