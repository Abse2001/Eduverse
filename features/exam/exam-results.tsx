"use client"

import { format } from "date-fns"
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type {
  ReleasedExamQuestionResultDto,
  ReleasedExamResultDto,
} from "@/lib/exams/types"
import { cn } from "@/lib/utils"

export function ExamResults({ result }: { result: ReleasedExamResultDto }) {
  const percentage =
    result.isReleased && result.totalPoints > 0 && result.totalScore !== null
      ? Math.round((result.totalScore / result.totalPoints) * 100)
      : null

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center",
            result.isReleased
              ? "bg-emerald-100 dark:bg-emerald-900/30"
              : "bg-amber-100 dark:bg-amber-900/30",
          )}
        >
          {result.isReleased ? (
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          ) : (
            <Clock3 className="w-10 h-10 text-amber-500" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground">{result.title}</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          {result.isReleased
            ? "Your released exam result is shown below."
            : result.needsManualReview
              ? "Your attempt was submitted successfully. Teacher review and result release are still pending."
              : "Your attempt was submitted successfully. Scores stay hidden until results are released."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="secondary">
            {formatAttemptStatus(result.status)}
          </Badge>
          <Badge
            variant="secondary"
            className={integrityBadgeClass(result.integrityStatus)}
          >
            {formatIntegrityStatus(result.integrityStatus)}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 grid grid-cols-3 divide-x divide-border text-center">
          <div className="px-4">
            <p
              className={cn(
                "text-3xl font-bold",
                result.isReleased
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {result.totalScore ?? "Pending"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.isReleased ? "Score" : "Score status"}
            </p>
          </div>
          <div className="px-4">
            <p className="text-3xl font-bold text-primary">
              {result.totalPoints}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Total pts</p>
          </div>
          <div className="px-4">
            <p className="text-3xl font-bold text-primary">
              {percentage === null ? "-" : `${percentage}%`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Percent</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Submitted
            </p>
            <p className="mt-1 font-medium text-foreground">
              {result.submittedAt
                ? format(new Date(result.submittedAt), "MMM d, h:mm a")
                : "Not submitted"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Reviewed
            </p>
            <p className="mt-1 font-medium text-foreground">
              {result.gradedAt
                ? format(new Date(result.gradedAt), "MMM d, h:mm a")
                : "Pending"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Released
            </p>
            <p className="mt-1 font-medium text-foreground">
              {result.releasedAt
                ? format(new Date(result.releasedAt), "MMM d, h:mm a")
                : "Not released"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Answer Summary</h2>
        {result.questions.map((question, index) => {
          return (
            <Card
              key={question.id}
              className={cn(
                "border",
                question.status === "correct" &&
                  "border-emerald-200 dark:border-emerald-800",
                question.status === "incorrect" && "border-destructive/30",
              )}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                    question.status === "correct"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : question.status === "incorrect"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                  )}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium leading-snug">
                    {question.prompt}
                  </p>
                  <div className="mt-2 space-y-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {formatQuestionStatus(question.status, result.isReleased)}
                    </Badge>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      {formatAnswerPreview(question)}
                    </p>
                    {result.isReleased && hasCorrectAnswerReview(question) ? (
                      <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                        Correct answer: {formatCorrectAnswerPreview(question)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {question.points} pts
                  </p>
                  <p className="mt-1 text-[11px] text-foreground">
                    {question.score === null
                      ? "Pending"
                      : `${question.score} / ${question.points}`}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {!result.isReleased && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Released scores and per-question grading details stay hidden until
            the backend marks this attempt as released.
          </p>
        </div>
      )}
    </div>
  )
}

function formatAttemptStatus(status: ReleasedExamResultDto["status"]) {
  if (status === "graded") return "Graded"
  if (status === "voided") return "Voided"
  if (status === "submitted") return "Submitted"
  return "In progress"
}

function formatIntegrityStatus(
  status: ReleasedExamResultDto["integrityStatus"],
) {
  if (status === "flagged") return "Flagged"
  if (status === "voided") return "Voided"
  if (status === "reported") return "Reported"
  return "Clear"
}

function integrityBadgeClass(status: ReleasedExamResultDto["integrityStatus"]) {
  if (status === "voided") {
    return "bg-destructive/10 text-destructive dark:bg-destructive/15"
  }

  if (status === "flagged" || status === "reported") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
  }

  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
}

function formatQuestionStatus(
  status: ReleasedExamQuestionResultDto["status"],
  isReleased: boolean,
) {
  if (!isReleased) {
    return status === "unanswered" ? "No answer submitted" : "Awaiting release"
  }

  if (status === "correct") return "Correct"
  if (status === "incorrect") return "Incorrect"
  if (status === "reviewed") return "Reviewed"
  return "Unanswered"
}

function formatAnswerPreview(question: ReleasedExamQuestionResultDto) {
  if (question.selectedOptionIndex !== null) {
    return `Selected option ${String.fromCharCode(65 + question.selectedOptionIndex)}`
  }

  if (question.selectedTextAnswer) {
    return question.selectedTextAnswer
  }

  return "No answer submitted."
}

function hasCorrectAnswerReview(question: ReleasedExamQuestionResultDto) {
  return (
    question.correctOptionIndex !== null ||
    (question.correctTextAnswer !== null &&
      question.correctTextAnswer.trim().length > 0)
  )
}

function formatCorrectAnswerPreview(question: ReleasedExamQuestionResultDto) {
  if (question.correctOptionIndex !== null) {
    return `Option ${String.fromCharCode(65 + question.correctOptionIndex)}`
  }

  if (question.correctTextAnswer) {
    return question.correctTextAnswer
  }

  return "Not available."
}
