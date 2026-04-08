"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  appendStoredClassMessage,
  loadStoredClassMessages,
} from "@/lib/class-chat-storage"
import { mergeMessagesById } from "@/lib/education/selectors"
import { getMessagesByClass, getUserById, type Message } from "@/lib/mock-data"
import { formatFileSize, readFileAsDataUrl } from "./file-utils"
import type { EnrichedMessage } from "./message-bubble"

interface UseClassMessagesOptions {
  classId: string
  currentUserId: string
  currentUserRole: "student" | "teacher" | "admin"
}

export function useClassMessages({
  classId,
  currentUserId,
  currentUserRole,
}: UseClassMessagesOptions) {
  const rawMessages = useMemo(() => getMessagesByClass(classId), [classId])
  const [messages, setMessages] = useState(rawMessages)
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const storedMessages = loadStoredClassMessages(classId)
    if (storedMessages.length === 0) return

    setMessages(mergeMessagesById(rawMessages, storedMessages))
  }, [classId, rawMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const enrichedMessages: EnrichedMessage[] = messages.map((message) => {
    const sender = getUserById(message.senderId)

    return {
      ...message,
      senderName: sender?.name ?? "Unknown",
      senderAvatar: sender?.avatar ?? "??",
    }
  })

  const mediaItems = useMemo(
    () =>
      enrichedMessages
        .filter(
          (message) =>
            (message.type === "image" || message.type === "file") &&
            message.mediaUrl,
        )
        .reverse(),
    [enrichedMessages],
  )

  const pinnedMessages = enrichedMessages.filter((message) => message.pinned)

  function addMessage(message: Message) {
    setMessages((prev) => [...prev, message])
    appendStoredClassMessage(classId, message)
  }

  function sendMessage() {
    const trimmed = input.trim()
    if (!trimmed) return

    const message: Message = {
      id: `m_${Date.now()}`,
      classId,
      senderId: currentUserId,
      content: trimmed,
      timestamp: new Date().toISOString(),
      type: currentUserRole === "teacher" ? "announcement" : "text",
    }

    addMessage(message)
    setInput("")
  }

  async function sendImage(file?: File) {
    if (!file) return

    const dataUrl = await readFileAsDataUrl(file)
    const message: Message = {
      id: `m_${Date.now()}`,
      classId,
      senderId: currentUserId,
      content: input.trim() || "Shared an image",
      timestamp: new Date().toISOString(),
      type: "image",
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      mediaUrl: dataUrl,
      mimeType: file.type,
    }

    addMessage(message)
    setInput("")
  }

  async function sendFile(file?: File) {
    if (!file) return

    const dataUrl = await readFileAsDataUrl(file)
    const message: Message = {
      id: `m_${Date.now()}`,
      classId,
      senderId: currentUserId,
      content: input.trim() || "Shared a file",
      timestamp: new Date().toISOString(),
      type: "file",
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      mediaUrl: dataUrl,
      mimeType: file.type,
    }

    addMessage(message)
    setInput("")
  }

  return {
    input,
    setInput,
    messages,
    enrichedMessages,
    mediaItems,
    pinnedMessages,
    bottomRef,
    sendMessage,
    sendFile,
    sendImage,
  }
}
