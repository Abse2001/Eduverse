"use client"

import {
  ChevronLeft,
  ChevronRight,
  Megaphone,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Class } from "@/lib/mock-data"
import { CLASS_COLOR_MAP } from "@/lib/view-config"
import { ChatComposer } from "./chat-composer"
import { type ChatMessage, MessageBubble } from "./message-bubble"
import { useClassMessages } from "./use-class-messages"

export function ChatScreen({ cls }: { cls: Class }) {
  const { currentUser } = useApp()
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const {
    input,
    setInput,
    enrichedMessages,
    mediaItems,
    announcements,
    bottomRef,
    sendMessage,
    sendFile,
    sendImage,
    isLoading,
    isSending,
    errorMessage,
    canSendAnnouncement,
    isAnnouncementMode,
    setIsAnnouncementMode,
    deleteAnnouncement,
  } = useClassMessages({
    classId: cls.id,
    currentUserId: currentUser.id,
    currentUserRole: currentUser.role,
  })
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const searchMatches = normalizedSearch
    ? enrichedMessages.filter((message) =>
        getSearchText(message).includes(normalizedSearch),
      )
    : []
  const activeSearchMessage = searchMatches[activeSearchIndex] ?? null

  useEffect(() => {
    setActiveSearchIndex(0)
  }, [normalizedSearch])

  useEffect(() => {
    if (!activeSearchMessage) return
    focusMessage(activeSearchMessage.id)
  }, [activeSearchMessage?.id])

  function focusMessage(messageId: string) {
    document
      .getElementById(`chat-message-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" })
    setFocusedMessageId(messageId)
    window.setTimeout(() => setFocusedMessageId(null), 1400)
  }

  function moveSearch(delta: number) {
    if (searchMatches.length === 0) return
    setActiveSearchIndex((prev) => {
      const next = prev + delta
      if (next < 0) return searchMatches.length - 1
      if (next >= searchMatches.length) return 0
      return next
    })
  }

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
        <Button
          variant={isSearchOpen ? "secondary" : "ghost"}
          size="icon"
          className="shrink-0"
          onClick={() => setIsSearchOpen((prev) => !prev)}
        >
          <Search className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="shrink-0">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>

      <AnnouncementBar
        announcements={announcements}
        canDelete={canSendAnnouncement}
        onDelete={deleteAnnouncement}
        onOpen={(messageId) => {
          focusMessage(messageId)
        }}
      />

      {isSearchOpen ? (
        <div className="flex items-center gap-2 border-b border-border bg-card/80 px-4 py-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  moveSearch(event.shiftKey ? -1 : 1)
                }
                if (event.key === "Escape") {
                  setSearchQuery("")
                  setIsSearchOpen(false)
                }
              }}
              placeholder="Search messages..."
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
          <span className="w-14 text-center text-xs text-muted-foreground">
            {normalizedSearch
              ? `${searchMatches.length ? activeSearchIndex + 1 : 0}/${searchMatches.length}`
              : "0/0"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => moveSearch(-1)}
            disabled={searchMatches.length < 2}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => moveSearch(1)}
            disabled={searchMatches.length < 2}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setSearchQuery("")
              setIsSearchOpen(false)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

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
              isOwn={
                message.senderId === currentUser.id &&
                message.senderRole === currentUser.role
              }
              isFocused={focusedMessageId === message.id}
              searchQuery={normalizedSearch}
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
        canSendAnnouncement={canSendAnnouncement}
        isAnnouncementMode={isAnnouncementMode}
        onToggleAnnouncementMode={() =>
          setIsAnnouncementMode(!isAnnouncementMode)
        }
        placeholder={
          isAnnouncementMode
            ? "Write an announcement..."
            : "Message the class or attach media..."
        }
      />
    </div>
  )
}

function getSearchText(message: ChatMessage) {
  return [
    message.senderName,
    message.senderRole,
    message.content,
    message.mediaTitle,
    message.originalFilename,
    message.mimeType,
    message.kind === "announcement" ? "announcement" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function AnnouncementBar({
  announcements,
  canDelete,
  onDelete,
  onOpen,
}: {
  announcements: ChatMessage[]
  canDelete: boolean
  onDelete: (messageId: string) => Promise<void>
  onOpen: (messageId: string) => void
}) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex((prev) => Math.min(prev, Math.max(announcements.length - 1, 0)))
  }, [announcements.length])

  if (announcements.length === 0) return null

  const announcement = announcements[index] ?? announcements[0]

  function move(delta: number) {
    setIndex((prev) => {
      const next = prev + delta
      if (next < 0) return announcements.length - 1
      if (next >= announcements.length) return 0
      return next
    })
  }

  return (
    <div className="px-4 py-2 bg-primary/5 border-b border-primary/10 shrink-0">
      <div
        role="button"
        tabIndex={0}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={() => onOpen(announcement.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onOpen(announcement.id)
          }
        }}
      >
        <Megaphone className="w-3.5 h-3.5 text-primary shrink-0" />
        <p className="text-xs font-medium text-primary shrink-0">
          Announcement
        </p>
        <p className="min-w-0 flex-1 truncate text-xs text-foreground">
          {announcement.content}
        </p>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {index + 1}/{announcements.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(event) => {
              event.stopPropagation()
              move(-1)
            }}
            disabled={announcements.length < 2}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(event) => {
              event.stopPropagation()
              move(1)
            }}
            disabled={announcements.length < 2}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation()
                onDelete(announcement.id)
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
