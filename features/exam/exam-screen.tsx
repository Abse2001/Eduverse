"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { JsonValue, StudentExamPageDto } from "@/lib/exams/types"
import { resolveStudentExamPageState } from "@/lib/education/selectors"
import { ExamHeader } from "./exam-header"
import { useExamLock } from "./exam-lock"
import { ExamLobby } from "./exam-lobby"
import { QuestionNavigator } from "./question-navigator"
import { QuestionView } from "./question-view"
import { useExamSession } from "./use-exam-session"

type ClassInfo = {
  name: string
  code: string
}

export function ExamScreen({
  cls,
  page,
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

  const pendingSaveRef = useRef<Promise<void> | null>(null)

  const state = page ? resolveStudentExamPageState(page) : "none"
  const activeExam = page?.activeExam ?? null
  const { setExamLock } = useExamLock()

  const {
    currentQuestionIndex,
    answers,
    timeLeft,
    isSaving,
    saveError,
    isSubmitting,
    isExamModeBlocked,
    examModeError,
    setCurrentQuestionIndex,
    setAnswer,
    submitExam,
    resumeExamMode,
  } = useExamSession({
    activeExam: activeExam?.attempt ? activeExam : null,

    onSaveAnswer: async (questionId, answer) => {
      if (!activeExam?.attempt) return

      const p = onSaveAnswer({
        examId: activeExam.id,
        attemptId: activeExam.attempt.id,
        questionId,
        answer,
      })

      pendingSaveRef.current = p
      await p
    },

    onSubmit: async () => {
      if (!activeExam?.attempt) return

      setActionError(null)

      if (pendingSaveRef.current) {
        await pendingSaveRef.current
      }

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

  useEffect(() => {
    if (state !== "active") {
      setPasscode("")
      setActionError(null)
    }
  }, [state])

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
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (state === "scheduled" && page?.scheduledExam) {
    return (
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
        {(errorMessage || actionError) && (
          <div className="p-6 pb-0 max-w-lg mx-auto">
            <Alert variant="destructive">
              <AlertDescription>{actionError ?? errorMessage}</AlertDescription>
            </Alert>
          </div>
        )}

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
          onStart={() => void onStartExam(activeExam.id, { passcode })}
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
        <Alert variant="destructive">
          <AlertDescription>
            This exam does not have any published questions yet.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {(errorMessage || actionError || saveError || examModeError) && (
        <div className="px-6 pt-6">
          <Alert variant="destructive">
            <AlertDescription>
              {actionError ?? examModeError ?? saveError ?? errorMessage}
            </AlertDescription>
          </Alert>
        </div>
      )}

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
                onClick={() =>
                  setCurrentQuestionIndex(currentQuestionIndex + 1)
                }
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
        <div className="fixed inset-0 flex items-center justify-center">
          <Button onClick={() => void resumeExamMode()}>
            Resume fullscreen
          </Button>
        </div>
      )}
    </div>
  )
}
