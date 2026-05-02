import { NextResponse } from "next/server"
import { deleteMaterialObject } from "@/lib/api/s3-materials"
import { requireRouteUser } from "@/lib/api/supabase-route"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ classId: string; materialId: string }>
}

type MaterialRecord = {
  id: string
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
    .select("id, class_id, storage_bucket, storage_key, deleted_at")
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

  const { error: updateError } = await supabase
    .from("class_materials")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", material.id)
    .eq("class_id", classId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await deleteMaterialObject({
    bucket: material.storage_bucket,
    storageKey: material.storage_key,
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}
