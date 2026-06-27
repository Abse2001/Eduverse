alter table public.organization_settings
  add column if not exists public_features_locked_disabled boolean not null default false;

create or replace function public.prevent_locked_disabled_public_features_enable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(old.public_features_locked_disabled, false) then
    if new.public_features_enabled then
      raise exception 'Public access was disabled when the organization was created and cannot be enabled later';
    end if;

    new.public_features_locked_disabled := true;
  end if;

  if coalesce(new.public_features_locked_disabled, false) and new.public_features_enabled then
    raise exception 'Locked disabled public access cannot be enabled';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_locked_disabled_public_features_enable on public.organization_settings;
create trigger prevent_locked_disabled_public_features_enable
  before update on public.organization_settings
  for each row execute procedure public.prevent_locked_disabled_public_features_enable();

insert into public.feature_presets (key, name, description)
values
  ('open_learning', 'Open Learning', 'Public-access defaults for open courses and broad enrollment.')
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      updated_at = now();

insert into public.feature_preset_items (preset_key, feature_key, enabled)
select
  'open_learning',
  feature_preset_items.feature_key,
  feature_preset_items.enabled
from public.feature_preset_items
where feature_preset_items.preset_key = 'university'
on conflict (preset_key, feature_key) do update
  set enabled = excluded.enabled,
      config = excluded.config,
      updated_at = now();

create or replace function public.create_organization(
  org_name text,
  requested_slug text default null,
  preset_key text default 'primary_school'
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := btrim(coalesce(org_name, ''));
  normalized_preset_key text := coalesce(nullif(btrim(preset_key), ''), 'primary_school');
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 0;
  created_org public.organizations;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name = '' then
    raise exception 'Organization name is required';
  end if;

  if not exists (
    select 1
    from public.feature_presets
    where key = normalized_preset_key
  ) then
    raise exception 'Feature preset % does not exist', normalized_preset_key;
  end if;

  base_slug := public.slugify(coalesce(nullif(btrim(requested_slug), ''), normalized_name));

  if base_slug = '' then
    raise exception 'Organization slug is invalid';
  end if;

  candidate_slug := base_slug;

  loop
    begin
      insert into public.organizations (slug, name)
      values (candidate_slug, normalized_name)
      returning * into created_org;

      exit;
    exception
      when unique_violation then
        if nullif(btrim(requested_slug), '') is not null then
          raise exception 'Organization slug already exists';
        end if;

        slug_suffix := slug_suffix + 1;
        candidate_slug := base_slug || '-' || slug_suffix::text;
    end;
  end loop;

  insert into public.organization_feature_settings (
    organization_id,
    feature_key,
    enabled,
    config
  )
  select
    created_org.id,
    feature_definitions.key,
    coalesce(feature_preset_items.enabled, feature_definitions.default_enabled),
    case
      when coalesce(feature_preset_items.enabled, feature_definitions.default_enabled) then
        coalesce(feature_preset_items.config, '{}'::jsonb)
      else
        coalesce(feature_preset_items.config, '{}'::jsonb) || jsonb_build_object('locked_disabled', true)
    end
  from public.feature_definitions
  left join public.feature_preset_items
    on feature_preset_items.feature_key = feature_definitions.key
   and feature_preset_items.preset_key = normalized_preset_key
  order by feature_definitions.sort_order
  on conflict (organization_id, feature_key) do update
    set enabled = excluded.enabled,
        config = excluded.config,
        updated_at = now();

  insert into public.organization_settings (
    organization_id,
    public_features_enabled,
    public_features_locked_disabled,
    all_teachers_can_create_classes,
    all_teachers_can_manage_own_classes
  )
  values (
    created_org.id,
    normalized_preset_key = 'open_learning',
    normalized_preset_key <> 'open_learning',
    false,
    false
  )
  on conflict (organization_id) do update
    set public_features_enabled = excluded.public_features_enabled,
        public_features_locked_disabled = excluded.public_features_locked_disabled,
        all_teachers_can_create_classes = excluded.all_teachers_can_create_classes,
        all_teachers_can_manage_own_classes = excluded.all_teachers_can_manage_own_classes,
        updated_at = now();

  perform public.grant_organization_role(created_org.id, current_user_id, 'org_admin');

  update public.profiles
  set default_organization_id = created_org.id,
      updated_at = now()
  where id = current_user_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload
  )
  values (
    created_org.id,
    current_user_id,
    'organization.created',
    'organization',
    created_org.id,
    jsonb_build_object(
      'slug',
      created_org.slug,
      'name',
      created_org.name,
      'preset_key',
      normalized_preset_key
    )
  );

  return created_org;
end;
$$;
