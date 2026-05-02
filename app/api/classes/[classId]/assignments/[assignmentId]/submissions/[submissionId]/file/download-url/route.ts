import { NextResponse } from "next/server"
import { createAssignmentDownloadUrl } from "@/lib/api/s3-assignments"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{
    classId: string
    assignmentId: string
    submissionId: string
  }>
}

type SubmissionRecord = {
  id: string
  class_id: string
  assignment_id: string
  file_storage_bucket: string | null
  file_storage_key: string | null
  file_original_filename: string | null
  file_mime_type: string | null
}

export async function GET(request: Request, context: RouteContext) {
  const { classId, assignmentId, submissionId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const disposition =
    requestUrl.searchParams.get("disposition") === "inline"
      ? "inline"
      : "attachment"

  const { data, error } = await supabase
    .from("class_assignment_submissions")
    .select(
      "id, class_id, assignment_id, file_storage_bucket, file_storage_key, file_original_filename, file_mime_type",
    )
    .eq("id", submissionId)
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const submission = data as SubmissionRecord | null
  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 },
    )
  }

  if (
    !submission.file_storage_bucket ||
    !submission.file_storage_key ||
    !submission.file_original_filename ||
    !submission.file_mime_type
  ) {
    return NextResponse.json(
      { error: "Submission does not include a file." },
      { status: 404 },
    )
  }

  try {
    const presignedDownload = await createAssignmentDownloadUrl({
      bucket: submission.file_storage_bucket,
      storageKey: submission.file_storage_key,
      fileName: submission.file_original_filename,
      mimeType: submission.file_mime_type,
      disposition,
    })

    return NextResponse.json({
      ...presignedDownload,
      disposition,
      fileName: submission.file_original_filename,
      mimeType: submission.file_mime_type,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create download URL.",
      },
      { status: 500 },
    )
  }
}
