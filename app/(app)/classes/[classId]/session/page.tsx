"use client"

import { use } from "react"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { SessionScreen } from "@/features/session/session-screen"

export default function SessionPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "sessions")

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback
        classId={classId}
        featureLabel="Sessions"
      />
    )
  }

  return <SessionScreen cls={cls} />
}
