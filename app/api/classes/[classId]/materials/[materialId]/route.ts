import { NextResponse } from "next/server"
import { deleteMaterialObject } from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"
import { createServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; materialId: string }>
}

type MaterialRecord = {
  id: string
  organization_id: string
  class_id: string
  storage_bucket: string
  storage_key: string
  deleted_at: string | null
}

export async function DELETE(request: Request, context: RouteContext) {
  const { classId, materialId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data: materialData, error: materialError } = await supabase
    .from("class_materials")
    .select(
      "id, organization_id, class_id, storage_bucket, storage_key, deleted_at",
    )
    .eq("id", materialId)
    .eq("class_id", classId)
    .maybeSingle()

  if (materialError) {
    return NextResponse.json({ error: materialError.message }, { status: 500 })
  }

  const material = materialData as MaterialRecord | null

  if (!material || material.deleted_at) {
    return NextResponse.json({ error: "Material not found." }, { status: 404 })
  }

  const { data: canManage, error: permissionError } = await supabase.rpc(
    "can_manage_class",
    {
      target_org_id: material.organization_id,
      target_class_id: classId,
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
      { error: "You do not have permission to delete this material." },
      { status: 403 },
    )
  }

  const admin = createServerClient()
  const deletedAt = new Date().toISOString()
  const deletePayload = {
    deleted_at: deletedAt,
    ai_summary: null,
    ai_summary_used_file_text: false,
    ai_summary_generated_at: null,
    ai_extracted_content: null,
    ai_extracted_content_used_file_content: false,
    ai_extracted_content_generated_at: null,
  }
  let { count, error: updateError } = await admin
    .from("class_materials")
    .update(deletePayload, { count: "exact" })
    .eq("id", material.id)
    .eq("class_id", classId)

  if (isMissingAiCacheColumnError(updateError)) {
    const fallbackResult = await admin
      .from("class_materials")
      .update({ deleted_at: deletedAt }, { count: "exact" })
      .eq("id", material.id)
      .eq("class_id", classId)

    count = fallbackResult.count
    updateError = fallbackResult.error
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (!count) {
    return NextResponse.json(
      { error: "You do not have permission to delete this material." },
      { status: 403 },
    )
  }

  await deleteMaterialObject({
    bucket: material.storage_bucket,
    storageKey: material.storage_key,
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}

function isMissingAiCacheColumnError(error: { message?: string } | null) {
  return (
    Boolean(error?.message?.includes("ai_summary")) ||
    Boolean(error?.message?.includes("ai_extracted_content")) ||
    Boolean(error?.message?.includes("schema cache"))
  )
}
