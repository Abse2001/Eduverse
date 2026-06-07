import { NextResponse } from "next/server"
import { loadAiClassAccess } from "@/lib/ai/class-context"
import { generateAiText } from "@/lib/ai/openrouter"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{
    classId: string
    assignmentId: string
    submissionId: string
  }>
}

type AssignmentRow = {
  title: string
  description: string
  max_score: number
}

type SubmissionRow = {
  text_response: string | null
  file_original_filename: string | null
  score: number | null
  feedback: string
}

export async function POST(request: Request, context: RouteContext) {
  const { classId, assignmentId, submissionId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    score?: unknown
  } | null

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
        { error: "Only teachers and admins can draft feedback." },
        { status: 403 },
      )
    }

    const [assignmentResult, submissionResult] = await Promise.all([
      supabase
        .from("class_assignments")
        .select("title, description, max_score")
        .eq("id", assignmentId)
        .eq("class_id", classId)
        .maybeSingle(),
      supabase
        .from("class_assignment_submissions")
        .select("text_response, file_original_filename, score, feedback")
        .eq("id", submissionId)
        .eq("assignment_id", assignmentId)
        .eq("class_id", classId)
        .maybeSingle(),
    ])

    if (assignmentResult.error) throw assignmentResult.error
    if (submissionResult.error) throw submissionResult.error

    const assignment = assignmentResult.data as AssignmentRow | null
    const submission = submissionResult.data as SubmissionRow | null

    if (!assignment || !submission) {
      return NextResponse.json(
        { error: "Assignment submission not found." },
        { status: 404 },
      )
    }

    const requestedScore =
      typeof body?.score === "number"
        ? body.score
        : Number.parseFloat(String(body?.score ?? ""))
    const score = Number.isFinite(requestedScore)
      ? requestedScore
      : submission.score
    const feedback = await generateAiText({
      temperature: 0.35,
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content: [
            "You draft teacher feedback for a student submission.",
            "Be specific, encouraging, and concise.",
            "Mention strengths, one or two improvements, and a next step.",
            "Do not invent details beyond the assignment and visible submission text.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Class: ${access.classRow.name}`,
            `Assignment: ${assignment.title}`,
            `Instructions: ${assignment.description || "No instructions"}`,
            `Max score: ${assignment.max_score}`,
            `Current score: ${score ?? "Not set"}`,
            `Attached file: ${submission.file_original_filename ?? "None"}`,
            "",
            "Student text response:",
            submission.text_response || "No text response was provided.",
            "",
            "Existing feedback:",
            submission.feedback || "None",
          ].join("\n"),
        },
      ],
    })

    return NextResponse.json({ feedback })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI request failed." },
      { status: 500 },
    )
  }
}
