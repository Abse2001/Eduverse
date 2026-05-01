"use client"

import { use } from "react"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import { ChatScreen } from "@/features/chat/chat-screen"

export default function ChatPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "chat")

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return (
      <ClassFeatureDisabledFallback classId={classId} featureLabel="Chat" />
    )
  }

  return <ChatScreen cls={cls} />
}
