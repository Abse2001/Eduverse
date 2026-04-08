"use client"

import { format } from "date-fns"
import { File as FileIcon, Megaphone, Pin } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Message } from "@/lib/mock-data"

export type EnrichedMessage = Message & {
  senderName: string
  senderAvatar: string
}

export function MessageBubble({
  message,
  isOwn,
}: {
  message: EnrichedMessage
  isOwn: boolean
}) {
  if (message.type === "announcement") {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 mx-2">
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
              {format(new Date(message.timestamp), "MMM d, h:mm a")}
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {message.content}
          </p>
        </div>
        {message.pinned ? (
          <Pin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : null}
      </div>
    )
  }

  if (message.type === "image") {
    return (
      <div
        className={cn("flex items-end gap-2 px-2", isOwn && "flex-row-reverse")}
      >
        {!isOwn ? (
          <Avatar className="w-7 h-7 mb-0.5">
            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
              {message.senderAvatar}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div className={cn("max-w-sm", isOwn && "items-end flex flex-col")}>
          {!isOwn ? (
            <p className="text-[11px] text-muted-foreground mb-1 px-1">
              {message.senderName}
            </p>
          ) : null}
          <div
            className={cn(
              "p-1.5 rounded-2xl border",
              isOwn
                ? "bg-primary/10 border-primary/30 rounded-br-sm"
                : "bg-card border-border rounded-bl-sm",
            )}
          >
            {message.mediaUrl ? (
              <a
                href={message.mediaUrl}
                target="_blank"
                rel="noreferrer"
                download={message.fileName}
              >
                <img
                  src={message.mediaUrl}
                  alt={message.fileName ?? "Shared image"}
                  className="w-full max-w-sm max-h-72 object-cover rounded-xl"
                />
              </a>
            ) : (
              <div className="w-64 h-40 rounded-xl bg-muted flex items-center justify-center text-xs text-muted-foreground">
                Image preview unavailable
              </div>
            )}
            {message.content && message.content !== "Shared an image" ? (
              <p className="text-xs px-1 pt-1 text-foreground">
                {message.content}
              </p>
            ) : null}
          </div>
          <p
            className="text-[10px] text-muted-foreground mt-1 px-1"
            suppressHydrationWarning
          >
            {format(new Date(message.timestamp), "h:mm a")}
          </p>
        </div>
      </div>
    )
  }

  if (message.type === "file") {
    return (
      <div
        className={cn("flex items-end gap-2 px-2", isOwn && "flex-row-reverse")}
      >
        {!isOwn ? (
          <Avatar className="w-7 h-7 mb-0.5">
            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
              {message.senderAvatar}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div className={cn("max-w-xs", isOwn && "items-end flex flex-col")}>
          {!isOwn ? (
            <p className="text-[11px] text-muted-foreground mb-1 px-1">
              {message.senderName}
            </p>
          ) : null}
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noreferrer"
            download={message.fileName}
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
                  {message.fileName}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    isOwn
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {message.fileSize}
                </p>
              </div>
            </div>
          </a>
          <p
            className="text-[10px] text-muted-foreground mt-1 px-1"
            suppressHydrationWarning
          >
            {format(new Date(message.timestamp), "h:mm a")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("flex items-end gap-2 px-2", isOwn && "flex-row-reverse")}
    >
      {!isOwn ? (
        <Avatar className="w-7 h-7 mb-0.5">
          <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
            {message.senderAvatar}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <div className={cn("max-w-sm", isOwn && "items-end flex flex-col")}>
        {!isOwn ? (
          <p className="text-[11px] text-muted-foreground mb-1 px-1">
            {message.senderName}
          </p>
        ) : null}
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
        <p
          className="text-[10px] text-muted-foreground mt-1 px-1"
          suppressHydrationWarning
        >
          {format(new Date(message.timestamp), "h:mm a")}
        </p>
      </div>
    </div>
  )
}
