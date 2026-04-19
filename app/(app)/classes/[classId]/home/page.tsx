"use client"

import { use } from "react"
import { ClassHomeScreen } from "@/features/classes/class-home-screen"

export default function ClassHomePage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)

  return <ClassHomeScreen classId={classId} />
}
