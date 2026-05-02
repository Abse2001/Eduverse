"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { ChatMessage } from "./message-bubble"

interface UseClassMessagesOptions {
  classId: string
  currentUserId: string
  currentUserRole: "student" | "teacher" | "admin"
}

type MessagesResponse = {
  messages?: ChatMessage[]
  error?: string
}

type MessageResponse = {
  message?: ChatMessage
  error?: string
}

export function useClassMessages({
  classId,
  currentUserId,
  currentUserRole,
}: UseClassMessagesOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isAnnouncementMode, setIsAnnouncementMode] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setErrorMessage(null)

    fetch(`/api/classes/${encodeURIComponent(classId)}/messages`)
      .then(async (response) => {
        const payload = (await response
          .json()
          .catch(() => null)) as MessagesResponse | null

        if (!response.ok || !payload?.messages) {
          throw new Error(payload?.error ?? "Could not load messages.")
        }

        if (!cancelled) setMessages(payload.messages)
      })
      .catch((error) => {
        if (cancelled) return
        setMessages([])
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load messages.",
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [classId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const mediaItems = useMemo(
    () =>
      messages
        .filter((message) => message.kind === "media" && message.materialId)
        .reverse(),
    [messages],
  )

  const announcements = useMemo(
    () =>
      messages
        .filter((message) => message.kind === "announcement")
        .slice()
        .reverse(),
    [messages],
  )
  const canSendAnnouncement =
    currentUserRole === "teacher" || currentUserRole === "admin"

  async function sendMessage() {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            kind:
              canSendAnnouncement && isAnnouncementMode
                ? "announcement"
                : "text",
          }),
        },
      )
      const payload = (await response
        .json()
        .catch(() => null)) as MessageResponse | null

      if (!response.ok || !payload?.message) {
        throw new Error(payload?.error ?? "Could not send message.")
      }

      setMessages((prev) => [...prev, payload.message as ChatMessage])
      setInput("")
      setIsAnnouncementMode(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not send message.",
      )
    } finally {
      setIsSending(false)
    }
  }

  async function deleteAnnouncement(messageId: string) {
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(
          classId,
        )}/messages/${encodeURIComponent(messageId)}`,
        { method: "DELETE" },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not delete announcement.")
      }

      setMessages((prev) => prev.filter((message) => message.id !== messageId))
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not delete announcement.",
      )
    }
  }

  async function sendMedia(file?: File) {
    if (!file || isSending) return

    setIsSending(true)
    setErrorMessage(null)

    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("content", input.trim())

      const response = await fetch(
        `/api/classes/${encodeURIComponent(classId)}/messages/media`,
        {
          method: "POST",
          body: formData,
        },
      )
      const payload = (await response
        .json()
        .catch(() => null)) as MessageResponse | null

      if (!response.ok || !payload?.message) {
        throw new Error(payload?.error ?? "Could not share media.")
      }

      setMessages((prev) => [...prev, payload.message as ChatMessage])
      setInput("")
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not share media.",
      )
    } finally {
      setIsSending(false)
    }
  }

  return {
    input,
    setInput,
    messages,
    enrichedMessages: messages,
    mediaItems,
    announcements,
    bottomRef,
    isLoading,
    isSending,
    errorMessage,
    isAnnouncementMode,
    setIsAnnouncementMode,
    sendMessage,
    sendFile: sendMedia,
    sendImage: sendMedia,
    deleteAnnouncement,
    canSendAnnouncement,
    currentUserId,
  }
}
