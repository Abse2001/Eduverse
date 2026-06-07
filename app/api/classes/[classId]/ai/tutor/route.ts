import { NextResponse } from "next/server"
import {
  formatClassContext,
  loadAiClassAccess,
  loadClassAiContext,
} from "@/lib/ai/class-context"
import { generateAiText, type AiChatMessage } from "@/lib/ai/openrouter"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    question?: unknown
    messages?: unknown
  } | null
  const question =
    typeof body?.question === "string" ? body.question.trim() : ""

  if (!question) {
    return NextResponse.json(
      { error: "A question is required." },
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

    const classContext = await loadClassAiContext({ classId, supabase })
    const priorMessages = parsePriorMessages(body?.messages)
    const answer = await generateAiText({
      temperature: 0.35,
      maxTokens: 900,
      messages: [
        {
          role: "system",
          content: [
            "You are Eduverse AI Tutor, a helpful learning assistant inside a class workspace.",
            "Use the provided class context when it is relevant.",
            `The current user role is ${access.role}.`,
            "For students, use hint-first tutoring: explain concepts, ask guiding questions, and show small examples without handing over direct final answers to active assignments or exams.",
            "For teachers/admins, help with planning, clarification, and classroom support.",
            "If the class context does not contain enough information, say what is missing and answer from general knowledge carefully.",
            "Do not request or expose personal, confidential, or sensitive information.",
          ].join(" "),
        },
        {
          role: "user",
          content: formatClassContext({
            classRow: access.classRow,
            context: classContext,
          }),
        },
        ...priorMessages,
        { role: "user", content: question },
      ],
    })

    return NextResponse.json({ answer })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

function parsePriorMessages(value: unknown): AiChatMessage[] {
  if (!Array.isArray(value)) return []

  return value
    .flatMap((message): AiChatMessage[] => {
      if (!message || typeof message !== "object") return []
      const role = "role" in message ? message.role : null
      const content = "content" in message ? message.content : null
      if (
        (role !== "user" && role !== "assistant") ||
        typeof content !== "string" ||
        !content.trim()
      ) {
        return []
      }

      return [{ role, content: content.trim().slice(0, 3000) }]
    })
    .slice(-8)
}
