import type { SupabaseClient } from "@supabase/supabase-js"
import type { OrganizationUserRole } from "@/lib/supabase/app-user"

export type SelectedOrganizationRoleResult =
  | { role: OrganizationUserRole }
  | { error: string; status: number }

export async function loadSelectedOrganizationRole(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<SelectedOrganizationRoleResult> {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, role, selected_role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()

  if (membershipError) {
    return { error: membershipError.message, status: 500 }
  }

  if (!membership) {
    return { error: "Active organization membership required.", status: 403 }
  }

  if (membership.selected_role_id) {
    const { data: selectedRole, error: selectedRoleError } = await supabase
      .from("organization_membership_roles")
      .select("role")
      .eq("id", membership.selected_role_id)
      .eq("organization_membership_id", membership.id)
      .eq("status", "active")
      .maybeSingle()

    if (selectedRoleError) {
      return { error: selectedRoleError.message, status: 500 }
    }

    if (selectedRole?.role) {
      return { role: selectedRole.role as OrganizationUserRole }
    }
  }

  return { role: membership.role as OrganizationUserRole }
}
