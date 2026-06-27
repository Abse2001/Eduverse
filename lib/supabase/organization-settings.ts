import type { SupabaseClient } from "@supabase/supabase-js"

export type OrganizationSettings = {
  organization_id: string
  public_features_enabled: boolean
  public_features_locked_disabled: boolean
  all_teachers_can_create_classes: boolean
  all_teachers_can_manage_own_classes: boolean
}

export type TeacherClassPermission = {
  organization_id: string
  teacher_user_id: string
  can_create_classes: boolean
  can_manage_own_classes: boolean
}

export type OrganizationSettingsPayload = OrganizationSettings & {
  teacherClassPermissions: TeacherClassPermission[]
}

export const DEFAULT_ORGANIZATION_SETTINGS: Omit<
  OrganizationSettingsPayload,
  "organization_id"
> = {
  public_features_enabled: false,
  public_features_locked_disabled: false,
  all_teachers_can_create_classes: false,
  all_teachers_can_manage_own_classes: false,
  teacherClassPermissions: [],
}

type OrganizationSettingsDefaults = Omit<
  OrganizationSettingsPayload,
  "organization_id"
>

type LoadOrganizationSettingsOptions = {
  missingRelationFallback?: Partial<OrganizationSettingsDefaults>
}

export async function loadOrganizationSettings(
  organizationIds: string[],
  supabase: SupabaseClient,
  options: LoadOrganizationSettingsOptions = {},
) {
  const settingsByOrganization = createSettingsMap(organizationIds)

  if (organizationIds.length === 0) return settingsByOrganization

  const { data: settingsData, error: settingsError } = await supabase
    .from("organization_settings")
    .select(
      "organization_id, public_features_enabled, public_features_locked_disabled, all_teachers_can_create_classes, all_teachers_can_manage_own_classes",
    )
    .in("organization_id", organizationIds)

  if (settingsError) {
    if (isMissingRelationError(settingsError)) {
      return createSettingsMap(organizationIds, {
        ...DEFAULT_ORGANIZATION_SETTINGS,
        ...options.missingRelationFallback,
      })
    }
    throw settingsError
  }

  const { data: permissionData, error: permissionError } = await supabase
    .from("organization_teacher_class_permissions")
    .select(
      "organization_id, teacher_user_id, can_create_classes, can_manage_own_classes",
    )
    .in("organization_id", organizationIds)

  if (permissionError) {
    if (isMissingRelationError(permissionError)) return settingsByOrganization
    throw permissionError
  }

  const permissionsByOrganization = new Map<string, TeacherClassPermission[]>()

  for (const permission of (permissionData ?? []) as TeacherClassPermission[]) {
    const existing =
      permissionsByOrganization.get(permission.organization_id) ?? []
    existing.push(permission)
    permissionsByOrganization.set(permission.organization_id, existing)
  }

  for (const organizationId of organizationIds) {
    const currentSettings = settingsByOrganization.get(organizationId)
    if (!currentSettings) continue

    settingsByOrganization.set(organizationId, {
      ...currentSettings,
      teacherClassPermissions:
        permissionsByOrganization.get(organizationId) ?? [],
    })
  }

  for (const settings of (settingsData ?? []) as OrganizationSettings[]) {
    settingsByOrganization.set(settings.organization_id, {
      ...settings,
      teacherClassPermissions:
        permissionsByOrganization.get(settings.organization_id) ?? [],
    })
  }

  return settingsByOrganization
}

function createSettingsMap(
  organizationIds: string[],
  defaults: OrganizationSettingsDefaults = DEFAULT_ORGANIZATION_SETTINGS,
) {
  const settingsByOrganization = new Map<string, OrganizationSettingsPayload>()

  for (const organizationId of organizationIds) {
    settingsByOrganization.set(organizationId, {
      organization_id: organizationId,
      ...defaults,
    })
  }

  return settingsByOrganization
}

function isMissingRelationError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  )
}
