create table if not exists public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  created_by_user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  description text not null default '',
  due_at timestamptz not null,
  max_score numeric(8, 2) not null default 100,
  status text not null default 'draft',
  allow_late_submissions boolean not null default true,
  allow_text_submission boolean not null default true,
  allow_file_submission boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint class_assignments_title_not_blank check (btrim(title) <> ''),
  constraint class_assignments_status_valid check (status in ('draft', 'published')),
  constraint class_assignments_max_score_positive check (max_score > 0),
  constraint class_assignments_submission_mode_required check (
    allow_text_submission or allow_file_submission
  )
);

create index if not exists idx_class_assignments_class_due
  on public.class_assignments (class_id, due_at asc)
  where deleted_at is null;

create index if not exists idx_class_assignments_org
  on public.class_assignments (organization_id);

create table if not exists public.class_assignment_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  assignment_id uuid not null references public.class_assignments (id) on delete cascade,
  uploaded_by_user_id uuid not null references public.profiles (id) on delete restrict,
  storage_bucket text not null,
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint class_assignment_files_bucket_not_blank check (btrim(storage_bucket) <> ''),
  constraint class_assignment_files_key_not_blank check (btrim(storage_key) <> ''),
  constraint class_assignment_files_filename_not_blank check (btrim(original_filename) <> ''),
  constraint class_assignment_files_mime_type_not_blank check (btrim(mime_type) <> ''),
  constraint class_assignment_files_size_positive check (size_bytes > 0),
  unique (storage_bucket, storage_key)
);

create index if not exists idx_class_assignment_files_assignment
  on public.class_assignment_files (assignment_id, created_at asc)
  where deleted_at is null;

create table if not exists public.class_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  assignment_id uuid not null references public.class_assignments (id) on delete cascade,
  student_user_id uuid not null references public.profiles (id) on delete cascade,
  text_response text,
  file_storage_bucket text,
  file_storage_key text,
  file_original_filename text,
  file_mime_type text,
  file_size_bytes bigint,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  score numeric(8, 2),
  feedback text not null default '',
  graded_at timestamptz,
  graded_by_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_assignment_submissions_score_non_negative check (score is null or score >= 0),
  constraint class_assignment_submissions_file_complete check (
    (
      file_storage_bucket is null
      and file_storage_key is null
      and file_original_filename is null
      and file_mime_type is null
      and file_size_bytes is null
    )
    or (
      btrim(file_storage_bucket) <> ''
      and btrim(file_storage_key) <> ''
      and btrim(file_original_filename) <> ''
      and btrim(file_mime_type) <> ''
      and file_size_bytes > 0
    )
  ),
  unique (assignment_id, student_user_id),
  unique (file_storage_bucket, file_storage_key)
);

create index if not exists idx_class_assignment_submissions_assignment
  on public.class_assignment_submissions (assignment_id, submitted_at desc);

create index if not exists idx_class_assignment_submissions_student
  on public.class_assignment_submissions (student_user_id, submitted_at desc);

create or replace function public.validate_class_assignment()
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
    raise exception 'Class assignment organization mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_class_assignment_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_assignment public.class_assignments;
begin
  select *
  into target_assignment
  from public.class_assignments
  where id = new.assignment_id;

  if target_assignment.id is null then
    raise exception 'Assignment % does not exist', new.assignment_id;
  end if;

  if new.organization_id <> target_assignment.organization_id
    or new.class_id <> target_assignment.class_id then
    raise exception 'Assignment file class mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_class_assignment_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_assignment public.class_assignments;
  current_user_id uuid := auth.uid();
  current_user_can_manage boolean := false;
  effective_submitted_at timestamptz := now();
begin
  select *
  into target_assignment
  from public.class_assignments
  where id = new.assignment_id;

  if target_assignment.id is null then
    raise exception 'Assignment % does not exist', new.assignment_id;
  end if;

  if new.organization_id <> target_assignment.organization_id
    or new.class_id <> target_assignment.class_id then
    raise exception 'Assignment submission class mismatch';
  end if;

  current_user_can_manage := public.can_manage_class(
    target_assignment.organization_id,
    target_assignment.class_id
  );

  if not current_user_can_manage then
    if current_user_id is null or new.student_user_id <> current_user_id then
      raise exception 'Students can only update their own submissions';
    end if;

    if target_assignment.status <> 'published' then
      raise exception 'Assignment is not published';
    end if;

    if not public.is_class_member(
      target_assignment.organization_id,
      target_assignment.class_id
    ) then
      raise exception 'Student must belong to the assignment class';
    end if;

    if new.text_response is not null
      and btrim(new.text_response) <> ''
      and not target_assignment.allow_text_submission then
      raise exception 'Assignment does not accept text submissions';
    end if;

    if new.file_storage_key is not null
      and not target_assignment.allow_file_submission then
      raise exception 'Assignment does not accept file submissions';
    end if;

    if coalesce(btrim(new.text_response), '') = ''
      and new.file_storage_key is null then
      raise exception 'Submission must include text or a file';
    end if;

    if effective_submitted_at > target_assignment.due_at
      and not target_assignment.allow_late_submissions then
      raise exception 'Assignment no longer accepts submissions';
    end if;

    new.submitted_at := effective_submitted_at;
    new.is_late := effective_submitted_at > target_assignment.due_at;
    new.score := null;
    new.feedback := '';
    new.graded_at := null;
    new.graded_by_user_id := null;
  end if;

  if new.score is not null and new.score > target_assignment.max_score then
    raise exception 'Score cannot exceed assignment max score';
  end if;

  return new;
end;
$$;

drop trigger if exists set_class_assignments_updated_at on public.class_assignments;
create trigger set_class_assignments_updated_at
  before update on public.class_assignments
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_class_assignment on public.class_assignments;
create trigger validate_class_assignment
  before insert or update on public.class_assignments
  for each row execute procedure public.validate_class_assignment();

drop trigger if exists validate_class_assignment_file on public.class_assignment_files;
create trigger validate_class_assignment_file
  before insert or update on public.class_assignment_files
  for each row execute procedure public.validate_class_assignment_file();

drop trigger if exists set_class_assignment_submissions_updated_at on public.class_assignment_submissions;
create trigger set_class_assignment_submissions_updated_at
  before update on public.class_assignment_submissions
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_class_assignment_submission on public.class_assignment_submissions;
create trigger validate_class_assignment_submission
  before insert or update on public.class_assignment_submissions
  for each row execute procedure public.validate_class_assignment_submission();

alter table public.class_assignments enable row level security;
alter table public.class_assignment_files enable row level security;
alter table public.class_assignment_submissions enable row level security;

drop policy if exists "class members can read published assignments" on public.class_assignments;
create policy "class members can read published assignments"
  on public.class_assignments
  for select
  using (
    deleted_at is null
    and (
      public.can_manage_class(organization_id, class_id)
      or (
        status = 'published'
        and public.is_class_member(organization_id, class_id)
      )
    )
  );

drop policy if exists "class managers can create assignments" on public.class_assignments;
create policy "class managers can create assignments"
  on public.class_assignments
  for insert
  with check (
    public.can_manage_class(organization_id, class_id)
    and created_by_user_id = auth.uid()
  );

drop policy if exists "class managers can update assignments" on public.class_assignments;
create policy "class managers can update assignments"
  on public.class_assignments
  for update
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

drop policy if exists "class members can read assignment files" on public.class_assignment_files;
create policy "class members can read assignment files"
  on public.class_assignment_files
  for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.class_assignments
      where class_assignments.id = class_assignment_files.assignment_id
        and class_assignments.deleted_at is null
        and (
          public.can_manage_class(class_assignments.organization_id, class_assignments.class_id)
          or (
            class_assignments.status = 'published'
            and public.is_class_member(class_assignments.organization_id, class_assignments.class_id)
          )
        )
    )
  );

drop policy if exists "class managers can create assignment files" on public.class_assignment_files;
create policy "class managers can create assignment files"
  on public.class_assignment_files
  for insert
  with check (
    public.can_manage_class(organization_id, class_id)
    and uploaded_by_user_id = auth.uid()
  );

drop policy if exists "class managers can update assignment files" on public.class_assignment_files;
create policy "class managers can update assignment files"
  on public.class_assignment_files
  for update
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

drop policy if exists "students and managers can read submissions" on public.class_assignment_submissions;
create policy "students and managers can read submissions"
  on public.class_assignment_submissions
  for select
  using (
    public.can_manage_class(organization_id, class_id)
    or student_user_id = auth.uid()
  );

drop policy if exists "students can create own submissions" on public.class_assignment_submissions;
create policy "students can create own submissions"
  on public.class_assignment_submissions
  for insert
  with check (
    student_user_id = auth.uid()
    and public.is_class_member(organization_id, class_id)
  );

drop policy if exists "students can update own submissions and managers can grade" on public.class_assignment_submissions;
create policy "students can update own submissions and managers can grade"
  on public.class_assignment_submissions
  for update
  using (
    student_user_id = auth.uid()
    or public.can_manage_class(organization_id, class_id)
  )
  with check (
    student_user_id = auth.uid()
    or public.can_manage_class(organization_id, class_id)
  );
