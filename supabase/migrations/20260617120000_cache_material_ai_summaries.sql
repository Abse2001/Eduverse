alter table public.class_materials
  add column if not exists ai_summary text,
  add column if not exists ai_summary_used_file_text boolean not null default false,
  add column if not exists ai_summary_generated_at timestamptz;

create index if not exists idx_class_materials_ai_summary_generated
  on public.class_materials (ai_summary_generated_at desc)
  where ai_summary is not null;
