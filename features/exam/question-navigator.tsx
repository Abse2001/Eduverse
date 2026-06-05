"use client"

import type { JsonValue, StudentQuestionDto } from "@/lib/exams/types"
import { cn } from "@/lib/utils"

interface QuestionNavigatorProps {
  questions: StudentQuestionDto[]
  currentQuestionIndex: number
  answers: Record<string, JsonValue | null>
  onSelectQuestion: (index: number) => void
}

export function QuestionNavigator({
  questions,
  currentQuestionIndex,
  answers,
  onSelectQuestion,
}: QuestionNavigatorProps) {
  return (
    <div className="w-48 border-r border-border bg-card p-3 flex flex-col gap-3 shrink-0 hidden md:flex">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Questions
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {questions.map((question, index) => (
          <button
            key={question.id}
            onClick={() => onSelectQuestion(index)}
            className={cn(
              "w-8 h-8 rounded-lg text-xs font-semibold transition-colors",
              index === currentQuestionIndex
                ? "bg-primary text-primary-foreground"
                : hasAnswerValue(answers[question.id])
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <div className="mt-auto space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded bg-primary inline-block" />
          Current
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30 inline-block" />
          Answered
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded bg-muted inline-block" />
          Unanswered
        </div>
      </div>
    </div>
  )
}

function hasAnswerValue(value: JsonValue | null | undefined) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}
