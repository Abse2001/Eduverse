"use client"

import { File as FileIcon, ImageIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { ChatMessage } from "./message-bubble"
import { loadCachedMedia } from "./media-cache"

export function ChatMediaStrip({ items }: { items: ChatMessage[] }) {
  if (items.length === 0) return null

  return (
    <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0">
      <p className="text-[11px] font-medium text-muted-foreground mb-2">
        Class Media
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.slice(0, 12).map((item) => (
          <MediaStripItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

function MediaStripItem({ item }: { item: ChatMessage }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const isUnavailable = item.isMaterialDeleted || !item.materialId

  useEffect(() => {
    let cancelled = false

    if (item.materialType !== "image" || !item.materialId || isUnavailable) {
      return
    }

    loadCachedMedia({ classId: item.classId, materialId: item.materialId })
      .then((media) => {
        if (!cancelled) setObjectUrl(media.objectUrl)
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [item.classId, item.materialId, item.materialType, isUnavailable])

  async function openMedia() {
    if (!item.materialId || isUnavailable) {
      window.alert("Media is no longer available.")
      return
    }

    try {
      const media = await loadCachedMedia({
        classId: item.classId,
        materialId: item.materialId,
      })
      window.open(media.objectUrl, "_blank", "noopener,noreferrer")
    } catch {
      window.alert("Media is no longer available.")
    }
  }

  return (
    <button type="button" onClick={openMedia} className="shrink-0 text-left">
      {item.materialType === "image" && objectUrl && !isUnavailable ? (
        <img
          src={objectUrl}
          alt={item.originalFilename ?? "Shared image"}
          className="w-16 h-16 object-cover rounded-md border border-border"
        />
      ) : (
        <div className="w-40 h-16 rounded-md border border-border bg-card px-2 py-1.5 flex items-center gap-2">
          {item.materialType === "image" ? (
            <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] truncate text-foreground">
              {item.originalFilename ?? item.mediaTitle}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isUnavailable ? "Unavailable" : formatBytes(item.sizeBytes)}
            </p>
          </div>
        </div>
      )}
    </button>
  )
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
