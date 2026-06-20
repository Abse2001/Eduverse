drop policy if exists "class managers can manage previous grades" on public.student_previous_grades;

drop trigger if exists set_student_previous_grades_updated_at on public.student_previous_grades;

drop table if exists public.student_previous_grades;
