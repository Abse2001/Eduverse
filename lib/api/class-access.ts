import type { SupabaseClient } from "@supabase/supabase-js"
import { loadSelectedOrganizationRole } from "@/lib/api/selected-role"
import type { OrganizationClass } from "@/lib/supabase/classes"
import type { OrganizationUserRole } from "@/lib/supabase/app-user"
import { loadOrganizationSettings } from "@/lib/supabase/organization-settings"

type ClassAccessContext = {
  organizationId: string
  publicOrganizationFeaturesEnabled: boolean
  selectedRole: OrganizationUserRole | null
  userId: string
}

export async function loadClassAccessContext(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<ClassAccessContext> {
  const [selectedRole, settingsByOrganization] = await Promise.all([
    loadSelectedOrganizationRoleOrNull(supabase, organizationId, userId),
    loadOrganizationSettings([organizationId], supabase, {
      missingRelationFallback: { public_features_enabled: true },
    }),
  ])

  return {
    organizationId,
    publicOrganizationFeaturesEnabled:
      settingsByOrganization.get(organizationId)?.public_features_enabled ??
      false,
    selectedRole,
    userId,
  }
}

export function canViewClassForContext(
  classItem: OrganizationClass,
  context: ClassAccessContext,
) {
  if (classItem.organization_id !== context.organizationId) return false
  if (context.selectedRole === "org_admin") return true

  if (
    classItem.teacher_user_id === context.userId ||
    classItem.memberships.some(
      (membership) => membership.user_id === context.userId,
    )
  ) {
    return true
  }

  return (
    context.selectedRole === "student" &&
    context.publicOrganizationFeaturesEnabled &&
    classItem.organization_visible
  )
}

export function filterClassesForContext(
  classes: OrganizationClass[],
  context: ClassAccessContext,
) {
  return classes.filter((classItem) =>
    canViewClassForContext(classItem, context),
  )
}

async function loadSelectedOrganizationRoleOrNull(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationUserRole | null> {
  const result = await loadSelectedOrganizationRole(
    supabase,
    organizationId,
    userId,
  )

  if ("role" in result) return result.role
  if (result.status === 403) return null

  throw new Error(result.error)
}
