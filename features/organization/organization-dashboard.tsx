"use client"

import Link from "next/link"
import { FormEvent, useState, useTransition } from "react"
import { Building2, LoaderCircle } from "lucide-react"
import { useApp } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const ROLE_BADGES: Record<string, string> = {
  org_owner:
    "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-0",
  org_admin:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-0",
  teacher:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-0",
  student:
    "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-0",
}

function roleLabel(role: string) {
  if (role === "org_owner") return "Owner"
  if (role === "org_admin") return "Admin"
  if (role === "teacher") return "Teacher"
  return "Student"
}

export function OrganizationDashboard() {
  const {
    currentUser,
    organizations,
    activeOrganization,
    refreshCurrentUser,
    setDefaultOrganization,
  } = useApp()
  const [orgName, setOrgName] = useState("")
  const [orgSlug, setOrgSlug] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isCreatingOrg, startCreateOrg] = useTransition()

  function submitCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    startCreateOrg(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc("create_organization", {
        org_name: orgName,
        requested_slug: orgSlug || null,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setOrgName("")
      setOrgSlug("")
      await refreshCurrentUser()
      setSuccessMessage("Organization created. You are now its owner.")
    })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Organization Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as {currentUser.name}. Choose which organization you want
            to enter, or create a new one.
          </p>
        </div>
        {activeOrganization ? (
          <div className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-end">
            <div>
              <p className="text-muted-foreground">Current organization</p>
              <p className="font-semibold text-foreground">
                {activeOrganization.name}
              </p>
            </div>
            <Button asChild size="sm" className="sm:ml-2">
              <Link href="/dashboard">Open workspace</Link>
            </Button>
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert>
          <AlertTitle>Updated</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              My Organizations
            </CardTitle>
            <CardDescription>
              A user can belong to multiple organizations. Your role is decided
              by the organization you enter.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {organizations.length > 0 ? (
              <div className="grid gap-3">
                {organizations.map((organization) => (
                  <div
                    key={organization.id}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors",
                      organization.isDefault
                        ? "border-sky-300 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/20"
                        : "bg-card",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">
                          {organization.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          slug: {organization.slug}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn(ROLE_BADGES[organization.role])}
                        >
                          {roleLabel(organization.role)}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <Button
                          variant={
                            organization.isDefault ? "secondary" : "outline"
                          }
                          onClick={() =>
                            void setDefaultOrganization(organization.id)
                          }
                        >
                          {organization.isDefault ? "Current org" : "Enter org"}
                        </Button>
                        {organization.isDefault ? (
                          <Button asChild size="sm">
                            <Link href="/dashboard">Open workspace</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                You are not part of any organizations yet. Create one from the
                form on the right.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Organization</CardTitle>
            <CardDescription>
              Any signed-in user can create a workspace. The creator is added as
              `org_owner` automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitCreateOrganization}>
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  placeholder="Eduverse Academy"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Preferred slug</Label>
                <Input
                  id="org-slug"
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(event.target.value)}
                  placeholder="eduverse-academy"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Leave blank to auto-generate from the name.
                </p>
              </div>
              <Button className="w-full" type="submit" disabled={isCreatingOrg}>
                {isCreatingOrg ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating organization...
                  </>
                ) : (
                  "Create organization"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
