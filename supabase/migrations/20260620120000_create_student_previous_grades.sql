create table if not exists public.student_previous_grades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_email text not null,
  term text not null,
  class_name text not null,
  grade text not null,
  source_school text,
  notes text,
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_previous_grades_org_email
  on public.student_previous_grades (organization_id, lower(student_email));

create trigger set_student_previous_grades_updated_at
  before update on public.student_previous_grades
  for each row
  execute function public.set_updated_at();

alter table public.student_previous_grades enable row level security;

drop policy if exists "class managers can manage previous grades" on public.student_previous_grades;
create policy "class managers can manage previous grades"
  on public.student_previous_grades
  for all
  using (public.has_org_role(organization_id, array['org_admin', 'teacher']))
  with check (public.has_org_role(organization_id, array['org_admin', 'teacher']));
