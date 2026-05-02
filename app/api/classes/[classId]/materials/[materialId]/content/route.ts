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
  size_bytes: number
  updated_at: string
  deleted_at: string | null
}

export async function GET(request: Request, context: RouteContext) {
  const { classId, materialId } = await context.params
  const { user, supabase, error: authError } = await requireRouteUser(request)

  if (authError || !user || !supabase) {
    return NextResponse.json({ error: authError }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("class_materials")
    .select(
      "id, class_id, storage_bucket, storage_key, original_filename, mime_type, size_bytes, updated_at, deleted_at",
    )
    .eq("id", materialId)
    .eq("class_id", classId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const material = data as MaterialRecord | null

  if (!material || material.deleted_at) {
    return NextResponse.json(
      { error: "Media is no longer available." },
      { status: 410 },
    )
  }

  const ifNoneMatch = request.headers.get("if-none-match")
  const etag = `"${material.id}:${new Date(material.updated_at).getTime()}"`

  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 })
  }

  try {
    const { downloadUrl } = await createMaterialDownloadUrl({
      bucket: material.storage_bucket,
      storageKey: material.storage_key,
      fileName: material.original_filename,
      mimeType: material.mime_type,
      disposition: "inline",
    })
    const s3Response = await fetch(downloadUrl)

    if (!s3Response.ok || !s3Response.body) {
      return NextResponse.json(
        { error: "Could not load media." },
        { status: 502 },
      )
    }

    return new NextResponse(s3Response.body, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(material.size_bytes),
        "Content-Type": material.mime_type,
        "Content-Disposition": formatContentDisposition(
          "inline",
          material.original_filename,
        ),
        ETag: etag,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load media.",
      },
      { status: 500 },
    )
  }
}

function formatContentDisposition(
  disposition: "inline" | "attachment",
  fileName: string,
) {
  const asciiFileName = fileName
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/"/g, "")

  return `${disposition}; filename="${asciiFileName || "media"}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`
}
