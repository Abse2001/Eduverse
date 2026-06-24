import { NextResponse } from "next/server"
import {
  extractMaterialContentForAiAgent,
  generateMaterialStudySummary,
} from "@/lib/ai/material-extraction"
import { notificationHref, sendNotification } from "@/lib/api/notifications"
import {
  deleteMaterialObject,
  uploadMaterialObject,
  validateMaterialUpload,
} from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { createServerClient } from "@/lib/supabase/server"

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
  ai_summary: string | null
  ai_summary_used_file_text: boolean | null
  ai_summary_generated_at: string | null
  ai_extracted_content: string | null
  ai_extracted_content_used_file_content: boolean | null
  ai_extracted_content_generated_at: string | null
  created_at: string
  updated_at: string
}

const MATERIAL_SELECT =
  "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary, ai_summary_used_file_text, ai_summary_generated_at, ai_extracted_content, ai_extracted_content_used_file_content, ai_extracted_content_generated_at, created_at, updated_at"
const MATERIAL_SELECT_SUMMARY =
  "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary, ai_summary_used_file_text, ai_summary_generated_at, created_at, updated_at"

const MATERIAL_SELECT_LEGACY =
  "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at, updated_at"

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
    .select("id, organization_id, name, code")
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

    const materialInsert = {
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
    }
    let materialResult = await supabase
      .from("class_materials")
      .insert(materialInsert)
      .select(MATERIAL_SELECT)
      .single()

    let canPersistExtractedContent = true
    if (isMissingExtractedContentColumnError(materialResult.error)) {
      canPersistExtractedContent = false
      materialResult = await supabase
        .from("class_materials")
        .insert(materialInsert)
        .select(MATERIAL_SELECT_SUMMARY)
        .single()
    }

    let canPersistSummary = !isMissingSummaryColumnError(materialResult.error)
    if (isMissingSummaryColumnError(materialResult.error)) {
      canPersistSummary = false
      materialResult = await supabase
        .from("class_materials")
        .insert(materialInsert)
        .select(MATERIAL_SELECT_LEGACY)
        .single()
    }

    const { data: materialData, error: materialError } = materialResult

    if (materialError) {
      await deleteMaterialObject(uploadedObject).catch(() => null)
      throw materialError
    }

    if (canPersistExtractedContent || canPersistSummary) {
      try {
        await cacheUploadedMaterialAiContent({
          className: classRow.name,
          classCode: classRow.code,
          material: materialData as MaterialRow,
          canPersistExtractedContent,
          canPersistSummary,
        })
      } catch (scanError) {
        await cleanupFailedMaterialUpload({
          material: materialData as MaterialRow,
          uploadedObject,
        })
        throw new Error(
          scanError instanceof Error
            ? `Could not prepare material AI content: ${scanError.message}`
            : "Could not prepare material AI content.",
        )
      }
    }

    await sendNotification({
      supabase,
      organizationId: classRow.organization_id,
      actorUserId: user.id,
      target: { type: "class", classId: classRow.id },
      notificationType: "material_added",
      title: "New class material",
      body: title.trim(),
      href: notificationHref({
        classId: classRow.id,
        section: "materials",
        itemId: materialData.id,
      }),
      metadata: {
        materialId: materialData.id,
        materialType: validated.type,
      },
      eventKey: `material_added:${materialData.id}`,
    }).catch(() => null)

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

async function cacheUploadedMaterialAiContent({
  className,
  classCode,
  material,
  canPersistExtractedContent,
  canPersistSummary,
}: {
  className: string
  classCode: string
  material: MaterialRow
  canPersistExtractedContent: boolean
  canPersistSummary: boolean
}) {
  const { extractedContent, usedFileContent } =
    await extractMaterialContentForAiAgent(material)
  const summary = canPersistSummary
    ? await generateMaterialStudySummary({
        className,
        classCode,
        material,
        extractedContent,
        unavailableReason: extractedContent
          ? ""
          : "File content is not available for this material.",
      })
    : ""
  const generatedAt = new Date().toISOString()

  const admin = createServerClient()
  const updatePayload = {
    ...(canPersistExtractedContent
      ? {
          ai_extracted_content: extractedContent || null,
          ai_extracted_content_used_file_content: usedFileContent,
          ai_extracted_content_generated_at: extractedContent
            ? generatedAt
            : null,
        }
      : {}),
    ...(canPersistSummary
      ? {
          ai_summary: summary || null,
          ai_summary_used_file_text: usedFileContent,
          ai_summary_generated_at: summary ? generatedAt : null,
        }
      : {}),
  }

  await admin
    .from("class_materials")
    .update(updatePayload)
    .eq("id", material.id)
    .eq("class_id", material.class_id)
}

async function cleanupFailedMaterialUpload({
  material,
  uploadedObject,
}: {
  material: MaterialRow
  uploadedObject: { bucket: string; storageKey: string }
}) {
  const admin = createServerClient()
  const cleanupResult = await admin
    .from("class_materials")
    .update({
      deleted_at: new Date().toISOString(),
      ai_summary: null,
      ai_summary_used_file_text: false,
      ai_summary_generated_at: null,
      ai_extracted_content: null,
      ai_extracted_content_used_file_content: false,
      ai_extracted_content_generated_at: null,
    })
    .eq("id", material.id)
    .eq("class_id", material.class_id)

  if (isMissingAiCacheColumnError(cleanupResult.error)) {
    await admin
      .from("class_materials")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", material.id)
      .eq("class_id", material.class_id)
      .then(() => null)
  }

  await deleteMaterialObject(uploadedObject).catch(() => null)
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
    hasAiSummary: Boolean(row.ai_summary_generated_at),
    aiSummaryGeneratedAt: row.ai_summary_generated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isMissingSummaryColumnError(error: { message?: string } | null) {
  return (
    Boolean(error?.message?.includes("ai_summary")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}

function isMissingExtractedContentColumnError(
  error: { message?: string } | null,
) {
  return (
    Boolean(error?.message?.includes("ai_extracted_content")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}

function isMissingAiCacheColumnError(error: { message?: string } | null) {
  return (
    Boolean(error?.message?.includes("ai_summary")) ||
    Boolean(error?.message?.includes("ai_extracted_content")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}
