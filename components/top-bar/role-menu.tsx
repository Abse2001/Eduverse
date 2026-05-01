"use client"

import { useState } from "react"
import {
  Check,
  ChevronDown,
  GraduationCap,
  LoaderCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type OrganizationUserRole, useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import {
  ORGANIZATION_ROLE_BADGES,
  organizationRoleLabel,
} from "./organization-menu-helpers"

const ROLE_ICONS: Record<OrganizationUserRole, typeof UserRound> = {
  org_owner: ShieldCheck,
  org_admin: ShieldCheck,
  teacher: GraduationCap,
  student: UserRound,
}

export function RoleMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const {
    activeOrganization,
    activeOrganizationRole,
    setActiveOrganizationRole,
  } = useApp()
  const [isOpen, setIsOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [switchingRole, setSwitchingRole] =
    useState<OrganizationUserRole | null>(null)

  const activeRole = activeOrganizationRole ?? "student"
  const ActiveIcon = ROLE_ICONS[activeRole]
  const roles = activeOrganization?.roles ?? []

  if (!activeOrganization || roles.length === 0) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-60">
        <ActiveIcon className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">
          {organizationRoleLabel(activeRole)}
        </span>
      </div>
    )
  }

  if (roles.length === 1) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-foreground">
        <ActiveIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="hidden sm:inline">
          {organizationRoleLabel(activeRole)}
        </span>
      </div>
    )
  }

  async function selectRole(role: OrganizationUserRole) {
    if (!activeOrganization || role === activeOrganizationRole) return

    setErrorMessage(null)
    setSwitchingRole(role)

    try {
      await setActiveOrganizationRole(role)
      if (isRoleSensitiveRoute(pathname)) {
        router.replace("/dashboard")
      }
      router.refresh()
      setIsOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Action failed")
    } finally {
      setSwitchingRole(null)
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60">
          <ActiveIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="hidden sm:inline">
            {organizationRoleLabel(activeRole)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Role in {activeOrganization?.name ?? "organization"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => {
          const RoleIcon = ROLE_ICONS[role]
          const isActive = role === activeOrganizationRole
          const isSwitching = role === switchingRole

          return (
            <DropdownMenuItem
              key={role}
              className="cursor-pointer gap-3"
              disabled={isSwitching}
              onClick={() => void selectRole(role)}
            >
              <RoleIcon className="h-4 w-4" />
              <Badge
                variant="secondary"
                className={cn("border-0", ORGANIZATION_ROLE_BADGES[role])}
              >
                {organizationRoleLabel(role)}
              </Badge>
              <span className="ml-auto">
                {isSwitching ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : isActive ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null}
              </span>
            </DropdownMenuItem>
          )
        })}
        {errorMessage ? (
          <div className="mx-2 my-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function isRoleSensitiveRoute(pathname: string) {
  return pathname.startsWith("/classes/")
}
