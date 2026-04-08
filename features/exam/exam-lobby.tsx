"use client"

import { AlertCircle, BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Class, Exam } from "@/lib/mock-data"

export function ExamLobby({
  exam,
  cls,
  onStart,
}: {
  exam: Exam
  cls: Pick<Class, "name" | "code">
  onStart: () => void
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
            exam.status === "live" &&
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
            exam.status === "upcoming" &&
              "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
          )}
        >
          {exam.status === "live"
            ? "In Progress"
            : exam.status === "upcoming"
              ? "Upcoming"
              : "Ended"}
        </Badge>
        <h1 className="text-2xl font-bold text-foreground text-balance">
          {exam.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {cls.name} &middot; {cls.code}
        </p>
      </div>
      <Card className="w-full">
        <CardContent className="p-4 grid grid-cols-3 divide-x divide-border text-center">
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {exam.questions.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Questions</p>
          </div>
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {exam.durationMinutes}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Minutes</p>
          </div>
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {exam.totalPoints}
            </p>
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
          "Code questions include starter code - edit as needed.",
          "All answers are auto-saved as you type.",
          "Submit before time runs out or it submits automatically.",
        ].map((note) => (
          <div key={note} className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>{note}</span>
          </div>
        ))}
      </div>
      <Button
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={exam.status === "upcoming"}
      >
        {exam.status === "upcoming" ? "Exam not started yet" : "Begin Exam"}
      </Button>
    </div>
  )
}
