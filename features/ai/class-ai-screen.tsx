"use client"

import { ArrowDown, Bot, Loader2, Send } from "lucide-react"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { ClassPageHeader } from "@/components/shared/class-page-header"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Class } from "@/lib/mock-data"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "./markdown-content"

type AgentMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const SUGGESTED_PROMPTS = [
  "Summarize what I should study this week.",
  "Make a short quiz from our recent materials.",
  "Explain the hardest current assignment step by step.",
]

export function ClassAiScreen({ cls }: { cls: Class }) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const thinkingRef = useRef<HTMLDivElement | null>(null)
  const hasMessages = messages.length > 0

  function updateCanScrollDown() {
    const scrollElement = chatScrollRef.current
    if (!scrollElement) return

    const remainingScroll =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight
    setCanScrollDown(remainingScroll > 24)
  }

  function scrollToChatBottom() {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }

  useEffect(() => {
    const inputElement = inputRef.current
    if (!inputElement) return

    inputElement.style.height = "0px"
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 144)}px`
    inputElement.style.overflowY =
      inputElement.scrollHeight > 144 ? "auto" : "hidden"
  }, [input])

  useEffect(() => {
    if (!isSending) return
    requestAnimationFrame(() => {
      thinkingRef.current?.scrollIntoView({
        block: "end",
        behavior: "smooth",
      })
    })
  }, [isSending])

  useEffect(() => {
    requestAnimationFrame(updateCanScrollDown)
  }, [messages, isSending])

  useEffect(() => {
    if (!errorMessage) return

    toast({
      title: "Could not ask AI Agent",
      description: errorMessage,
      variant: "destructive",
    })
  }, [errorMessage])

  async function askQuestion(rawQuestion: string) {
    const question = rawQuestion.trim()
    if (!question || isSending) return

    const nextMessages: AgentMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: question },
    ]
    setMessages(nextMessages)
    setInput("")
    setIsSending(true)
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(cls.id)}/ai/agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            messages,
          }),
        },
      )
      const payload = (await response.json().catch(() => null)) as {
        answer?: string
        error?: string
      } | null

      const answer = payload?.answer

      if (!response.ok || !answer) {
        throw new Error(payload?.error ?? "Could not ask AI Agent.")
      }

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: answer },
      ])
    } catch (error) {
      setMessages(messages)
      setErrorMessage(
        error instanceof Error ? error.message : "Could not ask AI Agent.",
      )
    } finally {
      setIsSending(false)
    }
  }

  async function submitQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    await askQuestion(input)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-6xl flex-col p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <ClassPageHeader title={cls.name} code={cls.code} section="AI Agent" />
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={chatScrollRef}
          onScroll={updateCanScrollDown}
          className="h-full overflow-y-auto rounded-lg border bg-card"
        >
          {!hasMessages ? (
            <div className="grid h-full min-h-80 place-items-center p-6 text-center">
              <div className="max-w-xl">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  Ask about this class
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The AI Agent can use class materials, assignments, and recent
                  class messages as context.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => askQuestion(prompt)}
                      disabled={isSending}
                      className="rounded-lg border bg-background px-3 py-2 text-left text-xs leading-5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      message.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border bg-background text-foreground",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <MarkdownContent
                        content={message.content}
                        className="space-y-2 leading-5"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap leading-5">
                        {message.content}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {isSending ? (
                <div
                  ref={thinkingRef}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              ) : null}
            </div>
          )}
        </div>
        {canScrollDown ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={scrollToChatBottom}
            className="absolute bottom-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full border bg-background/95 shadow-md backdrop-blur"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <form onSubmit={submitQuestion} className="mt-4 flex items-end gap-3">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void askQuestion(input)
            }
          }}
          placeholder="Ask for an explanation, study plan, quiz, or hint..."
          className="max-h-36 min-h-10 resize-none overflow-hidden py-2 leading-5"
          rows={1}
          disabled={isSending}
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={!input.trim() || isSending}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        Avoid sharing personal or sensitive information with AI.
      </p>
    </div>
  )
}
