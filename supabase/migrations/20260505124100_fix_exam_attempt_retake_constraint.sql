alter table public.exam_attempts
  drop constraint if exists exam_attempts_exam_id_student_user_id_key;

drop index if exists public.exam_attempts_exam_id_student_user_id_key;
drop index if exists public.idx_exam_attempts_single_active_per_student;

create unique index if not exists idx_exam_attempts_single_active_per_student
  on public.exam_attempts (exam_id, student_user_id)
  where status = 'in_progress';
