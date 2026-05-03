import { NextResponse } from "next/server"
import {
  deleteAssignmentObject,
  uploadAssignmentObject,
  validateAssignmentFileUpload,
} from "@/lib/api/s3-assignments"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; assignmentId: string }>
}

type AssignmentRecord = {
  id: string
  organization_id: string
  class_id: string
  due_at: string
  status: "draft" | "published"
  allow_late_submissions: boolean
  allow_text_submission: boolean
  allow_file_submission: boolean
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

export async function POST(request: Request, context: RouteContext) {
  const { classId, assignmentId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data: assignmentData, error: assignmentError } = await supabase
    .from("class_assignments")
    .select(
      "id, organization_id, class_id, due_at, status, allow_late_submissions, allow_text_submission, allow_file_submission",
    )
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

  const assignment = assignmentData as AssignmentRecord | null
  if (!assignment || assignment.status !== "published") {
    return NextResponse.json(
      { error: "Assignment not found." },
      { status: 404 },
    )
  }

  const selectedRole = await loadSelectedOrganizationRole(
    supabase,
    assignment.organization_id,
    user.id,
  )
  if ("response" in selectedRole) return selectedRole.response

  if (selectedRole.role !== "student") {
    return NextResponse.json(
      { error: "Switch to the student role to submit assignment work." },
      { status: 403 },
    )
  }

  const studentMembership = await loadStudentClassMembership(
    supabase,
    assignment.organization_id,
    assignment.class_id,
    user.id,
  )
  if ("response" in studentMembership) return studentMembership.response

  const formData = await request.formData().catch(() => null)
  const textResponseValue = formData?.get("textResponse")
  const fileValue = formData?.get("file")
  const textResponse =
    typeof textResponseValue === "string" ? textResponseValue.trim() : ""
  const hasText = textResponse.length > 0
  const hasFile = fileValue instanceof File && fileValue.size > 0
  const now = new Date()
  const isLate = now.getTime() > Date.parse(assignment.due_at)

  if (isLate && !assignment.allow_late_submissions) {
    return NextResponse.json(
      { error: "This assignment no longer accepts submissions." },
      { status: 403 },
    )
  }

  if (hasText && !assignment.allow_text_submission) {
    return NextResponse.json(
      { error: "This assignment does not accept text submissions." },
      { status: 400 },
    )
  }

  if (hasFile && !assignment.allow_file_submission) {
    return NextResponse.json(
      { error: "This assignment does not accept file submissions." },
      { status: 400 },
    )
  }

  if (!hasText && !hasFile) {
    return NextResponse.json(
      { error: "Add a text response or file before submitting." },
      { status: 400 },
    )
  }

  const { data: previousSubmission } = await supabase
    .from("class_assignment_submissions")
    .select("file_storage_bucket, file_storage_key")
    .eq("assignment_id", assignment.id)
    .eq("student_user_id", user.id)
    .maybeSingle()

  let uploadedObject: { bucket: string; storageKey: string } | null = null
  let uploadedFile: {
    fileName: string
    mimeType: string
    sizeBytes: number
  } | null = null

  try {
    if (hasFile && fileValue instanceof File) {
      const validated = validateAssignmentFileUpload({
        fileName: fileValue.name,
        mimeType: fileValue.type,
        sizeBytes: fileValue.size,
      })

      if ("error" in validated) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }

      uploadedObject = await uploadAssignmentObject({
        organizationId: assignment.organization_id,
        classId: assignment.class_id,
        assignmentId: assignment.id,
        fileName: validated.fileName,
        mimeType: validated.mimeType,
        body: new Uint8Array(await fileValue.arrayBuffer()),
        kind: "submission",
      })
      uploadedFile = validated
    }

    const { data, error } = await supabase
      .from("class_assignment_submissions")
      .upsert(
        {
          organization_id: assignment.organization_id,
          class_id: assignment.class_id,
          assignment_id: assignment.id,
          student_user_id: user.id,
          text_response: assignment.allow_text_submission
            ? textResponse || null
            : null,
          file_storage_bucket: uploadedObject?.bucket ?? null,
          file_storage_key: uploadedObject?.storageKey ?? null,
          file_original_filename: uploadedFile?.fileName ?? null,
          file_mime_type: uploadedFile?.mimeType ?? null,
          file_size_bytes: uploadedFile?.sizeBytes ?? null,
          submitted_at: now.toISOString(),
          is_late: isLate,
          score: null,
          feedback: "",
          graded_at: null,
          graded_by_user_id: null,
        },
        { onConflict: "assignment_id,student_user_id" },
      )
      .select(
        "id, organization_id, class_id, assignment_id, student_user_id, text_response, file_storage_bucket, file_storage_key, file_original_filename, file_mime_type, file_size_bytes, submitted_at, is_late, score, feedback, graded_at, graded_by_user_id, created_at, updated_at",
      )
      .single()

    if (error) throw error

    if (
      previousSubmission?.file_storage_bucket &&
      previousSubmission.file_storage_key
    ) {
      await deleteAssignmentObject({
        bucket: previousSubmission.file_storage_bucket,
        storageKey: previousSubmission.file_storage_key,
      }).catch(() => null)
    }

    return NextResponse.json({
      submission: toSubmissionResponse(data as SubmissionRow),
    })
  } catch (error) {
    if (uploadedObject) {
      await deleteAssignmentObject(uploadedObject).catch(() => null)
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not submit assignment.",
      },
      { status: 500 },
    )
  }
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

async function loadSelectedOrganizationRole(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireRouteUser>>["supabase"]
  >,
  organizationId: string,
  userId: string,
) {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, role, selected_role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()

  if (membershipError) {
    return {
      response: NextResponse.json(
        { error: membershipError.message },
        { status: 500 },
      ),
    }
  }

  if (!membership) {
    return {
      response: NextResponse.json(
        { error: "Active organization membership required." },
        { status: 403 },
      ),
    }
  }

  if (membership.selected_role_id) {
    const { data: selectedRole, error: selectedRoleError } = await supabase
      .from("organization_membership_roles")
      .select("role")
      .eq("id", membership.selected_role_id)
      .eq("organization_membership_id", membership.id)
      .eq("status", "active")
      .maybeSingle()

    if (selectedRoleError) {
      return {
        response: NextResponse.json(
          { error: selectedRoleError.message },
          { status: 500 },
        ),
      }
    }

    if (selectedRole?.role) {
      return {
        role: selectedRole.role as
          | "org_owner"
          | "org_admin"
          | "teacher"
          | "student",
      }
    }
  }

  return {
    role: membership.role as "org_owner" | "org_admin" | "teacher" | "student",
  }
}

async function loadStudentClassMembership(
  supabase: NonNullable<
    Awaited<ReturnType<typeof requireRouteUser>>["supabase"]
  >,
  organizationId: string,
  classId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("class_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("class_id", classId)
    .eq("user_id", userId)
    .eq("role", "student")
    .maybeSingle()

  if (error) {
    return {
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    }
  }

  if (!data) {
    return {
      response: NextResponse.json(
        { error: "Student class membership required." },
        { status: 403 },
      ),
    }
  }

  return { ok: true }
}
