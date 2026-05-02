"use client"

import { useRef } from "react"
import { Image, Megaphone, Paperclip, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ChatComposerProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  onSelectFile: (file?: File) => Promise<void>
  onSelectImage: (file?: File) => Promise<void>
  placeholder: string
  disabled?: boolean
  canSendAnnouncement?: boolean
  isAnnouncementMode?: boolean
  onToggleAnnouncementMode?: () => void
}

export function ChatComposer({
  input,
  setInput,
  onSend,
  onSelectFile,
  onSelectImage,
  placeholder,
  disabled = false,
  canSendAnnouncement = false,
  isAnnouncementMode = false,
  onToggleAnnouncementMode,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="shrink-0 border-t border-border px-4 py-3 bg-card/80 backdrop-blur-sm">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,video/*,.ppt,.pptx,.odp,.key"
        className="hidden"
        disabled={disabled}
        onChange={async (event) => {
          const input = event.currentTarget
          const file = event.target.files?.[0]
          await onSelectFile(file)
          input.value = ""
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={async (event) => {
          const input = event.currentTarget
          const file = event.target.files?.[0]
          await onSelectImage(file)
          input.value = ""
        }}
      />

      <div className="flex items-end gap-2">
        <div className="flex-1 flex items-end gap-2 rounded-xl border border-input bg-background px-3 py-2">
          <textarea
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] max-h-32"
            style={{ height: "24px", overflow: "hidden" }}
            onInput={(event) => {
              const target = event.target as HTMLTextAreaElement
              target.style.height = "24px"
              target.style.height = `${target.scrollHeight}px`
            }}
          />
          <div className="flex items-center gap-1 shrink-0">
            {canSendAnnouncement ? (
              <Button
                type="button"
                variant={isAnnouncementMode ? "secondary" : "ghost"}
                size="icon"
                className={cn("w-7 h-7", isAnnouncementMode && "text-primary")}
                onClick={onToggleAnnouncementMode}
                disabled={disabled}
                title="Announcement mode"
              >
                <Megaphone className="w-3.5 h-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled}
            >
              <Image className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
        <Button
          onClick={onSend}
          disabled={disabled || !input.trim()}
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
  )
}
