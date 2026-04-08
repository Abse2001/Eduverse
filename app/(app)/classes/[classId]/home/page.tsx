"use client"

import { use } from "react"
import { getClassById } from "@/lib/mock-data"
import { ClassHomeScreen } from "@/features/classes/class-home-screen"

export default function ClassHomePage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const cls = getClassById(classId)

  if (!cls) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Class not found.</p>
      </div>
    )
  }

  return <ClassHomeScreen cls={cls} />
}
