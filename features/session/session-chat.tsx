"use client"

import { useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { LiveSessionChatMessage } from "./live-session-types"

interface SessionChatProps {
  messages: LiveSessionChatMessage[]
  connected: boolean
  onSend: (content: string) => Promise<boolean>
}

function formatMessageTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SessionChat({ messages, connected, onSend }: SessionChatProps) {
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const { currentUser } = useApp()

  const send = async () => {
    const trimmed = input.trim()

    if (!trimmed || isSending) return

    setInput("")
    setIsSending(true)

    const sent = await onSend(trimmed)

    if (!sent) {
      setInput(trimmed)
    }

    setIsSending(false)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Messages sent during this session will appear here.
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === currentUser.id

            return (
              <div
                key={message.id}
                className={cn(
                  "flex items-start gap-2",
                  isOwn && "flex-row-reverse",
                )}
              >
                <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                  <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                    {message.senderAvatar}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("min-w-0", isOwn && "text-right")}>
                  <div
                    className={cn(
                      "flex items-baseline gap-2",
                      isOwn && "justify-end",
                    )}
                  >
                    <span className="truncate text-xs font-semibold text-foreground">
                      {isOwn ? "You" : message.senderName}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatMessageTime(message.timestamp)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 inline-block max-w-full wrap-break-word rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
                      isOwn
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground/90",
                      message.status === "failed" &&
                        "bg-destructive/10 text-destructive",
                    )}
                  >
                    {message.content}
                  </p>
                  {message.status === "sending" ||
                  message.status === "failed" ? (
                    <p
                      className={cn(
                        "mt-0.5 text-[10px] text-muted-foreground",
                        message.status === "failed" && "text-destructive",
                      )}
                    >
                      {message.status === "sending" ? "Sending..." : "Not sent"}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="p-2 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void send()
            }
          }}
          placeholder={
            connected ? "Send a message..." : "Chat is connecting..."
          }
          disabled={!connected || isSending}
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        <Button
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => void send()}
          disabled={!connected || !input.trim() || isSending}
        >
          {isSending ? "Sending" : "Send"}
        </Button>
      </div>
    </div>
  )
}
