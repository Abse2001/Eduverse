"use client"

import { format } from "date-fns"
import {
  Download,
  File as FileIcon,
  FileText,
  ImageIcon,
  Layers,
  Megaphone,
  PlaySquare,
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { downloadCachedMedia, loadCachedMedia } from "./media-cache"

export type ChatMessage = {
  id: string
  organizationId: string
  classId: string
  senderId: string
  senderName: string
  senderAvatar: string
  content: string
  kind: "text" | "announcement" | "media"
  materialId: string | null
  mediaTitle: string | null
  originalFilename: string | null
  mimeType: string | null
  sizeBytes: number | null
  materialType: "image" | "pdf" | "video" | "slide" | null
  isMaterialDeleted: boolean
  createdAt: string
}

export type EnrichedMessage = ChatMessage

const MEDIA_ICON = {
  image: ImageIcon,
  pdf: FileText,
  video: PlaySquare,
  slide: Layers,
}

export function MessageBubble({
  message,
  isOwn,
  isFocused = false,
}: {
  message: ChatMessage
  isOwn: boolean
  isFocused?: boolean
}) {
  if (message.kind === "announcement") {
    return <AnnouncementBubble message={message} isFocused={isFocused} />
  }

  if (message.kind === "media") {
    return <MediaBubble message={message} isOwn={isOwn} isFocused={isFocused} />
  }

  return (
    <MessageShell message={message} isOwn={isOwn} isFocused={isFocused}>
      <div
        className={cn(
          "px-3 py-2 rounded-2xl text-sm leading-relaxed",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {message.content}
      </div>
    </MessageShell>
  )
}

function AnnouncementBubble({
  message,
  isFocused,
}: {
  message: ChatMessage
  isFocused: boolean
}) {
  return (
    <div
      id={`chat-message-${message.id}`}
      className={cn(
        "flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 mx-2 transition-shadow",
        isFocused && "shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]",
      )}
    >
      <Megaphone className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-primary">
            {message.senderName}
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
            {format(new Date(message.createdAt), "MMM d, h:mm a")}
          </span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  )
}

function MediaBubble({
  message,
  isOwn,
  isFocused,
}: {
  message: ChatMessage
  isOwn: boolean
  isFocused: boolean
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isUnavailable, setIsUnavailable] = useState(message.isMaterialDeleted)
  const isImage = message.materialType === "image"

  useEffect(() => {
    let cancelled = false

    if (!isImage || !message.materialId || message.isMaterialDeleted) return

    loadCachedMedia({
      classId: message.classId,
      materialId: message.materialId,
    })
      .then((media) => {
        if (!cancelled) setObjectUrl(media.objectUrl)
      })
      .catch(() => {
        if (!cancelled) setIsUnavailable(true)
      })

    return () => {
      cancelled = true
    }
  }, [isImage, message.classId, message.materialId, message.isMaterialDeleted])

  async function openMedia() {
    if (!message.materialId || isUnavailable) {
      window.alert("Media is no longer available.")
      return
    }

    try {
      const media = await loadCachedMedia({
        classId: message.classId,
        materialId: message.materialId,
      })
      window.open(media.objectUrl, "_blank", "noopener,noreferrer")
    } catch {
      setIsUnavailable(true)
      window.alert("Media is no longer available.")
    }
  }

  async function downloadMedia() {
    if (!message.materialId || isUnavailable) {
      window.alert("Media is no longer available.")
      return
    }

    try {
      await downloadCachedMedia({
        classId: message.classId,
        materialId: message.materialId,
        fileName: message.originalFilename ?? "media",
      })
    } catch {
      setIsUnavailable(true)
      window.alert("Media is no longer available.")
    }
  }

  const Icon =
    message.materialType && message.materialType in MEDIA_ICON
      ? MEDIA_ICON[message.materialType]
      : FileIcon

  return (
    <MessageShell
      message={message}
      isOwn={isOwn}
      isFocused={isFocused}
      maxWidth="max-w-sm"
    >
      <div
        className={cn(
          "p-1.5 rounded-2xl border",
          isOwn
            ? "bg-primary/10 border-primary/30 rounded-br-sm"
            : "bg-card border-border rounded-bl-sm",
        )}
      >
        {isImage && objectUrl && !isUnavailable ? (
          <button type="button" onClick={openMedia} className="block text-left">
            <img
              src={objectUrl}
              alt={message.originalFilename ?? "Shared image"}
              className="w-full max-w-sm max-h-72 object-cover rounded-xl"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={openMedia}
            className={cn(
              "flex w-64 max-w-full items-center gap-3 rounded-xl border p-3 text-left",
              isUnavailable
                ? "bg-muted text-muted-foreground"
                : "bg-background text-foreground",
            )}
          >
            <Icon className="w-9 h-9 shrink-0 opacity-70" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {message.originalFilename ?? message.mediaTitle ?? "Media"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isUnavailable
                  ? "No longer available"
                  : formatBytes(message.sizeBytes)}
              </p>
            </div>
          </button>
        )}
        {message.content && !isDefaultMediaContent(message.content) ? (
          <p className="text-xs px-1 pt-1 text-foreground">{message.content}</p>
        ) : null}
        {!isUnavailable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 h-7 gap-1.5 text-xs"
            onClick={downloadMedia}
          >
            <Download className="w-3 h-3" />
            Download
          </Button>
        ) : null}
      </div>
    </MessageShell>
  )
}

function MessageShell({
  message,
  isOwn,
  isFocused,
  maxWidth = "max-w-sm",
  children,
}: {
  message: ChatMessage
  isOwn: boolean
  isFocused: boolean
  maxWidth?: string
  children: ReactNode
}) {
  return (
    <div
      id={`chat-message-${message.id}`}
      className={cn(
        "flex items-end gap-2 px-2 transition-shadow",
        isOwn && "flex-row-reverse",
        isFocused && "rounded-xl shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]",
      )}
    >
      {!isOwn ? (
        <Avatar className="w-7 h-7 mb-0.5">
          <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
            {message.senderAvatar}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <div className={cn(maxWidth, isOwn && "items-end flex flex-col")}>
        {!isOwn ? (
          <p className="text-[11px] text-muted-foreground mb-1 px-1">
            {message.senderName}
          </p>
        ) : null}
        {children}
        <p
          className="text-[10px] text-muted-foreground mt-1 px-1"
          suppressHydrationWarning
        >
          {format(new Date(message.createdAt), "h:mm a")}
        </p>
      </div>
    </div>
  )
}

function isDefaultMediaContent(content: string) {
  return [
    "Shared an image",
    "Shared a PDF",
    "Shared a video",
    "Shared slides",
  ].includes(content)
}

function formatBytes(bytes: number | null) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB"]
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exp

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exp]}`
}
