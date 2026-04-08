"use client"

import { CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Exam } from "@/lib/mock-data"

export function ExamResults({
  exam,
  answers,
}: {
  exam: Exam
  answers: Record<string, string | number>
}) {
  const mcqScore = exam.questions
    .filter((question) => question.type === "mcq")
    .reduce(
      (sum, question) =>
        answers[question.id] === question.correctIndex
          ? sum + question.points
          : sum,
      0,
    )
  const pendingReview = exam.questions
    .filter((question) => question.type !== "mcq")
    .reduce((sum, question) => sum + question.points, 0)
  const percentage = Math.round((mcqScore / exam.totalPoints) * 100)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Exam Submitted!</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Your exam has been submitted successfully. Auto-graded results are
          shown below.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 grid grid-cols-3 divide-x divide-border text-center">
          <div className="px-4">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {mcqScore}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">MCQ Score</p>
          </div>
          <div className="px-4">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {pendingReview}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pending Review
            </p>
          </div>
          <div className="px-4">
            <p className="text-3xl font-bold text-primary">{percentage}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">MCQ %</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Answer Summary</h2>
        {exam.questions.map((question, index) => {
          const answer = answers[question.id]
          const isCorrect =
            question.type === "mcq" ? answer === question.correctIndex : null

          return (
            <Card
              key={question.id}
              className={cn(
                "border",
                isCorrect === true &&
                  "border-emerald-200 dark:border-emerald-800",
                isCorrect === false && "border-destructive/30",
              )}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                    isCorrect === true
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : isCorrect === false
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                  )}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium leading-snug">
                    {question.question}
                  </p>
                  {question.type === "mcq" ? (
                    <div className="mt-1.5 space-y-0.5">
                      {answer !== undefined ? (
                        <p className="text-xs text-muted-foreground">
                          Your answer:{" "}
                          <span
                            className={cn(
                              "font-medium",
                              isCorrect
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-destructive",
                            )}
                          >
                            {question.options?.[answer as number]}
                          </span>
                        </p>
                      ) : null}
                      {isCorrect === false ? (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Correct:{" "}
                          {question.options?.[question.correctIndex ?? 0]}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 mt-1"
                    >
                      Pending teacher review
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0">
                  {question.points} pts
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
