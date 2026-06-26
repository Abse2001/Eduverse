import type { SupabaseClient } from "@supabase/supabase-js"
import type { OrganizationClass } from "@/lib/supabase/classes"
import type { OrganizationUserRole } from "@/lib/supabase/app-user"
import { loadOrganizationSettings } from "@/lib/supabase/organization-settings"

type ClassAccessContext = {
  organizationId: string
  publicOrganizationFeaturesEnabled: boolean
  selectedRole: OrganizationUserRole | null
  userId: string
}

type OrganizationMembershipRow = {
  id: string
  role: OrganizationUserRole
  selected_role_id: string | null
}

export async function loadClassAccessContext(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<ClassAccessContext> {
  const [selectedRole, settingsByOrganization] = await Promise.all([
    loadSelectedOrganizationRole(supabase, organizationId, userId),
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

async function loadSelectedOrganizationRole(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationUserRole | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, role, selected_role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()

  if (membershipError) throw membershipError
  if (!membership) return null

  const membershipRow = membership as OrganizationMembershipRow

  if (membershipRow.selected_role_id) {
    const { data: selectedRole, error: selectedRoleError } = await supabase
      .from("organization_membership_roles")
      .select("role")
      .eq("id", membershipRow.selected_role_id)
      .eq("organization_membership_id", membershipRow.id)
      .eq("status", "active")
      .maybeSingle()

    if (selectedRoleError) throw selectedRoleError

    if (selectedRole?.role) {
      return selectedRole.role as OrganizationUserRole
    }
  }

  return membershipRow.role
}
