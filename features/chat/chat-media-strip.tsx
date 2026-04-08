"use client"

import { File as FileIcon } from "lucide-react"
import type { EnrichedMessage } from "./message-bubble"

export function ChatMediaStrip({ items }: { items: EnrichedMessage[] }) {
  if (items.length === 0) return null

  return (
    <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0">
      <p className="text-[11px] font-medium text-muted-foreground mb-2">
        Class Media
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.slice(0, 12).map((item) => (
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
  )
}
