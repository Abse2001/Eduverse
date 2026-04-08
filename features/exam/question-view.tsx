"use client"

import dynamic from "next/dynamic"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Code2 } from "lucide-react"
import type { ExamQuestion } from "@/lib/mock-data"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

const TYPE_LABELS: Record<string, string> = {
  mcq: "Multiple Choice",
  short: "Short Answer",
  code: "Code",
}

interface QuestionViewProps {
  question: ExamQuestion
  index: number
  totalQuestions: number
  answer: string | number | undefined
  onAnswer: (value: string | number) => void
}

export function QuestionView({
  question,
  index,
  totalQuestions,
  answer,
  onAnswer,
}: QuestionViewProps) {
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Question {index + 1} of {totalQuestions}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] border-0",
              question.type === "mcq" &&
                "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
              question.type === "short" &&
                "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
              question.type === "code" &&
                "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
            )}
          >
            {question.type === "code" ? (
              <Code2 className="w-2.5 h-2.5 mr-1" />
            ) : null}
            {TYPE_LABELS[question.type]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {question.points} pts
          </span>
        </div>
      </div>

      <p className="text-base font-medium text-foreground leading-relaxed">
        {question.question}
      </p>

      {question.type === "mcq" && question.options ? (
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => (
            <button
              key={option}
              onClick={() => onAnswer(optionIndex)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all",
                answer === optionIndex
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card hover:border-primary/50 hover:bg-accent/50 text-foreground",
              )}
            >
              <span
                className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold",
                  answer === optionIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + optionIndex)}
              </span>
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {question.type === "short" ? (
        <textarea
          value={(answer as string) ?? ""}
          onChange={(event) => onAnswer(event.target.value)}
          placeholder="Type your answer here..."
          rows={5}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none leading-relaxed"
        />
      ) : null}

      {question.type === "code" ? (
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              {question.language ?? "python"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              Starter code provided
            </span>
          </div>
          <MonacoEditor
            height="280px"
            language={question.language ?? "python"}
            theme="vs-dark"
            value={(answer as string) ?? question.starterCode ?? ""}
            onChange={(value) => onAnswer(value ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "on",
              wordWrap: "on",
              padding: { top: 12, bottom: 12 },
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
