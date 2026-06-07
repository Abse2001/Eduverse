"use client"

import { use } from "react"
import { ClassAiScreen } from "@/features/ai/class-ai-screen"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"

export default function ClassAiPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "ai")

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return <ClassFeatureDisabledFallback classId={classId} featureLabel="AI" />
  }

  return <ClassAiScreen cls={cls} />
}
