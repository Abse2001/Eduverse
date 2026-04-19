"use client"

import React, {
  createContext,
  useContext,
  useEffect,
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
  type ProfileRecord,
  toAppUser,
  toOrganizations,
} from "@/lib/supabase/app-user"
import { createClient } from "@/lib/supabase/client"

const FALLBACK_USER = USERS[0]

interface AppContextValue {
  currentUser: User
  setCurrentUser: (user: User) => void
  allUsers: User[]
  isDarkMode: boolean
  toggleDarkMode: () => void
  authUser: SupabaseAuthUser | null
  isAuthLoading: boolean
  isAuthenticated: boolean
  organizations: AppOrganization[]
  activeOrganization: AppOrganization | null
  refreshCurrentUser: () => Promise<void>
  setDefaultOrganization: (organizationId: string) => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(FALLBACK_USER)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [authUser, setAuthUser] = useState<SupabaseAuthUser | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [organizations, setOrganizations] = useState<AppOrganization[]>([])

  function toggleDarkMode() {
    setIsDarkMode((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
      return next
    })
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
      .select("organization_id, role, status")
      .eq("user_id", user.id)

    if (membershipError) {
      setCurrentUser(toAppUser(profile, null))
      setOrganizations([])
      setIsAuthLoading(false)
      return
    }

    const memberships =
      ((membershipData ?? []) as Array<{
        organization_id: string
        role: "org_owner" | "org_admin" | "teacher" | "student"
        status: "active" | "invited" | "suspended"
      }>) ?? []

    const organizationIds = memberships
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.organization_id)

    let membershipsWithOrganizations: OrganizationMembershipRecord[] =
      memberships

    if (organizationIds.length > 0) {
      const { data: organizationData } = await supabase
        .from("organizations")
        .select("id, slug, name")
        .in("id", organizationIds)

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
        organizations: organizationMap.get(membership.organization_id) ?? null,
      }))
    }

    const nextOrganizations = toOrganizations(
      profile,
      membershipsWithOrganizations,
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

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setAuthUser(null)
    setCurrentUser(FALLBACK_USER)
    setOrganizations([])
  }

  const activeOrganization =
    organizations.find((organization) => organization.isDefault) ?? null

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        allUsers: USERS,
        isDarkMode,
        toggleDarkMode,
        authUser,
        isAuthLoading,
        isAuthenticated: !!authUser,
        organizations,
        activeOrganization,
        refreshCurrentUser,
        setDefaultOrganization,
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
