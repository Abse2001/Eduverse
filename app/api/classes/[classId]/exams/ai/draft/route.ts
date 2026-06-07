import { NextResponse } from "next/server"
import {
  formatClassContext,
  loadAiClassAccess,
  loadClassAiContext,
} from "@/lib/ai/class-context"
import { generateAiText, parseJsonObject } from "@/lib/ai/openrouter"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type ExamDraftMode = "full_exam" | "questions"

type AiExamQuestion = {
  type: "mcq" | "short"
  prompt: string
  points: number
  options?: string[]
  correctAnswer?: string | number | null
}

type AiExamDraft = {
  title?: string
  durationMinutes?: number
  questions?: AiExamQuestion[]
}

type NormalizedExamQuestion = {
  type: "mcq" | "short"
  prompt: string
  points: number
  options: string[]
  correctAnswer: string | number | null
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown
    prompt?: unknown
    title?: unknown
    durationMinutes?: unknown
    existingQuestions?: unknown
  } | null
  const mode = parseMode(body?.mode)
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const durationMinutes =
    typeof body?.durationMinutes === "number"
      ? body.durationMinutes
      : Number.parseInt(String(body?.durationMinutes ?? ""), 10)

  if (!mode) {
    return NextResponse.json(
      { error: "Choose full exam or questions mode." },
      { status: 400 },
    )
  }

  if (!prompt && mode === "full_exam") {
    return NextResponse.json(
      { error: "Describe the exam you want to create." },
      { status: 400 },
    )
  }

  try {
    const access = await loadAiClassAccess({ classId, supabase, user })
    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      )
    }
    if (!access.canManage) {
      return NextResponse.json(
        { error: "Only teachers and admins can draft exams." },
        { status: 403 },
      )
    }

    const classContext = await loadClassAiContext({ classId, supabase })
    const rawDraft = await generateAiText({
      temperature: mode === "full_exam" ? 0.45 : 0.5,
      maxTokens: 1400,
      messages: [
        {
          role: "system",
          content: [
            "You help teachers create exam drafts.",
            "Return only a JSON object with optional title, optional durationMinutes, and questions.",
            "Questions must be an array of objects with type, prompt, points, options, and correctAnswer.",
            "Allowed question types are mcq and short.",
            "For mcq questions, include 3-5 options and correctAnswer as the 1-based option number.",
            "For short questions, include correctAnswer as a concise model answer string or null for manual grading.",
            "Do not include markdown fences or extra commentary.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            formatClassContext({
              classRow: access.classRow,
              context: classContext,
            }),
            "",
            `Mode: ${mode}`,
            `Teacher request: ${prompt || "Generate useful exam questions for the current draft."}`,
            `Current title: ${title || "Untitled"}`,
            `Current duration minutes: ${
              Number.isFinite(durationMinutes) ? durationMinutes : "Not set"
            }`,
            "Existing questions:",
            formatExistingQuestions(body?.existingQuestions),
          ].join("\n"),
        },
      ],
    })
    const parsed = parseJsonObject<AiExamDraft>(rawDraft)
    const draft = normalizeExamDraft(parsed, {
      fallbackTitle: title || prompt || "AI generated exam",
      fallbackDurationMinutes: Number.isFinite(durationMinutes)
        ? durationMinutes
        : 60,
    })

    return NextResponse.json({ draft })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

function parseMode(value: unknown): ExamDraftMode | null {
  if (value === "full_exam" || value === "questions") return value
  return null
}

function formatExistingQuestions(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "- None"

  return value
    .slice(0, 12)
    .map((question, index) => {
      if (!question || typeof question !== "object") {
        return `- Question ${index + 1}: unavailable`
      }

      const prompt =
        "prompt" in question && typeof question.prompt === "string"
          ? question.prompt
          : "No prompt"
      const type =
        "type" in question && typeof question.type === "string"
          ? question.type
          : "unknown"

      return `- ${type}: ${prompt}`
    })
    .join("\n")
}

function normalizeExamDraft(
  draft: AiExamDraft | null,
  fallback: {
    fallbackTitle: string
    fallbackDurationMinutes: number
  },
) {
  const questions = Array.isArray(draft?.questions)
    ? draft.questions.flatMap(normalizeQuestion).slice(0, 20)
    : []

  return {
    title:
      typeof draft?.title === "string" && draft.title.trim()
        ? draft.title.trim()
        : fallback.fallbackTitle.slice(0, 100),
    durationMinutes:
      typeof draft?.durationMinutes === "number" && draft.durationMinutes > 0
        ? Math.round(draft.durationMinutes)
        : fallback.fallbackDurationMinutes,
    questions: questions.length > 0 ? questions : [fallbackQuestion()],
  }
}

function normalizeQuestion(question: AiExamQuestion): NormalizedExamQuestion[] {
  const type = question?.type === "short" ? "short" : "mcq"
  const prompt =
    typeof question?.prompt === "string" && question.prompt.trim()
      ? question.prompt.trim()
      : ""
  const points =
    typeof question?.points === "number" && question.points > 0
      ? Math.round(question.points)
      : 10

  if (!prompt) return []

  if (type === "short") {
    return [
      {
        type,
        prompt,
        points,
        options: [],
        correctAnswer:
          typeof question.correctAnswer === "string"
            ? question.correctAnswer
            : null,
      },
    ]
  }

  const options = Array.isArray(question.options)
    ? question.options
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim())
        .filter(Boolean)
        .slice(0, 5)
    : []
  const safeOptions =
    options.length >= 2 ? options : ["Option A", "Option B", "Option C"]
  const correctAnswer =
    typeof question.correctAnswer === "number" &&
    question.correctAnswer >= 1 &&
    question.correctAnswer <= safeOptions.length
      ? question.correctAnswer
      : 1

  return [
    {
      type,
      prompt,
      points,
      options: safeOptions,
      correctAnswer,
    },
  ]
}

function fallbackQuestion() {
  return {
    type: "short" as const,
    prompt: "Explain one key idea from the current class material.",
    points: 10,
    options: [],
    correctAnswer: null,
  }
}
