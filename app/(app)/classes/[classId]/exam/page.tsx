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

export default function ExamPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)

  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "exam")

  const examApi = useClassExam(classId)
  const {
    data: exam,
    isLoading: examLoading,
    isMutating: isSubmitting,
    startExam,
    saveAnswer,
    submitExam,
    recordEvent,
  } = examApi

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

  // exam loading
  if (examLoading) {
    return <div>Loading exam...</div>
  }

  // no exam available
  if (!exam) {
    return <div>No exam available</div>
  }

  // main screen
  if (exam.canManage) {
    return <ManagerExamScreen cls={cls} examApi={examApi} />
  }

  return (
    <ExamScreen
      cls={cls}
      page={exam.student}
      isLoading={examLoading}
      isMutating={isSubmitting}
      errorMessage={errorMessage}
      onStartExam={startExam}
      onSaveAnswer={saveAnswer}
      onSubmitExam={submitExam}
      onRecordEvent={recordEvent}
    />
  )
}
