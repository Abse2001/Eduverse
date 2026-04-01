"use client"

import { use, useState, useEffect, useCallback } from "react"
import { getClassById, EXAMS, Exam, ExamQuestion } from "@/lib/mock-data"
import { useApp } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"
import dynamic from "next/dynamic"
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Code2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Send,
  RotateCcw,
  Trophy,
  List,
} from "lucide-react"
import { cn } from "@/lib/utils"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

export default function ExamPage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { currentUser } = useApp()
  const cls = getClassById(classId)
  const exam = EXAMS.find((e) => e.classId === classId)

  const [started, setStarted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!exam) return
    setTimeLeft(exam.durationMinutes * 60)
  }, [exam])

  useEffect(() => {
    if (!started || submitted || timeLeft <= 0) return
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer)
          handleSubmit()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, submitted])

  const handleSubmit = useCallback(() => {
    setSubmitted(true)
  }, [])

  if (!cls || !exam) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-muted-foreground" />
        <p className="text-lg font-semibold text-foreground">
          No exam available
        </p>
        <p className="text-sm text-muted-foreground">
          There is no active exam for this class.
        </p>
      </div>
    )
  }

  if (submitted) return <ExamResults exam={exam} answers={answers} />
  if (!started)
    return <ExamLobby exam={exam} cls={cls} onStart={() => setStarted(true)} />

  const question = exam.questions[currentQ]
  const totalQ = exam.questions.length
  const answered = Object.keys(answers).length
  const progress = Math.round((answered / totalQ) * 100)
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, "0")
  const secs = String(timeLeft % 60).padStart(2, "0")
  const timeWarning = timeLeft < 300

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Exam top bar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-card shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm truncate">
            {exam.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {cls.code} &middot; {totalQ} questions &middot; {exam.totalPoints}{" "}
            pts
          </p>
        </div>
        <Progress value={progress} className="w-32 h-1.5 hidden md:block" />
        <span className="text-xs text-muted-foreground hidden md:block">
          {answered}/{totalQ} answered
        </span>
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm font-semibold",
            timeWarning
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-foreground",
          )}
        >
          <Clock
            className={cn("w-3.5 h-3.5", timeWarning && "animate-pulse")}
          />
          {mins}:{secs}
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={handleSubmit}>
          <Send className="w-3.5 h-3.5" />
          Submit Exam
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question navigator sidebar */}
        <div className="w-48 border-r border-border bg-card p-3 flex flex-col gap-3 shrink-0 hidden md:flex">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Questions
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {exam.questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentQ(i)}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-semibold transition-colors",
                  i === currentQ
                    ? "bg-primary text-primary-foreground"
                    : answers[q.id] !== undefined
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mt-auto space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded bg-primary inline-block" />{" "}
              Current
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30 inline-block" />{" "}
              Answered
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded bg-muted inline-block" />{" "}
              Unanswered
            </div>
          </div>
        </div>

        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-6">
          <QuestionView
            question={question}
            index={currentQ}
            totalQ={totalQ}
            answer={answers[question.id]}
            onAnswer={(val) =>
              setAnswers((prev) => ({ ...prev, [question.id]: val }))
            }
          />
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={currentQ === 0}
              onClick={() => setCurrentQ((q) => q - 1)}
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            {currentQ < totalQ - 1 ? (
              <Button
                size="sm"
                onClick={() => setCurrentQ((q) => q + 1)}
                className="gap-1.5"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={handleSubmit}>
                <Send className="w-3.5 h-3.5" />
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuestionView({
  question: q,
  index,
  totalQ,
  answer,
  onAnswer,
}: {
  question: ExamQuestion
  index: number
  totalQ: number
  answer: string | number | undefined
  onAnswer: (val: string | number) => void
}) {
  const TYPE_LABELS: Record<string, string> = {
    mcq: "Multiple Choice",
    short: "Short Answer",
    code: "Code",
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Question header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Question {index + 1} of {totalQ}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] border-0",
              q.type === "mcq" &&
                "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
              q.type === "short" &&
                "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
              q.type === "code" &&
                "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
            )}
          >
            {q.type === "code" && <Code2 className="w-2.5 h-2.5 mr-1" />}
            {TYPE_LABELS[q.type]}
          </Badge>
          <span className="text-xs text-muted-foreground">{q.points} pts</span>
        </div>
      </div>

      <p className="text-base font-medium text-foreground leading-relaxed">
        {q.question}
      </p>

      {/* MCQ */}
      {q.type === "mcq" && q.options && (
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onAnswer(i)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all",
                answer === i
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card hover:border-primary/50 hover:bg-accent/50 text-foreground",
              )}
            >
              <span
                className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold",
                  answer === i
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Short answer */}
      {q.type === "short" && (
        <textarea
          value={(answer as string) ?? ""}
          onChange={(e) => onAnswer(e.target.value)}
          placeholder="Type your answer here..."
          rows={5}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none leading-relaxed"
        />
      )}

      {/* Code question */}
      {q.type === "code" && (
        <div className="rounded-xl overflow-hidden border border-border">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              {q.language ?? "python"}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              Starter code provided
            </span>
          </div>
          <MonacoEditor
            height="280px"
            language={q.language ?? "python"}
            theme="vs-dark"
            value={(answer as string) ?? q.starterCode ?? ""}
            onChange={(val) => onAnswer(val ?? "")}
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
      )}
    </div>
  )
}

function ExamLobby({
  exam,
  cls,
  onStart,
}: {
  exam: Exam
  cls: { name: string; code: string }
  onStart: () => void
}) {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-6 max-w-lg mx-auto pt-20">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <BookOpen className="w-8 h-8 text-primary" />
      </div>
      <div className="text-center space-y-1">
        <Badge
          variant="secondary"
          className={cn(
            "mb-2",
            exam.status === "live" &&
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
            exam.status === "upcoming" &&
              "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
          )}
        >
          {exam.status === "live"
            ? "In Progress"
            : exam.status === "upcoming"
              ? "Upcoming"
              : "Ended"}
        </Badge>
        <h1 className="text-2xl font-bold text-foreground text-balance">
          {exam.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {cls.name} &middot; {cls.code}
        </p>
      </div>
      <Card className="w-full">
        <CardContent className="p-4 grid grid-cols-3 divide-x divide-border text-center">
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {exam.questions.length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Questions</p>
          </div>
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {exam.durationMinutes}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Minutes</p>
          </div>
          <div className="px-4">
            <p className="text-2xl font-bold text-foreground">
              {exam.totalPoints}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Total pts</p>
          </div>
        </CardContent>
      </Card>
      <div className="w-full space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground text-center text-sm">
          Before you begin:
        </p>
        {[
          "Once started, the timer cannot be paused.",
          "Code questions include starter code — edit as needed.",
          "All answers are auto-saved as you type.",
          "Submit before time runs out or it submits automatically.",
        ].map((note, i) => (
          <div key={i} className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
            <span>{note}</span>
          </div>
        ))}
      </div>
      <Button
        size="lg"
        className="w-full"
        onClick={onStart}
        disabled={exam.status === "upcoming"}
      >
        {exam.status === "upcoming" ? "Exam not started yet" : "Begin Exam"}
      </Button>
    </div>
  )
}

function ExamResults({
  exam,
  answers,
}: {
  exam: Exam
  answers: Record<string, string | number>
}) {
  const mcqScore = exam.questions
    .filter((q) => q.type === "mcq")
    .reduce(
      (sum, q) => (answers[q.id] === q.correctIndex ? sum + q.points : sum),
      0,
    )
  const maxMcq = exam.questions
    .filter((q) => q.type === "mcq")
    .reduce((s, q) => s + q.points, 0)
  const pending = exam.questions
    .filter((q) => q.type !== "mcq")
    .reduce((s, q) => s + q.points, 0)
  const pct = Math.round((mcqScore / exam.totalPoints) * 100)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Exam Submitted!</h1>
        <p className="text-muted-foreground text-sm max-w-sm">
          Your exam has been submitted successfully. Auto-graded results are
          shown below.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 grid grid-cols-3 divide-x divide-border text-center">
          <div className="px-4">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {mcqScore}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">MCQ Score</p>
          </div>
          <div className="px-4">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {pending}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pending Review
            </p>
          </div>
          <div className="px-4">
            <p className="text-3xl font-bold text-primary">{pct}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">MCQ %</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Answer Summary</h2>
        {exam.questions.map((q, i) => {
          const a = answers[q.id]
          const correct = q.type === "mcq" ? a === q.correctIndex : null
          return (
            <Card
              key={q.id}
              className={cn(
                "border",
                correct === true &&
                  "border-emerald-200 dark:border-emerald-800",
                correct === false && "border-destructive/30",
              )}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                    correct === true
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : correct === false
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                  )}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium leading-snug">
                    {q.question}
                  </p>
                  {q.type === "mcq" && (
                    <div className="mt-1.5 space-y-0.5">
                      {a !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Your answer:{" "}
                          <span
                            className={cn(
                              "font-medium",
                              correct
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-destructive",
                            )}
                          >
                            {q.options?.[a as number]}
                          </span>
                        </p>
                      )}
                      {correct === false && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Correct: {q.options?.[q.correctIndex!]}
                        </p>
                      )}
                    </div>
                  )}
                  {q.type !== "mcq" && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 mt-1"
                    >
                      Pending teacher review
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0">
                  {q.points} pts
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
