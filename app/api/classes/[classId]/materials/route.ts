import { NextResponse } from "next/server"
import { requireRouteUser } from "@/lib/api/supabase-route"

type RouteContext = {
  params: Promise<{ classId: string }>
}

type ClassMaterialRow = {
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
  ai_summary_generated_at?: string | null
  created_at: string
  updated_at: string
}

const MATERIAL_SELECT =
  "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, ai_summary_generated_at, created_at, updated_at"

const MATERIAL_SELECT_LEGACY =
  "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at, updated_at"

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const primaryResult = await supabase
    .from("class_materials")
    .select(MATERIAL_SELECT)
    .eq("class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  let data = primaryResult.data as ClassMaterialRow[] | null
  let error = primaryResult.error

  if (isMissingSummaryColumnError(error)) {
    const legacyResult = await supabase
      .from("class_materials")
      .select(MATERIAL_SELECT_LEGACY)
      .eq("class_id", classId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
    data = legacyResult.data as ClassMaterialRow[] | null
    error = legacyResult.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    materials: ((data ?? []) as ClassMaterialRow[]).map(toMaterialResponse),
  })
}

function toMaterialResponse(row: ClassMaterialRow) {
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
