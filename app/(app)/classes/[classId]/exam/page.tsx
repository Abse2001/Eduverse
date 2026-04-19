"use client"

import { use } from "react"
import { EXAMS } from "@/lib/mock-data"
import {
  ClassRouteFallback,
  useClassRoute,
} from "@/features/classes/use-class-route"
import { ExamScreen, NoExamState } from "@/features/exam/exam-screen"

export default function ExamPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage } = useClassRoute(classId)
  const exam = EXAMS.find((e) => e.classId === classId)

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (!exam) {
    return <NoExamState />
  }

  return <ExamScreen cls={cls} exam={exam} />
}
