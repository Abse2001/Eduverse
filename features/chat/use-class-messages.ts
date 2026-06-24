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

type MessagesCacheEntry = {
  messages: ChatMessage[] | null
  request: Promise<ChatMessage[]> | null
}

const messagesCache = new Map<string, MessagesCacheEntry>()
const messageListeners = new Map<
  string,
  Set<(messages: ChatMessage[]) => void>
>()

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
  const cacheKey = getMessagesCacheKey(classId, currentUserId)

  useEffect(() => {
    let cancelled = false
    const cachedMessages = readMessagesCache(cacheKey)

    if (cachedMessages) {
      setMessages(cachedMessages)
      setIsLoading(false)
    } else {
      setMessages([])
      setIsLoading(true)
    }
    setErrorMessage(null)

    const unsubscribe = subscribeMessages(cacheKey, (nextMessages) => {
      if (cancelled) return
      setMessages(nextMessages)
      setIsLoading(false)
      setErrorMessage(null)
    })

    loadClassMessages({ classId, cacheKey, force: true })
      .then((nextMessages) => {
        if (!cancelled) setMessages(nextMessages)
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
      unsubscribe()
    }
  }, [cacheKey, classId])

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
        .filter(
          (message) =>
            message.kind === "announcement" &&
            message.showInAnnouncementCarousel,
        )
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
            senderRole: currentUserRole,
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

      writeMessagesCache(cacheKey, [
        ...(readMessagesCache(cacheKey) ?? messages),
        payload.message as ChatMessage,
      ])
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
        { method: "PATCH" },
      )
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Could not remove announcement from carousel.",
        )
      }

      writeMessagesCache(
        cacheKey,
        (readMessagesCache(cacheKey) ?? messages).map((message) =>
          message.id === messageId
            ? { ...message, showInAnnouncementCarousel: false }
            : message,
        ),
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not remove announcement from carousel.",
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
      formData.set("senderRole", currentUserRole)

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

      writeMessagesCache(cacheKey, [
        ...(readMessagesCache(cacheKey) ?? messages),
        payload.message as ChatMessage,
      ])
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

async function loadClassMessages({
  classId,
  cacheKey,
  force = false,
}: {
  classId: string
  cacheKey: string
  force?: boolean
}) {
  const cached = messagesCache.get(cacheKey)

  if (!force && cached?.messages) {
    return cached.messages
  }

  if (cached?.request) {
    return cached.request
  }

  const request = fetchClassMessages(classId)
    .then((messages) => {
      writeMessagesCache(cacheKey, messages)
      return messages
    })
    .finally(() => {
      const latestCached = messagesCache.get(cacheKey)
      if (latestCached?.request === request) {
        latestCached.request = null
      }
    })

  messagesCache.set(cacheKey, {
    messages: cached?.messages ?? null,
    request,
  })

  return request
}

async function fetchClassMessages(classId: string) {
  const response = await fetch(
    `/api/classes/${encodeURIComponent(classId)}/messages`,
  )
  const payload = (await response
    .json()
    .catch(() => null)) as MessagesResponse | null

  if (!response.ok || !payload?.messages) {
    throw new Error(payload?.error ?? "Could not load messages.")
  }

  return payload.messages
}

function readMessagesCache(cacheKey: string) {
  return messagesCache.get(cacheKey)?.messages ?? null
}

function subscribeMessages(
  cacheKey: string,
  listener: (messages: ChatMessage[]) => void,
) {
  const listeners = messageListeners.get(cacheKey) ?? new Set()
  listeners.add(listener)
  messageListeners.set(cacheKey, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      messageListeners.delete(cacheKey)
    }
  }
}

function writeMessagesCache(cacheKey: string, messages: ChatMessage[]) {
  const current = messagesCache.get(cacheKey)
  messagesCache.set(cacheKey, {
    messages,
    request: current?.request ?? null,
  })

  for (const listener of messageListeners.get(cacheKey) ?? []) {
    listener(messages)
  }
}

function getMessagesCacheKey(classId: string, currentUserId: string) {
  return `${classId}:${currentUserId}`
}
