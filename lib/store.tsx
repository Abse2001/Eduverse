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
  type OrganizationMembershipRoleRecord,
  type OrganizationUserRole,
} from "@/lib/supabase/app-user"
import { type OrganizationClass } from "@/lib/supabase/classes"
import { createClient } from "@/lib/supabase/client"
import {
  type FeatureDefinition,
  type FeatureSetting,
  type OrganizationExtension,
} from "@/lib/supabase/features"
import type { OrganizationSettingsPayload } from "@/lib/supabase/organization-settings"

const FALLBACK_USER = USERS[0]

type DataStatus = "idle" | "loading" | "ready" | "error"
type ThemeMode = "light" | "dark" | "system"
type CurrentUserPayload = {
  authUser: SupabaseAuthUser
  currentUser: User
  organizations: AppOrganization[]
}

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
  role: OrganizationUserRole
  status: "active" | "invited" | "suspended"
  token: string
}

export type OrganizationJoinLinkRow = {
  id: string
  organization_id: string
  purpose: string
  token: string
  default_role: Exclude<OrganizationUserRole, "org_admin">
  enabled: boolean
  approval_required: boolean
  max_uses: number | null
  use_count: number
  expires_at: string | null
}

export type OrganizationJoinRequestRow = {
  id: string
  organization_id: string
  user_id: string
  requested_role: Exclude<OrganizationUserRole, "org_admin">
  status: "pending" | "approved" | "rejected"
  created_at: string
  profile?: {
    display_name: string
    email: string
  }
}

export type ClassLiveSessionRow = {
  id: string
  organization_id: string
  class_id: string
  room_name: string
  live_session_id: string
  started_by_user_id: string
  status: "live" | "ended"
  started_at: string
  last_seen_at: string
  ended_at: string | null
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
  organizationJoinLinks: OrganizationJoinLinkRow[]
  organizationJoinRequests: OrganizationJoinRequestRow[]
  organizationUsersStatus: DataStatus
  organizationUsersError: string | null
  classLiveSessions: ClassLiveSessionRow[]
  classLiveSessionsStatus: DataStatus
  classLiveSessionsError: string | null
  refreshOrganizationClasses: (options?: {
    force?: boolean
  }) => Promise<OrganizationClass[]>
  refreshFeatureDefinitions: (options?: {
    force?: boolean
  }) => Promise<FeatureDefinition[]>
  refreshOrganizationUsers: (options?: { force?: boolean }) => Promise<{
    members: OrganizationMemberRow[]
    invites: OrganizationInviteRow[]
    joinLinks: OrganizationJoinLinkRow[]
    joinRequests: OrganizationJoinRequestRow[]
  }>
  refreshClassLiveSessions: (options?: {
    force?: boolean
  }) => Promise<ClassLiveSessionRow[]>
  updateOrganizationFeatureSetting: (
    organizationId: string,
    setting: FeatureSetting,
  ) => void
  upsertOrganizationExtension: (
    organizationId: string,
    extension: OrganizationExtension,
  ) => void
  updateOrganizationSettings: (
    organizationId: string,
    settings: OrganizationSettingsPayload,
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
  const [organizationJoinLinks, setOrganizationJoinLinks] = useState<
    OrganizationJoinLinkRow[]
  >([])
  const [organizationJoinRequests, setOrganizationJoinRequests] = useState<
    OrganizationJoinRequestRow[]
  >([])
  const [organizationUsersStatus, setOrganizationUsersStatus] =
    useState<DataStatus>("idle")
  const [organizationUsersError, setOrganizationUsersError] = useState<
    string | null
  >(null)
  const [classLiveSessions, setClassLiveSessions] = useState<
    ClassLiveSessionRow[]
  >([])
  const [classLiveSessionsStatus, setClassLiveSessionsStatus] =
    useState<DataStatus>("idle")
  const [classLiveSessionsError, setClassLiveSessionsError] = useState<
    string | null
  >(null)
  const classesRequestRef = useRef<Promise<OrganizationClass[]> | null>(null)
  const featureDefinitionsRequestRef = useRef<Promise<
    FeatureDefinition[]
  > | null>(null)
  const usersRequestRef = useRef<Promise<{
    members: OrganizationMemberRow[]
    invites: OrganizationInviteRow[]
    joinLinks: OrganizationJoinLinkRow[]
    joinRequests: OrganizationJoinRequestRow[]
  }> | null>(null)
  const liveSessionsRequestRef = useRef<Promise<ClassLiveSessionRow[]> | null>(
    null,
  )
  const classLiveSessionsRef = useRef<ClassLiveSessionRow[]>([])
  const classLiveSessionsStatusRef = useRef<DataStatus>("idle")
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

  useEffect(() => {
    classLiveSessionsRef.current = classLiveSessions
  }, [classLiveSessions])

  useEffect(() => {
    classLiveSessionsStatusRef.current = classLiveSessionsStatus
  }, [classLiveSessionsStatus])

  async function loadUser(user: SupabaseAuthUser | null) {
    setAuthUser(user)

    if (!user) {
      setCurrentUser(FALLBACK_USER)
      setOrganizations([])
      setIsAuthLoading(false)
      return
    }

    try {
      const payload = await apiGet<CurrentUserPayload>("/api/me")
      setAuthUser(payload.authUser)
      setOrganizations(payload.organizations)
      setCurrentUser(payload.currentUser)
    } catch {
      setCurrentUser(FALLBACK_USER)
      setOrganizations([])
    } finally {
      setIsAuthLoading(false)
    }
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

    const payload = await apiPatch<CurrentUserPayload>("/api/me", {
      defaultOrganizationId: organizationId,
    })
    setAuthUser(payload.authUser)
    setOrganizations(payload.organizations)
    setCurrentUser(payload.currentUser)
  }

  async function setActiveOrganizationRole(role: OrganizationUserRole) {
    if (!authUser || !activeOrganization) return

    const payload = await apiPatch<CurrentUserPayload>("/api/me", {
      organizationId: activeOrganization.id,
      activeOrganizationRole: role,
    })
    setAuthUser(payload.authUser)
    setOrganizations(payload.organizations)
    setCurrentUser(payload.currentUser)
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
    setOrganizationJoinLinks([])
    setOrganizationJoinRequests([])
    setClassLiveSessions([])
    setOrganizationClassesStatus("idle")
    setFeatureDefinitionsStatus("idle")
    setOrganizationUsersStatus("idle")
    setClassLiveSessionsStatus("idle")
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

  function updateOrganizationSettings(
    organizationId: string,
    settings: OrganizationSettingsPayload,
  ) {
    setOrganizations((currentOrganizations) =>
      currentOrganizations.map((organization) =>
        organization.id === organizationId
          ? { ...organization, settings }
          : organization,
      ),
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

      const request = apiGet<{ featureDefinitions: FeatureDefinition[] }>(
        "/api/feature-definitions",
      )
        .then(({ featureDefinitions }) => {
          setFeatureDefinitions(featureDefinitions)
          setFeatureDefinitionsStatus("ready")
          return featureDefinitions
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

      const request = apiGet<{ classes: OrganizationClass[] }>(
        `/api/organizations/${encodeURIComponent(organizationId)}/classes`,
      )
        .then(({ classes }) => {
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
        setOrganizationJoinLinks([])
        setOrganizationJoinRequests([])
        setOrganizationUsersStatus("idle")
        setOrganizationUsersError(null)
        return { members: [], invites: [], joinLinks: [], joinRequests: [] }
      }

      if (!force && organizationUsersStatus === "ready") {
        return {
          members: organizationMembers,
          invites: organizationInvites,
          joinLinks: organizationJoinLinks,
          joinRequests: organizationJoinRequests,
        }
      }

      if (!force && usersRequestRef.current) {
        return usersRequestRef.current
      }

      setOrganizationUsersStatus("loading")
      setOrganizationUsersError(null)

      const request = apiGet<{
        members: OrganizationMemberRow[]
        invites: OrganizationInviteRow[]
        joinLinks: OrganizationJoinLinkRow[]
        joinRequests: OrganizationJoinRequestRow[]
      }>(`/api/organizations/${encodeURIComponent(organizationId)}/users`)
        .then((users) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setOrganizationMembers(users.members)
            setOrganizationInvites(users.invites)
            setOrganizationJoinLinks(users.joinLinks)
            setOrganizationJoinRequests(users.joinRequests)
            setOrganizationUsersStatus("ready")
          }

          return users
        })
        .catch((error) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setOrganizationMembers([])
            setOrganizationInvites([])
            setOrganizationJoinLinks([])
            setOrganizationJoinRequests([])
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
      organizationJoinLinks,
      organizationJoinRequests,
      organizationMembers,
      organizationUsersStatus,
    ],
  )

  const refreshClassLiveSessions = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const organizationId = activeOrganization?.id

      if (!organizationId) {
        setClassLiveSessions([])
        setClassLiveSessionsStatus("idle")
        setClassLiveSessionsError(null)
        return []
      }

      if (!force && classLiveSessionsStatusRef.current === "ready") {
        return classLiveSessionsRef.current
      }

      if (!force && liveSessionsRequestRef.current) {
        return liveSessionsRequestRef.current
      }

      setClassLiveSessionsStatus("loading")
      setClassLiveSessionsError(null)

      const request = apiGet<{ liveSessions: ClassLiveSessionRow[] }>(
        `/api/organizations/${encodeURIComponent(
          organizationId,
        )}/live-sessions`,
      )
        .then(({ liveSessions }) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setClassLiveSessions(liveSessions)
            setClassLiveSessionsStatus("ready")
          }

          return liveSessions
        })
        .catch((error) => {
          if (activeOrganizationIdRef.current === organizationId) {
            setClassLiveSessions([])
            setClassLiveSessionsStatus("error")
            setClassLiveSessionsError(
              error instanceof Error
                ? error.message
                : "Could not load live sessions",
            )
          }

          throw error
        })
        .finally(() => {
          if (liveSessionsRequestRef.current === request) {
            liveSessionsRequestRef.current = null
          }
        })

      liveSessionsRequestRef.current = request
      return request
    },
    [activeOrganization?.id],
  )

  useEffect(() => {
    activeOrganizationIdRef.current = activeOrganization?.id ?? null
    classesRequestRef.current = null
    usersRequestRef.current = null
    liveSessionsRequestRef.current = null
    setOrganizationClasses([])
    setOrganizationMembers([])
    setOrganizationInvites([])
    setOrganizationJoinLinks([])
    setOrganizationJoinRequests([])
    setClassLiveSessions([])
    setOrganizationClassesError(null)
    setOrganizationUsersError(null)
    setClassLiveSessionsError(null)
    setOrganizationClassesStatus("idle")
    setOrganizationUsersStatus("idle")
    setClassLiveSessionsStatus("idle")

    if (activeOrganization) {
      void refreshFeatureDefinitions()
      void refreshOrganizationClasses({ force: true })
      void refreshClassLiveSessions({ force: true })
    }
  }, [activeOrganization?.id])

  useEffect(() => {
    if (!activeOrganization) return

    const supabase = createClient()
    const organizationId = activeOrganization.id
    const channel = supabase
      .channel(`class-live-sessions:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_live_sessions",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          void refreshClassLiveSessions({ force: true }).catch(() => {})
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeOrganization?.id, refreshClassLiveSessions])

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
        organizationJoinLinks,
        organizationJoinRequests,
        organizationUsersStatus,
        organizationUsersError,
        classLiveSessions,
        classLiveSessionsStatus,
        classLiveSessionsError,
        refreshOrganizationClasses,
        refreshFeatureDefinitions,
        refreshOrganizationUsers,
        refreshClassLiveSessions,
        updateOrganizationFeatureSetting,
        upsertOrganizationExtension,
        updateOrganizationSettings,
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

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  return parseApiResponse<T>(response)
}

async function apiPatch<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return parseApiResponse<T>(response)
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "API request failed")
  }

  return payload as T
}
