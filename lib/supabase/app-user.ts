import type { User } from "@/lib/mock-data/types"
import type {
  FeatureSetting,
  OrganizationExtension,
} from "@/lib/supabase/features"

export type OrganizationUserRole =
  | "org_owner"
  | "org_admin"
  | "teacher"
  | "student"

export type OrganizationMembershipRoleRecord = {
  id: string
  role: OrganizationUserRole
  status: "active" | "invited" | "suspended"
}

export type OrganizationMembershipRecord = {
  id: string
  organization_id: string
  role: OrganizationUserRole
  status: "active" | "invited" | "suspended"
  selected_role_id: string | null
  roles: OrganizationMembershipRoleRecord[]
  organizations?: {
    id: string
    slug: string
    name: string
  } | null
}

export type ProfileRecord = {
  id: string
  email: string
  display_name: string
  default_organization_id: string | null
}

export type AppOrganization = {
  id: string
  slug: string
  name: string
  membershipId: string
  roles: OrganizationUserRole[]
  selectedRole: OrganizationUserRole
  selectedRoleId: string | null
  status: OrganizationMembershipRecord["status"]
  isDefault: boolean
  featureSettings: FeatureSetting[]
  extensions: OrganizationExtension[]
}

const ROLE_PRIORITY: OrganizationUserRole[] = [
  "org_owner",
  "org_admin",
  "teacher",
  "student",
]

function toInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return "U"

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("")
}

export function toOrganizations(
  profile: ProfileRecord,
  memberships: OrganizationMembershipRecord[],
  featureSettingsByOrganization = new Map<string, FeatureSetting[]>(),
  extensionsByOrganization = new Map<string, OrganizationExtension[]>(),
): AppOrganization[] {
  return memberships
    .filter(
      (membership) =>
        membership.status === "active" && membership.organizations?.id,
    )
    .map((membership) => {
      const activeRoleRecords = membership.roles.filter(
        (roleRecord) => roleRecord.status === "active",
      )
      const effectiveActiveRoleRecords =
        activeRoleRecords.length > 0
          ? activeRoleRecords
          : [
              {
                id: membership.selected_role_id ?? "",
                role: membership.role,
                status: membership.status,
              },
            ]
      const roles = effectiveActiveRoleRecords
        .map((roleRecord) => roleRecord.role)
        .sort((left, right) => roleRank(left) - roleRank(right))
      const selectedRoleRecord = effectiveActiveRoleRecords.find(
        (roleRecord) => roleRecord.id === membership.selected_role_id,
      )
      const selectedRole =
        selectedRoleRecord?.role ?? roles[0] ?? membership.role
      const selectedRoleId =
        selectedRoleRecord?.id ??
        (effectiveActiveRoleRecords.find(
          (roleRecord) => roleRecord.role === selectedRole,
        )?.id ||
          null)

      return {
        id: membership.organizations!.id,
        slug: membership.organizations!.slug,
        name: membership.organizations!.name,
        membershipId: membership.id,
        roles,
        selectedRole,
        selectedRoleId,
        status: membership.status,
        isDefault:
          profile.default_organization_id === membership.organization_id,
        featureSettings:
          featureSettingsByOrganization.get(membership.organization_id) ?? [],
        extensions:
          extensionsByOrganization.get(membership.organization_id) ?? [],
      }
    })
}

export function toAppUser(
  profile: ProfileRecord,
  activeOrganization: AppOrganization | null,
): User {
  const role: User["role"] =
    activeOrganization?.selectedRole === "org_owner" ||
    activeOrganization?.selectedRole === "org_admin"
      ? "admin"
      : activeOrganization?.selectedRole === "teacher"
        ? "teacher"
        : "student"

  return {
    id: profile.id,
    name: profile.display_name,
    email: profile.email,
    role,
    avatar: toInitials(profile.display_name),
    institution: activeOrganization?.name ?? "No organization selected",
  }
}

function roleRank(role: OrganizationUserRole) {
  const index = ROLE_PRIORITY.indexOf(role)
  return index === -1 ? ROLE_PRIORITY.length : index
}
