import type {
  SupabaseClient,
  User as SupabaseAuthUser,
} from "@supabase/supabase-js"
import { USERS, type User } from "@/lib/mock-data"
import {
  type AppOrganization,
  type OrganizationMembershipRecord,
  type OrganizationMembershipRoleRecord,
  type OrganizationUserRole,
  type ProfileRecord,
  toAppUser,
  toOrganizations,
} from "@/lib/supabase/app-user"
import {
  loadOrganizationExtensions,
  loadOrganizationFeatureSettings,
} from "@/lib/supabase/features"
import type {
  ClassLiveSessionRow,
  OrganizationInviteRow,
  OrganizationJoinLinkRow,
  OrganizationJoinRequestRow,
  OrganizationMemberRow,
} from "@/lib/store"

const LIVE_SESSION_STALE_MS = 5 * 60 * 1000
const FALLBACK_USER = USERS[0]

export type CurrentUserPayload = {
  authUser: SupabaseAuthUser
  currentUser: User
  organizations: AppOrganization[]
}

export async function loadCurrentUserPayload(
  supabase: SupabaseClient,
  authUser: SupabaseAuthUser,
): Promise<CurrentUserPayload> {
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, display_name, default_organization_id")
    .eq("id", authUser.id)
    .single()

  if (profileError || !profileData) {
    const fallbackName =
      (authUser.user_metadata.display_name as string | undefined) ??
      authUser.email?.split("@")[0] ??
      "User"

    return {
      authUser,
      currentUser: {
        id: authUser.id,
        name: fallbackName,
        email: authUser.email ?? "",
        role: "student",
        avatar: fallbackName
          .split(" ")
          .map((part) => part[0]?.toUpperCase() ?? "")
          .slice(0, 2)
          .join(""),
        institution: "No organization selected",
      },
      organizations: [],
    }
  }

  const profile = profileData as unknown as ProfileRecord

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, role, status, selected_role_id")
    .eq("user_id", authUser.id)

  if (membershipError) {
    return {
      authUser,
      currentUser: toAppUser(profile, null),
      organizations: [],
    }
  }

  const memberships =
    ((membershipData || []) as Array<{
      id: string
      organization_id: string
      role: OrganizationUserRole
      status: "active" | "invited" | "suspended"
      selected_role_id: string | null
    }>) ?? []

  const organizationIds = memberships
    .filter((membership) => membership.status === "active")
    .map((membership) => membership.organization_id)
  const membershipIds = memberships.map((membership) => membership.id)

  let membershipsWithOrganizations: OrganizationMembershipRecord[] =
    memberships.map((membership) => ({
      ...membership,
      roles: [
        {
          id: membership.selected_role_id ?? "",
          role: membership.role,
          status: membership.status,
        },
      ],
    }))
  let featureSettingsByOrganization = new Map()
  let extensionsByOrganization = new Map()
  let rolesByMembership = new Map<string, OrganizationMembershipRoleRecord[]>()

  if (organizationIds.length > 0) {
    const [
      organizationResult,
      organizationFeatureSettings,
      organizationExtensions,
      membershipRolesResult,
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, slug, name")
        .in("id", organizationIds),
      loadOrganizationFeatureSettings(organizationIds, supabase),
      loadOrganizationExtensions(organizationIds, supabase),
      membershipIds.length > 0
        ? supabase
            .from("organization_membership_roles")
            .select("id, organization_membership_id, role, status")
            .in("organization_membership_id", membershipIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const { data: organizationData } = organizationResult
    const { data: membershipRoleData, error: membershipRoleError } =
      membershipRolesResult

    featureSettingsByOrganization = organizationFeatureSettings
    extensionsByOrganization = organizationExtensions
    if (!membershipRoleError) {
      rolesByMembership = groupMembershipRoles(
        (membershipRoleData ?? []) as Array<
          OrganizationMembershipRoleRecord & {
            organization_membership_id: string
          }
        >,
      )
    }

    const organizationMap = new Map(
      (
        (organizationData ?? []) as Array<{
          id: string
          slug: string
          name: string
        }>
      ).map((organization) => [organization.id, organization]),
    )

    membershipsWithOrganizations = memberships.map((membership) => ({
      ...membership,
      roles: rolesByMembership.get(membership.id) ?? [
        {
          id: membership.selected_role_id ?? "",
          role: membership.role,
          status: membership.status,
        },
      ],
      organizations: organizationMap.get(membership.organization_id) ?? null,
    }))
  }

  const organizations = toOrganizations(
    profile,
    membershipsWithOrganizations,
    featureSettingsByOrganization,
    extensionsByOrganization,
  )
  const activeOrganization =
    organizations.find((organization) => organization.isDefault) ?? null

  return {
    authUser,
    currentUser: toAppUser(profile, activeOrganization),
    organizations,
  }
}

export async function loadClassLiveSessions(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const staleBefore = new Date(Date.now() - LIVE_SESSION_STALE_MS).toISOString()
  const { data, error } = await supabase
    .from("class_live_sessions")
    .select(
      "id, organization_id, class_id, room_name, live_session_id, started_by_user_id, status, started_at, last_seen_at, ended_at",
    )
    .eq("organization_id", organizationId)
    .eq("status", "live")
    .is("ended_at", null)
    .gt("last_seen_at", staleBefore)
    .order("last_seen_at", { ascending: false })

  if (error) throw error

  return (data ?? []) as ClassLiveSessionRow[]
}

export async function loadOrganizationUsers(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, user_id, role, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })

  if (membershipError) throw membershipError

  const typedMemberships = (membershipData ?? []) as Array<{
    id: string
    user_id: string
    role: OrganizationUserRole
    status: "active" | "invited" | "suspended"
  }>
  const membershipIds = typedMemberships.map((membership) => membership.id)
  const userIds = typedMemberships.map((membership) => membership.user_id)

  const { data: membershipRoleData, error: membershipRoleError } =
    membershipIds.length > 0
      ? await supabase
          .from("organization_membership_roles")
          .select("id, organization_membership_id, role, status")
          .in("organization_membership_id", membershipIds)
      : { data: [], error: null }

  if (membershipRoleError) throw membershipRoleError

  const rolesByMembership = groupMembershipRoles(
    (membershipRoleData ?? []) as Array<
      OrganizationMembershipRoleRecord & {
        organization_membership_id: string
      }
    >,
  )

  const { data: profileData, error: profileError } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds)
      : { data: [], error: null }

  if (profileError) throw profileError

  const profileMap = new Map(
    (
      (profileData ?? []) as Array<{
        id: string
        display_name: string
        email: string
      }>
    ).map((profile) => [
      profile.id,
      { display_name: profile.display_name, email: profile.email },
    ]),
  )

  const members = typedMemberships.map((membership) => {
    const roles = rolesByMembership.get(membership.id) ?? [
      {
        id: "",
        role: membership.role,
        status: membership.status,
      },
    ]

    return {
      ...membership,
      roles,
      profile: profileMap.get(membership.user_id),
    }
  })

  const { data: inviteData, error: inviteError } = await supabase
    .from("organization_invites")
    .select("id, email, role, status, token")
    .eq("organization_id", organizationId)
    .eq("status", "invited")
    .order("created_at", { ascending: false })

  if (inviteError) throw inviteError

  const { data: joinLinkData, error: joinLinkError } = await supabase
    .from("organization_join_links")
    .select(
      "id, organization_id, purpose, token, default_role, enabled, approval_required, max_uses, use_count, expires_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })

  if (joinLinkError) throw joinLinkError

  const { data: joinRequestData, error: joinRequestError } = await supabase
    .from("organization_join_requests")
    .select("id, organization_id, user_id, requested_role, status, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })

  if (joinRequestError) throw joinRequestError

  const typedJoinRequests = (joinRequestData ?? []) as Array<{
    id: string
    organization_id: string
    user_id: string
    requested_role: OrganizationUserRole
    status: "pending" | "approved" | "rejected"
    created_at: string
  }>
  const joinRequestUserIds = typedJoinRequests.map((request) => request.user_id)

  const { data: joinRequestProfileData, error: joinRequestProfileError } =
    joinRequestUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", joinRequestUserIds)
      : { data: [], error: null }

  if (joinRequestProfileError) throw joinRequestProfileError

  const joinRequestProfileMap = new Map(
    (
      (joinRequestProfileData ?? []) as Array<{
        id: string
        display_name: string
        email: string
      }>
    ).map((profile) => [
      profile.id,
      { display_name: profile.display_name, email: profile.email },
    ]),
  )

  return {
    members: members as OrganizationMemberRow[],
    invites: (inviteData ?? []) as OrganizationInviteRow[],
    joinLinks: (joinLinkData ?? []) as OrganizationJoinLinkRow[],
    joinRequests: typedJoinRequests.map((request) => ({
      ...request,
      profile: joinRequestProfileMap.get(request.user_id),
    })) as OrganizationJoinRequestRow[],
  }
}

export function fallbackCurrentUser() {
  return FALLBACK_USER
}

function groupMembershipRoles(
  roleRows: Array<
    OrganizationMembershipRoleRecord & { organization_membership_id: string }
  >,
) {
  const rolesByMembership = new Map<
    string,
    OrganizationMembershipRoleRecord[]
  >()

  for (const roleRow of roleRows) {
    const existingRoles =
      rolesByMembership.get(roleRow.organization_membership_id) ?? []

    existingRoles.push({
      id: roleRow.id,
      role: roleRow.role,
      status: roleRow.status,
    })
    rolesByMembership.set(roleRow.organization_membership_id, existingRoles)
  }

  return rolesByMembership
}
