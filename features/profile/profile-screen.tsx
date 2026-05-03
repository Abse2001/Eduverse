"use client"

import { type FormEvent, useEffect, useState } from "react"
import { Building, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  ORGANIZATION_ROLE_BADGES,
  organizationRoleLabel,
} from "@/components/top-bar/organization-menu-helpers"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import { type OrganizationUserRole, useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { ROLE_BADGE_COLOR_MAP } from "@/lib/view-config"

const ORGANIZATION_ROLE_PRIORITY: OrganizationUserRole[] = [
  "org_owner",
  "org_admin",
  "teacher",
  "student",
]

export function ProfileScreen() {
  const router = useRouter()
  const {
    activeOrganization,
    activeOrganizationRole,
    authUser,
    currentUser,
    refreshCurrentUser,
    setActiveOrganizationRole,
  } = useApp()
  const [switchingRole, setSwitchingRole] =
    useState<OrganizationUserRole | null>(null)
  const [roleErrorMessage, setRoleErrorMessage] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState(currentUser.name)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(
    null,
  )
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<
    string | null
  >(null)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const organizationRoles = [...(activeOrganization?.roles ?? [])].sort(
    (left, right) =>
      ORGANIZATION_ROLE_PRIORITY.indexOf(left) -
      ORGANIZATION_ROLE_PRIORITY.indexOf(right),
  )

  useEffect(() => {
    setDisplayName(currentUser.name)
  }, [currentUser.name])

  async function selectRole(role: OrganizationUserRole) {
    if (!activeOrganization || role === activeOrganizationRole) return

    setRoleErrorMessage(null)
    setSwitchingRole(role)

    try {
      await setActiveOrganizationRole(role)
      router.refresh()
    } catch (error) {
      setRoleErrorMessage(
        error instanceof Error ? error.message : "Could not switch role",
      )
    } finally {
      setSwitchingRole(null)
    }
  }

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextDisplayName = displayName.trim()
    if (!authUser) {
      setProfileMessage(null)
      setProfileErrorMessage("You need to be signed in to update your profile.")
      return
    }

    if (!nextDisplayName) {
      setProfileMessage(null)
      setProfileErrorMessage("Username is required.")
      return
    }

    setIsSavingProfile(true)
    setProfileMessage(null)
    setProfileErrorMessage(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: nextDisplayName })
        .eq("id", authUser.id)

      if (error) throw error

      await refreshCurrentUser()
      setProfileMessage("Username updated.")
    } catch (error) {
      setProfileErrorMessage(
        error instanceof Error ? error.message : "Could not update username.",
      )
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setPasswordMessage(null)
    setPasswordErrorMessage(null)

    if (!authUser) {
      setPasswordErrorMessage("You need to be signed in to update password.")
      return
    }

    if (newPassword.length < 6) {
      setPasswordErrorMessage("Password must be at least 6 characters.")
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMessage("Passwords do not match.")
      return
    }

    setIsSavingPassword(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      setNewPassword("")
      setConfirmPassword("")
      setPasswordMessage("Password updated.")
    } catch (error) {
      setPasswordErrorMessage(
        error instanceof Error ? error.message : "Could not update password.",
      )
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Card>
        <CardContent className="flex flex-col items-start gap-5 p-6 md:flex-row md:items-center">
          <Avatar className="h-20 w-20 shrink-0">
            <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
              {currentUser.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {currentUser.name}
              </h1>
              {organizationRoles.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {organizationRoles.map((role) => {
                    const isActive = role === activeOrganizationRole

                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={isActive}
                        disabled={switchingRole !== null}
                        onClick={() => void selectRole(role)}
                        className={cn(
                          "inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70",
                          ORGANIZATION_ROLE_BADGES[role],
                          isActive &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                      >
                        {organizationRoleLabel(role)}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span
                  className={cn(
                    "mt-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-2 ring-primary ring-offset-2 ring-offset-background",
                    ROLE_BADGE_COLOR_MAP[currentUser.role],
                  )}
                >
                  {currentUser.role}
                </span>
              )}
            </div>
            {roleErrorMessage ? (
              <p className="mt-2 text-xs text-destructive">
                {roleErrorMessage}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {currentUser.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" />
                {currentUser.institution}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-8 p-6">
          <form className="space-y-3" onSubmit={saveDisplayName}>
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Username</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={isSavingProfile}
              />
            </div>
            {profileErrorMessage ? (
              <p className="text-sm text-destructive">{profileErrorMessage}</p>
            ) : null}
            {profileMessage ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {profileMessage}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={
                isSavingProfile || displayName.trim() === currentUser.name
              }
            >
              {isSavingProfile ? "Saving..." : "Save username"}
            </Button>
          </form>

          <form className="space-y-3" onSubmit={savePassword}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={isSavingPassword}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSavingPassword}
                  autoComplete="new-password"
                />
              </div>
            </div>
            {passwordErrorMessage ? (
              <p className="text-sm text-destructive">{passwordErrorMessage}</p>
            ) : null}
            {passwordMessage ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {passwordMessage}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={isSavingPassword || !newPassword || !confirmPassword}
            >
              {isSavingPassword ? "Updating..." : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
