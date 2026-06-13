"use client"

import { format } from "date-fns"
import { ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { resolveStudentExamPageState } from "@/lib/education/selectors"
import type { JsonValue, StudentExamPageDto } from "@/lib/exams/types"
import { toast } from "@/hooks/use-toast"
import { ExamHeader } from "./exam-header"
import { ExamLobby } from "./exam-lobby"
import { useExamLock } from "./exam-lock"
import { QuestionNavigator } from "./question-navigator"
import { QuestionView } from "./question-view"
import {
  EXAM_MODE_FULLSCREEN_REQUIRED_MESSAGE,
  exitExamModeFullscreen,
  requestExamModeFullscreen,
  useExamSession,
} from "./use-exam-session"

const EXAM_STATUS_BADGE_CLASS = {
  live: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  upcoming:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
} as const

type ClassInfo = {
  name: string
  code: string
}

export function ExamScreen({
  cls,
  page,
  selectedExamId,
  isLoading,
  isMutating,
  errorMessage,
  onStartExam,
  onSaveAnswer,
  onSubmitExam,
  onRecordEvent,
}: {
  cls: ClassInfo
  page: StudentExamPageDto | null
  selectedExamId?: string | null
  isLoading: boolean
  isMutating: boolean
  errorMessage: string | null
  onStartExam: (examId: string, input: { passcode: string }) => Promise<unknown>
  onSaveAnswer: (input: {
    examId: string
    attemptId: string
    questionId: string
    answer: JsonValue | null
  }) => Promise<void>
  onSubmitExam: (examId: string, attemptId: string) => Promise<void>
  onRecordEvent: (
    examId: string,
    attemptId: string,
    body: {
      eventType: string
      payload: Record<string, unknown>
    },
  ) => Promise<void>
}) {
  const [passcode, setPasscode] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)

  const state = page ? resolveStudentExamPageState(page) : "none"
  const activeExam = page?.activeExam ?? null
  const { setExamLock } = useExamLock()

  const {
    currentQuestionIndex,
    answers,
    timeLeft,
    isSaving,
    saveError,
    hasUnsavedChanges,
    isSubmitting,
    isExamModeBlocked,
    examModeError,
    setCurrentQuestionIndex,
    setAnswer,
    saveAnswer: saveCurrentAnswer,
    submitExam,
    resumeExamMode,
  } = useExamSession({
    activeExam: activeExam?.attempt ? activeExam : null,

    onSaveAnswer: async (questionId, answer) => {
      if (!activeExam?.attempt) return

      await onSaveAnswer({
        examId: activeExam.id,
        attemptId: activeExam.attempt.id,
        questionId,
        answer,
      })
    },

    onSubmit: async () => {
      if (!activeExam?.attempt) return

      setActionError(null)
      await onSubmitExam(activeExam.id, activeExam.attempt.id)
    },

    onRecordEvent: async (eventType, payload) => {
      if (!activeExam?.attempt) return

      await onRecordEvent(activeExam.id, activeExam.attempt.id, {
        eventType,
        payload: payload ?? {},
      })
    },
  })
  const examErrorMessage =
    actionError ?? examModeError ?? saveError ?? errorMessage

  useEffect(() => {
    if (state !== "active") {
      setPasscode("")
      setActionError(null)
    }
  }, [state])

  async function handleStartExam() {
    if (!activeExam) return

    setActionError(null)

    let enteredFullscreen = false

    if (activeExam.examModeEnabled) {
      const resumed = await requestExamModeFullscreen()

      if (!resumed) {
        setActionError(EXAM_MODE_FULLSCREEN_REQUIRED_MESSAGE)
        return
      }

      enteredFullscreen = true
    }

    try {
      await onStartExam(activeExam.id, { passcode })
    } catch (error) {
      if (enteredFullscreen) {
        await exitExamModeFullscreen()
      }

      setActionError(
        error instanceof Error ? error.message : "Could not start exam.",
      )
    }
  }

  useEffect(() => {
    if (!activeExam?.attempt) {
      setExamLock(null)
      return
    }

    setExamLock({
      classId: activeExam.classId,
      examId: activeExam.id,
      attemptId: activeExam.attempt.id,
      examTitle: activeExam.title,
      examRoute: `/classes/${activeExam.classId}/exam`,
    })
  }, [activeExam, setExamLock])

  useEffect(() => {
    if (!examErrorMessage) return

    toast({
      title: "Could not load exam",
      description: examErrorMessage,
      variant: "destructive",
    })
  }, [examErrorMessage])

  if (isLoading && !page) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Spinner />
        Loading exam...
      </div>
    )
  }

  if (errorMessage && !page) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-destructive">{errorMessage}</p>
      </div>
    )
  }

  if (
    !selectedExamId &&
    !activeExam?.attempt &&
    page &&
    page.visibleExams.length > 1
  ) {
    return (
      <div className="p-6 space-y-5 max-w-6xl mx-auto">
        <ClassPageHeader title={cls.name} code={cls.code} section="Exams" />

        <div className="space-y-3">
          {page.visibleExams.map((exam) => {
            const actionLabel =
              exam.status === "live"
                ? exam.endAt
                  ? `Closes ${format(new Date(exam.endAt), "MMM d, h:mm a")}`
                  : "Available"
                : exam.startAt
                  ? `Opens ${format(new Date(exam.startAt), "MMM d, h:mm a")}`
                  : "Scheduled"

            return (
              <Link
                key={exam.id}
                href={`?examId=${encodeURIComponent(exam.id)}`}
                className="block"
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground truncate">
                          {exam.title}
                        </p>
                        <Badge
                          variant="secondary"
                          className={
                            exam.status === "live"
                              ? EXAM_STATUS_BADGE_CLASS.live
                              : EXAM_STATUS_BADGE_CLASS.upcoming
                          }
                        >
                          {exam.status === "live" ? "Live" : "Upcoming"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {exam.durationMinutes} min &middot; {exam.totalPoints}{" "}
                        pts &middot; {actionLabel}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  if (state === "scheduled" && page?.scheduledExam) {
    return (
      <div className="space-y-3">
        {selectedExamId && page.visibleExams.length > 1 ? (
          <div className="px-6 pt-6 max-w-lg mx-auto">
            <Link
              href="?"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              All exams
            </Link>
          </div>
        ) : null}
        <ExamLobby
          title={page.scheduledExam.title}
          className={cls.name}
          classCode={cls.code}
          status={page.scheduledExam.status}
          questionCount={null}
          durationMinutes={page.scheduledExam.durationMinutes}
          totalPoints={page.scheduledExam.totalPoints}
          requiresPasscode
          startBlockedReason={null}
          passcode=""
          onPasscodeChange={() => {}}
          onStart={() => {}}
          disabled
          actionLabel={
            page.scheduledExam.startAt
              ? `Opens ${format(new Date(page.scheduledExam.startAt), "MMM d, h:mm a")}`
              : "Scheduled"
          }
        />
      </div>
    )
  }

  if (!activeExam) {
    return (
      <div className="p-6 text-sm text-muted-foreground">No exam available</div>
    )
  }

  if (!activeExam.attempt) {
    return (
      <div className="space-y-4">
        {selectedExamId && (page?.visibleExams.length ?? 0) > 1 ? (
          <div className="px-6 pt-6 max-w-lg mx-auto">
            <Link
              href="?"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              All exams
            </Link>
          </div>
        ) : null}
        <ExamLobby
          title={activeExam.title}
          className={cls.name}
          classCode={cls.code}
          status={activeExam.status}
          questionCount={activeExam.questionCount}
          durationMinutes={activeExam.durationMinutes}
          totalPoints={activeExam.totalPoints}
          requiresPasscode={activeExam.requiresPasscode}
          startBlockedReason={activeExam.startBlockedReason}
          passcode={passcode}
          onPasscodeChange={setPasscode}
          onStart={() => void handleStartExam()}
          disabled={
            isMutating ||
            !activeExam.canStartAttempt ||
            (activeExam.requiresPasscode && passcode.trim().length < 4)
          }
          actionLabel={
            isMutating
              ? "Starting..."
              : activeExam.canStartAttempt
                ? "Start Exam"
                : "Start unavailable"
          }
        />
      </div>
    )
  }

  const question = activeExam.questions[currentQuestionIndex] ?? null

  const answeredCount = activeExam.questions.filter((q) => {
    const ans = answers[q.id]
    return ans !== undefined && ans !== null && ans !== ""
  }).length

  const progress =
    activeExam.questions.length > 0
      ? Math.round((answeredCount / activeExam.questions.length) * 100)
      : 0

  if (!question) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">
          This exam does not have any published questions yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <ExamHeader
        title={activeExam.title}
        classCode={cls.code}
        questionCount={activeExam.questions.length}
        totalPoints={activeExam.totalPoints}
        answeredCount={answeredCount}
        progress={progress}
        timeLeft={timeLeft}
        isSaving={isSaving}
        saveError={saveError}
        hasUnsavedChanges={hasUnsavedChanges}
        isSubmitting={isSubmitting}
        onSubmit={() => void submitExam()}
      />

      <div className="flex flex-1 overflow-hidden">
        <QuestionNavigator
          questions={activeExam.questions}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
          onSelectQuestion={setCurrentQuestionIndex}
        />

        <div className="flex-1 overflow-y-auto p-6">
          <QuestionView
            question={question}
            index={currentQuestionIndex}
            totalQuestions={activeExam.questions.length}
            answer={answers[question.id]}
            onAnswer={(value) => setAnswer(question.id, value)}
          />

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={currentQuestionIndex === 0}
              onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            {currentQuestionIndex < activeExam.questions.length - 1 ? (
              <Button
                size="sm"
                onClick={() => {
                  void saveCurrentAnswer(question.id)
                  setCurrentQuestionIndex(currentQuestionIndex + 1)
                }}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void submitExam()}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {activeExam.examModeEnabled && isExamModeBlocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border bg-card p-4 text-center shadow-lg">
            <p className="text-sm font-semibold text-foreground">
              Exam mode paused
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Return to fullscreen to continue.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() => void resumeExamMode()}
            >
              Resume fullscreen
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
