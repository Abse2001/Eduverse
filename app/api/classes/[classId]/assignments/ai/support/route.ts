import { NextResponse } from "next/server"
import {
  formatClassContext,
  loadAiClassAccess,
  loadClassAiContext,
} from "@/lib/ai/class-context"
import { generateAiText } from "@/lib/ai/openrouter"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type SupportMode = "rubric" | "alternate_questions"

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown
    title?: unknown
    description?: unknown
    maxScore?: unknown
  } | null
  const mode = parseSupportMode(body?.mode)
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const description =
    typeof body?.description === "string" ? body.description.trim() : ""
  const maxScore =
    typeof body?.maxScore === "number"
      ? body.maxScore
      : Number.parseFloat(String(body?.maxScore ?? ""))

  if (!mode) {
    return NextResponse.json(
      { error: "Choose rubric or alternate questions." },
      { status: 400 },
    )
  }

  if (!title && !description) {
    return NextResponse.json(
      { error: "Add a title or notes before generating support." },
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
        { error: "Only teachers and admins can use assignment AI tools." },
        { status: 403 },
      )
    }

    const classContext = await loadClassAiContext({ classId, supabase })
    const content = await generateAiText({
      temperature: mode === "rubric" ? 0.25 : 0.5,
      maxTokens: 700,
      messages: [
        {
          role: "system",
          content: getSystemPrompt(mode),
        },
        {
          role: "user",
          content: [
            formatClassContext({
              classRow: access.classRow,
              context: classContext,
            }),
            "",
            "Assignment draft:",
            `Title: ${title || "Untitled"}`,
            `Max score: ${Number.isFinite(maxScore) ? maxScore : "Not set"}`,
            `Notes: ${description || "No notes yet"}`,
          ].join("\n"),
        },
      ],
    })

    return NextResponse.json({ content })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

function parseSupportMode(value: unknown): SupportMode | null {
  if (value === "rubric" || value === "alternate_questions") return value
  return null
}

function getSystemPrompt(mode: SupportMode) {
  if (mode === "rubric") {
    return [
      "You help teachers write assignment rubrics.",
      "Return concise markdown headed 'Rubric'.",
      "Include 3-5 criteria, point allocations that match the max score when provided, and short performance descriptions.",
      "Do not include extra commentary.",
    ].join(" ")
  }

  return [
    "You help teachers create alternate assignment questions.",
    "Return concise markdown headed 'Alternate Questions'.",
    "Create 3-5 alternate prompts or variants with difficulty labels and brief answer expectations.",
    "Keep them aligned to the assignment goals and suitable for the class.",
    "Do not include extra commentary.",
  ].join(" ")
}
