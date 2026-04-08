"use client"

import { use } from "react"
import { getClassById } from "@/lib/mock-data"
import { SessionScreen } from "@/features/session/session-screen"

export default function SessionPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const cls = getClassById(classId)

  if (!cls)
    return <div className="p-6 text-muted-foreground">Class not found.</div>

  return <SessionScreen cls={cls} />
}
