import { NextResponse } from "next/server"
import {
  createMaterialUploadUrl,
  validateMaterialUpload,
} from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type UploadUrlRequestBody = {
  fileName?: string
  mimeType?: string
  sizeBytes?: number
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const body = (await request
    .json()
    .catch(() => null)) as UploadUrlRequestBody | null
  const validated = validateMaterialUpload({
    fileName: body?.fileName ?? "",
    mimeType: body?.mimeType ?? "",
    sizeBytes: body?.sizeBytes ?? 0,
  })

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, organization_id")
    .eq("id", classId)
    .eq("is_archived", false)
    .maybeSingle()

  if (classError) {
    return NextResponse.json({ error: classError.message }, { status: 500 })
  }

  if (!classRow) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 })
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: classRow.organization_id,
      target_class_id: classRow.id,
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
      { error: "Only teachers and organization admins can upload materials." },
      { status: 403 },
    )
  }

  try {
    const presignedUpload = await createMaterialUploadUrl({
      organizationId: classRow.organization_id,
      classId: classRow.id,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
    })

    return NextResponse.json({
      ...presignedUpload,
      type: validated.type,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      method: "PUT",
      organizationId: classRow.organization_id,
      headers: {
        "Content-Type": validated.mimeType,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create upload URL.",
      },
      { status: 500 },
    )
  }
}
