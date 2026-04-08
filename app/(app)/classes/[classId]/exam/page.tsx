"use client"

import { use } from "react"
import { getClassById, EXAMS } from "@/lib/mock-data"
import { ExamScreen, NoExamState } from "@/features/exam/exam-screen"

export default function ExamPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const cls = getClassById(classId)
  const exam = EXAMS.find((e) => e.classId === classId)

  if (!cls || !exam) {
    return <NoExamState />
  }

  return <ExamScreen cls={cls} exam={exam} />
}
