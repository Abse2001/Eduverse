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
    <div className="p-6 flex flex-col items-center justify-center gap-6 max-w-lg mx-auto pt-20">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <BookOpen className="w-8 h-8 text-primary" />
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
        <h1 className="text-2xl font-bold text-foreground text-balance">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {className} &middot; {classCode}
        </p>
      </div>
      <Card className="w-full">
        <CardContent className="p-4 grid grid-cols-3 divide-x divide-border text-center">
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {questionCount ?? "?"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Questions</p>
          </div>
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {durationMinutes}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Minutes</p>
          </div>
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">{totalPoints}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total pts</p>
          </div>
        </CardContent>
      </Card>
      <div className="w-full space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground text-center text-sm">
          Before you begin:
        </p>
        {[
          "Once started, the timer cannot be paused.",
          "Questions can include multiple choice and short answers.",
          "Answers are auto-saved through the backend.",
          "Submitting ends the attempt immediately.",
          "You must enter the teacher's passcode before the exam can start.",
          "Fullscreen exam mode is required. Leaving fullscreen or switching tabs is recorded for the teacher.",
        ].map((note) => (
          <div key={note} className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>{note}</span>
          </div>
        ))}
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

      {startBlockedReason ? (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {startBlockedReason}
        </div>
      ) : null}

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
