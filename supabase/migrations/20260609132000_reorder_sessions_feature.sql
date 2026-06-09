update public.feature_definitions
set sort_order = case key
  when 'sessions' then 30
  when 'materials' then 40
  when 'ai' then 45
  when 'assignments' then 50
  else sort_order
end,
updated_at = now()
where key in ('sessions', 'materials', 'ai', 'assignments');
