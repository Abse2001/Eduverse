"use client"

import { useRef } from "react"
import { Image, Paperclip, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ChatComposerProps {
  input: string
  setInput: (value: string) => void
  onSend: () => void
  onSelectFile: (file?: File) => Promise<void>
  onSelectImage: (file?: File) => Promise<void>
  placeholder: string
}

export function ChatComposer({
  input,
  setInput,
  onSend,
  onSelectFile,
  onSelectImage,
  placeholder,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="shrink-0 border-t border-border px-4 py-3 bg-card/80 backdrop-blur-sm">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          await onSelectFile(file)
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          await onSelectImage(file)
          event.currentTarget.value = ""
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
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed min-h-[24px] max-h-32"
            style={{ height: "24px", overflow: "hidden" }}
            onInput={(event) => {
              const target = event.target as HTMLTextAreaElement
              target.style.height = "24px"
              target.style.height = `${target.scrollHeight}px`
            }}
          />
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={() => imageInputRef.current?.click()}
            >
              <Image className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>
        <Button
          onClick={onSend}
          disabled={!input.trim()}
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
