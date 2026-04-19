"use client"

import { use } from "react"
import {
  ClassRouteFallback,
  useClassRoute,
} from "@/features/classes/use-class-route"
import { SessionScreen } from "@/features/session/session-screen"

export default function SessionPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage } = useClassRoute(classId)

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  return <SessionScreen cls={cls} />
}
