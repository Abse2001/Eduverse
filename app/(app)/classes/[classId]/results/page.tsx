"use client"

import { use } from "react"
import { ClassResultsScreen } from "@/features/results/class-results-screen"

export default function ResultsPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)

  return <ClassResultsScreen classId={classId} />
}
