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

type AssignmentDraft = {
  title: string
  description: string
  maxScore: number
  allowTextSubmission: boolean
  allowFileSubmission: boolean
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    prompt?: unknown
  } | null
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""

  if (!prompt) {
    return NextResponse.json(
      { error: "Describe the assignment you want to create." },
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
        { error: "Only teachers and admins can draft assignments." },
        { status: 403 },
      )
    }

    const classContext = await loadClassAiContext({ classId, supabase })
    const text = await generateAiText({
      temperature: 0.45,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content: [
            "You help teachers create assignments.",
            "Return only a JSON object with title, description, maxScore, allowTextSubmission, allowFileSubmission.",
            "The description should include student instructions and a short rubric.",
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
            `Teacher request: ${prompt}`,
          ].join("\n"),
        },
      ],
    })
    const parsed = parseJsonObject<Partial<AssignmentDraft>>(text)
    const draft = normalizeDraft(parsed, prompt)

    return NextResponse.json({ draft })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

function normalizeDraft(
  draft: Partial<AssignmentDraft> | null,
  fallbackPrompt: string,
): AssignmentDraft {
  const title =
    typeof draft?.title === "string" && draft.title.trim()
      ? draft.title.trim()
      : fallbackPrompt.slice(0, 80)
  const description =
    typeof draft?.description === "string" && draft.description.trim()
      ? draft.description.trim()
      : fallbackPrompt
  const maxScore =
    typeof draft?.maxScore === "number" && draft.maxScore > 0
      ? draft.maxScore
      : 100

  return {
    title,
    description,
    maxScore,
    allowTextSubmission: draft?.allowTextSubmission !== false,
    allowFileSubmission: draft?.allowFileSubmission === true,
  }
}
