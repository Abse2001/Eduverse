create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('org_owner', 'org_admin', 'teacher', 'student');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.membership_status as enum ('active', 'invited', 'suspended');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.class_membership_role as enum ('teacher', 'student', 'ta');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_kind as enum ('text', 'image', 'file', 'announcement');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.material_kind as enum ('pdf', 'video', 'link', 'code', 'slide');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.assignment_kind as enum ('assignment', 'quiz', 'exam', 'lab');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.submission_status as enum ('draft', 'submitted', 'graded');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.exam_status as enum ('upcoming', 'live', 'ended');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.exam_question_kind as enum ('mcq', 'short', 'code');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.exam_attempt_status as enum ('in_progress', 'submitted', 'graded');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.upload_status as enum ('pending', 'ready', 'deleted');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.live_session_status as enum ('scheduled', 'live', 'ended');
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_path text,
  default_organization_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.app_role not null,
  invited_by_user_id uuid references auth.users (id) on delete set null,
  token text not null unique,
  status public.membership_status not null default 'invited',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null,
  subject text not null,
  teacher_user_id uuid references auth.users (id) on delete set null,
  color text,
  description text not null default '',
  schedule_text text,
  room text,
  semester text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.class_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.class_membership_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  message_type public.message_kind not null default 'text',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  bucket_name text not null,
  object_key text not null unique,
  original_file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by_user_id uuid not null references auth.users (id) on delete cascade,
  upload_status public.upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null,
  material_type public.material_kind not null,
  description text,
  link_url text,
  bucket_name text,
  object_key text unique,
  mime_type text,
  size_bytes bigint,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null,
  description text not null default '',
  due_at timestamptz,
  max_score integer not null check (max_score >= 0),
  assignment_type public.assignment_kind not null,
  has_ide boolean not null default false,
  created_by_user_id uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  score numeric(6,2),
  feedback text,
  code_content text,
  graded_by_user_id uuid references auth.users (id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_user_id)
);

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  bucket_name text not null,
  object_key text not null unique,
  original_file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by_user_id uuid not null references auth.users (id) on delete cascade,
  upload_status public.upload_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  total_points integer not null check (total_points >= 0),
  start_at timestamptz,
  end_at timestamptz,
  status public.exam_status not null default 'upcoming',
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  position integer not null check (position > 0),
  question_type public.exam_question_kind not null,
  prompt text not null,
  options_json jsonb,
  correct_answer_json jsonb,
  points integer not null check (points >= 0),
  language text,
  starter_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, position)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  status public.exam_attempt_status not null default 'in_progress',
  started_at timestamptz,
  submitted_at timestamptz,
  total_score numeric(6,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_user_id)
);

create table if not exists public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  exam_attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  exam_question_id uuid not null references public.exam_questions (id) on delete cascade,
  answer_json jsonb,
  auto_score numeric(6,2),
  teacher_score numeric(6,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_attempt_id, exam_question_id)
);

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  created_by_user_id uuid references auth.users (id) on delete set null,
  room_name text not null unique,
  status public.live_session_status not null default 'scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_default_org
  on public.profiles (default_organization_id);

create index if not exists idx_org_memberships_user
  on public.organization_memberships (user_id);

create index if not exists idx_classes_org
  on public.classes (organization_id);

create index if not exists idx_class_memberships_class
  on public.class_memberships (class_id);

create index if not exists idx_class_memberships_user
  on public.class_memberships (user_id);

create index if not exists idx_messages_class_created
  on public.messages (class_id, created_at desc);

create index if not exists idx_message_attachments_message
  on public.message_attachments (message_id);

create index if not exists idx_materials_class_created
  on public.materials (class_id, created_at desc);

create index if not exists idx_assignments_class_due
  on public.assignments (class_id, due_at);

create index if not exists idx_submissions_assignment
  on public.submissions (assignment_id);

create index if not exists idx_submissions_student
  on public.submissions (student_user_id);

create index if not exists idx_exams_class_start
  on public.exams (class_id, start_at);

create index if not exists idx_exam_questions_exam
  on public.exam_questions (exam_id, position);

create index if not exists idx_exam_attempts_exam
  on public.exam_attempts (exam_id);

create index if not exists idx_live_sessions_class
  on public.live_sessions (class_id, status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), 'user')
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role::text = any (allowed_roles)
  );
$$;

create or replace function public.has_class_role(target_class_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships cm
    where cm.class_id = target_class_id
      and cm.user_id = auth.uid()
      and cm.role::text = any (allowed_roles)
  );
$$;

create or replace function public.is_class_member(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships cm
    where cm.class_id = target_class_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_class(target_org_id uuid, target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_org_role(target_org_id, array['org_owner', 'org_admin'])
    or public.has_class_role(target_class_id, array['teacher', 'ta']);
$$;

create trigger set_organizations_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_org_memberships_updated_at
  before update on public.organization_memberships
  for each row execute procedure public.set_updated_at();

create trigger set_org_invites_updated_at
  before update on public.organization_invites
  for each row execute procedure public.set_updated_at();

create trigger set_classes_updated_at
  before update on public.classes
  for each row execute procedure public.set_updated_at();

create trigger set_class_memberships_updated_at
  before update on public.class_memberships
  for each row execute procedure public.set_updated_at();

create trigger set_messages_updated_at
  before update on public.messages
  for each row execute procedure public.set_updated_at();

create trigger set_message_attachments_updated_at
  before update on public.message_attachments
  for each row execute procedure public.set_updated_at();

create trigger set_materials_updated_at
  before update on public.materials
  for each row execute procedure public.set_updated_at();

create trigger set_assignments_updated_at
  before update on public.assignments
  for each row execute procedure public.set_updated_at();

create trigger set_submissions_updated_at
  before update on public.submissions
  for each row execute procedure public.set_updated_at();

create trigger set_submission_files_updated_at
  before update on public.submission_files
  for each row execute procedure public.set_updated_at();

create trigger set_exams_updated_at
  before update on public.exams
  for each row execute procedure public.set_updated_at();

create trigger set_exam_questions_updated_at
  before update on public.exam_questions
  for each row execute procedure public.set_updated_at();

create trigger set_exam_attempts_updated_at
  before update on public.exam_attempts
  for each row execute procedure public.set_updated_at();

create trigger set_exam_answers_updated_at
  before update on public.exam_answers
  for each row execute procedure public.set_updated_at();

create trigger set_live_sessions_updated_at
  before update on public.live_sessions
  for each row execute procedure public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invites enable row level security;
alter table public.classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.materials enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;
alter table public.live_sessions enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can read organizations"
  on public.organizations
  for select
  using (public.is_org_member(id));

create policy "org owners and admins can update organizations"
  on public.organizations
  for update
  using (public.has_org_role(id, array['org_owner', 'org_admin']))
  with check (public.has_org_role(id, array['org_owner', 'org_admin']));

create policy "users can read their own profile"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or (
      exists (
        select 1
        from public.organization_memberships viewer_membership
        join public.organization_memberships target_membership
          on target_membership.organization_id = viewer_membership.organization_id
        where viewer_membership.user_id = auth.uid()
          and viewer_membership.status = 'active'
          and target_membership.user_id = profiles.id
          and target_membership.status = 'active'
      )
    )
  );

create policy "users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users can read their memberships"
  on public.organization_memberships
  for select
  using (
    auth.uid() = user_id
    or public.has_org_role(organization_id, array['org_owner', 'org_admin'])
  );

create policy "org admins can manage memberships"
  on public.organization_memberships
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']));

create policy "org admins can manage invites"
  on public.organization_invites
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']));

create policy "org members can read classes"
  on public.classes
  for select
  using (public.is_org_member(organization_id));

create policy "class managers can manage classes"
  on public.classes
  for all
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']))
  with check (public.has_org_role(organization_id, array['org_owner', 'org_admin']));

create policy "org members can read class memberships"
  on public.class_memberships
  for select
  using (public.is_org_member(organization_id));

create policy "class managers can manage class memberships"
  on public.class_memberships
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create policy "class members can read messages"
  on public.messages
  for select
  using (public.is_class_member(class_id));

create policy "class members can create messages"
  on public.messages
  for insert
  with check (
    auth.uid() = sender_user_id
    and public.is_class_member(class_id)
    and (
      message_type <> 'announcement'
      or public.can_manage_class(organization_id, class_id)
    )
  );

create policy "message senders or class managers can update messages"
  on public.messages
  for update
  using (
    auth.uid() = sender_user_id
    or public.can_manage_class(organization_id, class_id)
  )
  with check (
    auth.uid() = sender_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "class members can read message attachments"
  on public.message_attachments
  for select
  using (public.is_class_member(class_id));

create policy "uploaders or class managers can manage message attachments"
  on public.message_attachments
  for all
  using (
    auth.uid() = uploaded_by_user_id
    or public.can_manage_class(organization_id, class_id)
  )
  with check (
    auth.uid() = uploaded_by_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "class members can read materials"
  on public.materials
  for select
  using (public.is_class_member(class_id));

create policy "class managers can manage materials"
  on public.materials
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create policy "class members can read assignments"
  on public.assignments
  for select
  using (public.is_class_member(class_id));

create policy "class managers can manage assignments"
  on public.assignments
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create policy "students can read own submissions and staff can read all"
  on public.submissions
  for select
  using (
    auth.uid() = student_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "students can create and update own submissions"
  on public.submissions
  for insert
  with check (
    auth.uid() = student_user_id
    and public.is_class_member(class_id)
  );

create policy "students or staff can update submissions"
  on public.submissions
  for update
  using (
    auth.uid() = student_user_id
    or public.can_manage_class(organization_id, class_id)
  )
  with check (
    auth.uid() = student_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "submission owners and staff can read submission files"
  on public.submission_files
  for select
  using (
    exists (
      select 1
      from public.submissions s
      where s.id = submission_id
        and (
          s.student_user_id = auth.uid()
          or public.can_manage_class(s.organization_id, s.class_id)
        )
    )
  );

create policy "submission uploaders and staff can manage submission files"
  on public.submission_files
  for all
  using (
    auth.uid() = uploaded_by_user_id
    or public.can_manage_class(organization_id, class_id)
  )
  with check (
    auth.uid() = uploaded_by_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "class members can read exams"
  on public.exams
  for select
  using (public.is_class_member(class_id));

create policy "class managers can manage exams"
  on public.exams
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create policy "class members can read exam questions"
  on public.exam_questions
  for select
  using (
    exists (
      select 1
      from public.exams e
      where e.id = exam_id
        and public.is_class_member(e.class_id)
    )
  );

create policy "class managers can manage exam questions"
  on public.exam_questions
  for all
  using (
    exists (
      select 1
      from public.exams e
      where e.id = exam_id
        and public.can_manage_class(e.organization_id, e.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.exams e
      where e.id = exam_id
        and public.can_manage_class(e.organization_id, e.class_id)
    )
  );

create policy "students can read own attempts and staff can read all"
  on public.exam_attempts
  for select
  using (
    auth.uid() = student_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "students can create own attempts"
  on public.exam_attempts
  for insert
  with check (
    auth.uid() = student_user_id
    and public.is_class_member(class_id)
  );

create policy "students or staff can update attempts"
  on public.exam_attempts
  for update
  using (
    auth.uid() = student_user_id
    or public.can_manage_class(organization_id, class_id)
  )
  with check (
    auth.uid() = student_user_id
    or public.can_manage_class(organization_id, class_id)
  );

create policy "attempt owners and staff can read exam answers"
  on public.exam_answers
  for select
  using (
    exists (
      select 1
      from public.exam_attempts ea
      where ea.id = exam_attempt_id
        and (
          ea.student_user_id = auth.uid()
          or public.can_manage_class(ea.organization_id, ea.class_id)
        )
    )
  );

create policy "attempt owners and staff can manage exam answers"
  on public.exam_answers
  for all
  using (
    exists (
      select 1
      from public.exam_attempts ea
      where ea.id = exam_attempt_id
        and (
          ea.student_user_id = auth.uid()
          or public.can_manage_class(ea.organization_id, ea.class_id)
        )
    )
  )
  with check (
    exists (
      select 1
      from public.exam_attempts ea
      where ea.id = exam_attempt_id
        and (
          ea.student_user_id = auth.uid()
          or public.can_manage_class(ea.organization_id, ea.class_id)
        )
    )
  );

create policy "class members can read live sessions"
  on public.live_sessions
  for select
  using (public.is_class_member(class_id));

create policy "class managers can manage live sessions"
  on public.live_sessions
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

create policy "org admins can read audit logs"
  on public.audit_logs
  for select
  using (public.has_org_role(organization_id, array['org_owner', 'org_admin']));

create or replace view public.class_leaderboard as
with submission_scores as (
  select
    s.organization_id,
    s.class_id,
    s.student_user_id,
    coalesce(sum(s.score), 0) as submission_total,
    count(s.assignment_id) filter (where s.score is not null) as assignments_count,
    avg(s.score) as assignment_average
  from public.submissions s
  group by s.organization_id, s.class_id, s.student_user_id
),
exam_scores as (
  select
    ea.organization_id,
    ea.class_id,
    ea.student_user_id,
    coalesce(sum(ea.total_score), 0) as exam_total
  from public.exam_attempts ea
  group by ea.organization_id, ea.class_id, ea.student_user_id
),
combined as (
  select
    coalesce(ss.organization_id, es.organization_id) as organization_id,
    coalesce(ss.class_id, es.class_id) as class_id,
    coalesce(ss.student_user_id, es.student_user_id) as student_user_id,
    coalesce(ss.submission_total, 0) + coalesce(es.exam_total, 0) as total_score,
    coalesce(ss.assignments_count, 0) as assignments_count,
    ss.assignment_average
  from submission_scores ss
  full outer join exam_scores es
    on es.organization_id = ss.organization_id
   and es.class_id = ss.class_id
   and es.student_user_id = ss.student_user_id
)
select
  combined.organization_id,
  combined.class_id,
  combined.student_user_id,
  combined.total_score,
  row_number() over (
    partition by combined.class_id
    order by combined.total_score desc, combined.student_user_id
  ) as rank,
  combined.assignments_count,
  combined.assignment_average
from combined;
