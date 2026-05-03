import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{
    classId: string
    assignmentId: string
    submissionId: string
  }>
}

type SubmissionRow = {
  id: string
  organization_id: string
  class_id: string
  assignment_id: string
  student_user_id: string
  text_response: string | null
  file_storage_bucket: string | null
  file_storage_key: string | null
  file_original_filename: string | null
  file_mime_type: string | null
  file_size_bytes: number | null
  submitted_at: string
  is_late: boolean
  score: number | null
  feedback: string
  graded_at: string | null
  graded_by_user_id: string | null
  created_at: string
  updated_at: string
}

export async function PATCH(request: Request, context: RouteContext) {
  const { classId, assignmentId, submissionId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    score?: unknown
    feedback?: unknown
  } | null
  const score =
    typeof body?.score === "number"
      ? body.score
      : Number.parseFloat(String(body?.score ?? ""))
  const feedback =
    typeof body?.feedback === "string" ? body.feedback.trim() : ""

  if (!Number.isFinite(score) || score < 0) {
    return NextResponse.json(
      { error: "Score must be zero or greater." },
      { status: 400 },
    )
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("class_assignments")
    .select("id, organization_id, class_id, max_score")
    .eq("id", assignmentId)
    .eq("class_id", classId)
    .is("deleted_at", null)
    .maybeSingle()

  if (assignmentError) {
    return NextResponse.json(
      { error: assignmentError.message },
      { status: 500 },
    )
  }

  if (!assignment) {
    return NextResponse.json(
      { error: "Assignment not found." },
      { status: 404 },
    )
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: assignment.organization_id,
      target_class_id: assignment.class_id,
    },
  )

  if (permissionError) {
    return NextResponse.json(
      { error: permissionError.message },
      { status: 500 },
    )
  }

  if (!canManage) {
    return NextResponse.json(
      {
        error:
          "Only class teachers and organization admins can grade assignments.",
      },
      { status: 403 },
    )
  }

  if (score > Number(assignment.max_score)) {
    return NextResponse.json(
      { error: "Score cannot exceed the assignment max score." },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from("class_assignment_submissions")
    .update({
      score,
      feedback,
      graded_at: new Date().toISOString(),
      graded_by_user_id: user.id,
    })
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId)
    .select(
      "id, organization_id, class_id, assignment_id, student_user_id, text_response, file_storage_bucket, file_storage_key, file_original_filename, file_mime_type, file_size_bytes, submitted_at, is_late, score, feedback, graded_at, graded_by_user_id, created_at, updated_at",
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    submission: toSubmissionResponse(data as SubmissionRow),
  })
}

function toSubmissionResponse(row: SubmissionRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    assignmentId: row.assignment_id,
    studentUserId: row.student_user_id,
    textResponse: row.text_response,
    fileStorageBucket: row.file_storage_bucket,
    fileStorageKey: row.file_storage_key,
    fileOriginalFilename: row.file_original_filename,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: row.file_size_bytes,
    submittedAt: row.submitted_at,
    isLate: row.is_late,
    score: row.score === null ? null : Number(row.score),
    feedback: row.feedback,
    gradedAt: row.graded_at,
    gradedByUserId: row.graded_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
