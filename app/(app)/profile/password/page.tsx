"use client"

import { FormEvent, useEffect, useState, useTransition } from "react"
import type { User as SupabaseAuthUser } from "@supabase/supabase-js"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

export default function PasswordChangePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [email, setEmail] = useState<string | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isPending, startTransition] = useTransition()

  function getPasswordResetRedirectTo() {
    if (typeof window === "undefined") return undefined

    return `${window.location.origin}/auth?mode=reset-password`
  }

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: SupabaseAuthUser | null } }) => {
        if (cancelled) return

        if (!data.user?.email) {
          router.replace("/auth?next=/profile/password")
          return
        }

        setEmail(data.user.email)
        setIsCheckingSession(false)
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/auth?next=/profile/password")
        }
      })

    return () => {
      cancelled = true
    }
  }, [router])

  function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email) {
      toast({
        title: "Session expired",
        description: "Sign in again before changing your password.",
        variant: "destructive",
      })
      router.replace("/auth?next=/profile/password")
      return
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Password change failed",
        description: "Enter your current password and the new password twice.",
        variant: "destructive",
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password change failed",
        description: "New password must be at least 6 characters.",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Password change failed",
        description: "New password and confirmation do not match.",
        variant: "destructive",
      })
      return
    }

    if (currentPassword === newPassword) {
      toast({
        title: "Password change failed",
        description:
          "Choose a new password that is different from the current one.",
        variant: "destructive",
      })
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (signInError) {
        toast({
          title: "Password change failed",
          description: "Current password is incorrect.",
          variant: "destructive",
        })
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        toast({
          title: "Password change failed",
          description: updateError.message,
          variant: "destructive",
        })
        return
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast({
        title: "Password changed",
        description: "Use your new password the next time you sign in.",
      })
      router.refresh()
    })
  }

  function sendPasswordResetEmail() {
    if (!email) {
      toast({
        title: "Password reset failed",
        description: "Sign in again before requesting a reset link.",
        variant: "destructive",
      })
      router.replace("/auth?next=/profile/password")
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectTo(),
      })

      if (error) {
        toast({
          title: "Password reset failed",
          description: error.message,
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Check your inbox",
        description: `Password reset link sent to ${email}.`,
      })
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Button asChild variant="ghost" className="px-0">
        <Link href="/profile">
          <ArrowLeft className="h-4 w-4" />
          Back to profile
        </Link>
      </Button>

      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold text-foreground">
                Change password
              </h1>
              <p className="text-sm text-muted-foreground">
                Confirm your current password, then choose a new one for your
                Eduverse account.
              </p>
            </div>
          </div>

          {isCheckingSession ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Checking your session...
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submitPasswordChange}>
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  autoComplete="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={isPending}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    autoComplete="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    disabled={isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input
                    id="confirm-password"
                    autoComplete="new-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground sm:flex-row sm:items-start">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary sm:mt-0.5" />
                <div className="space-y-2">
                  <p>
                    Use at least 6 characters. For best protection, choose
                    something unique to Eduverse.
                  </p>
                  <button
                    className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    onClick={sendPasswordResetEmail}
                    type="button"
                  >
                    Forgot your current password? Send a reset link.
                  </button>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button asChild type="button" variant="outline">
                  <Link href="/profile">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save password
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
