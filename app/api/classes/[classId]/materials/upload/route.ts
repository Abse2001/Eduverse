import { NextResponse } from "next/server"
import {
  deleteMaterialObject,
  uploadMaterialObject,
  validateMaterialUpload,
} from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type MaterialRow = {
  id: string
  organization_id: string
  class_id: string
  uploaded_by_user_id: string
  title: string
  description: string
  type: "image" | "pdf" | "video" | "slide"
  source: "manual" | "chat"
  chat_message_id: string | null
  storage_bucket: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  created_at: string
  updated_at: string
}

export async function POST(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get("file")
  const title = formData?.get("title")
  const description = formData?.get("description")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 })
  }

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 })
  }

  const validated = validateMaterialUpload({
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
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
    const uploadedObject = await uploadMaterialObject({
      organizationId: classRow.organization_id,
      classId: classRow.id,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      body: new Uint8Array(await file.arrayBuffer()),
    })

    const { data: materialData, error: materialError } = await supabase
      .from("class_materials")
      .insert({
        organization_id: classRow.organization_id,
        class_id: classRow.id,
        uploaded_by_user_id: user.id,
        title: title.trim(),
        description: typeof description === "string" ? description.trim() : "",
        type: validated.type,
        storage_bucket: uploadedObject.bucket,
        storage_key: uploadedObject.storageKey,
        original_filename: validated.fileName,
        mime_type: validated.mimeType,
        size_bytes: validated.sizeBytes,
        source: "manual",
      })
      .select(
        "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at, updated_at",
      )
      .single()

    if (materialError) {
      await deleteMaterialObject(uploadedObject).catch(() => null)
      throw materialError
    }

    return NextResponse.json({
      material: toMaterialResponse(materialData as MaterialRow),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not upload material.",
      },
      { status: 500 },
    )
  }
}

function toMaterialResponse(row: MaterialRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    uploadedByUserId: row.uploaded_by_user_id,
    title: row.title,
    description: row.description,
    type: row.type,
    source: row.source ?? "manual",
    chatMessageId: row.chat_message_id ?? null,
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
