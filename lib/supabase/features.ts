import { createClient } from "@/lib/supabase/client"

export type FeatureKind = "core" | "extension"

export type FeatureDefinition = {
  key: string
  label: string
  description: string
  parent_key: string | null
  kind: FeatureKind
  route_segment: string | null
  default_enabled: boolean
  is_system: boolean
  sort_order: number
  metadata: Record<string, unknown>
}

export type FeatureSetting = {
  feature_key: string
  enabled: boolean
  config: Record<string, unknown>
}

export type OrganizationExtension = {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string
  launch_url: string | null
  enabled: boolean
  sort_order: number
  config: Record<string, unknown>
}

export type ClassExtensionSetting = {
  extension_id: string
  enabled: boolean
  config: Record<string, unknown>
}

export async function loadFeatureDefinitions() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("feature_definitions")
    .select(
      "key, label, description, parent_key, kind, route_segment, default_enabled, is_system, sort_order, metadata",
    )
    .order("sort_order", { ascending: true })

  if (error) throw error

  return (data ?? []) as FeatureDefinition[]
}

export async function loadOrganizationFeatureSettings(
  organizationIds: string[],
) {
  if (organizationIds.length === 0) return new Map<string, FeatureSetting[]>()

  const supabase = createClient()
  const { data, error } = await supabase
    .from("organization_feature_settings")
    .select("organization_id, feature_key, enabled, config")
    .in("organization_id", organizationIds)
    .order("feature_key", { ascending: true })

  if (error) throw error

  const settingsByOrganization = new Map<string, FeatureSetting[]>()

  for (const row of (data ?? []) as Array<
    FeatureSetting & { organization_id: string }
  >) {
    const existing = settingsByOrganization.get(row.organization_id) ?? []
    existing.push({
      feature_key: row.feature_key,
      enabled: row.enabled,
      config: row.config,
    })
    settingsByOrganization.set(row.organization_id, existing)
  }

  return settingsByOrganization
}

export async function loadOrganizationExtensions(organizationIds: string[]) {
  if (organizationIds.length === 0) {
    return new Map<string, OrganizationExtension[]>()
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from("organization_extensions")
    .select(
      "id, organization_id, name, slug, description, launch_url, enabled, sort_order, config",
    )
    .in("organization_id", organizationIds)
    .order("sort_order", { ascending: true })

  if (error) throw error

  const extensionsByOrganization = new Map<string, OrganizationExtension[]>()

  for (const extension of (data ?? []) as OrganizationExtension[]) {
    const existing =
      extensionsByOrganization.get(extension.organization_id) ?? []
    existing.push(extension)
    extensionsByOrganization.set(extension.organization_id, existing)
  }

  return extensionsByOrganization
}

export async function loadClassFeatureSettings(classIds: string[]) {
  if (classIds.length === 0) return new Map<string, FeatureSetting[]>()

  const supabase = createClient()
  const { data, error } = await supabase
    .from("class_feature_settings")
    .select("class_id, feature_key, enabled, config")
    .in("class_id", classIds)
    .order("feature_key", { ascending: true })

  if (error) throw error

  const settingsByClass = new Map<string, FeatureSetting[]>()

  for (const row of (data ?? []) as Array<
    FeatureSetting & { class_id: string }
  >) {
    const existing = settingsByClass.get(row.class_id) ?? []
    existing.push({
      feature_key: row.feature_key,
      enabled: row.enabled,
      config: row.config,
    })
    settingsByClass.set(row.class_id, existing)
  }

  return settingsByClass
}

export async function loadClassExtensionSettings(classIds: string[]) {
  if (classIds.length === 0) {
    return new Map<string, ClassExtensionSetting[]>()
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from("class_extension_settings")
    .select("class_id, extension_id, enabled, config")
    .in("class_id", classIds)

  if (error) throw error

  const settingsByClass = new Map<string, ClassExtensionSetting[]>()

  for (const row of (data ?? []) as Array<
    ClassExtensionSetting & { class_id: string }
  >) {
    const existing = settingsByClass.get(row.class_id) ?? []
    existing.push({
      extension_id: row.extension_id,
      enabled: row.enabled,
      config: row.config,
    })
    settingsByClass.set(row.class_id, existing)
  }

  return settingsByClass
}
