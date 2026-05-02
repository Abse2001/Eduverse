"use client"

import { MoreHorizontal, Pin, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Class } from "@/lib/mock-data"
import { CLASS_COLOR_MAP } from "@/lib/view-config"
import { ChatComposer } from "./chat-composer"
import { ChatMediaStrip } from "./chat-media-strip"
import { MessageBubble } from "./message-bubble"
import { useClassMessages } from "./use-class-messages"

export function ChatScreen({ cls }: { cls: Class }) {
  const { currentUser } = useApp()
  const {
    input,
    setInput,
    enrichedMessages,
    mediaItems,
    pinnedMessages,
    bottomRef,
    sendMessage,
    sendFile,
    sendImage,
    isLoading,
    isSending,
    errorMessage,
  } = useClassMessages({
    classId: cls.id,
    currentUserId: currentUser.id,
    currentUserRole: currentUser.role,
  })

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0",
            CLASS_COLOR_MAP[cls.color] ?? "bg-primary",
          )}
        >
          {cls.code.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{cls.name}</p>
          <p className="text-xs text-muted-foreground">
            {cls.code} &middot; {enrichedMessages.length} messages &middot;{" "}
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

      {pinnedMessages.length > 0 ? (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/10 shrink-0">
          <div className="flex items-center gap-2">
            <Pin className="w-3 h-3 text-primary" />
            <p className="text-xs font-medium text-primary">Pinned:</p>
            <p className="text-xs text-muted-foreground truncate">
              {pinnedMessages[0].content}
            </p>
          </div>
        </div>
      ) : null}

      <ChatMediaStrip items={mediaItems} />

      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {errorMessage ? (
          <div className="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        {isLoading ? (
          <p className="px-4 text-sm text-muted-foreground">
            Loading messages...
          </p>
        ) : (
          enrichedMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isOwn={message.senderId === currentUser.id}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <ChatComposer
        input={input}
        setInput={setInput}
        onSend={sendMessage}
        onSelectFile={sendFile}
        onSelectImage={sendImage}
        disabled={isSending}
        placeholder={
          currentUser.role === "teacher"
            ? "Post an announcement or attach media..."
            : "Message the class or attach media..."
        }
      />
    </div>
  )
}
