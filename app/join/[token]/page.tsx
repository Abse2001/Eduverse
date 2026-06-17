"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  LogOut,
  UsersRound,
  XCircle,
} from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { useApp } from "@/lib/store"

type JoinLinkDetails = {
  organizationId: string
  organizationName: string
  organizationSlug: string | null
  purpose: string
  role: "teacher" | "student"
  approvalRequired: boolean
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
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm shadow-2xl backdrop-blur">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Preparing join link...
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_36%),linear-gradient(135deg,#020617_0%,#0f172a_100%)] px-6 text-white">
      <section className="w-full max-w-lg rounded-[2rem] border border-white/15 bg-white/[0.08] p-2 shadow-2xl backdrop-blur-xl">
        <div className="rounded-[1.5rem] bg-white p-8 text-slate-950">
          <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-sky-600">
            {joinState === "joined" ||
            joinState === "already_member" ||
            joinState === "pending" ? (
              joinState === "pending" ? (
                <Clock3 className="h-7 w-7" />
              ) : (
                <CheckCircle2 className="h-7 w-7" />
              )
            ) : loadError || joinState === "error" ? (
              <XCircle className="h-7 w-7" />
            ) : (
              <UsersRound className="h-7 w-7" />
            )}
          </div>

          {loadError ? (
            <>
              <h1 className="text-2xl font-black tracking-tight">
                Join link unavailable
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {loadError}
              </p>
              <Button asChild className="mt-7 w-full">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black tracking-tight">
                Join {joinLink?.organizationName}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {joinLink?.purpose ? `${joinLink.purpose}. ` : null}
                This public join link will add you as{" "}
                <span className="font-semibold text-slate-950">
                  {roleLabel}
                </span>
                {joinLink?.approvalRequired
                  ? " after an admin approves your request."
                  : "."}
              </p>

              {currentEmail ? (
                <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  Signed in as{" "}
                  <span className="font-semibold text-slate-950">
                    {currentEmail}
                  </span>
                </p>
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
        </div>
      </section>
    </main>
  )
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
