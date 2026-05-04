import { NextResponse } from "next/server"
import { notificationHref, sendNotification } from "@/lib/api/notifications"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type AssignmentRow = {
  id: string
  organization_id: string
  class_id: string
  created_by_user_id: string
  title: string
  description: string
  due_at: string
  max_score: number
  status: "draft" | "published"
  allow_late_submissions: boolean
  allow_text_submission: boolean
  allow_file_submission: boolean
  created_at: string
  updated_at: string
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown
    description?: unknown
    dueAt?: unknown
    maxScore?: unknown
    status?: unknown
    allowLateSubmissions?: unknown
    allowTextSubmission?: unknown
    allowFileSubmission?: unknown
  } | null
  const validated = validateAssignmentInput(body)

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const classResult = await loadClassForManager(supabase, classId)
  if ("response" in classResult) return classResult.response

  const { data, error } = await supabase
    .from("class_assignments")
    .insert({
      organization_id: classResult.classRow.organization_id,
      class_id: classResult.classRow.id,
      created_by_user_id: user.id,
      title: validated.title,
      description: validated.description,
      due_at: validated.dueAt,
      max_score: validated.maxScore,
      status: validated.status,
      allow_late_submissions: validated.allowLateSubmissions,
      allow_text_submission: validated.allowTextSubmission,
      allow_file_submission: validated.allowFileSubmission,
    })
    .select(
      "id, organization_id, class_id, created_by_user_id, title, description, due_at, max_score, status, allow_late_submissions, allow_text_submission, allow_file_submission, created_at, updated_at",
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (validated.status === "published") {
    await sendNotification({
      supabase,
      organizationId: classResult.classRow.organization_id,
      actorUserId: user.id,
      target: { type: "class", classId: classResult.classRow.id },
      notificationType: "assignment_published",
      title: "New assignment published",
      body: validated.title,
      href: notificationHref({
        classId: classResult.classRow.id,
        section: "assignments",
        itemId: data.id,
      }),
      metadata: {
        assignmentId: data.id,
        dueAt: validated.dueAt,
      },
      eventKey: `assignment_published:${data.id}`,
    }).catch(() => null)
  }

  return NextResponse.json({
    assignment: toAssignmentResponse(data as AssignmentRow),
  })
}

function validateAssignmentInput(
  body: {
    title?: unknown
    description?: unknown
    dueAt?: unknown
    maxScore?: unknown
    status?: unknown
    allowLateSubmissions?: unknown
    allowTextSubmission?: unknown
    allowFileSubmission?: unknown
  } | null,
) {
  if (!body) return { error: "Assignment details are required." }

  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description =
    typeof body.description === "string" ? body.description.trim() : ""
  const dueAt = typeof body.dueAt === "string" ? body.dueAt : ""
  const dueTime = Date.parse(dueAt)
  const maxScore =
    typeof body.maxScore === "number"
      ? body.maxScore
      : Number.parseFloat(String(body.maxScore ?? ""))
  const status = body.status === "published" ? "published" : "draft"
  const allowLateSubmissions = body.allowLateSubmissions !== false
  const allowTextSubmission = body.allowTextSubmission !== false
  const allowFileSubmission = body.allowFileSubmission === true

  if (!title) return { error: "A title is required." }
  if (!Number.isFinite(dueTime))
    return { error: "A valid due date is required." }
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { error: "Max score must be greater than zero." }
  }
  if (!allowTextSubmission && !allowFileSubmission) {
    return { error: "Enable at least one submission mode." }
  }

  return {
    title,
    description,
    dueAt: new Date(dueTime).toISOString(),
    maxScore,
    status,
    allowLateSubmissions,
    allowTextSubmission,
    allowFileSubmission,
  }
}

async function loadClassForManager(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireRouteUser>>["supabase"]
  >,
  classId: string,
) {
  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return {
      response: NextResponse.json(
        { error: classError.message },
        { status: 500 },
      ),
    }
  }

  if (!classRow) {
    return {
      response: NextResponse.json(
        { error: "Class not found." },
        { status: 404 },
      ),
    }
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: classRow.organization_id,
      target_class_id: classRow.id,
    },
  )

  if (permissionError) {
    return {
      response: NextResponse.json(
        { error: permissionError.message },
        { status: 500 },
      ),
    }
  }

  if (!canManage) {
    return {
      response: NextResponse.json(
        {
          error:
            "Only class teachers and organization admins can manage assignments.",
        },
        { status: 403 },
      ),
    }
  }

  return { classRow: classRow as { id: string; organization_id: string } }
}

function toAssignmentResponse(row: AssignmentRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    maxScore: Number(row.max_score),
    status: row.status,
    allowLateSubmissions: row.allow_late_submissions,
    allowTextSubmission: row.allow_text_submission,
    allowFileSubmission: row.allow_file_submission,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
