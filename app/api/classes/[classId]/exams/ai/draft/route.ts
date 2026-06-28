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

    const classContext = await loadClassAiContext({
      classId,
      supabase,
      ensureMaterialContent: true,
    })
    const classContextText = formatClassContext({
      classRow: access.classRow,
      context: classContext,
    })
    const existingQuestionsText = formatExistingQuestions(
      body?.existingQuestions,
    )
    const rawDraft = await generateAiText({
      temperature: mode === "full_exam" ? 0.45 : 0.5,
      maxTokens: 2200,
      messages: [
        {
          role: "system",
          content: [
            "You help teachers create exam drafts.",
            "Return only valid JSON. Do not include markdown fences or commentary.",
            "The JSON object must have title, durationMinutes, and questions.",
            "Questions must be a non-empty array of complete objects with type, prompt, points, options, and correctAnswer.",
            "Allowed question types are mcq and short.",
            "For mcq questions, include 3-5 real answer options and correctAnswer as the 1-based option number.",
            "Do not use placeholder options such as Option A, Option B, or generic choices.",
            "For short questions, include correctAnswer as a concise model answer string or null for manual grading.",
            "Each prompt must be a student-facing exam question, not a summary of the teacher request.",
            "Follow the teacher's requested format and question intent.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            classContextText,
            "",
            `Mode: ${mode}`,
            `Teacher request: ${prompt || "Generate useful exam questions for the current draft."}`,
            `Current title: ${title || "Untitled"}`,
            `Current duration minutes: ${
              Number.isFinite(durationMinutes) ? durationMinutes : "Not set"
            }`,
            "Existing questions:",
            existingQuestionsText,
            "",
            "Required JSON shape:",
            JSON.stringify({
              title: "Student-facing exam title",
              durationMinutes: 60,
              questions: [
                {
                  type: "mcq",
                  prompt: "Student-facing question text",
                  points: 10,
                  options: ["Answer choice 1", "Answer choice 2"],
                  correctAnswer: 1,
                },
                {
                  type: "short",
                  prompt: "Student-facing question text",
                  points: 10,
                  options: [],
                  correctAnswer: "Concise model answer",
                },
              ],
            }),
          ].join("\n"),
        },
      ],
    })
    const parsed = parseJsonObject<AiExamDraft>(rawDraft)
    let draft = normalizeExamDraft(parsed, {
      fallbackTitle: title || prompt || "AI generated exam",
      fallbackDurationMinutes: Number.isFinite(durationMinutes)
        ? durationMinutes
        : 60,
    })

    if (shouldRepairExamDraft({ draft, prompt })) {
      const repairedText = await generateAiText({
        temperature: 0.25,
        maxTokens: 2400,
        messages: [
          {
            role: "system",
            content: [
              "Repair an exam draft JSON object.",
              "Return only valid JSON with title, durationMinutes, and questions.",
              "Questions must be complete student-facing exam questions.",
              "Do not echo the teacher request.",
              "Do not include placeholder options.",
              "Preserve the teacher's requested format and question intent.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              classContextText,
              "",
              `Mode: ${mode}`,
              `Teacher request: ${prompt || "Generate useful exam questions for the current draft."}`,
              `Current title: ${title || "Untitled"}`,
              `Current duration minutes: ${
                Number.isFinite(durationMinutes) ? durationMinutes : "Not set"
              }`,
              "Existing questions:",
              existingQuestionsText,
              "",
              "Previous invalid draft:",
              JSON.stringify(draft),
            ].join("\n"),
          },
        ],
      })
      const repairedDraft = normalizeExamDraft(parseJsonObject(repairedText), {
        fallbackTitle: title || prompt || "AI generated exam",
        fallbackDurationMinutes: Number.isFinite(durationMinutes)
          ? durationMinutes
          : 60,
      })

      if (
        !shouldRepairExamDraft({
          draft: repairedDraft,
          prompt,
        })
      ) {
        draft = repairedDraft
      }
    }

    if (shouldRepairExamDraft({ draft, prompt })) {
      throw new Error("AI did not return a usable exam draft.")
    }

    return NextResponse.json({ draft })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

function shouldRepairExamDraft({
  draft,
  prompt,
}: {
  draft: ReturnType<typeof normalizeExamDraft>
  prompt: string
}) {
  if (draft.questions.length === 0) return true

  return draft.questions.some((question) => {
    if (!question.prompt.trim()) return true
    if (isPromptEcho(prompt, question.prompt)) return true

    if (question.type === "mcq") {
      return (
        question.options.length < 2 ||
        question.options.some((option) => /^option\s+[a-z]$/i.test(option)) ||
        typeof question.correctAnswer !== "number"
      )
    }

    return false
  })
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

function isPromptEcho(prompt: string, output: string) {
  const normalizedPrompt = normalizeComparableText(prompt)
  const normalizedOutput = normalizeComparableText(output)

  return (
    normalizedPrompt.length > 20 &&
    (normalizedOutput === normalizedPrompt ||
      normalizedOutput.includes(normalizedPrompt))
  )
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
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
    questions,
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
  const safeOptions = options.length >= 2 ? options : []
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
