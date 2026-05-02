import { NextResponse } from "next/server"
import { createAssignmentDownloadUrl } from "@/lib/api/s3-assignments"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; assignmentId: string; fileId: string }>
}

type AssignmentFileRecord = {
  id: string
  class_id: string
  assignment_id: string
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  deleted_at: string | null
}

export async function GET(request: Request, context: RouteContext) {
  const { classId, assignmentId, fileId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const disposition =
    requestUrl.searchParams.get("disposition") === "attachment"
      ? "attachment"
      : "inline"

  const { data, error } = await supabase
    .from("class_assignment_files")
    .select(
      "id, class_id, assignment_id, storage_bucket, storage_key, original_filename, mime_type, deleted_at",
    )
    .eq("id", fileId)
    .eq("assignment_id", assignmentId)
    .eq("class_id", classId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const file = data as AssignmentFileRecord | null
  if (!file || file.deleted_at) {
    return NextResponse.json(
      { error: "Assignment file not found." },
      { status: 404 },
    )
  }

  try {
    const presignedDownload = await createAssignmentDownloadUrl({
      bucket: file.storage_bucket,
      storageKey: file.storage_key,
      fileName: file.original_filename,
      mimeType: file.mime_type,
      disposition,
    })

    return NextResponse.json({
      ...presignedDownload,
      disposition,
      fileName: file.original_filename,
      mimeType: file.mime_type,
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
