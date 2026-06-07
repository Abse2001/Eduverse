insert into public.feature_definitions (
  key,
  label,
  description,
  parent_key,
  kind,
  route_segment,
  default_enabled,
  sort_order,
  metadata
)
values (
  'ai',
  'AI',
  'Class tutor, material summaries, and teacher drafting assistance.',
  null,
  'core',
  'ai',
  true,
  35,
  '{"provider": "openrouter"}'::jsonb
)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      parent_key = excluded.parent_key,
      kind = excluded.kind,
      route_segment = excluded.route_segment,
      default_enabled = excluded.default_enabled,
      is_system = true,
      sort_order = excluded.sort_order,
      metadata = excluded.metadata,
      updated_at = now();

insert into public.feature_preset_items (preset_key, feature_key, enabled)
values
  ('kindergarten', 'ai', true),
  ('primary_school', 'ai', true),
  ('university', 'ai', true)
on conflict (preset_key, feature_key) do update
  set enabled = excluded.enabled,
      config = excluded.config,
      updated_at = now();

insert into public.organization_feature_settings (
  organization_id,
  feature_key,
  enabled
)
select
  organizations.id,
  'ai',
  true
from public.organizations
on conflict (organization_id, feature_key) do nothing;

insert into public.class_feature_settings (
  organization_id,
  class_id,
  feature_key,
  enabled
)
select
  classes.organization_id,
  classes.id,
  'ai',
  true
from public.classes
on conflict (class_id, feature_key) do nothing;
