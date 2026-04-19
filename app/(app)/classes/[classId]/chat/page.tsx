"use client"

import { use } from "react"
import {
  ClassRouteFallback,
  useClassRoute,
} from "@/features/classes/use-class-route"
import { ChatScreen } from "@/features/chat/chat-screen"

export default function ChatPage({
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

  return <ChatScreen cls={cls} />
}
