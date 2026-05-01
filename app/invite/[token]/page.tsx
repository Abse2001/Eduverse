"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useApp } from "@/lib/store"

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const { isAuthLoading, isAuthenticated, refreshCurrentUser } = useApp()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const token = params.token

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace(`/auth?next=/invite/${encodeURIComponent(token)}`)
    }
  }, [isAuthLoading, isAuthenticated, router, token])

  function acceptInvite() {
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc("accept_organization_invite", {
        invite_token: token,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      await refreshCurrentUser()
      setSuccessMessage("Invite accepted. You can now enter the organization.")
    })
  }

  if (isAuthLoading || !isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm shadow-2xl backdrop-blur">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Preparing invite...
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_36%),linear-gradient(135deg,#020617_0%,#0f172a_100%)] px-6 text-white">
      <section className="w-full max-w-lg rounded-[2rem] border border-white/15 bg-white/[0.08] p-2 shadow-2xl backdrop-blur-xl">
        <div className="rounded-[1.5rem] bg-white p-8 text-slate-950">
          <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-sky-600">
            {successMessage ? (
              <CheckCircle2 className="h-7 w-7" />
            ) : errorMessage ? (
              <XCircle className="h-7 w-7" />
            ) : (
              <CheckCircle2 className="h-7 w-7" />
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Accept organization invite
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            This invite can only be accepted by the email address it was sent
            to. Make sure you are signed in with that account.
          </p>

          {errorMessage ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {successMessage ? (
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
        </div>
      </section>
    </main>
  )
}
