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

type AssignmentFileRow = {
  id: string
  organization_id: string
  class_id: string
  assignment_id: string
  uploaded_by_user_id: string
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export async function POST(request: Request, context: RouteContext) {
  const { classId, assignmentId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 })
  }

  const assignment = await loadAssignmentForManager(
    supabase,
    classId,
    assignmentId,
  )
  if ("response" in assignment) return assignment.response

  const validated = validateAssignmentFileUpload({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  try {
    const uploadedObject = await uploadAssignmentObject({
      organizationId: assignment.assignment.organization_id,
      classId: assignment.assignment.class_id,
      assignmentId: assignment.assignment.id,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      body: new Uint8Array(await file.arrayBuffer()),
      kind: "prompt",
    })

    const { data, error } = await supabase
      .from("class_assignment_files")
      .insert({
        organization_id: assignment.assignment.organization_id,
        class_id: assignment.assignment.class_id,
        assignment_id: assignment.assignment.id,
        uploaded_by_user_id: user.id,
        storage_bucket: uploadedObject.bucket,
        storage_key: uploadedObject.storageKey,
        original_filename: validated.fileName,
        mime_type: validated.mimeType,
        size_bytes: validated.sizeBytes,
      })
      .select(
        "id, organization_id, class_id, assignment_id, uploaded_by_user_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at",
      )
      .single()

    if (error) {
      await deleteAssignmentObject(uploadedObject).catch(() => null)
      throw error
    }

    return NextResponse.json({
      file: toAssignmentFileResponse(data as AssignmentFileRow),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not upload assignment file.",
      },
      { status: 500 },
    )
  }
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
    .select("id, organization_id, class_id")
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
            "Only class teachers and organization admins can upload assignment files.",
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
    },
  }
}

function toAssignmentFileResponse(row: AssignmentFileRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    assignmentId: row.assignment_id,
    uploadedByUserId: row.uploaded_by_user_id,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }
}
