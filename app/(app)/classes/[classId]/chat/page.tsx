"use client"

import { use, useState, useRef, useEffect } from "react"
import {
  getClassById,
  getMessagesByClass,
  getUserById,
  Message,
} from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Send,
  Paperclip,
  Image,
  Pin,
  Megaphone,
  File,
  SmilePlus,
  MoreHorizontal,
  Search,
} from "lucide-react"
import { format } from "date-fns"

const CLASS_HEADER: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
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
          <div
            className={cn(
              "flex items-center gap-2 p-3 rounded-xl border",
              isOwn
                ? "bg-primary text-primary-foreground border-primary/80"
                : "bg-card border-border",
            )}
          >
            <File className="w-8 h-8 shrink-0 opacity-70" />
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
  const rawMessages = getMessagesByClass(classId)
  const [messages, setMessages] = useState(rawMessages)
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

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
    setMessages((prev) => [...prev, newMsg])
    setInput("")
  }

  if (!cls)
    return <div className="p-6 text-muted-foreground">Class not found.</div>

  const pinned = enriched.filter((m) => m.pinned)

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
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
            {cls.code} &middot; {messages.length} messages
          </p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0">
          <Search className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="shrink-0">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {/* Pinned */}
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

      {/* Messages */}
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

      {/* Input */}
      <div className="shrink-0 border-t border-border px-4 py-3 bg-card/80 backdrop-blur-sm">
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
                  ? "Post an announcement..."
                  : "Message the class..."
              }
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] max-h-32"
              style={{ height: "24px", overflow: "hidden" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = "24px"
                target.style.height = target.scrollHeight + "px"
              }}
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="w-7 h-7">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="w-7 h-7">
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
          Press Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
