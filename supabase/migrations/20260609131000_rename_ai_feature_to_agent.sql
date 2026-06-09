update public.feature_definitions
set label = 'AI Agent',
    description = 'Class AI Agent, material summaries, and teacher drafting assistance.',
    updated_at = now()
where key = 'ai';
