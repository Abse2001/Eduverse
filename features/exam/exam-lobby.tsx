"use client"

import { AlertCircle, BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function ExamLobby({
  title,
  className,
  classCode,
  status,
  questionCount,
  durationMinutes,
  totalPoints,
  requiresPasscode,
  startBlockedReason,
  passcode,
  onPasscodeChange,
  onStart,
  disabled,
  actionLabel,
}: {
  title: string
  className: string
  classCode: string
  status: "upcoming" | "live" | "ended"
  questionCount: number | null
  durationMinutes: number
  totalPoints: number
  requiresPasscode: boolean
  startBlockedReason: string | null
  passcode: string
  onPasscodeChange: (value: string) => void
  onStart: () => void
  disabled: boolean
  actionLabel: string
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <BookOpen className="h-6 w-6 text-primary" />
      </div>
      <div className="text-center space-y-1">
        <Badge
          variant="secondary"
          className={cn(
            "mb-2",
            status === "live" &&
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
            status === "upcoming" &&
              "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
            status === "ended" &&
              "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
          )}
        >
          {status === "live"
            ? "In Progress"
            : status === "upcoming"
              ? "Scheduled"
              : "Ended"}
        </Badge>
        <h1 className="text-xl font-bold text-foreground text-balance">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {className} &middot; {classCode}
        </p>
      </div>
      <Card className="w-full">
        <CardContent className="grid grid-cols-3 divide-x divide-border p-3 text-center">
          <div className="px-4">
            <p className="text-xl font-bold text-foreground">
              {questionCount ?? "?"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Questions</p>
          </div>
          <div className="px-4">
            <p className="text-xl font-bold text-foreground">
              {durationMinutes}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Minutes</p>
          </div>
          <div className="px-4">
            <p className="text-xl font-bold text-foreground">{totalPoints}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total pts</p>
          </div>
        </CardContent>
      </Card>
      <div className="w-full space-y-2 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        <p className="text-sm font-medium text-foreground">Before you begin:</p>
        <div className="space-y-2">
          {[
            "Timer cannot be paused.",
            "Questions may be multiple choice or short answer.",
            "Answers are auto-saved.",
            "Submitting ends the attempt immediately.",
            requiresPasscode ? "Teacher passcode is required." : null,
            "Fullscreen is required; leaving fullscreen or switching tabs is recorded.",
          ]
            .filter((note): note is string => Boolean(note))
            .map((note) => (
              <div key={note} className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{note}</span>
              </div>
            ))}
        </div>
      </div>

      {requiresPasscode && status === "live" && (
        <div className="w-full space-y-2">
          <Label htmlFor="exam-passcode">Passcode</Label>
          <Input
            id="exam-passcode"
            type="password"
            value={passcode}
            onChange={(event) => onPasscodeChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !disabled) {
                event.preventDefault()
                onStart()
              }
            }}
            placeholder="Enter exam passcode"
            autoFocus
            minLength={4}
            autoComplete="one-time-code"
          />
        </div>
      )}

      <div className="min-h-10 w-full">
        {startBlockedReason ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            {startBlockedReason}
          </div>
        ) : null}
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={disabled}
      >
        {actionLabel}
      </Button>
    </div>
  )
}
