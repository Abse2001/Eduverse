"use client"

import { Clock, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ExamHeaderProps {
  title: string
  classCode: string
  questionCount: number
  totalPoints: number
  answeredCount: number
  progress: number
  timeLeft: number
  isSaving: boolean
  saveError: string | null
  isSubmitting: boolean
  onSubmit: () => void
}

export function ExamHeader({
  title,
  classCode,
  questionCount,
  totalPoints,
  answeredCount,
  progress,
  timeLeft,
  isSaving,
  saveError,
  isSubmitting,
  onSubmit,
}: ExamHeaderProps) {
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0")
  const secs = String(timeLeft % 60).padStart(2, "0")
  const timeWarning = timeLeft < 300

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm truncate">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">
          {classCode} &middot; {questionCount} questions &middot; {totalPoints}{" "}
          pts
        </p>
      </div>
      <Progress value={progress} className="w-32 h-1.5 hidden md:block" />
      <span className="text-xs text-muted-foreground hidden md:block">
        {answeredCount}/{questionCount} answered
      </span>
      <span
        className={cn(
          "hidden text-xs md:block",
          saveError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {saveError ? "Save failed" : isSaving ? "Autosaving..." : "Saved"}
      </span>
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm font-semibold",
          timeWarning
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-foreground",
        )}
      >
        <Clock className={cn("w-3.5 h-3.5", timeWarning && "animate-pulse")} />
        {mins}:{secs}
      </div>
      <Button
        size="sm"
        className="gap-1.5 text-xs"
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Send className="w-3.5 h-3.5" />
        )}
        {isSubmitting ? "Submitting..." : "Submit Exam"}
      </Button>
    </div>
  )
}
