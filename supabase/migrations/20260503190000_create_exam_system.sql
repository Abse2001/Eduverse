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
  create type public.exam_attempt_status as enum (
    'in_progress',
    'submitted',
    'graded',
    'voided'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  total_points integer not null default 0 check (total_points >= 0),
  start_at timestamptz,
  end_at timestamptz,
  status public.exam_status not null default 'upcoming',
  created_by_user_id uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  passcode_hash text,
  rules_override_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_title_not_blank check (btrim(title) <> ''),
  constraint exams_rules_override_json_object check (jsonb_typeof(rules_override_json) = 'object'),
  constraint exams_schedule_valid check (
    start_at is null
    or end_at is null
    or end_at >= start_at
  )
);

alter table public.exams
  add column if not exists published_at timestamptz,
  add column if not exists passcode_hash text,
  add column if not exists rules_override_json jsonb not null default '{}'::jsonb;

create index if not exists idx_exams_class_start
  on public.exams (class_id, start_at asc);

create index if not exists idx_exams_class_published
  on public.exams (class_id, published_at desc);

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
  visible_tests_json jsonb not null default '[]'::jsonb,
  hidden_tests_json jsonb not null default '[]'::jsonb,
  evaluator_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_questions_prompt_not_blank check (btrim(prompt) <> ''),
  constraint exam_questions_visible_tests_is_array check (jsonb_typeof(visible_tests_json) = 'array'),
  constraint exam_questions_hidden_tests_is_array check (jsonb_typeof(hidden_tests_json) = 'array')
);

alter table public.exam_questions
  add column if not exists visible_tests_json jsonb not null default '[]'::jsonb,
  add column if not exists hidden_tests_json jsonb not null default '[]'::jsonb,
  add column if not exists evaluator_key text;

create unique index if not exists idx_exam_questions_exam_position
  on public.exam_questions (exam_id, position);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  status public.exam_attempt_status not null default 'in_progress',
  started_at timestamptz,
  submitted_at timestamptz,
  total_score numeric,
  attempt_number integer not null default 1 check (attempt_number > 0),
  deadline_at timestamptz,
  rules_snapshot_json jsonb not null default '{}'::jsonb,
  needs_manual_review boolean not null default false,
  auto_submitted_at timestamptz,
  integrity_status text not null default 'clear',
  flagged_at timestamptz,
  flagged_by_user_id uuid references auth.users (id) on delete set null,
  flag_reason text,
  voided_at timestamptz,
  voided_by_user_id uuid references auth.users (id) on delete set null,
  void_reason text,
  graded_at timestamptz,
  graded_by_user_id uuid references auth.users (id) on delete set null,
  results_released_at timestamptz,
  results_released_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_attempts_score_non_negative check (total_score is null or total_score >= 0),
  constraint exam_attempts_rules_snapshot_json_object check (jsonb_typeof(rules_snapshot_json) = 'object'),
  constraint exam_attempts_integrity_status_valid check (
    integrity_status in ('clear', 'reported', 'flagged', 'voided')
  ),
  constraint exam_attempts_submission_order_valid check (
    started_at is null
    or submitted_at is null
    or submitted_at >= started_at
  )
);

alter table public.exam_attempts
  add column if not exists attempt_number integer not null default 1,
  add column if not exists deadline_at timestamptz,
  add column if not exists rules_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists needs_manual_review boolean not null default false,
  add column if not exists auto_submitted_at timestamptz,
  add column if not exists integrity_status text not null default 'clear',
  add column if not exists flagged_at timestamptz,
  add column if not exists flagged_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists flag_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists graded_at timestamptz,
  add column if not exists graded_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists results_released_at timestamptz,
  add column if not exists results_released_by_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists idx_exam_attempts_exam_student_attempt_number
  on public.exam_attempts (exam_id, student_user_id, attempt_number);

create index if not exists idx_exam_attempts_exam_status
  on public.exam_attempts (exam_id, status, created_at desc);

create index if not exists idx_exam_attempts_student_created
  on public.exam_attempts (student_user_id, created_at desc);

create table if not exists public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  exam_attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  exam_question_id uuid not null references public.exam_questions (id) on delete cascade,
  answer_json jsonb,
  auto_score numeric,
  teacher_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_answers_auto_score_non_negative check (auto_score is null or auto_score >= 0),
  constraint exam_answers_teacher_score_non_negative check (teacher_score is null or teacher_score >= 0)
);

create unique index if not exists idx_exam_answers_attempt_question
  on public.exam_answers (exam_attempt_id, exam_question_id);

create or replace function public.validate_exam()
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
  where id = new.class_id
    and is_archived = false;

  if target_class_org_id is null then
    raise exception 'Class % does not exist', new.class_id;
  end if;

  if new.organization_id <> target_class_org_id then
    raise exception 'Exam organization mismatch';
  end if;

  if new.published_at is not null then
    if new.end_at is not null and new.end_at <= now() then
      new.status := 'ended';
    elsif new.start_at is not null and new.start_at <= now() then
      new.status := 'live';
    else
      new.status := 'upcoming';
    end if;
  else
    new.status := 'upcoming';
  end if;

  return new;
end;
$$;

create or replace function public.validate_exam_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_exam public.exams;
begin
  select *
  into target_exam
  from public.exams
  where id = new.exam_id;

  if target_exam.id is null then
    raise exception 'Exam % does not exist', new.exam_id;
  end if;

  if new.organization_id <> target_exam.organization_id then
    raise exception 'Exam question organization mismatch';
  end if;

  if new.question_type = 'mcq' then
    if new.options_json is null or jsonb_typeof(new.options_json) <> 'array' then
      raise exception 'MCQ questions require options_json array';
    end if;

    if jsonb_array_length(new.options_json) = 0 then
      raise exception 'MCQ questions require at least one option';
    end if;

    if new.correct_answer_json is null then
      raise exception 'MCQ questions require correct_answer_json';
    end if;
  end if;

  if new.question_type <> 'code' then
    new.visible_tests_json := '[]'::jsonb;
    new.hidden_tests_json := '[]'::jsonb;
    new.evaluator_key := null;
  end if;

  return new;
end;
$$;

create or replace function public.validate_exam_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_exam public.exams;
begin
  select *
  into target_exam
  from public.exams
  where id = new.exam_id;

  if target_exam.id is null then
    raise exception 'Exam % does not exist', new.exam_id;
  end if;

  if new.organization_id <> target_exam.organization_id
    or new.class_id <> target_exam.class_id then
    raise exception 'Exam attempt class mismatch';
  end if;

  if new.total_score is not null and new.total_score > target_exam.total_points then
    raise exception 'Exam attempt total score exceeds exam total points';
  end if;

  return new;
end;
$$;

create or replace function public.validate_exam_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attempt public.exam_attempts;
  target_question public.exam_questions;
begin
  select *
  into target_attempt
  from public.exam_attempts
  where id = new.exam_attempt_id;

  if target_attempt.id is null then
    raise exception 'Exam attempt % does not exist', new.exam_attempt_id;
  end if;

  select *
  into target_question
  from public.exam_questions
  where id = new.exam_question_id;

  if target_question.id is null then
    raise exception 'Exam question % does not exist', new.exam_question_id;
  end if;

  if new.organization_id <> target_attempt.organization_id
    or new.organization_id <> target_question.organization_id
    or target_attempt.exam_id <> target_question.exam_id then
    raise exception 'Exam answer exam mismatch';
  end if;

  if new.auto_score is not null and new.auto_score > target_question.points then
    raise exception 'Auto score exceeds question points';
  end if;

  if new.teacher_score is not null and new.teacher_score > target_question.points then
    raise exception 'Teacher score exceeds question points';
  end if;

  return new;
end;
$$;

drop trigger if exists set_exams_updated_at on public.exams;
create trigger set_exams_updated_at
  before update on public.exams
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_exam on public.exams;
create trigger validate_exam
  before insert or update on public.exams
  for each row execute procedure public.validate_exam();

drop trigger if exists set_exam_questions_updated_at on public.exam_questions;
create trigger set_exam_questions_updated_at
  before update on public.exam_questions
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_exam_question on public.exam_questions;
create trigger validate_exam_question
  before insert or update on public.exam_questions
  for each row execute procedure public.validate_exam_question();

drop trigger if exists set_exam_attempts_updated_at on public.exam_attempts;
create trigger set_exam_attempts_updated_at
  before update on public.exam_attempts
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_exam_attempt on public.exam_attempts;
create trigger validate_exam_attempt
  before insert or update on public.exam_attempts
  for each row execute procedure public.validate_exam_attempt();

drop trigger if exists set_exam_answers_updated_at on public.exam_answers;
create trigger set_exam_answers_updated_at
  before update on public.exam_answers
  for each row execute procedure public.set_updated_at();

drop trigger if exists validate_exam_answer on public.exam_answers;
create trigger validate_exam_answer
  before insert or update on public.exam_answers
  for each row execute procedure public.validate_exam_answer();

alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;

drop policy if exists "class members can read published exams" on public.exams;
create policy "class members can read published exams"
  on public.exams
  for select
  using (
    public.can_manage_class(organization_id, class_id)
    or (
      published_at is not null
      and public.is_class_member(organization_id, class_id)
    )
  );

drop policy if exists "class managers can manage exams" on public.exams;
create policy "class managers can manage exams"
  on public.exams
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

drop policy if exists "class managers can read exam questions" on public.exam_questions;
create policy "class managers can read exam questions"
  on public.exam_questions
  for select
  using (
    exists (
      select 1
      from public.exams
      where exams.id = exam_questions.exam_id
        and public.can_manage_class(exams.organization_id, exams.class_id)
    )
  );

drop policy if exists "class managers can manage exam questions" on public.exam_questions;
create policy "class managers can manage exam questions"
  on public.exam_questions
  for all
  using (
    exists (
      select 1
      from public.exams
      where exams.id = exam_questions.exam_id
        and public.can_manage_class(exams.organization_id, exams.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.exams
      where exams.id = exam_questions.exam_id
        and public.can_manage_class(exams.organization_id, exams.class_id)
    )
  );

drop policy if exists "class managers can read exam attempts" on public.exam_attempts;
create policy "class managers can read exam attempts"
  on public.exam_attempts
  for select
  using (public.can_manage_class(organization_id, class_id));

drop policy if exists "class managers can manage exam attempts" on public.exam_attempts;
create policy "class managers can manage exam attempts"
  on public.exam_attempts
  for all
  using (public.can_manage_class(organization_id, class_id))
  with check (public.can_manage_class(organization_id, class_id));

drop policy if exists "class managers can read exam answers" on public.exam_answers;
create policy "class managers can read exam answers"
  on public.exam_answers
  for select
  using (
    exists (
      select 1
      from public.exam_attempts
      where exam_attempts.id = exam_answers.exam_attempt_id
        and public.can_manage_class(exam_attempts.organization_id, exam_attempts.class_id)
    )
  );

drop policy if exists "class managers can manage exam answers" on public.exam_answers;
create policy "class managers can manage exam answers"
  on public.exam_answers
  for all
  using (
    exists (
      select 1
      from public.exam_attempts
      where exam_attempts.id = exam_answers.exam_attempt_id
        and public.can_manage_class(exam_attempts.organization_id, exam_attempts.class_id)
    )
  )
  with check (
    exists (
      select 1
      from public.exam_attempts
      where exam_attempts.id = exam_answers.exam_attempt_id
        and public.can_manage_class(exam_attempts.organization_id, exam_attempts.class_id)
    )
  );
