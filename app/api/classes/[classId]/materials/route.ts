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
  created_at: string
  updated_at: string
}

export async function GET(request: Request, context: RouteContext) {
  const { classId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("class_materials")
    .select(
      "id, organization_id, class_id, uploaded_by_user_id, title, description, type, source, chat_message_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, created_at, updated_at",
    )
    .eq("class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
