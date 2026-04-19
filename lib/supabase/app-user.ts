import type { User } from "@/lib/mock-data/types"

export type OrganizationMembershipRecord = {
  organization_id: string
  role: "org_owner" | "org_admin" | "teacher" | "student"
  status: "active" | "invited" | "suspended"
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
  role: OrganizationMembershipRecord["role"]
  status: OrganizationMembershipRecord["status"]
  isDefault: boolean
}

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
): AppOrganization[] {
  return memberships
    .filter(
      (membership) =>
        membership.status === "active" && membership.organizations?.id,
    )
    .map((membership) => ({
      id: membership.organizations!.id,
      slug: membership.organizations!.slug,
      name: membership.organizations!.name,
      role: membership.role,
      status: membership.status,
      isDefault: profile.default_organization_id === membership.organization_id,
    }))
}

export function toAppUser(
  profile: ProfileRecord,
  activeOrganization: AppOrganization | null,
): User {
  const role: User["role"] =
    activeOrganization?.role === "org_owner" ||
    activeOrganization?.role === "org_admin"
      ? "admin"
      : activeOrganization?.role === "teacher"
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
