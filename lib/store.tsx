"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react"
import type {
  AuthChangeEvent,
  Session,
  User as SupabaseAuthUser,
} from "@supabase/supabase-js"
import { User, USERS } from "@/lib/mock-data"
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
  loadOrganizationClasses,
  type OrganizationClass,
} from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
import {
  loadFeatureDefinitions,
  loadOrganizationExtensions,
  loadOrganizationFeatureSettings,
  type FeatureDefinition,
  type FeatureSetting,
  type OrganizationExtension,
} from "@/lib/supabase/features"

const FALLBACK_USER = USERS[0]

type DataStatus = "idle" | "loading" | "ready" | "error"
type ThemeMode = "light" | "dark" | "system"

export type { OrganizationUserRole } from "@/lib/supabase/app-user"

export type OrganizationMemberRow = {
  id: string
  user_id: string
  role: OrganizationUserRole
  roles: OrganizationMembershipRoleRecord[]
  status: "active" | "invited" | "suspended"
  profile?: {
    display_name: string
    email: string
  }
}

export type OrganizationInviteRow = {
  id: string
  email: string
  role: Exclude<OrganizationUserRole, "org_owner">
  status: "active" | "invited" | "suspended"
  token: string
}

interface AppContextValue {
  currentUser: User
  setCurrentUser: (user: User) => void
  allUsers: User[]
  isDarkMode: boolean
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  toggleDarkMode: () => void
  authUser: SupabaseAuthUser | null
  isAuthLoading: boolean
  isAuthenticated: boolean
  organizations: AppOrganization[]
  activeOrganization: AppOrganization | null
  activeOrganizationRole: OrganizationUserRole | null
  featureDefinitions: FeatureDefinition[]
  featureDefinitionsStatus: DataStatus
  featureDefinitionsError: string | null
  organizationClasses: OrganizationClass[]
  organizationClassesStatus: DataStatus
  organizationClassesError: string | null
  organizationMembers: OrganizationMemberRow[]
  organizationInvites: OrganizationInviteRow[]
  organizationUsersStatus: DataStatus
  organizationUsersError: string | null
  refreshOrganizationClasses: (options?: {
    force?: boolean
  }) => Promise<OrganizationClass[]>
  refreshFeatureDefinitions: (options?: {
    force?: boolean
  }) => Promise<FeatureDefinition[]>
  refreshOrganizationUsers: (options?: { force?: boolean }) => Promise<{
    members: OrganizationMemberRow[]
    invites: OrganizationInviteRow[]
  }>
  updateOrganizationFeatureSetting: (
    organizationId: string,
    setting: FeatureSetting,
  ) => void
  upsertOrganizationExtension: (
    organizationId: string,
    extension: OrganizationExtension,
  ) => void
  refreshCurrentUser: () => Promise<void>
  setDefaultOrganization: (organizationId: string) => Promise<void>
  setActiveOrganizationRole: (role: OrganizationUserRole) => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(FALLBACK_USER)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>("system")
  const [authUser, setAuthUser] = useState<SupabaseAuthUser | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [organizations, setOrganizations] = useState<AppOrganization[]>([])
  const [featureDefinitions, setFeatureDefinitions] = useState<
    FeatureDefinition[]
  >([])
  const [featureDefinitionsStatus, setFeatureDefinitionsStatus] =
    useState<DataStatus>("idle")
  const [featureDefinitionsError, setFeatureDefinitionsError] = useState<
    string | null
  >(null)
  const [organizationClasses, setOrganizationClasses] = useState<
    OrganizationClass[]
  >([])
  const [organizationClassesStatus, setOrganizationClassesStatus] =
    useState<DataStatus>("idle")
  const [organizationClassesError, setOrganizationClassesError] = useState<
    string | null
  >(null)
  const [organizationMembers, setOrganizationMembers] = useState<
    OrganizationMemberRow[]
  >([])
  const [organizationInvites, setOrganizationInvites] = useState<
    OrganizationInviteRow[]
  >([])
  const [organizationUsersStatus, setOrganizationUsersStatus] =
    useState<DataStatus>("idle")
  const [organizationUsersError, setOrganizationUsersError] = useState<
    string | null
  >(null)
  const classesRequestRef = useRef<Promise<OrganizationClass[]> | null>(null)
  const featureDefinitionsRequestRef = useRef<Promise<
    FeatureDefinition[]
  > | null>(null)
  const usersRequestRef = useRef<Promise<{
    members: OrganizationMemberRow[]
    invites: OrganizationInviteRow[]
  }> | null>(null)
  const activeOrganizationIdRef = useRef<string | null>(null)

  useEffect(() => {
    const storedThemeMode = window.localStorage.getItem("theme-mode")
    if (
      storedThemeMode === "light" ||
      storedThemeMode === "dark" ||
      storedThemeMode === "system"
    ) {
      setThemeMode(storedThemeMode)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const applyTheme = () => {
      const nextIsDark =
        themeMode === "dark" || (themeMode === "system" && mediaQuery.matches)

      document.documentElement.classList.toggle("dark", nextIsDark)
      setIsDarkMode(nextIsDark)
    }

    window.localStorage.setItem("theme-mode", themeMode)
    applyTheme()

    if (themeMode !== "system") return

    mediaQuery.addEventListener("change", applyTheme)
    return () => mediaQuery.removeEventListener("change", applyTheme)
  }, [themeMode])

  function toggleDarkMode() {
    setThemeMode(isDarkMode ? "light" : "dark")
  }

  async function loadUser(user: SupabaseAuthUser | null) {
    const supabase = createClient()
    setAuthUser(user)

    if (!user) {
      setCurrentUser(FALLBACK_USER)
      setOrganizations([])
      setIsAuthLoading(false)
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, display_name, default_organization_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profileData) {
      const fallbackName =
        (user.user_metadata.display_name as string | undefined) ??
        user.email?.split("@")[0] ??
        "User"

      setCurrentUser({
        id: user.id,
        name: fallbackName,
        email: user.email ?? "",
        role: "student",
        avatar: fallbackName
          .split(" ")
          .map((part) => part[0]?.toUpperCase() ?? "")
          .slice(0, 2)
          .join(""),
        institution: "No organization selected",
      })
      setOrganizations([])
      setIsAuthLoading(false)
      return
    }

    const profile = profileData as unknown as ProfileRecord

    const { data: membershipData, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id, organization_id, role, status, selected_role_id")
      .eq("user_id", user.id)

    if (membershipError) {
      setCurrentUser(toAppUser(profile, null))
      setOrganizations([])
      setIsAuthLoading(false)
      return
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
    let featureSettingsByOrganization = new Map<string, FeatureSetting[]>()
    let extensionsByOrganization = new Map<string, OrganizationExtension[]>()
    let rolesByMembership = new Map<
      string,
      OrganizationMembershipRoleRecord[]
    >()

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
        loadOrganizationFeatureSettings(organizationIds),
        loadOrganizationExtensions(organizationIds),
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

    const nextOrganizations = toOrganizations(
      profile,
      membershipsWithOrganizations,
      featureSettingsByOrganization,
      extensionsByOrganization,
    )
    const nextActiveOrganization =
      nextOrganizations.find((organization) => organization.isDefault) ?? null

    setOrganizations(nextOrganizations)
    setCurrentUser(toAppUser(profile, nextActiveOrganization))
    setIsAuthLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()

    supabase.auth
      .getUser()
      .then(
        ({
          data,
          error,
        }: {
          data: { user: SupabaseAuthUser | null }
          error: Error | null
        }) => {
          if (error) {
            setAuthUser(null)
            setCurrentUser(FALLBACK_USER)
            setOrganizations([])
            setIsAuthLoading(false)
            return
          }

          void loadUser(data.user)
        },
      )
      .catch(() => {
        setAuthUser(null)
        setCurrentUser(FALLBACK_USER)
        setOrganizations([])
        setIsAuthLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        void loadUser(session?.user ?? null)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  async function refreshCurrentUser() {
    setIsAuthLoading(true)
    await loadUser(authUser)
  }

  async function setDefaultOrganization(organizationId: string) {
    if (!authUser) return

    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({
        default_organization_id: organizationId,
      })
      .eq("id", authUser.id)

    if (error) throw error

    await refreshCurrentUser()
  }

  async function setActiveOrganizationRole(role: OrganizationUserRole) {
    if (!authUser || !activeOrganization) return

    const supabase = createClient()
    const { error } = await supabase.rpc("set_selected_organization_role", {
      target_org_id: activeOrganization.id,
      target_role: role,
    })

    if (error) throw error

    await refreshCurrentUser()
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setAuthUser(null)
    setCurrentUser(FALLBACK_USER)
    setOrganizations([])
    setFeatureDefinitions([])
    setOrganizationClasses([])
    setOrganizationMembers([])
    setOrganizationInvites([])
    setOrganizationClassesStatus("idle")
    setFeatureDefinitionsStatus("idle")
    setOrganizationUsersStatus("idle")
  }

  function updateOrganizationFeatureSetting(
    organizationId: string,
    setting: FeatureSetting,
  ) {
    setOrganizations((currentOrganizations) =>
      currentOrganizations.map((organization) => {
        if (organization.id !== organizationId) return organization

        const existingSettings = organization.featureSettings.filter(
          (featureSetting) =>
            featureSetting.feature_key !== setting.feature_key,
        )

        return {
          ...organization,
          featureSettings: [...existingSettings, setting],
        }
      }),
    )
  }

  function upsertOrganizationExtension(
    organizationId: string,
    extension: OrganizationExtension,
  ) {
    setOrganizations((currentOrganizations) =>
      currentOrganizations.map((organization) => {
        if (organization.id !== organizationId) return organization

        const existingExtensions = organization.extensions.filter(
          (currentExtension) => currentExtension.id !== extension.id,
        )

        return {
          ...organization,
          extensions: [...existingExtensions, extension].sort(
            (left, right) => left.sort_order - right.sort_order,
          ),
        }
      }),
    )
  }

  const activeOrganization =
    organizations.find((organization) => organization.isDefault) ?? null
  const activeOrganizationRole = activeOrganization?.selectedRole ?? null

  const refreshFeatureDefinitions = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!force && featureDefinitionsStatus === "ready") {
        return featureDefinitions
      }

      if (!force && featureDefinitionsRequestRef.current) {
        return featureDefinitionsRequestRef.current
      }

      setFeatureDefinitionsStatus("loading")
      setFeatureDefinitionsError(null)

      const request = loadFeatureDefinitions()
        .then((definitions) => {
          setFeatureDefinitions(definitions)
          setFeatureDefinitionsStatus("ready")
          return definitions
        })
        .catch((error) => {
          setFeatureDefinitions([])
          setFeatureDefinitionsStatus("error")
          setFeatureDefinitionsError(
            error instanceof Error
              ? error.message
              : "Could not load feature definitions",
          )
          throw error
        })
        .finally(() => {
          if (featureDefinitionsRequestRef.current === request) {
            featureDefinitionsRequestRef.current = null
          }
        })

      featureDefinitionsRequestRef.current = request
      return request
    },
    [featureDefinitions, featureDefinitionsStatus],
  )

  const refreshOrganizationClasses = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const organizationId = activeOrganization?.id

      if (!organizationId) {
        setOrganizationClasses([])
        setOrganizationClassesStatus("idle")
        setOrganizationClassesError(null)
        return []
      }

      if (!force && organizationClassesStatus === "ready") {
        return organizationClasses
      }

      if (!force && classesRequestRef.current) {
        return classesRequestRef.current
      }

      setOrganizationClassesStatus("loading")
      setOrganizationClassesError(null)

      const request = loadOrganizationClasses(organizationId)
        .then((classes) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setOrganizationClasses(classes)
            setOrganizationClassesStatus("ready")
          }

          return classes
        })
        .catch((error) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setOrganizationClasses([])
            setOrganizationClassesStatus("error")
            setOrganizationClassesError(
              error instanceof Error ? error.message : "Could not load classes",
            )
          }

          throw error
        })
        .finally(() => {
          if (classesRequestRef.current === request) {
            classesRequestRef.current = null
          }
        })

      classesRequestRef.current = request
      return request
    },
    [activeOrganization?.id, organizationClasses, organizationClassesStatus],
  )

  const refreshOrganizationUsers = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const organizationId = activeOrganization?.id

      if (!organizationId) {
        setOrganizationMembers([])
        setOrganizationInvites([])
        setOrganizationUsersStatus("idle")
        setOrganizationUsersError(null)
        return { members: [], invites: [] }
      }

      if (!force && organizationUsersStatus === "ready") {
        return { members: organizationMembers, invites: organizationInvites }
      }

      if (!force && usersRequestRef.current) {
        return usersRequestRef.current
      }

      setOrganizationUsersStatus("loading")
      setOrganizationUsersError(null)

      const request = loadOrganizationUsers(organizationId)
        .then((users) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setOrganizationMembers(users.members)
            setOrganizationInvites(users.invites)
            setOrganizationUsersStatus("ready")
          }

          return users
        })
        .catch((error) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setOrganizationMembers([])
            setOrganizationInvites([])
            setOrganizationUsersStatus("error")
            setOrganizationUsersError(
              error instanceof Error ? error.message : "Could not load users",
            )
          }

          throw error
        })
        .finally(() => {
          if (usersRequestRef.current === request) {
            usersRequestRef.current = null
          }
        })

      usersRequestRef.current = request
      return request
    },
    [
      activeOrganization?.id,
      organizationInvites,
      organizationMembers,
      organizationUsersStatus,
    ],
  )

  useEffect(() => {
    activeOrganizationIdRef.current = activeOrganization?.id ?? null
    classesRequestRef.current = null
    usersRequestRef.current = null
    setOrganizationClasses([])
    setOrganizationMembers([])
    setOrganizationInvites([])
    setOrganizationClassesError(null)
    setOrganizationUsersError(null)
    setOrganizationClassesStatus("idle")
    setOrganizationUsersStatus("idle")

    if (activeOrganization) {
      void refreshFeatureDefinitions()
      void refreshOrganizationClasses({ force: true })
    }
  }, [activeOrganization?.id])

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        allUsers: USERS,
        isDarkMode,
        themeMode,
        setThemeMode,
        toggleDarkMode,
        authUser,
        isAuthLoading,
        isAuthenticated: !!authUser,
        organizations,
        activeOrganization,
        activeOrganizationRole,
        featureDefinitions,
        featureDefinitionsStatus,
        featureDefinitionsError,
        organizationClasses,
        organizationClassesStatus,
        organizationClassesError,
        organizationMembers,
        organizationInvites,
        organizationUsersStatus,
        organizationUsersError,
        refreshOrganizationClasses,
        refreshFeatureDefinitions,
        refreshOrganizationUsers,
        updateOrganizationFeatureSetting,
        upsertOrganizationExtension,
        refreshCurrentUser,
        setDefaultOrganization,
        setActiveOrganizationRole,
        signOut,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}

async function loadOrganizationUsers(organizationId: string) {
  const supabase = createClient()
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
    .in("status", ["invited", "suspended"])
    .order("created_at", { ascending: false })

  if (inviteError) throw inviteError

  return {
    members,
    invites: (inviteData ?? []) as OrganizationInviteRow[],
  }
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
