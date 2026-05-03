"use client"

import { useState } from "react"
import {
  Building,
  ChevronRight,
  Languages,
  LockKeyhole,
  Mail,
  Palette,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ORGANIZATION_ROLE_BADGES,
  organizationRoleLabel,
} from "@/components/top-bar/organization-menu-helpers"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
    currentUser,
    setActiveOrganizationRole,
    setThemeMode,
    themeMode,
  } = useApp()
  const [switchingRole, setSwitchingRole] =
    useState<OrganizationUserRole | null>(null)
  const [roleErrorMessage, setRoleErrorMessage] = useState<string | null>(null)
  const [languagePreference, setLanguagePreference] = useState("en")
  const organizationRoles = [...(activeOrganization?.roles ?? [])].sort(
    (left, right) =>
      ORGANIZATION_ROLE_PRIORITY.indexOf(left) -
      ORGANIZATION_ROLE_PRIORITY.indexOf(right),
  )

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
        <CardContent className="divide-y divide-border p-0">
          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">
                  {themeMode === "system"
                    ? "System default"
                    : themeMode === "dark"
                      ? "Dark"
                      : "Light"}
                </p>
              </div>
            </div>
            <ToggleGroup
              type="single"
              value={themeMode}
              onValueChange={(value) => {
                if (
                  value === "light" ||
                  value === "dark" ||
                  value === "system"
                ) {
                  setThemeMode(value)
                }
              }}
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
            >
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              <ToggleGroupItem value="system">System</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Languages className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Language
                </p>
                <p className="text-xs text-muted-foreground">English</p>
              </div>
            </div>
            <ToggleGroup
              type="single"
              value={languagePreference}
              onValueChange={(value) => {
                if (value) setLanguagePreference(value)
              }}
              variant="outline"
              size="sm"
              className="w-full md:w-auto"
              disabled
            >
              <ToggleGroupItem value="en">English</ToggleGroupItem>
              <ToggleGroupItem value="es">Spanish</ToggleGroupItem>
              <ToggleGroupItem value="fr">French</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LockKeyhole className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Password
                </p>
                <p className="text-xs text-muted-foreground">
                  Manage your sign-in password
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="justify-between">
              <Link href="/profile/password">
                Change password
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
