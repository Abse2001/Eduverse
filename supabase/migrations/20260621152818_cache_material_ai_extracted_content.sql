alter table public.class_materials
  add column if not exists ai_extracted_content text,
  add column if not exists ai_extracted_content_used_file_content boolean not null default false,
  add column if not exists ai_extracted_content_generated_at timestamptz;

create index if not exists idx_class_materials_ai_extracted_content_generated
  on public.class_materials (ai_extracted_content_generated_at desc)
  where ai_extracted_content is not null;
