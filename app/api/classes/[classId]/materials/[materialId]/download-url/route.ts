import { NextResponse } from "next/server"
import { createMaterialDownloadUrl } from "@/lib/api/s3-materials"
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
  original_filename: string
  mime_type: string
  deleted_at: string | null
}

export async function GET(request: Request, context: RouteContext) {
  const { classId, materialId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const disposition =
    requestUrl.searchParams.get("disposition") === "attachment"
      ? "attachment"
      : "inline"

  const { data: materialData, error: materialError } = await supabase
    .from("class_materials")
    .select(
      "id, class_id, storage_bucket, storage_key, original_filename, mime_type, deleted_at",
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

  try {
    const presignedDownload = await createMaterialDownloadUrl({
      bucket: material.storage_bucket,
      storageKey: material.storage_key,
      fileName: material.original_filename,
      mimeType: material.mime_type,
      disposition,
    })

    return NextResponse.json({
      ...presignedDownload,
      disposition,
      fileName: material.original_filename,
      mimeType: material.mime_type,
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
