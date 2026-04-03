"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getClassById,
  getMessagesByClass,
  getUserById,
  type Message,
} from "@/lib/mock-data"
import {
  appendStoredClassMessage,
  loadStoredClassMessages,
} from "@/lib/class-chat-storage"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import {
  File as FileIcon,
  Image,
  Megaphone,
  MoreHorizontal,
  Paperclip,
  Pin,
  Search,
  Send,
} from "lucide-react"
import { format } from "date-fns"

const CLASS_HEADER: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exp
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exp]}`
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("Unable to read file."))
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read file."))
    reader.readAsDataURL(file)
  })
}

function MessageBubble({
  msg,
  isOwn,
}: {
  msg: Message & { senderName: string; senderAvatar: string }
  isOwn: boolean
}) {
  if (msg.type === "announcement") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 mx-2">
        <Megaphone className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-primary">
              {msg.senderName}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] bg-primary/10 text-primary border-0 py-0"
            >
              Announcement
            </Badge>
            <span
              className="text-[10px] text-muted-foreground ml-auto"
              suppressHydrationWarning
            >
              {format(new Date(msg.timestamp), "MMM d, h:mm a")}
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {msg.content}
          </p>
        </div>
        {msg.pinned && (
          <Pin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </div>
    )
  }

  if (msg.type === "image") {
    return (
      <div
        className={cn("flex items-end gap-2 px-2", isOwn && "flex-row-reverse")}
      >
        {!isOwn && (
          <Avatar className="w-7 h-7 mb-0.5">
            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
              {msg.senderAvatar}
            </AvatarFallback>
          </Avatar>
        )}
        <div className={cn("max-w-sm", isOwn && "items-end flex flex-col")}>
          {!isOwn && (
            <p className="text-[11px] text-muted-foreground mb-1 px-1">
              {msg.senderName}
            </p>
          )}
          <div
            className={cn(
              "p-1.5 rounded-2xl border",
              isOwn
                ? "bg-primary/10 border-primary/30 rounded-br-sm"
                : "bg-card border-border rounded-bl-sm",
            )}
          >
            {msg.mediaUrl ? (
              <a
                href={msg.mediaUrl}
                target="_blank"
                rel="noreferrer"
                download={msg.fileName}
              >
                <img
                  src={msg.mediaUrl}
                  alt={msg.fileName ?? "Shared image"}
                  className="w-full max-w-sm max-h-72 object-cover rounded-xl"
                />
              </a>
            ) : (
              <div className="w-64 h-40 rounded-xl bg-muted flex items-center justify-center text-xs text-muted-foreground">
                Image preview unavailable
              </div>
            )}
            {msg.content && msg.content !== "Shared an image" && (
              <p className="text-xs px-1 pt-1 text-foreground">{msg.content}</p>
            )}
          </div>
          <p
            className="text-[10px] text-muted-foreground mt-1 px-1"
            suppressHydrationWarning
          >
            {format(new Date(msg.timestamp), "h:mm a")}
          </p>
        </div>
      </div>
    )
  }

  if (msg.type === "file") {
    return (
      <div
        className={cn("flex items-end gap-2 px-2", isOwn && "flex-row-reverse")}
      >
        {!isOwn && (
          <Avatar className="w-7 h-7 mb-0.5">
            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
              {msg.senderAvatar}
            </AvatarFallback>
          </Avatar>
        )}
        <div className={cn("max-w-xs", isOwn && "items-end flex flex-col")}>
          {!isOwn && (
            <p className="text-[11px] text-muted-foreground mb-1 px-1">
              {msg.senderName}
            </p>
          )}
          <a
            href={msg.mediaUrl}
            target="_blank"
            rel="noreferrer"
            download={msg.fileName}
          >
            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-xl border",
                isOwn
                  ? "bg-primary text-primary-foreground border-primary/80"
                  : "bg-card border-border",
              )}
            >
              <FileIcon className="w-8 h-8 shrink-0 opacity-70" />
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium truncate",
                    isOwn ? "text-primary-foreground" : "text-foreground",
                  )}
                >
                  {msg.fileName}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    isOwn
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {msg.fileSize}
                </p>
              </div>
            </div>
          </a>
          <p
            className="text-[10px] text-muted-foreground mt-1 px-1"
            suppressHydrationWarning
          >
            {format(new Date(msg.timestamp), "h:mm a")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("flex items-end gap-2 px-2", isOwn && "flex-row-reverse")}
    >
      {!isOwn && (
        <Avatar className="w-7 h-7 mb-0.5">
          <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
            {msg.senderAvatar}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-sm", isOwn && "items-end flex flex-col")}>
        {!isOwn && (
          <p className="text-[11px] text-muted-foreground mb-1 px-1">
            {msg.senderName}
          </p>
        )}
        <div
          className={cn(
            "px-3 py-2 rounded-2xl text-sm leading-relaxed",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm",
          )}
        >
          {msg.content}
        </div>
        <p
          className="text-[10px] text-muted-foreground mt-1 px-1"
          suppressHydrationWarning
        >
          {format(new Date(msg.timestamp), "h:mm a")}
        </p>
      </div>
    </div>
  )
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { currentUser } = useApp()
  const cls = getClassById(classId)
  const rawMessages = useMemo(() => getMessagesByClass(classId), [classId])
  const [messages, setMessages] = useState(rawMessages)
  const [input, setInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stored = loadStoredClassMessages(classId)
    if (stored.length === 0) return

    const merged = [...rawMessages, ...stored].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    const unique = merged.filter(
      (msg, idx, arr) =>
        arr.findIndex((candidate) => candidate.id === msg.id) === idx,
    )
    setMessages(unique)
  }, [classId, rawMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const enriched = messages.map((m) => {
    const sender = getUserById(m.senderId)
    return {
      ...m,
      senderName: sender?.name ?? "Unknown",
      senderAvatar: sender?.avatar ?? "??",
    }
  })

  const mediaItems = useMemo(
    () =>
      enriched
        .filter(
          (msg) =>
            (msg.type === "image" || msg.type === "file") && msg.mediaUrl,
        )
        .reverse(),
    [enriched],
  )

  function addMessage(message: Message) {
    setMessages((prev) => [...prev, message])
    appendStoredClassMessage(classId, message)
  }

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed) return

    const newMsg: Message = {
      id: `m_${Date.now()}`,
      classId,
      senderId: currentUser.id,
      content: trimmed,
      timestamp: new Date().toISOString(),
      type: currentUser.role === "teacher" ? "announcement" : "text",
    }

    addMessage(newMsg)
    setInput("")
  }

  async function handleImageSelected(file?: File) {
    if (!file) return

    const dataUrl = await readFileAsDataUrl(file)
    const newMsg: Message = {
      id: `m_${Date.now()}`,
      classId,
      senderId: currentUser.id,
      content: input.trim() || "Shared an image",
      timestamp: new Date().toISOString(),
      type: "image",
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      mediaUrl: dataUrl,
      mimeType: file.type,
    }

    addMessage(newMsg)
    setInput("")
  }

  async function handleFileSelected(file?: File) {
    if (!file) return

    const dataUrl = await readFileAsDataUrl(file)
    const newMsg: Message = {
      id: `m_${Date.now()}`,
      classId,
      senderId: currentUser.id,
      content: input.trim() || "Shared a file",
      timestamp: new Date().toISOString(),
      type: "file",
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      mediaUrl: dataUrl,
      mimeType: file.type,
    }

    addMessage(newMsg)
    setInput("")
  }

  if (!cls)
    return <div className="p-6 text-muted-foreground">Class not found.</div>

  const pinned = enriched.filter((m) => m.pinned)

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0",
            CLASS_HEADER[cls.color] ?? "bg-primary",
          )}
        >
          {cls.code.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{cls.name}</p>
          <p className="text-xs text-muted-foreground">
            {cls.code} &middot; {messages.length} messages &middot;{" "}
            {mediaItems.length} media
          </p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0">
          <Search className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="shrink-0">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {pinned.length > 0 && (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/10 shrink-0">
          <div className="flex items-center gap-2">
            <Pin className="w-3 h-3 text-primary" />
            <p className="text-xs font-medium text-primary">Pinned:</p>
            <p className="text-xs text-muted-foreground truncate">
              {pinned[0].content}
            </p>
          </div>
        </div>
      )}

      {mediaItems.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">
            Class Media
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mediaItems.slice(0, 12).map((item) => (
              <a
                key={item.id}
                href={item.mediaUrl}
                target="_blank"
                rel="noreferrer"
                download={item.fileName}
                className="shrink-0"
              >
                {item.type === "image" ? (
                  <img
                    src={item.mediaUrl}
                    alt={item.fileName ?? "Shared image"}
                    className="w-16 h-16 object-cover rounded-md border border-border"
                  />
                ) : (
                  <div className="w-40 h-16 rounded-md border border-border bg-card px-2 py-1.5 flex items-center gap-2">
                    <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] truncate text-foreground">
                        {item.fileName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.fileSize}
                      </p>
                    </div>
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {enriched.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.senderId === currentUser.id}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3 bg-card/80 backdrop-blur-sm">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            await handleFileSelected(file)
            e.currentTarget.value = ""
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            await handleImageSelected(file)
            e.currentTarget.value = ""
          }}
        />

        <div className="flex items-end gap-2">
          <div className="flex-1 flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                currentUser.role === "teacher"
                  ? "Post an announcement or attach media..."
                  : "Message the class or attach media..."
              }
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] max-h-32"
              style={{ height: "24px", overflow: "hidden" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = "24px"
                target.style.height = `${target.scrollHeight}px`
              }}
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => imageInputRef.current?.click()}
              >
                <Image className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            size="icon"
            className="shrink-0 w-9 h-9"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Enter sends message &middot; Shift+Enter makes a new line &middot;
          attachments are stored per class
        </p>
      </div>
    </div>
  )
}
