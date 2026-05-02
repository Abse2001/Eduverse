alter table public.class_messages
  add column if not exists sender_role text not null default 'student';

alter table public.class_messages
  drop constraint if exists class_messages_sender_role_valid;

alter table public.class_messages
  add constraint class_messages_sender_role_valid
  check (sender_role in ('student', 'teacher', 'admin'));
