"use client"

import { useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"
import { MOCK_SESSION_CHAT } from "./session-data"

export function SessionChat() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState(MOCK_SESSION_CHAT)
  const { currentUser } = useApp()

  const send = () => {
    if (!input.trim()) return

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        sender: currentUser.name.split(" ")[0],
        avatar: currentUser.avatar,
        msg: input.trim(),
        time: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ])
    setInput("")
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((message) => (
          <div key={message.id} className="flex items-start gap-2">
            <Avatar className="w-6 h-6 shrink-0 mt-0.5">
              <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                {message.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {message.sender}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {message.time}
                </span>
              </div>
              <p className="text-xs text-foreground/90 mt-0.5 leading-relaxed">
                {message.msg}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
          placeholder="Send a message..."
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
        <Button size="sm" className="h-8 px-3 text-xs" onClick={send}>
          Send
        </Button>
      </div>
    </div>
  )
}
