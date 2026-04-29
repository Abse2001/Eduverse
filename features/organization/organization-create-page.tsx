"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, LoaderCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"

export function OrganizationCreatePage() {
  const router = useRouter()
  const { currentUser, refreshCurrentUser } = useApp()
  const [orgName, setOrgName] = useState("")
  const [orgSlug, setOrgSlug] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc("create_organization", {
        org_name: orgName,
        requested_slug: orgSlug || null,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      await refreshCurrentUser()
      router.replace("/dashboard")
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center p-6">
      <div className="mb-6 space-y-2">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Create organization
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {currentUser.name}. You will become the owner of this
          organization.
        </p>
      </div>

      {errorMessage ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Could not create organization</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Organization details</CardTitle>
          <CardDescription>
            The organization becomes your active workspace after creation.
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
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create organization"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
