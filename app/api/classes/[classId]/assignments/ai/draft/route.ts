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

    const classContext = await loadClassAiContext({
      classId,
      supabase,
      ensureMaterialContent: true,
    })
    const classContextText = formatClassContext({
      classRow: access.classRow,
      context: classContext,
    })
    const text = await generateAiText({
      temperature: 0.45,
      maxTokens: 1600,
      messages: [
        {
          role: "system",
          content: [
            "You help teachers create assignments.",
            "Return only a JSON object with title, description, maxScore, allowTextSubmission, allowFileSubmission.",
            "The description is the only student-visible assignment body.",
            "Format description as markdown using these exact headings: ## Instructions, ## Questions or Tasks, ## Rubric.",
            "The Questions or Tasks section must contain the actual student-facing questions or tasks as a numbered or bulleted list.",
            "Do not say questions follow unless the questions are actually listed in the description.",
            "Use extracted material content when the teacher asks for material-based questions.",
            "Do not include markdown fences or extra commentary.",
          ].join(" "),
        },
        {
          role: "user",
          content: [classContextText, "", `Teacher request: ${prompt}`].join(
            "\n",
          ),
        },
      ],
    })
    const parsed = parseJsonObject<Partial<AssignmentDraft>>(text)
    let draft = normalizeDraft(parsed, prompt)

    if (shouldRepairAssignmentDraft(prompt, draft)) {
      const repairedText = await generateAiText({
        temperature: 0.25,
        maxTokens: 1800,
        messages: [
          {
            role: "system",
            content: [
              "Repair an assignment draft JSON object.",
              "Return only a JSON object with title, description, maxScore, allowTextSubmission, allowFileSubmission.",
              "The previous draft did not follow the required student-visible format.",
              "The description must be markdown using these exact headings: ## Instructions, ## Questions or Tasks, ## Rubric.",
              "The Questions or Tasks section must list the actual student-facing questions or tasks directly as numbered or bulleted items.",
              "Use extracted class material content for material-based questions.",
              "Do not include placeholders, references to missing questions, markdown fences, or extra commentary.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              classContextText,
              "",
              `Teacher request: ${prompt}`,
              "",
              "Previous incomplete draft:",
              JSON.stringify(draft),
            ].join("\n"),
          },
        ],
      })
      const repairedDraft = normalizeDraft(
        parseJsonObject<Partial<AssignmentDraft>>(repairedText),
        prompt,
      )

      if (!shouldRepairAssignmentDraft(prompt, repairedDraft)) {
        draft = repairedDraft
      }
    }

    if (shouldRepairAssignmentDraft(prompt, draft)) {
      throw new Error("AI did not return a usable assignment draft.")
    }

    return NextResponse.json({ draft })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}

function shouldRepairAssignmentDraft(prompt: string, draft: AssignmentDraft) {
  if (!draft.description.trim()) return true
  if (isPromptEcho(prompt, draft.description)) return true
  if (!hasRequiredAssignmentDescriptionFormat(draft.description)) return true
  if (!hasQuestionsOrTasksList(draft.description)) return true

  return false
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

function hasRequiredAssignmentDescriptionFormat(description: string) {
  return (
    hasMarkdownHeading(description, "Instructions") &&
    (hasMarkdownHeading(description, "Questions") ||
      hasMarkdownHeading(description, "Tasks") ||
      hasMarkdownHeading(description, "Questions or Tasks")) &&
    hasMarkdownHeading(description, "Rubric")
  )
}

function hasMarkdownHeading(description: string, heading: string) {
  return new RegExp(
    `(^|\\n)#{1,3}\\s+${escapeRegExp(heading)}\\s*:?`,
    "i",
  ).test(description)
}

function hasQuestionsOrTasksList(description: string) {
  const sectionMatch = description.match(
    /(^|\n)#{1,3}\s+(questions(?:\s+or\s+tasks)?|tasks)\s*:?\s*\n([\s\S]*?)(?=\n#{1,3}\s+|\s*$)/i,
  )
  if (!sectionMatch?.[3]) return false

  return sectionMatch[3]
    .split(/\n+/)
    .some((line) => /^(\s*(\d+[\).:]|[-*])\s+\S+)/.test(line))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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
      : ""
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
