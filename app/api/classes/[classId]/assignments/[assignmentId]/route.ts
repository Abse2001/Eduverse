import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; assignmentId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { classId, assignmentId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const assignment = await loadAssignmentForManager(
    supabase,
    classId,
    assignmentId,
  )
  if ("response" in assignment) return assignment.response

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const update: Record<string, unknown> = {}

  if (!body) {
    return NextResponse.json(
      { error: "Assignment details are required." },
      { status: 400 },
    )
  }

  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title)
      return NextResponse.json(
        { error: "A title is required." },
        { status: 400 },
      )
    update.title = title
  }

  if ("description" in body) {
    update.description =
      typeof body.description === "string" ? body.description.trim() : ""
  }

  if ("dueAt" in body) {
    const dueAt = typeof body.dueAt === "string" ? body.dueAt : ""
    const dueTime = Date.parse(dueAt)
    if (!Number.isFinite(dueTime)) {
      return NextResponse.json(
        { error: "A valid due date is required." },
        { status: 400 },
      )
    }
    update.due_at = new Date(dueTime).toISOString()
  }

  if ("maxScore" in body) {
    const maxScore =
      typeof body.maxScore === "number"
        ? body.maxScore
        : Number.parseFloat(String(body.maxScore ?? ""))
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      return NextResponse.json(
        { error: "Max score must be greater than zero." },
        { status: 400 },
      )
    }
    update.max_score = maxScore
  }

  if ("status" in body) {
    if (body.status !== "draft" && body.status !== "published") {
      return NextResponse.json(
        { error: "Assignment status must be draft or published." },
        { status: 400 },
      )
    }
    update.status = body.status
  }

  if ("allowLateSubmissions" in body) {
    update.allow_late_submissions = body.allowLateSubmissions !== false
  }

  const nextAllowText =
    "allowTextSubmission" in body
      ? body.allowTextSubmission !== false
      : assignment.assignment.allow_text_submission
  const nextAllowFile =
    "allowFileSubmission" in body
      ? body.allowFileSubmission === true
      : assignment.assignment.allow_file_submission

  if (!nextAllowText && !nextAllowFile) {
    return NextResponse.json(
      { error: "Enable at least one submission mode." },
      { status: 400 },
    )
  }

  if ("allowTextSubmission" in body)
    update.allow_text_submission = nextAllowText
  if ("allowFileSubmission" in body)
    update.allow_file_submission = nextAllowFile

  const { data, error } = await supabase
    .from("class_assignments")
    .update(update)
    .eq("id", assignmentId)
    .eq("class_id", classId)
    .select(
      "id, organization_id, class_id, created_by_user_id, title, description, due_at, max_score, status, allow_late_submissions, allow_text_submission, allow_file_submission, created_at, updated_at",
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    assignment: toAssignmentResponse(data as AssignmentRow),
  })
}

export async function DELETE(request: Request, context: RouteContext) {
  const { classId, assignmentId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const assignment = await loadAssignmentForManager(
    supabase,
    classId,
    assignmentId,
  )
  if ("response" in assignment) return assignment.response

  const { error } = await supabase.rpc("soft_delete_class_assignment", {
    target_class_id: classId,
    target_assignment_id: assignmentId,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
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

async function loadAssignmentForManager(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireRouteUser>>["supabase"]
  >,
  classId: string,
  assignmentId: string,
) {
  const { data: assignment, error } = await supabase
    .from("class_assignments")
    .select(
      "id, organization_id, class_id, allow_text_submission, allow_file_submission",
    )
    .eq("id", assignmentId)
    .eq("class_id", classId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) {
    return {
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }

  if (!assignment) {
    return {
      response: NextResponse.json(
        { error: "Assignment not found." },
        { status: 404 },
      ),
    }
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: assignment.organization_id,
      target_class_id: assignment.class_id,
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

  return {
    assignment: assignment as {
      id: string
      organization_id: string
      class_id: string
      allow_text_submission: boolean
      allow_file_submission: boolean
    },
  }
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
