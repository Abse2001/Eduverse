"use client"

import { use } from "react"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { ExamScreen } from "@/features/exam/exam-screen"
import { ManagerExamScreen } from "@/features/exam/manager-exam-screen"
import { useClassExam } from "@/features/exam/use-class-exam"
import { useApp } from "@/lib/store"

export default function ExamPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { currentUser, isAuthLoading, isAuthenticated } = useApp()

  const { cls, classRow, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "exam")

  const examApi = useClassExam(classId, {
    enabled: !isAuthLoading && isAuthenticated,
  })
  const {
    data: exam,
    isLoading: examLoading,
    isMutating: isSubmitting,
    errorMessage: examErrorMessage,
    startExam,
    saveAnswer,
    submitExam,
    recordEvent,
  } = examApi
  const canManage =
    currentUser.role === "admin" ||
    (currentUser.role === "teacher" &&
      (classRow?.teacher_user_id === currentUser.id ||
        classRow?.memberships.some(
          (membership) =>
            membership.user_id === currentUser.id &&
            (membership.role === "teacher" || membership.role === "ta"),
        ) === true))

  // fallback: class loading / error
  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  // feature disabled
  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback classId={classId} featureLabel="Exam" />
    )
  }

  if (canManage) {
    return <ManagerExamScreen cls={cls} examApi={examApi} />
  }

  return (
    <ExamScreen
      cls={cls}
      page={exam?.student ?? null}
      isLoading={examLoading}
      isMutating={isSubmitting}
      errorMessage={examErrorMessage ?? errorMessage}
      onStartExam={startExam}
      onSaveAnswer={saveAnswer}
      onSubmitExam={submitExam}
      onRecordEvent={recordEvent}
    />
  )
}
