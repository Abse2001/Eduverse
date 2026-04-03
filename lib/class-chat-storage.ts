import type { Message } from "@/lib/mock-data"

const CHAT_STORAGE_PREFIX = "eduverse:class-chat:v1"

function getClassChatStorageKey(classId: string) {
  return `${CHAT_STORAGE_PREFIX}:${classId}`
}

function hasWindow() {
  return typeof window !== "undefined"
}

export function loadStoredClassMessages(classId: string): Message[] {
  if (!hasWindow()) return []

  try {
    const raw = window.localStorage.getItem(getClassChatStorageKey(classId))
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item) => {
      if (!item || typeof item !== "object") return false
      return (
        typeof item.id === "string" &&
        typeof item.classId === "string" &&
        typeof item.senderId === "string" &&
        typeof item.content === "string" &&
        typeof item.timestamp === "string" &&
        typeof item.type === "string"
      )
    }) as Message[]
  } catch {
    return []
  }
}

export function appendStoredClassMessage(classId: string, message: Message) {
  if (!hasWindow()) return

  try {
    const current = loadStoredClassMessages(classId)
    const deduped = current.filter((msg) => msg.id !== message.id)
    const next = [...deduped, message].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    window.localStorage.setItem(
      getClassChatStorageKey(classId),
      JSON.stringify(next),
    )
  } catch {
    console.error("Failed to append class message to localStorage")
  }
}
