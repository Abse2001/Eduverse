"use client"

import { Clock, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { Class, Exam } from "@/lib/mock-data"

interface ExamHeaderProps {
  exam: Exam
  cls: Class
  answeredCount: number
  progress: number
  timeLeft: number
  onSubmit: () => void
}

export function ExamHeader({
  exam,
  cls,
  answeredCount,
  progress,
  timeLeft,
  onSubmit,
}: ExamHeaderProps) {
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0")
  const secs = String(timeLeft % 60).padStart(2, "0")
  const timeWarning = timeLeft < 300

  return (
    <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-sm truncate">
          {exam.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {cls.code} &middot; {exam.questions.length} questions &middot;{" "}
          {exam.totalPoints} pts
        </p>
      </div>
      <Progress value={progress} className="w-32 h-1.5 hidden md:block" />
      <span className="text-xs text-muted-foreground hidden md:block">
        {answeredCount}/{exam.questions.length} answered
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
      <Button size="sm" className="gap-1.5 text-xs" onClick={onSubmit}>
        <Send className="w-3.5 h-3.5" />
        Submit Exam
      </Button>
    </div>
  )
}
