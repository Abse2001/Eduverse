"use client"

import { FormEvent, useMemo, useState } from "react"
import { Bot, Loader2, Send, Sparkles } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { Class } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "./markdown-content"

type TutorMessage = {
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
  const [messages, setMessages] = useState<TutorMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasMessages = messages.length > 0
  const contextLabel = useMemo(
    () => `${cls.code} - ${cls.subject || "Class tutor"}`,
    [cls.code, cls.subject],
  )

  async function submitQuestion(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const question = input.trim()
    if (!question || isSending) return

    const nextMessages: TutorMessage[] = [
      ...messages,
      { role: "user", content: question },
    ]
    setMessages(nextMessages)
    setInput("")
    setIsSending(true)
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/classes/${encodeURIComponent(cls.id)}/ai/tutor`,
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
        throw new Error(payload?.error ?? "Could not ask AI tutor.")
      }

      setMessages((prev) => [...prev, { role: "assistant", content: answer }])
    } catch (error) {
      setMessages(messages)
      setErrorMessage(
        error instanceof Error ? error.message : "Could not ask AI tutor.",
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-5xl flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="truncate text-xl font-bold text-foreground">
              AI Tutor
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{contextLabel}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card">
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
                The tutor can use class materials, assignments, and recent class
                messages as context.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-lg border bg-background px-3 py-2 text-left text-xs leading-5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <Card
                  className={cn(
                    "max-w-[85%]",
                    message.role === "user"
                      ? "border-primary/20 bg-primary text-primary-foreground"
                      : "bg-background",
                  )}
                >
                  <CardContent className="p-3">
                    {message.role === "assistant" ? (
                      <MarkdownContent content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.content}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
            {isSending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {errorMessage ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={submitQuestion} className="mt-4 flex gap-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask for an explanation, study plan, quiz, or hint..."
          className="min-h-12 resize-none"
          rows={2}
          disabled={isSending}
        />
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12 shrink-0"
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
