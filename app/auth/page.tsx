"use client"

import { FormEvent, useEffect, useState, useTransition } from "react"
import type { User as SupabaseAuthUser } from "@supabase/supabase-js"
import { GraduationCap, LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

type AuthMode = "sign-in" | "sign-up"

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>("sign-in")
  const [signInEmail, setSignInEmail] = useState("")
  const [signInPassword, setSignInPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [signUpEmail, setSignUpEmail] = useState("")
  const [signUpPassword, setSignUpPassword] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isPending, startTransition] = useTransition()

  function getNextPath() {
    if (typeof window === "undefined") return "/dashboard"

    const next = new URLSearchParams(window.location.search).get("next")
    if (!next?.startsWith("/")) return "/dashboard"
    if (next.startsWith("//")) return "/dashboard"

    return next
  }

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: SupabaseAuthUser | null } }) => {
        if (cancelled) return

        if (data.user) {
          router.replace(getNextPath())
          return
        }

        setIsCheckingSession(false)
      })
      .catch(() => {
        if (!cancelled) setIsCheckingSession(false)
      })

    return () => {
      cancelled = true
    }
  }, [router])

  function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setFeedback(null)

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      router.replace(getNextPath())
      router.refresh()
    })
  }

  function submitSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setFeedback(null)

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: signUpEmail,
        password: signUpPassword,
        options: {
          data: {
            display_name: displayName,
          },
        },
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setFeedback(
        data.session
          ? "Account created. Opening your dashboard..."
          : "Account created. Check your email if confirmation is enabled.",
      )

      if (data.session) {
        router.replace(getNextPath())
        router.refresh()
      }
    })
  }

  if (isCheckingSession) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm shadow-2xl backdrop-blur">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking your session...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,0.45),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(34,197,94,0.28),transparent_24%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#082f49_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-slate-950 to-transparent" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-8">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-sky-100 shadow-2xl backdrop-blur">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-400 text-slate-950">
              <GraduationCap className="h-5 w-5" />
            </span>
            Eduverse
          </div>

          <div className="max-w-2xl space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-sky-200">
              Learning workspace
            </p>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
              Start from your dashboard.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-slate-300">
              Sign in first, then manage your workspace from one dashboard. Your
              role changes per organization, so owners, admins, teachers, and
              students each get the right tools.
            </p>
          </div>

          <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              ["Auth", "Supabase email and password."],
              ["Org hub", "Create or enter an organization."],
              ["Workspace", "Dashboard opens after org selection."],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-3xl border border-white/10 bg-white/[0.08] p-4 shadow-2xl backdrop-blur"
              >
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/15 bg-white/[0.09] p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="rounded-[1.5rem] bg-white p-6 text-slate-950 shadow-2xl sm:p-8">
            <div className="mb-7 flex rounded-full bg-slate-100 p-1 text-sm font-semibold">
              <button
                className={`flex-1 rounded-full px-4 py-2.5 transition ${
                  mode === "sign-in"
                    ? "bg-slate-950 text-white shadow"
                    : "text-slate-500 hover:text-slate-950"
                }`}
                onClick={() => setMode("sign-in")}
                type="button"
              >
                Sign in
              </button>
              <button
                className={`flex-1 rounded-full px-4 py-2.5 transition ${
                  mode === "sign-up"
                    ? "bg-slate-950 text-white shadow"
                    : "text-slate-500 hover:text-slate-950"
                }`}
                onClick={() => setMode("sign-up")}
                type="button"
              >
                Sign up
              </button>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight">
                {mode === "sign-in" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {mode === "sign-in"
                  ? "Enter your credentials to open the dashboard."
                  : "Create an auth user. Your profile row is created by the database trigger."}
              </p>
            </div>

            {errorMessage ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {feedback ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {feedback}
              </div>
            ) : null}

            {mode === "sign-in" ? (
              <form className="space-y-4" onSubmit={submitSignIn}>
                <AuthField
                  autoComplete="email"
                  label="Email"
                  onChange={setSignInEmail}
                  type="email"
                  value={signInEmail}
                />
                <AuthField
                  autoComplete="current-password"
                  label="Password"
                  onChange={setSignInPassword}
                  type="password"
                  value={signInPassword}
                />
                <SubmitButton
                  isPending={isPending}
                  pendingText="Signing in..."
                  text="Sign in"
                />
              </form>
            ) : (
              <form className="space-y-4" onSubmit={submitSignUp}>
                <AuthField
                  autoComplete="name"
                  label="Display name"
                  onChange={setDisplayName}
                  type="text"
                  value={displayName}
                />
                <AuthField
                  autoComplete="email"
                  label="Email"
                  onChange={setSignUpEmail}
                  type="email"
                  value={signUpEmail}
                />
                <AuthField
                  autoComplete="new-password"
                  label="Password"
                  minLength={6}
                  onChange={setSignUpPassword}
                  type="password"
                  value={signUpPassword}
                />
                <SubmitButton
                  isPending={isPending}
                  pendingText="Creating account..."
                  text="Create account"
                />
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function AuthField({
  autoComplete,
  label,
  minLength,
  onChange,
  type,
  value,
}: {
  autoComplete: string
  label: string
  minLength?: number
  onChange: (value: string) => void
  type: string
  value: string
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        autoComplete={autoComplete}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </label>
  )
}

function SubmitButton({
  isPending,
  pendingText,
  text,
}: {
  isPending: boolean
  pendingText: string
  text: string
}) {
  return (
    <button
      className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 text-base font-black text-white shadow-lg shadow-sky-500/25 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isPending}
      type="submit"
    >
      {isPending ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {pendingText}
        </>
      ) : (
        text
      )}
    </button>
  )
}
