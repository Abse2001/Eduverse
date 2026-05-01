"use client"

import { use } from "react"
import { EXAMS } from "@/lib/mock-data"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { ExamScreen, NoExamState } from "@/features/exam/exam-screen"

export default function ExamPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "exam")
  const exam = EXAMS.find((e) => e.classId === classId)

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback classId={classId} featureLabel="Exam" />
    )
  }

  if (!exam) {
    return <NoExamState />
  }

  return <ExamScreen cls={cls} exam={exam} />
}
