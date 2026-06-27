"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  BookOpen,
  CheckCircle2,
  Code2,
  GraduationCap,
  Globe2,
  Home,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Puzzle,
  Trophy,
  Video,
  XCircle,
} from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  OrganizationFeatureIconKey,
  OrganizationFeatureSummary,
} from "@/lib/features/organization-feature-summary"
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"
import { toast } from "@/hooks/use-toast"

type InviteDetails = {
  organizationId: string
  organizationName: string
  organizationSlug: string | null
  role: "org_admin" | "teacher" | "student"
  features: OrganizationFeatureSummary[]
}

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const {
    authUser,
    currentUser,
    isAuthLoading,
    isAuthenticated,
    refreshCurrentUser,
    signOut,
  } = useApp()
  const [inviteState, setInviteState] = useState<"idle" | "accepted" | "error">(
    "idle",
  )
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null)
  const [isPending, startTransition] = useTransition()
  const token = params.token

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace(getInviteAuthPath(token))
    }
  }, [isAuthLoading, isAuthenticated, router, token])

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return

    let cancelled = false

    async function loadInviteDetails() {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`)
      const payload = (await response.json().catch(() => null)) as
        | InviteDetails
        | { error?: string }
        | null

      if (cancelled) return

      if (response.ok && isInviteDetails(payload)) {
        setInviteDetails(payload)
      }
    }

    void loadInviteDetails().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isAuthLoading, isAuthenticated, token])

  function acceptInvite() {
    setInviteState("idle")

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc("accept_organization_invite", {
        invite_token: token,
      })

      if (error) {
        setInviteState("error")
        toast({
          title: "Invite failed",
          description: formatInviteError(error.message, currentEmail),
          variant: "destructive",
        })
        return
      }

      await refreshCurrentUser()
      setInviteState("accepted")
      toast({
        title: "Invite accepted",
        description: "You can now enter the organization.",
      })
    })
  }

  function switchAccount() {
    setInviteState("idle")

    startTransition(async () => {
      await signOut()
      router.replace(getInviteAuthPath(token))
      router.refresh()
    })
  }

  const currentEmail = authUser?.email ?? currentUser.email

  if (isAuthLoading || !isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Preparing invite...
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-8 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            {inviteState === "accepted" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : inviteState === "error" ? (
              <XCircle className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
          </div>
          <CardTitle>
            {inviteDetails
              ? `Join ${inviteDetails.organizationName}`
              : "Accept organization invite"}
          </CardTitle>
          <CardDescription>
            {inviteDetails ? (
              <>
                This invite gives you access as{" "}
                <span className="font-medium text-foreground">
                  {roleLabel(inviteDetails.role)}
                </span>
                . Make sure you are signed in with the invited email address.
              </>
            ) : (
              "This invite can only be accepted by the email address it was sent to. Make sure you are signed in with that account."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentEmail ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">
                {currentEmail}
              </span>
            </p>
          ) : null}

          {inviteDetails?.features.length ? (
            <FeatureGrid features={inviteDetails.features} />
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {inviteState === "accepted" ? (
              <Button asChild className="flex-1">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={isPending}
                onClick={acceptInvite}
              >
                {isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  "Accept invite"
                )}
              </Button>
            )}
            <Button asChild variant="outline" className="flex-1">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          </div>
          {inviteState !== "accepted" ? (
            <Button
              className="mt-3 w-full gap-2"
              disabled={isPending}
              onClick={switchAccount}
              variant="ghost"
            >
              <LogOut className="h-4 w-4" />
              Use another account
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}

function FeatureGrid({ features }: { features: OrganizationFeatureSummary[] }) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Included tools
      </p>
      <div className="grid grid-cols-2 gap-2">
        {features.map((feature) => {
          const FeatureIcon = FEATURE_ICONS[feature.icon] ?? Home

          return (
            <div
              key={feature.key}
              className="rounded-lg border bg-card p-3 text-card-foreground"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <FeatureIcon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-foreground">
                  {feature.label}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {feature.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const FEATURE_ICONS: Record<OrganizationFeatureIconKey, typeof Home> = {
  public: Globe2,
  home: Home,
  chat: MessageSquare,
  materials: BookOpen,
  assignments: CheckCircle2,
  sessions: Video,
  exam: GraduationCap,
  leaderboard: Trophy,
  extensions: Puzzle,
  ide: Code2,
}

function roleLabel(role: InviteDetails["role"]) {
  if (role === "org_admin") return "Admin"
  if (role === "teacher") return "Teacher"

  return "Student"
}

function isInviteDetails(value: unknown): value is InviteDetails {
  return (
    typeof value === "object" &&
    value !== null &&
    "organizationId" in value &&
    "organizationName" in value &&
    "role" in value &&
    "features" in value &&
    Array.isArray((value as { features?: unknown }).features)
  )
}

function formatInviteError(message: string, currentEmail: string | undefined) {
  if (message !== "This invite is for a different email address") {
    return message
  }

  return currentEmail
    ? `This invite was sent to a different email address. You are signed in as ${currentEmail}. Use another account to sign in with the invited email.`
    : "This invite was sent to a different email address. Use another account to sign in with the invited email."
}

function getInviteAuthPath(token: string) {
  const next = `/invite/${encodeURIComponent(token)}`
  const params = new URLSearchParams({
    next,
    mode: "sign-up",
    reason: "invite",
  })

  return `/auth?${params.toString()}`
}
