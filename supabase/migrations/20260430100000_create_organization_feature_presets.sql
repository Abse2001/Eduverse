drop function if exists public.create_organization(text, text);
drop function if exists public.create_organization(text, text, text);

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
    coalesce(feature_preset_items.config, '{}'::jsonb)
  from public.feature_definitions
  left join public.feature_preset_items
    on feature_preset_items.feature_key = feature_definitions.key
   and feature_preset_items.preset_key = normalized_preset_key
  order by feature_definitions.sort_order
  on conflict (organization_id, feature_key) do update
    set enabled = excluded.enabled,
        config = excluded.config,
        updated_at = now();

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    created_org.id,
    current_user_id,
    'org_owner',
    'active'
  )
  on conflict (organization_id, user_id) do update
    set role = 'org_owner',
        status = 'active',
        updated_at = now();

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
