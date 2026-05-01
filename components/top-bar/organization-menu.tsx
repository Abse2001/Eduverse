"use client"

import { useState } from "react"
import {
  Building2,
  Check,
  ChevronDown,
  LoaderCircle,
  PlusCircle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import {
  ORGANIZATION_ROLE_BADGES,
  organizationRoleLabel,
} from "./organization-menu-helpers"

export function OrganizationMenu() {
  const router = useRouter()
  const { activeOrganization, organizations, setDefaultOrganization } = useApp()
  const [isOpen, setIsOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<
    string | null
  >(null)

  async function selectOrganization(organizationId: string) {
    if (organizationId === activeOrganization?.id) return

    setErrorMessage(null)
    setSwitchingOrganizationId(organizationId)

    try {
      await setDefaultOrganization(organizationId)
      router.replace("/dashboard")
      router.refresh()
      setIsOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Action failed")
    } finally {
      setSwitchingOrganizationId(null)
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 max-w-[12rem] items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:max-w-[16rem]">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {activeOrganization?.name ?? "No organization"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[92vw]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.length > 0 ? (
          organizations.map((organization) => {
            const isActive = organization.id === activeOrganization?.id
            const isSwitching = switchingOrganizationId === organization.id

            return (
              <DropdownMenuItem
                key={organization.id}
                className="cursor-pointer items-start gap-3 py-2"
                disabled={isSwitching}
                onClick={() => void selectOrganization(organization.id)}
              >
                <Building2 className="mt-0.5 h-4 w-4" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {organization.name}
                    </p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        ORGANIZATION_ROLE_BADGES[organization.selectedRole],
                      )}
                    >
                      {organizationRoleLabel(organization.selectedRole)}
                    </Badge>
                    {organization.roles.length > 1 ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        +{organization.roles.length - 1}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {organization.slug}
                  </p>
                </div>
                {isSwitching ? (
                  <LoaderCircle className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
                ) : isActive ? (
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            )
          })
        ) : (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            No organizations yet. Create one to open a workspace.
          </div>
        )}

        {errorMessage ? (
          <div className="mx-2 my-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => {
            setIsOpen(false)
            router.push("/organizations/create")
          }}
        >
          <PlusCircle className="h-4 w-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
