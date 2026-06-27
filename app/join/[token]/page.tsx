"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Code2,
  GraduationCap,
  Globe2,
  Home,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Puzzle,
  Trophy,
  UsersRound,
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
import { toast } from "@/hooks/use-toast"
import type {
  OrganizationFeatureIconKey,
  OrganizationFeatureSummary,
} from "@/lib/features/organization-feature-summary"
import { useApp } from "@/lib/store"

type JoinLinkDetails = {
  organizationId: string
  organizationName: string
  organizationSlug: string | null
  purpose: string
  role: "teacher" | "student"
  approvalRequired: boolean
  features: OrganizationFeatureSummary[]
}

type JoinState = "idle" | "joined" | "pending" | "already_member" | "error"

const ROLE_LABELS = {
  teacher: "Teacher",
  student: "Student",
}

export default function JoinPage() {
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
  const [joinLink, setJoinLink] = useState<JoinLinkDetails | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [joinState, setJoinState] = useState<JoinState>("idle")
  const [isLoadingLink, setIsLoadingLink] = useState(true)
  const [isPending, startTransition] = useTransition()
  const token = params.token

  useEffect(() => {
    let cancelled = false

    async function loadJoinLink() {
      setIsLoadingLink(true)
      setLoadError(null)

      const response = await fetch(`/api/join/${encodeURIComponent(token)}`)
      const payload = (await response.json().catch(() => ({}))) as
        | JoinLinkDetails
        | { error?: string }

      if (cancelled) return

      if (!response.ok) {
        setJoinLink(null)
        setLoadError(
          "error" in payload && payload.error
            ? payload.error
            : "Could not load join link",
        )
        setIsLoadingLink(false)
        return
      }

      setJoinLink(payload as JoinLinkDetails)
      setIsLoadingLink(false)
    }

    void loadJoinLink().catch((error) => {
      if (cancelled) return

      setJoinLink(null)
      setLoadError(
        error instanceof Error ? error.message : "Could not load join link",
      )
      setIsLoadingLink(false)
    })

    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!isLoadingLink && !isAuthLoading && !isAuthenticated && !loadError) {
      router.replace(getJoinAuthPath(token))
    }
  }, [isAuthLoading, isAuthenticated, isLoadingLink, loadError, router, token])

  function joinOrganization() {
    setJoinState("idle")

    startTransition(async () => {
      const response = await fetch(`/api/join/${encodeURIComponent(token)}`, {
        method: "POST",
      })
      const payload = (await response.json().catch(() => ({}))) as {
        result?: "joined" | "request_pending" | "already_member"
        error?: string
      }

      if (!response.ok) {
        setJoinState("error")
        toast({
          title: "Could not join organization",
          description: payload.error ?? "The join link could not be accepted.",
          variant: "destructive",
        })
        return
      }

      await refreshCurrentUser()

      if (payload.result === "request_pending") {
        setJoinState("pending")
        toast({
          title: "Request sent",
          description: "An organization admin needs to approve your access.",
        })
        return
      }

      if (payload.result === "already_member") {
        setJoinState("already_member")
        toast({
          title: "Already a member",
          description: "You already have access to this organization.",
        })
        return
      }

      setJoinState("joined")
      toast({
        title: "Organization joined",
        description: "You can now enter the organization.",
      })
    })
  }

  function switchAccount() {
    setJoinState("idle")

    startTransition(async () => {
      await signOut()
      router.replace(getJoinAuthPath(token))
      router.refresh()
    })
  }

  const currentEmail = authUser?.email ?? currentUser.email
  const isBusy = isLoadingLink || isAuthLoading
  const roleLabel = joinLink ? ROLE_LABELS[joinLink.role] : "Member"

  if (isBusy || (!isAuthenticated && !loadError)) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground shadow-sm">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Preparing join link...
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-8 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            {joinState === "joined" ||
            joinState === "already_member" ||
            joinState === "pending" ? (
              joinState === "pending" ? (
                <Clock3 className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )
            ) : loadError || joinState === "error" ? (
              <XCircle className="h-5 w-5" />
            ) : (
              <UsersRound className="h-5 w-5" />
            )}
          </div>
          <CardTitle>
            {loadError
              ? "Join link unavailable"
              : `Join ${joinLink?.organizationName}`}
          </CardTitle>
          <CardDescription>
            {loadError ? (
              loadError
            ) : (
              <>
                {joinLink?.purpose ? `${joinLink.purpose}. ` : null}
                This public join link will add you as{" "}
                <span className="font-medium text-foreground">{roleLabel}</span>
                {joinLink?.approvalRequired
                  ? " after an admin approves your request."
                  : "."}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <div>
              <Button asChild className="mt-7 w-full">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          ) : (
            <>
              {currentEmail ? (
                <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">
                    {currentEmail}
                  </span>
                </p>
              ) : null}

              {joinLink?.features.length ? (
                <FeatureGrid features={joinLink.features} />
              ) : null}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {joinState === "joined" ||
                joinState === "already_member" ||
                joinState === "pending" ? (
                  <Button asChild className="flex-1">
                    <Link href="/dashboard">Go to dashboard</Link>
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    disabled={isPending}
                    onClick={joinOrganization}
                  >
                    {isPending ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : joinLink?.approvalRequired ? (
                      "Request access"
                    ) : (
                      "Join organization"
                    )}
                  </Button>
                )}
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/dashboard">Cancel</Link>
                </Button>
              </div>

              {joinState !== "joined" && joinState !== "pending" ? (
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
            </>
          )}
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

function getJoinAuthPath(token: string) {
  const next = `/join/${encodeURIComponent(token)}`
  const params = new URLSearchParams({
    next,
    mode: "sign-up",
    reason: "join",
  })

  return `/auth?${params.toString()}`
}
